'use strict';

const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync('js/views/participants.js', 'utf8');
const begin = source.indexOf('window._declareAbsent = function');
const end = source.indexOf('// ─── CARD DE INSCRITO INDIVIDUAL', begin);
assert(begin >= 0 && end > begin, 'recorte de _declareAbsent existe');
const body = source.slice(begin, end);
assert(body.includes("_callFn('applyTournamentWO'"), 'declaração envia intenção à CF');
assert(body.includes('absentUid: String(participantUid ||'), 'a intenção carrega UID quando a pessoa tem conta');
assert(!body.includes('AppStore.mutate('), 'declaração não muta o torneio no navegador');
console.log('wo-declare-cf-only: OK');


const checkinBegin = source.indexOf('window._applyCheckInToggle = function');
const checkinEnd = source.indexOf('// uid = IDENTIDADE', checkinBegin);
assert(checkinBegin >= 0 && checkinEnd > checkinBegin, 'recorte de _applyCheckInToggle existe');
const checkin = source.slice(checkinBegin, checkinEnd);
assert(checkin.includes("_callFn('setTournamentPresenceWithWOSubstitution'"), 'presença com ausentes envia intenção à CF');
assert(checkin.includes("action: wantPresent ? 'present' : 'clear'"), 'intenção de presença é absoluta');
const serverBranch = checkin.slice(checkin.indexOf("_callFn('setTournamentPresenceWithWOSubstitution'"), checkin.indexOf('} else {', checkin.indexOf("_callFn('setTournamentPresenceWithWOSubstitution'")));
assert(!serverBranch.includes('AppStore.mutate('), 'presença que pode substituir W.O. não muta no navegador');


const choiceSource = fs.readFileSync('js/views/wo-claim.js', 'utf8');
const claimDeclareBegin = choiceSource.indexOf('window._woDeclare = function');
const claimDeclareEnd = choiceSource.indexOf('// Stage 2:', claimDeclareBegin);
assert(claimDeclareBegin >= 0 && claimDeclareEnd > claimDeclareBegin, 'recorte do apontamento participativo existe');
const claimDeclare = choiceSource.slice(claimDeclareBegin, claimDeclareEnd);
assert(claimDeclare.includes('_claimServer('), 'apontamento participativo despacha o consenso à CF');
assert(claimDeclare.includes('absentName: String(absentName ||'), 'apontamento preserva nome apenas para convidado sem UID');
assert(!claimDeclare.includes('_commit('), 'apontamento participativo não grava claim no navegador');
const choiceBegin = choiceSource.indexOf('window._woResolveSubChoiceUI = function');
const choiceEnd = choiceSource.indexOf('// ─── APLICAÇÃO do W.O.', choiceBegin);
assert(choiceBegin >= 0 && choiceEnd > choiceBegin, 'recorte da escolha de substituto existe');
const choiceBody = choiceSource.slice(choiceBegin, choiceEnd);
assert(choiceBody.includes("_callFn('resolveWOSubstitutionChoice'"), 'escolha de categoria envia intenção à CF');
assert(!choiceBody.includes('_commit('), 'escolha de categoria não grava pelo commit do navegador');

const absenceBegin = source.indexOf('window._markAbsent = function');
const absenceEnd = source.indexOf('// Traduz o argumento de identidade', absenceBegin);
assert(absenceBegin >= 0 && absenceEnd > absenceBegin, 'recorte de declarar/reverter ausência existe');
const absenceBody = source.slice(absenceBegin, absenceEnd);
assert(absenceBody.includes("_callFn('setTournamentWOAbsence'"), 'declaração/reversão compacta envia intenção à CF');
assert(!absenceBody.includes('AppStore.mutate('), 'declaração/reversão compacta não muta no navegador');
