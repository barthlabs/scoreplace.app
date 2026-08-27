/* SEGUNDA CÓPIA — `results` do Grupo D: Vivian → Jogador X
 *
 * ⛔ A LIÇÃO DESTE SCRIPT: eu troquei em `matches`, conferi em `matches`, declarei pronto —
 * e o dono respondeu _"jogo 12 com vivian ainda"_. A informação vive em DOIS lugares:
 *   tournaments/{id}/matches/{id}  →  { _chave, _loc, jogo: {...} }   (o motor)
 *   tournaments/{id}/results/{id}  →  { p1, p2, winner, sets, ... }   (o card / Meus Resultados)
 * As duas cópias têm o MESMO id de documento e divergiram em silêncio. Conferir a cópia que
 * eu mesmo acabei de escrever não é conferir — é ler meu próprio eco.
 * [[feedback_unify_dual_entry_points]] · [[feedback_proof_lives_in_the_data_not_in_a_stamp]]
 *
 * Prova de que era esta a cópia na tela: o card do jogo 12 mostrava "6(7)" com "Vivian", e
 * o tiebreak 7-5 só existe no `results` que estava intocado (updateTime 22:24:48) — o
 * `matches` já dizia Jogador X desde 02:42.
 *
 * ⛔ RENOMEIA E SÓ: placar, sets, sets vencidos, games totais, resultAt, startedAt e draw
 * são intocáveis, e o script ABORTA se qualquer um deles mudar.
 *
 * Uso:  node scripts/trocar-vivian-no-results-grupo-d.js           (ENSAIO)
 *       node scripts/trocar-vivian-no-results-grupo-d.js --apply   (grava)
 */
'use strict';
const { execSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const ID = 'tour_1780009816637';
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const H = () => ({ Authorization: 'Bearer ' + execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim() });

const DE = 'Vivian';
const PARA = 'Jogador X';
const UID_VIVIAN = 'WOwzuvwAf9e8ZmZY1RoGosO9x6c2';
const JOGOS = [
  'match-rr-r1-g3-0-1785708005103', // jogo 10
  'match-rr-r1-g3-1-1785708005103', // jogo 11
  'match-rr-r1-g3-2-1785708005103', // jogo 12
];
const INTOCAVEIS = ['scoreP1', 'scoreP2', 'sets', 'setsWonP1', 'setsWonP2',
  'totalGamesP1', 'totalGamesP2', 'resultAt', 'startedAt', 'draw'];

function plain(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain);
  if ('mapValue' in v) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = plain(x); }); return o; }
  return null;
}
function fs_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fs_) } };
  if (typeof v === 'object') { const f = {}; Object.entries(v).forEach(([k, x]) => { f[k] = fs_(x); }); return { mapValue: { fields: f } }; }
  return { nullValue: null };
}
const troca = (s) => (typeof s === 'string' && s.includes(DE)) ? s.split(DE).join(PARA) : s;

(async () => {
  console.log('▶ ' + (APPLY ? 'APLICANDO' : 'ENSAIO (não grava)') + ' — results do Grupo D\n');
  let abortar = null;
  const escritas = [];

  for (const id of JOGOS) {
    const r = await fetch(BASE + '/tournaments/' + ID + '/results/' + id, { headers: H() });
    const raw = await r.json();
    if (raw.error) { console.log('  ✗ ' + id + ': ' + JSON.stringify(raw.error).slice(0, 140)); abortar = 'leitura'; continue; }
    const d = plain({ mapValue: { fields: raw.fields || {} } });
    const antes = JSON.stringify(d);

    let mexeu = 0;
    ['p1', 'p2', 'winner'].forEach((k) => { const v = troca(d[k]); if (v !== d[k]) mexeu++; d[k] = v; });
    // arrays de nome, se existirem nesta cópia
    ['team1', 'team2', 'players'].forEach((k) => {
      if (Array.isArray(d[k])) d[k] = d[k].map((n) => { if (n === DE) { mexeu++; return PARA; } return n; });
    });
    // uid da ausente sai dos arrays de identidade (fictício não tem uid)
    ['team1Uids', 'team2Uids', 'playerUids', 'playersUids'].forEach((k) => {
      if (Array.isArray(d[k])) d[k] = d[k].map((u) => (u === UID_VIVIAN ? null : u));
    });

    const a = JSON.parse(antes);
    const feridos = INTOCAVEIS.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(d[k]));
    console.log('  ' + id.slice(0, 22));
    console.log('     p1: ' + d.p1 + '  |  p2: ' + d.p2);
    console.log('     winner: ' + d.winner + '  |  placar INTOCADO: ' + d.scoreP1 + '-' + d.scoreP2
              + '  |  sets: ' + JSON.stringify(d.sets));
    console.log('     trocas de nome: ' + mexeu);
    if (feridos.length) { console.log('     ⛔ ABORTA: campo de resultado mudou → ' + feridos.join(', ')); abortar = 'resultado'; }
    if (!mexeu) { console.log('     ⚠️ nenhuma troca — este doc já estava certo?'); }
    escritas.push({ id, doc: d, updateTime: raw.updateTime });
  }

  if (abortar) { console.log('\n❌ ABORTADO (' + abortar + ') — nada gravado.'); process.exit(1); }
  if (!APPLY) { console.log('\n(ensaio — rode com --apply pra gravar)'); return; }

  for (const e of escritas) {
    const url = BASE + '/tournaments/' + ID + '/results/' + e.id
              + '?currentDocument.updateTime=' + encodeURIComponent(e.updateTime);
    const f = {}; Object.entries(e.doc).forEach(([k, v]) => { f[k] = fs_(v); });
    const r = await fetch(url, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, H()), body: JSON.stringify({ fields: f }) });
    const out = await r.json();
    console.log(out.error ? '  ✗ ' + e.id + ' → ' + JSON.stringify(out.error).slice(0, 200) : '  ✓ gravado results/' + e.id);
    if (out.error) process.exit(1);
  }
  console.log('\n✅ results corrigido.');
})().catch((e) => { console.error(e); process.exit(1); });
