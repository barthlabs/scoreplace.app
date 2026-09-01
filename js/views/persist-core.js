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

/* ── SANDBOX: A INVISIBILIDADE MUDOU DE LUGAR (2.1.88) ────────────────────────
 * ⛔ AQUI MORAVA A ADULTERAÇÃO DE MEMBERSHIP, e ela sobrevivia à 2.1.87 em silêncio.
 * Enquanto o sandbox vivia em `tournaments`, o listener (`memberUids array-contains`)
 * ENTREGAVA o doc do sandbox no aparelho de cada pessoa real clonada junto — então o
 * cliente reescrevia `memberUids`/`adminUids`/`adminEmails` do sandbox com os uids do dev
 * a cada gravação, e a invisibilidade era comprada com o estado do torneio.
 *
 * ⭐ ISSO ACABOU: o sandbox mora em `sandboxes/{id}` e a permissão é por `sandboxOwnerUid`.
 * A coleção É o isolamento — nenhum listener de torneio real alcança a coleção, com ou sem
 * os uids reais dentro do documento. Manter estes ramos agora seria o oposto do invariante:
 * a Function copia `memberUids`, `coHosts` e `adminUids` BYTE A BYTE, e a primeira gravação
 * do cliente (um avanço de fase, por exemplo) os apagaria de volta.
 * Ordem do dono: _"não altere creatorUid, adminUids, coHosts ou membership"_.
 *
 * ⚠️ `_isSandboxData` FICA — ele é leitura, não escrita, e é usado como guarda em outros
 * pontos. O que saiu foram os ramos que ESCREVIAM diferente por ser sandbox.
 * ⛔ E não sobrou dado velho pra proteger: varredura de 01/set/2026 — 0 sandboxes legados
 * em `tournaments` pelos quatro marcadores. */
window._isSandboxData = function (data) { return !!(data && data.isSandbox === true); };

// Merge canônico de memberUids no limite de escrita: UNIÃO (nunca encolhe — um uid que só
// existe no denormalizado não pode sumir e derrubar o listener de quem depende dele).
window._mergeMemberUids = function (data, prev, next) {
  var n = Array.isArray(next) ? next : [];
  var p = Array.isArray(prev) ? prev : [];
  return Array.from(new Set(p.concat(n)));
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
  // v1.6.86: A LISTA DE ESPERA TAMBÉM É MEMBRO. Quem está na espera está INSCRITO —
  // só não foi sorteado ainda. Como memberUids é o que o listener usa
  // (`where memberUids array-contains uid`) E o que as rules leem pra decidir
  // participante, ficar de fora significava a pessoa NÃO VER o próprio torneio no app.
  // Antes isso quase não aparecia porque a espera se enchia de gente que JÁ tinha
  // passado por participants (e memberUids nunca encolhe); com a porta nova
  // (fase sorteada → espera) todo inscrito tardio nasceria invisível pra si mesmo.
  // Medido em produção antes de mexer: 14 entradas de espera com uid, 1 já estava
  // fora do memberUids (BT Corpus Christi) — este ramo também cura esse caso.
  var pools = [
    Array.isArray(data.participants) ? data.participants : [],
    Array.isArray(data.standbyParticipants) ? data.standbyParticipants : [],
    Array.isArray(data.waitlist) ? data.waitlist : []
  ];
  pools.forEach(function(parts) {
    parts.forEach(function(p) {
      if (!p || typeof p === 'string') return;
      push(p.uid);
      // Dupla formada: p1Uid e p2Uid
      push(p.p1Uid); push(p.p2Uid);
      if (Array.isArray(p.participants)) {
        p.participants.forEach(function(sub) { if (sub) push(sub.uid); });
      }
    });
  });
  return Object.keys(set);
};
