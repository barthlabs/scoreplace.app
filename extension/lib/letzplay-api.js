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
    var out = [], porId = {}, comps = {}, p = 1, parcial = false, linhas = 0;
    for (; p <= max; p++) {
      var arr = await pagina(handle, p, fetchJson);
      if (arr == null) { var e = new Error('indice-falhou'); e.pagina = p; throw e; }
      if (!arr.length) break;                  // FIM EXPLÍCITO
      linhas += arr.length;
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
    // ── CARD REPETIDO ≠ LINHA PERDIDA — E A PROVA É ARITMÉTICA ─────────────────────
    // Eu já errei este diagnóstico NAS DUAS direções, então ele ficou medido e travado:
    // o letzplay serve o MESMO jogo duas vezes (objetos idênticos, em fronteira de página)
    // e o contador do perfil conta os dois. Medido em 02/ago/2026, no JSON e no HTML:
    //   Kelly → 162 cards, 160 distintos (ids 7770348 e 8894372 repetidos, byte a byte);
    //   Fabio → 397 cards, 391 distintos (6 repetidos) — estável entre varreduras.
    // Como decidir sem chute: comparar LINHAS servidas com o esperado do perfil.
    //   linhas >= esperado → nada foi perdido; a diferença distintos×esperado são cards
    //                        repetidos DO LETZPLAY (e a tela deve DIZER isso, não somar);
    //   linhas <  esperado → aí sim faltou página (falha no meio) → repassa e funde.
    var esperado = opts.esperado || 0;
    var passadas = 0;
    while (!parcial && esperado > 0 && out.length < esperado && linhas < esperado && passadas < 3) {
      passadas++;
      var antes = out.length;
      // o teto do repasse NÃO é onde a varredura parou: se a falha foi uma página vazia
      // no MEIO, `p` parou cedo — e relendo só até ali, as páginas de trás nunca viriam.
      // O esperado diz quantas páginas o perfil tem (20 por página).
      var tetoRepasse = Math.max(p - 1, Math.ceil(esperado / 20));
      for (var q = 1; q <= tetoRepasse; q++) {
        var arr2 = await pagina(handle, q, fetchJson);
        if (arr2 == null || !arr2.length) continue;
        linhas += arr2.length;
        arr2.forEach(function (raw) {
          var m2 = normalizar(raw);
          if (!m2 || porId[m2.id]) return;
          porId[m2.id] = m2; out.push(m2);
          if (m2.compId) {
            var c2 = comps[m2.compId] || (comps[m2.compId] = { oficial: m2.oficial, n: 0 });
            c2.n++;
          }
        });
      }
      if (typeof opts.onProgresso === 'function') opts.onProgresso(p - 1, out.length);
      if (out.length === antes) break;      // a segunda passada não achou nada: é o teto real
    }
    // `parcial` = paramos cedo porque alcançamos o que já tínhamos. Nesse caso `total` NÃO
    // é o total do perfil — quem chama tem que somar com o que já tinha, e por isso o
    // campo vem explícito em vez de a gente devolver um número que parece completo.
    return { matches: out, porId: porId, comps: comps, paginas: p - 1,
             total: out.length, linhas: linhas, parcial: parcial, passadas: passadas };
  }

  root._spLzApi = { indice: indice, pagina: pagina, normalizar: normalizar };
})(typeof window !== 'undefined' ? window : globalThis);
