'use strict';
/* L13.P2 — o carimbo de versão/plataforma da sessão, provado no CÓDIGO REAL.
 * Sem este sinal, "adoção" não é medível e o corte nativo só poderia ser marcado por DATA —
 * o que a política aprovada em 11/set proíbe. E `lastSeenAt` era campo-fantasma: 4 leitores,
 * nenhum writer, 0 de 277 documentos.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), acorn = require('acorn');
const root = path.join(__dirname, '..');
function property(file, name) {
  const s = fs.readFileSync(path.join(root, file), 'utf8'); let found;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'Property' && n.key && n.key.name === name) found = s.slice(n.start, n.end);
    Object.values(n).forEach((v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); });
  })(acorn.parse(s, { ecmaVersion: 'latest' }));
  assert(found, name); return found;
}
function novaPorta(versao, plataforma, loja) {
  const escritas = []; let resolver, rejeitar;
  const promessa = new Promise((a, b) => { resolver = a; rejeitar = b; });
  const ctx = {
    window: { SCOREPLACE_VERSION: versao, SCOREPLACE_PLATFORM: plataforma, _warn() {} },
    localStorage: loja, Date, console
  };
  ctx.window.localStorage = loja;
  const db = vm.runInNewContext('({' + property('js/firebase-db.js', 'marcarSessao') + '})', ctx);
  db.ensureDb = () => true;
  db.db = { collection: () => ({ doc: () => ({ set: (dados) => { escritas.push(dados); return promessa; } }) }) };
  return { db, escritas, resolver, rejeitar };
}
const lojaFalsa = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };

(async () => {
  // ① escreve uma vez, com versão e plataforma, e NÃO espera a promessa
  {
    const loja = lojaFalsa();
    const { db, escritas, resolver } = novaPorta('2.2.69', 'ios', loja);
    assert.equal(db.marcarSessao('u1'), true, 'a primeira sessão carimba');
    assert.equal(escritas.length, 1);
    assert.equal(escritas[0].lastClientVersion, '2.2.69');
    assert.equal(escritas[0].lastClientPlatform, 'ios', 'usa SCOREPLACE_PLATFORM, não re-detecta');
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(escritas[0].lastSeenAt), 'ISO, igual a updatedAt na base');
    assert.equal(db.marcarSessao('u1'), false, 'no mesmo dia e versão não escreve de novo');
    assert.equal(escritas.length, 1);
    resolver();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(loja._m.sp_sessao_marcada.indexOf('u1|2.2.69|ios|'), 0, 'o freio só grava DEPOIS do servidor confirmar');
  }
  // ② versão nova volta a carimbar — é disso que a medida de adoção vive
  {
    const loja = lojaFalsa();
    const a = novaPorta('2.2.69', 'android', loja); a.db.marcarSessao('u1'); a.resolver(); await Promise.resolve(); await Promise.resolve();
    const b = novaPorta('2.2.70', 'android', loja);
    assert.equal(b.db.marcarSessao('u1'), true, 'versão nova = carimbo novo');
    assert.equal(b.escritas[0].lastClientVersion, '2.2.70');
  }
  // ③ ⛔ LÁPIDE NÃO É CONTA VIVA
  {
    const { db, escritas } = novaPorta('2.2.69', 'web', lojaFalsa());
    assert.equal(db.marcarSessao('u1', { mergedInto: 'u2' }), false, '⛔ conta fundida NÃO é carimbada');
    assert.equal(escritas.length, 0);
  }
  // ④ falha libera o freio: a próxima sessão tenta de novo (e não estoura)
  {
    const loja = lojaFalsa();
    const { db, rejeitar } = novaPorta('2.2.69', 'web', loja);
    assert.equal(db.marcarSessao('u1'), true);
    rejeitar(new Error('offline'));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(loja._m.sp_sessao_marcada, undefined, 'servidor não confirmou → freio não foi gravado');
    assert.equal(db._sessaoMarcada, null, 'o freio de memória foi liberado');
  }
  // ⑤ sem Firestore não inventa escrita
  {
    const { db, escritas } = novaPorta('2.2.69', 'web', lojaFalsa());
    db.ensureDb = () => false;
    assert.equal(db.marcarSessao('u1'), false);
    assert.equal(db.marcarSessao(''), false, 'sem uid não escreve');
    assert.equal(escritas.length, 0);
  }
  // ⑥ o CAMPO-FANTASMA ganhou writer — e o call-site está DEPOIS dos três returns
  {
    const fdb = fs.readFileSync(path.join(root, 'js/firebase-db.js'), 'utf8');
    assert.ok(/lastSeenAt:/.test(fdb), '⛔ `lastSeenAt` precisa ter writer — era lido em 4 lugares e escrito em nenhum');
    const auth = fs.readFileSync(path.join(root, 'js/views/auth.js'), 'utf8');
    const gate = auth.indexOf("} catch (e) { window._warn('[verify] gate check failed:', e); }");
    const chamada = auth.indexOf('FirestoreDB.marcarSessao(');
    assert.ok(gate > 0 && chamada > gate, '⛔ o carimbo tem que vir DEPOIS do gate de e-mail (e dos returns de lápide/redirect)');
    const mergedReturn = auth.indexOf('onAuthStateChanged re-dispara com o sobrevivente');
    assert.ok(mergedReturn > 0 && chamada > mergedReturn, '⛔ e DEPOIS do return da lápide');
  }
  console.log('✅ L13.P2: carimbo único por dia/versão, ISO, plataforma do global, lápide intocada, falha retentável e posição provada');
})().catch((e) => { console.error(e); process.exitCode = 1; });
