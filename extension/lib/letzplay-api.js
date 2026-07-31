/* letzplay-api.js — o ÍNDICE do histórico, vindo do JSON que o próprio letzplay serve.
 *
 * POR QUE (medido em 31/jul/2026): o letzplay é um app Rails renderizado no servidor, e
 * toda rota responde JSON quando pedida com `.json`. O índice de partidas
 * (/{handle}/matches.json?page=N) devolve, por partida:
 *   id · date · matchable_id + matchable_type (a competição) · round · status
 * e a página seguinte à última devolve `[]` — fim de lista EXPLÍCITO.
 *
 * O que isso resolve, e que nos custou dias:
 *  • "QUANTOS SÃO" deixa de ser inferência. O contador do perfil conta CARDS (478 pra 469
 *    partidas reais na Camila; 158 pra 157 na Kelly) e por isso a barra nunca fechava.
 *    O índice conta PARTIDAS: o total vira um fato.
 *  • "JÁ LI TUDO?" deixa de ser heurística de página. Com o índice, completude é uma
 *    verificação: tenho todos os ids? Nada de detectMaxPage lendo markup, nada de
 *    "página vazia deve ser o fim".
 *  • A IDENTIDADE vem da fonte (o id da partida), não de uma chave de conteúdo derivada.
 *
 * O que o JSON NÃO traz: jogadores, placar e classificação — isso segue no HTML. Este
 * arquivo cuida só do índice; quem lê placar continua sendo o extrator de sempre.
 */
(function (root) {
  'use strict';

  // Uma página do índice. `fetchJson(url)` é injetado (a extensão busca pela aba logada).
  async function pagina(handle, p, fetchJson) {
    var u = 'https://letzplay.me/' + encodeURIComponent(handle) + '/matches.json' + (p > 1 ? ('?page=' + p) : '');
    var arr = await fetchJson(u);
    return Array.isArray(arr) ? arr : null;
  }

  function normalizar(m) {
    if (!m || m.id == null) return null;
    var tipo = String(m.matchable_type || '').toLowerCase();   // "ranking" | "tournament"
    return {
      id: String(m.id),
      dateISO: m.date || null,                 // "2026-07-29"
      compId: (m.matchable_id != null) ? String(m.matchable_id) : null,
      oficial: tipo.indexOf('tourn') === 0,    // torneio = oficial
      round: (m.round != null) ? m.round : null,
      status: (m.status != null) ? m.status : null
    };
  }

  /* Índice COMPLETO do histórico. Percorre até a página vazia — o único critério de fim
   * que a fonte nos dá de graça. `onProgresso(p, acumulado)` é opcional.
   * Devolve { matches:[...], porId:{}, comps:{compId:{oficial,n}}, paginas, total }.
   */
  async function indice(handle, fetchJson, opts) {
    opts = opts || {};
    var max = opts.maxPaginas || 200;          // teto de segurança, não de trabalho
    // `conhecidos`: ids que já temos. Com ele o índice PARA na primeira página que não
    // traz nada novo — a lista é do mais recente pro mais antigo, então o que é novo está
    // no começo e é contíguo. Sem ele, varre tudo (primeira leitura).
    var conhecidos = opts.conhecidos || null;
    var out = [], porId = {}, comps = {}, p = 1, parcial = false;
    for (; p <= max; p++) {
      var arr = await pagina(handle, p, fetchJson);
      if (arr == null) { var e = new Error('indice-falhou'); e.pagina = p; throw e; }
      if (!arr.length) break;                  // FIM EXPLÍCITO
      var novosNaPagina = 0;
      arr.forEach(function (raw) {
        var m = normalizar(raw);
        if (!m || porId[m.id]) return;         // o próprio índice pode repetir; id manda
        porId[m.id] = m; out.push(m);
        if (!conhecidos || !conhecidos[m.id]) novosNaPagina++;
        if (m.compId) {
          var c = comps[m.compId] || (comps[m.compId] = { oficial: m.oficial, n: 0 });
          c.n++;
        }
      });
      if (typeof opts.onProgresso === 'function') opts.onProgresso(p, out.length);
      if (conhecidos && novosNaPagina === 0) { parcial = true; break; }
    }
    // `parcial` = paramos cedo porque alcançamos o que já tínhamos. Nesse caso `total` NÃO
    // é o total do perfil — quem chama tem que somar com o que já tinha, e por isso o
    // campo vem explícito em vez de a gente devolver um número que parece completo.
    return { matches: out, porId: porId, comps: comps, paginas: p - 1,
             total: out.length, parcial: parcial };
  }

  root._spLzApi = { indice: indice, pagina: pagina, normalizar: normalizar };
})(typeof window !== 'undefined' ? window : globalThis);
