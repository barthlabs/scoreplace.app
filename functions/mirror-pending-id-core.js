'use strict';

const crypto = require('node:crypto');

const ORPHAN_SOURCE_CODE = 'source';

function hashedPendingId(prefix, sourceId) {
  const id = String(sourceId == null ? '' : sourceId);
  if (!id) throw new Error('mirror_pending_missing_match_id');
  return prefix + '-' + crypto.createHash('sha256').update(id).digest('hex');
}

function matchPendingId(sourceId) { return hashedPendingId('match', sourceId); }
function orphanPendingId(sourceId) { return hashedPendingId('orphan', sourceId); }

module.exports = { ORPHAN_SOURCE_CODE, matchPendingId, orphanPendingId };
