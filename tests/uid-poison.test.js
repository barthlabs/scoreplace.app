/* TRAVA DO CÂNONE DE IDENTIDADE — fixture ENVENENADO.
 *
 * REGRA (dono): participante é identificado por UID. SEMPRE. Exceção ÚNICA: o jogador
 * FICTÍCIO (sem conta), onde o nome é a única identidade que existe.
 *
 * POR QUE ESTE ARQUIVO EXISTE — e por que os anteriores não bastaram:
 * A "varredura de uid" já foi dada como concluída DUAS vezes e o hack de nome voltou nas
 * duas. E o `test-uid-identity.js` que escrevi antes NÃO era trava: era teste unitário das
 * funções que eu mesmo tinha acabado de consertar — nunca chamava `_applyWO` nem
 * `wo-claim`, então não tinha como pegar o bug seguinte. Grep também não serve: varrer
 * `split('/')` dá 123 ocorrências em 22 arquivos, quase tudo ruído (URL no router, display
 * juntando nomes) — o sinal afoga e o revisor satura. Dono: _"cadê a merda das travas que
 * indicariam a porra do nome no lugar de uid?"_ — não existiam. Esta é.
 *
 * COMO ENVENENA: o torneio é montado de forma que o NOME é inútil ou MENTIROSO —
 *   (a) TODO MUNDO tem o mesmo displayName ("X");
 *   (b) o rótulo do slot (m.p1/m.p2) está VELHO/errado — como fica quando alguém troca o
 *       nome depois do sorteio, ou quando o doc guarda só uid (_stripUidEntryNames NÃO
 *       grava nome de quem tem perfil vivo);
 *   (c) os uids são a ÚNICA informação correta.
 * Quem resolve por uid continua acertando. Quem resolve por nome — como fallback, atalho,
 * `split('/')` ou `indexOf(nome)` — dá a resposta ERRADA na hora, e o teste fica VERMELHO.
 * Não precisa saber QUAIS linhas são identidade: o comportamento denuncia. E vale pra
 * código que ninguém revisou, que é o ponto.
 *
 * Ver [[project_uid_identity_canon_locked]] / [[project_wo_individual_substitution_rule]].
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, body: {} };
sandbox.location = { hash: '' };
sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox.showConfirmDialog = sandbox.showAlertDialog = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };
sandbox.AppStore = { tournaments: [], logAction() {}, sync() {}, currentUser: null, mutate: () => Promise.resolve() };
vm.createContext(sandbox);

const ROOT = path.join(__dirname, '..', 'js', 'views');
const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });

// ☠️ O VENENO: TODO MUNDO se chama "X". Nome não distingue ninguém.
const POISON = 'X';
const UIDS = ['a1', 'b1', 'a2', 'b2', 's1'];
const NAMES = {}; UIDS.forEach((u) => { NAMES[u] = POISON; });
sandbox._profileNameByUid = NAMES;
sandbox._nameForUid = (u) => NAMES[u] || '';
sandbox._displayNameForUid = (u, stored) => NAMES[u] || stored || '';
sandbox._pName = (p, fb) => {
  if (!p) return fb || '';
  if (typeof p === 'string') return p;
  if (p.p1Uid || p.p2Uid) return [p.p1Uid, p.p2Uid].filter(Boolean).map((u) => NAMES[u] || '?').join(' / ');
  return NAMES[p.uid] || p.displayName || p.name || fb || '';
};

load('identity-core.js');
// _getStandbyPool CANÔNICO (cópia literal do store.js — dedup por uid). O store.js inteiro
// não carrega em Node (toca document/timers no load); só esta função importa aqui.
sandbox._getStandbyPool = function (t) {
  if (!t) return [];
  var sp = Array.isArray(t.standbyParticipants) ? t.standbyParticipants : [];
  var wl = Array.isArray(t.waitlist) ? t.waitlist : [];
  var _key = function (p) { var u = sandbox._participantUids(p); return u.length ? 'u:' + u.slice().sort().join('+') : 'n:' + sandbox._pName(p); };
  var seen = new Set(sp.map(_key));
  var pool = sp.slice();
  wl.forEach(function (w) { var k = _key(w); if (k !== 'n:' && !seen.has(k)) { seen.add(k); pool.push(w); } });
  return pool;
};
sandbox._collectAllMatches = function (t) { return Array.isArray(t.matches) ? t.matches.slice() : []; };
sandbox._woHistSet = function () {}; sandbox._woHistGet = function () { return null; }; sandbox._woHistDel = function () {};
sandbox._woIsKnockoutMatch = function () { return true; };
sandbox._advanceWinner = function () {};
sandbox._canonGender = function (g){ var x=String(g||'').toLowerCase(); if(x.indexOf('fem')===0)return 'Fem'; if(x.indexOf('masc')===0)return 'Masc'; if(x.indexOf('mist')===0||x.indexOf('mix')===0)return 'Misto'; return 'none'; };

load('tournaments-utils.js');
load('bracket-logic.js');   // _slotUids
load('tournaments-categories.js'); // _getParticipantCategories / _participantInCategory
load('wo-claim.js');        // _woMatchMembers
load('draw-decisions.js');  // _entryIsPresent / _applyPresenceRoll
load('participants.js');    // _applyWO — o motor

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' — ' + got : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
};

console.log('\n☠️  FIXTURE ENVENENADO — todos se chamam "' + POISON + '"; só o uid é verdade\n');

// ── FLUXO 1 · alvo do W.O. (wo-claim) ────────────────────────────────────────
console.log('W.O. — quem a tela oferece como alvo:');
{
  const t = {
    id: 'T', format: 'Eliminatórias Simples', enrollmentMode: 'teams', teamSize: 2,
    woScope: 'individual',
    participants: [{ p1Uid: 'a1', p2Uid: 'b1' }, { p1Uid: 'a2', p2Uid: 'b2' }],
    standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {}, matches: [], vips: {},
  };
  // rótulo VELHO de propósito: os nomes ali não existem mais. Só os uids valem.
  const m = { id: 'm1', round: 1, p1: 'NomeVelho1 / NomeVelho2', p2: 'NomeVelho3 / NomeVelho4',
              team1Uids: ['a1', 'b1'], team2Uids: ['a2', 'b2'], winner: null };
  const members = sandbox._woMatchMembers(t, m);
  ok('4 alvos mesmo com o rótulo do slot mentindo', members.length === 4,
     members.length + ' alvos');
  ok('cada alvo tem 1 uid, e são os dos slots',
     members.map((x) => (x.uids || [])[0]).sort().join(',') === 'a1,a2,b1,b2',
     members.map((x) => (x.uids || []).join('+')).join(' | '));
}

// ── FLUXO 2 · o motor decide individual × time (participants._applyWO) ───────
// ESTE é o que a trava anterior não pegava: o motor decidia por
// `entryStr.includes('/')` + `members.indexOf(absentName)`. Com nome envenenado
// (todos "X") e rótulo velho, o nome NUNCA casa → caía em W.O. do TIME, calado.
console.log('\nW.O. — o motor decide individual × time:');
{
  const mkT = () => ({
    id: 'T2', format: 'Eliminatórias Simples', enrollmentMode: 'teams', teamSize: 2,
    woScope: 'individual',
    participants: [{ p1Uid: 'a1', p2Uid: 'b1' }, { p1Uid: 'a2', p2Uid: 'b2' }],
    standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {}, vips: {},
    matches: [{ id: 'm1', round: 1, p1: 'NomeVelho1 / NomeVelho2', p2: 'NomeVelho3 / NomeVelho4',
                team1Uids: ['a1', 'b1'], team2Uids: ['a2', 'b2'], winner: null }],
  });
  const t = mkT();
  const r = sandbox._applyWO(t, {
    absentName: POISON, absentUids: ['a1'],   // a PESSOA a1 faltou
    scope: 'match', woScope: 'individual', noSubBehavior: 'escalate',
  });
  const m = t.matches[0];
  // Sem suplente presente → é W.O. mesmo (regra do dono). O que se trava aqui é que o
  // motor RECONHECEU o alvo pelo uid: marcou a ausência de a1 e mandou o PARCEIRO (b1)
  // pra lista de espera — que é o que só acontece no ramo INDIVIDUAL.
  ok('marcou ausente o uid a1 (não o rótulo)', !!t.absent['a1'], JSON.stringify(t.absent));
  ok('reconheceu como INDIVIDUAL: o parceiro (uid b1) foi pra espera',
     (t.standbyParticipants || []).some((p) => sandbox._participantUids(p).indexOf('b1') !== -1),
     'standby=' + JSON.stringify(t.standbyParticipants));
  ok('o W.O. caiu no lado certo', m.woAbsentSide === 'p1', 'lado=' + m.woAbsentSide);
  ok('vencedor é o adversário', m.winner === m.p2, 'winner=' + m.winner);
}

// ── FLUXO 3 · presença de dupla (draw-decisions) ────────────────────────────
console.log('\nPresença — dupla com nome envenenado:');
{
  const t = { id: 'T3', enrollmentMode: 'teams', teamSize: 2,
              participants: [{ p1Uid: 'a1', p2Uid: 'b1' }],
              checkedIn: { a1: 1, b1: 1 }, absent: {}, waitlist: [] };
  ok('dupla 100% presente é PRESENTE (o rótulo não ajuda)',
     sandbox._entryIsPresent(t, t.participants[0]) === true);
  const t2 = { id: 'T4', enrollmentMode: 'teams', teamSize: 2,
               participants: [{ p1Uid: 'a1', p2Uid: 'b1' }],
               checkedIn: { [POISON]: 1, 'NomeVelho1 / NomeVelho2': 1 }, absent: {}, waitlist: [] };
  ok('check-in gravado com NOME não vale (só uid)',
     sandbox._entryIsPresent(t2, t2.participants[0]) === false);
}

// ── FLUXO 4 · VIP (identity-core) ───────────────────────────────────────────
console.log('\nVIP — flag por uid:');
{
  const t = { id: 'T5', vips: { b1: true }, participants: [{ p1Uid: 'a1', p2Uid: 'b1' }] };
  ok('entrada com 1 membro VIP (uid) é VIP', sandbox._entryHasVip(t, t.participants[0]) === true);
  const t2 = { id: 'T6', vips: { [POISON]: true }, participants: [{ p1Uid: 'a1', p2Uid: 'b1' }] };
  ok('VIP gravado por NOME não contamina quem tem uid',
     sandbox._entryHasVip(t2, t2.participants[0]) === false);
}

// ── FLUXO 5 · substituição de W.O. por GÊNERO (participants._applyWoSubsToTournament) ──
// Misto obrigatório: só entra automático suplente do MESMO gênero. Gênero lido por UID.
// Veneno: todos "X"; o gênero mora no OBJETO por uid (p1Gender/p2Gender/gender), nunca no nome.
console.log('\nSubstituição de W.O. — regra de gênero por uid (misto obrigatório):');
{
  // dupla mista: a1=Masc, b1=Fem. suplentes: sF (Fem) e sM (Masc), ambos presentes.
  const mkT = () => ({
    id: 'G', format: 'Eliminatórias Simples', enrollmentMode: 'teams', teamSize: 2,
    woScope: 'individual', genderCategories: ['misto_obrigatorio'],
    participants: [
      { p1Uid: 'a1', p2Uid: 'b1', p1Gender: 'masculino', p2Gender: 'feminino' },
      { p1Uid: 'a2', p2Uid: 'b2', p1Gender: 'masculino', p2Gender: 'feminino' },
    ],
    standbyParticipants: [{ uid: 'sF', gender: 'feminino' }, { uid: 'sM', gender: 'masculino' }],
    waitlist: [], checkedIn: { sF: 1, sM: 1 }, absent: {}, vips: {},
    matches: [{ id: 'm1', round: 1, p1: 'X / X', p2: 'X / X',
                team1Uids: ['a1', 'b1'], team2Uids: ['a2', 'b2'], winner: null }],
  });
  // W.O. na b1 (Fem) → tem que entrar sF (Fem), NUNCA sM (Masc)
  let t = mkT(); t.absent = { b1: 1 };
  let r = sandbox._applyWoSubsToTournament(t);
  const m = t.matches[0];
  ok('mulher ausente → suplente MULHER entra (por uid, não FIFO)',
     r.subCount === 1 && (m.team1Uids || []).indexOf('sF') !== -1 && (m.team1Uids || []).indexOf('sM') === -1,
     'team1Uids=' + JSON.stringify(m.team1Uids));
  // W.O. no a1 (Masc) sem nenhum homem suplente → pendência, NÃO substitui calado
  t = mkT(); t.standbyParticipants = [{ uid: 'sF', gender: 'feminino' }]; t.checkedIn = { sF: 1 }; t.absent = { a1: 1 };
  r = sandbox._applyWoSubsToTournament(t);
  ok('homem ausente sem homem suplente → NÃO substitui automático',
     r.subCount === 0 && (r.subChoicePending || []).length === 1,
     'subCount=' + r.subCount + ' pending=' + (r.subChoicePending || []).length);
  ok('a pendência é por uid (alvo a1, opção sF)',
     r.subChoicePending[0].absentUid === 'a1' && r.subChoicePending[0].options[0].uid === 'sF');
  // organizador ACEITA a quebra → sF entra no lugar do homem
  const t2 = mkT(); t2.standbyParticipants = [{ uid: 'sF', gender: 'feminino' }]; t2.checkedIn = { sF: 1 }; t2.absent = { a1: 1 };
  sandbox._findTournamentById = (id) => (String(id) === 'G' ? t2 : null);
  const rr = sandbox._woResolveSubChoice('G', 'a1', 'sF');
  ok('organizador aceita a quebra → sF assume a vaga do a1',
     rr.subCount === 1 && (t2.matches[0].team1Uids || []).indexOf('sF') !== -1,
     'team1Uids=' + JSON.stringify(t2.matches[0].team1Uids));
}

// ── FLUXO 6 · a regra vale pra QUALQUER categoria — não só gênero ────────────
// Dono: "a regra de gênero aqui é um exemplo, mas deve funcionar sempre que o suplente
// não atende a regra da categoria — pode ser idade ou habilidade [ou personalizada]."
console.log('\nCategoria genérica (idade/habilidade/custom) — mesma trava, por uid:');
{
  // torneio por HABILIDADE: categoria "A". Ausente é A; suplentes: um B, um A.
  const mkT = (cats) => ({
    id: 'C', format: 'Eliminatórias Simples', enrollmentMode: 'individual', teamSize: 1,
    woScope: 'individual', skillCategories: ['A', 'B'], combinedCategories: ['A', 'B'],
    participants: [
      { uid: 'p1', categories: ['A'] }, { uid: 'p2', categories: ['A'] },
    ],
    standbyParticipants: [{ uid: 'sB', categories: ['B'] }, { uid: 'sA', categories: ['A'] }],
    waitlist: [], checkedIn: { sB: 1, sA: 1 }, absent: { p1: 1 }, vips: {},
    matches: [{ id: 'm1', round: 1, p1: 'X', p2: 'X', p1Uid: 'p1', p2Uid: 'p2', winner: null }],
  });
  let t = mkT();
  let r = sandbox._applyWoSubsToTournament(t);
  ok('ausente categoria A → entra o suplente A (não o B), por uid',
     r.subCount === 1 && t.matches[0].p1Uid === 'sA',
     'p1Uid=' + t.matches[0].p1Uid);
  // só suplente B disponível → pendência (organizador escolhe), não mete o B calado
  t = mkT(); t.standbyParticipants = [{ uid: 'sB', categories: ['B'] }]; t.checkedIn = { sB: 1 };
  r = sandbox._applyWoSubsToTournament(t);
  ok('ausente A sem suplente A → pendência (idade/skill = mesma regra do gênero)',
     r.subCount === 0 && (r.subChoicePending || []).length === 1,
     'pending=' + (r.subChoicePending || []).length);
  // sem categorias no torneio → qualquer suplente serve (FIFO)
  const tNo = { id: 'N', format: 'Eliminatórias Simples', enrollmentMode: 'individual', teamSize: 1,
    woScope: 'individual', participants: [{ uid: 'p1' }, { uid: 'p2' }],
    standbyParticipants: [{ uid: 'sX' }], waitlist: [], checkedIn: { sX: 1 }, absent: { p1: 1 }, vips: {},
    matches: [{ id: 'm1', round: 1, p1: 'X', p2: 'X', p1Uid: 'p1', p2Uid: 'p2', winner: null }] };
  const rNo = sandbox._applyWoSubsToTournament(tNo);
  ok('torneio SEM categorias → qualquer suplente entra (FIFO)',
     rNo.subCount === 1 && tNo.matches[0].p1Uid === 'sX', 'p1Uid=' + tNo.matches[0].p1Uid);
}

// ── FLUXO 7 · o organizador dá W.O. AO TIME (recusa a quebra) ────────────────
// A outra saída da pendência: em vez de aceitar o suplente que quebra a categoria, o
// organizador dá W.O. ao time (subUid vazio) — o adversário vence, ninguém assume.
console.log('\nPendência de categoria → organizador dá W.O. ao time (recusa a quebra):');
{
  const t = {
    id: 'WT', format: 'Eliminatórias Simples', enrollmentMode: 'teams', teamSize: 2,
    woScope: 'individual', genderCategories: ['misto_obrigatorio'], combinedCategories: ['Misto Obrig.'],
    participants: [{ p1Uid: 'a1', p2Uid: 'b1', p1Gender: 'masculino', p2Gender: 'feminino', categories: ['Misto Obrig.'] }],
    standbyParticipants: [{ uid: 'sF', gender: 'feminino', categories: ['Misto Obrig.'] }],
    waitlist: [], checkedIn: { sF: 1 }, absent: {}, vips: {},
    matches: [{ id: 'm1', round: 1, p1: 'X / X', p2: 'X / X', team1Uids: ['a1', 'b1'], team2Uids: ['a2', 'b2'], winner: null }],
  };
  sandbox.AppStore.tournaments = [t];
  sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find((x) => String(x.id) === String(id));
  const r = sandbox._applyWO(t, { absentName: 'X', absentUids: ['a1'], scope: 'match', woScope: 'individual', noSubBehavior: 'escalate' });
  ok('W.O. num membro sem suplente da categoria → needsSubChoice (não escala calado)',
     r.outcome === 'needsSubChoice' && !t.matches[0].winner, 'outcome=' + r.outcome);
  // organizador dá W.O. ao time: _forceNoSub escala, adversário vence
  if (Array.isArray(t.woSubChoices)) t.woSubChoices.forEach((x) => { if (x.absentUid === 'a1') x.resolved = true; });
  const r2 = sandbox._applyWO(t, { absentName: 'X', absentUids: ['a1'], scope: 'match', noSubBehavior: 'escalate', woScope: 'individual', _forceNoSub: true });
  ok('W.O. ao time → adversário vence (o jogo decide)', !!t.matches[0].winner && t.matches[0].wo === true,
     'winner=' + t.matches[0].winner + ' wo=' + t.matches[0].wo);
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ` uid-poison: ${pass} ok, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
