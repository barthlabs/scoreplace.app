// ─── FORA DO `npm test` DE PROPÓSITO ────────────────────────────────────────
// Este teste exige EMULADOR do Firestore + Java, que a CI do GitHub Pages não tem —
// por isso ele não entra no gate das 275 suítes puras. Roda sob demanda:
//
//   npm i --no-save @firebase/rules-unit-testing
//   JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="$JAVA_HOME/bin:$PATH" \
//     firebase emulators:exec --only firestore "node tests/rules/stats-visibility.mjs"
//
// Rodar SEMPRE que mexer em `statsVisibility` ou no bloco matchHistory das regras.
// Resultado em 06/ago/2026 (v1.7.51): 13 ok · 0 falhas.
//
// Prova de comportamento da regra `statsVisibility` (v1.7.51) contra o EMULADOR,
// usando o firestore.rules REAL do projeto.
//
// Os 4 estados que importam:
//   ausente  → 185 contas de hoje → QUALQUER autenticado lê (default 'public')
//   'public' → qualquer autenticado lê
//   'friends'→ SÓ quem está no array `friends` do dono
//   'private'→ SÓ o dono
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'sp-rules-test',
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});

// Semeia os perfis IGNORANDO as regras (é o estado do banco, não uma ação de usuário).
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await db.doc('users/legado').set({ displayName: 'Sem o campo', friends: ['amigo'] });
  await db.doc('users/aberto').set({ statsVisibility: 'public',  friends: [] });
  await db.doc('users/soAmigos').set({ statsVisibility: 'friends', friends: ['amigo'] });
  await db.doc('users/fechado').set({ statsVisibility: 'private', friends: ['amigo'] });
  for (const u of ['legado', 'aberto', 'soAmigos', 'fechado']) {
    await db.doc(`users/${u}/matchHistory/m1`).set({ matchType: 'tournament', finishedAt: 1 });
  }
});

const amigo    = env.authenticatedContext('amigo').firestore();
const estranho = env.authenticatedContext('estranho').firestore();
const anon     = env.unauthenticatedContext().firestore();
const dono     = (uid) => env.authenticatedContext(uid).firestore();

const hist = (db, uid) => db.collection(`users/${uid}/matchHistory`).get();

let ok = 0, fail = 0;
async function t(nome, p) {
  try { await p; console.log('  ✓', nome); ok++; }
  catch (e) { console.log('  ✗', nome, '→', e.message.slice(0, 90)); fail++; }
}

console.log('\nLEGADO (campo ausente = público, as 185 contas de hoje)');
await t('o dono lê o próprio',            assertSucceeds(hist(dono('legado'), 'legado')));
await t('amigo lê',                        assertSucceeds(hist(amigo, 'legado')));
await t('ESTRANHO lê (é o default)',       assertSucceeds(hist(estranho, 'legado')));
await t('anônimo NÃO lê',                  assertFails(hist(anon, 'legado')));

console.log("\n'public' — escolha explícita de abrir");
await t('estranho lê',                     assertSucceeds(hist(estranho, 'aberto')));

console.log("\n'friends' — só quem está na lista do DONO");
await t('o dono lê o próprio',             assertSucceeds(hist(dono('soAmigos'), 'soAmigos')));
await t('amigo lê',                        assertSucceeds(hist(amigo, 'soAmigos')));
await t('ESTRANHO é BARRADO',              assertFails(hist(estranho, 'soAmigos')));

console.log("\n'private' — só o dono");
await t('o dono lê o próprio',             assertSucceeds(hist(dono('fechado'), 'fechado')));
await t('AMIGO é barrado',                 assertFails(hist(amigo, 'fechado')));
await t('ESTRANHO é barrado',              assertFails(hist(estranho, 'fechado')));

console.log('\nESCRITA não muda: visibilidade decide quem LÊ');
await t('o dono escreve no próprio',       assertSucceeds(dono('aberto').doc('users/aberto/matchHistory/m2').set({ x: 1 })));
await t('terceiro NÃO escreve (nem público)', assertFails(estranho.doc('users/aberto/matchHistory/m3').set({ x: 1 })));

await env.cleanup();
console.log(`\n${ok} ok · ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
