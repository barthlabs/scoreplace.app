'use strict';
const fs = require('fs');
const path = require('path');
const D = require('../js/domain/waitlist.js');
const I = require('../js/domain/participant-identity.js');
let pass = 0, fail = 0;
function ok(value, message) { if (value) pass++; else { fail++; console.error('  ✗ ' + message); } }
const helpers = {
  participantUids: I.participantUids,
  displayName(value) {
    if (typeof value === 'string') return value.trim();
    return String((value && (value.displayName || value.name || value.email)) || '').trim();
  },
  memberUidByName(tournament, name) {
    const wanted = String(name || '').trim().toLowerCase();
    const entry = (tournament.participants || []).find((candidate) => D.nameForms(candidate, helpers).includes(wanted));
    return entry && entry.uid || '';
  },
};
const entry = (uid, displayName) => ({ uid, displayName });

const source = fs.readFileSync(path.join(__dirname, '../src/domain/waitlist.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/\b(window|document|localStorage|firebase)\s*[.[]/.test(source), 'domínio não depende de browser, cache ou Firestore');
ok(fs.readFileSync(path.join(__dirname, '../js/domain/waitlist.js'), 'utf8').includes('GERADO de src/domain/waitlist.ts'), 'browser executa JavaScript gerado da fonte tipada');

const t = {
  participants: [entry('u_ana', 'Ana'), entry('u_bia', 'Bia')],
  waitlist: [entry('u_ana', 'Ana')],
  standbyParticipants: [entry('u_bia', 'Bia'), { displayName: 'Convidada' }],
  monarchWaitlist: { C: ['u_ana', 'Convidada', 'uid_orfao_que_nao_e_nome'] },
};
const queue = D.getWaitlist(t, helpers);
ok(queue.length === 3, 'une os três storages e descarta uid órfão');
ok(queue.map((value) => D.key(value, helpers)).join('|') === 'u_ana|u_bia|Convidada', 'preserva ordem e usa uid antes de nome');
ok(D.key({ displayName: 'Convidada' }, helpers) === 'Convidada', 'convidado sem conta mantém nome como identidade');
ok(D.normalizeKey(t, 'Ana', helpers) === 'u_ana', 'nome legado de conta normaliza para uid');
ok(D.entryByKey(t, 'u_bia', helpers).displayName === 'Bia', 'chave volta para a entrada canônica');
ok(D.pushBack(t, entry('u_ana', 'Outra Ana'), helpers) === false, 'uid existente não duplica mesmo com nome diferente');
ok(D.pushBack(t, entry('u_clara', 'Ana'), helpers) === true, 'homônimos com UIDs distintos não colidem');
ok(D.removeByKey(t, 'u_ana', helpers) === true, 'remoção por uid remove a pessoa da fila');
ok(!D.getWaitlist(t, helpers).some((value) => D.key(value, helpers) === 'u_ana'), 'remoção limpa todos os três storages');
ok(D.removeByName(t, 'Convidada', helpers) === true, 'remoção por nome atende convidado sem uid');
ok(!D.getWaitlist(t, helpers).some((value) => D.key(value, helpers) === 'Convidada'), 'convidado também sai de todos os índices');

const phase = { rounds: [{ monarchGroups: [{ playersUids: ['u_bia'], players: ['Bia'] }], matches: [{ p1Uid: 'u_ana' }, { p1Uid: 'u_clara', isSitOut: true }] }], groups: [{ playersUids: ['u_clara'], players: ['Clara'] }] };
ok(D.isPlayingCurrentPhase(phase, entry('u_ana', 'Ana'), helpers), 'confronto ativo marca participante como jogando');
ok(D.isPlayingCurrentPhase(phase, entry('u_bia', 'Bia'), helpers), 'grupo Rei/Rainha marca participante como jogando');
ok(D.isPlayingCurrentPhase(phase, entry('u_clara', 'Clara'), helpers), 'grupo de fase também marca participante como jogando');
ok(!D.isPlayingCurrentPhase(phase, entry('u_dora', 'Dora'), helpers), 'folga não vira jogo nem inventa presença');
ok(D.phaseDrawDone({ hasDraw: true }) && !D.phaseDrawDone({ hasDraw: false }), 'resumo hasDraw é autoridade quando existe');
ok(D.enrollmentOpenState({ format: 'Liga', ligaOpenEnrollment: true, status: 'closed', rounds: [{}] }).open, 'Liga aberta continua aberta após sorteio');
ok(!D.enrollmentOpenState({ status: 'finished' }).open, 'torneio concluído não aceita inscrição');

const vendor = fs.readFileSync(path.join(__dirname, '../functions-autodraw/vendor/waitlist.js'));
ok(vendor.equals(fs.readFileSync(path.join(__dirname, '../js/domain/waitlist.js'))), 'motor de sorteio recebe exatamente o domínio gerado');
const local = fs.readFileSync(path.join(__dirname, '../functions/liga-availability-window.js'), 'utf8');
ok(local.includes("require('./vendor/waitlist.js')") && local.includes("require('./vendor/participant-identity.js')"), 'Function isolada usa os mesmos contratos gerados');

console.log((fail ? '❌' : '✅') + ' domínio tipado de lista de espera: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
