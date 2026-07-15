// draw-core.js — roda a lógica de sorteio do cliente dentro do Node (Cloud Function).
//
// Os arquivos em ./vendor/ são cópias EXATAS dos arquivos do app (sincronizadas
// por copy-vendor.js no predeploy). Eles são escritos como `window.X = function`
// + `function X(){}`. Aqui montamos um `window` global e os carregamos, expondo
// o MESMO dispatcher de sorteio que o app usa (window._generateNextRound).
//
// Resultado: o autoDraw server-side gera rodadas IDÊNTICAS às do cliente —
// Rei/Rainha (grupos de 4, parceiros rotativos AB×CD/AC×BD/AD×BC), duplas,
// equilíbrio, categorias, folgas justas, desempates. Nada de stub 1×1.

// ── Shim de ambiente browser ────────────────────────────────────────────────
// Em Node, propriedades de `global` são acessíveis como identificadores nus,
// então `window = global` faz `window._x = ...` virar global `_x` (que é como
// os arquivos do cliente resolvem referências cruzadas entre si).
const g = globalThis;
if (!g.window) g.window = g;

// i18n mínimo: só `label.group` é usado pelos geradores de sorteio.
const _I18N = { 'label.group': 'Grupo' };
g.window._t = function (k, v) {
  if (_I18N[k]) return _I18N[k];
  return (v && v.name) ? v.name : k;
};
// Logger stubs (os arquivos chamam window._warn/_log/_error).
g.window._warn = function () {};
g.window._log = function () {};
g.window._error = function () { console.error.apply(console, arguments); };

// ── ITEM 3 · Fase 4 (v4.5.85): resolução de nome VIVO por uid NO SERVIDOR ─────────
// O storage é só-uid (o cliente sanitiza no save). O motor de sorteio (vendored) lê
// p.displayName/p1Name → com entrada só-uid o pool por NOME descarta a pessoa (Liga
// geraria 0 rodadas). O caller (index.js) POPULA _profileNameByUid a partir de
// users/{uid} ANTES do sorteio; _nameForUid resolve dele; _rehydrateEntryNames
// preenche o nome nas entradas EM MEMÓRIA (transiente — o servidor persiste só os
// campos mutados do sorteio, nunca as entradas). Espelha os helpers de store.js.
g.window._profileNameByUid = g.window._profileNameByUid || {};
g.window._nameForUid = function (uid) { return (uid && g.window._profileNameByUid[uid]) || ''; };

// ── v1.2.2: PARIDADE com store.js — _displayNameForUid/_entryDisplayName/_pName ───
// O vendor CHAMA os três (bracket-logic L640/3323/3430/3433/3630, tournaments-categories
// L720), mas o shim não os definia → cada call site caía no seu fallback INLINE, e vários
// terminam em `|| p.p1Uid` (vaza o uid CRU) ou em `|| ''` (a pessoa some das standings).
// Servidor e cliente resolviam nome por regras DIFERENTES. Espelham store.js 1:1 — se mudar
// lá, muda aqui. Ver [[feedback_functions_must_mirror_app]] / [[project_orphan_uid_entries]].
g.window._ORPHAN_UID_LABEL = 'Jogador sem perfil';
g.window._displayNameForUid = function (uid, storedName) {
  if (uid) { var live = g.window._nameForUid(uid); if (live) return live; }
  if (storedName) return storedName;
  return uid ? (g.window._ORPHAN_UID_LABEL + ' (' + String(uid).slice(0, 4) + ')') : '';
};
g.window._isOrphanUid = function (uid) {
  if (!uid || String(uid).indexOf('jog_') === 0) return false;
  return !g.window._nameForUid(uid);
};
g.window._entryDisplayName = function (p) {
  if (p == null) return '';
  if (typeof p === 'string') return p;
  var R = g.window._displayNameForUid;
  if (p.p1Uid || p.p2Uid || (p.p1Name && p.p2Name)) {
    var n1 = R(p.p1Uid, p.p1Name), n2 = R(p.p2Uid, p.p2Name);
    if (n1 && n2) return n1 + ' / ' + n2;
  }
  if (Array.isArray(p.participants) && p.participants.length > 1) {
    return p.participants.map(function (s) {
      return (typeof s === 'string') ? s : R(s && s.uid, s && (s.displayName || s.name));
    }).filter(Boolean).join(' / ');
  }
  return R(p.uid, p.displayName || p.name || p.email || (p.phone ? String(p.phone) : ''));
};
// _pName do servidor = _entryDisplayName + fallback do caller. O _pNameDisplay (máscara de
// telefone) do cliente é PURO DISPLAY e não existe aqui: o servidor só usa o nome como CHAVE
// de pool/pareamento, e mascarar mudaria a chave sem mudar a identidade.
g.window._pName = function (p, fallback) {
  var fb = (fallback !== undefined && fallback !== null) ? fallback : '';
  if (!p) return fb;
  return g.window._entryDisplayName(p) || fb;
};

g.window._rehydrateEntryNames = function (t, resolve) {
  var R = resolve || g.window._nameForUid;
  var pools = [t && t.participants, t && t.standbyParticipants, t && t.waitlist];
  pools.forEach(function (arr) {
    if (!Array.isArray(arr)) return;
    arr.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      if (p.p1Uid && !p.p1Name) { var n1 = R(p.p1Uid); if (n1) p.p1Name = n1; }
      if (p.p2Uid && !p.p2Name) { var n2 = R(p.p2Uid); if (n2) p.p2Name = n2; }
      if (p.p1Name || p.p2Name) {
        if (!p.displayName) p.displayName = [p.p1Name, p.p2Name].filter(Boolean).join(' / ');
        if (!p.name) p.name = p.displayName;
      } else if (p.uid && !p.displayName) {
        var n = R(p.uid); if (n) { p.displayName = n; if (!p.name) p.name = n; }
      }
      if (Array.isArray(p.participants)) p.participants.forEach(function (s) {
        if (s && typeof s === 'object' && s.uid && !s.displayName) { var sn = R(s.uid); if (sn) { s.displayName = sn; if (!s.name) s.name = sn; } }
      });
    });
  });
  return t;
};

// ── lateEnrollment POR FASE (espelha store.js) ───────────────────────────────
// O motor vendored (bracket-logic.js) chama window._expandFormationAllowed pra decidir se
// forma novo confronto a partir da lista de espera. Sem estes helpers no shim, o guard
// `typeof === 'function'` era falso e o servidor auto-formava SEMPRE, ignorando o modo
// "Suplentes Apenas"/"Fechadas". Agora o servidor honra o valor EFETIVO da fase corrente.
g.window._effectiveLateEnrollment = function (t) {
  if (!t) return undefined;
  var ph = (Array.isArray(t.phases) && t.phases[t.currentPhaseIndex || 0]) || null;
  return (ph && ph.lateEnrollment) || t.lateEnrollment;
};
g.window._expandFormationAllowed = function (t) {
  var v = g.window._effectiveLateEnrollment(t);
  return v !== 'standby' && v !== 'closed';
};

// Carrega a lógica real do cliente (ordem: deps cross-file antes de bracket-logic).
require('./vendor/tournaments-utils.js');       // _isLigaFormat, _calcNextDrawDate
require('./vendor/tournaments-categories.js');  // _displayCategoryName, _sortCategoriesBySkillOrder, _getParticipantCategories, _participantInCategory
require('./vendor/bracket-model.js');           // _appendCanonicalColumn
require('./vendor/bracket-logic.js');           // _computeStandings, _generateNextRound, geradores

// Sanity: o dispatcher precisa ter sido exposto (v2.3.91+ do cliente).
if (typeof g.window._generateNextRound !== 'function') {
  throw new Error('[draw-core] window._generateNextRound ausente — vendor/bracket-logic.js desatualizado (precisa expor o dispatcher).');
}

// ── Entry point ─────────────────────────────────────────────────────────────
// Gera a próxima rodada de uma Liga/Ranking IN-PLACE em `t`, exatamente como o
// poller do cliente (_fireLigaAutoDraw). Retorna { ok, roundIndex, matchCount }
// ou { ok:false, reason }.
//
// scheduledTime: Date do horário agendado desta rodada (vira t.lastAutoDrawAt).
function generateLigaRound(t, scheduledTime) {
  const win = g.window;
  // v4.5.85 (ITEM 3 · Fase 4): rehidrata nomes por uid ANTES de tudo (standings seeding L76
  // e _generateNextRound leem p.displayName). _profileNameByUid já populado pelo caller.
  if (typeof win._rehydrateEntryNames === 'function') win._rehydrateEntryNames(t);
  if (!win._isLigaFormat || !win._isLigaFormat(t)) {
    return { ok: false, reason: 'not-liga' };
  }

  // Conta participantes ativos (espelha _fireLigaAutoDraw / _getActiveLigaPlayers).
  const allParts = Array.isArray(t.participants)
    ? t.participants
    : Object.values(t.participants || {});
  const activeParts = allParts.filter(function (p) {
    if (typeof p !== 'object' || !p) return true;
    return p.ligaActive !== false;
  });
  if (activeParts.length < 2) {
    return { ok: false, reason: 'fewer-than-2-active' };
  }

  const hasExistingDraw = Array.isArray(t.rounds) && t.rounds.length > 0;

  if (!hasExistingDraw) {
    // Primeiro sorteio: embaralha participantes e semeia standings (espelha
    // exatamente o ramo hasExistingDraw=false de _fireLigaAutoDraw no cliente).
    const seeded = allParts.slice();
    for (let si = seeded.length - 1; si > 0; si--) {
      const sj = Math.floor(Math.random() * (si + 1));
      const tmp = seeded[si]; seeded[si] = seeded[sj]; seeded[sj] = tmp;
    }
    t.standings = seeded.map(function (p) {
      const name = typeof p === 'string' ? p : (p.displayName || p.name || '');
      const entry = { name: name, points: 0, wins: 0, losses: 0, pointsDiff: 0, played: 0 };
      if (typeof p === 'object' && p && typeof win._getParticipantCategories === 'function') {
        const pcs = win._getParticipantCategories(p);
        if (pcs && pcs.length > 0) { entry.category = pcs[0]; entry.categories = pcs; }
      }
      return entry;
    });
    t.rounds = [];
    t.status = 'active';
    t.drawVisibility = t.drawVisibility || 'public';
  } else {
    // Rodadas seguintes: auto-aprova resultados pendentes (se o helper existir).
    if (typeof win._autoApprovePendingResults === 'function') {
      win._autoApprovePendingResults(t);
    }
  }

  const beforeLen = Array.isArray(t.rounds) ? t.rounds.length : 0;

  // O MESMO dispatcher do cliente: round_robin / rei_rainha / padrão, por categoria.
  win._generateNextRound(t);

  const afterLen = Array.isArray(t.rounds) ? t.rounds.length : 0;
  if (afterLen <= beforeLen) {
    return { ok: false, reason: 'no-round-generated' };
  }

  const newRound = t.rounds[t.rounds.length - 1];
  const realMatches = (newRound && newRound.matches || []).filter(function (m) {
    return !m.isSitOut && !m.isBye;
  });
  if (realMatches.length === 0) {
    return { ok: false, reason: 'zero-real-matches' };
  }

  const stamp = (scheduledTime instanceof Date ? scheduledTime : new Date()).toISOString();
  t.lastAutoDrawAt = stamp;
  t.updatedAt = new Date().toISOString();

  return {
    ok: true,
    firstDraw: !hasExistingDraw,
    roundIndex: t.rounds.length - 1,
    roundNumber: t.rounds.length,
    matchCount: realMatches.length,
    totalInRound: (newRound.matches || []).length,
  };
}

module.exports = { generateLigaRound, _window: g.window };
