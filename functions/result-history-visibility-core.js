'use strict';

// Espelho semântico de firestore.rules:canReadTournamentData, testado contra
// as Rules no emulador. A callable exige autenticação separadamente: a regra
// aninhada também permite a leitura anônima de resultados de torneio público.
function canReadTournamentData(data, callerUid) {
  if (!data || typeof data !== 'object') return false;
  const uid = typeof callerUid === 'string' && callerUid ? callerUid : null;
  const hasUid = (value) => uid !== null && Array.isArray(value) && value.includes(uid);
  const admin = uid !== null && (
    (typeof data.creatorUid === 'string' && data.creatorUid === uid) ||
    (Array.isArray(data.adminUids) && hasUid(data.adminUids))
  );
  const referee = data.isSandbox !== true && hasUid(data.refereeUids);
  const participant = hasUid(data.memberUids);
  if (data.organizerOnly === true) return admin || referee;
  if (data.membersOnly === true) return admin || participant || referee;
  if (data.isSandbox === true) return participant;
  return data.isPublic === true || uid !== null;
}

module.exports = { canReadTournamentData };
