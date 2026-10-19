const assert = require('assert');
const fs = require('fs');

const ui = fs.readFileSync('js/views/tournaments-enrollment.js', 'utf8');
const start = ui.indexOf('window.submitTeamEnroll = function');
const end = ui.indexOf('window._leaveStandby = function', start);
assert(start >= 0 && end > start, 'team enrollment handler exists');
const handler = ui.slice(start, end);
assert(handler.includes('window.enrollCurrentUser(tId)'), 'team form routes self to consented enrollment');
assert(!handler.includes('p2Uid:'), 'team form never enrolls a partner UID');
assert(!handler.includes('FirestoreDB.enrollParticipant'), 'team form never sends a composite roster entry');
const addStart = ui.indexOf('window._doAddParticipant = function');
const addEnd = ui.indexOf('window.addTeamFunction = function', addStart);
assert(addStart >= 0 && addEnd > addStart, '+Participante handler exists');
const addHandler = ui.slice(addStart, addEnd);
assert(addHandler.indexOf('if (selectedUid && selectedUid !== _currentUid)') < addHandler.indexOf('window.FirestoreDB.enrollParticipant'),
  '+Participante blocks a third-party UID before calling the server');
console.log('✓ formulário de dupla não inscreve parceiro sem consentimento');
