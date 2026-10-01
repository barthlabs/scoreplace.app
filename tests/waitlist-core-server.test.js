/* CÂNONE DA LISTA DE ESPERA NO SERVIDOR — node tests/waitlist-core-server.test.js
 *
 * BUG REAL (Confra, jul/2026): 8 placeholders entraram como INSCRIÇÃO TARDIA numa
 * classificatória Rei/Rainha. A CF integrateLateEntries formou os 2 grupos de 4, eles
 * JOGARAM e CLASSIFICARAM — mas continuaram na Lista de Espera, inclusive depois de
 * avançar de fase.
 *
 * CAUSA: _tryFormMonarchWaitlistGroups (bracket-logic.js) limpa a espera via
 * `if (typeof window._removeFromWaitlist === 'function') window._removeFromWaitlist(...)`.
 * A função morava em js/store.js, que NÃO é vendorado pra CF (toca document no load).
 * No servidor o guard era falso → a limpeza FALHAVA EM SILÊNCIO. Mesmíssima classe de bug
 * que já tinha mordido _expandFormationAllowed. Cura: extrair pra js/views/waitlist-core.js
 * (vendorado). Ver [[feedback_functions_must_mirror_app]].
 *
 * Este teste roda contra o AMBIENTE DO SERVIDOR de verdade (functions-autodraw/draw-core.js),
 * não contra o browser — era exatamente a diferença entre os dois que escondia o bug.
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// Carrega o shim do servidor (monta o window global + vendor/).
require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
const waitlistCoreSource = fs.readFileSync(path.join(ROOT, 'js', 'views', 'waitlist-core.js'), 'utf8');
ok(/window\._removeFromWaitlistByKey\s*=\s*function/.test(waitlistCoreSource),
  'a definição global de remoção por chave precisa acompanhar o servidor');

// ── 1. As funções da espera EXISTEM no servidor ──────────────────────────────
['_getWaitlist', '_removeFromWaitlist', '_nameForms', '_clearAllWaitlists',
 '_removeFromWaitlistByKey', '_waitlistNameSet', '_sanitizeWaitlistVsGroups'].forEach(function (fn) {
  ok(typeof win[fn] === 'function', 'servidor não define window.' + fn + ' (o guard typeof falha em silêncio)');
});

// ── 2. _removeFromWaitlist tira dos TRÊS storages ────────────────────────────
(function () {
  const t = {
    waitlist: ['Ana'],
    standbyParticipants: ['Ana', { displayName: 'Bruno' }],
    monarchWaitlist: { _default_: ['Ana', 'Carla'] },
  };
  ok(win._removeFromWaitlist(t, 'Ana') === true, 'removeFromWaitlist devia retornar true');
  ok(t.waitlist.length === 0, 'waitlist ainda tem Ana');
  ok(t.standbyParticipants.length === 1, 'standbyParticipants ainda tem Ana');
  ok(t.monarchWaitlist._default_.join() === 'Carla', 'monarchWaitlist ainda tem Ana');
  ok(win._removeFromWaitlist(t, 'Ana') === false, 'segunda remoção devia ser no-op');
})();

// ── 2b. A chave UID alcança a entrada enxuta em TODOS os storages ──────────
(function () {
  const t = {
    waitlist: [{ uid: 'uid-ana', displayName: 'Ana' }],
    standbyParticipants: [{ uid: 'uid-ana', displayName: 'Ana' }],
    monarchWaitlist: { _default_: [{ uid: 'uid-ana', displayName: 'Ana' }, 'Carla'] },
  };
  ok(win._removeFromWaitlistByKey(t, 'uid-ana') === true, 'removeByKey devia remover a entrada por UID do Rei/Rainha');
  ok(t.waitlist.length === 0 && t.standbyParticipants.length === 0 && t.monarchWaitlist._default_.join() === 'Carla',
    'a entrada UID não pode sobreviver no storage Rei/Rainha');
})();

// ── 3. A chave manual remove só a vaga certa, nunca o homônimo ───────────────
(function () {
  const t = {
    standbyParticipants: [
      { manualParticipantId: 'manual-a', displayName: 'Convidado' },
      { manualParticipantId: 'manual-b', displayName: 'Convidado' },
    ],
    waitlist: [], monarchWaitlist: {},
  };
  ok(win._removeFromWaitlistByKey(t, 'manual-a') === true,
    'a chave manual deve remover a própria vaga');
  ok(t.standbyParticipants.length === 1 && t.standbyParticipants[0].manualParticipantId === 'manual-b',
    'remover manual-a não pode apagar o manual-b homônimo');
})();

// ── 4. O fallback isolado preserva a mesma identidade manual ────────────────
(function () {
  const previous = win.ScoreplaceWaitlist;
  delete win.ScoreplaceWaitlist;
  try {
    const t = {
      standbyParticipants: [
        { manualParticipantId: 'manual-a', displayName: 'Convidado' },
        { manualParticipantId: 'manual-b', displayName: 'Convidado' },
      ], waitlist: [], monarchWaitlist: {},
    };
    ok(win._removeFromWaitlistByKey(t, 'manual-a') && t.standbyParticipants.length === 1 &&
       t.standbyParticipants[0].manualParticipantId === 'manual-b',
      'fallback sem domínio também remove somente o ID manual pedido');
  } finally {
    win.ScoreplaceWaitlist = previous;
  }
})();

// ── 5. Integração tardia entrega a chave estável ao removedor ────────────────
(function () {
  const core = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'draw-core.js'), 'utf8');
  ok(/const chaveEspera = \(p && typeof p === 'object' && \(p\.uid \|\| p\.manualParticipantId\)\) \|\| nome;/.test(core) &&
     /_removeFromWaitlistByKey\(t, chaveEspera\)/.test(core) &&
     /return chaveX === chaveEspera;/.test(core),
    'integrar tardio deve espelhar e tirar da espera por uid/manualParticipantId, não pelo nome');
})();

// ── 5. Saneamento: quem está num grupo NÃO fica na espera ────────────────────
(function () {
  const t = {
    rounds: [{ monarchGroups: [{ players: ['Ana', 'Bruno', 'Carla', 'Dinho'] }] }],
    standbyParticipants: ['Ana', 'Bruno', 'Carla', 'Dinho', 'Elza'],
    waitlist: [], monarchWaitlist: {},
  };
  const n = win._sanitizeWaitlistVsGroups(t);
  ok(n === 4, 'devia ter limpado 4 nomes, limpou ' + n);
  ok(t.standbyParticipants.length === 1 && win._pName(t.standbyParticipants[0]) === 'Elza',
    'só Elza (que não joga) devia sobrar na espera — sobrou: ' + JSON.stringify(t.standbyParticipants));
  ok(win._sanitizeWaitlistVsGroups(t) === 0, 'saneamento devia ser idempotente');
})();

// ── 4. Idem pra grupos de fase (t.groups) e duplas "A / B" no grupo ──────────
(function () {
  const t = {
    groups: [{ players: ['Ana / Bruno', 'Carla / Dinho'] }],
    standbyParticipants: ['Ana', 'Dinho', 'Elza'], waitlist: [], monarchWaitlist: {},
  };
  win._sanitizeWaitlistVsGroups(t);
  ok(t.standbyParticipants.length === 1, 'membros de dupla que já jogam deviam sair da espera — sobrou: ' + JSON.stringify(t.standbyParticipants));
})();

console.log((fail === 0 ? '✅' : '❌') + ` waitlist-core no servidor: ${pass} ok, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
