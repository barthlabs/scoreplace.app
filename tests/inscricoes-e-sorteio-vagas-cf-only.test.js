'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-draw-prep.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
function between(text, start, end) { const a=text.indexOf(start), b=text.indexOf(end,a); return a>=0 && b>a ? text.slice(a,b) : ''; }
const toggle = between(client, 'window.toggleRegistrationStatus = function (tId) {', '// ─── Sorteio de Vagas');
const slots = between(client, 'window._runVagasDraw = function (tId) {', '// v4.0.73:');
ok(/exports\.setTournamentEnrollmentStatus\s*=\s*onCall/.test(server), 'CF canônica recebe alteração de inscrições');
ok(/exports\.runEnrollmentSlotsDraw\s*=\s*onCall/.test(server), 'CF canônica realiza o sorteio de vagas');
ok(/_isTournamentAdmin\(t, uid\)/.test(server), 'as intenções exigem organizador no servidor');
ok(/drawWindow\._entryHasVip/.test(server) && /drawWindow\._entryTeamMembers/.test(server), 'sorteio usa a regra canônica de VIP e equipe');
ok(/_promoteWaitlists\(t\)/.test(server), 'reabrir inscrições promove todas as listas no servidor');
ok(/_effectiveLateEnrollment/.test(server), 'a inscrição tardia usa a configuração efetiva da fase');
ok(/_maybeFinishElimination/.test(server), 'fechar inscrição tardia encerra a chave já concluída');
ok(/notificationOutbox'\)\.doc\(type \+ '-'/.test(server), 'cada aviso de inscrição tem id de outbox próprio');
ok(/window\._setTournamentEnrollmentStatus/.test(toggle), 'a tela envia apenas a intenção de inscrição');
ok(!/AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(toggle), 'a tela não grava inscrição diretamente');
ok(/window\._runEnrollmentSlotsDraw/.test(slots), 'a tela solicita o sorteio ao servidor');
ok(!/Math\.random|AppStore\.(?:mutate|commitTournamentTx)\s*\(/.test(slots), 'a tela não sorteia nem grava vagas');
process.exit(failed ? 1 : 0);
