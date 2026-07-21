// inscritos-grid-canon.test.js — TRAVA o layout GRID RESPONSIVO da seção de inscritos.
//
// Dono (recorrente, jul/2026): "usar mais colunas em telas mais largas sem truncar os nomes.
// isso deve ser o padrão em TODOS os torneios, SEMPRE. e não pode regredir caralho."
//
// A seção de inscritos (individual E duplas) tem que usar GRID responsivo (auto-fill + minmax +
// min(100%,Npx) + 1fr) — várias colunas em tela larga, 1 no mobile — NUNCA coluna única
// (flex-direction:column). Já regrediu pra coluna única no bloco de DUPLAS antes; este teste
// falha se alguém reverter. Ver [[feedback_maximize_screen_area_all_devices]].
//
// node tests/inscritos-grid-canon.test.js

const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
}

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
const RESPONSIVE_GRID = /display:grid;\s*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(100%,\s*\d+px\),\s*1fr\)\)/;

// 1. As constantes canônicas dos dois hosts (solo + dupla) existem e SÃO grid responsivo.
const soloM = src.match(/window\._INSCRITO_GRID_SOLO\s*=\s*'([^']+)'/);
const duplaM = src.match(/window\._INSCRITO_GRID_DUPLA\s*=\s*'([^']+)'/);
ok('_INSCRITO_GRID_SOLO definida', !!soloM);
ok('_INSCRITO_GRID_DUPLA definida', !!duplaM);
ok('SOLO é grid responsivo (auto-fill+minmax+min(100%)+1fr)', !!(soloM && RESPONSIVE_GRID.test(soloM[1])), soloM && soloM[1]);
ok('DUPLA é grid responsivo (auto-fill+minmax+min(100%)+1fr)', !!(duplaM && RESPONSIVE_GRID.test(duplaM[1])), duplaM && duplaM[1]);
ok('SOLO NÃO é coluna única (flex-direction:column)', !!(soloM && soloM[1].indexOf('flex-direction:column') === -1));
ok('DUPLA NÃO é coluna única (flex-direction:column)', !!(duplaM && duplaM[1].indexOf('flex-direction:column') === -1));

// 1b. ALTURA IGUAL por linha — align-items:stretch (NÃO start/center). Dono (recorrente): "os cards
// devem ter SEMPRE a mesma altura, não pode um mais alto que o outro".
ok('SOLO estica pra altura igual (align-items:stretch)', !!(soloM && /align-items:\s*stretch/.test(soloM[1])), soloM && soloM[1]);
ok('DUPLA estica pra altura igual (align-items:stretch)', !!(duplaM && /align-items:\s*stretch/.test(duplaM[1])), duplaM && duplaM[1]);
ok('SOLO NÃO usa align-items:start/center (alturas desiguais)', !!(soloM && !/align-items:\s*(start|center|flex-start)/.test(soloM[1])));
ok('DUPLA NÃO usa align-items:start/center (alturas desiguais)', !!(duplaM && !/align-items:\s*(start|center|flex-start)/.test(duplaM[1])));

// 2. Os DOIS hosts sp-dnd-host da seção de duplas usam as constantes (não estilo inline coluna).
const hostSolo = /class="sp-dnd-host"\s*style="'\s*\+\s*window\._INSCRITO_GRID_SOLO/.test(src);
const hostDupla = /class="sp-dnd-host"\s*style="'\s*\+\s*window\._INSCRITO_GRID_DUPLA/.test(src);
ok('host "Sem dupla" usa _INSCRITO_GRID_SOLO', hostSolo);
ok('host "Duplas formadas" usa _INSCRITO_GRID_DUPLA', hostDupla);

// 3. A seção INDIVIDUAL (gridStyle) também é grid responsivo — o padrão vale pra TODOS.
const gridStyleM = src.match(/const gridStyle\s*=[\s\S]{0,240}?minmax\(min\(100%,[^;]+1fr\)\)/);
ok('seção individual (gridStyle) também é grid responsivo', !!gridStyleM);

// 4. Nenhum host de card de inscrito da seção de duplas voltou a usar coluna única inline.
const badInline = /class="sp-dnd-host"\s*style="display:flex;flex-direction:column/.test(src);
ok('nenhum sp-dnd-host inline com flex-direction:column (regressão)', !badInline);

console.log('\n' + '='.repeat(40));
console.log((fail === 0 ? '✅' : '❌') + ' inscritos-grid-canon: ' + pass + ' ok, ' + fail + ' falharam');
console.log('='.repeat(40));
if (fail > 0) process.exit(1);
