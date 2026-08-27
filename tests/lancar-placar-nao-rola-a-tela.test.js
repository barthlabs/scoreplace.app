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

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── lançar placar não rola a tela ────');

const ROOT = path.join(__dirname, '..');
const bracket = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
const ui = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');

// ── a trava liga no re-render e desliga depois da última restauração ─────────
const iRr = ui.indexOf('function _rerenderBracket');
const corpoRr = ui.slice(iRr, ui.indexOf('\n}', ui.indexOf('_restore();', iRr)));
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
ok(/if \(window\._travaRolagemDaChave\) return;/.test(corpoTick),
   '⛔ o laço que re-afirma a posição de ENTRADA para na hora em que se lança placar');
const iGoMine = bracket.indexOf('var _goMine = function (behavior)');
ok(/if \(window\._travaRolagemDaChave\) return;/.test(bracket.slice(iGoMine, iGoMine + 700)),
   'e a rolagem de entrada em si também respeita a trava');

// ── o que NÃO pode ter sido perdido no caminho ──────────────────────────────
// Se alguém "resolver" isto removendo a preservação, a tela para de pular porque para de
// restaurar — e aí perde scroll horizontal, placar digitado em outro jogo e seções abertas.
ok(/_lerRolagensDaChave\(\)/.test(corpoRr) && /_aplicarRolagensDaChave/.test(corpoRr),
   'a rolagem HORIZONTAL da chave continua preservada');
ok(/_typedScores/.test(corpoRr), 'o placar digitado em OUTRO jogo continua preservado');
ok(/_detailsState/.test(corpoRr), 'o estado aberto/fechado das seções continua preservado');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
