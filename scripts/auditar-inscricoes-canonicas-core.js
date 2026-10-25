'use strict';

// O mesmo marcador truthy das portas de produção decide a autoridade. Não
// fazer trim: um recibo presente, porém inválido, deve falhar na validação
// canônica em vez de cair silenciosamente na fotografia legada.
function routeFor(tournament) {
  return tournament && tournament.canonicalRegistrationMigration &&
    tournament.canonicalRegistrationMigration.fingerprint ? 'canonical' : 'legacy';
}

// O GET do Firestore chega como mapa pela chave física. Preservar a chave até
// conferir o campo estrutural antes de passar o array à fronteira existente.
function canonicalDocuments(byId) {
  return Object.entries(byId || {}).map(([physicalId, document]) => {
    if (!document || document.registrationId !== physicalId) {
      throw new Error('ID físico de inscrição canônica divergente');
    }
    return document;
  });
}

module.exports = { routeFor, canonicalDocuments };
