'use strict';

function mailId(kind, pendingId) {
  return 'pending-' + String(kind) + '-' + String(pendingId);
}

function alreadyExists(err) {
  return !!(err && (err.code === 6 || err.code === 'already-exists' ||
    err.code === 'ALREADY_EXISTS' || String(err.message || '').indexOf('ALREADY_EXISTS') !== -1));
}

async function createOnce(ref, message) {
  const existing = await ref.get();
  if (existing && existing.exists) return { alreadyQueued: true };
  try {
    await ref.create(message);
    return { alreadyQueued: false };
  } catch (err) {
    if (alreadyExists(err)) return { alreadyQueued: true };
    throw err;
  }
}

module.exports = { mailId, alreadyExists, createOnce };
