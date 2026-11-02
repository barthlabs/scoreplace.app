'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const enrollment = fs.readFileSync(path.join(root, 'js/views/tournaments-enrollment.js'), 'utf8');
const tournaments = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

function fixture(participants = [{ uid:'self' }]) {
  const t = { id:'test-e11', name:'Teste E11', status:'open', participants, standbyParticipants:[], waitlist:[] };
  const user = { uid:'self', displayName:'Pessoa Teste' };
  const effects = { toasts:[], sounds:0, trophies:0, plans:0, cancellations:0, poll:0, callbacks:0, notices:0 };
  const s = { console, Promise, Date, Array, Object, setTimeout:fn => fn(),
    location:{ hash:'#tournaments/test-e11' }, sessionStorage:{ getItem:()=>null, removeItem:()=>{} },
    document:{ getElementById:()=>null },
    showNotification:(title,msg,kind) => effects.toasts.push({ title,msg,kind }),
    showConfirmDialog:(_title,_msg,yes) => yes(),
    _t:key => key,
  };
  s.window = s;
  s.AppStore = { currentUser:user, tournaments:[t] };
  s._findTournamentById = () => t;
  s._verifiedCurrentUser = () => user;
  s._safeHtml = value => String(value);
  s._souOrganizador = () => false;
  s._souInscrito = () => false;
  s._phaseDrawDone = () => false;
  s._pName = p => p && (p.name || p.displayName) || '';
  s._warn = () => {};
  vm.createContext(s);
  vm.runInContext(enrollment, s, { filename:'tournaments-enrollment.js' });
  s._sound = () => { effects.sounds++; };
  s._trophyOnTournamentEnrolled = () => { effects.trophies++; };
  s._scrollToParticipant = () => {};
  s._maybeCreateTournamentPresencePlan = () => { effects.plans++; };
  s._cancelTournamentPresencePlan = () => { effects.cancellations++; };
  s._opNotifyNewEnrollee = () => { effects.poll++; };
  s._resolveOrganizerUid = () => Promise.resolve('org');
  s._sendUserNotification = () => { effects.notices++; };
  return { s,t,user,effects };
}

(async () => {
  for (const response of [
    { outcome:'enrolled', participants:[{ uid:'self' }] },
    { outcome:'rejected', participants:[] },
    { outcome:'conflict', participants:[] },
    { outcome:'unconfirmed', participants:[] },
    undefined,
  ]) {
    const {s,t,effects} = fixture([]);
    const request = defer();
    s.FirestoreDB = { enrollParticipant:() => request.promise };
    s._doEnrollCurrentUser(t.id, null, () => { effects.callbacks++; });
    assert.deepEqual(t.participants, [], 'inscrição não altera elenco antes do recibo');
    assert.equal(effects.toasts.length + effects.sounds + effects.plans + effects.callbacks, 0,
      'inscrição não anuncia sucesso antes do recibo');
    request.resolve(response); await flush();
    if (response && response.outcome === 'enrolled') {
      assert.equal(effects.toasts.filter(item => item.kind === 'success').length, 1);
      assert.equal(effects.sounds, 1); assert.equal(effects.plans, 1); assert.equal(effects.callbacks, 1);
    } else {
      assert.equal(effects.toasts.filter(item => item.kind === 'success').length, 0);
      assert.equal(effects.sounds + effects.plans + effects.callbacks + effects.poll + effects.notices, 0);
    }
  }
  {
    const {s,t,effects} = fixture([]);
    s.FirestoreDB = { enrollParticipant:() => Promise.reject(Object.assign(new Error('negado'), { code:'permission-denied' })) };
    s._doEnrollCurrentUser(t.id, null); await flush();
    assert.equal(t.participants.length, 0); assert.equal(effects.toasts.at(-1).kind, 'error');
  }
  {
    const {s,t,effects} = fixture([]);
    t.registrationSettings = {source:'scoreplace',pricing:{mode:'single',cents:100}};
    s.FirestoreDB = {enrollParticipant:() => Promise.resolve({outcome:'enrolled',participants:[{uid:'self'}],paymentDue:[{amountCents:100}]})};
    s._doEnrollCurrentUser(t.id,null,()=>{effects.callbacks++;}); await flush();
    assert.equal(effects.toasts.at(-1).title,'Inscrição pendente');
    assert.equal(effects.sounds + effects.trophies + effects.plans + effects.callbacks,0,
      'pagamento pendente não ativa efeitos de vaga confirmada');
  }
  {
    const {s,t,effects} = fixture([{uid:'self'}]);
    t.registrationSettings = {source:'scoreplace',pricing:{mode:'single',cents:100}};
    let opened = 0;
    s._tournamentRequiresPayment = () => true;
    s._openTournamentRegistrationPayment = () => { opened++; };
    s.FirestoreDB = {enrollParticipant:() => Promise.resolve({alreadyEnrolled:true,participants:[{uid:'self'}]})};
    s._doEnrollCurrentUser(t.id,null,()=>{effects.callbacks++;}); await flush();
    assert.equal(opened,1,'já inscrito com pagamento pendente abre pagamento pelo recibo fresco');
    assert.equal(effects.callbacks,0,'recibo already não reenvia confirmação de inscrição');
  }
  for (const response of [{waitlisted:true,participants:[]}, {outcome:'unconfirmed',waitlisted:true,participants:[]}]) {
    const {s,t,effects} = fixture([]); s._phaseDrawDone=()=>true;
    s.FirestoreDB={enrollParticipant:()=>Promise.resolve(response)};
    s._doEnrollCurrentUser(t.id,null,()=>{effects.callbacks++;}); await flush();
    assert.equal(effects.callbacks,response.outcome==='unconfirmed'?0:1,
      'callback de inscrição tardia só após recibo positivo');
    assert.equal(t.standbyParticipants.length,response.outcome==='unconfirmed'?0:1,
      'resposta contraditória não cria entrada local na espera');
  }
  for (const receipt of [
    { notFound:false, participants:[] }, { notFound:true, participants:[] }, undefined,
  ]) {
    const {s,t,effects} = fixture(); const request = defer();
    s.FirestoreDB = { deenrollParticipant:() => request.promise };
    s.deenrollCurrentUser(t.id);
    assert.equal(t.participants.length, 1, 'saída não altera elenco antes do recibo');
    assert.equal(effects.toasts.length + effects.cancellations, 0);
    request.resolve(receipt); await flush();
    if (receipt && receipt.notFound === false) {
      assert.equal(t.participants.length, 0); assert.equal(effects.cancellations, 1);
      assert.equal(effects.toasts.at(-1).kind, 'info');
    } else {
      assert.equal(effects.cancellations + effects.notices, 0);
      assert.equal(effects.toasts.filter(item => item.title === 'enroll.cancelledTitle').length, 0);
    }
  }
  {
    const {s,t,effects} = fixture();
    let deenrollCalls = 0, woCalls = 0;
    s._isPlacedInDraw = () => true;
    s._acharVagaNoSorteio = () => null;
    s._ligaApplyWo = () => { woCalls++; };
    s.FirestoreDB = { deenrollParticipant:() => { deenrollCalls++; return Promise.resolve({notFound:false,participants:[]}); } };
    s.deenrollCurrentUser(t.id); await flush();
    assert.equal(deenrollCalls,0,'pessoa colocada sem vaga localizada não sai do elenco pela porta comum');
    assert.equal(woCalls,0);
    assert.equal(t.participants.length,1);
    assert.equal(effects.toasts.at(-1).kind,'error');
    s._acharVagaNoSorteio = () => ({roundIndex:1,groupName:'A',nome:'Pessoa Teste'});
    s.deenrollCurrentUser(t.id); await flush();
    assert.equal(woCalls,1,'vaga localizada segue pela porta W.O.');
    assert.equal(deenrollCalls,0,'W.O. não chama desinscrição comum');
  }
  {
    const {s,t,effects} = fixture();
    s.FirestoreDB = { deenrollParticipant:() => Promise.reject(Object.assign(new Error('sem permissão'), { code:'permission-denied' })) };
    s.deenrollCurrentUser(t.id); await flush();
    assert.equal(t.participants.length, 1); assert.equal(effects.cancellations, 0);
    assert.equal(effects.toasts.at(-1).kind, 'error');
  }
  for (const receipt of [
    { removed:true, canonical:true, participants:[] },
    { removed:false, canonical:true, participants:[] },
    { removed:true, participants:[], standbyParticipants:[{uid:'other'}], waitlist:[] },
    undefined,
  ]) {
    const {s,t,effects} = fixture();
    t.standbyParticipants = [{uid:'self'},{uid:'other'}]; const request = defer();
    s.FirestoreDB = { leaveStandby:() => request.promise };
    s._leaveStandby(t.id);
    assert.equal(t.standbyParticipants.length, 2); assert.equal(effects.toasts.length, 0);
    request.resolve(receipt); await flush();
    assert.equal(effects.toasts.some(item => item.title === 'Saiu da lista de espera'), !!(receipt && receipt.removed));
    if (receipt && receipt.removed) assert.equal(t.standbyParticipants.length, 1);
    else assert.equal(t.standbyParticipants.length, 2);
  }
  {
    const {s,t,effects} = fixture(); t.standbyParticipants = [{uid:'self'}];
    s.FirestoreDB = { leaveStandby:() => Promise.reject(Object.assign(new Error('negado'), {code:'permission-denied'})) };
    s._leaveStandby(t.id); await flush();
    assert.equal(t.standbyParticipants.length, 1); assert.equal(effects.toasts.at(-1).kind, 'error');
  }
  for (const receipt of [
    {notFound:false,participants:[]}, {notFound:true,participants:[]}, undefined,
  ]) {
    const {s,t,effects} = fixture(); t.canonicalRegistrationMigration = {fingerprint:'fp'};
    const request = defer();
    s.FirestoreDB = { _ehSandbox:()=>false, _callFn:() => request.promise };
    vm.runInContext(tournaments, s, { filename:'tournaments.js' });
    s.removeParticipantFunction(t.id, 'Pessoa Teste', 'self');
    assert.equal(t.participants.length, 1, 'organização espera recibo antes de alterar elenco');
    request.resolve(receipt); await flush();
    assert.equal(t.participants.length, receipt ? 0 : 1);
    assert.equal(effects.toasts.some(item => item.title === 'Inscrição não encontrada'), !!(receipt && receipt.notFound));
  }
  {
    const {s,t,effects} = fixture(); t.canonicalRegistrationMigration={fingerprint:'fp'};
    s.FirestoreDB={_ehSandbox:()=>false,_callFn:()=>Promise.reject(Object.assign(new Error('sem permissão'),{code:'permission-denied'}))};
    vm.runInContext(tournaments,s,{filename:'tournaments.js'});
    s.removeParticipantFunction(t.id,'Pessoa Teste','self'); await flush();
    assert.equal(t.participants.length,1); assert.equal(effects.toasts.at(-1).kind,'error');
  }
  console.log('✓ E11 UI: inscrição, retirada, espera e organização confirmam só pelo recibo');
})().catch(error => { console.error(error); process.exitCode = 1; });
