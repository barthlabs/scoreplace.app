'use strict';

const agenda = require('./agenda-core');

function civilDay(instant, timeZone) {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime()) || !timeZone) throw new Error('Data ou fuso do torneio indisponível');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const part = type => (parts.find(item => item.type === type) || {}).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

async function operationDay(tournament, tx, db, instant) {
  let resolved = agenda.resolverFuso(tournament, null);
  if (!resolved.tz) {
    const uid = tournament && (tournament.creatorUid || tournament.organizerUid);
    if (uid) {
      const profile = await tx.get(db.collection('users').doc(String(uid)));
      if (profile.exists) resolved = agenda.resolverFuso(tournament, profile.data() || {});
    }
  }
  if (!resolved.tz) throw new Error('Fuso do torneio indisponível; operação suspensa');
  return civilDay(instant, resolved.tz);
}

module.exports = { civilDay, operationDay };
