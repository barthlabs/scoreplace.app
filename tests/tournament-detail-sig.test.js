// tournament-detail-sig.test.js — GATE do detalhe (#tournaments/:id) não pula ao marcar presença.
//
// Bug do dono ("tela continua pulando ao colocar presenças"): a chamada de DUPLAS vive na view de
// DETALHE, cujo gate de soft-refresh usava `updatedAt`. O updatedAt LOCAL ≠ o do servidor que volta
// no eco → o snapshot do próprio write SEMPRE diferia → re-render → PULO. _tournamentDetailSig é
// DETERMINÍSTICA (conteúdo: presença + jogos + fase, sem updatedAt): o toggle in-place a adianta e
// o eco vê "igual". Mas mudança REAL (presença de outro device, resultado lançado) muda a sig.
//
// node tests/tournament-detail-sig.test.js

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (' + got + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' (' + got + ')' : '')); }
}

// carrega só a definição de _tournamentDetailSig do store.js num window fake
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const g = { window: {} };
// extrai o bloco `window._tournamentDetailSig = function (t) { ... };`
const m = src.match(/window\._tournamentDetailSig = function[\s\S]*?\n};/);
if (!m) { console.log('  ✗ não achei _tournamentDetailSig no store.js'); process.exit(1); }
// _collectAllMatches simples (só t.matches) pra o teste
g.window._collectAllMatches = function (t) { return Array.isArray(t.matches) ? t.matches : []; };
new Function('window', m[0] + '\nwindow.__sig = window._tournamentDetailSig;')(g.window);
const sig = g.window.__sig;

function mk() {
  return {
    id: 'T1', status: 'active', currentStage: null, currentPhaseIndex: 0, tournamentStarted: true,
    participants: [{ displayName: 'A / B' }, { displayName: 'C / D' }],
    standbyParticipants: [{ displayName: 'E / F' }], waitlist: [],
    checkedIn: {}, absent: {}, checkedInConfirmed: {},
    matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D', winner: null, score1: null, score2: null }],
  };
}

// 1. Determinística: mesmo estado → mesma sig
const t = mk();
ok('determinística (mesma entrada → mesma sig)', sig(t) === sig(mk()), 'estável');

// 2. Eco do PRÓPRIO write: marca presença local → adianta sig; recomputar dá IGUAL (sem re-render)
const s0 = sig(t);
t.checkedIn['uidA'] = 1;                 // marca presença (in-place)
const sAfterToggle = sig(t);            // advanced _tdetailSig
ok('presença MUDA a sig (eco de outro device re-renderiza)', sAfterToggle !== s0, 'mudou');
ok('recomputar após o toggle dá IGUAL (eco do próprio write = no-op)', sig(t) === sAfterToggle, 'igual');

// 3. Resultado lançado MUDA a sig (detalhe TEM que re-renderizar)
const t2 = mk();
const r0 = sig(t2);
t2.matches[0].winner = 'A / B'; t2.matches[0].score1 = 6; t2.matches[0].score2 = 3;
ok('resultado lançado muda a sig', sig(t2) !== r0, 'mudou');

// 4. "a definir" preenchido (adversário definido) muda a sig
const t3 = mk();
t3.matches.push({ id: 'm2', p1: 'A / B', p2: 'TBD', winner: null });
const a0 = sig(t3);
t3.matches[1].p2 = 'G / H';
ok('adversário definido (TBD→nome) muda a sig', sig(t3) !== a0, 'mudou');

// 5. Integração tardia (espera diminui + jogo cresce) muda a sig
const t4 = mk();
const i0 = sig(t4);
t4.standbyParticipants = [];
t4.matches.push({ id: 'm2', p1: 'E / F', p2: 'G / H', winner: null });
ok('integração tardia muda a sig', sig(t4) !== i0, 'mudou');

// 6. NÃO usa updatedAt: mudar só updatedAt NÃO muda a sig (mata o pulo do eco)
const t5 = mk();
const u0 = sig(t5);
t5.updatedAt = '2099-01-01T00:00:00.000Z';
ok('updatedAt NÃO entra na sig (eco não re-renderiza por timestamp)', sig(t5) === u0, 'igual');

console.log('\n' + '═'.repeat(40));
console.log((fail === 0 ? '✅' : '❌') + ' tournament-detail-sig: ' + pass + ' ok, ' + fail + ' falharam');
console.log('═'.repeat(40));
if (fail > 0) process.exit(1);
