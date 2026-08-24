/* QUEM ESTÁ NA FILA NÃO ESTÁ NA LISTA DE W.O. — o marcador de folga é estado, não história
 * node tests/wo-na-fila-nao-esta-na-lista-de-wo.test.js
 *
 * REGRA DO DONO (24/ago/2026, caso Carol Moresco na Confra):
 *   _"ou está inativa, ou na lista de espera ou no wo ou em jogo. não pode estar em 2
 *   lugares diferentes. no grupo em que ela tomou wo fica a indicação histórica, ela
 *   não está lá."_
 *
 * O CASO REAL: a Carol tomou W.O. no R1 (grupo A), a vaga foi PREENCHIDA por substituta
 * (g.subStatus:'filled' — os slots foram reescritos, ela saiu dos players), ela reativou
 * e foi pra lista de espera (woSentToWaitlistAt). Mas o marcador de folga (match sintético
 * isSitOut + sitOutReason:'wo' com o uid dela) ficou em rounds[0].matches — e é DELE que
 * a caixa "⚠️ W.O." lê os nomes (bracket.js). Resultado: ela aparecia na espera E na
 * lista de W.O. ao mesmo tempo. O dado foi consertado à mão em 24/ago; este teste trava
 * o CÓDIGO pro próximo caso.
 *
 * A NUANCE (medida no motor antes de generalizar): quando a vaga NÃO foi preenchida, o
 * nome da pessoa segue nos players do grupo e o marcador é LOAD-BEARING — é dele que
 * saem os 0 pts da rodada (_playerRoundStats), a punição de W.O. dos Pontos Avançados
 * (_calcAdvancedPoints, contagem por marcador) e a blindagem contra jogos-fantasma
 * (_woRounds). Nesse cenário o marcador FICA, mesmo com a pessoa na fila.
 *
 * A indicação histórica do grupo (g.woAbsent/g.woAbsentUid/g.subName/g.subStatus) não é
 * tocada em nenhum cenário — é ela que fica, por ordem do dono.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(nome, fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ [' + nome + '] estourou:', e && e.message); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;

console.log('──── quem está na fila não está na lista de W.O. ────');

// ── doc no formato do Confra: Rei/Rainha, R1 sorteado, W.O. da Carol no grupo A ──
// `filled` decide o cenário: true = substituta assumiu (Carol FORA dos players);
// false = vaga aberta (Carol AINDA nos players).
function torneioComWo(filled) {
  const grupo = {
    gi: 0, name: 'Grupo A',
    players: filled ? ['Sub Stituta', 'Bia', 'Cris', 'Dani'] : ['Carol Moresco', 'Bia', 'Cris', 'Dani'],
    playersUids: filled ? ['u_sub', 'u_bia', 'u_cris', 'u_dani'] : ['u_carol', 'u_bia', 'u_cris', 'u_dani'],
    woAbsent: 'Carol Moresco', woAbsentUid: 'u_carol',
    subStatus: filled ? 'filled' : undefined,
    subName: filled ? 'Sub Stituta' : undefined,
  };
  const marcador = {
    id: 'wo-r1-1787583928978-6667', round: 1, roundIndex: 0,
    p1: 'Carol Moresco', p2: 'W.O.', isSitOut: true, sitOutReason: 'wo', sitOutPoints: 0,
    p1Uid: 'u_carol', team1Uids: ['u_carol'], label: 'R1 • W.O.',
  };
  return {
    id: 'T', format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
    status: 'active', allowSelfDeactivation: true,
    participants: [{ uid: 'u_bia', displayName: 'Bia', ligaActive: true }],
    standbyParticipants: [], waitlist: [], monarchWaitlist: {},
    memberUids: ['u_bia', 'u_carol'], matches: [], groups: [],
    rounds: [{ round: 1, roundIndex: 0, monarchGroups: [grupo],
      matches: [
        { id: 'm1', p1: 'Bia', p2: 'Cris', round: 1 },
        marcador,
        // folga de inativo de OUTRA pessoa, legítima: não pode sair no arrasto
        { id: 'folga-r1-1', p1: 'Ina Tiva', p1Uid: 'u_ina', isSitOut: true, sitOutReason: 'inactive', sitOutPoints: 0 },
      ] }],
  };
}
const carolNaFila = (t) => {
  t.standbyParticipants.push({ uid: 'u_carol', displayName: 'Carol Moresco', ligaActive: true, woSentToWaitlistAt: '2026-08-24T12:00:00Z' });
};
const marcadoresWo = (t) => t.rounds[0].matches.filter((m) => m.isSitOut && m.sitOutReason === 'wo');
const folgaDaIna = (t) => t.rounds[0].matches.filter((m) => m.isSitOut && m.sitOutReason === 'inactive').length;

// pra folga de inativo da Ina não ser removida pelo ramo 'inactive' (ela está desativada)
const inaDesativada = (t) => { t.participants.push({ uid: 'u_ina', displayName: 'Ina Tiva', ligaActive: false }); };

// ── 1. CASO CAROL: vaga preenchida + na fila → o marcador SAI, a história FICA ──
sec('caso Carol (vaga preenchida)', function () {
  const t = torneioComWo(true);
  inaDesativada(t);
  carolNaFila(t);
  const n = win._sanitizeSitOutsVsRoster(t);
  ok(n === 1, 'remove exatamente o marcador da Carol — removeu ' + n);
  ok(marcadoresWo(t).length === 0, 'ela some da fonte da lista "⚠️ W.O."');
  const g = t.rounds[0].monarchGroups[0];
  ok(g.woAbsent === 'Carol Moresco' && g.woAbsentUid === 'u_carol' && g.subStatus === 'filled',
     'a indicação histórica do grupo não é tocada (g.woAbsent/g.woAbsentUid/g.subStatus)');
  ok(folgaDaIna(t) === 1, 'a folga de inativo legítima (outra pessoa) não sai no arrasto');
  ok((t.rounds[0].matches || []).some((m) => m.id === 'm1'), 'jogo real intacto');
  ok(win._sanitizeSitOutsVsRoster(t) === 0, 'idempotente: segunda passada não remove nada');
});

// ── 2. VAGA ABERTA: nome ainda nos players → marcador FICA (é ele que dá os 0 pts) ──
sec('vaga aberta', function () {
  const t = torneioComWo(false);
  inaDesativada(t);
  carolNaFila(t);   // mesmo na fila...
  const n = win._sanitizeSitOutsVsRoster(t);
  ok(n === 0, '...o marcador fica enquanto ela ocupa vaga no grupo — removeu ' + n);
  ok(marcadoresWo(t).length === 1, 'o marcador segue lá (0 pts da rodada + punição de W.O.)');
});

// ── 3. AINDA DESATIVADA (não está na fila): o W.O. é o lugar dela → marcador FICA ──
sec('ainda desativada', function () {
  const t = torneioComWo(true);
  inaDesativada(t);
  t.participants.push({ uid: 'u_carol', displayName: 'Carol Moresco', ligaActive: false, woDeactivatedAt: '2026-08-24T11:00:00Z' });
  const n = win._sanitizeSitOutsVsRoster(t);
  ok(n === 0, 'quem não reativou continua no W.O. — removeu ' + n);
  ok(marcadoresWo(t).length === 1, 'marcador intacto');
});

// ── 4. FICTÍCIO (sem conta): a identidade é o nome, e a régua vale igual ──────────
sec('fictício por nome', function () {
  const t = torneioComWo(true);
  inaDesativada(t);
  const mk = marcadoresWo(t)[0];
  delete mk.p1Uid; delete mk.team1Uids;   // marcador legado/fictício: só o nome
  t.standbyParticipants.push({ name: 'Carol Moresco', displayName: 'Carol Moresco' });
  const n = win._sanitizeSitOutsVsRoster(t);
  ok(n === 1, 'sem uid nenhum, decide pelo nome — removeu ' + n);
  ok(marcadoresWo(t).length === 0, 'marcador removido');
});

// ── 5. O FLUXO REAL: reativar depois do W.O. tira o marcador no MESMO ato ─────────
// (o _toggleLigaActive REAL, extraído do arquivo — nada de réplica)
let salvarFalha = false;
function carregaToggle(t) {
  win.AppStore = {
    tournaments: [t],
    currentUser: { uid: 'u_carol' },
    isOrganizer: () => false,
    mutate: (i, f) => { f(t); return Promise.resolve(true); },
  };
  win._userMatchesParticipant = (u, p) => {
    if (!u || !p) return false;
    return [p.uid, p.p1Uid, p.p2Uid].filter(Boolean).indexOf(u.uid) !== -1;
  };
  win.FirestoreDB = { saveTournament: () => (salvarFalha ? Promise.reject(new Error('offline')) : Promise.resolve()) };
  win.showNotification = () => {};
  win._warn = () => {};
  win._t = (k) => k;
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  win.document = globalThis.document;
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  const marca = 'window._toggleLigaActive = function';
  const i = src.indexOf(marca);
  const corpo = src.slice(i, src.indexOf('\n};', i) + 3);
  new Function('window', 'document', '_t', 'renderTournaments', 'with (window) { ' + corpo + ' }')(
    win, globalThis.document, (k) => k, () => {});
}
async function secA(nome, fn) { try { await fn(); } catch (e) { fail++; console.error('  ✗ [' + nome + '] estourou:', e && e.stack); } }

(async function () {
  await secA('reativar depois do W.O.', async function () {
    const t = torneioComWo(true);
    inaDesativada(t);
    // Carol desativada pelo W.O. (o que _ligaApplyDest grava no destino DESATIVADOS)
    t.participants.push({ uid: 'u_carol', displayName: 'Carol Moresco', ligaActive: false, woDeactivatedAt: '2026-08-24T11:00:00Z' });
    carregaToggle(t);
    salvarFalha = false;
    win._toggleLigaActive('T', true);
    await new Promise((r) => setTimeout(r, 20));
    const fila = win._getWaitlist(t).map((e) => e.uid || e.displayName);
    ok(fila.indexOf('u_carol') !== -1, 'reativar depois do W.O. leva à lista de espera');
    ok(marcadoresWo(t).length === 0, 'e o marcador de W.O. sai no MESMO ato — um lugar só');
    ok(folgaDaIna(t) === 1, 'sem arrastar a folga de inativo dos outros');
    const g = t.rounds[0].monarchGroups[0];
    ok(g.woAbsent === 'Carol Moresco' && g.subStatus === 'filled', 'história do grupo preservada');
  });

  await secA('rollback do save falho', async function () {
    const t = torneioComWo(true);
    inaDesativada(t);
    t.participants.push({ uid: 'u_carol', displayName: 'Carol Moresco', ligaActive: false, woDeactivatedAt: '2026-08-24T11:00:00Z' });
    carregaToggle(t);
    salvarFalha = true;
    win._toggleLigaActive('T', true);
    await new Promise((r) => setTimeout(r, 20));
    ok(marcadoresWo(t).length === 1, 'save falhou → a folga de W.O. volta junto com a pessoa');
    ok(win._getWaitlist(t).map((e) => e.uid).indexOf('u_carol') === -1, 'e ela sai da fila (estado de antes)');
    salvarFalha = false;
  });

  console.log('  ' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
