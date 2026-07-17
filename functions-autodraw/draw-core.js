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

// Carrega a lógica real do cliente (ordem: deps cross-file antes de quem as consome).
// identity-core: cânone de identidade por uid (_participantUids/_memberUidByName/_idMap*/
// _entryHasVip). Extraído do store.js em jul/2026 EXATAMENTE por isto: o store.js não carrega
// no servidor (toca document no load), e espelhar as funções aqui criaria uma 2ª versão do
// código — o bug de versão que a canonização quer matar. Agora é UM arquivo só, vendored.
require('./vendor/identity-core.js');
require('./vendor/persist-core.js');            // _cleanUndefined + _computeAdminEmails/Uids/MemberUids
                                                // — o boundary de escrita (o que a drawRound grava
                                                // tem de sair pela MESMA regra do cliente)
require('./vendor/sport-rules.js');             // SPORT_RULES — dep de format2 (allowsSingles/teamSize)
require('./vendor/tournaments-utils.js');       // _isLigaFormat, _calcNextDrawDate
require('./vendor/tournaments-categories.js');  // _displayCategoryName, _sortCategoriesBySkillOrder, _getParticipantCategories, _participantInCategory
require('./vendor/format2.js');                 // FORMAT2.normalize/compileToPhases (precisa de SPORT_RULES)
require('./vendor/bracket-model.js');           // _appendCanonicalColumn
require('./vendor/bracket-logic.js');           // _computeStandings, _generateNextRound, geradores
require('./vendor/phases-engine.js');           // _phasesEngine.generatePhase/storePhase
require('./vendor/phase-generators.js');        // _phaseGen (precisa de phases-engine)
// Helpers do SORTEIO INICIAL (_buildPhase0Cfg/_buildPhase0Pool/_formDoublesTeams/
// _buildDoubleElimBracket/_buildRepechageDoubleElim/_applyMixedOriginCategories). O arquivo
// tem DOM, mas só dentro de funções que o servidor nunca chama — no load é limpo.
require('./vendor/tournaments-draw.js');
// checkPowerOf2/checkOddEntries/_diagnoseAll/_soloMoveOut — mesma regra: DOM só dentro de
// funções que o servidor não chama. Dep de draw-decisions (o núcleo do pow2 lê checkPowerOf2).
require('./vendor/tournaments-draw-prep.js');
// _applyDrawDecisions + os núcleos PUROS extraídos dos handlers de painel. É o que permite
// o servidor APLICAR a decisão do organizador ao elenco com a MESMA função do cliente.
require('./vendor/draw-decisions.js');

// Sanity: o dispatcher precisa ter sido exposto (v2.3.91+ do cliente).
if (typeof g.window._generateNextRound !== 'function') {
  throw new Error('[draw-core] window._generateNextRound ausente — vendor/bracket-logic.js desatualizado (precisa expor o dispatcher).');
}
// Sanity: o configurador canônico de formato.
if (!g.window.FORMAT2 || typeof g.window.FORMAT2.compileToPhases !== 'function') {
  throw new Error('[draw-core] window.FORMAT2.compileToPhases ausente — vendor/format2.js desatualizado ou SPORT_RULES não carregou.');
}
if (!g.window._phasesEngine || typeof g.window._phasesEngine.generatePhase !== 'function') {
  throw new Error('[draw-core] window._phasesEngine.generatePhase ausente — vendor/phases-engine.js desatualizado.');
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

// ── CÂNONE DE FORMATO NO SERVIDOR: fmt2 → topLevel + phases ──────────────────
// Decisão do dono (jul/2026): "os cânones rodam em CF, disparados pelo app — assim evita
// cada usuário rodar uma função diferente com app desatualizado".
//
// POR QUE ISTO É O FURO PRINCIPAL (mais que o sorteio em si): `compileToPhases` roda hoje
// no SALVAR do cliente (create-tournament.js:5229, format2-ui.js:827) e GRAVA `t.phases[]` +
// os campos top-level (`format`/`gruposCount`/`ligaRoundFormat`/…) no doc. Um app velho
// compila com um format2 velho e grava o doc JÁ ERRADO — aí qualquer sorteio, mesmo o do
// servidor, executaria fielmente a config errada. Mover só o sorteio não fecha o buraco.
//
// O QUE DESTRAVA: o cliente também persiste a config CRUA em `t.fmt2`
// (create-tournament.js:5232). Ou seja, `t.phases` é DERIVADO e reproduzível a partir do
// `fmt2` — o servidor recompila do intent e ignora o que o app velho compilou.
//
// LEGADO (decisão do dono): torneio sem `t.fmt2` é anterior ao format2 → NÃO inventa config;
// devolve {ok:false, reason:'no-fmt2'} e o caller confia no `t.phases` que está no doc.
//
// ⚠️ SÓ CHAMAR NA FASE 0 SEM CHAVE. Recompilar no meio do torneio destruiria estado de fase
// (currentPhaseIndex/_phaseMaterialized). O guard é do caller — ver `canRecompile`.
//
// Espelha create-tournament.js:5229-5236 (a MESMA ordem de escrita). Se mudar lá, muda aqui.
function compileFromFmt2(t, opts) {
  opts = opts || {};
  const win = g.window;
  if (!t || !t.fmt2 || typeof t.fmt2 !== 'object') {
    return { ok: false, reason: 'no-fmt2' };
  }
  try {
    const out = win.FORMAT2.compileToPhases(t.fmt2, {
      sport: opts.sport || t.sport,
      resultEntry: t.resultEntry,
      lateEnrollment: t.lateEnrollment,
    });
    Object.assign(t, out.topLevel);
    t.phases = out.phases;
    // `fmt2` é o intent — re-normalizado pelo compilador; regrava a forma canônica.
    t.fmt2 = out.cfg;
    if (t.format === 'Fase de Grupos') { t.ligaRoundFormat = 'standard'; t.ligaDrawMode = 'standard'; }
    return { ok: true, phases: out.phases.length, format: t.format, summary: win.FORMAT2.summary(out.cfg) };
  } catch (e) {
    // Sem fallback silencioso (espelha o cliente: aborta em vez de sortear formato errado).
    return { ok: false, reason: 'compile-failed', error: String(e && e.message || e) };
  }
}

// "Já tem chave?" — a MESMA definição que o cliente usa (tournaments-draw.js:1174 e o
// contrato do CLAUDE.md): matches OU rounds OU groups com conteúdo. Nada além disso.
// É a régua do sorteio: quem responde true já foi sorteado.
function hasDrawnBracket(t) {
  if (!t) return false;
  return (Array.isArray(t.matches) && t.matches.length > 0)
    || (Array.isArray(t.rounds) && t.rounds.length > 0)
    || (Array.isArray(t.groups) && t.groups.length > 0);
}

// Recompilar o FORMATO é seguro SÓ antes de existir chave (fase 0 intocada). Depois disso o
// doc carrega estado de fase que a recompilação atropelaria. É pergunta DIFERENTE de "já tem
// chave?" — por isso são duas funções.
//
// ⚠️ v1.2.29 — `_phaseMaterialized` NÃO pode ser testado com `!= null`. O RESET do sorteio
// (`_clearTournamentDraw`, tournaments-draw.js:111) grava `t._phaseMaterialized = 0` como
// estado LIMPO, e `0 != null` é TRUE. Resultado: todo torneio já resetado uma vez era lido
// como "já sorteado" e a CF recusava com 'already-drawn' PRA SEMPRE — com matches/rounds/
// groups todos em zero (relatado em staging: "sorteio travado, diz que outro organizador já
// sorteou; sou o único organizador"). Pior: o gate do CLIENTE conta só matches/rounds/groups,
// então ele nem pedia re-sorteio — os dois lados discordavam do que é "ter chave", que é
// exatamente a divergência que esta canonização existe pra matar.
// Se a fase 0 tivesse MESMO sido materializada, haveria matches/rounds/groups — o
// `hasDrawnBracket` já cobre. Aqui só interessa fase POSTERIOR (> 0).
function canRecompile(t) {
  if (!t) return false;
  if (hasDrawnBracket(t)) return false;
  if ((t.currentPhaseIndex || 0) > 0) return false;
  if ((t._phaseMaterialized || 0) > 0) return false;
  return true;
}

// ── SORTEIO INICIAL NO SERVIDOR (Etapa 3) ────────────────────────────────────
// Espelha o TRECHO DO MOTOR de `generateDrawFunction` (tournaments-draw.js:1539-1642) —
// e SÓ ele. Tudo que vem ANTES lá é UI/ESCOLHA e FICA NO CLIENTE: gates de re-sorteio,
// diálogos e os painéis de resolução (pow2 / resto / sem-dupla / ímpar).
//
// ⚠️ CORREÇÃO (v1.2.29) — a versão anterior deste comentário dizia que "esses painéis já
// gravam a decisão no doc (p2Resolution/oddResolution/incompleteResolution), então o
// servidor só LÊ o que o organizador decidiu". ISSO ERA FALSO e foi a causa da quebra que
// a v1.2.28 reverteu. O que os painéis gravam é o MODO; o ELENCO (quem foi pra espera /
// quem saiu / quem ficou sem dupla) era mutado só EM MEMÓRIA e persistia de CARONA no
// delta do `_commitInitialDraw` — de propósito (v4.5.7 tirou o sync() porque ele
// clobberava a chave). Sem o commit do cliente, esse delta some e o servidor lê o elenco
// VELHO: 35 inscritos → chave de 32 com 14 BYEs.
//
// COMO É AGORA: o cliente manda o PACOTE DE DECISÕES (`opts.decisions`, contrato em
// docs/sorteio-ciclo-decisoes.md §5) e o servidor APLICA com `_applyDrawDecisions`
// (vendor/draw-decisions.js) — as MESMAS funções que os painéis chamam — sobre o doc
// FRESCO, dentro da transação, ANTES do motor. Escolha = UI = cliente;
// aplicação + sorteio = cânone = CF.
//
// ⚠️ NÃO faz o commit: quem chama decide como persistir (o cliente usa _commitInitialDraw,
// um delta atômico sobre o doc fresco — ver project_concurrency_safe_saves). Aqui só muta
// `t` em memória e devolve o que mudou.
//
// PRÉ-CONDIÇÃO: `canRecompile(t)` — sem chave ainda. Chamar com chave existente é
// re-sorteio, que é decisão do organizador no cliente (project_draw_once_canonical_order).
function drawInitial(t, opts) {
  opts = opts || {};
  const win = g.window;
  if (!t) return { ok: false, reason: 'no-tournament' };
  // "Já sorteado?" usa a régua do SORTEIO (hasDrawnBracket) — a mesma do cliente. Usar
  // canRecompile aqui (que também barra estado de FASE) foi o bug da v1.2.29: torneio
  // resetado tem _phaseMaterialized=0 e era recusado com 'already-drawn' sem ter chave.
  if (hasDrawnBracket(t)) return { ok: false, reason: 'already-drawn' };

  // Nome vivo por uid antes do motor (storage é só-uid; o motor lê nome). Espelha a
  // linha 1331 do cliente. O caller popula _profileNameByUid.
  if (typeof win._rehydrateEntryNames === 'function') win._rehydrateEntryNames(t);

  // ── PACOTE DE DECISÕES ────────────────────────────────────────────────────────────
  // Aplica ao ELENCO o que o organizador escolheu nos painéis, com as MESMAS funções que
  // os painéis usam, sobre o doc FRESCO. Tem que rodar ANTES de qualquer leitura de
  // elenco (formação de duplas / pool / cfg) — é o passo que faltava e que fez o servidor
  // sortear o elenco velho. Ver docs/sorteio-ciclo-decisoes.md.
  let _decisions = null;
  if (opts.decisions && typeof win._applyDrawDecisions === 'function') {
    _decisions = win._applyDrawDecisions(t, opts.decisions).applied;
  }

  // Suíço-classificatório tem ramo próprio no cliente (round-gen incremental) — ainda
  // não canonizado. Não fingir que sabe: devolve e o cliente sorteia.
  if (t.p2Resolution === 'swiss') return { ok: false, reason: 'swiss-not-canonical' };

  const _E0 = win._phasesEngine;
  const _cfg0 = win._buildPhase0Cfg(t);

  // Rei/Rainha é MODO INDIVIDUAL (parceiros rotativos) — nunca duplas fixas. Sem esta
  // trava, uma fase Rei/Rainha num torneio de dupla juntava 2 duplas num "time de 4"
  // (bug do Confra). Espelha as linhas 1547-1548. Ver project_rei_rainha_is_drawmode_not_format.
  const _isMon0 = !!(_cfg0 && (_cfg0.reiRainha === true || _cfg0.drawMode === 'rei_rainha'))
    || !!(win._isMonarchFormat && win._isMonarchFormat(t));

  let _ts0 = _isMon0 ? 1 : (parseInt(t.teamSize, 10) || 1);
  const _enr0 = t.enrollmentMode || t.enrollment || 'individual';
  if (!_isMon0 && win._isTeamEnrollMode(_enr0) && _ts0 < 2) _ts0 = 2;

  let _allMale = 0;
  if (_ts0 > 1) {
    if (!t.teamOrigins) t.teamOrigins = {};
    const _f0 = win._formDoublesTeams(
      Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {}),
      _ts0, t.teamOrigins, t._drawBalanceMode);
    t.participants = _f0.participants;
    _allMale = _f0.allMaleCount || 0;   // o cliente TOASTA isto; aqui volta no retorno
    if (t.mixedPairingSeparated && _enr0 === 'misto' && _ts0 === 2 && typeof win._applyMixedOriginCategories === 'function') {
      win._applyMixedOriginCategories(t, t.participants);
    }
  }

  // Reset do storage stale da fase 0 (generatePhase/storePhase reescrevem).
  t.matches = []; delete t.groups; delete t.rounds; delete t.standings;
  t.currentPhaseIndex = 0; delete t._phaseMaterialized;
  if (!t.drawVisibility) t.drawVisibility = 'public';
  // v4.1.30: o SORTEIO LIMPA a presença — "acabou de sortear, ninguém está presente".
  t.checkedIn = {}; t.absent = {};

  const _pool0 = win._buildPhase0Pool(t, _isMon0, _ts0);
  const _built0 = _E0.generatePhase(_pool0, _cfg0, {
    t: t, idPrefix: 'p0-' + (opts.idStamp || Date.now()),
    isVip: function (e) { return win._entryHasVip(t, e); },
    catOf: function (e) {
      const c = (typeof win._getParticipantCategories === 'function') ? win._getParticipantCategories(e) : [];
      return (c && c[0]) || '';
    }
  });

  // Liga/Suíço: generatePhase já escreveu t.rounds/t.standings (storage NATIVO).
  if (_built0 && _built0.appliedToT) {
    t._canonicalDraw = true; t.status = 'active';
    const _lrc = (_built0.roundMatchCount != null) ? _built0.roundMatchCount
      : ((t.rounds && t.rounds[0] && t.rounds[0].matches || []).filter(function (m) { return !m.isSitOut; }).length);
    const _lso = (t.rounds && t.rounds[0] && t.rounds[0].matches || []).filter(function (m) { return m.isSitOut; }).length;
    t.updatedAt = new Date().toISOString();
    return { ok: true, native: true, format: t.format, matchCount: _lrc, sitOuts: _lso, allMaleCount: _allMale, decisions: _decisions };
  }

  // Eliminatória / Grupos / Rei-Rainha: matches flat taggeados na fase 0 via storePhase.
  const _r0 = _E0.storePhase(t, 0, _built0);
  // storePhase pode FALHAR (ex.: 'no-entrants' — split por categoria não casou ninguém).
  // NUNCA tratar como sucesso: era isso que dava "diz que sorteou mas não mostra chave".
  if (!_r0 || !_r0.ok) return { ok: false, reason: 'store-failed', error: (_r0 && _r0.error) || 'motor vazio' };

  if (_built0.needsDoubleElim && typeof win._buildDoubleElimBracket === 'function') {
    win._buildDoubleElimBracket(t);
    (t.matches || []).forEach(function (m) { if (m.phaseIndex == null) m.phaseIndex = 0; });
  }
  if (_built0.needsRepechageDoubleElim && typeof win._buildRepechageDoubleElim === 'function') {
    const _metas0 = (_built0.repMetaByCat && _built0.repMetaByCat.length) ? _built0.repMetaByCat : [_built0.repMeta];
    _metas0.forEach(function (mm) { win._buildRepechageDoubleElim(t, mm); });
    (t.matches || []).forEach(function (m) { if (m.phaseIndex == null) m.phaseIndex = 0; });
  }
  t._canonicalDraw = true; t.status = 'active';
  t.updatedAt = new Date().toISOString();
  return { ok: true, native: false, format: t.format, matchCount: (t.matches || []).length, allMaleCount: _allMale, decisions: _decisions };
}

// v1.2.57: INTEGRAÇÃO DE TARDIOS no SERVIDOR (cânone-no-servidor, dono 17/jul). Roda as MESMAS
// funções vendoradas que o cliente rodava em bracket.js ao abrir o bracket (isOrg):
//   • _createExtraGamesFromWaitlist  → Eliminatória Simples (avulsos + DUPLAS já formadas, v1.2.56)
//   • _integrateLateDuplas           → Dupla Eliminatória (Tier 1/2; Tier 3 → _dissolveLateDuplas)
//   • _expandMonarchFromWaitlist     → Rei/Rainha (novos grupos)
// São MUTUAMENTE EXCLUSIVAS por guarda de formato — no máximo uma age. O cliente só DISPARA;
// a mutação + persistência vivem aqui (project_canon_runs_on_server). NÃO faz o commit — quem
// chama (a CF) persiste via _applyWriteBoundary/tx.set. Idempotente: sem tardio a integrar,
// tudo volta 0 e `changed=false` (a CF não grava). PRÉ-CONDIÇÃO: já tem chave (hasDrawnBracket).
function integrateLateEntries(t, opts) {
  opts = opts || {};
  const win = g.window;
  if (!t) return { ok: false, reason: 'no-tournament' };
  if (!hasDrawnBracket(t)) return { ok: false, reason: 'no-bracket' }; // sorteio ainda não feito

  // Nome vivo por uid antes de formar duplas/rótulos (storage é só-uid; o motor lê nome).
  if (typeof win._rehydrateEntryNames === 'function') win._rehydrateEntryNames(t);

  let extra = 0, duplas = 0, duplasTier = 0, dissolved = 0, monarch = 0, repfill = 0;
  // v1.2.58: dupla formada entra no lugar do repescado (chave PLAYIN) — precede o createExtra
  // (que é do outro formato de chave). Reusa repFill/_resolveRepFills.
  try { repfill = win._fillRepFillWithLateDuplas(t) || 0; } catch (e) { win._error && win._error('[integrateLate] repfill:', e); }
  try { extra = win._createExtraGamesFromWaitlist(t) || 0; } catch (e) { win._error && win._error('[integrateLate] extra:', e); }
  try {
    const nLJ = win._integrateLateDuplas(t) || 0;
    if (nLJ > 0) { duplas = nLJ; duplasTier = win._lastIntegrateTier || 1; }
    else if (nLJ === -3 && typeof win._dissolveLateDuplas === 'function') { dissolved = win._dissolveLateDuplas(t) || 0; }
  } catch (e) { win._error && win._error('[integrateLate] duplas:', e); }
  try { monarch = win._expandMonarchFromWaitlist(t) || 0; } catch (e) { win._error && win._error('[integrateLate] monarch:', e); }

  const changed = (extra > 0 || duplas > 0 || dissolved > 0 || monarch > 0 || repfill > 0);
  if (changed) {
    try { if (typeof win._computeMemberUids === 'function') win._computeMemberUids(t); } catch (e) {}
    t.updatedAt = new Date().toISOString();
  }
  return { ok: true, changed: changed, extra: extra, duplas: duplas, duplasTier: duplasTier, dissolved: dissolved, monarch: monarch, repfill: repfill };
}

module.exports = { generateLigaRound, compileFromFmt2, canRecompile, hasDrawnBracket, drawInitial, integrateLateEntries, _window: g.window };
