#!/usr/bin/env python3
"""Gera uma página HTML autônoma para registrar resultados do CAMIS offline.

Uso: python3 scripts/gerar-contingencia-camis.py BACKUP.json SAIDA.html
O arquivo gerado contém nomes de participantes; mantenha-o privado.
"""

import hashlib
import html
import json
import pathlib
import sys


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Uso: gerar-contingencia-camis.py BACKUP.json SAIDA.html')
    source = pathlib.Path(sys.argv[1])
    target = pathlib.Path(sys.argv[2])
    raw = source.read_bytes()
    backup = json.loads(raw)
    tournament = backup['tournament']['data']
    matches = [row['data']['jogo'] for row in backup['subcollections']['matches']]
    if len(matches) != 108 or len({m['id'] for m in matches}) != 108:
        raise SystemExit('Backup inesperado: esperados 108 jogos únicos do CAMIS')
    if tournament['name'] != 'Camis no Beyond':
        raise SystemExit('Backup não é do torneio CAMIS esperado')
    payload = {
        'tournamentId': tournament['id'],
        'tournamentName': tournament['name'],
        'snapshotSha256': hashlib.sha256(raw).hexdigest(),
        'snapshotFile': source.name,
        'scoring': tournament.get('scoring'),
        'matches': [
            {key: match.get(key) for key in ('id', 'category', 'groupName', 'round', 'label', 'p1', 'p2', 'court', 'scheduledAt')}
            for match in matches
        ],
    }
    embedded = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    page = PAGE.replace('__TITLE__', html.escape(tournament['name'])).replace('__DATA__', embedded)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(page, encoding='utf-8')
    target.chmod(0o600)
    print(f'{target} — {len(matches)} jogos, SHA-256 do backup {payload["snapshotSha256"]}')


PAGE = '''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CAMIS offline — __TITLE__</title>
<style>
:root{font:16px system-ui,-apple-system,sans-serif;color:#f5f3ff;background:#171321}*{box-sizing:border-box}body{margin:0;max-width:1100px;padding:20px;margin:auto}h1{font-size:1.65rem;margin:.2rem 0}.note{color:#d5cce8;line-height:1.5}.bar{position:sticky;top:0;background:#171321;padding:12px 0;z-index:2;border-bottom:1px solid #726481;display:flex;gap:8px;flex-wrap:wrap;align-items:center}button,select,input{font:inherit;border-radius:8px;padding:10px;color:#fff;background:#292139;border:1px solid #a99db9}button{cursor:pointer;background:#49336b;font-weight:600}button:hover{background:#63458e}button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #e0bcff;outline-offset:2px}.primary{background:#7449aa}.danger{background:#742e43}.card{border:1px solid #81728f;border-radius:12px;padding:14px;margin:12px 0;background:#211a2c}.card.done{border-left:6px solid #79dba1}.card header{display:flex;justify-content:space-between;gap:10px;color:#e1d5ed;font-size:.9rem}.teams{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;font-size:1.04rem;margin:12px 0}.teams strong:last-child{text-align:right}.score{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.score input{width:80px;text-align:center}.score label{display:flex;align-items:center;gap:5px}.muted{color:#c9bbd8}.status{font-weight:700;color:#9df0b3}.error{color:#ffb6b6}.hidden{display:none}.summary{display:flex;gap:14px;flex-wrap:wrap;padding:12px 0}#live-status{min-height:1.4em}#file-import{display:none}@media(max-width:640px){body{padding:12px}.teams{grid-template-columns:1fr;gap:2px}.teams span,.teams strong:last-child{text-align:left}.card header{display:block}.bar{position:static}.score input{width:66px}}
</style></head><body>
<h1>CAMIS — contingência local</h1>
<p class="note">Esta página funciona sem internet. Ela registra resultados <strong>somente neste navegador</strong>; não altera o torneio no Scoreplace. Ao terminar cada rodada, use <strong>Exportar JSON</strong> e guarde o arquivo. Importe esse JSON para retomar o trabalho em outro computador ou navegador.</p>
<div class="bar"><button id="export-json" class="primary">Exportar JSON</button><button id="export-csv">Exportar CSV</button><button id="import-button">Importar JSON</button><input id="file-import" type="file" accept="application/json,.json"><span id="live-status" role="status" aria-live="polite"></span></div>
<div class="summary"><strong id="count"></strong><span id="snapshot"></span></div>
<div class="bar"><label>Categoria <select id="category"><option value="">Todas</option></select></label><label>Grupo <select id="group"><option value="">Todos</option></select></label><label>Estado <select id="state"><option value="">Todos</option><option value="pending">Pendentes</option><option value="done">Concluídos</option></select></label></div>
<main id="matches"></main>
<script type="application/json" id="embedded">__DATA__</script>
<script>
(() => {
  'use strict';
  const source = JSON.parse(document.getElementById('embedded').textContent);
  const key = 'scoreplace_camis_offline_' + source.tournamentId + '_' + source.snapshotSha256;
  const byId = new Map(source.matches.map(m => [m.id, m]));
  const el = id => document.getElementById(id);
  const text = value => document.createTextNode(String(value ?? ''));
  const iso = () => new Date().toISOString();
  const escapeCsv = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  let ledger;
  try { ledger = JSON.parse(localStorage.getItem(key) || '{}'); } catch { ledger = {}; }
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) ledger = {};
  const notice = (message, bad = false) => { el('live-status').textContent = message; el('live-status').className = bad ? 'error' : 'status'; };
  function persist() {
    try { localStorage.setItem(key, JSON.stringify(ledger)); notice('Salvo neste navegador às ' + new Date().toLocaleTimeString('pt-BR')); }
    catch (error) { notice('Falha ao salvar neste navegador. Exporte JSON agora: ' + error.message, true); }
  }
  function download(filename, content, mime) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], {type:mime})); a.download = filename; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportData() {
    return {format:'scoreplace-camis-offline-v1', tournamentId:source.tournamentId, snapshotSha256:source.snapshotSha256, exportedAt:iso(), results:ledger};
  }
  function csvRows() {
    const header = ['categoria','grupo','jogo_id','dupla_1','dupla_2','games_1','games_2','vencedor','tipo','atualizado_em'];
    const rows = source.matches.filter(m => ledger[m.id]).map(m => {
      const r = ledger[m.id]; return [m.category,m.groupName,m.id,m.p1,m.p2,r.scoreP1,r.scoreP2,r.winnerSide === 1 ? m.p1 : m.p2,r.outcome,r.updatedAt];
    });
    return [header,...rows].map(row => row.map(escapeCsv).join(';')).join('\\r\\n') + '\\r\\n';
  }
  el('export-json').onclick = () => { download('camis-resultados-' + iso().slice(0,19).replaceAll(':','-') + '.json', JSON.stringify(exportData(),null,2), 'application/json'); notice('JSON exportado. Guarde o arquivo em lugar seguro.'); };
  el('export-csv').onclick = () => { download('camis-resultados-' + iso().slice(0,10) + '.csv', '\ufeff' + csvRows(), 'text/csv;charset=utf-8'); notice('CSV exportado.'); };
  el('import-button').onclick = () => el('file-import').click();
  el('file-import').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== 'scoreplace-camis-offline-v1' || data.tournamentId !== source.tournamentId || data.snapshotSha256 !== source.snapshotSha256 || !data.results || typeof data.results !== 'object' || Array.isArray(data.results)) throw Error('Arquivo de outro torneio ou outro backup.');
      for (const [id,r] of Object.entries(data.results)) {
        if (!byId.has(id) || ![1,2].includes(r.winnerSide) || !['score','wo'].includes(r.outcome)) throw Error('Resultado inválido para o jogo ' + id);
        if (r.outcome === 'score' && (!Number.isInteger(r.scoreP1) || !Number.isInteger(r.scoreP2) || r.scoreP1 < 0 || r.scoreP2 < 0 || r.scoreP1 === r.scoreP2 || (r.scoreP1 > r.scoreP2 ? 1 : 2) !== r.winnerSide)) throw Error('Placar inválido para o jogo ' + id);
      }
      const count = Object.keys(data.results).length;
      if (!confirm('Importar ' + count + ' resultados? Isso substituirá os registros locais deste navegador.')) return;
      ledger = data.results; persist(); render(); notice(count + ' resultados importados.');
    } catch (error) { notice('Importação recusada: ' + error.message, true); }
    event.target.value = '';
  };
  const cats = [...new Set(source.matches.map(m => m.category))].sort();
  for (const category of cats) el('category').add(new Option(category,category));
  function groupsForCategory() { return [...new Set(source.matches.filter(m => !el('category').value || m.category === el('category').value).map(m => m.groupName))].sort(); }
  function fillGroups() { const old = el('group').value; el('group').length = 1; for (const group of groupsForCategory()) el('group').add(new Option(group,group)); if ([...el('group').options].some(o => o.value === old)) el('group').value = old; }
  el('category').onchange = () => { fillGroups(); render(); }; el('group').onchange = render; el('state').onchange = render;
  function render() {
    const host = el('matches'); host.replaceChildren();
    const done = Object.keys(ledger).filter(id => byId.has(id)).length;
    el('count').textContent = done + ' de ' + source.matches.length + ' jogos concluídos';
    el('snapshot').textContent = 'Backup de origem: ' + source.snapshotFile + ' · SHA-256 ' + source.snapshotSha256.slice(0,12);
    const filtered = source.matches.filter(m => (!el('category').value || m.category === el('category').value) && (!el('group').value || m.groupName === el('group').value) && (!el('state').value || (el('state').value === 'done') === Boolean(ledger[m.id])));
    for (const m of filtered) {
      const r = ledger[m.id], card = document.createElement('article'); card.className = 'card' + (r ? ' done' : '');
      const header = document.createElement('header'), meta = document.createElement('strong'); meta.append(text(m.category + ' · ' + m.groupName));
      const label = document.createElement('span'); label.append(text(m.label || m.id)); header.append(meta,label); card.append(header);
      const teams = document.createElement('div'); teams.className = 'teams';
      const p1 = document.createElement('strong'), vs = document.createElement('span'), p2 = document.createElement('strong'); p1.append(text(m.p1)); vs.append(text('×')); p2.append(text(m.p2)); teams.append(p1,vs,p2); card.append(teams);
      const row = document.createElement('div'); row.className = 'score';
      const a = document.createElement('input'), b = document.createElement('input');
      for (const input of [a,b]) { input.type='number'; input.min='0'; input.max='99'; input.step='1'; input.inputMode='numeric'; }
      a.setAttribute('aria-label','Games de ' + m.p1); b.setAttribute('aria-label','Games de ' + m.p2);
      a.value = r?.outcome === 'score' ? r.scoreP1 : ''; b.value = r?.outcome === 'score' ? r.scoreP2 : '';
      const dash = document.createElement('span'); dash.append(text('–'));
      const save = document.createElement('button'); save.textContent = r ? 'Corrigir placar' : 'Salvar placar';
      save.onclick = () => {
        const x = Number(a.value), y = Number(b.value);
        if (a.value.trim()==='' || b.value.trim()==='' || !Number.isInteger(x) || !Number.isInteger(y) || x<0 || y<0 || x>99 || y>99 || x===y) { notice('Informe dois placares inteiros, diferentes e entre 0 e 99.',true); return; }
        ledger[m.id] = {outcome:'score',scoreP1:x,scoreP2:y,winnerSide:x>y?1:2,updatedAt:iso()}; persist(); render();
      };
      const wo1 = document.createElement('button'), wo2 = document.createElement('button'); wo1.textContent='WO: vence dupla 1'; wo2.textContent='WO: vence dupla 2';
      wo1.onclick = () => { if (confirm('Registrar WO para ' + m.p1 + '?')) { ledger[m.id]={outcome:'wo',scoreP1:null,scoreP2:null,winnerSide:1,updatedAt:iso()}; persist(); render(); } };
      wo2.onclick = () => { if (confirm('Registrar WO para ' + m.p2 + '?')) { ledger[m.id]={outcome:'wo',scoreP1:null,scoreP2:null,winnerSide:2,updatedAt:iso()}; persist(); render(); } };
      row.append(a,dash,b,save,wo1,wo2); card.append(row);
      if (r) { const status = document.createElement('p'); status.className='status'; status.append(text('Registrado: ' + (r.outcome==='wo'?'WO':' '+r.scoreP1+'–'+r.scoreP2) + ' · vence ' + (r.winnerSide===1?m.p1:m.p2) + ' · ' + new Date(r.updatedAt).toLocaleString('pt-BR'))); card.append(status); }
      host.append(card);
    }
    if (!filtered.length) { const p=document.createElement('p');p.className='muted';p.textContent='Nenhum jogo neste filtro.';host.append(p); }
  }
  fillGroups(); render(); notice('Pronto para registrar resultados offline.');
})();
</script></body></html>'''


if __name__ == '__main__':
    main()
