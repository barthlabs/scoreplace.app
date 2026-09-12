// ─── FORA DO `npm test` DE PROPÓSITO — exige EMULADOR do Firestore + Java ────
//   npm i --no-save @firebase/rules-unit-testing
//   JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
//     firebase emulators:exec --only firestore "node tests/rules/casual-apagar-e-lancar.mjs"
//
// L3.P5 — ordem do dono (12/set/2026): "tudo como está hoje. apagar sala só quem criou" e
// "lançar, qualquer um que esteja jogando na sala".
// O que existia: `allow write: if request.auth != null` cobria create, update E DELETE —
// qualquer pessoa logada apagava a sala de qualquer outra, e `cancelCasualMatch` é um
// `.delete()` cru sem dono do lado do cliente.
// A armadilha da regra nova: ENTRAR na sala também é um update (o recém-chegado se acrescenta
// a playerUids). Exigir "já ser jogador" trancaria a porta de entrada.
// MEDIDO em produção antes de escrever (24 salas): 2 SEM playerUids (seriam trancadas) e 0
// com o criador fora da lista.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, setDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';

const DONO = 'uid_dono', JOGA = 'uid_joga', CHEGANDO = 'uid_chegando', ESTRANHO = 'uid_estranho';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const tenta = async (p) => { try { await p; return true; } catch { return false; } };

const env = await initializeTestEnvironment({
  projectId: 'demo-scoreplace',
  /* ⛔ SEM PORTA CRAVADA: o `emulators:exec` anuncia onde subiu em FIRESTORE_EMULATOR_HOST.
     Cravar 8080 quebrou aqui em 12/set/2026 porque um serviço do próprio macOS (WebDriver)
     estava na porta — e o erro ("port taken") não tem nada a ver com o teste. */
  firestore: (() => {
    const [host, porta] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
    return { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(porta) };
  })(),
});

const semear = async (id, dados) => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'casualMatches', id), dados);
  });
};
const como = (uid) => env.authenticatedContext(uid).firestore();

// ── ① APAGAR: só quem criou ─────────────────────────────────────────────────
await semear('s1', { createdBy: DONO, playerUids: [DONO, JOGA], liveState: {} });
ok(!(await tenta(deleteDoc(doc(como(ESTRANHO), 'casualMatches', 's1')))),
  '① estranho NÃO apaga a sala de outro — era exatamente o que a regra antiga permitia');
ok(!(await tenta(deleteDoc(doc(como(JOGA), 'casualMatches', 's1')))),
  '① nem quem está JOGANDO apaga: o dono disse "só quem criou"');
ok(await tenta(deleteDoc(doc(como(DONO), 'casualMatches', 's1'))),
  '① quem criou apaga');

// ── ② LANÇAR: quem está jogando, o criador, e quem está entrando ────────────
await semear('s2', { createdBy: DONO, playerUids: [DONO, JOGA], liveState: { p1: 0 } });
ok(await tenta(updateDoc(doc(como(JOGA), 'casualMatches', 's2'), { liveState: { p1: 1 } })),
  '② quem está jogando lança o placar');
ok(await tenta(updateDoc(doc(como(DONO), 'casualMatches', 's2'), { liveState: { p1: 2 } })),
  '② quem criou também lança');
ok(!(await tenta(updateDoc(doc(como(ESTRANHO), 'casualMatches', 's2'), { liveState: { p1: 9 } }))),
  '② ⛔ quem não está na sala NÃO reescreve o placar de uma partida alheia');

// ── ③ ENTRAR pelo QR continua funcionando (é um update de quem ainda não está)
ok(await tenta(updateDoc(doc(como(CHEGANDO), 'casualMatches', 's2'),
  { playerUids: [DONO, JOGA, CHEGANDO] })),
  '③ quem chega pelo QR se acrescenta — a porta de entrada não fechou');
/* ⚠️ SALA LIMPA de propósito: na 's2' o CHEGANDO já entrou no teste acima, e passaria pela
   porta ③ ("já está jogando") — a asserção mediria outra coisa. Foi o próprio emulador que
   me mostrou isso. */
await semear('s2b', { createdBy: DONO, playerUids: [DONO, JOGA], liveState: {} });
ok(!(await tenta(updateDoc(doc(como(CHEGANDO), 'casualMatches', 's2b'),
  { playerUids: [CHEGANDO] }))),
  '③ ⛔ quem está DE FORA não entra expulsando os outros');
ok(!(await tenta(updateDoc(doc(como(CHEGANDO), 'casualMatches', 's2b'),
  { playerUids: [DONO, CHEGANDO] }))),
  '③ ⛔ nem entra tirando UM só');

/* ⛔ NINGUÉM EXPULSA NINGUÉM — ordem do dono, depois que este teste mostrou que dava.
   "se a pessoa quiser, ela sai da sala e cria outra". Vale para TODOS, inclusive quem criou. */
await semear('s2c', { createdBy: DONO, playerUids: [DONO, JOGA, CHEGANDO], liveState: {} });
ok(!(await tenta(updateDoc(doc(como(JOGA), 'casualMatches', 's2c'), { playerUids: [DONO, JOGA] }))),
  '③ ⛔ quem está na sala NÃO tira outro jogador');
ok(!(await tenta(updateDoc(doc(como(DONO), 'casualMatches', 's2c'), { playerUids: [DONO, JOGA] }))),
  '③ ⛔ nem QUEM CRIOU a sala pode expulsar');
ok(await tenta(updateDoc(doc(como(JOGA), 'casualMatches', 's2c'), { playerUids: [DONO, CHEGANDO] })),
  '③ mas cada um pode SAIR — tirar a si mesmo');
ok(!(await tenta(updateDoc(doc(como(DONO), 'casualMatches', 's2c'), { playerUids: [DONO, 'uid_outro'] }))),
  '③ ⛔ e ninguém acrescenta terceiro no lugar de quem saiu');
ok(!(await tenta(updateDoc(doc(como(ESTRANHO), 'casualMatches', 's2'),
  { playerUids: [DONO, JOGA, 'uid_terceiro'] }))),
  '③ ⛔ nem acrescentar OUTRA pessoa que não é ele');

// ── ④ sala ANTIGA sem playerUids segue como era (2 delas existem em produção)
await semear('s3', { createdBy: DONO, liveState: {} });
ok(await tenta(updateDoc(doc(como(ESTRANHO), 'casualMatches', 's3'), { liveState: { p1: 1 } })),
  '④ sala sem lista de jogadores segue aceitando update — senão as 2 de produção ficam órfãs');
ok(!(await tenta(deleteDoc(doc(como(ESTRANHO), 'casualMatches', 's3')))),
  '④ ⛔ mas apagar continua sendo só de quem criou, mesmo na sala antiga');

// ── ④b A SALA NÃO FICA SEM DONO, E A PROPRIEDADE NÃO SE ROUBA ───────────────
// Ordem do dono: "se quem criou sai da sala, os outros que ficam assumem a propriedade na
// ordem da entrada". Sem isso `createdBy` apontaria para quem saiu — e como APAGAR é só de
// quem criou, a sala ficaria órfã: ninguém lá dentro poderia encerrá-la.
await semear('d1', { createdBy: DONO, playerUids: [DONO, JOGA, CHEGANDO], liveState: {} });
ok(await tenta(updateDoc(doc(como(DONO), 'casualMatches', 'd1'),
  { playerUids: [JOGA, CHEGANDO], createdBy: JOGA })),
  '④b quem criou sai e passa a propriedade ao PRIMEIRO que sobrou (ordem de entrada)');
await semear('d2', { createdBy: DONO, playerUids: [DONO, JOGA, CHEGANDO], liveState: {} });
ok(!(await tenta(updateDoc(doc(como(DONO), 'casualMatches', 'd2'),
  { playerUids: [JOGA, CHEGANDO], createdBy: CHEGANDO }))),
  '④b ⛔ e não escolhe a dedo quem herda — é o primeiro da ordem, não um favorito');
ok(!(await tenta(updateDoc(doc(como(JOGA), 'casualMatches', 'd2'), { createdBy: JOGA }))),
  '④b ⛔ ninguém se declara dono estando na sala — seria ganhar o direito de apagá-la');
ok(!(await tenta(updateDoc(doc(como(DONO), 'casualMatches', 'd2'), { createdBy: JOGA }))),
  '④b ⛔ nem o dono passa a bola sem sair');

// ── ⑤ JOGO CONCLUÍDO É HISTÓRIA: ninguém escreve, salvo o "era eu jogando" ──
// Regra do dono: "jogos concluídos viram história... ninguém mais escreve nada neles, salvo
// aquilo de aceitar o apontamento de que era eu mesmo jogando, que pode acontecer dias depois".
// MEDIDO: as 24 salas de produção têm TODAS resultado — a coleção inteira é história, e toda
// ela estava aberta para escrita.
await semear('h1', { createdBy: DONO, playerUids: [DONO, JOGA], result: { p1: 6, p2: 4 }, players: [] });
ok(!(await tenta(updateDoc(doc(como(DONO), 'casualMatches', 'h1'), { result: { p1: 9, p2: 0 } }))),
  '⑤ ⛔ nem QUEM CRIOU reescreve o placar de um jogo encerrado — virou história');
ok(!(await tenta(updateDoc(doc(como(JOGA), 'casualMatches', 'h1'), { result: { p1: 9, p2: 0 } }))),
  '⑤ ⛔ nem quem jogou');
ok(!(await tenta(updateDoc(doc(como(ESTRANHO), 'casualMatches', 'h1'), { liveState: { p1: 1 } }))),
  '⑤ ⛔ e estranho não mexe em nada — era isto que estava aberto em TODA a coleção');
ok(await tenta(updateDoc(doc(como(CHEGANDO), 'casualMatches', 'h1'),
  { playerUids: [DONO, JOGA, CHEGANDO], participants: [], players: [] })),
  '⑤ mas o "era eu jogando" passa, dias depois — é a única exceção que o dono nomeou');
ok(!(await tenta(updateDoc(doc(como(CHEGANDO), 'casualMatches', 'h1'),
  { playerUids: [DONO, JOGA, CHEGANDO], result: { p1: 9, p2: 0 } }))),
  '⑤ ⛔ e não dá para pegar carona nele para mexer no placar junto');

// ── ⑥ criar e ler não mudaram ───────────────────────────────────────────────
ok(await tenta(setDoc(doc(como(ESTRANHO), 'casualMatches', 's4'), { createdBy: ESTRANHO, playerUids: [ESTRANHO] })),
  '⑥ qualquer pessoa logada cria sala, como antes');
ok(await tenta(getDoc(doc(env.unauthenticatedContext().firestore(), 'casualMatches', 's2'))),
  '⑥ leitura segue ABERTA sem login — é o que faz o entrar-por-QR funcionar');

await env.cleanup();
console.log(`\n${fail ? '❌' : '✅'} casual: apagar e lançar — ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
