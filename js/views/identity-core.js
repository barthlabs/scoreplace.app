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
// ⚡ v2.0.78 — ÍNDICE, não varredura. MEDIDO no render REAL da tela inicial com os
// 28 torneios da base: `_memberUidByName` era chamada 58 vezes e disparava ~8.000
// resoluções de nome (8.959 no total do render) — 54% de toda a CPU do desenho
// (`_memberUidByName` 25,6% + `_nameForUid` 22,9% + `_idMapKey` 5,8%).
//
// A causa é a 2ª passada: ela resolve o nome VIVO de CADA entrada a cada chamada. E
// ela roda SEMPRE em torneio real, porque `_stripUidEntryNames` apaga o nome de toda
// entrada cujo uid resolve — medido no Confra: 111 entradas, 111 com uid, ZERO com
// nome. Ou seja, a passada barata nunca casa e a cara varre tudo, toda vez.
//
// É a MESMA forma do O(n²) que fazia a chave levar 925ms no iPhone
// ([[project_render_on2_resolucao_de_nome]]) — e a cura é a mesma do `_sideIndex`:
// montar o mapa nome→uid UMA vez por (torneio × época do cache de perfis).
//
// ⛔ A SEMÂNTICA NÃO MUDA:
//   · nome GRAVADO tem precedência sobre nome VIVO (era passada 1 antes da 2);
//   · dentro de cada passada, a PRIMEIRA entrada que casa vence (era o `return`);
//   · a ordem das piscinas e dos campos é a mesma (participants → standby → waitlist;
//     displayName/name → p1Name → p2Name → sub-participants);
//   · entrada sem uid (jogador informal) continua devolvendo ''.
// ⚠️ A 2ª passada é PREGUIÇOSA: só é montada quando a busca erra no mapa dos nomes
// gravados. Sem isso, torneio que AINDA tem nome gravado pagaria uma varredura que
// antes não pagava.
// ⚠️ A época vem de `_bumpProfileEpoch`, que é bumpada UMA vez por perfil resolvido e
// não por escrita — invalidar por documento foi o que causou a travada de 20s da
// 2.0.63. Não trocar isso sem medir.
var _mubnIdx = (typeof WeakMap === 'function') ? new WeakMap() : null;

function _mubnPools(t) {
  var pools = [];
  if (Array.isArray(t.participants)) pools.push(t.participants);
  if (Array.isArray(t.standbyParticipants)) pools.push(t.standbyParticipants);
  if (Array.isArray(t.waitlist)) pools.push(t.waitlist);
  return pools;
}

function _mubnCache(t) {
  var epoca = (window._profileEpoch || 0);
  var pools = _mubnPools(t);
  var n = 0;
  for (var i = 0; i < pools.length; i++) n += pools[i].length;
  var hit = _mubnIdx && _mubnIdx.get(t);
  if (hit && hit.epoca === epoca && hit.n === n) return hit;
  var novo = { epoca: epoca, n: n, pools: pools, gravados: null, vivos: null };
  if (_mubnIdx) _mubnIdx.set(t, novo);
  return novo;
}

// Percorre as piscinas na ORDEM original chamando `visita(nome, uid)`. `comoNome`
// decide se o nome vem do campo gravado ou do perfil vivo — as duas passadas
// percorrem exatamente a mesma árvore.
function _mubnVarre(pools, visita, live) {
  for (var pi = 0; pi < pools.length; pi++) {
    var arr = pools[pi];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (!p || typeof p !== 'object') continue;
      if (live) {
        if (p.uid) visita(live(p.uid), p.uid);
        if (p.p1Uid) visita(live(p.p1Uid), p.p1Uid);
        if (p.p2Uid) visita(live(p.p2Uid), p.p2Uid);
      } else {
        visita(p.displayName || p.name, p.uid);
        visita(p.p1Name, p.p1Uid);
        visita(p.p2Name, p.p2Uid);
      }
      if (Array.isArray(p.participants)) {
        for (var s = 0; s < p.participants.length; s++) {
          var sub = p.participants[s];
          if (!sub) continue;
          if (live) { if (sub.uid) visita(live(sub.uid), sub.uid); }
          else visita(sub.displayName || sub.name, sub.uid);
        }
      }
    }
  }
}

function _mubnMapa(pools, live) {
  var mapa = (typeof Map === 'function') ? new Map() : null;
  if (!mapa) return null;
  _mubnVarre(pools, function (nome, uid) {
    if (!uid || !nome) return;
    var k = String(nome).trim().toLowerCase();
    if (k && !mapa.has(k)) mapa.set(k, uid);   // primeiro que chega vence (era o `return`)
  }, live);
  return mapa;
}

window._memberUidByName = function(t, name) {
  if (!t || !name) return '';
  var target = String(name).trim().toLowerCase();
  if (!target) return '';
  var c = _mubnCache(t);
  if (!c.gravados) {
    c.gravados = _mubnMapa(c.pools, null);
    if (!c.gravados) return '';   // ambiente sem Map: não há como indexar
  }
  var achado = c.gravados.get(target);
  if (achado) return achado;
  // v4.5.84 (ITEM 3 · Fase 3): 2ª passada por nome VIVO (perfil) — só quando o nome
  // GRAVADO não casou (a passada acima ganha → zero regressão). Resolve a pessoa
  // quando a entrada não tem p1Name/p2Name/displayName gravado (pós-Fase-4).
  // Vazio no autoDraw (sem _nameForUid).
  var _live = (typeof window._nameForUid === 'function') ? window._nameForUid : null;
  if (!_live) return '';
  if (!c.vivos) c.vivos = _mubnMapa(c.pools, _live);
  return (c.vivos && c.vivos.get(target)) || '';
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
// ─── ⭐ PRESENÇA CADUCA EM 24h — EM TODO O PROGRAMA ─────────────────────────────────
//
// Ordem do dono (23/ago/2026): _"essas presenças estão inconsistentes. uns tem presença
// outros não e não consigo saber porque. Qualquer presença dada deveria caducar depois de
// 24h. Isso deve resolver. Aplique isso sempre. Em todo o programa. Em torneios com rodadas
// de mais de 24h a presença é irrelevante."_ E, corrigindo o meu vocabulário: _"não existe
// marcação de ausência. Todos estão ausentes até marcar presença."_
//
// ⭐ O MODELO, ENTÃO, É UM SÓ: presença é um sinal POSITIVO e PERECÍVEL. Ninguém é marcado
// ausente — quem não tem presença fresca simplesmente não tem presença. `t.absent` NÃO é
// presença: é a máquina do W.O. (`_markAbsent` é o botão "Aplicar W.O."), tem vida própria
// e NÃO caduca aqui. Ver [[project_wo_lives_in_four_places]].
//
// ⛔ POR QUE A VALIDADE MORA NA LEITURA, E NÃO NUMA VARREDURA QUE APAGA: apagar exigiria
// alguém rodando a varredura na hora certa em todo dispositivo — e o que não rodou mente.
// Filtrando na leitura, a presença vence sozinha, no relógio de quem lê, sem escrita
// nenhuma. O dado gravado fica como está; o que muda é o que o programa ENXERGA.
//
// ⛔ E POR QUE AQUI DENTRO DO `_idMapGet`: este é o leitor ÚNICO de todo mapa por-pessoa do
// torneio. Pendurar a validade nele faz TODO leitor de presença herdar a regra — inclusive
// os que eu não conheço e os que ainda vão nascer. Espalhar `Date.now() - ts < 24h` pelos
// call sites seria garantir que o próximo esqueça. [[feedback_resolution_one_logic]]
//
// Este arquivo é vendorado pra CF (copy-vendor), então o SERVIDOR aplica a mesma validade —
// o sorteio "só entre os presentes" não pode ver presença de ontem. [[project_canon_runs_on_server]]
window._PRESENCA_TTL_MS = 24 * 60 * 60 * 1000;
// Mapas que são PRESENÇA (caducam). `absent` fica fora de propósito — é W.O., não presença.
window._PRESENCA_MAPS = ['checkedIn', 'checkedInConfirmed'];
// Um valor de presença ainda vale? O valor gravado é `Date.now()` desde sempre.
// ⚠️ Valor SEM carimbo utilizável (true, 1, string vazia — formas legadas e de teste) conta
// como VENCIDO: presença sem hora não dá pra provar que é de hoje, e o dono pediu que o que
// não se sabe não seja exibido como presente.
window._presencaFresca = function (val, agora) {
  if (val == null || val === false) return false;
  // string pode ser carimbo numérico ("1787512345678") OU data ISO — as duas formas
  // existem em doc antigo, e `Date.parse` não entende a primeira.
  var ts = NaN;
  if (typeof val === 'number') ts = val;
  else if (typeof val === 'string') { ts = /^\d+$/.test(val.trim()) ? Number(val) : Date.parse(val); }
  if (!(ts > 946684800000)) return false;            // < ano 2000 = não é carimbo de verdade
  return ((agora || Date.now()) - ts) < window._PRESENCA_TTL_MS;
};
// `map` é um dos mapas de presença DESTE torneio? (comparação por REFERÊNCIA — é o que
// distingue `t.checkedIn` de `t.absent`/`t.vips` sem o chamador precisar dizer nada.)
window._ehMapaDePresenca = function (t, map) {
  if (!t || !map) return false;
  for (var i = 0; i < window._PRESENCA_MAPS.length; i++) {
    if (t[window._PRESENCA_MAPS[i]] === map) return true;
  }
  return false;
};
// Cópia do mapa de presença SÓ com o que ainda vale — pra quem conta, itera ou faz
// Object.keys (o `_idMapGet` cuida de quem consulta UMA pessoa).
// `qual` default 'checkedIn'. Devolve SEMPRE um objeto novo: ninguém escreve no filtrado.
window._presencaViva = function (t, qual) {
  var map = t && t[qual || 'checkedIn'];
  if (!map || typeof map !== 'object') return {};
  var agora = Date.now(), out = {}, ks = Object.keys(map);
  for (var i = 0; i < ks.length; i++) {
    if (window._presencaFresca(map[ks[i]], agora)) out[ks[i]] = map[ks[i]];
  }
  return out;
};

// Leitura: uid-key primeiro, nome só fallback (legado/informal). Retorna o valor
// cru armazenado (ex.: Date.now()) pra ordenação por timestamp continuar valendo.
window._idMapGet = function(t, map, who) {
  if (!map || who == null) return undefined;
  var k = window._idMapKey(t, who);
  var v = (k.uid && map[k.uid] != null) ? map[k.uid] : (k.name ? map[k.name] : undefined);
  if (v == null) return undefined;
  // ⭐ presença vencida = presença que não existe (ver o bloco acima)
  if (window._ehMapaDePresenca(t, map) && !window._presencaFresca(v)) return undefined;
  return v;
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
  // v1.3.52 (dono: "grava SÓ o uid; nome, email, celular, tudo vem do perfil pelo uid"): remove
  // os campos de PERFIL das entradas com uid — são resolvidos por uid no display (cliente) E no
  // sorteio/notificação (CF _enrichParticipantsFromProfiles, deployada). NÃO se toca: uid,
  // enrollSeq, category/categories/categorySource (atribuição do TORNEIO, não perfil),
  // ligaActive, selfEnrolled, addedAt, p1Uid/p2Uid. Guest sem uid = intacto (nome é a identidade).
  var _PROFILE_FIELDS = ['email', 'phone', 'gender', 'birthDate', 'skillBySport', 'defaultCategory', 'photoURL'];
  var _delProfile = function (o) { _PROFILE_FIELDS.forEach(function (f) { if (Object.prototype.hasOwnProperty.call(o, f)) delete o[f]; }); };
  var isPair = !!(q.p1Uid || q.p2Uid || q.p1Name || q.p2Name);
  if (isPair) {
    if (_resolves(q.p1Uid)) { delete q.p1Name; delete q.p1Gender; }   // membro 1 tem perfil → vem de lá
    if (_resolves(q.p2Uid)) { delete q.p2Name; delete q.p2Gender; }   // membro 2 tem perfil → idem
    // name/displayName da dupla é o teamString derivado ("A / B") → o display reconstrói
    // via _entryDisplayName (p1Uid vivo / p2Uid vivo / p*Name só do guest). Remove sempre
    // que ao menos um membro tem perfil (o outro, se guest/órfão, resolve pelo p*Name mantido).
    if (_resolves(q.p1Uid) || _resolves(q.p2Uid)) { delete q.name; delete q.displayName; _delProfile(q); }
  } else if (_resolves(q.uid)) {               // solo com perfil
    delete q.name; delete q.displayName; _delProfile(q);
  }
  if (Array.isArray(q.participants)) {
    q.participants = q.participants.map(function (s) {
      if (s && typeof s === 'object' && _resolves(s.uid)) {
        var r = {}; for (var kk in s) { if (Object.prototype.hasOwnProperty.call(s, kk)) r[kk] = s[kk]; }
        delete r.name; delete r.displayName; _delProfile(r); return r;
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

// ── CURA DO RÓTULO CRU NOS JOGOS (v1.4.30) — POR QUE O BUG "FICAVA VOLTANDO" ────────
// O roster é só-uid, mas o motor grava o NOME resolvido como texto em m.p1/m.p2 (e
// team1/team2 no Rei/Rainha). Todo caminho que cria jogo (sorteio, integração tardia,
// W.O., lower bracket…) depende do cache de perfis estar quente NAQUELE instante —
// qualquer corrida persistia "Jogador sem perfil (xxxx)" como identidade. Em vez de
// caçar caminho por caminho (3ª encarnação do bug em jul/2026), a cura roda no CHOKE
// POINT: saveTournament chama isto em TODO save → o rótulo não sobrevive a nenhum save
// feito com o perfil resolvível. Complementa _healOrphanLabels (render do bracket), que
// busca perfis que faltam. Puro: usa window._nameForUid só se existir (servidor: no-op).
window._cureRawMatchLabels = function (t) {
  if (!t || typeof window._nameForUid !== 'function') return 0;
  var RE = /jogador sem perfil \(/i;
  var ms = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (t && t.matches) || [];
  var n = 0;
  (ms || []).forEach(function (m) {
    if (!m) return;
    [['p1', 'team1Uids', 'team1'], ['p2', 'team2Uids', 'team2']].forEach(function (par) {
      var uids = m[par[1]];
      if (!Array.isArray(uids) || !uids.length) return;
      if (RE.test(String(m[par[0]] || ''))) {
        var nomes = uids.map(function (u) { return window._nameForUid(u); });
        if (nomes.length && nomes.every(Boolean)) { m[par[0]] = nomes.join(' / '); n++; }
      }
      // Rei/Rainha: team1[i] ↔ team1Uids[i] (nomes individuais, casados por índice)
      var arr = m[par[2]];
      if (Array.isArray(arr)) arr.forEach(function (nm, i) {
        if (RE.test(String(nm || '')) && uids[i]) { var v = window._nameForUid(uids[i]); if (v) { arr[i] = v; n++; } }
      });
    });
  });
  return n;
};
