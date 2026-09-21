'use strict';

/* Projeção que a Análise de inscritos realmente consome.
 *
 * A análise é uma ferramenta da organização. Ainda assim, o navegador não
 * precisa receber a ficha privada: estes são os mesmos campos presentes no
 * espelho público, escolhidos explicitamente para nome, foto, classificação,
 * idade e letzplay. E-mail nunca atravessa esta fronteira.
 */
const CAMPOS_ANALISE = [
  'displayName', 'displayName_lower', 'photoURL', 'gender', 'birthDate',
  'skillBySport', 'defaultCategory', 'letzplayHandle', 'mergedInto',
];

function perfilDaAnalise(profile) {
  const source = profile || {};
  const out = {};
  CAMPOS_ANALISE.forEach((field) => {
    if (source[field] !== undefined && source[field] !== null) out[field] = source[field];
  });
  return out;
}

function entradasDoRelatorio(tournament) {
  const out = [];
  const add = (entry) => {
    if (!entry || typeof entry !== 'object') return;
    if (entry.p1Name && entry.p2Name) {
      out.push({ uid: entry.p1Uid || '', name: entry.p1Name || '' });
      out.push({ uid: entry.p2Uid || '', name: entry.p2Name || '' });
      return;
    }
    out.push({ uid: entry.uid || '', name: entry.displayName || entry.name || '' });
  };
  ['participants', 'standbyParticipants', 'waitlist'].forEach((field) => {
    const entries = tournament && tournament[field];
    (Array.isArray(entries) ? entries : []).forEach(add);
  });
  const monarch = tournament && tournament.monarchWaitlist;
  if (monarch && typeof monarch === 'object') {
    Object.keys(monarch).forEach((key) => {
      const entries = Array.isArray(monarch[key]) ? monarch[key] : [];
      entries.forEach(add);
    });
  }
  return out;
}

function pertenceAoRelatorio(entries, candidate) {
  const uid = String(candidate && candidate.uid || '').trim();
  return !!uid && entries.some((entry) => String(entry.uid || '').trim() === uid);
}

module.exports = { CAMPOS_ANALISE, perfilDaAnalise, entradasDoRelatorio, pertenceAoRelatorio };
