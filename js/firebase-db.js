// ========================================
// scoreplace.app — Firestore Database Module
// ========================================
// Provides CRUD operations for Cloud Firestore.
// Collections: tournaments, users
// Requires firebase-app-compat + firebase-firestore-compat loaded first.

window.FirestoreDB = {
  db: null,
  lastInitError: null,

  init() {
    try {
      if (typeof firebase === 'undefined') {
        this.lastInitError = 'SDK Firebase não carregado (firebase undefined)';
        window._error('[FirestoreDB.init]', this.lastInitError);
        return;
      }
      if (typeof firebase.firestore !== 'function') {
        this.lastInitError = 'firebase-firestore-compat.js não carregado';
        window._error('[FirestoreDB.init]', this.lastInitError);
        return;
      }
      this.db = firebase.firestore();
      // v3.0.x: PERSISTÊNCIA OFFLINE = "shoot and forget". A escrita vai pra uma fila
      // DURÁVEL em IndexedDB e sincroniza sozinha — sobrevive a fechar o app / perder a
      // rede no meio de um save (era exatamente o que se perdia: clicou salvar e saiu).
      // Tem que ser chamado ANTES de qualquer leitura/escrita (init roda cedo, antes de
      // tudo). .catch degrada gracioso: navegador sem suporte / aba privada / persistência
      // já ativa (outra aba pegou) → app segue sem a fila durável.
      // v4.0.23: REMOVIDO synchronizeTabs:true. A persistência IndexedDB MULTI-ABA do SDK
      // 10.8.1 era o gatilho nº1 do bug interno "INTERNAL ASSERTION FAILED: Unexpected state"
      // (Sentry SCOREPLACE-WEB-66/67): abas concorrentes corrompem o IndexedDB compartilhado →
      // a AsyncQueue do Firestore "falha" → TODA chamada seguinte morre em cascata. Aba
      // única é o caminho estável; a 2ª aba simplesmente cai no .catch (sem fila durável,
      // mas sem corromper). Recuperação adicional: auto-reload guardado em sentry-init.js.
      // v1.3.27: FIX RAIZ — SDK subido 10.8.1 → 10.14.1 (as correções internas de
      // "Unexpected state" entraram em 10.12+). synchronizeTabs segue removido e o
      // auto-reload segue ativo como cinto-e-suspensório enquanto se confirma no Sentry.
      try {
        this.db.enablePersistence().then(function () {
          if (window._log) window._log('[FirestoreDB] persistência offline ATIVA — saves sobrevivem a fechar o app');
        }).catch(function (err) {
          var _c = (err && err.code) || String(err);
          if (window._warn) window._warn('[FirestoreDB] persistência offline indisponível (' + _c + ') — app segue sem fila durável');
        });
      } catch (_pErr) { /* enablePersistence pode lançar síncrono em ambiente sem IndexedDB */ }
      this.lastInitError = null;
    } catch (e) {
      this.lastInitError = (e && e.message) || String(e);
      window._error('[FirestoreDB.init] Erro ao inicializar Firestore:', e);
    }
  },

  // Call this from code paths that need db and want to survive a late script load.
  // Returns true if db is ready after the call.
  ensureDb() {
    if (this.db) return true;
    this.init();
    return !!this.db;
  },

  // ---- Utilities ----

  // Recursively strip undefined values from objects/arrays (Firestore rejects undefined).
  // v0.16.58: também remove keys que começam E terminam com `__` — Firestore
  // reserva esse padrão pra fields internos (`__name__` etc) e rejeita o save
  // com `[invalid-argument] Document fields cannot begin and end with "__"`.
  // Bug capturado pelo diag v0.16.54: `sitOutHistory.__all__` (default key
  // antiga do auto-draw) batia nessa regra. Defesa global aqui pega esse
  // padrão em qualquer campo, em qualquer profundidade — protege contra
  // futuras introduções acidentais e cobre docs legacy ainda em memória.
  // Delega pro cânone em js/views/persist-core.js — a MESMA função que a Cloud Function
  // do sorteio carrega (vendor/) antes de gravar. Uma implementação só, zero drift.
  _cleanUndefined(obj) {
    return (typeof window !== 'undefined' && typeof window._cleanUndefined === 'function')
      ? window._cleanUndefined(obj) : null;
  },

  // v4.4.70 FONTE ÚNICA Rei/Rainha: delega pro normalizador CANÔNICO em
  // bracket-model.js (window._foldMonarchGroups) — mesma função que o servidor
  // (autoDraw, via draw-core shim) chama antes de gravar. Uma implementação só,
  // zero drift. Remove group.matches do PAYLOAD e deixa só matchIds; round.matches
  // continua a única lista de jogos persistida. Chamado em saveTournament e
  // mutateTournament — todo write de torneio inteiro passa aqui.
  _foldMonarchGroups(cleanData) {
    if (typeof window !== 'undefined' && typeof window._foldMonarchGroups === 'function') {
      return window._foldMonarchGroups(cleanData);
    }
    return cleanData;
  },

  // ---- Tournaments ----

  // v1.2.2: _computeMemberEmails REMOVIDA junto com o campo memberEmails[]. Identidade de
  // membro é o uid (memberUids) — e-mail/telefone são ATRIBUTOS do perfil, resolvidos pelo
  // uid (_emailForUid/_phoneForUid), nunca chave. O campo só sobrevivia como fallback, e
  // fallback é rede de segurança pra código que não confia na própria identidade.
  // Ver [[project_uid_primary_identity]] / [[project_orphan_uid_entries]].

  // Subset of memberEmails restricted to organizer-level principals —
  // creator, current organizer, active co-hosts. Used by Firestore rules to
  // authorize full-edit and delete operations in O(1). Participants never
  // appear here; only admins.
  // Delega pro cânone em js/views/persist-core.js — a MESMA função que a Cloud Function
  // do sorteio carrega (vendor/) antes de gravar. Uma implementação só, zero drift.
  _computeAdminEmails(data) {
    return (typeof window !== 'undefined' && typeof window._computeAdminEmails === 'function')
      ? window._computeAdminEmails(data) : [];
  },

  // v2.8.79: adminUids[] — UIDs dos principais de nível organizador (criador +
  // co-hosts ativos). Espelho uid de adminEmails. Necessário porque co-host
  // pode ter email '' (conta por telefone) → as regras precisam autorizar
  // edição/escrita por UID, não por email. Recomputa a cada save (encolhe
  // quando um co-host é removido — diferente de memberUids que nunca encolhe).
  // Delega pro cânone em js/views/persist-core.js — a MESMA função que a Cloud Function
  // do sorteio carrega (vendor/) antes de gravar. Uma implementação só, zero drift.
  _computeAdminUids(data) {
    return (typeof window !== 'undefined' && typeof window._computeAdminUids === 'function')
      ? window._computeAdminUids(data) : [];
  },

  // v1.8.62: memberUids[] — UIDs de todos os participantes + organizador.
  // Permite que usuários phone-only (sem email) sejam identificados nas
  // regras do Firestore, onde authEmail() retorna '' para esses usuários.
  // Delega pro cânone em js/views/persist-core.js — a MESMA função que a Cloud Function
  // do sorteio carrega (vendor/) antes de gravar. Uma implementação só, zero drift.
  _computeMemberUids(data) {
    return (typeof window !== 'undefined' && typeof window._computeMemberUids === 'function')
      ? window._computeMemberUids(data) : [];
  },

  async saveTournament(tourData, options) {
    if (!this.db) return;
    var docId = String(tourData.id);
    var cleanData = this._cleanUndefined(tourData);
    this._foldMonarchGroups(cleanData); // Rei/Rainha: grava só matchIds (fonte única = round.matches)
    // When skipParticipants is true, exclude participants array to prevent
    // overwriting enrollments made by other users via transactions.
    // This is critical: sync() and organizer edits should NOT touch participants.
    if (options && options.skipParticipants) {
      delete cleanData.participants;
      // Also skip memberEmails — it's derived from participants, and
      // overwriting it here would wipe enrollments made concurrently.
      // adminEmails is not participant-derived, but we skip it too so the
      // sync() path never clobbers coHost changes made concurrently with a
      // stale local cache.
      delete cleanData.memberEmails;
      delete cleanData.adminEmails;
      delete cleanData.adminUids; // v2.8.79: idem — merge:true preserva o do banco
      // v1.9.84: idem memberUids — não tocar nesse path (merge:true preserva
      // o valor do banco). Sem o delete, um memberUids stale em memória poderia
      // ENCOLHER a lista e fazer participantes sumirem do listener deles.
      delete cleanData.memberUids;
    } else {
      // v1.2.2: memberEmails NÃO é mais escrito — identidade de membro é o uid (memberUids).
      // O campo saiu do schema; quem precisa do e-mail de alguém resolve pelo uid no perfil
      // (_emailForUid). O `delete` não é decorativo: o doc carregado do banco ainda TRAZ o
      // campo, e sem isto o save o devolveria intacto — ele nunca sairia dos documentos.
      // Ver [[project_uid_primary_identity]].
      delete cleanData.memberEmails;
      cleanData.adminEmails  = this._computeAdminEmails(cleanData);
      cleanData.adminUids    = this._computeAdminUids(cleanData); // v2.8.79: co-host por uid
      // v1.9.84: memberUids TAMBÉM nunca encolhe — mesma lógica do memberEmails.
      // BUG reportado: depois do sorteio o torneio sumia para os participantes
      // (só aparecia pro organizador). Causa: o sorteio reconstrói
      // t.participants em duplas/bracket e às vezes o uid não sobrevive no
      // objeto do time → _computeMemberUids retornava só o organizador, o
      // listener `where(memberUids array-contains uid)` parava de devolver o
      // torneio e ele desaparecia da tela do participante. Merge prev+new
      // garante que um uid, uma vez membro, nunca é removido por um save.
      // SANDBOX é a EXCEÇÃO ao "nunca encolhe": no SB o memberUids é SUBSTITUÍDO pelos uids
      // do dev (sem união), senão os uids reais copiados na clonagem ressuscitariam a cada
      // save e o Firestore voltaria a entregar o SB no listener de todo participante.
      var _newUids  = this._computeMemberUids(cleanData);
      var _prevUids = Array.isArray(tourData.memberUids) ? tourData.memberUids : [];
      cleanData.memberUids = window._mergeMemberUids(cleanData, _prevUids, _newUids);
    }
    // v4.5.85 (ITEM 3 · Fase 4): SANITIZA identidade — não grava nome de quem tem uid
    // (resolve do perfil vivo); guest sem uid mantém o nome. Opera na CÓPIA (cleanData),
    // nunca no tourData em memória. memberEmails/memberUids já foram computados acima.
    if (typeof window !== 'undefined' && typeof window._stripStoredNamesForUidEntries === 'function') {
      if (Array.isArray(cleanData.participants)) cleanData.participants = window._stripStoredNamesForUidEntries(cleanData.participants);
      if (Array.isArray(cleanData.standbyParticipants)) cleanData.standbyParticipants = window._stripStoredNamesForUidEntries(cleanData.standbyParticipants);
      if (Array.isArray(cleanData.waitlist)) cleanData.waitlist = window._stripStoredNamesForUidEntries(cleanData.waitlist);
      // jul/2026: co-host também é identificado SÓ por uid — o nome sai do doc quando o
      // perfil é resolvível (o strip preserva o nome de quem NÃO tem perfil).
      if (Array.isArray(cleanData.coHosts)) cleanData.coHosts = window._stripStoredNamesForUidEntries(cleanData.coHosts);
    }
    // v1.4.30: CHOKE POINT da cura de rótulo cru — "Jogador sem perfil (…)" gravado em
    // m.p1/m.p2/team1/team2 por corrida de cache no sorteio/integração é reescrito pro
    // nome vivo em TODO save que passa aqui com o perfil resolvível. Best-effort.
    try {
      if (typeof window !== 'undefined' && typeof window._cureRawMatchLabels === 'function') window._cureRawMatchLabels(cleanData);
    } catch (_lblErr) { /* cura nunca derruba o save */ }
    // v2.6.74: nextDrawAt — ms epoch do próximo sorteio devido (ver _nextOwedDrawMs).
    // É o índice que o autoDraw do servidor consulta com where('nextDrawAt','<=',now)
    // pra disparar perto da hora exata sem varrer a coleção toda. Recalculado em TODO
    // save (cria/edita/sorteio do cliente/manual), derivado do MESMO helper do servidor.
    // Quando não há sorteio devido (manual, sem data, encerrado, etc.) remove o campo
    // pra não deixar valor stale travando a query. Best-effort: se o helper não estiver
    // carregado, o reconciliador do servidor seta como fallback.
    try {
      if (typeof window._nextOwedDrawMs === 'function') {
        var _owed = window._nextOwedDrawMs(cleanData);
        if (typeof _owed === 'number') {
          cleanData.nextDrawAt = _owed;
        } else if (typeof firebase !== 'undefined' && firebase.firestore) {
          cleanData.nextDrawAt = firebase.firestore.FieldValue.delete();
        }
      }
    } catch (_ndErr) { /* nextDrawAt é otimização; nunca derruba o save */ }
    // v3.0.x: BLINDAGEM CONTRA PERDA DE CONFIG MULTI-FASE. Mesma filosofia do
    // memberEmails/memberUids acima (um cache velho NUNCA encolhe a config). Bug grave:
    // um save stale/parcial (outra aba/sessão que carregou ANTES da config, ou edição que
    // não renderizou o construtor de fases) chegava com phases=null + reiRainha/
    // allowSelfDeactivation no DEFAULT e, via merge, ZERAVA o construtor de fases do torneio
    // (Confra: 2 fases + Rei/Rainha + "deixar de fora" sumiam horas depois, SEM auto-draw).
    // Regra: se o save de entrada NÃO é multi-fase mas o doc no BANCO é, preserva a config
    // do banco (fonte da verdade). EXCEÇÃO: quando o organizador remove/reduz fases DE
    // PROPÓSITO no construtor, o save chega com _allowConfigReset=true (ou options) e a
    // redução é permitida — o guard só barra o que NÃO pretendia tocar (stale/bug).
    // ── v1.7.26 · O ELENCO E A FILA NUNCA ENCOLHEM POR ACIDENTE ────────────────
    // INCIDENTE (Confra, 02/ago/2026): o Gersom se inscreveu em 01/08 18:34, recebeu o
    // lembrete das 09:00 do dia seguinte — e a CF do lembrete itera `t.participants` NO
    // SERVIDOR, então ele estava no elenco — e às 19:00 não estava no sorteio. Não se
    // desinscreveu (essa ação notifica o organizador; não há notificação nenhuma). Sumiu
    // em silêncio e ficou dois dias fora do torneio.
    //
    // CAUSA ESTRUTURAL: este método grava o doc INTEIRO com merge, e há ~65 pontos no app
    // chamando `saveTournament(t)` com um `t` vindo da memória. Qualquer um com cópia
    // atrasada apaga quem entrou depois — sem erro, sem log, sem rastro. `skipParticipants`
    // existe pra isso e o comentário lá em cima promete que "organizer edits" não tocam em
    // participants; SÓ o `sync()` passa a flag. Promessa que o código não cumpria.
    //
    // A DOUTRINA (a mesma do memberUids acima, que já é "NUNCA ENCOLHE"): tirar alguém é
    // ATO DECLARADO. Todo save pode mexer nos CAMPOS de um inscrito à vontade, mas nenhum
    // faz alguém desaparecer — o ausente volta do doc fresco.
    //
    // Compara por UID, nunca por posição: dupla carrega dois uids (p1Uid/p2Uid) e
    // `_participantUids` os enxerga. É isso que faz o SORTEIO — que funde dois solos numa
    // dupla — não disparar restauração e duplicar o elenco a cada rodada.
    // Entrada SEM uid (fictício) não é protegida: não há identidade estável pra casar, e
    // inventar uma casaria homônimos. Limitação declarada e coberta por teste.
    //
    // ⚠️ MODO DE FALHA ESCOLHIDO: se um caminho legítimo de remoção esquecer a flag, a
    // pessoa CONTINUA inscrita e o console grita (+ Sentry). O contrário — sumir calado —
    // é o que custou dois dias de torneio a alguém.
    var _allowRosterRemoval = !!(options && options.allowRosterRemoval) || cleanData._allowRosterRemoval === true;
    delete cleanData._allowRosterRemoval; // flag transiente — nunca persistir no doc
    var _tocaElenco = Array.isArray(cleanData.participants);
    var _tocaFila   = Array.isArray(cleanData.standbyParticipants) || Array.isArray(cleanData.waitlist);
    if ((_tocaElenco || _tocaFila) && !_allowRosterRemoval) {
      try {
        var _uidsOf = (typeof window !== 'undefined' && typeof window._participantUids === 'function')
          ? window._participantUids
          : function (p) { return (p && p.uid) ? [p.uid] : []; };
        var _rSnap = await this.db.collection('tournaments').doc(docId).get();
        var _banco = _rSnap.exists ? (_rSnap.data() || {}) : null;
        if (_banco) {
          var _restored = [];
          // Quem está no elenco DEPOIS deste save (o incoming quando ele traz elenco; o do
          // banco quando não traz). É a régua que reconhece PROMOÇÃO logo abaixo.
          var _noElenco = {};
          (Array.isArray(cleanData.participants) ? cleanData.participants
            : (Array.isArray(_banco.participants) ? _banco.participants : [])
          ).forEach(function (p) {
            if (p && typeof p === 'object') _uidsOf(p).forEach(function (u) { if (u) _noElenco[u] = 1; });
          });

          // ELENCO: ninguém sai sem `allowRosterRemoval`.
          if (_tocaElenco && Array.isArray(_banco.participants)) {
            _banco.participants.forEach(function (p) {
              if (!p || typeof p !== 'object') return;
              var us = _uidsOf(p).filter(Boolean);
              if (!us.length) return;                              // fictício: sem proteção
              if (us.some(function (u) { return _noElenco[u]; })) return;
              cleanData.participants.push(p);                       // volta como está no banco
              us.forEach(function (u) { _noElenco[u] = 1; });
              _restored.push(us[0] + ' (participants)');
            });
          }

          // FILA: depois do sorteio é ONDE AS PESSOAS ESPERAM (v1.6.86) — e some sem
          // ninguém notar, porque quem espera não tem jogo pra sentir falta.
          // NÃO exige flag: a saída legítima da fila é PROMOÇÃO, e promoção tem marca
          // própria — a pessoa passa a estar no elenco. Quem sumiu da fila SEM aparecer no
          // elenco não foi promovido, foi perdido. Assim as dezenas de caminhos de promoção
          // (W.O., formação de grupo, substituição) seguem funcionando sem marcar nenhum.
          ['standbyParticipants', 'waitlist'].forEach(function (campo) {
            if (!Array.isArray(cleanData[campo]) || !Array.isArray(_banco[campo]) || !_banco[campo].length) return;
            var _naFila = {};
            cleanData[campo].forEach(function (p) {
              if (p && typeof p === 'object') _uidsOf(p).forEach(function (u) { if (u) _naFila[u] = 1; });
            });
            _banco[campo].forEach(function (p) {
              if (!p || typeof p !== 'object') return;
              var us = _uidsOf(p).filter(Boolean);
              if (!us.length) return;
              if (us.some(function (u) { return _naFila[u]; })) return;
              if (us.some(function (u) { return _noElenco[u]; })) return;   // PROMOVIDO
              cleanData[campo].push(p);
              us.forEach(function (u) { _naFila[u] = 1; });
              _restored.push(us[0] + ' (' + campo + ')');
            });
          });

          // ── HISTÓRICO É APPEND-ONLY, e por isso não pode encolher tampouco ────
          // Reconstruir o sumiço do Gersom custou uma tarde porque NÃO HÁ RASTRO de quem
          // mexe no elenco — tive que inferir por notificações. O histórico é o rastro, e
          // ele vive no MESMO doc, sujeito ao MESMO save atrasado: registrar o incidente
          // numa lista que o próximo save apaga não registra nada. Une pelo par
          // (date+message) — nunca some linha, e reescrever a mesma não duplica.
          if (Array.isArray(_banco.history) && _banco.history.length) {
            var _hIn = Array.isArray(cleanData.history) ? cleanData.history : [];
            var _hKey = function (e) { return String((e && e.date) || '') + '|' + String((e && e.message) || ''); };
            var _vistos = {};
            _hIn.forEach(function (e) { _vistos[_hKey(e)] = 1; });
            var _perdidas = _banco.history.filter(function (e) { return !_vistos[_hKey(e)]; });
            if (_perdidas.length) {
              cleanData.history = _perdidas.concat(_hIn);
            }
          }

          if (_restored.length) {
            // O incidente vira LINHA NO HISTÓRICO, não só log de console: console some
            // quando a aba fecha, e foi justamente a falta de rastro que fez este caso
            // levar uma tarde pra ser reconstruído. Anexa ao histórico do BANCO (já unido
            // acima), nunca ao da cópia que chegou — ela é a atrasada.
            if (!Array.isArray(cleanData.history)) cleanData.history = Array.isArray(_banco.history) ? _banco.history.slice() : [];
            cleanData.history.push({
              date: new Date().toISOString(),
              message: 'Protecao automatica: um save chegou sem ' + _restored.length +
                ' pessoa(s) e elas foram restauradas (' + _restored.join(', ') + ').'
            });
            // Barulhento de propósito: é o sinal de que existe caminho gravando lista
            // atrasada. Silenciar seria repetir o bug numa camada acima.
            if (window._warn) window._warn('[saveTournament] LISTA PROTEGIDA em ' + docId + ': o save chegou sem ' +
              _restored.length + ' pessoa(s) e elas foram RESTAURADAS do banco — ' + _restored.join(', ') +
              '. Se a remoção era intencional, o caminho precisa passar allowRosterRemoval.');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('roster shrink blocked: ' + docId + ' (' + _restored.join(', ') + ')')); } catch (_se) {}
          }
        }
      } catch (_rgErr) { /* o guard nunca derruba o save */ }
    }


    // ── v1.7.30 · PLACAR LANÇADO NUNCA É APAGADO POR UM SAVE QUE NÃO É DE PLACAR ──
    // MEDIDO contra o doc real do Confra: um save do organizador (editar o torneio) com
    // cópia lida ANTES de alguém lançar um resultado gravava `rounds` da memória e o
    // placar voltava a `null x null`. Mesma família do sumiço do Gersom (v1.7.26) — lista
    // compartilhada gravada inteira a partir de estado velho —, só que atinge o dado que
    // as pessoas acabaram de produzir na quadra, que é o pior de todos pra perder.
    // O guard do elenco não pegava isso: ele protege listas de PESSOAS, e o placar mora
    // em `rounds[].matches[]` / `matches[]` / `groups[].matches[]`.
    //
    // REGRA: quem tem placar no banco e chega SEM placar no save é REGRESSÃO — o jogo
    // volta como está no banco. Corrigir placar segue livre (chega COM valor, vence o
    // que chegou). Apagar de propósito passa a exigir `allowScoreClear`.
    // Casa por `id` do jogo, nunca por posição: sorteio e rodada extra reordenam.
    var _allowScoreClear = !!(options && options.allowScoreClear) || cleanData._allowScoreClear === true;
    delete cleanData._allowScoreClear;
    if (!_allowScoreClear) {
      try {
        var _snapP = await this.db.collection('tournaments').doc(docId).get();
        if (_snapP.exists) {
          var _bancoP = _snapP.data() || {};
          var _temPlacar = function (m) {
            return !!(m && (m.winner || m.scoreP1 != null || m.scoreP2 != null ||
                            (Array.isArray(m.sets) && m.sets.length)));
          };
          // índice id→jogo do BANCO, varrendo as três formas onde jogo mora
          var _idx = {};
          var _varre = function (t, fn) {
            (Array.isArray(t.matches) ? t.matches : []).forEach(fn);
            (Array.isArray(t.rounds) ? t.rounds : []).forEach(function (r) {
              (r && Array.isArray(r.matches) ? r.matches : []).forEach(fn);
            });
            (Array.isArray(t.groups) ? t.groups : []).forEach(function (g) {
              (g && Array.isArray(g.matches) ? g.matches : []).forEach(fn);
            });
          };
          _varre(_bancoP, function (m) { if (m && m.id != null && _temPlacar(m)) _idx[String(m.id)] = m; });
          var _revertidos = [];
          if (Object.keys(_idx).length) {
            _varre(cleanData, function (m) {
              if (!m || m.id == null) return;
              var b = _idx[String(m.id)];
              if (!b || _temPlacar(m)) return;              // sem placar no banco, ou veio COM: nada a fazer
              // devolve os campos de RESULTADO; o resto do jogo (slots, rótulos) fica como veio
              ['scoreP1', 'scoreP2', 'winner', 'sets', 'setsWonP1', 'setsWonP2',
               'totalGamesP1', 'totalGamesP2', 'pendingResult', 'resultAt'].forEach(function (k) {
                if (b[k] !== undefined) m[k] = b[k];
              });
              _revertidos.push(String(m.id));
            });
          }
          if (_revertidos.length) {
            if (window._warn) window._warn('[saveTournament] PLACAR PROTEGIDO em ' + docId + ': o save chegou sem o resultado de ' +
              _revertidos.length + ' jogo(s) que JÁ TÊM placar no banco — restaurados (' + _revertidos.join(', ') + ').');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('score wipe blocked: ' + docId + ' (' + _revertidos.length + ')')); } catch (_se) {}
            if (!Array.isArray(cleanData.history)) cleanData.history = Array.isArray(_bancoP.history) ? _bancoP.history.slice() : [];
            cleanData.history.push({ date: new Date().toISOString(),
              message: 'Protecao automatica: um save chegou sem o placar de ' + _revertidos.length +
                ' jogo(s) ja lancado(s) e eles foram restaurados.' });
          }

          // ── v1.7.32 · O QUE O JOGO JÁ GANHOU NÃO SOME, E A CHAVE NÃO ENCOLHE ──
          // O guard acima devolve o PLACAR de um jogo que veio sem ele. Não cobria o
          // jogo que NÃO VEIO, nem o que o jogo ganhou fora do placar. MEDIDO contra o
          // doc real do Confra, o save atrasado do organizador destruía CINCO coisas:
          // a rodada 2 recém-criada, um jogo de entrada tardia, o link do grupo de
          // WhatsApp, o horário combinado e a substituição por W.O.
          //
          // DUAS regras, desenhadas pra não atrapalhar quem apaga de propósito:
          //
          // (a) CAMPOS ADITIVOS de um jogo (link do grupo, horário combinado) só nascem
          //     pelo fluxo deles e nunca são "desmarcados" num save de outra coisa —
          //     então um save que chega sem eles está desatualizado, não decidindo.
          //
          // (b) SUMIÇO. Aqui está a distinção que evita 6 bandeiras espalhadas pelos
          //     pontos de reset: um RESET zera (`rounds: []`), um save atrasado traz
          //     MENOS rodadas — nunca zero. Então N→0 passa livre (é o re-sorteio, o
          //     reset do sandbox, o construtor de formato) e só 0<M<N é recusado.
          //     Dentro de uma rodada que sobreviveu, o jogo que sumiu volta — com DUAS
          //     exceções, tiradas de quem realmente apaga jogo no app (varri os 10
          //     pontos): (i) `isSitOut` — `_removeSitOut` (liga-substitution) e `_isRem`
          //     (bracket-logic) só apagam MARCADOR de folga, e ressuscitá-lo quebraria o
          //     W.O.; (ii) save que ACRESCENTA jogo novo — os outros 8 pontos são o motor
          //     reescrevendo a chave (re-sorteio, repescagem, chaves-adapter), e ele
          //     sempre gera jogo junto. Save atrasado só PERDE, nunca traz id novo.
          //     Na dúvida (o motor está reescrevendo), o guard sai de cena.
          //
          // ⚠️ NÃO cobre o slot reescrito (a substituição por W.O. desfeita, caso 3 da
          // medição): os dois lados escrevem o MESMO campo com dado igualmente válido e
          // não há como saber qual é o mais novo sem versionar o jogo. Fica anotado.
          var _ADITIVOS = ['waGroup', 'schedule', 'scheduledAt', 'scheduledBy'];
          // índice COMPLETO do banco (o de cima só tem quem tem placar) + onde cada um mora
          var _ondeMora = {};
          var _idxAll = {};
          (Array.isArray(_bancoP.matches) ? _bancoP.matches : []).forEach(function (m) {
            if (m && m.id != null) { _idxAll[String(m.id)] = m; _ondeMora[String(m.id)] = { tipo: 'matches' }; }
          });
          (Array.isArray(_bancoP.rounds) ? _bancoP.rounds : []).forEach(function (r, ri) {
            (r && Array.isArray(r.matches) ? r.matches : []).forEach(function (m) {
              if (m && m.id != null) { _idxAll[String(m.id)] = m; _ondeMora[String(m.id)] = { tipo: 'rounds', i: ri, round: (r.round != null ? r.round : ri) }; }
            });
          });
          (Array.isArray(_bancoP.groups) ? _bancoP.groups : []).forEach(function (g, gi) {
            (g && Array.isArray(g.matches) ? g.matches : []).forEach(function (m) {
              if (m && m.id != null) { _idxAll[String(m.id)] = m; _ondeMora[String(m.id)] = { tipo: 'groups', i: gi }; }
            });
          });

          // (a) devolve os campos aditivos nos jogos que VIERAM
          var _aditRest = [];
          _varre(cleanData, function (m) {
            if (!m || m.id == null) return;
            var b = _idxAll[String(m.id)];
            if (!b) return;
            _ADITIVOS.forEach(function (k) {
              if (b[k] != null && m[k] == null) { m[k] = b[k]; _aditRest.push(String(m.id) + '·' + k); }
            });
          });

          // (b1) rodada que sumiu — só quando o save NÃO zerou (zerar é reset declarado pela forma)
          var _rodVolt = [];
          if (Array.isArray(cleanData.rounds) && Array.isArray(_bancoP.rounds) &&
              cleanData.rounds.length > 0 && cleanData.rounds.length < _bancoP.rounds.length) {
            var _temR = {};
            cleanData.rounds.forEach(function (r, i) { _temR[String(r && r.round != null ? r.round : i)] = 1; });
            _bancoP.rounds.forEach(function (r, i) {
              var k = String(r && r.round != null ? r.round : i);
              if (_temR[k]) return;
              cleanData.rounds.push(r); _rodVolt.push(k);
            });
            if (_rodVolt.length) {
              cleanData.rounds.sort(function (a, b) {
                return (a && a.round != null ? a.round : 0) - (b && b.round != null ? b.round : 0);
              });
            }
          }

          // (b2) jogo que sumiu de uma rodada/grupo que sobreviveu
          var _vistos = {};
          _varre(cleanData, function (m) { if (m && m.id != null) _vistos[String(m.id)] = 1; });
          // o save TROUXE jogo que o banco não tem ⇒ é o motor reescrevendo a chave: sai de cena
          var _motorReescrevendo = Object.keys(_vistos).some(function (id) { return !_idxAll[id]; });
          var _jogoVolt = [];
          if (!_motorReescrevendo) Object.keys(_idxAll).forEach(function (id) {
            if (_vistos[id]) return;
            var b = _idxAll[id];
            if (b && b.isSitOut) return;                     // marcador de folga/W.O.: pode sumir
            var onde = _ondeMora[id] || {};
            var alvo = null;
            if (onde.tipo === 'matches') {
              if (!Array.isArray(cleanData.matches)) cleanData.matches = [];
              alvo = cleanData.matches;
            } else if (onde.tipo === 'rounds' && Array.isArray(cleanData.rounds)) {
              var r = null;
              for (var _ri = 0; _ri < cleanData.rounds.length; _ri++) {
                var _c = cleanData.rounds[_ri];
                if (_c && _c.round != null ? _c.round === onde.round : _ri === onde.i) { r = _c; break; }
              }
              if (r) { if (!Array.isArray(r.matches)) r.matches = []; alvo = r.matches; }
            } else if (onde.tipo === 'groups' && Array.isArray(cleanData.groups) && cleanData.groups[onde.i]) {
              var g = cleanData.groups[onde.i];
              if (!Array.isArray(g.matches)) g.matches = [];
              alvo = g.matches;
            }
            if (!alvo) return;                                // sem onde pousar: não inventa lugar
            alvo.push(b); _jogoVolt.push(id);
          });

          // ── v1.7.33 · TROCA DE JOGADOR NO JOGO: o mais NOVO vence ────────────────
          // Este era o caso 5 da medição e o único que eu tinha dado como insolúvel: o
          // suplente entra pelo W.O., o organizador salva uma cópia velha, e a
          // substituição é DESFEITA. Os dois lados escrevem o MESMO campo com dado
          // igualmente válido — sem saber QUANDO cada um escreveu, não há como decidir.
          //
          // A informação que faltava é um carimbo, e ele nasce AQUI em vez de nos 10
          // pontos que mexem em slot (draw, phases, bracket-logic, liga-substitution):
          // comparo a escalação que chegou com a do banco e, se mudou, carimbo
          // `rosterAt`. Assim toda troca se carimba sozinha e nenhum call site precisa
          // saber que o carimbo existe — a lição do `_repairTournaments`, onde manter
          // lista à mão sempre esquece o campo novo.
          //
          // Decisão: mudou E o banco tem carimbo MAIS NOVO que o do save ⇒ o save é
          // atrasado, a escalação do banco volta. Primeira troca da vida (banco sem
          // carimbo) é aceita e carimbada. Duas trocas legítimas em sequência também
          // passam: quem leu DEPOIS da primeira carrega o carimbo dela.
          var _ROSTER = ['p1', 'p2', 'team1', 'team2', 'team1Uids', 'team2Uids', 'p1Uid', 'p2Uid'];
          var _sigRoster = function (m) {
            return JSON.stringify(_ROSTER.map(function (k) { return m ? m[k] : null; }));
          };
          var _slotRev = [], _slotNovo = 0, _agora = Date.now();
          if (!_motorReescrevendo) _varre(cleanData, function (m) {
            if (!m || m.id == null) return;
            var b = _idxAll[String(m.id)];
            if (!b) return;
            if (_sigRoster(m) === _sigRoster(b)) {
              if (b.rosterAt != null && m.rosterAt == null) m.rosterAt = b.rosterAt; // não perde o carimbo
              return;
            }
            var _cB = (typeof b.rosterAt === 'number') ? b.rosterAt : null;
            var _cS = (typeof m.rosterAt === 'number') ? m.rosterAt : null;
            if (_cB != null && (_cS == null || _cS < _cB)) {
              _ROSTER.forEach(function (k) { if (b[k] !== undefined) m[k] = b[k]; else delete m[k]; });
              m.rosterAt = _cB;
              _slotRev.push(String(m.id));
            } else {
              m.rosterAt = _agora;                            // troca legítima: carimba
              _slotNovo++;
            }
          });
          if (_slotRev.length) {
            if (window._warn) window._warn('[saveTournament] ESCALACAO PROTEGIDA em ' + docId + ': o save trazia escalação ANTIGA de ' +
              _slotRev.length + ' jogo(s) (ex.: substituição por W.O. já aplicada) — restaurada do banco (' + _slotRev.join(', ') + ').');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('roster revert blocked: ' + docId + ' (' + _slotRev.length + ')')); } catch (_se) {}
          }

          if (_rodVolt.length || _jogoVolt.length || _aditRest.length) {
            if (window._warn) window._warn('[saveTournament] CHAVE PROTEGIDA em ' + docId + ': ' +
              (_rodVolt.length ? _rodVolt.length + ' rodada(s) ' : '') +
              (_jogoVolt.length ? _jogoVolt.length + ' jogo(s) com valor ' : '') +
              (_aditRest.length ? _aditRest.length + ' campo(s) (grupo/horário) ' : '') +
              'sumiram do save e foram restaurados do banco.');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('bracket shrink blocked: ' + docId + ' (r=' + _rodVolt.length + ' m=' + _jogoVolt.length + ' f=' + _aditRest.length + ')')); } catch (_se) {}
          }
          if (_rodVolt.length || _jogoVolt.length) {
            if (!Array.isArray(cleanData.history)) cleanData.history = Array.isArray(_bancoP.history) ? _bancoP.history.slice() : [];
            cleanData.history.push({ date: new Date().toISOString(),
              message: 'Protecao automatica: um save chegou sem ' + _rodVolt.length + ' rodada(s) e ' +
                _jogoVolt.length + ' jogo(s) que existem no banco e eles foram restaurados.' });
          }
        }
      } catch (_spErr) { /* o guard nunca derruba o save */ }
    }

    // ── v1.7.31 · ACEITE DE CO-ORGANIZAÇÃO NÃO VOLTA A "PENDENTE" ─────────────
    // MEDIDO: um save atrasado devolve `coHosts[i].status` de 'active' pra 'pending' e
    // apaga o `acceptedAt` — a pessoa aceita e, horas depois, o convite aparece pendente
    // outra vez. Já houve um caso ao vivo desse sintoma (Raquel, jul/2026); na época foi
    // atribuído a um `permission-denied`, e o fix da v1.6.9 tratou aquela causa. Agora sei
    // que existe uma SEGUNDA porta pro mesmo sintoma, e ela continuava aberta.
    // (Varri as notificações antes de mexer: o único `pending` de hoje no Confra é da
    // Fabiana, que nunca aceitou — não há vítima em produção. Isto é preventivo.)
    //
    // A regra é MONOTÔNICA e por isso não quebra nada: aceitar é avanço de estado e não
    // retrocede. CANCELAR o convite (que REMOVE a entrada) segue livre — só a volta
    // aceito→pendente é barrada. Assim o organizador continua podendo cancelar.
    if (Array.isArray(cleanData.coHosts)) {
      try {
        var _snapC = await this.db.collection('tournaments').doc(docId).get();
        var _chBanco = _snapC.exists ? ((_snapC.data() || {}).coHosts) : null;
        if (Array.isArray(_chBanco) && _chBanco.length) {
          var _aceito = function (c) { return c && (c.status === 'active' || c.status === 'accepted'); };
          var _porUid = {};
          _chBanco.forEach(function (c) { if (c && c.uid) _porUid[c.uid] = c; });
          var _regrediram = [];
          cleanData.coHosts.forEach(function (c, i) {
            if (!c || !c.uid) return;
            var b = _porUid[c.uid];
            if (!b || !_aceito(b) || _aceito(c)) return;      // não regrediu
            cleanData.coHosts[i] = b;                          // devolve o estado do banco
            _regrediram.push(c.uid);
          });
          if (_regrediram.length) {
            if (window._warn) window._warn('[saveTournament] CO-ORGANIZACAO PROTEGIDA em ' + docId +
              ': o save tentava devolver ' + _regrediram.length + ' aceite(s) para pendente — restaurado(s) (' + _regrediram.join(', ') + ').');
            try { if (typeof window._captureException === 'function') window._captureException(new Error('cohost accept revert blocked: ' + docId)); } catch (_se) {}
          }
        }
      } catch (_chErr) { /* o guard nunca derruba o save */ }
    }

    var _allowReset = (options && options._allowConfigReset) || cleanData._allowConfigReset === true;
    delete cleanData._allowConfigReset; // flag transiente — nunca persistir no doc
    try {
      var _incMulti = Array.isArray(cleanData.phases) && cleanData.phases.length > 1;
      if (!_incMulti && !_allowReset) {
        var _exSnap = await this.db.collection('tournaments').doc(docId).get();
        if (_exSnap.exists) {
          var _ex = _exSnap.data() || {};
          if (Array.isArray(_ex.phases) && _ex.phases.length > 1) {
            cleanData.phases = _ex.phases;
            if (_ex.reiRainha != null) cleanData.reiRainha = _ex.reiRainha;
            if (_ex.currentPhaseIndex != null) cleanData.currentPhaseIndex = _ex.currentPhaseIndex;
            if (_ex.drawMode != null) cleanData.drawMode = _ex.drawMode;
            if (_ex.allowSelfDeactivation != null) cleanData.allowSelfDeactivation = _ex.allowSelfDeactivation;
            if (window._warn) window._warn('[saveTournament] BLOQUEADO: save sem fases ia zerar torneio multi-fase ' + docId + ' — config do banco preservada (phases=' + _ex.phases.length + ')');
          }
        }
      }
    } catch (_cfgErr) { /* blindagem best-effort; nunca derruba o save */ }
    await this.db.collection('tournaments').doc(docId).set(cleanData, { merge: true });
    // v1.7.29 — ESCRITA DUPLA na subcoleção `tournaments/{id}/participants/{uid}`.
    // PASSO 1 de expandir→migrar→contrair. O array segue sendo a FONTE DA VERDADE e
    // NENHUMA tela lê isto ainda — por isso é seguro no meio de um torneio sorteado.
    // O que ganha desde já: cada pessoa passa a ter um documento PRÓPRIO, sem contenção
    // com o resto do torneio, servindo de PROVA e de fonte de recuperação. Reconstruir o
    // sumiço do Gersom custou uma tarde porque essa prova não existia.
    // Best-effort e fora do caminho crítico: falhar aqui não pode derrubar o save do
    // torneio, que é o que a pessoa está esperando na tela.
    try { this._mirrorRoster(docId, cleanData); } catch (_mrErr) {}
  },

  // Espelha o elenco na subcoleção — só o DELTA. Escrever os 111 a cada save seria
  // 111 escritas por clique e derrubaria a quota; e o delta é o que interessa mesmo:
  // quem entrou e quem saiu. `_rosterMirrorCache` guarda o último estado espelhado por
  // torneio, então saves que não mexem no elenco (a maioria) não geram escrita nenhuma.
  _rosterMirrorCache: {},
  _mirrorRoster(docId, data) {
    if (!this.db || !Array.isArray(data.participants)) return;
    var uidsOf = (typeof window !== 'undefined' && typeof window._participantUids === 'function')
      ? window._participantUids : function (p) { return (p && p.uid) ? [p.uid] : []; };
    var agora = {};
    data.participants.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      uidsOf(p).forEach(function (u) { if (u) agora[u] = p; });
    });
    var antes = this._rosterMirrorCache[docId] || null;
    this._rosterMirrorCache[docId] = Object.keys(agora).reduce(function (o, u) { o[u] = 1; return o; }, {});
    // 1ª vez nesta sessão: não há base de comparação; não sai escrevendo tudo (o backfill
    // é feito por script, uma vez). A partir daqui o delta é confiável.
    if (!antes) return;
    var col = this.db.collection('tournaments').doc(docId).collection('participants');
    var self = this;
    Object.keys(agora).forEach(function (u) {
      if (antes[u]) return;                                  // já estava: nada a escrever
      try {
        col.doc(u).set({ uid: u, status: 'enrolled', at: new Date().toISOString(),
                         entry: agora[u] }, { merge: true });
      } catch (_e) {}
    });
    Object.keys(antes).forEach(function (u) {
      if (agora[u]) return;
      // NÃO apaga: marca. O histórico de quem saiu é justamente o que faltou no incidente.
      try { col.doc(u).set({ status: 'left', leftAt: new Date().toISOString() }, { merge: true }); } catch (_e) {}
    });
  },

  // ── BLINDAGEM DE CONCORRÊNCIA (project_concurrency_safe_saves) ──────────────
  // Primitivo transacional GENÉRICO para todo read-modify-write de alto risco.
  // Substitui o anti-padrão "mutar t local + saveTournament(merge doc inteiro)"
  // (propenso a lost-update: 2 caminhos/usuários leem, cada um grava tudo, o
  // último sobrescreve o outro com valores velhos).
  //
  // Como funciona / porque é seguro:
  //  1. runTransaction lê o doc FRESCO dentro da transação.
  //  2. `mutatorFn(freshData)` aplica a mutação NO estado fresco (in place).
  //  3. Grava o doc inteiro fresco+mutado via txn.set (SEM merge). Dentro de uma
  //     transação isso é clobber-free: se outro cliente commitou entre a leitura
  //     e o commit, o Firestore ABORTA e RE-EXECUTA a transação — re-lê o estado
  //     JÁ com a mudança do outro e re-aplica a nossa por cima. Nenhum write se perde.
  //
  // mutatorFn(data): muta `data` in place. Retorne `false` pra ABORTAR sem gravar
  // (ex.: pré-condição falhou). Qualquer outro retorno grava. Campos denormalizados
  // (memberEmails/memberUids/adminEmails/adminUids/nextDrawAt) são recomputados
  // aqui pra manter paridade com saveTournament.
  //
  // Retorna { aborted:boolean, data:object } — data = estado autoritativo pós-commit
  // (ou o lido, se abortou), pra o chamador sincronizar o AppStore local.
  // ── PRESENÇA POR CAMPO (v1.3.157) — a correção do "presença pula/desmarca em rajada" ──────
  // MEDIDO no Firestore REAL (doc temporário, 25 marcações):
  //   • 25 transações que gravam o DOC INTEIRO, concorrentes .......... 23/25 (PERDE)
  //   • idem + CF gravando o doc inteiro junto ........................ 23/25 (PERDE)
  //   • 25 updates POR CAMPO, concorrentes ........................... 25/25 ✅
  //   • idem + CF gravando o doc inteiro junto ....................... 25/25 ✅
  // Causa: marcar UMA presença reescrevia o TORNEIO INTEIRO dentro de uma transação. Sob
  // contenção elas se atropelam, algumas esgotam os retries e FALHAM — a marca já estava na tela
  // (otimista) e o snapshot seguinte a removia. Update por CAMPO não colide: o Firestore funde no
  // nível do campo, sem read-modify-write. Ver [[project_concurrency_safe_saves]].
  // `sets`/`dels` = arrays de {map, key}. Ex.: sets [{map:'checkedIn', key:'uid1'}].
  async setPresenceFields(tournamentId, sets, dels) {
    if (!this.ensureDb()) throw new Error('Firestore not initialized');
    var FieldValue = (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) || null;
    var FieldPath = (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldPath) || null;
    if (!FieldValue || !FieldPath) throw new Error('FieldValue/FieldPath indisponível');
    var ref = this.db.collection('tournaments').doc(String(tournamentId));
    // FieldPath com segmentos evita QUALQUER problema de escaping (nome com ponto, etc.)
    var args = [];
    (sets || []).forEach(function (o) { if (o && o.map && o.key) args.push(new FieldPath(o.map, String(o.key)), o.value); });
    (dels || []).forEach(function (o) { if (o && o.map && o.key) args.push(new FieldPath(o.map, String(o.key)), FieldValue.delete()); });
    if (!args.length) return true;
    await ref.update.apply(ref, args);
    return true;
  },

  async mutateTournament(tournamentId, mutatorFn, options) {
    if (!this.ensureDb()) throw new Error('Firestore not initialized');
    var ref = this.db.collection('tournaments').doc(String(tournamentId));
    var self = this;
    var _txOut = await this.db.runTransaction(async function (transaction) {
      var doc = await transaction.get(ref);
      if (!doc.exists) throw new Error('Tournament not found: ' + tournamentId);
      var data = doc.data();
      // Rei/Rainha: o doc fresco traz grupos só com matchIds. Hidrata group.matches
      // como refs de round.matches ANTES do mutator (W.O./substituição leem g.matches).
      try { if (typeof window !== 'undefined' && typeof window._hydrateMonarchGroups === 'function') window._hydrateMonarchGroups(data); } catch (_hmErr) {}
      // v1.7.28 — MESMA DOUTRINA DENTRO DA TRANSAÇÃO. Ela é à prova de CONCORRÊNCIA
      // (lê fresco, re-executa se alguém commitou no meio), mas nada olha o que o próprio
      // MUTATOR faz. É por aqui que passam W.O., substituição e formação de grupo — tudo
      // o que roda com o torneio já sorteado. Um mutator que derrube alguém por engano
      // sumiria com a pessoa exatamente como no save solto (v1.7.26).
      // Aqui a comparação é EXATA e sem corrida: `_antes` e o resultado saem da MESMA
      // leitura transacional. Quem remove de propósito declara `allowRosterRemoval` no
      // options — os mesmos termos do saveTournament, pra não haver duas regras.
      var _uidsTx = (typeof window !== 'undefined' && typeof window._participantUids === 'function')
        ? window._participantUids : function (p) { return (p && p.uid) ? [p.uid] : []; };
      var _setDe = function (arr) {
        var o = {};
        (Array.isArray(arr) ? arr : []).forEach(function (p) {
          if (p && typeof p === 'object') _uidsTx(p).forEach(function (u) { if (u) o[u] = 1; });
        });
        return o;
      };
      var _antesArr = { participants: Array.isArray(data.participants) ? data.participants.slice() : [],
                        standbyParticipants: Array.isArray(data.standbyParticipants) ? data.standbyParticipants.slice() : [],
                        waitlist: Array.isArray(data.waitlist) ? data.waitlist.slice() : [] };

      var out = mutatorFn(data);
      if (out === false) return { aborted: true, data: data };
      // ── RESTAURAÇÃO PÓS-MUTATOR — a regra é NÃO SUMIR, não "não sair" ─────────
      // ⚠️ A primeira versão disto exigia que a pessoa continuasse no ELENCO, e teria
      // QUEBRADO O W.O. no meio do torneio: o W.O. tira do elenco e põe na FILA (v1.6.88).
      // O movimento elenco↔fila é legítimo nos dois sentidos — promoção sobe, W.O. desce.
      // O invariante certo é mais simples e não pode quebrar movimento nenhum:
      // ninguém pode sumir DOS DOIS ao mesmo tempo. Quem estava em alguma das listas
      // antes da mutação tem que continuar em ALGUMA delas depois; onde exatamente é
      // assunto do mutator, não meu.
      if (!(options && options.allowRosterRemoval)) {
        try {
          var _emAlgumLugar = function (d) {
            var o = {};
            ['participants', 'standbyParticipants', 'waitlist'].forEach(function (c) {
              (Array.isArray(d[c]) ? d[c] : []).forEach(function (p) {
                if (p && typeof p === 'object') _uidsTx(p).forEach(function (u) { if (u) o[u] = 1; });
              });
            });
            return o;
          };
          var _depois = _emAlgumLugar(data);
          var _voltaram = [];
          ['participants', 'standbyParticipants', 'waitlist'].forEach(function (campo) {
            _antesArr[campo].forEach(function (p) {
              var us = _uidsTx(p).filter(Boolean);
              if (!us.length) return;                        // fictício: sem identidade estável
              if (us.some(function (u) { return _depois[u]; })) return;   // está em ALGUMA lista
              if (!Array.isArray(data[campo])) data[campo] = [];
              data[campo].push(p);                           // volta pra lista de onde saiu
              us.forEach(function (u) { _depois[u] = 1; });
              _voltaram.push(us[0] + ' (' + campo + ')');
            });
          });
          if (_voltaram.length) {
            if (!Array.isArray(data.history)) data.history = [];
            data.history.push({ date: new Date().toISOString(),
              message: 'Protecao automatica (transacao): ' + _voltaram.length +
                ' pessoa(s) sumiram de TODAS as listas na mutacao e foram restauradas (' + _voltaram.join(', ') + ').' });
            if (window._warn) window._warn('[mutateTournament] LISTA PROTEGIDA: ' + _voltaram.join(', '));
            try { if (typeof window._captureException === 'function') window._captureException(new Error('tx roster vanish blocked: ' + _voltaram.join(', '))); } catch (_se) {}
          }
        } catch (_txgErr) { /* o guard nunca derruba a transação */ }
      }
      // Recomputa denormalizados a partir do estado FINAL (mesmos helpers do save).
      // NUNCA ENCOLHE (union com o valor já no doc fresco) — mesma blindagem do
      // saveTournament: um uid/email que só existe no denormalizado (co-host por
      // path que não popula participants) não pode sumir e derrubar o listener
      // `array-contains` de quem depende dele. Ver saveTournament (v1.8.96/1.9.84).
      // SANDBOX: _mergeMemberUids SUBSTITUI (não une) — ver saveTournament/persist-core.
      data.adminEmails  = self._computeAdminEmails(data);
      data.adminUids    = self._computeAdminUids(data);
      data.memberUids   = window._mergeMemberUids(data, data.memberUids, self._computeMemberUids(data));
      try {
        if (typeof window !== 'undefined' && typeof window._nextOwedDrawMs === 'function') {
          var owed = window._nextOwedDrawMs(data);
          if (typeof owed === 'number') data.nextDrawAt = owed;
          else delete data.nextDrawAt;
        }
      } catch (_ndErr) { /* otimização; nunca derruba a transação */ }
      var clean = self._cleanUndefined(data);
      self._foldMonarchGroups(clean); // Rei/Rainha: grava só matchIds (fonte única = round.matches)
      // v4.5.85 (ITEM 3 · Fase 4): PERSISTE cópia sanitizada (sem nome pra quem tem uid),
      // mas DEVOLVE `clean` COM nome pro caller sincronizar o AppStore local (display em
      // sessão intacto — o nome vivo já bate; só o Firestore fica só-uid).
      var _persist = clean;
      if (typeof window !== 'undefined' && typeof window._stripStoredNamesForUidEntries === 'function') {
        var _stripped = {};
        if (Array.isArray(clean.participants)) _stripped.participants = window._stripStoredNamesForUidEntries(clean.participants);
        if (Array.isArray(clean.standbyParticipants)) _stripped.standbyParticipants = window._stripStoredNamesForUidEntries(clean.standbyParticipants);
        if (Array.isArray(clean.coHosts)) _stripped.coHosts = window._stripStoredNamesForUidEntries(clean.coHosts);
        if (Array.isArray(clean.waitlist)) _stripped.waitlist = window._stripStoredNamesForUidEntries(clean.waitlist);
        if (Object.keys(_stripped).length) _persist = Object.assign({}, clean, _stripped);
      }
      transaction.set(ref, _persist); // set (sem merge) DENTRO da txn = clobber-free
      // Devolve o estado autoritativo HIDRATADO (group.matches como refs) pro caller
      // sincronizar o AppStore sem depender de um render pra reconstruir os grupos.
      try { if (typeof window !== 'undefined' && typeof window._hydrateMonarchGroups === 'function') window._hydrateMonarchGroups(clean); } catch (_hmErr2) {}
      return { aborted: false, data: clean };
    });
    // v1.7.29: escrita dupla também aqui — a INSCRIÇÃO passa por esta transação, então
    // sem isto a subcoleção nasceria cega justamente pro evento que mais importa.
    // FORA da transação de propósito: escrever numa subcoleção dentro dela ampliaria o
    // conjunto de docs disputados e faria a transação abortar mais — o oposto do que
    // queremos num pico de lançamento. O espelho é best-effort; a verdade é o array.
    try { if (_txOut && !_txOut.aborted && _txOut.data) this._mirrorRoster(tournamentId, _txOut.data); } catch (_mrErr) {}
    return _txOut;
  },

  // ── PLACAR POR JOGO EM DOC PRÓPRIO (project_match_result_docs, linha 4.1) ──────
  // Cada JOGO tem seu resultado/consenso num doc próprio:
  //   tournaments/{tId}/results/{matchId}
  // Por quê: escrever o placar do jogo A e o do jogo B são docs DIFERENTES →
  // NUNCA disputam entre si (isolamento, escala — o modelo das presenças/places).
  // A trava contra corrida DENTRO de um mesmo jogo (dois participantes/org lançando
  // ao mesmo tempo) é mantida pela TRANSAÇÃO neste doc: runTransaction lê fresco,
  // aplica, grava; conflito → aborta+re-executa → nenhum write se perde. Dividir +
  // manter a segurança, exatamente como o dono pediu.
  //
  // O doc guarda SÓ o estado MUTÁVEL do resultado (scoreP1/P2, winner, draw, sets,
  // setsWonP1/P2, totalGamesP1/P2, fixedSet, resultAt, startedAt, pendingResult,
  // wo, woAbsentSide, ...). A ESTRUTURA da chave (p1/p2, nextMatchId, fase) fica no
  // doc do torneio — a hidratação de leitura mescla o resultado no match p/ render.
  //
  // mutatorFn(result): muta `result` in place. Retorne `false` pra ABORTAR sem gravar.
  // Retorna { aborted, data } — data = estado autoritativo pós-commit.
  async mutateMatchResult(tournamentId, matchId, mutatorFn) {
    if (!this.ensureDb()) throw new Error('Firestore not initialized');
    if (matchId == null || matchId === '') throw new Error('mutateMatchResult: matchId vazio');
    var ref = this.db.collection('tournaments').doc(String(tournamentId))
      .collection('results').doc(String(matchId));
    var self = this;
    return this.db.runTransaction(async function (transaction) {
      var doc = await transaction.get(ref);
      var data = doc.exists ? doc.data() : { matchId: String(matchId), tournamentId: String(tournamentId) };
      var out = mutatorFn(data);
      if (out === false) return { aborted: true, data: data };
      // Restauração pós-mutator (ver bloco acima). Sai de graça quando nada sumiu.
      if (!(options && options.allowRosterRemoval)) {
        try {
          var _depoisElenco = _setDe(data.participants);
          var _voltaram = [];
          if (Array.isArray(data.participants)) {
            _antesArr.participants.forEach(function (p) {
              var us = _uidsTx(p).filter(Boolean);
              if (!us.length) return;                                   // fictício: sem proteção
              if (us.some(function (u) { return _depoisElenco[u]; })) return;
              data.participants.push(p); us.forEach(function (u) { _depoisElenco[u] = 1; });
              _voltaram.push(us[0] + ' (participants)');
            });
          }
          ['standbyParticipants', 'waitlist'].forEach(function (campo) {
            if (!Array.isArray(data[campo]) || !_antesArr[campo].length) return;
            var _dep = _setDe(data[campo]);
            _antesArr[campo].forEach(function (p) {
              var us = _uidsTx(p).filter(Boolean);
              if (!us.length) return;
              if (us.some(function (u) { return _dep[u]; })) return;
              if (us.some(function (u) { return _depoisElenco[u]; })) return;  // PROMOVIDO
              data[campo].push(p); us.forEach(function (u) { _dep[u] = 1; });
              _voltaram.push(us[0] + ' (' + campo + ')');
            });
          });
          if (_voltaram.length) {
            if (!Array.isArray(data.history)) data.history = [];
            data.history.push({ date: new Date().toISOString(),
              message: 'Protecao automatica (transacao): ' + _voltaram.length +
                ' pessoa(s) sumiram na mutacao e foram restauradas (' + _voltaram.join(', ') + ').' });
            if (window._warn) window._warn('[mutateTournament] LISTA PROTEGIDA: ' + _voltaram.join(', '));
            try { if (typeof window._captureException === 'function') window._captureException(new Error('tx roster shrink blocked: ' + _voltaram.join(', '))); } catch (_se) {}
          }
        } catch (_txgErr) { /* o guard nunca derruba a transação */ }
      }
      data.matchId = String(matchId);
      data.updatedAt = new Date().toISOString();
      var clean = self._cleanUndefined(data);
      transaction.set(ref, clean); // set (sem merge) DENTRO da txn = clobber-free
      return { aborted: false, data: clean };
    });
  },

  // Lê TODOS os docs de resultado de um torneio (subcoleção results). Retorna um
  // mapa { [matchId]: resultData } pra hidratação de leitura (merge nos matches).
  async loadMatchResults(tournamentId) {
    if (!this.ensureDb()) return {};
    var snap = await this.db.collection('tournaments').doc(String(tournamentId))
      .collection('results').get();
    var out = {};
    snap.forEach(function (d) { out[d.id] = d.data(); });
    return out;
  },

  // ── FASE B: leitura ISOLADA do subdoc de resultado (project_match_result_docs) ──
  // Lê UM doc de resultado (tournaments/{tId}/results/{matchId}) sem carregar o
  // torneio inteiro. Retorna o dado do jogo ou null.
  async loadMatchResult(tournamentId, matchId) {
    if (!this.ensureDb()) return null;
    if (matchId == null || matchId === '') return null;
    var d = await this.db.collection('tournaments').doc(String(tournamentId))
      .collection('results').doc(String(matchId)).get();
    return d.exists ? d.data() : null;
  },

  // Lê TODOS os jogos de um usuário ACROSS todos os torneios numa ÚNICA query
  // collectionGroup (`results` where playerUids array-contains uid), sem carregar
  // NENHUM doc de torneio — o benefício de isolamento da leitura da linha 4.1.
  // Cada item traz `tournamentId` (campo do subdoc) + `matchId` + resultado.
  // Requer o índice collectionGroup `results` (playerUids CONTAINS, updatedAt DESC).
  async loadMyMatchResults(uid, opts) {
    if (!this.ensureDb() || !uid) return [];
    var q = this.db.collectionGroup('results').where('playerUids', 'array-contains', uid);
    try { q = q.orderBy('updatedAt', 'desc'); } catch (e) {}
    if (opts && opts.limit) q = q.limit(opts.limit);
    var snap = await q.get();
    var out = [];
    snap.forEach(function (d) {
      var data = d.data() || {};
      // tournamentId costuma vir no subdoc (mirror/seed); fallback = doc pai.
      if (!data.tournamentId && d.ref && d.ref.parent && d.ref.parent.parent) {
        data.tournamentId = d.ref.parent.parent.id;
      }
      out.push(data);
    });
    return out;
  },

  // Atomic enrollment — uses Firestore transaction to prevent race conditions
  // where concurrent enrollments overwrite each other's participants array
  // Fala o protocolo callable NA MÃO (POST {data} → {result}|{error}), igual
  // window._callDrawRound. NÃO usa httpsCallable de propósito: com o usuário
  // LOGADO o SDK compat tenta montar o token FCM antes de enviar e a promise
  // REJEITA sem a requisição sair ("Messaging: …") — a CF nem é tocada. Ver
  // js/views/tournaments-draw.js (_callDrawRound) e v1.3.86.
  async _callFn(name, payload) {
    var fb = window.firebase;
    var user = fb && fb.auth && fb.auth().currentUser;
    if (!user) throw Object.assign(new Error('login necessário'), { code: 'functions/unauthenticated' });
    var pid = '';
    try { pid = fb.app().options.projectId; } catch (e) {}
    if (!pid) throw Object.assign(new Error('App não inicializado'), { code: 'functions/internal' });
    var url = 'https://us-central1-' + pid + '.cloudfunctions.net/' + name;
    var tok = await user.getIdToken();
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
      body: JSON.stringify({ data: payload })
    });
    var j = await r.json().catch(function () { return {}; });
    if (j && j.error) {
      var st = String(j.error.status || '').toLowerCase().replace(/_/g, '-');
      throw Object.assign(new Error(j.error.message || 'Falha'), { code: 'functions/' + (st || 'internal') });
    }
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { code: 'functions/internal' });
    return (j && j.result) || {};
  },

  // Inscrição via Cloud Function (Admin SDK, servidor) com FALLBACK pra transação
  // do cliente. A CF não passa pela fila IndexedDB quebrada do SDK 10.8.1 (bug
  // fatal no iOS Safari que fazia a inscrição falhar) nem pelas rules. O fallback
  // preserva o comportamento anterior se a CF estiver fora — e é IDEMPOTENTE:
  // se a CF gravou mas a resposta se perdeu, a transação relê e o "já inscrito"
  // pega (sem duplicar). Ver [[project_firestore_assertion_bug]].
  async enrollParticipant(tournamentId, participantObj, extraUpdates) {
    try {
      return await this._callFn('enrollParticipant', {
        tournamentId: String(tournamentId),
        participantObj: participantObj,
        extraUpdates: extraUpdates || null
      });
    } catch (e) {
      if (window._warn) window._warn('[enrollParticipant] CF falhou (' + ((e && e.code) || e) + ') — fallback pra transação cliente');
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'enrollParticipant-cf-fallback', tournamentId: String(tournamentId), code: e && e.code });
      }
      return this._enrollParticipantTx(tournamentId, participantObj, extraUpdates);
    }
  },

  async _enrollParticipantTx(tournamentId, participantObj, extraUpdates) {
    if (!this.db) throw new Error('Firestore not initialized');
    // Guard: rejeitar participante completamente sem identificador.
    // Evita objetos fantasmas {name:null,email:null,displayName:null} causados
    // por race condition entre login e inscrição (AppStore.currentUser ainda
    // não carregado quando _doEnrollCurrentUser rodou).
    var _hasId = !!(participantObj && (
      participantObj.uid || participantObj.email ||
      participantObj.displayName || participantObj.name || participantObj.phone
    ));
    if (!_hasId) throw new Error('enrollParticipant: participantObj sem identificador válido');
    var docRef = this.db.collection('tournaments').doc(String(tournamentId));
    var self = this;
    return this.db.runTransaction(async function(transaction) {
      var doc = await transaction.get(docRef);
      if (!doc.exists) throw new Error('Tournament not found');
      var data = doc.data();
      var participants = Array.isArray(data.participants) ? data.participants : (data.participants ? Object.values(data.participants) : []);

      // Check if already enrolled (by email or displayName)
      var pEmail = participantObj.email || '';
      var pName = participantObj.displayName || participantObj.name || '';
      // Block enrollment if tournament is closed, active (draw done), or finished
      // Liga with open enrollment is the only exception
      var _isLiga = data.format && (data.format === 'Liga' || data.format === 'Ranking' || data.format === 'liga' || data.format === 'ranking');
      // v2.4.17: Liga é inscrição-aberta por DEFAULT — só fecha se explicitamente
      // false. Antes era truthy (data.ligaOpenEnrollment), então docs com o campo
      // undefined/null bloqueavam a inscrição assim que o sorteio acontecia, MESMO
      // com os cards/config mostrando "aberta" (que usam !== false). Bug da Vivi
      // Hirata: organizador não conseguia inscrever após o 1º confronto. Alinhado
      // com enrollCurrentUser, cards e form (todos !== false).
      var _ligaOpen = _isLiga && data.ligaOpenEnrollment !== false;
      var _sorteioRealizado = (Array.isArray(data.matches) && data.matches.length > 0) ||
                              (Array.isArray(data.rounds) && data.rounds.length > 0) ||
                              (Array.isArray(data.groups) && data.groups.length > 0);
      // Also check registration deadline
      var _deadlinePassed = data.registrationLimit && new Date(data.registrationLimit) < new Date();
      var _inscricoesAbertas = (data.status !== 'closed' && data.status !== 'finished' && !_sorteioRealizado && !_deadlinePassed) || _ligaOpen;
      if (!_inscricoesAbertas) {
        // Auto-close if deadline just passed (persist the status change)
        if (_deadlinePassed && data.status !== 'closed') {
          transaction.update(docRef, { status: 'closed' });
        }
        return { alreadyEnrolled: false, enrollmentClosed: true, participants: participants };
      }

      var pUid = participantObj.uid || '';
      function _memberMatches(m) {
        if (!m) return false;
        if (typeof m === 'string') {
          var s = m.trim();
          return (pEmail && s.toLowerCase() === pEmail.toLowerCase()) || (pName && s === pName);
        }
        if (pUid && m.uid && m.uid === pUid) return true;
        if (pEmail && m.email && m.email.toLowerCase() === pEmail.toLowerCase()) return true;
        if (pName && m.displayName && m.displayName === pName) return true;
        if (pName && m.name && m.name === pName) return true;
        return false;
      }
      var already = participants.some(function(p) {
        if (typeof p === 'string') {
          var parts = p.split(' / ').map(function(s) { return s.trim(); }).filter(Boolean);
          return parts.some(_memberMatches);
        }
        if (_memberMatches(p)) return true;
        if (Array.isArray(p.participants) && p.participants.some(_memberMatches)) return true;
        // v3.0.x: IDENTIDADE POR SLOT (uid > nome > email). A dupla formada por aceite grava
        // p1Uid/p2Uid/p1Name/p2Name com displayName = só o p1 (ex.: "Kelly Barth", sem "/").
        // Sem checar os slots aqui (dentro da TRANSAÇÃO atômica), o p2 (ex.: Rodrigo) era visto
        // como NÃO-inscrito → inscrição em DOBRO no banco. Espelha store.js _userMatchesParticipant.
        if (pUid && ((p.p1Uid && p.p1Uid === pUid) || (p.p2Uid && p.p2Uid === pUid))) return true;
        if (pName && ((p.p1Name && p.p1Name === pName) || (p.p2Name && p.p2Name === pName))) return true;
        if (pEmail && ((p.p1Email && p.p1Email.toLowerCase() === pEmail.toLowerCase()) || (p.p2Email && p.p2Email.toLowerCase() === pEmail.toLowerCase()))) return true;
        // Fallback SÓ pra time em forma de STRING legada "A / B" (sem campos de slot) — '/' nunca
        // define dupla, mas pra string legada é a única forma de checar pertencimento.
        var label = p.displayName || p.name || '';
        if (label && label.indexOf(' / ') !== -1) {
          return label.split(' / ').map(function(s) { return s.trim(); }).filter(Boolean).some(_memberMatches);
        }
        return false;
      });
      if (already) return { alreadyEnrolled: true, participants: participants };

      // v1.6.86 — FASE SORTEADA → LISTA DE ESPERA. Espelha functions/enroll-core.computeEnroll
      // e window._phaseDrawDone. Esta transação é o FALLBACK de quando a CF falha; sem o mesmo
      // ramo, o fallback recriaria exatamente o inscrito fantasma que a CF passou a evitar.
      // Vem antes do teto de vagas: a espera é o lugar de quem não tem vaga.
      if (_sorteioRealizado) {
        var _sbArr = Array.isArray(data.standbyParticipants) ? data.standbyParticipants : [];
        var _jaNaEspera = _sbArr.some(function(p) {
          if (typeof p === 'string') return _memberMatches(p);
          if (_memberMatches(p)) return true;
          return !!(pUid && ((p.p1Uid && p.p1Uid === pUid) || (p.p2Uid && p.p2Uid === pUid)));
        });
        if (_jaNaEspera) return { alreadyEnrolled: false, waitlisted: true, alreadyWaitlisted: true, participants: participants };
        var _sbNew = _sbArr.concat([self._cleanUndefined(participantObj)]);
        var _wlData = Object.assign({}, data, { standbyParticipants: _sbNew });
        var _sbPersist = (typeof window !== 'undefined' && typeof window._stripStoredNamesForUidEntries === 'function')
          ? window._stripStoredNamesForUidEntries(_sbNew) : _sbNew;
        var _wlUpdate = { standbyParticipants: _sbPersist, memberUids: self._computeMemberUids(_wlData) };
        if (extraUpdates) {
          Object.keys(extraUpdates).forEach(function(k) { _wlUpdate[k] = self._cleanUndefined(extraUpdates[k]); });
        }
        transaction.update(docRef, _wlUpdate);
        return { alreadyEnrolled: false, waitlisted: true, participants: participants, standbyParticipants: _sbNew };
      }

      // v2.6.87: Limite com corrida — capacidade ATÔMICA. No modo 'cap' (não-sorteio)
      // com maxParticipants definido, REJEITA se já lotou ANTES de inserir. Como roda
      // dentro da transação, dois cliques simultâneos pra última vaga não passam ambos:
      // o segundo é re-executado pelo Firestore, re-lê participants já cheio e rejeita.
      // Quem clicou depois de lotar NUNCA é considerado inscrito.
      var _capMax = parseInt(data.maxParticipants, 10);
      var _isDrawMode = data.enrollmentLimitMode === 'draw';
      if (!_isDrawMode && !isNaN(_capMax) && _capMax > 0 && participants.length >= _capMax) {
        return { alreadyEnrolled: false, capacityFull: true, participants: participants };
      }

      participants.push(self._cleanUndefined(participantObj));

      var _enrollData = Object.assign({}, data, { participants: participants });
      // v4.5.85 (ITEM 3 · Fase 4): persiste array sanitizado (sem nome pra quem tem uid);
      // `participants` (com nome) segue no retorno pro caller sincronizar o AppStore local.
      var _persistParts = (typeof window !== 'undefined' && typeof window._stripStoredNamesForUidEntries === 'function')
        ? window._stripStoredNamesForUidEntries(participants) : participants;
      var updateData = {
        participants: _persistParts,
        memberUids:   self._computeMemberUids(_enrollData)   // v1.2.2: só uid
      };
      if (extraUpdates) {
        Object.keys(extraUpdates).forEach(function(k) {
          updateData[k] = self._cleanUndefined(extraUpdates[k]);
        });
      }

      // Auto-close check — v2.4.12: RESPEITA o toggle autoCloseOnFull.
      // Antes fechava sempre ao atingir maxParticipants ("always, no flag needed"),
      // mas o caminho do cliente (tournaments-enrollment.js) só fecha quando o flag
      // é verdadeiro. Inconsistência: desligar "Fechar quando lotar" não tinha efeito
      // no caminho real de inscrição. Agora os dois lados usam a mesma regra.
      // Modo Vagas-por-sorteio (enrollmentLimitMode='draw') nunca fecha sozinho.
      // v2.6.87: "Limite com corrida" sempre encerra ao lotar (a corrida é o modelo).
      // Modo Vagas-por-sorteio (draw) nunca fecha sozinho — encerra por prazo/organizador.
      var _maxP = parseInt(data.maxParticipants, 10);
      if (!_isDrawMode && !isNaN(_maxP) && _maxP > 0 && participants.length >= _maxP) {
        updateData.status = 'closed';
      }
      // v2.6.88: Vagas com sorteio — ao ATINGIR o máx., sinaliza (UMA vez) que as
      // próximas inscrições entram em lista de espera. waitlistNoticeSent garante 1
      // disparo só (mesmo com cliques simultâneos, a transação é serializada).
      var _reachedDraw = false;
      if (_isDrawMode && !isNaN(_maxP) && _maxP > 0 && participants.length >= _maxP && !data.waitlistNoticeSent) {
        updateData.waitlistNoticeSent = true;
        _reachedDraw = true;
      }

      transaction.update(docRef, updateData);
      return { alreadyEnrolled: false, participants: participants, autoCloseTriggered: !!updateData.status, reachedCapacityDraw: _reachedDraw };
    });
  },

  // Atomic deenrollment — prevents race conditions where deenroll overwrites
  // concurrent enrollments by other users
  // v1.2.2: assinatura UID ONLY — userEmail/userDisplayName saíram porque a identidade é o
  // uid; parâmetro que ninguém lê é convite pra alguém "usar como fallback" de novo.
  async deenrollParticipant(tournamentId, userUid) {
    try {
      return await this._callFn('deenrollParticipant', {
        tournamentId: String(tournamentId),
        userUid: String(userUid || '')
      });
    } catch (e) {
      if (window._warn) window._warn('[deenrollParticipant] CF falhou (' + ((e && e.code) || e) + ') — fallback pra transação cliente');
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'deenrollParticipant-cf-fallback', tournamentId: String(tournamentId), code: e && e.code });
      }
      return this._deenrollParticipantTx(tournamentId, userUid);
    }
  },

  // Formar/desfazer DUPLA manual via Cloud Function (Admin SDK, concorrência-safe + replica
  // pro Sandbox). Thin wrappers: o chamador (_formDuplaByUids/_splitDupla) mantém a mutação
  // em memória pra UI imediata e, no CATCH, faz o saveTournament DIRETO como fallback (persiste
  // o t já mutado se a CF estiver fora). Ver pair-core.js / [[project_draw_client_to_cf_migration]].
  async formPair(tournamentId, opts) {
    return await this._callFn('formPair', {
      tournamentId: String(tournamentId),
      uid1: (opts && opts.uid1) || '', name1: (opts && opts.name1) || '',
      uid2: (opts && opts.uid2) || '', name2: (opts && opts.name2) || '',
      changeRule: !!(opts && opts.changeRule)
    });
  },
  // Responder convite de co-organização/transferência. CF-ONLY: o cliente não consegue
  // gravar (o aceite muda adminUids e a regra do participante não cobre) e a CF é quem
  // valida que o destinatário da transferência é quem aceita. Identidade só por uid.
  async respondHostInvite(tournamentId, inviteType, action) {
    return await this._callFn('respondHostInvite', {
      tournamentId: String(tournamentId),
      inviteType: String(inviteType || ''),
      action: String(action || '')
    });
  },
  async splitPair(tournamentId, opts) {
    return await this._callFn('splitPair', {
      tournamentId: String(tournamentId),
      id1: (opts && opts.id1) != null ? opts.id1 : '',
      id2: (opts && opts.id2) != null ? opts.id2 : ''
    });
  },
  // CF-only da DUPLA NA LISTA DE ESPERA: formar (funde _lateJoin + presença + integra na chave,
  // atômico) e desfazer. A CF (functions-autodraw) devolve `tournament` pro cliente refletir sem
  // reload. key1/key2 = uid||nome dos 2 avulsos; id1/id2 = identidade dos membros da dupla.
  async formLatePair(tournamentId, opts) {
    return await this._callFn('formLatePair', {
      tournamentId: String(tournamentId),
      key1: (opts && opts.key1) || '', key2: (opts && opts.key2) || ''
    });
  },
  async splitLatePair(tournamentId, opts) {
    return await this._callFn('splitLatePair', {
      tournamentId: String(tournamentId),
      id1: (opts && opts.id1) != null ? opts.id1 : '',
      id2: (opts && opts.id2) != null ? opts.id2 : ''
    });
  },

  async _deenrollParticipantTx(tournamentId, userUid) {
    if (!this.db) throw new Error('Firestore not initialized');
    var docRef = this.db.collection('tournaments').doc(String(tournamentId));
    var self = this;
    return this.db.runTransaction(async function(transaction) {
      var doc = await transaction.get(docRef);
      if (!doc.exists) throw new Error('Tournament not found');
      var data = doc.data();
      var participants = Array.isArray(data.participants) ? data.participants : (data.participants ? Object.values(data.participants) : []);

      // v1.2.2: UID ONLY. Identidade de quem sai é o uid — e só. Os fallbacks por e-mail e
      // por NOME que moravam aqui eram rede de segurança pra writers que não gravavam uid;
      // o preço era casar por nome (homônimo-inseguro: dois "Maira" e sai a errada) e por
      // e-mail (que a pessoa troca). Quem chama esta função é SEMPRE alguém logado saindo
      // (botão "Desinscrever-se" e exclusão de conta) — logado tem uid, ponto. Inscrito sem
      // uid é guest informal, que não loga e é removido pelo organizador por outro caminho.
      // _participantUids cobre TODO slot onde uma pessoa existe: uid, p1Uid, p2Uid e
      // sub-participants[]. Remove a entrada inteira quando bate — dupla não joga com uma
      // pessoa só. Ver [[project_uid_primary_identity]] / [[project_orphan_uid_entries]].
      if (!userUid) throw new Error('deenrollParticipant: uid obrigatório (identidade é uid)');
      var _pUids = (typeof window !== 'undefined' && window._participantUids)
        ? window._participantUids
        : function (p) {
            var out = [];
            if (!p || typeof p !== 'object') return out;
            [p.uid, p.p1Uid, p.p2Uid].forEach(function (u) { if (u) out.push(u); });
            if (Array.isArray(p.participants)) p.participants.forEach(function (s) { if (s && s.uid) out.push(s.uid); });
            return out;
          };
      // v1.5.x — DUPLA NÃO SOME O PARCEIRO: quem sai de uma dupla a DESFAZ e o parceiro
      // fica SOLO ("sem dupla"). Espelha functions/enroll-core.computeDeenroll (CF é o
      // caminho primário; isto é o fallback). Iterar limpa DUPLICATAS (uid some de TODA
      // entrada) e não deixa slot com o uid do que saiu — senão re-inscrever vira no-op.
      var _partnerSolo = (typeof window !== 'undefined' && window._pairPartnerSolo)
        ? window._pairPartnerSolo
        : function (entry, n) {
            var g = function (s) { return entry['p' + n + s]; };
            var uid = g('Uid') || ''; var nome = String(g('Name') || '').trim();
            if (!uid) return nome || null;
            var o = { uid: uid, ligaActive: true };
            if (nome) { o.displayName = nome; o.name = nome; }
            if (g('Seq') != null) o.enrollSeq = g('Seq');
            if (g('Email')) o.email = g('Email');
            if (g('Photo')) o.photoURL = g('Photo');
            if (g('Gender')) o.gender = g('Gender');
            if (g('BirthDate')) o.birthDate = g('BirthDate');
            if (entry.category) o.category = entry.category;
            if (Array.isArray(entry.categories)) o.categories = entry.categories.slice();
            if (entry.categorySource) o.categorySource = entry.categorySource;
            return o;
          };
      var _changed = false;
      var newParticipants = [];
      participants.forEach(function (p) {
        if (!p || typeof p !== 'object') { newParticipants.push(p); return; } // string guest
        var isPair = !!((p.p1Uid || p.p1Name) && (p.p2Uid || p.p2Name));
        if (isPair && (p.p1Uid === userUid || p.p2Uid === userUid)) {
          var keep = _partnerSolo(p, p.p1Uid === userUid ? 2 : 1);
          _changed = true;
          if (keep) newParticipants.push(keep);
          return;
        }
        if (_pUids(p).indexOf(userUid) !== -1) { _changed = true; return; }
        newParticipants.push(p);
      });

      if (!_changed) {
        return { notFound: true, participants: participants };
      }

      var _deenrollData = Object.assign({}, data, { participants: newParticipants });
      // v1.2.2: só memberUids. memberEmails NÃO é recomputado — quem decide quem é membro é
      // o uid (as rules leem memberUids; o e-mail só valia como fallback de torneio legado
      // sem memberUids, coisa que não existe mais). Recomputar aqui era, aliás, o ÚNICO ponto
      // que encolhia memberEmails — o saveTournament nunca encolhe, então os dois já viviam
      // divergentes. Ver [[project_uid_primary_identity]].
      transaction.update(docRef, {
        participants: newParticipants,
        memberUids:   self._computeMemberUids(_deenrollData)
      });
      return { notFound: false, participants: newParticipants };
    });
  },

  // Subcoleções que vivem SOB o torneio. Apagar o doc pai NÃO as apaga (Firestore não tem
  // delete recursivo) — quem esquece isso deixa dado vivo sem dono.
  _tournamentSubcollections: ['results', 'letzplayScans'],

  // Apaga TODOS os docs de uma subcoleção, em lotes de 400 (o teto do batch é 500).
  // Devolve quantos foram apagados. Best-effort: erro num lote não derruba o resto.
  async _deleteSubcollection(tournamentId, sub) {
    var col = this.db.collection('tournaments').doc(String(tournamentId)).collection(sub);
    var apagados = 0;
    for (var volta = 0; volta < 50; volta++) {           // teto de segurança (20 mil docs)
      var snap = await col.limit(400).get();
      if (snap.empty) break;
      var lote = this.db.batch();
      snap.forEach(function (d) { lote.delete(d.ref); });
      await lote.commit();
      apagados += snap.size;
      if (snap.size < 400) break;
    }
    return apagados;
  },

  // APAGAR UM TORNEIO É APAGAR TUDO QUE É DELE. Regra do dono (01/ago/2026, sobre o
  // sandbox): _"os dados do SB devem ficar apenas enquanto existe o SB. ao apagar o SB deve
  // apagar tudo relativo a ele para não persistir."_ Vale pra qualquer torneio.
  //
  // ISSO AQUI ERA UMA LINHA SÓ (`doc().delete()`) e por isso o banco tinha, medido em
  // 01/ago/2026, **211 documentos de placar dos quais só 60 eram de torneio vivo**: 151
  // órfãos, 85 deles de sandboxes já apagados. Órfão não é dado inerte — ele responde à
  // consulta `collectionGroup('results')` por uid e reaparece no histórico das pessoas.
  //
  // A ORDEM IMPORTA: as subcoleções PRIMEIRO, o doc do torneio DEPOIS. A regra do Firestore
  // pra `results` autoriza pelo torneio PAI (`parentT()`); com o pai já apagado o `get()`
  // devolve nada, `isAdminOf(null)` é falso e a limpeza toma permission-denied. Ou seja: uma
  // vez apagado o pai, os filhos ficam INALCANÇÁVEIS pelo cliente — é assim que os 151
  // órfãos nasceram e é por isso que não dá pra "limpar depois".
  async deleteTournament(tournamentId) {
    if (!this.db) return;
    var tId = String(tournamentId);
    for (var i = 0; i < this._tournamentSubcollections.length; i++) {
      var sub = this._tournamentSubcollections[i];
      try {
        var n = await this._deleteSubcollection(tId, sub);
        if (n && window._log) window._log('[delete torneio]', tId, '→', n, 'doc(s) de', sub);
      } catch (e) {
        // Não aborta o delete do torneio: é melhor o torneio sumir e sobrar subcoleção do
        // que o organizador clicar em Apagar e nada acontecer. Mas o erro é BARULHENTO.
        window._error('Erro ao limpar subcoleção ' + sub + ' de ' + tId + ':', e);
        if (typeof window._captureException === 'function') {
          window._captureException(e, { area: 'deleteTournament.sub', tournamentId: tId, sub: sub, code: e && e.code });
        }
      }
    }
    // discoveryFeed é um doc de ÍNDICE com o id do torneio — some junto.
    try { await this.db.collection('discoveryFeed').doc(tId).delete(); } catch (e) {}
    try {
      await this.db.collection('tournaments').doc(tId).delete();
    } catch (e) {
      window._error('Erro ao deletar torneio:', e);
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'deleteTournament', tournamentId: tournamentId, code: e && e.code });
      }
    }
  },

  async loadAllTournaments() {
    if (!this.db) return [];
    try {
      var snap = await this.db.collection('tournaments').get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'load-all-tourns'); } catch (e) {}
      var tournaments = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        if (d) tournaments.push(d);
      });
      // Torneios carregados do Firestore
      return tournaments;
    } catch (e) {
      window._error('Erro ao carregar torneios:', e);
      if (typeof window._captureException === 'function') {
        window._captureException(e, { area: 'loadAllTournaments', code: e && e.code });
      }
      return [];
    }
  },

  // Scoped load: returns only tournaments the user has a relationship with
  // (creator / organizer / active co-host / participant) via the denormalized
  // `memberEmails` field. Replaces `loadAllTournaments()` at login once the
  // backfill is complete and the composite index is live. Kept side-by-side
  // for now so the swap is a one-line change.
  // v1.2.2: UID ONLY (era loadMyTournaments(email) → where memberEmails).
  async loadMyTournaments(uid) {
    if (!this.db || !uid) return [];
    try {
      var snap = await this.db.collection('tournaments')
        .where('memberUids', 'array-contains', uid)
        .get();
      var tournaments = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        if (d) tournaments.push(d);
      });
      return tournaments;
    } catch (e) {
      window._error('Erro ao carregar torneios do usuário:', e);
      return [];
    }
  },

  // Paginated discovery feed: public tournaments currently open for
  // enrollment. Used by the dashboard "Descobrir torneios" section so users
  // find events they aren't in yet. Server-side filters cap reads to
  // O(open public tournaments), not O(whole DB). Pass `cursor` (the last
  // DocumentSnapshot from a previous call) to page; returns { tournaments,
  // nextCursor, hasMore }.
  //
  // Requires a composite index on (isPublic asc, status asc, createdAt desc).
  // Firestore suggests the exact index via a console link on first query if
  // it isn't there yet.
  async loadPublicOpenTournaments(opts) {
    if (!this.db) return { tournaments: [], nextCursor: null, hasMore: false };
    opts = opts || {};
    var limit = Math.max(1, Math.min(50, opts.limit || 20));
    try {
      // Query só por isPublic=true + orderBy createdAt desc. Antes filtrávamos
      // server-side por `status == 'open'`, mas descobrimos que o fluxo de
      // criação de torneio (create-tournament.js) não setava `status` no
      // tourData — o campo ficava undefined e a query server-side excluía os
      // torneios, resultando em count zero na dashboard "Abertos para você".
      // Agora filtramos client-side: aceita status ausente OU 'open'.
      // O custo é ler docs a mais (finished/closed) que descartamos na
      // memória — aceitável na escala alpha; pode ser revertido pra query
      // estrita depois de uma migration que backfill `status: 'open'` nos
      // docs antigos.
      var q = this.db.collection('tournaments')
        .where('isPublic', '==', true)
        .orderBy('createdAt', 'desc');
      if (opts.cursor) q = q.startAfter(opts.cursor);
      // Busca 3x a mais pra compensar filtragem client-side de docs
      // encerrados/fechados — evita que o primeiro page fique quase vazio.
      q = q.limit((limit + 1) * 3);
      var snap = await q.get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'load-public-open'); } catch (e) {}
      var tournaments = [];
      var lastDoc = null;
      var kept = 0;
      snap.forEach(function(doc) {
        var d = doc.data();
        if (!d) return;
        // Aceita status ausente (legacy) ou explicitamente 'open'.
        // Bloqueia status 'closed', 'finished', 'active' (em andamento) —
        // EXCETO Liga/Ranking que aceita inscrição mesmo com sorteio iniciado
        // (status='active') desde que ligaOpenEnrollment !== false.
        // v0.16.53: bug onde Liga pública sumia do feed de descoberta assim
        // que o organizador iniciava a 1ª rodada — Nelson não conseguia ver
        // Liga pública criada por Rodrigo porque status virou 'active'.
        var st = d.status;
        var isLigaFmt = d.format === 'Liga' || d.format === 'Ranking' || d.format === 'liga' || d.format === 'ranking';
        var ligaStillOpen = isLigaFmt && d.ligaOpenEnrollment !== false && st !== 'closed' && st !== 'finished';
        var isOpen = !st || st === 'open' || ligaStillOpen;
        if (!isOpen) return;
        // Lastdoc sempre avança mesmo quando filtrado — precisa pra cursor
        // funcionar corretamente na próxima página.
        lastDoc = doc;
        if (kept < limit) {
          tournaments.push(d);
          kept++;
        }
      });
      return {
        tournaments: tournaments,
        nextCursor: lastDoc,
        hasMore: snap.size >= (limit + 1) * 3
      };
    } catch (e) {
      window._error('Erro ao carregar torneios públicos:', e);
      return { tournaments: [], nextCursor: null, hasMore: false };
    }
  },

  // v0.16.57: novo loader que retorna TODOS os torneios públicos (sem filtro
  // de status). Diferente de `loadPublicOpenTournaments`, que filtra apenas
  // os "open"/Liga-aceitando-inscrição, este traz tudo (open, closed, active,
  // finished). Usado pelo dashboard pra mostrar 4 categorias separadas:
  // (a) inscrições abertas, (b) em andamento, (c) inscrições encerradas sem
  // sorteio, (d) encerrados. Categorização vai pra client-side.
  async loadAllPublicTournaments(opts) {
    if (!this.db) return { tournaments: [], nextCursor: null, hasMore: false };
    opts = opts || {};
    var limit = Math.max(1, Math.min(100, opts.limit || 50));
    try {
      // v0.16.62: REMOVIDO `.orderBy('createdAt', 'desc')` da query Firestore.
      // Causa-raiz do bug "Nelson não vê torneios públicos" mesmo com Liga
      // existindo no banco com isPublic=true: Firestore EXCLUI docs do
      // resultado de orderBy quando o campo de ordenação está ausente OU
      // num tipo inconsistente. Como `createdAt` é salvo como ISO string
      // em alguns paths, mas pode estar undefined em docs criados via
      // outros caminhos (ou via update sem o campo), a query orderBy zerava
      // tudo silenciosamente. Fix: query single-field `where('isPublic',
      // '==', true).limit(N)` SEM orderBy. Ordenação por createdAt vira
      // client-side. Custo: paginação por cursor não funciona temporaria-
      // mente (volume alpha é baixo, aceitável). Quando crescer a base,
      // backfill `createdAt` em todos os docs e voltar pro orderBy server-side.
      var q = this.db.collection('tournaments')
        .where('isPublic', '==', true)
        .limit(limit + 1);
      var snap = await q.get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'load-all-public'); } catch (e) {}
      var tournaments = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        if (!d) return;
        d._docId = doc.id;
        tournaments.push(d);
      });
      // Sort client-side por createdAt desc. Docs sem createdAt vão pro fim.
      tournaments.sort(function(a, b) {
        var aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        var bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bT - aT;
      });
      var hasMore = tournaments.length > limit;
      if (hasMore) tournaments = tournaments.slice(0, limit);
      window._log('[loadAllPublicTournaments v0.16.62]', { snapSize: snap.size, returned: tournaments.length, hasMore: hasMore });
      return {
        tournaments: tournaments,
        nextCursor: null, // paginação por cursor desabilitada temporariamente
        hasMore: hasMore
      };
    } catch (e) {
      window._error('Erro ao carregar todos os torneios públicos:', e);
      return { tournaments: [], nextCursor: null, hasMore: false };
    }
  },

  // Scan open tournaments across the whole DB — used by the nearby/sport-match
  // notification check, which has to look outside the current user's scoped
  // load (that's the whole point: show tournaments they aren't part of yet).
  // Filtra client-side por status ausente OU 'open' — docs legacy criados
  // antes do default explícito (v0.15.5) não têm status. Mesmo pattern
  // aplicado em loadPublicOpenTournaments.
  async loadOpenTournaments() {
    if (!this.db) return [];
    try {
      // Sem filtro server-side de status — busca todos os docs e filtra na
      // memória. Em collection com milhares de docs isso fica caro; mas o
      // call site único (notifier) já era uma varredura full anyway.
      var snap = await this.db.collection('tournaments').get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'load-all-tourns2'); } catch (e) {}
      var tournaments = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        if (!d) return;
        var st = d.status;
        if (!st || st === 'open') tournaments.push(d);
      });
      return tournaments;
    } catch (e) {
      window._error('Erro ao carregar torneios abertos:', e);
      return [];
    }
  },

  // Fetch one tournament by id — used by direct/invite links when the
  // tournament isn't in the scoped load (e.g. public tournament the user
  // hasn't joined yet).
  async loadTournamentById(id) {
    if (!this.db || !id) return null;
    try {
      var doc = await this.db.collection('tournaments').doc(String(id)).get();
      if (!doc.exists) return null;
      var _t = doc.data();
      // Rei/Rainha: o doc traz grupos só com matchIds — reidrata group.matches como refs.
      try { if (typeof window !== 'undefined' && typeof window._hydrateMonarchGroups === 'function') window._hydrateMonarchGroups(_t); } catch (_hmErr) {}
      return _t;
    } catch (e) {
      window._error('Erro ao carregar torneio:', e);
      return null;
    }
  },

  // ---- User Profiles ----

  async saveUserProfile(uid, profileData) {
    if (!this.db || !uid) return;
    // Denormalize lowercase copies for server-side search. Range queries
    // on `displayName_lower` / `email_lower` replace the
    // scan-the-whole-users-collection pattern in searchUsers(). Only write
    // the `_lower` fields when the source field is present in this update,
    // so merge-saves that don't touch displayName/email don't clobber them.
    //
    // v0.16.8: removido try/catch que engolia silenciosamente erros do
    // Firestore (security rules reject, offline, etc). O caller
    // (saveUserProfileToFirestore em store.js) depende de que o promise
    // rejeite para surfaçar "⚠️ Falhou" no toast em vez de "✅ salvou".
    // Erro aqui virava ok=true mentiroso — causa-raiz do bug "o perfil
    // continua não salvando" reportado em v0.16.6 e v0.16.7.
    var toSave = Object.assign({}, profileData);
    if (toSave.displayName) {
      toSave.displayName_lower = String(toSave.displayName).toLowerCase();
    }
    if (toSave.email) {
      toSave.email_lower = String(toSave.email).toLowerCase();
    }
    await this.db.collection('users').doc(uid).set(toSave, { merge: true });
  },

  async loadUserProfile(uid) {
    if (!this.db || !uid) return null;
    try {
      var doc = await this.db.collection('users').doc(uid).get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      window._error('Erro ao carregar perfil:', e);
      return null;
    }
  },

  // Recently-active users (created or updated in the last N days). Used to
  // populate the Explore page with suggestions when the search box is empty —
  // feels better than a "Nenhum usuário encontrado" dead end. Ordered by the
  // most recent signal (`updatedAt` preferred, `createdAt` as a fallback for
  // profiles that never re-saved after signup). Requires a single-field index
  // on `updatedAt desc`, which Firestore provides automatically.
  async listRecentUsers(days, limit) {
    if (!this.db) return [];
    var d = Math.max(1, parseInt(days, 10) || 7);
    var lim = Math.max(1, Math.min(50, parseInt(limit, 10) || 30));
    var cutoff = new Date(Date.now() - d * 24 * 3600 * 1000).toISOString();
    try {
      var results = {};
      var addFromSnap = function(snap) {
        snap.forEach(function(doc) {
          if (results[doc.id]) return;
          var data = doc.data();
          data._docId = doc.id;
          if (data.acceptFriendRequests !== false) results[doc.id] = data;
        });
      };
      // Two parallel queries — some profiles have updatedAt (active users),
      // others only carry createdAt from first login. Union them client-side.
      await Promise.all([
        this.db.collection('users')
          .where('updatedAt', '>=', cutoff)
          .orderBy('updatedAt', 'desc')
          .limit(lim).get().then(addFromSnap).catch(function(e) { window._warn('recent-updatedAt err', e && e.message); }),
        this.db.collection('users')
          .where('createdAt', '>=', cutoff)
          .orderBy('createdAt', 'desc')
          .limit(lim).get().then(addFromSnap).catch(function(e) { window._warn('recent-createdAt err', e && e.message); })
      ]);
      return Object.keys(results).map(function(k) { return results[k]; });
    } catch (e) {
      window._error('Erro ao carregar usuários recentes:', e);
      return [];
    }
  },

  // ---- Explore: list users who accept friend requests ----

  // v2.6.104: nome de exibição único. Retorna o uid de OUTRA conta que já usa
  // este nome (ou null). Consulta exata em displayName_lower (mesmo índice do
  // searchUsers). Ignora contas já mescladas (mergedInto). Fail-open: erro de
  // consulta retorna null (não bloqueia o save por falha técnica).
  async isDisplayNameTaken(name, myUid) {
    if (!name || !this.db) return null;
    var q = String(name).trim().toLowerCase();
    if (!q) return null;
    try {
      var snap = await this.db.collection('users').where('displayName_lower', '==', q).limit(8).get();
      var conflict = null;
      snap.forEach(function (doc) {
        var data = doc.data() || {};
        if (doc.id !== myUid && !data.mergedInto) conflict = doc.id;
      });
      return conflict;
    } catch (e) {
      if (window._warn) window._warn('[isDisplayNameTaken] consulta falhou (fail-open):', e);
      return null;
    }
  },

  // Resolve um NOME DIGITADO → a(s) conta(s) que têm EXATAMENTE esse displayName.
  // IDENTIDADE = uid: usado no enroll/pareamento pra nunca gravar um titular de
  // conta só por nome (a classe de bug que sumiu o Adriano). Nomes são únicos entre
  // uids (resolveUniqueDisplayName), então normalmente 0 ou 1; 2+ é resíduo legado.
  // Ignora contas mescladas (mergedInto) e nomes "não-amigáveis" (dupla "A / B",
  // email, telefone, placeholder) — esses não são nome de pessoa. Retorna:
  //   { status:'none' }                      → sem conta (participante informal)
  //   { status:'unique', uid, profile }      → 1 conta
  //   { status:'ambiguous', candidates:[…] } → 2+ homônimos (perguntar qual)
  // Fail-open: erro de consulta devolve 'none' (grava informal, não bloqueia).
  async resolveNameToAccounts(name) {
    if (!name || !this.db) return { status: 'none' };
    var q = String(name).trim().toLowerCase();
    if (!q || q.indexOf(' / ') !== -1) return { status: 'none' };
    if (typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(name)) return { status: 'none' };
    try {
      var snap = await this.db.collection('users').where('displayName_lower', '==', q).limit(8).get();
      var cands = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        if (d.mergedInto) return;
        cands.push({ uid: doc.id, displayName: d.displayName || name, email: d.email || '', phone: d.phone || '', photoURL: d.photoURL || '' });
      });
      if (cands.length === 0) return { status: 'none' };
      if (cands.length === 1) return { status: 'unique', uid: cands[0].uid, profile: cands[0] };
      return { status: 'ambiguous', candidates: cands };
    } catch (e) {
      if (window._warn) window._warn('[resolveNameToAccounts] fail-open:', e);
      return { status: 'none' };
    }
  },

  // v3.0.82: garante displayName ÚNICO entre UIDs. Dado um nome-base e o meu uid,
  // devolve o próprio nome se livre, ou uma variante ("Nome 2", "Nome 3"…) quando
  // já há OUTRA conta (uid) usando — a regra do dono: dois uids de pessoas
  // diferentes NUNCA podem ter o mesmo nome. Nomes "não-amigáveis"
  // (email/telefone/placeholder) passam intactos: não são nomes de pessoa e não
  // disputam unicidade. Homônimos VIRTUAIS sem uid (Jogador X, informais, ghosts)
  // não estão em `users` → nunca colidem aqui (são permitidos). Usado no PRIMEIRO
  // login pra auto-adotar variante sem bloquear a entrada (o gate do perfil
  // continua pedindo a variante explicitamente quando a pessoa edita o nome).
  // Fail-open: erro de consulta devolve o nome-base.
  async resolveUniqueDisplayName(baseName, myUid) {
    var nm = String(baseName == null ? '' : baseName).trim();
    if (!nm || !this.db) return nm;
    if (typeof window._isUnfriendlyName === 'function' && window._isUnfriendlyName(nm)) return nm;
    try {
      var taken = await this.isDisplayNameTaken(nm, myUid);
      if (!taken) return nm;
      for (var k = 2; k <= 9; k++) {
        var cand = nm + ' ' + k;
        var t2 = await this.isDisplayNameTaken(cand, myUid);
        if (!t2) return cand;
      }
      // Fallback extremo (9 variantes ocupadas): sufixo curto do uid — sempre único.
      return nm + ' ' + String(myUid || '').slice(-4);
    } catch (e) {
      if (window._warn) window._warn('[resolveUniqueDisplayName] fail-open:', e);
      return nm;
    }
  },

  // Search users by name or email prefix. Server-side range queries on the
  // denormalized `displayName_lower` / `email_lower` fields — bounded by
  // the per-query `limit`, not the total user count. Empty query returns
  // []: a blind scan across all users is exactly what we moved away from.
  async searchUsers(queryText, opts) {
    if (!this.db) return [];
    var q = String(queryText || '').trim().toLowerCase();
    if (!q) return [];
    opts = opts || {};
    var perQueryLimit = Math.max(1, Math.min(50, opts.limit || 20));
    var results = {};
    // v1.0.5-beta: PRIVACY — sanitizar resultado de searchUsers pra retornar só
    // campos públicos. Antes retornava o doc inteiro de users/{uid}, expondo
    // phone/phoneCountry/birthDate/gender/preferredCeps/preferredLocations
    // pra qualquer um que rodasse FirestoreDB.searchUsers no console (#explore
    // chama isso pra busca de amigos). Fix em 1 camada client-side; security
    // rules ainda permitem leitura do doc inteiro — fix definitivo em rules
    // fica pra round dedicado com testes.
    var PUBLIC_FIELDS = [
      'displayName', 'displayName_lower',
      'email', 'email_lower',
      'photoURL',
      'acceptFriendRequests',
      'preferredSports',  // útil pra sugestão de parceiros
      'createdAt', 'updatedAt', 'lastSeenAt'
    ];
    var sanitize = function(raw) {
      var out = { _docId: raw._docId };
      for (var i = 0; i < PUBLIC_FIELDS.length; i++) {
        var k = PUBLIC_FIELDS[i];
        if (raw[k] !== undefined) out[k] = raw[k];
      }
      return out;
    };
    var addFromSnap = function(snap) {
      snap.forEach(function(doc) {
        if (results[doc.id]) return;
        var data = doc.data();
        data._docId = doc.id;
        // Default acceptFriendRequests to true (undefined means not set yet)
        if (data.acceptFriendRequests !== false) {
          results[doc.id] = sanitize(data);
        }
      });
    };
    var end = q + '\uf8ff';
    var queries = [
      this.db.collection('users')
        .where('displayName_lower', '>=', q)
        .where('displayName_lower', '<', end)
        .limit(perQueryLimit).get().then(addFromSnap).catch(function(e) {
          window._warn('displayName search error:', e && e.message);
        }),
      this.db.collection('users')
        .where('email_lower', '>=', q)
        .where('email_lower', '<', end)
        .limit(perQueryLimit).get().then(addFromSnap).catch(function(e) {
          window._warn('email search error:', e && e.message);
        })
    ];
    await Promise.all(queries);
    return Object.keys(results).map(function(k) { return results[k]; });
  },

  // Carrega TODOS os usuários que aceitam pedido de amizade (toggle do perfil),
  // sanitizados (só campos públicos). Usado pela busca da página Pessoas para
  // filtrar por SUBSTRING client-side — o searchUsers normal só faz prefix
  // match em displayName_lower (não acha "Vieira" em "Fabiana Vieira").
  // Escala-ok pra base beta (dezenas/centenas). Quando crescer, migrar pra
  // índice de busca dedicado. limit defensivo de 2000.
  async listInvitableUsers() {
    if (!this.db) return [];
    // v4.5.68: cache de sessão (TTL 5min). Abrir #explore fazia um scan de até
    // 2000 docs da coleção `users` TODA VEZ (Sentry: "read spike searchUsers-scan
    // =306 · rota=#explore"). Sem cache, cada reabertura da tela Explorar relia a
    // base inteira. Novos cadastros aparecem no máx 5min depois — trade-off aceito
    // pra lista de convite. Ver memória project_firestore_read_efficiency.
    var _c = window._invitableUsersCache;
    if (_c && (Date.now() - _c.at) < 300000) return _c.data.slice();
    var PUBLIC_FIELDS = [
      'displayName', 'displayName_lower', 'email', 'email_lower',
      'photoURL', 'acceptFriendRequests', 'preferredSports', 'city',
      'createdAt', 'updatedAt', 'lastSeenAt'
    ];
    var out = [];
    try {
      var snap = await this.db.collection('users').limit(2000).get();
      try { if (window._noteFsReads) window._noteFsReads(snap.size, 'searchUsers-scan'); } catch (e) {}
      snap.forEach(function(doc) {
        var data = doc.data();
        if (data.acceptFriendRequests === false) return; // respeita o toggle
        var o = { _docId: doc.id };
        for (var i = 0; i < PUBLIC_FIELDS.length; i++) {
          if (data[PUBLIC_FIELDS[i]] !== undefined) o[PUBLIC_FIELDS[i]] = data[PUBLIC_FIELDS[i]];
        }
        out.push(o);
      });
      window._invitableUsersCache = { at: Date.now(), data: out };
    } catch (e) {
      window._warn('listInvitableUsers err', e && e.message);
    }
    return out.slice();
  },

  // ---- Friend Requests ----

  async sendFriendRequest(fromUid, toUid, fromData) {
    if (!this.db || !fromUid || !toUid) return;
    try {
      // Check if the other person already sent us a request — if so, auto-accept (mutual)
      // We check OUR (fromUid) received list to see if toUid already sent us a request
      var fromDoc = await this.db.collection('users').doc(fromUid).get();
      var fromDocData = fromDoc.exists ? fromDoc.data() : {};
      var receivedList = fromDocData.friendRequestsReceived || [];
      if (receivedList.indexOf(toUid) !== -1) {
        // Mutual request! Auto-accept both directions
        await this.acceptFriendRequest(fromUid, toUid);
        // Notify both
        await this.addNotification(toUid, {
          type: 'friend_accepted',
          fromUid: fromUid,
          fromName: fromData.displayName || '',
          fromPhoto: fromData.photoURL || '',
          fromEmail: fromData.email || '',
          message: (fromData.displayName || 'Alguém') + ' aceitou seu convite e agora é seu amigo(a)!',
          createdAt: new Date().toISOString(),
          read: false
        });
        // Mutual friend request: auto-accepted
        return 'auto-accepted';
      }
      // Normal flow: send request
      // Add to sender's friendRequestsSent + record timestamp in sentAt map
      await this.db.collection('users').doc(fromUid).set({
        friendRequestsSent: firebase.firestore.FieldValue.arrayUnion(toUid)
      }, { merge: true });
      var _sentAtUpdate = {};
      _sentAtUpdate['friendRequestsSentAt.' + toUid] = new Date().toISOString();
      await this.db.collection('users').doc(fromUid).update(_sentAtUpdate);
      // Add to receiver's friendRequestsReceived
      await this.db.collection('users').doc(toUid).set({
        friendRequestsReceived: firebase.firestore.FieldValue.arrayUnion(fromUid)
      }, { merge: true });
      // Create notification for receiver
      await this.addNotification(toUid, {
        type: 'friend_request',
        fromUid: fromUid,
        fromName: fromData.displayName || '',
        fromPhoto: fromData.photoURL || '',
        fromEmail: fromData.email || '',
        message: (fromData.displayName || 'Alguém') + ' quer ser seu amigo(a)!',
        createdAt: new Date().toISOString(),
        read: false
      });
    } catch (e) {
      window._error('Erro ao enviar convite de amizade:', e);
    }
  },

  async acceptFriendRequest(myUid, friendUid) {
    if (!this.db || !myUid || !friendUid) return;
    try {
      // Add each other to friends arrays
      await this.db.collection('users').doc(myUid).set({
        friends: firebase.firestore.FieldValue.arrayUnion(friendUid),
        friendRequestsReceived: firebase.firestore.FieldValue.arrayRemove(friendUid)
      }, { merge: true });
      await this.db.collection('users').doc(friendUid).set({
        friends: firebase.firestore.FieldValue.arrayUnion(myUid),
        friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(myUid)
      }, { merge: true });
      // Trophy hook
      setTimeout(function() {
        if (typeof window._trophyOnFriendAdded === 'function') window._trophyOnFriendAdded();
      }, 500);
    } catch (e) {
      window._error('Erro ao aceitar amizade:', e);
    }
  },

  async removeFriend(myUid, friendUid) {
    if (!this.db || !myUid || !friendUid) return;
    try {
      await this.db.collection('users').doc(myUid).set({
        friends: firebase.firestore.FieldValue.arrayRemove(friendUid)
      }, { merge: true });
      await this.db.collection('users').doc(friendUid).set({
        friends: firebase.firestore.FieldValue.arrayRemove(myUid)
      }, { merge: true });
    } catch (e) {
      window._error('Erro ao remover amizade:', e);
    }
  },

  async cancelFriendRequest(fromUid, toUid) {
    if (!this.db || !fromUid || !toUid) return;
    try {
      await this.db.collection('users').doc(fromUid).set({
        friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(toUid)
      }, { merge: true });
      await this.db.collection('users').doc(toUid).set({
        friendRequestsReceived: firebase.firestore.FieldValue.arrayRemove(fromUid)
      }, { merge: true });
    } catch (e) {
      window._error('Erro ao cancelar convite de amizade:', e);
    }
  },

  async rejectFriendRequest(myUid, friendUid) {
    if (!this.db || !myUid || !friendUid) return;
    try {
      await this.db.collection('users').doc(myUid).set({
        friendRequestsReceived: firebase.firestore.FieldValue.arrayRemove(friendUid)
      }, { merge: true });
      await this.db.collection('users').doc(friendUid).set({
        friendRequestsSent: firebase.firestore.FieldValue.arrayRemove(myUid)
      }, { merge: true });
    } catch (e) {
      window._error('Erro ao rejeitar amizade:', e);
    }
  },

  // ---- Notifications ----

  async addNotification(uid, notifData) {
    if (!this.db || !uid) return;
    try {
      // v1.8.45-beta: ID determinístico em vez de .add() para garantir
      // idempotência no Firestore. Múltiplas chamadas do mesmo evento
      // (race, retry, re-render) produzem o MESMO doc — sem duplicatas.
      // v2.1.15: BUG — a chave (type+tournament+match+dia+uid) era grossa demais:
      // eventos DIFERENTES do mesmo tipo/torneio no mesmo dia colapsavam no MESMO
      // doc, e o 2º .set() virava UPDATE (doc já existe) que a regra só permite
      // pro DONO → quem dispara (organizador) era NEGADO e a notificação sumia.
      // Agora incluímos um hash da mensagem: evento distinto → doc distinto (é
      // CREATE, permitido); duplicata real (mesma mensagem) → mesmo doc (idempotente).
      var _type = String(notifData.type || 'info');
      var _tId  = String(notifData.tournamentId || '');
      var _mId  = String(notifData.matchId || '');
      var _day  = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
      var _msg  = String(notifData.message || '');
      var _msgHash = (function(s){ var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); })(_msg);
      var _raw  = [_type, _tId, _mId, _day, _msgHash, uid].join('|');
      // Converte para ID válido (só alfanumérico + _ + -)
      var _docId = _raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
      // .set() com merge:false sobrescreve silenciosamente doc existente.
      // Notificações não lidas preservam read:false (campo vem no notifData).
      await this.db.collection('users').doc(uid).collection('notifications').doc(_docId).set(notifData);
    } catch (e) {
      window._error('Erro ao criar notificação:', e);
    }
  },

  async getNotifications(uid, limit) {
    if (!this.db || !uid) return [];
    try {
      var query = this.db.collection('users').doc(uid).collection('notifications')
        .orderBy('createdAt', 'desc');
      if (limit) query = query.limit(limit);
      var snap = await query.get();
      var notifs = [];
      snap.forEach(function(doc) {
        var data = doc.data();
        data._id = doc.id;
        notifs.push(data);
      });
      return notifs;
    } catch (e) {
      window._error('Erro ao carregar notificações:', e);
      return [];
    }
  },

  async markNotificationRead(uid, notifId) {
    if (!this.db || !uid || !notifId) return;
    try {
      await this.db.collection('users').doc(uid).collection('notifications').doc(notifId).update({ read: true });
    } catch (e) {
      window._error('Erro ao marcar notificação como lida:', e);
    }
  },

  async getUnreadNotificationCount(uid) {
    if (!this.db || !uid) return 0;
    try {
      var snap = await this.db.collection('users').doc(uid).collection('notifications')
        .where('read', '==', false).get();
      return snap.size;
    } catch (e) {
      return 0;
    }
  },

  // ---- Email Queue (Firebase Extension "Trigger Email from Firestore") ----

  async queueEmail(to, subject, html) {
    if (!this.db || !to) return;
    if (window.SCOREPLACE_ENV === 'staging') { try { window._warn && window._warn('[staging] e-mail suprimido (queueEmail)'); } catch(_e){} return; }
    try {
      var toArr = Array.isArray(to) ? to : [to];
      await this.db.collection('mail').add({
        to: toArr,
        message: { subject: subject || 'scoreplace.app', html: html || '' },
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      window._warn('Erro ao enfileirar email:', e);
    }
  },

  // v2.1.19: e-mails de NOTIFICAÇÃO entram numa fila com janela por importância
  // (5/15/30 min). A Cloud Function flushNotifEmailDigest agrupa por destinatário
  // e manda UM e-mail consolidado por pessoa, evitando excesso de mensagens.
  // E-mails transacionais (verificação) NÃO passam por aqui — vão direto pro mail/.
  async queueNotifEmail(emails, level, message, opts) {
    if (!this.db || !emails || !emails.length) return;
    if (window.SCOREPLACE_ENV === 'staging') { try { window._warn && window._warn('[staging] notif e-mail suprimido (queueNotifEmail)'); } catch(_e){} return; }
    opts = opts || {};
    // v1.4.12 — BACKSTOP DO SANDBOX na ÚLTIMA porta antes do e-mail. O killswitch principal
    // é o _sendUserNotification/_notifyTournamentParticipants; este é a rede embaixo dele
    // (mesmo espírito da supressão de staging acima). Um e-mail de SB que vaza chega em gente
    // que nem sabe que o SB existe. Ver [[project_sandbox_tournament]].
    if (/^\(SB\)/.test(String(opts.tournamentName || '')) || /_sb(\b|$)/.test(String(opts.tournamentUrl || ''))) {
      try { window._warn && window._warn('[sandbox] notif e-mail suprimido (queueNotifEmail)'); } catch (_e) {}
      return;
    }
    var WINDOWS = { fundamental: 5, important: 15, all: 30 }; // minutos
    var mins = (WINDOWS[level] != null) ? WINDOWS[level] : 30;
    var now = Date.now();
    try {
      for (var i = 0; i < emails.length; i++) {
        if (!emails[i]) continue;
        await this.db.collection('notif_email_queue').add({
          email: emails[i],
          level: level || 'all',
          message: message || '',
          tournamentName: opts.tournamentName || '',
          tournamentUrl: opts.tournamentUrl || '',
          ctaLabel: opts.ctaLabel || '',
          ctaUrl: opts.ctaUrl || '',
          createdAt: now,
          flushAtMs: now + mins * 60 * 1000
        });
      }
    } catch (e) {
      window._warn('Erro ao enfileirar notif email:', e);
    }
  },

  // ---- WhatsApp Queue (for future Cloud Function integration) ----

  // v1.2.9: queueWhatsAppTemplate + queueWhatsAppDigest REMOVIDOS. O número foi
  // banido, a apelação negada e o portfólio Meta está morto — não há canal pra
  // onde enfileirar. As coleções whatsapp_queue/whatsapp_digest_queue saíram
  // junto (rules + Cloud Functions). O WhatsApp que sobrou no produto é 100%
  // cliente: link wa.me e grupo criado pelo usuário (js/views/wa-group.js).
  // Ver project_whatsapp_meta_2fa_block.

  // ---- Templates ----

  async saveTemplate(uid, templateData) {
    if (!this.db || !uid) return null;
    try {
      var clean = this._cleanUndefined(templateData);
      var ref = await this.db.collection('users').doc(uid).collection('templates').add(clean);
      return ref.id;
    } catch (e) {
      window._error('Erro ao salvar template:', e);
      return null;
    }
  },

  async getTemplates(uid) {
    if (!this.db || !uid) return [];
    try {
      var snap = await this.db.collection('users').doc(uid).collection('templates').get();
      var templates = [];
      snap.forEach(function(doc) {
        var data = doc.data();
        data._id = doc.id;
        templates.push(data);
      });
      // Sort client-side (newest first) — avoids Firestore index requirement
      templates.sort(function(a, b) {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      return templates;
    } catch (e) {
      window._error('Erro ao carregar templates:', e);
      return [];
    }
  },

  async deleteTemplate(uid, templateId) {
    if (!this.db || !uid || !templateId) return;
    try {
      await this.db.collection('users').doc(uid).collection('templates').doc(templateId).delete();
    } catch (e) {
      window._error('Erro ao excluir template:', e);
    }
  },

  // ---- Casual Matches ----

  async saveCasualMatch(matchData) {
    if (!this.db) return null;
    try {
      var clean = this._cleanUndefined(matchData);
      var ref = await this.db.collection('casualMatches').add(clean);
      return ref.id;
    } catch (e) {
      window._error('Erro ao salvar partida casual:', e);
      return null;
    }
  },

  async loadCasualMatch(roomCode) {
    if (!this.db || !roomCode) return null;
    try {
      var snap = await this.db.collection('casualMatches')
        .where('roomCode', '==', roomCode).limit(1).get();
      if (snap.empty) return null;
      var doc = snap.docs[0];
      var data = doc.data();
      data._docId = doc.id;
      return data;
    } catch (e) {
      window._error('Erro ao carregar partida casual:', e);
      return null;
    }
  },

  // v1.3.32-beta: últimas N partidas casuais FINALIZADAS em que o user
  // participou (createdBy ou está em participants[].uid). Pra alimentar
  // a sessão "Últimas três partidas" no setup da partida casual.
  // Combina 2 queries (createdBy + participants array-contains-any) e
  // dedupa por _docId. Sem orderBy server-side pra evitar exigência de
  // índice composto — sort client-side por createdAt desc.
  async loadRecentCasualMatchesForUser(uid, limit) {
    if (!this.db || !uid) return [];
    var n = limit || 3;
    var out = {};
    try {
      // Query 1: matches que o user CRIOU.
      // Single-field query (sem composite index) — status filtrado client-side.
      // v1.6.65-beta: limit 30→200 — sem orderBy server-side, Firestore retorna
      // docs em ordem ascendente de doc-ID (≈ mais antigos primeiro). Com limit(30)
      // partidas recentes ficavam além do slice e nunca apareciam no histórico.
      // 200 cobre qualquer usuário beta confortavelmente; sort client-side por
      // createdAt desc já existia e continua sendo a fonte da ordenação final.
      var createdSnap = await this.db.collection('casualMatches')
        .where('createdBy', '==', uid)
        .limit(200).get();
      createdSnap.forEach(function(d) {
        var data = d.data();
        // v1.8.5-beta: também incluir docs com result.winner mesmo que
        // status não seja 'finished' (save pode ter falhado na transição).
        if (data.status !== 'finished' && !(data.result && data.result.winner)) return;
        data._docId = d.id;
        out[d.id] = data;
      });
    } catch (e) {
      window._warn('loadRecentCasualMatchesForUser createdBy err:', e);
    }

    // Query 2: array-contains em playerUids (denormalizado em
    // saveCasualMatch + joinCasualMatch — array de uids puros).
    // Single-field query (sem composite index) — status filtrado client-side.
    try {
      var partSnap = await this.db.collection('casualMatches')
        .where('playerUids', 'array-contains', uid)
        .limit(200).get();
      partSnap.forEach(function(d) {
        if (out[d.id]) return; // dedup
        var data = d.data();
        // v1.8.5-beta: idem — incluir docs com result.winner mesmo sem status:'finished'
        if (data.status !== 'finished' && !(data.result && data.result.winner)) return;
        data._docId = d.id;
        out[d.id] = data;
      });
    } catch (e) {
      window._warn('loadRecentCasualMatchesForUser participants err:', e);
    }

    // Sort client-side by finishedAt desc (fallback: createdAt), take N most recent.
    // v1.7.6-beta: ISO strings converted to ms before subtraction (NaN-safe).
    // v1.8.5-beta: prefer finishedAt over createdAt — "most recently finished"
    // is more intuitive than "most recently created" for last-played ordering.
    var arr = Object.keys(out).map(function(k) { return out[k]; });
    arr.sort(function(a, b) {
      var ta = a.finishedAt || a.createdAt || a._ts || 0;
      var tb = b.finishedAt || b.createdAt || b._ts || 0;
      if (ta && typeof ta.toMillis === 'function') ta = ta.toMillis();
      else if (ta && typeof ta === 'string') ta = new Date(ta).getTime() || 0;
      if (tb && typeof tb.toMillis === 'function') tb = tb.toMillis();
      else if (tb && typeof tb === 'string') tb = new Date(tb).getTime() || 0;
      return tb - ta;
    });
    return arr.slice(0, n);
  },

  async updateCasualMatch(docId, updates) {
    if (!this.db || !docId) return;
    try {
      var clean = this._cleanUndefined(updates);
      await this.db.collection('casualMatches').doc(docId).update(clean);
    } catch (e) {
      window._error('Erro ao atualizar partida casual:', e);
    }
  },

  async claimCasualSlot(docId, slotIndex, uid, displayName) {
    if (!this.db || !docId) return false;
    try {
      var docRef = this.db.collection('casualMatches').doc(docId);
      var self = this;
      return this.db.runTransaction(async function(transaction) {
        var doc = await transaction.get(docRef);
        if (!doc.exists) return false;
        var data = doc.data();
        var players = Array.isArray(data.players) ? data.players.slice() : [];
        if (slotIndex < 0 || slotIndex >= players.length) return false;
        if (players[slotIndex].uid) return false; // Already claimed
        // Check user hasn't already claimed another slot
        var alreadyClaimed = players.some(function(p) { return p.uid === uid; });
        if (alreadyClaimed) return false;
        players[slotIndex] = Object.assign({}, players[slotIndex], { uid: uid, displayName: displayName });
        // v1.9.61: mantém playerUids em sincronia. Antes claimCasualSlot só
        // mexia em players → o uid não entrava em playerUids, quebrando o
        // auto-dissolve (sala morria com gente dentro) e o histórico durante a
        // fase ativa (a query de "últimas partidas" filtra por playerUids).
        var playerUids = Array.isArray(data.playerUids) ? data.playerUids.slice() : [];
        if (playerUids.indexOf(uid) === -1) playerUids.push(uid);
        transaction.update(docRef, { players: players, playerUids: playerUids });
        return true;
      });
    } catch (e) {
      window._error('Erro ao reservar vaga casual:', e);
      return false;
    }
  },

  // Join a casual match — add user to participants list (idempotent)
  // Join a casual match — add user to participants list (idempotent)
  async joinCasualMatch(docId, uid, displayName, photoURL) {
    if (!this.db || !docId || !uid) return false;
    try {
      var docRef = this.db.collection('casualMatches').doc(docId);
      return this.db.runTransaction(async function(transaction) {
        var doc = await transaction.get(docRef);
        if (!doc.exists) return false;
        var data = doc.data();
        var participants = Array.isArray(data.participants) ? data.participants.slice() : [];
        var playerUids = Array.isArray(data.playerUids) ? data.playerUids.slice() : [];
        // Already joined?
        if (playerUids.indexOf(uid) !== -1) return true;
        participants.push({ uid: uid, displayName: displayName || '', photoURL: photoURL || '', joinedAt: new Date().toISOString() });
        playerUids.push(uid);
        transaction.update(docRef, { participants: participants, playerUids: playerUids });
        return true;
      });
    } catch (e) {
      window._error('Erro ao entrar na partida casual:', e);
      return false;
    }
  },

  // Cancel a casual match — delete the document so lingering participants are kicked out.
  // Called when the organizer closes the setup overlay before the match starts.
  async cancelCasualMatch(docId) {
    if (!this.db || !docId) return false;
    try {
      // v1.9.61: NUNCA apagar um registro finalizado. Bug: após "Jogar
      // Novamente" (keepSession), _sessionDocId aponta pro doc finished; se o
      // usuário sai do setup sem iniciar nova partida, o caminho "solo" do
      // _casualLeaveMatch chamava cancelCasualMatch(_sessionDocId) e DELETAVA a
      // última partida do histórico. Finished = registro permanente.
      var ref = this.db.collection('casualMatches').doc(docId);
      var snap = await ref.get();
      if (snap.exists && snap.data() && snap.data().status === 'finished') {
        window._warn('cancelCasualMatch: ignorando delete de partida finalizada', docId);
        return false;
      }
      await ref.delete();
      return true;
    } catch (e) {
      window._error('Erro ao cancelar partida casual:', e);
      return false;
    }
  },

  // Leave a casual match — remove user from participants, playerUids and release any claimed slot
  async leaveCasualMatch(docId, uid) {
    if (!this.db || !docId || !uid) return false;
    try {
      var docRef = this.db.collection('casualMatches').doc(docId);
      return this.db.runTransaction(async function(transaction) {
        var doc = await transaction.get(docRef);
        if (!doc.exists) return false;
        var data = doc.data();
        var participants = Array.isArray(data.participants) ? data.participants.slice() : [];
        var playerUids = Array.isArray(data.playerUids) ? data.playerUids.slice() : [];
        var players = Array.isArray(data.players) ? data.players.slice() : [];
        participants = participants.filter(function(p) { return p.uid !== uid; });
        playerUids = playerUids.filter(function(u) { return u !== uid; });
        // Release any slot this user had claimed so another player can take it
        // v1.6.25-beta: também apaga `name` e `team` — antes só removia
        // uid/displayName/photoURL, então `name` ficava como "Rodrigo" no
        // slot mesmo após o user sair. Outros clientes faziam polling, viam
        // o name persistido e mantinham "Rodrigo" no input do slot.
        // Agora o slot fica TOTALMENTE livre quando o user sai.
        players = players.map(function(p) {
          if (p && p.uid === uid) {
            // Preserva apenas `slot` — todo o resto vira default (slot livre)
            return { slot: p.slot };
          }
          return p;
        });
        // Auto-dissolução (v1.9.60): a sala vive enquanto houver ≥1 usuário
        // CADASTRADO (uid) — não importa se é o criador ou não. Quando o último
        // uid sai (sobram só nomes digitados sem conta, ou ninguém), a sala se
        // dissolve. Registros finalizados (status=finished) nunca são apagados
        // aqui (são histórico). Regra do dono: "enquanto houver 1 cadastrado a
        // sala persiste; quando todos sairem, é dissolvida".
        // v1.9.61: conta uids de AMBAS as fontes (playerUids ∪ players[].uid) —
        // docs legados podem ter uid só em players (claim-slot não populava
        // playerUids), e dissolver só por playerUids mataria sala com gente.
        // v2.1.76: a sala vive enquanto houver ≥1 PESSOA DE VERDADE no lobby —
        // um slot OCUPADO (players[].uid). Antes contava também `playerUids`, que
        // dessincroniza (sala-fantasma com players=[] mas playerUids=[uid] ficava
        // viva pra sempre). Agora dissolve assim que o último slot ocupado some.
        var _hasOccupant = players.some(function(p) { return p && p.uid; });
        if (!_hasOccupant && data.status !== 'finished') {
          transaction.delete(docRef);
          return 'dissolved';
        }
        transaction.update(docRef, { participants: participants, playerUids: playerUids, players: players });
        return true;
      });
    } catch (e) {
      window._error('Erro ao sair da partida casual:', e);
      return false;
    }
  },

  async loadUserCasualMatches(uid) {
    if (!this.db || !uid) return [];
    try {
      var snap = await this.db.collection('casualMatches')
        .where('playerUids', 'array-contains', uid)
        .where('status', '==', 'finished')
        .get();
      var matches = [];
      snap.forEach(function(doc) {
        var data = doc.data();
        data._docId = doc.id;
        matches.push(data);
      });
      matches.sort(function(a, b) {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      return matches;
    } catch (e) {
      window._error('Erro ao carregar partidas casuais:', e);
      return [];
    }
  },

  // ── User match history (persistent per-user stats across casual + tournament) ──
  // Writes one copy of the match record into each registered player's profile
  // subcollection so the record survives deletion of the original tournament
  // or casual match document.
  async saveUserMatchRecords(record) {
    if (!this.db || !record || !Array.isArray(record.players)) return false;
    var self = this;
    var clean = self._cleanUndefined(record);
    var recordId = clean.matchId || ('m_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    clean.matchId = recordId;
    var writers = [];
    for (var i = 0; i < clean.players.length; i++) {
      (function(p) {
        if (!p || !p.uid) return;
        writers.push((async function() {
          try {
            await self.db.collection('users').doc(p.uid)
              .collection('matchHistory').doc(recordId)
              .set(clean, { merge: true });
          } catch (e) { window._warn('saveUserMatchRecords for', p.uid, 'failed', e); }
        })());
      })(clean.players[i]);
    }
    try { await Promise.all(writers); return true; } catch (e) { return false; }
  },

  async loadUserMatchHistory(uid, options) {
    if (!this.db || !uid) return [];
    options = options || {};
    try {
      var q = this.db.collection('users').doc(uid).collection('matchHistory');
      if (options.matchType) q = q.where('matchType', '==', options.matchType);
      q = q.orderBy('finishedAt', 'desc');
      if (options.limit) q = q.limit(options.limit);
      var snap = await q.get();
      var out = [];
      snap.forEach(function(doc) {
        var d = doc.data();
        d._id = doc.id;
        out.push(d);
      });
      return out;
    } catch (e) {
      window._error('Erro ao carregar histórico de partidas:', e);
      return [];
    }
  }
};
