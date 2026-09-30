/* Regressão: as abas Ouro/Prata ou Feminina/Masculina são a rota de volta
 * entre linhas da chave. Filtrar uma linha não pode ocultar a própria barra.
 * node tests/chaves-abas-estaveis.test.js */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  if (condition) console.log('  ✓ ' + message);
  else { console.error('  ✗ ' + message); fail++; }
}

ok(src.includes('function _bracketTabsApply'), 'aplicador único mantém o estado da aba');
ok(src.includes("gb.style.background = onG ? 'linear-gradient(135deg,#fbbf24,#f59e0b)'"), 'aba principal ativa é visualmente trazida para frente');
ok(src.includes('border-radius:12px 12px 0 0'), 'abas principais usam o recorte de aba de planilha');
ok(!src.includes('[data-bracket-tab-empty="1"]{display:none!important;}'), 'filtro não oculta mais holders estruturais da chave');
ok(!src.includes("p.setAttribute('data-bracket-tab-holder', '1')"), 'montagem não marca ancestrais dos cards como escondíveis');
ok(src.includes("cb.style.display = ownG === gender ? '' : 'none'"), 'subabas só alternam pelo gênero ativo sem remover as abas principais');

console.log('\n' + (fail ? '❌' : '✅') + ' chaves-abas-estáveis: ' + (6 - fail) + ' asserts ok, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;
