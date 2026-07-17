/* TRAVA DO CÂNONE DE IDENTIDADE — porta dos INSCRITOS (store.js).
 *
 * REGRA (dono): quem tem conta é identificado por UID. SEMPRE. Nunca nome, nunca e-mail,
 * nunca telefone. Exceção ÚNICA: o jogador FICTÍCIO (sem conta), onde o nome digitado é a
 * única identidade que existe. E: INSCRITO = está em participants[]. Quem está lá APARECE
 * na lista e compete — inclusive organizador e co-organizador. A tela mostra o BANCO.
 *
 * POR QUE ESTE ARQUIVO EXISTE (e por que o uid-poison.test.js não bastou):
 * o uid-poison carrega só js/views/* — `_getCompetitors` mora em store.js e NUNCA foi
 * envenenado. Por esse buraco entrou a regressão de jul/2026 ("Duplas Mistas Sorteadas",
 * staging): o organizador estava inscrito (participants[] tinha o uid dele), o cabeçalho
 * contava 14 (lê participants[] cru) e a lista renderizava 13 — porque `_getCompetitors`
 * excluía "organizador que não se auto-inscreveu" identificando-o por `organizerName` e
 * `organizerEmail`. O botão dizia "Desinscrever-se" ao mesmo tempo: a porta que lê por uid
 * já discordava da que lia por nome. Dono: _"a memoria nao serve pra nada ja esta claro.
 * vive dando regressao nisso"_ — memória não trava; isto trava (roda no gate de deploy).
 *
 * COMO ENVENENA (o nome/e-mail não são omitidos: são MENTIROSOS):
 *   (a) TODO MUNDO se chama "X" — inclusive `organizerName`. Nome não distingue ninguém.
 *   (b) TODO MUNDO tem o e-mail do organizador — e-mail não distingue ninguém (acontece
 *       de verdade: e-mail de família, conta recriada, contas mescladas).
 *   (c) as entradas são só-uid (`{uid, enrollSeq}`), que é o que o banco guarda hoje —
 *       o strip do ITEM 3 não grava nome de quem tem perfil vivo.
 *   (d) o uid é a ÚNICA informação correta.
 * Quem resolve por uid acerta. Quem usa nome/e-mail — como filtro, atalho ou fallback —
 * responde ERRADO na hora e este teste fica VERMELHO. Não é preciso saber QUAIS linhas
 * são identidade: o comportamento denuncia, inclusive em código que ninguém revisou.
 *
 * FALHA no código velho (o filtro por organizerName/organizerEmail derruba os inscritos);
 * PASSA no novo. node tests/uid-poison-inscritos.test.js
 *
 * Ver [[project_uid_identity_canon_locked]] / [[project_count_people_not_entries]].
 */
// render-harness carrega o store.js REAL por completo (o sandbox cru para antes: store.js
// toca document/timers no load). É o único jeito de dirigir a porta de verdade.
const W = require('./render-harness').window;

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' — ' + got : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
};

// ☠️ O VENENO
const POISON_NAME = 'X';
const POISON_EMAIL = 'org@x.com';
const ORG = 'uid_org';
const COHOST = 'uid_cohost';
const PLAYERS = ['uid_p1', 'uid_p2', 'uid_p3'];
const ALL_UIDS = [ORG, COHOST].concat(PLAYERS);

// Perfil vivo: todos se chamam "X" (é o que o app faz — nome vem do perfil por uid).
const NAMES = {}; ALL_UIDS.forEach((u) => { NAMES[u] = POISON_NAME; });
W._nameForUid = (u) => NAMES[u] || '';
W._displayNameForUid = (u, stored) => NAMES[u] || stored || '';
W._profileNameByUid = NAMES;

// Torneio: organizador e co-organizador INSCRITOS (uid em participants[]), como no caso real.
// enrollSeq só pra espelhar o doc; a identidade é o uid.
// ☠️ O ESTADO QUE PEGA O BUG: no app, `_rehydrateEntryNames` (store.js) escreve o nome VIVO
// nas entradas EM MEMÓRIA antes do sorteio (tournaments-draw.js:1376) — o objeto é o mesmo
// que a tela lê depois. Era exatamente o caso real: "Duplas Mistas SORTEADAS". Sem passar por
// aqui o fixture não reproduz nada (entrada só-uid não tem nome pra ninguém comparar) e a
// trava vira teatro: ela passava no código velho. Cada bloco roda nos DOIS estados.
function rehydrated(t) { W._rehydrateEntryNames(t); return t; }

function makeT(opts) {
  opts = opts || {};
  const uids = opts.uids || ALL_UIDS;
  return {
    id: 'T', format: 'Eliminatórias Simples', enrollmentMode: 'individual', teamSize: 2,
    creatorUid: ORG,
    organizerName: POISON_NAME,          // ☠️ o organizador se chama igual a todo mundo
    organizerEmail: POISON_EMAIL,        // ☠️ e o e-mail dele é o de todo mundo
    creatorEmail: POISON_EMAIL,
    coHosts: [{ uid: COHOST, email: POISON_EMAIL, status: 'active' }],
    participants: uids.map((u, i) => ({ uid: u, enrollSeq: i + 1 })),
    standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {},
  };
}
const uidsOf = (arr) => arr.map((p) => (typeof p === 'object' && p ? (p.uid || '') : '')).filter(Boolean);

console.log('\n☠️  FIXTURE ENVENENADO — todos se chamam "' + POISON_NAME + '" e todos usam o e-mail do organizador; só o uid é verdade\n');

// ── 1 · O BUG REAL: o organizador inscrito tem que aparecer ───────────────────
// Nos DOIS estados: entrada crua (como o banco guarda) e pós-rehidratação (como a tela lê
// depois do sorteio). O código velho passa no 1º e FALHA no 2º — por isso o 2º existe.
[['banco cru (só uid)', () => makeT()],
 ['após _rehydrateEntryNames (estado da tela pós-sorteio)', () => rehydrated(makeT())],
].forEach(([estado, build]) => {
  console.log('Inscritos = participants[] · ' + estado + ':');
  const t = build();
  const comp = W._getCompetitors(t);
  const got = uidsOf(comp);
  ok('ninguém some da lista de inscritos', comp.length === t.participants.length,
    comp.length + '/' + t.participants.length);
  ok('o ORGANIZADOR inscrito aparece (por uid)', got.indexOf(ORG) !== -1);
  ok('o CO-ORGANIZADOR inscrito aparece (por uid)', got.indexOf(COHOST) !== -1);
  ok('os demais inscritos aparecem', PLAYERS.every((u) => got.indexOf(u) !== -1));
  // Sintoma visível: "Inscritos Confirmados 14" com 13 cards embaixo. A contagem lê
  // participants[] cru; a lista lê _getCompetitors. As duas TÊM que dar o mesmo número.
  ok('cabeçalho == lista (_personCount == _getCompetitors)',
    W._personCount(t) === comp.length, W._personCount(t) + ' vs ' + comp.length);
  console.log('');
});

// ── 3 · O outro lado do cânone: não inventa inscrito ─────────────────────────
// "se nao for participante, ok nao aparecer" (dono). Organizar não inscreve.
console.log('\nQuem NÃO está em participants[] não aparece:');
{
  const t = makeT({ uids: PLAYERS });   // organizador e co-host fora de participants[]
  const got = uidsOf(W._getCompetitors(t));
  ok('organizador NÃO inscrito não aparece', got.indexOf(ORG) === -1);
  ok('co-organizador NÃO inscrito não aparece', got.indexOf(COHOST) === -1);
  ok('lista = exatamente os inscritos', got.length === PLAYERS.length, got.length + '/' + PLAYERS.length);
}

// ── 4 · A exceção do cânone: fictício sem conta é pelo NOME ──────────────────
console.log('\nFictício sem conta (única identidade = nome digitado):');
{
  const t = makeT();
  t.participants.push({ name: 'Convidado da Quadra', displayName: 'Convidado da Quadra' });
  const comp = W._getCompetitors(t);
  ok('fictício sem uid permanece na lista', comp.some((p) => p && p.name === 'Convidado da Quadra'));
  ok('fictício conta como pessoa', W._personCount(t) === t.participants.length,
    W._personCount(t) + '/' + t.participants.length);
}

// ── 5 · Dupla com o organizador dentro não pode sumir ────────────────────────
// Regressão histórica: "2 inscritos / 1 time" quando eram 4 inscritos / 2 times.
console.log('\nDupla que inclui o organizador:');
{
  const t = makeT({ uids: [] });
  t.participants = [
    { p1Uid: ORG, p2Uid: 'uid_p1', enrollSeq: 1 },   // ☠️ só-uid, sem p1Name/p2Name
    { p1Uid: 'uid_p2', p2Uid: 'uid_p3', enrollSeq: 2 },
  ];
  const comp = W._getCompetitors(t);
  ok('as 2 duplas continuam competindo', comp.length === 2, comp.length + '/2');
  ok('4 pessoas inscritas (dupla = 2)', W._personCount(t) === 4, W._personCount(t) + '/4');
}

// ── 6 · Inscrição é por uid — nome/e-mail iguais NÃO inscrevem estranho ──────
console.log('\n"Estou inscrito?" responde por uid:');
{
  const t = makeT();
  ok('organizador inscrito → inscrito',
    W._isUserEnrolledInTournament({ uid: ORG, displayName: POISON_NAME, email: POISON_EMAIL }, t) === true);
  // Estranho com o MESMO nome e o MESMO e-mail, uid diferente, fora de participants[].
  ok('estranho com nome+e-mail idênticos NÃO está inscrito',
    W._isUserEnrolledInTournament({ uid: 'uid_estranho', displayName: POISON_NAME, email: POISON_EMAIL }, t) === false);
}

// ── 6b · A porta gêmea: _userMatchesParticipant (botão + desinscrição) ───────
// Casar por e-mail/nome aqui responde "você está inscrito" pra quem NÃO está — e a
// desinscrição sai por esta mesma porta (desinscreveria a pessoa errada).
console.log('\n"Esta pessoa é esta inscrição?" — só uid decide (quem tem conta):');
{
  const M = W._userMatchesParticipant;
  const eu = { uid: ORG, displayName: POISON_NAME, email: POISON_EMAIL };
  const outro = { uid: 'uid_outro', displayName: POISON_NAME, email: POISON_EMAIL };

  ok('minha entrada (uid) casa comigo', M(eu, { uid: ORG }) === true);
  ok('entrada de OUTRO uid não casa comigo, mesmo com nome+e-mail idênticos',
    M(eu, { uid: 'uid_p1' }) === false);
  ok('e-mail gravado igual ao meu NÃO me identifica (entrada tem uid de outro)',
    M(eu, { uid: 'uid_p1', email: POISON_EMAIL }) === false);
  ok('nome gravado igual ao meu NÃO me identifica (entrada tem uid de outro)',
    M(eu, { uid: 'uid_p1', displayName: POISON_NAME, name: POISON_NAME }) === false);

  // Dupla por slots: cada slot é uma pessoa; o rótulo "A / B" é tipografia.
  ok('dupla: casa pelo uid do MEU slot (p2)', M(eu, { p1Uid: 'uid_p1', p2Uid: ORG }) === true);
  ok('dupla de outros não casa comigo (nomes/rótulo colidem)',
    M(eu, { p1Uid: 'uid_p1', p2Uid: 'uid_p2', displayName: POISON_NAME + ' / ' + POISON_NAME }) === false);
  ok('dupla: p2Email igual ao meu NÃO me inscreve',
    M(eu, { p1Uid: 'uid_p1', p2Uid: 'uid_p2', p2Email: POISON_EMAIL }) === false);

  // Exceção do cânone: fictício sem conta — nome digitado É a identidade.
  const fict = { name: 'Convidado da Quadra', displayName: 'Convidado da Quadra' };
  ok('fictício casa pelo nome digitado', M({ uid: 'uid_x', displayName: 'Convidado da Quadra' }, fict) === true);
  ok('fictício: nome diferente não casa', M(eu, fict) === false);
  ok('dupla de fictícios (rótulo legado "A / B") casa pelo nome',
    M({ uid: 'uid_x', displayName: 'Mari' }, { displayName: 'Mari / Flavia', name: 'Mari / Flavia' }) === true);

  // Fim a fim: o botão. Era o outro lado do sintoma (botão dizia Desinscrever-se).
  const t = makeT();
  ok('botão: inscrito por uid → "Desinscrever-se"',
    W._isUserEnrolledInTournament(eu, t) === true);
  ok('botão: não-inscrito com nome+e-mail idênticos → "Inscrever-se"',
    W._isUserEnrolledInTournament(outro, t) === false);
}

// ── 6c · "Sou o organizador?" é AUTORIZAÇÃO — e também é só uid ──────────────
// Aqui o veneno vale dinheiro: quem segurasse uma string de e-mail igual à `organizerEmail`
// ganhava as ferramentas do organizador (sortear, encerrar, apagar).
console.log('\n"Sou o organizador?" — só uid decide:');
{
  const t = makeT();
  const A = W.AppStore;
  const withUser = (u, fn) => { const old = A.currentUser; A.currentUser = u; try { return fn(); } finally { A.currentUser = old; } };

  ok('criador (creatorUid) é organizador',
    withUser({ uid: ORG, email: POISON_EMAIL, displayName: POISON_NAME }, () => A.isOrganizer(t)) === true);
  ok('IMPOSTOR com o e-mail do organizador NÃO é organizador',
    withUser({ uid: 'uid_impostor', email: POISON_EMAIL, displayName: POISON_NAME }, () => A.isOrganizer(t)) === false);
  ok('co-organizador ativo (por uid) é organizador',
    withUser({ uid: COHOST, email: 'outro@x.com', displayName: POISON_NAME }, () => A.isOrganizer(t)) === true);
  ok('IMPOSTOR com o e-mail do co-organizador NÃO é organizador',
    withUser({ uid: 'uid_impostor2', email: POISON_EMAIL, displayName: POISON_NAME }, () => A.isOrganizer(t)) === false);
  ok('inscrito comum não é organizador',
    withUser({ uid: 'uid_p1', email: POISON_EMAIL, displayName: POISON_NAME }, () => A.isOrganizer(t)) === false);

  // co-host PENDENTE não manda (regra de negócio preservada — só o status muda, não a identidade)
  const t2 = makeT();
  t2.coHosts = [{ uid: COHOST, email: POISON_EMAIL, status: 'pending' }];
  ok('co-organizador PENDENTE ainda não é organizador',
    withUser({ uid: COHOST, email: POISON_EMAIL }, () => A.isOrganizer(t2)) === false);
}

// ── 7 · Número de inscrição é por uid ────────────────────────────────────────
console.log('\nNº de inscrição por uid (nomes colidem):');
{
  const t = makeT();
  const map = W._buildEnrollOrderMap(t);
  const nums = ALL_UIDS.map((u) => W._enrollNumber(map, { uid: u }));
  ok('cada inscrito tem o SEU número (sem colisão por nome)',
    new Set(nums).size === ALL_UIDS.length, JSON.stringify(nums));
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' passaram · ' + fail + ' falharam\n');
process.exit(fail ? 1 : 0);
