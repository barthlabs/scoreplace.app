// BUG DO DONO (22/jul, print): o selo verde "SORTEIO v1.4.4" aparecendo POR CIMA DA DASHBOARD.
// Ele só deve existir no detalhe de um torneio SANDBOX. Raiz: o selo só era removido DENTRO do
// _dtrace — ou seja, só quando um novo evento de sorteio acontecia. Ao sair do SB pra dashboard
// ninguém mais chamava _dtrace e o selo ficava na tela. Aqui travo a DECISÃO pura de rota.
const { window: W } = require('./render-harness');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const SB = { id: 'sb1', name: 'SB', isSandbox: true };
const PROD = { id: 'p1', name: 'Prod' };
W.AppStore = { tournaments: [SB, PROD], currentUser: { uid: 'u' }, sync: () => {} };

console.log('\n── selo de diagnóstico do sorteio só vive em rota de SANDBOX ──');

ok(W._drawTraceRouteOk('#tournaments/sb1') === true, 'detalhe do SANDBOX :: mantém');
ok(W._drawTraceRouteOk('#bracket/sb1') === true, 'chave do SANDBOX :: mantém');
ok(W._drawTraceRouteOk('#participants/sb1') === true, 'inscritos do SANDBOX :: mantém');

ok(W._drawTraceRouteOk('#dashboard') === false, 'DASHBOARD :: remove (o bug do print)');
ok(W._drawTraceRouteOk('') === false, 'rota vazia (boot na dashboard) :: remove');
ok(W._drawTraceRouteOk('#explore') === false, 'explorar :: remove');
ok(W._drawTraceRouteOk('#profile') === false, 'perfil :: remove');
ok(W._drawTraceRouteOk('#tournaments/p1') === false, 'detalhe de torneio de PRODUÇÃO :: remove');

// torneio ainda não carregado (doc chega async): não pisca — mantém até saber o que é
ok(W._drawTraceRouteOk('#tournaments/ainda-nao-carregado') === true, 'torneio desconhecido :: mantém (evita piscar no boot)');

console.log(fail === 0 ? `✅ draw-trace-badge-route: OK  (${pass} asserts ok)` : `❌ ${fail} FALHA(S)  (${pass} ok)`);
if (fail) { console.log('\nFALHAS:'); fails.forEach((f) => console.log('  ✗ ' + f)); }
process.exit(fail === 0 ? 0 : 1);
