#!/usr/bin/env node
/* congelar-original.js — congela o documento ORIGINAL, lido do PASSADO do banco.
 *
 * ⛔ POR QUE NÃO CONGELAR O ESTADO DE AGORA (a razão é do dono, 26/ago):
 *   _"se vc cagou em algo na transferencia e nao temos mais os dados originais,
 *     a cagada se propaga no backup"_.
 * Ele está certo, e é um erro que backup nenhum resolve depois: um snapshot tirado DEPOIS
 * de uma alteração errada guarda a alteração errada com cara de original. Backup não
 * valida nada — ele só congela o que já estava lá.
 *
 * ⭐ A SAÍDA NÃO DEPENDE DE MIM. O Firestore está com Point-In-Time Recovery LIGADO
 * (conferido: `POINT_IN_TIME_RECOVERY_ENABLED`, versão mais antiga 22/ago/2026). Dá pra
 * ler o banco como ele era num instante escolhido, e essa leitura não passa por nenhum
 * código meu. É a única fonte de "original" que continua confiável mesmo que eu tenha
 * errado. ⚠️ A janela é de 7 dias — depois disso essa porta fecha.
 *
 * ⚠️ E ISTO NÃO É UM "DESFAZER": voltar o documento pra esse instante também desfaria a
 * atividade REAL do torneio no meio (placar lançado, inscrito que entrou). O congelado
 * serve pra CONFERIR e pra recuperar campo específico — não pra sobrescrever o vivo.
 *
 * Uso:  node scripts/congelar-original.js <id> <instanteISO>             # em seco
 *       node scripts/congelar-original.js <id> <instanteISO> --aplicar
 *   ex: node scripts/congelar-original.js tour_1780009816637 2026-08-26T03:00:00Z --aplicar
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = process.argv.indexOf('--aplicar') !== -1;
const ID = process.argv[2];
const QUANDO = process.argv[3];
const kb = (v) => (Buffer.byteLength(JSON.stringify(v) || '', 'utf8') / 1024).toFixed(1) + ' KB';
const morre = (m) => { console.error('\n⛔ ' + m); process.exit(1); };

(async () => {
  if (!ID || !QUANDO || ID.startsWith('--')) {
    morre('uso: node scripts/congelar-original.js <id> <instanteISO> [--aplicar]');
  }
  const quando = new Date(QUANDO);
  if (isNaN(+quando)) morre('instante inválido: ' + QUANDO);
  const limite = Date.now() - 6.5 * 24 * 3600 * 1000;
  if (+quando < limite) morre('esse instante já saiu da janela de 7 dias do PITR');

  const ref = db.collection('tournaments').doc(String(ID));
  let antigo;
  try {
    antigo = await db.runTransaction(async (tx) => (await tx.get(ref)).data(),
      { readOnly: true, readTime: admin.firestore.Timestamp.fromDate(quando) });
  } catch (e) { morre('não consegui ler o passado: ' + ((e && e.message) || e)); }
  if (!antigo) morre('o torneio não existia nesse instante');

  const jogos = [];
  (antigo.rounds || []).forEach((r) => (r.matches || []).forEach((m) => m && jogos.push(m)));
  (antigo.matches || []).forEach((m) => m && jogos.push(m));
  const comPlacar = jogos.filter((m) => m && (m.winner || m.sets || m.scoreP1 != null)).length;

  console.log('═══ ' + (antigo.name || ID) + '   @ ' + quando.toISOString());
  console.log('  peso ..................... ' + kb(antigo));
  console.log('  jogos .................... ' + jogos.length + '  (com placar: ' + comPlacar + ')');
  console.log('  inscritos ................ ' + ((antigo.participants || []).length));
  console.log('  histórico ................ ' + ((antigo.history || []).length));
  if (!APLICAR) { console.log('\n(em seco — nada gravado; rode com --aplicar)'); process.exit(0); }

  const bref = db.collection('tournaments_backup').doc(String(ID));
  await bref.set({
    doc: antigo,
    origem: 'PITR ' + quando.toISOString(),
    motivo: 'original congelado ANTES de qualquer transferência (ordem do dono)',
    em: new Date().toISOString(),
    jogos: jogos.length, comPlacar: comPlacar,
    inscritos: (antigo.participants || []).length,
    historico: (antigo.history || []).length
  });
  // ⛔ conferir RELENDO: gravar e acreditar é o mesmo erro de novo, um andar acima.
  const volta = (await bref.get()).data() || {};
  if (JSON.stringify(volta.doc) !== JSON.stringify(antigo)) {
    morre('o backup releu DIFERENTE do que foi lido do passado — não confie nele.');
  }
  console.log('  ✓ congelado em tournaments_backup/' + ID + ' e CONFERIDO relendo');
  console.log('  ⛔ inerte: a regra nega leitura e escrita pro cliente. Só o dono manda apagar.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
