// draw-decisions.js — APLICAÇÃO das decisões do pré-sorteio ao elenco. Núcleo PURO.
//
// Contrato (dono, jul/2026): "os cânones rodam em CF, disparados pelo app".
//   ESCOLHA  = UI  = cliente (painéis, Nash, diálogos)  → coleta e manda o pacote
//   APLICAÇÃO = lógica = CF   (este arquivo, vendorado) → executa sobre o doc FRESCO
//
// POR QUE ESTE ARQUIVO EXISTE (e por que é EXTRAÇÃO, não cópia):
// Até a v1.2.28 as decisões que mexem no ELENCO (sem-dupla→espera, resto→espera/exclusão,
// pow2→espera/exclusão) eram aplicadas DENTRO dos handlers de painel, que tocam `document`
// — não dá pra chamá-los no servidor. E persistiam de CARONA no delta do
// `_commitInitialDraw`. Trocando o commit pela CF, o delta some e o servidor lê o elenco
// VELHO: foi assim que 35 inscritos viraram chave de 32 com 14 BYEs (v1.2.28 reverteu).
// Espelhar essas contas aqui criaria uma 2ª versão do código — o bug que a canonização
// existe pra matar. Então o núcleo foi EXTRAÍDO dos handlers pra cá: os handlers passam a
// chamar estas funções, e a CF chama AS MESMAS. Um dono só.
// Mesmo precedente de [[identity-core.js]] e [[persist-core.js]] (extraídos do store.js
// exatamente por isto) e do padrão que `_applyRoll`/`_soloMoveOut` já seguiam.
//
// REGRA DESTE ARQUIVO: nada de DOM, nada de save, nada de toast, nada de navegação.
// Só muta o `t` que recebe e devolve o que fez. Assim roda igual nos dois lados.
// Ver docs/sorteio-ciclo-decisoes.md pro mapa do ciclo inteiro.

(function () {

  var _nameOf = function (p) {
    if (typeof p === 'string') return p;
    if (!p) return '';
    if (p.displayName || p.name) return p.displayName || p.name;
    // v1.3.90: meia-dupla FICTÍCIA {p1Name:'X'} (nome em p1Name, SEM displayName nem uid) — usa o
    // rótulo p1Name/p2Name pra a chave de identidade (_entryIdKey) NÃO sair VAZIA. Chave vazia
    // colidia: o guard `if(k)` não a movia → entrada não saía de participants mas ia pra espera →
    // DUPLICADA → ausente entrava na chave (bug do dono). uids têm precedência via _uidsOf acima.
    var a = p.p1Name || '', b = p.p2Name || '';
    return (a && b) ? (a + ' / ' + b) : (a || b || '');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CÂNONE DE IDENTIDADE — regra do dono, e não tem asterisco:
  //
  //   Participante é identificado por UID. SEMPRE. SEMPRE. SEMPRE.
  //   ÚNICA exceção: o jogador FICTÍCIO — o que o organizador digitou à mão e não tem
  //   conta. Esse não tem uid, e o nome é a única identidade que ele tem no mundo.
  //   NUNCA identificar por nome, e-mail ou celular quem tem uid.
  //
  // Uma entrada é 1 ou 2 SLOTS, cada slot ocupado por um uid. O rótulo "Ana / Bia" é só
  // como a UI ESCREVE dois slots — não é identidade de ninguém, e a barra não é um
  // separador semântico: é tipografia. Resolver dupla quebrando o nome no '/' é o hack
  // legado que o uid veio matar.
  //
  // O QUE ESTAS FUNÇÕES TRAVAM: a decisão "uid ou nome?" acontece em UM lugar só, e a
  // regra é estrutural — TEM uid ⇒ decide SÓ por uid, nem olha o nome (nem como fallback,
  // nem como desempate). Sem uid ⇒ é fictício ⇒ nome. Não há terceiro caminho, e nenhum
  // call site precisa (nem pode) escolher.
  //
  // POR QUE ISTO EXISTE: `_idMapHas(t, map, entrada)` parece certo e está errado pra dupla
  // — o `_idMapKey` lê `entrada.uid`, que numa dupla não existe (os uids são p1Uid/p2Uid)
  // → cai no rótulo "Ana / Bia" → que nunca é chave de checkedIn → TODA dupla era lida como
  // ausente, inclusive a que apareceu inteira. Travado por teste: test-uid-identity.js
  // monta o mapa com uma chave-NOME que dá a resposta ERRADA e chaves-uid que dão a certa.
  // Qualquer código que caia no nome fica VERMELHO. Ver [[project_id_maps_uid_keyed]].
  // ═══════════════════════════════════════════════════════════════════════════

  // uids dos slots da entrada. Vazio ⇒ fictício (sem conta) ⇒ o nome é a identidade dele.
  var _uidsOf = function (entry) {
    if (!entry || typeof entry !== 'object') return [];
    return (typeof window._participantUids === 'function') ? window._participantUids(entry) : [];
  };

  // "TODOS os slots" — semântica de PRESENÇA: dupla com 1 ausente não joga (é exatamente
  // o que a chamada pré-sorteio existe pra evitar: 1 ausente travar o jogo do presente).
  window._entryAllInMap = function (t, map, entry) {
    var m = map || {};
    var uids = _uidsOf(entry);
    if (uids.length) return uids.every(function (u) { return !!m[u]; });
    return window._idMapHas(t, m, entry); // fictício: nome
  };

  // "QUALQUER slot" — semântica de AUSENTE/VIP: 1 membro marcado basta pra valer pra
  // entrada (mesma regra que `_entryHasVip` já usa em identity-core.js).
  window._entryAnyInMap = function (t, map, entry) {
    var m = map || {};
    var uids = _uidsOf(entry);
    if (uids.length) return uids.some(function (u) { return !!m[u]; });
    return window._idMapHas(t, m, entry); // fictício: nome
  };

  window._entryIsPresent = function (t, entry) {
    if (!t || entry == null) return false;
    return window._entryAllInMap(t, t.checkedIn, entry);
  };

  // ── CHAVE DE IDENTIDADE DE UMA ENTRADA ─────────────────────────────────────
  // Pra dedup ("já está na lista de espera?") e pra remover do elenco ("é este que sai?").
  // São os UIDS DOS SLOTS. O nome só entra pro FICTÍCIO, que não tem uid.
  //
  // POR QUE ISTO NÃO É FRESCURA: dedup por nome quebra de dois jeitos, os dois reais.
  //  (1) HOMÔNIMO: dois "João Silva" com uid diferente colidem na mesma chave → o 2º é
  //      DESCARTADO da lista de espera. É a razão de o uid existir.
  //  (2) FORMA REAL DO DOC: `_stripUidEntryNames` NÃO grava nome de quem tem perfil vivo —
  //      no Firestore a entrada é literalmente {p1Uid,p2Uid}, sem nome nenhum. Aí
  //      `p.displayName||p.name` é '' e os guards `if (n)` fazem o movedor pular a entrada:
  //      ninguém sai do elenco e ninguém entra na espera, EM SILÊNCIO. O sorteio segue com
  //      os ausentes dentro. No servidor (que lê o doc cru) é o caso NORMAL, não a exceção.
  // Ver [[project_uid_identity_canon_locked]].
  window._entryIdKey = function (entry) {
    var uids = _uidsOf(entry);
    if (uids.length) return 'uid:' + uids.slice().sort().join('+');
    var nm = _nameOf(entry).trim().toLowerCase();
    return nm ? 'fic:' + nm : '';   // fictício: nome é a identidade dele
  };
  var _sameEntry = function (a, b) {
    var ka = window._entryIdKey(a);
    return !!ka && ka === window._entryIdKey(b);
  };

  // ── CHAMADA pré-sorteio (presentes × ausentes) ─────────────────────────────
  // Extraído de participants.js:780 (`_applyRoll`, que era closure de
  // `_resolveAbsenteesThenDraw`). Particiona pelo check-in do `t` passado, manda os
  // ausentes pro bucket escolhido (dedup por nome) e deixa participants = presentes.
  // Idempotente: 2ª passada não acha mais ausente pra mover.
  window._applyPresenceRoll = function (t, mode) {
    if (!t) return { present: [], absent: [] };
    if (!t.checkedIn) t.checkedIn = {};
    if (!t.absent) t.absent = {};
    var _pp = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    var pres = [], abs = [];
    _pp.forEach(function (p) { if (window._entryIsPresent(t, p)) pres.push(p); else abs.push(p); });
    var bucket = (mode === 'waitlist') ? 'waitlist' : 'disqualified';
    if (!Array.isArray(t[bucket])) t[bucket] = [];
    abs.forEach(function (p) {
      // dedup por UID (era por _pName: dois homônimos colidiam e o 2º sumia da espera)
      if (!t[bucket].some(function (w) { return _sameEntry(w, p); })) t[bucket].push(p);
      // Estado neutro (pode ser chamado depois p/ substituir W.O.)
      window._idMapDel(t, t.checkedIn, p);
      window._idMapDel(t, t.absent, p);
    });
    t.participants = pres;
    return { present: pres, absent: abs };
  };

  // ── RESTO — núcleo de `_executeRemoval` (tournaments-draw-prep.js:624) ──────
  // mode: 'standby' (lista de espera) | 'exclusion' (fora do torneio)
  // method: 'random' (sorteio geral, default do toggle) | 'last' (últimos inscritos)
  window._applyRemainderRemoval = function (t, mode, method) {
    if (!t) return { removed: [], removedNames: '' };
    var arr = Array.isArray(t.participants) ? t.participants.slice() : [];
    var _ts = parseInt(t.teamSize) || 1;
    var _enr = t.enrollmentMode || t.enrollment || 'individual';
    if (window._isTeamEnrollMode(_enr) && _ts < 2) _ts = 2;
    var _playersOf = function (p) { return window._entryTeamMembers(p) ? _ts : 1; }; // time por ESTRUTURA, não por '/'
    var _manualPair = (typeof window._isManualPairing === 'function') && window._isManualPairing(t);
    // v1.2.53: flexibilizado = as duplas (mistas + mesmo-gênero) JÁ foram formadas → o resto
    // é só o(s) avulso(s) que sobrou(aram), NÃO a sobra pra fechar pow2. Mesmo tratamento das
    // duplas formadas manualmente. A pow2 é resolvida na tela seguinte (pedido do dono).
    var _formedTeams = _manualPair || !!t._flexibilized;
    var removed = [];
    if (_formedTeams) {
      // v4.4.95: times já FORMADOS (manual ou flexibilizado) — os avulsos sem-dupla são
      // INELEGÍVEIS (não têm com quem jogar). Move/exclui TODOS eles; os times formados ficam
      // intactos (a resolução pow2 roda depois só sobre eles). NUNCA calcula excedente pow2
      // sobre o pool inteiro de pessoas — era isso que deixava sem-dupla pra trás.
      var _keep = [];
      arr.forEach(function (p) { if (window._entryTeamMembers(p)) _keep.push(p); else removed.push(p); });
      arr = _keep;
    } else {
      // v2.1.29: remove em PLAYERS até sobrar exatamente a maior potência de 2 de TIMES
      // COMPLETOS — zero resto, zero BYE. Ex.: 19 avulsos (dupla) → mantém 16 (8 duplas)
      // e manda 3 pra espera.
      var _totalPlayers = arr.reduce(function (s, p) { return s + _playersOf(p); }, 0);
      var _maxTeams = Math.floor(_totalPlayers / _ts);
      var _targetTeams = _maxTeams >= 1 ? 1 : 0;
      while (_targetTeams * 2 <= _maxTeams) _targetTeams *= 2;
      var _playersToRemove = _totalPlayers - (_targetTeams * _ts);
      var _removedPlayers = 0;
      if (method === 'last') {
        while (_removedPlayers < _playersToRemove && arr.length > 0) {
          var _e = arr.pop(); removed.unshift(_e); _removedPlayers += _playersOf(_e);
        }
      } else {
        while (_removedPlayers < _playersToRemove && arr.length > 0) {
          var _idx = Math.floor(Math.random() * arr.length);
          var _e2 = arr.splice(_idx, 1)[0]; removed.push(_e2); _removedPlayers += _playersOf(_e2);
        }
      }
    }
    t.participants = arr;
    if (mode === 'standby') t.waitlist = (t.waitlist || []).concat(removed);
    if (t._suspendedByPanel) { delete t._suspendedByPanel; delete t._previousStatus; }
    t.status = 'closed';
    return {
      removed: removed,
      removedNames: removed.map(function (p) { return _nameOf(p) || '?'; }).join(', '),
      mode: mode, method: method
    };
  };

  // ── POTÊNCIA DE 2 — núcleo de `_confirmP2Resolution` (draw-prep.js:3599) ────
  // option: 'bye' | 'playin' | 'standby' | 'swiss' | 'exclusion'
  // opts.pick: 'last' (default) | 'random'  → QUEM vai pra espera (era radio standby-pick)
  // opts.mode: modo de substituição             (era radio standby-mode, default 'teams')
  // opts.swissRounds: nº de rodadas do Suíço    (era window._swissSelectedRounds)
  window._applyP2Resolution = function (t, option, opts) {
    if (!t) return { actionMsg: '' };
    opts = opts || {};
    var info = window.checkPowerOf2(t);

    // v4.1.x: DESMONTA o multifase Suíço quando o org troca de Suíço p/ OUTRA resolução.
    // Escolher "Suíço" monta t.phases=[Suíço classificatória, elim] + classifyFormat='swiss'
    // (fase única vira multifase). Qualquer OUTRA escolha tem que VOLTAR pra fase única —
    // senão o phases fantasma fica grudado e o torneio parece multifase quebrado.
    // Regra do dono: "selecionou Suíço: multifase; selecionou outra coisa: fase única".
    var _swissMP = (t.classifyFormat === 'swiss') || (t.currentStage === 'swiss') ||
      (Array.isArray(t.phases) && t.phases.length > 1 && t.phases[0] &&
        String(t.phases[0].format) === 'Suíço' && String(t.phases[0].formatCode) === 'liga');
    if (option !== 'swiss' && _swissMP) {
      t.phases = [{ name: t.format, format: t.format, source: { type: 'enrollment' } }];
      t.currentPhaseIndex = 0;
      t.classifyFormat = null;
      if (t.currentStage === 'swiss') t.currentStage = null;
      t.swissRounds = null;
      t.rounds = []; delete t.standings;   // limpa a classificação Suíço residual
    }

    var actionMsg = '';
    var movedToStandby = 0;
    if (option === 'bye') {
      t.p2Resolution = 'bye';
      t.p2TargetCount = info.hi;
      actionMsg = 'Configurado com BYEs para chave de ' + info.hi;
    } else if (option === 'playin') {
      t.p2Resolution = 'playin';
      t.p2TargetCount = info.lo;
      t.p2CrossSeed = true; // R2: pair R1 winners vs repechage winners for fairness
      actionMsg = 'Configurado com Play-ins (cross-seed) para chave de ' + info.lo;
    } else if (option === 'standby') {
      t.p2Resolution = 'standby';
      t.p2TargetCount = info.lo;
      var p = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
      // Separar VIPs (protegidos) dos demais — uid-first (entrada solo ou dupla)
      var vipEntries = [], nonVipEntries = [];
      p.forEach(function (entry) {
        if (window._entryHasVip(t, entry)) vipEntries.push(entry);
        else nonVipEntries.push(entry);
      });
      // v2.1.27: QUEM espera — 'last' (últimos a se inscrever, padrão) ou 'random' (sorteio
      // livre). NUNCA gera BYE: a sobra inteira vai pra espera e o bracket fica com info.lo.
      var standbyPick = opts.pick || 'last';
      var _pool = nonVipEntries.slice();
      if (standbyPick === 'random') {
        for (var _i = _pool.length - 1; _i > 0; _i--) {
          var _j = Math.floor(Math.random() * (_i + 1));
          var _tmp = _pool[_i]; _pool[_i] = _pool[_j]; _pool[_j] = _tmp;
        }
      }
      // v2.1.29: conta em PLAYERS (indivíduo=1, time pré-formado=teamSize) e mantém
      // exatamente info.lo*teamSize jogadores → info.lo times completos, sem BYE.
      var _ts = info.teamSize || 1;
      var _playersOf = function (e) { return window._entryTeamMembers(e) ? _ts : 1; };
      var _targetPlayers = info.lo * _ts;
      var _used = vipEntries.reduce(function (s, e) { return s + _playersOf(e); }, 0);
      var kept = [], standbyOverflow = [];
      _pool.forEach(function (e) {
        var s = _playersOf(e);
        if (_used + s <= _targetPlayers) { kept.push(e); _used += s; }
        else { standbyOverflow.push(e); }
      });
      t.standbyParticipants = (t.standbyParticipants || []).concat(standbyOverflow);
      t.participants = vipEntries.concat(kept);
      t.standbyPick = standbyPick;
      t.standbyMode = opts.mode || 'teams';
      movedToStandby = standbyOverflow.length;
      var pickLabel = standbyPick === 'random' ? 'sorteio livre' : 'últimos a se inscrever';
      actionMsg = 'Movidos ' + movedToStandby + ' para Lista de Espera (' + pickLabel + ') — chave de ' + info.lo + ', sem BYE';
    } else if (option === 'exclusion') {
      // Remove os últimos N inscritos até a potência de 2 inferior (extraído de
      // _handleP2Option:2948 — o confirm continua no cliente; a conta é daqui).
      var arrX = Array.isArray(t.participants) ? t.participants : [];
      var removedX = arrX.splice(arrX.length - info.excess, info.excess);
      t.p2Resolution = 'exclusion';
      actionMsg = 'Exclusão: removidos ' + info.excess + ' últimos inscritos (' +
        removedX.map(function (x) { return _nameOf(x) || '?'; }).join(', ') + ')';
    } else if (option === 'swiss') {
      t.p2Resolution = 'swiss';
      t.classifyFormat = 'swiss';
      if (opts.swissRounds) t.swissRounds = opts.swissRounds;
      actionMsg = 'Iniciado com Fase Classificatória (Suíço' + (t.swissRounds ? ' — ' + t.swissRounds + ' rodadas' : '') + ')';
    }

    t.status = 'closed';
    return { actionMsg: actionMsg, movedToStandby: movedToStandby, target: t.p2TargetCount };
  };

  // ── ÍMPAR — núcleo de `_handleOddOption` (draw-prep.js:2010) ────────────────
  // option: 'bye_odd' (→ BYE rotativo) | 'exclusion' (remove o último inscrito)
  window._applyOddResolution = function (t, option) {
    if (!t) return { actionMsg: '' };
    if (option === 'bye_odd' || option === 'bye_rotative') {
      t.oddResolution = 'bye_rotative';
      return { actionMsg: 'BYE rotativo selecionado para número ímpar' };
    }
    if (option === 'exclusion') {
      var arr = Array.isArray(t.participants) ? t.participants : [];
      var removed = arr.splice(arr.length - 1, 1);
      var removedName = removed.length > 0 ? (_nameOf(removed[0]) || '?') : '?';
      t.oddResolution = 'exclusion';
      return { actionMsg: 'Exclusão: removido último inscrito (' + removedName + ') para paridade', removedName: removedName };
    }
    return { actionMsg: '' };
  };

  // ── MOVEDORES DE ELENCO DO SORTEIO ──────────────────────────────────────────
  // MOVIDOS de tournaments.js (jul/2026, v1.2.29). Por quê: são mutadores PUROS do
  // elenco que o SORTEIO chama, e o sorteio agora roda na CF. tournaments.js é a VIEW
  // (render de cards/detalhe) — não é vendorável, então o servidor não conseguia
  // chamá-los: `_applyDrawDecisions` caía no guard `typeof === 'function'` e o
  // escopo "só entre os presentes" virava NO-OP silencioso no servidor (pego em teste
  // antes de subir). Fallback silencioso é justamente o que não pode existir aqui
  // ([[feedback_no_load_fallback]]). O código abaixo é o MESMO, sem uma vírgula
  // mudada — só mudou de casa, pra ter um dono só dos dois lados.

  // Auto-mover participantes solo para waitlist antes do sorteio em torneios de duplas
  window._autoMoveSoloToWaitlist = function(t) {
      if (!t) return 0;
      // v4.4.97: dupla FORMADA (manual) — os avulsos sem-dupla são PENDÊNCIA
      // CONSCIENTE (reabrir/formar/lista/exclusão via _showRemainderPanel), NUNCA
      // mover em silêncio pra lista de espera. Só o modo SORTEIO (auto-pareamento)
      // move solos automaticamente. Sem isso, o painel de sem-dupla era pulado e o
      // fluxo caía direto no pow2 ignorando os avulsos (regressão do v4.4.96, que
      // fez esta função reconhecer 'teams' e passar a comê-los antes de perguntar).
      if (typeof window._isManualPairing === 'function' && window._isManualPairing(t)) return 0;
      var enrollmentMode = t.enrollmentMode || t.enrollment || 'individual';
      var teamSize = parseInt(t.teamSize) || 1;
      if (!(window._isTeamEnrollMode(enrollmentMode) && teamSize === 2)) return 0;
  
      var parts = Array.isArray(t.participants) ? t.participants : [];
      // Sem-dupla = entrada que NÃO é time (estrutura). O `n &&` do código antigo era um
      // guard por NOME: com a forma real do doc (só uid, sem nome) ele descartava a entrada
      // do filtro e o avulso nunca ia pra espera. Identidade não entra nesta decisão —
      // ser ou não ser dupla é estrutura.
      var solo = parts.filter(function(p) { return !window._entryTeamMembers(p); });
      if (solo.length === 0) return 0;

      // Remove solos dos participants e adiciona à waitlist (compara por UID, não por nome)
      t.participants = parts.filter(function(p) { return !!window._entryTeamMembers(p); });
      if (!Array.isArray(t.waitlist)) t.waitlist = [];
      solo.forEach(function(p) {
          if (!t.waitlist.some(function(w) { return _sameEntry(w, p); })) t.waitlist.push(p);
      });
      return solo.length;
  };
  
  // Move jogadores marcados como ausentes (W.O.) de t.participants para
  // t.standbyParticipants antes do sorteio, para que o bracket não os inclua.
  // Eles ficam disponíveis para substituição durante o torneio.
  window._autoMoveAbsentToStandby = function(t) {
      if (!t || !t.absent || Object.keys(t.absent).length === 0) return 0;
      var absentMap = t.absent;
      var parts = Array.isArray(t.participants) ? t.participants : [];
      var toMove = parts.filter(function(p) {
          return window._idMapHas(t, absentMap, p); // uid-first (objeto p)
      });
      if (toMove.length === 0) return 0;
      // moveSet por UID (era por nome: com a forma real do doc — só uid — o nome é '' e o
      // `!n ||` MANTINHA no elenco justamente quem tinha que sair)
      var moveSet = {};
      toMove.forEach(function(p) { var k = window._entryIdKey(p); if (k) moveSet[k] = true; });
      t.participants = parts.filter(function(p) { return !moveSet[window._entryIdKey(p)]; });
      if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
      toMove.forEach(function(p) {
          if (!t.standbyParticipants.some(function(w) { return _sameEntry(w, p); })) t.standbyParticipants.push(p);
      });
      return toMove.length;
  };
  
  // v2.2.39: "Garantir sorteio só entre os presentes" — move todos os NÃO
  // presentes (sem check-in OU marcados ausentes) de t.participants para a
  // lista de espera, para que o sorteio inclua apenas quem fez a chamada.
  // Ausentes podem voltar depois (regra de 4 presentes acumulados na espera).
  // "Presente" = NÃO ausente E (nome com check-in direto OU, sendo dupla
  // "A / B", todos os membros com check-in) — espelha a regra canônica de
  // presença de equipe usada na substituição (participants.js).
  // Aceita ENTRADA (objeto) ou nome. Delega pro cânone `_entryIsPresent` — uid, nunca
  // rótulo. A versão antiga resolvia dupla quebrando o nome no '/', o hack legado que o
  // uid veio matar: com uid os 2 slots são 2 pessoas, e o '/' é só como a UI escreve.
  // Mantém a checagem do mapa `absent` (marcar ausente já limpa o check-in, mas o mapa é
  // a declaração explícita do organizador e vence).
  window._isParticipantPresent = function(t, who) {
      if (!t || who == null) return false;
      // Ausente vence: é a declaração explícita do organizador. QUALQUER slot marcado
      // ausente derruba a entrada (uma dupla com 1 ausente não joga).
      if (window._entryAnyInMap(t, t.absent, who)) return false;
      return window._entryIsPresent(t, who);
  };
  
  window._moveAbsentToWaitlistForPresentDraw = function(t) {
      if (!t) return 0;
      var parts = Array.isArray(t.participants) ? t.participants : [];
      // Tudo por ENTRADA/uid: presença é dos uids dos slots, e sair do elenco é por uid.
      // O código antigo filtrava por `_nm(p) &&` e montava moveSet por nome — com a forma
      // real do doc (só uid) isso era um NO-OP silencioso: ninguém saía do elenco.
      var notPresent = parts.filter(function(p) { return !window._isParticipantPresent(t, p); });
      if (notPresent.length === 0) return 0;
      // v1.3.90: remove por REFERÊNCIA (Set de objetos), NÃO por _entryIdKey string. Entrada sem
      // uid nem displayName ({p1Name:'X'} meia-dupla) dava chave '' → o guard `if(k)` não a punha
      // no moveSet → NÃO saía de participants MAS ia pra espera → DUPLICADA → ausente na chave +
      // "outros sumiram". Por referência cada not-present sai E entra na espera exatamente 1×.
      var moveRefs = (typeof Set === 'function') ? new Set(notPresent) : null;
      t.participants = moveRefs
          ? parts.filter(function(p) { return !moveRefs.has(p); })
          : parts.filter(function(p) { return notPresent.indexOf(p) === -1; });
      if (!Array.isArray(t.waitlist)) t.waitlist = [];
      notPresent.forEach(function(p) {
          // dedup por REFERÊNCIA também (fictício de chave vazia: _sameEntry sempre falso → duplicava)
          if (!t.waitlist.some(function(w) { return w === p || _sameEntry(w, p); })) t.waitlist.push(p);
      });
      return notPresent.length;
  };

  // ── ORQUESTRADOR ───────────────────────────────────────────────────────────
  // Aplica o pacote INTEIRO na MESMA ordem do cliente (ver docs/sorteio-ciclo-decisoes.md):
  //   escopo/ausentes → sem-dupla → auto-move solo → auto-move ausente → incompletos
  //   → ímpar → resto → pow2
  // Idempotente por construção: cada núcleo re-particiona pelo estado atual do `t`, então
  // re-aplicar sobre um doc já resolvido não move ninguém a mais.
  // `decisions` = o pacote do cliente (contrato em docs/sorteio-ciclo-decisoes.md §5).
  window._applyDrawDecisions = function (t, decisions) {
    var d = decisions || {};
    var applied = [];
    if (!t) return { applied: applied };

    // 1. ESCOPO / CHAMADA — quem entra no sorteio
    if (d.absentees === 'waitlist' || d.absentees === 'disqualify') {
      var r = window._applyPresenceRoll(t, d.absentees);
      applied.push({ step: 'absentees', mode: d.absentees, moved: r.absent.length });
    } else if (d.scope === 'present' && typeof window._moveAbsentToWaitlistForPresentDraw === 'function') {
      var mv = window._moveAbsentToWaitlistForPresentDraw(t);
      applied.push({ step: 'scope', mode: 'present', moved: mv });
    }

    // 2. SEM-DUPLA (escolha consciente do organizador)
    if (d.solo === 'waitlist' || d.solo === 'exclude') {
      var moved = window._soloMoveOut(t, d.solo === 'waitlist');
      applied.push({ step: 'solo', mode: d.solo, moved: moved });
    }

    // 3. Auto-moves (não são escolha — são regra; o cliente roda os MESMOS em _startDraw)
    if (typeof window._autoMoveSoloToWaitlist === 'function') {
      var aS = window._autoMoveSoloToWaitlist(t);
      if (aS > 0) applied.push({ step: 'autoSolo', moved: aS });
    }
    if (typeof window._autoMoveAbsentToStandby === 'function') {
      var aA = window._autoMoveAbsentToStandby(t);
      if (aA > 0) applied.push({ step: 'autoAbsent', moved: aA });
    }

    // 4. EQUILÍBRIO — o motor lê t._drawBalanceMode no _formDoublesTeams
    if (d.balanceMode === 'livre' || d.balanceMode === 'equilibrado') {
      t._drawBalanceMode = d.balanceMode;
      applied.push({ step: 'balance', mode: d.balanceMode });
    }

    // 5. TIMES INCOMPLETOS — só marca (o motor honra a flag)
    if (d.incomplete) {
      t.incompleteResolution = d.incomplete;
      applied.push({ step: 'incomplete', mode: d.incomplete });
    }

    // 6. ÍMPAR
    if (d.odd) {
      var ro = window._applyOddResolution(t, d.odd);
      applied.push({ step: 'odd', mode: d.odd, msg: ro.actionMsg });
    }

    // 6.5 FLEXIBILIZAR EQUILÍBRIO (decisão do organizador) — forma as duplas ANTES do resto.
    // CÂNONE (dono, jul/2026): flexibilizar persegue a regra ao MÁXIMO (mistas primeiro) e
    // quebra o MÍNIMO (só o excedente de um gênero vira dupla mesmo-gênero) — NÃO é sorteio
    // livre. _formDoublesTeams equilibrado já faz exatamente isso. Formar aqui, no servidor,
    // faz o resto ser só os avulsos (não a sobra pow2 — _applyRemainderRemoval lê _flexibilized)
    // e a pow2 fica pra tela seguinte. Substitui o forming client-side. Ver
    // [[project_canon_runs_on_server]] / [[project_enroll_number_chronological_no_gaps]].
    if (d.flexibilize && typeof window._formDoublesTeams === 'function') {
      if (!t.teamOrigins) t.teamOrigins = {};
      var _ff = window._formDoublesTeams(t.participants, 2, t.teamOrigins, 'equilibrado');
      t.participants = _ff.participants;
      t._flexibilized = true;
      applied.push({ step: 'flexibilize', formed: _ff.newTeamsCount, sameGender: _ff.allMaleCount, leftover: _ff.leftoverCount });
    }

    // 7. RESTO
    if (d.remainder && d.remainder.mode) {
      var rr = window._applyRemainderRemoval(t, d.remainder.mode, d.remainder.method || 'random');
      applied.push({ step: 'remainder', mode: d.remainder.mode, method: d.remainder.method || 'random',
                     moved: rr.removed.length, names: rr.removedNames });
    }

    // 8. POTÊNCIA DE 2
    if (d.p2 && d.p2.option) {
      var rp = window._applyP2Resolution(t, d.p2.option, {
        pick: d.p2.pick, mode: d.p2.mode, swissRounds: d.p2.swissRounds
      });
      applied.push({ step: 'p2', mode: d.p2.option, msg: rp.actionMsg, moved: rp.movedToStandby });
    }

    return { applied: applied };
  };

})();
