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
        logoShape: t.logoShape || 'square',
        logoRadius: (t.logoRadius != null ? t.logoRadius : 14),
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

// _skipDispatch: `true` pula e-mail E WhatsApp (só plataforma in-app). Também
// aceita um objeto `{ skipEmail, skipWhatsApp }` pra pular canais individuais —
// usado por "Falar com o organizador" (abre o WhatsApp direto pelo wa.me, então
// pula o auto-dispatch de WhatsApp mas mantém a cópia por e-mail).
window._sendUserNotification = async function(uid, notifData, _skipDispatch) {
    if (!window.FirestoreDB || !window.FirestoreDB.db || !uid) return;
    var _skipOpt = (_skipDispatch && typeof _skipDispatch === 'object') ? _skipDispatch : null;
    var _skipAll = (_skipDispatch === true);
    var _skipEmail = _skipAll || !!(_skipOpt && _skipOpt.skipEmail);
    var _skipWhatsApp = _skipAll || !!(_skipOpt && _skipOpt.skipWhatsApp);
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
        var email = (!_skipEmail && profile.notifyEmail !== false && profile.email) ? profile.email : null;
        // v1.3.37-beta: WhatsApp dispatch — Cloud Function processWhatsAppQueue
        // consome whatsapp_queue e POSTa pra Evolution API self-hosted no
        // Railway (infra/whatsapp/README.md). Só envia se opt-in explícito
        // (notifyWhatsApp=true) E telefone preenchido. Default é OFF —
        // notifyWhatsApp tem que ser truthy.
        var phone = (!_skipWhatsApp && profile.notifyWhatsApp === true && profile.phone) ? profile.phone : null;

        // Auto-dispatch email & WhatsApp for this individual notification
        // (skip when called from _notifyTournamentParticipants which does batch dispatch)
        if ((email || phone) && typeof window._dispatchChannels === 'function') {
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
    // v2.4.41: _t estava sendo declarado DENTRO do if(!message) — quando a
    // mensagem não era vazia (caso normal), _t ficava undefined e a linha
    // _t('org.commFullMsg', …) jogava "TypeError: _t is not a function",
    // travando o envio. Por isso o botão "Enviar Comunicado" não funcionava.
    var _t = window._t || function(k) { return k; };
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t) return;
    var textEl = document.getElementById('org-comm-text-' + tId);
    var levelEl = document.getElementById('org-comm-level-' + tId);
    var message = textEl ? textEl.value.trim() : '';
    var level = levelEl ? levelEl.value : 'important';
    if (!message) {
        if (typeof showAlertDialog !== 'undefined') showAlertDialog(_t('org.msgRequired'), _t('org.msgRequiredDesc'), null, { type: 'warning' });
        return;
    }

    // Desabilita o botão pra feedback.
    var _sendBtn = document.querySelector('#modal-org-comm-' + tId + ' .btn-primary');
    if (_sendBtn) { _sendBtn.disabled = true; _sendBtn.textContent = 'Enviando…'; }

    // v2.4.61: fan-out SERVER-SIDE via Cloud Function. Antes o loop sequencial
    // rodava no navegador (~1 ida ao Firestore por inscrito) — em torneios
    // grandes demorava ~30s travado em "Enviando…" (parecia que "nada
    // acontecia") e TRUNCAVA se a página fosse fechada antes do fim (inscritos
    // do fim da lista não recebiam). Agora 1 chamada e o servidor entrega a
    // todos (plataforma + e-mail digest + WhatsApp), independente da página.
    var result = null;
    try {
        var _resp = await firebase.functions().httpsCallable('sendOrgCommunication')({
            tournamentId: String(t.id),
            message: message,
            level: level
        });
        result = _resp && _resp.data ? _resp.data : null;
    } catch (e) {
        window._warn && window._warn('[orgComm] erro ao enviar', e);
        if (typeof showNotification !== 'undefined') showNotification('Erro', 'Não foi possível enviar o comunicado: ' + ((e && e.message) || e), 'error');
        if (_sendBtn) { _sendBtn.disabled = false; _sendBtn.textContent = _t('org.sendComm'); }
        return;
    }

    var modalEl = document.getElementById('modal-org-comm-' + tId);
    if (modalEl) modalEl.remove();

    if (typeof showNotification !== 'undefined') {
        var _n = result ? (result.platform || 0) : 0;
        showNotification(_t('org.commSentTitle'), _n ? ('Enviado para ' + _n + ' pessoa(s) — você incluído(a) pra monitorar.') : _t('org.commSentMsg'), 'success');
    }
};

// ─── v2.4.63: Painel de controle de comunicados ─────────────────────────────
// Lista os comunicados enviados (via listCommunications) e, ao clicar num,
// mostra o detalhamento por inscrito (via getCommunicationStats): pra quem foi,
// por quais canais (📱 plataforma / ✉️ e-mail / 💬 WhatsApp), quem abriu na
// plataforma e quem recebeu de fato no WhatsApp, com contagens.
window._commLevelLabel = function(level) {
    if (level === 'fundamental') return '🔴 Fundamental';
    if (level === 'important') return '🟠 Importante';
    return '🟢 Geral';
};

window._openCommunicationsPanel = async function(tId) {
    var modalId = 'modal-comms-' + tId;
    var existing = document.getElementById(modalId);
    if (existing) existing.remove();
    var html = '<div id="' + modalId + '" class="modal-overlay active" style="z-index:10000;">' +
      '<div class="modal" style="max-width:640px;width:96%;max-height:88vh;display:flex;flex-direction:column;">' +
        '<div class="modal-header" style="padding:1.25rem 1.25rem 0;">' +
          '<h2 class="card-title" style="margin:0;font-size:1rem;">📊 Comunicados enviados</h2>' +
          '<button class="modal-close" onclick="document.getElementById(\'' + modalId + '\').remove();">&times;</button>' +
        '</div>' +
        '<div class="modal-body" id="comms-list-' + tId + '" style="padding:1.25rem;overflow-y:auto;">' +
          (typeof window._renderBallLoader === 'function' ? window._renderBallLoader('Carregando…', { minHeight: '24vh', size: '2.4rem' }) : '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:1.5rem 0;">Carregando…</div>') +
        '</div>' +
      '</div>' +
    '</div>';
    document.body.insertAdjacentHTML('beforeend', html);

    var listEl = document.getElementById('comms-list-' + tId);
    try {
        var resp = await firebase.functions().httpsCallable('listCommunications')({ tournamentId: String(tId) });
        var data = resp && resp.data ? resp.data : { communications: [] };
        var comms = data.communications || [];
        if (!listEl) return;
        if (comms.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:1.5rem 0;">Nenhum comunicado enviado ainda.</div>';
            return;
        }
        var rows = comms.map(function(c) {
            var dt = c.sentAt ? new Date(c.sentAt) : null;
            var when = dt ? (dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})) : '';
            var preview = window._safeHtml((c.rawMessage || '').slice(0, 90)) + ((c.rawMessage || '').length > 90 ? '…' : '');
            var cc = c.counts || {};
            return '<div onclick="window._openCommunicationDetail(\'' + tId + '\',\'' + c.commId + '\')" style="cursor:pointer;border:1px solid var(--border-color,rgba(255,255,255,0.1));border-radius:10px;padding:12px 14px;margin-bottom:10px;transition:background .15s;" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'transparent\'">' +
                '<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:6px;">' +
                    '<span style="font-size:0.68rem;color:var(--text-muted);">' + window._commLevelLabel(c.level) + ' · ' + when + '</span>' +
                    '<span style="font-size:0.68rem;color:var(--text-muted);">' + (c.totalRecipients || 0) + ' inscrito(s) →</span>' +
                '</div>' +
                '<div style="font-size:0.85rem;color:var(--text-main);margin-bottom:8px;">' + (preview || '<i style="color:var(--text-muted);">(sem texto)</i>') + '</div>' +
                '<div style="display:flex;gap:12px;font-size:0.72rem;color:var(--text-muted);">' +
                    '<span>📱 ' + (cc.platformSent || 0) + '</span>' +
                    '<span>✉️ ' + (cc.emailSent || 0) + '</span>' +
                    '<span>💬 ' + (cc.whatsappSent || 0) + '</span>' +
                '</div>' +
            '</div>';
        }).join('');
        listEl.innerHTML = '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:10px;">📱 plataforma · ✉️ e-mail · 💬 WhatsApp — toque num comunicado pra ver quem recebeu e quem abriu.</div>' + rows;
    } catch (e) {
        if (listEl) listEl.innerHTML = '<div style="text-align:center;color:#f87171;font-size:0.82rem;padding:1.5rem 0;">Erro ao carregar: ' + window._safeHtml((e && e.message) || String(e)) + '</div>';
    }
};

window._openCommunicationDetail = async function(tId, commId) {
    var modalId = 'modal-comm-detail-' + commId;
    var existing = document.getElementById(modalId);
    if (existing) existing.remove();
    var html = '<div id="' + modalId + '" class="modal-overlay active" style="z-index:10001;">' +
      '<div class="modal" style="max-width:680px;width:96%;max-height:90vh;display:flex;flex-direction:column;">' +
        '<div class="modal-header" style="padding:1.25rem 1.25rem 0;">' +
          '<h2 class="card-title" style="margin:0;font-size:1rem;">📊 Detalhe do comunicado</h2>' +
          '<button class="modal-close" onclick="document.getElementById(\'' + modalId + '\').remove();">&times;</button>' +
        '</div>' +
        '<div class="modal-body" id="comm-detail-body-' + commId + '" style="padding:1.25rem;overflow-y:auto;">' +
          (typeof window._renderBallLoader === 'function' ? window._renderBallLoader('Carregando…', { minHeight: '24vh', size: '2.4rem' }) : '<div style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:1.5rem 0;">Carregando…</div>') +
        '</div>' +
      '</div>' +
    '</div>';
    document.body.insertAdjacentHTML('beforeend', html);

    var bodyEl = document.getElementById('comm-detail-body-' + commId);
    try {
        var resp = await firebase.functions().httpsCallable('getCommunicationStats')({ tournamentId: String(tId), commId: String(commId) });
        var d = resp && resp.data ? resp.data : null;
        if (!bodyEl) return;
        if (!d) { bodyEl.innerHTML = '<div style="color:#f87171;">Sem dados.</div>'; return; }
        var c = d.counts || {};
        var dt = d.sentAt ? new Date(d.sentAt) : null;
        var when = dt ? (dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})) : '';

        function statCard(icon, title, lines) {
            return '<div style="flex:1;min-width:130px;border:1px solid var(--border-color,rgba(255,255,255,0.1));border-radius:10px;padding:10px 12px;">' +
                '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;">' + icon + ' ' + title + '</div>' + lines + '</div>';
        }
        function bigNum(n, label) { return '<div style="font-size:1.3rem;font-weight:800;color:var(--text-main);line-height:1;">' + n + '<span style="font-size:0.68rem;font-weight:400;color:var(--text-muted);"> ' + label + '</span></div>'; }

        var summary =
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">' + window._commLevelLabel(d.level) + ' · ' + when + '</div>' +
            '<div style="font-size:0.9rem;color:var(--text-main);background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 12px;margin-bottom:14px;">' + (window._safeHtml(d.rawMessage || '') || '<i>(sem texto)</i>') + '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' +
                statCard('📱', 'Plataforma', bigNum(c.platformSent || 0, 'enviadas') + '<div style="font-size:0.78rem;color:#34d399;margin-top:4px;">' + (c.platformOpened || 0) + ' abriram</div>') +
                statCard('✉️', 'E-mail', bigNum(c.emailSent || 0, 'enviados') + '<div style="font-size:0.78rem;color:#34d399;margin-top:4px;">' + ((c.emailDelivered != null) ? c.emailDelivered : (c.emailSent || 0)) + ' entregues' + (c.emailBounced ? ' · <span style="color:#f87171;">' + c.emailBounced + ' falharam</span>' : '') + '</div>') +
                statCard('💬', 'WhatsApp', bigNum(c.whatsappSent || 0, 'enviadas') + '<div style="font-size:0.78rem;color:#34d399;margin-top:4px;">' + (c.whatsappDelivered || 0) + ' entregues</div>') +
            '</div>';

        var recips = d.recipients || [];
        // ✓ = enviado · ✓✓ = entregue. Sem canal = —.
        function deliveryCheck(sent, delivered, sentTitle, deliveredTitle) {
            if (!sent) return '<span style="opacity:0.3;">—</span>';
            if (delivered) return '<span style="color:#34d399;font-weight:700;letter-spacing:-3px;padding-right:3px;white-space:nowrap;" title="' + deliveredTitle + '">✓✓</span>';
            return '<span style="color:var(--text-muted);" title="' + sentTitle + '">✓</span>';
        }
        var cellSt = 'padding:6px 2px;text-align:center;font-size:0.95rem;';
        // E-mail (v2.4.86): presume ENTREGUE (✓✓) — só rebaixa pra ✗ vermelho
        // quando o servidor devolve falha (e-mail inválido / caixa cheia).
        // Compat: comunicados servidos antes do deploy não trazem emailBounced/
        // emailDelivered → tratamos como entregue (sem retorno de falha).
        function emailCheck(r) {
            if (!r.email) return '<span style="opacity:0.3;">—</span>';
            if (r.emailBounced) return '<span style="color:#f87171;font-weight:700;" title="Falha na entrega: e-mail inválido ou caixa cheia (bounce)">✗</span>';
            return '<span style="color:#34d399;font-weight:700;letter-spacing:-3px;padding-right:3px;white-space:nowrap;" title="Entregue (presumido — sem retorno de falha)">✓✓</span>';
        }
        var rowsHtml = recips.map(function(r) {
            var nameHtml = window._safeHtml(r.name || '') + (r.isOrganizer ? ' <span style="font-size:0.62rem;color:#a5b4fc;">(você)</span>' : '');
            return '<tr style="border-top:1px solid var(--border-color,rgba(255,255,255,0.07));' + (r.isOrganizer ? 'background:rgba(99,102,241,0.06);' : '') + '">' +
                '<td style="padding:6px 4px;font-size:0.78rem;color:var(--text-main);word-break:break-word;">' + nameHtml + '</td>' +
                // Plataforma: aberto = entregue (✓✓)
                '<td style="' + cellSt + '">' + deliveryCheck(r.platform, r.platformOpened, 'enviado', 'aberto') + '</td>' +
                // E-mail: ✓✓ presumido, ✗ se bounce.
                '<td style="' + cellSt + '">' + emailCheck(r) + '</td>' +
                '<td style="' + cellSt + '">' + deliveryCheck(r.whatsapp, r.whatsappDelivered, 'enviado', 'entregue') + '</td>' +
            '</tr>';
        }).join('');
        var table = '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;">Por inscrito (' + recips.length + ')' + (d.skippedCount ? ' · ' + d.skippedCount + ' sem canal/elegibilidade' : '') + '</div>' +
            '<div style="font-size:0.66rem;color:var(--text-muted);margin-bottom:8px;line-height:1.55;"><span style="color:var(--text-muted);">✓</span> enviado · <span style="color:#34d399;font-weight:700;letter-spacing:-3px;">✓✓</span> entregue · <span style="color:#f87171;font-weight:700;">✗</span> falhou<br><span style="opacity:0.9;">✉️ No <b>e-mail</b>, ✓✓ = <b>entregue</b> (presumido) — só vira <span style="color:#f87171;">✗</span> se o servidor devolver falha (<b>e-mail inválido</b> ou <b>caixa cheia</b>).</span></div>' +
            '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">' +
            '<colgroup><col><col style="width:48px;"><col style="width:48px;"><col style="width:48px;"></colgroup>' +
            '<thead><tr style="font-size:0.7rem;color:var(--text-muted);">' +
                '<th style="text-align:left;padding:4px 4px;">Inscrito</th>' +
                '<th style="text-align:center;padding:4px 2px;font-size:1rem;" title="Plataforma">📱</th>' +
                '<th style="text-align:center;padding:4px 2px;font-size:1rem;" title="E-mail">✉️</th>' +
                '<th style="text-align:center;padding:4px 2px;font-size:1rem;" title="WhatsApp">💬</th>' +
            '</tr></thead><tbody>' + rowsHtml + '</tbody></table>';

        bodyEl.innerHTML = summary + table;
    } catch (e) {
        if (bodyEl) bodyEl.innerHTML = '<div style="text-align:center;color:#f87171;font-size:0.82rem;padding:1.5rem 0;">Erro ao carregar: ' + window._safeHtml((e && e.message) || String(e)) + '</div>';
    }
};

// ─── Falar com o organizador (de quem NÃO é o organizador) ──────────────────
// v2.4.82: PADRONIZADO entre dashboard e detalhe do torneio. O botão é neutro
// (azul) por default e é "hidratado" pra VERDE + ícone de WhatsApp quando o
// organizador tem telefone — sinalizando o canal real antes do clique. O clique
// abre SEMPRE um diálogo pra digitar; no envio a mensagem vai pela plataforma
// (in-app) SEMPRE, mais o canal externo: WhatsApp (wa.me) se tiver telefone, ou
// o compositor de e-mail (mailto) caso só haja e-mail. No caminho WhatsApp,
// manda também uma cópia por e-mail (skipWhatsApp no dispatch evita duplicar o
// WhatsApp, já que o wa.me entrega direto).
var _WA_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true" style="flex-shrink:0;"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.42 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 10.37c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"/></svg>';

// Botão canônico — usado por dashboard.js e tournaments.js (detalhe). Começa
// azul "Falar com o organizador"; _hydrateContactOrgButtons flipa pra verde
// (WhatsApp) quando o organizador tem telefone.
window._contactOrgButtonHtml = function(t, opts) {
  opts = opts || {};
  if (!t || (!t.creatorUid && !t.organizerEmail)) return '';
  var tId = window._safeHtml(String(t.id));
  var uid = window._safeHtml(String(t.creatorUid || ''));
  var full = opts.fullWidth ? 'width:100%;' : '';
  var mt = (opts.marginTop != null) ? opts.marginTop : '10px';
  var html = '<button type="button" class="sp-contact-org-btn hover-lift" data-contact-org-uid="' + uid + '" ' +
    'onclick="event.stopPropagation();window._contactOrganizer(\'' + tId + '\')" ' +
    'style="' + full + 'margin-top:' + mt + ';display:inline-flex;align-items:center;justify-content:center;gap:8px;background:rgba(59,130,246,0.12);color:#60a5fa;border:1px solid rgba(59,130,246,0.38);border-radius:10px;padding:9px 14px;font-size:0.82rem;font-weight:700;cursor:pointer;transition:background 0.15s,border-color 0.15s,color 0.15s;">' +
    '<span class="sp-contact-org-ic" style="display:inline-flex;align-items:center;">💬</span>' +
    '<span class="sp-contact-org-lb">Falar com o organizador</span></button>';
  // Auto-hidrata (debounced) — não precisa o caller chamar nada após inserir.
  if (window._spContactHydrateTimer) clearTimeout(window._spContactHydrateTimer);
  window._spContactHydrateTimer = setTimeout(function(){ try { window._hydrateContactOrgButtons(document); } catch(e){} }, 60);
  return html;
};

// Carrega o perfil do organizador (cacheado por sessão) e, se tiver telefone,
// pinta o botão de verde + ícone WhatsApp. Idempotente por elemento.
window._hydrateContactOrgButtons = async function(root) {
  root = root || document;
  var btns = root.querySelectorAll('.sp-contact-org-btn[data-contact-org-uid]');
  if (!btns.length) return;
  var cache = window._spOrgProfileCache = window._spOrgProfileCache || {};
  for (var i = 0; i < btns.length; i++) {
    var btn = btns[i];
    if (btn._spHydrated) continue;
    btn._spHydrated = true;
    var uid = btn.getAttribute('data-contact-org-uid');
    if (!uid) continue;
    var prof = cache[uid];
    if (prof === undefined) {
      try { prof = (window.FirestoreDB && window.FirestoreDB.loadUserProfile) ? await window.FirestoreDB.loadUserProfile(uid) : null; }
      catch (e) { prof = null; }
      cache[uid] = prof || null;
    }
    var phone = (prof && prof.phone) ? String(prof.phone).replace(/\D/g, '') : '';
    var waOk = phone.length >= 10 && prof && prof.notifyWhatsApp !== false;
    if (waOk) {
      btn.style.background = 'linear-gradient(135deg,#25D366,#128C7E)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'rgba(18,140,126,0.6)';
      var ic = btn.querySelector('.sp-contact-org-ic');
      if (ic) ic.innerHTML = _WA_ICON_SVG;
    }
  }
};

// Entry point — resolve o contato do organizador e abre o diálogo.
window._contactOrganizer = async function(tId) {
  var t = window.AppStore && window.AppStore.tournaments &&
          window.AppStore.tournaments.find(function(x){ return String(x.id) === String(tId); });
  if (!t) { if (typeof showNotification !== 'undefined') showNotification('Torneio não encontrado', '', 'error'); return; }

  var profile = null;
  try {
    if (t.creatorUid && window.FirestoreDB && window.FirestoreDB.loadUserProfile) {
      profile = await window.FirestoreDB.loadUserProfile(t.creatorUid);
    }
  } catch (e) { profile = null; }

  var orgName = t.organizerName || (profile && profile.displayName) ||
                (t.organizerEmail ? String(t.organizerEmail).split('@')[0] : '') || 'o organizador';
  var phoneDigits = (profile && profile.phone) ? String(profile.phone).replace(/\D/g, '') : '';
  var email = (profile && profile.email) || t.organizerEmail || '';
  var useWhatsApp = phoneDigits.length >= 10 && (!profile || profile.notifyWhatsApp !== false);
  var phoneFull = '';
  if (useWhatsApp) {
    var cc = (profile && profile.phoneCountry ? String(profile.phoneCountry).replace(/\D/g, '') : '') || '55';
    // Telefone canônico já vem com DDI (>=12 díg). Sem DDI (legado, ~11) → prefixa.
    phoneFull = phoneDigits.length >= 12 ? phoneDigits : (cc + phoneDigits);
  }
  if (!useWhatsApp && !(email && email.indexOf('@') !== -1) && !t.creatorUid) {
    if (typeof showNotification !== 'undefined') {
      showNotification('Contato indisponível', 'O organizador ainda não cadastrou telefone ou e-mail de contato.', 'info');
    }
    return;
  }
  window._pendingContactOrg = { tId: String(tId), useWhatsApp: useWhatsApp, phoneFull: phoneFull, email: email, orgName: orgName };
  window._openContactOrgDialog(tId);
};

// Alias retrocompat (chamado por código/links antigos).
window._messageOrganizer = function(tId) { return window._contactOrganizer(tId); };

window._openContactOrgDialog = function(tId) {
  var pend = window._pendingContactOrg || {};
  var t = window.AppStore.tournaments.find(function(x){ return String(x.id) === String(tId); });
  if (!t) return;
  var modalId = 'modal-msg-org-' + tId;
  var old = document.getElementById(modalId); if (old) old.remove();

  var useWhatsApp = !!pend.useWhatsApp;
  var hasEmail = !!(pend.email && pend.email.indexOf('@') !== -1);
  var cu = window.AppStore.currentUser;
  var senderName = (cu && (cu.displayName || cu.name)) || '';
  var firstName = String(pend.orgName || '').split(/[\s@]/)[0] || '';
  var greet = 'Olá' + (firstName ? ' ' + firstName : '') + '! ' +
    (senderName ? 'Sou ' + senderName + ', participante' : 'Sou participante') +
    ' do torneio "' + (t.name || '') + '" no scoreplace.app. ';

  var channelNote = useWhatsApp ? 'Vai pela plataforma e abre o WhatsApp do organizador (com cópia por e-mail).' :
                    hasEmail ? 'Vai pela plataforma e abre seu e-mail pro organizador.' :
                    'Vai pela plataforma pro organizador.';
  var sendLabel = useWhatsApp ? (_WA_ICON_SVG + '<span>Enviar pelo WhatsApp</span>') :
                  hasEmail ? '✉️ Enviar por e-mail' : 'Enviar';
  var sendStyle = useWhatsApp ? 'background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;border:none;' :
                                'background:#3b82f6;color:#fff;border:none;';

  var html = '<div id="' + modalId + '" class="modal-overlay active" style="z-index:10000;">' +
    '<div class="modal" style="max-width:460px;width:95%;">' +
      '<div class="modal-header" style="padding:1.5rem 1.5rem 0;">' +
        '<h2 class="card-title" style="margin:0;font-size:1rem;">💬 Falar com o organizador</h2>' +
        '<button class="modal-close" onclick="document.getElementById(\'' + modalId + '\').remove();">&times;</button>' +
      '</div>' +
      '<div class="modal-body" style="padding:1.5rem;">' +
        '<p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 1rem;">Mensagem para <b>' + window._safeHtml(pend.orgName || 'o organizador') + '</b>. ' + channelNote + '</p>' +
        '<textarea id="msg-org-text-' + tId + '" class="form-control" rows="4" placeholder="Escreva sua mensagem…" style="width:100%;box-sizing:border-box;resize:vertical;">' + window._safeHtml(greet) + '</textarea>' +
        '<div style="display:flex;gap:8px;margin-top:1rem;">' +
          '<button type="button" class="sp-send-org hover-lift" style="flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;' + sendStyle + 'border-radius:10px;padding:10px 14px;font-size:0.85rem;font-weight:700;cursor:pointer;" onclick="window._submitContactOrg(\'' + tId + '\')">' + sendLabel + '</button>' +
          '<button type="button" class="btn btn-outline" style="flex:0.5;" onclick="document.getElementById(\'' + modalId + '\').remove();">Cancelar</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
  document.body.insertAdjacentHTML('beforeend', html);
  // Cursor no fim do texto pré-preenchido, pronto pra continuar.
  setTimeout(function(){
    var ta = document.getElementById('msg-org-text-' + tId);
    if (ta) { ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch(e){} }
  }, 30);
};

window._submitContactOrg = async function(tId) {
  var pend = window._pendingContactOrg || {};
  var t = window.AppStore.tournaments.find(function(x){ return String(x.id) === String(tId); });
  if (!t) return;
  var textEl = document.getElementById('msg-org-text-' + tId);
  var fullMsg = textEl ? textEl.value.trim() : '';
  if (!fullMsg) {
    if (typeof showAlertDialog !== 'undefined') showAlertDialog('Mensagem vazia', 'Escreva uma mensagem antes de enviar.', null, { type: 'warning' });
    return;
  }
  var cu = window.AppStore.currentUser;
  var senderName = (cu && (cu.displayName || cu.name)) || 'Um participante';
  var btn = document.querySelector('#modal-msg-org-' + tId + ' .sp-send-org');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerHTML = 'Enviando…'; }

  // Plataforma (in-app) SEMPRE → criador + co-organizadores ativos. No caminho
  // WhatsApp, manda cópia por e-mail mas pula o auto-WhatsApp (o wa.me entrega).
  // No caminho e-mail/plataforma, só in-app (o mailto entrega o e-mail).
  var skipOpt = pend.useWhatsApp ? { skipWhatsApp: true } : true;
  var targets = [];
  if (t.creatorUid) targets.push({ uid: t.creatorUid, email: t.organizerEmail || '' });
  (Array.isArray(t.coHosts) ? t.coHosts : []).forEach(function(ch){ if (ch.status === 'active') targets.push({ uid: ch.uid || '', email: ch.email || '' }); });
  if (targets.length === 0 && t.organizerEmail) targets.push({ uid: '', email: t.organizerEmail });

  var seen = {};
  for (var i = 0; i < targets.length; i++) {
    var o = targets[i]; var uid = o.uid;
    if (!uid && o.email && window.FirestoreDB && window.FirestoreDB.db) {
      try { var snap = await window.FirestoreDB.db.collection('users').where('email', '==', o.email).limit(1).get(); if (!snap.empty) uid = snap.docs[0].id; } catch (e) {}
    }
    if (uid && !seen[uid]) {
      seen[uid] = true;
      try {
        await window._sendUserNotification(uid, {
          type: 'player_to_organizer', level: 'fundamental',
          tournamentId: String(t.id), tournamentName: t.name || 'torneio',
          message: fullMsg, fromName: senderName
        }, skipOpt);
      } catch (e) {}
    }
  }

  var modalEl = document.getElementById('modal-msg-org-' + tId);
  if (modalEl) modalEl.remove();

  // Canal externo: conversa de WhatsApp OU compositor de e-mail, já preenchido.
  try {
    if (pend.useWhatsApp && pend.phoneFull) {
      window.open('https://wa.me/' + pend.phoneFull + '?text=' + encodeURIComponent(fullMsg), '_blank', 'noopener');
    } else if (pend.email && pend.email.indexOf('@') !== -1) {
      var subject = encodeURIComponent('Torneio: ' + (t.name || ''));
      window.open('mailto:' + pend.email + '?subject=' + subject + '&body=' + encodeURIComponent(fullMsg), '_self');
    }
  } catch (e) {}

  if (typeof showNotification !== 'undefined') {
    showNotification('Mensagem enviada',
      pend.useWhatsApp ? 'Abrimos o WhatsApp e avisamos o organizador na plataforma.' :
      (pend.email && pend.email.indexOf('@') !== -1) ? 'Abrimos seu e-mail e avisamos o organizador na plataforma.' :
      'O organizador foi avisado na plataforma.',
      'success');
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
