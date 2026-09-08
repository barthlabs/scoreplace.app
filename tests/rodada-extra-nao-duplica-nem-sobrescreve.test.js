/* L7.P1.9 — a rodada extra é uma intenção: retry usa o mesmo RNG e só pode
 * materializar o próximo número de rodada uma vez, sem apagar placar concorrente. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/tournaments-draw.js', 'utf8');
const begin = src.indexOf('function _extraRoundRng');
const end = src.indexOf('window._buildPhase0Cfg', begin);
if (begin < 0 || end < 0) throw new Error('não encontrei o gerador de rodada extra');
const local = { id: 'T1', rounds: [{ round: 1, matches: [{ id: 'old' }] }], matches: [] };
const fresh = { id: 'T1', rounds: [{ round: 1, matches: [{ id: 'old', winner: 'B', scoreP1: 2, scoreP2: 6 }] }], matches: [] };
let mutations = 0, action = '', randoms = [], retryBlocked = false;
const sandbox = {
  window: null,
  setTimeout: (fn) => fn(),
  location: { hash: '' },
  _findTournamentById: () => local,
  _generateNextRound(target, det) {
    randoms.push(det.rnd());
    const next = (target.rounds || []).reduce((m, r) => Math.max(m, r.round || 0), 0) + 1;
    target.rounds.push({ round: next, matches: [{ id: 'r' + next + '-' + det.ts, random: randoms[randoms.length - 1] }] });
  },
  AppStore: {
    mutate(id, fn, message) {
      mutations++; action = message;
      const a = fn(local);
      if (a === false) return Promise.resolve(false);
      retryBlocked = fn(local) === false;
      const b = fn(fresh);
      return Promise.resolve(b === false ? false : true);
    }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(begin, end), sandbox, { filename: 'tournaments-draw.js:extra-round' });
let fail = 0;
function ok(value, label) { if (value) console.log('✓ ' + label); else { fail++; console.error('✗ ' + label); } }
(async () => {
  sandbox._generateExtraRound('T1');
  await Promise.resolve(); await Promise.resolve();
  ok(mutations === 1 && action === 'Rodada extra 2 gerada manualmente', 'uma intenção transacional é aberta para a rodada esperada');
  ok(randoms.length === 2 && randoms[0] === randoms[1], 'retry local/fresco usa a mesma fonte aleatória');
  ok(retryBlocked, 'segunda aplicação da mesma intenção é bloqueada sem criar outra rodada');
  ok(fresh.rounds.some((r) => r.round === 2), 'a rodada 2 é criada no documento fresco');
  const scored = fresh.rounds[0].matches[0];
  ok(scored.winner === 'B' && scored.scoreP1 === 2 && scored.scoreP2 === 6, 'placar concorrente da rodada anterior permanece intacto');
  ok(/if \(_maxRound >= _expectedRound\) return false;/.test(src.slice(begin, end)),
    'documento fresco que já alcançou a rodada esperada aborta a intenção');
  ok(!/\b_after\b/.test(src.slice(begin, end)), 'avisos e notificações usam o número da intenção, não contador removido');
  ok(!/syncImmediate\(|AppStore\.sync\(/.test(src.slice(begin, end)), 'não há fallback de snapshot inteiro');
  console.log('rodada-extra-nao-duplica-nem-sobrescreve: ' + (8 - fail) + ' passou, ' + fail + ' falhou');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
