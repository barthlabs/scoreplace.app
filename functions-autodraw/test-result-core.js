// test-result-core.js — quem PODE lançar o placar, decidido no SERVIDOR.
//
// O que estes testes defendem (e o que ficava VERMELHO no código anterior à v1.7): até
// aqui `t.resultEntry`, o lado do jogador e a fase da negociação eram checados SÓ no
// navegador. Com as firestore.rules liberando `matches` pro participante, um cliente
// adulterado (ou uma view velha) lançava placar em jogo alheio, em fase 'organizer', ou
// por cima da proposta do adversário — e nada no servidor dizia não.
//
// Identidade é SEMPRE uid: os fixtures usam p1Uid/p2Uid e NENHUM nome que case, pra que
// qualquer código que tente resolver por nome falhe aqui. [[project_uid_identity_canon_locked]]

const core = require('./result-core.js');
const win = core._window;

let ok = 0, fail = 0;
function t(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); }
}

const UID_A1 = 'uid_ana', UID_A2 = 'uid_bia';   // time 1
const UID_B1 = 'uid_caio', UID_B2 = 'uid_dora'; // time 2
const UID_ORG = 'uid_org', UID_FORA = 'uid_estranho';

function mkT(over) {
  const base = {
    id: 'tour_test',
    name: 'Teste',
    creatorUid: UID_ORG,
    resultEntry: 'players',
    phases: [{ name: 'Fase 1', resultEntry: 'players' }],
    participants: [
      { uid: UID_A1 }, { uid: UID_A2 }, { uid: UID_B1 }, { uid: UID_B2 }
    ],
    rounds: [{ matches: [] }],
    matches: [],
    history: []
  };
  const m = {
    id: 'm1', roundIndex: 0,
    p1: 'Ana / Bia', p2: 'Caio / Dora',
    p1Uid: UID_A1, p2Uid: UID_B1,
    team1Uids: [UID_A1, UID_A2], team2Uids: [UID_B1, UID_B2]
  };
  base.rounds[0].matches.push(m);
  return Object.assign(base, over || {});
}

const PAYLOAD = { s1: 6, s2: 3, useSets: false, pending: { scoreP1: 6, scoreP2: 3, winner: 'Ana / Bia' } };

console.log('\n──── result-core: autorização ────');

// 1) Organizador pode sempre.
{
  const T = mkT();
  const r = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_ORG }, now: 1 });
  t('organizador lança direto (applied)', r.ok && r.outcome === 'applied', JSON.stringify(r));
}

// 2) Fase 'organizer' → participante do jogo é RECUSADO. É o buraco central.
{
  const T = mkT({ resultEntry: 'organizer', phases: [{ name: 'Fase 1', resultEntry: 'organizer' }] });
  const r = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_A1 }, now: 1 });
  t('fase organizer → participante RECUSADO', r.ok === false && r.reason === 'organizer-only', JSON.stringify(r));
}

// 3) Config POR FASE manda (top-level 'players', fase 'organizer').
//    Sem o _effectiveResultEntry portado, o servidor leria o top-level e ACEITARIA.
{
  const T = mkT({ resultEntry: 'players', phases: [{ name: 'Fase 1', resultEntry: 'organizer' }] });
  const r = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_A1 }, now: 1 });
  t('fase vence o top-level (organizer na fase → recusa)', r.ok === false && r.reason === 'organizer-only', JSON.stringify(r));
}

// 4) Quem NÃO está no jogo não lança, mesmo com a fase liberada pra players.
{
  const T = mkT();
  const r = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_FORA }, now: 1 });
  t('estranho ao jogo → RECUSADO', r.ok === false && r.reason === 'not-in-match', JSON.stringify(r));
}

// 5) Participante do jogo propõe → vira pendingResult (não aplica direto).
{
  const T = mkT();
  const r = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_A1 }, now: 1234 });
  const m = win._findMatch(T, 'm1');
  t('participante propõe → pending', r.ok && r.outcome === 'pending', JSON.stringify(r));
  t('pendingResult carimba quem propôs', m.pendingResult && m.pendingResult.proposedBy === UID_A1);
  t('não define vencedor ainda', !m.winner);
}

// 6) TRAVA 18/jul: com proposta do time 1 aberta, o time 2 NÃO sobrescreve.
{
  const T = mkT();
  core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_A1 }, now: 1 });
  const r = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_B1 }, now: 2 });
  t('lado oposto não clobbera proposta aberta', r.ok === false && r.reason === 'pending-other-side', JSON.stringify(r));
}

// 7) O MESMO lado pode relançar a própria proposta (comportamento preservado).
{
  const T = mkT();
  core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_A1 }, now: 1 });
  const r = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_A2 }, now: 2 });
  t('mesmo time relança a própria proposta', r.ok === true, JSON.stringify(r));
}

// 8) Em DISPUTA participante está bloqueado; organizador resolve.
{
  const T = mkT();
  const m = win._findMatch(T, 'm1');
  m.pendingResult = { proposedBy: UID_A1, disputed: true };
  const rP = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_B1 }, now: 1 });
  t('disputa → participante RECUSADO', rP.ok === false && rP.reason === 'disputed-organizer-only', JSON.stringify(rP));
  const rO = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_ORG }, now: 2 });
  t('disputa → organizador aplica', rO.ok && rO.outcome === 'applied', JSON.stringify(rO));
}

// 9) O adversário aprova a proposta CANONICAMENTE: não manda placar, a CF usa
// o pendingResult fresco. O proponente não pode autoaprovar a própria proposta.
{
  const T = mkT();
  core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_A1 }, now: 1 });
  const self = core.applyResult(T, { matchId: 'm1', payload: { action: 'approve-pending' }, actor: { uid: UID_A2 }, now: 2 });
  t('proponente não autoaprova', self.ok === false && self.reason === 'not-allowed-to-approve', JSON.stringify(self));
  const other = core.applyResult(T, { matchId: 'm1', payload: { action: 'approve-pending' }, actor: { uid: UID_B1 }, now: 3 });
  const m = win._findMatch(T, 'm1');
  t('adversário aprova proposta fresca', other.ok && other.outcome === 'applied', JSON.stringify(other));
  t('aprovação define vencedor e limpa pendência', !!m.winner && !m.pendingResult);
}

// 9) Sem ator (chamada sem auth) nunca passa.
{
  const T = mkT();
  const r = core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: {}, now: 1 });
  t('sem uid → RECUSADO', r.ok === false && r.reason === 'no-actor', JSON.stringify(r));
}

// 10) Contra-proposta só pode sair do outro time e preserva a proposta que a CF leu.
{
  const T = mkT();
  core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_A1 }, now: 1 });
  const r = core.applyResult(T, {
    matchId: 'm1',
    payload: { action: 'counter-pending', pending: { scoreP1: 3, scoreP2: 6, winner: 'Caio / Dora' } },
    actor: { uid: UID_B1 }, now: 2
  });
  const m = win._findMatch(T, 'm1');
  t('adversário envia contra-proposta pela CF', r.ok && r.outcome === 'pending', JSON.stringify(r));
  t('contra-proposta preserva a proposta original fresca', m.pendingResult && m.pendingResult.proposedBy === UID_B1 && m.pendingResult.originalProposal && m.pendingResult.originalProposal.proposedBy === UID_A1);
  const self = core.applyResult(T, {
    matchId: 'm1', payload: { action: 'counter-pending', pending: PAYLOAD.pending }, actor: { uid: UID_B2 }, now: 3
  });
  t('mesmo lado não sobrepõe a própria contra-proposta', self.ok === false && self.reason === 'not-allowed-to-counter', JSON.stringify(self));
}

// 11) Contestação é decidida no servidor e o proponente não consegue se auto-contestar.
{
  const T = mkT();
  core.applyResult(T, { matchId: 'm1', payload: PAYLOAD, actor: { uid: UID_A1 }, now: 1 });
  const self = core.applyResult(T, { matchId: 'm1', payload: { action: 'contest-pending' }, actor: { uid: UID_A2 }, now: 2 });
  t('proponente não auto-contesta', self.ok === false && self.reason === 'not-allowed-to-contest', JSON.stringify(self));
  const other = core.applyResult(T, { matchId: 'm1', payload: { action: 'contest-pending' }, actor: { uid: UID_B1, name: 'Caio' }, now: 3 });
  const m = win._findMatch(T, 'm1');
  t('adversário contesta pelo documento fresco', other.ok && other.outcome === 'disputed', JSON.stringify(other));
  t('contestação registra o ator canônico', m.pendingResult && m.pendingResult.disputed === true && m.pendingResult.disputedBy === UID_B1 && m.pendingResult.disputedByName === 'Caio');
}

// 12) Jogo inexistente.
{
  const T = mkT();
  const r = core.applyResult(T, { matchId: 'nope', payload: PAYLOAD, actor: { uid: UID_ORG }, now: 1 });
  t('match inexistente → RECUSADO', r.ok === false && r.reason === 'match-not-found', JSON.stringify(r));
}

console.log('\n──── result-core: reabertura administrativa ────');

// 13) Reabrir resultado é exclusivamente do organizador e desfaz avanço/classificação.
{
  const T = mkT({ classification: { 'Ana / Bia': { place: 1 }, 'Caio / Dora': { place: 2 } } });
  const m = win._findMatch(T, 'm1');
  const next = { id: 'm2', p1: 'Ana / Bia', p2: 'TBD' };
  T.matches.push(next); m.nextMatchId = 'm2';
  m.winner = 'Ana / Bia'; m.scoreP1 = 6; m.scoreP2 = 2; m.sets = [{ gamesP1: 6, gamesP2: 2 }];
  const denied = core.applyResult(T, { matchId: 'm1', payload: { action: 'reopen-result' }, actor: { uid: UID_A1 }, now: 1 });
  t('participante não reabre resultado', denied.ok === false && denied.reason === 'organizer-only', JSON.stringify(denied));
  const reopened = core.applyResult(T, { matchId: 'm1', payload: { action: 'reopen-result' }, actor: { uid: UID_ORG }, now: 2 });
  t('organizador reabre resultado pela CF', reopened.ok && reopened.outcome === 'result-reopened', JSON.stringify(reopened));
  t('reabertura desfaz avanço e placar', next.p1 === 'TBD' && !m.winner && m.scoreP1 === undefined && !m.sets);
  t('reabertura limpa classificação progressiva', !T.classification['Ana / Bia'] && !T.classification['Caio / Dora']);
}

// 14) Refazer limpa pendência/placar sem tentar remover um avanço que já não existe.
{
  const T = mkT(); const m = win._findMatch(T, 'm1');
  m.winner = 'Ana / Bia'; m.pendingResult = { proposedBy: UID_A1 }; m.scoreP1 = 6; m.scoreP2 = 0;
  const r = core.applyResult(T, { matchId: 'm1', payload: { action: 'reset-match' }, actor: { uid: UID_ORG }, now: 1 });
  t('refazer partida é ação administrativa da CF', r.ok && r.outcome === 'match-reset', JSON.stringify(r));
  t('refazer remove placar e pendência', !m.winner && !m.pendingResult && m.scoreP1 === undefined && m.scoreP2 === undefined);
}

// 15) Reverter W.O. desfaz avanço, ausência e encerramento, mas nunca apaga jogo real.
{
  const T = mkT({ status: 'finished', finishedAt: 'x', absent: { Ana: true, Bia: true }, woHistory: { Ana: { name: 'Ana' }, Bia: { name: 'Bia' } } });
  const m = win._findMatch(T, 'm1'); const next = { id: 'm2', p1: 'Ana / Bia', p2: 'TBD' };
  T.matches.push(next); m.nextMatchId = 'm2'; m.wo = true; m.woAbsentSide = 2; m.winner = 'Ana / Bia'; m.scoreP1 = 'W.O.'; m.scoreP2 = 0;
  const r = core.applyResult(T, { matchId: 'm1', payload: { action: 'revert-wo' }, actor: { uid: UID_ORG }, now: 1 });
  t('organizador reverte W.O. pela CF', r.ok && r.outcome === 'wo-reverted', JSON.stringify(r));
  t('W.O. revertido remove avanço, ausência e encerramento', next.p1 === 'TBD' && !m.wo && m.scoreP1 === undefined && !T.absent.Ana && !T.absent.Bia && !T.woHistory.Ana && !T.woHistory.Bia && T.status === 'active' && !T.finishedAt);
  m.wo = true; m.sets = [{ gamesP1: 6, gamesP2: 2 }];
  const real = core.applyResult(T, { matchId: 'm1', payload: { action: 'revert-wo' }, actor: { uid: UID_ORG }, now: 2 });
  t('W.O. com jogo real não é apagado', real.ok === false && real.reason === 'wo-has-real-play', JSON.stringify(real));
}

// 16) O fechamento do placar ao vivo é reaplicado pelo servidor e não entra em fila de aprovação.
{
  const T = mkT(); const m = win._findMatch(T, 'm1');
  const r = core.applyResult(T, { matchId: 'm1', payload: { action: 'live-final', s1: 6, s2: 4, useSets: false }, actor: { uid: UID_A1 }, now: 1 });
  t('placar ao vivo final é aplicado pela CF', r.ok && r.outcome === 'applied' && m.winner === 'Ana / Bia' && m.liveScored === true, JSON.stringify(r));
  t('placar ao vivo não cria pendência entre times', !m.pendingResult && m.scoreP1 === 6 && m.scoreP2 === 4);
}

console.log('\n──── paridade com o cliente ────');

// 11) _effectiveResultEntry do servidor == o de js/store.js (evita drift silencioso).
{
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
  const mm = src.match(/window\._effectiveResultEntry = function[\s\S]*?\n\};/);
  t('achou _effectiveResultEntry em store.js', !!mm);
  if (mm) {
    const sandbox = { window: {} };
    new Function('window', mm[0])(sandbox.window);
    const cases = [
      [{ resultEntry: 'players' }, {}],
      [{ resultEntry: 'players', phases: [{ resultEntry: 'organizer' }] }, {}],
      [{ resultEntry: 'organizer', phases: [{ resultEntry: 'all' }] }, {}],
      [{ phases: [{}, { resultEntry: 'players' }] }, { phaseIndex: 1 }],
      [{}, {}]
    ];
    let same = true, detail = '';
    cases.forEach(function (c) {
      const a = sandbox.window._effectiveResultEntry(c[0], c[1]);
      const b = win._effectiveResultEntry(c[0], c[1]);
      if (a !== b) { same = false; detail += JSON.stringify(c[0]) + ' cliente=' + a + ' servidor=' + b + '; '; }
    });
    t('servidor e store.js concordam em 5 formas', same, detail);
  }
}

console.log('\n' + ok + ' asserts OK, ' + fail + ' falha(s)');
if (fail) { console.log('❌ result-core: FALHOU'); process.exit(1); }
console.log('✅ result-core: OK');
