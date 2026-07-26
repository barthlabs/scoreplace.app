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

// ── SANDBOX: quem pode SEQUER RECEBER o doc ──────────────────────────────────
// O SB tem que ser invisível pra quem não é o dev. Filtro no CLIENTE não garante isso:
// o listener é `tournaments where memberUids array-contains <meu uid>`, então enquanto o
// uid do participante real estiver no memberUids do SB o Firestore ENTREGA o doc no
// device dele — e aí a invisibilidade depende de cada tela lembrar de filtrar (eram 2 de
// dezenas). A garantia real é NÃO ENTREGAR: no SB, memberUids = SÓ os uids do dev.
// O roster (participants[]) continua completo — é dele que o motor sorteia; memberUids é
// só chave de entrega/leitura. Ver [[project_sandbox_tournament]].
window._isSandboxData = function (data) { return !!(data && data.isSandbox === true); };

// Uids que podem receber/abrir um SB: o dono do sandbox e o criador (ambos = o dev).
// Co-organizadores do ORIGINAL NÃO entram — são pessoas reais clonadas junto.
window._sandboxOwnerUids = function (data) {
  if (!data) return [];
  var set = {};
  [data.sandboxOwnerUid, data.creatorUid].forEach(function (u) {
    if (u && typeof u === 'string' && u.length >= 4) set[u] = true;
  });
  return Object.keys(set);
};

// Merge canônico de memberUids no limite de escrita. Torneio normal: UNIÃO (nunca encolhe
// — um uid que só existe no denormalizado não pode sumir e derrubar o listener de quem
// depende dele). SANDBOX: substitui, SEM união — senão os uids reais clonados na criação
// ressuscitariam a cada gravação e o SB voltaria a ser entregue pra todo mundo.
window._mergeMemberUids = function (data, prev, next) {
  var n = Array.isArray(next) ? next : [];
  if (window._isSandboxData(data)) return n.slice();
  var p = Array.isArray(prev) ? prev : [];
  return Array.from(new Set(p.concat(n)));
};

window._computeAdminEmails = function (data) {
  if (!data) return [];
  // SB: só o dev administra. Sem isto, co-host do original clonado viraria admin do SB.
  if (window._isSandboxData(data)) {
    var e = (data.organizerEmail || '');
    e = (typeof e === 'string') ? e.trim().toLowerCase() : '';
    return e ? [e] : [];
  }
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
  // SB: só o dev administra (co-host do original clonado não vira admin do sandbox).
  if (window._isSandboxData(data)) return window._sandboxOwnerUids(data);
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
  // SANDBOX: SÓ o dev entra em memberUids. É esta linha que faz o Firestore NUNCA entregar
  // o doc do SB no listener de um participante real — a invisibilidade deixa de depender de
  // cada tela lembrar de filtrar. O roster real segue intacto em participants[].
  if (window._isSandboxData(data)) return window._sandboxOwnerUids(data);
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
