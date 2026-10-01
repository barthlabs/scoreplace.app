// A categoria de uma dupla pertence ao torneio, não ao perfil individual.
// Regressão Neon: 48 duplas já tinham Fem/Masc + Light/Power/Extreme na
// subcoleção canônica, mas os placeholders exibiam "sem cat" duas vezes.

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function ok(label, condition) {
  if (condition) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.error('  ✗ ' + label); }
}

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');

ok('resolve a categoria a partir do registro da dupla',
  src.includes("var _pairCategoryRaw = String(p.category || ((p.categories || [])[0]) || '').trim();"));
ok('valida o rótulo contra as categorias customizadas do torneio',
  src.includes('window._getTournamentCategories(t)') && src.includes('_pairTournamentCategory = String(_pairCats[_pci]).trim();'));
ok('mostra uma única categoria completa para a dupla',
  src.includes('🏷️ ') && src.includes('Categoria definida para esta dupla neste torneio'));
ok('escapa localmente o rótulo configurado antes de inseri-lo no card',
  src.includes("var _pairCategorySafe = String(_pairTournamentCategory).replace(/[&<>\"']/g") && src.includes("+ _pairCategorySafe + '</div>'"));
ok('não mostra sem categoria dos perfis quando a dupla já está categorizada',
  src.includes("(!_pairTournamentCategory && typeof window._profileMetaSlots === 'function')"));
ok('dado inválido fica explícito como pendência de categoria do torneio',
  src.includes('⚠️ Categoria do torneio pendente'));

console.log('\n' + (fail ? '❌' : '✅') + ' dupla-categoria-do-torneio: ' + pass + ' ok, ' + fail + ' falharam');
if (fail) process.exit(1);
