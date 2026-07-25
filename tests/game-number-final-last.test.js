/* "JOGO N" — CONTAGEM CORRETA, UMA FONTE SÓ. node tests/game-number-final-last.test.js
 *
 * REGRA DO DONO (25/jul, depois do torneio de casais):
 *   • um contador só; número certo em cada jogo; NUNCA repetido no mesmo torneio;
 *   • a ÚNICA inversão que existe: a FINAL é o ÚLTIMO jogo do torneio e o 3º/4º
 *     lugar fica UM NÚMERO ABAIXO dela — mesmo a final aparecendo ACIMA do 3º
 *     lugar no desenho da chave.
 *
 * O QUE ESTAVA ERRADO (achado ao escrever este teste):
 *   • o caminho da DUPLA ELIMINATÓRIA em _assignGlobalGameNumbers não numerava o
 *     3º/4º lugar — ele ficava SEM NÚMERO;
 *   • `t.thirdPlaceMatch` mora FORA de t.matches e nunca era visitado por
 *     ninguém, em nenhum formato.
 * Complementa tests/game-number-single-counter.test.js (que barra 2º contador).
 */
const H = require('./render-harness');
const W = H.window, buildViaDraw = H.buildViaDraw, buildDupla = H.buildDupla, E = H.E, mkPool = H.mkPool;

// Eliminatória Simples montada direto pelo motor de fases (mesmo caminho de
// buildDupla). buildViaDraw não serve aqui: fora de potência de 2 o sorteio fica
// bloqueado esperando a decisão de resolução (o painel), e nem gera jogo.
function buildSimples(n) {
  const cfg = {
    format: 'Eliminatórias Simples', formatCode: 'elim_simples', teamSize: 1,
    bracketResolution: 'playin', tierThird: true,
    source: { type: 'enrollment' }, categories: ['C']
  };
  const t = { id: 'T', format: 'Eliminatórias Simples', teamSize: 1, matches: [], currentPhaseIndex: 0 };
  const b = E.generatePhase(mkPool(n), cfg, {
    idPrefix: 'p', ordered: true, t: t,
    isVip: function () { return false; }, catOf: function (e) { return (e.categories || [])[0]; }
  });
  E.storePhase(t, 0, b);
  return t;
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

const todos = (t) => (typeof W._collectAllMatches === 'function' ? W._collectAllMatches(t) : (t.matches || []));
const numerados = (t) => todos(t).filter((m) => m && m._gameNum != null);
const ehTerceiro = (m) => !!(m && (m.isThirdPlace || m.bracket === 'thirdplace' || m.bracket === 'grand3'));

function conferirBasico(t, rotulo) {
  W._assignGlobalGameNumbers(t);
  const ns = numerados(t);
  ok(ns.length > 0, rotulo + ': nenhum jogo foi numerado');

  // sem repetição — o sintoma relatado ao vivo (nº da superior repetido na inferior)
  const porNum = {};
  const repetidos = [];
  ns.forEach((m) => {
    const k = m._gameNum;
    if (porNum[k] && porNum[k] !== String(m.id)) repetidos.push(`JOGO ${k}: ${porNum[k]} e ${m.id}`);
    porNum[k] = String(m.id);
  });
  ok(repetidos.length === 0, rotulo + ': NÚMERO REPETIDO → ' + repetidos.join(' | '));

  // contíguos 1..n, sem buraco
  const vals = Object.keys(porNum).map(Number).sort((a, b) => a - b);
  ok(vals[0] === 1, rotulo + ': começa no 1 (got ' + vals[0] + ')');
  ok(vals[vals.length - 1] === vals.length, rotulo + ': contíguo 1..' + vals.length + ' sem buraco (maior=' + vals[vals.length - 1] + ')');
  return { ns, maior: vals[vals.length - 1] };
}

console.log('\n== Eliminatória Simples ==');
[8, 11, 12, 16].forEach((n) => {
  const t = buildSimples(n);
  const { ns, maior } = conferirBasico(t, 'simples N=' + n);
  const terceiro = ns.filter(ehTerceiro)[0];
  if (terceiro) {
    ok(terceiro._gameNum === maior - 1,
      `simples N=${n}: 3º lugar deveria ser JOGO ${maior - 1} (um abaixo da final), got ${terceiro._gameNum}`);
    const final = ns.filter((m) => m._gameNum === maior)[0];
    ok(final && !ehTerceiro(final), `simples N=${n}: o ÚLTIMO número deve ser a FINAL, não o 3º lugar`);
  }
});

console.log('== Dupla Eliminatória ==');
// pow2 → buildViaDraw monta a chave COMPLETA (upper + lower + grande final).
// buildDupla NÃO serve em pow2: ele só chama o construtor da repescagem, que em
// potência de 2 não roda — sobrava só a R1 (4 jogos em N=8) e o teste validava
// meia chave. Fora de pow2 é o contrário: buildDupla é o caminho da repescagem.
// Contagens conferidas contra a tabela do spec: N=8 → 14 jogos, N=16 → 30.
[[8, 14], [16, 30]].forEach(([n, esperado]) => {
  const t = buildViaDraw('Dupla Eliminatória', n);
  const { ns, maior } = conferirBasico(t, 'dupla N=' + n);
  ok(ns.length === esperado, `dupla N=${n}: esperado ${esperado} jogos (tabela do spec), got ${ns.length}`);

  // a Grande Final leva o ÚLTIMO número (a final-extra é condicional e fica fora)
  const grand = ns.filter((m) => m.bracket === 'grand' && !m.isExtra && !m.condicional);
  ok(grand.length > 0, `dupla N=${n}: não achei a Grande Final`);
  const maiorGrand = Math.max.apply(null, grand.map((m) => m._gameNum));
  ok(maiorGrand === maior, `dupla N=${n}: a Grande Final deveria ser o ÚLTIMO jogo (JOGO ${maior}), got ${maiorGrand}`);
});
// fora de pow2: caminho da repescagem
[11].forEach((n) => {
  const t = buildDupla(n);
  const { ns, maior } = conferirBasico(t, 'dupla rep N=' + n);
  const grand = ns.filter((m) => m.bracket === 'grand' && !m.isExtra && !m.condicional);
  if (grand.length) {
    ok(Math.max.apply(null, grand.map((m) => m._gameNum)) === maior,
      `dupla rep N=${n}: a Grande Final deveria ser o ÚLTIMO jogo (JOGO ${maior})`);
  }
});
// NOTA: a Dupla Eliminatória NÃO tem jogo de 3º/4º — e está certo. O 3º sai
// naturalmente como o perdedor do último jogo da chave inferior, sem partida
// extra. A regra "3º um número abaixo da final" vale onde existe esse jogo:
// na Eliminatória Simples (testada acima) e no campo t.thirdPlaceMatch (abaixo).

console.log('== t.thirdPlaceMatch (mora fora de t.matches) também é numerado ==');
{
  const t = buildSimples(8);
  // remove o 3º de dentro de t.matches (se estiver lá) e põe no campo próprio,
  // que é onde _appendCanonicalColumn grava.
  const dentro = (t.matches || []).filter(ehTerceiro);
  t.matches = (t.matches || []).filter((m) => !ehTerceiro(m));
  t.thirdPlaceMatch = dentro[0] || { id: '3rd-x', round: 99, isThirdPlace: true, p1: 'J1', p2: 'J2', winner: null };
  W._assignGlobalGameNumbers(t);
  ok(t.thirdPlaceMatch._gameNum != null, 't.thirdPlaceMatch ficou SEM número (não era visitado por ninguém)');
  const maior = Math.max.apply(null, numerados(t).map((m) => m._gameNum));
  ok(t.thirdPlaceMatch._gameNum === maior - 1,
    `t.thirdPlaceMatch deveria ser JOGO ${maior - 1} (um abaixo da final), got ${t.thirdPlaceMatch._gameNum}`);
}

console.log('\n' + (fail === 0 ? '✅ game-number-final-last: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
