'use strict';
/*
 * Neon é uma agenda concentrada de equipes: cada dupla disputa quatro jogos.
 * O servidor grava os jogos como uma lista plana com `round`, não como
 * `group.rounds`. A chave precisa materializar as quatro colunas, sem expor o
 * grupo técnico usado apenas para a classificação.
 *
 * node tests/neon-quatro-rodadas-planejadas.test.js
 */
const assert = require('assert');
const { window: W } = require('./headless');

const matches = [];
for (let round = 1; round <= 4; round++) {
  for (let match = 1; match <= 4; match++) {
    matches.push({
      id: 'neon-r' + round + '-m' + match,
      round,
      p1: 'Time ' + match,
      p2: 'Time ' + (match + 4),
      category: 'Fem Extreme'
    });
  }
}

const model = W._getUnifiedRounds({
  id: 'neon-fixture',
  format: 'Fase de Grupos + Eliminatórias',
  currentStage: 'groups',
  teamCompetition: { enabled: true, schedule: { enabled: true } },
  groups: [{ name: 'Fem Extreme · Grupo A', matches }]
});

const groups = model.columns.find((column) => column.phase === 'groups');
assert(groups, 'a chave classificatória precisa chegar ao adaptador');
assert.strictEqual(groups.subgroups.length, 1, 'a categoria tem uma agenda técnica');
const rounds = groups.subgroups[0].rounds;
assert.strictEqual(rounds.length, 4, 'a agenda plana precisa virar R1, R2, R3 e R4');
assert.deepStrictEqual(Array.from(rounds, (round) => round.round), [1, 2, 3, 4], 'as rodadas mantêm a ordem planejada');
assert.deepStrictEqual(Array.from(rounds, (round) => round.matches.length), [4, 4, 4, 4], 'cada rodada mantém todos os seus jogos');

const fs = require('fs');
const path = require('path');
const bracket = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
assert(/data-bracket-team-schedule/.test(bracket), 'a grade concentrada tem um modo próprio de abas');
assert(/!isTeamSchedule && !isOnlyLines/.test(bracket), 'o Neon não pode esconder R2–R4 em abas de rodada');
assert(/_isTeamScheduleGS[\s\S]{0,900}groupHeader/.test(bracket), 'o grupo técnico não pode aparecer como título da chave');
assert(/regression_neon_phase_faux_keeps_schedule_contract/.test(bracket), 'a cópia filtrada da fase mantém o contrato de agenda do Neon');
assert(/regression_neon_round_headers_are_sticky/.test(bracket), 'cada cabeçalho de rodada concentrada continua fixo durante a rolagem');
assert(/scheduledGameNumber[\s\S]{0,180}matchNum = _plannedGameNumber/.test(bracket), 'o card usa o número definido na prévia, não o contador local da categoria');
const timestampFn = bracket.indexOf('function _matchCardTimestamp(value)');
const dateTimeFn = bracket.indexOf('function _matchCardDateTime(ms, t)');
const scheduleCard = bracket.indexOf('var _scheduledMs = _isConcentratedEvent');
assert(timestampFn >= 0 && timestampFn < scheduleCard, 'o card concentrado usa o leitor canônico de data já declarado');
assert(dateTimeFn >= 0 && dateTimeFn < scheduleCard, 'o card concentrado usa o formatador canônico de data já declarado');

console.log('✅ Neon: quatro rodadas planejadas, sem Grupo A visível');
