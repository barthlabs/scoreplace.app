// tournaments-enrollment.js — Enrollment/deenrollment system (extracted from tournaments.js)

(function() {
var _t = window._t || function(k) { return k; };

// ── Eligibility helpers ──────────────────────────────────────────────────────

// Parse "DD/MM/AAAA" birthDate → age in years (or null)
function _calcAgeFromBirthDate(birthDate) {
    if (!birthDate) return null;
    var parts = String(birthDate).split('/');
    if (parts.length !== 3) return null;
    var day = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year) || year < 1900) return null;
    var today = new Date();
    var age = today.getFullYear() - year;
    if (today.getMonth() < month || (today.getMonth() === month && today.getDate() < day)) age--;
    return age;
}

// Returns { ok: true } or { ok: false, title, msg }
function _checkEnrollmentEligibility(t, user) {
    var MISTO = ['Misto Obrig.', 'Misto Aleat.'];
    var genderCats = t.genderCategories || [];

    // ── Gender gate ──────────────────────────────────────────────────────────
    // Only applies when ALL defined gender categories are of a single gender
    // (no Misto, no opposite gender mixed in).
    if (genderCats.length > 0) {
        var hasMisto = genderCats.some(function(g) { return MISTO.indexOf(g) !== -1; });
        if (!hasMisto) {
            var hasFem  = genderCats.indexOf('Feminino') !== -1;
            var hasMasc = genderCats.indexOf('Masculino') !== -1;
            if (hasFem && !hasMasc) {
                // Torneio feminino exclusivo
                if (user.gender !== 'feminino') {
                    return {
                        ok: false,
                        title: 'Torneio feminino exclusivo',
                        msg: 'Este torneio aceita apenas participantes do gênero feminino. ' +
                             (!user.gender
                                 ? 'Seu perfil não possui gênero definido. Atualize seu perfil para se inscrever.'
                                 : 'Seu gênero cadastrado não permite inscrição neste torneio.')
                    };
                }
            } else if (hasMasc && !hasFem) {
                // Torneio masculino exclusivo
                if (user.gender !== 'masculino') {
                    return {
                        ok: false,
                        title: 'Torneio masculino exclusivo',
                        msg: 'Este torneio aceita apenas participantes do gênero masculino. ' +
                             (!user.gender
                                 ? 'Seu perfil não possui gênero definido. Atualize seu perfil para se inscrever.'
                                 : 'Seu gênero cadastrado não permite inscrição neste torneio.')
                    };
                }
            }
        }
    }

    // ── Age gate ─────────────────────────────────────────────────────────────
    // Applies when the tournament has ageCategories defined (e.g. ["50+", "60+"]).
    // The minimum requirement = lowest age bracket. Multiple brackets mean
    // the user only needs to reach the lowest one.
    var ageCats = t.ageCategories || [];
    if (ageCats.length > 0) {
        var minAge = Math.min.apply(null, ageCats.map(function(a) {
            return parseInt(String(a), 10) || 999;
        }));
        if (!user.birthDate) {
            return {
                ok: false,
                title: 'Faixa etária necessária',
                msg: 'Este torneio é para participantes com ' + minAge + ' anos ou mais. ' +
                     'Adicione sua data de nascimento no perfil para continuar.'
            };
        }
        var userAge = _calcAgeFromBirthDate(user.birthDate);
        if (userAge === null || userAge < minAge) {
            return {
                ok: false,
                title: 'Faixa etária não atingida',
                msg: 'Este torneio exige ' + minAge + ' anos ou mais. ' +
                     (userAge !== null
                         ? 'Sua idade cadastrada (' + userAge + ' anos) não atende este requisito.'
                         : 'Não foi possível calcular sua idade a partir da data cadastrada.')
            };
        }
    }

    return { ok: true };
}

// Helper: check if late enrollment to standby is allowed
function _allowsLateEnrollment(t) {
  var le = t.lateEnrollment || 'closed';
  return le === 'standby' || le === 'expand';
}

// Helper: add participant to standby/waitlist instead of main roster
function _enrollToStandby(t, tId, participantObj, callback) {
  if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
  var getName = function(p) { return window._pName(p); };
  var newName = getName(participantObj);
  // Check if already in standby
  var already = t.standbyParticipants.some(function(sp) { return getName(sp) === newName; });
  if (already) {
    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.alreadyWaitlisted'), _t('enroll.alreadyWaitlistedMsg', { name: newName }), 'info');
    return;
  }
  // Check if already enrolled
  var partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  var alreadyEnrolled = partsArr.some(function(p) { return getName(p) === newName; });
  if (alreadyEnrolled) {
    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.alreadyEnrolled'), _t('enroll.alreadyEnrolledSingle', { name: newName }), 'info');
    return;
  }
  t.standbyParticipants.push(participantObj);
  window.FirestoreDB.saveTournament(t);
  var modeLabel = (t.lateEnrollment === 'expand') ? _t('enroll.modeExpand') : _t('enroll.modeStandby');
  if (typeof showNotification !== 'undefined') showNotification(_t('enroll.waitlistedTitle'), _t('enroll.waitlistedMsg', { name: newName, mode: modeLabel }), 'success');
  if (callback) callback();
}

window.enrollCurrentUser = function (tId) {
    // Busca no scoped list primeiro; se não achar, tenta no discovery feed
    // (torneios públicos que o usuário ainda não entrou). Torneios do
    // discovery vivem em AppStore.publicDiscovery até o usuário se inscrever;
    // antes desta hidratação a chamada falhava silenciosamente pra eles.
    let t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t && Array.isArray(window.AppStore.publicDiscovery)) {
      const fromDiscovery = window.AppStore.publicDiscovery.find(tour => String(tour.id) === String(tId));
      if (fromDiscovery) {
        window.AppStore.tournaments.push(fromDiscovery);
        t = fromDiscovery;
      }
    }
    // LGPD: identidade verificada contra Firebase Auth
    const user = (typeof window._verifiedCurrentUser === 'function') ? window._verifiedCurrentUser() : window.AppStore.currentUser;
    if (!user) {
        // Save pending enrollment and trigger login
        try { sessionStorage.setItem('_pendingEnrollTournamentId', String(tId)); } catch(e) {}
        window._pendingEnrollTournamentId = String(tId);
        window._pendingInviteHash = '#tournaments/' + tId;
        // Preserve ref (who invited) — from hash or sessionStorage
        try {
            var _hash = window.location.hash || '';
            var _rm = _hash.match(/[?&]ref=([^&]+)/);
            if (_rm) sessionStorage.setItem('_inviteRefUid', decodeURIComponent(_rm[1]));
        } catch(e) {}
        // Open login modal with all options (Google, Apple, Facebook, email/password)
        if (typeof openModal === 'function') {
            openModal('modal-login');
        }
        return;
    }
    if (t) {
        // v1.3.24-beta: GUARD — não inscrever sem uid. Se chegou aqui sem
        // uid, é race condition de login (currentUser populado parcialmente)
        // ou sessão corrompida. Inscrever mesmo assim cria registro "fantasma"
        // que não consegue ser categorizado depois (perfil não vincula).
        // Bug reportado por dono do app vendo 6 de 8 inscritos sem perfil
        // vinculado num torneio onde sabia que todos tinham conta scoreplace.
        if (!user.uid) {
            if (typeof showNotification !== 'undefined') showNotification('Sessão sem identificador', 'Faça logout e entre novamente antes de se inscrever.', 'error');
            if (typeof window._captureException === 'function') {
                window._captureException(new Error('Enrollment attempted with empty uid'), {
                    area: 'enrollCurrentUser',
                    tournamentId: tId,
                    hasDisplayName: !!user.displayName,
                    hasEmail: !!user.email,
                });
            }
            return;
        }
        // Verifica elegibilidade por gênero e faixa etária antes de qualquer outra coisa.
        // Organizado cobre todas as rotas (inscrição direta, lista de espera, Liga aberta).
        var _elig = _checkEnrollmentEligibility(t, user);
        if (!_elig.ok) {
            showAlertDialog(_elig.title, _elig.msg, null, { type: 'warning' });
            return;
        }

        // Verifica se as inscrições estão realmente abertas
        if (t.status === 'finished') {
            showAlertDialog(_t('enroll.tournamentFinished'), _t('enroll.tournamentFinishedMsg'), null, { type: 'warning' });
            return;
        }
        const sorteioRealizado = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
        const ligaAberta = window._isLigaFormat(t) && t.ligaOpenEnrollment !== false && sorteioRealizado;
        const inscricoesAbertas = (t.status !== 'closed' && !sorteioRealizado) || ligaAberta;
        if (!inscricoesAbertas) {
            if (_allowsLateEnrollment(t) && t.status !== 'finished') {
                // Late enrollment — send to standby
                var participantObj = { name: user.displayName, email: user.email, displayName: user.displayName, uid: user.uid, ligaActive: true };
                _enrollToStandby(t, tId, participantObj, function() {
                    const container = document.getElementById('view-container');
                    if (container && typeof renderTournaments === 'function') renderTournaments(container, tId);
                });
                return;
            }
            showAlertDialog(_t('enroll.enrollClosed'), _t('enroll.enrollClosedMsg'), null, { type: 'warning' });
            return;
        }
        if (t.enrollmentMode === 'time' && parseInt(t.teamSize || 2) > 1) {
            // Duplas: inscreve como individual — a dupla é formada pela
            // seção "Sem Dupla" no torneio (arrastar e soltar).
            if (parseInt(t.teamSize || 2) === 2) {
                window._doEnrollCurrentUser(tId, null);
                return;
            }
            // Times > 2 pessoas: mantém modal original
            const mod = document.getElementById('team-enroll-modal-' + tId);
            if (mod) mod.style.display = 'flex';
            return;
        }

        // Check if tournament has categories — resolve before enrolling
        var hasCats = (t.combinedCategories && t.combinedCategories.length > 0) ||
                      (t.genderCategories && t.genderCategories.length > 0) ||
                      (t.skillCategories && t.skillCategories.length > 0);
        if (hasCats) {
            window._resolveEnrollmentCategory(tId, function(selectedCategories) {
                if (!selectedCategories) return; // user cancelled
                window._doEnrollCurrentUser(tId, selectedCategories);
            });
            return;
        }

        // No categories — enroll directly
        window._doEnrollCurrentUser(tId, null);
    }
};

// Internal: performs actual enrollment with optional category and post-enroll callback
window._doEnrollCurrentUser = function(tId, selectedCategories, _onSuccess) {
    // Mesma hidratação defensiva: se o torneio veio direto do discovery feed
    // (dashboard clicou "Inscrever" num card público), precisa estar em
    // tournaments pro push otimista de participants funcionar.
    let t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t && Array.isArray(window.AppStore.publicDiscovery)) {
      const fromDiscovery = window.AppStore.publicDiscovery.find(tour => String(tour.id) === String(tId));
      if (fromDiscovery) {
        window.AppStore.tournaments.push(fromDiscovery);
        t = fromDiscovery;
      }
    }
    // LGPD: usar identidade verificada contra Firebase Auth, nunca AppStore diretamente.
    const user = (typeof window._verifiedCurrentUser === 'function')
      ? window._verifiedCurrentUser()
      : window.AppStore.currentUser;
    if (!t || !user || !user.uid) return;

    // Normalize selectedCategories: accept string, array, or null
    var catsArr = null;
    if (Array.isArray(selectedCategories) && selectedCategories.length > 0) {
        catsArr = selectedCategories;
    } else if (typeof selectedCategories === 'string' && selectedCategories) {
        catsArr = [selectedCategories];
    }

    // v1.8.20-beta: usuários phone-only têm displayName=null e email=null.
    // Telefone guardado como dígitos puros (sem +55, sem máscara) — ex: 11916936454.
    // _pNameDisplay() em store.js aplica a máscara (11) XXXXX-XXXX ao exibir.
    // v1.8.20-beta: para phone-only auth, formata "+55 (DDD) XXXXX-XXXX" como nome.
    // O DDI é obrigatório tanto no BD quanto na exibição.
    function _fmtPhone(ph) {
      if (!ph) return '';
      var d = String(ph).replace(/\D/g, '');
      if (d.length > 11 && d.substring(0, 2) === '55') d = d.substring(2);
      if (d.length > 11) d = d.substring(d.length - 11);
      if (d.length === 11) return '+55 (' + d.substring(0,2) + ') ' + d.substring(2,7) + '-' + d.substring(7);
      if (d.length === 10) return '+55 (' + d.substring(0,2) + ') ' + d.substring(2,6) + '-' + d.substring(6);
      return ph;
    }
    var _phoneFormatted = user.phone ? _fmtPhone(user.phone) : '';
    var _dispName = user.displayName || _phoneFormatted || null;
    // Somente persiste email se ele realmente pertence a este uid.
    // Quando um usuário phone-only faz login numa sessão que antes pertencia
    // a outra conta (ex: Google), AppStore.currentUser.email pode estar
    // contaminado com o email anterior. Verificação: se o uid não bate com
    // o provedor de email (sem @), descarta o email para evitar coroa falsa.
    var _safeEmail = user.email || null;
    const participantObj = { name: _dispName, email: _safeEmail, displayName: _dispName, uid: user.uid, selfEnrolled: true, ligaActive: true };
    // Audit trail: timestamp de inscrição própria
    participantObj.addedAt = new Date().toISOString();
    if (user.gender) participantObj.gender = user.gender;
    // Store profile fields needed for auto-assignment by age and skill
    if (user.birthDate) participantObj.birthDate = user.birthDate;
    if (user.skillBySport && typeof user.skillBySport === 'object') participantObj.skillBySport = user.skillBySport;
    if (user.defaultCategory) participantObj.defaultCategory = user.defaultCategory;
    if (catsArr) {
        participantObj.categories = catsArr;
        participantObj.category = catsArr[0]; // backward compat
        participantObj.categorySource = 'inscricao';
    }
    // Guard: se AppStore.currentUser ainda não carregou completamente (race
    // condition entre login e inscrição), o participantObj pode ter todos os
    // identificadores nulos. Nesse caso, abortar silenciosamente — o _tryAutoEnroll
    // em auth.js vai retomar a inscrição quando o perfil estiver disponível.
    var _hasAnyId = !!(participantObj.uid || participantObj.email ||
                       participantObj.displayName || participantObj.name || participantObj.phone);
    if (!_hasAnyId) {
        window._warn('[enroll] participantObj sem identificador — aguardando perfil carregar');
        return;
    }

    // Feature gate: limite de participantes no plano Free (organizador do torneio)
    if (window.AppStore.isOrganizer(t) && !window._canAddParticipant(t)) {
        window._showUpgradeModal('participants');
        return;
    }

    // --- Optimistic UI: update locally FIRST, then sync to Firestore ---
    // Check if already enrolled locally — covers individual entries AND team membership
    var alreadyIn = typeof window._isUserEnrolledInTournament === 'function'
      ? window._isUserEnrolledInTournament(user, t)
      : false;
    if (alreadyIn) {
        if (typeof showNotification !== 'undefined') showNotification(_t('enroll.alreadyEnrolled'), _t('enroll.alreadyEnrolledMsg'), 'info');
        window._scrollToParticipant(tId, user.displayName);
        return;
    }

    // Add to local state immediately
    if (!Array.isArray(t.participants)) t.participants = t.participants ? Object.values(t.participants) : [];
    t.participants.push(participantObj);

    // Show success and navigate immediately (no wait for network)
    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.enrolledTitle'), _t('enroll.enrolledMsg', { name: window._safeHtml(t.name) }), 'success');
    // Trophy hook — enrollment milestone
    setTimeout(function() {
      try { if (typeof window._trophyOnTournamentEnrolled === 'function') window._trophyOnTournamentEnrolled(t); } catch(_te) {}
    }, 500);
    window._scrollToParticipant(tId, user.displayName);
    // Post-enroll callback (ex: abrir picker de parceiro em torneios de duplas)
    if (typeof _onSuccess === 'function') { setTimeout(_onSuccess, 400); }

    // --- Background: Firestore transaction for consistency ---
    if (window.FirestoreDB && window.FirestoreDB.enrollParticipant) {
        window.FirestoreDB.enrollParticipant(tId, participantObj).then(function(result) {
            if (result.alreadyEnrolled) {
                // Already enrolled on server — local state is fine, just sync participants
                t.participants = result.participants;
                return;
            }
            // Sync authoritative server state
            t.participants = result.participants;
            if (result.autoCloseTriggered) {
                t.status = 'closed';
                if (typeof showNotification !== 'undefined') showNotification(_t('enroll.autoClosedTitle'), '"' + window._safeHtml(t.name) + '" ' + _t('enroll.autoClosedMsg', { count: t.maxParticipants }), 'success');
                if (typeof window._notifyTournamentParticipants === 'function') {
                    window._notifyTournamentParticipants(t, {
                        type: 'enrollments_closed',
                        message: _t('notif.enrollmentsClosed').replace('{name}', t.name || 'Torneio'),
                        level: 'important'
                    }, user.email);
                }
                // Re-render to show closed status
                var container = document.getElementById('view-container');
                if (container && typeof renderTournaments === 'function') renderTournaments(container, tId);
            }

            // Notify organizer (fire-and-forget)
            if (t.organizerEmail && t.organizerEmail !== user.email && typeof window._resolveOrganizerUid === 'function') {
                window._resolveOrganizerUid(t).then(function(orgUid) {
                    if (orgUid) {
                        window._sendUserNotification(orgUid, {
                            type: 'enrollment_new',
                            message: _t('enroll.orgEnrollMsg', {name: user.displayName || _t('enroll.anonParticipant'), tourn: window._safeHtml(t.name)}),
                            tournamentId: String(t.id),
                            tournamentName: t.name || '',
                            level: 'all'
                        });
                    }
                }).catch(function(e) { window._warn('Notify organizer error:', e); });
            }

            // Auto-amizade (fire-and-forget)
            try {
                var _refUid = null;
                var _h = window.location.hash || '';
                var _rm2 = _h.match(/[?&]ref=([^&]+)/);
                if (_rm2) _refUid = decodeURIComponent(_rm2[1]);
                if (!_refUid) _refUid = sessionStorage.getItem('_inviteRefUid');
                if (_refUid && typeof _autoFriendOnInvite === 'function') {
                    _autoFriendOnInvite(_refUid, user);
                    try { sessionStorage.removeItem('_inviteRefUid'); } catch(e2) {}
                }
            } catch(e) { window._warn('Auto-friend error:', e); }
        }).catch(function(err) {
            // Rollback: remove from local state and re-render
            window._warn('Enroll transaction error:', err);
            t.participants = t.participants.filter(function(p) {
                return !(p.email === user.email && p.uid === user.uid);
            });
            if (typeof showNotification !== 'undefined') showNotification(_t('enroll.error'), _t('enroll.errorMsg'), 'error');
            var container = document.getElementById('view-container');
            if (container && typeof renderTournaments === 'function') renderTournaments(container, tId);
        });
    }
};

window.submitTeamEnroll = function (tId) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    // LGPD: identidade verificada contra Firebase Auth
    const user = (typeof window._verifiedCurrentUser === 'function') ? window._verifiedCurrentUser() : window.AppStore.currentUser;
    if (!t || !user) return;

    // v1.3.24-beta: GUARD — mesma proteção de enrollCurrentUser. Sem uid,
    // o team enroll grava participantObj sem vincular perfil, criando
    // inscrição "fantasma".
    if (!user.uid) {
        if (typeof showNotification !== 'undefined') showNotification('Sessão sem identificador', 'Faça logout e entre novamente antes de se inscrever.', 'error');
        if (typeof window._captureException === 'function') {
            window._captureException(new Error('Team enrollment attempted with empty uid'), {
                area: 'submitTeamEnroll',
                tournamentId: tId,
                hasDisplayName: !!user.displayName,
                hasEmail: !!user.email,
            });
        }
        return;
    }

    // Verifica se as inscrições estão realmente abertas
    if (t.status === 'finished') {
        showAlertDialog(_t('enroll.tournamentFinished'), _t('enroll.tournamentFinishedMsg'), null, { type: 'warning' });
        return;
    }
    const sorteioRealizado = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
    const ligaAberta = window._isLigaFormat(t) && t.ligaOpenEnrollment !== false && sorteioRealizado;
    const inscricoesAbertas = (t.status !== 'closed' && !sorteioRealizado) || ligaAberta;
    if (!inscricoesAbertas) {
        if (_allowsLateEnrollment(t) && t.status !== 'finished') {
            // Late enrollment for teams — collect names first, then send to standby
            const inputs2 = document.querySelectorAll('.team-member-name-' + tId);
            let teamNames2 = [user.displayName];
            let allOk = true;
            inputs2.forEach(function(inp) { var v = inp.value.trim(); if (!v) allOk = false; teamNames2.push(v); });
            if (!allOk) { showAlertDialog(_t('enroll.requiredFields'), _t('enroll.requiredFieldsMsg'), null, { type: 'warning' }); return; }
            var teamStr = teamNames2.join(' / ');
            var partObj = { name: teamStr, email: user.email, displayName: teamStr, uid: user.uid };
            _enrollToStandby(t, tId, partObj, function() {
                var mod2 = document.getElementById('team-enroll-modal-' + tId);
                if (mod2) mod2.style.display = 'none';
                var container = document.getElementById('view-container');
                if (container && typeof renderTournaments === 'function') renderTournaments(container, tId);
            });
            return;
        }
        showAlertDialog(_t('enroll.enrollClosed'), _t('enroll.enrollClosedMsg'), null, { type: 'warning' });
        return;
    }

    const inputs = document.querySelectorAll('.team-member-name-' + tId);
    let allFilled = true;
    let teamNames = [user.displayName];
    let partnerUids = []; // v1.8.48: uids de parceiros selecionados via picker

    inputs.forEach(input => {
        const val = input.value.trim();
        if (!val) allFilled = false;
        teamNames.push(val);
        // Captura uid do parceiro se selecionado via picker inteligente
        if (input.dataset && input.dataset.partnerUid) {
            partnerUids.push(input.dataset.partnerUid);
        }
    });

    if (!allFilled) {
        showAlertDialog(_t('enroll.requiredFields'), _t('enroll.requiredFieldsMsg'), null, { type: 'warning' });
        return;
    }

    const teamString = teamNames.join(' / ');
    const participantObj = {
        name: teamString, displayName: teamString, ligaActive: true,
        uid: user.uid,
        // v1.8.88: sempre salvar p1Name/p1Uid/p2Name/p2Uid para garantir
        // que memberUids inclua todos os membros da dupla
        p1Name: teamNames[0] || '', p1Uid: user.uid,
        p2Name: teamNames[1] || '', p2Uid: partnerUids[0] || ''
    };
    if (user.email) participantObj.email = user.email;
    // Registrar origem da equipe via extraUpdates
    var _teamOrigins = t.teamOrigins || {};
    _teamOrigins[teamString] = 'inscrita';

    const mod = document.getElementById('team-enroll-modal-' + tId);
    if (mod) mod.style.display = 'none';

    // --- Optimistic UI: update locally FIRST, then sync to Firestore ---
    if (!Array.isArray(t.participants)) t.participants = t.participants ? Object.values(t.participants) : [];
    t.participants.push(participantObj);
    t.teamOrigins = _teamOrigins;

    // Show success and navigate immediately (no wait for network)
    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.enrolledTitle'), _t('enroll.teamEnrolledMsg', { name: window._safeHtml(t.name) }), 'success');
    window._scrollToParticipant(tId, teamString);

    // --- Background: Firestore transaction for consistency ---
    if (window.FirestoreDB && window.FirestoreDB.enrollParticipant) {
        window.FirestoreDB.enrollParticipant(tId, participantObj, { teamOrigins: _teamOrigins }).then(function(result) {
            if (result.alreadyEnrolled) {
                t.participants = result.participants;
                return;
            }
            t.participants = result.participants;
            if (result.autoCloseTriggered) {
                t.status = 'closed';
                if (typeof showNotification !== 'undefined') showNotification(_t('enroll.autoClosedTitle'), '"' + window._safeHtml(t.name) + '" ' + _t('enroll.autoClosedMsg', { count: t.maxParticipants }), 'success');
                if (typeof window._notifyTournamentParticipants === 'function') {
                    window._notifyTournamentParticipants(t, {
                        type: 'enrollments_closed',
                        message: _t('notif.enrollmentsClosed').replace('{name}', t.name || 'Torneio'),
                        level: 'important'
                    }, user.email);
                }
                var container = document.getElementById('view-container');
                if (container && typeof renderTournaments === 'function') renderTournaments(container, tId);
            }

            // Notify organizer (fire-and-forget)
            if (t.organizerEmail && t.organizerEmail !== user.email && typeof window._resolveOrganizerUid === 'function') {
                window._resolveOrganizerUid(t).then(function(orgUid) {
                    if (orgUid) {
                        window._sendUserNotification(orgUid, {
                            type: 'enrollment_new',
                            message: _t('enroll.orgTeamEnrollMsg', {team: window._safeHtml(teamString), tourn: window._safeHtml(t.name)}),
                            tournamentId: String(t.id),
                            tournamentName: t.name || '',
                            level: 'all'
                        });
                    }
                }).catch(function(e) { window._warn('Notify organizer error:', e); });
            }

            // Notificar parceiro selecionado via picker (fire-and-forget)
            if (partnerUids.length > 0 && typeof window._sendUserNotification === 'function') {
                partnerUids.forEach(function(pUid) {
                    if (!pUid || pUid === user.uid) return;
                    window._sendUserNotification(pUid, {
                        type: 'enrollment_new',
                        title: '🎾 Você foi escolhido como parceiro(a)!',
                        message: (user.displayName || 'Alguém') + ' formou dupla com você no torneio ' + window._safeHtml(t.name) + '.',
                        tournamentId: String(t.id),
                        tournamentName: t.name || '',
                        level: 'fundamental'
                    });
                });
            }

            // Auto-amizade (fire-and-forget)
            try {
                var _refUid3 = null;
                var _h3 = window.location.hash || '';
                var _rm3 = _h3.match(/[?&]ref=([^&]+)/);
                if (_rm3) _refUid3 = decodeURIComponent(_rm3[1]);
                if (!_refUid3) _refUid3 = sessionStorage.getItem('_inviteRefUid');
                if (_refUid3 && typeof _autoFriendOnInvite === 'function') {
                    _autoFriendOnInvite(_refUid3, user);
                    try { sessionStorage.removeItem('_inviteRefUid'); } catch(e2) {}
                }
            } catch(e) { window._warn('Auto-friend error:', e); }
        }).catch(function(err) {
            // Rollback: remove from local state and re-render
            window._warn('Team enroll transaction error:', err);
            t.participants = t.participants.filter(function(p) {
                return !(typeof p === 'object' && p.name === teamString && p.email === user.email);
            });
            if (typeof showNotification !== 'undefined') showNotification(_t('enroll.error'), _t('enroll.errorMsg'), 'error');
            var container = document.getElementById('view-container');
            if (container && typeof renderTournaments === 'function') renderTournaments(container, tId);
        });
    }
};

// v2.1.3: sair da LISTA DE ESPERA (standby/waitlist). Inscrição tardia (pós-
// sorteio, Fechadas OFF) coloca o usuário na espera; deenrollCurrentUser só
// mexe em participants, então a saída da espera precisa desta função própria.
window._leaveStandby = function (tId) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    var user = (typeof window._verifiedCurrentUser === 'function') ? window._verifiedCurrentUser() : window.AppStore.currentUser;
    if (!t || !user) return;
    var _matchUser = function(p) {
        if (!p) return false;
        if (typeof p === 'string') return p === user.email || p === user.displayName;
        return (p.uid && user.uid && p.uid === user.uid) ||
               (p.email && user.email && p.email === user.email) ||
               (p.displayName && user.displayName && p.displayName === user.displayName);
    };
    showConfirmDialog(
        _t('enroll.leaveWaitlist') || 'Sair da lista de espera',
        'Deseja sair da lista de espera deste torneio?',
        function() {
            if (Array.isArray(t.standbyParticipants)) t.standbyParticipants = t.standbyParticipants.filter(function(p) { return !_matchUser(p); });
            if (Array.isArray(t.waitlist)) t.waitlist = t.waitlist.filter(function(p) { return !_matchUser(p); });
            if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
                window.FirestoreDB.saveTournament(t).catch(function(err) { window._warn('[leaveStandby] save error:', err); });
            }
            if (typeof showNotification !== 'undefined') showNotification('Saiu da lista de espera', 'Você não está mais na lista de espera.', 'info');
            var c = document.getElementById('view-container');
            if (c && typeof renderTournaments === 'function') renderTournaments(c, String(tId));
        },
        null,
        { type: 'warning', confirmText: 'Sair', cancelText: 'Cancelar' }
    );
};

window.deenrollCurrentUser = function (tId) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    // LGPD: identidade verificada contra Firebase Auth
    const user = (typeof window._verifiedCurrentUser === 'function') ? window._verifiedCurrentUser() : window.AppStore.currentUser;
    if (!user) return;
    if (t && t.participants) {
        showConfirmDialog(
            _t('enroll.cancelEnroll'),
            _t('enroll.cancelEnrollMsg'),
            () => {
                // --- Optimistic UI: remove locally FIRST, then sync to Firestore ---
                var _savedParticipants = Array.isArray(t.participants) ? t.participants.slice() : Object.values(t.participants || {}).slice();
                // Remove from local state immediately
                t.participants = _savedParticipants.filter(function(p) {
                    if (typeof p === 'string') return p !== user.email && p !== user.displayName;
                    var pEmail = p.email || '';
                    var pName = p.displayName || p.name || '';
                    var pUid = p.uid || '';
                    return !(pEmail === user.email || (user.uid && pUid === user.uid) || (pName && pName === user.displayName));
                });

                // Show success and re-render immediately (no wait for network)
                if (typeof showNotification !== 'undefined') showNotification(_t('enroll.cancelledTitle'), _t('enroll.cancelledMsg', { name: window._safeHtml(t.name) }), 'info');
                const container = document.getElementById('view-container');
                if (container) renderTournaments(container, window.location.hash.split('/')[1]);

                // --- Background: Firestore transaction for consistency ---
                if (window.FirestoreDB && typeof window.FirestoreDB.deenrollParticipant === 'function') {
                    window.FirestoreDB.deenrollParticipant(tId, user.email, user.displayName, user.uid).then(function(result) {
                        if (result && !result.notFound) {
                            t.participants = result.participants;
                        }
                        // Notify organizer (fire-and-forget)
                        if (t.organizerEmail && t.organizerEmail !== user.email && typeof window._resolveOrganizerUid === 'function') {
                            window._resolveOrganizerUid(t).then(function(orgUid) {
                                if (orgUid) {
                                    window._sendUserNotification(orgUid, {
                                        type: 'enrollment_cancelled',
                                        message: _t('enroll.orgUnenrollMsg', {name: user.displayName || _t('enroll.anonParticipant'), tourn: window._safeHtml(t.name)}),
                                        tournamentId: String(t.id),
                                        tournamentName: t.name || '',
                                        level: 'important'
                                    });
                                }
                            }).catch(function(e) { window._warn('Notify organizer unenroll error:', e); });
                        }
                    }).catch(function(err) {
                        // Rollback: restore original participants and re-render
                        window._warn('Deenroll transaction error:', err);
                        t.participants = _savedParticipants;
                        if (typeof showNotification !== 'undefined') showNotification(_t('enroll.error'), _t('enroll.cancelError'), 'error');
                        var c2 = document.getElementById('view-container');
                        if (c2) renderTournaments(c2, window.location.hash.split('/')[1]);
                    });
                } else {
                    // Fallback: non-transactional save (already removed locally above)
                    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
                        window.FirestoreDB.saveTournament(t).catch(function(err) { window._warn('Deenroll save error:', err); });
                    }
                }
            },
            null,
            { type: 'warning', confirmText: _t('enroll.cancelEnroll'), cancelText: _t('enroll.keep') }
        );
    }
};

window.addParticipantFunction = function (tId) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;
    // Block if enrollments are closed (except Liga with open enrollment)
    var _isLiga = t.format && (t.format === 'Liga' || t.format === 'Ranking' || t.format === 'liga' || t.format === 'ranking');
    var _ligaOpen = _isLiga && t.ligaOpenEnrollment;
    var _sorteio = (Array.isArray(t.matches) && t.matches.length > 0) ||
                   (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                   (Array.isArray(t.groups) && t.groups.length > 0);
    var _closedOrDrawn = (t.status === 'closed' || t.status === 'finished' || _sorteio) && !_ligaOpen;
    if (_closedOrDrawn && !_allowsLateEnrollment(t)) {
        showAlertDialog(_t('enroll.enrollClosed'), _t('enroll.enrollClosedMsg'), null, { type: 'warning' });
        return;
    }
    // Overlay com autocomplete de amigos/usuários
    window._addParticipantWithAutocomplete(tId, _closedOrDrawn, function(pName, selectedUid, selectedPhoto) {
        if (!pName || !pName.trim()) return;
            // Audit trail: quem adicionou manualmente e quando.
            // selfEnrolled=false distingue de inscrição própria (selfEnrolled=true).
            var _cu = window.AppStore && window.AppStore.currentUser;
            var participantObj = {
                name: pName.trim(), displayName: pName.trim(), ligaActive: true,
                selfEnrolled: false,
                addedByUid:  (_cu && _cu.uid)   || null,
                addedByName: (_cu && (_cu.displayName || _cu.email)) || null,
                addedAt:     new Date().toISOString()
            };
            // Se foi selecionado via autocomplete, incluir uid e photo
            if (selectedUid) participantObj.uid = selectedUid;
            if (selectedPhoto) participantObj.photoURL = selectedPhoto;
            // If late enrollment, add to standby instead
            if (_closedOrDrawn) {
                _enrollToStandby(t, tId, participantObj, function() {
                    var container = document.getElementById('view-container');
                    if (container && typeof renderTournaments === 'function') renderTournaments(container, window.location.hash.split('/')[1]);
                });
                return;
            }
            // Use transactional enroll to prevent race conditions
            if (window.FirestoreDB && typeof window.FirestoreDB.enrollParticipant === 'function') {
                window.FirestoreDB.enrollParticipant(tId, participantObj).then(function(result) {
                    if (result.alreadyEnrolled) {
                        if (typeof showNotification !== 'undefined') showNotification(_t('enroll.alreadyEnrolled'), _t('enroll.alreadyEnrolledSingle', { name: pName.trim() }), 'warning');
                        return;
                    }
                    if (result.enrollmentClosed) {
                        if (typeof showNotification !== 'undefined') showNotification(_t('enroll.enrollClosed'), _t('enroll.enrollClosedMsg'), 'warning');
                        return;
                    }
                    t.participants = result.participants;
                    if (result.autoCloseTriggered) {
                        t.status = 'closed';
                        if (typeof showNotification !== 'undefined') showNotification(_t('enroll.autoClosedTitle'), '"' + window._safeHtml(t.name) + '" ' + _t('enroll.autoClosedMsg', { count: t.maxParticipants }), 'success');
                    }
                    const container = document.getElementById('view-container');
                    if (container && typeof renderTournaments === 'function') renderTournaments(container, window.location.hash.split('/')[1]);
                }).catch(function(err) {
                    window._warn('Add participant error:', err);
                    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.error'), _t('enroll.addError'), 'error');
                });
            } else {
                // Fallback: non-transactional
                let arr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
                arr.push(participantObj);
                t.participants = arr;
                window.FirestoreDB.saveTournament(t);
                const container = document.getElementById('view-container');
                if (container && typeof renderTournaments === 'function') renderTournaments(container, window.location.hash.split('/')[1]);
            }
    });
};

window.addTeamFunction = function (tId) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;
    // Block if enrollments are closed (except Liga with open enrollment)
    var _isLiga = t.format && (t.format === 'Liga' || t.format === 'Ranking' || t.format === 'liga' || t.format === 'ranking');
    var _ligaOpen = _isLiga && t.ligaOpenEnrollment;
    var _sorteio = (Array.isArray(t.matches) && t.matches.length > 0) ||
                   (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                   (Array.isArray(t.groups) && t.groups.length > 0);
    var _closedOrDrawn2 = (t.status === 'closed' || t.status === 'finished' || _sorteio) && !_ligaOpen;
    if (_closedOrDrawn2 && !_allowsLateEnrollment(t)) {
        showAlertDialog(_t('enroll.enrollClosed'), _t('enroll.enrollClosedMsg'), null, { type: 'warning' });
        return;
    }
    const teamSize = t.teamSize || 2;
    const items = Array.from({ length: teamSize }, (_, i) => ({ placeholder: _t('enroll.memberPlaceholder', {num: i + 1}) }));

    showMultiInputDialog(
        _closedOrDrawn2 ? _t('enroll.lateTeamTitle') : _t('enroll.addTeam'),
        items,
        (teamNames) => {
            if (!teamNames || teamNames.some(n => !n.trim())) {
                showAlertDialog(_t('enroll.cancelledTitle'), _t('enroll.allFieldsRequired'), null, { type: 'info' });
                return;
            }
            const teamString = teamNames.join(' / ');
            // If late enrollment, add to standby
            if (_closedOrDrawn2) {
                _enrollToStandby(t, tId, { name: teamString, displayName: teamString }, function() {
                    var container = document.getElementById('view-container');
                    if (container && typeof renderTournaments === 'function') renderTournaments(container, window.location.hash.split('/')[1]);
                });
                return;
            }

            let arr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
            arr.push({ name: teamString, displayName: teamString });
            t.participants = arr;
            // Registrar origem: organizer adicionou o time
            if (!t.teamOrigins) t.teamOrigins = {};
            t.teamOrigins[teamString] = 'formada';

            window.FirestoreDB.saveTournament(t);
            if (t.autoCloseOnFull && t.maxParticipants && arr.length >= parseInt(t.maxParticipants)) {
                t.status = 'closed'; window.FirestoreDB.saveTournament(t);
                if (typeof showNotification !== 'undefined') showNotification(_t('enroll.autoClosedTitle'), '"' + window._safeHtml(t.name) + '" ' + _t('enroll.autoClosedMsg', { count: t.maxParticipants }), 'success');
            }
            const container = document.getElementById('view-container');
            if (container && typeof renderTournaments === 'function') renderTournaments(container, window.location.hash.split('/')[1]);
        },
        { itemLabel: _t('enroll.memberLabel') }
    );
};

window.deleteTournamentFunction = function (tId) {
    // Only the original creator can delete
    var _tour = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (_tour && !window.AppStore.isCreator(_tour)) {
      showAlertDialog(_t('enroll.noPermission'), _t('enroll.onlyCreatorDelete'), null, { type: 'warning' });
      return;
    }
    showConfirmDialog(
        _t('enroll.deleteTournament'),
        _t('enroll.deleteTournamentMsg'),
        function() {
            const idx = window.AppStore.tournaments.findIndex(tour => tour.id.toString() === tId.toString());
            if (idx !== -1) {
                // Marca como deletado para evitar que o listener traga de volta
                if (!window.AppStore._deletedTournamentIds) window.AppStore._deletedTournamentIds = [];
                window.AppStore._deletedTournamentIds.push(String(tId));
                try { localStorage.setItem('scoreplace_deleted_ids', JSON.stringify(window.AppStore._deletedTournamentIds)); } catch(e) {}

                // Save reference for background tasks before removing
                var _delTour = window.AppStore.tournaments[idx];

                // ── Optimistic: remove from memory, navigate immediately ──
                window.AppStore.tournaments.splice(idx, 1);
                window.AppStore._saveToCache();

                showNotification(_t('enroll.deletedTitle'), _t('enroll.deletedMsg'), 'success');
                window.location.hash = '#dashboard';

                // ── Background: notify participants + delete from Firestore ──
                // Notifications run in background — don't block UI
                if (_delTour && typeof window._notifyTournamentParticipants === 'function') {
                    var _cu = window.AppStore.currentUser;
                    try {
                        window._notifyTournamentParticipants(_delTour, {
                            type: 'tournament_deleted',
                            title: '🗑️ Torneio cancelado',
                            message: _t('notif.tournamentDeleted').replace('{name}', _delTour.name || 'Torneio'),
                            tournamentName: _delTour.name || 'Torneio',
                            level: 'fundamental'
                        }, _cu ? _cu.email : null);
                    } catch(e) { window._warn('Delete notification error:', e); }
                }

                // Firestore delete runs in background
                if (window.FirestoreDB && window.FirestoreDB.db) {
                    window.FirestoreDB.deleteTournament(tId).then(function() {
                        var delIdx = window.AppStore._deletedTournamentIds.indexOf(String(tId));
                        if (delIdx !== -1) window.AppStore._deletedTournamentIds.splice(delIdx, 1);
                        try { localStorage.setItem('scoreplace_deleted_ids', JSON.stringify(window.AppStore._deletedTournamentIds)); } catch(e) {}
                    }).catch(function(err) {
                        window._error('Erro ao deletar torneio do Firestore:', err);
                        showNotification(_t('enroll.deleteError'), _t('enroll.deleteErrorMsg'), 'error');
                    });
                }
            }
        },
        null,
        { type: 'danger', confirmText: _t('enroll.deletePermanently'), cancelText: _t('enroll.keepTournament') }
    );
};

// Liga active toggle: participant opts in/out of upcoming draws
window._toggleLigaActive = function(tId, isActive) {
  var store = window.AppStore;
  if (!store || !Array.isArray(store.tournaments)) return;
  var t = store.tournaments.find(function(x) { return String(x.id) === String(tId); });
  if (!t || !t.participants) return;
  var user = store.currentUser;
  if (!user) return;
  var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
  var found = arr.find(function(p) {
    if (typeof p !== 'object' || !p) return false;
    if (p.uid && user.uid && p.uid === user.uid) return true;
    if (p.email && user.email && p.email === user.email) return true;
    return false;
  });
  if (!found) return;
  found.ligaActive = !!isActive;
  // Save to Firestore. Use syncImmediate when we're the organizer (goes through
  // AppStore cache); otherwise hit Firestore directly (participants can't
  // always round-trip through syncImmediate).
  var savePromise;
  if (typeof store.isOrganizer === 'function' && store.isOrganizer(t) && typeof store.syncImmediate === 'function') {
    savePromise = store.syncImmediate(t.id);
  } else if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
    savePromise = window.FirestoreDB.saveTournament(t);
  } else {
    savePromise = Promise.resolve();
  }
  // v0.16.93: update do texto do toggle in-place + skip re-render. Pedido
  // do usuário: "quando clicamos no togle ativado/desativado na dashboard
  // mantenha tudo parado no lugar e não fique scrolando a pagina (isso
  // causa uma baita confusão na cabeça do usuário)." Antes
  // renderTournaments(container, tId) era chamado — quando tId é setado,
  // a função renderiza a página de DETALHE do torneio (substituindo a
  // dashboard) → causa navegação + scroll jump. Agora atualizamos só os
  // labels do próprio toggle via querySelectorAll por data-attribute. Toast
  // continua disparando pra confirmar a ação. Firestore onSnapshot já
  // sincroniza na próxima soft-refresh sem causar scroll jump (suprimida
  // por _suppressSoftRefresh quando preciso).
  var _syncTogglesInDom = function() {
    var newLabel = isActive ? 'Ativado' : 'Desativado';
    var newColor = isActive ? '#34d399' : '#f87171';
    var newTitle = isActive
      ? 'Clique para ficar de fora do próximo sorteio'
      : 'Clique para voltar ao próximo sorteio';
    // Toggle wrappers carregam data-liga-toggle-tid pra ser query-friendly.
    var wrappers = document.querySelectorAll('[data-liga-toggle-tid="' + String(tId).replace(/"/g, '\\"') + '"]');
    wrappers.forEach(function(w) {
      var lbl = w.querySelector('.liga-toggle-state-label');
      if (lbl) { lbl.textContent = newLabel; lbl.style.color = newColor; }
      w.setAttribute('title', newTitle);
      var inp = w.querySelector('input[type="checkbox"]');
      if (inp) inp.checked = !!isActive;
    });
  };
  // Update otimista imediato — não espera o save.
  _syncTogglesInDom();
  Promise.resolve(savePromise).then(function() {
    if (typeof window.showNotification === 'function') {
      window.showNotification(
        isActive ? _t('enroll.ligaActive') : _t('enroll.ligaInactive'),
        isActive ? _t('enroll.ligaActiveMsg') : _t('enroll.ligaInactiveMsg'),
        isActive ? 'success' : 'warning'
      );
    }
    // Não re-renderiza. DOM já foi atualizado in-place. Firestore listener
    // sincroniza next soft-refresh (preservando scroll).
  }).catch(function(e) {
    window._warn('[toggle-liga] save failed', e);
    // Reverte o update otimista no DOM se save falhou.
    isActive = !isActive;
    found.ligaActive = !!isActive;
    _syncTogglesInDom();
    if (typeof window.showNotification === 'function') {
      window.showNotification('Erro', 'Não foi possível salvar a alteração.', 'error');
    }
  });
};

// v0.16.89/90: helper compartilhado pra renderizar o toggle "Ativado/
// Desativado para o próximo sorteio". Usado em 3 pontos: dashboard widget
// Próximas Partidas, card de Liga na lista da dashboard, e página de
// detalhe do torneio. Renderiza VAZIO quando: não é Liga, user não logado,
// user não é participante, ou torneio finished. Estado inicial:
// ligaActive===false → Desativado; senão → Ativado (default ON).
// v0.16.90: retorna inline (sem wrapper de row) — caller posiciona. Texto
// dinâmico só "Ativado" (verde) ou "Desativado" (vermelho) sem prefixo,
// com fonte 0.95rem (mais visível).
window._buildLigaActiveToggleHtml = function(t) {
  if (!t) return '';
  var isLiga = (typeof window._isLigaFormat === 'function')
    ? window._isLigaFormat(t)
    : (t.format === 'Liga' || t.format === 'Ranking');
  if (!isLiga) return '';
  if (t.status === 'finished') return '';
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid && !cu.email) return '';
  var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  var found = arr.find(function(p) {
    if (typeof p !== 'object' || !p) return false;
    if (p.uid && cu.uid && p.uid === cu.uid) return true;
    if (p.email && cu.email && p.email === cu.email) return true;
    return false;
  });
  if (!found) return ''; // só mostra pra quem está inscrito
  var isActive = found.ligaActive !== false; // default true
  var safeTid = String(t.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var stateLabel = isActive ? 'Ativado' : 'Desativado';
  var stateColor = isActive ? '#34d399' : '#f87171';
  var titleAttr = isActive
    ? 'Clique para ficar de fora do próximo sorteio'
    : 'Clique para voltar ao próximo sorteio';
  // v0.16.92: stopPropagation EM TODOS os elementos do toggle.
  // v0.16.93: data-liga-toggle-tid no outer wrapper + class
  // liga-toggle-state-label no text span permite update in-place pelo
  // _toggleLigaActive sem re-render do view (sem scroll jump).
  var STOP = 'onclick="event.stopPropagation();"';
  return '<span data-liga-toggle-tid="' + safeTid + '" style="display:inline-flex;align-items:center;gap:8px;flex-shrink:0;" ' + STOP + ' ' +
    'title="' + window._safeHtml(titleAttr) + '">' +
    '<span class="liga-toggle-state-label" style="font-size:0.95rem;font-weight:700;color:' + stateColor + ';white-space:nowrap;" ' + STOP + '>' + stateLabel + '</span>' +
    '<label class="toggle-switch toggle-sm" style="flex-shrink:0;" ' + STOP + '>' +
      '<input type="checkbox" ' + (isActive ? 'checked' : '') + ' ' + STOP +
        ' onchange="window._toggleLigaActive(\'' + safeTid + '\', this.checked)">' +
      '<span class="toggle-slider" ' + STOP + '></span>' +
    '</label>' +
  '</span>';
};

})();


// Overlay "+ Participante" com autocomplete dinâmico (amigos + busca Firestore)
window._addParticipantWithAutocomplete = function(tId, isLate, onConfirm) {
  var t = window.AppStore && window.AppStore.tournaments &&
          window.AppStore.tournaments.find(function(x){ return String(x.id)===String(tId); });
  var _sh = window._safeHtml || function(s){return String(s||'');};
  var title = isLate ? 'Adicionar à lista de espera' : '👤 Adicionar participante';

  var old = document.getElementById('add-participant-overlay');
  if (old) old.remove();

  var overlay = document.createElement('div');
  overlay.id = 'add-participant-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);z-index:10200;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:4rem 1rem 2rem;';
  overlay.onclick = function(e){ if(e.target===overlay) overlay.remove(); };

  overlay.innerHTML =
    '<div style="background:var(--bg-card,#1e293b);border-radius:16px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.5);margin:auto;">' +
      '<div style="padding:14px 16px;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.08));display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-weight:700;font-size:0.95rem;color:var(--text-bright,#f1f5f9);">'+title+'</span>' +
        '<button onclick="document.getElementById(\'add-participant-overlay\').remove()" style="background:none;border:none;color:var(--text-muted);font-size:1.4rem;cursor:pointer;line-height:1;">×</button>' +
      '</div>' +
      '<div style="padding:16px;">' +
        '<div style="position:relative;">' +
          '<input type="text" id="ap-input" placeholder="Digite o nome (ou escolha um amigo)" autocomplete="off" style="width:100%;padding:10px 10px 10px 34px;border-radius:8px;border:1px solid var(--border-color,rgba(255,255,255,0.15));background:var(--bg-dark,#0f172a);color:var(--text-main,#e2e8f0);font-size:0.9rem;box-sizing:border-box;" oninput="window._apSearch(this.value)" onfocus="window._apSearch(this.value)">' +
          '<span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);pointer-events:none;">🔍</span>' +
        '</div>' +
        '<div id="ap-dropdown" style="display:none;border:1px solid var(--border-color,rgba(255,255,255,0.12));border-radius:8px;margin-top:4px;max-height:240px;overflow-y:auto;background:var(--bg-card,#1e293b);"></div>' +
        '<div id="ap-selected" style="display:none;margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);align-items:center;gap:8px;">' +
          '<span id="ap-sel-text" style="font-size:0.88rem;color:var(--text-bright);flex:1;font-weight:600;"></span>' +
          '<button onclick="window._apClear()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.9rem;padding:0;">×</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button onclick="document.getElementById(\'add-participant-overlay\').remove()" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-color);background:none;color:var(--text-muted);cursor:pointer;font-size:0.85rem;">Cancelar</button>' +
          '<button id="ap-confirm" onclick="window._apConfirm()" disabled style="flex:2;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;font-weight:700;font-size:0.88rem;cursor:not-allowed;opacity:0.4;transition:opacity 0.2s;">Adicionar</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  setTimeout(function(){ var i=document.getElementById('ap-input'); if(i) i.focus(); }, 80);

  window._apSelected = null;
  window._apDebounce = null;

  window._apSearch = function(query) {
    var q = (query||'').trim().toLowerCase();
    var dd = document.getElementById('ap-dropdown');
    if (!dd) return;

    var cu = window.AppStore && window.AppStore.currentUser;
    var friendUids = cu && Array.isArray(cu.friends) ? cu.friends.filter(function(f){ return typeof f==='string' && !f.includes('@'); }) : [];
    var cache = window._friendProfilesCache || {};

    // Participantes já inscritos (para evitar duplicatas)
    var enrolled = Array.isArray(t && t.participants) ? t.participants : [];
    var enrolledNames = enrolled.map(function(p){ return typeof p==='string' ? p.toLowerCase() : (p.displayName||p.name||'').toLowerCase(); });
    var enrolledUids  = enrolled.filter(function(p){ return typeof p==='object' && p.uid; }).map(function(p){ return p.uid; });

    var _isEnrolled = function(uid, name) {
      if (uid && enrolledUids.indexOf(uid) !== -1) return true;
      if (name && enrolledNames.indexOf(name.toLowerCase()) !== -1) return true;
      return false;
    };

    // Amigos do cache
    var friends = friendUids.map(function(uid){
      var p = cache[uid];
      return p ? { name: p.displayName||'', uid: uid, photo: p.photoURL||'' } : null;
    }).filter(function(p){ return p && p.name && (!q || p.name.toLowerCase().includes(q)) && !_isEnrolled(p.uid, p.name); });

    function _item(p, badge) {
      var seed = encodeURIComponent(p.name);
      var fb = 'https://api.dicebear.com/9.x/initials/svg?seed='+seed+'&backgroundColor=6366f1&textColor=ffffff&fontSize=42&size=32';
      var src = (p.photo && p.photo.indexOf('dicebear.com')===-1) ? p.photo : fb;
      var uidJs = (p.uid||'').replace(/'/g,"\\'");
      var nameJs = (p.name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      var photoJs = (p.photo||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return '<div onclick="event.stopPropagation();window._apSelect(\''+nameJs+'\',\''+uidJs+'\',\''+photoJs+'\')" '+
        'style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:background 0.1s;" '+
        'onmouseover="this.style.background=\'rgba(99,102,241,0.1)\'" onmouseout="this.style.background=\'none\'">' +
        '<img src="'+_sh(src)+'" onerror="this.src=\''+fb+'\'" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;">' +
        '<div><div style="font-size:0.88rem;font-weight:600;color:var(--text-bright,#f1f5f9);">'+_sh(p.name)+'</div>' +
        '<div style="font-size:0.68rem;color:var(--text-muted,#94a3b8);">'+badge+'</div></div></div>';
    }

    var html = '';
    if (friends.length) {
      html += '<div style="padding:5px 12px 3px;font-size:0.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.8px;">Meus amigos</div>';
      html += friends.map(function(p){ return _item(p, 'Amigo'); }).join('');
    }

    dd.innerHTML = html;
    dd.style.display = html ? 'block' : 'none';

    // v1.9.80: NÃO busca usuários arbitrários no Firestore. Você só pode
    // adicionar um USUÁRIO (com conta) se ele for seu AMIGO — o autocomplete
    // sugere apenas amigos. Qualquer outro nome digitado entra como TEXTO
    // simples (sem vínculo de conta). Acabou a pergunta "Usar X como nome":
    // basta digitar e clicar Adicionar. O botão habilita assim que há texto.
    if (window._apDebounce) { clearTimeout(window._apDebounce); window._apDebounce = null; }
    if (!window._apSelected) {
      var _btn = document.getElementById('ap-confirm');
      if (_btn) {
        var _hasText = !!q;
        _btn.disabled = !_hasText;
        _btn.style.opacity = _hasText ? '1' : '0.4';
        _btn.style.cursor = _hasText ? 'pointer' : 'not-allowed';
      }
    }
    // Fechar dropdown ao clicar fora
    setTimeout(function(){
      document.addEventListener('click', function _c(){ if(dd) dd.style.display='none'; document.removeEventListener('click',_c); }, { once: true });
    }, 50);
  };

  window._apSelect = function(name, uid, photo) {
    window._apSelected = { name: name, uid: uid, photo: photo };
    var inp = document.getElementById('ap-input');
    var sel = document.getElementById('ap-selected');
    var txt = document.getElementById('ap-sel-text');
    var btn = document.getElementById('ap-confirm');
    var dd  = document.getElementById('ap-dropdown');
    if (inp)  { inp.value = name; inp.style.display = 'none'; }
    if (txt)  txt.textContent = name;
    if (sel)  sel.style.display = 'flex';
    if (dd)   dd.style.display = 'none';
    if (btn)  { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
  };

  window._apClear = function() {
    window._apSelected = null;
    var inp = document.getElementById('ap-input');
    var sel = document.getElementById('ap-selected');
    var btn = document.getElementById('ap-confirm');
    if (inp) { inp.value = ''; inp.style.display = 'block'; inp.focus(); }
    if (sel) sel.style.display = 'none';
    if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed'; }
  };

  window._apConfirm = function() {
    var sel = window._apSelected;
    // Aceitar também texto livre do input
    if (!sel) {
      var v = (document.getElementById('ap-input')||{}).value || '';
      if (!v.trim()) return;
      sel = { name: v.trim(), uid: '', photo: '' };
    }
    document.getElementById('add-participant-overlay') && document.getElementById('add-participant-overlay').remove();
    onConfirm(sel.name, sel.uid, sel.photo);
  };
};
