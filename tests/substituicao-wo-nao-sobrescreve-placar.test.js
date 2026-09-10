/* L7.P1.8 — substituir W.O. muda elenco/jogos, portanto precisa ser reaplicado
 * no documento fresco; uma aba antiga não pode salvar a fotografia inteira e
 * apagar o placar que entrou enquanto a substituta era escolhida. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/participants.js', 'utf8');
const begin = src.indexOf('window._processWoSubstitutions = function');
const end = src.indexOf('// ── O MOTOR DE W.O.', begin);
if (begin < 0 || end < 0) throw new Error('não encontrei o wrapper de substituição W.O.');
const local = { id: 'T1', matches: [{ id: 'M1' }] };
const fresh = { id: 'T1', matches: [{ id: 'M1', winner: 'Dupla B', scoreP1: 2, scoreP2: 6 }] };
let mutations = 0;
function apply(t) {
  if (t.substitutaAplicada) return { ok: false, subCount: 0 };
  t.substitutaAplicada = true;
  return { ok: true, subCount: 1 };
}
const sandbox = {
  window: null,
  _findTournamentById: () => local,
  _applyWoSubsToTournament: () => { throw new Error('motor local não deve rodar'); },
  AppStore: { mutate(id, fn) { mutations++; fn(local); return fn(fresh); } }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(begin, end), sandbox, { filename: 'participants.js:wo-substitution' });
const result = sandbox._processWoSubstitutions('T1');
let fail = 0;
function ok(value, label) { if (value) console.log('✓ ' + label); else { fail++; console.error('✗ ' + label); } }
ok(result.reason === 'server-owned' && mutations === 0, 'o wrapper legado não abre mutação local');
ok(fresh.substitutaAplicada !== true, 'o cliente não reaplica substituição na cópia fresca');
ok(fresh.matches[0].winner === 'Dupla B' && fresh.matches[0].scoreP1 === 2 && fresh.matches[0].scoreP2 === 6,
  'o placar concorrente permanece intacto');
ok(!/syncImmediate\(|AppStore\.sync\(/.test(src.slice(begin, end)), 'não há fallback de snapshot inteiro');
const legacy = { window: null, _findTournamentById: () => ({ id: 'T2' }), AppStore: {} };
legacy.window = legacy;
vm.createContext(legacy);
vm.runInContext(src.slice(begin, end), legacy, { filename: 'participants.js:wo-substitution-legacy' });
ok(legacy._processWoSubstitutions('T2').reason === 'server-owned',
  'a compatibilidade não altera nem salva cópia antiga');
console.log('substituicao-wo-nao-sobrescreve-placar: ' + (5 - fail) + ' passou, ' + fail + ' falhou');
process.exit(fail ? 1 : 0);
