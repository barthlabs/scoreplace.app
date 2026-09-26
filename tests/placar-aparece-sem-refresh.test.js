'use strict';
/* O PLACAR APARECE SEM REFRESH — a repintura depois da hidratação vale nas DUAS rotas.
 * node tests/placar-aparece-sem-refresh.test.js
 *
 * ⛔⛔ RELATO DO DONO, 26/set/2026, jogo 20: _"lancei o resultado, dei confirmar, ele recarregou mas
 * voltou 0-0, dei refresh na pagina e dai apareceu o resultado"_. E antes disso: _"já corrigimos isso"_.
 *
 * A CAUSA, MEDIDA — e são DOIS passos, não um:
 *   ① depois de a Function gravar, o cliente APAGA a marca de hidratação dos resultados
 *      (`_resultsHydrated`) e FORÇA uma repintura. Essa repintura acontece antes de a hidratação
 *      terminar, então ela pinta o espelho ainda vazio: é o 0-0 que ele viu;
 *   ② quem deveria repintar DE NOVO, quando a hidratação chega, estava guardado por
 *      `hash.split('/')[0] !== '#bracket'`. A chave é desenhada em DUAS rotas — `#bracket/:id` e o
 *      DETALHE `#tournaments/:id` (renderBracket, em tournaments.js). Lançando pelo detalhe, a segunda
 *      repintura era descartada e a tela ficava no 0-0 até o refresh à mão.
 *
 * ⛔ A LIÇÃO É A DE SEMPRE: a guarda nomeava UMA rota e a coisa acontece em duas.
 * [[feedback_enumerar_todos_os_caminhos_antes_de_dar_por_pronto]]
 * ⇒ A pergunta virou FUNÇÃO ÚNICA (`_rotaMostraAChaveDeste`), com teste. Quem acrescentar uma terceira
 * rota que desenha chave muda num lugar só.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./headless.js');
H.load('bracket-model.js');
const W = H.window;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o placar aparece sem refresh ────\n');

const porta = W._rotaMostraAChaveDeste;
ok(typeof porta === 'function', 'a porta única existe (achei ' + typeof porta + ')');

if (typeof porta === 'function') {
  /* ── ① AS DUAS ROTAS QUE DESENHAM A CHAVE ────────────────────────────────── */
  ok(porta('#bracket/abc', 'abc') === true, '① #bracket do mesmo torneio: repinta');
  ok(porta('#tournaments/abc', 'abc') === true,
    '① ⛔⛔ #tournaments do mesmo torneio TAMBÉM: era o caminho que ficava no 0-0');
  ok(porta('#tournaments/abc/qualquer-coisa', 'abc') === true,
    '① e uma sub-rota do detalhe continua sendo o detalhe');
  ok(porta('bracket/abc', 'abc') === true, '① com ou sem a cerquilha');
  ok(porta('#bracket/abc?x=1', 'abc') === true, '① e a query não atrapalha');

  /* ── ② TORNEIO DIFERENTE NÃO REPINTA ──────────────────────────────────────
   * ⛔ Repintar a tela de outro torneio é repintura errada: gasta render e pode mostrar dado de quem
   * não está sendo olhado. A comparação é pelo ID, não só pela rota. */
  ok(porta('#bracket/outro', 'abc') === false, '② outro torneio na mesma rota: não repinta');
  ok(porta('#tournaments/outro', 'abc') === false, '② idem no detalhe');

  /* ── ③ ROTA QUE NÃO DESENHA CHAVE NÃO REPINTA ────────────────────────────── */
  ['#dashboard', '#profile', '#participants/abc', '#ranking', '', '#'].forEach(function (h) {
    ok(porta(h, 'abc') === false, '③ ' + JSON.stringify(h) + ' não desenha chave: não repinta');
  });

  /* ── ④ ENTRADA TORTA NÃO EXPLODE E NÃO LIBERA ────────────────────────────── */
  ok(porta(null, 'abc') === false && porta(undefined, 'abc') === false,
    '④ hash ausente não libera repintura');
  ok(porta('#bracket/abc', '') === false && porta('#bracket/abc', null) === false,
    '④ ⛔ sem id não se decide nada — senão repintaria por qualquer torneio');
}

/* ── ⑤ E O CONSUMIDOR USA A PORTA, não um `if` próprio ──────────────────────
 * ⛔ Gate de texto de propósito: o defeito era um `if` copiado com uma rota dentro. Se voltar a ser um
 * `if` local, a próxima rota volta a ficar de fora e nada fica vermelho. */
const br = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const brCodigo = br.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(/_rotaMostraAChaveDeste\(window\.location\.hash, t\.id\)/.test(brCodigo),
  '⑤ ⛔⛔ a hidratação da chave decide pela porta única');
ok(!/split\('\/'\)\[0\] !== '#bracket'/.test(brCodigo),
  '⑤ ⛔ e o `if` com uma rota escrita dentro não existe mais');
/* ⛔⛔ PORTA AUSENTE NÃO LIBERA. Eu havia escrito o oposto — "se a função não existir, repinta" — e sem
 * a porta a repintura valia para QUALQUER torneio aberto, inclusive o errado. */
ok(/typeof window\._rotaMostraAChaveDeste !== 'function'[\s\S]{0,260}return;/.test(brCodigo),
  '⑤ ⛔⛔ sem a porta, NÃO repinta (e avisa) — em vez de repintar qualquer coisa');
/* ⛔ E a porta tem de ser carregada ANTES de quem a usa: é a diferença entre "grita" e "nunca funciona". */
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const iModel = idx.indexOf('js/views/bracket-model.js');
const iBracket = idx.indexOf('js/views/bracket.js');
ok(iModel > 0 && iBracket > iModel,
  '⑤ `bracket-model.js` (onde a porta mora) é carregado ANTES de `bracket.js`');

/* ── ⑥ A PRIMEIRA REPINTURA CONTINUA EXISTINDO ──────────────────────────────
 * ⚠️ Ela não é o defeito: ela é o que mostra a confirmação na hora, e o dono já tinha perdido um jogo
 * por relançar achando que não gravou. O defeito era ela ser a ÚNICA. As duas têm de existir. */
/* ⛔ POR ORDEM DE POSIÇÃO, não por janela de tamanho fixo — eu escrevi este bloco com uma janela de
 * 1600 caracteres e ele ficou vermelho sozinho, porque o trecho tem 2600. Tamanho fixo não é âncora, e
 * é a quarta vez que caio nisso nesta mesma leva. */
const st = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const iApaga = st.indexOf('delete _lt._resultsHydrated;');
const iSig = st.indexOf('_tdetailSig = null', iApaga);
const iSup = st.indexOf('_suppressSoftRefresh = false', iApaga);
const iFim = st.indexOf('\n    return r;', iApaga);
ok(iApaga > 0, '⑥ o ponto que apaga a marca de hidratação foi achado');
ok(iSig > iApaga && iSig < iFim,
  '⑥ a repintura forçada logo após a gravação continua lá (mostra a confirmação na hora)');
ok(iSup > iApaga && iSup < iFim,
  '⑥ e ela solta o silenciador, que existe para calar eco alheio e não a própria confirmação');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
