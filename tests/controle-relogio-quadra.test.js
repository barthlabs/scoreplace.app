'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const timing = require('../js/domain/match-timing.js');
const config = { call: 5, warmup: 2, game: 30 };
const at = Date.parse('2026-10-22T18:00:00Z');
const phase = (start, now) => timing.phaseAt(start, config, now).phase;

let shifted = timing.adjust(at, config, at + 60000, 'next');
assert.equal(shifted.phase, 'warmup');
assert.equal(phase(shifted.start, at + 60000), 'warmup');
assert.equal(timing.text(timing.phaseAt(shifted.start, config, at + 60000), at + 60000), 'Aquecimento 00:00:00');

shifted = timing.adjust(shifted.start, config, at + 90000, 'restart');
assert.equal(phase(shifted.start, at + 90000), 'warmup');
assert.equal(timing.text(timing.phaseAt(shifted.start, config, at + 90000), at + 90000), 'Aquecimento 00:00:00');

shifted = timing.adjust(shifted.start, config, at + 100000, 'next');
assert.equal(phase(shifted.start, at + 100000), 'game');
shifted = timing.adjust(shifted.start, config, at + 110000, 'next');
assert.equal(phase(shifted.start, at + 110000), 'overdue');
assert.equal(timing.text(timing.phaseAt(shifted.start, config, at + 110000), at + 110000), 'Atrasado 00:30:00');
assert.equal(timing.adjust(shifted.start, config, at + 115000, 'next').changed, false,
  'FF no atraso não volta o tempo do jogo para trás');
shifted = timing.adjust(shifted.start, config, at + 120000, 'restart');
assert.equal(phase(shifted.start, at + 120000), 'game');
assert.equal(timing.text(timing.phaseAt(shifted.start, config, at + 120000), at + 120000), 'Tempo de jogo 00:00:00');

const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const bracket = fs.readFileSync('js/views/bracket.js', 'utf8');
assert.match(server, /clockAction !== 'next' && clockAction !== 'restart'/);
assert.match(server, /_matchTiming\.adjust\(anchorMs, timing, nowMs, clockAction\)/);
assert.match(server, /m\.courtClockBaseAt = new Date\(shifted\.start\)\.toISOString\(\)/);
assert(server.indexOf('if (clockAction) {', server.indexOf('exports.assignMatchCourt = onCall')) <
  server.indexOf('const jaEmJogo =', server.indexOf('exports.assignMatchCourt = onCall')),
  'FF/REW seguem disponíveis durante o jogo ao vivo, sem tocar no placar');
assert.match(server, /callState\.phase !== 'call'/);
assert.match(bracket, /_callCF\('assignMatchCourt', \{ tournamentId: String\(tId\), sandbox:/);
assert.match(bracket, /clockAction: action/);
assert.match(bracket, /Próxima etapa do relógio/);
assert.match(bracket, /Reiniciar etapa do relógio/);
assert.match(bracket, /!!\(_calledMs && m\.court && typeof window\._souOrganizador === 'function'/,
  'jogo iniciado sem chamada de quadra mostra relógio, mas não FF/REW que o servidor recusaria');
assert.match(bracket, /courtClockBaseAt \|\| m\.courtCalledAt/);
assert.match(fs.readFileSync('js/views/tv-live.js', 'utf8'), /m\.courtClockBaseAt \|\| m\.courtCalledAt/);
const realReset = server.match(/const isPrePublicationRestore = ([^;]+);/);
assert(realReset);
const prePublicationAllowed = new Function('restoreMode', 'sandbox', 't', 'return ' + realReset[1]);
assert.equal(prePublicationAllowed('prePublication', false, { allowPrePublicationRestore: true }), false,
  'torneio real não pode restaurar o sorteio, mesmo que tenha flag legada');
assert.equal(prePublicationAllowed('prePublication', true, { isSandbox: true, allowPrePublicationRestore: true }), true,
  'o mesmo controle continua disponível no sandbox');
assert.match(fs.readFileSync('js/views/tournaments.js', 'utf8'), /hasDraw && t\.isSandbox === true && t\.allowPrePublicationRestore === true/);
console.log('✓ FF e REW preservam a mesma fase/tempo na chave e NO AR; servidor valida e grava o relógio');
