/* leitura-resiliente.js — GET que sobrevive a soluço de rede, e SÓ GET.
 *
 * ⛔ O DEFEITO MEDIDO (30/ago/2026). `scripts/conferir-espelho-resultados.js` morria no
 * PRIMEIRO GET com `UND_ERR_CONNECT_TIMEOUT` em 10.000 ms — antes de imprimir qualquer
 * contador. Medido no mesmo momento, com curl:
 *     curl -4 : connect=0,049s      curl -6 : connect=5,035s
 * Existe um caminho IPv6 ~100× mais lento. Uma requisição isolada pelo `fetch` do Node
 * levava ~5,4s e PASSAVA; o conferidor abre centenas (lista torneios, depois por torneio
 * as subcoleções em Promise.all + a lista de results), e aí conexões novas estouram o teto.
 *
 * ⛔ POR QUE `AbortSignal.timeout` NÃO RESOLVE, e foi descartado: ele aborta a REQUISIÇÃO,
 * não altera o `connectTimeout` interno de 10s do undici — o erro continuaria sendo o mesmo,
 * só que disparado por outro relógio. E `NODE_OPTIONS=--dns-result-order=ipv4first` também
 * foi tentado, uma vez, e não mudou o desfecho (exit 1, mesmo erro).
 *
 * ⭐ POR QUE `node:https` E NÃO undici: `require('undici')` não existe neste projeto
 * (MODULE_NOT_FOUND) e não há nenhuma dependência que o traga — usar `setGlobalDispatcher`
 * exigiria acrescentar dependência, que está fora do escopo desta leva. O `node:https` já
 * está no runtime e aceita timeout de socket EXPLÍCITO, que cobre a fase de conexão: durante
 * um connect travado não há atividade no socket, então o 'timeout' dispara. É o teto real
 * que o undici não deixa mexer.
 *
 * ⛔ ESTE MÓDULO NÃO SABE ESCREVER. Não há parâmetro de método, não há corpo: `https.request`
 * é chamado com `method: 'GET'` fixo, literal. Retentar só é seguro porque a operação é
 * idempotente por construção, não por promessa de quem chama.
 *
 * ⚠️ NÃO AUMENTA PARALELISMO. Ele troca UMA leitura por até N tentativas EM SÉRIE. A
 * concorrência de quem chama fica exatamente como estava.
 */
'use strict';
const https = require('node:https');

/* Só estes são retentados. Qualquer outra coisa — 401, 403, 404, 400 — é resposta do
 * servidor, não soluço de rede: retentar mascararia um erro real de permissão ou de caminho
 * atrás de uma espera. 404 nem chega aqui como erro: quem chama trata. */
const CODIGOS_TRANSITORIOS = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE',
  'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN', 'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'SP_TIMEOUT'
]);
const HTTP_TRANSITORIOS = new Set([408, 429, 500, 502, 503, 504]);

function ehTransitorio(err) {
  if (!err) return false;
  if (err.httpStatus != null) return HTTP_TRANSITORIOS.has(err.httpStatus);
  const c = err.code || (err.cause && err.cause.code);
  return CODIGOS_TRANSITORIOS.has(c);
}

/** Transporte padrão: um GET, com timeout de socket explícito (cobre o connect). */
function transporteHttps(timeoutMs) {
  return function get(url, headers) {
    return new Promise((resolve, reject) => {
      let u;
      try { u = new URL(url); } catch (e) { reject(Object.assign(e, { code: 'SP_URL_INVALIDA' })); return; }
      const req = https.request({
        protocol: u.protocol, hostname: u.hostname, port: u.port || 443,
        /* ⚠️ `pathname + search`, NÃO `u.href`: o caminho do Firestore contém `(default)`, e
         * a WHATWG URL o preserva sem encodar (conferido). Reconstruir à mão arriscaria
         * quebrar isso em silêncio. */
        path: u.pathname + u.search,
        method: 'GET',                       // ⛔ fixo. Este módulo não escreve.
        headers: headers || {},
        timeout: timeoutMs
      }, (res) => {
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { corpo += c; });
        res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, texto: corpo }));
      });
      /* O 'timeout' do socket não aborta sozinho — sem este destroy a requisição ficaria
       * pendurada para sempre, que é a promessa-cadáver de novo, com outro nome. */
      req.on('timeout', () => { req.destroy(Object.assign(new Error('timeout de ' + timeoutMs + 'ms em ' + u.hostname), { code: 'SP_TIMEOUT' })); });
      req.on('error', reject);
      req.end();
    });
  };
}

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Devolve `ler(url, headers, rotulo)` → { status, ok, texto }.
 * `rotulo` é a OPERAÇÃO LÓGICA (ex.: 'lista results de tour_X') — é o que aparece no
 * diagnóstico quando as tentativas acabam; URL sozinha não diz o que se estava auditando.
 */
function criarLeitor(opts) {
  const o = opts || {};
  const tentativasMax = Math.max(1, Number(o.tentativas) || 4);
  const timeoutMs = Math.max(1000, Number(o.timeoutMs) || 30000);
  const esperaBase = Math.max(0, Number(o.esperaBaseMs) == null ? 500 : Number(o.esperaBaseMs));
  const esperaTeto = Math.max(esperaBase, Number(o.esperaTetoMs) || 4000);
  const get = o.transporte || transporteHttps(timeoutMs);
  const log = o.log || ((m) => console.error(m));

  return async function ler(url, headers, rotulo) {
    const alvo = rotulo || url;
    let ultima = null;
    for (let n = 1; n <= tentativasMax; n++) {
      try {
        const r = await get(url, headers);
        /* HTTP transitório também é soluço: 429/5xx merecem outra tentativa, e só eles. */
        if (!r.ok && HTTP_TRANSITORIOS.has(r.status)) {
          ultima = Object.assign(new Error('HTTP ' + r.status), { httpStatus: r.status });
        } else {
          if (n > 1) log('   ✓ tentativa ' + n + '/' + tentativasMax + ' funcionou — ' + alvo);
          return r;
        }
      } catch (e) {
        ultima = e;
      }
      if (!ehTransitorio(ultima)) break;                 // erro real: não insiste
      if (n === tentativasMax) break;                    // acabou a corda
      /* Espera progressiva COM TETO: sem teto, uma rede ruim vira minutos de silêncio. */
      const espera = Math.min(esperaTeto, esperaBase * Math.pow(2, n - 1));
      log('   ⚠️  tentativa ' + n + '/' + tentativasMax + ' falhou (' +
          (ultima.httpStatus ? 'HTTP ' + ultima.httpStatus : (ultima.code || ultima.message)) +
          ') — nova tentativa em ' + espera + 'ms · ' + alvo);
      await dorme(espera);
    }
    const causa = ultima && (ultima.httpStatus ? 'HTTP ' + ultima.httpStatus : (ultima.code || ultima.message));
    throw Object.assign(new Error(
      'leitura falhou após ' + tentativasMax + ' tentativa(s): ' + causa +
      '\n    operação: ' + alvo + '\n    url: ' + url),
      { spLeituraFalhou: true, spTentativas: tentativasMax, spCausa: causa, spOperacao: alvo, spUrl: url, cause: ultima });
  };
}

module.exports = { criarLeitor, transporteHttps, ehTransitorio, CODIGOS_TRANSITORIOS, HTTP_TRANSITORIOS };
