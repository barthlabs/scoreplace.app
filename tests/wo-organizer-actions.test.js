'use strict';

const assert = require('assert');
const fs = require('fs');

const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = server.indexOf('exports.applyTournamentWO = onCall(async (request) => {');
const end = server.indexOf('// ─── Presença da organização com substituição de W.O.', start);
assert(start >= 0 && end > start, 'callable administrativa de W.O. existe');
const body = server.slice(start, end);
assert(body.includes('forceTeamWO = data.forceTeamWO === true'), 'callable recebe intenção explícita de W.O. do time');
assert(body.includes("woScope: 'individual'"), 'W.O. individual da organização não depende da configuração antiga');
assert(body.includes("woScope: 'team'"), 'W.O. do time chega ao mesmo motor compartilhado');
assert(body.includes('_forceNoSub: true'), 'W.O. do time nunca chama suplente');
assert(body.includes('matches: [selectedMatch]'), 'a callable limita a ação ao jogo escolhido');
assert(body.includes('_slotUidsOf(selectedMatch, teamSide)'), 'o time é identificado por UID estrutural');

const view = fs.readFileSync('js/views/wo-claim.js', 'utf8');
assert(view.includes('window._woDeclareIndividual = function'), 'modal expõe W.O. individual da organização');
assert(view.includes('window._woDeclareTeam = function'), 'modal expõe W.O. do time inteiro');
assert(view.includes("_orgWoServer(tId, { matchId: String(rc.matchId || rc.m.id || ''), forceTeamWO: true, teamSide: side }"), 'ação da dupla envia apenas o jogo e o lado ao servidor');
assert(view.includes('W.O. do time inteiro'), 'modal identifica claramente a seção de dupla');
assert(view.includes('Nenhum suplente será chamado'), 'confirmação explica que a dupla não usa a lista de espera');
assert(view.includes('A primeira pessoa elegível da lista de espera assume a vaga'), 'confirmação individual explica a substituição');

const create = fs.readFileSync('js/views/create-tournament.js', 'utf8');
assert(create.includes('a escolha individual/time acontece no card do jogo'), 'formulário não guarda política variável de W.O.');
assert(!create.includes('${window._woButtonsHtml(0)}'), 'toggle de escopo deixou de ser mostrado no formulário');

console.log('wo-organizer-actions: OK');
