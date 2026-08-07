/* "ATIVA MAS ELE DESATIVA SOZINHO" — o toggle que voltava atrás sozinho.
 * node tests/reativar-nao-desativa-sozinho.test.js
 *
 * INCIDENTE REAL QUE ESTE TESTE REPRODUZ (Confra BT Alta da Clínica 2026, 07/ago/2026):
 * a Ana Ribeiro (uid qiZBRNed…, nº 70) mandou VÍDEO ligando o toggle "Ativado" e ele
 * voltando sozinho para "Desativado" — quatro vezes seguidas. A Dani relatou o mesmo.
 *
 * O PRÓPRIO DOC DE PRODUÇÃO GRAVOU A CAUSA, nos horários exatos do vídeo (15:55:34Z,
 * 15:55:37Z, 15:56:13Z, 15:56:23Z — o vídeo é de 12:55–12:56 BRT):
 *
 *   "Protecao automatica: um save chegou sem 1 pessoa(s) e elas foram restauradas
 *    (qiZBRNedGufQJr2EvoPgcm9o0Qj1 (participants))."
 *
 * Ou seja: o guard "o elenco nunca encolhe" (v1.7.26) estava DESFAZENDO cada toque dela.
 *
 * A CADEIA, medida ponta a ponta:
 *   1. Ana estava INATIVA e, no sorteio, ficou sem grupo (só uma folga `sitOutReason:
 *      'inactive'`). Confirmado: o grupo dela (wl30) só nasceu às 16:06Z, 10 min DEPOIS.
 *   2. Ela liga o toggle → `_toggleLigaActive` faz o certo (v1.6.86): tira de
 *      `participants` e põe em `standbyParticipants`, de onde ela é chamada pra jogar.
 *   3. O save vai por `saveTournament` (ela é participante, não organizadora).
 *   4. O guard do `saveTournament` exigia que a pessoa continuasse NO ELENCO — não
 *      "em alguma lista" — então leu o movimento como perda e a RESTAUROU no elenco,
 *      empurrando a entrada COMO ESTÁ NO BANCO: com `ligaActive:false`.
 *   5. Resultado na tela: o toggle volta pra "Desativado" e a pessoa fica nos DOIS
 *      lugares (elenco + fila) — foi por isso que o vídeo mostra "Sair da lista de
 *      espera" e "você está inscrito" na mesma sessão.
 *
 * A DOUTRINA CERTA JÁ EXISTIA — no `mutateTournament` (v1.7.28), que corrigiu esse mesmo
 * engano justamente porque a versão "tem que ficar no elenco" QUEBRAVA O W.O.:
 *   "ninguém pode sumir DOS DOIS ao mesmo tempo. Onde exatamente é assunto do mutator."
 * O `saveTournament` ficou com a regra antiga. Eram duas regras para o mesmo invariante,
 * e a divergência é o bug.
 *
 * ⚠️ POR QUE A SUÍTE FICOU VERDE COM ISSO EM PRODUÇÃO: o teste que cobre o
 * `_toggleLigaActive` (inscricao-pos-sorteio-vai-pra-espera, seção 9) passa um
 * `FirestoreDB.saveTournament` FALSO. Ele prova que a função faz certo em MEMÓRIA — e o
 * defeito estava exatamente no save que vem depois. Por isso as duas metades correm
 * JUNTAS aqui, com as duas funções REAIS.
 *
 * SEGUNDA METADE (a tela): mesmo com o save correto, `_buildLigaActiveToggleHtml` fazia
 * `isActive = !_naFila && ...` — quem está na fila via "Desativado" MESMO estando com
 * `ligaActive:true`. Ou seja: consertar só o save deixaria o sintoma de pé.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const sec = (fn) => { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.stack); } };
const secA = async (fn) => { try { await fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.stack); } };

console.log('──── reativar não desativa sozinho ────');

// ── o saveTournament REAL, num sandbox com um Firestore falso ────────────────
function novoDB(docNoBanco) {
  const sandbox = {};
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;
  sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
  sandbox._safeHtml = (s) => String(s == null ? '' : s);
  sandbox.showNotification = () => {};
  sandbox.navigator = { userAgent: 'node' };
  sandbox.document = { getElementById: () => null, addEventListener() {} };
  sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sandbox._participantUids = (p) => (!p || typeof p !== 'object') ? []
    : [p.uid, p.p1Uid, p.p2Uid].filter(Boolean);
  sandbox._mergeMemberUids = (t, prev, next) => Array.from(new Set([].concat(prev || [], next || [])));
  sandbox._stripStoredNamesForUidEntries = (a) => a;
  sandbox.firebase = { firestore: Object.assign(() => ({}), { FieldValue: { delete: () => '__del__' } }) };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8'), sandbox,
    { filename: 'firebase-db.js' });
  const DB = sandbox.FirestoreDB;
  DB._computeAdminEmails = () => [];
  DB._computeAdminUids = () => [];
  DB._computeMemberUids = (d) => (d.participants || []).flatMap(sandbox._participantUids);
  DB._foldMonarchGroups = () => {};
  DB._cleanUndefined = (d) => JSON.parse(JSON.stringify(d));
  let gravado = null;
  DB.db = {
    collection: () => ({ doc: () => ({
      get: async () => ({ exists: !!docNoBanco, data: () => docNoBanco }),
      set: async (d) => { gravado = d; }
    }) })
  };
  return { DB, gravado: () => gravado };
}

const P = (uid, extra) => Object.assign({ uid: uid, addedAt: '2026-06-11T15:22:52Z' }, extra || {});

// Fixture espelhando o Confra no instante do vídeo: fase sorteada, Ana INATIVA e SEM
// grupo (só a folga `inactive` que o motor cria), todo mundo mais jogando.
function confraNoInstanteDoVideo() {
  return {
    id: 'tour_conf', format: 'Liga', status: 'active', ligaOpenEnrollment: true,
    participants: [
      P('u-ana', { ligaActive: false, enrollSeq: 70, category: 'D' }),   // a Ana Ribeiro
      P('u-jog1', { ligaActive: true }), P('u-jog2', { ligaActive: true }),
      P('u-jog3', { ligaActive: true }), P('u-jog4', { ligaActive: true }),
    ],
    standbyParticipants: [], waitlist: [], monarchWaitlist: { _default_: [] },
    rounds: [{
      round: 1, roundIndex: 0,
      monarchGroups: [{ players: ['J1', 'J2', 'J3', 'J4'],
                        playersUids: ['u-jog1', 'u-jog2', 'u-jog3', 'u-jog4'] }],
      matches: [
        { id: 'm1', p1: 'J1 / J2', p2: 'J3 / J4',
          team1Uids: ['u-jog1', 'u-jog2'], team2Uids: ['u-jog3', 'u-jog4'] },
        // a folga que o motor deu pra quem estava inativo — NÃO é jogo
        { id: 'sitout-rr-r1-0', p1: 'Ana Ribeiro', p2: 'FOLGA', p1Uid: 'u-ana',
          isSitOut: true, sitOutReason: 'inactive', round: 1 },
      ],
    }],
    matches: [], groups: [], history: [],
  };
}

(async function () {

// ══════════════════════════════════════════════════════════════════════════
// 1. O SAVE REAL: mover elenco → fila é MOVIMENTO, não perda
// ══════════════════════════════════════════════════════════════════════════
await secA(async function () {
  const banco = { id: 'T1', participants: [P('u-ana', { ligaActive: false }), P('u-bia')],
                  standbyParticipants: [] };
  const { DB, gravado } = novoDB(banco);
  // exatamente o que _toggleLigaActive produz: sai do elenco, entra na fila, ATIVA
  await DB.saveTournament({ id: 'T1',
    participants: [P('u-bia')],
    standbyParticipants: [P('u-ana', { ligaActive: true })] });
  const w = gravado();
  const elenco = (w.participants || []).map(p => p.uid);
  const fila = (w.standbyParticipants || []).map(p => p.uid);
  ok(!elenco.includes('u-ana'), 'quem foi movido pra fila NÃO pode ser restaurado no elenco');
  ok(fila.includes('u-ana'), 'e continua na fila, que é onde o movimento a colocou');
  ok(elenco.length + fila.length === 2, 'ninguém foi duplicado (o bug punha a pessoa nos DOIS)');
  const fAna = (w.standbyParticipants || []).find(p => p.uid === 'u-ana');
  ok(fAna && fAna.ligaActive === true,
     'a entrada gravada é a NOVA (ligaActive:true) — não a do banco, que traria false de volta');
  ok(!(w.history || []).some(h => /Protecao automatica/.test(h.message || '')),
     'movimento legítimo não pode gerar linha de "Protecao automatica" (foi o que apareceu 4× no Confra)');
});

// ══════════════════════════════════════════════════════════════════════════
// 2. PONTA A PONTA: _toggleLigaActive REAL + saveTournament REAL
//    (é a combinação que faltava — cada metade sozinha passava)
// ══════════════════════════════════════════════════════════════════════════
await secA(async function () {
  require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
  const win = globalThis.window;

  const t = confraNoInstanteDoVideo();
  const banco = JSON.parse(JSON.stringify(t));          // o doc como está no Firestore
  const { DB, gravado } = novoDB(banco);

  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  const i = src.indexOf('window._toggleLigaActive = function');
  const body = src.slice(i, src.indexOf('\n};', i) + 3);

  let saveP = Promise.resolve();
  const sb = {
    AppStore: { tournaments: [t], currentUser: { uid: 'u-ana' }, isOrganizer: () => false },
    _phaseDrawDone: win._phaseDrawDone,
    _isPlayingCurrentPhase: win._isPlayingCurrentPhase,
    _participantUids: win._participantUids,
    _waitlistPushBack: win._waitlistPushBack,
    _getWaitlist: win._getWaitlist,
    _removeFromWaitlist: win._removeFromWaitlist,
    _pName: win._pName,
    _userMatchesParticipant: (u, p) => !!(p && p.uid && u && u.uid && p.uid === u.uid),
    _warn: () => {}, showNotification: () => {}, _t: (k) => k,
    FirestoreDB: { saveTournament: (doc, opt) => (saveP = DB.saveTournament(doc, opt)) },
  };
  sb.window = sb;
  sb.document = { querySelectorAll: () => [], getElementById: () => null };
  sb.renderTournaments = () => {};
  const toggle = new Function('window', 'document', '_t', 'renderTournaments',
    'with (window) { ' + body + ' return window._toggleLigaActive; }'
  )(sb, sb.document, sb._t, sb.renderTournaments);

  // ANTES do fix isto é o vídeo inteiro: ela liga e o banco devolve "Desativado".
  ok(win._isPlayingCurrentPhase(t, t.participants.find(p => p.uid === 'u-ana')) === false,
     'pré-condição: a folga `inactive` NÃO conta como jogo (é o estado real dela no vídeo)');

  toggle(t.id, true);
  await saveP;

  const w = gravado();
  const elenco = (w.participants || []).map(p => p.uid);
  const fila = (w.standbyParticipants || []).map(p => p.uid);
  ok(!elenco.includes('u-ana'), 'DEPOIS DE SALVAR, a Ana não volta pro elenco');
  ok(fila.includes('u-ana'), 'DEPOIS DE SALVAR, a Ana está na lista de espera');
  const gravadaNoElenco = (w.participants || []).find(p => p.uid === 'u-ana');
  ok(!gravadaNoElenco || gravadaNoElenco.ligaActive !== false,
     'o doc gravado não pode conter a Ana com ligaActive:false — é literalmente o "desativa sozinho"');
  ok(!(w.history || []).some(h => /Protecao automatica/.test(h.message || '')),
     'nenhuma "Protecao automatica" no histórico: ligar o toggle não é perder ninguém');

  // e o segundo toque (o que ela fez 4×) continua idempotente
  const antesFila = (w.standbyParticipants || []).length;
  toggle(t.id, true);
  await saveP;
  const w2 = gravado();
  ok((w2.standbyParticipants || []).filter(p => p.uid === 'u-ana').length === 1,
     'tocar de novo não duplica a pessoa na fila');
  ok((w2.standbyParticipants || []).length === antesFila, 'a fila não cresce a cada toque');
});

// ══════════════════════════════════════════════════════════════════════════
// 3. A TELA: quem está na fila e DISPONÍVEL não pode ler "Desativado"
// ══════════════════════════════════════════════════════════════════════════
sec(function () {
  require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
  const win = globalThis.window;
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  win.document = globalThis.document;
  win._safeHtml = (s) => String(s == null ? '' : s);
  win.showNotification = () => {};
  win._warn = () => {};

  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  const i = src.indexOf('window._buildLigaActiveToggleHtml = function');
  const body = src.slice(i, src.indexOf('\n};', i) + 3);
  new Function('window', 'document', '_t', 'renderTournaments', 'with (window) { ' + body + ' }')(
    win, globalThis.document, (k) => k, () => {});

  function html(t, uid) {
    win.AppStore = { tournaments: [t], currentUser: { uid: uid }, isOrganizer: () => false };
    win._userMatchesParticipant = (u, p) => !!(p && p.uid && u && u.uid && p.uid === u.uid);
    return win._buildLigaActiveToggleHtml(t) || '';
  }
  const base = () => ({
    id: 'T', format: 'Liga', status: 'active', allowSelfDeactivation: true,
    participants: [P('u-x', { ligaActive: true })],
    standbyParticipants: [], waitlist: [], monarchWaitlist: { _default_: [] },
    rounds: [{ round: 1, monarchGroups: [], matches: [{ id: 'm', p1: 'X', p2: 'Y', team1Uids: ['u-x'] }] }],
    matches: [], groups: [],
  });

  // (a) na fila E disponível → "Ativado". É o coração do relato: ela LIGOU.
  const t1 = base();
  t1.standbyParticipants = [P('u-ana', { ligaActive: true, displayName: 'Ana' })];
  const h1 = html(t1, 'u-ana');
  ok(!!h1, 'quem está na fila continua vendo o controle (o caminho de volta da v1.6.93)');
  ok(/>Ativado</.test(h1),
     'na fila COM ligaActive:true o rótulo é "Ativado" — dizer "Desativado" contradiz o próprio dado');
  ok(h1.indexOf('checked') !== -1, 'e a chave aparece LIGADA (o vídeo mostra ela voltando sozinha)');
  ok(h1.indexOf('lista de espera') !== -1, 'o título segue explicando que ela está na fila');

  // (b) na fila e indisponível → "Desativado" (o dado manda, nos dois sentidos)
  const t2 = base();
  t2.standbyParticipants = [P('u-ana', { ligaActive: false, displayName: 'Ana' })];
  ok(/>Desativado</.test(html(t2, 'u-ana')), 'na fila com ligaActive:false o rótulo é "Desativado"');

  // (c) no elenco, inativo → "Desativado" (inalterado)
  const t3 = base();
  t3.participants.push(P('u-ana', { ligaActive: false }));
  ok(/>Desativado</.test(html(t3, 'u-ana')), 'inativo no elenco continua "Desativado"');

  // (d) no elenco, ativo → "Ativado" (inalterado)
  ok(/>Ativado</.test(html(base(), 'u-x')), 'ativo no elenco continua "Ativado"');
});

// ══════════════════════════════════════════════════════════════════════════
// 4. O QUE NÃO PODE QUEBRAR — as garantias que o guard existe pra dar
// ══════════════════════════════════════════════════════════════════════════
await secA(async function () {
  // (a) o caso do GERSOM: save atrasado que esqueceu um inscrito → restaura
  {
    const banco = { id: 'T1', participants: [P('u-ana'), P('u-gersom'), P('u-bia')] };
    const { DB, gravado } = novoDB(banco);
    await DB.saveTournament({ id: 'T1', participants: [P('u-ana'), P('u-bia')] });
    const uids = (gravado().participants || []).map(p => p.uid);
    ok(uids.includes('u-gersom'), 'save atrasado que some com inscrito CONTINUA restaurando (v1.7.26)');
    ok((gravado().history || []).some(h => /Protecao automatica/.test(h.message || '')),
       'e continua deixando rastro no histórico');
  }
  // (b) sumir de TODAS as listas sem declarar → restaura
  {
    const banco = { id: 'T1', participants: [P('u-ana'), P('u-gersom')], standbyParticipants: [] };
    const { DB, gravado } = novoDB(banco);
    await DB.saveTournament({ id: 'T1', participants: [P('u-ana')], standbyParticipants: [] });
    ok((gravado().participants || []).map(p => p.uid).includes('u-gersom'),
       'quem some do elenco SEM aparecer na fila continua sendo restaurado');
  }
  // (c) desinscrição declarada continua removendo de verdade
  {
    const banco = { id: 'T1', participants: [P('u-ana'), P('u-gersom')] };
    const { DB, gravado } = novoDB(banco);
    await DB.saveTournament({ id: 'T1', participants: [P('u-ana')] }, { allowRosterRemoval: true });
    ok(!(gravado().participants || []).map(p => p.uid).includes('u-gersom'),
       'allowRosterRemoval continua removendo (desinscrição)');
  }
  // (d) PROMOÇÃO fila → elenco segue reconhecida (W.O., formação de grupo)
  {
    const banco = { id: 'T1', participants: [P('u-ana')], standbyParticipants: [P('u-gersom')] };
    const { DB, gravado } = novoDB(banco);
    await DB.saveTournament({ id: 'T1', participants: [P('u-ana'), P('u-gersom')], standbyParticipants: [] });
    ok((gravado().standbyParticipants || []).length === 0, 'promovido SAI da fila e não é restaurado nela');
  }
  // (e) a FILA continua protegida contra save atrasado
  {
    const banco = { id: 'T1', participants: [P('u-ana')], standbyParticipants: [P('u-g'), P('u-b')] };
    const { DB, gravado } = novoDB(banco);
    await DB.saveTournament({ id: 'T1', participants: [P('u-ana')], standbyParticipants: [P('u-b')] });
    ok((gravado().standbyParticipants || []).map(p => p.uid).includes('u-g'),
       'quem some da fila num save atrasado continua sendo restaurado');
  }
  // (f) o save que NÃO traz a fila não pode ler "sumiu do elenco" como perda quando
  //     a pessoa está na fila DO BANCO
  {
    const banco = { id: 'T1', participants: [P('u-ana')], standbyParticipants: [P('u-gersom')] };
    const { DB, gravado } = novoDB(banco);
    await DB.saveTournament({ id: 'T1', participants: [P('u-ana')] });   // sem standbyParticipants
    ok(!(gravado().participants || []).map(p => p.uid).includes('u-gersom'),
       'quem está na fila do banco não é "restaurado" no elenco por um save que só traz elenco');
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 5. REATIVOU → SAI DA FOLGA E ENTRA NA LISTA DE ESPERA (regra do dono)
//
//    _"quem era folga e reativou entra na lista de espera"_ ·
//    _"reativou sai da folga e entra na lista de espera"_
//
//    MEDIDO no Confra (07/ago/2026): a Ana reativou, entrou na fila, formou grupo
//    (R1 grupo 31, 3 jogos) — e SEGUIA em "Desativados", porque a folga
//    `sitOutReason:'inactive'` do sorteio nunca saiu. Era a única nesse estado: das 4
//    folgas da rodada, 1 é de inativa de verdade e 2 são de W.O.
//
//    ⚠️ Consertar isso na FORMAÇÃO DE GRUPO seria tarde e errado: quem reativa e fica
//    esperando na fila sem formar grupo continuaria listado como desativado. Sair da folga
//    é parte do ato de REATIVAR.
// ══════════════════════════════════════════════════════════════════════════
await secA(async function () {
  require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
  const win = globalThis.window;
  ok(typeof win._sanitizeSitOutsVsRoster === 'function', '_sanitizeSitOutsVsRoster existe e é vendorável');

  // (a) o ato de reativar tira a folga — pelo caminho REAL, com o save REAL
  {
    const t = confraNoInstanteDoVideo();
    // mais 3 folgas que NÃO podem ser tocadas
    t.participants.push(P('u-outra', { ligaActive: false }));
    const R = t.rounds[0].matches;
    R.push({ id: 'so2', p1: 'Outra Inativa', p2: 'FOLGA', p1Uid: 'u-outra', isSitOut: true, sitOutReason: 'inactive' });
    R.push({ id: 'wo1', p1: 'Levou WO', p2: 'W.O.', p1Uid: 'u-wo', isSitOut: true, sitOutReason: 'wo' });
    R.push({ id: 'rem1', p1: 'Sobrou', p2: 'FOLGA', p1Uid: 'u-rem', isSitOut: true, sitOutReason: 'remainder' });
    t.participants.push(P('u-wo', { ligaActive: false, woDeactivatedAt: '2026-08-06T22:00:55Z' }));

    const banco = JSON.parse(JSON.stringify(t));
    const { DB, gravado } = novoDB(banco);
    const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
    const i = src.indexOf('window._toggleLigaActive = function');
    const body = src.slice(i, src.indexOf('\n};', i) + 3);
    let saveP = Promise.resolve();
    const sb = {
      AppStore: { tournaments: [t], currentUser: { uid: 'u-ana' }, isOrganizer: () => false },
      _phaseDrawDone: win._phaseDrawDone, _isPlayingCurrentPhase: win._isPlayingCurrentPhase,
      _participantUids: win._participantUids, _waitlistPushBack: win._waitlistPushBack,
      _getWaitlist: win._getWaitlist, _removeFromWaitlist: win._removeFromWaitlist,
      _sanitizeSitOutsVsRoster: win._sanitizeSitOutsVsRoster, _pName: win._pName,
      _userMatchesParticipant: (u, p) => !!(p && p.uid && u && u.uid && p.uid === u.uid),
      _warn: () => {}, showNotification: () => {}, _t: (k) => k,
      FirestoreDB: { saveTournament: (doc, opt) => (saveP = DB.saveTournament(doc, opt)) },
    };
    sb.window = sb;
    sb.document = { querySelectorAll: () => [], getElementById: () => null };
    sb.renderTournaments = () => {};
    const toggle = new Function('window', 'document', '_t', 'renderTournaments',
      'with (window) { ' + body + ' return window._toggleLigaActive; }'
    )(sb, sb.document, sb._t, sb.renderTournaments);

    toggle(t.id, true);
    await saveP;

    const so = (gravado().rounds[0].matches || []).filter(m => m.isSitOut);
    const ids = so.map(m => m.id);
    ok(!ids.includes('sitout-rr-r1-0'), 'reativar TIRA a folga de quem reativou (o sintoma do dono)');
    ok((gravado().standbyParticipants || []).some(p => p.uid === 'u-ana'), 'e ela entra na lista de espera');
    ok(ids.includes('so2'), 'a folga de OUTRA pessoa que segue inativa NÃO é tocada');
    ok(ids.includes('wo1'), 'a folga de W.O. NÃO é tocada (é registro de falta, com 0 pts)');
    ok(ids.includes('rem1'), 'a folga de "remainder" NÃO é tocada (tem cura própria)');
    ok((gravado().rounds[0].matches || []).filter(m => !m.isSitOut).length === 1, 'jogo real intacto');
  }

  // (b) o saneamento sozinho: idempotente, casa por UID e respeita quem está inativo
  {
    const t = confraNoInstanteDoVideo();
    // Ana já foi pra fila (estado pós-reativação), mas a folga ficou — é o doc da Ana hoje
    t.participants = t.participants.filter(p => p.uid !== 'u-ana');
    t.standbyParticipants = [P('u-ana', { ligaActive: true })];
    ok(win._sanitizeSitOutsVsRoster(t) === 1, 'cura o doc já gravado: 1 folga removida');
    ok(win._sanitizeSitOutsVsRoster(t) === 0, 'e é IDEMPOTENTE: rodar de novo não remove nada');
    ok((t.rounds[0].matches || []).filter(m => m.isSitOut).length === 0, 'a folga fantasma saiu');
  }
  {
    // quem está DESATIVADO no elenco mantém a folga — é o estado que ela descreve
    const t = confraNoInstanteDoVideo();
    ok(win._sanitizeSitOutsVsRoster(t) === 0, 'inativo de verdade CONTINUA com a folga');
  }
  {
    // já jogando (voltou pro grupo) também não pode ter folga
    const t = confraNoInstanteDoVideo();
    t.participants.find(p => p.uid === 'u-ana').ligaActive = true;
    t.rounds[0].monarchGroups[0].playersUids.push('u-ana');
    ok(win._sanitizeSitOutsVsRoster(t) === 1, 'quem voltou a jogar não segue como folga');
  }
  {
    // NOME TROCADO não engana: a identidade é o uid
    const t = confraNoInstanteDoVideo();
    t.rounds[0].matches.find(m => m.isSitOut).p1 = 'Nome Antigo Dela';
    t.participants.find(p => p.uid === 'u-ana').ligaActive = true;
    ok(win._sanitizeSitOutsVsRoster(t) === 1, 'casa por uid mesmo com o nome gravado diferente');
  }
  {
    // fictício (sem uid) casa por nome — é a única identidade que ele tem
    const t = confraNoInstanteDoVideo();
    delete t.rounds[0].matches.find(m => m.isSitOut).p1Uid;
    t.participants = t.participants.filter(p => p.uid !== 'u-ana');
    t.participants.push({ displayName: 'Ana Ribeiro', ligaActive: false });
    ok(win._sanitizeSitOutsVsRoster(t) === 0, 'fictício desativado mantém a folga (casa por nome)');
  }
});

console.log(`\n  ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);

})();
