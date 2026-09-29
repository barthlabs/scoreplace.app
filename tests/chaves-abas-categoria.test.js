/* Regressão: categorias paralelas da chave não podem voltar a ser uma pilha.
 * A navegação é visual: os jogos permanecem a fonte canônica e a busca abre a
 * aba que contém o resultado. node tests/chaves-abas-categoria.test.js */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
let fail = 0, pass = 0;
function ok(v, text) { if (v) { pass++; console.log('  ✓ ' + text); } else { fail++; console.error('  ✗ ' + text); } }

const tabs = src.slice(src.indexOf('function _bracketTabGender'), src.indexOf('function _applyMyMatchesFilter'));
const card = src.slice(src.indexOf('function renderMatchCard'), src.indexOf('// Rodapé do card:', src.indexOf('function renderMatchCard')));
const filter = src.slice(src.indexOf('window._bracketApplyFilter'), src.indexOf('window._bracketApplyFilter', src.indexOf('window._bracketApplyFilter') + 1));

ok(tabs.includes("return 'fem'") && tabs.includes("return 'masc'"), 'separa abas Feminina e Masculina pela categoria canônica');
ok(tabs.includes('data-bracket-tab-category-button') && tabs.includes('data-bracket-tab-gender'), 'cada gênero expõe suas categorias em subabas');
ok(tabs.includes('card.hidden ='), 'trocar aba oculta os cards fora da categoria sem duplicar a chave');
ok(tabs.includes('window._bracketTabState'), 'a aba escolhida permanece ao re-renderizar placar ou W.O.');
ok(tabs.includes('window._bracketTabsRevealSearch'), 'há caminho explícito para a busca revelar a aba do resultado');
ok(card.includes('data-bracket-tab-category=') && card.includes('data-bracket-tab-gender='), 'card declara categoria e gênero para a navegação');
ok(src.includes('window._bracketTabsRevealSearch();'), 'o filtro da busca chama a revelação da aba correspondente');
ok(card.includes('tierLabel') && card.includes('gold|silver|line'), 'linhas independentes como Ouro/Prata também recebem abas');
ok(tabs.includes('tiersMeetAtFinal') && tabs.includes("data-bracket-tab-source") && card.includes('data-bracket-tab-source='), 'Ouro/Prata só se separam quando não convergem em uma grande final');
ok(tabs.includes('.bracket-round-column>div:first-child{position:sticky'), 'o rótulo da rodada permanece visível dentro da coluna ao rolar');

console.log('\n' + (fail ? '❌' : '✅') + ' chaves-abas-categoria: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;
