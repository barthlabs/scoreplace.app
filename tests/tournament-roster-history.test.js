'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { append, makeService } = require('../functions/tournament-roster-history');
const id = 'tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a';
const event = { id:'e1', kind:'substitution', fromName:'Fabíola Baldscci',
  toName:'Camila Calia', group:'B', category:'Categoria B', at:'2026-11-27T16:52:23.803Z',
  registrationId:'private' };
assert.equal(append([], event).length, 1);
assert.equal(append([event], event).length, 1);
const priorEvents = Array.from({ length:200 }, (_, index) => ({ ...event, id:'e' + (index + 1) }));
const beyondOldLimit = append(priorEvents, { ...event, id:'e201' });
assert.equal(beyondOldLimit.length, 200);
assert.equal(beyondOldLimit[0].id, 'e2');
assert.equal(beyondOldLimit.at(-1).id, 'e201');
assert.throws(() => append([], { ...event, kind:'unknown' }), /inválida/);
const tournament = { isPublic:true, testModeEnabled:false };
const db = { collection(name) { return { doc() { return { async get() { return name === 'tournaments'
  ? { exists:true, data:() => tournament } : { exists:true, data:() => ({ events:[event] }) }; } }; } }; } };
class HttpsError extends Error { constructor(code,message) { super(message); this.code=code; } }
(async () => {
  const service = makeService({ db, HttpsError });
  const result = await service.list({ data:{ tournamentId:id }, auth:null });
  assert.equal(result.events[0].toName, 'Camila Calia');
  assert.equal(result.events[0].registrationId, undefined);
  tournament.testModeEnabled = true;
  await assert.rejects(service.list({ data:{ tournamentId:id }, auth:null }), error => error.code === 'not-found');
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/domain/roster-provenance.js'),'utf8'), context);
  const helper = context.ScoreplaceRosterProvenance;
  assert.equal(helper.forAthlete([event], 'Camila Calia', 'B').fromName, 'Fabíola Baldscci');
  assert.equal(helper.forAthlete([event], 'Camila Calia', 'E'), null);
  assert.equal(helper.forAthlete([event], 'Camila Calia', 'Grupo B · Retinol · Categoria B').fromName, 'Fabíola Baldscci');
  assert.equal(helper.forAthlete([event], 'Camila Calia', 'Grupo A · Retinol · Categoria B'), null);
  assert.equal(helper.sameGroup('Grupo A · Retinol · Categoria B', 'B'), false);
  assert.match(helper.description(event), /entrou em substituição a Fabíola Baldscci/);
  console.log('✓ Histórico do elenco: idempotência, visibilidade, privacidade e indicação por grupo');
})().catch(error => { console.error(error); process.exitCode=1; });
