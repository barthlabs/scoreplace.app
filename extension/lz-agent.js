/* lz-agent.js — content script DECLARADO em letzplay.me.
 *
 * POR QUE ISTO EXISTE (31/jul/2026, medido na máquina do dono):
 * A busca ficava minutos sem trazer nada COM a aba do letzplay aberta e funcionando — ele
 * navegava e clicava nela normalmente enquanto a leitura não saía do lugar. A mesma
 * requisição levou 0,4s às 16h e estourou 40s às 18h, para a MESMA pessoa. Não era o
 * letzplay limitando (zero eventos de rate-limit) e não era a aba.
 *
 * Era o caminho: TODO pedido atravessava o service worker do MV3, que injetava o inject.js
 * na aba a CADA requisição e devolvia por postMessage no mundo da página. O Chrome recicla
 * o service worker quando quer; quando ele morre no meio, a resposta nunca chega, o prazo
 * de 20s estoura e a leitura tenta de novo — e de novo.
 *
 * Este agente vive COM A ABA. Nada é injetado por requisição, e o fetch é same-origin
 * (letzplay.me → letzplay.me), então a sessão logada vai junto como sempre foi. O service
 * worker continua roteando, mas se ele reiniciar o Chrome o reacorda pela própria mensagem
 * — o que não dá pra recuperar é uma resposta perdida no meio de uma injeção.
 */
(function () {
  if (window.__spLzAgent) return;
  window.__spLzAgent = true;

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg || msg.type !== 'lz-agent-fetch' || typeof msg.url !== 'string') return;
    if (msg.url.indexOf('https://letzplay.me/') !== 0) { sendResponse({ ok: false, error: 'url-fora' }); return true; }

    fetch(msg.url, { credentials: 'include' })
      .then(function (r) {
        var ra = null, cfm = null;
        try { ra = r.headers.get('retry-after'); } catch (e) {}
        try { cfm = r.headers.get('cf-mitigated'); } catch (e) {}
        // DECODIFICA SEMPRE COMO UTF-8: o letzplay serve charset Latin-1 num corpo UTF-8, e
        // `r.text()` obedece o cabeçalho — o nome do torneio chegava como «FEMININA â€œCâ€».
        return r.arrayBuffer().then(function (buf) {
          var h;
          try { h = new TextDecoder('utf-8').decode(buf); }
          catch (e) { h = String.fromCharCode.apply(null, new Uint8Array(buf)); }
          // Desafio do Cloudflare vem com status 200: contar como sucesso fazia a fila
          // ACELERAR justo quando devia frear, e a busca concluía "sem jogos".
          var blocked = (cfm != null) ||
            /<title>\s*Just a moment/i.test(h) ||
            /challenge-platform|cf_chl_opt|__cf_chl_|cf-browser-verification/i.test(h);
          sendResponse({ ok: r.ok && !blocked, status: r.status, retryAfter: ra, blocked: blocked,
            error: blocked ? 'cf-challenge' : undefined, html: h });
        });
      })
      .catch(function (err) { sendResponse({ ok: false, error: String((err && err.message) || err) }); });
    return true;   // resposta assíncrona
  });
})();
