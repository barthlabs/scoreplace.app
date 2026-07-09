/* NOME→UID por nome VIVO (ITEM 3 · Parte 14 · FASE 3) — dirige os resolvers REAIS
 * window._buildNameToUid (bracket-logic.js, via headless) e window._memberUidByName
 * (store.js, via render-harness).
 *
 * A CAMPANHA ITEM 3 vai parar de GRAVAR p1Name/p2Name/displayName pra quem tem uid (Fase 4).
 * A partir daí existirá a "entrada só-uid": { p1Uid, p2Uid } SEM p1Name/p2Name. Os mapas
 * nome→uid ANTIGOS leem SÓ o nome gravado (`if (p.p1Name && p.p1Uid)`) → uma entrada só-uid
 * some do mapa. Como esses mapas resolvem a CHAVE-string do slot (m.p1/m.p2) de volta pro uid
 * (usados por standings/_idKey, W.O., folga, monarch, liga-sub), a entrada só-uid deixaria de
 * resolver → classificação/W.O./substituição quebram.
 *
 * A Fase 3 (aditivo) faz os resolvers mapearem TAMBÉM o nome VIVO por uid (window._nameForUid,
 * perfil), SEM sobrescrever a chave de nome gravado (frozen slot/legado intactos).
 *
 * FALHA no antigo (só-uid não resolve); PASSA no novo (resolve pelo nome vivo).
 * node tests/name-to-uid-live-resolution.test.js
 */
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

// ── réplica do resolver ANTIGO de _buildNameToUid (só nome gravado) — prova que ERRAVA ──────
function oldBuildNameToUid(t) {
  var map = {};
  (t.participants || []).forEach(function (p) {
    if (!p || typeof p !== 'object') return;
    if (p.p1Name && p.p1Uid) map[String(p.p1Name).trim()] = p.p1Uid;
    if (p.p2Name && p.p2Uid) map[String(p.p2Name).trim()] = p.p2Uid;
    var nm = String((p.displayName || p.name) || '').trim();
    if (nm && p.uid && !map[nm]) map[nm] = p.uid;
  });
  return map;
}

// ══ 1. _buildNameToUid (bracket-logic REAL, via headless) ════════════════════════════════════
(function () {
  const { window: W } = require('./headless.js');
  ok(typeof W._buildNameToUid === 'function', '_buildNameToUid existe (bracket-logic carregou)');

  // simula o ambiente CLIENTE: resolver de nome vivo presente (é o que store.js provê em prod).
  const LIVE = { uJoao: 'João Silva', uMaria: 'Maria', uBia: 'Bia' };
  W._nameForUid = function (uid) { return LIVE[uid] || ''; };

  // entrada DUPLA só-uid (sem p1Name/p2Name gravado — como fica pós-Fase-4)
  const tOnlyUid = { participants: [{ p1Uid: 'uJoao', p2Uid: 'uMaria' }] };

  const oldMap = oldBuildNameToUid(tOnlyUid);
  eq(oldMap['João Silva'], undefined, 'ANTIGO: dupla só-uid NÃO entra no mapa (a falha)');
  eq(oldMap['Maria'], undefined, 'ANTIGO: 2º slot só-uid também some');

  const newMap = W._buildNameToUid(tOnlyUid);
  eq(newMap['João Silva'], 'uJoao', 'NOVO: resolve o slot 1 pelo nome VIVO → uid');
  eq(newMap['Maria'], 'uMaria', 'NOVO: resolve o slot 2 pelo nome VIVO → uid');

  // BACKWARD-COMPAT: entrada COM p1Name gravado (frozen slot) segue mapeando o nome GRAVADO,
  // e a chave viva não clobbera. p1Name "João" (stale) ≠ nome vivo "João Silva".
  const tStored = { participants: [{ p1Uid: 'uJoao', p1Name: 'João', p2Uid: 'uMaria', p2Name: 'Maria' }] };
  const m2 = W._buildNameToUid(tStored);
  eq(m2['João'], 'uJoao', 'BACKWARD: nome GRAVADO stale continua resolvendo o slot congelado');
  eq(m2['Maria'], 'uMaria', 'BACKWARD: 2º slot gravado ok');
  eq(m2['João Silva'], 'uJoao', 'ADITIVO: nome vivo TAMBÉM entra (chave nova, gap preenchido)');

  // ANTI-CLOBBER: se o nome GRAVADO de B == nome VIVO de A, a chave gravada de B ganha.
  const tCollide = {
    participants: [
      { uid: 'uBia', name: 'Bia' },                 // gravado "Bia" → uBia
      { p1Uid: 'uJoao', p2Uid: 'uMaria' },          // vivo de uJoao é "João Silva", de uMaria "Maria"
    ],
  };
  // renomeia uBia (vivo) pra colidir com nada aqui; testa o inverso: gravado vence live.
  W._nameForUid = function (uid) { return ({ uJoao: 'João Silva', uMaria: 'Maria', uBia: 'Bianca' })[uid] || ''; };
  const m3 = W._buildNameToUid(tCollide);
  eq(m3['Bia'], 'uBia', 'ANTI-CLOBBER: chave de nome GRAVADO preservada');
  eq(m3['Bianca'], 'uBia', 'ADITIVO: nome vivo de uBia também mapeado');

  // autoDraw (sem _nameForUid) → só chaves de nome gravado (comportamento de hoje intacto)
  delete W._nameForUid;
  const mSrv = W._buildNameToUid(tStored);
  eq(mSrv['João'], 'uJoao', 'AUTODRAW: nome gravado resolve');
  eq(mSrv['João Silva'], undefined, 'AUTODRAW: sem _nameForUid → nenhuma chave viva (hoje intacto)');
})();

// ══ 2. _memberUidByName (store.js REAL, via render-harness) ═══════════════════════════════════
(function () {
  const W = require('./render-harness').window;
  ok(typeof W._memberUidByName === 'function', '_memberUidByName existe (store.js carregou)');

  // ambiente cliente: cache de nome vivo populado (o que _preloadUserProfiles/_preloadPlayerPhotos fazem)
  W._profileNameByUid = W._profileNameByUid || {};
  W._profileNameByUid['uJoao'] = 'João Silva';
  W._profileNameByUid['uMaria'] = 'Maria';

  // torneio com entrada DUPLA só-uid (sem p1Name/p2Name)
  const t = { participants: [{ p1Uid: 'uJoao', p2Uid: 'uMaria' }] };

  eq(W._memberUidByName(t, 'João Silva'), 'uJoao', 'NOVO: resolve nome vivo do slot 1 → uid');
  eq(W._memberUidByName(t, 'Maria'), 'uMaria', 'NOVO: resolve nome vivo do slot 2 → uid');
  eq(W._memberUidByName(t, 'Fulano'), '', 'nome inexistente → vazio');

  // BACKWARD: entrada com displayName gravado (solo legado) segue resolvendo por nome gravado.
  const t2 = { participants: [{ uid: 'uZ', displayName: 'Zilda' }] };
  eq(W._memberUidByName(t2, 'Zilda'), 'uZ', 'BACKWARD: nome gravado resolve (passada 1 ganha)');
})();

if (fail) { console.error('\n❌ name-to-uid-live: ' + fail + ' falharam, ' + pass + ' ok'); process.exit(1); }
console.log('✅ name-to-uid-live: ' + pass + ' ok, 0 falharam');
