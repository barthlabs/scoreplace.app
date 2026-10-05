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
assert(/regression_neon_hides_technical_group_header[\s\S]{0,220}const _hideTechnicalGroupHeader = _isTeamScheduleGS;[\s\S]{0,100}const groupHeader = _hideTechnicalGroupHeader\s*\?/.test(bracket),
  'o grupo técnico não pode aparecer como título da chave');
assert(/regression_neon_phase_faux_keeps_schedule_contract/.test(bracket), 'a cópia filtrada da fase mantém o contrato de agenda do Neon');
assert(/regression_neon_round_headers_are_sticky/.test(bracket), 'cada cabeçalho de rodada concentrada continua fixo durante a rolagem');
assert(/regression_neon_sticky_heading_keeps_column_presentation/.test(bracket), 'o cabeçalho fixo preserva a mesma tipografia, cor e barra da coluna');
assert(/scheduledGameNumber[\s\S]{0,180}matchNum = _plannedGameNumber/.test(bracket), 'o card usa o número definido na prévia, não o contador local da categoria');
const timestampFn = bracket.indexOf('function _matchCardTimestamp(value)');
const dateTimeFn = bracket.indexOf('function _matchCardDateTime(ms, t)');
const scheduleCard = bracket.indexOf('var _scheduledMs = _isConcentratedEvent');
assert(timestampFn >= 0 && timestampFn < scheduleCard, 'o card concentrado usa o leitor canônico de data já declarado');
assert(dateTimeFn >= 0 && dateTimeFn < scheduleCard, 'o card concentrado usa o formatador canônico de data já declarado');
assert(/sp-match-estimated-time[\s\S]{0,160}margin-left:auto/.test(bracket), 'o horário estimado fica alinhado à direita do rodapé operacional');
assert(/regression_bracket_tabs_do_not_leak_round_content/.test(bracket) && /margin:0;padding:4px 12px 6px/.test(bracket),
  'as abas não deixam conteúdo da rodada vazar no intervalo abaixo das categorias');
assert(/regression_round_heading_never_overlaps_category_tabs/.test(bracket) && /bracket-round-column>\.bracket-round-heading[\s\S]{0,220}margin:0;/.test(bracket) && !bracket.includes('margin:-8px 0 0'),
  'o cabeçalho da rodada não invade a faixa das categorias nem deixa fresta visual');
assert(/regression_score_submit_never_jumps_bracket/.test(require('fs').readFileSync(path.join(__dirname, '..', 'js/store.js'), 'utf8')),
  'a confirmação do placar preserva a âncora da chave em vez de reiniciar a página');
assert(/Object\.assign\({}, configuredCfg, \{ ranking: 'games_diff' \}\)/.test(bracket),
  'a classificação dos times usa saldo acumulado de games, não pontos por vitória');
assert(/regression_team_competition_hides_pair_standings/.test(bracket) && /pairStandingsHtml = _isTeamCompetitionGS \? ''/.test(bracket),
  'agenda entre times não mostra classificação técnica por participantes/duplas');
assert(/regression_team_standings_general_first/.test(bracket) && /Classificação geral dos times/.test(bracket),
  'a classificação geral de todos os times antecede qualquer detalhamento por categoria');
assert(/data-competition-team-category-standings="1"/.test(bracket) && /Classificação por categorias/.test(bracket),
  'as classificações por categoria permanecem disponíveis, mas recolhidas');

console.log('✅ Neon: quatro rodadas planejadas, sem Grupo A visível');
