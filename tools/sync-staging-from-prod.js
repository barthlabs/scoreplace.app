#!/usr/bin/env node
/* Sincroniza o banco da STAGING a partir do de PROD — um comando, sem expedição.
 *
 *   npm run sync:staging            # espelha (apaga o que só existe na staging)
 *   npm run sync:staging -- --dry   # só mostra o que faria, não escreve nada
 *   npm run sync:staging -- --only=tournaments,users
 *
 * REGRAS (por que é seguro rodar sem pensar):
 *   • PROD é SÓ LEITURA. O app de prod é aberto sem credencial de escrita e todo
 *     write é feito exclusivamente no handle da staging. Se alguém trocar o destino
 *     pra 'scoreplace-app', o guard aborta.
 *   • STAGING é descartável (dono): espelha mesmo — doc que só existe lá é APAGADO
 *     nas coleções sincronizadas. Sem backup, sem confirmação.
 *   • Copia subcoleções (results/, notifications/, reviews/…) recursivamente.
 *
 * O QUE NÃO VEM (e o porquê — não é zelo, é dano fora da staging):
 *   • mail/ .............. fila da extensão firestore-send-email. É LOG, não dado:
 *                          ~1 doc por e-mail já enviado, cresce pra sempre. Sem valor
 *                          pra teste e 1.800+ docs de ruído.
 *   • whatsapp_queue/ .... a staging AINDA tem processWhatsAppQueue deployada (gatilho
 *                          onCreate). Escrever doc aqui DISPARA WhatsApp de verdade
 *                          pra gente real. O canal morreu (v1.2.9, hoje é orgânico —
 *                          wa.me/grupo), mas a função zumbi continua no ar na staging.
 *   • tokens/throttles ... passwordReset*, phoneOwnershipTokens, mergeTokens,
 *                          emailVerifications, *Throttle: segredos de sessão, sem valor
 *                          e com risco de reaproveitar token.
 * Pra incluir algo mesmo assim: --only=nome_da_colecao (o filtro vence a lista de fora).
 *
 * Prod → staging preserva identidade: os dois projetos COMPARTILHAM os uids (medido
 * jul/2026: 162 uids em comum, zero conflitos) porque a staging nasceu de prod. As
 * divergências (pessoa com uid diferente nos dois) são listadas no fim — nessas o
 * login da staging não casa com os docs vindos de prod. Identidade é uid, sempre
 * (ver project_uid_identity_canon_locked).
 */
// firebase-admin vive em functions/node_modules (a raiz não tem — e não vale inchar o
// package.json do app web por causa de uma ferramenta). Resolve dos dois jeitos.
const path = require('path');
let admin;
try { admin = require('firebase-admin'); }
catch (_) {
  try { admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin')); }
  catch (e) {
    console.error('firebase-admin não encontrado. Rode: cd functions && npm install');
    process.exit(1);
  }
}

const PROD = 'scoreplace-app';
const STAGING = 'scoreplace-staging';

// Dados do app — é isso que o dono quer que venha: "os inscritos e os torneios
// venham, organizadores venham etc."
const SYNC = [
  'tournaments',        // torneios (+ subcoleção results/)
  'users',              // perfis = organizadores/inscritos (+ notifications/)
  'venues',             // locais (+ reviews/)
  'presences',
  'casualMatches',
  'discoveryFeed',
  'letzplayTournaments',
  'letzplayScans',
  'phoneOwnership',     // telefone→uid: sem isso, login por telefone diverge
  '_meta',
  'system',
];
const NUNCA = ['mail', 'whatsapp_queue', 'passwordResetTokens', 'passwordResetPhone',
  'phoneOwnershipTokens', 'mergeTokens', 'emailVerifications',
  'checkAccountThrottle', 'phoneLoginThrottle', 'recoveryThrottle'];

const args = process.argv.slice(2);
const DRY = args.includes('--dry') || args.includes('--dry-run');
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;

const prodApp = admin.initializeApp({ projectId: PROD }, 'prod-ro');
const stgApp = admin.initializeApp({ projectId: STAGING }, 'staging-rw');
const src = prodApp.firestore();
const dst = stgApp.firestore();

// GUARD: nada, em hipótese alguma, escreve em prod.
if (dst.databaseId && String(dst.databaseId).indexOf(PROD) !== -1) throw new Error('ABORT: destino é prod');
if (stgApp.options.projectId !== STAGING) throw new Error('ABORT: destino não é a staging');

const log = (...a) => console.log(...a);
let escritos = 0, apagados = 0;

// Tudo aqui é I/O de rede: o que custa é a IDA, não o dado. Em série, 170 users =
// 170 idas (era essa a demora). Pool de N em paralelo → dezenas de segundos viram
// poucos. 40 é folgado pro Firestore e não estoura cota.
const POOL = 40;
async function emParalelo(itens, fn, n = POOL) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; out[k] = await fn(itens[k], k); }
  }));
  return out;
}

async function commitAll(ops) {
  // Firestore: 500 ops por batch. Os batches também vão em paralelo.
  const lotes = [];
  for (let i = 0; i < ops.length; i += 400) lotes.push(ops.slice(i, i + 400));
  if (DRY) return;
  await emParalelo(lotes, async (lote) => {
    const b = dst.batch();
    lote.forEach((fn) => fn(b));
    await b.commit();
  }, 12);
}

// Copia uma coleção (ou subcoleção, via caminho) e espelha: escreve tudo de prod e
// apaga o que só existe na staging.
async function syncCollection(path, { raiz = true } = {}) {
  const [sSnap, dSnap] = await Promise.all([src.collection(path).get(), dst.collection(path).get()]);
  const noProd = new Set();
  const ops = [];
  sSnap.forEach((d) => {
    noProd.add(d.id);
    ops.push((b) => b.set(dst.collection(path).doc(d.id), d.data()));
  });
  let del = 0;
  dSnap.forEach((d) => {
    if (!noProd.has(d.id)) { del++; ops.push((b) => b.delete(dst.collection(path).doc(d.id))); }
  });
  await commitAll(ops);
  escritos += sSnap.size; apagados += del;
  if (raiz) log('  ' + path.padEnd(26) + String(sSnap.size).padStart(5) + ' copiados' + (del ? '  · ' + del + ' apagados (só na staging)' : ''));

  // Subcoleções (results/, notifications/, reviews/…): listagem em paralelo.
  const subs = await emParalelo(sSnap.docs, (d) => d.ref.listCollections());
  const caminhos = [];
  subs.forEach((cols, k) => (cols || []).forEach((c) => caminhos.push(path + '/' + sSnap.docs[k].id + '/' + c.id)));
  if (caminhos.length) {
    await emParalelo(caminhos, (p) => syncCollection(p, { raiz: false }), 20);
    if (raiz) log('    ↳ ' + caminhos.length + ' subcoleção(ões)');
  }
}

(async () => {
  const alvo = ONLY || SYNC;
  log((DRY ? '🔎 DRY-RUN (nada será escrito)' : '🔄 Sincronizando') + ': ' + PROD + ' (leitura) → ' + STAGING + ' (escrita)\n');
  if (!ONLY) log('  fora por padrão: ' + NUNCA.join(', ') + '\n');

  for (const c of alvo) {
    if (!ONLY && NUNCA.indexOf(c) !== -1) continue;
    await syncCollection(c);
  }

  log('\n' + (DRY ? 'DRY-RUN — ' : '✅ ') + escritos + ' docs copiados · ' + apagados + ' apagados na staging');

  // Divergência de identidade: mesma pessoa com uid diferente nos dois projetos.
  // Depois do sync, os docs vêm com o uid de PROD — quem diverge não se reconhece
  // ao logar na staging (identidade é uid, e só).
  const byEmail = {};
  (await src.collection('users').get()).forEach((d) => { const e = (d.data().email || '').toLowerCase(); if (e) byEmail[e] = d.id; });
  const div = [];
  (await stgApp.auth().listUsers(1000)).users.forEach((u) => {
    const e = (u.email || '').toLowerCase();
    if (e && byEmail[e] && byEmail[e] !== u.uid) div.push({ email: e, uidStaging: u.uid, uidProd: byEmail[e] });
  });
  if (div.length) {
    log('\n⚠️  ' + div.length + ' pessoa(s) com uid DIFERENTE entre prod e staging — o login delas na staging');
    log('   não vai casar com os docs vindos de prod (identidade é uid, sempre):');
    div.forEach((r) => log('   · ' + r.email + '  staging=' + r.uidStaging + '  prod=' + r.uidProd));
  } else {
    log('\n✓ identidade: todo login da staging casa com os uids vindos de prod');
  }
  process.exit(0);
})().catch((e) => { console.error('ERR', e && e.message); process.exit(1); });
