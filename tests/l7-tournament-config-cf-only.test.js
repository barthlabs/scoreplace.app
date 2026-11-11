'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
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
/* ⛔ A fase de grupos sempre compila `turnos` no topo (`ida` ou `ida_volta`), inclusive
 * quando o organizador só está configurando competição por times. Em 28/set/2026 ele
 * não constava do contrato da Function; um patch válido era recusado inteiro e NADA
 * da ficha salvava. É estrutura (duplica os confrontos), portanto é aceito antes do
 * sorteio e continua protegido depois dele. [[regression_group_turnos_must_save]] */
const contract = fn.slice(fn.indexOf('const _CAMPOS_CONFIG_TORNEIO'), fn.indexOf('const _CONFIG_FASE_ATIVA'));
ok(/'turnos'/.test(contract), 'turnos compilado pela fase de grupos pertence ao contrato da ficha');
ok(/'categorySchedule'/.test(contract) && /'teamCompetition','categorySchedule','turnos'/.test(contract),
  'agenda por categoria entra no mesmo contrato transacional antes do sorteio e é estrutural depois da chave');
ok(/'titleColor'/.test(contract) && part.includes("'titleColor' in patch") && ui.includes("id=\"tourn-title-color\"") && ui.includes('titleColor:') && fs.readFileSync('js/views/tournaments.js', 'utf8').includes('t.titleColor'),
  'cor do título entra na criação, edição e exibição com validação no servidor');
ok(part.includes('_fasesDeConfiguracaoAtualizaveis') && part.includes('t.history.push'),
  'fases já materializadas preservam o motor e a alteração ganha histórico servidor');
// O salvamento parcial da TV não pode apagar capa/logo por omissão.
(async () => {
  const method = add.replace(/,\s*$/, '');
  const sandbox = { window:{ _callCF:async (_name, command) => {
    assert.deepEqual(Object.keys(command.patch), ['tvScreens']);
    return { data:{ tournament:{ id:'tour-tv', logoUrl:'logo-existente', coverUrl:'capa-existente', tvScreens:command.patch.tvScreens } } };
  }, _error:() => {} } };
  const editor = vm.runInNewContext('({' + method + '})', sandbox);
  sandbox.window.AppStore = editor;
  editor.tournaments = [{ id:'tour-tv', logoUrl:'logo-existente', coverUrl:'capa-existente' }];
  editor._saveToCache = () => {};
  await editor.addTournament({ id:'tour-tv', tvScreens:[{ layout:{ background:'#000000' } }] });
  ok(editor.tournaments[0].logoUrl === 'logo-existente' && editor.tournaments[0].coverUrl === 'capa-existente',
    'salvar somente a TV preserva capa e logo existentes');
  process.exit(failed ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
