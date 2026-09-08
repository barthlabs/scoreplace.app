const fs = require('fs');
const s = fs.readFileSync('js/views/tournaments-draw.js', 'utf8');
let fail = 0;
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
const start = s.indexOf('window._mergeParticipantConfirm = function');
const end = s.indexOf('// ── v2.7.75', start);
const merge = s.slice(start, end);
const applyStart = s.indexOf('window._applyParticipantMergeFresh = function');
const apply = s.slice(applyStart, start);
ok(/commitTournamentTx[\s\S]*allowRosterRemoval:\s*true/.test(merge), 'mescla declara a remoção intencional na transação');
ok(/_applyParticipantMergeFresh\(ft, personName, personUid, placeholderName, placeholderUid\)/.test(merge), 'mescla reaplica a troca de vaga no documento fresco');
ok(!/saveTournament\(|AppStore\.sync\(/.test(merge), 'mescla não regrava o snapshot da tela');
ok(/_mergedFrom/.test(apply) && /_replaceParticipantNameInBracket/.test(apply), 'aplicador fresco preserva desfazer e atualiza a chave');
const undoStart = s.indexOf('window._undoMergeParticipant = function');
const undoEnd = s.indexOf('/**', undoStart);
const undoMerge = s.slice(undoStart, undoEnd);
ok(/commitTournamentTx/.test(undoMerge) && /_applyUndoParticipantMergeFresh\(ft, personName, placeholderName\)/.test(undoMerge), 'desfazer mescla restaura a vaga no documento fresco');
ok(!/saveTournament\(|AppStore\.sync\(/.test(undoMerge), 'desfazer mescla não regrava o snapshot da tela');
if (fail) process.exit(1);
