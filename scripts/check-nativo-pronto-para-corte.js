#!/usr/bin/env node
/* Pré-requisitos locais do corte. Não comprova aprovação da loja nem adoção.
 * Política aprovada em 11/set/2026: mínimo independente por plataforma, sete dias
 * após disponibilidade e validação. A versão web mais recente não é o mínimo.
 */
'use strict';
const fs=require('fs'),path=require('path');
const core=require('../js/native-update-policy-core');
function check(root,now=Date.now()) {
 const issues=[],policy=JSON.parse(fs.readFileSync(path.join(root,'native-update-policy.json'),'utf8'));
 if(!core.validate(policy))return ['Manifest de atualização nativa inválido.'];
 const config=JSON.parse(fs.readFileSync(path.join(root,'capacitor.config.json'),'utf8'));
 if(config.server&&config.server.url)return ['server.url exige auditoria própria; não comprova prontidão dos bundles locais.'];
 for(const platform of ['ios','android']){
  const p=policy.platforms[platform];
  if(!p.minimumVersion){issues.push(platform+': mínimo ainda não ativado; confirmar loja, aparelho e aviso.');continue;}
  if(now<Date.parse(p.enforceAt))issues.push(platform+': prazo de sete dias ainda não terminou.');
  const versionFile=platform==='ios'?'ios/App/App.xcodeproj/project.pbxproj':'android/app/build.gradle';
  const source=fs.readFileSync(path.join(root,versionFile),'utf8');
  const versions=[...source.matchAll(platform==='ios'?/MARKETING_VERSION = ([^;]+);/g:/versionName\s+["']([^"']+)["']/g)].map(m=>m[1].trim());
  if(!versions.length||versions.some(v=>core.compare(v,p.minimumVersion)===null||core.compare(v,p.minimumVersion)<0))issues.push(platform+': versão nativa abaixo do mínimo declarado.');
  const bundle=path.join(root,platform==='ios'?'ios/App/App/public':'android/app/src/main/assets/public');
  try{
   const js=fs.readFileSync(path.join(bundle,'js/store.js'),'utf8');
   const v=(js.match(/SCOREPLACE_VERSION\s*=\s*['"]([^'"]+)/)||[])[1];
   if(core.compare(v,p.minimumVersion)===null||core.compare(v,p.minimumVersion)<0||versions.some(x=>x!==v))issues.push(platform+': versão do JS embarcado não corresponde ao binário compatível.');
   const html=fs.readFileSync(path.join(bundle,'index.html'),'utf8');
   for(const file of ['native-update-policy-core.js','native-update.js']){
    if(!html.includes('js/'+file)||!fs.existsSync(path.join(bundle,'js',file)))issues.push(platform+': controle de atualização ausente no bundle: '+file);
   }
  }catch(e){issues.push(platform+': bundle não disponível para conferência.');}
 }
 return issues;
}
if(require.main===module){
 const issues=check(path.join(__dirname,'..'));
 if(issues.length){console.error('✗ Pré-requisitos nativos do corte pendentes:\n'+issues.map(x=>'  • '+x).join('\n'));process.exitCode=1;}
 else console.log('✓ Versões/bundles e prazo conferidos contra o mínimo de cada plataforma.\n⏳ Disponibilidade e validação são declarações do manifest; conferir evidências das lojas, adoção e aprovação humana do runbook antes do corte.');
}
module.exports={check};
