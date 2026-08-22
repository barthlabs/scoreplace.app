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
  O5NYjV: { uid: 'O5NYjV', email: 'accilone@gmail.com', emailVerified: true, phoneNumber: null },
};
const DOCS_CILONE = [
  { id: 'bp7Vvo', data: () => ({ displayName: 'Marjorie Cilone', phone: '+5511981812440', birthDate: '1954-10-04' }) },
  { id: 'O5NYjV', data: () => ({ displayName: 'Ana Carolina Cilone', phone: '+5511981812440', birthDate: '1981-08-22' }) },
];
// A prova usada pela varredura é a MESMA função da produção — só o Auth é dublê.
const provaCom = (tabela) => async (a, b) =>
  rules.credentialsProveSamePerson(tabela[a] || null, tabela[b] || null);
const pickKeepPrimeiro = async (a) => a;   // dublê do _determineMergeWinner

console.log('\n=== 1. a decisão de credencial (credentialsProveSamePerson) ===');

ok('Cilone (mesmo celular DIGITADO no perfil, e-mails diferentes) → NÃO prova',
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
  ok('TRIGGER passa por _provenSamePerson antes de fundir',
    !!tTrigger && tTrigger.indexOf('_provenSamePerson') >= 0);
  ok('_provenSamePerson delega pra credentialsProveSamePerson (regra pura)', (function () {
    const i = src.indexOf('async function _provenSamePerson');
    return i >= 0 && src.slice(i, i + 700).indexOf('credentialsProveSamePerson') >= 0;
  })());

  console.log('\n' + (falhas === 0 ? '✅ merge-proof: todas as asserções passaram' : '❌ merge-proof: ' + falhas + ' falha(s)'));
  process.exit(falhas === 0 ? 0 : 1);
})();
