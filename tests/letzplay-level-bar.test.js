const { window, load } = require('./headless.js');
// o módulo registra uma delegação de clique no document ao carregar — o harness headless
// não tem DOM, então damos o mínimo pra ele subir (o que interessa aqui é o HTML gerado).
if (typeof global.document === 'undefined') global.document = { addEventListener: function () {} };
if (!window.document) window.document = global.document;
load('letzplay-profile.js');
let pass=0, fail=0; function ok(c,m){ if(c) pass++; else { fail++; console.error('  ✗',m); } }
const imp = { handle:'camilacalia', officialCategory:{ skill:'C', categoryRaw:'Feminina C' },
  rating:{ band:'C+/B-', value:1600 }, games:[{date:'Quarta, 29/07/26',won:true}],
  footprint:[{official:true,club:'c',tourneyId:'1',name:'Torneio X',categoryRaw:'Fem C',year:2026}], stats:{} };
// a barra existe sozinha e é a MESMA usada no card
ok(typeof window._lzLevelBar === 'function', '_lzLevelBar existe (fonte única do medidor)');
const bar = window._lzLevelBar(imp);
ok(/Feminina C/.test(bar), 'a barra mostra a categoria oficial');
ok(/FUN[\s\S]*>D<[\s\S]*>C<[\s\S]*>B<[\s\S]*>A</.test(bar), 'a régua vai de FUN a A');
ok(/no seu nível/.test(bar), 'traz a legenda "no seu nível"');
const card = window._renderLetzplayCard(imp);
ok(card.indexOf(bar) >= 0, 'o card das estatísticas usa EXATAMENTE a mesma barra (sem cópia)');
ok(/Torneio X/.test(card), 'o card lista as competições (é o que o diálogo passa a mostrar)');
ok(window._lzLevelBar(null) === '', 'sem import não quebra — devolve vazio');
console.log((fail?'✗':'✓')+' letzplay-level-bar: '+pass+' passaram, '+fail+' falharam');
process.exit(fail?1:0);
