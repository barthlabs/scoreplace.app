/* ouro-prata-sai-dos-seletores — a fase 2 do Rei/Rainha forma Ouro/Prata DENTRO do grupo,
 * e isso tem de sair dos SELETORES, não de quem explicou a regra.
 *
 * Ordem do dono (22/ago/2026), ao ver a Confra: _"é o 1 [por grupo], mas porque temos um
 * seletor de que todos do grupo classificam e outro que determina que a classificação é por
 * performance — isso precisa funcionar com base nos seletores e não porque eu disse."_
 * E sobre a chave: _"o que será sorteado serão os confrontos entre as duplas da linha ouro
 * (1/2 de cada grupo) e linha prata (3/4 de cada grupo). esse sorteio deve semear por
 * cabeças de chave."_
 *
 * FALHA REAL que isto trava: o escopo por-grupo era `cfg.grupos > 1 && classifScope ===
 * 'per_group'`. No Rei/Rainha `cfg.grupos` é o slider da Fase de GRUPOS e não fala do R/R
 * — ele monta grupos de 4 sozinho. A Confra tem `grupos: 1` e 34 grupos na quadra, e o
 * normalize ainda força `classifScope = 'overall'` quando `grupos === 1`. Resultado medido:
 * o motor pareava o ranking GERAL plano (1º+2º do TORNEIO) em vez de 1º+2º DE CADA GRUPO.
 *
 * Duas metades, e as duas precisam estar verdes:
 *   1. compileToPhases (o que os seletores viram config);
 *   2. buildEntrantsByDest (o que o motor faz com essa config).
 */
var path = require('path');
var eng = require(path.join(__dirname, '..', 'js', 'views', 'phases-engine.js'));

var falhas = 0;
function ok(nome, cond, extra) {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
}

console.log('──── Ouro/Prata do Rei/Rainha sai dos seletores ────');

// ── 1. os SELETORES → a config ───────────────────────────────────────────────────────
// Exatamente o que a tela da Confra mostra: Rei/Rainha, 1 rodada, "Todos" avançam,
// estratégia "Performance", 2 linhas chamadas Ouro e Prata.
global.window = global.window || global;
require(path.join(__dirname, '..', 'js', 'views', 'format2.js'));

var cfgConfra = window.FORMAT2.normalize({
  parceria: 'rei_rainha', disputa: 'dupla', grupos: 1, classificados: 2, classifScope: 'overall',
  rodadas: { n: 1, modo: 'fixo' },
  eliminatoria: { ativa: true, qualifyAll: true, formacao: 'performance', linhas: 2,
                  nomes: ['Ouro', 'Prata'], origem: 'formar', terceiro: true }
});
var src = window.FORMAT2.compileToPhases(cfgConfra, {}).phases[1].source;

ok('escopo compilado é POR GRUPO (era "overall" e ignorava os 34 grupos)', src.scope === 'per_group',
  'veio scope=' + src.scope + ' byGroupRank=' + src.byGroupRank + ' flatOverall=' + src.flatOverall);
ok('  → byGroupRank ligado', src.byGroupRank === true);
ok('  → flatOverall desligado (é ele que achatava o ranking)', src.flatOverall === false);
ok('  → as 2 linhas saem dos nomes escolhidos',
  src.mapping.length === 2 && src.mapping[0].label === 'Ouro' && src.mapping[1].label === 'Prata');

// VÁRIAS rodadas é o outro lado da mesma regra: os grupos rotacionam a cada sorteio, então
// "1º do grupo" não significa nada e o ranking geral plano volta a ser o certo.
var cfgVarias = window.FORMAT2.normalize(Object.assign({}, cfgConfra, { rodadas: { n: 4, modo: 'fixo' } }));
var srcVarias = window.FORMAT2.compileToPhases(cfgVarias, {}).phases[1].source;
ok('Rei/Rainha com VÁRIAS rodadas continua no ranking geral plano',
  srcVarias.scope === 'overall' && srcVarias.flatOverall === true,
  'scope=' + srcVarias.scope + ' flatOverall=' + srcVarias.flatOverall);

// ── 2. a config → o que o MOTOR faz ──────────────────────────────────────────────────
// 34 grupos de 4, como a Confra tem na quadra.
// ⚠️ A FORÇA DO GRUPO É EMBARALHADA DE PROPÓSITO. Com pontos caindo de A pra H2, "ordem de
// mérito" e "ordem dos grupos" dariam a MESMA lista, e o teste de cabeça de chave passaria
// sem provar nada (foi o que aconteceu na 1ª versão). Aqui o grupo mais forte é o do meio,
// então a ordem por mérito só sai certa se alguém REALMENTE ordenou.
var LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat(['A2','B2','C2','D2','E2','F2','G2','H2']);
var forcaDoGrupo = function (gi) { return (gi * 7) % 34; };   // permutação: nem crescente nem decrescente
// ⚠️ OS NÚMEROS SÃO OS QUE O REI/RAINHA PRODUZ. Cada pessoa joga 3 jogos no grupo, então
// `wins` vai de 3 a 0 e TODOS os primeiros colocados empatam em vitórias — quem separa é o
// saldo de games. A 1ª versão deste teste ranqueava por `points`, que a cadeia canônica só
// olha em pontuação AVANÇADA (standingsCompare(a,b,adv=false)): dava empate em tudo, o sort
// estável não mexia em nada, e o teste "provava" uma ordenação que não existia.
var prevGroups = LETRAS.map(function (L, gi) {
  var s = forcaDoGrupo(gi);
  return { name: 'R1 Grupo ' + L, standings: [1, 2, 3, 4].map(function (pos) {
    return { name: L + pos, uid: 'u' + L + pos, played: 3,
             wins: 4 - pos, losses: pos - 1,
             gamesWon: 12 + s - (pos - 1) * 3, gamesLost: 6 + (pos - 1) * 3 };
  }) };
});
ok('a fixture embaralha a força dos grupos (senão o teste de mérito não prova nada)',
  (function () {
    var f = LETRAS.map(function (_, i) { return forcaDoGrupo(i); });   // por ÍNDICE (a letra não é número)
    var sobe = f.some(function (v, i) { return i > 0 && v > f[i - 1]; });
    var desce = f.some(function (v, i) { return i > 0 && v < f[i - 1]; });
    return sobe && desce;                                             // nem crescente, nem decrescente
  })());
ok('cenário com os 34 grupos da Confra', prevGroups.length === 34);

var res = eng.buildPhaseBrackets(prevGroups, {
  name: 'Eliminatória', formatCode: 'elim_simples', fixedPairs: true,
  pairingStrategy: 'top', bracketSeeding: 'seed', grandFinal: false, thirdPlace: true,
  source: { type: 'previous_phase', byGroupRank: true, scope: 'per_group', qualifyMode: 'all',
            mapping: [{ dest: 'upper', rankFrom: 1, rankTo: 999, label: 'Ouro' },
                      { dest: 'lower', rankFrom: 1, rankTo: 999, label: 'Prata' }] }
}, function (g) { return g.standings; }, 'ph2');

var ouro = res.byDest.upper || [], prata = res.byDest.lower || [];
ok('34 duplas na linha Ouro', ouro.length === 34, 'vieram ' + ouro.length);
ok('34 duplas na linha Prata', prata.length === 34, 'vieram ' + prata.length);
ok('68 duplas no total = 136 pessoas', ouro.length + prata.length === 68);

// A regra que o dono descreveu, dupla a dupla: Ouro = 1º+2º do MESMO grupo.
var ouroCerto = ouro.every(function (t) {
  var a = t.p1Name, b = t.p2Name;
  return a && b && a.slice(0, -1) === b.slice(0, -1) && a.slice(-1) === '1' && b.slice(-1) === '2';
});
var prataCerto = prata.every(function (t) {
  var a = t.p1Name, b = t.p2Name;
  return a && b && a.slice(0, -1) === b.slice(0, -1) && a.slice(-1) === '3' && b.slice(-1) === '4';
});
ok('Ouro = 1º + 2º do MESMO grupo, em todas as 34', ouroCerto,
  'primeiras: ' + ouro.slice(0, 3).map(function (t) { return t.displayName; }).join(' | '));
ok('Prata = 3º + 4º do MESMO grupo, em todas as 34', prataCerto,
  'primeiras: ' + prata.slice(0, 3).map(function (t) { return t.displayName; }).join(' | '));

// ⛔ O que estava acontecendo ANTES: ranking geral achatado parearia o 1º do torneio com o
// 2º do torneio — dois de grupos DIFERENTES. Se qualquer dupla tiver gente de dois grupos,
// a regra do dono foi quebrada.
var misturadas = ouro.concat(prata).filter(function (t) {
  return t.p1Name && t.p2Name && t.p1Name.slice(0, -1) !== t.p2Name.slice(0, -1);
});
ok('nenhuma dupla mistura pessoas de grupos diferentes', misturadas.length === 0,
  misturadas.slice(0, 3).map(function (t) { return t.displayName; }).join(' | '));

// ── 3. cabeças de chave: a linha vem por MÉRITO, não pela ordem dos grupos ────────────
// Sem isto, a "cabeça de chave" seria só quem calhou de cair no grupo A.
// Mérito do topo da dupla pela MESMA régua do comparador canônico sem pontuação avançada:
// empatados em vitórias, decide o saldo de games.
function pontosDoTopo(t) {
  var p = (t.participants && t.participants[0]) || {};
  return (p.gamesWon || 0) - (p.gamesLost || 0);
}
var ouroOrdenado = ouro.every(function (t, i) { return i === 0 || pontosDoTopo(ouro[i - 1]) >= pontosDoTopo(t); });
var prataOrdenado = prata.every(function (t, i) { return i === 0 || pontosDoTopo(prata[i - 1]) >= pontosDoTopo(t); });
ok('linha Ouro ordenada por mérito (cabeça de chave primeiro)', ouroOrdenado,
  'saldo do topo: ' + ouro.slice(0, 5).map(pontosDoTopo).join(', ') + '…');
ok('linha Prata ordenada por mérito', prataOrdenado,
  'saldo do topo: ' + prata.slice(0, 5).map(pontosDoTopo).join(', ') + '…');
// E a cabeça de chave é o MELHOR do torneio, não o do grupo A.
var melhorSaldo = Math.max.apply(null, ouro.map(pontosDoTopo));
ok('  → a cabeça de chave do Ouro é a melhor dupla, não a do grupo A',
  ouro.length > 0 && pontosDoTopo(ouro[0]) === melhorSaldo && (ouro[0].p1Name || '').slice(0, -1) !== 'A',
  '1ª da linha: ' + (ouro[0] && ouro[0].displayName));

// Estratégia SORTEIO não pode ser reordenada por mérito — ali a ordem É o sorteio.
var resSorteio = eng.buildPhaseBrackets(prevGroups, {
  name: 'Eliminatória', formatCode: 'elim_simples', fixedPairs: true,
  pairingStrategy: 'draw_among', bracketSeeding: 'seed',
  source: { type: 'previous_phase', byGroupRank: true, scope: 'per_group', qualifyMode: 'all',
            mapping: [{ dest: 'upper', rankFrom: 1, rankTo: 999 }, { dest: 'lower', rankFrom: 1, rankTo: 999 }] }
}, function (g) { return g.standings; }, 'ph3');
var todosOrdenados = (resSorteio.byDest.upper || []).every(function (t, i, arr) {
  return i === 0 || pontosDoTopo(arr[i - 1]) >= pontosDoTopo(t);
});
ok('estratégia Sorteio NÃO é reordenada por mérito (a ordem é o sorteio)', !todosOrdenados,
  'saldo do topo: ' + (resSorteio.byDest.upper || []).slice(0, 5).map(pontosDoTopo).join(', ') + '…');
// E o que ela PRESERVA: a ordem dos grupos, exatamente como saiu do sorteio.
var ordemDeGrupoIntacta = (resSorteio.byDest.upper || []).every(function (t, i) {
  var g = (t.p1Name || '').slice(0, -1);
  return g === LETRAS[i];
});
ok('  → e a linha continua na ordem em que os grupos saíram', ordemDeGrupoIntacta);

console.log(falhas === 0
  ? '\n✅ ouro-prata-sai-dos-seletores: OK'
  : '\n❌ ouro-prata-sai-dos-seletores: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
