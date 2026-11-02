'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/views/tournaments.js'),'utf8');
const teamFormation=require('../js/views/team-formation.js');
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function fixture(response){
  const invite={id:'alice__bob',inviterUid:'alice',inviteeUid:'bob',
    inviterName:'Alice',inviteeName:'Bob'};
  const t={id:'e12-ui',name:'Teste E12',teamSize:2,enrollmentMode:'teams',
    manualPairing:'open',canonicalRegistrationMigration:{fingerprint:'fp'},
    participants:[{uid:'alice',categoryId:'a'},{uid:'bob',categoryId:'a'}],
    pairRequests:[invite]};
  const effects={toasts:[],notices:0,groups:0,refresh:0,calls:[]};
  const s={console,Promise,Date,Array,Object,Set,location:{hash:'#tournaments/e12-ui'},
    document:{getElementById:()=>null,querySelectorAll:()=>[]},
    showNotification:(title,message,kind)=>effects.toasts.push({title,message,kind})};
  s.window=s;
  s.AppStore={tournaments:[t],currentUser:{uid:'bob',displayName:'Bob'}};
  s._teamFormation=teamFormation;
  s._safeHtml=value=>String(value);
  s._softRefreshView=()=>{effects.refresh++;};
  s._sendUserNotification=()=>{effects.notices++;};
  s._notifyTournamentParticipants=()=>{effects.groups++;};
  s.FirestoreDB={formPair:(_id,opts)=>{effects.calls.push(opts);return response.promise;}};
  vm.createContext(s);
  vm.runInContext(source,s,{filename:'tournaments.js'});
  return{s,t,effects,invite};
}
(async()=>{
  for(const kind of ['paired','notFound','unknown','error']){
    const response=defer(),{s,t,effects,invite}=fixture(response);
    const pending=s._acceptPairRequest(t.id,invite.id);
    assert.equal(t.pairRequests.length,1,'convite fica visível enquanto servidor decide');
    assert.equal(effects.notices+effects.groups,0,'nenhum aviso antes do recibo');
    assert.equal(effects.calls.length,1);
    assert.equal(effects.calls[0].pairRequestId,invite.id,'UI envia ID exato do convite');
    if(kind==='paired')response.resolve({outcome:'paired',participants:[{
      p1Uid:'alice',p2Uid:'bob',categoryId:'a',displayName:'Alice / Bob'}],pairRequests:[]});
    if(kind==='notFound')response.resolve({notFound:true,participants:t.participants});
    if(kind==='unknown')response.resolve({participants:t.participants});
    if(kind==='error')response.reject(Object.assign(new Error('negado'),{code:'permission-denied'}));
    const formed=await pending;await flush();
    if(kind==='paired'){
      assert.equal(formed,true);assert.equal(t.pairRequests.length,0);
      assert.equal(effects.toasts.filter(item=>item.kind==='success').length,1);
      assert(effects.notices>0&&effects.groups>0,'aviso só após sucesso');
    }else{
      assert.equal(formed,false,kind+' não tem recibo de formação');
      assert.equal(t.pairRequests.length,1,kind+' preserva convite');
      assert.equal(effects.notices+effects.groups,0,kind+' não anuncia dupla');
      assert.equal(effects.toasts.filter(item=>item.kind==='success').length,0);
    }
  }
  {
    const response=defer(),{s,t,invite,effects}=fixture(response);
    s._sendUserNotification=()=>{throw new Error('aviso indisponível');};
    s._notifyTournamentParticipants=()=>{throw new Error('aviso geral indisponível');};
    const pending=s._acceptPairRequest(t.id,invite.id);
    response.resolve({outcome:'paired',participants:[{
      p1Uid:'alice',p2Uid:'bob',categoryId:'a',displayName:'Alice / Bob'}],pairRequests:[]});
    assert.equal(await pending,true,'falha de aviso após commit não apaga o recibo');
    assert.equal(t.pairRequests.length,0);
    assert.equal(effects.toasts.filter(item=>item.kind==='success').length,1);
  }
  console.log('✓ E12 UI: convite e avisos só mudam depois de recibo paired');
})().catch(error=>{console.error(error);process.exitCode=1;});
