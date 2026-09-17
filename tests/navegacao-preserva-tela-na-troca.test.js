/* Dashboard e detalhe não podem virar uma tela de carregamento no meio da troca.
 * node tests/navegacao-preserva-tela-na-troca.test.js
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const router = fs.readFileSync(path.join(root, 'js/router.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
let fail = 0;
function ok(value, message) {
  if (value) console.log('  ✓ ' + message);
  else { fail++; console.error('  ✗ ' + message); }
}
console.log('──── navegação preserva a tela anterior ────');

const start = router.indexOf('TROCA DASHBOARD ↔ TORNEIO NÃO PODE APAGAR A TELA ANTERIOR');
const end = router.indexOf('/* ⭐ E QUANDO', start);
const gate = router.slice(start, end);
ok(start >= 0, 'a troca dashboard ↔ torneio tem um gate próprio');
ok(/_viewAnterior/.test(gate) && /_trocaPrincipal/.test(gate), 'o gate compara origem e destino');
ok(/dashboard/.test(gate) && /tournaments/.test(gate), 'o gate cobre os dois sentidos');
ok(/classList\.add\('sp-route-transitioning'\)/.test(gate), 'a tela anterior fica inerte durante a troca');
ok(/!_shouldPreservePrerender && !_reentrada && !_trocaPrincipal/.test(router),
  'o container não é limpo enquanto o destino ainda está carregando');
ok(/!window\._isSoftRefresh && !_trocaPrincipal && typeof window\._showLoading/.test(router),
  'o loader de tela cheia não encobre uma tela que já existe');
ok(/finally \{ _finalizarTrocaPrincipal\(\); \}/.test(router),
  'dashboard remove a inércia assim que termina de renderizar');
ok(/_finalizarTrocaPrincipal\(\);\s*\/\/ ── O LOADER SÓ SAI COM OS NOMES/s.test(router),
  'detalhe remove a inércia ao entregar o render completo');
ok(/!viewContainer\.firstChild && !_trocaPrincipal/.test(router),
  'a rede de segurança não injeta o spinner pequeno durante a transição válida');
ok(/window\._ultimaRotaPintada = _rotaKey;/.test(gate) && /if \(!_trocaPrincipal\) window\._ultimaRotaPintada = _rotaKey;/.test(router),
  'a rota só é carimbada depois que a troca assíncrona realmente entregou o destino');
ok(/#view-container\.sp-route-transitioning\s*\{\s*pointer-events:\s*none;/s.test(css),
  'o quadro anterior não aceita clique enquanto representa a rota antiga');
ok(/var _sairDaDashboard = String\(window\.location\.hash \|\| ''\)\.split\('\/'\)\[0\] === '#dashboard';/.test(store),
  'a abertura a partir da dashboard detecta que há uma tela completa para preservar');
ok(/if \(!_sairDaDashboard && typeof window\._showLoading === 'function'\)/.test(store),
  'a abertura a partir da dashboard não lança o overlay de tela inteira por cima dela');
console.log('\n' + (fail ? '❌ ' + fail + ' falha(s)' : '✅ transição estável sem tela de carregamento') + '\n');
process.exit(fail ? 1 : 0);
