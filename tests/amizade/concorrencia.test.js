/* CONCORRÊNCIA E FALHA PARCIAL — emulador real (6ª auditoria, pontos 3 e 4).
 * Roda dentro de: npm run test:amizade
 *
 * ⛔ A CORRIDA: caller/target eram validados ANTES da transação, que lia só a relação. Nada
 * amarrava o ESTADO DAS CONTAS. O merge grava `mergedInto` no FIM; o delete torna a conta
 * morta no fim. Nas duas janelas cabia uma amizade nova com o uid que estava sendo
 * absorvido/apagado, criada DEPOIS de a migração já ter passado por ele.
 * A trava é `userLifecycle/{uid}` lido DENTRO da transação: mudança concorrente força o
 * Firestore a repetir, e na repetição a operação vê o estado e recusa.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));
const svc = require(path.join(__dirname, '..', '..', 'functions', 'amizade-service.js'));
const vida = require(path.join(__dirname, '..', '..', 'functions', 'amizade-lifecycle.js'));
const lock = require(path.join(__dirname, '..', '..', 'functions', 'amizade-lock.js'));
const core = require(path.join(__dirname, '..', '..', 'functions', 'amizade-authority-core.js'));

const db = admin.firestore();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

const A = 'uidCONCa00000000000000000001';
const B = 'uidCONCb00000000000000000002';
const C = 'uidCONCc00000000000000000003';
const P = (x, y) => core.pairId(x, y);

async function limpar() {
  for (const col of ['friendships', 'users', 'userLifecycle']) {
    const s = await db.collection(col).get(); const b = db.batch(); s.forEach((d) => b.delete(d.ref)); await b.commit();
  }
  const acc = await db.collectionGroup('accepted').get();
  const b2 = db.batch(); acc.forEach((d) => b2.delete(d.ref)); await b2.commit();
}
const perfil = (uid, extra) => db.collection('users').doc(uid).set(Object.assign({ displayName: uid }, extra || {}));
const pegou = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

module.exports = (async () => {
  // as funções de lifecycle são chamadas direto (sem callable), mas o service consulta a fase
  await db.doc('_meta/amizadeMigration').set({ fase: 'live' });
  // ══ 1) SEND concorrendo com MERGE ═════════════════════════════════════════
  await limpar(); await perfil(A); await perfil(B); await perfil(C);
  await lock.adquirir(db, [A, B], 'merging');           // merge em andamento
  let err = await pegou(() => svc.aplicar('enviar', C, A));
  ok(err !== null, '[send×merge] convite para conta em `merging` é RECUSADO');
  ok(/unificada/.test(err.message || ''), 'e a mensagem explica a espera');
  ok((await db.collection('friendships').get()).size === 0,
    '⛔ e NENHUMA relação nasce durante a fusão');

  // ══ 2) ACCEPT concorrendo com MERGE ═══════════════════════════════════════
  await limpar(); await perfil(A); await perfil(B);
  await db.collection('friendships').doc(P(A, B)).set({
    uidA: core.parOrdenado(A, B).uidA, uidB: core.parOrdenado(A, B).uidB,
    status: 'pending', requestedBy: A, createdAt: 't0', acceptedAt: null });
  await lock.adquirir(db, [A], 'merging');
  err = await pegou(() => svc.aplicar('aceitar', B, A));
  ok(err !== null, '[accept×merge] aceitar com o outro lado em `merging` é RECUSADO');
  ok((await db.collection('friendships').doc(P(A, B)).get()).data().status === 'pending',
    '⛔ e a relação continua pending — nada foi aplicado');
  ok((await vida.acessosDe(db, A)).length === 0, 'e nenhuma projeção nasceu');

  // ══ 3) SEND concorrendo com DELETE ════════════════════════════════════════
  await limpar(); await perfil(A); await perfil(B);
  await lock.adquirir(db, [B], 'deleting');
  err = await pegou(() => svc.aplicar('enviar', A, B));
  ok(err !== null, '[send×delete] convite para conta em `deleting` é RECUSADO');
  ok(/excluída/.test(err.message || ''), 'e a mensagem diz que a conta está sendo excluída');
  ok((await db.collection('friendships').get()).size === 0, '⛔ e nada é criado');

  // ══ 4) REMOVE concorrendo com DELETE ══════════════════════════════════════
  await limpar(); await perfil(A); await perfil(B);
  await db.collection('friendships').doc(P(A, B)).set({
    uidA: core.parOrdenado(A, B).uidA, uidB: core.parOrdenado(A, B).uidB,
    status: 'accepted', requestedBy: A, createdAt: 't0', acceptedAt: 't1' });
  await db.collection('friendAccess').doc(A).collection('accepted').doc(B).set({ since: 't1', ownerUid: A, friendUid: B });
  const posseB = await lock.adquirir(db, [B], 'deleting');
  err = await pegou(() => svc.aplicar('remover', A, B));
  ok(err !== null, '[remove×delete] desfazer amizade durante exclusão é RECUSADO');
  ok((await db.collection('friendships').doc(P(A, B)).get()).exists,
    'e a relação fica de pé — quem limpa é a exclusão, com pós-condição');

  // ══ 5) o lock LIBERA e a operação volta a funcionar ═══════════════════════
  await lock.liberar(db, posseB);
  err = await pegou(() => svc.aplicar('remover', A, B));
  ok(err === null, '[lock liberado] a mesma operação passa depois que o lock sai');

  // ══ 6) lock ABANDONADO não tranca a conta pra sempre ══════════════════════
  await limpar(); await perfil(A); await perfil(B);
  const venceu = new Date(Date.now() - 60000).toISOString();
  await db.collection('userLifecycle').doc(B).set({
    estado: 'merging', operationId: 'op_abandonada', acquiredAt: venceu, expiresAt: venceu });
  err = await pegou(() => svc.aplicar('enviar', A, B));
  ok(err === null, '[lock expirado] lock mais velho que a validade é ignorado — conta não fica trancada');

  // ══ 7) FALHA PARCIAL: projeção órfã sem a relação (ponto 4) ═══════════════
  await limpar(); await perfil(B); await perfil(C);
  // simula: relação de A já foi apagada/rekeyada, mas as projeções ficaram
  await db.collection('friendAccess').doc(A).collection('accepted').doc(C).set({ since: 't0', ownerUid: A, friendUid: C });
  await db.collection('friendAccess').doc(C).collection('accepted').doc(A).set({ since: 't0', ownerUid: C, friendUid: A });
  await perfil(C, { friends: [A] });
  const achadas = await vida.acessosDe(db, A);
  ok(achadas.length === 2,
    '⛔ acessosDe acha as DUAS projeções órfãs SEM existir friendship (deu ' + achadas.length + ')');
  await vida.amizadeNoMerge(db, A, B);       // retry do merge
  ok((await vida.acessosDe(db, A)).length === 0, '⛔ e o retry as remove');
  ok(!((await db.collection('users').doc(C).get()).data().friends || []).includes(A),
    'e o cache do terceiro é corrigido');

  // ══ 8) PÓS-CONDIÇÃO: ela DE FATO reprova quando sobra ═════════════════════
  await limpar(); await perfil(B); await perfil(C, { friends: [A] });
  let sobras = await vida.conferirUidMortoSumiu(db, A);
  ok(sobras.length > 0, '⛔ a pós-condição ACUSA cache de terceiro com uid morto');
  await db.collection('users').doc(C).update({ friends: [] });
  sobras = await vida.conferirUidMortoSumiu(db, A);
  ok(sobras.length === 0, 'e fica limpa quando não há sobra');

  // ══ 9) falha ENTRE batches: retry do delete limpa o resto ════════════════
  await limpar(); await perfil(A); await perfil(C);
  await db.collection('friendships').doc(P(A, C)).set({
    uidA: core.parOrdenado(A, C).uidA, uidB: core.parOrdenado(A, C).uidB,
    status: 'accepted', requestedBy: A, createdAt: 't0', acceptedAt: 't1' });
  await db.collection('friendAccess').doc(A).collection('accepted').doc(C).set({ since: 't1', ownerUid: A, friendUid: C });
  // batch 1 "passou" (relação some), batch 2 "falhou" (projeção reversa fica)
  await db.collection('friendships').doc(P(A, C)).delete();
  await db.collection('friendAccess').doc(C).collection('accepted').doc(A).set({ since: 't1', ownerUid: C, friendUid: A });
  await vida.excluirAmizade(db, A);
  ok((await vida.acessosDe(db, A)).length === 0,
    '⛔ retry do delete limpa a projeção órfã mesmo sem a friendship de origem');
  ok((await vida.conferirUidMortoSumiu(db, A)).length === 0, 'e a pós-condição fica limpa');

  // ══ AQUISIÇÃO × AQUISIÇÃO (7ª auditoria, pontos 1 e 13) ═══════════════════
  /* ⛔ O teste anterior provava só "quando alguém JÁ escreveu merging, a amizade recusa".
   * Isso não prova exclusão mútua entre duas operações de LIFECYCLE — e a implementação
   * anterior (`batch.set` sem comparar) deixava as duas passarem. */
  await limpar(); await perfil(A); await perfil(B); await perfil(C);

  const r1 = await pegou(() => lock.adquirir(db, [A, B], 'merging'));
  ok(r1 === null, '[aquisição] a primeira operação adquire A+B');
  const r2 = await pegou(() => lock.adquirir(db, [B, C], 'merging'));
  ok(r2 !== null, '⛔ [aquisição×aquisição] a SEGUNDA, que divide o uid B, FALHA');
  const dC = await db.collection('userLifecycle').doc(C).get();
  ok(!dC.exists || lock.estadoDe(dC.data(), Date.now()) === 'active',
    '⛔ e NENHUM uid dela foi adquirido — nem o C, que estava livre (tudo ou nada)');

  // merge × delete disputando o mesmo uid
  const r3 = await pegou(() => lock.adquirir(db, [A], 'deleting'));
  ok(r3 !== null, '⛔ [merge×delete] delete não consegue adquirir uid já em merging');

  // ownership: B não libera o lock de A
  const posseA = await db.collection('userLifecycle').doc(A).get();
  const opA = posseA.data().operationId;
  const res = await lock.liberar(db, { operationId: 'op_de_outra_operacao', uids: [A, B] });
  ok(res.alheios === 2 && res.liberados === 0,
    '⛔ [ownership] operationId ERRADO não libera nada');
  ok((await db.collection('userLifecycle').doc(A).get()).data().operationId === opA,
    '   e o lock continua sendo do dono');

  // o dono libera
  const resOk = await lock.liberar(db, { operationId: opA, uids: [A, B] });
  ok(resOk.liberados === 2, '[ownership] o DONO libera os dois');
  ok((await pegou(() => lock.adquirir(db, [A, B], 'merging'))) === null,
    'e aí outra operação consegue adquirir');
  await lock.liberar(db, { operationId: (await db.collection('userLifecycle').doc(A).get()).data().operationId, uids: [A, B] });

  // lease vencido é recuperável
  const venceu2 = new Date(Date.now() - 60000).toISOString();
  await db.collection('userLifecycle').doc(A).set({
    estado: 'merging', operationId: 'op_morta', acquiredAt: venceu2, expiresAt: venceu2 });
  const r4 = await pegou(() => lock.adquirir(db, [A], 'deleting'));
  ok(r4 === null, '[lease] lock com lease VENCIDO é tomado por uma operação nova');
  ok((await db.collection('userLifecycle').doc(A).get()).data().operationId !== 'op_morta',
    '   e o operationId passa a ser o da nova');

  // ══ CONCORRÊNCIA DE VERDADE: duas aquisições disparadas juntas ════════════
  await limpar(); await perfil(A); await perfil(B);
  const [x, y] = await Promise.all([
    pegou(() => lock.adquirir(db, [A, B], 'merging')),
    pegou(() => lock.adquirir(db, [A, B], 'deleting')),
  ]);
  const venceram = [x, y].filter((e) => e === null).length;
  ok(venceram === 1, '⛔ duas aquisições SIMULTÂNEAS no mesmo par: exatamente UMA vence (deu ' + venceram + ')');
  const est = lock.estadoDe((await db.collection('userLifecycle').doc(A).get()).data(), Date.now());
  ok(est === 'merging' || est === 'deleting', '   e o estado final é de uma só delas: ' + est);

  // ══ ESTADOS TERMINAIS (9ª auditoria, ponto 3) ═════════════════════════════
  await limpar(); await perfil(A); await perfil(B);
  const p1 = await lock.adquirir(db, [A, B], 'merging');
  await lock.finalizar(db, p1, { [A]: 'merged', [B]: 'active' });
  const dA1 = (await db.collection('userLifecycle').doc(A).get()).data();
  ok(dA1.estado === 'merged', '[terminal] o DROP termina como `merged`, não `active`');
  ok(dA1.expiresAt === null, '   e terminal NÃO carrega lease');
  ok(lock.estadoDe(dA1, Date.now() + 10 * 365 * 24 * 3600 * 1000) === 'merged',
    '⛔ [terminal] e NÃO expira nem daqui a 10 anos — não é operação abandonada, é fato');
  ok(lock.estadoDe((await db.collection('userLifecycle').doc(B).get()).data(), Date.now()) === 'active',
    '   e o KEEP volta a `active`');

  const rT = await pegou(() => lock.adquirir(db, [A], 'merging'));
  ok(rT !== null && rT.terminal === true,
    '⛔ [terminal] uid `merged` NÃO pode ser adquirido por nova operação');
  const rF = await pegou(() => svc.aplicar('enviar', B, A));
  ok(rF !== null,
    '⛔ [terminal] e a amizade recusa o uid morto — mesmo SEM olhar `users.mergedInto`');

  // delete → terminal `deleted`
  await limpar(); await perfil(C);
  const p2 = await lock.adquirir(db, [C], 'deleting');
  await lock.finalizar(db, p2, { [C]: 'deleted' });
  ok((await db.collection('userLifecycle').doc(C).get()).data().estado === 'deleted',
    '[terminal] delete termina como `deleted`');
  ok((await pegou(() => lock.adquirir(db, [C], 'merging'))) !== null,
    '   e uid `deleted` também não é adquirível');

  // falha ANTES da finalização: volta a `active` e dá pra repetir
  await limpar(); await perfil(A); await perfil(B);
  const p3 = await lock.adquirir(db, [A, B], 'merging');
  await lock.liberar(db, p3);                    // simula falha antes de terminar
  ok((await pegou(() => lock.adquirir(db, [A, B], 'merging'))) === null,
    '[terminal] falha antes de finalizar devolve a `active` — a operação pode ser repetida');
  await lock.liberar(db, { operationId: (await db.collection('userLifecycle').doc(A).get()).data().operationId, uids: [A, B] });

  // ══ FASE DENTRO DA AQUISIÇÃO (ponto 6) ════════════════════════════════════
  await limpar(); await perfil(A); await perfil(B);
  await db.doc('_meta/amizadeMigration').set({ fase: 'live', maintenance: true });
  const rM = await pegou(() => lock.adquirir(db, [A, B], 'merging'));
  ok(rM !== null && rM.migracao, '⛔ [fase] a AQUISIÇÃO recusa sob manutenção (lida na mesma transação)');
  const nenhum = (await db.collection('userLifecycle').get()).docs
    .every((d) => !(d.data() || {}).estado || d.data().estado === 'active');
  ok(nenhum, '   e nenhum uid foi marcado');

  for (const fase of ['not_started', 'frozen', 'backfilled']) {
    await db.doc('_meta/amizadeMigration').set({ fase: fase, maintenance: false });
    ok((await pegou(() => lock.adquirir(db, [A, B], 'merging'))) !== null,
      '⛔ [fase=' + fase + '] a aquisição também recusa');
  }
  await db.doc('_meta/amizadeMigration').set({ fase: 'live', maintenance: false });
  const rL = await pegou(() => lock.adquirir(db, [A, B], 'merging'));
  ok(rL === null, '✅ [fase=live] só aqui a aquisição passa');
  await lock.liberar(db, { operationId: (await db.collection('userLifecycle').doc(A).get()).data().operationId, uids: [A, B] });

  // ══ AMIZADE REVALIDA O PERFIL DENTRO DA TRANSAÇÃO (ponto 4) ═══════════════
  /* O precheck externo vê os dois vivos; ANTES da transação escrever, o alvo vira lápide.
   * Sem a leitura dentro da transação, a relação nasceria apontando pro uid morto. */
  await limpar(); await perfil(A); await perfil(B);
  await db.collection('users').doc(B).update({ mergedInto: C });
  const rAlvo = await pegou(() => svc.aplicar('enviar', A, B));
  ok(rAlvo !== null, '⛔ [tx] alvo que virou lápide NÃO recebe amizade');
  ok((await db.collection('friendships').get()).size === 0, '   e ZERO friendship é criada');
  ok((await vida.acessosDe(db, B)).length === 0, '   e ZERO friendAccess pro uid morto');

  await limpar(); await perfil(A); await perfil(B);
  await db.collection('users').doc(A).update({ mergedInto: C });
  const rCaller = await pegou(() => svc.aplicar('enviar', A, B));
  ok(rCaller !== null, '⛔ [tx] caller absorvido NÃO consegue escrever');
  ok((await db.collection('friendships').get()).size === 0, '   e nada é criado');

  await limpar(); await perfil(A); await perfil(B, { deleted: true });
  ok((await pegou(() => svc.aplicar('enviar', A, B))) !== null, '⛔ [tx] alvo excluído é recusado');
  await limpar(); await perfil(A); await perfil(B, { acceptFriendRequests: false });
  ok((await pegou(() => svc.aplicar('enviar', A, B))) !== null,
    '⛔ [tx] `acceptFriendRequests:false` é conferido DENTRO da transação');

  // ══ POSSE STALE NÃO RESSUSCITA TERMINAL (10ª auditoria, ponto 4) ═════════
  /* A sequência: A adquire → A perde o lease → B adquire → B FINALIZA como terminal →
   * A, atrasada, tenta liberar/finalizar com a posse velha. Antes, um documento sem
   * `operationId` era tratado como liberável, então a posse velha podia devolver um uid
   * MORTO para `active`. */
  await limpar(); await perfil(A);
  const pA = await lock.adquirir(db, [A], 'merging');
  const venceuLease = new Date(Date.now() - 60000).toISOString();
  await db.collection('userLifecycle').doc(A).update({ expiresAt: venceuLease });
  const pB = await lock.adquirir(db, [A], 'deleting');
  ok(pB.operationId !== pA.operationId, 'setup: B tomou o lease vencido de A');
  await lock.finalizar(db, pB, { [A]: 'deleted' });
  ok((await db.collection('userLifecycle').doc(A).get()).data().estado === 'deleted', 'setup: B finalizou como terminal');

  const rLib = await lock.liberar(db, pA);
  ok(rLib.liberados === 0 && rLib.alheios === 1, '⛔ a posse VELHA de A não libera nada');
  ok((await db.collection('userLifecycle').doc(A).get()).data().estado === 'deleted',
    '⛔ e o estado TERMINAL permanece intacto');
  const rFin = await lock.finalizar(db, pA, { [A]: 'active' });
  ok(rFin.finalizados === 0, '⛔ nem finalizar com posse velha funciona');
  ok((await db.collection('userLifecycle').doc(A).get()).data().estado === 'deleted',
    '⛔ e continua `deleted` — terminal não se ressuscita');

  // ══ DESFECHO PELO FATO PERSISTIDO (ponto 3) ══════════════════════════════
  await limpar(); await perfil(A); await perfil(B);
  await db.collection('users').doc(A).update({ mergedInto: B });
  const pF = await lock.adquirir(db, [A, B], 'merging');
  await lock.finalizarPeloFato(db, pF);
  ok((await db.collection('userLifecycle').doc(A).get()).data().estado === 'merged',
    '⛔ [fato] `mergedInto` gravado ⇒ lifecycle `merged`, mesmo sem flag de sucesso');
  ok(lock.estadoDe((await db.collection('userLifecycle').doc(B).get()).data(), Date.now()) === 'active',
    '   e a conta viva volta a `active`');

  await limpar(); await perfil(C);
  await db.collection('users').doc(C).update({ deleted: true });
  const pD = await lock.adquirir(db, [C], 'deleting');
  await lock.finalizarPeloFato(db, pD);
  ok((await db.collection('userLifecycle').doc(C).get()).data().estado === 'deleted',
    '⛔ [fato] tombstone `deleted` gravado ⇒ lifecycle `deleted`, mesmo que uma etapa depois falhe');

  // ══ OWNERSHIP ESTRITO: NO-OP (11ª auditoria, ponto 2) ════════════════════
  await limpar(); await perfil(A);
  const pS = await lock.adquirir(db, [A], 'merging');

  // (a) documento SUMIU
  await db.collection('userLifecycle').doc(A).delete();
  let rr = await lock.liberar(db, pS);
  ok(rr.liberados === 0, '⛔ posse stale com documento AUSENTE: liberar é no-op');
  ok(!(await db.collection('userLifecycle').doc(A).get()).exists,
    '   e o documento NÃO é criado do nada');
  rr = await lock.finalizar(db, pS, { [A]: 'active' });
  ok(rr.finalizados === 0 && !(await db.collection('userLifecycle').doc(A).get()).exists,
    '⛔ finalizar também é no-op com documento ausente');

  // (b) operationId NULL
  await db.collection('userLifecycle').doc(A).set({ estado: 'merging', operationId: null });
  rr = await lock.liberar(db, pS);
  ok(rr.liberados === 0 && rr.alheios === 1, '⛔ posse stale com operationId NULL: no-op');
  ok((await db.collection('userLifecycle').doc(A).get()).data().estado === 'merging',
    '   e o estado fica como estava');
  rr = await lock.finalizar(db, pS, { [A]: 'deleted' });
  ok(rr.finalizados === 0, '⛔ finalizar idem');
  ok((await db.collection('userLifecycle').doc(A).get()).data().estado === 'merging',
    '   e continua `merging` — posse sem dono não decide nada');

  // (c) terminal alheio permanece
  for (const term of ['merged', 'deleted']) {
    await db.collection('userLifecycle').doc(A).set({ estado: term, operationId: 'op_de_outra' });
    await lock.liberar(db, pS);
    await lock.finalizar(db, pS, { [A]: 'active' });
    ok((await db.collection('userLifecycle').doc(A).get()).data().estado === term,
      '⛔ posse stale NÃO ressuscita `' + term + '`');
  }

  // ══ GHOST: ausência de perfil NÃO é `deleted` (ponto 3) ═══════════════════
  await limpar();
  const GHOST = 'uidGHOSTsemPerfil0000000001';
  ok(await lock.estadoFinalPeloFato(db, GHOST) === null,
    '⛔ uid SEM `users/{uid}` devolve DESCONHECIDO, não `deleted` (Auth ghost é conta viva)');
  const pG = await lock.adquirir(db, [GHOST], 'merging');
  await lock.finalizarPeloFato(db, pG);
  const dG = (await db.collection('userLifecycle').doc(GHOST).get()).data() || {};
  ok(dG.estado !== 'deleted' && dG.estado !== 'merged',
    '⛔ e `finalizarPeloFato` NÃO inventa terminal pra ele (ficou: ' + dG.estado + ')');

  await perfil(C);
  ok(await lock.estadoFinalPeloFato(db, C) === 'active', 'controle: conta viva devolve `active`');

  console.log('\n  concorrência: ' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
