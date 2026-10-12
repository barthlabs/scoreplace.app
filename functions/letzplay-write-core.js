'use strict';

// A extensão apenas coleta dados que o usuário ou o organizador está vendo. A
// normalização e a escrita vivem no servidor para que nenhum navegador possa
// escolher caminhos, ids ou campos do acervo compartilhado.
const model = require('../js/letzplay-model.js');

const MAX_IMPORT_BYTES = 850 * 1024;
const MAX_HISTORY_BYTES = 8 * 1024 * 1024;
const MAX_GAMES = 5000;
const HANDLE_MAX = 120;

function plain(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function cloneJson(value, label, maxBytes) {
  let json;
  try { json = JSON.stringify(value); }
  catch (_) { throw new Error((label || 'payload') + ' não serializável'); }
  if (!json || Buffer.byteLength(json, 'utf8') > maxBytes) {
    throw new Error((label || 'payload') + ' excede o limite permitido');
  }
  return JSON.parse(json);
}

function normalizeHandle(value) {
  const handle = String(value == null ? '' : value).trim();
  if (!handle || handle.length > HANDLE_MAX || /[\u0000-\u001f/]/.test(handle)) {
    throw new Error('handle letzplay inválido');
  }
  return handle;
}

function gameCount(imp) {
  return Math.max(Number(imp && imp.gamesTotal) || 0, Array.isArray(imp && imp.games) ? imp.games.length : 0);
}

function normalizeOwnImport(input) {
  if (!plain(input)) throw new Error('import letzplay inválido');
  const imp = cloneJson(input, 'import letzplay', MAX_IMPORT_BYTES);
  if (imp.source !== 'letzplay' || !Array.isArray(imp.footprint) || !Array.isArray(imp.observations)) {
    throw new Error('import letzplay malformado');
  }
  imp.handle = normalizeHandle(imp.handle);
  if (!Array.isArray(imp.games)) imp.games = [];
  if (imp.games.length > MAX_GAMES) throw new Error('import letzplay tem jogos demais');
  // A procedência e o relógio pertencem ao servidor. Nunca aceite que um cliente
  // se declare organizador ou escolha quando uma coleta ocorreu.
  delete imp.importedAt;
  delete imp.importedVia;
  delete imp.importedByName;
  delete imp.importedTournamentName;
  return imp;
}

function normalizeHistory(input, suppliedHandle, suppliedGames) {
  if (!plain(input)) throw new Error('histórico letzplay inválido');
  const imp = cloneJson(input, 'histórico letzplay', MAX_HISTORY_BYTES);
  const handle = normalizeHandle(suppliedHandle || imp.handle);
  const games = suppliedGames == null ? imp.games : suppliedGames;
  if (!Array.isArray(games) || games.length > MAX_GAMES) throw new Error('lote de jogos letzplay inválido');
  const source = Object.assign({}, imp, { games: cloneJson(games, 'jogos letzplay', MAX_HISTORY_BYTES), handle });
  const docs = model.historyDocs(source, handle);
  return { handle, docs };
}

function isSameHandle(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

module.exports = {
  MAX_IMPORT_BYTES, MAX_HISTORY_BYTES, MAX_GAMES,
  normalizeHandle, normalizeOwnImport, normalizeHistory, gameCount, isSameHandle,
};
