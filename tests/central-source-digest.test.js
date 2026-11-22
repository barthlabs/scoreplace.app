'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {execFileSync}=require('child_process');
const {FILES,LEGACY_FILES,digestFor,digestFiles}=require('../functions-autodraw/court-capability-digest');
const {digestForCommit}=require('../scripts/central-source-digest');
const {ultimoAutodrawImplantavel,mesmoAutodrawPublicado}=require('../scripts/autodraw-publication-git');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'sp-central-digest-'));
const codebase=path.join(root,'functions-autodraw');
fs.mkdirSync(path.join(codebase,'vendor'),{recursive:true});
for(const file of FILES){
  const target=path.join(codebase,file);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,`fixture:${file}\n`);
}
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
git('init','-q');
git('config','user.email','fixture@example.invalid');
git('config','user.name','fixture');
git('commit','--allow-empty','-qm','fixture base');
git('add','.');git('commit','-qm','backend source');
const source=git('rev-parse','HEAD');
assert.strictEqual(digestForCommit(source,root),digestFor(codebase),
  'digest do archive deve ser igual ao checkout dos mesmos bytes');
assert.strictEqual(digestFor(codebase),digestFor(codebase,(file)=>fs.readFileSync(file)),
  'o leitor fs padrão deve manter o comportamento do digest');

// Registra a fórmula antiga dos três arquivos e verifica que digestFiles continua
// preservando exatamente a serialização do leitor fs para aquele conjunto legado.
const crypto=require('crypto');
const legacy=crypto.createHash('sha256');
legacy.update('target=endMatchOnCourt\nruntime=node\nprotocol=per-monarch-end-court-v2\n');
for(const name of LEGACY_FILES){legacy.update(name+'\0');legacy.update(fs.readFileSync(path.join(codebase,name)));legacy.update('\0');}
assert.strictEqual(digestFiles(codebase,LEGACY_FILES,file=>fs.readFileSync(file)).toString(),legacy.digest('hex'));
assert.throws(()=>digestFor(codebase,(_file,name)=>name==='vendor/tournaments-utils.js'?undefined:fs.readFileSync(path.join(codebase,name))),
  /data|argument|ArrayBuffer/i,'arquivo central ausente não pode gerar digest válido');

fs.writeFileSync(path.join(codebase,'test-summary-fixture.js'),'test only');
git('add','.');git('commit','-qm','test-only change');
assert.strictEqual(ultimoAutodrawImplantavel(root),source,'commit só de test-*.js não desloca o SHA implantável');
fs.rmSync(path.join(codebase,'test-summary-fixture.js'));
git('add','-u');git('commit','-qm','remove temporary test fixture');
assert(mesmoAutodrawPublicado(root,source),'subtree descendente idêntico continua equivalente');
fs.writeFileSync(path.join(codebase,'index.js'),'changed runtime source');
git('add','.');git('commit','-qm','runtime change');
assert.strictEqual(ultimoAutodrawImplantavel(root),git('rev-parse','HEAD'));
assert(!mesmoAutodrawPublicado(root,source),'subtree divergente não pode ser considerado publicado');
assert(!mesmoAutodrawPublicado(root,'bad-sha'));
fs.rmSync(root,{recursive:true,force:true});
console.log('✓ digest archive/checkout, leitor fs e seleção do commit implantável');
