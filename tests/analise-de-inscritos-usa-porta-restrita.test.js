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
    { p1Uid: 'dora', p2Uid: 'eva' },
    { p1Uid: 'fabi', p2ManualId: 'manual-gabi', p2Name: 'Gabi' },
    { displayName: 'Nome Repetido' }, { displayName: 'Nome Repetido' }
  ],
  waitlist: [{ email: 'legada@example.com', displayName: 'Legada' }, { p1Uid: 'heli', p2Uid: 'iris' }],
  monarchWaitlist: { Fem: [{ p1Uid: 'jo', p2Uid: 'kika' }] }
});
ok(core.pertenceAoRelatorio(entries, { uid: 'ana' }), 'uid do elenco é autorizado');
ok(core.pertenceAoRelatorio(entries, { uid: 'bia' }), 'membro de dupla é autorizado');
ok(core.pertenceAoRelatorio(entries, { uid: 'dora' }) && core.pertenceAoRelatorio(entries, { uid: 'eva' }), 'dupla canônica somente com UIDs é autorizada');
ok(core.pertenceAoRelatorio(entries, { uid: 'fabi' }) && !core.pertenceAoRelatorio(entries, { uid: 'manual-gabi' }), 'dupla mista autoriza apenas a pessoa com UID');
ok(core.pertenceAoRelatorio(entries, { uid: 'heli' }) && core.pertenceAoRelatorio(entries, { uid: 'iris' }), 'dupla na espera usa a mesma regra');
ok(core.pertenceAoRelatorio(entries, { uid: 'jo' }) && core.pertenceAoRelatorio(entries, { uid: 'kika' }), 'dupla na espera monarch usa a mesma regra');
ok(!core.pertenceAoRelatorio(entries, { email: 'LEGADA@example.com' }), 'inscrição legada por e-mail não resolve perfil de conta');
ok(!core.pertenceAoRelatorio(entries, { uid: 'estranha' }), 'uid fora do elenco é recusado');
ok(!core.pertenceAoRelatorio(entries, { name: 'Nome Repetido' }), 'nome não resolve perfil de conta');

const projection = core.perfilDaAnalise({ displayName: 'Ana', birthDate: '1980-01-02', email: 'nao-vaza@example.com', phone: '5511' });
ok(projection.displayName === 'Ana' && projection.birthDate === '1980-01-02', 'projeção conserva os campos da análise');
ok(!Object.prototype.hasOwnProperty.call(projection, 'email') && !Object.prototype.hasOwnProperty.call(projection, 'phone'), 'projeção não devolve e-mail nem telefone');

ok(!/collection\(['"]users['"]\)/.test(report), 'a tela de análise não lê users no navegador');
ok(/function _fetchProfiles\(t, parts\)/.test(report) && /carregarPerfisDaAnalise\(t, requested\)/.test(report), 'a tela passa o torneio carregado ao client restrito');
ok(/getTournamentEnrollmentProfiles/.test(db) && !/carregarPerfisDaAnalise[\s\S]{0,1000}collection\(['"]users['"]\)/.test(db), 'o client chama a callable, sem consulta privada');
ok(/getTournamentEnrollmentProfiles'[\s\S]{0,280}sandbox: this\._ehSandbox\(tournament \|\| id\)/.test(db), 'perfil da Análise declara explicitamente o sandbox pelo objeto carregado');
ok(/carregarPerfisDaAnalise[\s\S]*?throw e;[\s\S]*?\/\* Pares de CONTA DUPLICADA/.test(db), 'erro de perfil não vira elenco vazio silenciosamente');
ok(!/Participante '\s*\+\s*\(p\.p[12]ManualId\s*\|\|\s*p\.p[12]Uid/.test(report), 'UID nunca é nome de participante');
ok(db.includes("var id = tournament ? String(tournament.id || '') : String(tournamentId || '')") &&
  db.includes('if (!id && tournament) throw'), 'objeto sem ID falha fechado, sem enviar [object Object]');
ok(/exports\.getTournamentEnrollmentProfiles\s*=\s*onCall/.test(fn), 'a callable da análise existe');
ok(/const sandbox = data\.sandbox === true;[\s\S]{0,320}collection\(sandbox \? "sandboxes" : "tournaments"\)/.test(fn), 'perfil consulta uma coleção tipada, sem fallback');
ok(/_sandboxAutorizado\(db, tournamentSnap, callerUid/.test(fn), 'sandbox valida dono, estado e organização no servidor');
ok(/_isTournamentOrgCaller\(tournament, callerUid\)/.test(fn), 'a callable confirma organização no servidor');
ok(/pertenceAoRelatorio\(entries, candidate\)/.test(fn), 'a callable limita cada linha ao elenco do torneio');
ok(/perfilDaAnalise\(found\.data\)/.test(fn), 'a callable entrega somente a projeção permitida');
const callable = fn.slice(fn.indexOf('exports.getTournamentEnrollmentProfiles'), fn.indexOf('// ─── getOwnEmailMergeCandidates'));
ok(/const sandbox = data\.sandbox === true;/.test(callable) && /const tournamentRef = db\.collection\(sandbox \? "sandboxes" : "tournaments"\)/.test(callable), 'a PRÓPRIA callable de perfis escolhe a coleção tipada');
ok(/if \(!sandbox && !_isTournamentOrgCaller\(tournament, callerUid\)\)/.test(callable), 'produção exige organização e sandbox passa pelo helper');
ok(!/where\("email|where\("displayName|candidate\.email|candidate\.name/.test(callable), 'a callable não busca perfil por e-mail ou nome');

console.log('\n✅ ' + checks + ' verificações');
