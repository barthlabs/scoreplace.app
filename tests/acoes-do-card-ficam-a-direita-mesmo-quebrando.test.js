/* AS AÇÕES DO CARD FICAM À DIREITA — MESMO QUANDO A LINHA QUEBRA
 * node tests/acoes-do-card-ficam-a-direita-mesmo-quebrando.test.js
 *
 * RELATO DO DONO (28/ago/2026), com print: _"ausente/wo e excluir na esquerda é o
 * canônico caralho?"_. Não é. O cânone do card de inscrito é **tipo à ESQUERDA, ações à
 * DIREITA** (Presente/Ausente · toggle · W.O. · ✕), como o commit que canonizou o card
 * descreve e como `_inscritoActionRow` sempre quis dizer.
 *
 * ⛔ A CAUSA NÃO É OUTRO CARD — é o MESMO card com a linha quebrada. `justify-content`
 * age POR LINHA do flex. Com o card estreito, o texto do tipo ("Inscrição Individual")
 * enche a primeira linha e o grupo de ações QUEBRA pra segunda. Sozinho lá,
 * `space-between` não tem entre o que espaçar — e encosta o grupo na ESQUERDA.
 *
 * ⭐ `flex-end` resolve as duas: na linha CHEIA o `typeSpan` tem `flex:1 1 auto`, cresce e
 * consome a folga (nada muda); na linha QUEBRADA a ação vai pra direita.
 *
 * MESMA FAMÍLIA de [[feedback_margin_left_auto_morre_na_linha_cheia]]: alinhamento pensado
 * pra UMA linha desaparece quando ela vira duas. É a segunda vez que este repo apanha
 * disso — por isso a trava.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'participants.js'), 'utf8');

// ── a função REAL, extraída e executada ──────────────────────────────────────────
const i = src.indexOf('window._inscritoActionRow = function (typeText, presenceGroupHtml, delBtnHtml) {');
ok(i > 0, 'achei _inscritoActionRow — a linha canônica de tipo + ação');
const corpo = src.slice(src.indexOf('{', i) + 1, src.indexOf('\n};', i));
const linha = new Function('typeText', 'presenceGroupHtml', 'delBtnHtml', corpo);

const html = linha('Inscrição Individual', '<button>Ausente</button><button>W.O.</button>', '<button>x</button>');

console.log('\n① O contêiner alinha à direita — e isso vale em TODA linha, quebrada ou não');
const ext = html.slice(0, html.indexOf('>') + 1);
ok(/justify-content:\s*flex-end/.test(ext),
   '⛔ `flex-end`, não `space-between` — este último abandona o grupo na esquerda quando ele quebra sozinho pra 2ª linha');
ok(!/justify-content:\s*space-between/.test(ext),
   '⛔ e o `space-between` não voltou');
ok(/flex-wrap:\s*wrap/.test(ext),
   'a quebra continua permitida (card estreito precisa dela) — o que muda é o alinhamento DEPOIS de quebrar');

console.log('\n② O texto do tipo continua ocupando a esquerda na linha cheia');
ok(/flex:\s*1 1 auto/.test(html),
   '⛔ o typeSpan CRESCE e consome a folga — é isso que faz o `flex-end` não mudar nada quando tudo cabe');
ok(html.indexOf('Inscrição Individual') < html.indexOf('Ausente'),
   'e ele vem ANTES da ação na ordem do documento (esquerda → direita)');

console.log('\n③ O grupo de ação continua alinhado à direita por dentro');
ok(/justify-content:\s*flex-end;flex-shrink:0/.test(html) || /justify-content:\s*flex-end/.test(html.slice(html.indexOf('Inscrição Individual'))),
   'o próprio grupo de ações alinha à direita');

console.log('\n④ Sem tipo e sem ação, a linha não nasce');
ok(linha('', '', '') === '', 'linha vazia não vira div vazia no DOM');
ok(linha('', '<button>Ausente</button>', '') !== '', 'mas só com ação ela existe');

console.log(falhas === 0
  ? '\n✅ ação do card à direita, cabendo ou quebrando\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
