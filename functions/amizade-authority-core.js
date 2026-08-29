/* ═══ AMIZADE: A AUTORIDADE ════════════════════════════════════════════════════
 *
 * POR QUE ESTE MÓDULO EXISTE (achado na auditoria externa da 2.1.47, 29/ago/2026):
 *
 *   `firestore.rules:639` permitia `|| isFriendArrayDiff()` — QUALQUER autenticado
 *   escrevia `friends` / `friendRequestsSent` / `friendRequestsReceived` no perfil de
 *   QUALQUER pessoa. A regra perguntava só "quais chaves mudaram?", nunca "quem está
 *   mudando?". E `statsVisibleToCaller` (rules:564) decidia leitura com
 *   `request.auth.uid in u.get('friends')`.
 *
 *   ⇒ ESCALADA COMPLETA, do console do navegador, com a chave web que já é pública:
 *       1. vítima escolhe statsVisibility = 'friends'
 *       2. atacante escreve users/{vítima}.friends = [uidDoAtacante]   ← a regra passava
 *       3. statsVisibleToCaller devolve true → atacante lê as estatísticas
 *
 * ⛔ É A MESMA CLASSE do sequestro por `mergedInto` já corrigido nesta base, e a lição
 *    está escrita no próprio firestore.rules:581:
 *      "Um campo que o servidor TRATA COMO PROVA nunca pode ser escrito por quem ele
 *       autoriza."
 *    `friends` era prova (decidia leitura) e era gravável por quem ela avaliava.
 *
 * ─── O DESENHO (ordem do dono, 29/ago/2026) ───────────────────────────────────
 *
 *   friendships/{pairId}                    ← RELAÇÃO CANÔNICA, um doc por par
 *     { uidA, uidB, status, requestedBy, createdAt, acceptedAt }
 *
 *   friendAccess/{uid}/accepted/{friendUid} ← PROJEÇÃO PRA AS RULES, server-only
 *     existe(doc) ⟺ amizade ACEITA entre uid e friendUid
 *
 * ⭐ POR QUE DUAS ESTRUTURAS E NÃO UMA: as Rules não sabem ordenar dois uids pra montar
 *    o `pairId` — `statsVisibleToCaller` precisaria adivinhar se é `a__b` ou `b__a`.
 *    A projeção dirigida responde com UM `exists()` sem ramificação. A relação canônica
 *    continua sendo o `friendships/{pairId}`; `friendAccess` é read model derivado dela,
 *    escrito só pelo servidor, nas DUAS direções.
 *
 * ⛔ `users.friends` NÃO É MAIS AUTORIDADE. Ele vira cache de exibição (as telas de
 *    presença/venues/explore leem dele) e entrou em `privilegedUserFields()` — nem o
 *    dono do próprio perfil escreve mais por cliente. Quem escreve é só o Admin SDK.
 *
 * Puro: sem Firestore, sem DOM, sem relógio (o `agora` entra por parâmetro). Roda em Node
 * e no browser. Testado em functions/test-amizade-authority-core.js.
 */
'use strict';

/* ── pairId canônico ──────────────────────────────────────────────────────────
 * Ordem lexicográfica dos dois uids. O MESMO par sempre dá o MESMO id, venha de quem
 * vier — é isso que impede duas relações concorrentes pro mesmo par (A convida B
 * enquanto B convida A). */
var LEGACY = 'legacy_unverified';

function pairId(uid1, uid2) {
  var a = String(uid1 || ''), b = String(uid2 || '');
  if (!a || !b) throw new Error('pairId exige dois uids');
  if (a === b) throw new Error('pairId: uids iguais');
  return (a < b) ? (a + '__' + b) : (b + '__' + a);
}

/* Devolve os dois uids na ordem canônica. */
function parOrdenado(uid1, uid2) {
  var a = String(uid1 || ''), b = String(uid2 || '');
  return (a < b) ? { uidA: a, uidB: b } : { uidA: b, uidB: a };
}

/* ── A MÁQUINA DE ESTADOS ─────────────────────────────────────────────────────
 * Estados: (inexistente) | pending | accepted | rejected
 *
 * ⭐ `rejected` NÃO é o fim: um convite recusado volta a `pending` se a pessoa convidar
 * de novo. Apagar o doc na recusa também funcionaria, mas perderia o rastro — e rastro
 * de quem recusou quem é exatamente o tipo de coisa que a gente vai querer ter medido
 * antes de decidir qualquer política de bloqueio.
 *
 * ⛔ Não existe transição que um NÃO-PARTICIPANTE do par possa disparar. Toda decisão
 * abaixo confere `ator` contra os uids da relação. É a trava que faltava.
 *
 * Devolve { ok:true, doc, acesso } ou { ok:false, erro, codigo }.
 *   `acesso` diz o que fazer com a projeção: 'criar' | 'apagar' | 'nada'.
 */
function decidir(acao, atual, ator, alvo, agora) {
  var A = String(acao || '');
  var at = String(ator || ''), av = String(alvo || '');
  if (!at || !av) return _nao('uids obrigatórios', 'invalid-argument');
  if (at === av) return _nao('não dá pra ser amigo de si mesmo', 'invalid-argument');

  var par = parOrdenado(at, av);
  var st = atual && atual.status ? String(atual.status) : null;

  // O ator PRECISA ser um dos dois. Sem isto, volta o buraco.
  if (atual && atual.uidA && atual.uidB) {
    if (at !== atual.uidA && at !== atual.uidB) {
      return _nao('só quem faz parte da relação pode alterá-la', 'permission-denied');
    }
  }

  if (A === 'enviar') {
    if (st === 'accepted') return _nao('já são amigos', 'failed-precondition');
    /* ⭐ RECONFIRMAÇÃO (4ª auditoria): relação `legacy_unverified` não concede nada, mas o
     * par existe. Convidar sobre ela é exatamente o caminho de reconfirmação — vira
     * `pending`, e só o aceite do OUTRO lado, pela autoridade nova, gera `friendAccess`.
     * O carimbo `legacyOrigem` fica no doc antigo e não viaja: o novo estado é novo. */
    if (st === LEGACY) {
      return _sim(_doc(par, 'pending', at, (atual && atual.createdAt) || agora, null), 'nada', 'reconfirmacao-enviada');
    }
    if (st === 'pending') {
      // Convite CRUZADO: B convida A enquanto A já convidou B ⇒ vira amizade.
      // (o fluxo antigo chamava isso de "auto-accepted" e vivia no cliente)
      if (atual.requestedBy && atual.requestedBy !== at) {
        return _sim(_doc(par, 'accepted', atual.requestedBy, atual.createdAt, agora), 'criar', 'auto-aceito');
      }
      return _nao('convite já enviado', 'failed-precondition');
    }
    // inexistente ou rejected → pending
    return _sim(_doc(par, 'pending', at, (atual && atual.createdAt) || agora, null), 'nada', 'enviado');
  }

  if (A === 'aceitar') {
    if (st !== 'pending') return _nao('não há convite pendente', 'failed-precondition');
    // Só quem RECEBEU aceita. Quem enviou não pode aceitar o próprio convite.
    if (atual.requestedBy === at) return _nao('quem envia não aceita o próprio convite', 'permission-denied');
    return _sim(_doc(par, 'accepted', atual.requestedBy, atual.createdAt, agora), 'criar', 'aceito');
  }

  if (A === 'recusar') {
    if (st !== 'pending') return _nao('não há convite pendente', 'failed-precondition');
    if (atual.requestedBy === at) return _nao('quem envia não recusa; cancela', 'permission-denied');
    return _sim(_doc(par, 'rejected', atual.requestedBy, atual.createdAt, null), 'nada', 'recusado');
  }

  if (A === 'cancelar') {
    if (st !== 'pending') return _nao('não há convite pendente', 'failed-precondition');
    if (atual.requestedBy !== at) return _nao('só quem enviou cancela', 'permission-denied');
    return _sim(null, 'nada', 'cancelado');   // doc some: o convite nunca existiu de fato
  }

  if (A === 'remover') {
    // remover vale também sobre `legacy_unverified`: a pessoa pode descartar um par antigo
    // sem precisar reconfirmá-lo antes.
    if (st !== 'accepted' && st !== LEGACY) return _nao('não são amigos', 'failed-precondition');
    return _sim(null, 'apagar', 'removido');  // qualquer um dos dois desfaz
  }

  return _nao('ação desconhecida: ' + A, 'invalid-argument');
}

function _doc(par, status, requestedBy, createdAt, acceptedAt) {
  return {
    uidA: par.uidA, uidB: par.uidB,
    status: status,
    requestedBy: String(requestedBy || ''),
    createdAt: createdAt || null,
    acceptedAt: acceptedAt || null
  };
}
function _sim(doc, acesso, evento) { return { ok: true, doc: doc, acesso: acesso, evento: evento }; }
function _nao(erro, codigo) { return { ok: false, erro: erro, codigo: codigo || 'failed-precondition' }; }

/* ── BACKFILL: users.friends (legado) → friendships, SEM CONCEDER NADA ────────
 *
 * ⛔ A REGRA DEFINITIVA (4ª auditoria externa, 29/ago/2026) — e ela DERRUBA a versão
 * anterior deste módulo, que promovia amizade recíproca antiga direto pra `accepted`:
 *
 *   RECIPROCIDADE NO LEGADO NÃO É PROVA.
 *
 *   `users.friends`, `friendRequestsSent` e `friendRequestsReceived` eram graváveis
 *   CROSS-USER por qualquer autenticado. Quem explorava a falha podia escrever OS DOIS
 *   LADOS — reciprocidade é exatamente o que um atacante produziria pra parecer legítimo.
 *   Migrar recíproco pra `accepted` seria transformar dado potencialmente adulterado em
 *   AUTORIZAÇÃO PERMANENTE. Falhar fechado é a escolha certa.
 *
 * ⇒ Nada do legado gera `friendAccess`. NADA. `acessos` volta sempre vazio.
 *   · recíproca            → `legacy_unverified` (relação existe, não concede leitura)
 *   · unilateral           → QUARENTENA (nem relação)
 *   · convite (qualquer)   → `legacy_unverified` também: sent/received tinham o MESMO furo
 *
 * Pra virar `accepted` só existem dois caminhos, e os dois estão fora deste módulo:
 *   A. reconfirmação pela autoridade nova, DEPOIS do congelamento das Rules (as callables);
 *   B. adjudicação administrativa com evidência INDEPENDENTE do array vulnerável.
 *
 * ⭐ UX da reconfirmação: `legacy_unverified` fica fora dos quatro campos de cache (não é
 *   amizade aceita nem convite pendente), mas o par continua legível em
 *   `friendships/{pairId}` pelas duas pessoas — é dali que a tela de "reconfirmar seus
 *   amigos" lê. Ninguém perde o registro; o que se perde é o ACESSO automático.
 *
 * `perfis` é um mapa uid → {friends, friendRequestsSent, friendRequestsReceived}, já com
 * identidade resolvida pelo chamador (ver scripts/backfill-amizade.js). Puro.
 */
function planejarBackfill(perfis, agora) {
  var vistos = {}, relacoes = [], quarentena = [];
  var uids = Object.keys(perfis || {});

  function _l(v) { return Array.isArray(v) ? v.filter(function (x) { return x != null && x !== ''; }).map(String) : []; }
  function _tem(uid, campo, valor) {
    return perfis[uid] && _l(perfis[uid][campo]).indexOf(valor) !== -1;
  }

  // 1) AMIZADES — recíproca vira LEGACY_UNVERIFIED (sem acesso), unilateral vai pra quarentena.
  uids.forEach(function (uid) {
    _l(perfis[uid].friends).forEach(function (outro) {
      if (outro === uid) return;
      var id;
      try { id = pairId(uid, outro); } catch (e) { return; }
      if (vistos[id]) return;
      vistos[id] = true;
      var par = parOrdenado(uid, outro);

      if (!_tem(outro, 'friends', uid)) {
        quarentena.push({
          id: id, tipo: 'amizade-unilateral', bloqueia: true,
          afirmadoPor: uid, ausenteEm: outro,
          motivo: 'afirmação de um lado só num campo que era gravável cross-user'
        });
        return;
      }
      var d = _doc(par, LEGACY, par.uidA, agora, null);
      d.legacyOrigem = 'friends-reciproco';
      d.legacyMigradoEm = agora;
      relacoes.push({ id: id, doc: d });
    });
  });

  // 2) CONVITES — também NÃO são prova; viram legacy_unverified, nunca pending.
  uids.forEach(function (uid) {
    _l(perfis[uid].friendRequestsSent).forEach(function (alvo) {
      if (alvo === uid) return;
      var id;
      try { id = pairId(uid, alvo); } catch (e) { return; }
      if (vistos[id]) {
        quarentena.push({
          id: id, tipo: 'convite-residual', bloqueia: false,
          afirmadoPor: uid, ausenteEm: alvo,
          motivo: 'par já resolvido; convite é resíduo'
        });
        return;
      }
      vistos[id] = true;
      var par = parOrdenado(uid, alvo);
      var consistente = _tem(alvo, 'friendRequestsReceived', uid);
      var d = _doc(par, LEGACY, uid, agora, null);
      d.legacyOrigem = consistente ? 'convite-consistente' : 'convite-inconsistente';
      d.legacyMigradoEm = agora;
      relacoes.push({ id: id, doc: d });
      if (!consistente) {
        quarentena.push({
          id: id, tipo: 'convite-inconsistente', bloqueia: false,
          afirmadoPor: uid, ausenteEm: alvo,
          motivo: 'sent sem received; migrado como legacy_unverified, que não concede nada'
        });
      }
    });
  });

  // ⛔ `acessos` vazio, SEMPRE. Nenhum estado legado concede leitura.
  return { relacoes: relacoes, acessos: [], quarentena: quarentena };
}

/* ── FUSÃO DE CONTAS: oldUid → keepUid ────────────────────────────────────────
 *
 * ⛔ POR QUE ISTO PRECISA SER DEDICADO (achado da auditoria externa, P0-2):
 * a varredura genérica da fusão (`_sweepAllCollectionsByUid`) descobre as coleções com
 * `listCollections()` e troca o uid DENTRO DOS CAMPOS. Em `friendships` isso é corrupção
 * garantida: o par é a CHAVE DO DOCUMENTO (`pairId`), não um campo. O sweep deixaria
 * `uidA = keepUid` num doc cujo id ainda diz `oldUid` — cânone mentindo sobre si mesmo.
 * E `friendAccess/{uid}/accepted/{friendUid}` é SUBCOLEÇÃO: o sweep genérico nem chega lá.
 * Por isso as duas entraram na lista de EXCLUSÃO do sweep (merge-collections-core.js) e o
 * tratamento é este.
 *
 * `relacoes` = TODAS as relações que envolvem oldUid OU keepUid, na forma [{id, doc}].
 * Devolve { escrever, apagar, acessosCriar, acessosApagar }.
 *
 * ⭐ IDEMPOTENTE: rodar de novo depois de aplicado não encontra relação com oldUid e
 * devolve plano vazio.
 */
function planejarMerge(relacoes, oldUid, keepUid) {
  var out = { escrever: [], apagar: [], acessosCriar: [], acessosApagar: [] };
  oldUid = String(oldUid || ''); keepUid = String(keepUid || '');
  if (!oldUid || !keepUid || oldUid === keepUid) return out;

  var porId = {};
  (relacoes || []).forEach(function (r) { if (r && r.id && r.doc) porId[r.id] = r.doc; });

  function _outro(doc, uid) { return doc.uidA === uid ? doc.uidB : doc.uidA; }
  function _envolve(doc, uid) { return doc.uidA === uid || doc.uidB === uid; }
  var PESO = { accepted: 4, pending: 3, legacy_unverified: 2, rejected: 1 };

  var finais = {};   // novoId → doc final
  var apagar = {};

  Object.keys(porId).forEach(function (id) {
    var doc = porId[id];
    if (!_envolve(doc, oldUid)) return;      // relação só do keepUid: fica onde está
    apagar[id] = true;

    var outro = _outro(doc, oldUid);

    // A MESMA PESSOA dos dois lados: as duas contas eram "amigas" entre si. Depois da fusão
    // isso é amizade consigo mesmo — a relação deixa de existir.
    if (outro === keepUid) {
      out.acessosApagar.push({ uid: oldUid, friendUid: keepUid });
      out.acessosApagar.push({ uid: keepUid, friendUid: oldUid });
      return;
    }

    var novoId;
    try { novoId = pairId(keepUid, outro); } catch (e) { return; }
    var par = parOrdenado(keepUid, outro);
    var reqBy = (doc.requestedBy === oldUid) ? keepUid : doc.requestedBy;
    var cand = _doc(par, doc.status, reqBy, doc.createdAt, doc.acceptedAt);

    // COLISÃO: oldUid e keepUid já tinham relação com a MESMA terceira pessoa.
    var existente = finais[novoId] || porId[novoId];
    if (existente) {
      var pe = PESO[existente.status] || 0, pc = PESO[cand.status] || 0;
      if (pe > pc) cand = existente;
      else if (pe === pc) {
        // mesmo estado: fica a mais ANTIGA (a que de fato aconteceu primeiro)
        cand = (existente.createdAt && cand.createdAt && existente.createdAt <= cand.createdAt)
          ? existente : cand;
      }
      if (porId[novoId]) apagar[novoId] = true;   // vai ser reescrito
    }
    finais[novoId] = cand;

    // acesso do uid MORTO some sempre
    out.acessosApagar.push({ uid: oldUid, friendUid: outro });
    out.acessosApagar.push({ uid: outro, friendUid: oldUid });
  });

  Object.keys(finais).forEach(function (id) {
    out.escrever.push({ id: id, doc: finais[id] });
    if (finais[id].status === 'accepted') {
      out.acessosCriar.push({ uid: finais[id].uidA, friendUid: finais[id].uidB });
      out.acessosCriar.push({ uid: finais[id].uidB, friendUid: finais[id].uidA });
    } else {
      // rebaixou (accepted virou pending numa colisão): a projeção não pode sobreviver
      out.acessosApagar.push({ uid: finais[id].uidA, friendUid: finais[id].uidB });
      out.acessosApagar.push({ uid: finais[id].uidB, friendUid: finais[id].uidA });
    }
  });
  Object.keys(apagar).forEach(function (id) { if (!finais[id]) out.apagar.push(id); });

  return out;
}

/* ── EXCLUSÃO DE CONTA ────────────────────────────────────────────────────────
 * Some a relação inteira, as DUAS direções da projeção, e diz de quais caches de terceiros
 * o uid tem que sair. Autoridade órfã é o que não pode sobrar.
 */
function planejarExclusao(relacoes, uid) {
  var out = { apagar: [], acessosApagar: [], cacheRemoverDe: [] };
  uid = String(uid || '');
  if (!uid) return out;
  (relacoes || []).forEach(function (r) {
    if (!r || !r.doc) return;
    var d = r.doc;
    if (d.uidA !== uid && d.uidB !== uid) return;
    var outro = d.uidA === uid ? d.uidB : d.uidA;
    out.apagar.push(r.id);
    out.acessosApagar.push({ uid: uid, friendUid: outro });
    out.acessosApagar.push({ uid: outro, friendUid: uid });
    out.cacheRemoverDe.push(outro);
  });
  return out;
}

/* ── CACHE LEGADO RECONSTRUÍDO A PARTIR DO CÂNONE ─────────────────────────────
 *
 * ⛔ POR QUE NÃO SE FUNDE `friends` POR UNIÃO (P0 da 3ª auditoria):
 * `computeProfileMerge`, o sweep genérico e o `unionArr` do mergePhoneAccount decidiam os
 * quatro campos de amizade UNINDO os dois lados. União não sabe:
 *   · que amigo não pode estar em convite pendente (a invariante);
 *   · que o uid MORTO tem que sumir (ele está nos dois arrays e a união o preserva);
 *   · que ninguém é amigo de si mesmo (depois da fusão, old↔keep vira exatamente isso);
 *   · que relação que deixou de existir tem que sumir do cache.
 * Depois de resolver as RELAÇÕES, o cache não se funde: ele se RECONSTRÓI. O cânone é a
 * única entrada, e o resultado é determinístico.
 *
 * `relacoes` = todas as relações que envolvem `uid`. Devolve os quatro campos, exatos.
 */
function projetarCache(relacoes, uid) {
  uid = String(uid || '');
  var friends = [], enviados = [], recebidos = [], sentAt = {};
  (relacoes || []).forEach(function (r) {
    var d = r && r.doc; if (!d) return;
    if (d.uidA !== uid && d.uidB !== uid) return;
    var outro = d.uidA === uid ? d.uidB : d.uidA;
    if (!outro || outro === uid) return;                 // ⛔ nunca amigo de si mesmo
    if (d.status === 'accepted') {
      if (friends.indexOf(outro) === -1) friends.push(outro);
    } else if (d.status === 'pending') {
      if (d.requestedBy === uid) {
        if (enviados.indexOf(outro) === -1) enviados.push(outro);
        if (d.createdAt) sentAt[outro] = d.createdAt;
      } else {
        if (recebidos.indexOf(outro) === -1) recebidos.push(outro);
      }
    }
    // rejected não aparece em cache nenhum
  });
  // ⛔ a invariante, aplicada na SAÍDA: quem é amigo não fica em convite
  var ehAmigo = {};
  friends.forEach(function (f) { ehAmigo[f] = true; });
  enviados = enviados.filter(function (u) { return !ehAmigo[u]; });
  recebidos = recebidos.filter(function (u) { return !ehAmigo[u]; });
  Object.keys(sentAt).forEach(function (u) { if (ehAmigo[u] || enviados.indexOf(u) === -1) delete sentAt[u]; });
  return {
    friends: friends.sort(),
    friendRequestsSent: enviados.sort(),
    friendRequestsReceived: recebidos.sort(),
    friendRequestsSentAt: sentAt
  };
}

/* Quem teve o cache afetado por uma fusão: os dois uids e TODO terceiro que aparece nas
 * relações tocadas. Sem isto, o terceiro fica com o uid morto no `friends` pra sempre. */
function afetadosPorMerge(plano, oldUid, keepUid) {
  var set = Object.create(null);
  set[String(oldUid)] = true; set[String(keepUid)] = true;
  function _add(d) { if (d) { set[d.uidA] = true; set[d.uidB] = true; } }
  (plano.escrever || []).forEach(function (r) { _add(r.doc); });
  (plano.acessosApagar || []).concat(plano.acessosCriar || []).forEach(function (a) {
    set[a.uid] = true; set[a.friendUid] = true;
  });
  return Object.keys(set);
}

/* ── E-MAIL LEGADO DENTRO DE friends[] / requests ──────────────────────────────
 * ⛔ 3ª auditoria (ponto 4): "contém @" NÃO é um problema só.
 *   (A) doc `users/{email}` — o DOC é keyed por e-mail. Não é uid, não vira identidade,
 *       exige migração explícita. Quem trata é o backfill (aborta).
 *   (B) e-mail DENTRO do array — resíduo do tempo em que a lista guardava e-mail. Aqui dá
 *       pra resolver, e abandonar o backfill inteiro por causa disso era desproporcional.
 *
 * `vivos` = uids VIVOS distintos aos quais aquele e-mail resolve (lápide e sobrevivente já
 * colapsados pela porta da conta viva). A decisão é só esta, e é pura:
 *   exatamente 1 → usa;  0 → quarentena;  2+ → AMBÍGUO, quarentena (nunca escolher um).
 */
function decidirEmailLegado(vivos, candidatosBrutos) {
  var v = Array.isArray(vivos) ? vivos.filter(Boolean) : [];
  var únicos = [];
  v.forEach(function (x) { if (únicos.indexOf(x) === -1) únicos.push(x); });
  if (únicos.length === 1) return { uid: únicos[0], viaEmail: true };
  if (únicos.length === 0) {
    return (candidatosBrutos && candidatosBrutos.length)
      ? { erro: 'email-so-resolve-pra-conta-morta' }   // achou doc, mas nenhum vivo
      : { erro: 'email-sem-conta' };                   // não achou nada
  }
  return { erro: 'email-ambiguo', candidatos: únicos };
}

/* ── O DOCUMENTO DA PROJEÇÃO, NUM LUGAR SÓ ────────────────────────────────────
 * ⛔ 7ª auditoria (ponto 5): havia DOIS formatos. O service e o lifecycle já gravavam
 * `ownerUid`/`friendUid` — que é o que torna a projeção descobrível sem `friendships` —
 * mas o backfill ainda gravava `{ since: AGORA }` puro. Projeção sem esses campos é órfã
 * invisível: o retry após falha parcial não a encontra.
 * Toda criação passa por aqui. Dois formatos é uma questão de tempo até divergirem. */
function docAcesso(ownerUid, friendUid, quando) {
  return { since: quando || null, ownerUid: String(ownerUid), friendUid: String(friendUid) };
}

var API = { pairId: pairId, parOrdenado: parOrdenado, decidir: decidir,
            planejarBackfill: planejarBackfill, planejarMerge: planejarMerge,
            planejarExclusao: planejarExclusao, projetarCache: projetarCache,
            afetadosPorMerge: afetadosPorMerge, decidirEmailLegado: decidirEmailLegado,
            docAcesso: docAcesso };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AmizadeAuthority = API;
