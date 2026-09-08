/* L7.P1.10 — fechar rodada da Liga em uma fase é uma intenção transacional.
 * Retry não pode montar dois pareamentos nem apagar placar que chegou depois. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/bracket.js', 'utf8');
const begin = src.indexOf('function _phaseRoundRng');
const end = src.indexOf('// v2.8.24:', begin);
if (begin < 0 || end < 0) throw new Error('não encontrei fechamento de rodada da Liga');
const local = { id: 'T1', phaseRounds: [{ rounds: [{ round: 1, matches: [{ id: 'old', winner: 'A' }] }] }] };
const fresh = { id: 'T1', phaseRounds: [{ rounds: [{ round: 1, matches: [{ id: 'old', winner: 'B', scoreP1: 4, scoreP2: 6 }] }] }] };
let mutations = 0, action = '', randoms = [];
const sandbox = {
  window: null,
  _findTournamentById: () => local,
  _phaseGenNextLeagueRound(target, idx, det) {
    randoms.push(det.rnd());
    const rounds = target.phaseRounds[idx].rounds;
    const next = rounds.reduce((m, r) => Math.max(m, r.round || 0), 0) + 1;
    rounds.push({ round: next, matches: [{ id: 'r' + next, random: randoms[randoms.length - 1] }] });
    return true;
  },
  AppStore: {
    mutate(id, fn, msg) {
      mutations++; action = msg;
      const a = fn(local); if (a === false) return Promise.resolve(false);
      const b = fn(fresh); return Promise.resolve(b === false ? false : true);
    }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(begin, end), sandbox, { filename: 'bracket.js:phase-close-league' });
let fail = 0;
function ok(value, label) { if (value) console.log('✓ ' + label); else { fail++; console.error('✗ ' + label); } }
(async () => {
  sandbox._phaseCloseLeagueRound('T1', 0);
  await Promise.resolve(); await Promise.resolve();
  ok(mutations === 1 && /rodada 1 encerrada/.test(action), 'fecha a rodada por uma única mutação fresca');
  ok(randoms.length === 2 && randoms[0] === randoms[1], 'reaplicações usam RNG estável');
  ok(fresh.phaseRounds[0].rounds.some((r) => r.round === 2), 'a rodada seguinte nasce no documento fresco');
  const scored = fresh.phaseRounds[0].rounds[0].matches[0];
  ok(scored.winner === 'B' && scored.scoreP1 === 4 && scored.scoreP2 === 6, 'placar concorrente permanece intacto');
  ok(/if \(freshMax >= _expectedRound\) return false;/.test(src.slice(begin, end)), 'rodada já existente aborta a intenção');
  ok(!/syncImmediate\(|AppStore\.sync\(/.test(src.slice(begin, end)), 'não há fallback de snapshot inteiro');
  console.log('fechar-rodada-liga-nao-duplica-nem-sobrescreve: ' + (6 - fail) + ' passou, ' + fail + ' falhou');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
