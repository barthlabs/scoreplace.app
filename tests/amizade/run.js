/* PONTA A PONTA das callables de amizade — roda DENTRO do emulador (Firestore + Functions).
 *   npm run test:amizade
 *
 * ⛔ POR QUE ESTE TESTE EXISTE (P0-4 da auditoria externa, 29/ago/2026):
 * o núcleo puro prova a máquina de estados e o teste de rules prova a porta do Firestore.
 * Nenhum dos dois toca a GUARDA DE ALVO da callable — e era ali que sobrava buraco:
 * `alvoUid` chega no CORPO da chamada, ou seja é afirmação do cliente. Sem validar:
 *   · uid inexistente virava relação, e o `set(...,{merge:true})` CRIAVA `users/{alvo}` —
 *     perfil FANTASMA fabricado por quem quisesse;
 *   · lápide (`mergedInto`) virava alvo morto;
 *   · e-mail/id legado passava como identidade canônica;
 *   · `acceptFriendRequests = false` era ignorado.
 * Aqui as CFs rodam de verdade e cada uma dessas tentativas é feita e conferida.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-scoreplace';
admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const FN = 'http://127.0.0.1:5012/' + PROJECT + '/us-central1/';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (uid) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
  iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: uid, user_id: uid,
  auth_time: Math.floor(Date.now() / 1000), iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600, email: uid + '@x.com', email_verified: true,
  firebase: { identities: {}, sign_in_provider: 'google.com' },
}) + '.';

async function chamar(nome, uid, data) {
  const r = await fetch(FN + nome, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + tok(uid), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: data || {} }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j, erro: (j && j.error && (j.error.status || j.error.message)) || null };
}

// uids com 28 chars (o formato real do Firebase) — a guarda recusa string curta
const ANA   = 'uidANA0000000000000000000001';
const BIA   = 'uidBIA0000000000000000000002';
const MORTA = 'uidMORTA00000000000000000003';   // lápide → ANA
const FANTASMA = 'uidFANTASMA000000000000000004'; // nunca existiu
const FECHADA = 'uidFECHADA0000000000000000005'; // acceptFriendRequests: false

(async () => {
  /* ⛔ 7ª auditoria (ponto 4): as operações sociais são RECUSADAS enquanto a migração está
   * em `not_started`/`frozen` — a trava de manutenção do backend. Os testes de fluxo normal
   * precisam declarar a fase liberada; o bloco no fim prova o congelamento. */
  await db.doc('_meta/amizadeMigration').set({ fase: 'live' });

  await db.collection('users').doc(ANA).set({ displayName: 'Ana' });
  await db.collection('users').doc(BIA).set({ displayName: 'Bia' });
  await db.collection('users').doc(FECHADA).set({ displayName: 'Fechada', acceptFriendRequests: false });
  await db.collection('users').doc(MORTA).set({ displayName: 'Morta', mergedInto: ANA });

  // ── 1) ALVO INEXISTENTE: falha e NÃO fabrica perfil ───────────────────────
  let r = await chamar('sendFriendRequest', ANA, { toUid: FANTASMA });
  ok(r.status >= 400, 'convite pra uid INEXISTENTE falha (status ' + r.status + ')');
  const fant = await db.collection('users').doc(FANTASMA).get();
  ok(!fant.exists, '⛔ e NENHUM doc fantasma foi criado em users/');
  const relFant = await db.collection('friendships').get();
  ok(relFant.size === 0, 'e nenhuma relação nasceu');

  // ── 2) E-MAIL / id legado NÃO é identidade canônica ───────────────────────
  r = await chamar('sendFriendRequest', ANA, { toUid: 'alguem@exemplo.com' });
  ok(r.status >= 400, 'e-mail como alvo é recusado (status ' + r.status + ')');
  /* ⛔ ATENÇÃO ao que esta asserção afirma (4ª/5ª auditoria, ponto 7): a recusa aqui NÃO é
   * por COMPRIMENTO — a heurística `length < 20` foi removida, porque tamanho de string não
   * é prova de identidade e não há contrato do Firebase que o garanta. 'curto' é recusado
   * porque NÃO EXISTE em users/. O teste logo abaixo prova o outro lado: um uid CURTO que
   * EXISTE funciona normalmente. */
  r = await chamar('sendFriendRequest', ANA, { toUid: 'curto' });
  ok(r.status === 404, 'uid inexistente é recusado por NÃO EXISTIR, não por ser curto (status ' + r.status + ')');

  const CURTINHO = 'u7';                       // uid deliberadamente curto, mas REAL
  await db.collection('users').doc(CURTINHO).set({ displayName: 'Curtinho' });
  r = await chamar('sendFriendRequest', ANA, { toUid: CURTINHO });
  ok(r.status === 200, '⭐ e um uid CURTO que EXISTE é aceito (status ' + r.status + ') — a prova é a resolução, não o tamanho');
  ok((await db.collection('friendships').doc([ANA, CURTINHO].sort().join('__')).get()).exists,
    'e a relação nasce normalmente');

  // ── 3) acceptFriendRequests = false ───────────────────────────────────────
  r = await chamar('sendFriendRequest', ANA, { toUid: FECHADA });
  ok(r.status >= 400, 'quem desligou convites NÃO recebe novo convite (status ' + r.status + ')');
  const relF = await db.collection('friendships').doc([ANA, FECHADA].sort().join('__')).get();
  ok(!relF.exists, 'e nenhuma relação foi criada com ela');

  // ── 4) LÁPIDE resolve pra conta viva, nunca vira alvo morto ───────────────
  r = await chamar('sendFriendRequest', BIA, { toUid: MORTA });
  ok(r.status === 200, 'convite pra LÁPIDE é aceito e resolvido (status ' + r.status + ')');
  const relMorta = await db.collection('friendships').doc([BIA, MORTA].sort().join('__')).get();
  ok(!relMorta.exists, '⛔ e NÃO criou relação com o uid MORTO');
  const relViva = await db.collection('friendships').doc([BIA, ANA].sort().join('__')).get();
  ok(relViva.exists && relViva.data().status === 'pending', 'a relação nasceu com a conta VIVA (ANA)');

  // ── 5) ALVO VIVO: o fluxo legítimo inteiro ────────────────────────────────
  r = await chamar('acceptFriendRequest', ANA, { friendUid: BIA });
  ok(r.status === 200, 'ANA aceita o convite de BIA (status ' + r.status + ')');
  const rel = await db.collection('friendships').doc([ANA, BIA].sort().join('__')).get();
  ok(rel.exists && rel.data().status === 'accepted', 'relação vira accepted');
  const a1 = await db.collection('friendAccess').doc(ANA).collection('accepted').doc(BIA).get();
  const a2 = await db.collection('friendAccess').doc(BIA).collection('accepted').doc(ANA).get();
  ok(a1.exists && a2.exists, 'projeção criada nas DUAS direções');
  const anaDoc = (await db.collection('users').doc(ANA).get()).data();
  const biaDoc = (await db.collection('users').doc(BIA).get()).data();
  ok((anaDoc.friends || []).includes(BIA) && (biaDoc.friends || []).includes(ANA), 'cache users.friends atualizado nos dois');
  ok(!(anaDoc.friendRequestsReceived || []).includes(BIA), 'e o convite saiu dos pendentes (invariante)');
  ok(!biaDoc.friendRequestsSentAt || biaDoc.friendRequestsSentAt[ANA] === undefined,
    'friendRequestsSentAt limpo ao aceitar (o carimbo é mantido pelo servidor)');

  // ── 6) desfazer ───────────────────────────────────────────────────────────
  r = await chamar('removeFriend', ANA, { friendUid: BIA });
  ok(r.status === 200, 'desfazer amizade funciona');
  ok(!(await db.collection('friendAccess').doc(ANA).collection('accepted').doc(BIA).get()).exists,
    'e a projeção some (senão o acesso sobrevivia à amizade)');

  // ── caller precisa ser identidade VIVA (3ª auditoria, ponto 6) ────────────
  const CALLER_MORTO = 'uidCALLERMORTO000000000000006';
  const CALLER_DEL   = 'uidCALLERDEL00000000000000007';
  await db.collection('users').doc(CALLER_MORTO).set({ displayName: 'Absorvido', mergedInto: ANA });
  await db.collection('users').doc(CALLER_DEL).set({ displayName: 'Excluido', deleted: true });
  const antesRel = (await db.collection('friendships').get()).size;

  r = await chamar('sendFriendRequest', CALLER_MORTO, { toUid: BIA });
  ok(r.status >= 400, 'caller TOMBSTONE (mergedInto) é recusado (status ' + r.status + ')');
  r = await chamar('sendFriendRequest', CALLER_DEL, { toUid: BIA });
  ok(r.status >= 400, 'caller DELETED é recusado (status ' + r.status + ')');
  const depoisRel = (await db.collection('friendships').get()).size;
  ok(antesRel === depoisRel, '⛔ e NENHUMA relação foi criada sob uid morto');
  r = await chamar('sendFriendRequest', ANA, { toUid: BIA });
  ok(r.status === 200, 'controle: caller normal continua funcionando (status ' + r.status + ')');

  // ══ RECONFIRMAÇÃO: listLegacyFriendships (5ª auditoria, ponto 3) ══════════
  const L1 = 'uidLEG1000000000000000000001', L2 = 'uidLEG2000000000000000000002', L3 = 'uidLEG3000000000000000000003';
  await db.collection('users').doc(L1).set({ displayName: 'Leg1' });
  await db.collection('users').doc(L2).set({ displayName: 'Leg2' });
  await db.collection('users').doc(L3).set({ displayName: 'Estranho' });
  const pid = [L1, L2].sort().join('__');
  await db.collection('friendships').doc(pid).set({
    uidA: [L1, L2].sort()[0], uidB: [L1, L2].sort()[1], status: 'legacy_unverified',
    requestedBy: L1, createdAt: 't0', acceptedAt: null, legacyOrigem: 'friends-reciproco' });

  r = await chamar('listLegacyFriendships', L1, {});
  ok(r.status === 200, 'listLegacyFriendships responde (status ' + r.status + ')');
  let lst = (r.body && r.body.result && r.body.result.relacoes) || [];
  ok(lst.length === 1 && lst[0].uid === L2, 'e devolve o OUTRO uid do par');
  ok(lst[0].displayName === 'Leg2' && lst[0].photoURL !== undefined,
    'com o mínimo público pra desenhar a linha');
  ok(lst[0].origem === 'friends-reciproco', 'e a origem, pra a pessoa entender de onde vem');

  r = await chamar('listLegacyFriendships', L2, {});
  lst = (r.body && r.body.result && r.body.result.relacoes) || [];
  ok(lst.length === 1 && lst[0].uid === L1, 'o OUTRO participante também vê a relação');

  r = await chamar('listLegacyFriendships', L3, {});
  lst = (r.body && r.body.result && r.body.result.relacoes) || [];
  ok(lst.length === 0, '⛔ e um TERCEIRO não enumera relação alheia');

  ok(!((await db.collection('users').doc(L1).get()).data().friends || []).includes(L2),
    '⛔ legacy_unverified NÃO aparece como amigo no cache');

  // reconfirmar = o MESMO sendFriendRequest
  r = await chamar('sendFriendRequest', L1, { toUid: L2 });
  ok(r.status === 200, 'reconfirmar usa o sendFriendRequest de sempre (status ' + r.status + ')');
  ok((await db.collection('friendships').doc(pid).get()).data().status === 'pending',
    'a relação legada vira PENDING');
  let accL = await db.collection('friendAccess').doc(L1).collection('accepted').doc(L2).get();
  ok(!accL.exists, '⛔ e ainda NÃO concede acesso');

  r = await chamar('acceptFriendRequest', L2, { friendUid: L1 });
  ok(r.status === 200, 'o outro lado aceita (status ' + r.status + ')');
  ok((await db.collection('friendships').doc(pid).get()).data().status === 'accepted', 'vira accepted');
  accL = await db.collection('friendAccess').doc(L1).collection('accepted').doc(L2).get();
  const accL2 = await db.collection('friendAccess').doc(L2).collection('accepted').doc(L1).get();
  ok(accL.exists && accL2.exists, '⭐ e SÓ ENTÃO nasce o friendAccess, nas duas direções');
  r = await chamar('listLegacyFriendships', L1, {});
  ok(((r.body && r.body.result && r.body.result.relacoes) || []).length === 0,
    'e o par sai da lista de reconfirmação');

  // ══ FASE E MANUTENÇÃO: as duas travas do backend ═════════════════════════
  /* As Rules congelam clientes; Admin SDK ignora Rules. Sem estas travas, merge automático,
   * mergePhoneAccount e deleteAccount continuariam mudando o grafo social entre o snapshot
   * e o backfill. E `maintenance` existe SEPARADA da fase porque o rollback seguro precisa
   * parar o backend sem rebobinar a migração (rebobinar reautorizaria o backfill destrutivo). */
  const F1 = 'uidFROZEN10000000000000001', F2 = 'uidFROZEN20000000000000002';
  await db.collection('users').doc(F1).set({ displayName: 'F1' });
  await db.collection('users').doc(F2).set({ displayName: 'F2' });
  const relAntes = (await db.collection('friendships').get()).size;

  async function tudoRecusado(rotulo) {
    r = await chamar('sendFriendRequest', F1, { toUid: F2 });
    ok(r.status >= 400, '[' + rotulo + '] sendFriendRequest RECUSADO (status ' + r.status + ')');
    r = await chamar('acceptFriendRequest', F1, { friendUid: F2 });
    ok(r.status >= 400, '[' + rotulo + '] acceptFriendRequest RECUSADO');
    r = await chamar('removeFriend', F1, { friendUid: F2 });
    ok(r.status >= 400, '[' + rotulo + '] removeFriend RECUSADO');
    r = await chamar('mergePhoneAccount', F1, { oldUid: F2 });
    ok(r.status >= 400, '[' + rotulo + '] mergePhoneAccount RECUSADO');
    r = await chamar('mergePhoneAccount', F1, { oldUid: F2, dryRun: true });
    ok(r.status >= 400, '[' + rotulo + '] nem o dryRun do merge passa');
    r = await chamar('deleteAccount', F1, {});
    ok(r.status >= 400, '[' + rotulo + '] deleteAccount NEM COMEÇA');
    ok((await db.collection('friendships').get()).size === relAntes,
      '⛔ [' + rotulo + '] e NADA foi escrito em friendships');
  }

  /* ⛔ 9ª auditoria (ponto 1): `backfilled` também BLOQUEIA. Ele é o fim da Etapa B —
   * ainda faltam deploy final das Functions, Rules finais, Hosting e a decisão de abrir.
   * A versão anterior liberava tudo que não fosse not_started/frozen, ou seja, o backend
   * social voltava no meio da Etapa C. */
  for (const fase of ['not_started', 'frozen', 'backfilled']) {
    await db.doc('_meta/amizadeMigration').set({ fase: fase, maintenance: false });
    await tudoRecusado(fase);
  }

  // ⛔ live + maintenance=true bloqueia TUDO (rollback seguro), sem mexer na fase
  await db.doc('_meta/amizadeMigration').set({ fase: 'live', maintenance: true });
  await tudoRecusado('live+maintenance');
  ok((await db.doc('_meta/amizadeMigration').get()).data().fase === 'live',
    '⛔ e a FASE continua `live` — manutenção não rebobina a migração');

  /* ⛔ 8ª auditoria (ponto 3): SEM CACHE DO ESTADO LIBERADO. A versão anterior cacheava a
   * fase por 10 s: ligar a manutenção deixava até 10 s de janela AUTORIZANDO escrita —
   * fail-open exatamente onde a manutenção existe pra fechar. Aqui a mudança é observada
   * na chamada SEGUINTE, sem nenhum sleep. */
  await db.doc('_meta/amizadeMigration').set({ fase: 'live', maintenance: false });
  r = await chamar('sendFriendRequest', F1, { toUid: F2 });
  ok(r.status === 200, '✅ live + maintenance=false: passa (status ' + r.status + ')');
  await db.doc('_meta/amizadeMigration').set({ maintenance: true }, { merge: true });
  /* ⚠️ `cancelFriendRequest` e não `removeFriend`: a relação está `pending`, e `remover` só
   * vale sobre `accepted`/`legacy_unverified` — um 400 da máquina de estados não provaria
   * nada sobre a manutenção. Aqui o 4xx só pode vir da trava. */
  r = await chamar('cancelFriendRequest', F1, { toUid: F2 });
  ok(r.status >= 400,
    '⛔ e a chamada IMEDIATAMENTE seguinte já falha — sem sleep, sem cache liberado (status ' + r.status + ')');
  ok((await db.collection('friendships').doc([F1, F2].sort().join('__')).get()).data().status === 'pending',
    '   e o cancelamento de fato NÃO aconteceu');

  // ══ DELETE BLOQUEADO NÃO TOCA EM TORNEIO (9ª auditoria, ponto 2) ═════════
  /* A ordem antiga era: conferir torneios → APAGAR os organizados → reescrever os que
   * participa → só então conferir a fase e adquirir o lock. Ou seja, "em manutenção o
   * delete nem começa" era falso: ele já tinha destruído torneios. */
  const TDONO = 'tour_delete_guard_1';
  await db.collection('tournaments').doc(TDONO).set({
    name: 'Torneio do F1', creatorUid: F1, adminUids: [F1], memberUids: [F1, F2], status: 'ativo' });
  const torneioAntes = JSON.stringify((await db.collection('tournaments').doc(TDONO).get()).data());

  for (const est of [{ fase: 'frozen', maintenance: false }, { fase: 'backfilled', maintenance: false },
                     { fase: 'live', maintenance: true }]) {
    await db.doc('_meta/amizadeMigration').set(est);
    const rotulo = est.fase + (est.maintenance ? '+maintenance' : '');
    r = await chamar('deleteAccount', F1, {});
    ok(r.status >= 400, '[' + rotulo + '] deleteAccount recusado (status ' + r.status + ')');
    const agora = (await db.collection('tournaments').doc(TDONO).get());
    ok(agora.exists, '⛔ [' + rotulo + '] e o torneio NÃO foi apagado');
    ok(JSON.stringify(agora.data()) === torneioAntes, '⛔ e NÃO foi reescrito');
  }

  // com o uid travado por outra operação, também não toca em torneio
  await db.doc('_meta/amizadeMigration').set({ fase: 'live', maintenance: false });
  await db.collection('userLifecycle').doc(F1).set({
    estado: 'merging', operationId: 'op_outra', acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString() });
  r = await chamar('deleteAccount', F1, {});
  ok(r.status >= 400, '[lock alheio] deleteAccount recusado (status ' + r.status + ')');
  ok(JSON.stringify((await db.collection('tournaments').doc(TDONO).get()).data()) === torneioAntes,
    '⛔ e o torneio segue intacto — a aquisição vem ANTES da primeira escrita');
  await db.collection('userLifecycle').doc(F1).delete();
  await db.collection('tournaments').doc(TDONO).delete();

  // desligar reabre, também na hora
  await db.doc('_meta/amizadeMigration').set({ maintenance: false }, { merge: true });
  r = await chamar('cancelFriendRequest', F1, { toUid: F2 });
  ok(r.status === 200, '✅ e desligar a manutenção reabre imediatamente (status ' + r.status + ')');
  ok(!(await db.collection('friendships').doc([F1, F2].sort().join('__')).get()).exists,
    '   e aí o cancelamento acontece');

  console.log('\n' + pass + ' ok, ' + fail + ' falhas (callables)');
  if (fail) process.exit(1);

  // ── integração do ciclo de vida (merge/exclusão/cache) no mesmo emulador ──
  console.log('\n──── ciclo de vida (merge, exclusão, cache) ────');
  await require('./lifecycle.test.js');
  console.log('\n──── adjudicação de e-mail legado (script real) ────');
  await require('./adjudicacao-email.test.js');
  console.log('\n──── backup e restore do estado social (scripts reais) ────');
  await require('./backup-restore.test.js');
  console.log('\n──── concorrência e falha parcial ────');
  await require('./concorrencia.test.js');
  console.log('\n──── auto-merge por gatilho no freeze ────');
  await require('./auto-merge-freeze.test.js');
  console.log('\n──── deleteAccount: caminho feliz ────');
  await require('./delete-happy-path.test.js');
  console.log('\n──── mergePhoneAccount: prova de posse e ghost ────');
  await require('./merge-phone-prova.test.js');
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
