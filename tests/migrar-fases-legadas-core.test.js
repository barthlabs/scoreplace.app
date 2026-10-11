'use strict';

const { runOne } = require('../scripts/migrar-fases-legadas-core');
let pass = 0; let fail = 0;
function ok(value, message) { if (value) { pass++; console.log('  ✓ ' + message); } else { fail++; console.error('  ✗ ' + message); } }
async function rejects(fn, message) { try { await fn(); ok(false, message); } catch (_) { ok(true, message); } }

const project = (t) => {
  const phases = Array.isArray(t.phases) && t.phases.length
    ? t.phases.map((p) => Object.assign({}, p))
    : [{ kind: 'classification', classification: { structure: 'round_robin' } }];
  return { phases, currentPhaseIndex: 0, changed: !(Array.isArray(t.phases) && t.phases.length), created: true };
};
function state() {
  return {
    updateTime: '2026-10-09T21:00:00.000000Z',
    tournament: {
      format: 'Liga', participants: [{ uid: 'u1' }], matches: [{ id: 'm1', scoreP1: 6 }],
      schedule: { start: '19:00' }, rounds: [{ id: 'r1' }], waitlist: [{ uid: 'u2' }]
    }
  };
}

(async () => {
  const current = state();
  const load = async () => ({ updateTime: current.updateTime, tournament: JSON.parse(JSON.stringify(current.tournament)) });
  let writes = 0;
  const write = async (_id, projection, updateTime) => {
    if (updateTime !== current.updateTime) throw new Error('precondição recusada');
    current.tournament.phases = JSON.parse(JSON.stringify(projection.phases));
    if (Number.isInteger(projection.currentPhaseIndex)) current.tournament.currentPhaseIndex = projection.currentPhaseIndex;
    current.updateTime = '2026-10-09T21:00:01.000000Z';
    writes++;
  };

  const preview = await runOne({ tournamentId: 't1', load, write, project });
  ok(preview.outcome === 'planned' && !!preview.plan.fingerprint, 'dry-run gera recibo determinístico');
  const again = await runOne({ tournamentId: 't1', load, write, project });
  ok(preview.plan.fingerprint === again.plan.fingerprint, 'mesma entrada gera o mesmo recibo');
  await rejects(() => runOne({ tournamentId: 't1', apply: true, load, write, project }), 'apply sem recibo falha');
  await rejects(() => runOne({ tournamentId: 't1', apply: true, fingerprint: 'errado', load, write, project }), 'apply com recibo divergente falha');
  const applied = await runOne({ tournamentId: 't1', apply: true, fingerprint: preview.plan.fingerprint, load, write, project });
  ok(applied.outcome === 'applied' && writes === 1, 'apply escreve uma única vez após validar o recibo');
  ok(current.tournament.participants.length === 1 && current.tournament.matches[0].scoreP1 === 6 && current.tournament.schedule.start === '19:00', 'apply preserva elenco, placar e agenda');
  ok(current.tournament.currentPhaseIndex === 0, 'índice da fase canônica é persistido no mesmo CAS da projeção');
  const stable = await runOne({ tournamentId: 't1', load, write, project });
  ok(stable.outcome === 'unchanged' && writes === 1, 'documento já canônico não recebe escrita');

  // Alguns projetores só traduzem phases[] e não têm autoridade para escolher
  // a fase corrente. Nesse caso o PATCH deve omitir o índice, preservando o
  // valor já registrado — inclusive se ele veio de um fluxo legado.
  const indexed = state();
  indexed.tournament.currentPhaseIndex = 2;
  const projectWithoutIndex = (t) => ({
    phases: Array.isArray(t.phases) && t.phases.length
      ? t.phases.map((p) => Object.assign({}, p))
      : [{ kind: 'classification', classification: { structure: 'round_robin' } }],
    changed: !(Array.isArray(t.phases) && t.phases.length),
    created: true
  });
  const indexedLoad = async () => ({ updateTime: indexed.updateTime, tournament: JSON.parse(JSON.stringify(indexed.tournament)) });
  let indexedPayload = null;
  const indexedWrite = async (_id, projection, updateTime) => {
    if (updateTime !== indexed.updateTime) throw new Error('precondição recusada');
    indexedPayload = JSON.parse(JSON.stringify(projection));
    indexed.tournament.phases = JSON.parse(JSON.stringify(projection.phases));
    if (Number.isInteger(projection.currentPhaseIndex)) indexed.tournament.currentPhaseIndex = projection.currentPhaseIndex;
    indexed.updateTime = '2026-10-09T21:00:02.000000Z';
  };
  const indexedPreview = await runOne({ tournamentId: 't-index', load: indexedLoad, write: indexedWrite, project: projectWithoutIndex });
  const indexedApplied = await runOne({ tournamentId: 't-index', apply: true, fingerprint: indexedPreview.plan.fingerprint, load: indexedLoad, write: indexedWrite, project: projectWithoutIndex });
  ok(indexedApplied.outcome === 'applied' && Object.keys(indexedPayload).length === 1 && Array.isArray(indexedPayload.phases), 'projetor sem índice escreve somente phases');
  ok(indexed.tournament.currentPhaseIndex === 2, 'índice legado é preservado quando a projeção não o recalcula');
  const indexedStable = await runOne({ tournamentId: 't-index', load: indexedLoad, write: indexedWrite, project: projectWithoutIndex });
  ok(indexedStable.outcome === 'unchanged', 'documento canônico sem novo índice não recebe segunda escrita');

  const raced = state();
  const racedLoad = async () => ({ updateTime: raced.updateTime, tournament: JSON.parse(JSON.stringify(raced.tournament)) });
  const racedPreview = await runOne({ tournamentId: 't2', load: racedLoad, write, project });
  const racedWrite = async () => { raced.tournament.matches.push({ id: 'm2' }); raced.updateTime = 'newer'; throw new Error('precondição recusada'); };
  await rejects(() => runOne({ tournamentId: 't2', apply: true, fingerprint: racedPreview.plan.fingerprint, load: racedLoad, write: racedWrite, project }), 'CAS recusa concorrência sem sobrescrever o documento');
  ok(raced.tournament.phases === undefined && raced.tournament.matches.length === 2, 'corrida não persiste projeção parcial nem perde jogo concorrente');

  console.log((fail ? '✗' : '✓') + ' migrar-fases-legadas-core: ' + pass + ' passaram, ' + fail + ' falharam');
  process.exit(fail ? 1 : 0);
})();
