/* A linha do critério de desempate NÃO pode perder o `display:flex` ao reaparecer.
 *
 * Relato do dono (22/ago/2026, print): _"pontos avancados ainda usa 4 linhas quando poderia
 * usar 2 com o x centralizado na altura e aquele artefato de arrastar a mesma coisa, como
 * estao todos os outros de 2 linhas"_.
 *
 * A CAUSA (medida no navegador, não deduzida): `Pontos Avançados` é a ÚNICA linha da lista
 * cuja visibilidade é ligada/desligada conforme o Sistema de Pontos Avançado. O código fazia
 *     tbAdv.style.display = ligado ? '' : 'none';
 * e `style.display = ''` **REMOVE** a propriedade do style inline — que é exatamente onde
 * mora o `display:flex` da linha. O <li> voltava pra `list-item`, os três blocos (alça ·
 * conteúdo · ✕) viravam três LINHAS empilhadas e a altura ia de 70px pra 118px, com a alça
 * no topo (23) e o ✕ no rodapé (99) em vez dos dois no centro (35).
 *
 * ⚠️ O defeito é ANTIGO e era invisível: enquanto os filhos do <li> eram todos inline
 * (spans e o button), perder o flex quase não mudava o desenho. Virou visível na 2.0.20,
 * quando o conteúdo passou a ser agrupado em blocos flex pra deixar o ✕ na direita.
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'create-tournament.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── criterio-nao-perde-o-flex-ao-reaparecer ────');

// ── 1. as linhas da lista DEPENDEM do display inline ──────────────────────────
const lis = SRC.match(/<li draggable="true" data-tb="[^"]+"[^>]*>/g) || [];
ok(lis.length === 9, 'as 9 linhas de critério estão no template · achado: ' + lis.length);
const semFlex = lis.filter((t) => !/display:flex/.test(t));
ok(semFlex.length === 0, 'toda linha declara display:flex no style inline (é ele que some) · sem flex: ' + semFlex.length);

// e o conteúdo é agrupado em BLOCOS flex — é isso que torna a perda do flex visível,
// e o motivo de este teste existir em vez de "é só cosmético".
const pa = (SRC.match(/<li draggable="true" data-tb="pontos_avancados"[\s\S]*?<\/li>/) || [])[0] || '';
ok(/flex:1 1 auto/.test(pa), 'o conteúdo que quebra é um bloco flex (flex:1 1 auto)');
ok(/flex:0 0 auto;margin-left:auto/.test(pa), 'o ✕ vive num bloco colado na direita (flex:0 0 auto + margin-left:auto)');

// ── 2. ⛔ ninguém restaura a visibilidade dessas linhas com '' ─────────────────
// Pega QUALQUER atribuição de display no alvo do toggle, não só a que existe hoje.
const toggles = SRC.match(/\w+\.style\.display\s*=\s*[^;]+;/g) || [];
const alvoDaLinha = /tbAdv\.style\.display\s*=\s*([^;]+);/;
const daLinha = toggles.filter((t) => alvoDaLinha.test(t));
ok(daLinha.length === 1, 'existe UM toggle de visibilidade da linha Pontos Avançados · achado: ' + daLinha.length);
daLinha.forEach((t) => {
  ok(!/\?\s*''\s*:/.test(t) && !/=\s*''\s*;/.test(t),
     "⛔ o toggle NÃO restaura com '' (isso apaga o display:flex do inline) · achado: " + t.trim());
  ok(/'flex'/.test(t),
     "🔒 o toggle restaura com 'flex' — o mesmo valor que o template declara · achado: " + t.trim());
});

// ── 3. e o seletor do toggle continua sendo o dessa linha ─────────────────────
ok(/querySelectorAll\('#tiebreaker-list li\[data-tb="pontos_avancados"\]/.test(SRC),
   'o toggle continua mirando a linha por data-tb (se o seletor mudar, revisar este teste)');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ criterio-nao-perde-o-flex-ao-reaparecer FALHOU'); process.exit(1); }
console.log('✅ criterio-nao-perde-o-flex-ao-reaparecer: OK');
