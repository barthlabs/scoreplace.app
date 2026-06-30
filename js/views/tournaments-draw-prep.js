// tournaments-draw-prep.js — Draw preparation, polls & resolution (extracted from tournaments.js)

(function() {

var _t = window._t || function(k) { return k; };

// ============ UNIFIED RESOLUTION PANEL SYSTEM ============

window._diagnoseAll = function(t) {
    const enrMode = t.enrollmentMode || t.enrollment || 'individual';
    let teamSize = parseInt(t.teamSize) || 1;
    if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) teamSize = 2;

    const arr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);

    // Count effective teams and individuals
    let preFormedTeams = 0;
    let individuals = 0;
    const incompleteTeams = [];

    arr.forEach(function(p, idx) {
        const pName = typeof p === 'string' ? p : (p.displayName || p.name || '');
        // v3.0.x: detecção canônica (estrutura > nome) — duplas do aceite sem '/' no
        // nome eram contadas como individuais e distorciam todo o diagnóstico.
        const members = window._entryTeamMembers(p);
        if (members) {
            if (members.length < teamSize) {
                incompleteTeams.push({ index: idx, name: pName, members: members, missing: teamSize - members.length });
            }
            preFormedTeams++;
        } else {
            individuals++;
        }
    });

    // Scenario A: Remainder (individuals that can't form teams)
    const remainder = individuals % teamSize;
    const completeTeamsFromIndividuals = Math.floor(individuals / teamSize);
    const effectiveTeams = preFormedTeams + completeTeamsFromIndividuals;

    // Scenario B+C: Power of 2 check
    const isPowerOf2 = effectiveTeams > 0 && (effectiveTeams & (effectiveTeams - 1)) === 0;
    let loP2 = 1;
    while (loP2 * 2 <= effectiveTeams) loP2 *= 2;
    const hiP2 = loP2 * 2;

    const excess = effectiveTeams - loP2;
    const missing = hiP2 - effectiveTeams;
    const isOdd = effectiveTeams > 0 && effectiveTeams % 2 !== 0;

    // Participant equivalents
    const excessParticipants = excess * teamSize;
    const missingParticipants = missing * teamSize;
    const remainderParticipants = remainder;

    return {
        hasIssues: incompleteTeams.length > 0 || remainder > 0 || isOdd || !isPowerOf2,
        teamSize: teamSize,
        totalRawParticipants: arr.length,
        individuals: individuals,
        preFormedTeams: preFormedTeams,
        effectiveTeams: effectiveTeams,
        incompleteTeams: incompleteTeams,
        remainder: remainder,
        isOdd: isOdd,
        isPowerOf2: isPowerOf2,
        loP2: loP2,
        hiP2: hiP2,
        excess: excess,
        missing: missing,
        isTeam: teamSize > 1,
        excessParticipants: excessParticipants,
        missingParticipants: missingParticipants,
        remainderParticipants: remainderParticipants
    };
};

// ============ GROUPS CONFIGURATION PANEL ============
// For "Fase de Grupos + Eliminatórias" — lets organizer choose group distribution

window._showGroupsConfigPanel = function(tId) {
    var t = window._findTournamentById(tId);
    if (!t) return;

    var info = window._diagnoseAll(t);
    var N = info.effectiveTeams;
    var unitLabel = info.isTeam ? _t('predraw.unitTeams') : _t('predraw.unitParticipants');
    var tIdSafe = String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var currentClassified = parseInt(t.gruposClassified) || 2;

    // Remove existing panel
    var existing = document.getElementById('groups-config-panel');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'groups-config-panel';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem 0;';
    document.body.style.overflow = 'hidden';

    // Generate all valid group configurations
    function generateConfigs(n, classPerGroup) {
        var configs = [];
        // Try group counts from 2 to max sensible (n/2, capped at 16)
        var maxGroups = Math.min(Math.floor(n / 2), 16);
        for (var g = 2; g <= maxGroups; g++) {
            var base = Math.floor(n / g);
            var rem = n % g;
            if (base < 2) continue; // minimum 2 per group
            var totalAdvance = g * classPerGroup;
            if (totalAdvance < 2) continue;
            var isPow2 = totalAdvance > 0 && (totalAdvance & (totalAdvance - 1)) === 0;
            // Find nearest power of 2
            var lo = 1;
            while (lo * 2 <= totalAdvance) lo *= 2;
            var hi = lo * 2;
            configs.push({
                groups: g,
                base: base,
                remainder: rem,
                bigGroups: rem,
                smallGroups: g - rem,
                bigSize: base + 1,
                smallSize: base,
                totalAdvance: totalAdvance,
                isPow2: isPow2,
                nearestPow2: isPow2 ? totalAdvance : (totalAdvance - lo <= hi - totalAdvance ? lo : hi),
                classPerGroup: classPerGroup
            });
        }
        return configs;
    }

    // v1.1.1-beta: helpers pra calcular matches + duração estimada por config.
    // User: 'seria muito interessante diz quantas partidas e previsão de
    // duração total do torneio de forma dinâmica a cada vez que uma opção
    // é selecionada.'
    var _gameDur = parseInt(t.gameDuration) || 30;
    var _callT = parseInt(t.callTime) || 0;
    var _warmT = parseInt(t.warmupTime) || 0;
    var _courts = Math.max(parseInt(t.courtCount) || 1, 1);
    var _slotMin = _gameDur + _callT + _warmT + 5; // +5min intervalo

    // Conta partidas pra uma config específica
    function _matchesForConfig(c) {
        // Fase de grupos: round-robin dentro de cada grupo
        var groupMatches = 0;
        if (c.bigGroups > 0) {
            groupMatches += c.bigGroups * (c.bigSize * (c.bigSize - 1) / 2);
        }
        groupMatches += c.smallGroups * (c.smallSize * (c.smallSize - 1) / 2);
        // Fase eliminatória: assume bracket simples sobre totalAdvance
        // Se P2: totalAdvance - 1 (sem 3o lugar) ou totalAdvance (com 3o)
        // Se não-P2: precisa BYE/Reabrir/etc — aproxima como totalAdvance - 1
        var elimMatches = Math.max(c.totalAdvance - 1, 0);
        // +1 pra disputa de 3o lugar (sempre gerado em elim)
        if (c.totalAdvance >= 4) elimMatches += 1;
        return Math.round(groupMatches + elimMatches);
    }

    // Estima duração total em minutos
    function _durationForConfig(c) {
        // Fase de grupos: groupSize-1 rodadas, partidas paralelas em quadras
        // Cada grupo joga sua rodada em paralelo (matches_per_round somados)
        var maxGroupSize = Math.max(c.bigSize, c.smallSize);
        var groupRounds = maxGroupSize - 1;
        var groupTotalMin = 0;
        for (var r = 0; r < groupRounds; r++) {
            // Rodada r: grupos com size > r+1 jogam (round-robin)
            var matchesThisRound = 0;
            if (c.bigGroups > 0 && c.bigSize > r + 1) {
                matchesThisRound += c.bigGroups * Math.floor(c.bigSize / 2);
            }
            if (c.smallSize > r + 1) {
                matchesThisRound += c.smallGroups * Math.floor(c.smallSize / 2);
            }
            if (matchesThisRound > 0) {
                groupTotalMin += Math.ceil(matchesThisRound / _courts) * _slotMin;
            }
        }
        // Fase eliminatória: log2(totalAdvance) rodadas
        var elimRounds = Math.ceil(Math.log2(Math.max(c.totalAdvance, 2)));
        var elimTotalMin = 0;
        for (var er = 0; er < elimRounds; er++) {
            var mInR = Math.ceil(c.totalAdvance / Math.pow(2, er + 1));
            elimTotalMin += Math.ceil(mInR / _courts) * _slotMin;
        }
        // Disputa de 3o lugar: 1 partida extra na fase final
        if (c.totalAdvance >= 4) elimTotalMin += _slotMin;
        // +15 min de intervalo entre fases
        return groupTotalMin + elimTotalMin + 15;
    }

    function _formatDuration(min) {
        if (min <= 0) return '';
        var h = Math.floor(min / 60);
        var m = min % 60;
        if (h === 0) return '~' + m + 'min';
        if (m === 0) return '~' + h + 'h';
        return '~' + h + 'h' + (m < 10 ? '0' + m : m);
    }

    // v3.0.x: painel redesenhado pra girar em torno da config do torneio —
    // SLIDER de grupos (centrado no nº escolhido na criação) + AVANÇAM em
    // potência de 2 (padrão = potência de 2 abaixo do nº de times; +/- pra 16/8).
    function _grpGenCands(n) {
        var out = [];
        for (var g = Math.floor(n / 3); g >= 2; g--) {
            var base = Math.floor(n / g), rem = n % g;
            if (base < 3 || base > 6) continue;
            out.push({ g: g, base: base, rem: rem, bigGroups: rem, smallGroups: g - rem, bigSize: base + 1, smallSize: base });
        }
        return out; // muitos grupos (esq) → poucos (dir)
    }
    function _grpAdvList(n) {
        var out = [], p = 4;
        while (p <= n) { out.push(p); p *= 2; }
        if (!out.length) out.push(Math.max(2, n));
        return out; // [4,8,16,32,...] ≤ n
    }
    var _grpCands = _grpGenCands(N);
    var _grpAdv = _grpAdvList(N);
    var _grpEqualOnly = t.gruposEqualOnly === true;
    var _grpCfgCount = parseInt(t.gruposCount) || 0;
    var _grpIdx = 0;
    (function(){ var bd = Infinity; _grpCands.forEach(function(c, i){ var d = Math.abs(c.g - _grpCfgCount); if (d < bd) { bd = d; _grpIdx = i; } }); })();
    var _advIdx = _grpAdv.length - 1; // padrão: maior potência de 2 ≤ N

    function _grpSizesLabel(c) {
        if (_grpEqualOnly || c.rem === 0) return c.g + ' grupos de ' + c.base;
        return c.bigGroups + ' de ' + c.bigSize + ' + ' + c.smallGroups + ' de ' + c.smallSize;
    }
    function _grpSuplentes(c) { return _grpEqualOnly ? c.rem : 0; }
    function _grpMatches(c) {
        var gm = 0;
        if (_grpEqualOnly) { gm = c.g * (c.base * (c.base - 1) / 2); }
        else {
            if (c.bigGroups > 0) gm += c.bigGroups * (c.bigSize * (c.bigSize - 1) / 2);
            gm += c.smallGroups * (c.smallSize * (c.smallSize - 1) / 2);
        }
        var adv = _grpAdv[_advIdx] || 2;
        var elim = Math.max(adv - 1, 0); if (adv >= 4) elim += 1;
        return Math.round(gm + elim);
    }
    function _grpDuration(c) {
        var maxSize = _grpEqualOnly ? c.base : Math.max(c.bigSize, c.smallSize);
        var rounds = maxSize - 1, tot = 0;
        for (var r = 0; r < rounds; r++) {
            var m = 0;
            if (!_grpEqualOnly && c.bigGroups > 0 && c.bigSize > r + 1) m += c.bigGroups * Math.floor(c.bigSize / 2);
            var sCount = _grpEqualOnly ? c.g : c.smallGroups, sSize = _grpEqualOnly ? c.base : c.smallSize;
            if (sSize > r + 1) m += sCount * Math.floor(sSize / 2);
            if (m > 0) tot += Math.ceil(m / _courts) * _slotMin;
        }
        var adv = _grpAdv[_advIdx] || 2, er = Math.ceil(Math.log2(Math.max(adv, 2)));
        for (var e = 0; e < er; e++) tot += Math.ceil(Math.ceil(adv / Math.pow(2, e + 1)) / _courts) * _slotMin;
        if (adv >= 4) tot += _slotMin;
        return tot + 15;
    }

    function renderPanel() {
        var html = '<div style="background:var(--bg-card,#1e293b);width:94%;max-width:560px;border-radius:32px;margin:auto 0;border:1px solid rgba(59,130,246,0.25);box-shadow:0 40px 120px rgba(0,0,0,0.8);overflow:hidden;display:flex;flex-direction:column;max-height:90vh;">' +
            '<div style="background:linear-gradient(135deg,#1e3a5f 0%,#1e40af 50%,#3b82f6 100%);padding:12px 1.5rem;display:flex;align-items:center;gap:12px;flex-shrink:0;">' +
                '<span style="font-size:1.5rem;">🏟️</span>' +
                '<div><h3 style="margin:0;color:#dbeafe;font-size:1.1rem;font-weight:900;">' + _t('predraw.groupsTitle') + '</h3>' +
                '<p style="margin:2px 0 0;color:#93c5fd;font-size:0.75rem;">' + N + ' ' + unitLabel + ' — ' + _t('predraw.chooseDistribution') + '</p></div>' +
            '</div>' +
            // v3.0.x: barra de botões FIXA (flex-shrink:0 → nunca é cortada por scroll),
            // Cancelar + Sortear (verde) lado a lado, logo após o box do título.
            '<div style="flex-shrink:0;display:flex;gap:10px;padding:12px 1.5rem;background:var(--bg-card,#1e293b);border-bottom:1px solid rgba(255,255,255,0.08);">' +
                '<button onclick="window._cancelGroupsConfig(\'' + tIdSafe + '\')" style="flex:1;padding:13px;border-radius:12px;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.05);color:var(--text-muted,#cbd5e1);font-weight:700;font-size:0.9rem;cursor:pointer;">✕ Cancelar</button>' +
                '<button id="grp-panel-confirm-btn" onclick="window._grpPanelConfirm(\'' + tIdSafe + '\')" style="flex:2;padding:13px;border-radius:12px;border:none;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;font-weight:800;font-size:0.92rem;cursor:pointer;box-shadow:0 6px 18px rgba(34,197,94,0.35);">🎲 Sortear grupos</button>' +
            '</div>' +
            '<div style="overflow-y:auto;flex:1;padding:1.5rem;">';

        if (!_grpCands.length) {
            html += '<div style="text-align:center;padding:2rem;color:var(--text-muted);">' + N + ' ' + unitLabel + ' — sem divisão em grupos de 3 a 6.</div></div></div>';
            return html;
        }

        var c = _grpCands[_grpIdx], adv = _grpAdv[_advIdx] || 2;
        var sizeLbl = (_grpEqualOnly || c.rem === 0) ? String(c.base) : (c.base + '–' + c.bigSize);

        // Slider de grupos (mesma ideia da config do torneio)
        html += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;">Divisão dos grupos <span style="opacity:0.8;">(← mais grupos menores · menos grupos maiores →)</span>:</div>';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;">';
        html += '<div style="text-align:center;min-width:64px;"><div style="font-size:1.8rem;font-weight:900;color:#fff;line-height:1;">' + c.g + '</div><div style="font-size:0.68rem;color:var(--text-muted);">grupos</div></div>';
        html += '<div style="text-align:center;min-width:64px;"><div style="font-size:1.8rem;font-weight:900;color:#fff;line-height:1;">' + sizeLbl + '</div><div style="font-size:0.68rem;color:var(--text-muted);">por grupo</div></div>';
        html += '</div>';
        html += '<input type="range" min="0" max="' + (_grpCands.length - 1) + '" step="1" value="' + _grpIdx + '" oninput="window._grpPanelSetGroup(this.value)" style="width:100%;accent-color:#3b82f6;margin:2px 0;">';
        var sup = _grpSuplentes(c);
        html += '<div style="text-align:center;font-size:0.74rem;color:var(--text-muted);margin-top:4px;">' + _grpSizesLabel(c) + (sup > 0 ? ' · <span style="color:#f59e0b;">' + sup + ' suplente' + (sup > 1 ? 's' : '') + '</span>' : '') + '</div>';
        html += '<div style="text-align:center;font-size:0.72rem;color:#cbd5e1;margin-top:4px;font-weight:600;">⚔️ ' + _grpMatches(c) + ' partidas · ⏱️ ' + _formatDuration(_grpDuration(c)) + '</div>';

        // Toggle "grupos de mesmo tamanho" — mesma opção da config do torneio.
        html += '<div style="display:flex;align-items:center;justify-content:center;gap:9px;margin-top:14px;">' +
          '<label class="toggle-switch" style="--toggle-on-bg:#f59e0b;--toggle-on-glow:rgba(245,158,11,0.3);--toggle-on-border:#f59e0b;flex-shrink:0;"><input type="checkbox"' + (_grpEqualOnly ? ' checked' : '') + ' onchange="window._grpPanelToggleEqual()"><span class="toggle-slider"></span></label>' +
          '<span style="font-size:0.82rem;color:var(--text-bright,#f1f5f9);">Apenas grupos de mesmo tamanho</span>' +
        '</div>';

        // Avançam (potência de 2) com +/-
        var advNote = (adv % c.g === 0) ? ('≈ ' + (adv / c.g) + ' por grupo') : ('os melhores ' + Math.max(1, Math.floor(adv / c.g)) + '/grupo + repescagem até ' + adv);
        html += '<div style="margin-top:1.4rem;padding-top:1.2rem;border-top:1px solid rgba(255,255,255,0.1);">';
        html += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;text-align:center;">Quantos avançam para a eliminatória (potência de 2):</div>';
        html += '<div style="display:flex;align-items:center;justify-content:center;gap:18px;">';
        html += '<button onclick="window._grpPanelStepAdv(-1)"' + (_advIdx <= 0 ? ' disabled' : '') + ' style="width:42px;height:42px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;font-size:1.4rem;font-weight:800;cursor:pointer;' + (_advIdx <= 0 ? 'opacity:0.3;' : '') + '">−</button>';
        html += '<div style="text-align:center;min-width:80px;"><div style="font-size:2.2rem;font-weight:950;color:#4ade80;line-height:1;">' + adv + '</div><div style="font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">avançam</div></div>';
        html += '<button onclick="window._grpPanelStepAdv(1)"' + (_advIdx >= _grpAdv.length - 1 ? ' disabled' : '') + ' style="width:42px;height:42px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);color:#fff;font-size:1.4rem;font-weight:800;cursor:pointer;' + (_advIdx >= _grpAdv.length - 1 ? 'opacity:0.3;' : '') + '">+</button>';
        html += '</div>';
        html += '<div style="text-align:center;font-size:0.72rem;color:#93c5fd;margin-top:8px;">' + advNote + '</div>';
        html += '</div>';

        html += '</div></div>';
        return html;
    }

    window._grpPanelSetGroup = function(v) { _grpIdx = parseInt(v, 10) || 0; overlay.innerHTML = renderPanel(); };
    window._grpPanelStepAdv = function(dir) { _advIdx = Math.max(0, Math.min(_grpAdv.length - 1, _advIdx + (dir > 0 ? 1 : -1))); overlay.innerHTML = renderPanel(); };
    window._grpPanelToggleEqual = function() { _grpEqualOnly = !_grpEqualOnly; overlay.innerHTML = renderPanel(); };
    window._grpPanelConfirm = function(tId) {
        var c = _grpCands[_grpIdx]; if (!c) return;
        var adv = _grpAdv[_advIdx] || 2;
        var perGroup = Math.max(1, Math.round(adv / c.g));
        // v3.0.x: o sorteio (formar duplas + montar todas as chaves dos grupos) é
        // pesado e síncrono — mostra "Processando…" no botão antes de começar.
        var _btn = document.getElementById('grp-panel-confirm-btn');
        if (_btn) { _btn.disabled = true; _btn.style.opacity = '0.75'; _btn.style.cursor = 'default'; _btn.innerHTML = '⏳ Processando o sorteio…'; }
        // defer pra o browser PINTAR o estado "processando" antes do trabalho pesado
        setTimeout(function() { window._selectGroupsConfig(tId, c.g, perGroup, adv, _grpEqualOnly); }, 30);
    };

    window._selectGroupsConfig = function(tId, numGroups, classPerGroup, advanceTotal, equalOnly) {
        var t = window._findTournamentById(tId);
        if (!t) return;
        t.gruposCount = numGroups;
        t.gruposClassified = classPerGroup;
        if (advanceTotal) t.gruposAdvanceTotal = advanceTotal;
        if (typeof equalOnly === 'boolean') t.gruposEqualOnly = equalOnly;
        // Ensure enrollment is closed
        if (t.status !== 'closed') {
            t.status = 'closed';
        }
        // Clean up suspension flags
        delete t._suspendedByPanel;
        delete t._previousStatus;
        window.FirestoreDB.saveTournament(t).then(function() {
            var panel = document.getElementById('groups-config-panel');
            if (panel) panel.remove();
            document.body.style.overflow = '';
            if (typeof window.generateDrawFunction === 'function') {
                window.generateDrawFunction(tId);
            }
        }).catch(function() {
            var panel = document.getElementById('groups-config-panel');
            if (panel) panel.remove();
            document.body.style.overflow = '';
            if (typeof window.generateDrawFunction === 'function') {
                window.generateDrawFunction(tId);
            }
        });
    };

    window._cancelGroupsConfig = function(tId) {
        var t = window._findTournamentById(tId);
        if (t && t._suspendedByPanel) {
            t.status = t._previousStatus || 'open';
            delete t._suspendedByPanel;
            delete t._previousStatus;
            window.FirestoreDB.saveTournament(t);
        }
        var panel = document.getElementById('groups-config-panel');
        if (panel) panel.remove();
        document.body.style.overflow = '';
    };

    overlay.innerHTML = renderPanel();
    document.body.appendChild(overlay);
};

// ============ DEDICATED REMAINDER PANEL ============
// Visually distinct from the power-of-2 panel (purple/indigo vs orange/brown)

window._showRemainderPanel = function(tId, info, t) {
    var existing = document.getElementById('remainder-resolution-panel');
    if (existing) existing.remove();

    var tIdSafe = String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    // v2.1.31: anuncia o SURPLUS REAL (resto + excesso de times) que vai pra
    // espera/exclusão, igual à ação em _executeRemoval — não só o "remainder" (1
    // avulso). Ex.: 19 avulsos (dupla) → 8 times jogam, 3 vão pra espera.
    var _tObj = t || (window.AppStore && window.AppStore.tournaments.find(function(x) { return x.id.toString() === tId.toString(); }));
    var _ts = info.teamSize || 1;
    var _arr = (_tObj && Array.isArray(_tObj.participants)) ? _tObj.participants : [];
    var _playersOf = function(p) { return window._entryTeamMembers(p) ? _ts : 1; }; // v3.0.x: time por estrutura, não por '/'
    var _totalPlayers = _arr.reduce(function(s, p) { return s + _playersOf(p); }, 0) || (info.effectiveTeams * _ts + info.remainder);
    var _maxTeams = Math.floor(_totalPlayers / _ts);
    var _targetTeams = _maxTeams >= 1 ? 1 : 0; while (_targetTeams * 2 <= _maxTeams) _targetTeams *= 2;
    var teamsFormed = _targetTeams;
    var remCount = _totalPlayers - (_targetTeams * _ts);
    var remLabel = remCount + ' ' + (remCount > 1 ? _t('predraw.unitParticipants') : _t('predraw.unitParticipantSingular'));
    var teamLabel = teamsFormed + ' ' + (teamsFormed > 1 ? _t('predraw.unitTeams') : _t('predraw.unitTeamSingular'));

    // Store info globally so onclick handlers can access it without JSON in attributes
    window._remainderInfo = info;

    var overlay = document.createElement('div');
    overlay.id = 'remainder-resolution-panel';
    // Use svh (small viewport height) so iOS Safari's dynamic address bar
    // doesn't push the modal partially off-screen.
    overlay.style.cssText = 'position:fixed;inset:0;width:100vw;min-height:100vh;min-height:100dvh;background:rgba(0,0,0,0.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:0.75rem;overflow:hidden;';
    document.body.style.overflow = 'hidden';

    overlay.innerHTML = '<div style="background:var(--bg-card,#1e293b);width:94%;max-width:560px;border-radius:28px;border:1px solid rgba(139,92,246,0.3);box-shadow:0 30px 100px rgba(0,0,0,0.7),0 0 60px rgba(139,92,246,0.1);overflow:hidden;animation:modalFadeIn 0.3s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;max-height:94svh;">' +
        '<style>@keyframes modalFadeIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}</style>' +
        // Sticky top bar with cancel
        '<div style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#4c1d95 0%,#6d28d9 50%,#7c3aed 100%);padding:10px 1.25rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:1.3rem;">👥</span>' +
                '<div>' +
                    '<h3 style="margin:0;color:#ede9fe;font-size:1rem;font-weight:900;letter-spacing:-0.02em;">' + _t('predraw.remainderTitle') + '</h3>' +
                    '<p style="margin:2px 0 0;color:#c4b5fd;font-size:0.72rem;">' + _t('predraw.remainderSubtitle', {label: remLabel, p: (remCount > 1 ? 'm' : '')}) + '</p>' +
                '</div>' +
            '</div>' +
            '<button onclick="window._cancelRemainderPanel(\'' + tIdSafe + '\')" style="background:rgba(0,0,0,0.25);color:#ede9fe;border:2px solid rgba(237,233,254,0.3);padding:6px 16px;border-radius:10px;font-weight:700;font-size:0.8rem;cursor:pointer;transition:all 0.2s;white-space:nowrap;flex-shrink:0;" onmouseover="this.style.background=\'rgba(0,0,0,0.4)\';this.style.borderColor=\'rgba(237,233,254,0.5)\'" onmouseout="this.style.background=\'rgba(0,0,0,0.25)\';this.style.borderColor=\'rgba(237,233,254,0.3)\'">' + _t('predraw.cancelBtn') + '</button>' +
        '</div>' +
        // Scrollable content
        '<div style="overflow-y:auto;flex:1;">' +
        // Info summary
        '<div style="background:linear-gradient(135deg,#4c1d95 0%,#7c3aed 100%);padding:0.9rem 1.25rem;">' +
            '<div style="display:flex;gap:0.6rem;flex-wrap:wrap;">' +
                '<div style="flex:1;min-width:90px;background:rgba(255,255,255,0.08);border-radius:12px;padding:8px 10px;text-align:center;">' +
                    '<div style="font-size:1.4rem;font-weight:900;color:#a78bfa;line-height:1;">' + teamsFormed + '</div>' +
                    '<div style="font-size:0.62rem;color:#c4b5fd;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">' + _t('predraw.teamsFormed') + '</div>' +
                '</div>' +
                '<div style="flex:1;min-width:90px;background:rgba(255,255,255,0.08);border-radius:12px;padding:8px 10px;text-align:center;">' +
                    '<div style="font-size:1.4rem;font-weight:900;color:#f59e0b;line-height:1;">' + remCount + '</div>' +
                    '<div style="font-size:0.62rem;color:#fcd34d;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">' + _t('predraw.remainderLabel') + '</div>' +
                '</div>' +
                '<div style="flex:1;min-width:90px;background:rgba(255,255,255,0.08);border-radius:12px;padding:8px 10px;text-align:center;">' +
                    '<div style="font-size:1.4rem;font-weight:900;color:#60a5fa;line-height:1;">' + info.totalRawParticipants + '</div>' +
                    '<div style="font-size:0.62rem;color:#93c5fd;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;">' + _t('predraw.totalEnrolled') + '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        // Options
        '<div style="padding:0.85rem 1.25rem 1.1rem;">' +
            '<h4 style="margin:0 0 0.5rem;color:#94a3b8;font-size:0.68rem;text-transform:uppercase;letter-spacing:1.8px;font-weight:700;">' + _t('predraw.whatToDo') + '</h4>' +
            // Sorteio Geral toggle (default ON = random; OFF = last)
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;background:rgba(255,255,255,0.04);border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin-bottom:9px;">' +
                '<div style="flex:1;min-width:0;">' +
                    '<div style="font-weight:800;color:#ede9fe;font-size:0.82rem;">' + _t('predraw.randomToggleLabel') + '</div>' +
                    '<div id="remainder-toggle-desc" style="font-size:0.7rem;color:#c4b5fd;margin-top:2px;line-height:1.35;">' + _t('predraw.randomToggleOn') + '</div>' +
                '</div>' +
                '<label class="toggle-switch" style="flex-shrink:0;"><input type="checkbox" id="remainder-random-toggle" checked onchange="var d=document.getElementById(\'remainder-toggle-desc\');if(d)d.textContent=this.checked?window._t(\'predraw.randomToggleOn\'):window._t(\'predraw.randomToggleOff\');"><span class="toggle-slider"></span></label>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px;">' +
                // Reabrir Inscrições
                '<button onclick="document.getElementById(\'remainder-resolution-panel\').remove();document.body.style.overflow=\'\';window._showReopenPanel(\'' + tIdSafe + '\',window._remainderInfo)" style="background:rgba(59,130,246,0.08);border:2px solid rgba(59,130,246,0.25);border-radius:12px;padding:10px 12px;cursor:pointer;text-align:left;color:#e2e8f0;transition:all 0.2s;display:flex;align-items:center;gap:12px;" onmouseover="this.style.borderColor=\'rgba(59,130,246,0.5)\';this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 4px 20px rgba(59,130,246,0.15)\'" onmouseout="this.style.borderColor=\'rgba(59,130,246,0.25)\';this.style.transform=\'\';this.style.boxShadow=\'\'">' +
                    '<span style="font-size:1.3rem;flex-shrink:0;">↩️</span>' +
                    '<div>' +
                        '<div style="font-weight:800;font-size:0.88rem;color:#60a5fa;">' + _t('predraw.p2PollReopenTitle') + '</div>' +
                        '<div style="font-size:0.72rem;color:rgba(255,255,255,0.5);margin-top:2px;line-height:1.3;">' + _t('predraw.reopenRemainderDesc', {label: (remCount > 1 ? _t('predraw.remainderTeamMany') : _t('predraw.remainderTeamOne'))}) + '</div>' +
                    '</div>' +
                '</button>' +
                // Lista de Espera (reads toggle for method)
                '<button onclick="window._applyRemainderAction(\'' + tIdSafe + '\',\'standby\')" style="background:rgba(168,85,247,0.08);border:2px solid rgba(168,85,247,0.25);border-radius:12px;padding:10px 12px;cursor:pointer;text-align:left;color:#e2e8f0;transition:all 0.2s;display:flex;align-items:center;gap:12px;" onmouseover="this.style.borderColor=\'rgba(168,85,247,0.5)\';this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 4px 20px rgba(168,85,247,0.15)\'" onmouseout="this.style.borderColor=\'rgba(168,85,247,0.25)\';this.style.transform=\'\';this.style.boxShadow=\'\'">' +
                    '<span style="font-size:1.3rem;flex-shrink:0;">⏱️</span>' +
                    '<div>' +
                        '<div style="font-weight:800;font-size:0.88rem;color:#c084fc;">' + _t('predraw.waitlistTitle') + '</div>' +
                        '<div style="font-size:0.72rem;color:rgba(255,255,255,0.5);margin-top:2px;line-height:1.3;">' + _t('predraw.standbyRemainderDesc', {label: remLabel}) + '</div>' +
                    '</div>' +
                '</button>' +
                // Exclusão (reads toggle for method)
                '<button onclick="window._applyRemainderAction(\'' + tIdSafe + '\',\'exclusion\')" style="background:rgba(239,68,68,0.08);border:2px solid rgba(239,68,68,0.25);border-radius:12px;padding:10px 12px;cursor:pointer;text-align:left;color:#e2e8f0;transition:all 0.2s;display:flex;align-items:center;gap:12px;" onmouseover="this.style.borderColor=\'rgba(239,68,68,0.5)\';this.style.transform=\'translateY(-1px)\';this.style.boxShadow=\'0 4px 20px rgba(239,68,68,0.15)\'" onmouseout="this.style.borderColor=\'rgba(239,68,68,0.25)\';this.style.transform=\'\';this.style.boxShadow=\'\'">' +
                    '<span style="font-size:1.3rem;flex-shrink:0;">🚫</span>' +
                    '<div>' +
                        '<div style="font-weight:800;font-size:0.88rem;color:#f87171;">' + _t('predraw.exclusionTitle') + '</div>' +
                        '<div style="font-size:0.72rem;color:rgba(255,255,255,0.5);margin-top:2px;line-height:1.3;">' + _t('predraw.exclusionRemainderDesc', {label: remLabel}) + '</div>' +
                    '</div>' +
                '</button>' +
            '</div>' +
        '</div>' +
        '</div>' +
    '</div>';

    document.body.appendChild(overlay);
};

window._cancelRemainderPanel = function(tId) {
    var t = window._findTournamentById(tId);
    if (t && t._suspendedByPanel) {
        t.status = t._previousStatus || 'open';
        delete t._suspendedByPanel;
        delete t._previousStatus;
        window.FirestoreDB.saveTournament(t);
    }
    var panel = document.getElementById('remainder-resolution-panel');
    if (panel) panel.remove();
    document.body.style.overflow = '';
};

// Remainder panel: read "Sorteio Geral" toggle and dispatch directly to _executeRemoval.
// Replaces the old two-step flow (remainder panel → sub-choice panel).
window._applyRemainderAction = function(tId, mode) {
    var toggleEl = document.getElementById('remainder-random-toggle');
    var method = (toggleEl && toggleEl.checked) ? 'random' : 'last';
    var panel = document.getElementById('remainder-resolution-panel');
    if (panel) panel.remove();
    document.body.style.overflow = '';
    window._executeRemoval(tId, mode, method);
};

// ============ SUB-CHOICE & REMOVAL (standalone, works from both panels) ============

window._showRemovalSubChoice = function(tId, mode, info) {
    var isStandby = mode === 'standby';
    var title = isStandby ? ('⏱️ ' + _t('predraw.waitlistTitle')) : ('🚫 ' + _t('predraw.exclusionTitle'));
    var removeCount = info.remainder > 0 ? info.remainder : info.excessParticipants;
    var label = removeCount + ' ' + (removeCount > 1 ? _t('predraw.unitParticipants') : _t('predraw.unitParticipantSingular'));
    var subtitle = isStandby
        ? _t('predraw.removalSubStandby', {label: label})
        : _t('predraw.removalSubExclusion', {label: label});

    var tIdSafe = String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    var existing = document.getElementById('removal-subchoice-panel');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'removal-subchoice-panel';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;';

    var _gradStart = isStandby ? '#1e40af' : '#991b1b';
    var _gradEnd = isStandby ? '#3b82f6' : '#dc2626';

    overlay.innerHTML = '<div style="background:var(--bg-card,#1e293b);width:94%;max-width:500px;border-radius:24px;border:1px solid rgba(251,191,36,0.2);box-shadow:0 30px 100px rgba(0,0,0,0.7);overflow:hidden;display:flex;flex-direction:column;max-height:90vh;">' +
        // Sticky top bar with Voltar button
        '<div style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,' + _gradStart + ' 0%,' + _gradEnd + ' 100%);padding:12px 1.5rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:1.3rem;">' + (isStandby ? '⏱️' : '🚫') + '</span>' +
                '<div>' +
                    '<h3 style="margin:0;color:#fff;font-size:1.05rem;font-weight:900;">' + (isStandby ? _t('predraw.waitlistTitle') : _t('predraw.exclusionTitle')) + '</h3>' +
                    '<p style="margin:2px 0 0;color:rgba(255,255,255,0.7);font-size:0.72rem;">' + subtitle + '</p>' +
                '</div>' +
            '</div>' +
            '<button onclick="document.getElementById(\'removal-subchoice-panel\').remove();window.showUnifiedResolutionPanel(\'' + tIdSafe + '\')" style="background:rgba(0,0,0,0.25);color:#fff;border:2px solid rgba(255,255,255,0.3);padding:8px 20px;border-radius:12px;font-weight:700;font-size:0.85rem;cursor:pointer;transition:all 0.2s;white-space:nowrap;flex-shrink:0;" onmouseover="this.style.background=\'rgba(0,0,0,0.4)\';this.style.borderColor=\'rgba(255,255,255,0.5)\'" onmouseout="this.style.background=\'rgba(0,0,0,0.25)\';this.style.borderColor=\'rgba(255,255,255,0.3)\'">' + _t('predraw.backBtn') + '</button>' +
        '</div>' +
        // Scrollable content
        '<div style="overflow-y:auto;flex:1;padding:1.5rem 2rem;">' +
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
                '<button onclick="window._executeRemoval(\'' + tIdSafe + '\',\'' + mode + '\',\'random\')" style="background:rgba(168,85,247,0.1);border:2px solid rgba(168,85,247,0.3);border-radius:16px;padding:16px;cursor:pointer;text-align:left;color:#e2e8f0;transition:all 0.2s;" onmouseover="this.style.borderColor=\'rgba(168,85,247,0.6)\';this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.borderColor=\'rgba(168,85,247,0.3)\';this.style.transform=\'\'">' +
                    '<div style="font-weight:800;font-size:0.95rem;color:#c084fc;">' + _t('predraw.removalRandTitle') + '</div>' +
                    '<div style="font-size:0.78rem;color:rgba(255,255,255,0.6);margin-top:4px;">' + _t('predraw.randomSubtitle', {n: removeCount, s: (removeCount > 1 ? 's' : '')}) + '</div>' +
                '</button>' +
                '<button onclick="window._executeRemoval(\'' + tIdSafe + '\',\'' + mode + '\',\'last\')" style="background:rgba(251,191,36,0.1);border:2px solid rgba(251,191,36,0.3);border-radius:16px;padding:16px;cursor:pointer;text-align:left;color:#e2e8f0;transition:all 0.2s;" onmouseover="this.style.borderColor=\'rgba(251,191,36,0.6)\';this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.borderColor=\'rgba(251,191,36,0.3)\';this.style.transform=\'\'">' +
                    '<div style="font-weight:800;font-size:0.95rem;color:#fbbf24;">' + _t('predraw.removalLastTitle') + '</div>' +
                    '<div style="font-size:0.78rem;color:rgba(255,255,255,0.6);margin-top:4px;">' + (isStandby ? _t('predraw.lastStandbySubtitle', {n: removeCount, s: (removeCount > 1 ? 's' : '')}) : _t('predraw.lastExclusionSubtitle', {n: removeCount, s: (removeCount > 1 ? 's' : '')})) + '</div>' +
                '</button>' +
            '</div>' +
        '</div>' +
    '</div>';

    document.body.appendChild(overlay);
};

window._executeRemoval = function(tId, mode, method) {
    var panel = document.getElementById('removal-subchoice-panel');
    if (panel) panel.remove();

    var t = window._findTournamentById(tId);
    if (!t) return;

    var arr = Array.isArray(t.participants) ? t.participants.slice() : [];
    // v2.1.29: remove em PLAYERS até sobrar exatamente a maior potência de 2 de
    // TIMES COMPLETOS — zero resto, zero BYE. Antes removia só o "remainder" (o
    // avulso, 1), deixando nº de times fora da potência de 2 → BYE. Ex.: 19
    // avulsos (dupla) → mantém 16 (8 duplas) e manda 3 pra espera.
    var _ts = parseInt(t.teamSize) || 1;
    var _enr = t.enrollmentMode || t.enrollment || 'individual';
    if ((_enr === 'time' || _enr === 'misto') && _ts < 2) _ts = 2;
    var _playersOf = function(p) { return window._entryTeamMembers(p) ? _ts : 1; }; // v3.0.x: time por estrutura, não por '/'
    var _totalPlayers = arr.reduce(function(s, p) { return s + _playersOf(p); }, 0);
    var _maxTeams = Math.floor(_totalPlayers / _ts);
    var _targetTeams = _maxTeams >= 1 ? 1 : 0;
    while (_targetTeams * 2 <= _maxTeams) _targetTeams *= 2;
    var _playersToRemove = _totalPlayers - (_targetTeams * _ts);
    var removed = [];
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
    var removeCount = removed.length;

    t.participants = arr;

    if (mode === 'standby') {
        t.waitlist = (t.waitlist || []).concat(removed);
    }

    if (t._suspendedByPanel) {
        delete t._suspendedByPanel;
        delete t._previousStatus;
    }
    t.status = 'closed';

    // Log to history so it appears in the final-review panel
    var removedNames = removed.map(function(p) {
        return typeof p === 'string' ? p : (p.displayName || p.name || '?');
    }).join(', ');
    var methodLabel = method === 'random' ? 'sorteio geral' : 'últimos inscritos';
    var actionVerb = mode === 'standby' ? 'movido(s) para lista de espera' : 'removido(s) do torneio';
    var logMsg = 'Resolução do resto (' + methodLabel + '): ' + removeCount + ' participante(s) ' + actionVerb + ' — ' + removedNames;
    if (window.AppStore && typeof window.AppStore.logAction === 'function') {
        window.AppStore.logAction(tId, logMsg);
    }

    window.FirestoreDB.saveTournament(t).then(function() {
        var actionLabel = mode === 'standby' ? _t('predraw.movedToWaitlist') : _t('predraw.removedLabel');
        if (typeof showNotification !== 'undefined') {
            showNotification(_t('draw.adjustDone'), removedNames + ' ' + actionLabel + '.', 'success');
        }
        // Update stat-boxes (inscritos count + waitlist) in the detail view
        if (typeof window._updateStatBoxes === 'function') {
            window._updateStatBoxes(t);
        }
        // Re-diagnose: if resolved, draw immediately; otherwise show panel again
        var recheck = window._diagnoseAll(t);
        if (!recheck.hasIssues && typeof window.generateDrawFunction === 'function') {
            window.generateDrawFunction(tId);
        } else {
            window.showUnifiedResolutionPanel(tId);
        }
    });
};

// ============ UNIFIED RESOLUTION PANEL (POWER-OF-2) ============

window.showUnifiedResolutionPanel = function(tId) {
    const t = window._findTournamentById(tId);
    if (!t) return;

    // Swiss/Liga: skip power-of-2 and odd-number checks — these formats handle BYEs naturally
    var _isSuicoOrLiga = t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss' || t.currentStage === 'swiss' || (window._isLigaFormat && window._isLigaFormat(t));
    if (_isSuicoOrLiga) {
        window.showFinalReviewPanel(tId);
        return;
    }

    // Groups format: redirect to dedicated groups config panel
    var _isGruposFmt = t.format === 'Fase de Grupos + Eliminatórias' || t.format === 'Grupos + Eliminatória' || t.format === 'Grupos + Mata-Mata' || (t.format || '').indexOf('Grupo') !== -1;
    if (_isGruposFmt && typeof window._showGroupsConfigPanel === 'function') {
        var _diagG = window._diagnoseAll(t);
        // v3.0.x: a Fase de Grupos NÃO usa potência de 2. A sobra ímpar (quem não
        // forma dupla) vai pra lista de espera no sorteio — não deve cair no painel
        // de "resto/potência de 2" da eliminatória. Só caímos no painel padrão se
        // houver TIMES INCOMPLETOS de verdade (duplas pré-formadas faltando membro).
        if (_diagG.incompleteTeams.length === 0) {
            window._showGroupsConfigPanel(tId);
            return;
        }
    }

    // Suspend enrollment while decision panel is open
    if (t.status !== 'closed') {
        t._previousStatus = t.status; // preserve original status for cancel
        t.status = 'closed';
        t._suspendedByPanel = true;
        window.FirestoreDB.saveTournament(t);
    }

    const info = window._diagnoseAll(t);

    // If no issues, proceed directly to actual draw (skip Final Review step)
    if (!info.hasIssues) {
        // Auto-restore enrollment
        if (t._suspendedByPanel) {
            t.status = t._previousStatus || 'open';
            delete t._suspendedByPanel;
            delete t._previousStatus;
            window.FirestoreDB.saveTournament(t);
        }
        if (typeof window.generateDrawFunction === 'function') {
            window.generateDrawFunction(tId);
        } else {
            window.showFinalReviewPanel(tId);
        }
        return;
    }

    // Remainder gets its own dedicated panel (different from power-of-2)
    if (info.remainder > 0) {
        window._showRemainderPanel(tId, info, t);
        return;
    }

    // Remove any existing panels
    const existing = document.getElementById('unified-resolution-panel');
    if (existing) existing.remove();

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'unified-resolution-panel';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem 0;';
    document.body.style.overflow = 'hidden';

    // Build issues description
    let issuesList = [];
    if (info.incompleteTeams.length > 0) {
        issuesList.push(_t('predraw.issueIncompleteTeams', {n: info.incompleteTeams.length}));
    }
    if (info.remainder > 0) {
        issuesList.push(_t('predraw.issueRemainder', {n: info.remainder, s: info.remainder > 1 ? 's' : ''}));
    }
    if (info.isOdd && info.remainder === 0) {
        issuesList.push(_t('predraw.issueOddUnits', {unit: info.isTeam ? _t('predraw.unitTeams') : _t('predraw.unitParts')}));
    }
    if (!info.isPowerOf2 && info.remainder === 0 && !info.isOdd) {
        issuesList.push(_t('predraw.issueNotPow2'));
    }

    const issuesText = issuesList.join(', ');
    const tIdSafe = String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    // State for excluded options
    if (!window._unifiedExcludedKeys) {
        window._unifiedExcludedKeys = [];
    }

    // ── v4.0.52: estimativa de tempo POR OPÇÃO (dinâmica) + seleção→confirmar ──
    // Espelha o cálculo do antigo _showPhaseResolutionPanel (que o dono aprovou):
    // nº de jogos por solução × duração × quadras. O clique numa opção SELECIONA
    // (atualiza a estimativa); o Confirmar no topo APLICA. Isso unifica o padrão
    // do painel de fase aqui, pra depois apagar o legado sem regressão.
    window._unifiedSel = null; // re-seleciona o recomendado a cada abertura
    var _uDur = parseInt(t.gameDuration) || 30;
    var _uCourts = parseInt(t.courtCount) || (Array.isArray(t.courtNames) ? t.courtNames.length : 0) || 2;
    var _uIsDouble = (t.format || '').indexOf('Dupla') !== -1;
    var _uGamesFor = function(key) {
        var s = info.effectiveTeams, lo = info.loP2, hi = info.hiP2, base;
        if (!s || s <= 1) return null;
        if ((s & (s - 1)) === 0) base = s - 1;                                  // já é potência de 2
        else if (key === 'bye') base = s - 1;                                    // chave de hi com folgas
        else if (key === 'playin') base = Math.floor(s / 2) + (lo - 1) + (s % 2);// repescagem (mais jogos)
        else if (key === 'reopen') base = hi - 1;                                // enche até hi
        else if (key === 'standby' || key === 'exclusion') base = lo - 1;        // cai pra lo
        else if (key === 'swiss') { base = (window._unifiedSwissRounds || 3) * Math.floor(s / 2) + (window._unifiedSwissElim || 0); } // X rodadas de suíço + eliminatória de loP2
        else return null;                                                        // dissolve/poll: sem estimativa direta
        // dupla elim ≈ dobro - 1; NÃO ao Suíço (a eliminatória do Suíço já entra em _unifiedSwissElim).
        if (_uIsDouble && base > 0 && key !== 'swiss') base = 2 * base - 1;
        return base;
    };
    var _uFmtMin = function(m) { var h = Math.floor(m / 60), mm = m % 60; return h > 0 ? (h + 'h' + (mm ? ' ' + mm + 'm' : '')) : (mm + 'm'); };
    // v4.0.70: Suíço = X RODADAS de suíço → classifica pra ELIMINATÓRIA (chave de loP2).
    // X escolhido pelo organizador (stepper − / + no detalhe); o tempo recalcula ao vivo.
    window._unifiedSwissHalf = Math.floor(info.effectiveTeams / 2);
    window._unifiedSwissElim = (function () { var e = info.loP2 - 1; if (_uIsDouble && e > 0) e = 2 * e - 1; return Math.max(0, e); })();
    window._unifiedSwissLo = info.loP2;
    window._unifiedSwissRounds = Math.max(2, Math.ceil(Math.log(Math.max(2, info.effectiveTeams)) / Math.log(2)));
    window._unifiedFmtMin = _uFmtMin;
    window._unifiedEstData = {};
    ['reopen','bye','playin','standby','exclusion','swiss','dissolve','poll'].forEach(function(k){
        var g = _uGamesFor(k);
        if (g == null) { window._unifiedEstData[k] = null; return; }
        var mins = Math.ceil(g / Math.max(1, _uCourts)) * _uDur;
        window._unifiedEstData[k] = { games: g, mins: mins, fmt: _uFmtMin(mins) };
    });
    window._unifiedCourts = _uCourts;
    window._unifiedDur = _uDur;
    window._unifiedTId = tIdSafe;
    // v4.0.68: resumo por opção = TÍTULO (nome da opção) + passos (processo → chave).
    // A estimativa de tempo vem do _unifiedEstData. Mostrado no detalhe sticky ao
    // selecionar. Formato pedido pelo dono (ex. Play-in).
    var _uUnit = info.isTeam ? 'times' : 'participantes';
    var _uUnit1 = info.isTeam ? 'time' : 'participante';
    var _uG = Math.floor(info.effectiveTeams / 2);
    var _nBL = Math.max(0, info.loP2 - _uG), _nMiss = info.missing, _nExc = info.excess;
    window._unifiedSummary = {
        reopen:    { title: _t('predraw.optReopenTitle'),    lines: [(_nMiss === 1 ? 'Espera mais 1 ' + _uUnit1 + ' se inscrever' : 'Espera mais ' + _nMiss + ' ' + _uUnit + ' se inscreverem'), 'Chave de ' + info.hiP2 + ' (potência de 2)'] },
        bye:       { title: _t('predraw.optByeTitle'),       lines: ['Chave de ' + info.hiP2, (_nMiss === 1 ? 'O melhor folga (BYE) a 1ª rodada' : 'Os ' + _nMiss + ' melhores folgam (BYE) a 1ª rodada'), 'Os demais jogam a 1ª rodada normal'] },
        playin:    { title: _t('predraw.optPlayinTitle'),    lines: ['Todos disputam a 1ª rodada', (_nBL <= 0 ? 'Os vencedores passam para a 2ª rodada' : (_nBL === 1 ? 'Vencedores e 1 melhor derrotado passam para a 2ª rodada' : 'Vencedores e ' + _nBL + ' melhores derrotados passam para a 2ª rodada')), 'Chave de ' + info.loP2] },
        standby:   { title: _t('predraw.optStandbyTitle'),   lines: ['Chave de ' + info.loP2 + ' (potência de 2)', (_nExc === 1 ? 'O último vai pra lista de espera' : 'Os ' + _nExc + ' últimos vão pra lista de espera'), 'Disponíveis pra substituir num W.O.'] },
        exclusion: { title: _t('predraw.optExclusionTitle'), lines: ['Chave de ' + info.loP2, (_nExc === 1 ? 'O último é removido do torneio' : 'Os ' + _nExc + ' últimos são removidos do torneio')] },
        swiss:     { title: _t('predraw.optSwissTitle'),     lines: ['Troca pro formato Suíço', 'Todos jogam várias rodadas, sem eliminação direta', 'Classificação por pontos'] },
        dissolve:  { title: _t('predraw.optDissolveTitle'),  lines: ['Desfaz os times incompletos em jogadores individuais', 'Re-sorteia as duplas'] },
        poll:      { title: _t('predraw.optPollTitle'),      lines: ['Cria uma enquete pros participantes', 'Eles votam na solução a aplicar'] }
    };

    // Render function (allows re-rendering on exclude)
    window._renderUnifiedOptions = function(excludedKeys) {
        excludedKeys = excludedKeys || [];

        // Dynamic descriptions based on context
        var _remLabel = info.remainder > 0 ? info.remainder + ' ' + (info.remainder > 1 ? _t('predraw.unitParticipants') : _t('predraw.unitParticipantSingular')) : '';
        var _excessLabel = info.excess > 0
            ? info.excess + ' ' + (info.isTeam
                ? (info.excess > 1 ? _t('predraw.unitTeams') : _t('predraw.unitTeamSingular'))
                : (info.excess > 1 ? _t('predraw.unitParts') : _t('predraw.unitParticipantSingular')))
            : '';
        var _standbyDesc = info.remainder > 0
            ? _t('predraw.standbyRemDesc', {label: _remLabel})
            : _t('predraw.standbyExcessDesc', {label: (_excessLabel || _t('predraw.standbyExcessFallback'))});
        var _exclusionDesc = info.remainder > 0
            ? _t('predraw.exclusionRemDesc', {label: _remLabel})
            : _t('predraw.exclusionExcessDesc', {label: (_excessLabel || _t('predraw.exclusionExcessFallback'))});

        // Define all possible options
        const allOptions = [
            { key: 'reopen', icon: '↩️', title: _t('predraw.optReopenTitle'), desc: _t('predraw.optReopenDesc') },
            { key: 'bye', icon: '🥇', title: _t('predraw.optByeTitle'), desc: _t('predraw.optByeDesc') },
            { key: 'playin', icon: '🔁', title: _t('predraw.optPlayinTitle'), desc: _t('predraw.optPlayinDesc') },
            { key: 'standby', icon: '⏱️', title: _t('predraw.optStandbyTitle'), desc: _standbyDesc },
            { key: 'exclusion', icon: '🚫', title: _t('predraw.optExclusionTitle'), desc: _exclusionDesc },
            { key: 'swiss', icon: '🏅', title: _t('predraw.optSwissTitle'), desc: _t('predraw.optSwissDesc') },
            { key: 'dissolve', icon: '🧩', title: _t('predraw.optDissolveTitle'), desc: _t('predraw.optDissolveDesc') },
            { key: 'poll', icon: '🗳️', title: _t('predraw.optPollTitle'), desc: _t('predraw.optPollDesc') }
        ];

        // Filter options based on context
        // When there's remainder, show only remainder-specific options first
        var remainderKeys = ['standby', 'exclusion', 'reopen'];
        let activeOptions = allOptions.filter(function(o) {
            if (excludedKeys.indexOf(o.key) !== -1) return false;
            if (info.remainder > 0) return remainderKeys.indexOf(o.key) !== -1;
            return true;
        });

        // Nash scoring: fairness 45%, inclusion 35%, effort 20%
        const wF = 0.45, wI = 0.35, wE = 0.20;
        const payoffs = {
            reopen:    { f: 10, i: 10, e: 3 },
            bye:       { f: 6,  i: 10, e: 9 },
            playin:    { f: 8,  i: 10, e: 6 },
            standby:   { f: 6,  i: 4,  e: 9 },
            exclusion: { f: 3,  i: 2,  e: 10 },
            swiss:     { f: 9,  i: 10, e: 5 },
            dissolve:  { f: 7,  i: 7,  e: 4 },
            poll:      { f: 10, i: 10, e: 2 }
        };

        // Boost effort for reopen if missing is small
        if ((info.missing + info.remainder) <= 2) {
            payoffs.reopen.e = 8;
        }

        // Calculate scores
        let scores = {};
        let maxScore = 0, minScore = 10;
        activeOptions.forEach(function(o) {
            if (!payoffs[o.key]) return;
            const p = payoffs[o.key];
            scores[o.key] = p.f * wF + p.i * wI + p.e * wE;
            if (scores[o.key] > maxScore) maxScore = scores[o.key];
            if (scores[o.key] < minScore) minScore = scores[o.key];
        });

        const range = maxScore - minScore || 1;
        const norm = {};
        activeOptions.forEach(function(o) {
            if (scores[o.key] !== undefined) {
                norm[o.key] = (scores[o.key] - minScore) / range;
            }
        });

        // Color palette: 8 distinct colors ranked from best (0) to worst (7)
        var _nashPalette = ['#2ABFA3','#4A90D9','#A8D44B','#B3D9F7','#F5D63D','#F5A623','#F5653D','#D62020'];
        // Assign color by rank position (sorted descending, so index 0 = best)
        var _sortedKeys = activeOptions.slice().sort(function(a,b){ return (scores[b.key]||0)-(scores[a.key]||0); }).map(function(o){ return o.key; });

        function nashColorContinuous(n, key) {
            var rank = _sortedKeys.indexOf(key);
            if (rank < 0) rank = _sortedKeys.length - 1;
            var color = _nashPalette[Math.min(rank, _nashPalette.length - 1)];
            return {
                bg: color + '30',
                border: color + '80',
                glow: '0 0 12px ' + color + '25',
                pill: color,
                pillBg: color + '20'
            };
        }

        // Find best (excluding poll)
        let bestKey = '', bestVal = -1;
        activeOptions.forEach(function(o) {
            if (o.key !== 'poll' && scores[o.key] > bestVal) {
                bestVal = scores[o.key];
                bestKey = o.key;
            }
        });

        // v4.0.52: seleção default = recomendado (maior Nash). Mantém a escolha do
        // usuário enquanto a opção continuar ativa; senão recai no recomendado.
        if (!window._unifiedSel || excludedKeys.indexOf(window._unifiedSel) !== -1 || !activeOptions.some(function(o){ return o.key === window._unifiedSel; })) {
            window._unifiedSel = bestKey;
        }

        // Sort by Nash score descending (highest recommendation first)
        activeOptions.sort(function(a, b) {
            return (scores[b.key] || 0) - (scores[a.key] || 0);
        });

        let html = '';
        activeOptions.forEach(function(o) {
            const n = norm[o.key] !== undefined ? norm[o.key] : 0;
            const c = nashColorContinuous(n, o.key);
            const pct = Math.round(n * 100);
            const isBest = o.key === bestKey;
            const canExclude = activeOptions.length > 2;

            // Top row: Recomendado badge (left) + Exclude ✕ (right)
            var topRow = '<div style="display:flex;justify-content:space-between;align-items:center;min-height:22px;">';
            topRow += isBest ? '<span style="background:rgba(34,197,94,0.2);color:#4ade80;padding:2px 8px;border-radius:6px;font-size:0.62rem;font-weight:800;text-transform:uppercase;">' + _t('predraw.nashRecommended') + '</span>' : '<span></span>';
            topRow += canExclude ? '<span style="width:22px;height:22px;border-radius:50%;border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.25);color:#94a3b8;font-size:0.7rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all 0.2s;" title="' + _t('predraw.excludeOptionTitle') + '" onclick="event.stopPropagation();window._excludeUnifiedOption(\'' + o.key + '\')" onmouseover="this.style.background=\'rgba(239,68,68,0.3)\';this.style.color=\'#fca5a5\'" onmouseout="this.style.background=\'rgba(0,0,0,0.25)\';this.style.color=\'#94a3b8\'">✕</span>' : '';
            topRow += '</div>';

            // v4.0.52: estimativa de tempo POR opção (dinâmica, dados do torneio + local)
            var _ed = window._unifiedEstData && window._unifiedEstData[o.key];
            var _estPill = _ed
                ? '<span style="display:inline-block;padding:3px 10px;border-radius:8px;font-size:0.65rem;font-weight:800;background:rgba(16,185,129,0.16);color:#6ee7b7;">⏱️ ~' + _ed.fmt + '</span>'
                : '';
            var _selOn = (window._unifiedSel === o.key);
            // clique SELECIONA (não aplica); o Confirmar no topo aplica.
            html += '<button id="unif-opt-' + o.key + '" data-ukey="' + o.key + '" style="background:' + c.bg + ';border:2px solid ' + c.border + ';box-shadow:' + c.glow + ';outline:' + (_selOn ? '3px solid #fbbf24' : 'none') + ';outline-offset:1px;border-radius:16px;padding:12px 16px;cursor:pointer;transition:all 0.25s;text-align:center;color:#e2e8f0;display:flex;flex-direction:column;gap:6px;overflow:hidden;" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.filter=\'brightness(1.12)\'" onmouseout="this.style.transform=\'\';this.style.filter=\'\'" onclick="window._selectUnifiedOption(\'' + o.key + '\')">' +
                topRow +
                '<div style="font-size:1.8rem;line-height:1;">' + o.icon + '</div>' +
                '<div style="font-weight:800;font-size:0.95rem;color:#fff;">' + o.title + '</div>' +
                '<div style="font-size:0.75rem;color:rgba(255,255,255,0.65);line-height:1.4;">' + o.desc + '</div>' +
                '<div style="margin-top:auto;padding-top:6px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap;"><span style="display:inline-block;padding:3px 10px;border-radius:8px;font-size:0.65rem;font-weight:800;background:' + c.pillBg + ';color:' + c.pill + ';">Nash ' + pct + '%</span>' + _estPill + '</div>' +
            '</button>';
        });

        // Show excluded options
        const excludedOptions = allOptions.filter(function(o) { return excludedKeys.indexOf(o.key) !== -1; });
        if (excludedOptions.length > 0) {
            html += '<div style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">';
            html += '<span style="font-size:0.7rem;color:#64748b;margin-right:4px;line-height:28px;">' + _t('predraw.excluded') + '</span>';
            excludedOptions.forEach(function(o) {
                html += '<button onclick="event.stopPropagation();window._restoreUnifiedOption(\'' + o.key + '\')" style="background:rgba(255,255,255,0.04);border:1px dashed rgba(255,255,255,0.1);border-radius:8px;padding:4px 12px;color:#64748b;font-size:0.72rem;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor=\'rgba(255,255,255,0.3)\';this.style.color=\'#94a3b8\'" onmouseout="this.style.borderColor=\'rgba(255,255,255,0.1)\';this.style.color=\'#64748b\'">' + o.icon + ' ' + o.title + ' ↩</button>';
            });
            html += '</div>';
        }

        return html;
    };

    window._excludeUnifiedOption = function(key) {
        if (!window._unifiedExcludedKeys) window._unifiedExcludedKeys = [];
        if (window._unifiedExcludedKeys.indexOf(key) === -1) {
            window._unifiedExcludedKeys.push(key);
        }
        const grid = document.getElementById('unified-options-grid');
        if (grid) grid.innerHTML = window._renderUnifiedOptions(window._unifiedExcludedKeys);
    };

    window._restoreUnifiedOption = function(key) {
        if (!window._unifiedExcludedKeys) window._unifiedExcludedKeys = [];
        window._unifiedExcludedKeys = window._unifiedExcludedKeys.filter(function(k) { return k !== key; });
        const grid = document.getElementById('unified-options-grid');
        if (grid) grid.innerHTML = window._renderUnifiedOptions(window._unifiedExcludedKeys);
    };

    // v4.0.52: clique numa opção SELECIONA (destaca + estimativa já visível no card).
    // Não aplica — o Confirmar no topo é que dispara _handleUnifiedOption.
    window._selectUnifiedOption = function(key) {
        window._unifiedSel = key;
        var btns = document.querySelectorAll('#unified-options-grid [data-ukey]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].style.outline = (btns[i].getAttribute('data-ukey') === key) ? '3px solid #fbbf24' : 'none';
        }
        if (typeof window._updateUnifiedDetail === 'function') window._updateUnifiedDetail();
    };
    // v4.0.66: detalhe da opção SELECIONADA — resumo (o que faz neste caso) +
    // estimativa de tempo da fase. Atualiza a cada clique numa opção.
    window._updateUnifiedDetail = function() {
        var el = document.getElementById('unified-detail'); if (!el) return;
        var key = window._unifiedSel;
        // SUÍÇO: stepper de X RODADAS (− esquerda / + direita) + texto + estimativa AO VIVO
        if (key === 'swiss') {
            var _sx = window._unifiedSwissRounds || 3;
            var _sg = _sx * (window._unifiedSwissHalf || 0) + (window._unifiedSwissElim || 0);
            var _sm = Math.ceil(_sg / Math.max(1, window._unifiedCourts)) * window._unifiedDur;
            var _sf = window._unifiedFmtMin ? window._unifiedFmtMin(_sm) : (Math.round(_sm / 60) + 'h');
            var _rw = _sx > 1 ? 'rodadas' : 'rodada';
            var _stepBtn = 'width:38px;height:38px;border-radius:10px;border:2px solid rgba(254,243,199,0.4);background:rgba(0,0,0,0.3);color:#fef3c7;font-size:1.4rem;font-weight:900;cursor:pointer;line-height:1;flex-shrink:0;';
            el.innerHTML =
                '<div style="font-weight:900;color:#fbbf24;font-size:0.92rem;margin-bottom:7px;">' + ((window._unifiedSummary && window._unifiedSummary.swiss) ? window._unifiedSummary.swiss.title : 'Formato Suíço') + '</div>' +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                    '<button onclick="window._unifiedSwissStep(-1)" title="Menos uma rodada" style="' + _stepBtn + '">−</button>' +
                    '<div style="min-width:52px;height:38px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);border:2px solid rgba(254,243,199,0.3);border-radius:10px;"><span style="font-size:1.5rem;font-weight:950;color:#fff;line-height:1;">' + _sx + '</span></div>' +
                    '<button onclick="window._unifiedSwissStep(1)" title="Mais uma rodada" style="' + _stepBtn + '">+</button>' +
                    '<span style="font-size:0.92rem;color:#fde68a;font-weight:600;margin-left:2px;">' + _rw + '</span>' +
                '</div>' +
                '<div style="font-size:0.8rem;color:#fef3c7;line-height:1.55;">' + _sx + ' ' + _rw + ' de Suíço para classificar para as eliminatórias <b>(chave de ' + (window._unifiedSwissLo || '?') + ')</b></div>' +
                '<div style="margin-top:7px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-weight:800;color:#6ee7b7;font-size:0.95rem;">⏱️ ~' + _sf + '</span><span style="opacity:0.8;font-size:0.72rem;color:#e2e8f0;">(' + _sg + ' jogos · ' + window._unifiedCourts + ' quadra' + (window._unifiedCourts > 1 ? 's' : '') + ' · ' + window._unifiedDur + ' min/jogo)</span></div>';
            return;
        }
        var d = (window._unifiedSummary && window._unifiedSummary[key]) || null;
        var ed = window._unifiedEstData && window._unifiedEstData[key];
        var estLine = ed
            ? '<div style="margin-top:7px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span style="font-weight:800;color:#6ee7b7;font-size:0.95rem;">⏱️ ~' + ed.fmt + '</span><span style="opacity:0.8;font-size:0.72rem;color:#e2e8f0;">(' + ed.games + ' jogos · ' + window._unifiedCourts + ' quadra' + (window._unifiedCourts > 1 ? 's' : '') + ' · ' + window._unifiedDur + ' min/jogo)</span></div>'
            : '<div style="margin-top:7px;font-size:0.76rem;color:#e2e8f0;opacity:0.8;">⏱️ A estimativa depende da configuração após esta opção.</div>';
        // NOME da opção no topo + passos (processo → chave) + estimativa
        var title = d ? d.title : '';
        var linesHtml = (d && d.lines) ? d.lines.map(function(l, i) { return (i > 0 ? '<span style="opacity:0.4;margin:0 5px;">→</span>' : '') + l; }).join('') : '';
        el.innerHTML =
            '<div style="font-weight:900;color:#fbbf24;font-size:0.92rem;margin-bottom:4px;">' + title + '</div>' +
            '<div style="font-size:0.78rem;color:#fef3c7;line-height:1.55;">' + linesHtml + '</div>' +
            estLine;
    };
    // v4.0.70: − / + do nº de rodadas do Suíço; recalcula o detalhe + estimativa.
    window._unifiedSwissStep = function(delta) {
        var x = (window._unifiedSwissRounds || 3) + delta;
        if (x < 1) x = 1; if (x > 20) x = 20;
        window._unifiedSwissRounds = x;
        if (typeof window._updateUnifiedDetail === 'function') window._updateUnifiedDetail();
    };

    window._handleUnifiedOption = function(tId, option) {
        const t = window._findTournamentById(tId);
        if (!t) return;
        if (!option) { if (typeof showNotification === 'function') showNotification(_t('predraw.adjustTitle'), _t('predraw.selectStrategy'), 'info'); return; }

        // Remove panel
        const panel = document.getElementById('unified-resolution-panel');
        if (panel) panel.remove();
        document.body.style.overflow = '';

        // Handle option — v4.0.72: bye / play-in / Suíço APLICAM DIRETO via
        // _confirmP2Resolution, SEM a 2ª tela de simulação (a 1ª tela já tem resumo +
        // estimativa + o nº de rodadas do Suíço). Standby/exclusão seguem no sub-painel.
        if (option === 'reopen') {
            window._showReopenPanel(tId, info);
        } else if (option === 'bye' || option === 'playin') {
            window._confirmP2Resolution(tId, option);
        } else if (option === 'standby' || option === 'exclusion') {
            window._showRemovalSubChoice(tId, option, info);
        } else if (option === 'swiss') {
            // X rodadas escolhido no stepper → t.swissRounds (+ _swissSelectedRounds que
            // o _confirmP2Resolution lê). O corte pra loP2 (p2TargetCount) é automático e
            // a transição Suíço→eliminatória já existe (bracket-logic.js).
            if (window._unifiedSwissRounds) { t.swissRounds = window._unifiedSwissRounds; window._swissSelectedRounds = window._unifiedSwissRounds; }
            window._confirmP2Resolution(tId, 'swiss');
        } else if (option === 'dissolve') {
            window.showDissolveTeamsPanel(tId);
        } else if (option === 'poll') {
            window._showPollCreationDialog(tId, 'unified', null);
        }
    };

    window._cancelUnifiedPanel = function(tId) {
        const t = window._findTournamentById(tId);
        if (!t) return;

        // Restore enrollment to previous status
        if (t._suspendedByPanel) {
            t.status = t._previousStatus || 'open';
            delete t._suspendedByPanel;
            delete t._previousStatus;
            window.FirestoreDB.saveTournament(t);
        }

        // Close panel
        const panel = document.getElementById('unified-resolution-panel');
        if (panel) panel.remove();
        document.body.style.overflow = '';
    };

    // Sub-choice panel for standby/exclusion (called from both remainder and unified panels)
    // NOTE: These are defined at IIFE scope so they work regardless of which panel invokes them.

    // Build the panel HTML
    let gaugeHtml = '';
    var _centerLabel = info.isTeam ? _t('predraw.gaugeCenterTeams') : _t('predraw.gaugeCenterParts');
    var _centerSub = info.isTeam ? '(' + info.totalRawParticipants + ' ' + _t('predraw.unitParticipants') + ')' : '';
    var _loSub = info.isTeam ? _t('predraw.gaugeTeamsLabel', {n: info.loP2 * info.teamSize}) : _t('predraw.gaugeCenterParts');
    var _hiSub = info.isTeam ? _t('predraw.gaugeTeamsLabel', {n: info.hiP2 * info.teamSize}) : _t('predraw.gaugeCenterParts');

    var _excessCount = info.effectiveTeams - info.loP2;
    var _missingCount = info.hiP2 - info.effectiveTeams;
    var _unitLabel = info.isTeam ? _t('predraw.unitTeams') : _t('predraw.unitParts');

    // v4.0.66: 3 BOXES — inferior (esq, menor) · ATUAIS (centro, destaque) · superior (dir, menor)
    gaugeHtml = '<div style="display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:8px;align-items:stretch;">' +
        '<div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.35);border-radius:16px;padding:10px 6px;text-align:center;display:flex;flex-direction:column;justify-content:center;">' +
            '<div style="font-size:0.56rem;color:#86efac;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;">' + _t('predraw.gaugeInferior') + '</div>' +
            '<div style="font-size:1.5rem;font-weight:900;color:#4ade80;line-height:1.15;">' + info.loP2 + '</div>' +
            '<div style="font-size:0.6rem;color:#86efac;">' + _loSub + '</div>' +
            '<div style="font-size:0.56rem;color:#f87171;margin-top:3px;font-weight:700;">' + _t('predraw.gaugeOver', {n: _excessCount, unit: _unitLabel}) + '</div>' +
        '</div>' +
        '<div style="background:rgba(251,191,36,0.15);border:2px solid rgba(251,191,36,0.55);border-radius:16px;padding:10px 6px;text-align:center;display:flex;flex-direction:column;justify-content:center;box-shadow:0 0 18px rgba(251,191,36,0.18);">' +
            '<div style="font-size:2.6rem;font-weight:950;color:#fbbf24;line-height:1;">' + info.effectiveTeams + '</div>' +
            '<div style="font-size:0.62rem;color:#fde68a;text-transform:uppercase;font-weight:800;margin-top:2px;letter-spacing:0.4px;">' + _centerLabel + '</div>' +
            (info.isTeam ? '<div style="font-size:0.58rem;color:#fde68a;opacity:0.85;">' + _centerSub + '</div>' : '') +
        '</div>' +
        '<div style="background:rgba(96,165,250,0.08);border:1px solid rgba(96,165,250,0.35);border-radius:16px;padding:10px 6px;text-align:center;display:flex;flex-direction:column;justify-content:center;">' +
            '<div style="font-size:0.56rem;color:#93c5fd;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;">' + _t('predraw.gaugeSuperior') + '</div>' +
            '<div style="font-size:1.5rem;font-weight:900;color:#60a5fa;line-height:1.15;">' + info.hiP2 + '</div>' +
            '<div style="font-size:0.6rem;color:#93c5fd;">' + _hiSub + '</div>' +
            '<div style="font-size:0.56rem;color:#38bdf8;margin-top:3px;font-weight:700;">' + _t('predraw.gaugeMissing', {n: _missingCount, unit: _unitLabel}) + '</div>' +
        '</div>' +
    '</div>';

    overlay.innerHTML = '<div style="background:var(--bg-card,#1e293b);width:94%;max-width:800px;border-radius:32px;margin:auto 0;border:1px solid rgba(251,191,36,0.2);box-shadow:0 40px 120px rgba(0,0,0,0.8);overflow:hidden;animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);display:flex;flex-direction:column;max-height:90vh;">' +
        // Sticky top bar with cancel button
        '<div style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#78350f 0%,#92400e 50%,#b45309 100%);padding:12px 1.5rem;display:flex;flex-direction:column;gap:10px;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
                '<span style="font-size:1.5rem;flex-shrink:0;">⚙️</span>' +
                '<div style="min-width:0;">' +
                    '<h3 style="margin:0;color:#fef3c7;font-size:1.1rem;font-weight:900;letter-spacing:-0.02em;">' + _t('predraw.adjustTitle') + '</h3>' +
                    '<p style="margin:2px 0 0;color:#fde68a;font-size:0.75rem;opacity:0.9;">' + _t('predraw.detectedPrefix') + issuesText + '</p>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
                '<button onclick="window._cancelUnifiedPanel(\'' + tIdSafe + '\')" style="flex:1;background:rgba(0,0,0,0.25);color:#fef3c7;border:2px solid rgba(254,243,199,0.3);padding:9px 14px;border-radius:12px;font-weight:700;font-size:0.85rem;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background=\'rgba(0,0,0,0.4)\'" onmouseout="this.style.background=\'rgba(0,0,0,0.25)\'">' + _t('predraw.cancelBtn') + '</button>' +
                '<button onclick="window._handleUnifiedOption(\'' + tIdSafe + '\', window._unifiedSel)" style="flex:2;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;border:2px solid rgba(255,255,255,0.25);padding:9px 14px;border-radius:12px;font-weight:800;font-size:0.85rem;cursor:pointer;transition:all 0.2s;box-shadow:0 6px 16px rgba(34,197,94,0.35);" onmouseover="this.style.filter=\'brightness(1.1)\'" onmouseout="this.style.filter=\'\'">' + _t('predraw.confirmBtn') + '</button>' +
            '</div>' +
        '</div>' +
        // Scrollable content
        '<div style="overflow-y:auto;flex:1;">' +
        // Gauge section
        '<div style="background:linear-gradient(135deg,#78350f 0%,#b45309 100%);padding:1.5rem 2.5rem;">' +
            gaugeHtml +
        '</div>' +
        '<style>' +
            '@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }' +
            '@keyframes modalFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }' +
            '@media (max-width:640px) { #unified-options-grid { grid-template-columns: 1fr 1fr !important; } } @media (max-width:400px) { #unified-options-grid { grid-template-columns: 1fr !important; } }' +
        '</style>' +
        // v4.0.67: detalhe (resumo + estimativa) STICKY — cola no cabeçalho ao rolar,
        // SEMPRE visível, SEM vazamento (bg OPACO + full-width). Mesmo comportamento da
        // barra de filtros/busca canônica. Fica fora da seção com padding pra encostar.
        '<div id="unified-detail" style="position:sticky;top:0;z-index:6;background:#1f2433;border-bottom:1px solid rgba(251,191,36,0.32);box-shadow:0 6px 14px rgba(0,0,0,0.4);padding:11px 2.5rem;"></div>' +
        '<div style="padding:1.25rem 2.5rem 2.5rem;">' +
            '<h4 style="margin:0 0 0.5rem;color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;font-weight:700;">' + _t('predraw.selectStrategy') + '</h4>' +
            '<p style="margin:0 0 1rem;font-size:0.7rem;color:#64748b;line-height:1.5;">' + _t('predraw.nashColorLegend') + '</p>' +
            '<div id="unified-options-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">' +
                window._renderUnifiedOptions([]) +
            '</div>' +
        '</div>' +
        '</div>' +
    '</div>';

    document.body.appendChild(overlay);
    if (typeof window._updateUnifiedDetail === 'function') window._updateUnifiedDetail(); // mostra o recomendado já selecionado
};

window._showReopenPanel = function(tId, info) {
    const t = window._findTournamentById(tId);
    if (!t) return;

    const existing = document.getElementById('reopen-panel');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'reopen-panel';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem 0;';

    const currentLabel = info.isTeam
        ? _t('predraw.reopenTopTeamsCur', {n: info.effectiveTeams, p: (info.effectiveTeams * info.teamSize)})
        : _t('predraw.reopenTopPartsCur', {n: info.effectiveTeams});
    const needLabel = info.isTeam
        ? _t('predraw.reopenTopTeamsMiss', {n: info.missing, p: info.missingParticipants})
        : _t('predraw.reopenTopPartsMiss', {n: info.missing});

    overlay.innerHTML = '<div style="background:var(--bg-card,#1e293b);width:94%;max-width:600px;border-radius:24px;border:1px solid rgba(59,130,246,0.3);box-shadow:0 30px 100px rgba(0,0,0,0.7);overflow:hidden;animation:modalFadeIn 0.3s ease-out;">' +
        '<div style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);padding:1.5rem 2rem;">' +
            '<div style="display:flex;align-items:center;gap:15px;">' +
                '<span style="font-size:2.5rem;">↩️</span>' +
                '<div>' +
                    '<h3 style="margin:0;color:#dbeafe;font-size:1.25rem;font-weight:800;">' + _t('predraw.p2PollReopenTitle') + '</h3>' +
                    '<p style="margin:4px 0 0;color:#bfdbfe;font-size:0.9rem;">' + currentLabel + '<br>' + needLabel + '</p>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div style="padding:1.5rem 2rem;">' +
            '<p style="margin:0 0 1rem;font-size:0.85rem;color:#cbd5e1;line-height:1.6;">' + _t('predraw.reopenInstruction', {n: info.hiP2, unit: (info.isTeam ? _t('predraw.unitTeams') : _t('predraw.unitParts'))}) + '</p>' +
            '<button onclick="window._cancelUnifiedPanel(\'' + String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')" style="background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;border:none;padding:12px 24px;border-radius:12px;font-weight:700;font-size:0.9rem;cursor:pointer;transition:all 0.2s;width:100%;">' + _t('predraw.reopenBackToTournament') + '</button>' +
        '</div>' +
    '</div>';

    document.body.appendChild(overlay);
};

// ============ END UNIFIED RESOLUTION PANEL ============

// ════════════════════════════════════════════════════════════════════════════
// ═══  v4.0.53: SOLOS SEM DUPLA — resolução CONSCIENTE antes do sorteio  ══════
// Num torneio de duplas, quem não formou par era movido pra lista de espera em
// SILÊNCIO (só um toast efêmero). Agora o organizador vê uma tela ANTES do
// sorteio com os solos e escolhe: Ajuste manual (formar duplas na mão) · Lista
// de espera · Exclusão. Cancelar aborta. Injetado em _handleSortearClick.
// ════════════════════════════════════════════════════════════════════════════
window._soloNameOf = function (p) { return (typeof p === 'string') ? p : (p && (p.displayName || p.name) || ''); };
window._listSoloEntries = function (t) {
    var parts = Array.isArray(t.participants) ? t.participants : [];
    return parts.filter(function (p) { var n = window._soloNameOf(p); return n && !window._entryTeamMembers(p); });
};
window._soloContinueDraw = function (tId, isAberto) {
    var t = window._findTournamentById(tId);
    if (t) t._soloResolved = true; // one-shot: o re-call pula o painel e segue o sorteio
    var a = document.getElementById('solo-resolution-panel'); if (a) a.remove();
    var b = document.getElementById('solo-manual-pair-panel'); if (b) b.remove();
    document.body.style.overflow = '';
    if (typeof window._handleSortearClick === 'function') window._handleSortearClick(tId, !!isAberto);
};
window._soloCancel = function () {
    var a = document.getElementById('solo-resolution-panel'); if (a) a.remove();
    var b = document.getElementById('solo-manual-pair-panel'); if (b) b.remove();
    window._soloPairState = null;
    document.body.style.overflow = '';
};
window._soloResolveWaitlist = function (tId, isAberto) {
    // mantém o comportamento atual (solos → lista de espera via _autoMoveSoloToWaitlist
    // no re-call), mas agora CONSCIENTE.
    window._soloContinueDraw(tId, isAberto);
};
window._soloResolveExclude = function (tId, isAberto) {
    var t = window._findTournamentById(tId); if (!t) return;
    var solos = window._listSoloEntries(t);
    var names = solos.map(window._soloNameOf);
    showConfirmDialog('Excluir do torneio?', names.join(', '), function () {
        t.participants = (Array.isArray(t.participants) ? t.participants : []).filter(function (p) {
            var n = window._soloNameOf(p); return !n || !!window._entryTeamMembers(p); // remove só os solos
        });
        try { window.AppStore.logAction(tId, solos.length + ' participante(s) sem dupla excluído(s) do sorteio'); } catch (_e) {}
        window._soloContinueDraw(tId, isAberto);
    }, null, { type: 'warning', confirmText: 'Excluir', cancelText: 'Voltar' });
};
window._showSoloResolutionPanel = function (tId, isAberto) {
    var t = window._findTournamentById(tId); if (!t) return;
    var solos = window._listSoloEntries(t);
    if (solos.length === 0) { window._soloContinueDraw(tId, isAberto); return; }
    var esc = window._safeHtml || function (s) { return String(s == null ? '' : s); };
    var tIdSafe = String(tId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var ab = isAberto ? 'true' : 'false';
    window._soloSel = 'manual'; // pré-seleciona Ajuste manual
    var chips = solos.map(function (p) {
        return '<span style="display:inline-block;background:rgba(251,191,36,0.14);border:1px solid rgba(251,191,36,0.4);color:#fde68a;border-radius:999px;padding:5px 12px;font-size:0.82rem;font-weight:600;">' + esc(window._soloNameOf(p)) + '</span>';
    }).join(' ');
    // opções SELECIONÁVEIS (clique destaca; o Confirmar no topo aplica)
    var opt = function (key, icon, title, desc, accent) {
        var on = (window._soloSel === key);
        return '<button id="solo-opt-' + key + '" data-solokey="' + key + '" onclick="window._soloSelect(\'' + key + '\')" style="text-align:left;background:rgba(255,255,255,0.04);border:2px solid ' + accent + '55;outline:' + (on ? '3px solid #fbbf24' : 'none') + ';outline-offset:1px;border-radius:14px;padding:14px 16px;cursor:pointer;color:#e2e8f0;transition:all 0.2s;display:flex;gap:12px;align-items:flex-start;" onmouseover="this.style.background=\'rgba(255,255,255,0.08)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.04)\'">' +
            '<span style="font-size:1.6rem;line-height:1;flex-shrink:0;">' + icon + '</span>' +
            '<span><span style="display:block;font-weight:800;font-size:0.95rem;color:#fff;">' + title + '</span>' +
            '<span style="display:block;font-size:0.78rem;color:var(--text-muted,#94a3b8);margin-top:3px;line-height:1.4;">' + desc + '</span></span>' +
        '</button>';
    };
    var old = document.getElementById('solo-resolution-panel'); if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'solo-resolution-panel';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;padding:1rem;';
    ov.innerHTML = '<div style="background:var(--bg-card,#1e293b);width:95%;max-width:560px;max-height:90vh;overflow-y:auto;border-radius:24px;border:1px solid rgba(251,191,36,0.25);box-shadow:0 40px 120px rgba(0,0,0,0.8);">' +
        '<div style="position:sticky;top:0;z-index:2;background:linear-gradient(135deg,#78350f,#b45309);padding:14px 1.5rem 16px;display:flex;flex-direction:column;gap:12px;border-bottom:1px solid rgba(255,255,255,0.1);">' +
            // título (linha própria, sem botões competindo → "N sem dupla" não quebra)
            '<div style="display:flex;align-items:center;gap:11px;">' +
                '<span style="font-size:1.5rem;flex-shrink:0;line-height:1;">⚠️</span>' +
                '<div style="min-width:0;flex:1;">' +
                    '<h3 style="margin:0;color:#fef3c7;font-size:1.15rem;font-weight:900;line-height:1.15;white-space:nowrap;">' + solos.length + ' sem dupla</h3>' +
                    '<p style="margin:2px 0 0;color:#fde68a;font-size:0.78rem;opacity:0.92;">Escolha uma opção abaixo e confirme</p>' +
                '</div>' +
            '</div>' +
            // botões ABAIXO do título, MESMA altura/largura (box-sizing + min-height + borda iguais; flex:1)
            '<div style="display:flex;gap:10px;">' +
                '<button onclick="window._soloCancel()" style="flex:1;box-sizing:border-box;min-height:46px;display:inline-flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.28);color:#fef3c7;border:2px solid rgba(254,243,199,0.35);border-radius:12px;font-weight:700;font-size:0.92rem;line-height:1;cursor:pointer;">' + _t('predraw.cancelBtn') + '</button>' +
                '<button onclick="window._soloConfirm(\'' + tIdSafe + '\', ' + ab + ')" style="flex:1;box-sizing:border-box;min-height:46px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#16a34a,#22c55e);color:#fff;border:2px solid rgba(255,255,255,0.25);border-radius:12px;font-weight:800;font-size:0.92rem;line-height:1;cursor:pointer;box-shadow:0 6px 16px rgba(34,197,94,0.35);">' + _t('predraw.confirmBtn') + '</button>' +
            '</div>' +
        '</div>' +
        '<div style="padding:1.25rem 1.5rem;">' +
            '<p style="margin:0 0 8px;font-size:0.85rem;color:var(--text-main,#cbd5e1);line-height:1.5;">Estes participantes <b>não formaram dupla</b>. Sem par, não entram direto no chaveamento. Selecione uma opção e confirme:</p>' +
            '<div style="display:flex;flex-wrap:wrap;gap:7px;margin:10px 0 18px;">' + chips + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:10px;">' +
                opt('manual', '🧩', 'Ajuste manual', 'Abre a página de inscritos pra você formar as duplas arrastando um sobre o outro (vendo as duplas atuais e os sem par).', '#818cf8') +
                opt('waitlist', '⏱️', 'Lista de espera', 'Vão pra lista de espera — não jogam a chave, mas ficam disponíveis pra substituir num W.O.', '#22d3ee') +
                opt('exclude', '🚫', 'Excluir do sorteio', 'Removidos do torneio. Não entram na chave nem na lista de espera.', '#f87171') +
            '</div>' +
        '</div>' +
    '</div>';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
};
window._soloSelect = function (key) {
    window._soloSel = key;
    var btns = document.querySelectorAll('#solo-resolution-panel [data-solokey]');
    for (var i = 0; i < btns.length; i++) {
        btns[i].style.outline = (btns[i].getAttribute('data-solokey') === key) ? '3px solid #fbbf24' : 'none';
    }
};
window._soloConfirm = function (tId, isAberto) {
    var key = window._soloSel || 'manual';
    if (key === 'manual') window._soloManualPairPage(tId);
    else if (key === 'waitlist') window._soloResolveWaitlist(tId, isAberto);
    else if (key === 'exclude') window._soloResolveExclude(tId, isAberto);
};
// Ajuste manual = leva pra PÁGINA de inscritos, onde o organizador forma as duplas
// arrastando um participante sobre o outro (handleDropTeam, drag-drop já existente).
// Deixa um "hint" pra página mostrar um banner com quem está sem par.
// v4.0.65: CANÔNICO — a tela de formar duplas manualmente é a seção "Inscritos"
// (duplas pré-sorteio) do DETALHE do torneio: 🙋 Sem dupla (em cima, arrastáveis) +
// 👫 Duplas formadas (abaixo) + Desfazer. NÃO existe mais um segundo caminho via
// #participants. "Ajuste manual" só FECHA o painel e ROLA até essa seção (ou navega
// pro detalhe e rola após render, se vier de outra tela).
window._soloManualPairPage = function (tId) {
    var a = document.getElementById('solo-resolution-panel'); if (a) a.remove();
    document.body.style.overflow = '';
    var _scroll = function () {
        var el = document.getElementById('sp-inscritos-pairing');
        if (!el) return false;
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { try { el.scrollIntoView(); } catch (e2) {} }
        return true;
    };
    if (_scroll()) return;
    // não está no detalhe (ou ainda não renderizou) → navega e tenta rolar após o render
    if ((window.location.hash || '').indexOf('#tournaments/' + tId) !== 0) window.location.hash = '#tournaments/' + tId;
    var _n = 0, _iv = setInterval(function () { _n++; if (_scroll() || _n > 25) clearInterval(_iv); }, 120);
};

window.checkIncompleteTeams = function (t) {
    const enrMode = t.enrollmentMode || t.enrollment || 'individual';
    let teamSize = parseInt(t.teamSize) || 1;
    if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) teamSize = 2;
    const participants = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);

    const incomplete = [];
    const individuals = [];

    participants.forEach((p, idx) => {
        const pName = typeof p === 'string' ? p : (p.displayName || p.name || '');
        const members = window._entryTeamMembers(p); // v3.0.x: estrutura > nome
        if (members) {
            if (members.length < teamSize) {
                incomplete.push({ index: idx, name: pName, members: members, missing: teamSize - members.length });
            }
        } else {
            individuals.push({ index: idx, name: pName });
        }
    });

    const leftoverCount = individuals.length % teamSize;
    const fullTeamsFromIndividuals = Math.floor(individuals.length / teamSize);
    const totalFormedTeams = (participants.length - individuals.length) + fullTeamsFromIndividuals;

    return {
        incompleteTeams: incomplete,
        leftoverIndividuals: individuals.slice(-leftoverCount), // Os últimos 'n' são os que sobrarem
        totalFormedTeams: totalFormedTeams,
        hasIssues: incomplete.length > 0 || leftoverCount > 0
    };
};

window.showIncompleteTeamsPanel = function (tId) {
    // Redirect to unified resolution panel
    window.showUnifiedResolutionPanel(tId);
};


// Handler for incomplete teams resolution options
window._handleIncompleteOption = function (tId, option) {
    const t = window._findTournamentById(tId);
    if (!t) return;

    if (option === 'reopen') {
        t.status = 'open';
        t.enrollmentStatus = 'open';
        window.AppStore.logAction(tId, 'Inscrições reabertas para completar times');
        window.AppStore.sync();
        var el = document.getElementById('incomplete-teams-panel');
        if (el) el.remove();
        if (typeof showNotification === 'function') showNotification(_t('draw.enrollReopenedTeams'), _t('draw.enrollReopenedTeamsMsg'), 'success');
        window.location.hash = '#tournaments/' + tId;
    } else if (option === 'lottery') {
        window.showLotteryIncompletePanel(tId);
    } else if (option === 'standby') {
        t.incompleteResolution = 'standby';
        window.AppStore.logAction(tId, 'Jogadores sem time movidos para lista de espera');
        window.AppStore.sync();
        var el2 = document.getElementById('incomplete-teams-panel');
        if (el2) el2.remove();
        window.showPowerOf2Panel(tId);
    } else if (option === 'dissolve') {
        window.showDissolveTeamsPanel(tId);
    } else if (option === 'poll') {
        document.getElementById('incomplete-teams-panel').remove();
        // Collect poll options from incomplete teams context (exclude 'poll' itself)
        var pollOptions = [
            { key: 'reopen', icon: '↩️', title: _t('predraw.optReopenTitle'), desc: _t('predraw.pollReopenWaitDesc') },
            { key: 'lottery', icon: '🎲', title: _t('predraw.pollLotteryTitle'), desc: _t('predraw.pollLotteryDesc') },
            { key: 'standby', icon: '⏱️', title: _t('predraw.optStandbyTitle'), desc: _t('predraw.pollStandbyOutDesc') },
            { key: 'dissolve', icon: '🧩', title: _t('predraw.optDissolveTitle'), desc: _t('predraw.optDissolveDesc') }
        ];
        window._showPollCreationDialog(tId, 'incomplete', pollOptions);
    }
};

window.showLotteryIncompletePanel = function (tId) {
    const t = window._findTournamentById(tId);
    if (!t) return;

    showConfirmDialog(
        _t('predraw.lotteryTitle'),
        _t('predraw.lotteryDesc'),
        () => {
            // Direta
            window.AppStore.logAction(tId, 'Repescagem Direta por Sorteio selecionada');
            t.incompleteResolution = 'lottery_direct';
            window.AppStore.sync();
            document.getElementById('incomplete-teams-panel').remove();
            window.showPowerOf2Panel(tId);
        },
        () => {
            // Mini-repescagem
            window.AppStore.logAction(tId, 'Mini-Repescagem selecionada');
            t.incompleteResolution = 'lottery_mini';
            window.AppStore.sync();
            document.getElementById('incomplete-teams-panel').remove();
            window.showPowerOf2Panel(tId);
        },
        {
            type: 'info',
            confirmText: _t('btn.directDraw'),
            cancelText: _t('btn.playoff'),
            message: _t('predraw.lotteryOptions')
        }
    );
};

window.showDissolveTeamsPanel = function (tId) {
    const t = window._findTournamentById(tId);
    if (!t) return;

    // v3.0.x: checkIncompleteTeams retorna um OBJETO {incompleteTeams,...} — o código
    // antigo fazia `incomplete.map` direto nele → TypeError ao abrir o painel.
    const _incDiag = window.checkIncompleteTeams(t);
    const incomplete = (_incDiag && Array.isArray(_incDiag.incompleteTeams)) ? _incDiag.incompleteTeams : [];
    const teamSize = t.teamSize || 1;

    // Interface de Drag & Drop
    const existing = document.getElementById('dissolve-panel');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'dissolve-panel';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:99999;display:flex;align-items:center;justify-content:center;';

    overlay.innerHTML = `
        <div style="background:var(--bg-card,#1e293b);width:96%;max-width:900px;height:85vh;border-radius:24px;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,0.1);">
            <div style="padding:1.5rem 2rem;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3 style="margin:0;color:white;">${_t('predraw.reallocTitle')}</h3>
                    <p style="margin:4px 0 0;color:#94a3b8;font-size:0.85rem;">${_t('predraw.reallocDesc')}</p>
                </div>
                <button onclick="document.getElementById('dissolve-panel').remove()" style="background:rgba(255,255,255,0.05);border:none;color:white;padding:8px 15px;border-radius:10px;cursor:pointer;">${_t('predraw.reallocClose')}</button>
            </div>

            <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:2rem;overflow:hidden;">
                <!-- Coluna 1: Times Incompletos -->
                <div style="display:flex;flex-direction:column;gap:15px;overflow-y:auto;padding-right:10px;">
                    <h4 style="margin:0;font-size:0.8rem;color:#f87171;text-transform:uppercase;letter-spacing:1px;">${_t('predraw.incompleteTeamsList')}</h4>
                    <div id="incomplete-list-dnd" style="display:flex;flex-direction:column;gap:12px;"></div>
                </div>

                <!-- Coluna 2: Todos os Participantes / Pool -->
                <div style="display:flex;flex-direction:column;gap:15px;overflow-y:auto;padding-right:10px;">
                    <h4 style="margin:0;font-size:0.8rem;color:#60a5fa;text-transform:uppercase;letter-spacing:1px;">${_t('predraw.allParticipantsList')}</h4>
                    <div id="full-list-dnd" style="display:flex;flex-direction:column;gap:8px;"></div>
                </div>
            </div>

            <div style="padding:1.5rem 2rem;background:rgba(255,255,255,0.03);border-top:1px solid rgba(255,255,255,0.05);display:flex;justify-content:flex-end;gap:15px;">
                <button onclick="window._saveDissolveResolution('${String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" style="background:#2563eb;color:white;border:none;padding:12px 25px;border-radius:12px;font-weight:700;cursor:pointer;box-shadow:0 10px 20px rgba(37,99,235,0.3);">🧩 Dissolver times incompletos</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Lógica de Renderização e DnD simplificada para o protótipo
    // Em uma implementação real, usaríamos a API de Drag and Drop
    const renderLists = () => {
        const incList = document.getElementById('incomplete-list-dnd');
        const fullList = document.getElementById('full-list-dnd');

        const participants = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});

        incList.innerHTML = incomplete.map(it => `
            <div style="background:rgba(239,68,68,0.05);border:1px dashed rgba(239,68,68,0.3);border-radius:12px;padding:1rem;">
                <div style="font-weight:700;color:white;margin-bottom:8px;font-size:0.9rem;">${window._safeHtml(it.name)}</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;">
                    ${it.members.map(m => `<span style="background:rgba(255,255,255,0.1);padding:4px 10px;border-radius:6px;font-size:0.8rem;color:#e2e8f0;">${window._safeHtml(m)}</span>`).join('')}
                    <span style="border:1px dashed #94a3b8;padding:4px 10px;border-radius:6px;font-size:0.8rem;color:#94a3b8;">${_t('predraw.openSlot')}</span>
                </div>
            </div>
        `).join('');

        fullList.innerHTML = participants.map((p, idx) => {
            const name = typeof p === 'string' ? p : (p.displayName || p.name || '');
            return `
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);padding:10px 15px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:0.9rem;color:#e2e8f0;">${window._safeHtml(name)}</span>
                    <span style="color:#94a3b8;font-size:0.75rem;">ID: ${idx}</span>
                </div>
            `;
        }).join('');
    };

    renderLists();
};

// v3.0.x: implementação REAL. Antes era no-op (logAction + toast "salvo"), mentindo
// sucesso enquanto o sorteio seguia com os times incompletos. Agora dissolve cada time
// incompleto (membros < teamSize) em jogadores INDIVIDUAIS — preservando uid/email/foto
// quando a identidade é estrutural (participants[]/p1Name/p2Name) — persiste e re-diagnostica.
window._saveDissolveResolution = function (tId) {
    var t = window._findTournamentById(tId);
    if (!t) { showNotification(window._t ? window._t('auth.error') : 'Erro', 'Torneio não encontrado.', 'error'); return; }

    var enrMode = t.enrollmentMode || t.enrollment || 'individual';
    var teamSize = parseInt(t.teamSize) || 1;
    if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) teamSize = 2;

    var parts = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
    var newParts = [];
    var dissolved = 0;

    parts.forEach(function (p) {
        var members = window._entryTeamMembers(p);
        if (members && members.length < teamSize) {
            // Time incompleto → quebra em individuais, mantendo identidade quando possível.
            dissolved++;
            if (p && typeof p === 'object' && Array.isArray(p.participants) && p.participants.length) {
                p.participants.forEach(function (s) {
                    newParts.push((s && typeof s === 'object') ? Object.assign({}, s)
                                                              : { name: String(s || ''), displayName: String(s || '') });
                });
            } else if (p && typeof p === 'object' && p.p1Name) {
                newParts.push({ name: p.p1Name, displayName: p.p1Name, uid: p.p1Uid || '', email: p.p1Email || '', photoURL: p.p1Photo || '' });
                if (p.p2Name) newParts.push({ name: p.p2Name, displayName: p.p2Name, uid: p.p2Uid || '', email: p.p2Email || '', photoURL: p.p2Photo || '' });
            } else {
                members.forEach(function (m) { newParts.push({ name: m, displayName: m }); });
            }
        } else {
            newParts.push(p); // time completo ou individual: intocado
        }
    });

    var _closePanels = function () {
        var d = document.getElementById('dissolve-panel'); if (d) d.remove();
        var i = document.getElementById('incomplete-teams-panel'); if (i) i.remove();
    };

    if (dissolved === 0) {
        showNotification('Nada a dissolver', 'Não há times incompletos para desfazer.', 'info');
        _closePanels();
        if (typeof window.showUnifiedResolutionPanel === 'function') window.showUnifiedResolutionPanel(tId);
        return;
    }

    t.participants = newParts;
    try { window.AppStore.logAction(tId, dissolved + ' time(s) incompleto(s) dissolvido(s) em jogadores individuais'); } catch (_e) {}

    // Persistência real (não mente mais sucesso).
    try {
        if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
            window.FirestoreDB.saveTournament(t).catch(function () {});
        } else if (window.AppStore && typeof window.AppStore.sync === 'function') {
            window.AppStore.sync();
        }
    } catch (_se) {}

    showNotification('Times dissolvidos', dissolved + ' time(s) incompleto(s) viraram jogadores individuais. Eles voltam ao sorteio.', 'success');
    _closePanels();
    // Re-diagnostica com a base já dissolvida (remainder/potência-de-2 recomputados).
    if (typeof window.showUnifiedResolutionPanel === 'function') window.showUnifiedResolutionPanel(tId);
    else if (typeof window.showPowerOf2Panel === 'function') window.showPowerOf2Panel(tId);
};

// ─── VERIFICAÇÃO 2: NÚMERO ÍMPAR DE TIMES/INSCRITOS ───
window.checkOddEntries = function (t) {
    var arr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
    var teamSize = parseInt(t.teamSize) || 1;
    var enrMode = t.enrollmentMode || t.enrollment || 'individual';
    if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) teamSize = 2;

    var preFormedTeams = 0, individuals = 0;
    arr.forEach(function(p) {
        if (window._entryTeamMembers(p)) preFormedTeams++; // v3.0.x: estrutura > nome
        else individuals++;
    });
    var teamsFromIndividuals = teamSize > 1 ? Math.floor(individuals / teamSize) : individuals;
    var n = preFormedTeams + teamsFromIndividuals;

    return {
        count: n,
        rawCount: arr.length,
        isOdd: n > 0 && n % 2 !== 0,
        teamSize: teamSize
    };
};

window.showOddEntriesPanel = function (tId) {
    // Redirect to unified resolution panel
    window.showUnifiedResolutionPanel(tId);
};

window._handleOddOption = function (tId, option) {
    var t = window._findTournamentById(tId);
    if (!t) return;
    var oddInfo = window.checkOddEntries(t);
    var isTeam = oddInfo.teamSize > 1;

    if (option === 'reopen') {
        t.status = 'open';
        window.AppStore.logAction(tId, 'Inscrições reabertas para resolver número ímpar');
        window.AppStore.sync();
        var el = document.getElementById('odd-entries-panel');
        if (el) el.remove();
        showNotification(_t('draw.enrollReopenedParity'), _t('draw.enrollReopenedParityMsg'), 'info');
        var container = document.getElementById('view-container');
        if (container) renderTournaments(container, tId);
    } else if (option === 'bye_odd') {
        t.oddResolution = 'bye_rotative';
        window.AppStore.logAction(tId, 'BYE rotativo selecionado para número ímpar');
        window.AppStore.sync();
        var el2 = document.getElementById('odd-entries-panel');
        if (el2) el2.remove();
        showNotification(_t('draw.byeRotating'), _t('draw.byeRotatingMsg', {unit: isTeam ? _t('draw.team') : _t('draw.player')}), 'success');
        window.generateDrawFunction(tId);
    } else if (option === 'exclusion') {
        showConfirmDialog(
            _t('predraw.oddConfirmTitle'),
            _t('predraw.oddConfirmMsg', {n: (oddInfo.count - 1), unit: (isTeam ? _t('predraw.unitTeams') : _t('predraw.unitParts'))}),
            function() {
                var arr = Array.isArray(t.participants) ? t.participants : [];
                var removed = arr.splice(arr.length - 1, 1);
                var removedName = removed.length > 0 ? (typeof removed[0] === 'string' ? removed[0] : (removed[0].displayName || removed[0].name || '?')) : '?';
                t.oddResolution = 'exclusion';
                window.AppStore.logAction(tId, 'Exclusão: removido último inscrito (' + removedName + ') para paridade');
                window.AppStore.sync();
                var el3 = document.getElementById('odd-entries-panel');
                if (el3) el3.remove();
                showNotification(_t('draw.participantRemoved'), _t('draw.participantRemovedMsg', {name: removedName, total: oddInfo.count - 1}), 'warning');
                window.generateDrawFunction(tId);
            },
            null,
            { type: 'danger', confirmText: _t('btn.remove'), cancelText: _t('btn.cancel') }
        );
    } else if (option === 'poll') {
        var el4 = document.getElementById('odd-entries-panel');
        if (el4) el4.remove();
        var pollOptions = [
            { key: 'reopen', icon: '↩️', title: _t('predraw.optReopenTitle'), desc: _t('predraw.pollReopenOddDesc') },
            { key: 'bye_odd', icon: '🥇', title: _t('draw.byeRotating'), desc: _t('predraw.pollByeOddDesc') },
            { key: 'exclusion', icon: '🚫', title: _t('predraw.optExclusionTitle'), desc: _t('predraw.pollExclusionOddDesc', {n: (oddInfo.count - 1)}) }
        ];
        window._showPollCreationDialog(tId, 'odd', pollOptions);
    }
};

// ─── VERIFICAÇÃO 3: POTÊNCIA DE 2 ───
window.checkPowerOf2 = function (t) {
    const arr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
    let teamSize = parseInt(t.teamSize) || 1;
    const enrMode = t.enrollmentMode || t.enrollment || 'individual';
    if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) teamSize = 2;

    // Count effective bracket entries (teams or individuals)
    let preFormedTeams = 0;
    let individuals = 0;
    arr.forEach(function(p) {
        if (window._entryTeamMembers(p)) preFormedTeams++; // v3.0.x: estrutura > nome
        else individuals++;
    });
    const teamsFromIndividuals = teamSize > 1 ? Math.floor(individuals / teamSize) : individuals;
    const n = preFormedTeams + teamsFromIndividuals;

    if (n === 0) return { count: n, rawCount: arr.length, isPowerOf2: false, lo: 0, hi: 2, missing: 2, excess: 0, teamSize: teamSize };

    const isPowerOf2 = n > 0 && (n & (n - 1)) === 0;
    let prev = 1;
    while (prev * 2 <= n) prev *= 2;
    const lo = prev;
    const hi = prev * 2;

    return {
        count: n,
        rawCount: arr.length,
        isPowerOf2,
        lo: lo,
        hi: hi,
        missing: hi - n,
        excess: n - lo,
        teamSize: teamSize
    };
};

window.showPowerOf2Panel = function (tId) {
    // Redirect to unified resolution panel
    window.showUnifiedResolutionPanel(tId);
};

// Cancelar painel de decisão e restaurar inscrições se suspensas
window._cancelPowerOf2Panel = function (tId) {
    const panel = document.getElementById('p2-resolution-panel');
    if (panel) panel.remove();
    const t = window._findTournamentById(tId);
    if (t && t._suspendedByPanel) {
        t.status = t._previousStatus || 'open';
        delete t._suspendedByPanel;
        delete t._previousStatus;
        window.AppStore.sync();
        const container = document.getElementById('view-container');
        if (container) renderTournaments(container, window.location.hash.split('/')[1]);
        showNotification(_t('draw.enrollRestored'), _t('draw.enrollRestoredMsg'), 'info');
    }
};

// ── v2.7.24: Resolução de potência de 2 nas CHAVES DE FASE (construtor) ───────
// Painel DEDICADO de fase (NÃO mexe no showUnifiedResolutionPanel da inscrição).
// Disparado por advanceMultiPhase quando uma linha não fecha em potência de 2.
// Pergunta como resolver — UMA escolha pra todas as linhas — e grava em
// phase.bracketResolution (o motor genTierBracket aplica). Opções viáveis numa
// chave de entrantes FIXOS: Play-in, BYE, Exclusão.
window._showPhaseResolutionPanel = function (tId) {
    var t = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); });
    if (!t || !t._phaseResInfo) return;
    var info = t._phaseResInfo;
    var esc = window._safeHtml || function (s) { return String(s == null ? '' : s); };
    var tIdSafe = String(tId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    function pow2lo(s) { var lo = 1; while (lo * 2 <= s) lo *= 2; return lo; }
    function descFor(optKey) {
        return info.lines.map(function (l) {
            var s = l.size; if (s <= 1 || (s & (s - 1)) === 0) return null;
            var lo = pow2lo(s), hi = lo * 2, excess = s - lo, missing = hi - s, d;
            if (optKey === 'bye') d = 'chave de ' + hi + ' (' + missing + ' folga' + (missing > 1 ? 's' : '') + ')';
            else if (optKey === 'playin') {
                // v2.8.11: repescagem real (espelha genTierBracket): TODOS jogam a R1;
                // os g=floor(s/2) vencedores entram + (lo-g) melhores perdedores; se
                // s é ímpar, 1 sobra e disputa um jogo de repescagem pela última vaga.
                var g = Math.floor(s / 2), rep = lo - g, odd = (s % 2) === 1, direto = odd ? (rep - 1) : rep;
                var partes = [g + ' vencem'];
                if (direto > 0) partes.push(direto + (direto > 1 ? ' melhores perdedores' : ' melhor perdedor'));
                if (odd) partes.push('1 repescagem');
                d = 'todos jogam a 1ª rodada (' + g + ' jogo' + (g > 1 ? 's' : '') + (odd ? ', 1 sobra' : '') + ') → ' + partes.join(' + ') + ' → chave de ' + lo;
            }
            else if (optKey === 'standby') d = excess + ' pra lista de espera → chave de ' + lo;
            else d = 'corta ' + excess + ' → chave de ' + lo;
            return '<div style="margin-top:2px;"><b>' + esc(l.label) + '</b> (' + s + '): ' + d + '</div>';
        }).filter(Boolean).join('');
    }
    var opts = [
        { key: 'playin', icon: '🔁', title: 'Play-in (repescagem)', sub: 'Todos jogam — os últimos disputam a vaga.' },
        { key: 'standby', icon: '⏱️', title: 'Lista de espera', sub: 'Os últimos ficam de espera (entram na chave abaixo) — disponíveis pra substituir num W.O.' },
        { key: 'bye', icon: '🥇', title: 'BYE (folga p/ cabeças)', sub: 'Os melhores folgam a 1ª rodada até a potência acima.' },
        { key: 'exclusion', icon: '🚫', title: 'Exclusão', sub: 'Corta os piores classificados até a potência abaixo.' }
    ];
    // v2.7.65: nº de jogos por solução (somando TODAS as linhas) → estimativa de tempo.
    function gamesFor(optKey) {
        var total = 0;
        info.lines.forEach(function (l) {
            var s = l.size; if (s <= 1) return;
            if ((s & (s - 1)) === 0) { total += s - 1; return; } // já é potência de 2
            var lo = pow2lo(s);
            // v2.8.11: BYE = chave de hi com folgas → s-1 jogos. PLAY-IN (repescagem):
            // TODOS jogam a R1 (floor(s/2) jogos) + chave de lo (lo-1) + 1 jogo de
            // repescagem se s é ímpar → custa MAIS que o BYE. espera/exclusão = lo-1.
            if (optKey === 'bye') total += s - 1;
            else if (optKey === 'playin') total += Math.floor(s / 2) + (lo - 1) + (s % 2);
            else total += lo - 1;
        });
        return total;
    }
    var _dur = parseInt(t.gameDuration) || 30;
    var _courts = parseInt(t.courtCount) || (Array.isArray(t.courtNames) ? t.courtNames.length : 0) || 2;
    window._phaseResCourts = _courts;
    function fmtMin(m) { var h = Math.floor(m / 60), mm = m % 60; return h > 0 ? (h + 'h' + (mm ? ' ' + mm + 'm' : '')) : (mm + 'm'); }
    // Equilíbrio de Nash por solução (mesma matriz de payoff do _computeNashRecommendation):
    // justiça 45% · inclusão 35% · esforço 20%, cada um 0-10 → % = score*10.
    var _nashPay = { 'playin': { f: 8, i: 10, e: 6 }, 'standby': { f: 6, i: 4, e: 9 }, 'bye': { f: 6, i: 10, e: 9 }, 'exclusion': { f: 3, i: 2, e: 10 } };
    function nashPct(k) { var p = _nashPay[k]; return p ? Math.round((p.f * 0.45 + p.i * 0.35 + p.e * 0.20) * 10) : 0; }
    // v2.7.66: apresenta as soluções em ordem decrescente de equilíbrio de Nash.
    opts.sort(function (a, b) { return nashPct(b.key) - nashPct(a.key); });
    var _bestKey = '', _bestPct = -1;
    opts.forEach(function (o) { var p = nashPct(o.key); if (p > _bestPct) { _bestPct = p; _bestKey = o.key; } });
    // estado p/ seleção dinâmica
    window._phaseResTId = tIdSafe;
    window._phaseResSel = _bestKey;
    window._phaseResData = {};
    opts.forEach(function (o) { var g = gamesFor(o.key); window._phaseResData[o.key] = { games: g, mins: Math.ceil(g / Math.max(1, _courts)) * _dur, label: o.title, fmt: fmtMin(Math.ceil(g / Math.max(1, _courts)) * _dur) }; });

    function nashColor(pct) { return pct >= 80 ? '#6ee7b7' : pct >= 60 ? '#fde68a' : '#fca5a5'; }
    var cards = opts.map(function (o) {
        var pct = nashPct(o.key); var isRec = (o.key === _bestKey); var isSel = (o.key === window._phaseResSel);
        return '<button id="phase-res-opt-' + o.key + '" data-key="' + o.key + '" onclick="window._phaseResSelect(\'' + o.key + '\')" style="text-align:left;background:' + (isSel ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.04)') + ';border:2px solid ' + (isSel ? 'rgba(129,140,248,0.8)' : 'rgba(255,255,255,0.12)') + ';border-radius:14px;padding:12px 14px;cursor:pointer;color:#e2e8f0;transition:all 0.2s;">' +
            // linha 1: nome (esq) + Nash (dir) — SEMPRE na mesma posição relativa ao nome
            '<div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:0.92rem;">' +
              '<span>' + o.icon + ' ' + o.title + '</span>' +
              '<span style="margin-left:auto;flex-shrink:0;font-size:0.62rem;font-weight:800;color:' + nashColor(pct) + ';background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);padding:1px 7px;border-radius:6px;white-space:nowrap;" title="Equilíbrio de Nash — quanto maior, melhor o equilíbrio entre justiça, inclusão e esforço">⚖️ Nash ' + pct + '%</span>' +
            '</div>' +
            // linha 2: recomendado (só no de maior Nash), abaixo do nome, à esquerda
            (isRec ? '<div style="margin-top:3px;"><span style="font-size:0.6rem;background:rgba(16,185,129,0.25);color:#6ee7b7;padding:1px 7px;border-radius:6px;">recomendado</span></div>' : '') +
            '<div style="font-size:0.74rem;color:var(--text-muted);margin:5px 0 5px;">' + o.sub + '</div>' +
            '<div style="font-size:0.72rem;color:#93c5fd;line-height:1.45;">' + descFor(o.key) + '</div>' +
        '</button>';
    }).join('');
    var old = document.getElementById('phase-res-panel'); if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'phase-res-panel';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10040;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:18px;';
    var linesSummary = info.lines.map(function (l) { return esc(l.label) + ': ' + l.size; }).join(' · ');
    var _selD = window._phaseResData[window._phaseResSel];
    // v2.7.66: box VERDE de estimativa, STICKY (acompanha o scroll) e posicionado
    // logo acima da solução clicada. Renderizado dentro do container das soluções
    // (antes do card selecionado); _phaseResSelect o move pro card escolhido.
    var estimateHtml = '<div id="phase-res-estimate" style="position:sticky;top:0;z-index:3;background:rgba(16,185,129,0.18);border:1px solid rgba(16,185,129,0.5);border-radius:12px;padding:9px 12px;font-size:0.82rem;color:var(--text-bright);box-shadow:0 6px 14px rgba(0,0,0,0.3);">' +
        '⏱️ <b>Estimativa</b>: <b id="phase-res-est-val" style="color:#6ee7b7;">~' + _selD.fmt + '</b> ' +
        '<span id="phase-res-est-sub" style="opacity:0.78;font-size:0.74rem;">(' + _selD.games + ' jogos · ' + _courts + ' quadra' + (_courts > 1 ? 's' : '') + ' · ' + _dur + ' min/jogo)</span></div>';
    // v2.7.67: as AÇÕES (Avançar/Cancelar) também acompanham a solução selecionada —
    // ficam LOGO ABAIXO do card escolhido (sticky no rodapé), empurrando as demais
    // soluções pra baixo e ficando sempre na tela.
    var actionsHtml = '<div id="phase-res-actions" style="position:sticky;bottom:0;z-index:3;background:var(--bg-card,#1a1a2e);padding-top:8px;box-shadow:0 -8px 12px rgba(0,0,0,0.25);">' +
        '<button onclick="window._applyPhaseResolution(\'' + tIdSafe + '\', window._phaseResSel)" class="btn btn-success" style="width:100%;">🏆 Avançar com esta solução</button>' +
        '<button onclick="document.getElementById(\'phase-res-panel\').remove()" style="margin-top:8px;width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:var(--text-muted);border-radius:10px;padding:8px;font-weight:600;cursor:pointer;">Cancelar</button>' +
    '</div>';
    ov.innerHTML = '<div style="background:var(--bg-card,#1a1a2e);border:2px solid rgba(245,158,11,0.4);border-radius:18px;max-width:460px;width:100%;max-height:88vh;overflow-y:auto;padding:18px 18px 16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
        '<div style="font-size:1.05rem;font-weight:800;color:#fbbf24;margin-bottom:4px;">⚖️ Resolver as chaves da ' + esc(info.nextName) + '</div>' +
        '<div style="font-size:0.8rem;color:var(--text-main);line-height:1.4;margin-bottom:10px;">Alguma linha não fechou em potência de 2 (' + esc(linesSummary) + '). Escolha como resolver — vale pra <b>todas as linhas</b>:</div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;">' + estimateHtml + cards + actionsHtml + '</div>' +
    '</div>';
    document.body.appendChild(ov);
    // posiciona estimativa (acima) e ações (abaixo) do card selecionado
    if (typeof window._phaseResSelect === 'function') window._phaseResSelect(window._phaseResSel);
};
// v2.7.65: seleção dinâmica no painel de resolução — destaca o card e atualiza a
// estimativa de tempo acima dos botões, sem aplicar (o "Avançar" aplica).
window._phaseResSelect = function (key) {
    window._phaseResSel = key;
    ['playin', 'standby', 'bye', 'exclusion'].forEach(function (k) {
        var el = document.getElementById('phase-res-opt-' + k); if (!el) return;
        var on = (k === key);
        el.style.background = on ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.04)';
        el.style.borderColor = on ? 'rgba(129,140,248,0.8)' : 'rgba(255,255,255,0.12)';
    });
    var d = window._phaseResData && window._phaseResData[key];
    if (!d) return;
    var v = document.getElementById('phase-res-est-val'); if (v) v.textContent = '~' + d.fmt;
    var s = document.getElementById('phase-res-est-sub'); if (s) s.textContent = '(' + d.games + ' jogos · ' + (window._phaseResCourts || '?') + ' quadra' + ((window._phaseResCourts || 1) > 1 ? 's' : '') + ')';
    // move o box verde pra ACIMA da solução clicada e as ações pra ABAIXO dela
    // (ambos sticky → sempre na tela; empurra as demais soluções pra baixo).
    var box = document.getElementById('phase-res-estimate');
    var card = document.getElementById('phase-res-opt-' + key);
    if (box && card && card.parentNode) card.parentNode.insertBefore(box, card);
    var actions = document.getElementById('phase-res-actions');
    if (actions && card && card.parentNode) card.parentNode.insertBefore(actions, card.nextSibling);
};
window._applyPhaseResolution = function (tId, option) {
    var t = window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); });
    if (!t) return;
    var info = t._phaseResInfo;
    var idx = info ? info.nextIdx : ((t.currentPhaseIndex || 0) + 1);
    if (t.phases && t.phases[idx]) t.phases[idx].bracketResolution = option;
    delete t._phaseResInfo;
    var p = document.getElementById('phase-res-panel'); if (p) p.remove();
    if (window._advanceMultiPhase) window._advanceMultiPhase(tId);
};

// (Check-in functions moved to participants.js)

// ═══════════════════════════════════════════════════════════
// ═══  ENQUETE ENTRE PARTICIPANTES (POLL SYSTEM)  ═════════
// ═══════════════════════════════════════════════════════════

// ── Nash Equilibrium Recommendation ──
// In a symmetric coordination game where all participants pick from the same options,
// the Nash equilibrium is the strategy that maximizes collective payoff.
// We model payoffs: each option has (fairness, inclusion, effort).
// Fairness = how equally all participants are treated.
// Inclusion = how many participants stay in the tournament.
// Effort = inverse of extra games/logistics needed.
// Nash equilibrium in pure strategies: the option where no individual gains by deviating,
// i.e., the option that is best-response for each player when all others pick it too.
// In practice this means the option with the highest weighted sum of payoff criteria.
window._computeNashRecommendation = function(pollOptions, context, info) {
    // Payoff matrix: rate each option 0-10 on (fairness, inclusion, effort)
    var payoffs = {
        // Incomplete teams context
        'reopen':    { fairness: 10, inclusion: 10, effort: 3 },  // fair but slow
        'lottery':   { fairness: 4,  inclusion: 8,  effort: 8 },  // bots reduce fairness
        'standby':   { fairness: 6,  inclusion: 4,  effort: 9 },  // excludes some
        'dissolve':  { fairness: 7,  inclusion: 7,  effort: 4 },  // manual work
        // P2 context
        'bye':       { fairness: 6,  inclusion: 10, effort: 9 },  // some get free pass
        'playin':    { fairness: 8,  inclusion: 10, effort: 6 },  // extra games but fair
        'exclusion': { fairness: 3,  inclusion: 2,  effort: 10 }, // fast but excludes
        'swiss':     { fairness: 9,  inclusion: 10, effort: 5 }   // fair, more games
    };

    // Context-specific adjustments
    if (info) {
        // If only 1-2 missing for P2, reopen is easiest
        if (info.missing && info.missing <= 2) {
            payoffs['reopen'] = { fairness: 10, inclusion: 10, effort: 8 };
        }
        // If BYE affects fewer than play-in
        if (info.missing && info.excess) {
            if (info.missing <= info.excess * 2) {
                payoffs['bye'] = payoffs['bye'] || {};
                payoffs['bye'].effort = 10;
            }
        }
    }

    // Weights: participants care most about fairness and inclusion
    var wFairness = 0.45, wInclusion = 0.35, wEffort = 0.20;

    var bestKey = '';
    var bestScore = -1;
    pollOptions.forEach(function(opt) {
        var p = payoffs[opt.key];
        if (!p) return;
        var score = p.fairness * wFairness + p.inclusion * wInclusion + p.effort * wEffort;
        if (score > bestScore) {
            bestScore = score;
            bestKey = opt.key;
        }
    });

    return bestKey;
};

// ── Poll Creation Dialog ──
// Organizer chooses which options to include and sets a deadline
window._showPollCreationDialog = function(tId, context, pollOptions) {
    var t = window._findTournamentById(tId);
    if (!t) return;

    var info = (context === 'p2') ? window.checkPowerOf2(t) : null;
    var nashRec = window._computeNashRecommendation(pollOptions, context, info);

    var existing = document.getElementById('poll-creation-dialog');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'poll-creation-dialog';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:100001;display:flex;align-items:center;justify-content:center;padding:1rem;';
    document.body.style.overflow = 'hidden';

    var optionsHtml = pollOptions.map(function(opt) {
        var isNash = (opt.key === nashRec);
        var nashBadge = isNash ? '<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.6rem;font-weight:800;background:rgba(16,185,129,0.15);color:#4ade80;border:1px solid rgba(16,185,129,0.3);margin-left:6px;vertical-align:middle;">⚖️ Nash</span>' : '';
        return '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);cursor:pointer;transition:all 0.2s;" onmouseenter="this.style.background=\'rgba(255,255,255,0.06)\'" onmouseleave="this.style.background=\'rgba(255,255,255,0.03)\'">' +
            '<label class="toggle-switch toggle-sm" style="margin-top:3px;--toggle-on-bg:#6366f1;--toggle-on-glow:rgba(99,102,241,0.3);--toggle-on-border:#6366f1;"><input type="checkbox" checked value="' + opt.key + '"><span class="toggle-slider"></span></label>' +
            '<div style="flex:1;">' +
            '<div style="font-weight:700;font-size:0.9rem;color:var(--text-bright);">' + opt.icon + ' ' + opt.title + nashBadge + '</div>' +
            '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;line-height:1.4;">' + opt.desc + '</div>' +
            '</div>' +
            '</label>';
    }).join('');

    overlay.innerHTML = '<div style="background:var(--bg-card,#1e293b);width:95%;max-width:600px;border-radius:24px;border:1px solid rgba(99,102,241,0.3);box-shadow:0 30px 100px rgba(0,0,0,0.7);margin:auto;animation:fadeIn 0.2s ease;overflow:hidden;">' +
        '<div style="background:linear-gradient(135deg,#312e81 0%,#6366f1 100%);padding:1.5rem 2rem;">' +
        '<div style="display:flex;align-items:center;gap:15px;">' +
        '<span style="font-size:2.5rem;">🗳️</span>' +
        '<div>' +
        '<h3 style="margin:0;color:#e0e7ff;font-size:1.25rem;font-weight:800;">' + _t('predraw.pollCreateTitle') + '</h3>' +
        '<p style="margin:4px 0 0;color:#a5b4fc;font-size:0.85rem;">' + _t('predraw.pollCreateSubtitle') + '</p>' +
        '</div>' +
        '</div>' +
        '</div>' +

        '<div style="padding:1.5rem 2rem;">' +
        '<div style="margin-bottom:1.25rem;">' +
        '<label style="font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">' + _t('predraw.pollOptionsLabel') + '</label>' +
        '<p style="font-size:0.7rem;color:var(--text-muted);margin:4px 0 10px;">' + _t('predraw.pollOptionsHint') + '</p>' +
        '<div id="poll-options-list" style="display:flex;flex-direction:column;gap:8px;">' + optionsHtml + '</div>' +
        '</div>' +

        '<div style="margin-bottom:1.25rem;">' +
        '<label style="font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">' + _t('predraw.pollDeadlineLabel') + '</label>' +
        '<div style="display:flex;gap:12px;margin-top:8px;">' +
        '<div style="flex:1;">' +
        '<label style="font-size:0.7rem;color:var(--text-muted);">' + _t('predraw.pollHoursLabel') + '</label>' +
        '<input type="number" id="poll-deadline-hours" value="48" min="1" max="168" style="width:100%;padding:10px;border-radius:10px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);color:var(--text-bright);font-size:1rem;font-weight:700;text-align:center;">' +
        '</div>' +
        '<div style="display:flex;align-items:flex-end;padding-bottom:10px;color:var(--text-muted);font-size:0.85rem;">' + _t('predraw.pollHoursUnit') + '</div>' +
        '</div>' +
        '</div>' +

        '<div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:12px;padding:12px;margin-bottom:1rem;">' +
        '<div style="font-size:0.75rem;font-weight:700;color:#4ade80;margin-bottom:4px;">' + _t('predraw.pollNashTitle') + '</div>' +
        '<div style="font-size:0.75rem;color:var(--text-muted);line-height:1.5;">' + _t('predraw.pollNashExplain') + '</div>' +
        '</div>' +
        '</div>' +

        '<div style="padding:1rem 2rem 1.5rem;display:flex;justify-content:flex-end;gap:12px;border-top:1px solid rgba(255,255,255,0.05);">' +
        '<button id="poll-cancel-btn" style="background:transparent;color:#94a3b8;border:2px solid rgba(148,163,184,0.2);padding:10px 20px;border-radius:12px;font-weight:600;font-size:0.85rem;cursor:pointer;">' + _t('predraw.cancelLabel') + '</button>' +
        '<button id="poll-create-btn" style="background:linear-gradient(135deg,#6366f1,#818cf8);color:white;border:none;padding:10px 24px;border-radius:12px;font-weight:700;font-size:0.85rem;cursor:pointer;box-shadow:0 8px 20px rgba(99,102,241,0.3);">' + _t('predraw.pollCreateBtn') + '</button>' +
        '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    document.getElementById('poll-cancel-btn').addEventListener('click', function() {
        overlay.remove();
        document.body.style.overflow = '';
    });

    document.getElementById('poll-create-btn').addEventListener('click', function() {
        var checkboxes = document.querySelectorAll('#poll-options-list input[type="checkbox"]');
        var selectedOptions = [];
        checkboxes.forEach(function(cb) {
            if (cb.checked) selectedOptions.push(cb.value);
        });
        if (selectedOptions.length < 2) {
            if (typeof showNotification === 'function') showNotification(_t('auth.error'), _t('draw.pollMinOptions'), 'error');
            return;
        }
        var hours = parseInt(document.getElementById('poll-deadline-hours').value) || 48;
        if (hours < 1) hours = 1;
        if (hours > 168) hours = 168;

        // Create poll on tournament
        var pollData = {
            id: 'poll_' + Date.now(),
            context: context,
            status: 'active',
            options: [],
            votes: {},       // email → optionKey
            deadline: Date.now() + (hours * 3600000),
            createdAt: Date.now(),
            nashRecommendation: nashRec
        };

        // Build options from the full list, filtered by selection
        pollOptions.forEach(function(opt) {
            if (selectedOptions.indexOf(opt.key) !== -1) {
                pollData.options.push({
                    key: opt.key,
                    icon: opt.icon,
                    title: opt.title,
                    desc: opt.desc,
                    isNash: (opt.key === nashRec)
                });
            }
        });

        if (!t.polls) t.polls = [];
        t.polls.push(pollData);
        t.activePollId = pollData.id;

        // Suspend enrollments while poll is active
        if (t.status === 'open' || !t.status) {
            t._pollSuspended = true;
            t.status = 'closed';
        }

        // Add in-app notification markers for all participants
        var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];
        if (!t.pollNotifications) t.pollNotifications = [];
        parts.forEach(function(p) {
            if (typeof p !== 'object') return;
            // uid-first: marca TODOS os uids do participante (dupla = p1Uid+p2Uid);
            // jogador informal (sem uid) cai no e-mail (fallback legado).
            var _uids = (typeof window._participantUids === 'function') ? window._participantUids(p) : (p.uid ? [p.uid] : []);
            if (_uids.length) {
                _uids.forEach(function(u) {
                    t.pollNotifications.push({ targetUid: u, pollId: pollData.id, timestamp: Date.now(), read: false });
                });
            } else if (p.email) {
                t.pollNotifications.push({ targetEmail: p.email, pollId: pollData.id, timestamp: Date.now(), read: false });
            }
        });

        window.AppStore.logAction(tId, 'Enquete criada: ' + selectedOptions.length + ' opções, prazo de ' + hours + 'h');

        if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
            window.FirestoreDB.saveTournament(t);
        } else {
            window.AppStore.sync();
        }

        // Send Firestore push notification to all participants
        if (typeof window._notifyTournamentParticipants === 'function') {
            window._notifyTournamentParticipants(t, {
                type: 'poll',
                level: 'important',
                title: _t('predraw.pollNotifTitle', {name: window._safeHtml(t.name)}),
                message: _t('predraw.pollNotifMsg', {hours: hours}),
                tournamentId: tId,
                pollId: pollData.id
            }, t.organizerEmail);
        }

        overlay.remove();
        document.body.style.overflow = '';
        if (typeof showNotification === 'function') {
            showNotification(_t('draw.pollCreated'), _t('draw.pollCreatedMsg', {hours: hours}), 'success');
        }

        // Re-render tournament detail
        window.location.hash = '#tournaments/' + tId;
    });
};

// ── Poll Voting UI (shown to participants) ──
window._showPollVotingDialog = function(tId, pollId) {
    var t = window._findTournamentById(tId);
    if (!t || !t.polls) return;

    var poll = null;
    for (var i = 0; i < t.polls.length; i++) {
        if (t.polls[i].id === pollId) { poll = t.polls[i]; break; }
    }
    if (!poll) return;

    var user = window.AppStore.currentUser;
    var userEmail = (user && user.email) ? user.email : '';
    // uid-first: voto chaveado pelo uid; e-mail só fallback legado.
    var _voteKey = (user && user.uid) ? user.uid : userEmail;
    var userVote = (poll.votes && (poll.votes[_voteKey] != null ? poll.votes[_voteKey] : poll.votes[userEmail])) || null;
    var hasVoted = !!userVote;

    // Calculate time remaining
    var now = Date.now();
    var remaining = Math.max(0, poll.deadline - now);
    var isPollClosed = (remaining <= 0 || poll.status === 'closed');

    // Count votes per option
    var voteCounts = {};
    var totalVotes = 0;
    poll.options.forEach(function(opt) { voteCounts[opt.key] = 0; });
    Object.keys(poll.votes).forEach(function(email) {
        var k = poll.votes[email];
        if (voteCounts[k] !== undefined) voteCounts[k]++;
        totalVotes++;
    });

    var existing = document.getElementById('poll-voting-dialog');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'poll-voting-dialog';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.92);z-index:100001;display:flex;align-items:center;justify-content:center;padding:1rem;';
    document.body.style.overflow = 'hidden';

    // Countdown string
    var countdownStr = '';
    if (isPollClosed) {
        countdownStr = '<span style="color:#f87171;font-weight:700;">' + _t('predraw.closed') + '</span>';
    } else {
        var hrs = Math.floor(remaining / 3600000);
        var mins = Math.floor((remaining % 3600000) / 60000);
        var secs = Math.floor((remaining % 60000) / 1000);
        countdownStr = '<span style="color:#fbbf24;font-weight:700;" id="poll-countdown">' + hrs + 'h ' + mins + 'm ' + secs + 's</span>';
    }

    // Build options HTML
    var optionsHtml = poll.options.map(function(opt) {
        var isMyVote = (userVote === opt.key);
        var nashBadge = opt.isNash ? '<span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:0.6rem;font-weight:800;background:rgba(16,185,129,0.15);color:#4ade80;border:1px solid rgba(16,185,129,0.3);margin-left:6px;">' + _t('predraw.pollNashRec') + '</span>' : '';

        // Before voting: just show options and descriptions (no counts)
        // After voting or closed: show counts and own vote
        var voteInfo = '';
        if (hasVoted || isPollClosed) {
            var count = voteCounts[opt.key] || 0;
            var pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            voteInfo = '<div style="margin-top:8px;display:flex;align-items:center;gap:8px;">' +
                '<div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">' +
                '<div style="height:100%;background:' + (isMyVote ? '#6366f1' : 'rgba(255,255,255,0.2)') + ';border-radius:3px;width:' + pct + '%;transition:width 0.5s;"></div>' +
                '</div>' +
                '<span style="font-size:0.75rem;color:var(--text-muted);font-weight:700;min-width:50px;text-align:right;">' + count + ' (' + pct + '%)</span>' +
                '</div>';
        }

        var myVoteBadge = isMyVote ? '<span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:0.6rem;font-weight:800;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);margin-left:6px;">' + _t('predraw.pollMyVote') + '</span>' : '';

        var borderColor = isMyVote ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)';
        var bgColor = isMyVote ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)';

        var safeOptionKey = opt.key.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        var clickHandler = isPollClosed ? '' : ' onclick="window._castPollVote(\'' + tId + '\',\'' + pollId + '\',\'' + safeOptionKey + '\')"';
        var cursor = isPollClosed ? 'default' : 'pointer';

        return '<div class="poll-vote-option" style="padding:14px;border-radius:14px;background:' + bgColor + ';border:1.5px solid ' + borderColor + ';cursor:' + cursor + ';transition:all 0.2s;"' + clickHandler + '>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:1.3rem;">' + opt.icon + '</span>' +
            '<div style="flex:1;">' +
            '<div style="font-weight:700;font-size:0.9rem;color:var(--text-bright);">' + window._safeHtml(opt.title) + nashBadge + myVoteBadge + '</div>' +
            '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;line-height:1.4;">' + window._safeHtml(opt.desc) + '</div>' +
            '</div>' +
            '</div>' +
            voteInfo +
            '</div>';
    }).join('');

    var contextLabel = (poll.context === 'p2') ? _t('predraw.pollContextP2') : (poll.context === 'odd') ? _t('predraw.pollContextOdd') : _t('predraw.pollContextIncomplete');

    overlay.innerHTML = '<div style="background:var(--bg-card,#1e293b);width:95%;max-width:560px;border-radius:24px;border:1px solid rgba(99,102,241,0.2);box-shadow:0 30px 80px rgba(0,0,0,0.6);margin:auto;animation:fadeIn 0.2s ease;overflow:hidden;">' +
        '<div style="background:linear-gradient(135deg,#312e81 0%,#6366f1 100%);padding:1.5rem 2rem;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
        '<span style="font-size:2rem;">🗳️</span>' +
        '<div>' +
        '<h3 style="margin:0;color:#e0e7ff;font-size:1.15rem;font-weight:800;">' + _t('predraw.pollDialogTitle', {ctx: contextLabel}) + '</h3>' +
        '<p style="margin:4px 0 0;color:#a5b4fc;font-size:0.8rem;">' + _t('predraw.pollDialogSubtitle', {suffix: isPollClosed ? _t('predraw.pollDialogClosedSuffix') : ''}) + '</p>' +
        '</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
        '<div style="font-size:0.65rem;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.5px;">' + _t('predraw.pollTimeLeft') + '</div>' +
        '<div style="font-size:1rem;margin-top:2px;">' + countdownStr + '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +

        '<div style="padding:1.5rem 2rem;">' +
        ((!hasVoted && !isPollClosed) ? '<p style="font-size:0.8rem;color:var(--text-muted);margin:0 0 1rem;">' + _t('predraw.pollInstruct') + '</p>' : '') +
        '<div id="poll-vote-options" style="display:flex;flex-direction:column;gap:10px;">' + optionsHtml + '</div>' +
        (hasVoted ? '<p style="font-size:0.75rem;color:var(--text-muted);margin-top:1rem;text-align:center;font-style:italic;">' + _t('predraw.pollChangeVoteNote', {suffix: isPollClosed ? '' : _t('predraw.pollChangeVoteSuffix')}) + '</p>' : '') +
        '</div>' +

        '<div style="padding:1rem 2rem 1.5rem;display:flex;justify-content:flex-end;border-top:1px solid rgba(255,255,255,0.05);">' +
        '<button onclick="document.getElementById(\'poll-voting-dialog\').remove();document.body.style.overflow=\'\';" style="background:transparent;color:#94a3b8;border:2px solid rgba(148,163,184,0.2);padding:10px 20px;border-radius:12px;font-weight:600;font-size:0.85rem;cursor:pointer;">' + _t('predraw.pollClose') + '</button>' +
        '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    // Start countdown timer
    if (!isPollClosed) {
        var countdownEl = document.getElementById('poll-countdown');
        if (countdownEl) {
            var _pollTimer = setInterval(function() {
                var rem = Math.max(0, poll.deadline - Date.now());
                if (rem <= 0) {
                    countdownEl.textContent = _t('predraw.closed');
                    countdownEl.style.color = '#f87171';
                    clearInterval(_pollTimer);
                    // Auto-close poll
                    poll.status = 'closed';
                    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
                        window.FirestoreDB.saveTournament(t);
                    }
                    return;
                }
                var h = Math.floor(rem / 3600000);
                var m = Math.floor((rem % 3600000) / 60000);
                var s = Math.floor((rem % 60000) / 1000);
                countdownEl.textContent = h + 'h ' + m + 'm ' + s + 's';
            }, 1000);

            // Clear timer when dialog is removed
            var _observer = new MutationObserver(function(mutations) {
                if (!document.getElementById('poll-voting-dialog')) {
                    clearInterval(_pollTimer);
                    _observer.disconnect();
                }
            });
            _observer.observe(document.body, { childList: true });
        }
    }
};

// ── Cast a vote ──
window._castPollVote = function(tId, pollId, optionKey) {
    var t = window._findTournamentById(tId);
    if (!t || !t.polls) return;

    var poll = null;
    for (var i = 0; i < t.polls.length; i++) {
        if (t.polls[i].id === pollId) { poll = t.polls[i]; break; }
    }
    if (!poll || poll.status === 'closed') return;
    if (Date.now() > poll.deadline) {
        poll.status = 'closed';
        if (typeof showNotification === 'function') showNotification(_t('draw.pollClosed'), _t('draw.pollClosedMsg'), 'info');
        return;
    }

    var user = window.AppStore.currentUser;
    var userEmail = (user && user.email) ? user.email : '';
    if (!userEmail) {
        if (typeof showNotification === 'function') showNotification(_t('auth.error'), _t('draw.pollLoginRequired'), 'error');
        return;
    }

    // Only participants (or organizer) can vote
    var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];
    var isParticipant = parts.some(function(p) {
        if (typeof p === 'string') return p === userEmail || p === (user.displayName || '');
        // uid-first + slot-aware: pega TODOS os uids do participante (p.uid + p1Uid/p2Uid +
        // sub-participants[]) — senão o p2 de uma dupla (uid em p2Uid, displayName só do p1)
        // era barrado de votar na enquete de resolução. Nome/email só fallback.
        if (user.uid && typeof window._participantUids === 'function' &&
            window._participantUids(p).indexOf(user.uid) !== -1) return true;
        return (p.uid && user.uid && p.uid === user.uid) || (p.email && p.email === userEmail) || (p.displayName && p.displayName === (user.displayName || ''));
    });
    var isOrganizer = (userEmail === t.organizerEmail);
    if (!isParticipant && !isOrganizer) {
        if (typeof showNotification === 'function') showNotification(_t('draw.pollNotAllowed'), _t('draw.pollNotAllowedMsg'), 'warning');
        return;
    }

    // uid-first: voto chaveado pelo uid; migra chave-e-mail legada.
    var _voteKey = (user && user.uid) ? user.uid : userEmail;
    var previousVote = (poll.votes[_voteKey] != null ? poll.votes[_voteKey] : poll.votes[userEmail]) || null;
    poll.votes[_voteKey] = optionKey;
    if (_voteKey !== userEmail && poll.votes[userEmail] != null) delete poll.votes[userEmail];

    // Persist
    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        window.FirestoreDB.saveTournament(t);
    } else {
        window.AppStore.sync();
    }

    var optTitle = '';
    poll.options.forEach(function(o) { if (o.key === optionKey) optTitle = o.title; });

    if (typeof showNotification === 'function') {
        if (previousVote && previousVote !== optionKey) {
            showNotification(_t('draw.voteChanged'), _t('draw.voteChangedMsg', {option: optTitle}), 'success');
        } else {
            showNotification(_t('draw.voteRegistered'), _t('draw.voteRegisteredMsg', {option: optTitle}), 'success');
        }
    }

    // Re-render the voting dialog to show updated counts
    window._showPollVotingDialog(tId, pollId);
};

// ── Check for active polls and show notification to participant ──
window._checkPollNotifications = function(t) {
    if (!t || !t.pollNotifications || !t.polls) return;
    var user = window.AppStore.currentUser;
    if (!user || (!user.email && !user.uid)) return;

    var unreadNotifs = [];
    t.pollNotifications.forEach(function(n) {
        // uid-first: casa pelo targetUid; targetEmail só fallback legado.
        var _hit = (n.targetUid && user.uid && n.targetUid === user.uid) ||
                   (n.targetEmail && user.email && n.targetEmail === user.email);
        if (_hit && !n.read) unreadNotifs.push(n);
    });

    if (unreadNotifs.length === 0) return;

    // Find the active poll
    var activePoll = null;
    for (var i = 0; i < t.polls.length; i++) {
        if (t.polls[i].status === 'active' && Date.now() < t.polls[i].deadline) {
            activePoll = t.polls[i]; break;
        }
    }
    if (!activePoll) return;

    // Mark notifications as read
    unreadNotifs.forEach(function(n) { n.read = true; });

    // Calculate time remaining
    var remaining = Math.max(0, activePoll.deadline - Date.now());
    var hrs = Math.floor(remaining / 3600000);
    var mins = Math.floor((remaining % 3600000) / 60000);
    var timeStr = hrs > 0 ? hrs + 'h ' + mins + 'm' : _t('predraw.pollMinutesFmt', {m: mins});

    var contextLabel = (activePoll.context === 'p2') ? _t('predraw.pollCtxP2Short') : _t('predraw.pollCtxIncompleteShort');

    showAlertDialog(
        _t('predraw.pollOpenTitle'),
        _t('predraw.pollOpenMsg', {ctx: contextLabel, time: timeStr}),
        function() {
            window._showPollVotingDialog(String(t.id), activePoll.id);
        },
        { type: 'info', confirmText: _t('btn.voteNow'), cancelText: _t('btn.later'), showCancel: true }
    );

    // Persist read status
    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        window.FirestoreDB.saveTournament(t);
    }
};

// ── Show active poll banner in tournament detail ──
window._renderPollBanner = function(t) {
    if (!t || !t.polls) return '';
    var activePoll = null;
    for (var i = 0; i < t.polls.length; i++) {
        var p = t.polls[i];
        if (p.status === 'active') {
            if (Date.now() >= p.deadline) {
                p.status = 'closed';
                t.activePollId = null;
                if (typeof window._restorePollSuspendedEnrollments === 'function') {
                    window._restorePollSuspendedEnrollments(t);
                }
            } else {
                activePoll = p; break;
            }
        }
    }

    if (!activePoll) {
        // Check for recently closed polls (within last 24h) that need resolution
        var recentClosed = null;
        for (var j = 0; j < t.polls.length; j++) {
            if (t.polls[j].status === 'closed' && !t.polls[j].resolved && (Date.now() - t.polls[j].deadline < 86400000)) {
                recentClosed = t.polls[j]; break;
            }
        }
        if (recentClosed) {
            return window._renderClosedPollBanner(t, recentClosed);
        }
        return '';
    }

    var remaining = Math.max(0, activePoll.deadline - Date.now());
    var hrs = Math.floor(remaining / 3600000);
    var mins = Math.floor((remaining % 3600000) / 60000);
    var timeStr = hrs > 0 ? hrs + 'h ' + mins + 'm' : mins + 'm';

    var totalVotes = Object.keys(activePoll.votes).length;
    var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];
    var totalParticipants = parts.length;

    var user = window.AppStore.currentUser;
    var userEmail = (user && user.email) ? user.email : '';
    var _vkBanner = (user && user.uid) ? user.uid : userEmail;
    var hasVoted = !!(activePoll.votes[_vkBanner] || activePoll.votes[userEmail]); // uid-first
    var isOrganizer = window.AppStore.isOrganizer(t); // v2.8.79: uid-primário

    var btnText = hasVoted ? _t('predraw.pollViewChange') : _t('predraw.pollVoteNow');
    var statusText = hasVoted ? _t('predraw.pollVoted') : _t('predraw.pollWaiting');

    var closeBtn = isOrganizer
        ? '<button onclick="event.stopPropagation();window._closePollEarly(\'' + t.id + '\',\'' + activePoll.id + '\')" style="background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);padding:8px 14px;border-radius:10px;font-weight:700;font-size:0.78rem;cursor:pointer;white-space:nowrap;">' + _t('predraw.pollCloseEarly') + '</button>'
        : '';

    return '<div style="background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.08));border:2px solid rgba(99,102,241,0.4);border-radius:20px;padding:1.25rem 1.5rem;margin-bottom:1.25rem;box-shadow:0 4px 20px rgba(99,102,241,0.1);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">' +
        '<div style="display:flex;align-items:center;gap:14px;">' +
        '<div style="width:48px;height:48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;">🗳️</div>' +
        '<div>' +
        '<div style="font-weight:900;font-size:1.25rem;color:var(--text-bright);letter-spacing:0.02em;">' + _t('predraw.pollBannerTitle') + '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">' + statusText + ' · ' + totalVotes + '/' + totalParticipants + ' ' + _t('predraw.votesLabel') + '</div>' +
        '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
        '<div style="text-align:center;background:rgba(0,0,0,0.2);padding:8px 16px;border-radius:12px;">' +
        '<div style="font-size:1.6rem;font-weight:900;color:#a5b4fc;line-height:1;font-variant-numeric:tabular-nums;">' + timeStr + '</div>' +
        '<div style="font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px;">' + _t('predraw.pollRemaining') + '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' +
        '<button onclick="event.stopPropagation();window._showPollVotingDialog(\'' + t.id + '\',\'' + activePoll.id + '\')" style="background:linear-gradient(135deg,#6366f1,#818cf8);color:white;border:none;padding:10px 22px;border-radius:12px;font-weight:700;font-size:0.85rem;cursor:pointer;white-space:nowrap;flex:1;min-width:140px;">' + btnText + '</button>' +  // btnText already _t()
        closeBtn +
        '</div>' +
        '<div style="margin-top:8px;font-size:0.68rem;color:var(--text-muted);opacity:0.7;">' + _t('predraw.pollSuspended') + '</div>' +
        '</div>';
};

// ── Closed poll banner — organizer can apply the result ──
window._renderClosedPollBanner = function(t, poll) {
    // Find winner
    var voteCounts = {};
    var totalVotes = 0;
    poll.options.forEach(function(opt) { voteCounts[opt.key] = 0; });
    Object.keys(poll.votes).forEach(function(email) {
        var k = poll.votes[email];
        if (voteCounts[k] !== undefined) voteCounts[k]++;
        totalVotes++;
    });

    var winnerKey = '';
    var winnerCount = 0;
    var winnerTitle = '';
    poll.options.forEach(function(opt) {
        if ((voteCounts[opt.key] || 0) > winnerCount) {
            winnerCount = voteCounts[opt.key];
            winnerKey = opt.key;
            winnerTitle = opt.title;
        }
    });

    var pct = totalVotes > 0 ? Math.round((winnerCount / totalVotes) * 100) : 0;
    var user = window.AppStore.currentUser;
    var isOrganizer = window.AppStore.isOrganizer(t); // v2.8.79: uid-primário

    var applyBtn = isOrganizer
        ? '<button onclick="window._applyPollResult(\'' + t.id + '\',\'' + poll.id + '\')" style="background:linear-gradient(135deg,#10b981,#34d399);color:white;border:none;padding:8px 18px;border-radius:10px;font-weight:700;font-size:0.8rem;cursor:pointer;white-space:nowrap;">' + _t('predraw.pollApply') + '</button>'
        : '';
    var reopenBtn = isOrganizer
        ? '<button onclick="window._reopenPoll(\'' + t.id + '\',\'' + poll.id + '\')" style="background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);padding:8px 14px;border-radius:10px;font-weight:700;font-size:0.78rem;cursor:pointer;white-space:nowrap;">' + _t('predraw.pollReopenBtn') + '</button>'
        : '';
    var viewBtn = '<button onclick="window._showPollVotingDialog(\'' + t.id + '\',\'' + poll.id + '\')" style="background:rgba(255,255,255,0.05);color:var(--text-bright);border:1px solid rgba(255,255,255,0.1);padding:8px 14px;border-radius:10px;font-weight:600;font-size:0.8rem;cursor:pointer;white-space:nowrap;">' + _t('predraw.pollViewDetails') + '</button>';

    return '<div style="background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.05));border:2px solid rgba(16,185,129,0.35);border-radius:20px;padding:1.25rem 1.5rem;margin-bottom:1.25rem;box-shadow:0 4px 20px rgba(16,185,129,0.08);">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">' +
        '<div style="display:flex;align-items:center;gap:14px;">' +
        '<div style="width:48px;height:48px;background:linear-gradient(135deg,#10b981,#34d399);border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;">✅</div>' +
        '<div>' +
        '<div style="font-weight:900;font-size:1.25rem;color:var(--text-bright);letter-spacing:0.02em;">' + _t('predraw.pollClosedBannerTitle') + '</div>' +
        '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">' + _t('predraw.pollResultPrefix') + '<strong style="color:#4ade80;">' + winnerTitle + '</strong> (' + pct + '% · ' + winnerCount + '/' + totalVotes + ' ' + _t('predraw.votesLabel') + ')</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' + viewBtn + applyBtn + reopenBtn + '</div>' +
        '</div>';
};

// ── Close poll early (organizer) ──
window._closePollEarly = function(tId, pollId) {
    var t = window._findTournamentById(tId);
    if (!t || !t.polls) return;
    var poll = null;
    for (var i = 0; i < t.polls.length; i++) {
        if (t.polls[i].id === pollId) { poll = t.polls[i]; break; }
    }
    if (!poll || poll.status !== 'active') return;

    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog(
            _t('predraw.closePollTitle'),
            _t('predraw.closePollDesc'),
            function() {
                poll.status = 'closed';
                poll.deadline = Date.now();
                t.activePollId = null;

                // Restore enrollments if suspended by poll
                if (t._pollSuspended) {
                    t.status = 'open';
                    delete t._pollSuspended;
                }

                window.AppStore.logAction(tId, 'Enquete encerrada antecipadamente pelo organizador');
                if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
                    window.FirestoreDB.saveTournament(t);
                } else {
                    window.AppStore.sync();
                }
                if (typeof showNotification === 'function') {
                    showNotification(_t('draw.pollClosed'), _t('draw.pollClosedApply'), 'info');
                }
                window.location.hash = '#tournaments/' + tId;
            }
        );
    }
};

// ── Restore enrollments helper (called when poll auto-closes) ──
window._restorePollSuspendedEnrollments = function(t) {
    if (t && t._pollSuspended) {
        t.status = 'open';
        delete t._pollSuspended;
    }
};

// ── Reopen a closed poll (organizer can reconfigure deadline) ──
window._reopenPoll = function(tId, pollId) {
    var t = window._findTournamentById(tId);
    if (!t || !t.polls) return;
    var poll = null;
    for (var i = 0; i < t.polls.length; i++) {
        if (t.polls[i].id === pollId) { poll = t.polls[i]; break; }
    }
    if (!poll) return;

    if (typeof showInputDialog === 'function') {
        showInputDialog(_t('draw.reopenPollTitle'), _t('draw.reopenPollPrompt'), '48', function(val) {
            var hours = parseInt(val) || 48;
            if (hours < 1) hours = 1;
            if (hours > 168) hours = 168;

            poll.status = 'active';
            poll.deadline = Date.now() + (hours * 3600000);
            poll.resolved = false;
            poll.resolvedOption = null;
            poll.resolvedAt = null;
            t.activePollId = poll.id;

            // Suspend enrollments again
            if (t.status === 'open' || !t.status) {
                t._pollSuspended = true;
                t.status = 'closed';
            }

            window.AppStore.logAction(tId, 'Enquete reaberta pelo organizador: prazo de ' + hours + 'h');
            if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
                window.FirestoreDB.saveTournament(t);
            } else {
                window.AppStore.sync();
            }

            // Notify participants about reopened poll
            if (typeof window._notifyTournamentParticipants === 'function') {
                window._notifyTournamentParticipants(t, {
                    type: 'poll',
                    level: 'important',
                    title: '🗳️ Enquete reaberta: ' + window._safeHtml(t.name),
                    message: 'A enquete foi reaberta pelo organizador. Vote novamente! Novo prazo: ' + hours + ' horas.',
                    tournamentId: tId,
                    pollId: poll.id
                }, t.organizerEmail);
            }

            if (typeof showNotification === 'function') {
                showNotification(_t('draw.pollReopened'), _t('draw.pollReopenedMsg', {hours: hours}), 'success');
            }
            window.location.hash = '#tournaments/' + tId;
        });
    }
};

// ── Apply poll result — trigger the winning option's action ──
window._applyPollResult = function(tId, pollId) {
    var t = window._findTournamentById(tId);
    if (!t || !t.polls) return;

    var poll = null;
    for (var i = 0; i < t.polls.length; i++) {
        if (t.polls[i].id === pollId) { poll = t.polls[i]; break; }
    }
    if (!poll) return;

    // Restore enrollments if suspended by poll
    if (t._pollSuspended) {
        t.status = 'open';
        delete t._pollSuspended;
    }

    // Find winner
    var voteCounts = {};
    poll.options.forEach(function(opt) { voteCounts[opt.key] = 0; });
    Object.keys(poll.votes).forEach(function(email) {
        var k = poll.votes[email];
        if (voteCounts[k] !== undefined) voteCounts[k]++;
    });

    var winnerKey = '';
    var winnerCount = 0;
    poll.options.forEach(function(opt) {
        if ((voteCounts[opt.key] || 0) > winnerCount) {
            winnerCount = voteCounts[opt.key];
            winnerKey = opt.key;
        }
    });

    if (!winnerKey) return;

    poll.resolved = true;
    poll.resolvedOption = winnerKey;
    poll.resolvedAt = Date.now();
    t.activePollId = null;

    window.AppStore.logAction(tId, 'Resultado da enquete aplicado: ' + winnerKey);

    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        window.FirestoreDB.saveTournament(t);
    } else {
        window.AppStore.sync();
    }

    // Trigger the winning option's action
    if (poll.context === 'incomplete') {
        window._handleIncompleteOption(tId, winnerKey);
    } else if (poll.context === 'p2') {
        window._handleP2Option(tId, winnerKey);
    } else if (poll.context === 'odd') {
        window._handleOddOption(tId, winnerKey);
    }
};

window._handleP2Option = function (tId, option) {
    const t = window._findTournamentById(tId);
    if (!t) return;

    const info = window.checkPowerOf2(t);

    if (option === 'bye' || option === 'playin' || option === 'standby' || option === 'swiss') {
        window._confirmP2Resolution(tId, option); // v4.0.73: aplica DIRETO (sem a tela de simulação)
        return;
    }

    if (option === 'reopen') {
        // Show dedicated reopen panel — hide p2 panel but keep it in DOM to return to
        const p2Panel = document.getElementById('p2-resolution-panel');
        if (p2Panel) p2Panel.style.display = 'none';
        window._showReopenPanel(tId, info);
        return;
    }

    if (option === 'exclusion') {
        // Remove the last N enrolled participants to reach lower power of 2
        var isTeam = info.teamSize > 1;
        var removeCount = info.excess;
        var label = isTeam ? _t('predraw.p2LastTeams', {n: removeCount}) : _t('predraw.p2LastParts', {n: removeCount});
        var unitWord = isTeam ? _t('predraw.unitTeams') : _t('predraw.unitParticipants');
        showConfirmDialog(
            _t('predraw.p2ConfirmTitle'),
            _t('predraw.p2ConfirmMsg', {label: label, n: info.lo, unit: unitWord}),
            function() {
                var arr = Array.isArray(t.participants) ? t.participants : [];
                // Remove from the end (last enrolled)
                var removed = arr.splice(arr.length - removeCount, removeCount);
                var removedNames = removed.map(function(p) {
                    return typeof p === 'string' ? p : (p.displayName || p.name || '?');
                });
                t.p2Resolution = 'exclusion';
                window.AppStore.logAction(tId, 'Exclusão: removidos ' + removeCount + ' últimos inscritos (' + removedNames.join(', ') + ')');
                window.AppStore.sync();
                var p2Panel = document.getElementById('p2-resolution-panel');
                if (p2Panel) p2Panel.remove();
                showNotification(_t('draw.removedBracket'), _t('draw.removedBracketMsg', {count: removeCount, bracket: info.lo}), 'warning');
                // Continue draw
                window.generateDrawFunction(tId);
            },
            null,
            { type: 'danger', confirmText: _t('btn.removeAndContinue'), cancelText: _t('btn.cancel') }
        );
        return;
    }

    if (option === 'poll') {
        const p2Panel = document.getElementById('p2-resolution-panel');
        if (p2Panel) p2Panel.remove();
        // Collect poll options from P2 context
        var _pTeamSize = parseInt(t.teamSize) || 1;
        var _pLabel = _pTeamSize > 1 ? _t('predraw.unitTeams') : _t('predraw.unitParticipants');
        var _pLabelInscritos = _t('predraw.unitParts');
        var pollOptions = [
            { key: 'reopen', icon: '↩️', title: _t('predraw.p2PollReopenTitle'), desc: _t('predraw.p2PollReopenDesc', {n: info.missing, unit: _pLabel, target: info.hi}) },
            { key: 'bye', icon: '🥇', title: _t('predraw.p2PollByeTitle'), desc: _t('predraw.p2PollByeDesc', {n: info.missing, unit: _pLabel, target: info.hi}) },
            { key: 'playin', icon: '🔁', title: _t('predraw.p2PollPlayinTitle'), desc: _t('predraw.p2PollPlayinDesc', {n: (info.excess * 2), unit: _pLabel, k: info.excess}) },
            { key: 'exclusion', icon: '🚫', title: _t('predraw.p2PollExclusionTitle'), desc: _t('predraw.p2PollExclusionDesc', {n: info.excess, unit: _pLabelInscritos, target: info.lo}) },
            { key: 'standby', icon: '⏱️', title: _t('predraw.p2PollStandbyTitle'), desc: _t('predraw.p2PollStandbyDesc', {n: info.excess, unit: _pLabel, target: info.lo}) },
            { key: 'swiss', icon: '🏅', title: _t('predraw.p2PollSwissTitle'), desc: _t('predraw.p2PollSwissDesc', {target: info.lo}) }
        ];
        window._showPollCreationDialog(tId, 'p2', pollOptions);
        return;
    }
};

// ─── Painel de Reabertura de Inscrições ───
window._showReopenPanel = function (tId, info) {
    const overlay = document.createElement('div');
    overlay.id = 'reopen-panel';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
        <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:20px;width:100%;max-width:480px;box-shadow:0 25px 60px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08);margin:auto 0;">
            <div style="padding:2rem 2.5rem 1.5rem;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem;">
                    <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#3b82f6,#2563eb);display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🔓</div>
                    <div>
                        <h3 style="margin:0;color:#f1f5f9;font-size:1.2rem;font-weight:700;">${_t('predraw.reopenPanelTitle')}</h3>
                        <p style="margin:2px 0 0;color:#64748b;font-size:0.85rem;">${_t('predraw.reopenPanelWaiting')}</p>
                    </div>
                </div>

                <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:14px;padding:1.25rem;margin-bottom:1.25rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
                        <span style="color:#94a3b8;font-size:0.85rem;">${info.teamSize > 1 ? _t('predraw.reopenCurrentTeams') : _t('predraw.reopenCurrentParts')}</span>
                        <span style="color:#f1f5f9;font-weight:700;font-size:1.1rem;">${info.count}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
                        <span style="color:#94a3b8;font-size:0.85rem;">${_t('predraw.reopenNextPow2')}</span>
                        <span style="color:#3b82f6;font-weight:700;font-size:1.1rem;">${info.hi}</span>
                    </div>
                    <div style="border-top:1px solid rgba(59,130,246,0.15);padding-top:0.75rem;display:flex;justify-content:space-between;align-items:center;">
                        <span style="color:#94a3b8;font-size:0.85rem;">${_t('predraw.reopenMissing')}</span>
                        <span style="color:#fbbf24;font-weight:800;font-size:1.3rem;">${info.missing}</span>
                    </div>
                </div>

                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:1rem;" id="reopen-autoclose-label">
                    <div class="toggle-row" style="padding:0;">
                        <div class="toggle-row-label"><div>
                            <div style="color:#e2e8f0;font-weight:600;font-size:0.95rem;">${_t('predraw.autoCloseLabel', {n: info.hi})}</div>
                            <div style="color:#64748b;font-size:0.8rem;margin-top:4px;">${_t('predraw.autoCloseDesc', {n: info.hi})}</div>
                        </div></div>
                        <label class="toggle-switch"><input type="checkbox" id="reopen-autoclose-cb" checked><span class="toggle-slider"></span></label>
                    </div>
                </div>
            </div>

            <div style="padding:1.25rem 2.5rem 1.75rem;display:flex;gap:12px;justify-content:flex-end;background:rgba(0,0,0,0.1);border-top:1px solid rgba(255,255,255,0.05);border-radius:0 0 20px 20px;">
                <button onclick="document.getElementById('reopen-panel').remove();document.body.style.overflow=''; var p2=document.getElementById('p2-resolution-panel'); if(p2) p2.style.display='flex';" style="background:transparent;color:#94a3b8;border:2px solid rgba(148,163,184,0.2);padding:10px 24px;border-radius:12px;font-weight:700;font-size:0.9rem;cursor:pointer;transition:all 0.2s;">${_t('predraw.reopenBack')}</button>
                <button onclick="window._confirmReopen('${String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', ${info.hi})" style="background:linear-gradient(135deg,#3b82f6,#2563eb);color:white;border:none;padding:10px 28px;border-radius:12px;font-weight:700;font-size:0.9rem;cursor:pointer;box-shadow:0 4px 15px rgba(59,130,246,0.3);transition:all 0.2s;">${_t('predraw.reopenConfirm')}</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};

window._confirmReopen = function (tId, target) {
    const t = window._findTournamentById(tId);
    if (!t) return;

    const autoClose = document.getElementById('reopen-autoclose-cb');
    const checked = autoClose ? autoClose.checked : false;

    t.status = 'open';
    t.maxParticipants = target;
    t.autoCloseOnFull = checked;

    const actionMsg = checked
        ? `Inscrições Reabertas para atingir ${target} participantes (encerramento automático ativado)`
        : `Inscrições Reabertas para atingir ${target} participantes`;

    window.AppStore.logAction(tId, actionMsg);
    window.AppStore.sync();

    if (document.getElementById('reopen-panel')) document.getElementById('reopen-panel').remove();
    if (document.getElementById('p2-resolution-panel')) document.getElementById('p2-resolution-panel').remove();
    document.body.style.overflow = '';

    const container = document.getElementById('view-container');
    if (container) renderTournaments(container, window.location.hash.split('/')[1]);
    showNotification(_t('draw.tournamentReopened'), checked ? _t('draw.reopenedAutoClose', {target: target}) : _t('draw.reopenedWaiting'), 'info');
};

// ─── Encerrar Torneio (manual) ───
window.finishTournament = function(tId) {
    const t = window._findTournamentById(tId);
    if (!t) return;
    if (t.status === 'finished') {
        showNotification(_t('draw.alreadyClosed'), _t('draw.alreadyClosedMsg'), 'info');
        return;
    }
    // Unified scan via canonical collector — covers all 7 legacy shapes.
    var _allMatches = (typeof window._collectAllMatches === 'function')
        ? window._collectAllMatches(t)
        : null;
    var hasResults, pendingMatches;
    if (_allMatches) {
        hasResults = _allMatches.some(function(m) { return m && !!m.winner; });
        pendingMatches = _allMatches.filter(function(m) {
            return m && !m.isBye && m.p1 && m.p1 !== 'TBD' && m.p2 && m.p2 !== 'TBD' && !m.winner;
        }).length;
    } else {
        // Defensive fallback: bracket-model.js not loaded.
        hasResults = (Array.isArray(t.matches) && t.matches.some(function(m) { return !!m.winner; })) ||
            (Array.isArray(t.rounds) && t.rounds.some(function(r) { return (r.matches || []).some(function(m) { return !!m.winner; }); })) ||
            (Array.isArray(t.groups) && t.groups.some(function(g) { return (g.rounds || []).some(function(r) { return (r.matches || []).some(function(m) { return !!m.winner; }); }); }));
        pendingMatches = (Array.isArray(t.matches) && t.matches.filter(function(m) { return !m.isBye && m.p1 && m.p1 !== 'TBD' && m.p2 && m.p2 !== 'TBD' && !m.winner; }).length) || 0;
    }
    let msg = _t('predraw.finishMsg');
    if (pendingMatches > 0) {
        msg = _t('predraw.finishPendingMsg', {n: pendingMatches});
    }
    showConfirmDialog(
        _t('predraw.finishTitle'),
        msg,
        function() {
            t.status = 'finished';
            // v2.1.12: marca o instante do encerramento — usado pela regra de
            // "vai pra seção Encerrados depois de 24h" no dashboard.
            if (!t.finishedAt) t.finishedAt = new Date().toISOString();
            // Compute final standings for Swiss/Liga
            if (Array.isArray(t.rounds) && t.rounds.length > 0 && typeof window._computeStandings === 'function') {
                t.standings = window._computeStandings(t);
            }
            window.AppStore.logAction(tId, 'Torneio encerrado manualmente');
            window.AppStore.sync();
            // Notify all participants
            if (typeof window._notifyTournamentParticipants === 'function') {
                window._notifyTournamentParticipants(t, {
                    type: 'tournament_finished',
                    message: _t('notif.tournamentFinished').replace('{name}', t.name || 'Torneio'),
                    tournamentName: t.name || '',
                    level: 'important'
                }, window.AppStore.currentUser ? window.AppStore.currentUser.email : null);
            }
            const container = document.getElementById('view-container');
            if (container) renderTournaments(container, tId);
            showNotification(_t('draw.finishDone'), _t('draw.finishDoneMsg', { name: t.name }), 'success');
        },
        null,
        { type: 'warning', confirmText: _t('btn.finishTourn'), cancelText: _t('btn.cancel') }
    );
};

// ─── Painel Integrado de Encerramento ───
window.toggleRegistrationStatus = function (tId) {
    var t = window._findTournamentById(tId);
    if (!t) { return; }

    // Helper: save tournament
    var _saveTournament = function(callback) {
        if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
            window.FirestoreDB.saveTournament(t).then(function() {
                if (callback) callback();
            }).catch(function(err) {
                window._error('[toggleRegistrationStatus] save error:', err);
                if (callback) callback();
                if (typeof showNotification === 'function') showNotification(_t('draw.savedLocally'), _t('draw.savedLocallyMsg'), 'warning');
            });
        } else {
            try { window.AppStore.sync(); } catch(e) { window._error('sync error:', e); }
            if (callback) callback();
        }
    };

    var _refreshView = function() {
        var container = document.getElementById('view-container');
        if (container && typeof renderTournaments === 'function') {
            renderTournaments(container, String(tId));
        }
    };

    // v2.1.0: inscrição TARDIA pós-sorteio (lateEnrollment 'standby'/'expand').
    // Aqui o "Encerrar Inscrições" apenas ALTERNA o status — sem painel de
    // resolução (que é pré-sorteio) e sem promover a lista de espera. Encerrar
    // = 'closed'; Reabrir = 'active'. (O sorteio NÃO encerra; só este botão.)
    var _hasDrawNow = (Array.isArray(t.matches) && t.matches.length > 0) ||
                      (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                      (Array.isArray(t.groups) && t.groups.length > 0);
    var _lateMode = (t.lateEnrollment === 'standby' || t.lateEnrollment === 'expand');
    if (_hasDrawNow && _lateMode && t.status !== 'finished') {
        if (t.status === 'closed') {
            t.status = 'active';
            if (window.AppStore && window.AppStore.logAction) window.AppStore.logAction(tId, 'Inscrições reabertas (tardias) após o sorteio');
            if (typeof showNotification === 'function') showNotification('Inscrições reabertas', 'Novos inscritos vão para a lista de espera.', 'success');
        } else {
            t.status = 'closed';
            if (window.AppStore && window.AppStore.logAction) window.AppStore.logAction(tId, 'Inscrições encerradas pelo organizador');
            if (typeof showNotification === 'function') showNotification('Inscrições encerradas', 'Ninguém mais pode se inscrever.', 'info');
            // v2.4.20: com a inscrição fechada, o guard de inscrição-tardia em
            // _maybeFinishElimination libera — se a chave já chegou ao campeão,
            // encerra o torneio agora (não espera um próximo salvar de resultado,
            // que pode nem existir).
            if (typeof window._maybeFinishElimination === 'function') { try { window._maybeFinishElimination(t); } catch (e) {} }
        }
        _saveTournament(_refreshView);
        return;
    }

    if (t.status === 'closed') {
        // Impedir reabertura se já houve sorteio
        var hasDraw = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
        if (hasDraw) {
            if (typeof showAlertDialog === 'function') showAlertDialog(_t('draw.notAllowedTitle'), _t('draw.cantReopenAfterDraw'), null, { type: 'warning' });
            return;
        }
        if (typeof showConfirmDialog !== 'function') { window._error('showConfirmDialog not available'); return; }
        showConfirmDialog(_t('draw.reopenEnrollTitle'), _t('draw.reopenEnrollMsg', { name: window._safeHtml(t.name || '') }) + (t.activePollId ? _t('draw.reopenEnrollPollSuffix') : ''), function() {
            t.status = 'open';
            // v1.6.66-beta: limpa prazo de inscrição ao reabrir — inscrições
            // ficam abertas indefinidamente e o organizador pode redefinir o
            // prazo em "Detalhes Avançados" do torneio.
            t.registrationLimit = null;
            delete t._pollSuspended;
            // Sorteio de Vagas: ao reabrir, limpa a seleção pra um futuro
            // fechamento re-sortear do zero (a lista de espera é promovida abaixo).
            if (t.enrollmentLimitMode === 'draw') { t.drawSelectionDone = false; t.waitlistOrder = null; }
            // Auto-close active poll when reopening inscriptions
            if (t.activePollId && t.polls) {
                for (var _pi = 0; _pi < t.polls.length; _pi++) {
                    if (t.polls[_pi].id === t.activePollId && t.polls[_pi].status === 'active') {
                        t.polls[_pi].status = 'closed';
                        t.polls[_pi].deadline = Date.now();
                        window.AppStore.logAction(tId, 'Enquete encerrada automaticamente ao reabrir inscrições');
                        break;
                    }
                }
                t.activePollId = null;
            }
            // Promote everyone on any waitlist back to the main list — once enrollments
            // are open again, there's no reason to keep anyone waiting. Drains both
            // t.standbyParticipants (draw-time standby) and t.waitlist (late-enrollment
            // waitlist), with duplicate check by email/uid/displayName.
            var _promoted = 0;
            if (!Array.isArray(t.participants)) t.participants = t.participants ? Object.values(t.participants) : [];
            function _promoteList(list) {
                if (!Array.isArray(list) || list.length === 0) return;
                list.forEach(function(sp) {
                    var spEmail = (sp && sp.email) || '';
                    var spUid = (sp && sp.uid) || '';
                    var spName = (sp && (sp.displayName || sp.name)) || (typeof sp === 'string' ? sp : '');
                    var already = t.participants.some(function(p) {
                        if (typeof p === 'string') return (spEmail && p === spEmail) || (spName && p === spName);
                        return (p.email && spEmail && p.email === spEmail) ||
                               (p.uid && spUid && p.uid === spUid) ||
                               (p.displayName && spName && p.displayName === spName) ||
                               (p.name && spName && p.name === spName);
                    });
                    if (!already) {
                        t.participants.push(sp);
                        _promoted++;
                    }
                });
            }
            // CANÔNICO: promove a espera dos TRÊS storages e zera os 3.
            var _wlAll = (typeof window._clearAllWaitlists === 'function')
              ? window._clearAllWaitlists(t)
              : (function () { var p = (t.standbyParticipants || []).concat(t.waitlist || []); t.standbyParticipants = []; t.waitlist = []; t.monarchWaitlist = {}; return p; })();
            _promoteList(_wlAll);
            if (_promoted > 0) window.AppStore.logAction(tId, _promoted + ' participante(s) promovido(s) da lista de espera ao reabrir inscrições');
            window.AppStore.logAction(tId, 'Inscrições Reabertas');
            // Notify participants about reopened enrollments
            if (typeof window._notifyTournamentParticipants === 'function') {
                    window._notifyTournamentParticipants(t, {
                    type: 'enrollments_reopened',
                    message: _t('notif.enrollmentsReopened').replace('{name}', t.name || 'Torneio'),
                    level: 'important'
                }, window.AppStore.currentUser ? window.AppStore.currentUser.email : null);
            }
            _saveTournament(function() {
                _refreshView();
                if (typeof showNotification === 'function') {
                    var _msg = _t('draw.enrollReopenedMsg');
                    if (_promoted > 0) _msg += ' ' + _t('draw.standbyPromoted', { count: _promoted });
                    showNotification(_t('draw.enrollReopened'), _msg, 'info');
                }
            });
        });
        return;
    }

    // Verificar número de inscritos para todos os formatos
    var arr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
    if (arr.length < 2) {
        if (typeof showAlertDialog === 'function') showAlertDialog(_t('draw.tooFewTitle'), _t('draw.tooFewCloseMsg'), null, { type: 'warning' });
        return;
    }

    // Sorteio de Vagas: inscrição ficou aberta a janela inteira (sem corrida).
    // Ao encerrar, sorteia a ORDEM — os primeiros N (= targetSlots) entram e o
    // resto vai pra lista de espera nessa ordem. Pré-etapa antes da chave normal.
    if (t.enrollmentLimitMode === 'draw' && !t.drawSelectionDone && !_hasDrawNow &&
        typeof window._showVagasDrawPanel === 'function') {
        window._showVagasDrawPanel(tId);
        return;
    }

    // Run unified diagnostics for formats that need it.
    // Classify by *exclusion* to match the logic in showUnifiedResolutionPanel —
    // Liga/Suíço handle BYEs naturally, Groups has its own config panel, everything
    // else (Elim, Dupla Elim, Rei/Rainha, unknown legacy formats) needs the full
    // power-of-2/odd/incomplete/remainder check. Using a strict equality on
    // 'Eliminatórias Simples' missed tournaments whose format string drifted.
    var isGrupos = t.format === 'Grupos + Eliminatória' || t.format === 'Grupos + Mata-Mata' || (t.format || '').indexOf('Grupo') !== -1 || t.format === 'Fase de Grupos + Eliminatórias';
    var isLigaOrSwiss = t.format === 'Liga' || t.format === 'Suíço Clássico' || t.format === 'Ranking' || (window._isLigaFormat && window._isLigaFormat(t));

    // Groups format: always show groups config panel (no BYE/Swiss/waitlist)
    if (isGrupos && typeof window._showGroupsConfigPanel === 'function') {
        if (typeof window._diagnoseAll === 'function') {
            var diagG = window._diagnoseAll(t);
            // Only block on incomplete teams or remainder (not power of 2 or odd)
            if (diagG.incompleteTeams.length > 0 || diagG.remainder > 0) {
                window.showUnifiedResolutionPanel(tId);
                return;
            }
        }
        window._showGroupsConfigPanel(tId);
        return;
    }

    // Run diagnostics. Wrap in try/catch so a malformed participant list (null,
    // legacy shapes) doesn't make the whole handler die silently — which looks
    // exactly like "panel didn't fire" from the user's perspective.
    var diag = null;
    var diagError = null;
    try {
        if (typeof window._diagnoseAll === 'function') diag = window._diagnoseAll(t);
    } catch(e) {
        diagError = e;
    }

    if (diag) {
        // Liga/Swiss: only incomplete teams and remainder matter.
        // Everything else (Elim, Dupla Elim, Rei/Rainha, unknown): full check.
        var hasRelevantIssues = isLigaOrSwiss
            ? (diag.incompleteTeams.length > 0 || diag.remainder > 0)
            : diag.hasIssues;
        try {
            window._log('[Encerrar Inscrições] diag', {
                format: t.format,
                isGrupos: isGrupos,
                isLigaOrSwiss: isLigaOrSwiss,
                effectiveTeams: diag.effectiveTeams,
                remainder: diag.remainder,
                isOdd: diag.isOdd,
                isPowerOf2: diag.isPowerOf2,
                incompleteTeams: diag.incompleteTeams.length,
                hasIssues: diag.hasIssues,
                hasRelevantIssues: hasRelevantIssues
            });
        } catch(e) {}
        if (hasRelevantIssues) {
            // Fire the panel. If for any reason the overlay DOESN'T appear
            // surface a visible toast so the organizer isn't left with a
            // silently-failed button. We check TWICE: once synchronously
            // (catches throws inside _showRemainderPanel / showUnified…) and
            // once at 120ms (catches async removal by something else). Version
            // is embedded in the toast so a stale-cache browser shows whatever
            // version it cached — making stale-cache easy to diagnose.
            var _ver = window.SCOREPLACE_VERSION || '?';
            function _overlayPresent() {
                return document.getElementById('unified-resolution-panel') ||
                       document.getElementById('groups-config-panel') ||
                       document.getElementById('remainder-resolution-panel');
            }
            function _diagStr(extra) {
                return (extra ? extra + ' | ' : '') +
                    'v=' + _ver +
                    ' | fmt=' + (t.format || '?') +
                    ' | teams=' + diag.effectiveTeams +
                    ' | resto=' + diag.remainder +
                    ' | pot2=' + diag.isPowerOf2 +
                    ' | ímpar=' + diag.isOdd +
                    ' | incomp=' + diag.incompleteTeams.length;
            }
            var panelThrew = false;
            try {
                if (typeof window.showUnifiedResolutionPanel === 'function') {
                    window.showUnifiedResolutionPanel(tId);
                } else {
                    throw new Error('showUnifiedResolutionPanel is not defined');
                }
            } catch(e) {
                panelThrew = true;
                window._error('[Encerrar Inscrições] panel throw:', e);
                if (typeof showNotification === 'function') {
                    showNotification('⚠️ Erro ao abrir painel (sync)', _diagStr('err=' + String(e && e.message || e)), 'error');
                }
            }
            // Synchronous check: if no overlay RIGHT NOW (and no throw), the
            // panel function returned early without rendering (bug in the
            // dispatch logic itself, not an async removal).
            if (!panelThrew && !_overlayPresent() && typeof showNotification === 'function') {
                showNotification('⚠️ Painel não criado (sync)', _diagStr(), 'warning');
            }
            // Async check: catches cases where the overlay was created then
            // immediately removed by another code path (re-render, onSnapshot,
            // etc). Only fires if no overlay exists at 120ms AND the sync
            // check passed (avoids duplicate toasts).
            setTimeout(function() {
                if (panelThrew) return;
                if (!_overlayPresent() && typeof showNotification === 'function') {
                    showNotification('⚠️ Painel removido (async)', _diagStr(), 'warning');
                }
            }, 120);
            return;
        }
    } else if (diagError) {
        window._error('[Encerrar Inscrições] _diagnoseAll throw:', diagError);
        if (typeof showNotification === 'function') {
            showNotification('⚠️ Falha no diagnóstico',
                'Não consegui avaliar o número de inscritos: ' + (diagError.message || String(diagError)) + '. Encerrando mesmo assim.',
                'warning');
        }
        // Fall through to confirm-close dialog below.
    }

    // Confirmar antes de encerrar
    if (typeof showConfirmDialog !== 'function') { window._error('showConfirmDialog not available'); return; }
    showConfirmDialog(_t('draw.closeEnrollTitle'), _t('draw.closeEnrollMsg', { name: window._safeHtml(t.name || '') }), function() {
        t.status = 'closed';
        window.AppStore.logAction(tId, 'Inscrições Encerradas manualmente');
        // Notify participants about closed enrollments
        if (typeof window._notifyTournamentParticipants === 'function') {
            window._notifyTournamentParticipants(t, {
                type: 'enrollments_closed',
                message: _t('notif.enrollmentsClosed').replace('{name}', t.name || 'Torneio'),
                level: 'important'
            }, window.AppStore.currentUser ? window.AppStore.currentUser.email : null);
        }
        _saveTournament(function() {
            _refreshView();
            if (typeof showNotification === 'function') showNotification(_t('draw.enrollClosed'), _t('draw.enrollClosedMsg'), 'success');
        });
    });
};

// ─── Sorteio de Vagas (draw-based slots) ───
// Painel de confirmação do sorteio de vagas, disparado pelo "Encerrar
// Inscrições" quando enrollmentLimitMode === 'draw'. Mostra inscritos vs vagas,
// VIPs garantidos e a política de chamada, e roda o sorteio em _runVagasDraw.
window._showVagasDrawPanel = function (tId) {
    var t = window._findTournamentById(tId);
    if (!t) return;
    var slots = parseInt(t.targetSlots) || 0;
    if (slots <= 0) {
        if (typeof showAlertDialog === 'function') showAlertDialog('Defina o número de vagas', 'Este torneio usa Sorteio de Vagas mas o número de vagas não foi definido. Abra Editar → Modelo de inscrição e informe quantas vagas (duplas/pessoas).', null, { type: 'warning' });
        return;
    }
    var diag = (typeof window._diagnoseAll === 'function') ? window._diagnoseAll(t) : { effectiveTeams: 0, teamSize: 1 };
    var entities = diag.effectiveTeams || 0;
    var unit = (diag.teamSize > 1) ? 'duplas/times' : 'inscritos';
    // VIPs garantidos (entidades)
    var _vips = t.vips || {};
    var pArr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
    var vipCount = 0;
    pArr.forEach(function(entry) {
        if (window._entryHasVip(t, entry)) vipCount++; // uid-first (entrada solo ou dupla)
    });
    var waitlistPreview = Math.max(0, entities - slots);
    var allFit = entities <= slots;
    var policyLabel = (t.callPolicy === 'locked') ? '🔒 Ordem do sorteio (travada)' : '🏃 Quem chegar primeiro (presença)';

    var existing = document.getElementById('vagas-draw-panel');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'vagas-draw-panel';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10035;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.7);overflow-y:auto;';
    var _row = function(label, val, color) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:6px;">' +
            '<span style="font-size:0.82rem;color:var(--text-muted);">' + label + '</span>' +
            '<span style="font-size:1.05rem;font-weight:800;color:' + (color || 'var(--text-color)') + ';">' + val + '</span></div>';
    };
    var bodyMsg = allFit
        ? '<div style="font-size:0.82rem;color:#34d399;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:8px 12px;margin-bottom:12px;">Há ' + entities + ' ' + unit + ' inscritos e ' + slots + ' vagas — <b>todos entram</b>. Nada vai pra lista de espera.</div>'
        : '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">O sorteio define uma ordem aleatória. As primeiras <b>' + slots + '</b> ' + unit + ' entram; as outras <b>' + waitlistPreview + '</b> vão pra lista de espera nessa ordem.' + (vipCount > 0 ? ' VIPs entram garantidos.' : '') + '</div>';
    overlay.innerHTML =
        '<div style="background:var(--bg-card,#161b2e);border:1px solid rgba(167,139,250,0.3);border-radius:16px;max-width:440px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +
            '<div style="font-size:1.2rem;font-weight:800;margin-bottom:4px;">🎲 Sorteio de Vagas</div>' +
            '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:14px;">' + window._safeHtml(t.name || '') + '</div>' +
            _row('Inscritos', entities + ' ' + unit, '#60a5fa') +
            _row('Vagas', String(slots), '#a78bfa') +
            (vipCount > 0 ? _row('VIPs garantidos', String(vipCount), '#fbbf24') : '') +
            (allFit ? '' : _row('Lista de espera', String(waitlistPreview), '#f59e0b')) +
            _row('Chamada da fila', policyLabel, 'var(--text-color)') +
            bodyMsg +
            '<div style="display:flex;gap:10px;margin-top:6px;">' +
                '<button type="button" onclick="document.getElementById(\'vagas-draw-panel\').remove();document.body.style.overflow=\'\';" class="btn btn-secondary" style="flex:1;">Cancelar</button>' +
                '<button type="button" onclick="window._runVagasDraw(\'' + String(tId).replace(/'/g, "\\'") + '\')" class="btn btn-primary" style="flex:2;">' + (allFit ? 'Encerrar e sortear chave' : '🎲 Sortear vagas') + '</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
};

// Executa o sorteio de vagas: embaralha os não-VIPs, mantém VIPs garantidos,
// corta em targetSlots (em jogadores, preservando times), e manda o resto pra
// lista de espera na ordem sorteada (t.waitlistOrder). Generaliza o ramo
// 'standby' de _confirmP2Resolution, mas com corte definido pelo organizador.
window._runVagasDraw = function (tId) {
    var t = window._findTournamentById(tId);
    if (!t) return;
    var slots = parseInt(t.targetSlots) || 0;
    if (slots <= 0) return;
    var info = (typeof window._diagnoseAll === 'function') ? window._diagnoseAll(t) : { teamSize: parseInt(t.teamSize) || 1 };
    var p = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
    // Snapshot pré-sorteio (permite refazer o sorteio enquanto não houver chave)
    t.preDrawEnrollees = p.slice();

    var _vips = t.vips || {};
    var vipEntries = [];
    var nonVipEntries = [];
    p.forEach(function(entry) {
        if (window._entryHasVip(t, entry)) vipEntries.push(entry); else nonVipEntries.push(entry);
    });

    // Embaralha SEMPRE (este modo é sempre sorteio aleatório) — Fisher-Yates.
    var pool = nonVipEntries.slice();
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }

    // Corte em jogadores (indivíduo=1, time pré-formado=teamSize) → mantém times
    // completos sem BYE. Igual à contabilidade do ramo standby existente.
    var _ts = info.teamSize || 1;
    var _playersOf = function(e) { return window._entryTeamMembers(e) ? _ts : 1; }; // v3.0.x: time por estrutura, não por '/'
    var _targetPlayers = slots * _ts;
    var _used = vipEntries.reduce(function(s, e) { return s + _playersOf(e); }, 0);
    var kept = [];
    var overflow = [];
    pool.forEach(function(e) { var s = _playersOf(e); if (_used + s <= _targetPlayers) { kept.push(e); _used += s; } else { overflow.push(e); } });

    // Persiste a ordem sorteada da sobra (nomes canônicos + índice por entrada).
    var order = [];
    overflow.forEach(function(e, idx) {
        if (e && typeof e === 'object') e.drawOrder = idx;
        var nm = (typeof window._pName === 'function') ? window._pName(e) : (typeof e === 'string' ? e : (e.displayName || e.name || ''));
        order.push(nm);
    });

    t.participants = vipEntries.concat(kept);
    t.standbyParticipants = (t.standbyParticipants || []).concat(overflow);
    t.waitlistOrder = order;
    t.standbyPick = 'random';
    t.standbyMode = (_ts > 1) ? 'teams' : 'individual';
    t.drawSelectionDone = true;
    t.status = 'closed';

    // VIPs > vagas: todos os VIPs ficam (garantidos), nenhum não-VIP entra.
    if (kept.length === 0 && vipEntries.length > slots && typeof showNotification === 'function') {
        showNotification('⚠️ VIPs excedem as vagas', vipEntries.length + ' VIP(s) para ' + slots + ' vaga(s) — todos os VIPs foram mantidos; a chave terá ' + t.participants.length + ' participantes.', 'warning');
    }

    if (window.AppStore && window.AppStore.logAction) {
        window.AppStore.logAction(tId, 'Sorteio de vagas: ' + t.participants.length + ' selecionado(s), ' + overflow.length + ' na lista de espera (' + (t.callPolicy === 'locked' ? 'ordem travada' : 'por presença') + ')');
    }

    if (document.getElementById('vagas-draw-panel')) document.getElementById('vagas-draw-panel').remove();
    document.body.style.overflow = '';

    // Hand-off pro fluxo de sorteio de chave existente (igual ao botão Sortear):
    // resolve grupos/Liga/eliminatória e o painel de resolução pra N≠potência de 2.
    var _after = function() {
        if (typeof window._handleSortearClick === 'function') { window._handleSortearClick(tId, false); }
        else if (typeof window.showUnifiedResolutionPanel === 'function') { window.showUnifiedResolutionPanel(tId); }
    };
    if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
        window.FirestoreDB.saveTournament(t).then(_after).catch(function(err) { window._error && window._error('[_runVagasDraw] save error:', err); _after(); });
    } else {
        try { window.AppStore.sync(); } catch (e) {}
        _after();
    }
};

// v4.0.73: showResolutionSimulationPanel (a 2ª tela de simulação/preview) REMOVIDA —
// bye/play-in/Suíço/standby aplicam direto via _confirmP2Resolution (do painel
// unificado e da enquete). Fim do caminho duplicado.
window._confirmP2Resolution = function (tId, option) {
    // Apply the actual resolution logic here
    const t = window._findTournamentById(tId);
    if (!t) return;
    const info = window.checkPowerOf2(t);

    let actionMsg = "";
    if (option === 'bye') {
        t.p2Resolution = 'bye';
        t.p2TargetCount = info.hi;
        actionMsg = `Configurado com BYEs para chave de ${info.hi}`;
    } else if (option === 'playin') {
        t.p2Resolution = 'playin';
        t.p2TargetCount = info.lo;
        t.p2CrossSeed = true; // R2: pair R1 winners vs repechage winners for fairness
        actionMsg = `Configurado com Play-ins (cross-seed) para chave de ${info.lo}`;
    } else if (option === 'standby') {
        t.p2Resolution = 'standby';
        t.p2TargetCount = info.lo;
        const p = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
        // Separar VIPs (protegidos) dos demais — uid-first (entrada solo ou dupla)
        const vipEntries = [];
        const nonVipEntries = [];
        p.forEach(entry => {
            if (window._entryHasVip(t, entry)) vipEntries.push(entry);
            else nonVipEntries.push(entry);
        });
        // v2.1.27: QUEM espera — 'last' (últimos a se inscrever, padrão) ou 'random'
        // (sorteio livre). NUNCA gera BYE: a sobra inteira vai pra lista de espera e
        // o bracket fica com info.lo (potência de 2 exata).
        const pickRadio = document.querySelector('input[name="standby-pick"]:checked');
        const standbyPick = pickRadio ? pickRadio.value : 'last';
        let _pool = nonVipEntries.slice();
        if (standbyPick === 'random') {
            for (let _i = _pool.length - 1; _i > 0; _i--) { const _j = Math.floor(Math.random() * (_i + 1)); const _tmp = _pool[_i]; _pool[_i] = _pool[_j]; _pool[_j] = _tmp; }
        }
        // v2.1.29: conta em PLAYERS (indivíduo=1, time pré-formado=teamSize) e mantém
        // exatamente info.lo*teamSize jogadores → info.lo times completos, sem BYE.
        const _ts = info.teamSize || 1;
        const _playersOf = (e) => window._entryTeamMembers(e) ? _ts : 1; // v3.0.x: time por estrutura, não por '/'
        const _targetPlayers = info.lo * _ts;
        let _used = vipEntries.reduce((s, e) => s + _playersOf(e), 0);
        const kept = [];
        const standbyOverflow = [];
        _pool.forEach((e) => { const s = _playersOf(e); if (_used + s <= _targetPlayers) { kept.push(e); _used += s; } else { standbyOverflow.push(e); } });
        t.standbyParticipants = (t.standbyParticipants || []).concat(standbyOverflow);
        t.participants = [...vipEntries, ...kept];
        t.standbyPick = standbyPick;
        // Save standby substitution mode
        const modeRadio = document.querySelector('input[name="standby-mode"]:checked');
        t.standbyMode = modeRadio ? modeRadio.value : 'teams';
        const pickLabel = standbyPick === 'random' ? 'sorteio livre' : 'últimos a se inscrever';
        actionMsg = `Movidos ${standbyOverflow.length} para Lista de Espera (${pickLabel}) — chave de ${info.lo}, sem BYE`;
    } else if (option === 'swiss') {
        t.p2Resolution = 'swiss';
        t.classifyFormat = 'swiss';
        // Save organizer-selected round count (from simulation panel)
        if (window._swissSelectedRounds) {
            t.swissRounds = window._swissSelectedRounds;
        }
        actionMsg = 'Iniciado com Fase Classificatória (Suíço' + (t.swissRounds ? ' — ' + t.swissRounds + ' rodadas' : '') + ')';
    }

    t.status = 'closed';
    window.AppStore.logAction(tId, actionMsg);
    window.AppStore.sync();

    if (document.getElementById('simulation-panel')) document.getElementById('simulation-panel').remove();
    if (document.getElementById('p2-resolution-panel')) document.getElementById('p2-resolution-panel').remove();
    if (document.getElementById('unified-resolution-panel')) document.getElementById('unified-resolution-panel').remove();
    document.body.style.overflow = '';

    // Go directly to actual draw — skip Final Review Panel (user already confirmed in simulation)
    if (typeof window.generateDrawFunction === 'function') {
        window.generateDrawFunction(tId);
    } else {
        window.showFinalReviewPanel(tId);
    }
};


})();
