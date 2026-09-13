/* MOVE O IMPORT DO LETZPLAY PARA DOCUMENTO PRÓPRIO — `users/{uid}` → `users/{uid}/letzplay/import`.
 *
 * ⛔ POR QUE. MEDIDO em 13/set/2026: 18 dos 279 perfis têm `letzplayImport`, somando 2.292
 * jogos, e o MAIOR ocupa **499 KB dentro do documento de perfil**. O Firestore entrega o
 * documento INTEIRO ou nada, então toda leitura da ficha dessas 18 pessoas pagava meio
 * megabyte — inclusive o próprio dono, a cada login.
 *
 * ⭐ EM DOIS TEMPOS, e o segundo é separado de propósito:
 *   ① COPIAR para o documento próprio (aditivo, não destrói nada);
 *   ② APAGAR o campo do perfil (`--apagar`), só depois de ① estar no ar e conferido.
 * Publicar ② junto de ① deixaria um app antigo sem import nenhum entre o deploy e o reload.
 *
 * Uso:  node scripts/mover-letzplay-import.js            (ensaio)
 *       node scripts/mover-letzplay-import.js --apply    (copia)
 *       node scripts/mover-letzplay-import.js --apply --apagar   (copia e limpa o campo)
 */
'use strict';
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const C = require(path.join(__dirname, '..', 'functions', 'letzplay-import-core.js'));

if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = process.argv.includes('--apply');
const APAGAR = process.argv.includes('--apagar');

(async () => {
  const perfis = await db.collection('users').get();
  let comImport = 0, copiados = 0, jaLa = 0, apagados = 0, maiorKB = 0, jogos = 0;
  for (const d of perfis.docs) {
    const p = d.data() || {};
    if (!C.precisaMover(p)) continue;
    comImport++;
    const kb = Buffer.byteLength(JSON.stringify(p.letzplayImport)) / 1024;
    if (kb > maiorKB) maiorKB = kb;
    jogos += p.letzplayImport.games.length;
    const ref = d.ref.collection(C.SUBCOLECAO).doc(C.DOC);
    const ja = await ref.get();
    if (ja.exists && Array.isArray((ja.data() || {}).games)) { jaLa++; }
    else if (APLICAR) { await ref.set(p.letzplayImport); copiados++; }

    if (APLICAR && APAGAR) {
      /* ⛔ SÓ APAGA DEPOIS DE CONFERIR QUE CHEGOU. Reler é barato; perder o import de alguém
       * não tem volta — ele veio de uma varredura manual na outra plataforma. */
      const conf = await ref.get();
      const bom = conf.exists && Array.isArray((conf.data() || {}).games) &&
        (conf.data() || {}).games.length === p.letzplayImport.games.length;
      if (bom) {
        await d.ref.update({ letzplayImport: admin.firestore.FieldValue.delete() });
        apagados++;
      } else {
        console.error('  ⛔ NÃO apaguei ' + d.id + ': o documento próprio não confere');
      }
    }
  }
  console.log('perfis: ' + perfis.size + '  |  com import: ' + comImport +
    '  |  jogos somados: ' + jogos + '  |  maior: ' + maiorKB.toFixed(1) + ' KB');
  console.log('  já no documento próprio: ' + jaLa + '  |  copiados agora: ' + copiados +
    '  |  campo apagado do perfil: ' + apagados);
  if (!APLICAR) console.log('\n(ENSAIO — nada gravado. Rode com --apply)');
  else if (!APAGAR) console.log('\n⚠️ O campo do perfil CONTINUA lá, de propósito. Só apague (--apagar) depois de a versão nova estar no ar.');
})().catch((e) => { console.error('FALHOU:', e.message); process.exit(1); });
