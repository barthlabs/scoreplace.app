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
    const user = window.AppStore.currentUser;
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
        if (t.enrollmentMode === 'time' && (t.teamSize || 2) > 1) {
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

// Internal: performs actual enrollment with optional category
window._doEnrollCurrentUser = function(tId, selectedCategories) {
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
    const user = window.AppStore.currentUser;
    if (!t || !user) return;

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
    const participantObj = { name: _dispName, email: user.email, displayName: _dispName, uid: user.uid, selfEnrolled: true, ligaActive: true };
    if (user.phone) participantObj.phone = user.phone;
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
    const user = window.AppStore.currentUser;
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

    inputs.forEach(input => {
        const val = input.value.trim();
        if (!val) allFilled = false;
        teamNames.push(val);
    });

    if (!allFilled) {
        showAlertDialog(_t('enroll.requiredFields'), _t('enroll.requiredFieldsMsg'), null, { type: 'warning' });
        return;
    }

    const teamString = teamNames.join(' / ');
    const participantObj = { name: teamString, email: user.email, displayName: teamString, uid: user.uid, ligaActive: true };
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

window.deenrollCurrentUser = function (tId) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    const user = window.AppStore.currentUser;
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
    var _addTitle = _closedOrDrawn ? _t('enroll.lateAddTitle') : _t('enroll.addParticipant');
    var _addMsg = _closedOrDrawn ? _t('enroll.lateAddMsg') : _t('enroll.addParticipantMsg');
    showInputDialog(
        _addTitle,
        _addMsg,
        (pName) => {
            if (!pName || !pName.trim()) return;
            var participantObj = { name: pName.trim(), displayName: pName.trim(), ligaActive: true };
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
        },
        { placeholder: _t('enroll.participantName'), okText: _t('enroll.add') }
    );
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
                            message: _t('notif.tournamentDeleted').replace('{name}', _delTour.name || 'Torneio'),
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
