#!/usr/bin/env node
/* ensaio-divisao.js — o CICLO INTEIRO da divisão, num torneio de mentira, no banco de
 * verdade. É o ensaio que NÃO existia em 26/ago — e por isso o defeito só apareceu com o
 * dono abrindo o app no meio do Confra ao vivo.
 *
 * ⛔ O QUE ELE PROVA que o teste unitário não prova: que o dado, depois de dividido,
 * VOLTA INTEIRO pelo caminho do app — `_montaDeSubcolecoes` → `remontar` —, que a CF
 * consegue LER e GRAVAR nesse formato, e que o gatilho de espelho não apaga a subcoleção.
 *
 * ⭐ `isSandbox: true` faz o torneio ser invisível pra quem não é o dev, PELA REGRA do
 * Firestore (não por filtro de tela). Ver project_sandbox_tournament.
 * ⛔ E ele se APAGA no fim, inclusive as subcoleções — senão cada ensaio deixa lixo que
 * um dia alguém confunde com torneio de verdade.
 *
 * Uso: node scripts/ensaio-divisao.js [--manter]
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const MANTER = process.argv.indexOf('--manter') !== -1;
const DEV_UID = process.env.SP_DEV_UID || '';
let falhas = 0;
const ok = (c, m) => { if (c) console.log('  ✓ ' + m); else { falhas++; console.log('  ✗ ' + m); } };
const jogosDe = (t) => { const o = []; (t.rounds || []).forEach((r) => (r.matches || []).forEach((m) => m && o.push(m))); return o; };

(async () => {
  const ID = 'tour_ENSAIO_' + Date.now();
  const ref = db.collection('tournaments').doc(ID);
  // um torneio pequeno mas com as três coisas que importam: jogos, placar e elenco
  const t = {
    id: ID, name: '[ENSAIO] divisão — apagar', isSandbox: true, isPublic: false,
    status: 'open', createdAt: new Date().toISOString(),
    creatorUid: DEV_UID || 'ensaio-dev', memberUids: DEV_UID ? [DEV_UID] : [],
    participants: [{ uid: 'p1', name: 'Um' }, { uid: 'p2', name: 'Dois' },
                   { p1Name: 'Tri', p2Name: 'Quatro', name: 'Tri / Quatro' }],
    history: [{ date: new Date().toISOString(), message: 'Torneio Criado' }],
    rounds: [{ round: 1, matches: [
      { id: 'e-m1', p1: 'Um', p2: 'Dois', winner: 'Um', scoreP1: 6, scoreP2: 3 },
      { id: 'e-m2', p1: 'Tri / Quatro', p2: 'Um', scoreP1: null, scoreP2: null }
    ] }]
  };
  console.log('═══ ENSAIO ' + ID);
  await ref.set(t);
  const original = (await ref.get()).data(); original.id = ID;
  ok(jogosDe(original).length === 2, 'torneio de ensaio criado com 2 jogos e 1 placar');

  // ── ① dividir pelo MESMO script do salto de produção ────────────────────
  const { execFileSync } = require('child_process');
  let saida = '';
  try {
    saida = execFileSync(process.execPath, [path.join(__dirname, 'salto-fase2.js'), ID, '--aplicar'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { saida = (e.stdout || '') + (e.stderr || ''); }
  ok(/TRANSFERIDO/.test(saida), 'dividiu pelo MESMO script que roda em produção');

  // ── ② o documento REALMENTE perdeu os jogos ──────────────────────────────
  const doc = (await ref.get()).data();
  ok(jogosDe(doc).length === 0, 'o documento ficou SEM jogos (é o ponto)');
  ok(Array.isArray(doc._semPesados) && doc._semPesados.indexOf('matches') !== -1, 'e com o marcador');
  ok(doc._nJogos === 2, 'e dizendo quantos moram fora (`_nJogos`) — é o que separa "não tem" de "não carregou"');

  // ── ③ ⭐ O CAMINHO DO APP: monta e tem que voltar IDÊNTICO ───────────────
  /* ⭐ Monta TODAS as partes que saíram, exatamente como `_montaDeSubcolecoes` faz no app —
   * lendo o próprio `_semPesados` em vez de eu cravar 'matches' aqui. Foi assim que este
   * ensaio pegou que os INSCRITOS também tinham saído e o meu conferidor não sabia. */
  // ⭐ MESMO caminho único do app — o ensaio só vale se montar como a tela monta.
  const montado = await S.montarDoBanco(JSON.parse(JSON.stringify(doc)),
    async (colecao) => (await ref.collection(colecao).get()).docs.map((d) => d.data()));
  delete montado._semPesados; delete montado._nJogos;
  if (!montado || !S.iguais(montado, original)) {
    // ⛔ Falhar dizendo só "não bate" me obrigaria a investigar do zero toda vez. O ensaio
    // tem que dizer O QUE não bate — é a diferença entre um alarme e um diagnóstico.
    const ks = [...new Set([...Object.keys(original), ...Object.keys(montado || {})])].sort();
    ks.forEach((k) => {
      const a = JSON.stringify(S.canonico ? S.canonico(original[k]) : original[k]);
      const b = JSON.stringify(S.canonico ? S.canonico((montado || {})[k]) : (montado || {})[k]);
      if (a !== b) console.log('      ✗ ' + k + '\n         original: ' + String(a).slice(0, 160) +
                               '\n         montado : ' + String(b).slice(0, 160));
    });
  }
  ok(!!montado && S.iguais(montado, original),
    '⭐ MONTADO === ORIGINAL byte a byte — é isto que a tela vai receber');
  ok(jogosDe(montado).length === 2 && jogosDe(montado).filter((m) => m.winner).length === 1,
    '   com os 2 jogos e o placar de volta');
  ok((montado.participants || []).length === 3, '   e os 3 inscritos');

  // ── ④ o gatilho de espelho NÃO pode apagar a subcoleção ──────────────────
  await ref.update({ _ensaioToque: Date.now() });     // acorda o gatilho
  await new Promise((r) => setTimeout(r, 12000));
  const ms2 = await ref.collection('matches').get();
  ok(ms2.size === 2, '⛔ o gatilho NÃO apagou a subcoleção (ela virou a cópia viva)');

  // ── ⑤ a volta funciona ───────────────────────────────────────────────────
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'desfazer-divisao.js'), ID, '--aplicar'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {}
  const volta = (await ref.get()).data(); volta.id = ID;
  delete volta._ensaioToque;
  ok(jogosDe(volta).length === 2, '⭐ a VOLTA devolveu os jogos pro documento');
  ok(S.iguais(volta, original), '   e o documento voltou IDÊNTICO ao original');

  if (!MANTER) {
    for (const sub of ['matches', 'inscritos', 'history', 'participants']) {
      const s2 = await ref.collection(sub).get();
      const lote = db.batch(); s2.docs.forEach((d) => lote.delete(d.ref));
      if (s2.size) await lote.commit();
    }
    await db.collection('tournaments_backup').doc(ID).delete().catch(() => {});
    await db.collection('tournaments_backup').doc(ID + '__original').delete().catch(() => {});
    await db.collection('tournaments_summary').doc(ID).delete().catch(() => {});
    await ref.delete();
    console.log('  ✓ ensaio apagado (torneio, subcoleções, backups e resumo)');
  } else { console.log('  ⚠️ MANTIDO: ' + ID); }

  console.log('\n' + (falhas ? '✗ ' + falhas + ' FALHA(S) — NÃO religar a divisão' : '✅ ciclo inteiro OK'));
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
