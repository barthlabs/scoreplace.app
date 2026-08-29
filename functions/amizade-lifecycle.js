/* amizade-lifecycle.js — A AMIZADE NO CICLO DE VIDA DE UID (v2.1.48)
 *
 * ⛔ POR QUE É UM MÓDULO E NÃO CÓDIGO SOLTO NO index.js:
 * 1) `index.js` não é `require`-ável em teste (registra onCall e lê secrets no import).
 *    Enquanto isto morava lá, a única prova possível era regex sobre o fonte — e a
 *    auditoria externa recusou, com razão: regex não prova o EFEITO da operação.
 *    Aqui `db` entra por parâmetro e o teste roda contra o emulador de verdade.
 * 2) Havia TRÊS implementações independentes de migração de amizade (`_executeMerge`,
 *    `mergePhoneAccount` e a ramificação rara de `_mergeAccountsKeepOlder` que só gravava
 *    lápide). Três motores decidindo a mesma coisa é a duplicidade de autoridade que
 *    produz recorrência. `amizadeNoMerge` é a porta ÚNICA — todos chamam ela.
 *
 * O QUE A VARREDURA GENÉRICA NÃO PODE FAZER (e por isso `friendships`/`friendAccess`
 * estão na lista de exclusão do merge-collections-core):
 *   · `friendships/{pairId}` — o par é a CHAVE do documento. O sweep troca o uid dentro
 *     dos CAMPOS e deixaria `uidA = keepUid` num doc cujo id ainda diz o uid morto.
 *   · `friendAccess/{uid}/accepted/{fid}` — subcoleção. O sweep nem chega, e a projeção
 *     do uid morto continuaria CONCEDENDO leitura.
 *
 * Regras puras em `amizade-authority-core.js`. Aqui é só I/O, e tudo é idempotente.
 */
'use strict';
const { FieldValue } = require('firebase-admin/firestore');
const _core = require('./amizade-authority-core');
const _fase = require('./amizade-fase');
const _lock = require('./amizade-lock');

/* ═══ AMIZADE NO CICLO DE VIDA DE UID (v2.1.48) ════════════════════════════════
 * A varredura genérica NÃO pode tocar `friendships`/`friendAccess` (elas estão na lista de
 * exclusão do merge-collections-core, com o motivo). Quem trata é isto.
 *   · `friendships/{pairId}` — o par é a CHAVE: rekeyar é apagar e reescrever.
 *   · `friendAccess/{uid}/accepted/{fid}` — subcoleção, DUAS direções por amizade.
 * Ambas idempotentes: rodar de novo sobre o estado já tratado é no-op.
 * Regras em functions/amizade-authority-core.js (planejarMerge / planejarExclusao).
 */
async function relacoesDe(db, uid) {
  const [a, b] = await Promise.all([
    db.collection("friendships").where("uidA", "==", uid).get(),
    db.collection("friendships").where("uidB", "==", uid).get(),
  ]);
  const out = [], vistos = new Set();
  [a, b].forEach((s) => s.forEach((d) => {
    if (vistos.has(d.id)) return;
    vistos.add(d.id); out.push({ id: d.id, doc: d.data() || {} });
  }));
  return out;
}

/* ⛔ O CACHE NÃO SE FUNDE — SE RECONSTRÓI (3ª auditoria, ponto 2).
 * `computeProfileMerge`, o sweep genérico e o `unionArr` do mergePhoneAccount decidiam
 * `friends`/`friendRequests*` por UNIÃO. União preserva o uid MORTO, deixa amigo também
 * como pendente, cria amizade consigo mesmo (old↔keep depois da fusão) e nunca remove
 * resto de relação que deixou de existir. Depois que as RELAÇÕES estão resolvidas, os
 * quatro campos são reescritos a partir delas — `update` com valor EXATO, nunca arrayUnion.
 * Idempotente por construção: mesma entrada canônica ⇒ mesma saída. */
/* ⛔ 4ª auditoria (ponto 5): RETRY DEPOIS DE FALHA PARCIAL.
 * O fluxo é "muda autoridade → commit → reconstrói cache". Se o commit passa e o cache
 * falha (timeout, instância morta), o retry não acha mais o oldUid no cânone — a lista de
 * terceiros a reparar tinha ido embora com ele, e o cache de C ficava com o uid morto pra
 * sempre. Isso não é idempotência, é sorte.
 * ⭐ A saída é DESCOBERTA: a cada execução, procura quem ainda carrega o uid morto nos
 * quatro campos e reconstrói esses também. Não depende de nada ter sobrevivido da execução
 * anterior. É o mesmo caminho no 1º run e no retry.
 * ⚠️ `friendRequestsSentAt` é MAPA — `array-contains` não serve; ele é varrido junto pelos
 * perfis achados pelos outros três, e a projeção o reescreve inteiro de qualquer forma. */
async function cachesContendo(db, uid) {
  const achados = new Set();
  for (const campo of ['friends', 'friendRequestsSent', 'friendRequestsReceived']) {
    try {
      // user-vivo:isento — busca REVERSA por uid (quem carrega este uid no cache), não
      // resolução de identidade. O uid vem do cânone/da fusão, já resolvido; aqui a
      // pergunta é "quem ainda tem esta string na lista?", e a lápide é justamente o que
      // se quer ENCONTRAR pra limpar.
      const s = await db.collection('users').where(campo, 'array-contains', uid).get();
      s.forEach((d) => achados.add(d.id));
    } catch (e) { console.error('[cachesContendo]', campo, e && e.message); throw e; }
  }
  return [...achados];
}

/* `opts.criarSeAusente` — 4ª auditoria (ponto 6): na fusão rara o sobrevivente pode não ter
 * `users/{keepUid}` ainda. Pular deixaria a autoridade apontando pra ele sem projeção
 * nenhuma, e o perfil nasceria depois sem o social. Aqui a projeção mínima é criada: são
 * SÓ os quatro campos derivados do cânone, nada de identidade inventada — diferente do
 * perfil fantasma que a callable recusa, onde o uid vinha do corpo da chamada. */
async function reconstruirCache(db, uids, opts) {
  const alvos = [...new Set((uids || []).map(String).filter(Boolean))];
  let n = 0;
  for (const uid of alvos) {
    const doc = await db.collection("users").doc(uid).get();
    const cache = _core.projetarCache(await relacoesDe(db, uid), uid);
    const campos = {
      friends: cache.friends,
      friendRequestsSent: cache.friendRequestsSent,
      friendRequestsReceived: cache.friendRequestsReceived,
      friendRequestsSentAt: cache.friendRequestsSentAt,
    };
    if (doc.exists) {
      await db.collection("users").doc(uid).update(campos);
    } else if (opts && opts.criarSeAusente) {
      // projeção mínima: só os 4 campos do cânone, mais a marca de que o perfil ainda não
      // existe (quem criar depois faz merge por cima sem apagar isto).
      await db.collection("users").doc(uid).set(
        Object.assign({ _socialProjetadoEm: new Date().toISOString() }, campos), { merge: true });
    } else {
      continue;
    }
    n++;
  }
  console.log("[_reconstruirCacheAmizade]", n, "perfil(is) reescrito(s) a partir do cânone");
  return n;
}

/* ⭐ A PORTA ÚNICA de amizade em QUALQUER fusão (3ª auditoria, ponto 1).
 * `_executeMerge`, `mergePhoneAccount` e as duas ramificações de `_mergeAccountsKeepOlder`
 * — inclusive a rara, em que um dos docs Firestore não existe — chamam ISTO. Não existe
 * segunda implementação de migração de amizade. */
/* ⛔ 6ª auditoria (ponto 4): acha projeção órfã SEM depender de `friendships`.
 * Os dois sentidos: o que o uid POSSUI (`friendAccess/{uid}/accepted/*`) e o que APONTA
 * para ele (collectionGroup por `friendUid`). É isto que torna o retry recuperável quando
 * a relação já sumiu mas a projeção não. */
async function acessosDe(db, uid) {
  const out = [];
  try {
    (await db.collection('friendAccess').doc(uid).collection('accepted').get())
      .forEach((d) => out.push({ uid: uid, friendUid: d.id }));
  } catch (e) { console.error('[acessosDe] próprios:', e && e.message); throw e; }
  try {
    (await db.collectionGroup('accepted').where('friendUid', '==', uid).get()).forEach((d) => {
      const pai = d.ref.parent.parent;
      if (pai && pai.parent && pai.parent.id === 'friendAccess') out.push({ uid: pai.id, friendUid: uid });
    });
  } catch (e) {
    /* ⛔ 7ª auditoria (ponto 6): ISTO ERA UM FALHA-ABERTA. Se a query reversa falha (índice
     * ausente, permissão, indisponibilidade), não dá pra PROVAR que não sobrou projeção
     * órfã — e o código seguia, e a pós-condição declarava sucesso sobre uma verificação
     * que não aconteceu. Uma prova que não rodou não é prova. A operação falha. */
    console.error('[acessosDe] busca reversa FALHOU — não dá pra provar ausência de órfã:', e && e.message);
    const err = new Error('[amizade] não foi possível verificar friendAccess reverso de ' + uid +
      ': ' + (e && e.message) + ' — a operação não pode declarar limpeza sem essa prova');
    err.causa = e;
    throw err;
  }
  const vistos = new Set(); const uniq = [];
  out.forEach((a) => { const k = a.uid + '/' + a.friendUid; if (!vistos.has(k)) { vistos.add(k); uniq.push(a); } });
  return uniq;
}

/* PÓS-CONDIÇÃO verificável: depois de merge/exclusão, nada do uid morto pode sobrar.
 * Ela NÃO deriva do plano — relê o banco. É o que transforma "achei que limpei" em prova. */
async function conferirUidMortoSumiu(db, uid) {
  const sobras = [];
  const [a, b2] = await Promise.all([
    db.collection('friendships').where('uidA', '==', uid).get(),
    db.collection('friendships').where('uidB', '==', uid).get(),
  ]);
  if (!a.empty) sobras.push('friendships.uidA (' + a.size + ')');
  if (!b2.empty) sobras.push('friendships.uidB (' + b2.size + ')');
  const acc = await acessosDe(db, uid);
  if (acc.length) sobras.push('friendAccess (' + acc.length + ')');
  for (const campo of ['friends', 'friendRequestsSent', 'friendRequestsReceived']) {
    // user-vivo:isento — busca reversa por uid (quem carrega o uid morto no cache).
    const s2 = await db.collection('users').where(campo, 'array-contains', uid).get();
    if (!s2.empty) sobras.push('users.' + campo + ' (' + s2.size + ')');
  }
  return sobras;
}

async function amizadeNoMerge(db, oldUid, keepUid) {
  const r = await mergeAmizade(db, oldUid, keepUid);
  /* ⛔ a descoberta roda DEPOIS da escrita da autoridade também: se o cânone já estava
   * migrado (retry), `mergeAmizade` devolve plano vazio e é ESTA busca que acha o terceiro
   * com cache velho. Sem ela o retry seria um no-op que deixa o estrago de pé. */
  const alvos = new Set([...(r.afetados || []), oldUid, keepUid]);
  for (const u of await cachesContendo(db, oldUid)) alvos.add(u);
  // ⭐ projeções órfãs do uid morto, achadas SEM depender das relações (ponto 4)
  const orfas = await acessosDe(db, oldUid);
  if (orfas.length) {
    let b = db.batch(), n = 0;
    for (const a of orfas) {
      b.delete(db.collection('friendAccess').doc(a.uid).collection('accepted').doc(a.friendUid));
      alvos.add(a.uid); alvos.add(a.friendUid);
      if (++n >= 400) { await b.commit(); b = db.batch(); n = 0; }
    }
    if (n) await b.commit();
    out_orfas(orfas.length, oldUid);
    r.acessosOrfaosRemovidos = orfas.length;
  }
  await reconstruirCache(db, [...alvos], { criarSeAusente: true });
  r.posCondicao = await conferirUidMortoSumiu(db, oldUid);
  if (r.posCondicao.length) {
    throw new Error('[amizadeNoMerge] PÓS-CONDIÇÃO FALHOU para ' + oldUid + ': ' + r.posCondicao.join(', '));
  }
  return r;
}

/** Fusão oldUid → keepUid na autoridade de amizade. Devolve contagens. */
async function mergeAmizade(db, oldUid, keepUid) {
  const out = { relacoesReescritas: 0, relacoesApagadas: 0, acessosCriados: 0, acessosApagados: 0, afetados: [] };
  if (!oldUid || !keepUid || oldUid === keepUid) return out;
  try {
    const rel = [...(await relacoesDe(db, oldUid)), ...(await relacoesDe(db, keepUid))];
    const vistos = new Set(); const unicas = [];
    rel.forEach((r) => { if (!vistos.has(r.id)) { vistos.add(r.id); unicas.push(r); } });

    const plano = _core.planejarMerge(unicas, oldUid, keepUid);
    out.afetados = _core.afetadosPorMerge(plano, oldUid, keepUid);
    // ⭐ soma quem AINDA carrega o uid morto (retry após falha parcial)
    for (const u of await cachesContendo(db, oldUid)) {
      if (out.afetados.indexOf(u) === -1) out.afetados.push(u);
    }
    let b = db.batch(), n = 0;
    const flush = async () => { if (n) { await b.commit(); b = db.batch(); n = 0; } };
    const put = async (fn) => { fn(); if (++n >= 400) await flush(); };

    for (const r of plano.escrever) {
      await put(() => b.set(db.collection("friendships").doc(r.id), r.doc));
      out.relacoesReescritas++;
    }
    for (const id of plano.apagar) {
      await put(() => b.delete(db.collection("friendships").doc(id)));
      out.relacoesApagadas++;
    }
    const ac = (a) => db.collection("friendAccess").doc(a.uid).collection("accepted").doc(a.friendUid);
    /* ⛔ 6ª auditoria (ponto 4): o doc de projeção passa a carregar `ownerUid`/`friendUid`.
     * Sem eles, achar as projeções de um uid dependia de LER as `friendships` dele — e num
     * retry após falha parcial (relação já rekeyada/apagada, projeção antiga ainda de pé) a
     * relação não existe mais e o órfão ficava invisível para sempre.
     * Com os campos + collectionGroup dá pra achar tudo que PERTENCE a um uid e tudo que
     * APONTA para ele, mesmo sem a relação correspondente. */
    const corpoAc = (a) => _core.docAcesso(a.uid, a.friendUid, new Date().toISOString());
    for (const a of plano.acessosApagar) { await put(() => b.delete(ac(a))); out.acessosApagados++; }
    for (const a of plano.acessosCriar) { await put(() => b.set(ac(a), corpoAc(a))); out.acessosCriados++; }
    await flush();
    console.log("[_mergeAmizade]", oldUid, "→", keepUid, JSON.stringify(out));
  } catch (e) {
    console.error("[_mergeAmizade] FALHOU:", e && e.message);
    throw e;   // amizade corrompida é pior que fusão interrompida
  }
  return out;
}

/** Exclusão de conta: nenhuma autoridade de amizade pode ficar órfã. */
async function excluirAmizade(db, uid) {
  const out = { relacoesApagadas: 0, acessosApagados: 0, cachesLimpos: 0 };
  if (!uid) return out;
  try {
    const plano = _core.planejarExclusao(await relacoesDe(db, uid), uid);
    let b = db.batch(), n = 0;
    const flush = async () => { if (n) { await b.commit(); b = db.batch(); n = 0; } };
    const put = async (fn) => { fn(); if (++n >= 400) await flush(); };
    for (const id of plano.apagar) { await put(() => b.delete(db.collection("friendships").doc(id))); out.relacoesApagadas++; }
    const ac = (a) => db.collection("friendAccess").doc(a.uid).collection("accepted").doc(a.friendUid);
    // (só apaga aqui — a criação de projeção é do merge e do service)
    for (const a of plano.acessosApagar) { await put(() => b.delete(ac(a))); out.acessosApagados++; }
    await flush();
    // ⭐ o cache dos terceiros também vem do CÂNONE (já sem as relações apagadas acima),
    // não de um arrayRemove — é a mesma regra do merge.
    // idem no delete: descobre quem ainda tem o uid, mesmo que a relação já tenha sumido
    const alvos = new Set(plano.cacheRemoverDe);
    for (const u of await cachesContendo(db, uid)) alvos.add(u);
    alvos.delete(uid);
    // projeções órfãs deste uid, mesmo sem relação correspondente (ponto 4)
    const orfas = await acessosDe(db, uid);
    if (orfas.length) {
      let b2 = db.batch(), n2 = 0;
      for (const a of orfas) {
        b2.delete(db.collection('friendAccess').doc(a.uid).collection('accepted').doc(a.friendUid));
        if (a.uid !== uid) alvos.add(a.uid);
        if (a.friendUid !== uid) alvos.add(a.friendUid);
        if (++n2 >= 400) { await b2.commit(); b2 = db.batch(); n2 = 0; }
      }
      if (n2) await b2.commit();
      out.acessosApagados += orfas.length;
    }
    out.cachesLimpos = await reconstruirCache(db, [...alvos]);
    out.posCondicao = await conferirUidMortoSumiu(db, uid);
    if (out.posCondicao.length) {
      throw new Error('[excluirAmizade] PÓS-CONDIÇÃO FALHOU para ' + uid + ': ' + out.posCondicao.join(', '));
    }
    console.log("[_excluirAmizade]", uid, JSON.stringify(out));
  } catch (e) { console.error("[_excluirAmizade] FALHOU:", e && e.message); throw e; }
  return out;
}


function out_orfas(n, uid) { console.log('[amizade] ' + n + ' projeção(ões) órfã(s) de ' + uid + ' removida(s) na descoberta'); }

/* ⛔ A GUARDA DE MERGE, NUM LUGAR SÓ E TESTÁVEL (8ª auditoria, ponto 1).
 * `_executeMerge` vive no index.js, que não é `require`-ável em teste — então a única prova
 * possível da trava lá seria regex. Aqui a mesma guarda é exercitada de verdade.
 * Ela faz as DUAS coisas que todo caminho de fusão precisa, na ordem certa:
 *   1. recusa se a migração estiver congelada ou em manutenção (o backend para junto com
 *      o cliente — Admin SDK ignora Rules, então a trava tem que ser código);
 *   2. adquire o lock dos dois uids, tudo-ou-nada, e libera pelo operationId.
 * ⚠️ A checagem de fase vem ANTES da aquisição: recusar depois de adquirir deixaria um
 * lock preso à toa em toda tentativa durante o freeze.
 */
async function guardaDeMerge(db, HttpsError, uids, fn) {
  await _fase.exigirLiberado(db, HttpsError, 'merge');
  /* ⛔ 9ª auditoria (ponto 3): a finalização decide o estado de cada uid. `fn` recebe a
   * posse e devolve `{ resultado, finais }` — `finais` mapeia uid → estado terminal
   * (`merged`) ou `active`. Sem isso o uid absorvido voltaria a `active` e uma operação
   * com validação velha poderia escrever sobre ele. */
  const posse = await _lock.adquirir(db, uids, 'merging');
  let finais = null;
  try {
    const r = await fn(posse);
    finais = (r && r.finais) || null;
    return (r && Object.prototype.hasOwnProperty.call(r, 'resultado')) ? r.resultado : r;
  } finally {
    try {
      /* ⛔ 10ª auditoria (ponto 3): sem `finais` explícitos, o desfecho vem do FATO
       * GRAVADO — não de `liberar()` cego. Se a lápide já foi escrita e uma etapa
       * posterior lançou, o drop continua `merged`; só conta viva volta a `active`. */
      if (finais) await _lock.finalizar(db, posse, finais);
      else await _lock.finalizarPeloFato(db, posse);
    } catch (e) { console.error('[guardaDeMerge] finalização falhou:', e && e.message); }
  }
}

module.exports = { relacoesDe, acessosDe, conferirUidMortoSumiu, mergeAmizade, reconstruirCache, amizadeNoMerge, excluirAmizade, guardaDeMerge };
