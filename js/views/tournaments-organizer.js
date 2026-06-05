// ── Organizer Actions & Notifications ──
// Clone tournament — creates a new tournament based on an existing one
window._cloneTournament = function(tournamentId) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tournamentId); });
    if (!t || !window.AppStore.currentUser) return;
    var _t = window._t || function(k) { return k; };

    var newT = {
        name: t.name + _t('org.cloneSuffixFull'),
        sport: t.sport,
        format: t.format,
        isPublic: t.isPublic,
        enrollmentMode: t.enrollmentMode || 'misto',
        maxParticipants: t.maxParticipants || '',
        venue: t.venue || '',
        venueLat: t.venueLat || '',
        venueLon: t.venueLon || '',
        venueAddress: t.venueAddress || '',
        venuePlaceId: t.venuePlaceId || '',
        venueAccess: t.venueAccess || '',
        courtCount: t.courtCount || '',
        courtNames: t.courtNames || '',
        logoData: t.logoData || '',
        logoLocked: t.logoLocked || false,
        teamSize: t.teamSize || 2,
        tiebreakers: t.tiebreakers || [],
        genderCategories: t.genderCategories || [],
        skillCategories: t.skillCategories || [],
        combinedCategories: t.combinedCategories || [],
        resultEntry: t.resultEntry || 'organizer',
        organizerEmail: window.AppStore.currentUser.email,
        organizerName: window.AppStore.currentUser.displayName,
        participants: [],
        status: 'open',
        createdAt: new Date().toISOString()
    };

    // Liga-specific fields
    if (window._isLigaFormat && window._isLigaFormat(t)) {
        newT.ligaSeasonMonths = t.ligaSeasonMonths || t.rankingSeasonMonths || '';
        newT.ligaOpenEnrollment = t.ligaOpenEnrollment !== false;
        newT.ligaInactivityWeeks = t.ligaInactivityWeeks || '';
        newT.ligaNewPlayerPoints = t.ligaNewPlayerPoints || '';
    }
    // Suíço-specific
    if (t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss') {
        newT.swissRounds = t.swissRounds || '';
    }
    // Draw scheduling
    if (t.drawIntervalDays) {
        newT.drawIntervalDays = t.drawIntervalDays;
        newT.drawManual = t.drawManual || false;
    }

    window.AppStore.addTournament(newT);
    if (typeof showNotification === 'function') showNotification(_t('org.clonedTitle'), '"' + newT.name + '" ' + _t('org.clonedMsg'), 'success');
    // Navigate to the new tournament
    setTimeout(function() {
        var newest = window.AppStore.tournaments.find(function(tour) { return tour.name === newT.name && tour.organizerEmail === newT.organizerEmail; });
        if (newest) {
            window.location.hash = '#tournaments/' + newest.id;
        } else {
            window.location.hash = '#dashboard';
        }
    }, 500);
};


/**
 * Resolve the organizer uid of a tournament.
 * Uses creatorUid directly if available, falls back to email lookup.
 */
window._resolveOrganizerUid = async function(t) {
    if (t.creatorUid) return t.creatorUid;
    if (!t.organizerEmail || !window.FirestoreDB || !window.FirestoreDB.db) return null;
    try {
        var snap = await window.FirestoreDB.db.collection('users').where('email', '==', t.organizerEmail).limit(1).get();
        return snap.empty ? null : snap.docs[0].id;
    } catch(e) { return null; }
};

/**
 * Send notification to a specific user (by uid) via all their enabled channels.
 * @param {string} uid - target user UID
 * @param {object} notifData - { type, message, tournamentId, tournamentName, level ('fundamental'|'important'|'all') }
 */
// v1.8.17-beta: dedup em memória para _sendUserNotification. Previne que a
// mesma notificação (type + tournamentId) chegue ao mesmo uid múltiplas vezes
// em rápida sucessão (race entre _doEnrollCurrentUser e _tryAutoEnroll, ou
// entre enrollment_new e enrollments_closed quando auto-close ocorre).
// Window de 30s: suficiente pra cobrir qualquer race sem suprimir notificações
// legítimas de eventos separados.
var _notifDedup = {};
// v1.8.45-beta: chave inclui matchId (evita falso-dedup entre partidas do
// mesmo torneio). TTL estendido para 5 minutos (era 30s) — cobre re-renders,
// retries e double-saves sem suprimir notificações legítimas subsequentes.
function _notifDedupKey(uid, type, tId, matchId) {
    return uid + '|' + type + '|' + (tId || '') + '|' + (matchId || '');
}
function _notifDedupCheck(uid, type, tId, matchId) {
    var key = _notifDedupKey(uid, type, tId, matchId);
    var now = Date.now();
    if (_notifDedup[key] && now - _notifDedup[key] < 300000) return true; // 5 min
    _notifDedup[key] = now;
    return false;
}

window._sendUserNotification = async function(uid, notifData, _skipDispatch) {
    if (!window.FirestoreDB || !window.FirestoreDB.db || !uid) return;
    // Dedup guard: mesma notificação pro mesmo uid dentro de 5 min é silenciada.
    if (_notifDedupCheck(uid, notifData.type || '', notifData.tournamentId || '', notifData.matchId || '')) {
        window._log('[notif] dedup suprimiu', notifData.type, 'para uid', uid.substring(0, 8) + '...');
        return;
    }
    // v0.17.8: defesa contra self-notification. cu.friends pode conter o
    // próprio uid em casos edge (auto-friendship via bugs históricos ou
    // email que resolve pra si mesmo). Notif pra si mesmo é sempre noise —
    // user já sabe o que acabou de fazer (toast no momento da ação cobre).
    // Nenhum call site legítimo notifica a si mesmo: todos visam organizador,
    // amigo, participante, oponente, etc.
    var _cu = window.AppStore && window.AppStore.currentUser;
    if (_cu && _cu.uid && uid === _cu.uid) {
        return;
    }
    try {
        var profile = await window.FirestoreDB.loadUserProfile(uid);
        if (!profile) return;
        var userLevel = profile.notifyLevel || 'todas';
        var notifLevel = notifData.level || 'all';
        if (!window._notifLevelAllowed(userLevel, notifLevel)) return;

        // LGPD: identidade de quem envia deve ser verificada contra Firebase Auth
        var cu = (typeof window._verifiedCurrentUser === 'function')
          ? (window._verifiedCurrentUser() || {})
          : (window.AppStore.currentUser || {});
        // Platform notification
        if (profile.notifyPlatform !== false) {
            // v1.6.11-beta: passthrough seguro dos campos custom do notifData.
            // Antes whitelist rígido descartava campos críticos pra render de
            // botões de ação (ex: casual_link_request precisa de
            // casualMatchDocId/casualRoomCode/casualSlotIndex/casualGuestName,
            // casual_invite precisa de roomCode/sport). Resultado: notif chegava
            // sem campos, renderer caía em fallback sem botões — usuário recebia
            // ping sem ação possível. Agora copiamos TODOS os campos do payload
            // exceto `level` (só usado pra filtro local de notifyLevel) e
            // valores undefined (Firestore rejeita). Campos canônicos (type,
            // fromUid, fromName, fromPhoto, createdAt, read) sobrescrevem
            // qualquer override do caller pra evitar spoofing.
            var _notifPayload = {};
            Object.keys(notifData).forEach(function(k) {
                if (k === 'level') return; // local-only filter
                var v = notifData[k];
                if (v === undefined) return; // Firestore reject
                _notifPayload[k] = v;
            });
            // Canonical fields — set last so they win over any caller override
            _notifPayload.type = notifData.type || 'info';
            _notifPayload.fromUid = cu.uid || cu.email || '';
            _notifPayload.fromName = cu.displayName || '';
            _notifPayload.fromPhoto = cu.photoURL || '';
            _notifPayload.tournamentId = notifData.tournamentId || '';
            _notifPayload.tournamentName = notifData.tournamentName || '';
            _notifPayload.message = notifData.message || '';
            _notifPayload.createdAt = new Date().toISOString();
            _notifPayload.read = false;
            await window.FirestoreDB.addNotification(uid, _notifPayload);
        }
        // Email dispatch — writes to 'mail' Firestore collection, processed by
        // the "Trigger Email from Firestore" extension.
        var email = (profile.notifyEmail !== false && profile.email) ? profile.email : null;
        // v1.3.37-beta: WhatsApp dispatch — Cloud Function processWhatsAppQueue
        // consome whatsapp_queue e POSTa pra Evolution API self-hosted no
        // Railway (infra/whatsapp/README.md). Só envia se opt-in explícito
        // (notifyWhatsApp=true) E telefone preenchido. Default é OFF —
        // notifyWhatsApp tem que ser truthy.
        var phone = (profile.notifyWhatsApp === true && profile.phone) ? profile.phone : null;

        // Auto-dispatch email & WhatsApp for this individual notification
        // (skip when called from _notifyTournamentParticipants which does batch dispatch)
        if (!_skipDispatch && (email || phone) && typeof window._dispatchChannels === 'function') {
            var tUrl = notifData.tournamentId ? 'https://scoreplace.app/#tournaments/' + notifData.tournamentId : 'https://scoreplace.app';
            // v1.8.1-beta: pass ALL notifData fields so rich email templates
            // can access player1/player2/score1/score2/matchLines/playerMatch etc.
            var _tplData = Object.assign({}, notifData);
            delete _tplData.level; // local-only filter, not needed in template
            _tplData.tournamentUrl = _tplData.tournamentUrl || tUrl;
            _tplData.subject = 'scoreplace.app — ' + (notifData.tournamentName || 'Notificação');
            if (!_tplData.message) _tplData.message = '';
            window._dispatchChannels(
                { emails: email ? [email] : [], phones: phone ? [phone] : [] },
                notifData.type || 'info',
                _tplData
            );
        }

        return { email: email, phone: phone };
    } catch(e) {
        window._warn('_sendUserNotification error:', e);
        return null;
    }
};

/**
 * Notify all enrolled participants of a tournament.
 * @param {object} tournament - tournament object
 * @param {object} notifData - { type, message, level }
 * @param {string} [excludeEmail] - email to exclude (e.g. the person who triggered the event)
 */
window._notifyTournamentParticipants = async function(tournament, notifData, excludeEmail) {
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;
    var t = tournament;
    var parts = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);

    // Build list of {uid, email} from participants — prefer uid directly from participant object
    var recipients = [];
    var seenUids = {};
    var seenEmails = {};
    var _allUids = typeof window._participantUids === 'function' ? window._participantUids : function(p) { return p && p.uid ? [p.uid] : []; };
    parts.forEach(function(p) {
        if (typeof p === 'string') return;
        var e = p.email || '';
        if (e && e === excludeEmail) return;
        // Notifica TODOS os UIDs do participante (p1Uid + p2Uid para duplas)
        _allUids(p).forEach(function(u) {
            if (u && !seenUids[u]) { seenUids[u] = true; recipients.push({ uid: u, email: e }); }
        });
        // Participante sem uid: fallback por email
        if (_allUids(p).length === 0 && e && !seenEmails[e]) {
            seenEmails[e] = true; recipients.push({ uid: '', email: e });
        }
    });

    // Also notify organizer if not excluded and not already in list.
    // v1.8.17-beta: bug fix — dedup anterior usava `(!orgUid && seenEmails[email])`
    // que só checava o email quando orgUid estava vazio. Quando o organizador é
    // participante (adicionado via email sem uid) E tem creatorUid no torneio,
    // `seenEmails` marcava o email mas a dedup ignorava (por causa do `!orgUid`).
    // Resultado: organizador entrava na lista 2x e recebia 2 notifs de fechamento.
    // Fix: checar seenEmails independentemente de orgUid.
    if (t.organizerEmail && t.organizerEmail !== excludeEmail) {
        var orgUid = t.creatorUid || '';
        var orgAlready = (orgUid && seenUids[orgUid]) || seenEmails[t.organizerEmail];
        if (!orgAlready) {
            recipients.push({ uid: orgUid, email: t.organizerEmail });
            if (orgUid) seenUids[orgUid] = true;
            seenEmails[t.organizerEmail] = true;
        }
    }

    var nd = Object.assign({}, notifData, { tournamentId: String(t.id), tournamentName: t.name || '' });
    var allEmails = [];
    var allPhones = [];

    for (var i = 0; i < recipients.length; i++) {
        try {
            var r = recipients[i];
            var uid = r.uid;
            // If uid not available, fall back to email lookup
            if (!uid && r.email) {
                var snap = await window.FirestoreDB.db.collection('users').where('email', '==', r.email).limit(1).get();
                if (!snap.empty) uid = snap.docs[0].id;
            }
            if (uid) {
                var result = await window._sendUserNotification(uid, nd, true); // skip individual dispatch; batch below
                if (result && result.email) allEmails.push(result.email);
                if (result && result.phone) allPhones.push(result.phone);
            }
        } catch(e) { window._warn('Notify participant error:', e); }
    }

    // Auto-dispatch email & WhatsApp channels
    var channelResult = { emails: allEmails, phones: allPhones };
    if ((allEmails.length > 0 || allPhones.length > 0) && typeof window._dispatchChannels === 'function') {
        var tUrl = 'https://scoreplace.app/#tournaments/' + String(t.id);
        // v1.8.1-beta: pass all nd fields so rich email templates receive full payload
        var _tplData = Object.assign({}, nd);
        delete _tplData.level;
        _tplData.tournamentUrl = _tplData.tournamentUrl || tUrl;
        _tplData.subject = 'scoreplace.app — ' + (t.name || 'Notificação');
        if (!_tplData.message) _tplData.message = '';
        window._dispatchChannels(channelResult, nd.type || 'info', _tplData);
    }

    return channelResult;
};

/**
 * Dispatch notifications through email/WhatsApp channels.
 * Takes the result from _notifyTournamentParticipants and processes batch delivery.
 * @param {Object} channelResult - { emails: string[], phones: string[] }
 * @param {string} templateType - email template type (e.g. 'draw', 'tournament_deleted')
 * @param {Object} templateData - data for the email template
 */
/**
 * Dispatch email and WhatsApp notifications.
 * Writes to Firestore 'mail' collection (processed by Firebase Extension "Trigger Email")
 * and 'whatsapp_queue' collection (processed by Cloud Function).
 * @param {Object} channelResult - { emails: string[], phones: string[] }
 * @param {string} templateType - email template type (e.g. 'draw', 'tournament_deleted')
 * @param {Object} templateData - { tournamentName, tournamentUrl, subject, ... }
 */
window._dispatchChannels = function(channelResult, templateType, templateData) {
    if (!channelResult) return;
    templateData = templateData || {};
    // ── Email ──
    // v2.1.19: e-mails de notificação agora vão pra fila de DIGEST (janela por
    // importância 5/15/30 min) em vez de um e-mail por evento. A Cloud Function
    // flushNotifEmailDigest consolida num e-mail só por pessoa. Mantém fallback
    // pro envio individual antigo se queueNotifEmail não existir.
    if (channelResult.emails && channelResult.emails.length > 0) {
        var _emCat = (window.NOTIF_CATALOG && window.NOTIF_CATALOG[templateType]) || {};
        var _emLvl = _emCat.level || 'all';
        var _emMsg = templateData.message || templateData.tournamentName || 'Notificação';
        if (window.FirestoreDB && typeof window.FirestoreDB.queueNotifEmail === 'function') {
            window.FirestoreDB.queueNotifEmail(channelResult.emails, _emLvl, _emMsg, {
                tournamentName: templateData.tournamentName || '',
                tournamentUrl: templateData.tournamentUrl || ''
            });
        } else if (typeof window._emailTemplate === 'function' && window.FirestoreDB && typeof window.FirestoreDB.queueEmail === 'function') {
            var html = window._emailTemplate(templateType, templateData);
            var subject = templateData.subject || 'scoreplace.app — ' + (templateData.tournamentName || 'Notificação');
            window.FirestoreDB.queueEmail(channelResult.emails, subject, html);
        }
    }
    // ── WhatsApp ──
    if (channelResult.phones && channelResult.phones.length > 0) {
        var waMsg = templateData.message || templateData.tournamentName || 'Notificação do scoreplace.app';
        // v2.1.17: prefixo de cor por importância (WhatsApp é texto puro, então
        // a "cor" vira emoji no início): 🔴 fundamental · 🟠 importante · 🟢 geral.
        var _waCat = (window.NOTIF_CATALOG && window.NOTIF_CATALOG[templateType]) || {};
        var _waLvl = _waCat.level || 'all';
        var _waEmoji = _waLvl === 'fundamental' ? '🔴' : (_waLvl === 'important' ? '🟠' : '🟢');
        waMsg = _waEmoji + ' ' + waMsg;
        if (window.FirestoreDB && typeof window.FirestoreDB.queueWhatsApp === 'function') {
            window.FirestoreDB.queueWhatsApp(channelResult.phones, waMsg);
        }
    }
};

/**
 * Check and send countdown reminders for tournaments (7d, 2d, day-of).
 * Should be called on app load / periodically.
 */
window._checkTournamentReminders = async function() {
    if (!window.AppStore || !window.AppStore.currentUser || !window.FirestoreDB) return;
    var cu = window.AppStore.currentUser;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var tournaments = window.AppStore.tournaments || [];
    var _t = window._t || function(k) { return k; };

    for (var i = 0; i < tournaments.length; i++) {
        var t = tournaments[i];
        if (!t.startDate || t.status === 'finished') continue;
        // Check if user is enrolled
        var parts = Array.isArray(t.participants) ? t.participants : [];
        var enrolled = parts.some(function(p) {
            var str = typeof p === 'string' ? p : (p.email || p.displayName || '');
            var pEmail = typeof p === 'object' ? (p.email || '') : str;
            var pUid = typeof p === 'object' ? (p.uid || '') : '';
            var pName = typeof p === 'object' ? (p.displayName || p.name || '') : str;
            return (cu.email && pEmail === cu.email) || (cu.uid && pUid === cu.uid) || (cu.displayName && pName === cu.displayName);
        });
        if (!enrolled) continue;

        var startStr = t.startDate.split('T')[0];
        var startDate = new Date(startStr + 'T00:00:00');
        var diffDays = Math.round((startDate - today) / (1000 * 60 * 60 * 24));

        var reminderKey = null;
        var reminderMsg = null;
        var reminderLevel = 'all';
        if (diffDays === 7) {
            reminderKey = 'reminder_7d_' + t.id;
            reminderMsg = _t('org.reminder7d', {name: t.name});
            reminderLevel = 'all';
        } else if (diffDays === 2) {
            reminderKey = 'reminder_2d_' + t.id;
            reminderMsg = _t('org.reminder2d', {name: t.name});
            reminderLevel = 'important';
        } else if (diffDays === 0) {
            reminderKey = 'reminder_0d_' + t.id;
            reminderMsg = _t('org.reminder0d', {name: t.name});
            reminderLevel = 'fundamental';
        }

        if (reminderKey && reminderMsg) {
            // Avoid duplicate: check localStorage
            var sentKey = '_notifSent_' + reminderKey + '_' + (cu.uid || cu.email);
            try {
                if (localStorage.getItem(sentKey)) continue;
            } catch(e) {}

            var uid = cu.uid || cu.email;
            await window._sendUserNotification(uid, {
                type: 'tournament_reminder',
                message: reminderMsg,
                tournamentId: String(t.id),
                tournamentName: t.name || '',
                level: reminderLevel
            });
            try { localStorage.setItem(sentKey, '1'); } catch(e) {}
        }
    }
};

/**
 * Check for new tournaments near user's preferred CEPs.
 * Called on app load when new tournaments exist.
 */
// Haversine distance in km between two lat/lng points
function _haversineKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

window._checkNearbyTournaments = async function() {
    if (!window.AppStore || !window.AppStore.currentUser || !window.FirestoreDB) return;
    var cu = window.AppStore.currentUser;

    // Location-based matching (primary) + legacy CEP matching (fallback)
    var userLocs = Array.isArray(cu.preferredLocations) ? cu.preferredLocations : [];
    var userCeps = (cu.preferredCeps || '').split(',').map(function(c) { return c.trim().replace(/\D/g, ''); }).filter(function(c) { return c.length >= 5; });
    if (userLocs.length === 0 && userCeps.length === 0) return;

    var NEARBY_RADIUS_KM = 15; // notify if tournament is within 15km
    // AppStore.tournaments is scoped to the user's own tournaments — this
    // check needs the opposite (public open tournaments the user ISN'T in
    // yet), so we query directly. Filtered to status='open' server-side so
    // we don't pull the whole DB.
    var tournaments = [];
    if (window.FirestoreDB && typeof window.FirestoreDB.loadOpenTournaments === 'function') {
        tournaments = await window.FirestoreDB.loadOpenTournaments();
    } else {
        tournaments = window.AppStore.tournaments || [];
    }
    var uid = cu.uid || cu.email;
    var _t = window._t || function(k) { return k; };

    for (var i = 0; i < tournaments.length; i++) {
        var t = tournaments[i];
        if (t.status === 'finished' || t.status === 'closed') continue;
        if (!t.venueAddress && !t.venue && !t.venueLat) continue;
        // Check if already notified
        var nKey = '_notifNearby_' + t.id + '_' + uid;
        try { if (localStorage.getItem(nKey)) continue; } catch(e) {}

        var matched = false;

        // 1) Distance-based matching (preferred)
        if (t.venueLat && t.venueLon && userLocs.length > 0) {
            var tLat = parseFloat(t.venueLat);
            var tLng = parseFloat(t.venueLon);
            if (!isNaN(tLat) && !isNaN(tLng)) {
                matched = userLocs.some(function(loc) {
                    return _haversineKm(loc.lat, loc.lng, tLat, tLng) <= NEARBY_RADIUS_KM;
                });
            }
        }

        // 2) Legacy CEP text matching (fallback)
        if (!matched && userCeps.length > 0 && (t.venueAddress || t.venue)) {
            var venueText = ((t.venueAddress || '') + ' ' + (t.venue || '')).replace(/\D/g, ' ');
            matched = userCeps.some(function(cep) { return venueText.indexOf(cep) !== -1; });
        }

        // Also check if tournament sport matches user preferred sports.
        // v0.17.2: removido compat string-CSV (auditoria L3.1) — alpha rule
        // permite descartar shape antigo, e nenhum caminho atual escreve
        // preferredSports como string. Doc legado com string vira no-match
        // gracioso (sportMatch=false), comportamento aceitável.
        var userSports = Array.isArray(cu.preferredSports)
          ? cu.preferredSports.join(',').toLowerCase()
          : '';
        var sportMatch = !userSports || (t.sport && userSports.indexOf(t.sport.toLowerCase()) !== -1);

        if (matched || sportMatch) {
            // Check if user is already enrolled
            var parts = Array.isArray(t.participants) ? t.participants : [];
            var enrolled = parts.some(function(p) {
                var str = typeof p === 'string' ? p : (p.email || '');
                var pEmail = typeof p === 'object' ? (p.email || '') : str;
                var pUid = typeof p === 'object' ? (p.uid || '') : '';
                var pName = typeof p === 'object' ? (p.displayName || p.name || '') : str;
                return (cu.email && pEmail === cu.email) || (cu.uid && pUid === cu.uid) || (cu.displayName && pName === cu.displayName);
            });
            if (enrolled) continue;

            await window._sendUserNotification(uid, {
                type: 'tournament_nearby',
                message: _t('org.nearbyMsg', {name: t.name, venuePart: t.venue ? ' em ' + t.venue : ''}),
                tournamentId: String(t.id),
                tournamentName: t.name || '',
                level: 'all'
            });
            try { localStorage.setItem(nKey, '1'); } catch(e) {}
        }
    }
};

/**
 * Organizer sends a communication to all enrolled participants.
 * Prompts for message text and importance level.
 */
window._sendOrgCommunication = function(tId) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t) return;

    // Build a custom modal for the communication
    var modalId = 'modal-org-comm-' + tId;
    var existing = document.getElementById(modalId);
    if (existing) existing.remove();

    var html = '<div id="' + modalId + '" class="modal-overlay active" style="z-index: 10000;">' +
      '<div class="modal" style="max-width: 480px; width: 95%;">' +
        '<div class="modal-header" style="padding: 1.5rem 1.5rem 0;">' +
          '<h2 class="card-title" style="margin: 0; font-size: 1rem;">📢 ' + (window._t||function(k){return k;})('org.commTitle') + '</h2>' +
          '<button class="modal-close" onclick="document.getElementById(\'' + modalId + '\').remove();">&times;</button>' +
        '</div>' +
        '<div class="modal-body" style="padding: 1.5rem;">' +
          '<p style="font-size: 0.75rem; color: var(--text-muted); margin: 0 0 1rem;">' + (window._t||function(k){return k;})('org.commDesc', { name: window._safeHtml(t.name || '') }) + '</p>' +
          '<div class="form-group" style="margin-bottom: 1rem;">' +
            '<label class="form-label" style="font-size: 0.8rem; font-weight: 600;">' + (window._t||function(k){return k;})('org.commMessage') + '</label>' +
            '<textarea id="org-comm-text-' + tId + '" class="form-control" rows="4" placeholder="' + (window._t||function(k){return k;})('org.commPlaceholder') + '" style="width: 100%; box-sizing: border-box; resize: vertical;"></textarea>' +
          '</div>' +
          '<div class="form-group" style="margin-bottom: 1rem;">' +
            '<label class="form-label" style="font-size: 0.8rem; font-weight: 600;">' + (window._t||function(k){return k;})('org.commLevel') + '</label>' +
            '<p style="font-size: 0.65rem; color: var(--text-muted); margin: 0 0 8px;">' + (window._t||function(k){return k;})('org.commLevelDesc') + '</p>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">' +
              '<button type="button" class="btn org-comm-level-btn" data-level="fundamental" onclick="window._selectCommLevel(this, \'' + tId + '\')" style="padding: 8px 6px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; border: 1px solid rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); color: #f87171; cursor: pointer; text-align: center;">🔴 ' + (window._t||function(k){return k;})('org.levelFundamental') + '</button>' +
              '<button type="button" class="btn org-comm-level-btn" data-level="important" onclick="window._selectCommLevel(this, \'' + tId + '\')" style="padding: 8px 6px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; border: 2px solid rgba(251,191,36,0.7); background: rgba(251,191,36,0.25); color: #fbbf24; cursor: pointer; text-align: center; box-shadow: 0 0 8px rgba(251,191,36,0.2);">🟡 ' + (window._t||function(k){return k;})('org.levelImportant') + '</button>' +
              '<button type="button" class="btn org-comm-level-btn" data-level="all" onclick="window._selectCommLevel(this, \'' + tId + '\')" style="padding: 8px 6px; border-radius: 10px; font-size: 0.7rem; font-weight: 600; border: 1px solid rgba(16,185,129,0.3); background: rgba(16,185,129,0.08); color: #10b981; cursor: pointer; text-align: center;">🟢 ' + (window._t||function(k){return k;})('org.levelGeneral') + '</button>' +
            '</div>' +
            '<input type="hidden" id="org-comm-level-' + tId + '" value="important">' +
          '</div>' +
          '<div style="display: flex; gap: 8px;">' +
            '<button type="button" class="btn btn-primary" style="flex: 1;" onclick="window._confirmSendComm(\'' + tId + '\')">' + (window._t||function(k){return k;})('org.sendComm') + '</button>' +
            '<button type="button" class="btn btn-outline" style="flex: 0.6;" onclick="document.getElementById(\'' + modalId + '\').remove();">' + (window._t||function(k){return k;})('org.cancel') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    document.body.insertAdjacentHTML('beforeend', html);
};

window._selectCommLevel = function(btn, tId) {
    var level = btn.getAttribute('data-level');
    document.getElementById('org-comm-level-' + tId).value = level;
    var btns = btn.parentElement.querySelectorAll('.org-comm-level-btn');
    var colors = { fundamental: 'rgba(239,68,68,', important: 'rgba(251,191,36,', all: 'rgba(16,185,129,' };
    btns.forEach(function(b) {
        var l = b.getAttribute('data-level');
        var c = colors[l];
        if (l === level) {
            b.style.background = c + '0.25)';
            b.style.border = '2px solid ' + c + '0.7)';
            b.style.boxShadow = '0 0 8px ' + c + '0.2)';
        } else {
            b.style.background = c + '0.08)';
            b.style.border = '1px solid ' + c + '0.3)';
            b.style.boxShadow = 'none';
        }
    });
};

window._confirmSendComm = async function(tId) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t) return;
    var textEl = document.getElementById('org-comm-text-' + tId);
    var levelEl = document.getElementById('org-comm-level-' + tId);
    var message = textEl ? textEl.value.trim() : '';
    var level = levelEl ? levelEl.value : 'important';
    if (!message) {
        var _t = window._t || function(k) { return k; };
        if (typeof showAlertDialog !== 'undefined') showAlertDialog(_t('org.msgRequired'), _t('org.msgRequiredDesc'), null, { type: 'warning' });
        return;
    }

    var cu = window.AppStore.currentUser;
    var fullMsg = _t('org.commFullMsg', {name: t.name, message: message});

    var result = await window._notifyTournamentParticipants(t, {
        type: 'organizer_communication',
        message: fullMsg,
        level: level
    }, cu ? cu.email : null);

    var modalEl = document.getElementById('modal-org-comm-' + tId);
    if (modalEl) modalEl.remove();

    var count = result ? result.emails.length + result.phones.length : 0;
    if (typeof showNotification !== 'undefined') showNotification((window._t||function(k){return k;})('org.commSentTitle'), (window._t||function(k){return k;})('org.commSentMsg'), 'success');

    // Open email/WhatsApp if collected
    if (result && result.emails.length > 0) {
        var emailSubject = encodeURIComponent('📢 ' + t.name + ' — Comunicado do Organizador');
        var emailBody = encodeURIComponent(message + '\n\n---\nTorneio: ' + t.name + '\n' + window._tournamentUrl(t.id));
        window.open('mailto:?bcc=' + result.emails.join(',') + '&subject=' + emailSubject + '&body=' + emailBody, '_self');
    }
    if (result && result.phones.length > 0) {
        var waMsg = '📢 ' + t.name + '\n' + message + '\n\n' + window._tournamentUrl(t.id);
        window.open(window._whatsappShareUrl(waMsg), '_blank');
    }
};

// ─── Save as Template ─────────────────────────────────────────────────────
window._saveAsTemplate = function(tId) {
  var t = (window.AppStore.tournaments || []).find(function(x) { return x.id === tId; });
  if (!t) return;
  var _t = window._t || function(k) { return k; };
  if (typeof showInputDialog === 'function') {
    showInputDialog(_t('template.namePrompt'), t.name, function(templateName) {
      if (!templateName || !templateName.trim()) return;
      var template = {
        name: templateName.trim(),
        sport: t.sport || '',
        format: t.format || '',
        scoring: t.scoring || null,
        genderCategories: t.genderCategories || [],
        skillCategories: t.skillCategories || [],
        combinedCategories: t.combinedCategories || [],
        enrollmentMode: t.enrollmentMode || 'open',
        maxParticipants: t.maxParticipants || '',
        courtCount: t.courtCount || '',
        gameDuration: t.gameDuration || '',
        venue: t.venue || '',
        venueLat: t.venueLat || null,
        venueLon: t.venueLon || null,
        venueAddress: t.venueAddress || '',
        teamSize: t.teamSize || 1
      };
      window._saveTemplate(template).then(function(result) {
        if (result === 'ok') {
          showNotification(_t('template.saved'), '', 'success');
        } else if (result === 'limit') {
          showNotification(_t('template.limitFree'), '', 'warning');
        } else {
          showNotification(_t('template.saveError'), _t('template.saveErrorMsg'), 'error');
        }
      })
    });
  }
};
