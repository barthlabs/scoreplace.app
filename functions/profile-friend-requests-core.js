'use strict';
function normalizeAcceptFriendRequests(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.accept !== 'boolean') throw new Error('preferência de amizade inválida');
  return input.accept;
}
module.exports = { normalizeAcceptFriendRequests };
