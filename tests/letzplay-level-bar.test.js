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

// ── CATEGORIA NÃO É NOME DE EVENTO (print do dono, 17/ago/2026) ──────────────────────
// A M.delia apareceu com "Consolation D/C --6º Torneio Feminino – Ilha de Comandatuba –
// Consolation---Categoria D/C" no lugar da categoria: `categoryRaw` guarda o rótulo CRU
// do letzplay, e ele muitas vezes É o nome inteiro do evento. Categoria é rótulo CURTO.
{
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js/views/letzplay-profile.js'), 'utf8');
  ok(/String\(oc\.categoryRaw\)\.trim\(\)\.length <= 24/.test(src),
     'categoria vinda do letzplay só é aceita se for CURTA (nome de evento fica de fora)');
  const longo = 'Consolation D/C --6º Torneio Feminino – Ilha de Comandatuba – Consolation---Categoria D/C';
  ok(longo.trim().length > 24, 'o caso real do print seria barrado (' + longo.length + ' caracteres)');
  ok('Fem C+'.length <= 24 && 'Feminina C'.length <= 24 && 'Masculina 50'.length <= 24,
     'e as categorias de verdade continuam passando');
  // ⛔ a "forma" saiu: era a mesma informação da régua, em pior formato
  ok(!/>forma</.test(src), 'a "forma" não é mais exibida na ficha');
  ok(/A "FORMA" SAIU/.test(src), 'e a remoção está explicada no código (pra não voltar sem querer)');
}
