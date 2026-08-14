/* "ONDE ESTÃO OS JOGOS DESTA FASE" É UMA PERGUNTA SÓ — node tests/fase-uma-leitura-so.test.js
 *
 * ORDEM DO DONO (14/ago/2026): "tinha esse erro estrutural de achar que cada detalhe do
 * torneio (rei/rainha, pontos corridos, fase de grupos — todos os modos da classificatória,
 * enfim) rodavam em lugares diferentes… o resto é que precisa ser incorporado para funcionar
 * como a confra já funcionou, sem rodar coisas diferentes para o que deveria ser uma coisa
 * só: fase classificatória."
 *
 * O jogo de uma fase mora em UM de três storages, por história:
 *   1. t.rounds[].monarchGroups[].matches   — o caminho do CONFRA (Rei/Rainha incremental)
 *   2. t.phaseRounds[i].rounds[].matches    — Liga incremental de fase 1+
 *   3. t.matches taggeado por phaseIndex    — chave/grupos gerados de uma vez
 * `phaseComplete` (segura o avanço) e `pendingMatches` (lista o que falta pro organizador)
 * varriam os três CADA UMA — e o comentário do código chamava a segunda de "ESPELHO" da
 * primeira. Espelho não é fonte única: diverge na primeira mudança, e a divergência aqui é
 * cara — um jogo que segura a fase sem aparecer no painel deixa o organizador travado sem
 * saber por quê.
 *
 * ⚠️ ISTO NÃO MUDA COMPORTAMENTO, e é esse o ponto: o que a Confra faz hoje é a REFERÊNCIA.
 * O que se trava aqui é o INVARIANTE que as duas deviam cumprir juntas e ninguém verificava:
 *      fase completa  ⟺  zero jogos pendentes
 * nos três storages.
 *
 * ⚠️ HONESTIDADE SOBRE O CONTROLE: rodado contra o código ANTERIOR, o bloco 1 PASSA — as
 * duas varreduras concordavam nos cenários daqui. Ou seja, este arquivo NÃO reproduz um bug
 * que existia; ele impede que a concordância se perca, que é diferente e precisa ser dito
 * (ver feedback_tests_must_reproduce_real_failure — a regra vale, e a exceção está declarada).
 * O que motivou a unificação foi outro fato, esse sim medido: `phaseComplete` lia o grupo
 * por um caminho que o doc DOBRADO do Firestore não expõe, e o resultado era a fase do
 * Confra parecer que nunca completaria. Duas varreduras separadas é o que torna esse tipo
 * de engano possível de um lado e invisível do outro.
 */
const { window: W, load, E } = require('./headless.js');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const P = E && E.phaseComplete ? E : (W.PHASES_ENGINE || W.PhasesEngine || {});
ok(typeof P.phaseComplete === 'function', 'phaseComplete disponível');
ok(typeof P.pendingMatches === 'function', 'pendingMatches disponível');
ok(typeof P.phaseGames === 'function', 'phaseGames (o leitor único) está exportado');

function jogo(id, decidido, extra) {
  const m = { id: id, p1: 'A / B', p2: 'C / D' };
  if (decidido) { m.winner = 'A / B'; m.scoreP1 = 6; m.scoreP2 = 2; }
  return Object.assign(m, extra || {});
}
const FASES = [{ name: 'Classificatória' }, { name: 'Eliminatória' }];

// ── os três storages, cada um em duas versões: completo e com 1 jogo pendente ──
function storage1(completo) {           // Confra: t.rounds[].monarchGroups
  return {
    id: 't1', phases: FASES, currentPhaseIndex: 0, rounds: [{
      number: 1,
      matches: [jogo('a', true), jogo('b', true), jogo('c', completo)],
      monarchGroups: [{ name: 'G1', players: ['A', 'B', 'C', 'D'], matches: [] }]
    }]
  };
}
function storage2(completo) {           // Liga incremental de fase 1+
  return {
    id: 't2', phases: [{ name: 'X' }, { name: 'Temporada', rounds: 1 }],
    currentPhaseIndex: 1,
    phaseRounds: { 1: { rounds: [{ round: 1, matches: [jogo('a', true), jogo('b', completo)] }] } }
  };
}
function storage3(completo) {           // chave gerada de uma vez
  return {
    id: 't3', phases: FASES, currentPhaseIndex: 1,
    matches: [jogo('a', true, { phaseIndex: 1 }), jogo('b', completo, { phaseIndex: 1 })]
  };
}

console.log('──── 1. fase completa ⟺ zero pendentes, nos TRÊS storages ────');
[['1 · rounds/monarchGroups (Confra)', storage1],
 ['2 · phaseRounds (Liga incremental)', storage2],
 ['3 · matches por phaseIndex (chave)', storage3]].forEach(function (par) {
  const rot = par[0], mk = par[1];
  [true, false].forEach(function (completo) {
    const t = mk(completo);
    // hidrata o storage 1 como o app faz no ingest (grupos guardam matchIds/refs)
    if (t.rounds && typeof W._hydrateMonarchGroups === 'function') {
      t.rounds.forEach(function (r) {
        if (r.monarchGroups) r.monarchGroups.forEach(function (g) { g.matches = r.matches; });
      });
    }
    const completa = P.phaseComplete(t);
    const pend = P.pendingMatches(t) || [];
    const cenario = rot + (completo ? ' [tudo decidido]' : ' [1 pendente]');
    ok(completa === (pend.length === 0),
      cenario + ': completa=' + completa + ' e pendentes=' + pend.length + ' — têm que concordar');
    if (completo) ok(pend.length === 0, cenario + ': nenhum pendente');
    else ok(pend.length === 1, cenario + ': exatamente 1 pendente (veio ' + pend.length + ')');
  });
});

console.log('──── 2. o leitor único enxerga os três storages ────');
ok(P.phaseGames(storage2(true), 1).length === 2, 'phaseGames lê phaseRounds');
ok(P.phaseGames(storage3(true), 1).length === 2, 'phaseGames lê matches por phaseIndex');
const t1 = storage1(true);
t1.rounds.forEach(function (r) { r.monarchGroups.forEach(function (g) { g.matches = r.matches; }); });
ok(P.phaseGames(t1, 0).length === 3, 'phaseGames lê os grupos da fase 0 (o caminho do Confra)');
ok(P.phaseGames(t1, 0).every(function (u) { return u.groupIdx != null; }),
  'a fase 0 devolve o grupo de cada jogo (é o que o painel usa pra dizer ONDE está pendente)');

console.log('──── 3. BYE e folga não seguram a fase ────');
const tFolga = storage1(true);
tFolga.rounds[0].matches.push(jogo('d', false, { isSitOut: true }));
tFolga.rounds[0].matches.push(jogo('e', false, { isBye: true }));
tFolga.rounds.forEach(function (r) { r.monarchGroups.forEach(function (g) { g.matches = r.matches; }); });
ok(P.phaseComplete(tFolga) === true, 'grupo com folga e BYE ainda conta como completo');
ok((P.pendingMatches(tFolga) || []).length === 0, 'folga e BYE não aparecem como pendentes');

console.log('──── 4. grupo VAZIO segura a fase (invariante que o achatamento poderia perder) ────');
// Ao trocar a varredura por-grupo por uma lista achatada, "nenhum grupo sem jogo" some se
// ninguém contar os grupos. Aqui o 2º grupo não tem jogo nenhum: a fase NÃO pode completar.
const tVazio = storage1(true);
tVazio.rounds[0].monarchGroups = [
  { name: 'G1', matches: tVazio.rounds[0].matches },
  { name: 'G2', matches: [] }
];
ok(P.phaseComplete(tVazio) === false, 'grupo sem nenhum jogo impede a fase de completar');

console.log('──── 5. varredura: a leitura não voltou a ser copiada ────');
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../js/views/phases-engine.js'), 'utf8');
ok(/function phaseGames\s*\(/.test(src), 'existe o leitor único phaseGames');
const corpoPend = (src.match(/function pendingMatches[\s\S]*?\n  \}/) || [''])[0];
ok(/phaseGames\(/.test(corpoPend), 'pendingMatches deriva do leitor único');
ok(!/t\.phaseRounds && t\.phaseRounds\[cur\]\s*;[\s\S]{0,200}forEach[\s\S]{0,120}matches/.test(corpoPend),
  'pendingMatches não varre os storages por conta própria de novo');
const corpoComp = (src.match(/function phaseComplete[\s\S]*?\n  \}/) || [''])[0];
ok((corpoComp.match(/phaseGames\(/g) || []).length >= 3,
  'phaseComplete usa o leitor único nos três ramos');

console.log('');
if (fail) { console.log('❌ fase-uma-leitura-so: ' + pass + ' ok, ' + fail + ' falha(s)'); fails.forEach(function (f) { console.log('   • ' + f); }); process.exit(1); }
console.log('✅ fase-uma-leitura-so: ' + pass + ' asserções, 0 falha(s)');
