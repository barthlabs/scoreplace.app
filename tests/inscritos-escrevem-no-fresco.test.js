const fs = require('fs');
const s = fs.readFileSync('js/views/tournaments.js', 'utf8');
let fail = 0;
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
const start = s.indexOf('window.splitParticipantFunction = function');
const end = s.indexOf('// Self-healing:', start);
const split = s.slice(start, end);
const applyStart = s.indexOf('window._applySplitParticipantFresh = function');
const apply = s.slice(applyStart, start);
ok(/commitTournamentTx[\s\S]*allowRosterRemoval:\s*true/.test(split), 'divisão de dupla declara remoção intencional na transação fresca');
ok(!/saveTournament\(|AppStore\.sync\(/.test(split), 'divisão de dupla não regrava o snapshot da tela');
ok(/_applySplitParticipantFresh\(ft, participantName\)/.test(split), 'transação reaplica a divisão sobre o elenco fresco');
ok(/teamOrigins/.test(apply) && /p1Uid/.test(apply) && /participants/.test(apply), 'aplicador fresco preserva os slots e limpa a origem da dupla');
const placeholdersStart = s.indexOf('window._addPlaceholdersCore = function');
const placeholdersEnd = s.indexOf('// v2.7.32:', placeholdersStart);
const placeholders = s.slice(placeholdersStart, placeholdersEnd);
ok(/commitTournamentTx/.test(placeholders) && /tournament: ft/.test(placeholders) && /skipPersist: true/.test(placeholders), 'placeholders são numerados novamente no documento fresco');
ok(!/saveTournament\(|AppStore\.sync\(/.test(placeholders), 'placeholders não regravam o snapshot da tela');
if (fail) process.exit(1);
