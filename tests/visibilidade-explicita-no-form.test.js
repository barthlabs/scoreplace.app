'use strict';
/* REGRESSÃO: os três escopos de visibilidade são explícitos e mutuamente exclusivos.
 * Criar, editar e template atualizam a mesma seleção e os três campos persistidos. */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const pt = fs.readFileSync('js/i18n-pt.js', 'utf8');
let pass = 0, fail = 0;
function ok(condition, message) { if (condition) { pass++; console.log('  ✓ ' + message); } else { fail++; console.error('  ✗ ' + message); } }

console.log('──── visibilidade explícita do torneio ────');
ok(['public', 'members', 'organizers'].every(mode => src.includes('data-visibility="' + mode + '"')), 'o formulário oferece Geral, Inscritos e Apenas organizadores');
ok(src.includes("var chosen = vis === 'organizers'") && src.includes("btn.setAttribute('aria-pressed', selected ? 'true' : 'false')"), 'selecionar um escopo desativa visualmente os outros');
ok(src.includes("hidden.value = chosen === 'public' ? 'true' : 'false'") && src.includes("scope.value = chosen") && src.includes("membersOnly: visibilityVal === 'members'") && src.includes("organizerOnly: visibilityVal === 'organizers'"), 'os campos persistidos refletem o escopo escolhido');
ok(src.includes("window._setVisibility(t.organizerOnly === true ? 'organizers'") && src.includes("window._setVisibility(tpl.organizerOnly ? 'organizers'"), 'edição e template reidratam a seleção visível');
ok(['create.visibilityGeneral', 'create.visibilityMembers', 'create.visibilityOrganizers'].every(key => pt.includes("'" + key + "'")), 'rótulos em português existem');
const organizerSource = fs.readFileSync('js/views/tournaments-organizer.js', 'utf8');
const start = organizerSource.indexOf('window._notifyTournamentParticipants = async function');
const end = organizerSource.indexOf('\n};\n\n/**\n * Dispatch notifications', start);
ok(start !== -1 && end > start, 'o caminho real de notificação em lote foi encontrado');
const ctx = { window: { FirestoreDB: { db: {} }, _tournamentNotificationsMuted: () => false }, console };
vm.runInNewContext(organizerSource.slice(start, end + 3), ctx);
let writes = 0;
ctx.window._sendUserNotification = async () => { writes++; return null; };
(async () => {
  await ctx.window._notifyTournamentParticipants({ id: 'hidden', name: 'Oculto', organizerOnly: true,
    participants: [{ uid: 'participant-1' }] }, { type: 'tournament_update', message: 'Teste' });
  ok(writes === 0, 'só organizadores: nenhum documento de notificação é criado para inscrito');
  if (fail) process.exitCode = 1;
  console.log('\n' + (fail ? '❌' : '✅') + ' visibilidade explícita: ' + pass + ' verificações' + (fail ? ', ' + fail + ' falharam' : ''));
})().catch((error) => { console.error(error); process.exitCode = 1; });
