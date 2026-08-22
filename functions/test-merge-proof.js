/* test-merge-proof.js — FUNDIR EXIGE CREDENCIAL AUTENTICADA, NOS DOIS CAMINHOS.
 *
 * REPRODUZ A FALHA REAL (19/ago/2026, Confra BT Alta da Clínica):
 * Marjorie Cilone (nasc. 1954, marjoriecilone@gmail.com) e Ana Carolina Cilone (nasc. 1981,
 * accilone@gmail.com) — mãe e filha — cadastraram o MESMO celular no PERFIL. Às 04:45 a
 * varredura diária (`scheduledAutoMergeCleanup` → `_scanAndMergeByField`) fundiu as duas.
 * A conta da filha foi apagada do Auth, o e-mail dela virou `loginRedirects` pra conta da
 * mãe, e o uid-sweep deixou a mãe em DOIS grupos do torneio (34×4=136 vagas, 135 pessoas).
 *
 * A causa NÃO foi a regra: ela existia desde 11/ago. Foi a regra morar em UM caminho só —
 * o trigger `autoMergeOnProfileUpdate` tinha o gate, a varredura diária não. Por isso este
 * arquivo cobra três coisas, e a do meio é a que impede a falha de voltar:
 *   1. a decisão de credencial (pura) recusa o caso Cilone;
 *   2. a decisão DA VARREDURA, exercitada de verdade, não funde o par Cilone;
 *   3. os dois chamadores automáticos passam pela MESMA porta.
 */
const fs = require('fs');
const path = require('path');
const rules = require('./merge-rules');
const sweep = require('./merge-sweep-core');

let falhas = 0;
function ok(nome, cond) {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome); falhas++;
}

// ── O par REAL. O celular está no PERFIL das duas (texto digitado), mas nenhuma tem SMS
// conferido no Auth, e os e-mails são diferentes. É exatamente o que a varredura fundiu.
const AUTH = {
  bp7Vvo: { uid: 'bp7Vvo', email: 'marjoriecilone@gmail.com', emailVerified: true, phoneNumber: null },
  // ⚠️ o celular está AUTENTICADO só de um lado (o Auth do Firebase é único por número) —
  // por isso "os dois lados provam" nunca poderia dar verdadeiro aqui.
  O5NYjV: { uid: 'O5NYjV', email: 'accilone@gmail.com', emailVerified: true, phoneNumber: '+5511981812440' },
};
// O "não somos a mesma pessoa" REAL, gravado nos dois perfis em 18/ago às 20:01 BRT —
// 5h44 antes de a varredura fundir as duas assim mesmo.
const DISMISSED = {
  bp7Vvo: { dupDismissedInfo: [{ uid: 'O5NYjV', motivo: 'celular', forca: 9, at: '2026-08-18T23:01:51.642Z' }] },
  O5NYjV: { dupDismissedInfo: [{ uid: 'bp7Vvo', motivo: 'celular', forca: 9, at: '2026-08-18T23:01:51.645Z' }] },
};
const docsCilone = (comDispensa) => [
  { id: 'bp7Vvo', data: () => Object.assign({ displayName: 'Marjorie Cilone', phone: '+5511981812440', birthDate: '1954-10-04' }, comDispensa ? DISMISSED.bp7Vvo : {}) },
  { id: 'O5NYjV', data: () => Object.assign({ displayName: 'Ana Carolina Cilone', phone: '+5511981812440', birthDate: '1981-08-22' }, comDispensa ? DISMISSED.O5NYjV : {}) },
];
const DOCS_CILONE = docsCilone(false);
// A decisão usada pela varredura é a MESMA função da produção — só o Auth é dublê.
const provaCom = (tabela) => async (a, b) => rules.mayAutoMerge(
  { uid: a.id, auth: tabela[a.id] || null, data: (a.data && a.data()) || {} },
  { uid: b.id, auth: tabela[b.id] || null, data: (b.data && b.data()) || {} });
const pickKeepPrimeiro = async (a) => a;   // dublê do _determineMergeWinner

console.log('\n=== 1. a decisão de credencial (credentialsProveSamePerson) ===');

ok('Cilone (celular autenticado de UM lado só, e-mails diferentes) → NÃO prova',
  rules.credentialsProveSamePerson(AUTH.bp7Vvo, AUTH.O5NYjV).proven === false);

ok('mesmo celular AUTENTICADO nos dois lados → prova (by phone)', (function () {
  const r = rules.credentialsProveSamePerson(
    { phoneNumber: '+5511981812440' }, { phoneNumber: '+55 11 98181-2440' });
  return r.proven === true && r.by === 'phone';
})());

ok('e-mail verificado igual nos dois lados → prova (by email)', (function () {
  const r = rules.credentialsProveSamePerson(
    { email: 'A.Pessoa@Gmail.com', emailVerified: true },
    { email: 'a.pessoa@gmail.com', emailVerified: true });
  return r.proven === true && r.by === 'email';
})());

ok('e-mail igual mas NÃO verificado de um lado → NÃO prova',
  rules.credentialsProveSamePerson(
    { email: 'x@y.com', emailVerified: true },
    { email: 'x@y.com', emailVerified: false }).proven === false);

ok('só um lado tem celular autenticado → NÃO prova',
  rules.credentialsProveSamePerson(
    { phoneNumber: '+5511999999999' }, { phoneNumber: null }).proven === false);

ok('celulares autenticados DIFERENTES → NÃO prova',
  rules.credentialsProveSamePerson(
    { phoneNumber: '+5511999999999' }, { phoneNumber: '+5511888888888' }).proven === false);

ok('Auth ausente dos dois lados (conta já apagada) → NÃO prova',
  rules.credentialsProveSamePerson(null, null).proven === false);

console.log('\n=== 2. a VARREDURA sobre o par real da Confra (planSweepMerges) ===');

(async function () {
  // ⛔ O caso que quebrou: se este bloco voltar a fundir, a varredura de amanhã às 04:45
  // apaga a conta de mais alguém.
  const plano = await sweep.planSweepMerges(DOCS_CILONE, {
    pickKeep: pickKeepPrimeiro, proof: provaCom(AUTH),
  });
  ok('par Cilone: ZERO fusões planejadas', plano.merges.length === 0);
  ok('par Cilone: recusa registrada (aparece no log da varredura)',
    plano.refused.length === 1 && plano.refused[0].dropUid === 'O5NYjV');

  // A varredura NÃO pode virar inútil: com credencial de verdade ela tem que fundir.
  const authOk = {
    bp7Vvo: { phoneNumber: '+5511981812440' },
    O5NYjV: { phoneNumber: '+5511981812440' },
  };
  const plano2 = await sweep.planSweepMerges(DOCS_CILONE, {
    pickKeep: pickKeepPrimeiro, proof: provaCom(authOk),
  });
  ok('mesmo par COM celular autenticado nos dois → funde (1 fusão, 0 recusas)',
    plano2.merges.length === 1 && plano2.refused.length === 0 && plano2.merges[0].by === 'phone');

  // ⛔ O "NÃO SOMOS A MESMA PESSOA" da tela vale contra o cron — mesmo com credencial.
  // Automático nunca passa por cima de um "não" explícito de gente; quem funde par
  // dispensado é o fluxo interativo, onde a pessoa prova posse e decide na hora.
  const plano2b = await sweep.planSweepMerges(docsCilone(true), {
    pickKeep: pickKeepPrimeiro, proof: provaCom(authOk),
  });
  ok('par DISPENSADO ("não somos a mesma pessoa") → NÃO funde, mesmo com credencial',
    plano2b.merges.length === 0 && plano2b.refused[0].reason === 'dispensado');
  ok('basta UM lado ter dispensado', (function () {
    const so1 = [
      { id: 'bp7Vvo', data: () => ({}) },
      { id: 'O5NYjV', data: () => DISMISSED.O5NYjV },
    ];
    return rules.dismissalBlocksMerge(so1[0].data(), so1[1].data(), 'bp7Vvo', 'O5NYjV').dismissed === true;
  })());
  ok('dispensa de OUTRA pessoa não bloqueia este par',
    rules.dismissalBlocksMerge(
      { dupDismissedInfo: [{ uid: 'terceiro' }] }, {}, 'bp7Vvo', 'O5NYjV').dismissed === false);
  ok('formato legado (dupDismissed: array de uid) também bloqueia',
    rules.dismissalBlocksMerge(
      { dupDismissed: ['O5NYjV'] }, {}, 'bp7Vvo', 'O5NYjV').dismissed === true);

  // Grupo de 3: só quem prova entra; os outros ficam de pé.
  const authParcial = {
    A: { phoneNumber: '+551130000000' }, B: { phoneNumber: '+551130000000' }, C: { phoneNumber: null },
  };
  const plano3 = await sweep.planSweepMerges(
    [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    { pickKeep: pickKeepPrimeiro, proof: provaCom(authParcial) });
  ok('grupo de 3: funde só o par provado, recusa o resto',
    plano3.keepUid === 'A' && plano3.merges.length === 1 && plano3.merges[0].dropUid === 'B' &&
    plano3.refused.length === 1 && plano3.refused[0].dropUid === 'C');

  // Falha de infraestrutura não pode virar "pode fundir".
  const planoErro = await sweep.planSweepMerges(DOCS_CILONE, {
    pickKeep: pickKeepPrimeiro, proof: async () => { throw new Error('auth fora do ar'); },
  });
  ok('erro ao buscar a prova → NÃO funde', planoErro.merges.length === 0);
  const planoSemDeps = await sweep.planSweepMerges(DOCS_CILONE, {});
  ok('sem as dependências injetadas → NÃO funde', planoSemDeps.merges.length === 0);

  console.log('\n=== 3. as DUAS portas automáticas passam pela MESMA regra ===');

  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  function trechoAteOMerge(marcador) {
    const i = src.indexOf(marcador);
    if (i < 0) return null;
    const j = src.indexOf('_executeMerge(', i);
    return (j < 0) ? null : src.slice(i, j);
  }
  const tSweep = trechoAteOMerge('async function _scanAndMergeByField');
  const tTrigger = trechoAteOMerge('exports.autoMergeOnProfileUpdate');

  ok('_scanAndMergeByField existe e chama _executeMerge', !!tSweep);
  ok('autoMergeOnProfileUpdate existe e chama _executeMerge', !!tTrigger);
  ok('VARREDURA DIÁRIA decide pelo merge-sweep-core (nada de gate escrito à mão)',
    !!tSweep && tSweep.indexOf('planSweepMerges') >= 0);
  ok('VARREDURA DIÁRIA só funde o que o plano autorizou (itera plano.merges)',
    !!tSweep && /for\s*\(\s*const\s+\w+\s+of\s+plano\.merges\s*\)/.test(tSweep));
  ok('TRIGGER passa por _mayAutoMerge antes de fundir',
    !!tTrigger && tTrigger.indexOf('_mayAutoMerge') >= 0);
  ok('_mayAutoMerge delega pra regra pura (nada de decisão escrita à mão no index)', (function () {
    const i = src.indexOf('async function _mayAutoMerge');
    return i >= 0 && src.slice(i, i + 700).indexOf('_mergeRules.mayAutoMerge') >= 0;
  })());

  console.log('\n' + (falhas === 0 ? '✅ merge-proof: todas as asserções passaram' : '❌ merge-proof: ' + falhas + ' falha(s)'));
  process.exit(falhas === 0 ? 0 : 1);
})();
