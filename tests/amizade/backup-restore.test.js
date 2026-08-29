/* BACKUP → DESTRUIÇÃO → RESTORE — teste FUNCIONAL dos scripts reais (5ª auditoria, ponto 2).
 * Roda dentro de: npm run test:amizade
 *
 * ⛔ O QUE ISTO TRAVA: o cutover mandava usar `backup-torneios.js` antes da Etapa B — script
 * que salva TORNEIOS e não toca em `users/`. O rollback documentado era falso: o backfill
 * reescreve os quatro campos de cache de todos os perfis e não havia de onde restaurar.
 * Aqui os scripts REAIS rodam contra o emulador e a igualdade é conferida no banco.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));

const db = admin.firestore();
const ROOT = path.join(__dirname, '..', '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

const A = 'uidBKPa000000000000000000001';
const B = 'uidBKPb000000000000000000002';
const C = 'uidBKPc000000000000000000003';

function rodarArgs(extra) {
  return spawnSync('node', [path.join(ROOT, 'scripts', 'backfill-amizade.js')].concat(extra || []), {
    cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, {
      SP_PROJECT: process.env.GCLOUD_PROJECT || 'demo-scoreplace',
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8082',
    }),
  });
}
function rodar(script, args) {
  return spawnSync('node', [path.join(ROOT, 'scripts', script)].concat(args || []), {
    cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, {
      SP_PROJECT: process.env.GCLOUD_PROJECT || 'demo-scoreplace',
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8082',
    }),
  });
}
const ler = async (uid) => { const d = await db.collection('users').doc(uid).get(); return d.exists ? (d.data() || {}) : null; };

module.exports = (async () => {
  for (const col of ['friendships', 'users']) {
    const s = await db.collection(col).get(); const b = db.batch(); s.forEach((d) => b.delete(d.ref)); await b.commit();
  }
  const acc0 = await db.collectionGroup('accepted').get();
  const b0 = db.batch(); acc0.forEach((d) => b0.delete(d.ref)); await b0.commit();

  // A: tem os quatro campos · B: array VAZIO (≠ ausente) · C: campos AUSENTES
  await db.collection('users').doc(A).set({
    displayName: 'A', friends: [B], friendRequestsSent: [C],
    friendRequestsReceived: [], friendRequestsSentAt: { [C]: '2026-01-01' } });
  await db.collection('users').doc(B).set({ displayName: 'B', friends: [] });
  await db.collection('users').doc(C).set({ displayName: 'C' });
  await db.collection('friendships').doc('rel_pre').set({ uidA: A, uidB: B, status: 'legacy_unverified', requestedBy: A, createdAt: 't0', acceptedAt: null });

  // ── BACKUP ────────────────────────────────────────────────────────────────
  const arq = path.join(os.tmpdir(), 'bkp-amizade-' + process.pid + '.json');
  let r = rodar('backup-amizade-legado.js', ['--saida=' + arq]);
  ok(r.status === 0, 'backup roda (exit ' + r.status + ')');
  ok(fs.existsSync(arq), 'e grava o arquivo');
  const bkp = JSON.parse(fs.readFileSync(arq, 'utf8'));
  ok(bkp._meta && bkp._meta.hash && bkp._meta.projeto && bkp._meta.geradoEm && bkp._meta.perfis === 3,
    'com metadados: projeto, data, contagem e hash');
  ok(bkp.dados.perfis[C].friends === null,
    '⛔ campo AUSENTE é gravado como null — distinto de array vazio');
  ok(Array.isArray(bkp.dados.perfis[B].friends) && bkp.dados.perfis[B].friends.length === 0,
    'e array VAZIO é gravado como []');
  ok(bkp.dados.relacoes.rel_pre, 'friendships existentes também entram na foto');

  // ── DESTRUIÇÃO ────────────────────────────────────────────────────────────
  await db.collection('users').doc(A).update({ friends: ['INVASOR'], friendRequestsSent: [], friendRequestsSentAt: {} });
  await db.collection('users').doc(C).update({ friends: ['LIXO'] });          // campo que NÃO existia
  await db.collection('users').doc(B).update({ friends: admin.firestore.FieldValue.delete() });
  await db.collection('friendships').doc('rel_pre').delete();
  await db.collection('friendships').doc('rel_nova').set({ uidA: A, uidB: C, status: 'accepted', requestedBy: A, createdAt: 't1', acceptedAt: 't1' });
  await db.collection('friendAccess').doc(A).collection('accepted').doc(C).set({ since: 't1' });

  // ── DRY-RUN não escreve ───────────────────────────────────────────────────
  r = rodar('restore-amizade-legado.js', [arq]);
  ok(r.status === 0, 'restore dry-run roda (exit ' + r.status + ')');
  ok((await ler(A)).friends[0] === 'INVASOR', '⛔ e o dry-run NÃO escreveu nada');

  // ── projeto errado aborta ─────────────────────────────────────────────────
  const arqOutro = path.join(os.tmpdir(), 'bkp-outro-' + process.pid + '.json');
  const clone = JSON.parse(JSON.stringify(bkp)); clone._meta.projeto = 'outro-projeto';
  fs.writeFileSync(arqOutro, JSON.stringify(clone));
  r = rodar('restore-amizade-legado.js', [arqOutro, '--aplicar']);
  ok(r.status !== 0 && /projeto/.test(r.stdout + r.stderr), '⛔ backup de OUTRO projeto é recusado');

  // ── hash adulterado aborta ────────────────────────────────────────────────
  const arqMex = path.join(os.tmpdir(), 'bkp-mex-' + process.pid + '.json');
  const mex = JSON.parse(JSON.stringify(bkp)); mex.dados.perfis[A].friends = ['FORJADO'];
  fs.writeFileSync(arqMex, JSON.stringify(mex));
  r = rodar('restore-amizade-legado.js', [arqMex, '--aplicar']);
  ok(r.status !== 0 && /hash/.test(r.stdout + r.stderr), '⛔ arquivo adulterado é recusado pelo hash');

  // ── RESTORE de verdade ────────────────────────────────────────────────────
  r = rodar('restore-amizade-legado.js', [arq, '--aplicar']);
  ok(r.status === 0, 'restore --aplicar roda (exit ' + r.status + ')');

  const a2 = await ler(A), b2 = await ler(B), c2 = await ler(C);
  ok(JSON.stringify(a2.friends) === JSON.stringify([B]), 'A.friends voltou ao valor exato');
  ok(JSON.stringify(a2.friendRequestsSent) === JSON.stringify([C]), 'A.friendRequestsSent voltou');
  ok(a2.friendRequestsSentAt && a2.friendRequestsSentAt[C] === '2026-01-01', 'e o mapa de carimbos também');
  ok(Array.isArray(b2.friends) && b2.friends.length === 0,
    '⛔ B.friends volta como array VAZIO (não como ausente)');
  ok(!Object.prototype.hasOwnProperty.call(c2, 'friends'),
    '⛔ C.friends volta a NÃO EXISTIR — o restore APAGA o campo que o backup não tinha');
  ok(a2.displayName === 'A', 'e nada fora dos quatro campos foi tocado');

  const rel = await db.collection('friendships').get();
  const ids = []; rel.forEach((d) => ids.push(d.id));
  ok(ids.length === 1 && ids[0] === 'rel_pre', '⛔ o backfill é DESFEITO: relação nova some, a original volta');
  const accDepois = await db.collectionGroup('accepted').get();
  let nAcc = 0; accDepois.forEach((d) => { const p = d.ref.parent.parent; if (p && p.parent && p.parent.id === 'friendAccess') nAcc++; });
  ok(nAcc === 0, '⛔ e a projeção criada depois do backup também some');

  // ══ O MARCADOR DA MIGRAÇÃO VOLTA JUNTO (6ª auditoria, ponto 7) ════════════
  /* ⛔ Restaurar os dados para o estado congelado deixando o marcador em `backfilled` é
   * ESTADO IMPOSSÍVEL: dados de antes do backfill com marcador de depois. E é o marcador
   * que decide se o backfill pode rodar — sem ele, a migração não podia ser refeita. */
  for (const col of ['friendships', 'users']) {
    const s2 = await db.collection(col).get(); const b2 = db.batch(); s2.forEach((d) => b2.delete(d.ref)); await b2.commit();
  }
  await db.collection('users').doc(A).set({ displayName: 'A', friends: [B] });
  await db.collection('users').doc(B).set({ displayName: 'B', friends: [A] });
  await db.doc('_meta/amizadeMigration').set({ fase: 'frozen', projeto: process.env.GCLOUD_PROJECT || 'demo-scoreplace' });

  const arq2 = path.join(os.tmpdir(), 'bkp-marcador-' + process.pid + '.json');
  r = rodar('backup-amizade-legado.js', ['--saida=' + arq2]);
  ok(r.status === 0, '[marcador] backup do estado FROZEN roda');
  const bkp2 = JSON.parse(fs.readFileSync(arq2, 'utf8'));
  ok(bkp2.dados.marcador && bkp2.dados.marcador.fase === 'frozen',
    '⛔ e a foto CARREGA a fase (frozen)');
  ok(bkp2._meta.faseMigracao === 'frozen', 'e ela aparece nos metadados');

  // simula o backfill tendo rodado + destruição
  await db.doc('_meta/amizadeMigration').set({ fase: 'backfilled' }, { merge: true });
  await db.collection('friendships').doc('rel_do_backfill').set({
    uidA: A, uidB: B, status: 'legacy_unverified', requestedBy: A, createdAt: 't2', acceptedAt: null });
  await db.collection('users').doc(A).update({ friends: [] });

  r = rodar('restore-amizade-legado.js', [arq2, '--aplicar']);
  ok(r.status === 0, '[marcador] restore roda (exit ' + r.status + ')');
  const fase = (await db.doc('_meta/amizadeMigration').get()).data().fase;
  ok(fase === 'frozen', '⛔ o MARCADOR volta pra frozen — não fica em estado impossível (got ' + fase + ')');
  ok((await db.collection('friendships').get()).size === 0, 'a relação do backfill some');
  ok(JSON.stringify(((await ler(A)) || {}).friends) === JSON.stringify([B]), 'e os dados voltam');

  // e com o marcador coerente, o backfill pode ser REFEITO
  const rr = rodarArgs(['--fase=backfilled', '--aplicar']);
  ok(rr.status === 0, '⭐ e a migração pode seguir de novo a partir de frozen (transição normal permitida)');

  // ══ preflight: produção com emulador ABORTA (ponto 14) ════════════════════
  const rp = spawnSync('node', [path.join(ROOT, 'scripts', 'backup-amizade-legado.js')], {
    cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, {
      SP_PROJECT: 'scoreplace-app',
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8082',
    }),
  });
  ok(rp.status !== 0 && /ABORTA/.test(rp.stdout + rp.stderr),
    '⛔ alvo PRODUÇÃO com FIRESTORE_EMULATOR_HOST definido ABORTA (nada de metadata mentindo)');

  console.log('\n  backup/restore: ' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
