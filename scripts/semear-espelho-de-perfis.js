/* SEMEADURA DO ESPELHO PÚBLICO DE PERFIS — `users/{uid}` → `usersPublic/{uid}`.
 *
 * O gatilho `espelhoDoPerfilPublico` mantém o espelho de quem MEXER no perfil daqui pra
 * frente. Quem não mexer nunca aparece — e "nunca aparece" numa busca é a pessoa sumir da
 * lista. Esta semeadura resolve o passado.
 *
 * ⛔ USA A MESMA REGRA DO GATILHO (`functions/perfil-publico-core.js`). Se a semeadura
 * tivesse a própria cópia da lista de campos, as duas divergiriam no primeiro campo novo —
 * e a divergência apareceria como "a busca mostra um dado que o espelho não deveria ter".
 *
 * ⭐ IDEMPOTENTE: grava o documento derivado do perfil, com `set`. Rodar duas vezes dá o
 * mesmo resultado.
 *
 * Uso:  node scripts/semear-espelho-de-perfis.js            (ensaio: conta e compara)
 *       node scripts/semear-espelho-de-perfis.js --apply    (grava)
 */
'use strict';
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const C = require(path.join(__dirname, '..', 'functions', 'perfil-publico-core.js'));

if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = process.argv.includes('--apply');

(async () => {
  const perfis = await db.collection('users').get();
  const espelhos = await db.collection('usersPublic').get();
  const jaTem = {};
  espelhos.forEach((d) => { jaTem[d.id] = d.data() || {}; });

  let faltando = 0, diferente = 0, iguais = 0, gravados = 0;
  let lote = db.batch(), n = 0;
  const vivos = {};

  for (const d of perfis.docs) {
    vivos[d.id] = 1;
    const novo = C.perfilPublico(d.data() || {});
    const atual = jaTem[d.id];
    if (!atual) faltando++;
    else if (JSON.stringify(atual) !== JSON.stringify(novo)) diferente++;
    else { iguais++; continue; }

    if (APLICAR) {
      lote.set(db.collection('usersPublic').doc(d.id), novo);
      gravados++;
      if (++n % 400 === 0) { await lote.commit(); lote = db.batch(); n = 0; }
    }
  }

  // ⛔ ESPELHO ÓRFÃO É GENTE QUE NÃO EXISTE MAIS APARECENDO NA BUSCA.
  const orfaos = espelhos.docs.filter((d) => !vivos[d.id]);
  for (const d of orfaos) {
    if (APLICAR) {
      lote.delete(d.ref);
      if (++n % 400 === 0) { await lote.commit(); lote = db.batch(); n = 0; }
    }
  }
  if (APLICAR && n > 0) await lote.commit();

  console.log('perfis: ' + perfis.size + '  |  espelhos antes: ' + espelhos.size);
  console.log('  já iguais:   ' + iguais);
  console.log('  faltando:    ' + faltando);
  console.log('  divergentes: ' + diferente);
  console.log('  órfãos:      ' + orfaos.length);
  if (!APLICAR) { console.log('\n(ENSAIO — nada gravado. Rode com --apply)'); return; }
  console.log('\n✓ gravados: ' + gravados + '  |  órfãos removidos: ' + orfaos.length);

  // ⚠️ CONFERÊNCIA DEPOIS DE GRAVAR, não antes: quem diz que deu certo é a releitura.
  const fim = await db.collection('usersPublic').get();
  let comEmail = 0, comTelefone = 0;
  fim.forEach((d) => {
    const v = d.data() || {};
    if (v.email || v.email_lower || v.linkedEmails) comEmail++;
    if (v.phone || v.linkedPhones) comTelefone++;
  });
  console.log('✓ espelhos agora: ' + fim.size + ' (perfis: ' + perfis.size + ')');
  console.log((comEmail || comTelefone ? '✗ VAZOU — ' : '✓ ') + 'com e-mail: ' + comEmail + ' | com telefone: ' + comTelefone);
  if (comEmail || comTelefone) process.exit(1);
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
