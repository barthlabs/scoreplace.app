'use strict';

const crypto = require('node:crypto');
const { canReadTournamentData } = require('./result-history-visibility-core');

const PAGE_SIZE = 50;

function resultPath(path) {
  if (typeof path !== 'string' || path.length > 1024) return null;
  const parts = path.split('/');
  return parts.length === 4 && parts[0] === 'tournaments' && parts[1] &&
    parts[2] === 'matches' && parts[3] ? parts[1] : null;
}

// O cursor pagina candidatos do collectionGroup, inclusive caminhos filtrados
// depois (sandbox etc.). A validação da resposta continua restrita a tournaments.
function cursorPath(path) {
  if (typeof path !== 'string' || path.length > 1024) return false;
  const parts = path.split('/');
  return parts.length >= 2 && parts.length % 2 === 0 &&
    parts[parts.length - 2] === 'matches' && parts.every(Boolean);
}

function cursorKeyBytes(cursorKey) {
  if (!Buffer.isBuffer(cursorKey) || cursorKey.length !== 32) throw new Error('chave de cursor indisponível');
  return cursorKey;
}

function decodeCursor(cursor, targetUid, cursorKey) {
  if (cursor == null || cursor === '') return null;
  if (typeof cursor !== 'string' || cursor.length > 2048) throw new Error('cursor inválido');
  let payload;
  try {
    const raw = Buffer.from(cursor, 'base64url');
    if (raw.length < 29) throw new Error('cursor inválido');
    const decipher = crypto.createDecipheriv('aes-256-gcm', cursorKeyBytes(cursorKey), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    payload = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
  }
  catch (_) { throw new Error('cursor inválido'); }
  if (!payload || payload.v !== 1 || payload.uid !== targetUid || !cursorPath(payload.path)) {
    throw new Error('cursor inválido');
  }
  return payload.path;
}

function encodeCursor(path, targetUid, cursorKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', cursorKeyBytes(cursorKey), iv);
  const encoded = Buffer.concat([cipher.update(JSON.stringify({ v: 1, uid: targetUid, path }), 'utf8'),
    cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encoded]).toString('base64url');
}

// Somente leitura. A consulta é limitada por candidatos, não por itens visíveis:
// uma página sem itens pode ter cursor e jamais significa fim por si só.
async function readResultHistoryPage({ db, fieldPath, callerUid, targetUid, cursor, cursorKey }) {
  if (!db || !fieldPath || typeof fieldPath.documentId !== 'function') throw new Error('dependência inválida');
  if (typeof callerUid !== 'string' || !callerUid) throw new Error('autenticação obrigatória');
  if (typeof targetUid !== 'string' || !targetUid || targetUid.length > 128) throw new Error('uid inválido');
  cursorKeyBytes(cursorKey);
  const afterPath = decodeCursor(cursor, targetUid, cursorKey);
  let query = db.collectionGroup('matches')
    .where('playerUids', 'array-contains', targetUid)
    .orderBy(fieldPath.documentId());
  if (afterPath) query = query.startAfter(db.doc(afterPath));
  query = query.limit(PAGE_SIZE);

  const candidates = await db.runTransaction(async tx => {
    const found = await tx.get(query);
    const docs = found.docs || [];
    const rootIds = [...new Set(docs.map(doc => resultPath(doc.ref.path)).filter(Boolean))];
    const roots = new Map();
    await Promise.all(rootIds.map(async id => {
      const root = await tx.get(db.collection('tournaments').doc(id));
      roots.set(id, root.exists ? root.data() || {} : null);
    }));
    return { docs, roots };
  }, { readOnly: true });

  // Uma segunda leitura elimina a resposta com raiz que mudou após a transação.
  // A paginação jamais usa o conteúdo dessas raízes no cursor.
  const candidateIds = [...new Set(candidates.docs.map(doc => resultPath(doc.ref.path)).filter(Boolean))];
  const freshRoots = new Map();
  await Promise.all(candidateIds.map(async id => {
    const root = await db.collection('tournaments').doc(id).get();
    freshRoots.set(id, root.exists ? root.data() || {} : null);
  }));
  const items = [];
  for (const doc of candidates.docs) {
    const tournamentId = resultPath(doc.ref.path);
    if (!tournamentId) continue;
    if (!canReadTournamentData(candidates.roots.get(tournamentId), callerUid) ||
        !canReadTournamentData(freshRoots.get(tournamentId), callerUid)) continue;
    const physical = doc.data() || {};
    const game = physical.jogo;
    const embeddedId = game && game.id;
    const hasEmbeddedId = embeddedId != null && String(embeddedId) !== '';
    if (!game || typeof game !== 'object' || Array.isArray(game) ||
        (hasEmbeddedId && !((typeof embeddedId === 'string' ||
          (typeof embeddedId === 'number' && Number.isFinite(embeddedId))) &&
          String(embeddedId) === doc.id)) ||
        (physical._chave != null && (typeof physical._chave !== 'string' || physical._chave !== doc.id)) ||
        !Array.isArray(physical.playerUids) || !physical.playerUids.includes(targetUid)) {
      throw new Error('jogo canônico inválido');
    }
    const root = freshRoots.get(tournamentId);
    const changed = doc.updateTime && typeof doc.updateTime.toDate === 'function'
      ? doc.updateTime.toDate().toISOString() : null;
    items.push({ ...game, id: doc.id, matchId: doc.id, tournamentId,
      playerUids: physical.playerUids,
      tournamentName: root.name || '', sport: root.sport || '',
      venue: root.venue || '', format: root.format || '',
      roundLabel: game.label || game.roundName || '',
      updatedAt: game.updatedAt || game.resultAt || game.startedAt || changed });
  }
  const last = candidates.docs[candidates.docs.length - 1];
  return {
    items,
    cursor: last && candidates.docs.length === PAGE_SIZE ? encodeCursor(last.ref.path, targetUid, cursorKey) : null
  };
}

module.exports = { PAGE_SIZE, resultPath, decodeCursor, readResultHistoryPage };
