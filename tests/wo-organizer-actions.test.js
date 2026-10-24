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
assert(body.includes("teamDecisionV2 && teamOutcome === 'substitute'"), 'chamada nova diferencia substituição e vitória por W.O.');
assert(body.includes("_forceNoSub: !teamDecisionV2 || teamOutcome === 'wo'"), 'escolha de W.O. e cliente antigo não consomem suplente');
assert(body.includes('requireTeamSubstitution: teamDecisionV2'), 'substituição exige dupla elegível na transação');
assert(body.includes('individualDecisionV2 = data.individualDecisionV2 === true'), 'a decisão individual é explícita');
assert(body.includes('individualDecisionV2 && (forceTeamWO || !matchId || !requestedUid)'), 'o servidor recusa W.O. individual sem UID antes de qualquer escrita');
assert(body.includes("result.outcome !== 'subbed'"), 'sem substituição concluída o W.O. individual não grava pendência nem W.O. da dupla');
assert(body.includes('matches: [selectedMatch]'), 'a callable limita a ação ao jogo escolhido');
assert(body.includes('requestedTeamUids'), 'o time é solicitado pelo conjunto de UIDs');
assert(body.includes('_woClaimCore.validateTeamWO(selectedMatch, requestedTeamUids)'), 'o servidor valida o conjunto completo de UIDs e a estrutura da dupla no jogo fresco');
assert(!body.includes('teamSide'), 'o contrato administrativo não transporta p1/p2');
assert(body.includes('_matchMemberByUid(selectedMatch, requestedUid)'), 'W.O. individual aceita UID que já está no jogo mesmo fora do elenco');
assert(body.includes('targetUids.every(targetUid => !!_matchMemberByUid(selectedMatch, targetUid))'), 'a presença no jogo é validada por UID, sem fallback por nome');

const view = fs.readFileSync('js/views/wo-claim.js', 'utf8');
assert(view.includes('window._woDeclareIndividual = function'), 'modal expõe W.O. individual da organização');
assert(view.includes('window._woDeclareTeam = function'), 'modal expõe W.O. do time inteiro');
assert(view.includes('forceTeamWO: true') && view.includes('teamUids: team.uids'), 'ação da dupla envia os UIDs e a decisão ao servidor');
assert(!view.includes('teamSide:'), 'a tela não envia p1/p2 para a callable');
assert(view.includes('W.O. do time inteiro'), 'modal identifica claramente a seção de dupla');
assert(view.includes('Chamar dupla suplente') && view.includes('Vitória por W.O.'), 'confirmação oferece as duas escolhas ao organizador');
assert(view.includes('individualDecisionV2: true'), 'a tela exige suplente no W.O. individual');
assert(view.includes("isManager && rc.scope === 'match' && !_u"), 'a tela não oferece W.O. individual indisponível para inscrição digitada');
assert(view.includes('Inscrição digitada: use Trocar participante'), 'a pessoa digitada recebe uma ação alternativa clara');
assert(view.includes('Se não houver suplente, nada será gravado'), 'a confirmação individual explica a decisão');

const create = fs.readFileSync('js/views/create-tournament.js', 'utf8');
assert(create.includes('a escolha individual/time acontece no card do jogo'), 'formulário não guarda política variável de W.O.');
assert(!create.includes('${window._woButtonsHtml(0)}'), 'toggle de escopo deixou de ser mostrado no formulário');

console.log('wo-organizer-actions: OK');
