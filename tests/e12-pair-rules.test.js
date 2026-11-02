'use strict';
const {spawnSync,execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-e12-rules-'));
const port=Number(execFileSync(process.execPath,['-e',
  "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],{encoding:'utf8'}).trim());
const config=path.join(temp,'firebase.json');
fs.writeFileSync(config,JSON.stringify({firestore:{rules:path.join(root,'firestore.rules')},
  emulators:{firestore:{host:'127.0.0.1',port},ui:{enabled:false},singleProjectMode:true}}));
const result=spawnSync('firebase',['emulators:exec','--only','firestore','--config',config,
  '--project','demo-scoreplace','node tests/rules/e12-pair-requests.mjs'],{
    cwd:root,encoding:'utf8',timeout:180000,
    env:{...process.env,SP_E12_PORT:String(port),PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH}});
fs.rmSync(temp,{recursive:true,force:true});
const output=(result.stdout||'')+(result.stderr||'');process.stdout.write(output);
if(result.error)console.error(result.error);
process.exit(result.status===0||/Script exited successfully \(code 0\)/.test(output)?0:1);
