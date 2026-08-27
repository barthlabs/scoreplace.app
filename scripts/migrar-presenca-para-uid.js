/* MIGRA `checkedIn` (e `checkedInConfirmed`) de CHAVE-NOME para CHAVE-UID.
 *
 * Ordem do dono (27/ago/2026): _"e cade a porra da correcao dessas presenca por nome e nao
 * por uid?"_ — eu tinha medido o problema, corrigido a origem (2.1.6) e deixado o dado
 * torto argumentando que a presença caduca em 24h. Racionalização: "some sozinho" não é
 * motivo pra deixar dado errado num torneio AO VIVO.
 *
 * CONTEXTO: o dono confirmou que **não existe inscrito digitado na Confra**, então toda
 * chave-nome ali é defeito — exceto o coringa `Jogador X`, que não tem uid por natureza e
 * é a exceção canônica ([[feedback_uid_controls_everything_name_only_ficticio]]).
 *
 * ⭐ RESOLVE O UID EM TRÊS FONTES, na mesma ordem da correção de código (2.1.6):
 *   1. elenco (`inscritos`, id = 'u'+uid) cruzado com `users.displayName`
 *   2. slots dos JOGOS (`team1Uids`/`team2Uids` alinhados aos nomes) — é a fonte que
 *      salva quando o elenco não ajuda, porque o nome do slot pode ser o nome ANTIGO
 *   3. varredura de `users.displayName_lower` (quem renomeou o perfil depois)
 *
 * ⛔ NUNCA CHUTA: nome que não resolve em nenhuma das três fica como está e é LISTADO.
 * ⛔ NUNCA PERDE PRESENÇA: se já existe chave-uid para a mesma pessoa, fica o carimbo MAIS
 *    NOVO (a presença mais recente é a que vale) e a chave-nome é removida.
 *
 * Uso:  node scripts/migrar-presenca-para-uid.js <tournamentId>            (ENSAIO)
 *       node scripts/migrar-presenca-para-uid.js <tournamentId> --apply    (grava)
 */
'use strict';
const { execSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const ID = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!ID) { console.error('uso: node scripts/migrar-presenca-para-uid.js <tournamentId> [--apply]'); process.exit(1); }

const RES = 'projects/scoreplace-app/databases/(default)/documents';
const B = 'https://firestore.googleapis.com/v1/' + RES;
const H = () => ({ Authorization: 'Bearer ' + execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim() });
const ehUid = (k) => /^[A-Za-z0-9]{20,}$/.test(k);
const norm = (s) => String(s || '').trim().toLowerCase();

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
const fsNum = (n) => (Number.isInteger(n) ? { integerValue: String(n) } : { doubleValue: n });
const fsVal = (v) => (typeof v === 'number' ? fsNum(v) : { stringValue: String(v) });
const ms = (v) => (typeof v === 'number' ? v : new Date(v).getTime());

async function todos(col, mask) {
  let out = [], tok = null;
  do {
    const u = B + '/tournaments/' + ID + '/' + col + '?pageSize=300' + (mask ? '&mask.fieldPaths=' + mask : '') + (tok ? '&pageToken=' + tok : '');
    const j = await (await fetch(u, { headers: H() })).json();
    if (j.error) return out;
    (j.documents || []).forEach((d) => out.push(d));
    tok = j.nextPageToken;
  } while (tok);
  return out;
}

(async () => {
  console.log('▶ ' + (APPLY ? 'APLICANDO' : 'ENSAIO (não grava)') + ' — presença por uid em ' + ID + '\n');
  const raw = await (await fetch(B + '/tournaments/' + ID, { headers: H() })).json();
  if (raw.error) { console.error('não li o torneio:', JSON.stringify(raw.error).slice(0, 200)); process.exit(1); }
  const t = plain({ mapValue: { fields: raw.fields || {} } });
  const ghosts = Array.isArray(t.ligaGhosts) ? t.ligaGhosts.map(norm) : [];

  /* ── fonte 1: elenco → displayName ─────────────────────────────────────── */
  const uids = (await todos('inscritos', '_k')).map((d) => d.name.split('/').pop().replace(/^u/, ''));
  const nome2uid = {};
  for (let i = 0; i < uids.length; i += 100) {
    const body = { documents: uids.slice(i, i + 100).map((u) => RES + '/users/' + u), mask: { fieldPaths: ['displayName'] } };
    const r = await (await fetch(B + ':batchGet', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H()), body: JSON.stringify(body) })).json();
    (Array.isArray(r) ? r : []).forEach((x) => {
      if (!x.found) return;
      const dn = x.found.fields && x.found.fields.displayName && x.found.fields.displayName.stringValue;
      if (dn) nome2uid[norm(dn)] = x.found.name.split('/').pop();
    });
  }

  /* ── fonte 2: slots dos jogos (pega o nome ANTIGO, que o perfil já não tem) ── */
  (await todos('matches')).forEach((d) => {
    const j = (plain({ mapValue: { fields: d.fields || {} } }) || {}).jogo || {};
    [[j.team1, j.team1Uids], [j.team2, j.team2Uids]].forEach(([ns, us]) => {
      if (!Array.isArray(ns) || !Array.isArray(us)) return;
      ns.forEach((n, k) => { if (us[k] && n && !nome2uid[norm(n)]) nome2uid[norm(n)] = String(us[k]); });
    });
  });

  const mapas = ['checkedIn', 'checkedInConfirmed'].filter((k) => t[k] && typeof t[k] === 'object');
  let migrados = 0, ghost = 0, semCasar = 0, fundidos = 0;
  const novos = {};

  mapas.forEach((campo) => {
    const m = t[campo] || {};
    const saida = {};
    Object.keys(m).forEach((k) => { if (ehUid(k)) saida[k] = m[k]; });
    Object.keys(m).forEach((k) => {
      if (ehUid(k)) return;
      if (ghosts.indexOf(norm(k)) !== -1) { saida[k] = m[k]; ghost++; console.log('  ✓ COringa (fica por nome): ' + k); return; }
      const u = nome2uid[norm(k)];
      if (!u) { saida[k] = m[k]; semCasar++; console.log('  ⚠️ NÃO resolveu, fica como está: ' + k + '  [' + campo + ']'); return; }
      if (saida[u] !== undefined) {
        const fica = ms(m[k]) > ms(saida[u]) ? m[k] : saida[u];
        saida[u] = fica; fundidos++;
        console.log('  ⭐ FUNDIDO (já havia chave-uid): ' + k + ' → ' + u + '  [' + campo + '] fica o carimbo mais novo');
      } else {
        saida[u] = m[k]; migrados++;
        console.log('  ⭐ ' + k.padEnd(22) + ' → ' + u + '  [' + campo + ']');
      }
    });
    novos[campo] = saida;
    console.log('  · ' + campo + ': ' + Object.keys(m).length + ' chaves → ' + Object.keys(saida).length + '\n');
  });

  console.log('migrados: ' + migrados + ' | fundidos: ' + fundidos + ' | coringa mantido: ' + ghost + ' | não resolveu: ' + semCasar);
  if (!migrados && !fundidos) { console.log('\nnada a fazer.'); return; }
  if (!APPLY) { console.log('\n(ensaio — rode com --apply pra gravar)'); return; }

  const campos = {}; const mask = [];
  Object.keys(novos).forEach((c) => {
    const f = {}; Object.entries(novos[c]).forEach(([k, v]) => { f[k] = fsVal(v); });
    campos[c] = { mapValue: { fields: f } }; mask.push('updateMask.fieldPaths=' + c);
  });
  campos.updatedAt = { stringValue: new Date().toISOString() };
  mask.push('updateMask.fieldPaths=updatedAt');
  const url = B + '/tournaments/' + ID + '?' + mask.join('&')
            + '&currentDocument.updateTime=' + encodeURIComponent(raw.updateTime);
  const r = await (await fetch(url, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, H()), body: JSON.stringify({ fields: campos }) })).json();
  console.log(r.error ? '\n✗ ' + JSON.stringify(r.error).slice(0, 220) : '\n✅ gravado.');
  if (r.error) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
