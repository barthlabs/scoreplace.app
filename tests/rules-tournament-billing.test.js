'use strict';
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8125, PROJECT = 'demo-scoreplace';
const DRIVER = `
const P='${PROJECT}', H='http://127.0.0.1:${PORT}';
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=u=>b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/'+P,aud:P,sub:u,user_id:u,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
const url=p=>H+'/v1/projects/'+P+'/databases/(default)/documents/'+p;
const S=v=>({stringValue:v}), I=v=>({integerValue:String(v)}), M=v=>({mapValue:{fields:v}});
async function req(method,p,uid,body){const r=await fetch(url(p),{method,headers:{Authorization:uid==='root'?'Bearer owner':'Bearer '+tok(uid),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.status;}
(async()=>{
  const id='tour_1790000000000_0123456789abcdef0123456789abcdef', p='tournaments/'+id, uid='uid_org';
  await req('PATCH',p,'root',{fields:{creatorUid:S(uid),status:S('closed'),name:S('Novo'),billingContract:M({schema:I(1),quoteId:S('q')})}});
  const out={};
  out.name=await req('PATCH',p+'?updateMask.fieldPaths=name',uid,{fields:{name:S('Nome editado')}});
  out.matches=await req('PATCH',p+'?updateMask.fieldPaths=matches',uid,{fields:{matches:{arrayValue:{values:[M({id:S('j1')})]}}}});
  out.pendingDraw=await req('PATCH',p+'?updateMask.fieldPaths=pendingDraw',uid,{fields:{pendingDraw:{booleanValue:true}}});
  out.status=await req('PATCH',p+'?updateMask.fieldPaths=status',uid,{fields:{status:S('active')}});
  out.forgePayment=await req('PATCH',p+'?updateMask.fieldPaths=billingSettlement',uid,{fields:{billingSettlement:M({state:S('paid'),quoteId:S('q')})}});
  out.forgePixReport=await req('PATCH',p+'?updateMask.fieldPaths=billingPixReport',uid,{fields:{billingPixReport:M({state:S('reported'),quoteId:S('q')})}});
  out.forgeAcceptance=await req('PATCH',p+'?updateMask.fieldPaths=billingTermsAcceptance',uid,{fields:{billingTermsAcceptance:M({uid:S(uid),hash:S('forjado')})}});
  out.forgePrice=await req('PATCH',p+'?updateMask.fieldPaths=registrationSettings',uid,{fields:{registrationSettings:M({source:S('scoreplace'),pricing:M({mode:S('single'),cents:I(1)})})}});
  const legacy='tournaments/tour_1790000000001_0123456789abcdef0123456789abcdef';
  await req('PATCH',legacy,'root',{fields:{creatorUid:S(uid),status:S('closed'),name:S('Antigo')}});
  out.legacySettings=await req('PATCH',legacy+'?updateMask.fieldPaths=registrationSettings',uid,{fields:{registrationSettings:M({source:S('scoreplace'),pricing:M({mode:S('single'),cents:I(0)})})}});
  await req('PATCH',p+'/paymentSecrets/proof1','root',{fields:{participantUid:S('uid_a'),kind:S('organizer_pix')}});
  out.proofOwn=await req('GET',p+'/paymentSecrets/proof1','uid_a');
  out.proofOther=await req('GET',p+'/paymentSecrets/proof1','uid_b');
  out.proofOrg=await req('GET',p+'/paymentSecrets/proof1',uid);
  out.proofListMember=await req('GET',p+'/paymentSecrets','uid_a');
  out.proofListOrg=await req('GET',p+'/paymentSecrets',uid);
  await req('PATCH',p+'/registrationCategoryAudit/entry1','root',{fields:{kind:S('category-reclassification'),byUid:S(uid)}});
  out.categoryAuditReadOwner=await req('GET',p+'/registrationCategoryAudit/entry1',uid);
  out.categoryAuditReadParticipant=await req('GET',p+'/registrationCategoryAudit/entry1','uid_a');
  out.categoryAuditWriteOwner=await req('PATCH',p+'/registrationCategoryAudit/entry2',uid,{fields:{kind:S('forged')}});
  out.categoryAuditListOwner=await req('GET',p+'/registrationCategoryAudit',uid);
  out.config=await req('GET','billingAdminConfig/active',uid);
  out.voucher=await req('PATCH','billingVouchers/test',uid,{fields:{active:{booleanValue:true}}});
  console.log('__JSON__'+JSON.stringify(out));
})();`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sp-billing-rules-'));
const config=path.join(dir,'firebase.json'), driver=path.join(dir,'driver.js');
fs.writeFileSync(config,JSON.stringify({firestore:{rules:path.join(ROOT,'firestore.rules')},emulators:{firestore:{port:PORT},ui:{enabled:false},singleProjectMode:true}}));
fs.writeFileSync(driver,DRIVER);
const output=rodarNoEmulador(['emulators:exec','--only','firestore','--config',config,'--project',PROJECT,'node '+JSON.stringify(driver)],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:Object.assign({},process.env,{PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH})});
const match=/__JSON__(\{.*\})/.exec(output); if(!match) throw new Error('driver sem resultado: '+output.slice(-1000));
const got=JSON.parse(match[1]);
const expected={name:200,matches:403,pendingDraw:403,status:403,forgePayment:403,forgePixReport:403,forgeAcceptance:403,forgePrice:403,
  legacySettings:200,proofOwn:200,proofOther:403,proofOrg:200,proofListMember:403,proofListOrg:200,
  categoryAuditReadOwner:403,categoryAuditReadParticipant:403,categoryAuditWriteOwner:403,
  categoryAuditListOwner:403,config:403,voucher:403};
for(const [key,value] of Object.entries(expected)) {
  if(got[key]!==value) throw new Error(key+': esperado '+value+', veio '+got[key]);
}
console.log('✓ cobrança: edição normal preservada, geração sem pagamento e fraude negadas');
