/* L7 — perfil não regrava torneios pelo navegador. */
'use strict';
const fs=require('fs'), path=require('path'), root=path.join(__dirname,'..'); let ok=0,bad=0;
function check(n,v){if(v){ok++;console.log('  ✓ '+n)}else{bad++;console.log('  ✗ '+n)}}
const client=fs.readFileSync(path.join(root,'js/views/auth.js'),'utf8');
const server=fs.readFileSync(path.join(root,'functions/index.js'),'utf8');
const nameBody=client.slice(client.indexOf('window._propagateNameChange'), client.indexOf('function _propagatePhotoToTournaments'));
const photoBody=client.slice(client.indexOf('function _propagatePhotoToTournaments'), client.indexOf('// v0.17.87'));
check('nome não salva torneios pelo cliente', !/saveTournament|mutateTournament|commitTournamentTx/.test(nameBody));
check('foto não salva torneios pelo cliente', !/saveTournament|mutateTournament|commitTournamentTx/.test(photoBody));
const trigger=server.slice(server.indexOf('exports.propagateDisplayName'), server.indexOf('exports.syncDiscoveryFeed'));
check('trigger do servidor observa users/{uid}', /onDocumentWritten/.test(trigger) && /users\/\{uid\}/.test(trigger));
check('trigger relê em transação', /db\.runTransaction/.test(trigger) && /_splitParts\.hidratar\(tx/.test(trigger));
check('trigger só atualiza campos tocados', /_renameProp\.camposTocados/.test(trigger));
console.log('\nL7 perfil: '+ok+' ok, '+bad+' falharam'); process.exitCode=bad?1:0;
