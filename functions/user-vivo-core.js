/* user-vivo-core.js — A PORTA DA CONTA VIVA, DO LADO DO SERVIDOR (ago/2026)
 *
 * Espelha `window._userVivo` (js/views/user-vivo-core.js, v1.9.33) — mesma pergunta, mesma
 * resposta, mesmas recusas. Existe porque a regra do cliente NÃO vale no servidor
 * ([[feedback_functions_must_mirror_app]]): quem manda o comunicado do organizador, quem
 * resolve o login por e-mail vinculado e quem escolhe o alvo da prova de fusão são Cloud
 * Functions, e nenhuma delas passa pelo js/.
 *
 * O FATO (medido em 18/ago/2026, e confirmado AQUI no servidor): a fusão não apaga a conta
 * absorvida — `_executeMerge` grava a LÁPIDE com `set({mergedInto, mergedAt}, {merge:true})`
 * (functions/index.js:484), ou seja o doc morto FICA com o mesmo e-mail, telefone e nome do
 * sobrevivente. São 13 lápides na base. Logo, toda busca ampla por campo de identidade pode
 * devolver o uid morto — e agir sobre ele é agir sobre ninguém.
 *
 * ⚠️ POR QUE O SERVIDOR PARECIA SEGURO E NÃO É INTEIRAMENTE:
 * a fusão APAGA o usuário do Auth (index.js:774). Isso salva os caminhos que terminam num
 * `admin.auth().getUser(uid)` — a lápide falha ali e vira `null`. Mas "vira null" não é
 * acerto: a pessoa VIVA existe e some do resultado, o que transforma um dado errado numa
 * NEGATIVA errada (login que não acha conta que existe). E os caminhos que NÃO passam pelo
 * Auth — o comunicado do organizador, o tema do e-mail — agem direto sobre o uid morto.
 *
 * ── DIFERENÇAS DELIBERADAS EM RELAÇÃO AO CLIENTE ────────────────────────────────────────
 * 1) `db` é PARÂMETRO, não global: no servidor não há `window.FirestoreDB`, e receber o
 *    handle deixa o módulo puro (o index.js não é `require`-ável em teste — registra onCall
 *    e lê secrets no import —, então a regra tem que morar fora dele pra ser exercitada).
 * 2) SEM CACHE. O cliente cacheia uid→vivo porque a aba é curta. Uma instância de CF fica
 *    QUENTE por horas e atende gente diferente; e uma fusão feita nesse meio-tempo torna
 *    lápide um uid que o cache guardou como vivo. As correntes reais têm 1–2 saltos — o
 *    cache economizaria uma leitura e compraria uma classe de bug de estado velho.
 * 3) `opts.excludeUid` — pedido pelos caminhos de FUSÃO. Ver a nota em `userVivo`.
 *
 * A REGRA, idêntica à do cliente e é o que este arquivo garante:
 *   • lápide → segue `mergedInto` até a conta viva;
 *   • corrente QUEBRADA (aponta pra doc inexistente), em CICLO, ou funda demais → devolve
 *     NADA. Nunca a lápide. Devolver o uid morto é exatamente o bug que a porta mata, e
 *     "não achei" é um desfecho que todo chamador já sabe tratar;
 *   • lápide + sobrevivente na MESMA busca COLAPSAM num resultado só (a busca por e-mail
 *     casa os dois docs da mesma pessoa; sem colapsar, quem exige "achei uma só" desiste);
 *   • `count` = contas VIVAS DISTINTAS depois do colapso.
 *
 * ⚠️ NÃO confunda com FUSÃO: aqui nada é escrito. A lápide continua onde está — é ela que
 * redireciona o login antigo ([[project_lapide_mergedinto_e_carga_nao_lixo]]).
 */
'use strict';

// Correntes reais têm 1–2 saltos. 10 é folga com fim garantido.
const MAX_HOPS = 10;

function _ehLapide(data) {
  const m = data && data.mergedInto;
  return (typeof m === 'string' && m.trim()) ? m.trim() : '';
}

// Normaliza qualquer forma de entrada numa lista [{uid, data}].
// `data: null` significa "ainda não li o doc" — o resolvedor busca antes de decidir.
function _normalizar(x) {
  if (!x) return [];
  if (typeof x === 'string') return [{ uid: x, data: null }];
  let docs = null;
  if (Array.isArray(x)) docs = x;
  else if (Array.isArray(x.docs)) docs = x.docs;            // QuerySnapshot
  else if (typeof x.data === 'function') docs = [x];        // DocumentSnapshot
  if (!docs) return [];
  const out = [];
  for (const d of docs) {
    if (!d) continue;
    if (typeof d.data === 'function') {
      if (d.exists === false) continue;                     // doc apagado: nada a resolver
      out.push({ uid: d.id, data: d.data() || {} });
    } else if (d.uid || d.id) {
      out.push({ uid: d.uid || d.id, data: d.data || null });
    }
  }
  return out;
}

/**
 * Resolve para a(s) CONTA(S) VIVA(S) por trás de um resultado de busca em users/.
 *
 * @param {object} db      Firestore (Admin SDK) ou fake com a mesma superfície.
 * @param {object|Array|string} x  QuerySnapshot, DocumentSnapshot, array de docs, ou uid.
 * @param {object} [opts]
 *   @param {function} [opts.get]  (uid) → Promise<{uid,data}|null>. Injetado nos testes.
 *   @param {string} [opts.excludeUid]  uid a IGNORAR — ver abaixo.
 * @returns {Promise<null|{uid,data,count,docs,viaLapide}>} null quando nada resolveu.
 *
 * ⚠️ `excludeUid` filtra ANTES e DEPOIS de resolver, e as duas pontas importam por motivos
 * diferentes. ANTES: não gasta leitura seguindo a própria corrente (é o que os caminhos de
 * fusão já faziam à mão com `d.id !== uid`). DEPOIS: é CORREÇÃO — uma lápide de terceiro
 * pode apontar justamente pra MIM, e aí o candidato "outra pessoa" resolve pra mim mesmo;
 * sem o filtro no fim, o chamador tentaria fundir uma conta com ela própria.
 */
async function userVivo(db, x, opts) {
  opts = opts || {};
  const excluir = (typeof opts.excludeUid === 'string' && opts.excludeUid) ? opts.excludeUid : '';
  const get = typeof opts.get === 'function' ? opts.get : (uid) => _leitorFirestore(db, uid);

  let entradas = _normalizar(x);
  if (excluir) entradas = entradas.filter((e) => e.uid !== excluir);
  if (!entradas.length) return null;

  const resolvidas = await Promise.all(entradas.map((e) => _seguir(get, e)));

  // Colapsa lápide+sobrevivente, VIVA-DIRETA primeiro: quando a busca casou os dois docs da
  // mesma pessoa, o representante é o que já veio vivo.
  const vistos = Object.create(null);
  const diretas = [], viaLapide = [];
  for (const r of resolvidas) {
    if (!r || !r.uid || vistos[r.uid]) continue;
    if (excluir && r.uid === excluir) continue;             // resolveu pra mim mesmo
    vistos[r.uid] = true;
    (r.viaLapide ? viaLapide : diretas).push(r);
  }
  const docs = diretas.concat(viaLapide);
  if (!docs.length) return null;
  const m = docs[0];
  return { uid: m.uid, data: m.data, count: docs.length, docs, viaLapide: !!m.viaLapide };
}

// Leitor padrão: users/{uid}. Null quando não há doc — o chamador trata como "não achei".
function _leitorFirestore(db, uid) {
  if (!db) return Promise.resolve(null);
  return db.collection('users').doc(uid).get().then((doc) => {
    if (!doc || !doc.exists) return null;
    // `doc.id || uid`: o snapshot real sempre traz o id, mas o uid pedido é igualmente
    // verdadeiro e já está na mão — não vale perder a resolução por causa da forma do
    // snapshot (foi o que quebrou ao plugar isto no harness da resolveLoginRedirect).
    return { uid: doc.id || uid, data: doc.data() || {} };
  }).catch(() => null);
}

// Segue a corrente de UMA entrada. Devolve {uid,data,viaLapide} ou null (morta/quebrada).
async function _seguir(get, e) {
  try {
    const atual = e.data ? e : await get(e.uid);
    if (!atual || !atual.data) return null;

    const alvo = _ehLapide(atual.data);
    if (!alvo) return { uid: atual.uid, data: atual.data, viaLapide: false };

    const origem = atual.uid;
    const vistos = Object.create(null);
    vistos[origem] = true;

    let uid = alvo;
    for (let hops = 1; hops <= MAX_HOPS; hops++) {
      if (vistos[uid]) {                                    // ciclo (inclui lápide→si mesma)
        console.warn('[user-vivo] ciclo de mergedInto em ' + uid + ' — descartado');
        return null;
      }
      vistos[uid] = true;

      const r = await get(uid);
      if (!r || !r.data) {
        // Sobrevivente não existe mais. Devolver a lápide seria devolver o uid morto —
        // exatamente o bug. Melhor NÃO resolver: o chamador trata "não achei".
        console.warn('[user-vivo] lápide ' + origem + ' aponta pra doc inexistente ' + uid);
        return null;
      }
      const prox = _ehLapide(r.data);
      if (!prox) return { uid: r.uid, data: r.data, viaLapide: true };
      uid = prox;
    }
    console.warn('[user-vivo] corrente de lápide longa demais a partir de ' + origem + ' — descartada');
    return null;
  } catch (err) {
    console.warn('[user-vivo] resolução falhou:', err && err.message);
    return null;
  }
}

/** Atalho pros chamadores que só querem o uid vivo (ou "" quando não resolveu). */
async function uidVivo(db, x, opts) {
  const r = await userVivo(db, x, opts);
  return r ? r.uid : '';
}

module.exports = { userVivo, uidVivo, MAX_HOPS };
