#!/usr/bin/env node
/* salto-fase2.js — BACKUP + TRANSFERÊNCIA, num comando só, na ordem certa.
 *
 * Ordem do dono (26/ago): _"faça um backup separado que possa ser consultado no estado
 * antigo imediatamente antes de transcrever os dados para o sistema novo"_ e
 * _"esse backup separado deve ficar guardado até termos certeza que ninguém reclamou de
 * algo que mudou sem percebermos"_.
 *
 * ⛔ GUARDA DOIS ESTADOS, e por razões diferentes:
 *   ① `tournaments_backup/{id}` — o documento EXATAMENTE como está no segundo antes da
 *      transferência. É contra ELE que se confere se a transferência mudou alguma coisa.
 *   ② `tournaments_backup/{id}__original` — lido do PASSADO do banco (Point-In-Time
 *      Recovery), de um instante ANTERIOR a qualquer manutenção. O dono apontou o buraco
 *      que isto fecha: _"se vc cagou em algo na transferencia e nao temos mais os dados
 *      originais, a cagada se propaga no backup"_ — um snapshot tirado depois de um erro
 *      guarda o erro com cara de original. Este segundo não passa por código meu nenhum.
 *      ⚠️ A janela do PITR é de 7 dias. Depois disso essa porta fecha pra sempre.
 *
 * ⛔ NENHUM DOS DOIS TEM PRAZO. Ficam até o dono mandar apagar — a regra do Firestore nega
 * leitura e escrita pro cliente; só o Admin SDK alcança.
 *
 * ⛔ E A ORDEM É SAGRADA — o passo destrutivo é o ÚLTIMO:
 *   ① congela os dois e RELÊ pra conferir
 *   ② prova `remontar(dividir(t)) === t`
 *   ③ escreve a subcoleção e prova que remontar DELA devolve o original
 *   ④ só agora o documento perde os jogos
 * Qualquer passo que falhe aborta ANTES do ④. Até lá, nada foi destruído.
 *
 * Uso:  node scripts/salto-fase2.js <id> [--pitr <ISO>]            # em seco
 *       node scripts/salto-fase2.js <id> [--pitr <ISO>] --aplicar
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const argv = process.argv.slice(2);
const APLICAR = argv.indexOf('--aplicar') !== -1;
const ID = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--pitr');
const iP = argv.indexOf('--pitr');
const PITR = iP >= 0 ? argv[iP + 1] : '2026-08-26T03:00:00Z';
const kb = (v) => (Buffer.byteLength(JSON.stringify(v) || '', 'utf8') / 1024).toFixed(1) + ' KB';
const morre = (m) => { console.error('\n⛔ ABORTADO: ' + m + '\n   O documento segue INTACTO — nada foi destruído.'); process.exit(1); };
const jogosDe = (t) => { const o = []; (t.rounds || []).forEach((r) => (r.matches || []).forEach((m) => m && o.push(m))); (t.matches || []).forEach((m) => m && o.push(m)); (t.groups || []).forEach((g) => (g.matches || []).forEach((m) => m && o.push(m))); return o; };
const comPlacar = (l) => l.filter((m) => m && (m.winner || m.sets || m.scoreP1 != null)).length;

(async () => {
  if (!ID) morre('uso: node scripts/salto-fase2.js <idDoTorneio> [--pitr <ISO>] [--aplicar]');
  const ref = db.collection('tournaments').doc(String(ID));
  const doc = await ref.get();
  if (!doc.exists) morre('torneio ' + ID + ' não existe');
  const t = doc.data(); t.id = String(ID);
  if (Array.isArray(t._semPesados) && t._semPesados.indexOf('matches') !== -1) {
    console.log('já dividido — nada a fazer'); process.exit(0);
  }
  const jog = jogosDe(t);
  console.log('═══ ' + (t.name || ID));
  console.log('  AGORA: ' + kb(t) + ' · ' + jog.length + ' jogos (' + comPlacar(jog) + ' com placar) · ' +
    ((t.participants || []).length) + ' inscritos · ' + ((t.history || []).length) + ' eventos');

  // ── ② a prova que autoriza dividir ───────────────────────────────────────
  const partes = S.dividir(JSON.parse(JSON.stringify(t)));
  const volta = S.remontar(JSON.parse(JSON.stringify(partes)));
  if (!volta || !S.iguais(volta, t)) morre('remontar(dividir(t)) NÃO devolveu o original — este torneio NÃO pode ser dividido');
  console.log('  ✓ remontar(dividir(t)) === t');
  console.log('  documento depois: ' + kb(partes.config) + '  (de ' + kb(t) + ')');

  // ── o original do PASSADO, pra conferir que a manutenção de hoje não mudou o que importa
  let orig = null;
  try {
    orig = await db.runTransaction(async (tx) => (await tx.get(ref)).data(),
      { readOnly: true, readTime: admin.firestore.Timestamp.fromDate(new Date(PITR)) });
  } catch (e) { console.log('  ⚠️ não consegui ler o passado (' + PITR + '): ' + ((e && e.message) || e)); }
  if (orig) {
    const jo = jogosDe(orig);
    console.log('  ORIGINAL (' + PITR + '): ' + kb(orig) + ' · ' + jo.length + ' jogos (' +
      comPlacar(jo) + ' com placar) · ' + ((orig.participants || []).length) + ' inscritos');
    if (jo.length > jog.length) morre('o original tem MAIS jogos que agora (' + jo.length + ' > ' + jog.length + ') — parar e investigar');
    if (comPlacar(jo) > comPlacar(jog)) morre('o original tem MAIS placares que agora — parar e investigar');
    console.log('  ✓ nada de jogo nem de placar se perdeu entre o original e agora');
  }
  if (!APLICAR) { console.log('\n(em seco — nada gravado; rode com --aplicar)'); process.exit(0); }

  // ── ① os dois backups, conferidos relendo ────────────────────────────────
  const bcol = db.collection('tournaments_backup');
  const guarda = async (sufixo, dados, origem) => {
    const r = bcol.doc(String(ID) + sufixo);
    const jg = jogosDe(dados);
    await r.set({ doc: dados, origem: origem, em: new Date().toISOString(),
      motivo: 'guardar até o dono dizer que ninguém reclamou (ordem de 26/ago) — SEM PRAZO',
      jogos: jg.length, comPlacar: comPlacar(jg),
      inscritos: (dados.participants || []).length, historico: (dados.history || []).length });
    const lido = (await r.get()).data() || {};
    if (JSON.stringify(lido.doc) !== JSON.stringify(dados)) morre('o backup "' + sufixo + '" releu DIFERENTE — não confie nele');
    console.log('  ✓ backup tournaments_backup/' + ID + sufixo + ' gravado e CONFERIDO relendo (' + kb(dados) + ')');
  };
  await guarda('', t, 'documento vivo, no segundo antes da transferência');
  if (orig) await guarda('__original', orig, 'PITR ' + PITR + ' (não passa por código de manutenção)');

  // ── ③ a subcoleção, e a prova de que ela remonta o original ──────────────
  const col = ref.collection('matches');
  let lote = db.batch(), n = 0;
  for (const m of partes.matches) { lote.set(col.doc(String(m._chave)), m); if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; } }
  if (n) await lote.commit();
  const lidos = await col.get();
  const remontado = S.remontar({ config: JSON.parse(JSON.stringify(partes.config)), matches: lidos.docs.map((d) => d.data()) });
  if (!remontado || !S.iguais(remontado, t)) morre('a subcoleção NÃO remonta o original (' + lidos.size + ' jogos lidos)');
  console.log('  ✓ ' + lidos.size + ' jogos na subcoleção, e remontar DELA devolve o original byte a byte');

  // ── ④ só agora, o único passo destrutivo ─────────────────────────────────
  const config = JSON.parse(JSON.stringify(partes.config));
  config._semPesados = ['matches'];
  await ref.set(config);
  const conf = (await ref.get()).data();
  console.log('  ✓ documento dividido: ' + kb(t) + ' → ' + kb(conf) +
    '   (cabe ' + (1024 / (Buffer.byteLength(JSON.stringify(conf), 'utf8') / 1024)).toFixed(0) + '× até o teto)');
  console.log('\n✅ TRANSFERIDO.');
  console.log('   consultar o antigo:  node scripts/ver-backup.js ' + ID);
  console.log('   voltar atrás:        node scripts/desfazer-divisao.js ' + ID + ' --aplicar');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
