/* O toggle de disponibilidade não pode persistir a fotografia antiga do torneio. */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/tournaments-enrollment.js', 'utf8');
const begin = src.indexOf('window._toggleLigaActive = function');
const end = src.indexOf('// v0.16.89/90:', begin);
if (begin < 0 || end < 0) throw new Error('não encontrei _toggleLigaActive');

const local = { id: 'T', participants: [{ uid: 'u1', ligaActive: true }], matches: [] };
const fresh = { id: 'T', participants: [{ uid: 'u1', ligaActive: true }], matches: [{ id: 'M', scoreP1: 6, scoreP2: 4 }] };
let writes = 0, fail = 0;
const w = {
  AppStore: {
    tournaments: [local], currentUser: { uid: 'u1' }, isOrganizer: () => true,
    mutate: (id, fn) => { fn(local); fn(fresh); writes++; return Promise.resolve(true); }
  },
  showNotification() {}, _warn() {}, _t: k => k,
  _userMatchesParticipant: (u, p) => u.uid === p.uid
};
w.window = w;
const sandbox = { window: w, document: { querySelectorAll: () => [], getElementById: () => null }, renderTournaments() {}, Promise, console };
vm.createContext(sandbox);
vm.runInContext(src.slice(begin, end), sandbox, { filename: 'tournaments-enrollment.js:_toggleLigaActive' });
w._toggleLigaActive('T', false);
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
ok(writes === 1, 'a intenção é salva uma vez pela mutação transacional');
ok(fresh.participants[0].ligaActive === false, 'a disponibilidade é reaplicada no documento fresco');
ok(fresh.matches[0].scoreP1 === 6 && fresh.matches[0].scoreP2 === 4, 'placar concorrente permanece intacto');
ok(!/syncImmediate\(/.test(src.slice(begin, end)) && /Atualize o aplicativo para salvar esta alteração com segurança/.test(src.slice(begin, end)),
  'organizador não tem fallback de snapshot inteiro quando a porta transacional falta');
if (fail) process.exit(1);
