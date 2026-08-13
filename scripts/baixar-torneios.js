#!/usr/bin/env node
/* Baixa os torneios REAIS de produção pra tests/fixtures/prod-tournaments.json.
 *
 * Serve ao golden master do motor (tests/motor-golden-master.js): refatorar o motor sem
 * mudar o que já existe só é PROVÁVEL contra os documentos de verdade — fixture inventada
 * não tem os casos que a base tem (dupla sem uid, folga legada, grupo sem categoria,
 * placar em formato antigo…).
 *
 * Uso:  node scripts/baixar-torneios.js
 * Requer: gcloud auth print-access-token (leitura; NÃO escreve nada em produção).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const OUT = path.join(__dirname, '..', 'tests', 'fixtures', 'prod-tournaments.json');
const PROJ = 'scoreplace-app';

function token() {
  try { return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim(); }
  catch (e) { console.error('✗ sem token do gcloud:', e.message); process.exit(1); }
}
function get(url, tk) {
  return new Promise(function (res, rej) {
    https.get(url, { headers: { Authorization: 'Bearer ' + tk } }, function (r) {
      let b = ''; r.on('data', function (c) { b += c; });
      r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
// Firestore REST → objeto JS puro
function un(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) { const o = {}; const f = v.mapValue.fields || {}; Object.keys(f).forEach(function (k) { o[k] = un(f[k]); }); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(un);
  return v;
}

(async function () {
  const tk = token();
  let url = 'https://firestore.googleapis.com/v1/projects/' + PROJ + '/databases/(default)/documents/tournaments?pageSize=100';
  const out = [];
  for (;;) {
    const d = await get(url, tk);
    (d.documents || []).forEach(function (doc) {
      const o = {}; const f = doc.fields || {};
      Object.keys(f).forEach(function (k) { o[k] = un(f[k]); });
      if (!o.id) o.id = doc.name.split('/').pop();
      out.push(o);
    });
    if (!d.nextPageToken) break;
    url = url.split('&pageToken=')[0] + '&pageToken=' + encodeURIComponent(d.nextPageToken);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('✅ ' + out.length + ' torneios → ' + path.relative(process.cwd(), OUT) +
    ' (' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB)');
  out.forEach(function (t) {
    const rd = (t.rounds || []).length, ms = (t.matches || []).length;
    console.log('   • ' + String(t.name || t.id).slice(0, 44).padEnd(46) +
      t.format + ' | ' + t.status + ' | rounds=' + rd + ' matches=' + ms +
      ' inscritos=' + ((t.participants || []).length));
  });
})();
