// test-closeround.js — o FECHO de rodada no servidor (closeRoundCore), Opção B do Suíço-pow2.
//
// closeRoundCore(t, roundIdx, resultCtx) roda o MESMO fecho que _doCloseRound faz no cliente,
// mas puro/servidor: re-aplica o placar DEFERIDO que fechou a rodada (resultCtx) + fecha a
// rodada via _applyRoundCloseToTournament (gera a próxima Suíço, ou marca 'phaseComplete' quando
// a classificatória acaba — o avanço pra elim é do multifase). NÃO faz o commit (quem chama
// persiste). Reproduz: falha enquanto closeRoundCore não existe; passa quando roda o fecho real.
//
// node test-closeround.js

const core = require('./draw-core.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' (got ' + JSON.stringify(got) + ')' : '')); }
}

function mkSwiss(n, extra) {
  const parts = []; for (let i = 1; i <= n; i++) parts.push({ uid: 'u' + i, displayName: 'J' + i, name: 'J' + i });
  const t = Object.assign({
    id: 'sw', name: 'T', status: 'open', participants: parts,
    creatorUid: 'uOrg', organizerEmail: 'org@x.com', sport: 'Beach Tennis',
    format: 'Eliminatórias Simples', p2Resolution: 'swiss'
  }, extra || {});
  const r = core.drawInitial(t);
  return { t, r };
}
function realMatches(t, roundIdx) {
  return (t.rounds[roundIdx].matches || []).filter(function (m) { return !m.isSitOut && !m.isBye; });
}
function playAll(t, roundIdx) {
  realMatches(t, roundIdx).forEach(function (m) { if (!m.winner) m.winner = m.p1; });
}

console.log('== closeRoundCore ==');
ok('closeRoundCore existe', typeof core.closeRoundCore === 'function');

// ── 1. nextRound: Suíço-2-fases, rounds < maxRounds → gera a próxima rodada ──────────
(function () {
  const o = mkSwiss(12, { swissRounds: 3 });
  ok('drawInitial montou o Suíço (round 1)', o.r.ok && o.t.rounds && o.t.rounds.length === 1, o.r);
  playAll(o.t, 0);
  const res = core.closeRoundCore(o.t, 0, null);
  ok('round 1 completa → nextRound', res.ok && res.branch === 'nextRound', res);
  ok('rodada 2 gerada', o.t.rounds.length === 2, o.t.rounds.length);
  ok('não encerrou', o.t.status !== 'finished', o.t.status);
})();

// ── 2. phaseComplete: no maxRounds → marca completa, NÃO encerra (avanço = multifase) ──
(function () {
  const o = mkSwiss(12, { swissRounds: 2 });
  playAll(o.t, 0); core.closeRoundCore(o.t, 0, null);   // → round 2
  ok('chegou na rodada 2 (maxRounds)', o.t.rounds.length === 2, o.t.rounds.length);
  playAll(o.t, 1);
  const res = core.closeRoundCore(o.t, 1, null);
  ok('última rodada → phaseComplete', res.ok && res.branch === 'phaseComplete', res);
  ok('NÃO encerrou (avanço pra elim é do multifase)', o.t.status !== 'finished', o.t.status);
  ok('ainda na fase 0', (o.t.currentPhaseIndex || 0) === 0, o.t.currentPhaseIndex);
})();

// ── 3. guard: rodada incompleta → recusa, não gera próxima ──────────────────────────
(function () {
  const o = mkSwiss(12, { swissRounds: 3 });
  realMatches(o.t, 0).slice(0, -1).forEach(function (m) { m.winner = m.p1; });  // todos menos o último
  const res = core.closeRoundCore(o.t, 0, null);
  ok('rodada incompleta → recusa (round-incomplete)', !res.ok && res.reason === 'round-incomplete', res);
  ok('não gerou próxima rodada', o.t.rounds.length === 1, o.t.rounds.length);
})();

// ── 4. guard: re-fechar rodada antiga → recusa (idempotência/concorrência) ───────────
(function () {
  const o = mkSwiss(12, { swissRounds: 3 });
  playAll(o.t, 0); core.closeRoundCore(o.t, 0, null);   // fecha r1 → gera r2
  const res = core.closeRoundCore(o.t, 0, null);        // re-fechar r1 (stale)
  ok('re-fechar rodada antiga → recusa (stale-round)', !res.ok && res.reason === 'stale-round', res);
})();

// ── 5. resultCtx: o placar DEFERIDO do último jogo é re-aplicado ANTES de fechar ─────
(function () {
  const o = mkSwiss(12, { swissRounds: 3 });
  const ms = realMatches(o.t, 0);
  ms.slice(0, -1).forEach(function (m) { m.winner = m.p1; });
  const last = ms[ms.length - 1];
  const res0 = core.closeRoundCore(o.t, 0, null);
  ok('sem resultCtx → incompleta', !res0.ok && res0.reason === 'round-incomplete', res0);
  const res1 = core.closeRoundCore(o.t, 0, { matchId: last.id, payload: { s1: 6, s2: 2 } });
  ok('com resultCtx → aplica o placar e fecha (nextRound)', res1.ok && res1.branch === 'nextRound', res1);
  ok('último jogo ganhou vencedor (resultCtx aplicado)', !!last.winner, last.winner);
})();

console.log((fail === 0 ? '✅' : '❌') + ' closeRoundCore: ' + pass + ' ok, ' + fail + ' falharam');
if (fail) process.exit(1);
