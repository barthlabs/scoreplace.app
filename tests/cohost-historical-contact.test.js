const assert = require('node:assert/strict');
const { canInviteHistoricalContact } = require('../functions/cohost-core.js');

assert.equal(canInviteHistoricalContact({ friends: ['b'] }, { friends: ['a'] }, 'a', 'b'), true);
assert.equal(canInviteHistoricalContact({ friends: ['b'] }, { friends: [] }, 'a', 'b'), false);
assert.equal(canInviteHistoricalContact({ friends: [] }, { friends: ['a'] }, 'a', 'b'), false);
assert.equal(canInviteHistoricalContact({ friends: ['b'] }, null, 'a', 'b'), false);
assert.equal(canInviteHistoricalContact({ friends: ['a'] }, { friends: ['a'] }, 'a', 'a'), false);

console.log('cohost-historical-contact: OK');
