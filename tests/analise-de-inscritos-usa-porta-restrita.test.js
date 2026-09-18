'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const core = require('../functions/tournament-enrollment-profile-core');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const report = read('js/views/tournaments-enrollment-report.js');
const db = read('js/firebase-db.js');
const fn = read('functions/index.js');
let checks = 0;
function ok(condition, label) { assert.ok(condition, label); checks++; console.log('  ✓ ' + label); }

console.log('\n──── análise de inscritos usa porta restrita ────\n');

const entries = core.entradasDoRelatorio({
  participants: [
    { uid: 'ana', displayName: 'Ana' },
    { p1Uid: 'bia', p1Name: 'Bia', p2Uid: 'cai', p2Name: 'Cai' },
    { displayName: 'Nome Repetido' }, { displayName: 'Nome Repetido' }
  ],
  waitlist: [{ email: 'legada@example.com', displayName: 'Legada' }]
});
ok(core.pertenceAoRelatorio(entries, { uid: 'ana' }), 'uid do elenco é autorizado');
ok(core.pertenceAoRelatorio(entries, { uid: 'bia' }), 'membro de dupla é autorizado');
ok(core.pertenceAoRelatorio(entries, { email: 'LEGADA@example.com' }), 'inscrição legada por e-mail é autorizada');
ok(!core.pertenceAoRelatorio(entries, { uid: 'estranha' }), 'uid fora do elenco é recusado');
ok(!core.pertenceAoRelatorio(entries, { name: 'Nome Repetido' }), 'nome ambíguo não resolve ninguém');

const projection = core.perfilDaAnalise({ displayName: 'Ana', birthDate: '1980-01-02', email: 'nao-vaza@example.com', phone: '5511' });
ok(projection.displayName === 'Ana' && projection.birthDate === '1980-01-02', 'projeção conserva os campos da análise');
ok(!Object.prototype.hasOwnProperty.call(projection, 'email') && !Object.prototype.hasOwnProperty.call(projection, 'phone'), 'projeção não devolve e-mail nem telefone');

ok(!/collection\(['"]users['"]\)/.test(report), 'a tela de análise não lê users no navegador');
ok(/function _fetchProfiles\(tId, parts\)/.test(report) && /carregarPerfisDaAnalise\(tId, requested\)/.test(report), 'a tela passa pelo client restrito com o torneio');
ok(/getTournamentEnrollmentProfiles/.test(db) && !/carregarPerfisDaAnalise[\s\S]{0,1000}collection\(['"]users['"]\)/.test(db), 'o client chama a callable, sem consulta privada');
ok(/exports\.getTournamentEnrollmentProfiles\s*=\s*onCall/.test(fn), 'a callable da análise existe');
ok(/_isTournamentOrgCaller\(tournament, callerUid\)/.test(fn), 'a callable confirma organização no servidor');
ok(/pertenceAoRelatorio\(entries, candidate\)/.test(fn), 'a callable limita cada linha ao elenco do torneio');
ok(/perfilDaAnalise\(found\.data\)/.test(fn), 'a callable entrega somente a projeção permitida');

console.log('\n✅ ' + checks + ' verificações');
