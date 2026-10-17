'use strict';

// O roster canônico nasce de registrations. Time e dia são resultado do sorteio,
// portanto vivem em mapa separado por identidade estável da dupla, nunca no
// espelho histórico participants que a fronteira de escrita descarta.
function snapshot(participants) {
  const entries = (Array.isArray(participants) ? participants : []).filter(entry => entry && entry.isPlaceholder !== true);
  const seen = new Set();
  return entries.map(entry => {
    const fixedPairId = String(entry.fixedPairId || '');
    const categoryId = String(entry.categoryId || '');
    const competitionTeamId = String(entry.competitionTeamId || '');
    if (!fixedPairId || !categoryId || !competitionTeamId || seen.has(fixedPairId)) {
      throw new Error('[competition-assignment] dupla sem identidade/time ou repetida');
    }
    seen.add(fixedPairId);
    return {
      fixedPairId, categoryId, competitionTeamId,
      competitionTeamHue:Number(entry.competitionTeamHue) || 0,
      competitionTeamSaturation:Number(entry.competitionTeamSaturation) || 0,
      competitionTeamColor:String(entry.competitionTeamColor || ''),
      competitionPlayDay:String(entry.competitionPlayDay || '')
    };
  });
}

function overlay(participants, assignments) {
  const map = new Map();
  (Array.isArray(assignments) ? assignments : []).forEach(item => {
    if (item && item.fixedPairId && !map.has(String(item.fixedPairId))) map.set(String(item.fixedPairId), item);
  });
  return (Array.isArray(participants) ? participants : []).map(entry => {
    const item = entry && map.get(String(entry.fixedPairId || ''));
    // Uma dupla desfeita, refeita ou reclassificada continua sendo definida
    // somente pelos registros atuais. O mapa antigo não a cria nem a move.
    if (!item || String(item.categoryId || '') !== String(entry.categoryId || '')) return entry;
    return Object.assign({}, entry, {
      competitionTeamId:String(item.competitionTeamId || ''),
      competitionTeamHue:Number(item.competitionTeamHue) || 0,
      competitionTeamSaturation:Number(item.competitionTeamSaturation) || 0,
      competitionTeamColor:String(item.competitionTeamColor || ''),
      ...(item.competitionPlayDay ? { competitionPlayDay:String(item.competitionPlayDay) } : {})
    });
  });
}

module.exports = { snapshot, overlay };
