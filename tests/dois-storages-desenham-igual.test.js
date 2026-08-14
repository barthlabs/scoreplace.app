/* OS DOIS STORAGES DA FASE CLASSIFICATÓRIA DESENHAM IGUAL
 * node tests/dois-storages-desenham-igual.test.js
 *
 * CONTEXTO (14/ago/2026). Os jogos de uma fase classificatória moram em UM de dois lugares:
 *   • `t.rounds[].matches` + `monarchGroups` — é onde o CONFRA está (104 jogos, 33 grupos);
 *   • `t.matches` taggeado por `phaseIndex` — é onde estão TODOS os outros torneios.
 * MEDIDO: o Confra (e o sandbox) eram os ÚNICOS no primeiro. Migrar o doc dele significaria
 * reescrever sorteio feito e placares lançados de um torneio ao vivo — o dono proibiu.
 * A saída foi o MEIO-TERMO que ele pediu: torneio NOVO nasce no storage canônico, o Confra
 * continua sendo lido como está, e a limpeza fica agendada pra quando ele terminar.
 *
 * O QUE BLOQUEAVA o meio-termo, e que este teste trava: a LEITURA LÓGICA já era idêntica nos
 * dois (prevPhaseGroups, phaseComplete, pendingMatches e a classificação batiam), mas o
 * RENDER não. Um Rei/Rainha com os jogos em `t.matches` caía em `_buildElimColumns` e era
 * desenhado como CHAVE ELIMINATÓRIA: medido, **4.815 bytes contra 33.401, SEM os jogadores
 * na tela**. Um torneio novo nasceria em branco.
 *
 * Contra o código anterior, o bloco 2 acusa exatamente isso.
 */
const H = require('./render-harness');
const W = H.sandbox;
const E = require('../js/views/phases-engine.js');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

W._userProfileCache = {
  uA: { uid: 'uA', displayName: 'Ana' }, uB: { uid: 'uB', displayName: 'Bia' },
  uC: { uid: 'uC', displayName: 'Caio' }, uD: { uid: 'uD', displayName: 'Davi' }
};

function jogos() {
  return [
    { id: 'm1', round: 1, phaseIndex: 0, isMonarch: true, monarchGroup: 0,
      team1: ['A', 'B'], team1Uids: ['uA', 'uB'], team2: ['C', 'D'], team2Uids: ['uC', 'uD'],
      p1: 'A / B', p2: 'C / D', scoreP1: 6, scoreP2: 2, winner: 'A / B' },
    { id: 'm2', round: 1, phaseIndex: 0, isMonarch: true, monarchGroup: 0,
      team1: ['A', 'C'], team1Uids: ['uA', 'uC'], team2: ['B', 'D'], team2Uids: ['uB', 'uD'],
      p1: 'A / C', p2: 'B / D', scoreP1: 6, scoreP2: 4, winner: 'A / C' }
  ];
}
// O MESMO torneio, nos dois storages. Nada além de ONDE os jogos moram muda.
function monta(usaRounds) {
  const js = jogos();
  const g = [{ name: 'G1', groupIdx: 0, players: ['A', 'B', 'C', 'D'], playersUids: ['uA', 'uB', 'uC', 'uD'], matches: js }];
  return {
    id: usaRounds ? 'tR' : 'tM', name: 'T', format: 'Liga', ligaRoundFormat: 'rei_rainha', status: 'active',
    phases: [{ name: 'Classif', rounds: 1 }, { name: 'Elim' }], currentPhaseIndex: 0,
    participants: [{ uid: 'uA' }, { uid: 'uB' }, { uid: 'uC' }, { uid: 'uD' }],
    rounds: usaRounds ? [{ round: 1, format: 'rei_rainha', matches: js, monarchGroups: g }] : [],
    matches: usaRounds ? [] : js
  };
}
function container() {
  return {
    innerHTML: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, appendChild() {}, addEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, scrollTo() {}, focus() {}
  };
}
function desenha(t) {
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = { uid: 'uA', displayName: 'Ana' };
  const c = container();
  try { W.renderBracket(c, t.id, false); } catch (e) { return 'ERRO: ' + e.message; }
  return c.innerHTML || '';
}

console.log('──── 1. a LEITURA lógica é idêntica nos dois ────');
[['t.rounds (Confra)', true], ['t.matches (canônico)', false]].forEach(function (par) {
  const t = monta(par[1]);
  const g = E.prevPhaseGroups(t) || [];
  ok(g.length === 1, par[0] + ': 1 grupo (veio ' + g.length + ')');
  ok(E.phaseComplete(t) === true, par[0] + ': a fase completa');
  ok((E.pendingMatches(t) || []).length === 0, par[0] + ': nenhum pendente');
  const linhas = W._computeMonarchStandings(g[0] || {}, t) || [];
  ok(linhas.length === 4, par[0] + ': 4 linhas de classificação (veio ' + linhas.length + ')');
  ok(linhas.every(function (l) { return !!l.uid; }), par[0] + ': as linhas carregam uid');
});

console.log('──── 2. o RENDER também — era aqui que quebrava ────');
const hR = desenha(monta(true));
const hM = desenha(monta(false));
ok(hR.indexOf('ERRO:') !== 0, 'render do storage legado não estoura');
ok(hM.indexOf('ERRO:') !== 0, 'render do storage canônico não estoura');
[['legado', hR], ['canônico', hM]].forEach(function (par) {
  ok(/Ana/.test(par[1]) && /Davi/.test(par[1]), par[0] + ': os JOGADORES aparecem na tela');
  ok(/Grupo|G1/.test(par[1]), par[0] + ': o GRUPO aparece');
  ok(/6/.test(par[1]), par[0] + ': o PLACAR aparece');
});
// tamanho equivalente: a diferença real é só o id do torneio no markup
const dif = Math.abs(hR.length - hM.length);
ok(hR.length > 10000 && hM.length > 10000,
  'os dois desenham a chave inteira (legado ' + hR.length + ', canônico ' + hM.length + ')');
ok(dif < hR.length * 0.15,
  'as duas saídas são equivalentes — diferença de ' + dif + ' bytes (era 33.401 × 4.815)');

console.log('──── 3. eliminação direta NÃO foi afetada ────');
// A separação só recolhe jogo que se DECLARA classificatório (isMonarch / monarchGroup /
// bracket 'group'). Chave eliminatória não tem nenhum desses e segue pelo caminho de sempre.
const elim = {
  id: 'tE', name: 'E', format: 'Eliminatórias Simples', status: 'active',
  participants: [{ uid: 'uA' }, { uid: 'uB' }, { uid: 'uC' }, { uid: 'uD' }], rounds: [],
  matches: [
    { id: 'e1', round: 1, p1: 'Ana', p2: 'Bia', p1Uid: 'uA', p2Uid: 'uB', scoreP1: 6, scoreP2: 3, winner: 'Ana' },
    { id: 'e2', round: 1, p1: 'Caio', p2: 'Davi', p1Uid: 'uC', p2Uid: 'uD', scoreP1: 6, scoreP2: 1, winner: 'Caio' }
  ]
};
// guard: contra o código ANTERIOR o separador nem existe — o teste deve DIZER isso em vez
// de estourar, senão o controle vira stack trace e ninguém lê o que realmente falhou.
ok(typeof W._matchesDeClassificatoria === 'function',
  'o separador de fase classificatória existe (contra o código anterior, NÃO existe)');
const sep = (typeof W._matchesDeClassificatoria === 'function') ? W._matchesDeClassificatoria(elim) : { matches: [null] };
ok(sep.matches.length === 0, 'chave eliminatória NÃO é recolhida como classificatória');
const hE = desenha(elim);
ok(hE.indexOf('ERRO:') !== 0 && /Ana/.test(hE), 'eliminação direta continua desenhando');

console.log('──── 4. o separador reconstrói o grupo a partir do jogo ────');
const t2 = monta(false);
const s2 = (typeof W._matchesDeClassificatoria === 'function') ? W._matchesDeClassificatoria(t2) : { matches: [], rounds: [] };
ok(s2.matches.length === 2, 'recolheu os 2 jogos da classificatória');
ok(s2.rounds.length === 1, 'montou 1 rodada');
ok(((s2.rounds[0]||{}).monarchGroups || []).length === 1, 'montou 1 grupo');
const gg = ((s2.rounds[0]||{}).monarchGroups || [{}])[0] || {};
ok((gg.playersUids || []).filter(Boolean).length === 4,
  'o grupo reconstruído tem os 4 uids (identidade, não rótulo) — veio ' + JSON.stringify(gg.playersUids));
ok((s2.rounds[0]||{}).format === 'rei_rainha', 'a rodada é marcada como Rei/Rainha');

console.log('──── 5. TORNEIO NOVO nasce no storage canônico e roda o ciclo inteiro ────');
// O meio-termo pedido pelo dono: quem nasce agora grava a fase classificatória em
// `t.matches` (junto com a chave); quem já existe fica onde está. A marca é EXPLÍCITA no
// doc (`storageCanonico`), nunca data nem heurística — doc sem ela é legado.
(function () {
  var tn = {
    id: 'novo', name: 'N', storageCanonico: true, format: 'Liga', ligaRoundFormat: 'rei_rainha',
    status: 'active', phases: [{ name: 'Classif', rounds: 1 }, { name: 'Elim' }], currentPhaseIndex: 0,
    rounds: [], matches: [], standings: [],
    participants: [{ uid: 'uA' }, { uid: 'uB' }, { uid: 'uC' }, { uid: 'uD' }]
  };
  W._generateNextRound(tn);
  ok(tn.matches.length > 0, '(5) o sorteio gravou em t.matches (' + tn.matches.length + ' jogos)');
  ok(tn.rounds.length === 0, '(5) e NÃO em t.rounds — é o storage canônico');
  ok(tn.matches.every(function (m) { return m.isMonarch === true && m.monarchGroup != null && m.phaseIndex != null; }),
    '(5) todo jogo se DECLARA classificatório (isMonarch + grupo + fase) — é assim que o leitor o reconhece');
  ok((E.prevPhaseGroups(tn) || []).length > 0, '(5) os grupos são lidos de volta');
  ok(E.phaseComplete(tn) === false && (E.pendingMatches(tn) || []).length > 0,
    '(5) a fase começa incompleta, com os jogos pendentes visíveis ao organizador');
  tn.matches.forEach(function (m) {
    if (m.p1 && m.p2 && !m.isSitOut && !m.isBye) { m.scoreP1 = 6; m.scoreP2 = 2; m.winner = m.p1; m.sets = [{ gamesP1: 6, gamesP2: 2 }]; }
  });
  ok(E.phaseComplete(tn) === true && (E.pendingMatches(tn) || []).length === 0,
    '(5) lançados os placares, a fase fecha');
  var cls = W._computeMonarchStandings((E.prevPhaseGroups(tn) || [])[0] || {}, tn) || [];
  ok(cls.length === 4, '(5) a classificação sai com as 4 pessoas (veio ' + cls.length + ')');
  ok(cls.every(function (l) { return !!l.uid; }), '(5) e todas com uid');
  var hn = desenha(tn);
  ok(hn.indexOf('ERRO:') !== 0 && hn.length > 10000, '(5) e a chave desenha (' + hn.length + ' bytes)');
})();

console.log('──── 6. torneio LEGADO não muda de lugar sozinho ────');
(function () {
  var tl = monta(true);                       // sem `storageCanonico`
  ok(tl.storageCanonico === undefined, '(6) doc legado não tem a marca');
  var antes = { rounds: tl.rounds.length, matches: tl.matches.length };
  W._appendCanonicalColumn(tl, { phase: 'monarch', round: 2, status: 'active', format: 'rei_rainha',
    matches: [{ id: 'z1', p1: 'A / B', p2: 'C / D' }], monarchGroups: [] });
  ok(tl.rounds.length === antes.rounds + 1, '(6) escreve em t.rounds, como sempre');
  ok(tl.matches.length === antes.matches, '(6) e NÃO passa a gravar em t.matches — o Confra segue intacto');
})();

console.log('');
if (fail) { console.log('❌ dois-storages-desenham-igual: ' + pass + ' ok, ' + fail + ' falha(s)'); fails.forEach(function (f) { console.log('   • ' + f); }); process.exit(1); }
console.log('✅ dois-storages-desenham-igual: ' + pass + ' asserções, 0 falha(s)');
