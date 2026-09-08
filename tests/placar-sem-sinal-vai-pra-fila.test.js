/* PLACAR SOMENTE PELA CLOUD FUNCTION */
const fs = require('fs');
const path = require('path');
const R = require('./recorte.js');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');
const i = store.indexOf('async commitResultTx(');
ok(i > 0, 'commitResultTx existe');
const bloco = R.ateSairDoBloco(store, i);
ok(!/enfileirarPlacar\(/.test(bloco), 'não há fila ou escrita de placar pelo navegador');
ok(!/commitTournamentTx\([^)]*function \(freshT\)[\s\S]{0,200}_applyResultToTournament/.test(bloco), 'o navegador não aplica resultado nem avanço');
ok(/_callApplyMatchResult/.test(bloco) && /var r = _viaCF/.test(bloco) && /return r;/.test(bloco), 'só a CF confirma o placar');
ok(/Não consegui lançar o placar/.test(bloco), 'falha da CF é informada sem fingir que salvou');
const start = cf.indexOf('async function _aplicaPlacarNaTransacao');
const core = cf.slice(start, cf.indexOf('\nexports.applyMatchResult', start));
ok(start > 0 && /runTransaction/.test(core), 'a CF aplica em transação sobre dado fresco');
ok(/_isTournamentParticipant|_isTournamentAdmin/.test(core), 'a CF revalida autorização');
ok(/collection\('scoreAudit'\)\.doc\(\)/.test(core), 'cada aplicação cria recibo de auditoria');
ok(/before: _matchAntes/.test(core) && /after: \(typeof drawWindow\._findMatch/.test(core), 'recibo guarda antes e depois no mesmo commit');
console.log((fail ? '✗' : '✓') + ' placar-somente-cf: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
