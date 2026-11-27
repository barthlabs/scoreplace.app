'use strict';

const { canReadTournamentData } = require('./result-history-visibility-core');
const testMode = require('./test-mode-core');

function append(events, event) {
  const prior = Array.isArray(events) ? events : [];
  if (prior.some(item => item.id === event.id)) return prior;
  if (!['substitution','spelling','rename'].includes(event.kind) ||
      !event.id || !event.fromName || !event.toName || !event.at) {
    throw new Error('Alteração do elenco inválida.');
  }
  // A consulta conserva os 200 eventos mais recentes sem bloquear novas edições.
  return prior.concat(event).slice(-200);
}

function makeService({ db, HttpsError }) {
  return {
    async list(request) {
      if (request.rawRequest?.res?.setHeader) request.rawRequest.res.setHeader('Cache-Control', 'no-store');
      const id = String(request.data?.tournamentId || '');
      const uid = request.auth?.uid || null;
      if (!/^tour_[0-9]{13}_[a-f0-9]{32}$/.test(id)) throw new HttpsError('not-found', 'Histórico não encontrado.');
      const [tournament, history] = await Promise.all([
        db.collection('tournaments').doc(id).get(),
        db.collection('tournamentRosterHistory').doc(id).get()
      ]);
      const t = tournament.exists ? tournament.data() : null;
      if (!t || !testMode.canAccess(t, uid) || !canReadTournamentData(t, uid)) {
        throw new HttpsError('not-found', 'Histórico não encontrado.');
      }
      return { events: history.exists && Array.isArray(history.data()?.events)
        ? history.data().events.map(({ id, kind, fromName, toName, group, category, at }) =>
          ({ id, kind, fromName, toName, group, category, at })) : [] };
    }
  };
}

module.exports = { append, makeService };
