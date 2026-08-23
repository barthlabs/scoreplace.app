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

/* ─────────────────────────────────────────────────────────────────────────────
 * VARREDURA GERAL (22/ago/2026) — a mesma armadilha nos OUTROS 14 toggles.
 *
 * O <li> de Pontos Avançados não era um caso isolado: create-tournament.js tem 15
 * lugares que restauram visibilidade com `elemento.style.display = <cond> ? '' : 'none'`.
 * Conferidos um a um no navegador (esconder e reaparecer pelo caminho REAL, medindo
 * geometria antes e depois): _enrollSec, _mpc, _sepc, _mpCont, _rrBtn, clr,
 * monarchDrawBtn, rrDrawBtn, preview, box, npsBox, estimContainer, ph, el, rows[1].
 * Nenhum outro quebrou — porque nenhum declara `display:flex|grid` no style do template.
 * Os que declaram display declaram `display:none` (estado inicial escondido), e aí o ''
 * é justamente a revelação pretendida.
 *
 * ⚠️ Então esta parte NÃO trava os 14 de hoje: trava o 15º que alguém escrever amanhã.
 * A regra é a invariante, não a lista: se o template declarar um display que NÃO seja
 * none, restaurar com '' apaga esse display — e o elemento desmonta ao reaparecer.
 * ───────────────────────────────────────────────────────────────────────────── */
console.log('──── varredura: nenhum toggle-com-"" mira elemento com display no template ────');

// 1) todo toggle que restaura com '' e mira uma variável
const TOGGLE = /(\w+)\.style\.display\s*=\s*([^;]+);/g;
const restauraComVazio = [];
let mt;
while ((mt = TOGGLE.exec(SRC)) !== null) {
  const [, nome, rhs] = mt;
  if (/''/.test(rhs)) restauraComVazio.push({ nome, rhs: rhs.trim(), pos: mt.index });
}
ok(restauraComVazio.length >= 10,
   'a varredura ainda acha os toggles-com-"" (se cair a zero, o regex quebrou) · achados: ' + restauraComVazio.length);

// 2) resolve cada variável até o id do elemento no template.
//    ⚠️ POR ESCOPO: `preview` é declarado 4× no arquivo (3× #logo-preview, 1× #category-preview).
//    Pegar a PRIMEIRA declaração do arquivo acusa #logo-preview (que declara display:flex mas
//    ninguém toca) e esconde o alvo real. Vale a declaração mais próxima ANTES do toggle.
function idDaVariavel(nome, pos) {
  const decl = new RegExp('\\b' + nome + '\\s*=\\s*document\\.getElementById\\(\\s*[\'"]([^\'"]+)[\'"]', 'g');
  let achado = null, m;
  while ((m = decl.exec(SRC)) !== null) {
    if (m.index > pos) break;
    achado = m[1];
  }
  return achado;
}
// 3) e do id pro atributo style que o template declara
function styleDoTemplate(id) {
  const m = SRC.match(new RegExp('<[a-z]+[^>]*\\bid="' + id.replace(/[-]/g, '\\-') + '"[^>]*>'));
  if (!m) return null;
  const s = m[0].match(/\bstyle="([^"]*)"/);
  return s ? s[1] : '';
}

const semResolver = [];
const culpados = [];
const conferidos = [];
restauraComVazio.forEach((t) => {
  const nome = t.nome;
  const id = idDaVariavel(nome, t.pos);
  if (!id) { semResolver.push(nome); return; }
  const style = styleDoTemplate(id);
  if (style === null) { semResolver.push(nome + ' (#' + id + ' fora do template)'); return; }
  const d = style.match(/(^|;)\s*display\s*:\s*([^;]+)/i);
  const rot = '#' + id + (d ? ' [display:' + d[2].trim() + ']' : '');
  if (conferidos.indexOf(rot) === -1) conferidos.push(rot);
  // ⛔ display no template que NÃO seja none: o '' apaga ele e o layout desmonta.
  if (d && d[2].trim().toLowerCase() !== 'none') culpados.push('#' + id + ' declara display:' + d[2].trim() + ' — restaurar com \'\' apaga isso');
});

ok(conferidos.length >= 8, 'a varredura resolveu os alvos até o template · resolvidos: ' + conferidos.length);
ok(culpados.length === 0,
   '⛔ toggle restaura com \'\' um elemento cujo template declara display ≠ none:\n     ' + culpados.join('\n     '));

// 4) o par suspend/restore (linha ~7299) é o jeito CERTO e precisa continuar sendo:
//    ele GRAVA o display inline antes de esconder, então o `|| ''` só cai no caso
//    em que não havia display inline nenhum. Se alguém tirar a gravação, vira o bug.
ok(/suspended\.push\(\{\s*el:\s*\w+,\s*prev:\s*\w+\.style\.display\s*\}\)/.test(SRC),
   'o suspend GRAVA o display inline antes de esconder (é o que torna o restore seguro)');
ok(/s\.el\.style\.display\s*=\s*s\.prev\s*\|\|\s*''/.test(SRC),
   'e o restore devolve o valor GRAVADO (s.prev), não um \'\' cego');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas (total do arquivo)');
if (fail > 0) { console.error('❌ varredura display:\'\' FALHOU'); process.exit(1); }
console.log('✅ varredura display:\'\': OK · alvos conferidos: ' + conferidos.join(', '));
