#!/usr/bin/env node
/* dividir-jogos.js — tira os JOGOS do documento do torneio. É o passo que remove o teto.
 *
 * O teto do Firestore é 1 MB POR DOCUMENTO. No Confra `rounds` são 97 KB de 214 KB (45%).
 * Depois disto, o documento guarda a config e os jogos vivem em `tournaments/{id}/matches`.
 *
 * ⛔ BACKUP CONGELADO É PRÉ-REQUISITO, NÃO OPÇÃO (ordem do dono, 26/ago: _"precisamos ter
 * aquele backup no sistema antigo inerte"_). Antes de dividir, o documento INTEIRO — como
 * ele está agora, com os jogos dentro — é copiado pra `tournaments_backup/{id}`. O backup
 * é CONFERIDO relendo do banco antes de qualquer escrita destrutiva. Ele fica inerte até o
 * dono mandar apagar: nenhuma CF escreve nele, nenhuma regra deixa o cliente ler.
 *
 * ⛔ E A ORDEM É SAGRADA:
 *   ① backup     → relê e confere campo a campo
 *   ② subcoleção → escreve os jogos e CONFERE que remontar() devolve o original
 *   ③ marcador   → só agora o documento perde os jogos
 * Inverter qualquer par abre uma janela onde o dado só existe num lugar que ainda não foi
 * provado. E o passo ③ é o único destrutivo — ele vem por último de propósito.
 *
 * Voltar atrás: scripts/desfazer-divisao.js (restaura do backup, ou remonta da subcoleção).
 *
 * Uso:  node scripts/dividir-jogos.js <idDoTorneio>            # em seco
 *       node scripts/dividir-jogos.js <idDoTorneio> --aplicar
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = process.argv.indexOf('--aplicar') !== -1;
const ID = process.argv[2];
const kb = (v) => (Buffer.byteLength(JSON.stringify(v) || '', 'utf8') / 1024).toFixed(1) + ' KB';
const morre = (m) => { console.error('\n⛔ ' + m + '\n   NADA foi alterado.'); process.exit(1); };

(async () => {
  if (!ID || ID.startsWith('--')) morre('uso: node scripts/dividir-jogos.js <idDoTorneio> [--aplicar]');
  const ref = db.collection('tournaments').doc(String(ID));
  const doc = await ref.get();
  if (!doc.exists) morre('torneio ' + ID + ' não existe');
  const t = doc.data();
  t.id = String(ID);

  if (Array.isArray(t._semPesados) && t._semPesados.indexOf('matches') !== -1) {
    console.log('já dividido (_semPesados = [' + t._semPesados.join(', ') + ']) — nada a fazer');
    process.exit(0);
  }

  // ── a prova que autoriza dividir: remontar(dividir(t)) tem que ser IDÊNTICO a t ──
  const partes = S.dividir(JSON.parse(JSON.stringify(t)));
  const volta = S.remontar(JSON.parse(JSON.stringify(partes)));
  if (!volta || !S.iguais(volta, t)) {
    morre('remontar(dividir(t)) NÃO devolveu o original — este torneio não pode ser dividido.\n' +
          '   É a propriedade que autoriza o passo inteiro. Sem ela, dividir perde dado.');
  }
  const nJogos = (partes.matches || []).length;
  console.log('═══ ' + (t.name || ID));
  console.log('  documento hoje ......... ' + kb(t));
  console.log('  jogos a mover .......... ' + nJogos);
  console.log('  documento depois ....... ' + kb(partes.config) + '   ⭐');
  console.log('  ✓ remontar(dividir(t)) === t   (a propriedade que autoriza o passo)');
  if (!APLICAR) { console.log('\n(em seco — nada gravado; rode com --aplicar)'); process.exit(0); }

  // ── ① BACKUP CONGELADO, e conferido relendo ──────────────────────────────────
  const bref = db.collection('tournaments_backup').doc(String(ID));
  await bref.set({
    doc: t,
    motivo: 'antes de dividir os jogos (Fase 2c)',
    em: new Date().toISOString(),
    versaoApp: (t._versaoApp || ''),
    jogos: nJogos
  });
  const bvolta = await bref.get();
  const bdados = (bvolta.data() || {}).doc;
  if (!bdados || !S.iguais(bdados, t)) morre('o BACKUP releu diferente do original — não vou dividir nada.');
  console.log('  ✓ backup congelado em tournaments_backup/' + ID + ' e CONFERIDO relendo');

  // ── ② a subcoleção recebe os jogos, e é conferida remontando DELA ────────────
  const col = ref.collection('matches');
  let lote = db.batch(), n = 0;
  for (const m of partes.matches) {
    lote.set(col.doc(String(m._chave)), m);
    if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; }
  }
  if (n) await lote.commit();
  const lidos = await col.get();
  const remontado = S.remontar({ config: JSON.parse(JSON.stringify(partes.config)),
                                 matches: lidos.docs.map((d) => d.data()) });
  if (!remontado || !S.iguais(remontado, t)) {
    morre('a subcoleção NÃO remonta o torneio original (' + lidos.size + ' jogos lidos).\n' +
          '   O documento segue INTACTO — nada foi perdido. Confira antes de repetir.');
  }
  console.log('  ✓ ' + lidos.size + ' jogos na subcoleção, e remontar DELA devolve o original');

  // ── ③ só agora o documento perde os jogos ───────────────────────────────────
  const config = JSON.parse(JSON.stringify(partes.config));
  config._semPesados = ['matches'];
  await ref.set(config);
  console.log('  ✓ documento dividido: ' + kb(t) + ' → ' + kb(config));
  console.log('\n✅ pronto. Pra voltar:  node scripts/desfazer-divisao.js ' + ID + ' --aplicar');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
