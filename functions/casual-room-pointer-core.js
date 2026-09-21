'use strict';

function normalizeRoomCode(value) {
  if (value === null) return null;
  const roomCode = String(value || '').trim().toUpperCase();
  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(roomCode)) {
    throw new Error('código de sala inválido');
  }
  return roomCode;
}

module.exports = { normalizeRoomCode };
