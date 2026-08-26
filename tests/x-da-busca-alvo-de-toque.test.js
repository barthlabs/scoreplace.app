/* ✕ DA BUSCA — alvo de toque de 44px no celular
 *   node tests/x-da-busca-alvo-de-toque.test.js
 *
 * RELATO DO DONO (15/ago/2026):
 *   "no celular, o x da barra de buscas/filtro para limpar o texto ali digitado está
 *    difícil de clicar. ao clicar acaba aparecendo o copiar, colar…"
 *
 * CAUSA — MEDIDA no navegador com a função REAL (`_inscritosFilterBar`), comparando a
 * geometria antiga e a nova no mesmo lugar, com `elementFromPoint`:
 *
 *   ANTES: o círculo de 20px ERA o alvo. Errar o centro por 12px já entregava o toque ao
 *          <input> que está atrás → o campo posiciona o cursor e o iOS abre o menu de
 *          seleção. Ou seja o "copiar/colar" NÃO era um segundo defeito: era o sintoma
 *          de ter errado o botão.
 *              desvio  4px → BOTAO ·  8px → BOTAO
 *              desvio 12px → INPUT · 16px → INPUT · 20px → INPUT
 *   DEPOIS: alvo de 44×44 (o mínimo de toque), círculo visível ainda com 20px.
 *              desvio 20px em QUALQUER direção → BOTAO
 *
 * A polpa do dedo tem ~9mm (~40px em densidade típica): 20px sempre foi menos da metade
 * do necessário — o difícil era acertar, não clicar.
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. o alvo tem 44px e é transparente; o DESENHO continua sendo o ✕ canônico de 20px;
 *   B. o alvo fica ACIMA do input (z-index) — senão o campo continuaria roubando o toque;
 *   C. o texto do campo não corre por baixo do alvo (padding-right ≥ 44);
 *   D. o cânone do símbolo fica INTOCADO (.cancel-x-btn segue desenhando o X);
 *   E. os ids não mudaram — `_fbSearchInput`/`_fbClearSearch` alternam o botão por
 *      `searchId + '-clear'` e continuam funcionando;
 *   F. o gesto não vira seleção de texto nem sofre o atraso do duplo-toque.
 */

const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');

// o trecho que monta o campo de busca da barra canônica
const i0 = STORE.indexOf("var _clr = \"window._fbClearSearch('\"");
const BLOCO = _R.ateOFim(STORE, i0);
ok(i0 > 0, '0. o bloco do campo de busca da barra canônica foi encontrado');

// ═══════════════════════════════════════════════════════════════════════════
// A/D. ALVO ≠ DESENHO
// ═══════════════════════════════════════════════════════════════════════════
ok(BLOCO.indexOf('class="fb-clear-btn"') !== -1,
  'A1. o botão usa a classe de ALVO DE TOQUE (fb-clear-btn)');
ok(/\.fb-clear-btn\s*\{[^}]*width:\s*44px/.test(CSS),
  'A2. o alvo tem 44px de largura — o mínimo de toque');
ok(/\.fb-clear-btn\s*\{[^}]*top:\s*0[^}]*bottom:\s*0/.test(CSS),
  'A3. o alvo cobre a ALTURA INTEIRA do campo (errar pra cima/baixo também acerta)');
ok(/\.fb-clear-btn\s*\{[^}]*background:\s*transparent/.test(CSS),
  'A4. o alvo é invisível — quem aparece é o círculo, não a área');
ok(/<span class="cancel-x-btn" style="--cx-size:20px;"/.test(BLOCO),
  'D1. o DESENHO continua sendo o ✕ canônico, com os mesmos 20px de antes');
ok(CSS.indexOf('.cancel-x-btn::before,') !== -1 && CSS.indexOf('.cancel-x-btn::after {') !== -1,
  'D2. o cânone do símbolo segue desenhando o X com ::before/::after (por isso o alvo teve de ser outro elemento)');
// ⚠️ o motivo de não ter feito o óbvio (esticar o próprio .cancel-x-btn): ele é o símbolo
// UNIVERSAL de cancelar do app (sair do local, remover co-organizador…). Mexer no tamanho
// dele mudaria TODAS essas telas por causa de um campo de busca.
ok(/\.cancel-x-btn\s*\{[\s\S]{0,400}--cx-size:\s*24px/.test(CSS),
  'D3. o tamanho padrão do símbolo canônico não foi alterado (segue 24px)');

// ═══════════════════════════════════════════════════════════════════════════
// B/C. O CAMPO NÃO ROUBA MAIS O TOQUE
// ═══════════════════════════════════════════════════════════════════════════
ok(/\.fb-clear-btn\s*\{[^}]*z-index:\s*2/.test(CSS),
  'B1. o alvo fica ACIMA do input — sem isso o campo continuaria recebendo o toque');
const padM = BLOCO.match(/padding:0 (\d+)px 0 10px/);
ok(padM && Number(padM[1]) >= 44,
  'C1. o texto não corre por baixo do alvo (padding-right ' + (padM ? padM[1] : '?') + 'px ≥ 44)');

// ═══════════════════════════════════════════════════════════════════════════
// E. OS HANDLERS CONTINUAM ACHANDO O BOTÃO
// ═══════════════════════════════════════════════════════════════════════════
ok(BLOCO.indexOf("id=\"' + opts.searchId + '-clear\"") !== -1,
  'E1. o id do botão continua sendo searchId + "-clear"');
['_fbSearchInput', '_fbClearSearch'].forEach(function (fn) {
  const i = STORE.indexOf('window.' + fn + ' = function');
  const corpo = STORE.slice(i, STORE.indexOf('\n};', i));
  ok(corpo.indexOf("searchId + '-clear'") !== -1,
    'E2. ' + fn + ' alterna o botão pelo mesmo id (mostrar/esconder segue funcionando)');
});
ok(BLOCO.indexOf('onclick="\' + _clr + \'"') !== -1,
  'E3. o clique continua chamando _fbClearSearch');

// ═══════════════════════════════════════════════════════════════════════════
// F. O GESTO NÃO VIRA SELEÇÃO NEM ESPERA O DUPLO-TOQUE
// ═══════════════════════════════════════════════════════════════════════════
ok(/\.fb-clear-btn\s*\{[^}]*touch-action:\s*manipulation/.test(CSS),
  'F1. touch-action:manipulation — sem o atraso de ~300ms do duplo-toque');
ok(/\.fb-clear-btn\s*\{[^}]*user-select:\s*none/.test(CSS),
  'F2. o gesto sobre o botão não vira seleção de texto (era daí que vinha o copiar/colar)');
ok(BLOCO.indexOf('aria-label="Limpar busca"') !== -1,
  'F3. o botão tem rótulo acessível (o glifo agora mora num <span> aria-hidden)');
ok(BLOCO.indexOf('aria-hidden="true"') !== -1,
  'F4. o círculo decorativo é escondido do leitor de tela');
// realce na área toda: alvo grande com retorno visual só no miolo mente sobre onde clicar
ok(CSS.indexOf('.fb-clear-btn:hover .cancel-x-btn') !== -1 &&
   CSS.indexOf('.fb-clear-btn:active .cancel-x-btn') !== -1,
  'F5. hover/active respondem na área inteira, não só nos 20px do círculo');

console.log('\n✕ BUSCA — alvo de toque de 44px');
console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
console.log('   ✅ tudo verde');
