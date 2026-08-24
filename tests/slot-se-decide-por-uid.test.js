/* O SLOT SE DECIDE POR UID — NO RENDER E NA SUBSTITUIÇÃO (2.0.56)
 * node tests/slot-se-decide-por-uid.test.js
 *
 * Dois defeitos MEDIDOS em produção no Confra (24/ago/2026), o mesmo cânone violado
 * em duas pontas ("nada por nome. tudo por uid a menos que seja digitado sem uid"):
 *
 * (1) RENDER — _slotUidsPositional (bracket-logic) inferia posição de um array
 *     FILTRADO: uid null no MEIO do time (Jogador X + parceira com conta) fazia o uid
 *     da parceira deslizar pra posição do fantasma → o card desenhava
 *     "Ana Ribeiro / Ana Ribeiro" (E2).
 * (2) SUBSTITUIÇÃO — _rewriteSlot (liga-substitution) casava o slot por NOME GRAVADO;
 *     rótulo envelhecido ("Denise Mamesso" com o uid da Carol) não casava e o W.O.
 *     Carol→Karla trocou a classificação DEIXANDO OS JOGOS PRA TRÁS (Grupo A).
 *     Regra do dono: "sempre deve substituir na classificacao e nos jogos se eles
 *     ainda nao aconteceram."
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

// ── 1. render: buraco de uid no MEIO do time preserva a POSIÇÃO ─────────────
sec(function () {
  const H = require(path.join(ROOT, 'tests', 'render-harness'));
  const W = H.sandbox;
  const fn = W.window._slotUidsPositional;
  ok(typeof fn === 'function', 'falta _slotUidsPositional');
  const m = {
    team1: ['Jogador X', 'Ana R'], team1Uids: [null, 'uid_ana'],
    team2: ['Paula V', 'Andreya N'], team2Uids: ['uid_paula', 'uid_and'],
    p1: 'Jogador X / Ana R', p2: 'Paula V / Andreya N', isMonarch: true,
  };
  const t = { id: 'tx', participants: [], matches: [m] };
  const u1 = fn(m, 'p1', t);
  ok(Array.isArray(u1) && u1.length === 2, 'p1 devia ter 2 posições, veio ' + JSON.stringify(u1));
  ok(!u1[0], 'posição do Jogador X (uid null) tem que ficar VAZIA — veio ' + JSON.stringify(u1[0]));
  ok(u1[1] === 'uid_ana', 'o uid da parceira tem que ficar NA POSIÇÃO DELA — veio ' + JSON.stringify(u1));
  // e o lado sem buraco continua intacto
  const u2 = fn(m, 'p2', t);
  ok(JSON.stringify(u2) === JSON.stringify(['uid_paula', 'uid_and']), 'p2 (sem buraco) não podia mudar: ' + JSON.stringify(u2));
});

// ── 2. substituição: slot com RÓTULO VELHO troca pelo UID ───────────────────
sec(function () {
  require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
  const win = globalThis.window;
  const P = {
    ue: 'Edu', uf: 'Fê', ub: 'Bru', uc: 'Carol', uk: 'Karla',
  };
  win._nameForUid = (u) => P[u] || '';
  win.AppStore = {
    tournaments: [], currentUser: { uid: 'uid_org', displayName: 'Org' },
    mutate: null, isOrganizer: () => true,
  };
  win._findTournamentById = (id) => (win.AppStore.tournaments.find((x) => String(x.id) === String(id)) || null);
  win._canManagePresence = () => true;
  win.showNotification = () => {};
  win.showAlertDialog = () => {};
  win.showConfirmDialog = (t2, m2, cb) => { if (cb) cb(); };
  win._safeHtml = (s) => String(s == null ? '' : s);
  win._sendUserNotification = () => {};
  win._rerenderBracket = () => {};
  win._genderForUid = () => '';
  win._pName = (e, fb) => (e && e.uid && P[e.uid]) || (e && (e.displayName || e.name)) || fb || '';
  win._participantUids = (e) => (e && e.uid ? [e.uid] : []);
  win._memberUidByName = (tt, nm) => { for (const k of Object.keys(P)) if (P[k] === nm) return k; return ''; };
  win._preloadUserProfiles = () => Promise.resolve();
  win._buildNameToUid = (tt) => {
    const m2 = {};
    ((tt && tt.participants) || []).forEach((p) => { if (p && p.uid && P[p.uid]) m2[P[p.uid]] = p.uid; });
    ((tt && tt.standbyParticipants) || []).forEach((p) => { if (p && p.uid && P[p.uid]) m2[P[p.uid]] = p.uid; });
    return m2;
  };
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null };
  win.document = globalThis.document;
  new Function('window', 'document', fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8'))(win, globalThis.document);

  // Grupo A em miniatura: slot com uid da Carol e RÓTULO VELHO "Denise" — jogos sem placar.
  const jogos = [{
    id: 'j1', isMonarch: true, monarchGroup: 0,
    team1: ['Edu', 'Bru'], team1Uids: ['ue', 'ub'],
    team2: ['Fê', 'Denise'], team2Uids: ['uf', 'uc'],   // uc = Carol; rótulo velho
    p1: 'Edu / Bru', p2: 'Fê / Denise',
    scoreP1: null, scoreP2: null, winner: null,
  }];
  const g = { name: 'R1 Grupo A', players: ['Edu', 'Bru', 'Fê', 'Carol'], playersUids: ['ue', 'ub', 'uf', 'uc'], matches: jogos };
  const t = {
    id: 'ta', format: 'Liga', status: 'active', ligaRoundFormat: 'rei_rainha', woScope: 'individual',
    creatorUid: 'uid_org',
    participants: [{ uid: 'ue' }, { uid: 'ub' }, { uid: 'uf' }, { uid: 'uc', ligaActive: true }],
    standbyParticipants: [{ uid: 'uk', ligaActive: true, addedAt: '2026-08-22T12:00:00.000Z' }],
    waitlist: [],
    rounds: [{ round: 1, roundIndex: 0, status: 'active', monarchGroups: [g], matches: jogos.slice() }],
    matches: [], groups: [],
  };
  win.AppStore.tournaments = [t];
  win.AppStore.mutate = (tid, fn2) => { fn2(t); return Promise.resolve(true); };

  win._ligaApplyWo(t.id, 0, 'R1 Grupo A', 'Carol');
  const m = jogos[0];
  ok((m.team2Uids || [])[1] === 'uk', 'o slot da Carol (por UID) devia virar o da Karla: ' + JSON.stringify(m.team2Uids));
  ok(m.team2[1] === 'Karla', 'o NOME do slot devia acompanhar (rótulo velho morre): ' + JSON.stringify(m.team2));
  ok(m.p2 === 'Fê / Karla', 'p2 refeito: ' + m.p2);
  ok(m.team1Uids[0] === 'ue' && m.team1[0] === 'Edu', 'quem não era a Carol não podia mudar');
  ok(g.players[3] === 'Karla' && g.playersUids[3] === 'uk', 'o elenco também troca (classificação)');
});

console.log('\nslot-se-decide-por-uid: ' + pass + ' ok, ' + fail + ' falhas');
if (fail) process.exit(1);
