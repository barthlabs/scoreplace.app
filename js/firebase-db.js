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
      // tudo). synchronizeTabs cobre múltiplas abas. .catch degrada gracioso: navegador
      // sem suporte / aba privada / persistência já ativa → app segue sem a fila durável.
      try {
        this.db.enablePersistence({ synchronizeTabs: true }).then(function () {
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
  _cleanUndefined(obj) {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      return obj.map(function(item) { return window.FirestoreDB._cleanUndefined(item); });
    }
    if (typeof obj === 'object' && obj.constructor === Object) {
      var cleaned = {};
      Object.keys(obj).forEach(function(key) {
        if (obj[key] === undefined) return;
        // Firestore rejeita keys com padrão `__xxx__` em qualquer field nested.
        if (typeof key === 'string' && key.length >= 4 && key.indexOf('__') === 0 && key.lastIndexOf('__') === key.length - 2) {
          return;
        }
        cleaned[key] = window.FirestoreDB._cleanUndefined(obj[key]);
      });
      return cleaned;
    }
    return obj;
  },

  // ---- Tournaments ----

  // Denormalized field `memberEmails[]` holds every email that has a
  // relationship with the tournament (creator + organizer + active co-hosts +
  // participants). A single `array-contains` query against this field
  // replaces the current pattern of loading the entire collection at login
  // and filtering client-side. Kept in sync on every write path below.
  _computeMemberEmails(data) {
    if (!data) return [];
    var set = {};
    var push = function(e) {
      if (!e || typeof e !== 'string') return;
      var norm = e.trim().toLowerCase();
      if (norm) set[norm] = true;
    };
    push(data.creatorEmail);
    push(data.organizerEmail);
    if (Array.isArray(data.coHosts)) {
      data.coHosts.forEach(function(ch) {
        if (ch && ch.status === 'active') push(ch.email);
      });
    }
    var parts = Array.isArray(data.participants) ? data.participants : [];
    // v1.8.65: também considerar linkedEmails de cada participante
    // (carregados do perfil do usuário se disponíveis)
    parts.forEach(function(p) {
      if (!p) return;
      if (typeof p === 'string') {
        // Name-only or team string ("Ana / Bruno") — no email to extract.
        // A bare string that happens to be an email is rare but handled.
        if (p.indexOf('@') > 0 && p.indexOf(' / ') === -1) push(p);
        return;
      }
      push(p.email);
      if (Array.isArray(p.participants)) {
        p.participants.forEach(function(sub) { if (sub) push(sub.email); });
      }
    });
    return Object.keys(set);
  },

  // Subset of memberEmails restricted to organizer-level principals —
  // creator, current organizer, active co-hosts. Used by Firestore rules to
  // authorize full-edit and delete operations in O(1). Participants never
  // appear here; only admins.
  _computeAdminEmails(data) {
    if (!data) return [];
    var set = {};
    var push = function(e) {
      if (!e || typeof e !== 'string') return;
      var norm = e.trim().toLowerCase();
      if (norm) set[norm] = true;
    };
    push(data.creatorEmail);
    push(data.organizerEmail);
    if (Array.isArray(data.coHosts)) {
      data.coHosts.forEach(function(ch) {
        if (ch && ch.status === 'active') push(ch.email);
      });
    }
    return Object.keys(set);
  },

  // v2.8.79: adminUids[] — UIDs dos principais de nível organizador (criador +
  // co-hosts ativos). Espelho uid de adminEmails. Necessário porque co-host
  // pode ter email '' (conta por telefone) → as regras precisam autorizar
  // edição/escrita por UID, não por email. Recomputa a cada save (encolhe
  // quando um co-host é removido — diferente de memberUids que nunca encolhe).
  _computeAdminUids(data) {
    if (!data) return [];
    var set = {};
    var push = function(u) { if (u && typeof u === 'string' && u.length >= 4) set[u] = true; };
    push(data.creatorUid);
    if (Array.isArray(data.coHosts)) {
      data.coHosts.forEach(function(ch) { if (ch && ch.status === 'active') push(ch.uid); });
    }
    return Object.keys(set);
  },

  // v1.8.62: memberUids[] — UIDs de todos os participantes + organizador.
  // Permite que usuários phone-only (sem email) sejam identificados nas
  // regras do Firestore, onde authEmail() retorna '' para esses usuários.
  _computeMemberUids(data) {
    if (!data) return [];
    var set = {};
    var push = function(u) {
      if (!u || typeof u !== 'string' || u.length < 4) return;
      set[u] = true;
    };
    push(data.creatorUid);
    if (Array.isArray(data.coHosts)) {
      data.coHosts.forEach(function(ch) { if (ch && ch.status === 'active') push(ch.uid); });
    }
    var parts = Array.isArray(data.participants) ? data.participants : [];
    parts.forEach(function(p) {
      if (!p || typeof p === 'string') return;
      push(p.uid);
      // Dupla formada: p1Uid e p2Uid
      push(p.p1Uid); push(p.p2Uid);
      if (Array.isArray(p.participants)) {
        p.participants.forEach(function(sub) { if (sub) push(sub.uid); });
      }
    });
    return Object.keys(set);
  },

  async saveTournament(tourData, options) {
    if (!this.db) return;
    var docId = String(tourData.id);
    var cleanData = this._cleanUndefined(tourData);
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
      // v1.8.96: nunca encolher memberEmails — merge com o que já existia
      // em memória para não perder emails de participantes que têm uid mas
      // não têm email no objeto participante (ex: duplas formadas por drag).
      var _newEmails  = this._computeMemberEmails(cleanData);
      var _prevEmails = Array.isArray(tourData.memberEmails) ? tourData.memberEmails : [];
      var _mergedEmails = Array.from(new Set(_prevEmails.concat(_newEmails)));
      cleanData.memberEmails = _mergedEmails;
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
      var _newUids  = this._computeMemberUids(cleanData);
      var _prevUids = Array.isArray(tourData.memberUids) ? tourData.memberUids : [];
      cleanData.memberUids = Array.from(new Set(_prevUids.concat(_newUids)));
    }
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
  },

  // Atomic enrollment — uses Firestore transaction to prevent race conditions
  // where concurrent enrollments overwrite each other's participants array
  async enrollParticipant(tournamentId, participantObj, extraUpdates) {
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
      var updateData = {
        participants: participants,
        memberEmails: self._computeMemberEmails(_enrollData),
        memberUids:   self._computeMemberUids(_enrollData)
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
  async deenrollParticipant(tournamentId, userEmail, userDisplayName, userUid) {
    if (!this.db) throw new Error('Firestore not initialized');
    var docRef = this.db.collection('tournaments').doc(String(tournamentId));
    var self = this;
    return this.db.runTransaction(async function(transaction) {
      var doc = await transaction.get(docRef);
      if (!doc.exists) throw new Error('Tournament not found');
      var data = doc.data();
      var participants = Array.isArray(data.participants) ? data.participants : (data.participants ? Object.values(data.participants) : []);

      var _emailLc = userEmail ? String(userEmail).toLowerCase() : '';
      var newParticipants = participants.filter(function(p) {
        if (typeof p === 'string') {
          if (p.indexOf(' / ') !== -1) return true; // keep teams (string legada "A / B")
          return p !== userEmail && p !== userDisplayName;
        }
        // v3.0.x: IDENTIDADE POR SLOT, uid-first — espelha enrollParticipant.
        // A dupla formada por aceite grava p1Uid/p2Uid/p1Name/p2Name com
        // displayName = SÓ o p1 (ex.: "Kelly Barth", sem "/"). Sem checar os
        // slots aqui, o p2 (ex.: Rodrigo) clicava "Desinscrever-se" e NADA
        // acontecia (filtro nunca casava → notFound). Remove a dupla inteira
        // quando qualquer slot bate — a dupla não joga com uma pessoa só.
        if (userUid && ((p.uid && p.uid === userUid) || (p.p1Uid && p.p1Uid === userUid) || (p.p2Uid && p.p2Uid === userUid))) return false;
        if (_emailLc) {
          if (p.email && String(p.email).toLowerCase() === _emailLc) return false;
          if (p.p1Email && String(p.p1Email).toLowerCase() === _emailLc) return false;
          if (p.p2Email && String(p.p2Email).toLowerCase() === _emailLc) return false;
        }
        // Nome como ÚLTIMO fallback (conta legada/sem uid).
        if (userDisplayName) {
          if (p.displayName && p.displayName === userDisplayName) return false;
          if (p.name && p.name === userDisplayName) return false;
          if (p.p1Name && p.p1Name === userDisplayName) return false;
          if (p.p2Name && p.p2Name === userDisplayName) return false;
        }
        return true;
      });

      if (newParticipants.length === participants.length) {
        return { notFound: true, participants: participants };
      }

      var _deenrollData = Object.assign({}, data, { participants: newParticipants });
      transaction.update(docRef, {
        participants: newParticipants,
        memberEmails: self._computeMemberEmails(_deenrollData),
        memberUids:   self._computeMemberUids(_deenrollData)
      });
      return { notFound: false, participants: newParticipants };
    });
  },

  async deleteTournament(tournamentId) {
    if (!this.db) return;
    try {
      await this.db.collection('tournaments').doc(String(tournamentId)).delete();
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
  async loadMyTournaments(email) {
    if (!this.db || !email) return [];
    var norm = String(email).trim().toLowerCase();
    if (!norm) return [];
    try {
      var snap = await this.db.collection('tournaments')
        .where('memberEmails', 'array-contains', norm)
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
      return doc.exists ? doc.data() : null;
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
    } catch (e) {
      window._warn('listInvitableUsers err', e && e.message);
    }
    return out;
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
    var WINDOWS = { fundamental: 5, important: 15, all: 30 }; // minutos
    var mins = (WINDOWS[level] != null) ? WINDOWS[level] : 30;
    var now = Date.now();
    opts = opts || {};
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

  async queueWhatsApp(phones, message) {
    if (!this.db || !phones || !phones.length) return;
    if (window.SCOREPLACE_ENV === 'staging') { try { window._warn && window._warn('[staging] WhatsApp suprimido (queueWhatsApp)'); } catch(_e){} return; }
    try {
      await this.db.collection('whatsapp_queue').add({
        phones: phones,
        message: message || '',
        createdAt: new Date().toISOString(),
        status: 'pending'
      });
    } catch (e) {
      window._warn('Erro ao enfileirar WhatsApp:', e);
    }
  },

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
