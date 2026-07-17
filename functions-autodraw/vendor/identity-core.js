/* identity-core.js — CÂNONE DE IDENTIDADE POR UID (extraído do store.js em jul/2026)
 *
 * IDENTIDADE = uid em TODO mapa por-pessoa do torneio (checkedIn / absent / vips).
 * Regra do dono (jun/2026): "sempre identifica pelo uid. vips, checkin, ausente e
 * enquete inclusive." Ver [[project_id_maps_uid_keyed]] / [[project_uid_primary_identity]].
 *
 * POR QUE VIVE NUM ARQUIVO PRÓPRIO (e não mais dentro do store.js):
 * o SORTEIO está sendo canonizado numa Cloud Function — "os cânones rodam em CF,
 * disparados pelo app, pra evitar que cada usuário rode uma versão diferente com app
 * desatualizado" (decisão do dono, jul/2026). O motor de sorteio precisa de _entryHasVip
 * e dos _idMap*, mas o store.js NÃO carrega no servidor (toca document no load). As duas
 * saídas eram: espelhar as funções no shim da CF (= criar uma 2ª versão do código = exatamente
 * o bug de versão que se quer matar) ou extrair. Extraído. O servidor carrega ESTE arquivo
 * via functions-autodraw/vendor/ (copy-vendor no predeploy) → uma versão só, zero drift.
 *
 * REGRA: este arquivo é PURO — nada de document/AppStore/localStorage/firebase. Se precisar
 * de DOM, não pertence aqui (quebra o carregamento no servidor). Única dep externa tolerada:
 * window._nameForUid (store.js), sempre atrás de `typeof === 'function'` — ausente no servidor.
 *
 * Carregado ANTES do store.js (index.html) e por tests.html / tests-draw-resolution.html /
 * tests/render-harness.js / functions-autodraw. Nada aqui é chamado no load — só definições.
 */
// Helper canônico: retorna TODOS os UIDs de um participante.
// Duplas têm p1Uid/p2Uid além de uid. Garante individualidade.
window._participantUids = function(p) {
  if (typeof p !== 'object' || !p) return [];
  var seen = {};
  var uids = [];
  function _add(u) { if (u && !seen[u]) { seen[u] = true; uids.push(u); } }
  _add(p.uid); _add(p.p1Uid); _add(p.p2Uid);
  if (Array.isArray(p.participants)) p.participants.forEach(function(s) { if (s) _add(s.uid); });
  return uids;
};

// ─────────────────────────────────────────────────────────────────────────────
// IDENTIDADE = uid em TODO mapa por-pessoa do torneio (checkedIn / absent / vips).
// Regra do dono (jun/2026): "sempre identifica pelo uid. vips, checkin, ausente e
// enquete inclusive." Esses mapas eram chaveados por NOME — dois jogadores de
// mesmo nome colidiam no mesmo estado. Agora a chave canônica é o uid da pessoa;
// o nome só vale como FALLBACK (jogador informal sem conta, ou doc legado).
//
// _memberUidByName(t, name): resolve o nome de UMA pessoa para o uid dela dentro
// do torneio — varre solos (p.uid), slots de dupla (p1Name/p1Uid, p2Name/p2Uid),
// sub-participants[], e também espera/standby (pra substitutos resolverem).
// Retorna '' pra jogador informal (sem conta).
window._memberUidByName = function(t, name) {
  if (!t || !name) return '';
  var target = String(name).trim().toLowerCase();
  if (!target) return '';
  var pools = [];
  if (Array.isArray(t.participants)) pools.push(t.participants);
  if (Array.isArray(t.standbyParticipants)) pools.push(t.standbyParticipants);
  if (Array.isArray(t.waitlist)) pools.push(t.waitlist);
  for (var pi = 0; pi < pools.length; pi++) {
    var arr = pools[pi];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (!p || typeof p !== 'object') continue;
      if ((p.displayName || p.name || '').trim().toLowerCase() === target && p.uid) return p.uid;
      if ((p.p1Name || '').trim().toLowerCase() === target && p.p1Uid) return p.p1Uid;
      if ((p.p2Name || '').trim().toLowerCase() === target && p.p2Uid) return p.p2Uid;
      if (Array.isArray(p.participants)) {
        for (var s = 0; s < p.participants.length; s++) {
          var sub = p.participants[s];
          if (sub && (sub.displayName || sub.name || '').trim().toLowerCase() === target && sub.uid) return sub.uid;
        }
      }
    }
  }
  // v4.5.84 (ITEM 3 · Fase 3): 2ª passada por nome VIVO (perfil) — só quando o nome GRAVADO não
  // casou (a passada acima ganha → zero regressão). Resolve a pessoa quando a entrada não tem
  // p1Name/p2Name/displayName gravado (pós-Fase-4). Vazio no autoDraw (sem _nameForUid).
  var _live = (typeof window._nameForUid === 'function') ? window._nameForUid : null;
  if (_live) {
    for (var pi2 = 0; pi2 < pools.length; pi2++) {
      var arr2 = pools[pi2];
      for (var j = 0; j < arr2.length; j++) {
        var q = arr2[j];
        if (!q || typeof q !== 'object') continue;
        if (q.uid && String(_live(q.uid) || '').trim().toLowerCase() === target) return q.uid;
        if (q.p1Uid && String(_live(q.p1Uid) || '').trim().toLowerCase() === target) return q.p1Uid;
        if (q.p2Uid && String(_live(q.p2Uid) || '').trim().toLowerCase() === target) return q.p2Uid;
        if (Array.isArray(q.participants)) {
          for (var s2 = 0; s2 < q.participants.length; s2++) {
            var sub2 = q.participants[s2];
            if (sub2 && sub2.uid && String(_live(sub2.uid) || '').trim().toLowerCase() === target) return sub2.uid;
          }
        }
      }
    }
  }
  return '';
};

// _memberNameByUid(t, uid): reverso de _memberUidByName — dado um uid, devolve o
// displayName da pessoa dentro do torneio. Usado pra "traduzir" chaves uid de
// volta pra nome quando o consumidor precisa cruzar com a CHAVE (m.p1/m.p2, que
// são nomes — camada do bracket, Parte 8). Retorna '' se o uid não bate ninguém
// (ex.: a chave do mapa já é um nome legado, não um uid).
window._memberNameByUid = function(t, uid) {
  if (!t || !uid) return '';
  var pools = [];
  if (Array.isArray(t.participants)) pools.push(t.participants);
  if (Array.isArray(t.standbyParticipants)) pools.push(t.standbyParticipants);
  if (Array.isArray(t.waitlist)) pools.push(t.waitlist);
  for (var pi = 0; pi < pools.length; pi++) {
    var arr = pools[pi];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (!p || typeof p !== 'object') continue;
      if (p.uid === uid) return p.displayName || p.name || '';
      if (p.p1Uid === uid) return p.p1Name || '';
      if (p.p2Uid === uid) return p.p2Name || '';
      if (Array.isArray(p.participants)) {
        for (var s = 0; s < p.participants.length; s++) {
          var sub = p.participants[s];
          if (sub && sub.uid === uid) return sub.displayName || sub.name || '';
        }
      }
    }
  }
  return '';
};

// _idMapKey(t, who): chave canônica {uid, name} de UMA pessoa. `who` pode ser
// string (nome — resolve via varredura) OU objeto de pessoa única (usa who.uid).
// NÃO use objeto de DUPLA aqui (dois uids) — os mapas são por-pessoa; readers
// iteram indivíduos decompostos.
window._idMapKey = function(t, who) {
  if (who && typeof who === 'object') {
    return { uid: who.uid || '', name: (who.displayName || who.name || '') };
  }
  var nm = String(who == null ? '' : who);
  return { uid: window._memberUidByName(t, nm), name: nm };
};
// Leitura: uid-key primeiro, nome só fallback (legado/informal). Retorna o valor
// cru armazenado (ex.: Date.now()) pra ordenação por timestamp continuar valendo.
window._idMapGet = function(t, map, who) {
  if (!map || who == null) return undefined;
  var k = window._idMapKey(t, who);
  if (k.uid && map[k.uid] != null) return map[k.uid];
  return k.name ? map[k.name] : undefined;
};
window._idMapHas = function(t, map, who) { return !!window._idMapGet(t, map, who); };
// Escrita: chaveia por uid quando há conta; migra (apaga a chave-nome legada).
// Jogador informal (sem uid) continua por nome.
window._idMapSet = function(t, map, who, val) {
  if (!map || who == null) return;
  var k = window._idMapKey(t, who);
  if (k.uid) { map[k.uid] = val; if (k.name && k.name !== k.uid && map[k.name] != null) delete map[k.name]; }
  else if (k.name) map[k.name] = val;
};
window._idMapDel = function(t, map, who) {
  if (!map || who == null) return;
  var k = window._idMapKey(t, who);
  if (k.uid && map[k.uid] != null) delete map[k.uid];
  if (k.name && map[k.name] != null) delete map[k.name];
};

// _entryHasVip(t, entry): VIP é flag de ENTRADA (qualquer membro VIP → entrada
// VIP), armazenada por uid de cada membro (ver _toggleVip). Aceita objeto
// (solo/dupla — usa _participantUids) OU string ("A / B" = time → resolve cada
// membro; ou nome solo). Nome só fallback legado. Unifica todos os readers de VIP.
window._entryHasVip = function(t, entry) {
  if (!t || !t.vips || entry == null) return false;
  var vips = t.vips;
  if (typeof entry === 'object') {
    var uids = (typeof window._participantUids === 'function') ? window._participantUids(entry) : (entry.uid ? [entry.uid] : []);
    for (var i = 0; i < uids.length; i++) { if (vips[uids[i]]) return true; }
    var nm = entry.displayName || entry.name || '';
    return nm ? !!vips[nm] : false;
  }
  var s = String(entry);
  var members = s.indexOf('/') !== -1 ? s.split('/').map(function(x){ return x.trim(); }).filter(Boolean) : [s];
  for (var j = 0; j < members.length; j++) {
    var u = window._memberUidByName(t, members[j]);
    if (u && vips[u]) return true;
    if (vips[members[j]]) return true; // fallback nome legado
  }
  return false;
};

// ── Detecção CANÔNICA de dupla/time (movida do store.js em jul/2026) ─────────
// Vive aqui porque o SORTEIO roda no servidor e _formDoublesTeams chama esta função
// (vendor/tournaments-draw.js:347). Ficou faltando na 1ª leva do identity-core e o
// sorteio inicial do servidor ESTOURAVA em qualquer torneio de duplas — pego pelo
// teste cliente×servidor (test-drawinitial.js, caso "Fase de Grupos · duplas").
// Ver project_dupla_entry_structural_not_slash / project_count_people_not_entries.
// v3.0.x: detecção CANÔNICA de dupla/time. Retorna a lista de membros (nomes, só p/
// exibição/contagem) quando p é uma ENTRADA DE TIME; null se é individual.
//
// PRINCÍPIO (regra do dono, gravada): uma DUPLA é definida pelos DOIS SLOTS (p1 e p2)
// ocupados — slot ocupado = uid (identidade real) OU, só pra jogador INFORMAL sem conta,
// o nome do slot. A identidade interna é SEMPRE o uid quando existe; o nome é só exibição.
// O '/' num displayName é PURAMENTE exibição ("Kelly / Rodrigo") e NUNCA define dupla.
// Uma string solta também nunca é dupla. (lista participants[] cobre o formato de array.)
window._entryTeamMembers = function (p) {
  if (!p || typeof p !== 'object') return null; // string/individual — '/' é só exibição
  if (Array.isArray(p.participants) && p.participants.length) {
    return p.participants.map(function (s) { return (s && (s.displayName || s.name)) || String(s || ''); }).filter(Boolean);
  }
  var hasP1 = !!(p.p1Uid || p.p1Name); // slot 1 ocupado: uid (real) ou nome (informal)
  var hasP2 = !!(p.p2Uid || p.p2Name); // slot 2 ocupado
  if (hasP1 && hasP2) {
    return [p.p1Name || p.p1Uid || '', p.p2Name || p.p2Uid || ''];
  }
  return null;
};

// ── ITEM 3 · Fase 4 (v4.5.85): SANITIZADOR DE IDENTIDADE NA PERSISTÊNCIA ──────────
// Identidade de um inscrito = uid; o nome é resolvido do perfil VIVO (users/{uid}) em
// TODA borda de display/sorteio/authz (Partes 0–13 + Fases 1–3). Logo, NÃO se grava o
// nome na entrada de quem TEM conta — o campo gravado só apodrece e vira o "Maira/Maira".
// Guest SEM conta (sem uid no slot) MANTÉM o nome: é a única identidade que ele tem.
// Este helper roda no LIMITE DE PERSISTÊNCIA (firebase-db.js), SEMPRE sobre a CÓPIA que
// vai pro Firestore — NUNCA muta o objeto em memória (display em sessão segue intacto).
// Só toca os campos de nome da ENTRADA (name/displayName/p1Name/p2Name + sub-participants);
// NÃO toca slots de partida (m.p1/m.p2) nem nada fora de participants/standby/waitlist.
function _stripUidEntryNames(p) {
  if (!p || typeof p !== 'object') return p;
  var q = {}; for (var k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) q[k] = p[k]; }
  // v4.5.91: PLACEHOLDER (vaga "Jogador NN") NÃO é conta — nome É a identidade. Placeholders
  // legados nasceram com uid sintético 'jog_NN_…' + email fake, e o strip abaixo apagava o
  // nome (achando que tinha conta) → card virava o email. Aqui CURA pro formato limpo (só
  // nome, sem uid/email) em vez de strippar; na próxima gravação some o uid fantasma.
  var _phUid = q.uid && String(q.uid).indexOf('jog_') === 0;
  if ((_phUid || q.isPlaceholder === true) && !q.p1Name && !q.p2Name) {
    var _m = _phUid ? String(q.uid).match(/^jog_(\d+)/) : null;
    var _cur = String(q.displayName || q.name || '').trim();
    var _nm = /^(Jogador|Placeholder)\s+\d+$/i.test(_cur) ? _cur : (_m ? ('Jogador ' + _m[1]) : '');
    if (_nm) { q.name = _nm; q.displayName = _nm; }
    q.isPlaceholder = true;
    if (_phUid) delete q.uid;
    if (q.email && /^jogador\d+@scoreplace\.app$/i.test(String(q.email))) delete q.email;
    return q;
  }
  // v1.2.2: só stripa o nome de quem TEM perfil RESOLVÍVEL. O strip apagava o nome de todo
  // uid, apostando que users/{uid} sempre estaria lá pra devolvê-lo. Quando a pessoa recria a
  // conta (uid novo) o users/ do uid velho some — e a inscrição, já stripada, fica SEM NENHUMA
  // âncora de nome: o resolvedor caía no uid cru, e o sorteio gravava esse uid como nome
  // (Ranking/staging, jul/2026). Sem perfil, o nome gravado é a ÚNICA identidade que resta —
  // preservá-lo é o mesmo princípio que já vale pro guest. Não reintroduz o "Maira/Maira":
  // o display SEMPRE prefere o perfil vivo, e o nome gravado só entra quando não há perfil.
  // Cache frio no save → preserva o nome (conservador); nunca apaga o que não sabe repor.
  // Ver [[project_orphan_uid_entries]] / [[project_uid_primary_identity]].
  var _resolves = function (u) {
    return !!(u && typeof window._nameForUid === 'function' && window._nameForUid(u));
  };
  var isPair = !!(q.p1Uid || q.p2Uid || q.p1Name || q.p2Name);
  if (isPair) {
    if (_resolves(q.p1Uid)) delete q.p1Name;   // membro 1 tem perfil → nome vem de lá
    if (_resolves(q.p2Uid)) delete q.p2Name;   // membro 2 tem perfil → idem
    // name/displayName da dupla é o teamString derivado ("A / B") → o display reconstrói
    // via _entryDisplayName (p1Uid vivo / p2Uid vivo / p*Name só do guest). Remove sempre
    // que ao menos um membro tem perfil (o outro, se guest/órfão, resolve pelo p*Name mantido).
    if (_resolves(q.p1Uid) || _resolves(q.p2Uid)) { delete q.name; delete q.displayName; }
  } else if (_resolves(q.uid)) {               // solo com perfil
    delete q.name; delete q.displayName;
  }
  if (Array.isArray(q.participants)) {
    q.participants = q.participants.map(function (s) {
      if (s && typeof s === 'object' && _resolves(s.uid)) {
        var r = {}; for (var kk in s) { if (Object.prototype.hasOwnProperty.call(s, kk)) r[kk] = s[kk]; }
        delete r.name; delete r.displayName; return r;
      }
      return s;
    });
  }
  return q;
}
// Retorna CÓPIA do array com cada entrada sanitizada (entrada sem uid = guest, intacta).
window._stripStoredNamesForUidEntries = function (arr) {
  return Array.isArray(arr) ? arr.map(_stripUidEntryNames) : arr;
};
