/* Flexibilizar como DECISÃO replicável na CF (Fase 1 — cânone roda no servidor).
 *
 * CÂNONE (dono): o cliente só DISPARA + manda as decisões; a CF forma as duplas e resolve.
 * Aqui o `_applyDrawDecisions` (o que a CF drawRound roda sobre o doc fresco) recebe
 * `{flexibilize:true}` e, PARTINDO DE AVULSOS (sem duplas pré-formadas), forma as duplas
 * equilibrado (mistas primeiro, mínimo mesmo-gênero) e depois o resto tira só o avulso.
 * Prova que a CF replica flexibilizar SEM depender de o cliente ter pré-formado.
 *
 * node tests/flexibilize-decision-cf.test.js
 */
const W = require('./render-harness').window; // traz _formDoublesTeams / _entryTeamMembers
const fs = require('fs');
const path = require('path');
const vm = require('vm');

if (!W._isManualPairing) W._isManualPairing = function () { return false; };
if (!W._isTeamEnrollMode) W._isTeamEnrollMode = function (m) { return m === 'misto' || m === 'teams' || m === 'time'; };
// carrega draw-decisions.js DENTRO da mesma window do harness (define W._applyDrawDecisions)
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'draw-decisions.js'), 'utf8'), { window: W, console: console });

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓ ' + n + (got !== undefined ? ' — ' + got : '')); } else { fail++; console.log('  ✗ ' + n + (got !== undefined ? ' — ' + got : '')); } };
const solos = (n, g) => Array.from({ length: n }, (_, i) => ({ uid: g + i, displayName: (g === 'm' ? 'Homem ' : 'Mulher ') + i, gender: g === 'm' ? 'masculino' : 'feminino' }));
const isTeam = (p) => !!W._entryTeamMembers(p);

console.log('\n🖥️  _applyDrawDecisions — flexibilizar replicado no servidor\n');
ok('_applyDrawDecisions existe', typeof W._applyDrawDecisions === 'function');
ok('_formDoublesTeams disponível (vendorado)', typeof W._formDoublesTeams === 'function');

// ── A CF parte de AVULSOS (8H+11M) e replica flexibilizar via decisão ────────
{
  const t = { id: 't', teamSize: 2, enrollmentMode: 'individual', _drawBalanceMode: 'equilibrado',
    participants: solos(8, 'm').concat(solos(11, 'f')), waitlist: [] };
  W._applyDrawDecisions(t, { flexibilize: true, balanceMode: 'equilibrado', remainder: { mode: 'standby', method: 'random' } });
  const teams = t.participants.filter(isTeam).length;
  const avulsos = t.participants.filter(function (p) { return !isTeam(p); }).length;
  ok('CF setou _flexibilized', t._flexibilized === true);
  ok('CF formou 9 duplas (8 mistas + 1 mesmo-gênero = mínimo)', teams === 9, String(teams));
  ok('resto tirou o avulso → 0 avulsos restam', avulsos === 0, String(avulsos));
  ok('9 duplas jogam (todas as entradas são duplas)', t.participants.length === 9, String(t.participants.length));
  ok('o avulso foi pra lista de espera (1)', (t.waitlist || []).length === 1, String((t.waitlist || []).length));
}

// ── SEM flexibilizar: mesma decisão de resto mira pow2 (remove 3) — contraste ─
{
  const t = { id: 't', teamSize: 2, enrollmentMode: 'individual', _drawBalanceMode: 'equilibrado',
    participants: solos(8, 'm').concat(solos(11, 'f')), waitlist: [] };
  W._applyDrawDecisions(t, { balanceMode: 'equilibrado', remainder: { mode: 'standby', method: 'random' } });
  ok('sem flexibilize: resto mira pow2 → 3 pra espera', (t.waitlist || []).length === 3, String((t.waitlist || []).length));
  ok('sem flexibilize: NÃO seta _flexibilized', !t._flexibilized);
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' passaram · ' + fail + ' falharam\n');
process.exit(fail ? 1 : 0);
