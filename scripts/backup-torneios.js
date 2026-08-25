/* GUARDIÃO DA ORIGEM — retrato datado da coleção `tournaments`, como ela está HOJE.
 *
 * Ordem do dono (25/ago/2026): _"guarde a origem dos dados para não ter problemas e
 * ter um backup deles caso algo esteja errado e algum participante aponte"_.
 *
 * A migração para o banco novo (subcoleções) está em curso e o banco velho segue
 * sendo a VERDADE. Este retrato é a rede debaixo dela: se alguém apontar um placar,
 * uma inscrição ou uma classificação estranha, dá pra CONFERIR contra o dado
 * original — e restaurar com `scripts/restaurar-torneio.js`.
 *
 * ⛔ O retrato NÃO vai pro repositório: são dados de pessoas reais (nomes, e-mails,
 * telefones). Vai pra pasta de backup no Drive, que já é onde mora o bundle do git.
 * ⛔ NÃO ESCREVE NADA no Firestore. Só lê.
 *
 * Uso:  node scripts/backup-torneios.js
 *       node scripts/backup-torneios.js --listar     (mostra os retratos guardados)
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DESTINO = '/Users/rtb/Library/CloudStorage/GoogleDrive-rstbarth@gmail.com/Meu Drive/scoreplace.app-main/backups-torneios';
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

function fromF(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromF);
  if ('mapValue' in v) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = fromF(x); }); return o; }
  return null;
}

if (process.argv.includes('--listar')) {
  if (!fs.existsSync(DESTINO)) { console.log('nenhum retrato guardado ainda.'); process.exit(0); }
  const arqs = fs.readdirSync(DESTINO).filter((a) => a.endsWith('.json')).sort().reverse();
  console.log('retratos guardados em', DESTINO + ':\n');
  arqs.forEach((a) => {
    const st = fs.statSync(path.join(DESTINO, a));
    let n = '?';
    try { n = JSON.parse(fs.readFileSync(path.join(DESTINO, a), 'utf8')).torneios.length; } catch (e) {}
    console.log('  ' + a.padEnd(40), String(Math.round(st.size / 1024)).padStart(5) + ' KB', '·', n, 'torneios');
  });
  process.exit(0);
}

(async () => {
  const tk = token();
  console.log('▶ retrato da coleção `tournaments` (só leitura)');

  let pag = null; const torneios = [];
  do {
    const r = await fetch(`${BASE}/tournaments?pageSize=200` + (pag ? `&pageToken=${pag}` : ''),
      { headers: { Authorization: 'Bearer ' + tk } });
    if (!r.ok) { console.error('✗ falhou:', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
    const j = await r.json();
    (j.documents || []).forEach((d) => {
      const o = {};
      Object.entries(d.fields || {}).forEach(([k, v]) => { o[k] = fromF(v); });
      o.id = d.name.split('/').pop();
      torneios.push(o);
    });
    pag = j.nextPageToken || null;
  } while (pag);

  // ⛔ um retrato VAZIO seria pior que nenhum: daria falsa sensação de rede.
  if (!torneios.length) { console.error('✗ nenhum torneio lido — retrato NÃO gravado'); process.exit(1); }

  const agora = new Date();
  const carimbo = agora.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const corpo = {
    quando: agora.toISOString(),
    projeto: 'scoreplace-app',
    colecao: 'tournaments',
    torneios: torneios
  };
  fs.mkdirSync(DESTINO, { recursive: true });
  const arq = path.join(DESTINO, 'torneios-' + carimbo + '.json');
  fs.writeFileSync(arq, JSON.stringify(corpo));

  // confere o que acabou de gravar — retrato que não relê é promessa, não backup
  const volta = JSON.parse(fs.readFileSync(arq, 'utf8'));
  const ok = volta.torneios.length === torneios.length
    && JSON.stringify(volta.torneios) === JSON.stringify(torneios);

  const kb = Math.round(fs.statSync(arq).size / 1024);
  console.log('  torneios:', torneios.length, '·', kb, 'KB');
  console.log('  ' + arq);
  console.log(ok ? '\n✅ retrato gravado e RELIDO — confere byte por byte'
                 : '\n⛔ o arquivo gravado NÃO confere com o que foi lido');
  process.exit(ok ? 0 : 1);
})();
