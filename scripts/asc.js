/* asc.js — cliente mínimo da API do App Store Connect (JWT ES256 com o crypto do Node).
 *
 * Existe porque submeter/consultar a loja pela UI é clique manual, e clique manual não
 * deixa rastro nem entra em script. A chave é a MESMA do upload (project_ios_upload_apikey_canonical).
 *
 * ⛔ LER É LIVRE, ESCREVER É EXPLÍCITO: qualquer verbo que não seja GET exige --apply.
 * Submeter uma versão à revisão da Apple é outward-facing e entra numa fila de terceiros.
 *
 * Uso:
 *   node scripts/asc.js estado                 → app, versões e a última build
 *   node scripts/asc.js submeter <versao> --apply
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const KEY_ID = process.env.ASC_KEY_ID || 'Z49BK5AM75';
const ISSUER = process.env.ASC_ISSUER_ID || '3231e4cb-d4f6-4ff2-a095-b98d57c33a6c';
const KEY_PATH = process.env.ASC_KEY_PATH || path.join(os.homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${KEY_ID}.p8`);
const BASE = 'https://api.appstoreconnect.apple.com/v1';

function b64u(o) { return Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url'); }
function token() {
  const key = fs.readFileSync(KEY_PATH, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
  const body = b64u({ iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const sig = crypto.createSign('SHA256').update(`${head}.${body}`).end()
    .sign({ key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}
async function api(rota, opts) {
  opts = opts || {};
  const r = await fetch(rota.startsWith('http') ? rota : BASE + rota, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { raw: txt }; }
  if (!r.ok) {
    const det = (j && j.errors) ? j.errors.map((e) => `${e.title}: ${e.detail || ''}`).join(' | ') : txt.slice(0, 300);
    throw new Error(`${r.status} ${det}`);
  }
  return j;
}
module.exports = { api, token };

if (require.main === module) {
  (async () => {
    const cmd = process.argv[2] || 'estado';
    const apps = await api('/apps?limit=5');
    const app = (apps.data || [])[0];
    if (!app) { console.error('✗ nenhum app na conta.'); process.exit(1); }
    console.log(`app: ${app.attributes.name} (${app.attributes.bundleId})  id=${app.id}`);

    if (cmd === 'estado') {
      const vs = await api(`/apps/${app.id}/appStoreVersions?limit=5`);
      console.log('\nversões na App Store Connect:');
      (vs.data || []).forEach((v) => {
        console.log(`  · ${String(v.attributes.versionString).padEnd(10)} ${v.attributes.appStoreState}  (release: ${v.attributes.releaseType})  id=${v.id}`);
      });
      const bs = await api(`/apps/${app.id}/builds?limit=5`);
      console.log('\núltimas builds:');
      for (const b of (bs.data || [])) {
        console.log(`  · build ${String(b.attributes.version).padEnd(5)} ${b.attributes.processingState}  expira: ${b.attributes.expired ? 'SIM' : 'não'}  id=${b.id}`);
      }
      return;
    }
    if (cmd === 'submeter') {
      const versao = process.argv[3];
      const APLICAR = process.argv.includes('--apply');
      if (!versao) { console.error('uso: node scripts/asc.js submeter <versao> [--apply]'); process.exit(2); }

      // 1. a BUILD dessa versão tem que existir e estar processada
      const bs = await api(`/builds?filter[app]=${app.id}&limit=20&sort=-uploadedDate`);
      const build = (bs.data || []).find((b) => b.attributes.processingState === 'VALID' &&
        !b.attributes.expired);
      if (!build) { console.error('✗ nenhuma build VALID disponível.'); process.exit(1); }
      console.log(`\nbuild escolhida: ${build.attributes.version} (enviada ${(build.attributes.uploadedDate||'').slice(0,16)})`);

      // 2. a versão já existe?
      const vs = await api(`/apps/${app.id}/appStoreVersions?limit=20`);
      let ver = (vs.data || []).find((v) => v.attributes.versionString === versao);
      if (ver) {
        console.log(`versão ${versao} já existe — estado ${ver.attributes.appStoreState}`);
        if (ver.attributes.appStoreState === 'READY_FOR_SALE') {
          console.error('✗ essa versão já está publicada. Use um número novo.'); process.exit(1);
        }
      } else if (!APLICAR) {
        console.log(`(criaria a versão ${versao})`);
      } else {
        ver = (await api('/appStoreVersions', { method: 'POST', body: { data: {
          type: 'appStoreVersions',
          attributes: { platform: 'IOS', versionString: versao, releaseType: 'AFTER_APPROVAL' },
          relationships: { app: { data: { type: 'apps', id: app.id } } },
        } } })).data;
        console.log(`✓ versão ${versao} criada (id=${ver.id})`);
      }
      if (!APLICAR) { console.log('\n(dry-run — rode com --apply)\n'); return; }

      // 3. anexa a build
      await api(`/appStoreVersions/${ver.id}/relationships/build`, { method: 'PATCH',
        body: { data: { type: 'builds', id: build.id } } });
      console.log(`✓ build ${build.attributes.version} anexada`);

      // 4. texto de novidades (pt-BR)
      const NOVIDADES = fs.readFileSync(path.join(__dirname, 'whats-new.txt'), 'utf8').trim();
      const locs = await api(`/appStoreVersions/${ver.id}/appStoreVersionLocalizations`);
      for (const l of (locs.data || [])) {
        await api(`/appStoreVersionLocalizations/${l.id}`, { method: 'PATCH',
          body: { data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: { whatsNew: NOVIDADES } } } });
        console.log(`✓ novidades gravadas (${l.attributes.locale}, ${NOVIDADES.length} chars)`);
      }

      // 5. submete pra revisão
      const rs = (await api('/reviewSubmissions', { method: 'POST', body: { data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: app.id } } },
      } } })).data;
      await api('/reviewSubmissionItems', { method: 'POST', body: { data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: rs.id } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } },
        },
      } } });
      await api(`/reviewSubmissions/${rs.id}`, { method: 'PATCH', body: { data: {
        type: 'reviewSubmissions', id: rs.id, attributes: { submitted: true },
      } } });
      console.log(`\n✅ ${versao} (build ${build.attributes.version}) SUBMETIDA para revisão da Apple.`);
      console.log('   Liberação: automática após aprovação (AFTER_APPROVAL).');
      return;
    }
    console.error('comando desconhecido:', cmd);
    process.exit(2);
  })().catch((e) => { console.error('✗', e.message); process.exit(1); });
}
