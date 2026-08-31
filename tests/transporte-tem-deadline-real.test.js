/* O TRANSPORTE TEM DEADLINE DE PAREDE — inclusive quando não existe socket
 * node tests/transporte-tem-deadline-real.test.js
 *
 * O QUE ACONTECEU. R0.4 passou em teste simulado e foi REPROVADA contra produção pelo Codex:
 * `node scripts/conferir-espelho-resultados.js --detalhe` imprimiu só o cabeçalho e ficou
 * vivo por MAIS DE 3 MINUTOS, sem contador nenhum, até ser morto à mão.
 *
 * A causa: `https.request({ timeout })` não é deadline. Essa opção vira `socket.setTimeout`,
 * e o socket só existe DEPOIS do DNS resolver e do agent entregar conexão. Enquanto o DNS
 * pendura — ou a requisição espera na fila do agent — NÃO HÁ SOCKET, logo não há relógio, e
 * o evento `'timeout'` nunca chega. A promessa de "30s por tentativa" era falsa nesse trecho,
 * que é justamente onde a rede daquele ambiente travava.
 *
 * ⛔ POR QUE O TESTE ANTERIOR NÃO PEGOU: ele injetava um transporte de mentira que sempre
 * respondia ou sempre lançava. Nunca exercitou "não responde nada" — o único caso em que o
 * bug aparece. Teste que só percorre os caminhos que o autor imaginou certifica a imaginação.
 * Ver [[feedback_tests_must_reproduce_real_failure]].
 *
 * As duas metades, porque cada uma sozinha deixa passar:
 *   ① SOCKET REAL que nunca responde — servidor TCP local que aceita e some, então o
 *      handshake TLS pendura. Prova o caminho de rede de verdade.
 *   ② NENHUM SOCKET — `https.request` dublê que não cria socket e não emite nada, que é a
 *      condição exata do DNS pendurado. Aqui roda o transporte REAL (o timer, o destroy, a
 *      limpeza); só o miolo do `node:https` é dublê. É a metade que o defeito exigia.
 */
const net = require('net');
const path = require('path');
const https = require('node:https');

const RAIZ = path.join(__dirname, '..');
const CAMINHO_HELPER = path.join(RAIZ, 'scripts', 'lib', 'leitura-resiliente.js');
const L = require(CAMINHO_HELPER);

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }
const silencio = () => {};

(async () => {
  console.log('\n① socket REAL que nunca responde (TCP aceita, TLS pendura)\n');
  {
    /* ⚠️ GUARDE OS SOCKETS ACEITOS. `srv.close(cb)` só chama de volta quando TODAS as
     * conexões terminarem — e a conexão deste caso fica pendurada de propósito. Esperar por
     * esse callback travou o teste na primeira versão: ele parou depois desta seção, com
     * exit 0 e as seções seguintes nunca rodando (um "verde" que não mediu nada). */
    const abertos = [];
    const srv = net.createServer((s) => { abertos.push(s); /* aceita e não responde nada */ });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const porta = srv.address().port;
    const PRAZO = 700;
    const get = L.transporteHttps(PRAZO);
    const t0 = Date.now();
    let erro = null;
    try { await get('https://127.0.0.1:' + porta + '/x', {}); } catch (e) { erro = e; }
    const gasto = Date.now() - t0;
    ok(!!erro, 'a tentativa TERMINA (não fica pendurada)');
    ok(erro && erro.code === 'SP_TIMEOUT', '   com code SP_TIMEOUT (obtido: ' + (erro && erro.code) + ')');
    ok(gasto >= PRAZO && gasto < PRAZO + 1500, '⭐ dentro do prazo: ' + gasto + 'ms para deadline de ' + PRAZO + 'ms');
    ok(L.ehTransitorio(erro), '   e é classificado como transitório, então a política retenta');
    abertos.forEach((s) => { try { s.destroy(); } catch (e) {} });
    srv.close();
  }

  console.log('\n② NENHUM socket criado — a condição do DNS pendurado\n');
  {
    /* ⛔ Este é o caso que reprovou a leva. O dublê substitui só o miolo do node:https:
     * devolve um objeto de requisição que NUNCA emite 'response', 'error' nem 'timeout', e
     * jamais cria socket. Com o timeout antigo (socket.setTimeout) isso pendurava para
     * sempre. O transporte REAL continua rodando — timer, destroy e limpeza são os de
     * produção. */
    const original = https.request;
    let destruiu = 0, criadas = 0;
    https.request = function () {
      criadas++;
      return {
        on() { return this; },
        end() { /* silêncio absoluto: sem socket, sem evento, sem resposta */ },
        destroy() { destruiu++; }
      };
    };
    try {
      const PRAZO = 300;
      const get = L.transporteHttps(PRAZO);
      const t0 = Date.now();
      let erro = null;
      try { await get('https://host.que.nunca.responde/x', {}); } catch (e) { erro = e; }
      const gasto = Date.now() - t0;
      ok(criadas === 1, 'uma requisição foi criada');
      ok(!!erro && erro.code === 'SP_TIMEOUT', '⭐ TERMINA mesmo sem socket algum (code: ' + (erro && erro.code) + ')');
      ok(gasto >= PRAZO && gasto < PRAZO + 1000, '   dentro do prazo: ' + gasto + 'ms para ' + PRAZO + 'ms');
      ok(destruiu >= 1, '⭐ a requisição foi DESTRUÍDA (destroy chamado ' + destruiu + '×)');
    } finally { https.request = original; }
  }

  console.log('\n③ o timer é limpo — processo não fica vivo depois do trabalho\n');
  {
    const original = https.request;
    https.request = function (opts, cb) {
      const res = { statusCode: 200, setEncoding() {}, _o: {}, on(ev, fn) { this._o[ev] = fn; return this; } };
      return {
        on() { return this; },
        destroy() {},
        end() {
          process.nextTick(() => { cb(res); process.nextTick(() => { res._o.data('{"ok":1}'); res._o.end(); }); });
        }
      };
    };
    try {
      const get = L.transporteHttps(60000);   // deadline LONGO de propósito
      const t0 = Date.now();
      const r = await get('https://x/y', {});
      ok(r.status === 200 && r.texto === '{"ok":1}', 'sucesso devolve status e corpo');
      /* ⭐ Se o timer de 60s tivesse ficado pendurado, o processo não morreria no fim desta
       * suíte. O `handles` ativos são a prova direta e não dependem de esperar 60s. */
      const pendentes = (process._getActiveHandles ? process._getActiveHandles() : []).length;
      const timers = typeof process.getActiveResourcesInfo === 'function'
        ? process.getActiveResourcesInfo().filter((x) => x === 'Timeout').length : 0;
      ok(timers === 0, '⭐ nenhum Timeout ativo depois do sucesso (o deadline foi limpo)');
      ok(Date.now() - t0 < 1000, '   e voltou na hora, sem esperar o deadline');
      void pendentes;
    } finally { https.request = original; }
  }

  console.log('\n④ as retentativas acabam no limite\n');
  {
    const original = https.request;
    let criadas = 0;
    https.request = function () {
      criadas++;
      return { on() { return this; }, end() {}, destroy() {} };   // nunca responde
    };
    try {
      const ler = L.criarLeitor({ tentativas: 3, timeoutMs: 120, esperaBaseMs: 1, log: silencio });
      const t0 = Date.now();
      let erro = null;
      try { await ler('https://host.morto/x', {}, 'listagem de prova'); } catch (e) { erro = e; }
      const gasto = Date.now() - t0;
      ok(criadas === 3, '⭐ exatamente 3 tentativas — não é laço infinito (obtido: ' + criadas + ')');
      ok(!!erro && erro.spLeituraFalhou === true, 'termina com falha de leitura marcada');
      ok(erro.spTentativas === 3 && erro.spCausa === 'SP_TIMEOUT', '   tentativas=' + erro.spTentativas + ' causa=' + erro.spCausa);
      ok(erro.spOperacao === 'listagem de prova', '   com a operação lógica');
      ok(gasto < 5000, '   e o conjunto todo cabe em ' + gasto + 'ms (deadline × tentativas + espera)');
    } finally { https.request = original; }
  }

  console.log('\n⑤ o transporte segue sendo só GET\n');
  {
    const fs = require('fs');
    const src = fs.readFileSync(CAMINHO_HELPER, 'utf8');
    /* ⚠️ SEM OS COMENTÁRIOS. O cabeçalho do helper EXPLICA por que `undici`/`setGlobalDispatcher`
     * foram descartados — e a primeira versão desta asserção reprovou por causa da própria
     * explicação. Peneira que lê comentário mede prosa, não código. */
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(/method:\s*'GET'/.test(codigo), "method: 'GET' literal");
    ok(!/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/.test(codigo), 'nenhum verbo de escrita');
    ok(!/setGlobalDispatcher|require\(['"]undici['"]\)|\bfetch\s*\(/.test(codigo), '⛔ não voltou para undici/fetch');
    ok(/setTimeout\(/.test(codigo) && /clearTimeout\(/.test(codigo), 'timer explícito, com limpeza');
  }

  console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
  process.exitCode = fail ? 1 : 0;
})();
