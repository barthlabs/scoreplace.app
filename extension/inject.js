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
        var ra = null;
        try { ra = r.headers.get('retry-after'); } catch (e) {}
        return r.text().then(function (h) {
          window.postMessage({ __spInjRes: { url: u, res: { ok: r.ok, status: r.status, retryAfter: ra, html: h } } }, window.location.origin);
        });
      })
      .catch(function (err) {
        window.postMessage({ __spInjRes: { url: u, res: { ok: false, error: String(err && err.message || err) } } }, window.location.origin);
      });
  });
})();
