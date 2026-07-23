/* "Deixar inscritos ficarem de fora" — DEFAULT, nunca CADEADO.
 * node tests/allow-self-deact-default.test.js
 *
 * Regra do dono: com RODADA ÚNICA a configuração vem DESATIVADA (não há próximo sorteio pra
 * ficar de fora). Na v1.4.12 eu fui além do pedido e TRAVEI o controle (input disabled +
 * força false na normalização) — o dono reportou: "esse toggle tem que funcionar". Ele pediu
 * o VALOR desligado, não o controle congelado.
 *
 * Trava aqui: n=1 só decide quando NINGUÉM decidiu; escolha explícita do organizador sempre
 * vence, nos dois sentidos. Ver [[feedback_dont_break_working_features]].
 */
const { window: W, load } = require('./headless.js');
load('format2.js');
const N = W.FORMAT2.normalize;
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:(fail++,console.error('  ✗',m));};

// n=1 sem escolha → default OFF
let c = N({ rodadas:{ modo:'fixo', n:1 } });
ok(c.rodadas.allowSelfDeactivation===false, 'n=1 sem escolha devia vir false — veio '+c.rodadas.allowSelfDeactivation);
// n=1 com escolha EXPLÍCITA true → respeita (não trava)
c = N({ rodadas:{ modo:'fixo', n:1, allowSelfDeactivation:true } });
ok(c.rodadas.allowSelfDeactivation===true, 'n=1 com true explícito devia RESPEITAR — veio '+c.rodadas.allowSelfDeactivation);
// n=5 sem escolha → default ON
c = N({ rodadas:{ modo:'fixo', n:5 } });
ok(c.rodadas.allowSelfDeactivation===true, 'n=5 sem escolha devia vir true — veio '+c.rodadas.allowSelfDeactivation);
// n=5 com false explícito → respeita
c = N({ rodadas:{ modo:'fixo', n:5, allowSelfDeactivation:false } });
ok(c.rodadas.allowSelfDeactivation===false, 'n=5 com false explícito devia RESPEITAR');
console.log((fail===0?'✅':'❌')+` allowSelfDeactivation default≠cadeado: ${pass} ok, ${fail} falharam`);
process.exit(fail===0?0:1);
