'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const bracket = fs.readFileSync(path.join(__dirname, '../js/views/bracket.js'), 'utf8');
const participants = fs.readFileSync(path.join(__dirname, '../js/views/participants.js'), 'utf8');
const route = bracket.slice(bracket.indexOf('function renderBracket(container, tournamentId, isInline) {'), bracket.indexOf('window._renderReadyMatchesBanner = function'));

assert.ok(route, 'rota das chaves encontrada');
assert.doesNotMatch(route, /_renderReadyMatchesBanner\s*\(/, 'chave não monta segunda grade de jogos por presença');
assert.doesNotMatch(route, /readyBannerHtml/, 'nenhum ramo da chave insere o painel acima das abas');
assert.match(route, /renderStandings\(t, isOrg, canEnterResult, '', progressBarHtml/, 'Liga e Suíço preservam a assinatura posicional sem painel');
assert.match(route, /renderGroupStage\(t, isOrg, canEnterResult\)/, 'grupos continuam renderizando seus jogos');
assert.match(route, /renderDoubleElimBracket\(t, canEnterResult, standbyHtml\)/, 'dupla eliminatória continua renderizando seus jogos');
assert.match(route, /renderSingleElimBracket\(t, canEnterResult, standbyHtml\)/, 'eliminatória simples continua renderizando seus jogos');
assert.match(participants, /_renderReadyMatchesBanner\(t, \{ category: _activeParticipantCategory \}\)/, 'conferência de presença continua em Inscritos');
assert.ok(participants.indexOf('${_filterBarCtrls}') < participants.indexOf('${readyBannerHtml}'), 'filtro de Inscritos precede seu painel');

console.log('✓ chaves mostram jogos nas rodadas sem painel duplicado de presença');
