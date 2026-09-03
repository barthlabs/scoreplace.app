/* A PORTA ÚNICA DE ESCRITA FINA NO TORNEIO  (2.0.122)
 * node tests/porta-unica-de-escrita-fina.test.js
 *
 * Ordem do dono (26/ago/2026): _"tudo em CF apenas disparado pelo cliente"_.
 *
 * ⛔ POR QUE A PORTA PRECISA EXISTIR: o teto de 1 MB do Firestore só cai movendo dado pra
 * fora do documento, e o cliente NÃO tem permissão de escrever subcoleção — nunca teve, por
 * decisão da 1.7.98. Enquanto um campo for escrito pelo cliente, ele NÃO PODE sair do
 * documento: sairia e as escritas cairiam no vazio. Foi exatamente esse o buraco que a
 * 2.0.120 fechou em seis portas do `functions/`.
 *
 * ⛔ E POR QUE ELA NÃO ABRE TRANSAÇÃO NO TORNEIO: marcar UMA presença já reescreveu o
 * torneio inteiro dentro de uma transação, e sob contenção elas se atropelam — medido na
 * 1.7.x: update por CAMPO 25/25, transação do doc inteiro com falhas; a marca aparecia na
 * tela e o snapshot seguinte a removia. A porta preserva a escrita fina.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'functions/partes-permissao.js'));
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── a porta única de escrita fina ────');

const t = { creatorUid: 'uOrg', adminUids: ['uAdm'], coHosts: [{ uid: 'uCo', status: 'active' }, { uid: 'uPend', status: 'pending' }] };

// ── ① quem pode o quê ─────────────────────────────────────────────────────────
ok('⭐ cada pessoa marca a PRÓPRIA presença', P.autoriza(t, 'uA', { parte: 'checkedIn', chave: 'uA' }).ok);
ok('⛔ e NÃO marca a de outra', !P.autoriza(t, 'uA', { parte: 'checkedIn', chave: 'uB' }).ok);
ok('⭐ o organizador marca qualquer um', P.autoriza(t, 'uOrg', { parte: 'checkedIn', chave: 'uB' }).ok);
ok('⭐ o co-organizador ATIVO também (mesmo poder)', P.autoriza(t, 'uCo', { parte: 'checkedIn', chave: 'uB' }).ok,
  'co-organizador tem o MESMO poder do organizador [[project_cohost_same_power_as_organizer]]');
ok('⛔ convite PENDENTE não vale', !P.autoriza(t, 'uPend', { parte: 'checkedIn', chave: 'uB' }).ok);
ok('⭐ e o admin do torneio idem', P.autoriza(t, 'uAdm', { parte: 'checkedIn', chave: 'uB' }).ok);

// ⭐ QUEM NÃO TEM CONTA é chaveado pelo NOME que o organizador digitou — cânone do projeto.
// A primeira versão desta tabela exigia formato de uid na chave e reprovava essas pessoas;
// quem pegou foi o próprio teste. [[feedback_uid_controls_everything_name_only_ficticio]]
ok('⭐ o organizador marca quem NÃO tem conta (chave é o nome, com espaço e acento)',
  P.autoriza(t, 'uOrg', { parte: 'checkedIn', chave: 'Maria Betânia Roberto Faria' }).ok);

ok('⛔ rastro de W.O. é só de quem organiza', !P.autoriza(t, 'uA', { parte: 'woLog', chave: 'h1' }).ok &&
   P.autoriza(t, 'uOrg', { parte: 'woLog', chave: 'h1' }).ok);
ok('⛔ confirmar presença de terceiro é só de quem organiza',
  !P.autoriza(t, 'uA', { parte: 'checkedInConfirmed', chave: 'uA' }).ok);

// ── ② allowlist: o que não está na tabela é NEGADO ────────────────────────────
['participants', 'rounds', 'matches', 'adminUids', 'creatorUid', 'memberUids', 'status'].forEach((c) => {
  ok('⛔ `' + c + '` NÃO passa por esta porta', !P.autoriza(t, 'uOrg', { parte: c, chave: 'x' }).ok,
    'allowlist: negar só o que lembrei de proibir é como se abre buraco sem perceber');
});
ok('⛔ e sem login não passa nada', !P.autoriza(t, null, { parte: 'checkedIn', chave: 'uA' }).ok);

// ── ③ a chave tem que servir de id de documento ───────────────────────────────
['a/b', '.', '..', '__proto__', ''].forEach((k) => {
  ok('⛔ chave "' + (k || '(vazia)') + '" é recusada', !P.autoriza(t, 'uOrg', { parte: 'checkedIn', chave: k }).ok);
});
ok('⭐ mas nome comprido normal passa', P.idDeDocumentoValido('Ana Carolina de Souza e Silva'));

// ── ④ a CF: autoriza TUDO antes de escrever QUALQUER coisa ───────────────────
const cf = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const i = cf.indexOf('exports.aplicarNoTorneio');
ok('a porta existe', i > 0);
const corpo = cf.slice(i, cf.indexOf('\nexports.', i + 10));
const iAut = corpo.indexOf('_partesPerm.autoriza');
const iEscrita = corpo.indexOf('db.batch()');
ok('⛔ autoriza TODAS as operações ANTES de abrir o lote', iAut > 0 && iEscrita > iAut,
  'autorizar dentro do laço deixaria metade aplicada quando a outra metade é negada');
ok('  → e uma negada derruba a chamada inteira', /throw new HttpsError\("permission-denied"/.test(corpo));
ok('⛔ NÃO abre transação no torneio (a contenção da presença foi medida)',
  !/runTransaction/.test(corpo));
ok('⭐ campo que já mora fora vira UM documento na subcoleção',
  /docRef\.collection\(_tSplitFn\.colecaoDaParte\(parte\)\)\.doc\(chave\)/.test(corpo));
ok('⭐ campo ainda no documento continua indo por FieldPath (escrita fina)',
  /new FieldPath\(parte, chave\)/.test(corpo));
ok('⛔ e os pares viram UM update só — lote não toca o mesmo doc duas vezes',
  /lote\.update\.apply\(lote, \[docRef\]\.concat\(paresDoDoc\)\)/.test(corpo));
ok('⛔ há teto de operações por chamada', /ops\.length > 200/.test(corpo));

// ── ⑤ o cliente parou de escrever presença direto ─────────────────────────────
const cli = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
const iSP = cli.indexOf('async setPresenceFields(');
const sp = cli.slice(iSP, cli.indexOf('\n  },', iSP));
ok('⛔ setPresenceFields NÃO escreve mais no Firestore direto',
  !/ref\.update\.apply/.test(sp) && !/this\.db\.collection/.test(sp),
  'enquanto o cliente escrever aqui, `checkedIn` não pode sair do documento');
ok('⭐ ele DISPARA a CF', /_callFn\('aplicarNoTorneio'/.test(sp));
ok('  → preservando a forma {map, key, value} de quem chama', /o\.map/.test(sp) && /o\.key/.test(sp));


/* ═══ ⑥ A PORTA RODANDO DE VERDADE ═════════════════════════════════════════════
 * ⛔ POR QUE ESTA SEÇÃO EXISTE: tudo acima lê `functions/index.js` como TEXTO. Casar
 * `/db\.batch\(\)/` prova que as três letras estão escritas — NÃO prova que `db` existe.
 * E não existia: a porta nasceu na 2.0.122 sem `const db = admin.firestore()`, lançando
 * `ReferenceError: db is not defined` em TODA chamada, por meses. A tela mostrava a
 * presença (estado otimista) e o snapshot seguinte a apagava, porque nada foi gravado.
 * O teste de texto ficou VERDE o tempo inteiro. [[feedback_green_tests_still_broken]]
 *
 * Daqui pra baixo a CF é CARREGADA e EXECUTADA (o `onCall` da v2 expõe `.run(request)`)
 * contra um Firestore de mentira que se comporta como o real. O que falha aqui falha em
 * produção. Mesmo padrão de tests/link-do-grupo-do-jogo-persiste.test.js.
 * ═══════════════════════════════════════════════════════════════════════════════ */

/* ⛔ A MESMA INSTÂNCIA de firebase-admin que o functions/index.js carrega — o cache do Node
 * é por caminho RESOLVIDO. Requerer 'firebase-admin' daqui pegaria a cópia da raiz e o
 * dublê não teria efeito: a CF falaria com o Firestore de verdade. */
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
const FieldPathReal = admin.firestore.FieldPath;
const clone = (x) => JSON.parse(JSON.stringify(x));

/* ═══ O FIRESTORE DE MENTIRA ══════════════════════════════════════════════════
 * Só o que esta porta usa, e com as regras que importam:
 *  · escrita fica PENDENTE e só é aplicada no `commit()` — como no real, e é o que faz
 *    "negada não grava nada" ser uma prova e não uma esperança;
 *  · `update(ref, FieldPath, valor)` toca SÓ aquele caminho (`checkedIn.<uid>`), sem
 *    read-modify-write — a propriedade medida na 1.7.x, 25/25 sob contenção;
 *  · o lote ANOTA se o mesmo documento for tocado duas vezes: o Firestore recusa, e a
 *    porta se apoia em acumular os pares num update só.
 */
function bancoDeMentira(tid, doc, subs) {
  const b = { doc: clone(doc), subs: clone(subs || {}), commits: 0, docTocadoNoLote: 0, dupNoLote: false };

  const refSub = (col, id) => ({ _sub: col, _id: String(id) });
  const tRef = {
    _raiz: true,
    get: async () => ({ exists: true, data: () => clone(b.doc) }),
    collection: (nome) => ({ doc: (id) => refSub(nome, id) }),
  };

  function aplicaCaminho(obj, segs, valor) {
    let cur = obj;
    for (let i = 0; i < segs.length - 1; i++) {
      if (!cur[segs[i]] || typeof cur[segs[i]] !== 'object') cur[segs[i]] = {};
      cur = cur[segs[i]];
    }
    const ultimo = segs[segs.length - 1];
    if (valor && valor.constructor && valor.constructor.name === 'DeleteTransform') delete cur[ultimo];
    else cur[ultimo] = clone(valor);
  }

  b.batch = function () {
    const pend = [];
    const vistos = new Set();
    const marca = (chave) => { if (vistos.has(chave)) b.dupNoLote = true; vistos.add(chave); };
    return {
      update: (ref, ...args) => {
        marca(ref._raiz ? '__doc__' : ref._sub + '/' + ref._id);
        if (ref._raiz) b.docTocadoNoLote++;
        pend.push(() => {
          const alvo = ref._raiz ? b.doc : ((b.subs[ref._sub] || {})[ref._id]);
          if (!alvo) throw new Error('NOT_FOUND: update em documento inexistente');
          for (let i = 0; i < args.length; i += 2) {
            const campo = args[i];
            const segs = (campo instanceof FieldPathReal) ? campo.segments : String(campo).split('.');
            aplicaCaminho(alvo, segs, args[i + 1]);
          }
        });
      },
      set: (ref, v) => {
        marca(ref._raiz ? '__doc__' : ref._sub + '/' + ref._id);
        pend.push(() => { (b.subs[ref._sub] = b.subs[ref._sub] || {})[ref._id] = clone(v); });
      },
      delete: (ref) => {
        marca(ref._raiz ? '__doc__' : ref._sub + '/' + ref._id);
        pend.push(() => { if (b.subs[ref._sub]) delete b.subs[ref._sub][ref._id]; });
      },
      /* ⛔ só aqui o banco muda. Antes do commit, nada foi gravado — é isso que deixa
       * "a chamada negada não gravou NADA" ser verificável. */
      commit: async () => { b.commits++; pend.forEach((f) => f()); },
    };
  };

  b.collection = function (nome) {
    if (nome === 'tournaments') {
      return { doc: (id) => (String(id) === tid ? tRef : { _raiz: true, get: async () => ({ exists: false, data: () => null }), collection: (n) => ({ doc: (i) => refSub(n, i) }) }) };
    }
    return { doc: (id) => refSub(nome, id) };
  };
  return b;
}

/* ── carrega a CF REAL, com o admin já dublado ────────────────────────────────
 * ⚠️ `admin.firestore` é um GETTER no protótipo do FirebaseNamespace: `admin.firestore = x`
 * falha CALADO em modo solto e a CF continuaria falando com o Firestore de verdade.
 * `defineProperty` cria uma propriedade PRÓPRIA que sombreia o getter — e a conferência
 * logo abaixo aborta se um dia parar de pegar, em vez de deixar o teste "passar".
 * [[feedback_never_invent_config_to_silence_error]] */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'scoreplace-testes';
let BANCO = null;
const fsStub = function () { return BANCO; };
fsStub.FieldPath = FieldPathReal;
fsStub.FieldValue = admin.firestore.FieldValue;
Object.defineProperty(admin, 'initializeApp', { value: function () { return {}; }, writable: true, configurable: true });
Object.defineProperty(admin, 'firestore', { value: fsStub, writable: true, configurable: true });
if (admin.firestore !== fsStub) { console.error('  ✗ o dublê do admin.firestore não pegou — abortando'); process.exit(1); }
const CF = require(path.join(ROOT, 'functions/index.js'));
if (typeof CF.aplicarNoTorneio !== 'function' || typeof CF.aplicarNoTorneio.run !== 'function') {
  console.error('  ✗ aplicarNoTorneio não existe (ou não é onCall) — abortando');
  process.exit(1);
}

const DOC = { id: 'T1', name: 'Copa de Teste', creatorUid: 'uOrg', adminUids: ['uAdm'],
  coHosts: [{ uid: 'uCo', status: 'active' }], checkedIn: { uB: 111 }, absent: {}, _semPesados: [] };

function chamar(uid, ops, doc, subs) {
  BANCO = bancoDeMentira('T1', doc || DOC, subs);
  return CF.aplicarNoTorneio.run({
    data: { tournamentId: 'T1', ops: ops },
    auth: { uid: uid, token: { uid: uid } },
    rawRequest: { headers: {} },
    acceptsStreaming: false,
  }).then((r) => ({ r: r, b: BANCO }));
}
async function erroDe(p) { try { await p; return null; } catch (e) { return e; } }

(async function () {
  console.log('\n──── ⑥ a porta RODANDO (execução, não texto) ────');
  /* ⛔ A SEÇÃO INTEIRA VAI DENTRO DE try/catch: com a porta quebrada, o primeiro `chamar`
   * REJEITA e todos os seguintes também. Sem isto o processo morre com stack cru na
   * primeira e o gate mostra ruído em vez de DIAGNÓSTICO. Falhar tem que ser legível. */
  try {

  // ⑥.1 O QUE FALTAVA: ela grava mesmo? ───────────────────────────────────────
  {
    const e = await erroDe(chamar('uA', [{ parte: 'checkedIn', chave: 'uA', valor: 777 }]));
    ok('⭐⭐ a porta EXECUTA sem estourar (`db` existe de verdade)', !e,
      'ReferenceError aqui = a porta está morta em produção: presença aparece na tela e o snapshot seguinte apaga.\n      ' +
      'erro: ' + (e && (e.constructor.name + ': ' + e.message)));
  }
  const feliz = await chamar('uA', [{ parte: 'checkedIn', chave: 'uA', valor: 777 }]).catch(() => null);
  if (!feliz) {
    console.log('  ⚠️ a porta não executou — as provas de gravação abaixo não têm como rodar');
    falhas++;
  } else {
    ok('⭐⭐ e a marca CHEGA no banco (`checkedIn.uA`)', feliz.b.doc.checkedIn && feliz.b.doc.checkedIn.uA === 777,
      'o teste de texto casava com `db.batch()` e ficou verde meses com isto quebrado. checkedIn=' + JSON.stringify(feliz.b.doc.checkedIn));
    ok('  → sem derrubar quem já estava marcado', feliz.b.doc.checkedIn && feliz.b.doc.checkedIn.uB === 111,
      'escrita FINA: um caminho de campo toca só aquele campo');
    ok('  → e devolve a contagem', feliz.r && feliz.r.aplicadas === 1 && feliz.r.negadas.length === 0, JSON.stringify(feliz.r));
    ok('  → carimbando `updatedAt`', typeof feliz.b.doc.updatedAt === 'string' && feliz.b.doc.updatedAt.length > 10);
    ok('  → e commitando UMA vez', feliz.b.commits === 1, 'commits=' + feliz.b.commits);
  }

  // ⑥.2 apagar é apagar ────────────────────────────────────────────────────────
  {
    const { b } = await chamar('uB', [{ parte: 'checkedIn', chave: 'uB', valor: null }]);
    ok('⭐ valor `null` APAGA o campo (FieldValue.delete, não grava null)',
      b.doc.checkedIn && !('uB' in b.doc.checkedIn),
      'gravar `null` aqui deixaria a pessoa "marcada com nada". checkedIn=' + JSON.stringify(b.doc.checkedIn));
  }

  // ⑥.3 UM update só, por mais operações que venham ────────────────────────────
  {
    const { r, b } = await chamar('uOrg', [
      { parte: 'checkedIn', chave: 'uX', valor: 1 },
      { parte: 'absent', chave: 'uY', valor: 2 },
      { parte: 'checkedInConfirmed', chave: 'uZ', valor: 3 },
    ]);
    ok('⛔ 3 operações no documento viram UM update (lote não toca o mesmo doc 2×)',
      b.docTocadoNoLote === 1 && !b.dupNoLote,
      'o Firestore RECUSA o lote inteiro se o mesmo documento aparecer duas vezes — e lote recusado não grava NADA. tocou=' + b.docTocadoNoLote);
    ok('  → e as 3 chegam', r.aplicadas === 3 && b.doc.checkedIn.uX === 1 && b.doc.absent.uY === 2 && b.doc.checkedInConfirmed.uZ === 3);
  }

  // ⑥.4 campo que JÁ MORA FORA vira UM documento na subcoleção ─────────────────
  {
    const docDividido = Object.assign(clone(DOC), { _semPesados: ['checkedIn'] });
    const { b } = await chamar('uOrg', [{ parte: 'checkedIn', chave: 'uA', valor: 777 }], docDividido);
    const reg = (b.subs.checkedIn || {}).uA;
    ok('⭐⭐ torneio DIVIDIDO: a marca vai pra SUBCOLEÇÃO (o cliente não pode escrever lá)',
      !!reg && reg.item === 777 && reg._k === 'uA' && reg._idx === 'uA',
      'é isto que deixa `checkedIn` SAIR do documento sem as escritas caírem no vazio. reg=' + JSON.stringify(reg));
    ok('  → e o documento NÃO recebe o campo de volta', !(b.doc.checkedIn && 'uA' in b.doc.checkedIn),
      'gravar nos dois lugares é ter duas verdades. [[project_dividir_exige_todo_escritor_ciente]]');
    /* ⛔ A SUBCOLEÇÃO NASCE COM O REGISTRO. Rodar o apagar contra uma subcoleção VAZIA
     * passaria sem apagar coisa nenhuma — teste verde com a fixture que ele sabia ler.
     * [[feedback_congelador_cego_procurava_o_jogo_no_escopo_errado]] */
    const semeada = { checkedIn: { uB: { _idx: 'uB', _k: 'uB', item: 111 }, uC: { _idx: 'uC', _k: 'uC', item: 222 } } };
    const del = await chamar('uOrg', [{ parte: 'checkedIn', chave: 'uB', valor: null }], docDividido, semeada);
    ok('  → e apagar remove o DOCUMENTO da subcoleção',
      del.b.subs.checkedIn && !('uB' in del.b.subs.checkedIn),
      'restou: ' + JSON.stringify(Object.keys(del.b.subs.checkedIn || {})));
    ok('    (sem levar o vizinho junto)', !!(del.b.subs.checkedIn || {}).uC);
  }

  // ⑥.5 negada não grava NADA — nem a metade autorizada ────────────────────────
  {
    BANCO = bancoDeMentira('T1', DOC);
    const b = BANCO;
    const e = await erroDe(CF.aplicarNoTorneio.run({
      data: { tournamentId: 'T1', ops: [
        { parte: 'checkedIn', chave: 'uA', valor: 1 },   // pode
        { parte: 'checkedIn', chave: 'uB', valor: 1 },   // NÃO pode
      ] },
      auth: { uid: 'uA', token: { uid: 'uA' } },
      rawRequest: { headers: {} }, acceptsStreaming: false,
    }));
    ok('⛔ uma operação negada derruba a chamada INTEIRA', !!e && /permission-denied/.test(String(e.code || e.message)),
      'erro=' + (e && (e.code || e.message)));
    ok('  → e NADA foi gravado (nem a metade que ela podia)', b.commits === 0 && b.doc.checkedIn.uA === undefined,
      '"metade aplicada" é um estado que ninguém pediu e a tela não sabe representar. commits=' + b.commits);
  }

  // ⑥.6 campo fora da allowlist e torneio inexistente ──────────────────────────
  {
    BANCO = bancoDeMentira('T1', DOC);
    const b0 = BANCO;
    const e1 = await erroDe(CF.aplicarNoTorneio.run({
      data: { tournamentId: 'T1', ops: [{ parte: 'participants', chave: 'uA', valor: 1 }] },
      auth: { uid: 'uOrg', token: { uid: 'uOrg' } }, rawRequest: { headers: {} }, acceptsStreaming: false,
    }));
    ok('⛔ campo fora da allowlist é recusado NA EXECUÇÃO, não só na tabela',
      !!e1 && /permission-denied/.test(String(e1.code || e1.message)) && b0.commits === 0);

    BANCO = bancoDeMentira('T1', DOC);
    const e2 = await erroDe(CF.aplicarNoTorneio.run({
      data: { tournamentId: 'OUTRO', ops: [{ parte: 'checkedIn', chave: 'uOrg', valor: 1 }] },
      auth: { uid: 'uOrg', token: { uid: 'uOrg' } }, rawRequest: { headers: {} }, acceptsStreaming: false,
    }));
    ok('⛔ torneio inexistente vira `not-found`', !!e2 && /not-found/.test(String(e2.code || e2.message)),
      'erro=' + (e2 && (e2.code || e2.message)));

    BANCO = bancoDeMentira('T1', DOC);
    const b3 = BANCO;
    const e3 = await erroDe(CF.aplicarNoTorneio.run({
      data: { tournamentId: 'T1', ops: [{ parte: 'checkedIn', chave: 'uOrg', valor: 1 }] },
      auth: null, rawRequest: { headers: {} }, acceptsStreaming: false,
    }));
    ok('⛔ sem login não passa — e não grava', !!e3 && /unauthenticated/.test(String(e3.code || e3.message)) && b3.commits === 0);
  }

  } catch (e) {
    falhas++;
    console.log('  ✗ a seção de execução ABORTOU — a porta rejeitou e as provas seguintes não rodaram');
    console.log('      ' + (e && (e.constructor.name + ': ' + e.message)));
    console.log('      ' + String((e && e.stack) || '').split('\n').slice(1, 3).join('\n      '));
  }

  console.log(falhas === 0 ? '\n✅ porta-unica-de-escrita-fina: OK' : '\n❌ ' + falhas + ' falha(s)');
  process.exit(falhas === 0 ? 0 : 1);
})();
