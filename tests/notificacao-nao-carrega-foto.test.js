/* A CAIXA DE NOTIFICAÇÕES NÃO PODE PESAR MEGABYTES — E CONTAR NÃO PODE SER BAIXAR.
 *
 * INCIDENTE REAL (17/ago/2026). Relato do dono, sobre o celular: _"e voltamos a porra
 * da tela preta..."_ seguido de _"e demorou para caramba para carregar os dados. dash no
 * ar mas sem dados. sem perfil, sem torneios..."_.
 *
 * MEDIDO na base de produção ANTES de mexer (não deduzido):
 *   • `users/{dono}/notifications` = **476 docs, 1,2 MB**;
 *   • as 3 NÃO LIDAS daquela noite pesavam **95 KB cada** — 285 KB só pra pintar o
 *     número do sininho;
 *   • o peso inteiro estava em `fromPhoto`, que guardava `data:image/jpeg;base64,…`
 *     (21 das 234 contas têm a foto assim; a maior, 133 KB);
 *   • 25 notificações de placar do mesmo torneio somavam **618 KB**;
 *   • e `fromPhoto` **não é renderizado em lugar nenhum** — 5 pontos gravavam, ZERO liam.
 *
 * O caminho que doía é o de ABERTURA: `_updateNotificationBadge` (auth.js, logo após o
 * login) chamava `getUnreadNotificationCount`, que fazia `.get()` na consulta inteira e
 * usava só o `snap.size`. Ou seja: baixava o CORPO de cada não lida — os JPEGs — para
 * devolver um inteiro, na frente da fila, antes dos dados da tela.
 *
 * DOIS INVARIANTES, e é isto que este arquivo guarda (não os mecanismos):
 *   1. NENHUM caminho de gravação pode pendurar uma foto na notificação. A garantia mora
 *      no ponto ÚNICO por onde toda notificação passa (`addNotification`), pra que call
 *      site novo não possa reintroduzir o campo. Ver [[feedback_unify_dual_entry_points]].
 *   2. Pintar o sininho tem CUSTO COM TETO. O ideal é a agregação `count()` (zero doc
 *      baixado) — e o código a usa quando existe. Mas MEDIDO na página servida: o
 *      firebase-firestore-compat 10.14.1 que o app carrega **não tem count()** (só o
 *      build modular tem). Então o caminho que roda em produção é o `.get()` LIMITADO a
 *      10: o badge não sabe pintar além de "9+", logo a 11ª não lida não muda um pixel.
 *      O que não pode, em nenhum dos dois caminhos, é o custo crescer com o tamanho da
 *      caixa da pessoa — nem o badge zerar em silêncio.
 *
 * ⚠️ Forma nova de engordar a notificação entra NESTE arquivo.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== Notificação não carrega foto (e contar não é baixar) ==');

// ── O MÓDULO REAL, rodado de verdade ────────────────────────────────────────────
// Nada de réplica: carregamos js/firebase-db.js num sandbox e usamos as funções que
// produção usa. Se o arquivo mudar de forma, o teste quebra aqui — que é o certo.
function carregarFirestoreDB() {
  const win = { _error() {}, _warn() {}, _log() {}, _noteFsReads() {} };
  const sandbox = { window: win, firebase: undefined, console, Date, JSON, Math, Object, Array, String, Number, Boolean, Promise, setTimeout, RegExp, Error };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'firebase-db.js' });
  return win.FirestoreDB;
}

const DB = carregarFirestoreDB();
ok(!!DB && typeof DB.addNotification === 'function', 'window.FirestoreDB.addNotification existe');
ok(typeof DB.getUnreadNotificationCount === 'function', 'window.FirestoreDB.getUnreadNotificationCount existe');

// A foto real do incidente, no tamanho do incidente: 95 KB de base64.
const FOTO_BASE64 = 'data:image/jpeg;base64,' + '/9j/4AAQSkZJRgABAQAASABIAAD'.repeat(3600);
ok(FOTO_BASE64.length > 90 * 1024, 'a foto do teste tem o peso do caso real (' + Math.round(FOTO_BASE64.length / 1024) + ' KB)');

// ── db falso que REGISTRA o que foi gravado e o que foi baixado ─────────────────
function fakeDb(opts) {
  opts = opts || {};
  const reg = { gravado: null, docsBaixados: 0, usouCount: false, usouGet: false };
  const query = {
    where() { return query; },
    limit(n) { reg.limitePedido = n; return query; },
    get() {
      reg.usouGet = true;
      let docs = (opts.naoLidas || []).map((d, i) => ({ id: 'n' + i, data: () => d }));
      if (reg.limitePedido) docs = docs.slice(0, reg.limitePedido);   // o servidor obedece o limit
      reg.docsBaixados += docs.length;
      return Promise.resolve({ size: docs.length, docs, forEach: f => docs.forEach(f) });
    }
  };
  if (!opts.semCount) {
    query.count = function () {
      reg.usouCount = true;
      return { get: () => Promise.resolve({ data: () => ({ count: (opts.naoLidas || []).length }) }) };
    };
  }
  const db = {
    collection() { return { doc: () => ({ collection: () => colecao }) }; }
  };
  const colecao = Object.assign({}, query, {
    doc: () => ({ set: (d) => { reg.gravado = d; return Promise.resolve(); } })
  });
  return { db, reg };
}

// ═══ 1) GRAVAÇÃO: a foto não entra, venha de onde vier ══════════════════════════
(async function () {
  const { db, reg } = fakeDb();
  DB.db = db;

  await DB.addNotification('uid-destino', {
    type: 'match-pending-approval',
    fromUid: 'uid-quem-lancou',
    fromName: 'Juliana Carneiro',
    fromPhoto: FOTO_BASE64,                       // <- exatamente o que produção mandava
    tournamentId: 'tour_1780009816637',
    tournamentName: 'Confra BT Alta da Clínica 2026',
    message: 'Juliana Carneiro lançou:\nJuliana Carneiro / Ana Cattani 6\nvs\nMaria Helena Lauria / Adriana 2',
    createdAt: '2026-08-17T21:27:56.021Z',
    read: false
  });

  ok(reg.gravado !== null, 'a notificação foi gravada');
  ok(!('fromPhoto' in (reg.gravado || {})), 'o doc gravado NÃO tem fromPhoto (era 95 KB por destinatário)');

  const bytes = Buffer.byteLength(JSON.stringify(reg.gravado || {}), 'utf8');
  ok(bytes < 2048, 'o doc gravado cabe em 2 KB (saiu com ' + bytes + ' bytes; antes: ' + Math.round(FOTO_BASE64.length / 1024) + ' KB)');

  // O resto do payload é intocado — o conserto não pode comer campo útil.
  ok(reg.gravado.type === 'match-pending-approval', 'type preservado');
  ok(reg.gravado.fromUid === 'uid-quem-lancou', 'fromUid preservado (é por ele que se acha a foto, se um dia alguém quiser)');
  ok(reg.gravado.fromName === 'Juliana Carneiro', 'fromName preservado');
  ok(reg.gravado.message.indexOf('Ana Cattani') > 0, 'message preservada');
  ok(reg.gravado.read === false, 'read:false preservado');
  ok(reg.gravado.tournamentId === 'tour_1780009816637', 'tournamentId preservado');
})();

// ═══ 2) QUANDO O SDK TIVER count(): zero documento baixado ══════════════════════
(async function () {
  const gordas = [1, 2, 3].map(() => ({ type: 'match-pending-approval', read: false, fromPhoto: FOTO_BASE64 }));
  const { db, reg } = fakeDb({ naoLidas: gordas });
  DB.db = db;

  const n = await DB.getUnreadNotificationCount('uid-dono');
  ok(n === 3, 'o badge continua contando certo (3)');
  ok(reg.usouCount === true, 'usou a agregação count() — resposta é um inteiro, não uma lista');
  ok(reg.docsBaixados === 0, 'ZERO documentos baixados pra contar (eram 285 KB de JPEG na abertura)');
})();

// ═══ 3) O CAMINHO QUE PRODUÇÃO REALMENTE RODA: compat 10.14.1 NÃO TEM count() ══
// Medido na página servida em 17/ago: a Query do firebase-firestore-compat expõe
// where/orderBy/limit/get/onSnapshot e NADA de count() (a agregação só existe no build
// modular). Se este ramo baixasse a consulta inteira, o conserto seria decorativo.
(async function () {
  const { db, reg } = fakeDb({ naoLidas: [1, 2].map(() => ({ read: false })), semCount: true });
  DB.db = db;

  const n = await DB.getUnreadNotificationCount('uid-dono');
  ok(n === 2, 'sem count() no SDK, o badge ainda diz a verdade (2) — não zera em silêncio');
  ok(reg.usouGet === true, 'cai no .get(), que é o caminho antigo');
  ok(reg.limitePedido === 10, 'e ele vai LIMITADO (10) — o badge não sabe pintar além de "9+"');
})();

// ═══ 3b) CAIXA GRANDE: o custo da abertura tem TETO ═════════════════════════════
// A caixa do dono tinha 476 avisos. Sem teto, o sininho puxava todas as não lidas.
(async function () {
  const muitas = Array.from({ length: 400 }, () => ({ read: false, fromPhoto: FOTO_BASE64 }));
  const { db, reg } = fakeDb({ naoLidas: muitas, semCount: true });
  DB.db = db;

  const n = await DB.getUnreadNotificationCount('uid-dono');
  ok(reg.docsBaixados <= 10, 'com 400 não lidas, a abertura baixa no MÁXIMO 10 docs (baixou ' + reg.docsBaixados + ')');
  ok(n >= 10, 'e o badge recebe um número que ainda pinta "9+" (' + n + ')');
})();

// ═══ 4) VARREDURA: nenhum call site voltou a gravar a foto ══════════════════════
(function () {
  const dir = path.join(ROOT, 'js');
  const arquivos = [];
  (function anda(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) anda(p);
      else if (e.name.endsWith('.js')) arquivos.push(p);
    });
  })(dir);

  const culpados = [];
  arquivos.forEach(f => {
    fs.readFileSync(f, 'utf8').split('\n').forEach((linha, i) => {
      // Só GRAVAÇÃO: `fromPhoto: <algo>` ou `.fromPhoto = <algo>`. Comentário não conta —
      // o histórico do incidente vive nos comentários e tem que poder ser escrito.
      const semComentario = linha.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (/fromPhoto\s*[:=][^=]/.test(semComentario)) {
        culpados.push(path.relative(ROOT, f) + ':' + (i + 1) + ' → ' + linha.trim().slice(0, 80));
      }
    });
  });
  ok(culpados.length === 0, 'nenhum arquivo de js/ grava fromPhoto' + (culpados.length ? ':\n      ' + culpados.join('\n      ') : ''));
})();

// A saída só sai depois que os async acima resolvem.
setTimeout(function () {
  console.log('\n✅ ' + pass + ' asserções ok, ' + fail + ' falha(s)');
  process.exit(fail ? 1 : 0);
}, 0);
