'use strict';
/* ⛔ UMA RÉGUA SÓ PARA A GRADE, E A COR DO ESTADO VENCE A DA PRESENÇA.
 * Dois relatos do dono no mesmo painel (12/set/2026):
 *   (a) _"os cards da lista de espera deveriam ter tom âmbar e não essa tarja idiota de lista
 *       de espera em âmbar"_ — o âmbar ESTAVA escrito desde a leva anterior e nunca apareceu.
 *       MEDIDO: `_presenceCardStyle` devolve `background:… !important` e entra por ÚLTIMO na
 *       linha de estilo do card; `!important` inline vence, então a presença ("Ausente")
 *       pintava de azul por cima da cor do ESTADO. O vermelho dos inativos só sobreviveu
 *       porque, para inativo, a fábrica de presença devolve string vazia.
 *   (b) _"nessa largura de tela os cards de espera, inativo, W.O. deveriam ser mais colunas —
 *       isso cabe e já fazemos em outras situações. isso deve ser consistente sempre;
 *       canônico"_ — os dois painéis usavam `flex-direction:column`, UMA coluna em qualquer
 *       largura, enquanto os inscritos já tinham grade responsiva.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const PART = fs.readFileSync(path.join(raiz, 'js/views/participants.js'), 'utf8');
const BRK  = fs.readFileSync(path.join(raiz, 'js/views/bracket.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① a grade é UMA, declarada num lugar só ─────────────────────────────────
must(/^window\._GRADE_DE_CARDS = '/m.test(PART),
  '① a constante é atribuída no TOPO do arquivo (coluna 0) — dentro de função ela não existiria');
must(/window\._GRADE_DE_CARDS\s*=\s*'display:grid;grid-template-columns:repeat\(auto-fill, minmax\(min\(100%, 440px\), 1fr\)\);gap:1rem;'/.test(PART),
  '① a grade canônica é uma constante única, com o min(100%,440px) que garante 1 coluna no celular');
const decls = (PART + BRK).match(/_GRADE_DE_CARDS\s*=/g) || [];
must(decls.length === 1, '① ⛔ e é declarada UMA vez só (achei ' + decls.length + ') — duas réguas divergem');

// ── ② quem desenha card de inscrito usa a constante ─────────────────────────
must(/gridStyle = window\._GRADE_DE_CARDS;/.test(PART), '② a grade dos inscritos usa a constante');
const usosBrk = (semComentario(BRK).match(/window\._GRADE_DE_CARDS/g) || []).length;
must(usosBrk === 2, '② espera e inativos/W.O. usam a MESMA constante (achei ' + usosBrk + ' de 2)');

// ── ③ ⛔ a coluna única não sobrou em nenhum dos dois painéis ────────────────
const iniEsp = BRK.indexOf('const listItems = _solosWL.map');
const fimEsp = BRK.indexOf('// ─── Substituição de jogador/time da Lista de Espera', iniEsp);
assert.ok(iniEsp > 0 && fimEsp > iniEsp, 'âncoras: o painel da Lista de Espera');
const painel = semComentario(BRK.slice(iniEsp, fimEsp));
const colunaUnica = (painel.match(/display:flex;flex-direction:column;gap:6px;/g) || []).length;
must(colunaUnica === 0,
  '③ ⛔ nenhum contêiner de cards ficou em coluna única no painel (achei ' + colunaUnica + ')');

// ── ④ a cor do ESTADO vence a da presença ───────────────────────────────────
const part = semComentario(PART);
must(/if \(_isStandbyEntry \|\| ctx\.pele === 'fora'\) _rcCardExtra = '';/.test(part),
  '④ card com cor de estado (esperando vaga, ou fora) não recebe o fundo da presença');
const posZera = part.indexOf("_rcCardExtra = '';");
const posUso  = part.indexOf("+ _rcCardExtra +");
must(posZera > 0 && posUso > posZera,
  '④ ⛔ e a limpeza acontece ANTES do uso no HTML — depois não adiantaria nada');
const posFora = part.indexOf("if (ctx.pele === 'fora') cardStyle =");
must(posFora > 0 && posZera > posFora,
  '④ a limpeza vem depois de a cor de estado ser decidida, então enxerga o estado final');

// ── ⑤ a tarja saiu ──────────────────────────────────────────────────────────
must(!/🕐 Lista de Espera/.test(PART),
  '⑤ ⛔ a tarja "Lista de Espera" não é mais desenhada no card — a cor diz o estado');
must(/var typeText = teamLabel;/.test(part),
  '⑤ e o lugar dela volta a mostrar o tipo de inscrição, como nos outros cards');

console.log('\n✅ espera e fora usam a grade e a cor canônicas — ' + ok + ' verificações');
