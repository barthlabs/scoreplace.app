/* persist-core.js — NORMALIZAÇÕES DO LIMITE DE PERSISTÊNCIA (extraído do firebase-db.js, v1.2.25)
 *
 * Tudo que roda ANTES de um torneio ir pro Firestore, do lado do dado (não do transporte):
 * limpar `undefined`/keys reservadas e recomputar os denormalizados que as REGRAS leem
 * (adminEmails/adminUids/memberUids). O boundary canônico é FirestoreDB.mutateTournament /
 * saveTournament — que agora DELEGA pra cá, igual já fazia com _foldMonarchGroups.
 *
 * POR QUE VIVE NUM ARQUIVO PRÓPRIO: o SORTEIO está sendo canonizado numa Cloud Function
 * ("os cânones rodam em CF, disparados pelo app, pra evitar que cada usuário rode uma versão
 * diferente com app desatualizado" — dono, jul/2026). A CF vai PERSISTIR, então precisa gravar
 * pela MESMA regra do cliente. Mas estas funções moravam no firebase-db.js, que é a camada de
 * DB do browser (depende do SDK compat) e não carrega em Node. As saídas eram espelhar na CF
 * (= 2ª versão = o bug de versão que se quer matar) ou extrair. Extraído. O servidor carrega
 * ESTE arquivo via functions-autodraw/vendor/ (copy-vendor no predeploy) → uma versão só.
 * Mesmo movimento e mesma razão do identity-core.js. Ver [[project_draw_canonization_cf]].
 *
 * REGRA: PURO — nada de document/firebase/AppStore/localStorage. Se precisar de DOM ou do SDK,
 * não pertence aqui (quebra o load no servidor). Nada é chamado no load — só definições.
 *
 * Carregado por index.html, tests.html, tests-draw-resolution.html, tests/render-harness.js
 * e functions-autodraw (copy-vendor). O firebase-db.js mantém os métodos como DELEGADORES,
 * então os ~30 call sites de `FirestoreDB._cleanUndefined(...)` seguem intocados.
 */
window._cleanUndefined = function (obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(function(item) { return window._cleanUndefined(item); });
  }
  if (typeof obj === 'object' && obj.constructor === Object) {
    var cleaned = {};
    Object.keys(obj).forEach(function(key) {
      if (obj[key] === undefined) return;
      // Firestore rejeita keys com padrão `__xxx__` em qualquer field nested.
      if (typeof key === 'string' && key.length >= 4 && key.indexOf('__') === 0 && key.lastIndexOf('__') === key.length - 2) {
        return;
      }
      cleaned[key] = window._cleanUndefined(obj[key]);
    });
    return cleaned;
  }
  return obj;
};

window._computeAdminEmails = function (data) {
  if (!data) return [];
  var set = {};
  var push = function(e) {
    if (!e || typeof e !== 'string') return;
    var norm = e.trim().toLowerCase();
    if (norm) set[norm] = true;
  };
  push(data.creatorEmail);
  push(data.organizerEmail);
  if (Array.isArray(data.coHosts)) {
    data.coHosts.forEach(function(ch) {
      if (ch && ch.status === 'active') push(ch.email);
    });
  }
  return Object.keys(set);
};

window._computeAdminUids = function (data) {
  if (!data) return [];
  var set = {};
  var push = function(u) { if (u && typeof u === 'string' && u.length >= 4) set[u] = true; };
  push(data.creatorUid);
  if (Array.isArray(data.coHosts)) {
    data.coHosts.forEach(function(ch) { if (ch && ch.status === 'active') push(ch.uid); });
  }
  return Object.keys(set);
};

window._computeMemberUids = function (data) {
  if (!data) return [];
  var set = {};
  var push = function(u) {
    if (!u || typeof u !== 'string' || u.length < 4) return;
    set[u] = true;
  };
  push(data.creatorUid);
  if (Array.isArray(data.coHosts)) {
    data.coHosts.forEach(function(ch) { if (ch && ch.status === 'active') push(ch.uid); });
  }
  var parts = Array.isArray(data.participants) ? data.participants : [];
  parts.forEach(function(p) {
    if (!p || typeof p === 'string') return;
    push(p.uid);
    // Dupla formada: p1Uid e p2Uid
    push(p.p1Uid); push(p.p2Uid);
    if (Array.isArray(p.participants)) {
      p.participants.forEach(function(sub) { if (sub) push(sub.uid); });
    }
  });
  return Object.keys(set);
};
