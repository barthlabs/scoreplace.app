/* LANÇAR PLACAR NÃO ROLA A TELA (leva 2.1.21)
 *
 * Ordem do dono (27/ago/2026): _"quando estamos lancando resultados a tela nao pode
 * scrollar de forma alguma. inferniza tudo. tem que ficar onde esta sempre ao lancar
 * resultado."_
 *
 * ⚠️ A CAUSA RAIZ é sutil e vale escrita, porque o conserto óbvio (mexer no scroll do
 * _rerenderBracket) NÃO era o certo — aquilo já preservava scroll, hscroll, inputs e o
 * estado dos <details>. Quem rolava era OUTRO caminho:
 *
 *   `<details ... ontoggle="window._demaisJogosAoAbrir(this)">` — e o ontoggle NÃO
 *   distingue quem abriu, o dedo ou o código. Depois de cada placar, `_rerenderBracket`
 *   restaura o estado dos <details> (`_newDetails[i].open = _detailsState[i]`); isso
 *   dispara o ontoggle, que faz scrollIntoView({behavior:'smooth'}) — a tela salta pro
 *   "Demais jogos da rodada" a cada confirmação.
 *
 * O segundo mecanismo era o laço `_reafirmar` da ENTRADA na chave (bracket.js): ele
 * corrige a posição do alvo de entrada por até ~3s, e quem entra e já começa a lançar cai
 * dentro dessa janela — dois donos do mesmo scroll.
 *
 * ⭐ A trava (`window._travaRolagemDaChave`) distingue INTENÇÃO de RESTAURAÇÃO: durante um
 * re-render, abrir um <details> ou reposicionar o alvo é restauração, e restauração não
 * rola nada. Não dá pra resolver "ajustando o tempo": não existe instante certo — a
 * rolagem de entrada e o lançamento são intenções diferentes, e a do dedo ganha sempre.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── lançar placar não rola a tela ────');

const ROOT = path.join(__dirname, '..');
const bracket = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');

// ── a trava liga no re-render e desliga depois da última restauração ─────────
const iRr = ui.indexOf('function _rerenderBracket');
const corpoRr = ui.slice(iRr, ui.indexOf('window._rerenderBracket = _rerenderBracket;', iRr));
const focusContext = { window: { _bracketOperationsScoreSource: {
  tournamentId: 't1', matchId: 'm1', at: Date.now()
} }, document: { querySelectorAll: () => [] }, Date };
vm.runInNewContext(ui.slice(ui.indexOf('var _scoreFocusGeneration'), iRr), focusContext);
ok(focusContext._focusNextAfterScore('t1', 'm1') === null &&
   focusContext.window._bracketOperationsScoreSource === null &&
   focusContext._scoreFocusGeneration === 1,
   'placar lançado na faixa invalida foco anterior e não programa novo salto');
ok(/window\._travaRolagemDaChave = true;/.test(corpoRr),
   '⛔ o re-render LIGA a trava de rolagem');
const iLiga = corpoRr.indexOf('_travaRolagemDaChave = true');
const iDesliga = corpoRr.indexOf('_travaRolagemDaChave = false');
ok(iLiga > 0 && iDesliga > iLiga,
   'e a DESLIGA só depois — soltar antes devolveria a janela em que o laço rola por cima');
ok(corpoRr.lastIndexOf('_restore();') < iDesliga,
   'o desligamento vem DEPOIS da última passada de restauração');

// ── a causa raiz: o ontoggle dos <details> ──────────────────────────────────
ok(/ontoggle="window\._demaisJogosAoAbrir\(this\)"/.test(bracket),
   'o <details> segue com ontoggle (é o gatilho legítimo quando o DEDO abre)');
const iDem = bracket.indexOf('window._demaisJogosAoAbrir = function');
const corpoDem = bracket.slice(iDem, iDem + 1400);
ok(/if \(window\._travaRolagemDaChave\) return;/.test(corpoDem),
   '⛔ mas ele NÃO rola quando a abertura veio da RESTAURAÇÃO do re-render (a causa raiz)');
const iGuard = corpoDem.indexOf('_travaRolagemDaChave');
const iScroll = corpoDem.indexOf('scrollIntoView');
ok(iGuard > 0 && iScroll > iGuard,
   'e a guarda vem ANTES do scrollIntoView (senão ela não guarda nada)');

// ── e o laço de entrada também para ─────────────────────────────────────────
const iTick = bracket.indexOf('var _tick = function ()');
const corpoTick = bracket.slice(iTick, iTick + 1600);
ok(/if \([^\n]*window\._travaRolagemDaChave\) return;/.test(corpoTick),
   '⛔ o laço que re-afirma a posição de ENTRADA para na hora em que se lança placar');
const iGoMine = bracket.indexOf('var _goMine = function (behavior)');
ok(/if \([^\n]*window\._travaRolagemDaChave\) \{ _removeEntryListeners\(\); return; \}/.test(bracket.slice(iGoMine, iGoMine + 1600)),
   'e a rolagem de entrada em si também respeita a trava');

// ── o que NÃO pode ter sido perdido no caminho ──────────────────────────────
// Se alguém "resolver" isto removendo a preservação, a tela para de pular porque para de
// restaurar — e aí perde scroll horizontal, placar digitado em outro jogo e seções abertas.
ok(/_lerRolagensDaChave\(\)/.test(corpoRr) && /_aplicarRolagensDaChave/.test(corpoRr),
   'a rolagem HORIZONTAL da chave continua preservada');
ok(/_typedScores/.test(corpoRr), 'o placar digitado em OUTRO jogo continua preservado');
ok(/_detailsState/.test(corpoRr), 'o estado aberto/fechado das seções continua preservado');

// A faixa operacional pode mudar de altura entre frames: o navegador ajusta o
// scroll sozinho. Uma rolagem feita pela pessoa nesse intervalo prevalece.
const frames = [], listeners = {}, timers = [];
const container = { offsetHeight: 1200, style: {}, querySelectorAll: () => [] };
const win = { location: { hash: '#bracket/t1' }, scrollX: 0, scrollY: 500,
  innerHeight: 800, _log() {}, _error() {},
  scrollTo(x, y) { this.scrollX = x; this.scrollY = y; },
  addEventListener(name, fn) { listeners[name] = fn; },
  removeEventListener(name, fn) { if (listeners[name] === fn) delete listeners[name]; } };
const context = { window: win, document: {
  getElementById: id => id === 'view-container' ? container : null,
  querySelectorAll: () => []
}, clearTimeout() {}, setTimeout(fn) { timers.push(fn); return timers.length; }, requestAnimationFrame: fn => frames.push(fn),
_lerRolagensDaChave: () => ({}), _aplicarRolagensDaChave() {}, renderBracket() {} };
vm.runInNewContext(ui.slice(iRr, ui.indexOf('window._rerenderBracket = _rerenderBracket;', iRr)), context);
context._rerenderBracket('t1');
win.scrollY = 462; frames.shift()();
ok(win.scrollY === 500, 'mudança de altura entre frames não desloca a janela após lançar placar');
listeners.wheel(); win.scrollY = 430; frames.shift()();
ok(win.scrollY === 430 && !listeners.wheel, 'rolagem da pessoa prevalece e os ouvintes temporários saem');
const fallbackIndex = timers.length;
context._rerenderBracket('t1');
timers[fallbackIndex]();
ok(!listeners.wheel, 'aba em segundo plano limpa ouvintes mesmo sem executar requestAnimationFrame');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
