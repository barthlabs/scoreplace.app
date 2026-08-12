/* PONTA A PONTA do gatilho purgeTournamentCopies — roda DENTRO do emulador.
 *   npm run test:purge   (sobe Firestore + Functions via emulators:exec e chama isto)
 *
 * POR QUE ESTE TESTE EXISTE, e por que ele não podia ser unitário:
 * o `functions/test-tournament-purge-core.js` prova a REGRA (quais caminhos apagar) e a
 * FIAÇÃO (o gatilho existe e usa o módulo). Nenhum dos dois prova a I/O: que o
 * `onDocumentDeleted` realmente dispara, que a consulta de collection group acha o
 * registro de quem saiu do torneio, e — o que mais importa — que a limpeza **não passa do
 * alvo**. Isto aqui apaga um torneio de verdade num Firestore de verdade e confere.
 *
 * ⚠️ O QUE ESTE TESTE **NÃO** PROVA: o emulador do Firestore **não exige índice**, então a
 * varredura passa aqui mesmo sem o `fieldOverride` de `matchHistory/tournamentId` estar no
 * ar. Em produção, sem o índice a varredura falha com FAILED_PRECONDITION (e só a rota por
 * referência sobra). Por isso o índice vai ANTES no deploy — e há asserção no teste
 * unitário exigindo que ele esteja declarado.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-scoreplace';
admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TID = 'tour_purge_alvo';
const OUTRO = 'tour_purge_controle';

/* Torneio-alvo. `u-bruno` é o caso que obriga a varredura: levou W.O., foi substituído por
 * `u-espera` e por isso NÃO aparece mais em lugar nenhum do doc — mas o registro do jogo
 * que ele jogou antes continua no matchHistory dele. */
const alvo = {
  id: TID,
  name: 'Torneio a apagar',
  participants: [{ uid: 'u-ana' }, { p1Uid: 'u-caio', p2Uid: 'u-dani' }, { uid: 'u-espera' }],
  memberUids: ['u-ana', 'u-caio', 'u-dani', 'u-espera'],
  rounds: [{ matches: [
    { id: 'm1', team1Uids: ['u-ana'], team2Uids: ['u-espera'] },
    { id: 'm2', team1Uids: ['u-caio', 'u-dani'], team2Uids: ['u-ana'] }
  ] }]
};

const reg = (tid, matchId, uids) => ({
  matchId: 't_' + tid + '_' + matchId,
  matchType: 'tournament',
  tournamentId: tid,
  tournamentName: 'x',
  playerUids: uids,
  finishedAt: '2026-08-01T12:00:00.000Z'
});

async function existe(ref) { return (await ref.get()).exists; }
const mh = (uid, rid) => db.collection('users').doc(uid).collection('matchHistory').doc(rid);

(async () => {
  console.log('──── purgeTournamentCopies · ponta a ponta no emulador ────');

  // ── SEMEIA ────────────────────────────────────────────────────────────────
  await db.collection('tournaments').doc(TID).set(alvo);
  await db.collection('tournaments').doc(OUTRO).set({ id: OUTRO, name: 'Fica de pé', participants: [{ uid: 'u-ana' }] });

  // Cópias do torneio-alvo, inclusive a do substituído por W.O.
  await mh('u-ana',    't_' + TID + '_m1').set(reg(TID, 'm1', ['u-ana', 'u-espera']));
  await mh('u-espera', 't_' + TID + '_m1').set(reg(TID, 'm1', ['u-ana', 'u-espera']));
  await mh('u-caio',   't_' + TID + '_m2').set(reg(TID, 'm2', ['u-caio', 'u-dani', 'u-ana']));
  await mh('u-dani',   't_' + TID + '_m2').set(reg(TID, 'm2', ['u-caio', 'u-dani', 'u-ana']));
  await mh('u-bruno',  't_' + TID + '_m1').set(reg(TID, 'm1', ['u-ana', 'u-bruno'])); // saiu por W.O.

  // CONTROLES — nada disto pode ser tocado.
  await mh('u-ana', 't_' + OUTRO + '_m1').set(reg(OUTRO, 'm1', ['u-ana']));
  await mh('u-ana', 'casual_123').set({
    matchId: 'casual_123', matchType: 'casual', tournamentId: null,
    playerUids: ['u-ana'], finishedAt: '2026-08-02T12:00:00.000Z'
  });

  // Espelho do roster (a subcoleção CF-only).
  for (const u of ['u-ana', 'u-caio', 'u-dani', 'u-espera']) {
    await db.collection('tournaments').doc(TID).collection('participants').doc(u)
      .set({ uid: u, status: 'enrolled' });
  }
  await db.collection('tournaments').doc(OUTRO).collection('participants').doc('u-ana')
    .set({ uid: 'u-ana', status: 'enrolled' });

  // Confere o estado inicial (senão um "sumiu" pode ser "nunca existiu").
  ok(await existe(mh('u-ana', 't_' + TID + '_m1')), 'semeado: cópia de u-ana existe ANTES');
  ok(await existe(mh('u-bruno', 't_' + TID + '_m1')), 'semeado: cópia do substituído por W.O. existe ANTES');
  const antes = await db.collection('tournaments').doc(TID).collection('participants').get();
  ok(antes.size === 4, 'semeado: 4 docs no espelho do roster ANTES (veio ' + antes.size + ')');

  // ── APAGA O TORNEIO ───────────────────────────────────────────────────────
  console.log('\n  … apagando o torneio e esperando o gatilho\n');
  await db.collection('tournaments').doc(TID).delete();

  // O gatilho é assíncrono: espera a cópia principal sumir, com teto.
  let esperou = 0;
  while (esperou < 60000) {
    if (!(await existe(mh('u-ana', 't_' + TID + '_m1')))) break;
    await sleep(1000); esperou += 1000;
  }
  await sleep(3000);   // folga pra varredura + subcoleção terminarem
  console.log('  (gatilho respondeu em ~' + (esperou / 1000) + 's)\n');

  // ── O QUE TINHA QUE SUMIR ─────────────────────────────────────────────────
  ok(!(await existe(mh('u-ana',    't_' + TID + '_m1'))), 'cópia de u-ana SUMIU');
  ok(!(await existe(mh('u-espera', 't_' + TID + '_m1'))), 'cópia de u-espera SUMIU');
  ok(!(await existe(mh('u-caio',   't_' + TID + '_m2'))), 'cópia de u-caio SUMIU');
  ok(!(await existe(mh('u-dani',   't_' + TID + '_m2'))), 'cópia de u-dani SUMIU');
  ok(!(await existe(mh('u-bruno',  't_' + TID + '_m1'))),
     'cópia do SUBSTITUÍDO POR W.O. sumiu — é a varredura funcionando (a referência não o via)');

  const depois = await db.collection('tournaments').doc(TID).collection('participants').get();
  ok(depois.size === 0, 'espelho do roster SUMIU (sobrou ' + depois.size + ')');

  // ── O QUE NÃO PODIA SER TOCADO ────────────────────────────────────────────
  ok(await existe(mh('u-ana', 't_' + OUTRO + '_m1')),
     'cópia de OUTRO torneio da mesma pessoa ficou intacta');
  ok(await existe(mh('u-ana', 'casual_123')),
     'partida CASUAL da mesma pessoa ficou intacta');
  const ctrl = await db.collection('tournaments').doc(OUTRO).collection('participants').get();
  ok(ctrl.size === 1, 'espelho do roster do outro torneio intacto (' + ctrl.size + ')');
  ok(await existe(db.collection('tournaments').doc(OUTRO)), 'o outro torneio segue existindo');

  // ── IDEMPOTÊNCIA: apagar de novo não estoura ─────────────────────────────
  await db.collection('tournaments').doc(TID).set(alvo);
  await sleep(500);
  await db.collection('tournaments').doc(TID).delete();
  await sleep(4000);
  ok(await existe(mh('u-ana', 't_' + OUTRO + '_m1')), 'segunda passada não derrubou o controle');

  console.log(`\n  ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO RUNNER:', e); process.exit(1); });
