/* user-vivo-core.js — UM RESOLVEDOR DE CONTA VIVA (ago/2026)
 *
 * O PROBLEMA (medido em 18/ago/2026): a fusão de contas NÃO apaga a conta absorvida —
 * grava uma LÁPIDE (`mergedInto` + `mergedAt`) no doc dela ([[project_lapide_mergedinto_e_carga_nao_lixo]]).
 * A lápide guarda os MESMOS dados de contato do sobrevivente: telefone, e-mail, nome.
 * Logo, TODA busca ampla em users/ por email / email_lower / phone / displayName /
 * letzplayHandle pode devolver a conta MORTA — e quase todas pegavam `snap.docs[0]`
 * sem olhar `mergedInto`.
 *
 * Caso real na base: M. Delia Fernandez — doc vivo vfnXkEcUfGUH5MyhQRuOkuab9W02 e lápide
 * FhL8w1Ym9eV3POBohF7hUlJMuX72, as DUAS com telefone +5511996019191 (a lápide ainda com o
 * e-mail relay da Apple). São 13 lápides na base. O dano não é cosmético: transferir a
 * organização, convidar co-organizador, mandar aviso e casar conta no login todos resolvem
 * UMA pessoa e AGEM sobre ela — agir sobre o uid morto é agir sobre ninguém.
 *
 * DAS 36 CONSULTAS AMPLAS a collection('users') em js/, só 6 puravam lápide (searchUsers,
 * conflito de nome único, login pós-fusão, casamento de amigos). Remendar as outras 30 seria
 * a mesma regra copiada em 30 lugares — que diverge no primeiro ajuste
 * ([[feedback_unify_dual_entry_points]]). Por isso: UMA porta.
 *
 * A PORTA: window._userVivo(x) → Promise<null | {uid, data, ref, count, docs, viaLapide}>
 *   x pode ser: QuerySnapshot (o `snap` de um .get()), DocumentSnapshot (o `doc` de um
 *   .doc(uid).get()), array de docs, ou uma string de uid.
 *   • lápide → segue `mergedInto` até a conta viva (guarda de PROFUNDIDADE e de CICLO:
 *     lápide que aponta pra lápide é normal — lápide que aponta pra si mesma, ou em anel,
 *     ou pra doc inexistente, é DESCARTADA; devolver o uid morto é o bug que este arquivo mata);
 *   • dedup: lápide + sobrevivente na MESMA busca colapsam num resultado só. Isso importa
 *     tanto quanto seguir a corrente — quem exigia `size === 1` pra aceitar (relatório de
 *     inscrição) desistia da pessoa quando os dois docs casavam pelo mesmo e-mail;
 *   • `count` = quantas contas VIVAS DISTINTAS a busca casou, DEPOIS do colapso — é o número
 *     que vale pra decidir "achei uma só";
 *   • `docs` = todas elas, em ordem (viva encontrada direto antes de viva alcançada por lápide).
 *
 * REGRA: este arquivo é PURO no load — nada de document/AppStore/localStorage. O Firestore é
 * lido SÓ dentro da chamada, e só quando há corrente a seguir (`opts.get` injeta o leitor nos
 * testes). Carregado cedo no index.html, antes do store.js e das views.
 *
 * ⚠️ NÃO confundir com FUSÃO: aqui nada é escrito. A lápide continua onde está — é ela que
 * redireciona o login antigo ([[project_lapide_mergedinto_e_carga_nao_lixo]]).
 */
(function () {
  'use strict';

  var MAX_HOPS = 10; // corrente de lápides na base real tem 1–2; 10 é folga com fim garantido

  // Cache de resolução uid→uid vivo. Seguro pra sessão inteira: lápide não se apaga e
  // `mergedInto` não muda de destino (a fusão só ACRESCENTA lápide). Só vale pro leitor
  // REAL — teste injeta `opts.get` e não toca no cache.
  window._userVivoCache = window._userVivoCache || {};

  function _ehLapide(data) {
    var m = data && data.mergedInto;
    return (typeof m === 'string' && m.trim()) ? m.trim() : '';
  }

  // Leitor padrão: users/{uid} no Firestore. Devolve null se não houver db ou doc.
  function _leitorFirestore(uid) {
    var db = window.FirestoreDB && (window.FirestoreDB.db ||
      (typeof window.FirestoreDB.ensureDb === 'function' && window.FirestoreDB.ensureDb()));
    if (!db) return Promise.resolve(null);
    return db.collection('users').doc(uid).get().then(function (doc) {
      if (!doc || !doc.exists) return null;
      return { uid: doc.id, data: doc.data() || {}, ref: doc.ref };
    }).catch(function () { return null; });
  }

  // Normaliza qualquer forma de entrada numa lista [{uid, data, ref}].
  function _normalizar(x) {
    if (!x) return [];
    if (typeof x === 'string') return [{ uid: x, data: null, ref: null }]; // data null = buscar
    var docs = null;
    if (Array.isArray(x)) docs = x;
    else if (Array.isArray(x.docs)) docs = x.docs;          // QuerySnapshot
    else if (typeof x.data === 'function') docs = [x];      // DocumentSnapshot
    if (!docs) return [];
    var out = [];
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      if (!d) continue;
      if (typeof d.data === 'function') {
        if (d.exists === false) continue;                   // doc apagado: nada a resolver
        out.push({ uid: d.id, data: d.data() || {}, ref: d.ref || null });
      } else if (d.uid || d.id) {
        out.push({ uid: d.uid || d.id, data: d.data || null, ref: d.ref || null });
      }
    }
    return out;
  }

  /**
   * Resolve para a(s) CONTA(S) VIVA(S) por trás de um resultado de busca em users/.
   * @param {object|Array|string} x QuerySnapshot, DocumentSnapshot, array de docs ou uid.
   * @param {object} [opts] { get: function(uid) → Promise<{uid,data,ref}|null> } — só testes.
   * @returns {Promise<null|{uid,data,ref,count,docs,viaLapide}>} null quando nada resolveu.
   */
  window._userVivo = function (x, opts) {
    opts = opts || {};
    var get = typeof opts.get === 'function' ? opts.get : _leitorFirestore;
    var usaCache = !opts.get;
    var entradas = _normalizar(x);
    if (!entradas.length) return Promise.resolve(null);

    // Segue a corrente de UMA entrada. Devolve {uid,data,ref,viaLapide} ou null (morta).
    function seguir(e) {
      // uid cru (sem data): carrega o doc antes de decidir.
      var inicio = e.data ? Promise.resolve(e) : get(e.uid).then(function (r) { return r; });
      return inicio.then(function (atual) {
        if (!atual || !atual.data) return null;
        var alvo = _ehLapide(atual.data);
        if (!alvo) return { uid: atual.uid, data: atual.data, ref: atual.ref || null, viaLapide: false };
        var vistos = {}; vistos[atual.uid] = true;
        var origem = atual.uid;
        // Atalho do cache: pula direto pro fim conhecido — mas AINDA passa pelo `passo`, que
        // relê o doc. Sobrevivente de hoje pode ser lápide de amanhã (fusão em cadeia); cache
        // que devolve sem reler apodrece exatamente no caso que este arquivo existe pra pegar.
        if (usaCache && window._userVivoCache[origem]) alvo = window._userVivoCache[origem];
        function passo(uid, hops) {
          if (hops > MAX_HOPS) {
            window._warn('[user-vivo] corrente de lápide longa demais a partir de ' + origem + ' — descartada');
            return Promise.resolve(null);
          }
          if (vistos[uid]) {                                  // ciclo (inclui lápide→si mesma)
            window._warn('[user-vivo] ciclo de mergedInto em ' + uid + ' — descartado');
            return Promise.resolve(null);
          }
          vistos[uid] = true;
          return get(uid).then(function (r) {
            if (!r || !r.data) {
              // Sobrevivente não existe mais. Devolver a lápide seria devolver o uid morto —
              // exatamente o bug. Melhor NÃO resolver: o chamador trata "não achei".
              window._warn('[user-vivo] lápide ' + origem + ' aponta pra doc inexistente ' + uid);
              return null;
            }
            var prox = _ehLapide(r.data);
            if (!prox) {
              if (usaCache) window._userVivoCache[origem] = r.uid;
              return { uid: r.uid, data: r.data, ref: r.ref || null, viaLapide: true };
            }
            return passo(prox, hops + 1);
          });
        }
        return passo(alvo, 1);
      }).catch(function (err) {
        window._warn('[user-vivo] resolução falhou:', err && err.message);
        return null;
      });
    }

    return Promise.all(entradas.map(seguir)).then(function (res) {
      // Colapsa lápide+sobrevivente no mesmo resultado, VIVA-DIRETA primeiro: quando a busca
      // casou os dois docs da mesma pessoa, o representante é o que já veio vivo.
      var vistos = {};
      var diretas = [], viaLapide = [];
      for (var i = 0; i < res.length; i++) {
        var r = res[i];
        if (!r || !r.uid || vistos[r.uid]) continue;
        vistos[r.uid] = true;
        (r.viaLapide ? viaLapide : diretas).push(r);
      }
      var docs = diretas.concat(viaLapide);
      if (!docs.length) return null;
      var m = docs[0];
      return {
        uid: m.uid, data: m.data, ref: m.ref || null,
        count: docs.length, docs: docs, viaLapide: !!m.viaLapide
      };
    });
  };
})();
