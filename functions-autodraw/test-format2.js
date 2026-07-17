// test-format2.js — o format2 do SERVIDOR compila IGUAL ao do cliente?
//
// Contexto (jul/2026): `FORMAT2.compileToPhases` roda hoje no SALVAR do cliente e grava
// `t.phases[]` + campos top-level no doc. App velho → format2 velho → doc já errado, e o
// sorteio (mesmo o do servidor) executaria a config errada. Por isso o format2 virou cânone
// de servidor (draw-core.compileFromFmt2), recompilando do intent cru em `t.fmt2`.
//
// Este arquivo prova 3 coisas:
//  1) PARIDADE — vendor/format2.js e js/views/format2.js compilam IDÊNTICO (contextos VM
//     isolados, bateria de configs). É o teste que sustenta a canonização.
//  2) CONTRATO — compileFromFmt2 espelha create-tournament.js:5229-5236 (ordem de escrita).
//  3) GUARDS — legado sem fmt2 não inventa config; recompilar só na fase 0 sem chave.
//
// Uso: node test-format2.js   (roda junto de test-draw.js antes de qualquer deploy)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
}
function eq(name, a, b) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  ok(name, sa === sb, sa === sb ? undefined : '\n      esperado: ' + sb + '\n      obtido:   ' + sa);
}

// ── Carrega um format2.js num contexto ISOLADO (não polui o global do processo) ──
// format2.js é um IIFE que lê window.SPORT_RULES e escreve window.FORMAT2.
function loadFormat2In(filePath) {
  const sportRulesSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'views', 'sport-rules.js'), 'utf8');
  const src = fs.readFileSync(filePath, 'utf8');
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.console = console;
  vm.createContext(sandbox);
  vm.runInContext(sportRulesSrc, sandbox, { filename: 'sport-rules.js' });
  vm.runInContext(src, sandbox, { filename: filePath });
  if (!sandbox.FORMAT2 || typeof sandbox.FORMAT2.compileToPhases !== 'function') {
    throw new Error('FORMAT2 não carregou de ' + filePath);
  }
  return sandbox.FORMAT2;
}

const SRC_F2 = path.resolve(__dirname, '..', 'js', 'views', 'format2.js');
const VENDOR_F2 = path.resolve(__dirname, 'vendor', 'format2.js');

console.log('════════════════════════════════════════');
console.log('1) PARIDADE cliente × servidor (vendor)');
console.log('════════════════════════════════════════');

// Prova estrutural: o vendor É a fonte (copy-vendor roda no predeploy).
const srcBytes = fs.readFileSync(SRC_F2);
const vendorBytes = fs.readFileSync(VENDOR_F2);
ok('vendor/format2.js é byte-idêntico a js/views/format2.js', srcBytes.equals(vendorBytes));

const A = loadFormat2In(SRC_F2);      // "cliente"
const B = loadFormat2In(VENDOR_F2);   // "servidor"

// Bateria cobrindo os ramos reais do compilador (ver format2.js).
const SPORT = 'Beach Tennis';
const CONFIGS = [
  ['default do esporte', A.defaultConfig(SPORT)],
  ['Rei/Rainha + elim', { disputa: 'dupla', grupos: 1, parceria: 'rei_rainha', classifAtiva: true, classificados: 2, eliminatoria: { ativa: true, linhas: 1, formacao: 'performance', terceiro: true } }],
  ['sorteio/rodada + elim 2 linhas', { disputa: 'dupla', grupos: 1, parceria: 'sorteio_rodada', classifAtiva: true, classificados: 4, eliminatoria: { ativa: true, linhas: 2, nomes: ['Ouro', 'Prata'], formacao: 'equilibrio', terceiro: true } }],
  ['dupla fixa · fase de grupos', { disputa: 'dupla', grupos: 4, parceria: 'fixa', formacaoDupla: 'manual', classifAtiva: true, classificados: 2, rodadas: { modo: 'todos', turnos: 'ida' }, eliminatoria: { ativa: true, linhas: 1, formacao: 'performance' } }],
  ['pontos corridos ida/volta', { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: true, classificados: 2, rodadas: { modo: 'todos', turnos: 'ida_volta' }, eliminatoria: { ativa: false } }],
  ['nº fixo de rodadas (agendado)', { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: true, classificados: 2, rodadas: { modo: 'fixo', n: 5, drawFirstDate: '2026-08-01', drawFirstTime: '19:00', drawIntervalDays: 7, drawManual: false }, eliminatoria: { ativa: true, linhas: 1 } }],
  ['eliminação direta (sem classificatória)', { disputa: 'dupla', grupos: 1, classifAtiva: false, eliminatoria: { ativa: true, linhas: 4, nomes: ['A', 'B', 'C', 'D'], formacao: 'sorteio' } }],
  ['dupla eliminatória (repescagem)', { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: true, classificados: 4, rodadas: { modo: 'todos' }, eliminatoria: { ativa: true, dupla: true, linhas: 1 } }],
  ['abertura por Rei/Rainha (elim direta)', { disputa: 'dupla', grupos: 1, classifAtiva: false, eliminatoria: { ativa: true, linhas: 1, openReiRainha: true, reiRainhaCut: 4, formacao: 'performance' } }],
  ['individual · todos contra todos', { disputa: 'individual', grupos: 1, classifAtiva: true, classificados: 2, rodadas: { modo: 'todos', turnos: 'ida' }, eliminatoria: { ativa: true, linhas: 1 } }],
  ['qualifyAll (todos avançam)', { disputa: 'dupla', grupos: 2, parceria: 'fixa', classifAtiva: true, classificados: 2, classifScope: 'per_group', rodadas: { modo: 'todos' }, eliminatoria: { ativa: true, linhas: 1, qualifyAll: true } }],
];

const OPTS = { sport: SPORT, resultEntry: ['organizer'], lateEnrollment: 'closed' };
CONFIGS.forEach(function (row) {
  const label = row[0], cfg = row[1];
  const outA = A.compileToPhases(JSON.parse(JSON.stringify(cfg)), OPTS);
  const outB = B.compileToPhases(JSON.parse(JSON.stringify(cfg)), OPTS);
  eq('compila idêntico · ' + label, outB, outA);
  // normalize/summary também são superfície de config gravada no doc.
  eq('normalize idêntico · ' + label, B.normalize(JSON.parse(JSON.stringify(cfg)), SPORT), A.normalize(JSON.parse(JSON.stringify(cfg)), SPORT));
  eq('summary idêntico · ' + label, B.summary(B.normalize(JSON.parse(JSON.stringify(cfg)), SPORT)), A.summary(A.normalize(JSON.parse(JSON.stringify(cfg)), SPORT)));
});

console.log('');
console.log('════════════════════════════════════════');
console.log('2) compileFromFmt2 — contrato com o doc');
console.log('════════════════════════════════════════');

const core = require('./draw-core.js');

// Espelha create-tournament.js:5229-5236: topLevel aplicado no doc, phases gravadas,
// fmt2 regravado normalizado, e o ajuste de Fase de Grupos.
(function () {
  const cfg = { disputa: 'dupla', grupos: 1, parceria: 'rei_rainha', classifAtiva: true, classificados: 2, eliminatoria: { ativa: true, linhas: 1, formacao: 'performance' } };
  const t = { id: 'tour_x', sport: SPORT, fmt2: cfg, resultEntry: ['organizer'], lateEnrollment: 'closed' };
  const r = core.compileFromFmt2(t);
  ok('Rei/Rainha: ok', r.ok === true, JSON.stringify(r));
  ok('Rei/Rainha: t.format = Liga', t.format === 'Liga', t.format);
  ok('Rei/Rainha: t.drawMode = rei_rainha', t.drawMode === 'rei_rainha', t.drawMode);
  ok('Rei/Rainha: t.ligaRoundFormat = rei_rainha', t.ligaRoundFormat === 'rei_rainha', t.ligaRoundFormat);
  ok('Rei/Rainha: 2 fases (classif + elim)', Array.isArray(t.phases) && t.phases.length === 2, t.phases && t.phases.length);
  ok('Rei/Rainha: fmt2 regravado normalizado', !!t.fmt2 && t.fmt2.parceria === 'rei_rainha');
})();

(function () {
  const cfg = { disputa: 'dupla', grupos: 4, parceria: 'fixa', formacaoDupla: 'manual', classifAtiva: true, classificados: 2, rodadas: { modo: 'todos' }, eliminatoria: { ativa: true, linhas: 1 } };
  const t = { id: 'tour_g', sport: SPORT, fmt2: cfg };
  const r = core.compileFromFmt2(t);
  ok('Grupos: ok', r.ok === true);
  ok('Grupos: t.format = Fase de Grupos', t.format === 'Fase de Grupos', t.format);
  ok('Grupos: gruposCount = 4', t.gruposCount === 4, t.gruposCount);
  // O ajuste que create-tournament.js:5235 faz — precisa estar espelhado.
  ok('Grupos: ligaRoundFormat forçado a standard', t.ligaRoundFormat === 'standard', t.ligaRoundFormat);
  ok('Grupos: ligaDrawMode forçado a standard', t.ligaDrawMode === 'standard', t.ligaDrawMode);
})();

(function () {
  const cfg = { disputa: 'dupla', grupos: 1, classifAtiva: false, eliminatoria: { ativa: true, linhas: 1, formacao: 'sorteio' } };
  const t = { id: 'tour_e', sport: SPORT, fmt2: cfg };
  const r = core.compileFromFmt2(t);
  ok('Elim direta: 1 fase só', r.ok && t.phases.length === 1, t.phases && t.phases.length);
  ok('Elim direta: format = Eliminatórias Simples', t.format === 'Eliminatórias Simples', t.format);
})();

console.log('');
console.log('════════════════════════════════════════');
console.log('3) GUARDS — legado e recompilação segura');
console.log('════════════════════════════════════════');

// Decisão do dono: sem fmt2 = torneio legado → NÃO inventa config; o caller confia em t.phases.
(function () {
  const t = { id: 'tour_legacy', sport: SPORT, format: 'Eliminatórias Simples', phases: [{ name: 'Eliminatória' }] };
  const r = core.compileFromFmt2(t);
  ok('legado sem fmt2 → ok:false + reason no-fmt2', r.ok === false && r.reason === 'no-fmt2', JSON.stringify(r));
  ok('legado sem fmt2 → t.phases INTOCADO', Array.isArray(t.phases) && t.phases.length === 1 && t.phases[0].name === 'Eliminatória');
  ok('legado sem fmt2 → t.format INTOCADO', t.format === 'Eliminatórias Simples', t.format);
})();

// fmt2 corrompido não pode virar sorteio de formato errado — aborta (espelha o cliente).
(function () {
  const t = { id: 'tour_bad', sport: SPORT, fmt2: { disputa: 'dupla', get grupos() { throw new Error('config corrompida'); } } };
  const r = core.compileFromFmt2(t);
  ok('fmt2 corrompido → ok:false + compile-failed (sem fallback silencioso)', r.ok === false && r.reason === 'compile-failed', JSON.stringify(r));
})();

// Recompilar SÓ na fase 0 sem chave — no meio do torneio atropelaria estado de fase.
ok('canRecompile: doc limpo → true', core.canRecompile({ id: 'a' }) === true);
ok('canRecompile: já tem matches → false', core.canRecompile({ id: 'a', matches: [{ id: 'm1' }] }) === false);
ok('canRecompile: já tem rounds → false', core.canRecompile({ id: 'a', rounds: [{ matches: [] }] }) === false);
ok('canRecompile: já tem groups → false', core.canRecompile({ id: 'a', groups: [{ players: [] }] }) === false);
ok('canRecompile: currentPhaseIndex > 0 → false', core.canRecompile({ id: 'a', currentPhaseIndex: 1 }) === false);
ok('canRecompile: fase já materializada → false', core.canRecompile({ id: 'a', _phaseMaterialized: 1 }) === false);
ok('canRecompile: arrays vazios (pré-sorteio) → true', core.canRecompile({ id: 'a', matches: [], rounds: [] }) === true);

console.log('');
console.log('════════════════════════════════════════');
if (fail === 0) {
  console.log('✅ format2 no servidor: ' + pass + ' ok, 0 falharam');
  console.log('════════════════════════════════════════');
} else {
  console.log('❌ format2 no servidor: ' + pass + ' ok, ' + fail + ' FALHARAM');
  console.log('════════════════════════════════════════');
  process.exit(1);
}
