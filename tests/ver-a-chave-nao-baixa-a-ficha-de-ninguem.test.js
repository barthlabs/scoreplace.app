'use strict';
/* ⛔ VER A CHAVE NÃO PODE BAIXAR A FICHA DE NINGUÉM.
 *
 * `_preloadUserProfiles` é a carga em lote que alimenta chave, inscritos, sorteio,
 * categorias e substituição da liga — ela roda para QUALQUER pessoa que abra QUALQUER
 * torneio. MEDIDO no Confra: **143 uids por abertura**. Ela lia `users/{uid}`, que é
 * `allow read: if request.auth != null` e guarda **94 campos** (e-mail, celular, data de
 * nascimento, cidades preferidas, token de push), para ficar com **oito**. Os outros 86
 * viajavam até o aparelho de quem só queria ver nome e foto.
 *
 * ⛔ Rule não projeta CAMPO, só autoriza DOCUMENTO: a única saída é LER DE OUTRO LUGAR —
 * `usersPublic`, o espelho escrito só pela Function (279/279 semeados, 0 e-mails, 0
 * telefones, medido em 13/set/2026).
 *
 * ⚠️ O QUE O ORGANIZADOR PRECISA CONTINUA CHEGANDO, por uma porta estreita
 * (`carregarContatosDoElenco`) que só a tela de inscritos abre, e só para quem manda no
 * torneio. E essa porta conserta um silêncio medido: `omitPhone`, `phoneSource` e
 * `letzplayHandle` NUNCA estiveram no cache, então a tela lia `undefined` e decidia errado
 * sem erro nenhum — o balãozinho do WhatsApp aparecia inclusive para quem marcou "não
 * mostrar meu telefone".
 *
 * ⚠️ AS DUAS DIREÇÕES: o mesmo motorista roda contra a árvore ANTERIOR, onde a leitura TEM
 * que cair em `users`. Um teste que passasse nos dois não provaria a troca — descreveria o
 * presente. [[feedback_rede_que_cobre_o_rerender_nao_cobre_o_primeiro]]
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

/** Roda `_preloadUserProfiles` de um store.js qualquer e devolve o que ele TOCOU. */
function rodar(storeSrc, uids, docs) {
  const i = storeSrc.indexOf('window._preloadUserProfiles = function');
  if (i < 0) throw new Error('não achei _preloadUserProfiles');
  const fim = storeSrc.indexOf('\n};', i) + 3;

  const lidas = [];
  const fazerDoc = (id) => ({ id, exists: !!docs[id], data: () => docs[id] || null });
  const db = {
    collection(nome) {
      return {
        where(_fp, _op, lote) {
          lidas.push({ colecao: nome, modo: 'lote', uids: lote.slice() });
          return { get: () => Promise.resolve({
            forEach: (f) => lote.filter((u) => docs[u]).forEach((u) => f(fazerDoc(u))) }) };
        },
        doc(id) {
          lidas.push({ colecao: nome, modo: 'um', uids: [id] });
          return { get: () => Promise.resolve(fazerDoc(id)) };
        },
      };
    },
  };
  const W = {
    FirestoreDB: { db },
    _COLECAO_PERFIL_PUBLICO: 'usersPublic',
    _userProfileCache: {},
    _userProfilePending: {},
    _profileEpoch: 0,
    _bumpProfileEpoch() { W._profileEpoch++; },
    _userVivo: () => Promise.resolve(null),
    _warn() {}, _error() {}, _captureMessage() {},
  };
  const ctx = vm.createContext({
    window: W, setTimeout, clearTimeout, Promise, Object, Array, String, JSON, Math,
    firebase: { firestore: { FieldPath: { documentId: () => '__id__' } } },
  });
  ctx.window.window = W;
  vm.runInContext(storeSrc.slice(i, fim), ctx, { filename: 'store.js#_preloadUserProfiles' });
  return W._preloadUserProfiles(uids).then(() => ({ lidas, cache: W._userProfileCache }));
}

// Perfil como ele é em `users`: o que a tela usa MAIS o que ela nunca devia baixar.
const FICHA = {
  displayName: 'Fulana', photoURL: 'https://x/y.jpg', gender: 'F',
  skillBySport: { beach_tennis: 'B' }, birthDate: '1985-04-02', defaultCategory: 'B',
  email: 'fulana@exemplo.invalid', phone: '+5511999999999', fcmToken: 'token-de-push',
  preferredCeps: ['01310-000'], linkedEmails: ['outra@exemplo.invalid'],
};
const UIDS = ['uid1', 'uid2', 'uid3'];
const DOCS = { uid1: FICHA, uid2: Object.assign({}, FICHA, { displayName: 'Beltrano' }), uid3: FICHA };

(async () => {
  console.log('\n──── ver a chave não baixa a ficha de ninguém ────\n');

  /* ── ① A HIDRATAÇÃO LÊ O ESPELHO, NÃO A FICHA ───────────────────────────── */
  const STORE = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
  const agora = await rodar(STORE, UIDS, DOCS);

  must(agora.lidas.length > 0, '① o motorista de fato exercitou a carga (nada de teste mudo)');
  must(agora.lidas.every((l) => l.colecao === 'usersPublic'),
    '① ⭐ toda leitura foi em `usersPublic` — a ficha de ninguém foi baixada');
  must(!agora.lidas.some((l) => l.colecao === 'users'),
    '① ⛔ `users` NÃO é tocada ao abrir um torneio');

  /* ── ② E O CACHE NÃO GUARDA CONTATO ─────────────────────────────────────── */
  const c1 = agora.cache.uid1;
  must(c1 && c1.displayName === 'Fulana', '② o nome chega — a tela continua servida');
  must(c1 && c1.photoURL && c1.gender === 'F' && c1.birthDate && c1.defaultCategory,
    '② foto, gênero, idade e categoria continuam chegando (badges e desempate)');
  must(!('email' in c1), '② ⭐ `email` saiu do cache — `_emailForUid` tinha ZERO leitores');
  must(!c1.phone, '② ⭐ o telefone NÃO vem pela porta larga');
  const tudo = JSON.stringify(agora.cache);
  must(!tudo.includes('exemplo.invalid'), '② ⛔ nenhum e-mail sobrevive em lugar nenhum do cache');
  must(!tudo.includes('+55'), '② ⛔ nenhum telefone sobrevive');
  must(!tudo.includes('token-de-push') && !tudo.includes('01310-000'),
    '② ⛔ nem token de push, nem cidade preferida');

  /* ── ③ UID SEM DOC AINDA ENTRA VAZIO ────────────────────────────────────── */
  const semDoc = await rodar(STORE, ['uidFantasma'], {});
  must(semDoc.cache.uidFantasma && semDoc.cache.uidFantasma.displayName === '',
    '③ uid sem documento continua entrando VAZIO — é o que separa "carregando" de "não existe"');

  /* ── ④ A PORTA ESTREITA EXISTE E LÊ A FICHA DE PROPÓSITO ────────────────── */
  const DB = fs.readFileSync(path.join(raiz, 'js/firebase-db.js'), 'utf8');
  const iPorta = DB.indexOf('async carregarContatosDoElenco');
  must(iPorta > 0, '④ `carregarContatosDoElenco` existe');
  const porta = DB.slice(iPorta, DB.indexOf('\n  },', iPorta));
  must(porta.includes("collection('users')"),
    '④ ⭐ ela lê `users` DE PROPÓSITO — celular e @ são privados e não estão no espelho');
  ['phone', 'phoneCountry', 'phoneSource', 'omitPhone', 'letzplayHandle'].forEach((k) => {
    must(new RegExp('alvo\\.' + k + ' =').test(porta),
      '④ ela entrega `' + k + '` — a tela do organizador lê exatamente este campo');
  });

  /* ── ⑤ E SÓ O ORGANIZADOR A ABRE ────────────────────────────────────────── */
  const P = fs.readFileSync(path.join(raiz, 'js/views/participants.js'), 'utf8');
  const iCham = P.indexOf('_ensureContatosP');
  must(iCham > 0, '⑤ a chamada mora na tela de inscritos');
  const bloco = P.slice(iCham, P.indexOf('})();', iCham));
  must(/if \(!isOrg/.test(bloco),
    '⑤ ⭐ ela sai na hora se quem abriu NÃO é o organizador');
  const chamadas = (P.match(/carregarContatosDoElenco\(/g) || []).length;
  must(chamadas === 1, '⑤ ⛔ existe UMA chamada só (achadas: ' + chamadas + ') — duas telas divergem');

  /* ── ⑥ OS CAMPOS QUE A TELA LÊ SÃO OS QUE A PORTA TRAZ ──────────────────── */
  // Era exatamente aqui que o silêncio morava: a tela lia quatro campos que a carga
  // nunca trouxe, e decidia com `undefined`.
  ['omitPhone', 'phoneSource', 'letzplayHandle', 'phoneCountry'].forEach((k) => {
    must(new RegExp('(?:_profTel|prof)\\.' + k + '\\b').test(P),
      '⑥ a tela decide por `' + k + '` LENDO O CACHE — e agora ele existe lá');
  });

  /* ── ⑦ A PORTA NÃO PODE CHEGAR ANTES DO NOME ────────────────────────────── */
  // ⛔ ERA UM DEFEITO REAL DESTA LEVA, pego antes de subir: `_preloadUserProfiles` PULA
  // uid que já esteja no cache. Se a porta do contato criasse a entrada primeiro, a carga
  // de nomes acharia que já tinha carregado e a lista do organizador ficaria com "…" para
  // sempre — e em SILÊNCIO, porque nada falha.
  must(/await window\._preloadUserProfiles\(alvos\)/.test(porta),
    '⑦ ⭐ a porta ESPERA a carga de nomes antes de vestir o contato');
  must(/var alvo = cache\[uid\];\s*\n\s*if \(!alvo\) return;/.test(porta),
    '⑦ ⛔ e NUNCA inventa entrada no cache — uid sem nome carregado é pulado, não fabricado');
  must(/if \(n > 0 &&/.test(P),
    '⑦ a tela só redesenha se algo CHEGOU — re-render vazio voltaria a pedir, em laço');

  /* ── ⑧ CONTROLE: NA ÁRVORE ANTERIOR A LEITURA CAÍA EM `users` ───────────── */
  const anterior = execFileSync('git', ['show', 'HEAD:js/store.js'], { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const antes = await rodar(anterior, UIDS, DOCS);
  console.log('\n  (controle: a árvore HEAD, ANTES da troca)');
  must(antes.lidas.every((l) => l.colecao === 'users'),
    '⑧ ⭐ ANTES, TODA leitura era em `users` — a troca é real, não decorativa');
  must(JSON.stringify(antes.cache).includes('exemplo.invalid'),
    '⑧ ⛔ ANTES, o e-mail de estranho ENTRAVA no cache do aparelho');
  must(JSON.stringify(antes.cache).includes('+5511999999999'),
    '⑧ ⛔ ANTES, o telefone de estranho também');

  console.log('\n✅ ' + ok + ' verificações');
})().catch((e) => { console.error('\n✗ ' + e.message); process.exit(1); });
