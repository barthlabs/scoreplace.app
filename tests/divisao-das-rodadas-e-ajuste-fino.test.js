/* A DIVISÃO DAS RODADAS: DIA IGUAL É O PADRÃO, O SLIDER É AJUSTE FINO (leva 2.1.98)
 *
 * Pedido do dono (02/set/2026), em duas mensagens:
 *   1. _"essa questão das datas limite para rodadas sucessivas poderia ter no editar um
 *      slider com x stops. em cada stop a data dd/mm e entre os stops y dias. de forma que
 *      o organizador pode esticar umas rodadas e reduzir outras a vontade dentro do limite
 *      inicial/final."_
 *   2. _"o padrão é o mesmo número de dias entre as rodadas. daí o organizador pode fazer
 *      um ajuste fino."_
 *
 * ⛔ A INVARIANTE QUE ESTE TESTE GUARDA, e que é a razão de ele existir: um arranjo salvo
 * NUNCA pode virar estado inválido. As datas da fase mudam depois (o organizador estica o
 * torneio, o formato muda e o nº de rodadas com ele) e o arranjo velho passa a não
 * descrever mais a fase. Nesse caso a régua tem que VOLTAR SOZINHA pra divisão igual — não
 * mostrar uma rodada que começa depois de terminar, nem uma divisão a mais que rodadas.
 * É a mesma lição do "derivado não se guarda": o que se guarda é a INTENÇÃO (as datas
 * arrastadas), e ela é revalidada a cada leitura.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'round-bounds-core.js'), 'utf8'),
  sandbox, { filename: 'round-bounds-core.js' });
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── divisão das rodadas: igual por padrão, ajuste fino no slider ────');

const DIA = 86400000;
const INI = W._rbMs('2026-09-02T11:17');
const FIM = W._rbMs('2026-11-12T23:00');   // a janela real da Fase 2 da Confra
const N = 6;

// ── ① O PADRÃO: dias iguais ───────────────────────────────────────────────────
const iguais = W._rbIguais(INI, FIM, N);
ok(iguais.length === N - 1, '① 6 rodadas → 5 divisões');
const larguras = [INI].concat(iguais, [FIM]).slice(1).map((x, i) => x - [INI].concat(iguais)[i]);
const dif = Math.max.apply(null, larguras) - Math.min.apply(null, larguras);
ok(dif <= 1000, '① ⭐ sem ajuste, todas as rodadas têm o MESMO tamanho');
ok(Math.abs(larguras[0] / DIA - 11.9) < 0.15,
   '① e o tamanho é o que o dono calculou à mão: ~11,9 dias · deu ' + (larguras[0] / DIA).toFixed(1));

// ── ② A RÉGUA sem arranjo é a de sempre ──────────────────────────────────────
const semAjuste = W._phaseRoundWindow(INI, FIM, 1, N);
ok(semAjuste && semAjuste.ajustado === false, '② sem arranjo, a régua diz que NÃO houve ajuste');
ok(semAjuste.startMs === INI, '② a R1 começa no início da fase');
ok(Math.abs(semAjuste.endMs - iguais[0]) <= 1, '② e termina na 1ª divisão igual');
const ultima = W._phaseRoundWindow(INI, FIM, N, N);
ok(ultima.endMs === FIM, '② a última rodada termina no fim da fase — a janela é fechada');

// ── ③ O AJUSTE FINO: esticar uma rodada encurta a seguinte, e as pontas ficam ─
let v = iguais.slice();
v = W._rbMove(v, 0, INI + 20 * DIA, INI, FIM);      // R1 vira 20 dias
const r1 = W._phaseRoundWindow(INI, FIM, 1, N, v);
const r2 = W._phaseRoundWindow(INI, FIM, 2, N, v);
ok(r1.ajustado === true, '③ com arranjo, a régua diz que houve ajuste');
ok(Math.abs((r1.endMs - r1.startMs) / DIA - 20) < 0.05, '③ ⭐ a R1 virou 20 dias');
ok(r2.startMs === r1.endMs, '③ a R2 começa exatamente onde a R1 acaba — sem buraco');
ok(W._phaseRoundWindow(INI, FIM, N, N, v).endMs === FIM,
   '③ ⭐ e o FIM DA FASE não se moveu — o slider só mexe nas divisões');
ok(W._phaseRoundWindow(INI, FIM, 1, N, v).startMs === INI, '③ nem o início');

// ── ④ O ARRASTE respeita vizinho e piso ───────────────────────────────────────
const empurrado = W._rbMove(iguais.slice(), 2, INI - 999 * DIA, INI, FIM);  // joga pra antes do início
ok(empurrado[2] > empurrado[1], '④ um stop não passa por cima do anterior');
ok(empurrado[2] < empurrado[3], '④ nem do seguinte');
const noFim = W._rbMove(iguais.slice(), N - 2, FIM + 999 * DIA, INI, FIM);
ok(noFim[N - 2] < FIM, '④ o último stop não alcança o fim da fase (rodada de zero não é rodada)');

// ── ⑤ ⛔ ARRANJO QUE NÃO DESCREVE MAIS A FASE VOLTA PRA DIVISÃO IGUAL ─────────
ok(W._rbNormaliza(iguais, INI, FIM, 5) === null,
   '⑤ ⭐ o nº de rodadas mudou (6→5): o arranjo é descartado, não remendado');
ok(W._rbNormaliza([W._rbIso(FIM + DIA)], INI, FIM, 2) === null, '⑤ divisão FORA da janela → descartado');
ok(W._rbNormaliza([W._rbIso(INI + 5 * DIA), W._rbIso(INI + 2 * DIA)], INI, FIM, 3) === null,
   '⑤ divisões fora de ordem → descartado');
ok(W._rbNormaliza([], INI, FIM, 3) === null && W._rbNormaliza(null, INI, FIM, 3) === null,
   '⑤ vazio é "não sei", não "não tem"');
const comLixo = W._phaseRoundWindow(INI, FIM, 1, N, [1, 2, 3]);
ok(comLixo && comLixo.ajustado === false && comLixo.startMs === INI,
   '⑤ ⭐ arranjo inválido NÃO quebra a tela: cai na divisão igual, calada');

// ── ⑥ De onde a leitura tira o arranjo ────────────────────────────────────────
const arranjo = iguais.map(W._rbIso);
const tFase1 = { phases: [{}, { roundBounds: arranjo }], currentPhaseIndex: 1 };
ok(W._limitesDasRodadas(tFase1, 1, INI, FIM, N) !== null, '⑥ lê o arranjo da FASE');
const tTopo = { phases: [{}], roundBounds: arranjo };
ok(W._limitesDasRodadas(tTopo, 0, INI, FIM, N) !== null,
   '⑥ e o campo do topo vale pra fase 0 — mesma regra de t.endDate');
ok(W._limitesDasRodadas(tTopo, 1, INI, FIM, N) === null,
   '⑥ ⭐ mas o campo do topo NÃO vaza pra fase posterior (era assim que a Fase 2 herdava a janela da Fase 1)');
ok(W._limitesDasRodadas(null, 0, INI, FIM, N) === null, '⑥ sem torneio, null');

// ── ⑦ O DESENHO diz o que o dono pediu: dd/mm no stop, dias no meio ──────────
const html = W._rbSliderHtml(INI, FIM, N, iguais);
ok(/data-rb-stop="0"/.test(html) && /data-rb-stop="4"/.test(html), '⑦ 5 stops arrastáveis');
ok(!/data-rb-stop="5"/.test(html), '⑦ e nem um a mais');
ok(/\d\d\/\d\d/.test(html), '⑦ cada stop mostra a data dd/mm');
ok(/R1 · 11,9d|R1 · 12d/.test(html), '⑦ e cada trecho mostra quantos dias dura');
ok(/Defina início e fim/.test(W._rbSliderHtml(0, 0, 6, null)),
   '⑦ sem janela, o slider explica o que falta em vez de desenhar lixo');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
