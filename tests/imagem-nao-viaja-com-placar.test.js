/* IMAGEM NÃO VIAJA JUNTO COM PLACAR
 * node tests/imagem-nao-viaja-com-placar.test.js
 *
 * A FALHA REAL, MEDIDA nos documentos de produção (18/ago/2026):
 *   `logoData` + `coverPhotoData` são 62% do peso de todos os torneios (602 KB de
 *   966 KB). Num documento o par chega a 305 KB de 311 KB — 98% —, enquanto o torneio
 *   de verdade (as fases) ocupa 1,3 KB.
 *   Como `saveTournament` mandava o objeto INTEIRO, registrar um placar — mudança de
 *   ~50 bytes — reenviava os 211 KB do Confra com o logo junto, e devolvia esses 211 KB
 *   a cada listener aberto. Escrita, banda e re-render pagos por uma imagem que não mudou.
 *
 * O CONTRATO que este teste trava:
 *   1. save comum (placar, sync, config) NÃO carrega imagem;
 *   2. `merge:true` continua — é ele que garante que omitir NÃO apaga o que está no banco;
 *   3. quem TROCA a imagem (`withImages`) carrega — senão a troca de logo não salvaria;
 *   4. omitir a imagem não pode derrubar o resto do payload.
 *
 * ⚠️ O Firestore aqui é FALSO de propósito, e isso não enfraquece a prova: o que se
 * afirma é exatamente O QUE FOI ENTREGUE ao `.set()`, e disso o dublê não tem como
 * mentir. Ver [[feedback_green_tests_still_broken]] pro caso oposto (dublê que aceita
 * escrita proibida e deixa a suíte verde).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); return; }
  falhas++; console.log('  ✗ ' + msg);
}

// ── Harness: carrega firebase-db.js com um Firestore dublê que GRAVA o payload ──
function montar() {
  const escritas = [];
  const docFalso = {
    get: async () => ({ exists: false, data: () => ({}) }),
    set: async (data, opts) => { escritas.push({ data, opts }); },
    update: async () => {},
    collection: () => ({ doc: () => docFalso, get: async () => ({ forEach: () => {}, size: 0 }) }),
  };
  const db = { collection: () => ({ doc: () => docFalso }) };

  const win = {
    _cleanUndefined: (o) => JSON.parse(JSON.stringify(o)),
    _error: () => {}, _warn: () => {}, _log: () => {},
    // colaboradores que o save usa de passagem — não são o objeto deste teste
    _mergeMemberUids: (a) => (a && a.memberUids) || [],
    _computeAdminEmails: () => [],
    _computeAdminUids: () => [],
  };
  const sandbox = { window: win, console, Date, JSON, Array, Object, String, Number, Boolean, Math };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8'), sandbox);

  const FDB = win.FirestoreDB;
  FDB.db = db;
  return { FDB, escritas };
}

const LOGO = 'data:image/png;base64,' + 'A'.repeat(60000);   // ~60 KB, como o Confra
const CAPA = 'data:image/jpeg;base64,' + 'B'.repeat(90000);  // ~90 KB

function torneio() {
  return {
    id: 'confra-2026',
    name: 'Confra BT',
    status: 'active',
    logoData: LOGO,
    coverPhotoData: CAPA,
    participants: [{ uid: 'u1', name: 'Alguém' }],
    rounds: [{ matches: [{ id: 'm1', score: '6-4' }] }],
  };
}

console.log('\nIMAGEM NÃO VIAJA JUNTO COM PLACAR');

(async () => {
  // ── 1. SAVE COMUM (o placar) — a imagem NÃO pode ir junto ───────────────────
  {
    const { FDB, escritas } = montar();
    await FDB.saveTournament(torneio());
    ok(escritas.length === 1, 'o save comum gravou uma vez');
    const enviado = escritas[0].data || {};
    ok(!('logoData' in enviado), 'o save comum NÃO reenvia `logoData`');
    ok(!('coverPhotoData' in enviado), 'o save comum NÃO reenvia `coverPhotoData`');

    // é o `merge:true` que torna a omissão segura (o banco preserva o campo ausente).
    ok(escritas[0].opts && escritas[0].opts.merge === true,
       'a gravação continua com merge:true — omitir NÃO apaga a imagem do banco');

    // e o resto do torneio tem que continuar chegando inteiro
    ok(enviado.rounds && enviado.rounds.length === 1, 'o placar (`rounds`) continua sendo gravado');
    ok(enviado.participants && enviado.participants.length === 1, 'os inscritos continuam sendo gravados');
    ok(enviado.name === 'Confra BT', 'os campos de capa continuam sendo gravados');

    const bytes = Buffer.byteLength(JSON.stringify(enviado), 'utf8');
    ok(bytes < 10 * 1024,
       'o payload do placar ficou pequeno (' + (bytes / 1024).toFixed(1) + ' KB; com imagem eram ~150 KB)');
  }

  // ── 2. TROCA DE IMAGEM (`withImages`) — aí ela PRECISA ir ───────────────────
  {
    const { FDB, escritas } = montar();
    await FDB.saveTournament(torneio(), { withImages: true });
    const enviado = escritas[0].data || {};
    ok(enviado.logoData === LOGO, 'com `withImages`, o logo novo É gravado');
    ok(enviado.coverPhotoData === CAPA, 'com `withImages`, a capa nova É gravada');
  }

  // ── 3. OS DOIS ÚNICOS DONOS DA IMAGEM PASSAM A MARCA ────────────────────────
  // Sem isto o item 2 seria letra morta: a regra vale, mas ninguém a usaria — e a
  // troca de logo salvaria sem logo.
  const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
  const sharing = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-sharing.js'), 'utf8');
  ok(/saveTournament\(tourData,\s*\{\s*withImages:\s*true\s*\}\)/.test(store),
     'a criação/edição (AppStore.addTournament) passa `withImages`');
  ok(/saveTournament\(t,\s*\{\s*withImages:\s*true\s*\}\)/.test(sharing),
     'o botão de trocar logo passa `withImages`');

  console.log(falhas === 0
    ? '\n✅ imagem só viaja quando é ELA que mudou\n'
    : '\n❌ ' + falhas + ' falha(s)\n');
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('erro no harness:', e); process.exit(1); });
