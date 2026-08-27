/* ═══ AMIZADE — A INVARIANTE ═══════════════════════════════════════════════════
 *
 * UMA regra, e ela cabe numa frase: **quem está em `friends` não pode estar em
 * `friendRequestsSent` nem em `friendRequestsReceived`**. Aceitou, virou amigo; não há
 * convite pendente. Ordem do dono (27/ago/2026): _"amigos nao podem estar como convites
 * pendetes. aceitou, virou amigo, nao tem convite pendente. em nenhuma dessas telas."_
 *
 * ⚠️ POR QUE UM MÓDULO, E NÃO TRÊS LINHAS EM CADA LUGAR: a invariante FALTAVA em TRÊS
 * pontos, todos unindo os arrays de forma independente e nenhum comparando um com o outro:
 *   1. `js/views/auth.js` — o merge do doc legado (chave e-mail → chave uid): três
 *      `arrayUnion` seguidos, um por campo;
 *   2. `functions/index.js` (~5932) — a fusão de contas monta `surv.friends`,
 *      `surv.friendRequestsSent` e `surv.friendRequestsReceived` com uniões separadas;
 *   3. `functions/index.js` (~5998) — ao repontar TERCEIROS, percorre
 *      ["friends","friendRequestsSent","friendRequestsReceived"] trocando o uid velho pelo
 *      novo em cada campo isolado. Quem tinha o uid velho em `friends` e o novo em `sent`
 *      termina com o mesmo uid nos dois.
 *
 * ⭐ MEDIDO na base em 27/ago/2026, antes do conserto: 12 usuários com alguém que JÁ ERA
 * AMIGO ainda listado como convite — 11 pares. O dono via os próprios amigos na lista de
 * "convites pendentes". A limpeza (scripts/limpar-convite-de-quem-ja-e-amigo.js) resolveu
 * o passado; este módulo existe pra o futuro não repor.
 *
 * ⛔ `friends` NUNCA é alterado aqui. Quando os dois estados se contradizem, a amizade é o
 * estado FORTE — ela é o resultado, o convite é o caminho. Descartar amizade por causa de
 * um convite órfão seria perder o dado que importa.
 *
 * Puro: sem DOM, sem Firestore, sem relógio. Roda igual no browser e no Node (o
 * `copy-vendor` leva este arquivo pra functions/vendor).
 */
(function (raiz) {
  'use strict';

  function _lista(v) { return Array.isArray(v) ? v.filter(function (x) { return x != null && x !== ''; }).map(String) : []; }

  /* Devolve {friends, friendRequestsSent, friendRequestsReceived} com a invariante aplicada.
   * Aceita o doc inteiro ou só os três campos. Não modifica a entrada. */
  function reconciliarAmizade(doc) {
    doc = doc || {};
    var amigos = _lista(doc.friends);
    var vistos = {};
    amigos.forEach(function (u) { vistos[u] = 1; });
    var tira = function (arr) { return _lista(arr).filter(function (u) { return !vistos[u]; }); };
    return {
      friends: amigos,
      friendRequestsSent: tira(doc.friendRequestsSent),
      friendRequestsReceived: tira(doc.friendRequestsReceived)
    };
  }

  /* Quem seria REMOVIDO dos convites — pra quem precisa de arrayRemove em vez de escrever
   * o array inteiro (o caminho seguro quando há escrita concorrente). */
  function conviteDeQuemJaEAmigo(doc) {
    doc = doc || {};
    var amigos = {};
    _lista(doc.friends).forEach(function (u) { amigos[u] = 1; });
    var achados = {};
    _lista(doc.friendRequestsSent).concat(_lista(doc.friendRequestsReceived))
      .forEach(function (u) { if (amigos[u]) achados[u] = 1; });
    return Object.keys(achados);
  }

  /* União de dois arrays de uid, sem duplicata e preservando a ordem de entrada.
   * Existe aqui porque os três pontos de fusão precisavam dela E da invariante juntas —
   * separá-las é o que permitia unir sem reconciliar. */
  function unirUids(a, b) {
    var out = [], visto = {};
    _lista(a).concat(_lista(b)).forEach(function (u) { if (!visto[u]) { visto[u] = 1; out.push(u); } });
    return out;
  }

  /* Funde dois docs de amizade E aplica a invariante — é o que os pontos de merge querem. */
  function fundirAmizade(a, b) {
    return reconciliarAmizade({
      friends: unirUids(a && a.friends, b && b.friends),
      friendRequestsSent: unirUids(a && a.friendRequestsSent, b && b.friendRequestsSent),
      friendRequestsReceived: unirUids(a && a.friendRequestsReceived, b && b.friendRequestsReceived)
    });
  }

  var API = {
    reconciliarAmizade: reconciliarAmizade,
    conviteDeQuemJaEAmigo: conviteDeQuemJaEAmigo,
    unirUids: unirUids,
    fundirAmizade: fundirAmizade
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  Object.keys(API).forEach(function (k) { raiz[k] = API[k]; });
  raiz._amizadeCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
