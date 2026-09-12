'use strict';
/* ⛔ RÓTULO NENHUM ENCAVALA OUTRO — E A HORA NÃO É UM CAMPO DE FORMULÁRIO.
 * Relato do dono (12/set/2026, régua da Fase 2 da Confra), em duas frentes:
 *   1. _"esses horários grandes estão muito ruins. deveria ser com a fonte do mesmo tamanho
 *      que as datas… quando for encavalar 2 datas e horários deveria colocar a próxima numa
 *      linha abaixo sem encavalar… eventualmente pode até usar uma terceira linha"_.
 *      No print: `23:0009:11` — dois rótulos um por cima do outro, ilegíveis e não editáveis.
 *   2. _"a data final aqui deveria estar na extrema direita"_.
 *
 * A CAUSA DO TAMANHO NÃO ERA O STYLE INLINE: `input[type="time"]` (components.css) manda
 * 0,9rem / 40px / min-width 5,75rem com `!important`, e `[type="time"]` é um ATRIBUTO — pesa
 * como classe, então `input[type="time"]` (0,1,1) VENCE `.rb-time` (0,1,0) mesmo com os dois
 * `!important`. MEDIDO no navegador: com a classe sozinha o campo continuou com 40px.
 * É essa armadilha que este teste tranca. [[feedback_medir_com_dado_real_antes_de_teorizar]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const RB = fs.readFileSync(path.join(root, 'js/views/round-bounds-core.js'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
const F2 = fs.readFileSync(path.join(root, 'js/views/format2-ui.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const ctx = { window: {} };
const i = RB.indexOf('  window._rbFaixas = function'), f = RB.indexOf('\n  /* Mede os rótulos', i);
assert.ok(i > 0 && f > i, 'âncoras de _rbFaixas');
vm.runInNewContext(RB.slice(i, f), ctx);
const faixas = ctx.window._rbFaixas;

// ── ① a regra na letra do dono ───────────────────────────────────────────────
must(faixas([{ left: 0, right: 50 }, { left: 200, right: 250 }], 6).join() === '0,0',
  '① rótulos que não se tocam ficam os dois na PRIMEIRA linha');
must(faixas([{ left: 0, right: 50 }, { left: 40, right: 90 }], 6).join() === '0,1',
  '① quando encavalaria, o próximo DESCE uma linha');
must(faixas([{ left: 0, right: 50 }, { left: 40, right: 90 }, { left: 100, right: 150 }], 6).join() === '0,1,0',
  '① ⭐ e o seguinte VOLTA pra linha original — a de baixo só existe enquanto a de cima está ocupada');
must(faixas([{ left: 0, right: 50 }, { left: 20, right: 70 }, { left: 40, right: 90 }], 6).join() === '0,1,2',
  '① três apertados usam até a TERCEIRA linha (o dono autorizou), nunca se sobrepõem');
const muitos = faixas([{ left: 0, right: 50 }, { left: 20, right: 70 }, { left: 40, right: 90 }, { left: 200, right: 250 }], 6);
must(muitos[3] === 0, '① e quem tem espaço volta pro topo, mesmo depois de três linhas');
// a folga é respeitada: encostar não vale como "coube"
must(faixas([{ left: 0, right: 50 }, { left: 52, right: 100 }], 6).join() === '0,1',
  '① encostar não é caber: a folga de 6px entra na conta');

// ── ② a DATA FINAL encosta na extrema direita ───────────────────────────────
const finalIni = RB.indexOf("data-rb-lbl-final");
const linhaFinal = RB.slice(finalIni, RB.indexOf('</span>', finalIni));
must(/left:100%/.test(linhaFinal) && /translateX\(-100%\)/.test(linhaFinal),
  '② o rótulo final é ancorado no fim da régua');
must(/align-items:flex-end/.test(linhaFinal),
  '② ⭐ e a DATA alinha pela direita — com `center` ela ficava centrada sobre o campo de hora, sobrando um dedo até a borda');

// ── ③ a hora da régua é rótulo, não campo de formulário ─────────────────────
must(/class="rb-time"/.test(F2), '③ o campo de hora da régua leva a classe `.rb-time`');
const regra = CSS.slice(CSS.indexOf('.rb-time {') - 40, CSS.indexOf('}', CSS.indexOf('.rb-time {')));
must(/input\[type="time"\]\.rb-time \{/.test(CSS),
  '③ ⛔ o seletor carrega `input[type="time"]` na frente — só assim VENCE a régua canônica (atributo pesa como classe)');
must(/font-size: 0\.62rem/.test(regra), '③ a fonte é a MESMA dos rótulos de data (0,62rem)');
must(/min-width: 0/.test(regra) && /width: auto/.test(regra),
  '③ e a largura é INTRÍNSECA — o campo pede o que o valor precisa, em 24h ou 12h, sem número chutado');
const inp = F2.slice(F2.indexOf('<input type="time" class="rb-time"'), F2.indexOf('>\';', F2.indexOf('<input type="time" class="rb-time"')));
must(!/width:58px/.test(inp) && !/font:700 0\.62rem/.test(inp),
  '③ ⛔ o style inline que PERDIA a disputa não ficou pra trás fingindo que manda');
must(!/monospace/.test(inp),
  '③ e a hora usa a MESMA fonte da data ao lado — monospace ao lado dela parecia outro tamanho');
const icone = CSS.slice(CSS.indexOf('.rb-time::-webkit-calendar-picker-indicator'), CSS.indexOf('}', CSS.indexOf('.rb-time::-webkit-calendar-picker-indicator')));
must(/display: none/.test(icone),
  '③ ⛔ SEM O RELÓGIO (ordem do dono): nesse tamanho o ícone nativo era metade do campo');

// ── ④ e alguém EXECUTA o empilhamento depois de cada pintura ────────────────
must(/root\.innerHTML = window\._rbSliderHtml[\s\S]{0,80}_rbEscalonaRotulos\(root\)/.test(RB),
  '④ ⛔ o empilhamento roda a cada repintura — o HTML é remontado a CADA arraste');
must(/data-rb-rotulos/.test(RB), '④ e a faixa de rótulos é marcada pra ser medida');

console.log('✅ ' + ok + ' asserções — a régua não encavala, a hora é do tamanho da data e o fim é o fim');
