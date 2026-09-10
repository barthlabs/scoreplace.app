'use strict';
const fs = require('fs');
let failed = 0;
const ok = (value, label) => { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; };
const store = fs.readFileSync('js/store.js', 'utf8');
const start = store.indexOf('  addTournament(data) {');
const end = store.indexOf('\n  logAction(', start);
const add = store.slice(start, end);
ok(start >= 0 && add.includes("_callCF('updateTournamentConfiguration'") && !add.includes('AppStore.commitTournamentTx('),
  'edição da ficha só despacha updateTournamentConfiguration');
ok(add.includes('return _saveEdit;') && add.includes('Object.assign(tourData, fresh)'),
  'cache local só recebe a resposta canônica da Function');
ok(add.includes("'creatorUid'") && add.includes("'organizerEmail'") && add.includes("'coHosts'"),
  'identidade e coorganização nunca entram no patch da ficha');
const ui = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const editStart = ui.indexOf('if (editId) {');
const edit = ui.slice(editStart, ui.indexOf('        } else {', editStart));
ok(edit.includes('await window.AppStore.addTournament(tourData)') && !edit.includes('Object.keys(tourData).forEach'),
  'editor aguarda a Function e não altera a ficha na memória');
const fn = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const fstart = fn.indexOf('exports.updateTournamentConfiguration');
const fend = fn.indexOf('\nexports.', fstart + 8);
const part = fn.slice(fstart, fend < 0 ? fn.length : fend);
ok(fstart >= 0 && part.includes('db.runTransaction') && part.includes('_isTournamentAdmin') && part.includes('_gravaTorneio'),
  'Function relê, autoriza e grava a configuração em transação');
ok(part.includes('_CAMPOS_CONFIG_TORNEIO') && part.includes('permission-denied') && part.includes('_CONFIG_ESTRUTURAL'),
  'Function recusa chaves fora do contrato e mudanças estruturais após sorteio');
ok(part.includes('_fasesDeConfiguracaoAtualizaveis') && part.includes('t.history.push'),
  'fases já materializadas preservam o motor e a alteração ganha histórico servidor');
process.exit(failed ? 1 : 0);
