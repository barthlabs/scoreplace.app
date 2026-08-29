/* ADJUDICAÇÃO DE E-MAIL LEGADO — teste FUNCIONAL do script real (4ª auditoria, ponto 2).
 * Roda dentro de: npm run test:amizade
 *
 * ⛔ O QUE ISTO TRAVA: uma quarentena de e-mail caía no adjudicador genérico, e um
 * `decisao:"aceitar"` montava o par com `afirmadoPor + ausenteEm` — onde `ausenteEm` é o
 * E-MAIL. Gravaria e-mail como uid dentro do cânone, e o id textual da quarentena
 * (`doc|campo|email`) viraria id de friendship.
 * Aqui o `scripts/backfill-amizade.js` REAL é executado contra o emulador, com quatro
 * arquivos de adjudicação. Os três primeiros têm que falhar SEM ESCREVER NADA.
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

const ANA = 'uidANAemail0000000000000000A';
const BIA = 'uidBIAemail0000000000000000B';
const DUP1 = 'uidDUP1email000000000000001';
const DUP2 = 'uidDUP2email000000000000002';

/** `rodar(adj)` = backfill --aplicar [--adjudicacao=adj]. `rodarArgs([...])` = args crus. */
function rodar(adjPath) {
  const args = ['--aplicar'];
  if (adjPath) args.push('--adjudicacao=' + adjPath);
  return rodarArgs(args);
}
function rodarArgs(extra) {
  const args = [path.join(ROOT, 'scripts', 'backfill-amizade.js')].concat(extra || []);
  return spawnSync('node', args, {
    cwd: ROOT, encoding: 'utf8',
    env: Object.assign({}, process.env, {
      SP_PROJECT: process.env.GCLOUD_PROJECT || 'demo-scoreplace',
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8082',
    }),
  });
}
let _nAdj = 0;
const escrever = (obj) => { const p = path.join(os.tmpdir(), 'adj-' + process.pid + '-' + (++_nAdj) + '.json'); fs.writeFileSync(p, JSON.stringify(obj)); return p; };
const contarRel = async () => (await db.collection('friendships').get()).size;

module.exports = (async () => {
  // limpa e semeia: ANA tem um E-MAIL solto em friends[]
  for (const col of ['friendships', 'users']) {
    const s = await db.collection(col).get(); const b = db.batch(); s.forEach((d) => b.delete(d.ref)); await b.commit();
  }
  /* ⚠️ o e-mail tem que ser AMBÍGUO pra cair em quarentena: desde a 6ª auditoria (ponto 8),
   * `email-sem-conta` é DESCARTE_PROVADO (não bloqueia) — só o que ainda pode ser alguém
   * exige adjudicação. `dup@x.com` bate em DUP1 e DUP2, as duas vivas. */
  await db.collection('users').doc(ANA).set({ displayName: 'Ana', email: 'ana@x.com', friends: ['dup@x.com'] });
  await db.collection('users').doc(BIA).set({ displayName: 'Bia', email: 'bia@x.com', friends: [] });
  await db.collection('users').doc(DUP1).set({ displayName: 'Dup1', email: 'dup@x.com', friends: [] });
  await db.collection('users').doc(DUP2).set({ displayName: 'Dup2', email: 'dup@x.com', friends: [] });
  // o backfill é one-shot: `--aplicar` só roda com a migração em `frozen`
  await db.doc('_meta/amizadeMigration').set({ fase: 'frozen', projeto: process.env.GCLOUD_PROJECT || 'demo-scoreplace' });

  const idQuar = ANA + '|friends|dup@x.com';

  // ── 1) e-mail SEM mapping, decisão "aceitar" sozinha ─────────────────────
  let r = rodar(escrever([{ id: idQuar, decisao: 'aceitar', porQue: 'quero' }]));
  ok(r.status !== 0, '[sem mapping] `aceitar` sozinha em quarentena de e-mail FALHA (exit ' + r.status + ')');
  ok(/resolverParaUid/.test(r.stdout + r.stderr), 'e a mensagem exige `resolverParaUid`');
  ok(await contarRel() === 0, '⛔ e NADA foi escrito');

  // ── 2) resolverParaUid é um E-MAIL ───────────────────────────────────────
  r = rodar(escrever([{ id: idQuar, decisao: 'aceitar', porQue: 'x', resolverParaUid: 'bia@x.com' }]));
  ok(r.status !== 0, '[uid=e-mail] recusado (exit ' + r.status + ')');
  ok(/é um e-mail, não um uid/.test(r.stdout + r.stderr), 'e diz por quê');
  ok(await contarRel() === 0, '⛔ nada escrito');

  // ── 3) resolverParaUid aponta pra uid INEXISTENTE ────────────────────────
  r = rodar(escrever([{ id: idQuar, decisao: 'aceitar', porQue: 'x', resolverParaUid: 'uidQUENAOEXISTE000000000000' }]));
  ok(r.status !== 0, '[uid inexistente] recusado (exit ' + r.status + ')');
  ok(/não existe em users/.test(r.stdout + r.stderr), 'e diz por quê');
  ok(await contarRel() === 0, '⛔ nada escrito');

  // ── 4) mapping VÁLIDO ────────────────────────────────────────────────────
  r = rodar(escrever([{ id: idQuar, decisao: 'aceitar', porQue: 'confirmado por telefone com as duas', resolverParaUid: BIA }]));
  ok(r.status === 0, '[mapping válido] aceito (exit ' + r.status + ')');
  const pares = await db.collection('friendships').get();
  const ids = []; pares.forEach((d) => ids.push(d.id));
  ok(ids.length === 1, 'uma relação criada — deu ' + ids.length);
  ok(ids[0] === [ANA, BIA].sort().join('__'),
    '⛔ o pairId foi RECALCULADO com os dois uids canônicos, não é o id textual da quarentena');
  ok(ids[0].indexOf('@') === -1, '⛔ e nenhum e-mail entrou no id do cânone');
  const d0 = pares.docs[0].data();
  ok(d0.uidA !== 'fantasma@x.com' && d0.uidB !== 'fantasma@x.com', 'nem nos campos uidA/uidB');
  ok(d0.adjudicado && d0.adjudicado.porQue, 'e a decisão fica registrada no doc, com motivo');

  // ══ ONE-SHOT: depois de LIVE o backfill RECUSA escrever (5ª auditoria, ponto 4) ══
  /* Rodar o backfill depois do go-live veria as amizades criadas pela autoridade nova como
   * "extras" — e `--apagar-stale` DESTRUIRIA estado legítimo. A fase é a trava mecânica. */
  const faseDepois = (await db.doc('_meta/amizadeMigration').get()).data().fase;
  ok(faseDepois === 'backfilled', 'depois de aplicar, a fase vira `backfilled` (got ' + faseDepois + ')');

  await db.doc('_meta/amizadeMigration').set({ fase: 'live' }, { merge: true });
  await db.collection('friendships').doc('rel_pos_golive').set({
    uidA: ANA, uidB: DUP1, status: 'accepted', requestedBy: ANA, createdAt: 't9', acceptedAt: 't9' });
  const antesLive = (await db.collection('friendships').get()).size;

  r = rodarArgs(['--adjudicacao=' + escrever([{ id: idQuar, decisao: 'descartar', porQue: 'x' }])]);
  // (sem --aplicar o dry-run pode rodar; o que não pode é escrever)
  r = rodarArgs(['--aplicar', '--adjudicacao=' + escrever([{ id: idQuar, decisao: 'descartar', porQue: 'x' }])]);
  ok(r.status !== 0, '⛔ backfill --aplicar depois de LIVE FALHA (exit ' + r.status + ')');
  ok(/one-shot|já está LIVE/.test(r.stdout + r.stderr), 'e diz que a migração é one-shot');
  ok((await db.collection('friendships').get()).size === antesLive,
    '⛔ e NADA em friendships foi alterado');

  r = rodarArgs(['--aplicar', '--apagar-stale']);
  ok(r.status !== 0, '⛔ --apagar-stale também não roda depois de LIVE (exit ' + r.status + ')');
  ok((await db.collection('friendships').get()).docs.some((d) => d.id === 'rel_pos_golive'),
    '⛔ a amizade criada DEPOIS do corte continua de pé — era o risco de destruição');

  // ══ LÁPIDE QUE NÃO RESOLVE também é IDENTIDADE (7ª auditoria, ponto 9) ════
  /* Antes só `email-*` exigia `resolverParaUid`. `lapide-nao-resolve` é identidade não
   * resolvida do mesmo jeito — aceitar com `ausenteEm` bruto gravaria um uid MORTO no
   * cânone. Monta uma corrente de lápide QUEBRADA: L aponta pra um doc que não existe. */
  await db.doc('_meta/amizadeMigration').set({ fase: 'frozen' }, { merge: true });
  for (const d of (await db.collection('friendships').get()).docs) await d.ref.delete();
  const LAP = 'uidLAPIDEquebrada0000000001';
  await db.collection('users').doc(LAP).set({ displayName: 'Lapide', mergedInto: 'uidQUENAOEXISTE000000000000' });
  /* ⚠️ limpa o CACHE de todos, não só as relações: a adjudicação válida do bloco anterior
   * reconstruiu `BIA.friends = [ANA]` a partir do cânone. Sobrando isso, o par ANA↔BIA
   * viraria uma segunda quarentena (unilateral) e o abort seria por outro motivo. */
  for (const u of [ANA, BIA, DUP1, DUP2]) {
    await db.collection('users').doc(u).update({ friends: [], friendRequestsSent: [], friendRequestsReceived: [] });
  }
  await db.collection('users').doc(ANA).update({ friends: [LAP] });

  const idLap = ANA + '|friends|' + LAP;
  let rl = rodarArgs(['--aplicar', '--adjudicacao=' + escrever([{ id: idLap, decisao: 'aceitar', porQue: 'x' }])]);
  ok(rl.status !== 0 && /IDENTIDADE/.test(rl.stdout + rl.stderr),
    '⛔ `lapide-nao-resolve` + aceitar SEM resolverParaUid aborta (é identidade, não relação)');
  ok(await contarRel() === 0, '   e nada foi escrito');

  rl = rodarArgs(['--aplicar', '--adjudicacao=' + escrever([{ id: idLap, decisao: 'aceitar', porQue: 'x', resolverParaUid: 'uidQUEBRADO00000000000000' }])]);
  ok(rl.status !== 0 && /não existe em users/.test(rl.stdout + rl.stderr),
    '⛔ e com uid QUEBRADO também aborta');
  ok(await contarRel() === 0, '   e nada foi escrito');

  rl = rodarArgs(['--aplicar', '--adjudicacao=' + escrever([{ id: idLap, decisao: 'aceitar', porQue: 'confirmado com a pessoa', resolverParaUid: BIA }])]);
  ok(rl.status === 0, '✅ com mapping canônico VÁLIDO, funciona (exit ' + rl.status + ')');
  const relLap = (await db.collection('friendships').get()).docs.map((d) => d.id);
  ok(relLap.length === 1 && relLap[0] === [ANA, BIA].sort().join('__'),
    '   e o pairId é recalculado com os dois uids canônicos');
  ok(!relLap[0].includes(LAP), '   ⛔ o uid da LÁPIDE não entra no cânone');
  // limpa pro próximo bloco
  await db.collection('users').doc(ANA).update({ friends: ['dup@x.com'] });
  await db.collection('users').doc(LAP).delete();
  for (const d of (await db.collection('friendships').get()).docs) await d.ref.delete();

  // ══ ENUM EXATO DA DECISÃO (6ª auditoria, ponto 9) ═════════════════════════
  /* ⛔ `"aceitarr"` funcionava como DESCARTE SILENCIOSO: qualquer valor != "aceitar" caía
   * implicitamente em não-aceitar. Um typo apagava uma amizade sem ninguém ver. */
  await db.doc('_meta/amizadeMigration').set({ fase: 'frozen' }, { merge: true });
  await db.collection('users').doc(ANA).update({ friends: ['dup@x.com'] });
  for (const rel2 of (await db.collection('friendships').get()).docs) await rel2.ref.delete();

  const casos = [
    [{ id: idQuar, decisao: 'aceitarr', porQue: 'typo', resolverParaUid: DUP1 }, /desconhecida/, 'decisão com TYPO ("aceitarr") aborta'],
    [{ id: idQuar, decisao: 'descartar', porQue: '' }, /porQue.*vazio|vazio/, '`descartar` sem `porQue` aborta'],
    [{ id: idQuar, decisao: 'aceitar', porQue: '   ', resolverParaUid: DUP1 }, /vazio/, '`porQue` só com espaços aborta'],
    [{ id: 'quarentena|que|nao|existe', decisao: 'descartar', porQue: 'x' }, /não corresponde/, 'adjudicação de caso INEXISTENTE aborta'],
    [{ decisao: 'descartar', porQue: 'x' }, /sem .id/, 'entrada sem `id` aborta'],
  ];
  for (const [obj, re, msg] of casos) {
    const rr = rodarArgs(['--aplicar', '--adjudicacao=' + escrever([obj])]);
    ok(rr.status !== 0 && re.test(rr.stdout + rr.stderr), '⛔ ' + msg);
    ok(await contarRel() === 0, '   e nada foi escrito');
  }
  // ID duplicado
  const dupArq = escrever([
    { id: idQuar, decisao: 'descartar', porQue: 'a' },
    { id: idQuar, decisao: 'aceitar', porQue: 'b', resolverParaUid: DUP1 },
  ]);
  let rd = rodarArgs(['--aplicar', '--adjudicacao=' + dupArq]);
  ok(rd.status !== 0 && /DUPLICADO/.test(rd.stdout + rd.stderr), '⛔ ID DUPLICADO no arquivo aborta');
  ok(await contarRel() === 0, '   e nada foi escrito');

  // ══ TRANSIÇÕES PROIBIDAS DA MÁQUINA DE ESTADOS (ponto 6) ══════════════════
  const proibidas = [
    ['live', 'frozen'], ['live', 'backfilled'], ['backfilled', 'frozen'],
    ['frozen', 'not_started'], ['not_started', 'live'], ['not_started', 'backfilled'],
  ];
  for (const [de, para] of proibidas) {
    await db.doc('_meta/amizadeMigration').set({ fase: de }, { merge: true });
    const rr = rodarArgs(['--fase=' + para, '--aplicar']);
    ok(rr.status !== 0 && /PROIBIDA/.test(rr.stdout + rr.stderr), '⛔ transição ' + de + ' → ' + para + ' é PROIBIDA');
    const agora = (await db.doc('_meta/amizadeMigration').get()).data().fase;
    ok(agora === de, '   e a fase NÃO mudou (continua ' + agora + ')');
  }
  // a transição normal passa
  await db.doc('_meta/amizadeMigration').set({ fase: 'not_started' }, { merge: true });
  const rok = rodarArgs(['--fase=frozen', '--aplicar']);
  ok(rok.status === 0 && (await db.doc('_meta/amizadeMigration').get()).data().fase === 'frozen',
    '✅ e a transição NORMAL (not_started → frozen) passa');

  console.log('\n  adjudicação de e-mail: ' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
