'use strict';

// Reparo pontual, reversível por restauração do documento de resumo.
// Sem --apply apenas lê. Nunca altera o torneio nem suas inscrições.
const admin = require('../functions/node_modules/firebase-admin');
const { canonicalCounts } = require('../functions-autodraw/tournament-summary-core');

const TOURNAMENT_ID = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const EXPECTED = { people: 128, teams: 64 };
const apply = process.argv.includes('--apply');
if (process.argv.some((arg, index) => index > 1 && arg !== '--apply')) {
  throw new Error('Uso: node scripts/repair-neon-summary.js [--apply]');
}
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'scoreplace-app' });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(TOURNAMENT_ID);
const summaryRef = db.collection('tournaments_summary').doc(TOURNAMENT_ID);

async function inspect(tx) {
  const root = await tx.get(ref);
  if (!root.exists || String(root.data().name || '') !== 'NEON NIGHTMARE – THE TOURNAMENT') {
    throw new Error('identidade do torneio não corresponde ao Neon esperado');
  }
  const receipt = root.data().canonicalRegistrationMigration || {};
  if (!receipt.fingerprint || receipt.registrationCount !== EXPECTED.people) {
    throw new Error('recibo canônico não confirma 128 inscrições');
  }
  const registrations = await tx.get(ref.collection('registrations').limit(EXPECTED.people + 1));
  const counts = canonicalCounts(registrations.docs.map((doc) => doc.data()), EXPECTED.people);
  if (counts.people !== EXPECTED.people || counts.teams !== EXPECTED.teams) {
    throw new Error('elenco real não confirma 128 inscritos e 64 duplas');
  }
  const summary = await tx.get(summaryRef);
  if (!summary.exists || summary.data()._resumo !== true) throw new Error('resumo existente inválido');
  return { counts, current: summary.data() };
}

(async () => {
  if (!apply) {
    const state = await db.runTransaction(inspect, { readOnly: true });
    console.log(JSON.stringify({ mode: 'dry-run', id: TOURNAMENT_ID, canonical: state.counts,
      summary: { participantsCount: state.current.participantsCount,
        competitorsCount: state.current.competitorsCount, teamsCount: state.current.teamsCount } }, null, 2));
    return;
  }
  await db.runTransaction(async (tx) => {
    const state = await inspect(tx);
    if (state.current.participantsCount === EXPECTED.people &&
        state.current.competitorsCount === EXPECTED.people &&
        state.current.teamsCount === EXPECTED.teams) return;
    tx.update(summaryRef, {
      participantsCount: EXPECTED.people,
      competitorsCount: EXPECTED.people,
      teamsCount: EXPECTED.teams,
    });
  });
  const finalSummary = (await summaryRef.get()).data();
  if (finalSummary.participantsCount !== EXPECTED.people ||
      finalSummary.competitorsCount !== EXPECTED.people ||
      finalSummary.teamsCount !== EXPECTED.teams) throw new Error('pós-leitura divergiu');
  console.log(JSON.stringify({ mode: 'applied-and-verified', id: TOURNAMENT_ID,
    participantsCount: finalSummary.participantsCount,
    competitorsCount: finalSummary.competitorsCount, teamsCount: finalSummary.teamsCount }, null, 2));
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
