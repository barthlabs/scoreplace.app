// tournaments-enrollment.js — Enrollment/deenrollment system (extracted from tournaments.js)

(function() {
var _t = window._t || function(k) { return k; };

// ── IDENTIDADE = uid no enroll/pareamento ────────────────────────────────────
// Fecha a classe de bug do parceiro/participante gravado só por NOME (o sumiço do
// Adriano: dupla formada com p2Name mas p2Uid vazio). Regra do dono: quem TEM
// conta entra pelo uid; só cai pra nome quem realmente não tem conta (informal).
// Nome é único entre uids → normalmente resolve pra 0 (informal) ou 1 conta;
// 2+ (homônimo legado) PERGUNTA qual, nunca grava às cegas. cb(uid|null).
window._resolveEnrolleeUid = function (name, cb) {
    cb = cb || function () {};
    if (!name || !window.FirestoreDB || typeof window.FirestoreDB.resolveNameToAccounts !== 'function') { cb(null); return; }
    window.FirestoreDB.resolveNameToAccounts(name).then(function (res) {
        if (res && res.status === 'unique') { cb(res.uid || null); return; }
        if (res && res.status === 'ambiguous') { window._pickHomonym(name, res.candidates, cb); return; }
        cb(null); // none → sem conta (participante informal)
    }).catch(function () { cb(null); });
};

// Resolve uma LISTA de nomes → lista de uids (mesma ordem; null p/ informal).
// Encadeia pra que ambiguidades sejam perguntadas uma de cada vez.
window._resolveEnrolleeUids = function (names, cb) {
    cb = cb || function () {};
    var out = [], i = 0;
    (function next() {
        if (i >= names.length) { cb(out); return; }
        window._resolveEnrolleeUid(names[i], function (uid) { out.push(uid || null); i++; next(); });
    })();
};

// Picker de homônimo: 2+ contas com o mesmo nome (resíduo legado). Mostra e-mail/
// telefone mascarado; a pessoa escolhe qual, ou "sem conta" (informal). cb(uid|null).
window._pickHomonym = function (name, candidates, cb) {
    cb = cb || function () {};
    var _mE = function (e) { e = String(e || ''); var at = e.indexOf('@'); return at < 1 ? e : (e[0] + '***' + e.slice(at)); };
    var _mP = function (p) { p = String(p || ''); return p.length < 4 ? p : ('***' + p.slice(-4)); };
    var esc = window._safeHtml || function (s) { return String(s == null ? '' : s); };
    var ov = document.createElement('div');
    ov.id = 'homonym-picker';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:16px;';
    var rows = candidates.map(function (c, i) {
        var sub = [c.email ? _mE(c.email) : '', c.phone ? _mP(c.phone) : ''].filter(Boolean).join(' · ') || 'sem contato';
        return '<button type="button" data-hom="' + i + '" style="display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;border-radius:10px;border:1px solid var(--border-color,rgba(255,255,255,0.15));background:var(--bg-dark,#0f172a);color:var(--text-main,#e2e8f0);cursor:pointer;">' +
            '<b>' + esc(c.displayName || name) + '</b><br><span style="font-size:0.8rem;color:var(--text-muted);">' + esc(sub) + '</span></button>';
    }).join('');
    ov.innerHTML = '<div style="background:var(--bg-card,#1e293b);border-radius:14px;padding:18px;max-width:420px;width:100%;">' +
        '<div style="font-weight:800;margin-bottom:4px;">Qual "' + esc(name) + '"?</div>' +
        '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;">Há mais de uma conta com esse nome. Escolha a pessoa certa pra vincular pelo perfil (uid).</div>' +
        rows +
        '<button type="button" data-hom="none" style="display:block;width:100%;text-align:left;margin:10px 0 0;padding:10px 12px;border-radius:10px;border:1px dashed var(--border-color,rgba(255,255,255,0.2));background:transparent;color:var(--text-muted);cursor:pointer;">Nenhum destes — inscrever sem conta (informal)</button>' +
    '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-hom]') : null;
        if (!btn) return; // clicar fora não fecha: a escolha é obrigatória
        var v = btn.getAttribute('data-hom');
        try { ov.remove(); } catch (_e) {}
        if (v === 'none') { cb(null); return; }
        var idx = parseInt(v, 10);
        cb((candidates[idx] && candidates[idx].uid) || null);
    });
};

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

    // ── Rigor da inscrição: informações exigidas (v1.15.31) ────────────────────
    // Os toggles do organizador definem O QUE é exigido no perfil. No OFICIAL,
    // faltando algo → bloqueia. No MODERADO → deixa entrar mas AVISA (notice).
    var rigor = t.rigor || 'casual';
    if (rigor !== 'casual') {
        var req = t.rigorRequire || {};
        var missing = [];
        if (req.gender && !user.gender) missing.push('gênero');
        if (req.category) {
            var hasSkill = (user.skillBySport && t.sport && user.skillBySport[t.sport]) || user.defaultCategory;
            if (!hasSkill) missing.push('categoria/nível');
        }
        if (req.age && !user.birthDate) missing.push('data de nascimento');
        if (req.history) {
            var hasHist = user.letzplayImport || (user.letzplayHandle && user.letzplayConsent === true);
            if (!hasHist) missing.push('histórico do letzplay (@ + autorização)');
        }
        if (missing.length) {
            var list = missing.join(', ');
            if (rigor === 'oficial') {
                return { ok: false, title: 'Complete seu perfil pra se inscrever',
                    msg: 'Este torneio é Oficial e exige no seu perfil: ' + list + '. Atualize seu perfil e tente de novo.' };
            }
            // moderado → avisa, mas permite inscrever
            return { ok: true, notice: { title: 'Perfil incompleto',
                msg: 'Faltam no seu perfil: ' + list + '. Você foi inscrito, mas o organizador pode pedir esses dados — complete quando puder.' } };
        }
    }

    return { ok: true };
}

// Helper: check if late enrollment to standby is allowed
function _allowsLateEnrollment(t) {
  // valor EFETIVO da fase corrente (per-phase sobrepõe o top-level) — cada fase gerencia a sua.
  var le = (window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment) || 'closed';
  return le === 'standby' || le === 'expand';
}

// v2.1.66/67: plano de presença ("Planejar ida") vinculado ao torneio.
// Calcula a janela desejada (início + duração estimada do torneio) a partir do
// torneio atual. Retorna null se não há DATA+HORA+LOCAL (ou é Liga). Fonte única
// usada por criar/sincronizar — garante consistência.
window._computeTournamentPlanWindow = function(t) {
  if (!t || !window.PresenceDB) return null;
  if (window._isLigaFormat && window._isLigaFormat(t)) return null;          // temporada contínua
  if (!t.startDate || String(t.startDate).indexOf('T') === -1) return null;  // exige hora
  var startsAt = new Date(t.startDate).getTime();
  if (isNaN(startsAt)) return null;
  // v2.6.44: torneio de LONGA DURAÇÃO (mais de 1 dia) NÃO ganha "ida planejada" na
  // largada. Em multi-dia cada rodada é combinada à parte (ex.: Rei/Rainha gera grupos
  // no WhatsApp pra cada grupo marcar dia/hora), e o lançamento costuma ser pelos
  // próprios competidores — um plano único de presença no início engana o inscrito.
  if (t.endDate) {
    var _endTs = new Date(t.endDate).getTime();
    if (!isNaN(_endTs) && (_endTs - startsAt) > 24 * 3600000) return null;
  }
  var venueName = t.venue || t.venueName || '';
  var placeId = window.PresenceDB.venueKey(t.venuePlaceId || '', venueName);
  if (!placeId) return null;                                                 // exige local
  var endsAt = null;
  if (typeof window._estimateTournamentMinutes === 'function') {
    var mins = window._estimateTournamentMinutes(t);
    if (mins > 0) endsAt = startsAt + mins * 60000;
  }
  if (!endsAt && t.endDate) { var e = new Date(t.endDate).getTime(); if (!isNaN(e) && e > startsAt) endsAt = e; }
  if (!endsAt) endsAt = startsAt + 3 * 3600000;
  var MAX = 12 * 3600000;
  if (endsAt - startsAt > MAX) endsAt = startsAt + MAX;                       // cap 1 sessão
  var sport = window.PresenceDB.normalizeSport(t.sport || '');
  var w = { startsAt: startsAt, endsAt: endsAt, placeId: placeId, venueName: venueName, sports: sport ? [sport] : [] };
  if (t.venueLat) { var la = parseFloat(t.venueLat); if (!isNaN(la)) w.venueLat = la; }
  if (t.venueLon) { var lo = parseFloat(t.venueLon); if (!isNaN(lo)) w.venueLon = lo; }
  return w;
};

// Acha o plano de presença do usuário vinculado a ESTE torneio (ativo).
window._findTournamentPresencePlan = function(uid, tId) {
  if (!window.PresenceDB || typeof window.PresenceDB.loadMyActive !== 'function' || !uid) return Promise.resolve(null);
  return window.PresenceDB.loadMyActive(uid).then(function(list) {
    return (list || []).find(function(p) {
      return p && p.type === 'planned' && String(p.tournamentId) === String(tId);
    }) || null;
  }).catch(function() { return null; });
};

// Cria o "Planejar ida" ao se inscrever (dedup do PresenceDB evita duplicar).
window._maybeCreateTournamentPresencePlan = function(t, user) {
  try {
    if (!t || !user || !user.uid || !window.PresenceDB || typeof window.PresenceDB.savePresence !== 'function') return;
    var w = window._computeTournamentPlanWindow(t);
    if (!w) return;
    var payload = Object.assign({
      uid: user.uid,
      email_lower: (user.email || '').toLowerCase(),
      displayName: user.displayName || user.name || '',
      photoURL: user.photoURL || '',
      type: 'planned',
      visibility: (user.presenceVisibility === 'public' ? 'public' : 'friends'),
      source: 'tournament',
      tournamentId: t.id
    }, w);
    window.PresenceDB.savePresence(payload).then(function() {
      // v3.1.50: o plano é criado já na inscrição (pra sincronizar depois), MAS o toast
      // "Ida planejada" só faz sentido quando o torneio está dentro da janela visível de
      // presença (≤24h) — mesma regra do _tournVisibleNow. Antes disparava pra torneio a
      // dias de distância, o que confunde (a "ida planejada" nem aparece no Place/dashboard
      // ainda). Plano segue criado; só o aviso espera a hora certa.
      var _visibleSoon = !w.startsAt || w.startsAt <= (Date.now() + 24 * 3600000);
      if (typeof showNotification !== 'undefined' && _visibleSoon) {
        var _hh = function(ms){ var d = new Date(ms); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); };
        showNotification('🗓️ Ida planejada', (w.venueName || 'Local') + ' · ' + _hh(w.startsAt) + '–' + _hh(w.endsAt), 'info');
      }
    }).catch(function(){});
  } catch (e) {}
};

// (1) Cancela o plano de presença ao DESINSCREVER do torneio.
window._cancelTournamentPresencePlan = function(t, user) {
  try {
    if (!t || !user || !user.uid || !window.PresenceDB) return;
    window._findTournamentPresencePlan(user.uid, t.id).then(function(plan) {
      var id = plan && (plan._id || plan.id);
      if (id && typeof window.PresenceDB.cancelPresence === 'function') window.PresenceDB.cancelPresence(id);
    });
  } catch (e) {}
};

// (2) Sincroniza o plano do usuário com o torneio atual — propaga mudanças de
// DATA/HORA/LOCAL feitas pelo organizador (cada usuário atualiza o PRÓPRIO plano
// quando abre o torneio; só o dono pode escrever a própria presença). Cria se
// não existir e o usuário está inscrito.
window._syncTournamentPresencePlan = function(t, user) {
  try {
    if (!t || !user || !user.uid || !window.PresenceDB) return;
    var enrolled = (typeof window._isUserEnrolledInTournament === 'function') ? window._isUserEnrolledInTournament(user, t) : true;
    if (!enrolled) return;
    var w = window._computeTournamentPlanWindow(t);
    if (!w) return; // torneio sem data/hora/local atualmente — não mexe
    window._findTournamentPresencePlan(user.uid, t.id).then(function(plan) {
      if (!plan) { window._maybeCreateTournamentPresencePlan(t, user); return; }
      var id = plan._id || plan.id;
      var changed = (plan.startsAt !== w.startsAt) || (plan.endsAt !== w.endsAt) || (plan.placeId !== w.placeId);
      if (id && changed && typeof window.PresenceDB.updatePresence === 'function') {
        window.PresenceDB.updatePresence(id, {
          startsAt: w.startsAt, endsAt: w.endsAt,
          dayKey: window.PresenceDB.dayKey(new Date(w.startsAt)),
          placeId: w.placeId, venueName: w.venueName, sports: w.sports,
          venueLat: w.venueLat, venueLon: w.venueLon
        });
      }
    });
  } catch (e) {}
};

// Helper: add participant to standby/waitlist instead of main roster
function _enrollToStandby(t, tId, participantObj, callback) {
  if (!Array.isArray(t.standbyParticipants)) t.standbyParticipants = [];
  var getName = function(p) { return window._pName(p); };
  var newName = getName(participantObj);
  // v3.0.76: dedup uid-first (nome só fallback). Dois inscritos de mesmo nome
  // (uids distintos) não colidem mais; dupla casa por QUALQUER uid de slot
  // (p1Uid/p2Uid). Entrada string ou sem uid cai no fallback por nome.
  var _uidsOf = function(x) {
    return (typeof window._participantUids === 'function') ? window._participantUids(x)
         : (x && typeof x === 'object' && x.uid ? [x.uid] : []);
  };
  var newUids = _uidsOf(participantObj);
  var _sameEntry = function(p) {
    var pu = _uidsOf(p);
    // Ambos os lados têm uid → identidade é SÓ por uid: homônimos de uids
    // distintos NÃO colidem; dupla casa por qualquer slot (p1Uid/p2Uid).
    if (newUids.length && pu.length) return pu.some(function(u){ return newUids.indexOf(u) !== -1; });
    // Algum lado sem uid (informal/legado) → fallback por nome.
    return getName(p) === newName;
  };
  // Check if already in standby
  var already = t.standbyParticipants.some(_sameEntry);
  if (already) {
    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.alreadyWaitlisted'), _t('enroll.alreadyWaitlistedMsg', { name: newName }), 'info');
    return;
  }
  // Check if already enrolled
  var partsArr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  var alreadyEnrolled = partsArr.some(_sameEntry);
  if (alreadyEnrolled) {
    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.alreadyEnrolled'), _t('enroll.alreadyEnrolledSingle', { name: newName }), 'info');
    return;
  }
  t.standbyParticipants.push(participantObj);
  // v2.1.5: aguardar o save e tratar erro. Antes era fire-and-forget — se o
  // Firestore rejeitasse (permission-denied), o usuário via "você está na lista
  // de espera" mas nada persistia no servidor (organizador nunca via, e o card
  // dele continuava "Inscrever-se"). Agora: rollback otimista + aviso real.
  window.FirestoreDB.saveTournament(t).then(function() {
    var modeLabel = ((window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment) === 'expand') ? _t('enroll.modeExpand') : _t('enroll.modeStandby');
    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.waitlistedTitle'), _t('enroll.waitlistedMsg', { name: newName, mode: modeLabel }), 'success');
    if (callback) callback();
  }).catch(function(e) {
    // desfaz o push otimista (referência exata — não derruba homônimo legítimo)
    t.standbyParticipants = (Array.isArray(t.standbyParticipants) ? t.standbyParticipants : []).filter(function(sp) { return sp !== participantObj; });
    if (typeof showNotification !== 'undefined') showNotification('Não foi possível entrar na lista de espera', (e && e.message) ? e.message : 'Tente novamente em instantes.', 'error');
    if (typeof window._captureException === 'function') window._captureException(e, { area: '_enrollToStandby', tournamentId: tId });
    if (callback) callback();
  });
}

// v2.3.93: nome canônico de inscrito. Regra do dono: sem nome → e-mail; na falta
// de e-mail → telefone (formatado +55 (DDD) XXXXX-XXXX). Garante que NENHUM
// inscrito novo fique sem nome (o nome real vem do Google ou do que a pessoa
// informa; este é o fallback dos casos legados). Usado em todos os builds de
// participante self-enroll.
window._enrollDisplayName = function (user) {
    if (!user) return '';
    if (user.displayName && String(user.displayName).trim()) return String(user.displayName).trim();
    if (user.email && String(user.email).trim()) return String(user.email).trim();
    if (user.phone) {
        var d = String(user.phone).replace(/\D/g, '');
        if (d.length > 11 && d.substring(0, 2) === '55') d = d.substring(2);
        if (d.length > 11) d = d.substring(d.length - 11);
        if (d.length === 11) return '+55 (' + d.substring(0, 2) + ') ' + d.substring(2, 7) + '-' + d.substring(7);
        if (d.length === 10) return '+55 (' + d.substring(0, 2) + ') ' + d.substring(2, 6) + '-' + d.substring(6);
        return String(user.phone);
    }
    return '';
};

window.enrollCurrentUser = function (tId) {
    // Busca no scoped list primeiro; se não achar, tenta no discovery feed
    // (torneios públicos que o usuário ainda não entrou). Torneios do
    // discovery vivem em AppStore.publicDiscovery até o usuário se inscrever;
    // antes desta hidratação a chamada falhava silenciosamente pra eles.
    let t = window._findTournamentById(tId);
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
        // v2.3.92: torneio com categoria de idade e perfil sem data de nascimento —
        // pede inline (e grava no perfil) ANTES da validação, em vez de bloquear
        // com "vá no perfil". Ao confirmar, reentra a inscrição com a data já
        // setada (a validação abaixo então cobra a idade mínima normalmente).
        var _ageCatsE = t.ageCategories || [];
        if (_ageCatsE.length > 0 && !user.birthDate && typeof window._askBirthDateForEnroll === 'function') {
            window._askBirthDateForEnroll(t, function(bd) {
                if (!bd) return; // cancelou → não inscreve
                window.enrollCurrentUser(tId); // reentra com a data de nascimento
            });
            return;
        }

        // Verifica elegibilidade por gênero e faixa etária antes de qualquer outra coisa.
        // Organizado cobre todas as rotas (inscrição direta, lista de espera, Liga aberta).
        var _elig = _checkEnrollmentEligibility(t, user);
        if (!_elig.ok) {
            showAlertDialog(_elig.title, _elig.msg, null, { type: 'warning' });
            return;
        }
        // Rigor Moderado: perfil incompleto → avisa (não bloqueia) e segue a inscrição.
        if (_elig.notice) {
            showAlertDialog(_elig.notice.title, _elig.notice.msg, null, { type: 'info' });
        }

        // Verifica se as inscrições estão realmente abertas
        if (t.status === 'finished') {
            showAlertDialog(_t('enroll.tournamentFinished'), _t('enroll.tournamentFinishedMsg'), null, { type: 'warning' });
            return;
        }
        const sorteioRealizado = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
        const ligaAberta = window._isLigaFormat(t) && t.ligaOpenEnrollment !== false && sorteioRealizado && t.status !== 'finished';
        const inscricoesAbertas = (t.status !== 'closed' && !sorteioRealizado) || ligaAberta;
        if (!inscricoesAbertas) {
            if (_allowsLateEnrollment(t) && t.status !== 'finished') {
                // Late enrollment — send to standby
                var _nmStandby = window._enrollDisplayName(user); // sem nome → e-mail/telefone
                var participantObj = { name: _nmStandby, email: user.email, displayName: _nmStandby, uid: user.uid, ligaActive: true };
                _enrollToStandby(t, tId, participantObj, function() {
                    const container = document.getElementById('view-container');
                    if (container && typeof renderTournaments === 'function') renderTournaments(container, tId);
                });
                return;
            }
            showAlertDialog(_t('enroll.enrollClosed'), _t('enroll.enrollClosedMsg'), null, { type: 'warning' });
            return;
        }
        if ((t.enrollmentMode === 'time' || t.enrollmentMode === 'teams') && parseInt(t.teamSize || 2) > 1) {
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
                      (t.skillCategories && t.skillCategories.length > 0) ||
                      (t.ageCategories && t.ageCategories.length > 0); // v2.3.92: idade também resolve categoria
        if (hasCats) {
            // v2.4.9: FAIL-OPEN. A escolha de categoria é o caminho normal, mas se
            // por QUALQUER motivo técnico não der pra obter a categoria (erro,
            // picker não renderiza, exceção), inscreve SEM categoria — o organizador
            // ajusta depois. Nunca deixar a pessoa de fora por causa da categoria.
            // (Cancelar explícito do picker/data não chama o callback → não inscreve,
            // pois é ação deliberada do usuário, não uma falha.)
            var _failOpenEnroll = function(reason) {
                window._warn('[enroll] categoria não resolvida (' + reason + ') — inscrevendo sem categoria; organizador ajusta depois');
                window._doEnrollCurrentUser(tId, null);
            };
            try {
                window._resolveEnrollmentCategory(tId, function(selectedCategories) {
                    if (selectedCategories) window._doEnrollCurrentUser(tId, selectedCategories);
                    else _failOpenEnroll('sem-categoria-resolvida');
                });
            } catch (e) {
                if (typeof window._captureException === 'function') {
                    try { window._captureException(e, { area: 'enroll-resolveCategory', tournamentId: tId }); } catch (_ce) {}
                }
                _failOpenEnroll('exceção');
            }
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
    let t = window._findTournamentById(tId);
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
    // v2.3.93: regra do dono — sem nome → e-mail; na falta de e-mail → telefone.
    // (Antes pulava o e-mail e ia direto pro telefone.)
    var _dispName = window._enrollDisplayName(user) || null;
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
    if (window._sound) window._sound('sino');
    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.enrolledTitle'), _t('enroll.enrolledMsg', { name: window._safeHtml(t.name) }), 'success');
    // Trophy hook — enrollment milestone
    setTimeout(function() {
      try { if (typeof window._trophyOnTournamentEnrolled === 'function') window._trophyOnTournamentEnrolled(t); } catch(_te) {}
    }, 500);
    window._scrollToParticipant(tId, user.displayName);
    // v2.1.66: cria automaticamente um "Planejar ida" cobrindo a duração do
    // torneio quando ele tem data+hora e local. Dedup do PresenceDB evita duplicar.
    try { if (typeof window._maybeCreateTournamentPresencePlan === 'function') window._maybeCreateTournamentPresencePlan(t, user); } catch (_pp) {}
    // v2.8.86: se há enquete ativa, notifica o novo inscrito pra responder (fundamental).
    try { if (typeof window._opNotifyNewEnrollee === 'function') window._opNotifyNewEnrollee(t, user && user.uid); } catch (_op) {}
    // Post-enroll callback (ex: abrir picker de parceiro em torneios de duplas)
    if (typeof _onSuccess === 'function') { setTimeout(_onSuccess, 400); }

    // --- Background: Firestore transaction for consistency ---
    if (window.FirestoreDB && window.FirestoreDB.enrollParticipant) {
        window.FirestoreDB.enrollParticipant(tId, participantObj).then(function(result) {
            if (result.capacityFull) {
                // v2.6.87: lotou antes de concluir (limite com corrida) — NÃO inscrito.
                if (typeof showNotification !== 'undefined') showNotification('Vagas esgotadas', 'As vagas acabaram antes de você concluir — você não foi inscrito.', 'error');
                var _vcCap = document.getElementById('view-container'); if (_vcCap && typeof renderTournaments === 'function') renderTournaments(_vcCap, tId);
                return;
            }
            if (result.alreadyEnrolled) {
                // Already enrolled on server — local state is fine, just sync participants
                t.participants = result.participants;
                return;
            }
            // Sync authoritative server state
            t.participants = result.participants;
            // v2.6.88: Vagas com sorteio — atingiu o máx. → avisa todos os inscritos da lista de espera.
            if (result.reachedCapacityDraw && typeof window._notifyTournamentParticipants === 'function') {
                window._notifyTournamentParticipants(t, { type: 'tournament_update', message: 'As vagas de "' + (t.name || 'Torneio') + '" foram preenchidas. Novas inscrições entram na lista de espera — um sorteio definirá quem joga.', level: 'important' });
            }
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
                            // v3.1.59: usa _dispName (já resolve displayName→e-mail→telefone via
                            // _enrollDisplayName) — NUNCA o user.displayName cru, que era null em
                            // conta sem nome e caía no genérico "Um participante". Sempre há e-mail
                            // ou telefone, então a notificação sempre nomeia a pessoa.
                            message: _t('enroll.orgEnrollMsg', {name: _dispName || _t('enroll.anonParticipant'), tourn: window._safeHtml(t.name)}),
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
            // v3.0.76: rollback remove EXATAMENTE o objeto recém-inserido (referência),
            // não por email+uid — que falhava pra phone-only (email null !== undefined)
            // e era ambíguo. participantObj está no escopo desta função.
            t.participants = t.participants.filter(function(p) { return p !== participantObj; });
            if (typeof showNotification !== 'undefined') showNotification(_t('enroll.error'), _t('enroll.errorMsg'), 'error');
            var container = document.getElementById('view-container');
            if (container && typeof renderTournaments === 'function') renderTournaments(container, tId);
        });
    }
};

window.submitTeamEnroll = function (tId) {
    const t = window._findTournamentById(tId);
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

    // ── IDENTIDADE = uid: resolve os nomes DIGITADOS de parceiros → conta ANTES
    // de gravar. Parceiro escolhido no picker já traz dataset.partnerUid; nome
    // digitado à mão passa por resolveNameToAccounts (pergunta se homônimo). Grava
    // o uid no dataset e RE-ENTRA (o dataset.partnerResolved evita loop). Cobre o
    // caminho normal E o de lista de espera (ambos leem .team-member-name-).
    var _teamInputs = Array.prototype.slice.call(document.querySelectorAll('.team-member-name-' + tId));
    var _pend = _teamInputs.filter(function (inp) {
        return inp.value.trim() && !(inp.dataset && inp.dataset.partnerUid) && !(inp.dataset && inp.dataset.partnerResolved);
    });
    if (_pend.length) {
        window._resolveEnrolleeUids(_pend.map(function (i) { return i.value.trim(); }), function (uids) {
            _pend.forEach(function (inp, k) {
                inp.dataset.partnerResolved = '1';
                if (uids[k]) inp.dataset.partnerUid = uids[k];
            });
            window.submitTeamEnroll(tId);
        });
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
            // IDENTIDADE = uid: monta a dupla por slots (p1 = quem inscreve; parceiro
            // pelo uid já resolvido no dataset), não só por nome — igual ao caminho normal.
            var _sbP2Uid = (inputs2[0] && inputs2[0].dataset && inputs2[0].dataset.partnerUid) || '';
            var partObj = {
                name: teamStr, displayName: teamStr, uid: user.uid, ligaActive: true,
                p1Name: teamNames2[0] || '', p1Uid: user.uid,
                p2Name: teamNames2[1] || '', p2Uid: _sbP2Uid
            };
            if (user.email) partObj.email = user.email;
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
    if (window._sound) window._sound('sino');
    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.enrolledTitle'), _t('enroll.teamEnrolledMsg', { name: window._safeHtml(t.name) }), 'success');
    window._scrollToParticipant(tId, teamString);
    // v2.8.86: enquete ativa → notifica cada novo inscrito da dupla (fundamental).
    try {
      if (typeof window._opNotifyNewEnrollee === 'function') {
        var _newUids = (typeof window._participantUids === 'function') ? window._participantUids(participantObj) : [participantObj && participantObj.uid];
        (_newUids || []).forEach(function(_u){ if (_u) window._opNotifyNewEnrollee(t, _u); });
      }
    } catch (_op) {}

    // --- Background: Firestore transaction for consistency ---
    if (window.FirestoreDB && window.FirestoreDB.enrollParticipant) {
        window.FirestoreDB.enrollParticipant(tId, participantObj, { teamOrigins: _teamOrigins }).then(function(result) {
            if (result.capacityFull) {
                if (typeof showNotification !== 'undefined') showNotification('Vagas esgotadas', 'As vagas acabaram antes de você concluir — você não foi inscrito.', 'error');
                var _vcCap2 = document.getElementById('view-container'); if (_vcCap2 && typeof renderTournaments === 'function') renderTournaments(_vcCap2, tId);
                return;
            }
            if (result.alreadyEnrolled) {
                t.participants = result.participants;
                return;
            }
            t.participants = result.participants;
            // v2.6.88: Vagas com sorteio — atingiu o máx. → avisa todos os inscritos da lista de espera.
            if (result.reachedCapacityDraw && typeof window._notifyTournamentParticipants === 'function') {
                window._notifyTournamentParticipants(t, { type: 'tournament_update', message: 'As vagas de "' + (t.name || 'Torneio') + '" foram preenchidas. Novas inscrições entram na lista de espera — um sorteio definirá quem joga.', level: 'important' });
            }
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
            // v3.0.76: rollback por referência exata (não por name+email) — slot-correct
            // pra dupla cujo displayName é só o nome do p1. participantObj está no escopo.
            t.participants = t.participants.filter(function(p) { return p !== participantObj; });
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
    var t = window._findTournamentById(tId);
    var user = (typeof window._verifiedCurrentUser === 'function') ? window._verifiedCurrentUser() : window.AppStore.currentUser;
    if (!t || !user) return;
    // v3.0.76: uid-first + slot-aware (dupla p2 cujo displayName é só o nome do p1
    // não saía da lista de espera). Helper canônico cobre string/objeto/slots.
    var _matchUser = function(p) {
        if (!p) return false;
        if (typeof window._userMatchesParticipant === 'function') return window._userMatchesParticipant(user, p);
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
    const t = window._findTournamentById(tId);
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
                    // v3.0.76: uid-first + slot-aware — espelha deenrollParticipant (transação).
                    // Sem isto, a dupla cujo p2 é o usuário (uid em p2Uid, displayName só do p1)
                    // não saía no re-render otimista; só voltava no onSnapshot.
                    if (typeof window._userMatchesParticipant === 'function') return !window._userMatchesParticipant(user, p);
                    if (typeof p === 'string') return p !== user.email && p !== user.displayName;
                    var pEmail = p.email || '';
                    var pName = p.displayName || p.name || '';
                    var pUid = p.uid || '';
                    return !(pEmail === user.email || (user.uid && pUid === user.uid) || (pName && pName === user.displayName));
                });

                // Show success and re-render immediately (no wait for network)
                if (typeof showNotification !== 'undefined') showNotification(_t('enroll.cancelledTitle'), _t('enroll.cancelledMsg', { name: window._safeHtml(t.name) }), 'info');
                // v2.1.67: cancela também o "Planejar ida" criado na inscrição.
                try { if (typeof window._cancelTournamentPresencePlan === 'function') window._cancelTournamentPresencePlan(t, user); } catch (_cp) {}
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
                                        // v3.1.59: nome com fallback e-mail→telefone (nunca "Um participante").
                                        message: _t('enroll.orgUnenrollMsg', {name: (window._enrollDisplayName && window._enrollDisplayName(user)) || user.displayName || _t('enroll.anonParticipant'), tourn: window._safeHtml(t.name)}),
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
    const t = window._findTournamentById(tId);
    if (!t) return;
    // Block if enrollments are closed (except Liga with open enrollment)
    var _isLiga = t.format && (t.format === 'Liga' || t.format === 'Ranking' || t.format === 'liga' || t.format === 'ranking');
    var _ligaOpen = _isLiga && t.ligaOpenEnrollment !== false; // v2.4.17: Liga aberta por default (só fecha se explicitamente false) — alinha com cards/form/enrollCurrentUser
    var _sorteio = (Array.isArray(t.matches) && t.matches.length > 0) ||
                   (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                   (Array.isArray(t.groups) && t.groups.length > 0);
    var _closedOrDrawn = (t.status === 'closed' || t.status === 'finished' || _sorteio) && !_ligaOpen;
    if (_closedOrDrawn && !_allowsLateEnrollment(t)) {
        showAlertDialog(_t('enroll.enrollClosed'), _t('enroll.enrollClosedMsg'), null, { type: 'warning' });
        return;
    }
    // Overlay com autocomplete de amigos/usuários → delega ao core canônico.
    window._addParticipantWithAutocomplete(tId, _closedOrDrawn, function(pName, selectedUid, selectedPhoto) {
        window._doAddParticipant(tId, pName, selectedUid, selectedPhoto);
    });
};

// v4.0.90 — CORE canônico de "adicionar participante" (nome direto, sem overlay).
// Fonte ÚNICA usada pelo overlay de autocomplete (addParticipantFunction) E pela página
// consolidada "+ Participante" (#participantes/<tId>). onDone(opcional) roda no sucesso —
// a página recarrega a lista; sem onDone, faz o refresh padrão da view do torneio.
window._doAddParticipant = function (tId, pName, selectedUid, selectedPhoto, onDone, _resolved) {
    var t = window._findTournamentById(tId);
    if (!t) return;
    var _isLiga2 = t.format && (t.format === 'Liga' || t.format === 'Ranking' || t.format === 'liga' || t.format === 'ranking');
    var _ligaOpen2 = _isLiga2 && t.ligaOpenEnrollment !== false;
    var _sorteio2 = (Array.isArray(t.matches) && t.matches.length > 0) ||
                    (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                    (Array.isArray(t.groups) && t.groups.length > 0);
    var _closedOrDrawn = (t.status === 'closed' || t.status === 'finished' || _sorteio2) && !_ligaOpen2;
    // Mesma regra do botão/overlay: torneio fechado SEM inscrição tardia bloqueia o add
    // (consistência página ↔ overlay; evita "a página deixa, o botão não").
    if (_closedOrDrawn && !_allowsLateEnrollment(t)) {
        if (typeof showAlertDialog === 'function') showAlertDialog(_t('enroll.enrollClosed'), _t('enroll.enrollClosedMsg'), null, { type: 'warning' });
        return;
    }
    // IDENTIDADE = uid: nome digitado à mão (sem uid do autocomplete) → resolve pra
    // conta antes de gravar (pergunta se homônimo). _resolved evita loop quando o
    // nome não tem conta (informal → grava por nome mesmo).
    if (!selectedUid && !_resolved && pName && String(pName).trim()) {
        window._resolveEnrolleeUid(String(pName).trim(), function (uid) {
            window._doAddParticipant(tId, pName, uid || '', selectedPhoto, onDone, true);
        });
        return;
    }
    var _refresh = function () {
        if (typeof onDone === 'function') { onDone(); return; }
        var container = document.getElementById('view-container');
        if (container && typeof renderTournaments === 'function') renderTournaments(container, window.location.hash.split('/')[1]);
    };
    {
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
                _enrollToStandby(t, tId, participantObj, function() { _refresh(); });
                return;
            }
            // Use transactional enroll to prevent race conditions
            if (window.FirestoreDB && typeof window.FirestoreDB.enrollParticipant === 'function') {
                window.FirestoreDB.enrollParticipant(tId, participantObj).then(function(result) {
                    if (result.capacityFull) {
                        if (typeof showNotification !== 'undefined') showNotification('Vagas esgotadas', 'As vagas acabaram — ' + pName.trim() + ' não foi inscrito.', 'error');
                        _refresh();
                        return;
                    }
                    if (result.alreadyEnrolled) {
                        if (typeof showNotification !== 'undefined') showNotification(_t('enroll.alreadyEnrolled'), _t('enroll.alreadyEnrolledSingle', { name: pName.trim() }), 'warning');
                        return;
                    }
                    if (result.enrollmentClosed) {
                        if (typeof showNotification !== 'undefined') showNotification(_t('enroll.enrollClosed'), _t('enroll.enrollClosedMsg'), 'warning');
                        return;
                    }
                    t.participants = result.participants;
                    if (window._sound) window._sound('sino'); // +Participante concluído
                    if (result.autoCloseTriggered) {
                        t.status = 'closed';
                        if (typeof showNotification !== 'undefined') showNotification(_t('enroll.autoClosedTitle'), '"' + window._safeHtml(t.name) + '" ' + _t('enroll.autoClosedMsg', { count: t.maxParticipants }), 'success');
                    }
                    // v2.6.99: Rei/Rainha com rodada em andamento → novo inscrito entra
                    // na LISTA DE ESPERA; ao juntar 4, forma um grupo automaticamente.
                    try {
                        if (typeof window._onParticipantAddedToMonarchRound === 'function') {
                            var _wlRes = window._onParticipantAddedToMonarchRound(t, participantObj.name, (participantObj.categories && participantObj.categories[0]) || participantObj.category || null);
                            if (_wlRes.added && window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') window.FirestoreDB.saveTournament(t);
                            if (_wlRes.formed > 0 && typeof showNotification !== 'undefined') showNotification('Novo grupo formado', _wlRes.formed + ' grupo(s) criado(s) a partir da lista de espera.', 'success');
                        }
                    } catch (_wlErr) { if (window._warn) window._warn('[monarch waitlist add]', _wlErr); }
                    _refresh();
                }).catch(function(err) {
                    window._warn('Add participant error:', err);
                    if (typeof showNotification !== 'undefined') showNotification(_t('enroll.error'), _t('enroll.addError'), 'error');
                });
            } else {
                // Fallback: non-transactional
                let arr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
                arr.push(participantObj);
                t.participants = arr;
                if (window._sound) window._sound('sino'); // +Participante concluído (fallback)
                try {
                    if (typeof window._onParticipantAddedToMonarchRound === 'function') {
                        var _wlRes2 = window._onParticipantAddedToMonarchRound(t, participantObj.name, (participantObj.categories && participantObj.categories[0]) || participantObj.category || null);
                        if (_wlRes2.formed > 0 && typeof showNotification !== 'undefined') showNotification('Novo grupo formado', _wlRes2.formed + ' grupo(s) criado(s) a partir da lista de espera.', 'success');
                    }
                } catch (_wlErr2) { if (window._warn) window._warn('[monarch waitlist add]', _wlErr2); }
                window.FirestoreDB.saveTournament(t);
                _refresh();
            }
    }
};

window.addTeamFunction = function (tId) {
    const t = window._findTournamentById(tId);
    if (!t) return;
    // Block if enrollments are closed (except Liga with open enrollment)
    var _isLiga = t.format && (t.format === 'Liga' || t.format === 'Ranking' || t.format === 'liga' || t.format === 'ranking');
    var _ligaOpen = _isLiga && t.ligaOpenEnrollment !== false; // v2.4.17: Liga aberta por default (só fecha se explicitamente false) — alinha com cards/form/enrollCurrentUser
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
            // No modo Vagas-por-sorteio a inscrição NUNCA fecha sozinha (sem corrida).
            if (t.autoCloseOnFull && t.maxParticipants && t.enrollmentLimitMode !== 'draw' && arr.length >= parseInt(t.maxParticipants)) {
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
    // v3.0.76: uid-first + slot-aware — p2 de uma dupla (uid em p2Uid) também
    // controla a participação da entrada no próximo sorteio.
    if (typeof window._userMatchesParticipant === 'function') return window._userMatchesParticipant(user, p);
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
    var newPillBg = isActive ? '#10b981' : '#ef4444'; // verde / vermelho sólido
    var newTitle = isActive
      ? 'Clique para ficar de fora do próximo sorteio'
      : 'Clique para voltar ao próximo sorteio';
    // Toggle wrappers carregam data-liga-toggle-tid pra ser query-friendly.
    var wrappers = document.querySelectorAll('[data-liga-toggle-tid="' + String(tId).replace(/"/g, '\\"') + '"]');
    wrappers.forEach(function(w) {
      var lbl = w.querySelector('.liga-toggle-state-label');
      if (lbl) { lbl.textContent = newLabel; lbl.style.color = '#fff'; } // texto sempre branco
      if (w.classList && w.classList.contains('liga-toggle-pill')) w.style.background = newPillBg;
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
  // v2.7.38: organizador desligou a auto-desativação → o controle some de TODOS os
  // inscritos (e todos ficam ativos, ver _getActiveLigaPlayers).
  if (t.allowSelfDeactivation === false) return '';
  if (t.status === 'finished') return '';
  var cu = window.AppStore && window.AppStore.currentUser;
  if (!cu || !cu.uid && !cu.email) return '';
  var arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  var found = arr.find(function(p) {
    if (typeof p !== 'object' || !p) return false;
    // v3.0.76: uid-first + slot-aware — o toggle aparece pro p2 da dupla também.
    if (typeof window._userMatchesParticipant === 'function') return window._userMatchesParticipant(cu, p);
    if (p.uid && cu.uid && p.uid === cu.uid) return true;
    if (p.email && cu.email && p.email === cu.email) return true;
    return false;
  });
  if (!found) return ''; // só mostra pra quem está inscrito
  var isActive = found.ligaActive !== false; // default true
  var safeTid = String(t.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var stateLabel = isActive ? 'Ativado' : 'Desativado';
  // v2.6.21: pílula SÓLIDA — verde (Ativado) / vermelha (Desativado) com texto
  // SEMPRE branco, nos dois temas. Antes era texto colorido sobre tarja escura
  // (contraste ruim no tema claro). A própria pílula carrega a cor do estado.
  var pillBg = isActive ? '#10b981' : '#ef4444';
  var titleAttr = isActive
    ? 'Clique para ficar de fora do próximo sorteio'
    : 'Clique para voltar ao próximo sorteio';
  // v0.16.92: stopPropagation EM TODOS os elementos do toggle.
  // v0.16.93: data-liga-toggle-tid no outer wrapper + class
  // liga-toggle-state-label no text span permite update in-place pelo
  // _toggleLigaActive sem re-render do view (sem scroll jump).
  var STOP = 'onclick="event.stopPropagation();"';
  return '<span data-liga-toggle-tid="' + safeTid + '" class="liga-toggle-pill" style="display:inline-flex;align-items:center;gap:7px;flex-shrink:0;background:' + pillBg + ';border-radius:999px;padding:4px 9px 4px 12px;box-shadow:0 1px 3px rgba(0,0,0,0.18);" ' + STOP + ' ' +
    'title="' + window._safeHtml(titleAttr) + '">' +
    '<span class="liga-toggle-state-label" style="font-size:0.88rem;font-weight:700;color:#fff;white-space:nowrap;" ' + STOP + '>' + stateLabel + '</span>' +
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

  // v2.1.10: hidrata o cache de perfis dos amigos (MESMO cache da Partida
  // Casual: _loadFriendProfilesCached) e re-renderiza o dropdown quando os
  // perfis chegam. Antes o autocomplete lia _friendProfilesCache que podia
  // estar VAZIO se o usuário não tivesse aberto casual/bracket antes — então
  // nenhum amigo aparecia. Agora os amigos surgem dinâmico já na abertura.
  if (typeof window._loadFriendProfilesCached === 'function') {
    window._loadFriendProfilesCached().then(function() {
      if (!document.getElementById('add-participant-overlay')) return;
      var i = document.getElementById('ap-input');
      if (i && typeof window._apSearch === 'function') window._apSearch(i.value || '');
    }).catch(function(){});
  }

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
    // v3.0.76: inclui TODOS os uids de cada entrada (dupla = p1Uid+p2Uid), não só o
    // top-level — senão um amigo que é p2 de uma dupla já inscrita aparecia no picker.
    var enrolledUids = [];
    enrolled.forEach(function(p){
      if (typeof p !== 'object' || !p) return;
      var us = (typeof window._participantUids === 'function') ? window._participantUids(p) : (p.uid ? [p.uid] : []);
      us.forEach(function(u){ if (u && enrolledUids.indexOf(u) === -1) enrolledUids.push(u); });
    });

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
      // v2.1.72: se o nome digitado bate EXATAMENTE (e de forma ÚNICA) com um
      // amigo, vincula a conta (uid) automaticamente — evita inscrever um amigo
      // como "texto solto" só porque o organizador não clicou na sugestão.
      // Nome que não bate com ninguém continua entrando como convidado de fora.
      try {
        var _cu = window.AppStore && window.AppStore.currentUser;
        var _fr = (_cu && Array.isArray(_cu.friends)) ? _cu.friends : [];
        var _cache = window._friendProfilesCache || {};
        var _norm = function(s) { return window._normalizeName ? window._normalizeName(s) : String(s || '').trim().toLowerCase(); };
        var _target = _norm(sel.name);
        var _matches = [];
        _fr.forEach(function(u) {
          var pr = _cache[u];
          var nm = pr && pr.displayName;
          if (nm && _norm(nm) === _target) _matches.push({ uid: u, photo: (pr.photoURL || ''), name: nm });
        });
        if (_matches.length === 1) {
          sel.uid = _matches[0].uid;
          sel.photo = _matches[0].photo;
          sel.name = _matches[0].name;
          if (typeof showNotification !== 'undefined') showNotification('🔗 Conta vinculada', sel.name + ' foi reconhecido(a) como seu amigo e vinculado à conta dele(a).', 'info');
        }
      } catch (e) {}
    }
    document.getElementById('add-participant-overlay') && document.getElementById('add-participant-overlay').remove();
    onConfirm(sel.name, sel.uid, sel.photo);
  };
};
