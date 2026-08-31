/* O CONFERIDOR SOBREVIVE À REDE — e continua sem saber escrever
 * node tests/conferidor-sobrevive-a-rede.test.js
 *
 * O QUE ACONTECEU (30/ago/2026). `scripts/conferir-espelho-resultados.js` morreu no PRIMEIRO
 * GET com `UND_ERR_CONNECT_TIMEOUT` em 10.000 ms, três vezes seguidas — inclusive com
 * `NODE_OPTIONS=--dns-result-order=ipv4first`. Nenhum contador foi impresso. O pior desfecho
 * possível para uma auditoria: uma execução sem dado, fácil de confundir com "conferi".
 * Medido com curl no mesmo instante: connect 0,049s no IPv4 contra 5,035s no IPv6.
 *
 * ⛔ POR QUE `AbortSignal.timeout` FOI DESCARTADO: ele aborta a requisição, mas NÃO altera o
 * `connectTimeout` interno de 10s do undici — o defeito medido continuaria, só com outro
 * relógio disparando. Por isso o transporte passou a ser `node:https`, que aceita timeout de
 * socket explícito (cobre a fase de conexão, onde o socket fica ocioso).
 *
 * ⛔ ESTE TESTE NÃO TOCA A REDE. Todo caso injeta um transporte de mentira em
 * `criarLeitor({ transporte })`. Rede real deixaria o teste verde ou vermelho conforme o
 * humor da conexão — que é exatamente o problema que estamos consertando.
 *
 * O que ele prova, nesta ordem:
 *   ① timeout transitório seguido de sucesso TERMINA e devolve o corpo (contadores intactos);
 *   ② falha persistente encerra com diagnóstico — causa, operação, url e nº de tentativas;
 *   ③ erro NÃO transitório (403) não é retentado, para não mascarar permissão;
 *   ④ não existe caminho de escrita, nem no conferidor nem no helper;
 *   ⑤ o critério de comparação matches→results NÃO mudou.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const CONFERIDOR = path.join(RAIZ, 'scripts', 'conferir-espelho-resultados.js');
const HELPER = path.join(RAIZ, 'scripts', 'lib', 'leitura-resiliente.js');
const L = require(HELPER);

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }
const silencio = () => {};

(async () => {
  console.log('\n① timeout transitório seguido de sucesso: termina e entrega o corpo\n');
  {
    let n = 0;
    const ler = L.criarLeitor({
      tentativas: 4, esperaBaseMs: 1, log: silencio,
      transporte: async () => {
        n++;
        if (n < 3) throw Object.assign(new Error('connect timeout'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
        return { status: 200, ok: true, texto: '{"documents":[{"name":"a/b/c1"},{"name":"a/b/c2"}]}' };
      }
    });
    const r = await ler('https://x/y', {}, 'lista de prova');
    ok(n === 3, 'tentou 3 vezes (duas falhas transitórias + o acerto)');
    ok(r.ok && r.status === 200, 'e devolveu a resposta boa');
    const j = JSON.parse(r.texto);
    ok(j.documents.length === 2, '⭐ o CORPO chega íntegro — é dele que saem os contadores');
  }

  console.log('\n② falha persistente: encerra com diagnóstico, sem resumo\n');
  {
    let n = 0;
    const ler = L.criarLeitor({
      tentativas: 3, esperaBaseMs: 1, log: silencio,
      transporte: async () => { n++; throw Object.assign(new Error('timeout de 30000ms'), { code: 'SP_TIMEOUT' }); }
    });
    let erro = null;
    try { await ler('https://x/results', {}, 'espelho `results` de tour_9'); } catch (e) { erro = e; }
    ok(!!erro, 'lança em vez de devolver vazio (vazio viraria "0 divergentes")');
    ok(n === 3, 'e parou nas 3 tentativas — não é laço infinito');
    ok(erro.spLeituraFalhou === true, 'o erro é marcado como falha de leitura');
    ok(erro.spTentativas === 3, '   nº de tentativas: ' + erro.spTentativas);
    ok(erro.spCausa === 'SP_TIMEOUT', '   causa: ' + erro.spCausa);
    ok(erro.spOperacao === 'espelho `results` de tour_9', '   ⭐ operação LÓGICA, não só a url');
    ok(erro.spUrl === 'https://x/results', '   url: ' + erro.spUrl);
  }

  console.log('\n③ erro NÃO transitório não é retentado\n');
  {
    for (const [rotulo, resp] of [['403 (permissão)', { status: 403, ok: false, texto: '' }],
                                  ['404 (não existe)', { status: 404, ok: false, texto: '' }]]) {
      let n = 0;
      const ler = L.criarLeitor({ tentativas: 4, esperaBaseMs: 1, log: silencio, transporte: async () => { n++; return resp; } });
      const r = await ler('https://x/y', {}, 'prova');
      ok(n === 1, '⛔ ' + rotulo + ' → UMA tentativa só (retentar mascararia a resposta real)');
      ok(r.status === resp.status, '   e o status chega intacto pra quem chama decidir');
    }
    let n = 0;
    const ler = L.criarLeitor({ tentativas: 3, esperaBaseMs: 1, log: silencio, transporte: async () => { n++; return { status: 503, ok: false, texto: '' }; } });
    try { await ler('https://x/y', {}, 'prova'); } catch (e) { /* esperado */ }
    ok(n === 3, '503 (servidor instável) → esse SIM é retentado');
  }

  console.log('\n④ não existe caminho de escrita\n');
  {
    const ESCRITA = /method:\s*['"](POST|PUT|PATCH|DELETE)['"]|\.set\(|\.update\(|\.delete\(|\.commit\(\)|batch\(\)/;
    const srcC = fs.readFileSync(CONFERIDOR, 'utf8');
    const srcH = fs.readFileSync(HELPER, 'utf8');
    ok(!ESCRITA.test(srcC), 'o conferidor não tem verbo de escrita');
    ok(!ESCRITA.test(srcH), 'o helper não tem verbo de escrita');
    ok(/method:\s*'GET'/.test(srcH), '⭐ o helper fixa method GET literal — não há parâmetro pra virar escrita');
    ok(!/fetch\(/.test(srcC), 'e o conferidor não usa mais `fetch` direto (todo GET passa pelo helper)');
  }

  console.log('\n⑤ o critério de comparação NÃO mudou\n');
  {
    const src = fs.readFileSync(CONFERIDOR, 'utf8');
    ok(/Roster\.subdocSignature\(atual\)\s*!==\s*Roster\.subdocSignature\(esperado\)/.test(src),
      'a divergência continua sendo assinatura(atual) !== assinatura(esperado)');
    ok(/Roster\.buildSeedDoc\(t, porId\[id\]\)/.test(src), 'o esperado continua saindo de buildSeedDoc sobre a fonte montada');
    ok(/const campos = \['playerUids'\]\.concat\(Roster\.RESULT_FIELDS \|\| \[\], \['p1', 'p2', 'tournamentName', 'roundLabel'\]\)/.test(src),
      '⭐ a lista de campos comparados é a mesma, literal');
    ok(/if \(!atual\) \{ ausentes\.push\(id\); return; \}/.test(src), 'AUSENTE continua sendo "não há results para o id"');
    ok(/semEspelho \+= ausentes\.length;/.test(src) && /divergentes \+= diferentes\.length;/.test(src),
      'e os dois contadores somam do mesmo jeito');
    /* a ORDEM da auditoria também é parte da semântica: torneios → montar → results */
    const iMontar = src.indexOf('await montar(item.id');
    const iResults = src.indexOf('/results`, tk');
    ok(iMontar > 0 && iResults > iMontar, 'a ordem segue: monta o torneio ANTES de ler o espelho');
  }

  console.log('\n⑥ o script é sintaticamente válido e o helper é requerível\n');
  {
    const c = spawnSync(process.execPath, ['--check', CONFERIDOR], { encoding: 'utf8' });
    ok(c.status === 0, 'node --check no conferidor passa');
    const h = spawnSync(process.execPath, ['--check', HELPER], { encoding: 'utf8' });
    ok(h.status === 0, 'node --check no helper passa');
    ok(typeof L.criarLeitor === 'function' && typeof L.transporteHttps === 'function', 'o helper exporta criarLeitor e transporteHttps');
  }

  console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
  process.exit(fail ? 1 : 0);
})();
