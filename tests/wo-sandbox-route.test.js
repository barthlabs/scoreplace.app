'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = source.indexOf('exports.applyTournamentWO = onCall(');
const end = source.indexOf('// ─── Presença da organização', start);
const guardStart = source.indexOf('async function _assertSandboxDrawOwner(');
const guardEnd = source.indexOf('function _scheduleLocalDay(', guardStart);
assert(start >= 0 && end > start && guardStart >= 0 && guardEnd > guardStart);

async function scenario({ id, flag, uid = 'owner', valid = true, preview = false, candidate = false, outcome }) {
  const reads = [], writes = [], collections = [];
  const original = { creatorUid:'owner', adminUids:['owner'] };
  const match = { id:'match-1', p1:'Ana / Bia', p2:'Clara / Dora', team1Uids:['ana'], team2Uids:['clara'],
    team1Obj:{p1Uid:'ana',p2ManualId:'manual-bia'}, team2Obj:{p1Uid:'clara',p2ManualId:'manual-dora'} };
  const target = { id, creatorUid:'owner', adminUids:['owner'], matches:[match],
    ...(id.startsWith('sb_') ? { isSandbox:true, sbState:'ready', notificationsMuted:true,
      sandboxOf:'tour_original', sandboxOwnerUid:'owner' } : {}) };
  const dataByPath = new Map([['tournaments/tour_original', original], [(id.startsWith('sb_') ? 'sandboxes/' : 'tournaments/') + id, target]]);
  const db = {
    collection(name) {
      collections.push(name);
      return { doc(docId) {
        const path = `${name}/${docId}`;
        return { path, collection() { throw Error('subcoleção de notificação indevida'); },
          async get() { reads.push(path); const data = dataByPath.get(path); return { exists:!!data, data:() => data }; } };
      } };
    },
    async runTransaction(fn) {
      const tx = { get:async ref => { reads.push(ref.path); const data = dataByPath.get(ref.path);
        return { exists:!!data, data:() => data }; },
        set(ref) { writes.push(ref.path); }, update(ref) { writes.push(ref.path); } };
      return fn(tx);
    }
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const context = {
    exports:{}, db, HttpsError, onCall:fn => fn, Date, String, Array, Set, Object,
    _isTournamentAdmin:(t,u) => t && (t.creatorUid === u || (t.adminUids || []).includes(u)),
    _drawFail:(code,message) => new HttpsError(code,message),
    _preloadDrawNames:async()=>{}, _leTorneio:async(tx,ref) => { const snap = await tx.get(ref); return snap.exists ? structuredClone(snap.data()) : null; },
    _enrichParticipantsFromProfiles:()=>{}, _antesDoMotor:t=>structuredClone(t),
    _woClaimCore:{ validateTeamWO:() => ({ok:true,team:{slot:'p1',uids:['ana'],label:'Ana / Bia'}}) },
    drawWindow:{ _collectAllMatches:t=>t.matches, _matchHasRealPlay:()=>false,
      _memberNameByUid:(_,u)=>u, _woFindEligibleTeamStandby:()=>candidate ? {chosen:{}} : null },
    applyWoFn:(_,opts)=> opts.teamSubstitution && !candidate
      ? {ok:false,outcome:'substitute-unavailable'} : {ok:true,outcome:opts.teamSubstitution?'subbed':'woApplied',subDetails:[]},
    _reconcileSurplusBeforeWrite:()=>{},
    _gravaTorneio:(tx,ref,t)=>{tx.set(ref,t);return {clean:t,writtenMatchIds:[]};}
  };
  vm.runInNewContext(source.slice(guardStart,guardEnd) + '\n' + source.slice(start,end), context);
  let result, error;
  try { result = await context.exports[preview ? 'previewTournamentTeamWO' : 'applyTournamentWO']({ auth:{uid}, data:{tournamentId:id,
    ...(flag === undefined ? {} : {sandbox:flag}), matchId:'match-1', forceTeamWO:true, teamUids:['ana'],
    ...(outcome ? {teamDecisionV2:true,teamOutcome:outcome} : {}) } }); }
  catch (e) { error = e; }
  if (valid) assert.equal(error, undefined, error && error.message);
  else assert(error, 'requisição recusada');
  return {result,error,reads,writes,collections};
}

(async()=>{
  let run = await scenario({id:'sb_example',flag:undefined,valid:false});
  assert.equal(run.error.code,'not-found'); assert.deepEqual(run.reads,[]);
  run = await scenario({id:'tour_example',flag:true,valid:false});
  assert.equal(run.error.code,'not-found'); assert.deepEqual(run.reads,[]);
  run = await scenario({id:'tour_example',flag:'false'});
  assert(run.result.ok && run.writes.includes('tournaments/tour_example'), 'flag string não ativa sandbox');
  run = await scenario({id:'tour_example',flag:false,uid:'stranger',valid:false});
  assert.equal(run.error.code,'permission-denied'); assert.deepEqual(run.writes,[]);
  run = await scenario({id:'sb_example',flag:true});
  assert(run.result.ok && run.writes.includes('sandboxes/sb_example'), 'W.O. usa documento do sandbox');
  assert(run.reads.includes('tournaments/tour_original'), 'guarda relê autorização no original');
  assert(!run.reads.includes('tournaments/sb_example') && run.writes.every(p=>p.startsWith('sandboxes/')),
    'W.O. do sandbox não lê como alvo nem grava torneio de produção');
  assert(!run.collections.includes('users') && run.writes.every(p=>!p.includes('notification')),
    'W.O. do sandbox não envia notificação de usuário, push ou outbox');
  run = await scenario({id:'sb_example',flag:true,preview:true,candidate:true});
  assert.equal(run.result.hasEligiblePair,true);
  assert.deepEqual(run.writes,[], 'prévia não grava nem em sandbox');
  run = await scenario({id:'tour_example',flag:false,preview:true,candidate:false});
  assert.equal(run.result.hasEligiblePair,false);
  assert.deepEqual(run.writes,[], 'prévia não grava em produção');
  run = await scenario({id:'tour_example',flag:false,preview:true,uid:'stranger',valid:false});
  assert.equal(run.error.code,'permission-denied');
  run = await scenario({id:'tour_example',flag:false,candidate:false,outcome:'substitute',valid:false});
  assert.equal(run.error.code,'failed-precondition');
  assert.deepEqual(run.writes,[], 'suplente indisponível recusa sem W.O. nem escrita');
  run = await scenario({id:'tour_example',flag:false,candidate:true,outcome:'substitute'});
  assert.equal(run.result.result.outcome,'subbed');
  run = await scenario({id:'tour_example',flag:false,candidate:true,outcome:'wo'});
  assert.equal(run.result.result.outcome,'woApplied', 'escolha W.O. ignora candidata');
  console.log('wo-sandbox-route: OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
