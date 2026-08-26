#!/usr/bin/env node
/* desfazer-divisao.js — devolve os JOGOS pro documento do torneio. É a volta do salto.
 *
 * ⛔ ESCRITO ANTES DE SALTAR, não depois. Volta que se escreve no susto é volta que não
 * funciona: na hora em que ela é necessária, ninguém está calmo e o torneio está ao vivo.
 *
 * DUAS FONTES, nesta ordem de preferência:
 *   ① a SUBCOLEÇÃO viva (`tournaments/{id}/matches`) — traz tudo que aconteceu DEPOIS da
 *      divisão. É a certa em quase todo caso.
 *   ② o BACKUP CONGELADO (`tournaments_backup/{id}`) — o documento como era ANTES de
 *      dividir. ⚠️ Ele NÃO tem o que aconteceu depois: usar isto perde placar lançado no
 *      meio. Só com `--do-backup`, e o script diz na cara o que se perde.
 *
 * Uso:  node scripts/desfazer-divisao.js <id>                 # em seco, pela subcoleção
 *       node scripts/desfazer-divisao.js <id> --aplicar
 *       node scripts/desfazer-divisao.js <id> --do-backup --aplicar
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = process.argv.indexOf('--aplicar') !== -1;
const DO_BACKUP = process.argv.indexOf('--do-backup') !== -1;
const ID = process.argv[2];
const kb = (v) => (Buffer.byteLength(JSON.stringify(v) || '', 'utf8') / 1024).toFixed(1) + ' KB';
const morre = (m) => { console.error('\n⛔ ' + m + '\n   NADA foi alterado.'); process.exit(1); };

(async () => {
  if (!ID || ID.startsWith('--')) morre('uso: node scripts/desfazer-divisao.js <id> [--do-backup] [--aplicar]');
  const ref = db.collection('tournaments').doc(String(ID));
  const doc = await ref.get();
  if (!doc.exists) morre('torneio ' + ID + ' não existe');
  const config = doc.data();

  let inteiro, fonte;
  if (DO_BACKUP) {
    const b = await db.collection('tournaments_backup').doc(String(ID)).get();
    if (!b.exists) morre('não há backup congelado pra ' + ID);
    inteiro = (b.data() || {}).doc;
    if (!inteiro) morre('o backup existe mas está vazio');
    fonte = 'BACKUP congelado de ' + ((b.data() || {}).em || '?');
    console.log('⚠️  VOLTANDO PELO BACKUP: o que aconteceu DEPOIS da divisão SE PERDE.');
    const viva = await ref.collection('matches').get();
    console.log('   (a subcoleção viva tem ' + viva.size + ' jogos agora — considere voltar por ela)');
  } else {
    if (!Array.isArray(config._semPesados) || config._semPesados.indexOf('matches') === -1) {
      console.log('este torneio não está dividido — nada a desfazer'); process.exit(0);
    }
    /* ⛔ TODAS as partes que saíram, não só os jogos.
     * O ENSAIO pegou isto: a volta remontava só `matches` e devolvia o torneio SEM os
     * inscritos — e a volta é o caminho de EMERGÊNCIA, o pior lugar possível pra ter um
     * esquecimento. Quem usa isto está com o app quebrado e não vai conferir campo a campo.
     * ⇒ A lista sai do próprio `_semPesados` do documento, nunca de uma lista minha. */
    const partes = { config: JSON.parse(JSON.stringify(config)) };
    const cont = [];
    for (const nome of config._semPesados) {
      const sub = await ref.collection(nome).get();
      partes[nome] = sub.docs.map((d) => d.data());
      cont.push(sub.size + ' ' + nome);
    }
    if (!(partes.matches || []).length && config._semPesados.indexOf('matches') !== -1) {
      morre('a subcoleção de jogos está VAZIA — não vou gravar torneio sem jogo por cima.\n' +
            '   Se isto é esperado, use --do-backup (e leia o aviso).');
    }
    inteiro = S.remontar(partes);
    if (!inteiro) morre('remontar falhou — não vou gravar nada');
    fonte = 'SUBCOLEÇÕES vivas (' + cont.join(' · ') + ')';
  }
  delete inteiro._semPesados;
  delete inteiro._nJogos;      // só faz sentido dividido
  inteiro.id = String(ID);

  const nJogos = (S.dividir(JSON.parse(JSON.stringify(inteiro))).matches || []).length;
  console.log('═══ ' + (inteiro.name || ID));
  console.log('  fonte .................. ' + fonte);
  console.log('  jogos a devolver ....... ' + nJogos);
  console.log('  documento ficará com ... ' + kb(inteiro));
  const teto = 1024;
  if (Buffer.byteLength(JSON.stringify(inteiro), 'utf8') / 1024 > teto * 0.9) {
    morre('o documento passaria de 90% do teto de 1 MB — voltar aqui seria trocar um problema por outro.');
  }
  if (!APLICAR) { console.log('\n(em seco — nada gravado; rode com --aplicar)'); process.exit(0); }

  await ref.set(inteiro);
  console.log('  ✓ documento restaurado com os jogos dentro');
  console.log('  ⚠️ a subcoleção `matches` FICA como está — ela é o espelho de novo, e apagar');
  console.log('     aqui seria destruir a única outra cópia no exato momento de um susto.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
