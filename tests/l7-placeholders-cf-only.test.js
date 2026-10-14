'use strict';
const fs = require('fs');
const vm = require('vm');
let failed = 0;
function ok(condition, message) { if (condition) console.log('✓ ' + message); else { console.error('✗ ' + message); failed++; } }
const ui = fs.readFileSync('js/views/tournaments.js', 'utf8');
const orgTools = fs.readFileSync('js/views/tournaments-org-tools.js', 'utf8');
ok(/function _guard\(tId\)/.test(orgTools) && /function _safe\(s\)/.test(orgTools) && /window\._pageAddParticipant = function/.test(orgTools) && /window\._pageAddPlaceholders = function/.test(orgTools), 'painel de participantes define todas as funções de ação antes do uso');
ok(/_participantControlKey\(tId\)/.test(orgTools) && /getElementById\('addpart-ph-' \+ controlKey\)/.test(orgTools), 'painel usa a mesma chave segura ao criar e localizar os controles');
const a = ui.indexOf('window._addPlaceholdersCore');
const b = ui.indexOf('// v2.7.32:', a);
const block = ui.slice(a, b);
ok(/_callFn\('addTournamentPlaceholders'/.test(block) && !/commitTournamentTx/.test(block), 'placeholders só despacham a CF');
ok(/var data = \(result && result\.data\) \? result\.data : \(result \|\| \{\}\)/.test(block) && /data\.tournament/.test(block), 'retorno callable envelopado atualiza a análise imediatamente');
ok(!/Escolha a categoria/.test(block) && /placeholders: made/.test(block) && /manualParticipantId: 'manual-'/.test(block), 'cliente permite placeholder genérico, com identidade estável, e devolve as reservas criadas');
const fn = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const x = fn.indexOf('exports.addTournamentPlaceholders');
const y = fn.indexOf('// ─── Reset para inscrições', x);
const server = fn.slice(x, y);
ok(/_isTournamentAdmin/.test(server) && /runTransaction/.test(server) && /_gravaTorneio/.test(server), 'CF valida organizador e grava o elenco transacionalmente');
ok(/placeholderReservations/.test(server) && /_appendPlaceholderReservations/.test(server), 'CF persiste placeholder canônico como reserva genérica, sem inscrição sem categoria');
ok(/_projectedPeopleCount/.test(server) && /t\.competitorsCount = _projectedPeopleCount\(t\.participants\)/.test(server), 'CF atualiza o resumo de inscritos no mesmo commit das reservas');
const db = fs.readFileSync('js/firebase-db.js', 'utf8');
const readStart = db.indexOf('async _montaDeSubcolecoes');
const readEnd = db.indexOf('  // v2.3.103:', readStart);
const readBlock = db.slice(readStart, readEnd === -1 ? readStart + 9000 : readEnd);
ok(/placeholderReservations/.test(readBlock) && /isPlaceholder: true/.test(readBlock) &&
  /_reservationSeen\[id\]/.test(readBlock) && /entry\.p1ManualId/.test(readBlock) &&
  /_reservationNumbers/.test(readBlock),
  'leitura fresca reidrata reservas genéricas sem duplicar membros de duplas com ID de migração diferente');
const draw = fs.readFileSync('js/views/tournaments-draw.js', 'utf8');
ok(/_isParticipantsRoute/.test(draw) && /renderParticipants\(document\.getElementById\('view-container'\), tId\)/.test(draw) && /_isBracketRoute/.test(draw), 'resposta da CF mantém a rota de inscritos e não troca a tela pela chave vazia');
const poolStart = draw.indexOf('window._buildPhase0Pool');
const poolEnd = draw.indexOf('// INCREMENT 2', poolStart);
const poolBlock = draw.slice(poolStart, poolEnd);
ok(/genericPlaceholderReservation === true/.test(poolBlock), 'reserva genérica não entra no pool do sorteio');
ok(/genericPlaceholderReservation === true\) return false/.test(draw), 'reserva genérica não bloqueia a validação de categoria antes do sorteio');
const sandbox = { window: { _pName: function (p) { return p && (p.displayName || p.name) || ''; } }, Object: Object, Array: Array };
vm.runInNewContext(poolBlock, sandbox);
const pool = sandbox.window._buildPhase0Pool({ participants: [
  { name: 'Jogador 01', displayName: 'Jogador 01', manualParticipantId: 'manual-reserva-01', isPlaceholder: true, genericPlaceholderReservation: true },
  { name: 'Ana', displayName: 'Ana', manualParticipantId: 'manual-ana', category: 'Light' }
] }, false, 1);
ok(pool.length === 1 && pool[0].displayName === 'Ana', 'sorteio real não inclui a reserva genérica sem categoria');
const cats = fs.readFileSync('js/views/tournaments-categories.js', 'utf8');
ok(/_displayTournamentCategory/.test(cats) && /canonicalRegistrationMigration/.test(cats), 'renderer traduz IDs canônicos/legados para o rótulo visível');
const cards = fs.readFileSync('js/views/tournaments.js', 'utf8');
ok(/p\.categoryId \|\| p\.category/.test(cards), 'card de dupla lê categoryId antes do rótulo legado');
process.exitCode = failed ? 1 : 0;
