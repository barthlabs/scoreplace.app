'use strict';

/* Os botões de contato precisam preservar o gesto do iOS, sem recuperar a
 * permissão ampla de ler qualquer ficha privada do navegador. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const db = fs.readFileSync(path.join(root, 'js/firebase-db.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'js/views/tournaments-organizer.js'), 'utf8');

const startDb = db.indexOf('async carregarContatoDoTorneio');
const endDb = db.indexOf('\n  },', startDb);
const fn = db.slice(startDb, endDb);
assert.ok(startDb >= 0, 'existe porta de contato contextual');
assert.match(fn, /_callFn\('getTournamentParticipantContact'/,
  'a porta chama a função do servidor');
assert.doesNotMatch(fn, /collection\('users'\)|loadUserProfile\(/,
  'a porta não lê `users` no navegador');

const contactStart = view.indexOf('window._hydrateContactPersonButtons = function');
const contactEnd = view.indexOf('// Abre o canal de contato da pessoa', contactStart);
const contact = view.slice(contactStart, contactEnd);
assert.match(contact, /data-contact-tournament-id/,
  'o contato carrega o contexto do torneio');
assert.match(contact, /carregarContatoDoTorneio\(target\.tournamentId, target\.uid\)/,
  'a pré-carga preserva o gesto com o contato autorizado');
assert.doesNotMatch(contact, /loadUserProfile\(/,
  'a pré-carga não baixa ficha privada');
assert.match(view, /carregarContatoDoTorneio\(t\.id, t\.creatorUid\)/,
  'o botão de falar com organizador usa a mesma porta contextual');

console.log('✅ contato direto usa autorização do torneio — 7 verificações');
