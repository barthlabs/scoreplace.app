/* Flexibilizar equilíbrio — a REMOÇÃO do resto (núcleo puro _applyRemainderRemoval).
 *
 * CÂNONE (dono): o painel do resto NÃO mira potência de 2. Ele resolve quem ficou sem
 * dupla PELA REGRA. Flexibilizado = duplas (mistas + mesmo-gênero) já formadas → o resto
 * é só o(s) avulso(s), NÃO a sobra pra fechar pow2. A pow2 é a próxima tela.
 *
 * Reproduz a falha: SEM a flag, 19 avulsos removem 3 (pow2-down = 8 times). Com as duplas
 * já formadas + _flexibilized, remove só o 1 avulso e mantém os 9 times.
 *
 * node tests/flexibilize-remainder.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// window mínimo com as deps que draw-decisions.js usa.
const win = {};
win._entryTeamMembers = function (p) {
  if (p && typeof p === 'object' && (p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name)) return [p.p1Uid, p.p2Uid];
  if (p && Array.isArray(p.participants)) return p.participants;
  return null;
};
win._isManualPairing = function () { return false; };
win._isTeamEnrollMode = function (m) { return m === 'misto' || m === 'teams' || m === 'time'; };
win._participantUids = function (p) { return p && p.uid ? [p.uid] : []; };

const ctx = { window: win, console: console };
ctx.window = win;
const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'draw-decisions.js'), 'utf8');
vm.runInNewContext('(function(window){' + code + '})(window)', { window: win, console });

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓ ' + n + (got !== undefined ? ' — ' + got : '')); } else { fail++; console.log('  ✗ ' + n + (got !== undefined ? ' — ' + got : '')); } };

const solos = (n, g) => Array.from({ length: n }, (_, i) => ({ uid: g[0] + i, displayName: g + ' ' + i, gender: g === 'm' ? 'masculino' : 'feminino' }));

console.log('\n⚖️  _applyRemainderRemoval — flexibilizado não mira pow2\n');
ok('helper existe', typeof win._applyRemainderRemoval === 'function');

// ── SEM flexibilizar: 19 avulsos → remove 3 (pow2-down = 8 times de 16). Comportamento legado.
{
  const t = { id: 't', teamSize: 2, enrollmentMode: 'individual', participants: solos(8, 'm').concat(solos(11, 'f')) };
  const r = win._applyRemainderRemoval(t, 'standby', 'random');
  ok('sorteio puro: remove 3 (mira pow2)', r.removed.length === 3, String(r.removed.length));
  ok('sorteio puro: sobram 16 (8 duplas)', t.participants.length === 16, String(t.participants.length));
}

// ── FLEXIBILIZADO: 9 duplas já formadas + 1 avulso → remove só o 1 avulso, mantém 9 duplas.
{
  const teams = Array.from({ length: 9 }, (_, i) => ({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i }));
  const leftover = { uid: 'solo', displayName: 'Sobra', gender: 'feminino' };
  const t = { id: 't', teamSize: 2, enrollmentMode: 'individual', _flexibilized: true, participants: teams.concat([leftover]) };
  const r = win._applyRemainderRemoval(t, 'standby', 'random');
  ok('flexibilizado: remove só 1 (o avulso, NÃO pow2)', r.removed.length === 1, String(r.removed.length));
  ok('flexibilizado: mantém as 9 duplas', t.participants.length === 9, String(t.participants.length));
  ok('flexibilizado: o removido é o avulso', r.removed[0] && r.removed[0].uid === 'solo', r.removed[0] && r.removed[0].uid);
  ok('flexibilizado: as 9 entradas restantes são todas duplas', t.participants.every(function (p) { return win._entryTeamMembers(p); }));
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' passaram · ' + fail + ' falharam\n');
process.exit(fail ? 1 : 0);
