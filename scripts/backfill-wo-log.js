/* BACKFILL — grava o REGISTRO de W.O. (`t.woLog`) num torneio criado antes dele existir.
 *
 * A v2.0.60 passou a GRAVAR cada W.O. no ato (js/views/wo-log.js), porque deduzir o passado
 * do estado do presente custou quatro consertos em quatro dias (ver o cabeçalho do módulo).
 * Torneio em andamento, porém, tem W.O.s que aconteceram ANTES do registro existir: sem
 * este backfill, eles continuariam servidos pela reconstrução — que é justamente o que se
 * quer aposentar.
 *
 * A dedução acontece UMA última vez, aqui, e pelo MESMO código da tela
 * (`window._ligaGroupWoList`, via o shim do autodraw): nada de uma segunda versão da regra.
 * O que ele devolver vira evento gravado, com a data do rastro quando ela existe.
 *
 * Idempotente (não duplica) e com precondição `currentDocument.updateTime`: se alguém
 * escrever no meio, ABORTA em vez de sobrescrever.
 *
 * Uso: node scripts/backfill-wo-log.js            (dry-run)
 *      node scripts/backfill-wo-log.js --apply    (grava)
 *      SP_TID=<id> node scripts/backfill-wo-log.js
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
// o shim do autodraw não carrega estes dois (são de tela) — e são eles que sabem deduzir
[ 'wo-log.js', 'liga-substitution.js' ].forEach(function (f) {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', f), 'utf8');
  (new Function('window', 'document', 'with (window) { ' + src + ' }'))(win, win.document || {});
});

const TID = process.env.SP_TID || 'tour_1780009816637';
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const APPLY = process.argv.includes('--apply');
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
function toF(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') { const f = {}; Object.entries(v).forEach(([k, x]) => { f[k] = toF(x); }); return { mapValue: { fields: f } }; }
  return { nullValue: null };
}

(async () => {
  const res = await fetch(`${BASE}/tournaments/${TID}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error('GET falhou: ' + res.status);
  const doc = await res.json();
  const t = {}; Object.entries(doc.fields || {}).forEach(([k, v]) => { t[k] = fromF(v); });
  const updateTime = doc.updateTime;
  console.log(`torneio: ${t.name} · updateTime: ${updateTime}`);
  console.log(`registro atual: ${Array.isArray(t.woLog) ? t.woLog.length : 0} evento(s)`);

  let total = 0;
  (t.rounds || []).forEach((r, ri) => {
    ((r && r.monarchGroups) || []).forEach((g) => {
      if (!g || !g.name) return;
      // a dedução, uma última vez, pelo código da tela
      const pares = win._ligaGroupWoList(t, g) || [];
      if (!pares.length) return;
      if (pares.some((p) => p.doRegistro)) return;    // este grupo já está no registro
      const n = win._woLogBackfillGroup(t, ri, g.name, pares);
      if (!n) return;
      total += n;
      console.log(`  R${ri + 1} ${g.name}: +${n} → ${pares.map((p) => (p.absentName || p.absentUid) + '→' + (p.subName || '(vaga aberta)')).join(' · ')}`);
    });
  });

  console.log(`\neventos a gravar: ${total}`);
  if (!total) { console.log('nada a fazer.'); return; }
  if (!APPLY) { console.log('\n(dry-run — rode com --apply pra gravar)'); return; }

  const hist = Array.isArray(t.history) ? t.history.slice() : [];
  hist.push({ at: new Date().toISOString(), message: `Backfill 2.0.60: registro de W.O. (woLog) criado com ${total} evento(s) derivado(s) do estado atual.` });
  const fields = { woLog: toF(t.woLog || []), history: toF(hist) };
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&');
  const url = `${BASE}/tournaments/${TID}?${mask}&currentDocument.updateTime=${encodeURIComponent(updateTime)}`;
  const w = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!w.ok) { console.error('PATCH falhou:', w.status, await w.text()); process.exit(1); }
  console.log(`\n✓ gravado — ${total} evento(s) no registro.`);
})();
