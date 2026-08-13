#!/usr/bin/env node
/* IDA E VOLTA: ficha do atleta → chave do torneio → ficha — node tests/volta-da-ficha-pro-torneio.test.js
 *
 * Pedido do dono (12/ago/2026), vendo a ficha do @FernandoBernacchi: _"sendo torneio do
 * scoreplace, poderia ser um link direto para o torneio no qual o voltar voltaria para
 * essa tela (assim se pode fazer uma consulta rápida a chave do torneio)"_.
 *
 * O QUE ESTE TESTE DEFENDE, e por que cada asserção existe:
 *   • o bilhete de volta é ANCORADO no destino — sem isso ele sequestraria o Voltar de
 *     qualquer tela aberta depois, e a pessoa clicaria Voltar num lugar e cairia noutro;
 *   • é de UM uso — senão a Análise reabriria a ficha toda vez que fosse aberta;
 *   • um `onClickOverride` explícito NUNCA é atropelado (quem passou sabe o que quer);
 *   • o <a> do torneio continua sendo um link de verdade: se o marcador falhar, a pessoa
 *     perde o atalho de volta, nunca o destino.
 *
 * Roda o CÓDIGO REAL: as funções são extraídas do js/store.js servido e avaliadas num
 * `window` de mentira. Reimplementar aqui deixaria o teste verde com o app quebrado.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m + (extra ? '  [' + extra + ']' : '')); }
};

// ── monta um browser de mentira e injeta SÓ os blocos reais que interessam ──
const src = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
function extrair(marcador, fim) {
  const i = src.indexOf(marcador);
  if (i < 0) throw new Error('não achei no store.js: ' + marcador);
  const j = src.indexOf(fim, i);
  if (j < 0) throw new Error('não achei o fim de: ' + marcador);
  return src.slice(i, j + fim.length);
}
const blocoVolta = extrair('window._spMarcarVolta = function', 'window._spLimparVolta = function () {\n  try { sessionStorage.removeItem(\'sp_volta\'); } catch (e) {}\n};');
const blocoHeader = extrair('window._renderBackHeader = function(opts) {', '\n  return (');

const store = {};
const sandbox = {
  window: { _backNavCallbacks: {}, location: { hash: '' } },
  sessionStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  JSON: JSON, Math: Math, String: String
};
sandbox.window.sessionStorage = sandbox.sessionStorage;
vm.createContext(sandbox);
vm.runInContext(blocoVolta, sandbox);
// o header inteiro depende de muita coisa; o que este teste checa é a DECISÃO do destino,
// que é exatamente o trecho novo. Ele é reexecutado aqui com o mesmo código do arquivo.
const trechoDestino = blocoHeader.slice(blocoHeader.indexOf('var _href = opts.href'),
                                        blocoHeader.indexOf('\n  return ('));
vm.runInContext('function _destino(opts) { opts = opts || {}; ' + trechoDestino + ' return _href; }', sandbox);

const W = sandbox.window;
const destino = (opts) => vm.runInContext('_destino(' + JSON.stringify(opts || {}) + ')', sandbox);

console.log('\n1. O bilhete só vale NA TELA que ele marcou');
W._spMarcarVolta({ para: '#analise/tour_1', aplicaEm: '#tournaments/tour_9', uid: 'u1' });
W.location.hash = '#tournaments/tour_9';
ok(destino({ href: '#dashboard' }) === '#analise/tour_1',
   'no torneio marcado, o Voltar aponta pra Análise de onde se veio', destino({ href: '#dashboard' }));

W.location.hash = '#tournaments/tour_OUTRO';
ok(destino({ href: '#dashboard' }) === '#dashboard',
   'em OUTRO torneio o Voltar continua o de sempre', destino({ href: '#dashboard' }));

console.log('\n2. Ir pra uma tela sem relação MATA o bilhete (não fica armado)');
W._spMarcarVolta({ para: '#analise/tour_1', aplicaEm: '#tournaments/tour_9', uid: 'u1' });
W.location.hash = '#venues';
ok(W._spLerVolta() === null, 'em tela sem relação o bilhete é descartado');
W.location.hash = '#tournaments/tour_9';
ok(W._spLerVolta() === null, 'e não ressuscita ao voltar pro torneio depois de descartado');

console.log('\n3. Override explícito nunca é atropelado');
W._spMarcarVolta({ para: '#analise/tour_1', aplicaEm: '#tournaments/tour_9', uid: 'u1' });
W.location.hash = '#tournaments/tour_9';
ok(destino({ href: '#dashboard', onClickOverride: 'algumaCoisa()' }) === '#dashboard',
   'quem passou onClickOverride manda no próprio Voltar');

console.log('\n4. Na VOLTA o bilhete ainda é legível — é quem diz qual ficha reabrir');
W._spMarcarVolta({ para: '#analise/tour_1', aplicaEm: '#tournaments/tour_9', uid: 'u77' });
W.location.hash = '#analise/tour_1';
const b = W._spLerVolta();
ok(!!b && b.uid === 'u77', 'de volta na Análise, o bilhete entrega o uid da ficha', JSON.stringify(b));
W._spLimparVolta();
ok(W._spLerVolta() === null, 'e é de UM uso — depois de consumido some');

console.log('\n5. A LINHA do torneio do scoreplace (varredura do código real)');
const rep = fs.readFileSync(path.join(raiz, 'js/views/tournaments-enrollment-report.js'), 'utf8');
ok(/_lzIrAoTorneio/.test(rep), 'a linha marca o bilhete antes de navegar');
ok(/href="#tournaments\/'/.test(rep) || /href="#tournaments\//.test(rep),
   'e continua sendo <a href> de verdade (funciona sem o JS do onclick)');
ok(/dupla variável/.test(rep), 'parceiro que muda vira "dupla variável" também aqui');
ok(/_lzReabrirFichaSeVoltou\(\)/.test(rep), 'a Análise reabre a ficha ao voltar');
// o reabrir tem que rodar DEPOIS do _renderPage: a ficha lê o contexto que ele monta.
const iRender = rep.indexOf('_renderPage(container, t, rows, byUid');
const iReabrir = rep.indexOf('_lzReabrirFichaSeVoltou();', iRender);
ok(iRender > 0 && iReabrir > iRender, 'e reabre DEPOIS de a página ter sido pintada');

console.log('\n6. Linha lida e muda passa a dizer por quê');
ok(/sem jogos publicados/.test(rep), 'torneio lido sem chave, sem data e sem categoria explica o vazio');
// ⛔ NÃO se repete aqui a regra do "não culpar a origem": ela já tem trava PRÓPRIA
// (tests/lz-nao-culpa-o-letzplay.test.js), que varre só o que vira TEXTO DE TELA e ignora
// comentário — a minha 1ª versão desta asserção era uma cópia pior e ficou vermelha em cima
// de um COMENTÁRIO. Duas versões da mesma lei é exatamente o que este projeto já pagou caro.
// O texto novo ("sem jogos publicados") passa por aquele teste, que roda no mesmo npm test.

console.log('\n' + (fail ? '✗' : '✅') + ' volta-da-ficha-pro-torneio: ' + pass + ' passaram, ' + fail + ' falharam');
if (fail) process.exit(1);
