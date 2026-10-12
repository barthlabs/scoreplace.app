'use strict';

const assert = require('assert/strict');
const core = require('../functions/notification-authority-core');
let pass = 0;
function ok(value, message) { assert.ok(value, message); pass += 1; console.log('  ✓ ' + message); }
function no(value, message) { assert.equal(value, false, message); pass += 1; console.log('  ✓ ' + message); }

const social = core.normalize({ type: 'presence_plan', message: 'Vou jogar às 19h' });
ok(core.authorize(social, { callerUid: 'a', targetUid: 'b', areFriends: true }).allowed,
  'aviso social só passa por amizade aceita');
no(core.authorize(social, { callerUid: 'a', targetUid: 'b', areFriends: false }).allowed,
  'aviso social sem amizade é recusado');

const game = core.normalize({
  type: 'schedule', tournamentId: 'tour_1', tournamentName: 'não confiável', matchId: 'm1',
  message: 'Jogo agendado', level: 'fundamental', fromUid: 'forjado', fromPhoto: 'base64',
  casualRoomCode: 'r1', scoreboard: { sets: [{ a: 6, b: 4 }] }
});
ok(core.authorize(game, { callerUid: 'org', targetUid: 'player', callerOrganizer: true, targetParticipant: true }).allowed,
  'organizador pode avisar participante do próprio torneio');
ok(core.authorize(game, { callerUid: 'player-a', targetUid: 'player-b', callerParticipant: true, targetParticipant: true }).allowed,
  'participantes relacionados pelo mesmo torneio podem receber aviso operacional');
no(core.authorize(game, { callerUid: 'a', targetUid: 'b', areFriends: true }).allowed,
  'amizade não autoriza aviso que afirma pertencer a torneio alheio');
no(core.authorize(game, { callerUid: 'a', targetUid: 'a' }).allowed,
  'servidor não grava autoaviso sem relação comprovada com o torneio');
ok(!('fromUid' in game) && !('fromPhoto' in game) && game.tournamentName === 'não confiável',
  'payload não conserva autoria ou foto declaradas pelo navegador');
ok(game.scoreboard && game.scoreboard.sets[0].a === 6, 'placar estruturado legítimo continua disponível ao card');
const own = core.normalize({ type: 'account_update', message: 'Método de login vinculado' });
ok(core.authorize(own, { callerUid: 'a', targetUid: 'a' }).allowed,
  'registro de segurança da própria conta pode chegar à própria caixa');
const ownTournament = core.normalize({ type: 'wa_group', tournamentId: 'tour_1', message: 'Grupo oficial criado' });
ok(core.authorize(ownTournament, { callerUid: 'org', targetUid: 'org', callerOrganizer: true }).allowed,
  'organizador recebe o próprio aviso operacional somente quando pertence ao torneio');
assert.throws(() => core.normalize({ type: 'inventado', message: 'x' }), /não permitido/);
pass += 1; console.log('  ✓ tipo desconhecido não vira canal de mensagem genérico');
const semObjeto = core.normalize({ type: 'schedule', tournamentId: 't', message: 'x', payload: { qualquer: true } });
ok(!('payload' in semObjeto), 'objeto arbitrário não entra no documento de aviso');
const idA = core.notificationId('b', game, Date.parse('2026-10-12T12:00:00Z'));
const idB = core.notificationId('b', game, Date.parse('2026-10-12T23:59:59Z'));
ok(idA === idB && /^[A-Za-z0-9_-]+$/.test(idA), 'idempotência diária continua no servidor e gera id válido');
ok(core.notificationId('b', game, Date.parse('2026-10-12T12:00:00Z'), 'a') !==
  core.notificationId('b', game, Date.parse('2026-10-12T12:00:00Z'), 'outro'),
  'dois remetentes legítimos não sobrescrevem o mesmo aviso diário');

const cardAction = core.normalize({
  type: 'pair_invite', tournamentId: 'tour_1', message: 'Convite de dupla',
  pairRequestId: 'pair_1', waGroupLink: 'https://chat.whatsapp.com/x',
  inviteType: 'cohost', liveId: 'live_1', casualSport: 'Beach Tennis'
});
ok(cardAction.pairRequestId === 'pair_1' && cardAction.waGroupLink && cardAction.casualSport === 'Beach Tennis',
  'campos explícitos dos botões dos cartões sobrevivem à sanitização');

console.log('✓ notification-authority-core: ' + pass + ' passaram');
