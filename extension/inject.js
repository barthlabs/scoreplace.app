/* inject.js — web-accessible. Carregado na PÁGINA do letzplay via <script src> → roda no
 * mundo REAL da página. Por isso o fetch aqui é page-initiated → o cookie de sessão vai
 * (o executeScript, MAIN ou ISOLATED, o Chrome atribui à extensão → cookie NÃO vai).
 * Recebe pedidos por postMessage e devolve o HTML. É a única forma confiável de buscar
 * o letzplay logado a partir da extensão.
 */
(function () {
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (!d || !d.__spInjReq || !d.__spInjReq.url) return;
    var u = d.__spInjReq.url;
    fetch(u, { credentials: 'include' })
      .then(function (r) {
        // retryAfter: quando o letzplay/Cloudflare limita (403/429) ele diz EM QUANTOS
        // segundos aceita de novo. Respeitar isso é o que faz o import nunca falhar por
        // rajada — chutar backoff é pior que obedecer o servidor.
        var ra = null, cfm = null;
        try { ra = r.headers.get('retry-after'); } catch (e) {}
        try { cfm = r.headers.get('cf-mitigated'); } catch (e) {}
        return r.text().then(function (h) {
          // BLOQUEIO DISFARÇADO DE SUCESSO: o Cloudflare às vezes devolve a página de
          // desafio ("Just a moment…") com status 200/503. Sem esta detecção, r.ok=true,
          // o HTML volta SEM jogo nenhum, o import conclui "sem-jogos" e — pior — a fila
          // interpreta como sucesso e ACELERA, tomando bloqueio de novo. Foi assim que a
          // busca de 14/jul/2026 gravou zero jogos "com sucesso". Um desafio é um NÃO:
          // tem que contar como bloqueio pra fila desacelerar e o content re-tentar.
          var blocked = (cfm != null) ||
            /<title>\s*Just a moment/i.test(h) ||
            /challenge-platform|cf_chl_opt|__cf_chl_|cf-browser-verification/i.test(h);
          window.postMessage({ __spInjRes: { url: u, res: {
            ok: r.ok && !blocked, status: r.status, retryAfter: ra, blocked: blocked,
            error: blocked ? 'cf-challenge' : undefined, html: h
          } } }, window.location.origin);
        });
      })
      .catch(function (err) {
        window.postMessage({ __spInjRes: { url: u, res: { ok: false, error: String(err && err.message || err) } } }, window.location.origin);
      });
  });
})();
