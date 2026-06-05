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
        if (pName.includes(' / ') || pName.includes('/')) {
            const members = pName.split('/').map(m => m.trim()).filter(m => m.length > 0);
            if (members.length < teamSize) {
                incompleteTeams.push({ index: idx, name: pName, members: members, missing: teamSize - members.length });
                preFormedTeams++;
            } else {
                preFormedTeams++;
            }
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
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
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

    window._groupsSelectedConfig = null;

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

    function renderPanel(classPerGroup) {
        var configs = generateConfigs(N, classPerGroup);

        // v0.17.75: ranking refinado — antes era "pow2 → mais even → menos grupos"
        // o que recomendava N=2 com grupos lopsided (11+10 com 21 times: cada
        // jogador joga 10 jogos só na fase de grupos). Agora considera também
        // o TAMANHO dos grupos: 4-5 times é o sweet-spot (round-robin razoável).
        // 2-3 times = jogos muito poucos. 7+ = round-robin gigante. Resultado:
        // recomendação prioriza balance entre pow2 + tamanho razoável.
        function configScore(c) {
            var score = 0;
            // Pow2 advancing: bônus dominante (cobre o caso ≠ pot.2 sempre perder)
            if (c.isPow2) score += 1000;
            // Grupos balanceados (sem sobra): bônus
            if (c.remainder === 0) score += 80;
            // Tamanho médio do grupo: 4-5 ideal (round-robin de 6-10 jogos),
            // 3 ou 6 OK, 2 ruim (poucos jogos), 7+ ruim (round-robin gigante)
            var avgSize = c.remainder === 0 ? c.base : (c.base + 0.5);
            if (avgSize >= 4 && avgSize <= 5) score += 60;
            else if (avgSize === 3 || avgSize === 6) score += 30;
            else if (avgSize <= 2) score -= 30;
            else if (avgSize >= 7) score -= 10 * (avgSize - 6);
            // Penalizar muito poucos grupos (N=2 com grupos enormes)
            if (c.groups <= 2 && avgSize >= 7) score -= 40;
            // Tie-breaker: menor número de grupos é mais simples logística
            score -= c.groups * 0.1;
            return score;
        }
        configs.sort(function(a, b) {
            return configScore(b) - configScore(a);
        });

        // Header
        var html = '<div style="background:var(--bg-card,#1e293b);width:94%;max-width:800px;border-radius:32px;margin:auto 0;border:1px solid rgba(59,130,246,0.25);box-shadow:0 40px 120px rgba(0,0,0,0.8);overflow:hidden;animation:modalFadeIn 0.3s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;max-height:90vh;">' +
            '<div style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#1e3a5f 0%,#1e40af 50%,#3b82f6 100%);padding:12px 1.5rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;">' +
                '<div style="display:flex;align-items:center;gap:12px;">' +
                    '<span style="font-size:1.5rem;">🏟️</span>' +
                    '<div>' +
                        '<h3 style="margin:0;color:#dbeafe;font-size:1.1rem;font-weight:900;">' + _t('predraw.groupsTitle') + '</h3>' +
                        '<p style="margin:2px 0 0;color:#93c5fd;font-size:0.75rem;opacity:0.9;">' + N + ' ' + unitLabel + ' — ' + _t('predraw.chooseDistribution') + '</p>' +
                    '</div>' +
                '</div>' +
                '<button onclick="window._cancelGroupsConfig(\'' + tIdSafe + '\')" style="background:rgba(0,0,0,0.25);color:#dbeafe;border:2px solid rgba(219,234,254,0.3);padding:8px 20px;border-radius:12px;font-weight:700;font-size:0.85rem;cursor:pointer;transition:all 0.2s;white-space:nowrap;flex-shrink:0;" onmouseover="this.style.background=\'rgba(0,0,0,0.4)\'" onmouseout="this.style.background=\'rgba(0,0,0,0.25)\'">' + _t('predraw.cancelBtn') + '</button>' +
            '</div>' +
            '<div style="overflow-y:auto;flex:1;padding:1.5rem;">';

        // Classified per group selector
        html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:1.25rem;flex-wrap:wrap;">' +
            '<span style="font-size:0.8rem;font-weight:700;color:var(--text-bright);">' + _t('predraw.classifiedPerGroup') + '</span>';
        for (var cp = 1; cp <= 4; cp++) {
            var isActive = cp === classPerGroup;
            html += '<button onclick="window._groupsRerenderPanel(' + cp + ')" style="padding:6px 16px;border-radius:10px;font-size:0.85rem;font-weight:700;cursor:pointer;transition:all 0.15s;border:2px solid ' + (isActive ? '#3b82f6' : 'rgba(255,255,255,0.15)') + ';background:' + (isActive ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.05)') + ';color:' + (isActive ? '#93c5fd' : 'var(--text-muted)') + ';">' + cp + '</button>';
        }
        html += '</div>';

        if (configs.length === 0) {
            html += '<div style="text-align:center;padding:2rem;color:var(--text-muted);">' + _t('predraw.noValidConfig', {n: N, unit: unitLabel}) + '</div>';
        } else {
            // Grid of configs
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">';
            configs.forEach(function(c, idx) {
                var isEven = c.remainder === 0;
                var borderColor = c.isPow2 ? 'rgba(34,197,94,0.5)' : (isEven ? 'rgba(59,130,246,0.35)' : 'rgba(251,191,36,0.35)');
                var bgColor = c.isPow2 ? 'rgba(34,197,94,0.08)' : (isEven ? 'rgba(59,130,246,0.06)' : 'rgba(251,191,36,0.06)');
                var glowColor = c.isPow2 ? '0 0 16px rgba(34,197,94,0.15)' : 'none';

                // Distribution text
                var distText = '';
                if (isEven) {
                    distText = _t('predraw.groupsOf', {g: c.groups, s: c.base});
                } else {
                    distText = _t('predraw.groupsMixed', {g1: c.bigGroups, s1: (c.bigGroups > 1 ? 's' : ''), z1: c.bigSize, g2: c.smallGroups, s2: (c.smallGroups > 1 ? 's' : ''), z2: c.smallSize});
                }

                // Advance info
                var advanceText = _t('predraw.advanceLabel', {n: c.totalAdvance});
                var pow2Badge = c.isPow2
                    ? '<span style="font-size:0.6rem;font-weight:800;color:#4ade80;background:rgba(34,197,94,0.15);padding:2px 6px;border-radius:4px;">' + _t('predraw.badgePow2') + '</span>'
                    : '<span style="font-size:0.6rem;font-weight:700;color:#fbbf24;background:rgba(251,191,36,0.12);padding:2px 6px;border-radius:4px;">' + _t('predraw.badgeNotPow2') + '</span>';

                // Recommended badge
                var recommendBadge = (idx === 0) ? '<div style="margin-bottom:4px;"><span style="background:rgba(34,197,94,0.2);color:#4ade80;padding:2px 8px;border-radius:6px;font-size:0.6rem;font-weight:800;text-transform:uppercase;">' + _t('predraw.nashRecommended') + '</span></div>' : '';

                // v1.1.1-beta: matches + duração estimada por card
                var _matches = _matchesForConfig(c);
                var _durMin = _durationForConfig(c);
                var _durText = _formatDuration(_durMin);
                var statsHtml = '<div style="display:flex;align-items:center;gap:10px;margin-top:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);font-size:0.68rem;color:var(--text-muted);font-weight:600;">' +
                    '<span style="color:#cbd5e1;">⚔️ ' + _matches + ' partidas</span>' +
                    (_durText ? '<span style="color:#cbd5e1;">⏱️ ' + _durText + '</span>' : '') +
                '</div>';

                html += '<button onclick="window._selectGroupsConfig(\'' + tIdSafe + '\',' + c.groups + ',' + c.classPerGroup + ')" style="background:' + bgColor + ';border:2px solid ' + borderColor + ';box-shadow:' + glowColor + ';border-radius:16px;padding:14px 16px;cursor:pointer;transition:all 0.25s;text-align:center;color:#e2e8f0;display:flex;flex-direction:column;gap:6px;align-items:center;" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.filter=\'brightness(1.12)\'" onmouseout="this.style.transform=\'\';this.style.filter=\'\'">' +
                    recommendBadge +
                    '<div style="font-size:2rem;font-weight:950;color:#fff;line-height:1;">' + c.groups + '</div>' +
                    '<div style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">' + _t('predraw.groupsUnit') + '</div>' +
                    '<div style="font-size:0.78rem;font-weight:600;color:var(--text-bright);line-height:1.3;margin-top:2px;">' + distText + '</div>' +
                    '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">' +
                        '<span style="font-size:0.7rem;color:#93c5fd;font-weight:600;">' + advanceText + '</span>' +
                        pow2Badge +
                    '</div>' +
                    statsHtml +
                '</button>';
            });
            html += '</div>';
        }

        // Legend
        html += '<div style="margin-top:1rem;display:flex;gap:16px;flex-wrap:wrap;justify-content:center;">' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">' + _t('predraw.legendPow2') + '</span>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">' + _t('predraw.legendEven') + '</span>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">' + _t('predraw.legendMixed') + '</span>' +
            '</div>';

        html += '</div></div>';
        return html;
    }

    window._groupsRerenderPanel = function(classPerGroup) {
        overlay.innerHTML = renderPanel(classPerGroup);
    };

    window._selectGroupsConfig = function(tId, numGroups, classPerGroup) {
        var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
        if (!t) return;
        t.gruposCount = numGroups;
        t.gruposClassified = classPerGroup;
        // Ensure enrollment is closed
        if (t.status !== 'closed') {
            t.status = 'closed';
        }
        // Clean up suspension flags
        delete t._suspendedByPanel;
        delete t._previousStatus;
        window.FirestoreDB.saveTournament(t).then(function() {
            // Close panel
            var panel = document.getElementById('groups-config-panel');
            if (panel) panel.remove();
            document.body.style.overflow = '';
            // Go directly to draw generation (skip final review to avoid re-triggering groups panel)
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
        var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
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

    overlay.innerHTML = renderPanel(currentClassified);
    document.body.appendChild(overlay);
};

// ============ DEDICATED REMAINDER PANEL ============
// Visually distinct from the power-of-2 panel (purple/indigo vs orange/brown)

window._showRemainderPanel = function(tId, info, t) {
    var existing = document.getElementById('remainder-resolution-panel');
    if (existing) existing.remove();

    var tIdSafe = String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var teamsFormed = info.effectiveTeams;
    var remCount = info.remainder;
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
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
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

    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
    if (!t) return;

    var arr = Array.isArray(t.participants) ? t.participants.slice() : [];
    // v2.1.29: remove em PLAYERS até sobrar exatamente a maior potência de 2 de
    // TIMES COMPLETOS — zero resto, zero BYE. Antes removia só o "remainder" (o
    // avulso, 1), deixando nº de times fora da potência de 2 → BYE. Ex.: 19
    // avulsos (dupla) → mantém 16 (8 duplas) e manda 3 pra espera.
    var _ts = parseInt(t.teamSize) || 1;
    var _enr = t.enrollmentMode || t.enrollment || 'individual';
    if ((_enr === 'time' || _enr === 'misto') && _ts < 2) _ts = 2;
    var _playersOf = function(p) { var nm = typeof p === 'string' ? p : (p.displayName || p.name || ''); return nm.indexOf(' / ') !== -1 ? _ts : 1; };
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
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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
        // Only fall through to standard panel for incomplete teams/remainder
        if (_diagG.incompleteTeams.length === 0 && _diagG.remainder === 0) {
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

            html += '<button style="background:' + c.bg + ';border:2px solid ' + c.border + ';box-shadow:' + c.glow + ';border-radius:16px;padding:12px 16px;cursor:pointer;transition:all 0.25s;text-align:center;color:#e2e8f0;display:flex;flex-direction:column;gap:6px;overflow:hidden;" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.filter=\'brightness(1.12)\'" onmouseout="this.style.transform=\'\';this.style.filter=\'\'" onclick="window._handleUnifiedOption(\'' + tIdSafe + '\', \'' + o.key + '\')">' +
                topRow +
                '<div style="font-size:1.8rem;line-height:1;">' + o.icon + '</div>' +
                '<div style="font-weight:800;font-size:0.95rem;color:#fff;">' + o.title + '</div>' +
                '<div style="font-size:0.75rem;color:rgba(255,255,255,0.65);line-height:1.4;">' + o.desc + '</div>' +
                '<div style="margin-top:auto;padding-top:6px;"><span style="display:inline-block;padding:3px 10px;border-radius:8px;font-size:0.65rem;font-weight:800;background:' + c.pillBg + ';color:' + c.pill + ';">Nash ' + pct + '%</span></div>' +
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

    window._handleUnifiedOption = function(tId, option) {
        const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
        if (!t) return;

        // Remove panel
        const panel = document.getElementById('unified-resolution-panel');
        if (panel) panel.remove();
        document.body.style.overflow = '';

        // Handle option
        if (option === 'reopen') {
            window._showReopenPanel(tId, info);
        } else if (option === 'bye') {
            window.showResolutionSimulationPanel(tId, 'bye');
        } else if (option === 'playin') {
            window.showResolutionSimulationPanel(tId, 'playin');
        } else if (option === 'standby' || option === 'exclusion') {
            window._showRemovalSubChoice(tId, option, info);
        } else if (option === 'swiss') {
            window.showResolutionSimulationPanel(tId, 'swiss');
        } else if (option === 'dissolve') {
            window.showDissolveTeamsPanel(tId);
        } else if (option === 'poll') {
            window._showPollCreationDialog(tId, 'unified', null);
        }
    };

    window._cancelUnifiedPanel = function(tId) {
        const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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

    gaugeHtml = '<div style="display:flex;align-items:center;justify-content:center;gap:1rem;background:rgba(0,0,0,0.3);padding:1.25rem;border-radius:24px;border:1px solid rgba(255,255,255,0.05);flex-wrap:wrap;">' +
        '<div style="text-align:center;min-width:80px;">' +
        '<div style="font-size:0.65rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:700;">' + _t('predraw.gaugeInferior') + '</div>' +
        '<div style="font-size:1.8rem;font-weight:900;color:#4ade80;line-height:1;">' + info.loP2 + '</div>' +
        '<div style="font-size:0.7rem;color:#86efac;margin-top:2px;">' + _loSub + '</div>' +
        '<div style="font-size:0.65rem;color:#f87171;margin-top:4px;font-weight:700;">' + _t('predraw.gaugeOver', {n: _excessCount, unit: _unitLabel}) + '</div>' +
        '</div>' +
        '<div style="text-align:center;min-width:100px;padding:0 0.5rem;">' +
        '<div style="font-size:2.5rem;font-weight:950;color:#fbbf24;line-height:1;">' + info.effectiveTeams + '</div>' +
        '<div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;font-weight:800;margin-top:2px;">' + _centerLabel + '</div>' +
        (info.isTeam ? '<div style="font-size:0.65rem;color:#fde68a;margin-top:1px;">' + _centerSub + '</div>' : '') +
        '</div>' +
        '<div style="text-align:center;min-width:80px;">' +
        '<div style="font-size:0.65rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:700;">' + _t('predraw.gaugeSuperior') + '</div>' +
        '<div style="font-size:1.8rem;font-weight:900;color:#60a5fa;line-height:1;">' + info.hiP2 + '</div>' +
        '<div style="font-size:0.7rem;color:#93c5fd;margin-top:2px;">' + _hiSub + '</div>' +
        '<div style="font-size:0.65rem;color:#38bdf8;margin-top:4px;font-weight:700;">' + _t('predraw.gaugeMissing', {n: _missingCount, unit: _unitLabel}) + '</div>' +
        '</div>' +
        '</div>';

    overlay.innerHTML = '<div style="background:var(--bg-card,#1e293b);width:94%;max-width:800px;border-radius:32px;margin:auto 0;border:1px solid rgba(251,191,36,0.2);box-shadow:0 40px 120px rgba(0,0,0,0.8);overflow:hidden;animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);display:flex;flex-direction:column;max-height:90vh;">' +
        // Sticky top bar with cancel button
        '<div style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#78350f 0%,#92400e 50%,#b45309 100%);padding:12px 1.5rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
                '<span style="font-size:1.5rem;">⚙️</span>' +
                '<div>' +
                    '<h3 style="margin:0;color:#fef3c7;font-size:1.1rem;font-weight:900;letter-spacing:-0.02em;">' + _t('predraw.adjustTitle') + '</h3>' +
                    '<p style="margin:2px 0 0;color:#fde68a;font-size:0.75rem;opacity:0.9;">' + _t('predraw.detectedPrefix') + issuesText + '</p>' +
                '</div>' +
            '</div>' +
            '<button onclick="window._cancelUnifiedPanel(\'' + tIdSafe + '\')" style="background:rgba(0,0,0,0.25);color:#fef3c7;border:2px solid rgba(254,243,199,0.3);padding:8px 20px;border-radius:12px;font-weight:700;font-size:0.85rem;cursor:pointer;transition:all 0.2s;white-space:nowrap;flex-shrink:0;" onmouseover="this.style.background=\'rgba(0,0,0,0.4)\';this.style.borderColor=\'rgba(254,243,199,0.5)\'" onmouseout="this.style.background=\'rgba(0,0,0,0.25)\';this.style.borderColor=\'rgba(254,243,199,0.3)\'">' + _t('predraw.cancelBtn') + '</button>' +
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
        '<div style="padding:2rem 2.5rem 2.5rem;">' +
            '<h4 style="margin:0 0 0.5rem;color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;font-weight:700;">' + _t('predraw.selectStrategy') + '</h4>' +
            '<p style="margin:0 0 1.5rem;font-size:0.7rem;color:#64748b;line-height:1.5;">' + _t('predraw.nashColorLegend') + '</p>' +
            '<div id="unified-options-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;">' +
                window._renderUnifiedOptions([]) +
            '</div>' +
        '</div>' +
        '</div>' +
    '</div>';

    document.body.appendChild(overlay);
};

window._showReopenPanel = function(tId, info) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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

window.checkIncompleteTeams = function (t) {
    const enrMode = t.enrollmentMode || t.enrollment || 'individual';
    let teamSize = parseInt(t.teamSize) || 1;
    if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) teamSize = 2;
    const participants = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);

    const incomplete = [];
    const individuals = [];

    participants.forEach((p, idx) => {
        const pName = typeof p === 'string' ? p : (p.displayName || p.name || '');
        if (pName.includes('/')) {
            const members = pName.split('/').map(m => m.trim()).filter(m => m.length > 0);
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
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;

    const incomplete = window.checkIncompleteTeams(t);
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
                <button onclick="window._saveDissolveResolution('${String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" style="background:#2563eb;color:white;border:none;padding:12px 25px;border-radius:12px;font-weight:700;cursor:pointer;box-shadow:0 10px 20px rgba(37,99,235,0.3);">${_t('predraw.saveChanges')}</button>
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
                <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);padding:10px 15px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;cursor:move;">
                    <span style="font-size:0.9rem;color:#e2e8f0;">${window._safeHtml(name)}</span>
                    <span style="color:#94a3b8;font-size:0.75rem;">ID: ${idx}</span>
                </div>
            `;
        }).join('');
    };

    renderLists();
};

window._saveDissolveResolution = function (tId) {
    // Em um sistema real, aqui consolidaríamos as mudanças no state do torneio
    window.AppStore.logAction(tId, 'Times dissolvidos/realocados manualmente');
    showNotification(_t('draw.changesSaved'), _t('draw.changesSavedMsg'), 'success');
    document.getElementById('dissolve-panel').remove();
    if (document.getElementById('incomplete-teams-panel')) document.getElementById('incomplete-teams-panel').remove();
    window.showPowerOf2Panel(tId);
};

// ─── VERIFICAÇÃO 2: NÚMERO ÍMPAR DE TIMES/INSCRITOS ───
window.checkOddEntries = function (t) {
    var arr = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
    var teamSize = parseInt(t.teamSize) || 1;
    var enrMode = t.enrollmentMode || t.enrollment || 'individual';
    if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) teamSize = 2;

    var preFormedTeams = 0, individuals = 0;
    arr.forEach(function(p) {
        var name = typeof p === 'string' ? p : (p.displayName || p.name || '');
        if (name.includes(' / ')) preFormedTeams++;
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
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
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
        const name = typeof p === 'string' ? p : (p.displayName || p.name || '');
        if (name.includes(' / ')) preFormedTeams++;
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
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
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
            var pEmail = p.email || '';
            if (!pEmail) return;
            t.pollNotifications.push({
                targetEmail: pEmail,
                pollId: pollData.id,
                timestamp: Date.now(),
                read: false
            });
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
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t || !t.polls) return;

    var poll = null;
    for (var i = 0; i < t.polls.length; i++) {
        if (t.polls[i].id === pollId) { poll = t.polls[i]; break; }
    }
    if (!poll) return;

    var user = window.AppStore.currentUser;
    var userEmail = (user && user.email) ? user.email : '';
    var userVote = poll.votes[userEmail] || null;
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
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
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
        return (p.email && p.email === userEmail) || (p.uid && user.uid && p.uid === user.uid) || (p.displayName && p.displayName === (user.displayName || ''));
    });
    var isOrganizer = (userEmail === t.organizerEmail);
    if (!isParticipant && !isOrganizer) {
        if (typeof showNotification === 'function') showNotification(_t('draw.pollNotAllowed'), _t('draw.pollNotAllowedMsg'), 'warning');
        return;
    }

    var previousVote = poll.votes[userEmail] || null;
    poll.votes[userEmail] = optionKey;

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
    if (!user || !user.email) return;

    var unreadNotifs = [];
    t.pollNotifications.forEach(function(n) {
        if (n.targetEmail === user.email && !n.read) {
            unreadNotifs.push(n);
        }
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
    var hasVoted = !!activePoll.votes[userEmail];
    var isOrganizer = (user && user.email === t.organizerEmail);

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
    var isOrganizer = (user && user.email === t.organizerEmail);

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
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
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
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
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
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
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
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;

    const info = window.checkPowerOf2(t);

    if (option === 'bye' || option === 'playin' || option === 'standby' || option === 'swiss') {
        window.showResolutionSimulationPanel(tId, option);
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
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
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
            _promoteList(t.standbyParticipants);
            _promoteList(t.waitlist);
            t.standbyParticipants = [];
            t.waitlist = [];
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

window._handleClosureOption = function (tId, option) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t) return;

    if (option === 'just_close') {
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
        if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
            window.FirestoreDB.saveTournament(t).then(function() {
                var container = document.getElementById('view-container');
                if (container) renderTournaments(container, String(tId));
                if (document.getElementById('closure-panel')) document.getElementById('closure-panel').remove();
            }).catch(function(err) { window._error('_handleClosureOption error:', err); });
        }
    }
};
// ─── Anonymous Simulation Previews ───
window.showResolutionSimulationPanel = function (tId, option) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;
    const info = window.checkPowerOf2(t);

    const existing = document.getElementById('simulation-panel');
    if (existing) existing.remove();

    // Hide the resolution panel behind to prevent flickering from dual backdrop-filters
    var _resPanelBehind = document.getElementById('p2-resolution-panel') || document.getElementById('unified-resolution-panel');
    if (_resPanelBehind) _resPanelBehind.style.display = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'simulation-panel';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.95);z-index:999999;display:flex;align-items:center;justify-content:center;padding:1rem 0;';
    document.body.style.overflow = 'hidden';

    let simulationHtml = '';
    if (option === 'bye') {
        const teamSize = parseInt(t.teamSize) || 1;
        const isTeam = teamSize > 1;
        const totalSpots = info.hi;
        const byes = info.missing;
        const activeTeams = info.count;
        const realMatchesR1 = activeTeams - byes; // participants that actually play in R1 = count - byes; matches = that / 2
        const realMatchesR1Count = realMatchesR1 / 2;
        const matchesR2 = totalSpots / 4; // R2 is power-of-2 bracket

        // Anonymous label helper
        const _tLabel = isTeam ? _t('predraw.simTeam') : _t('predraw.simParticipant');
        const _byeLabel = function(num) {
            if (isTeam) {
                var members = [];
                for (var _m = 0; _m < teamSize; _m++) members.push(_t('predraw.simPlayer') + ' ' + ((num - 1) * teamSize + _m + 1));
                return '<span style="font-size:0.85rem;font-weight:700;color:#e2e8f0;">' + _tLabel + ' ' + num + '</span><span style="font-size:0.7rem;color:#94a3b8;margin-left:6px;">(' + members.join(', ') + ')</span>';
            }
            return '<span style="font-size:0.85rem;font-weight:700;color:#e2e8f0;">' + _tLabel + ' ' + num + '</span>';
        };

        // R1: only real matches (participant vs participant)
        let _pNum = 0;
        let r1Html = '';
        for (var _ri = 0; _ri < realMatchesR1Count; _ri++) {
            var _a = ++_pNum;
            var _b = ++_pNum;
            r1Html += '<div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);margin-bottom:10px;">' +
                '<div style="font-size:0.65rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06);">' + _t('predraw.simMatch') + ' ' + (_ri + 1) + '</div>' +
                '<div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid rgba(96,165,250,0.4);margin-bottom:4px;">' + _byeLabel(_a) + '</div>' +
                '<div style="text-align:center;font-size:0.6rem;color:#64748b;font-weight:800;letter-spacing:2px;padding:2px 0;">VS</div>' +
                '<div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid rgba(96,165,250,0.4);">' + _byeLabel(_b) + '</div>' +
            '</div>';
        }

        // R2: build matchups — BYE winners (already placed) + R1 winners
        // In real bracket: BYE winners are spread so they face R1 winners
        // BYE participants numbered after R1 participants
        let r2Html = '';
        let _byeNum = 0;
        let _r1MatchNum = 0;
        for (var _r2i = 0; _r2i < matchesR2; _r2i++) {
            var slot1 = '';
            var slot2 = '';
            var slot1Color = '';
            var slot2Color = '';
            var hasByeSlot = false;

            if (_r1MatchNum < realMatchesR1Count && _byeNum < byes) {
                // Cross: R1 winner vs BYE winner
                _r1MatchNum++;
                _byeNum++;
                var _byePart = _pNum + _byeNum;
                slot1 = _t('predraw.simWinnerOfMatch') + ' ' + _r1MatchNum;
                slot1Color = 'rgba(96,165,250,0.4)';
                slot2 = _byeLabel(_byePart);
                slot2Color = 'rgba(34,197,94,0.4)';
                hasByeSlot = true;
            } else if (_r1MatchNum < realMatchesR1Count) {
                // Two R1 winners
                var _w1 = ++_r1MatchNum;
                var _w2 = ++_r1MatchNum;
                slot1 = _t('predraw.simWinnerOfMatch') + ' ' + _w1;
                slot1Color = 'rgba(96,165,250,0.4)';
                slot2 = _t('predraw.simWinnerOfMatch') + ' ' + _w2;
                slot2Color = 'rgba(96,165,250,0.4)';
            } else {
                // Two BYE winners
                _byeNum++;
                var _bp1 = _pNum + _byeNum;
                _byeNum++;
                var _bp2 = _pNum + _byeNum;
                slot1 = _byeLabel(_bp1);
                slot1Color = 'rgba(34,197,94,0.4)';
                slot2 = _byeLabel(_bp2);
                slot2Color = 'rgba(34,197,94,0.4)';
                hasByeSlot = true;
            }

            var _byeBadge = hasByeSlot ? '<span style="font-size:0.55rem;font-weight:800;color:#4ade80;background:rgba(34,197,94,0.15);padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">BYE</span>' : '';
            r2Html += '<div style="background:rgba(15,23,42,0.8);border:1px solid ' + (hasByeSlot ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)') + ';border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);margin-bottom:10px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06);">' +
                    '<span style="font-size:0.65rem;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:1px;">' + _t('predraw.simR2Match') + ' ' + (_r2i + 1) + '</span>' +
                    _byeBadge +
                '</div>' +
                '<div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid ' + slot1Color + ';margin-bottom:4px;">' +
                    '<span style="font-weight:600;font-size:0.85rem;color:#e2e8f0;">' + slot1 + '</span>' +
                '</div>' +
                '<div style="text-align:center;font-size:0.6rem;color:#64748b;font-weight:800;letter-spacing:2px;padding:2px 0;">VS</div>' +
                '<div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid ' + slot2Color + ';">' +
                    '<span style="font-weight:600;font-size:0.85rem;color:#e2e8f0;">' + slot2 + '</span>' +
                '</div>' +
            '</div>';
        }

        var _byeUnitLabel = isTeam ? _t('predraw.unitTeams') : _t('predraw.unitParticipants');
        var _byeGameRealLabel = realMatchesR1Count === 1 ? _t('predraw.simByeGameReal') : _t('predraw.simByeGamesReal');
        var _byeRestSeq = matchesR2 >= 4 ? ' → ' + (matchesR2 / 4) : '';
        simulationHtml = `
            <div style="text-align:center;margin-bottom:2rem;">
                <span style="font-size:3rem;display:block;margin-bottom:1rem;">🥇</span>
                <h3 style="color:white;font-size:1.5rem;font-weight:900;margin:0;">${_t('predraw.simByeTitle')}</h3>
                <p style="color:#94a3b8;margin:8px 0 0;">${_t('predraw.simByeSubtitle', {n: totalSpots, b: byes, unit: _byeUnitLabel})}</p>
            </div>

            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:1.5rem;margin-bottom:2rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;text-align:center;">
                    <div style="background:rgba(96,165,250,0.1);padding:0.8rem 0.5rem;border-radius:16px;border:1px solid rgba(96,165,250,0.2);">
                        <div style="font-size:1.5rem;font-weight:900;color:#60a5fa;">${realMatchesR1Count}</div>
                        <div style="font-size:0.65rem;color:#93c5fd;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:4px;">${_t('predraw.simByeR1Matches')}</div>
                    </div>
                    <div style="background:rgba(34,197,94,0.1);padding:0.8rem 0.5rem;border-radius:16px;border:1px solid rgba(34,197,94,0.2);">
                        <div style="font-size:1.5rem;font-weight:900;color:#4ade80;">${byes}</div>
                        <div style="font-size:0.65rem;color:#86efac;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:4px;">${_t('predraw.simByeByes')}</div>
                    </div>
                    <div style="background:rgba(139,92,246,0.1);padding:0.8rem 0.5rem;border-radius:16px;border:1px solid rgba(139,92,246,0.2);">
                        <div style="font-size:1.5rem;font-weight:900;color:#a78bfa;">${matchesR2}</div>
                        <div style="font-size:0.65rem;color:#c4b5fd;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:4px;">${_t('predraw.simByeR2Matches')}</div>
                    </div>
                </div>
            </div>

            <div style="max-height:500px;overflow-y:auto;padding-right:10px;padding-bottom:1rem;">
                <h4 style="color:#38bdf8;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0 0 1rem;">${_t('predraw.simByeR1Header', {n: realMatchesR1Count, jogo: _byeGameRealLabel})}</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${r1Html}
                </div>

                <div style="text-align:center;margin:1.5rem 0;padding:10px;background:rgba(255,255,255,0.02);border-radius:12px;">
                    <div style="font-size:0.7rem;color:#60a5fa;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${_t('predraw.simByeWinnersR2', {n: realMatchesR1Count})}</div>
                    <div style="font-size:0.7rem;color:#4ade80;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-top:4px;">${_t('predraw.simByeByesToR2', {n: byes})}</div>
                </div>

                <h4 style="color:#a78bfa;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0 0 1rem;">${_t('predraw.simByeR2Header', {n: matchesR2})}</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${r2Html}
                </div>

                <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:12px;margin-top:1rem;">
                    <div style="font-size:0.75rem;color:#86efac;line-height:1.5;">${_t('predraw.simByeFooter', {m: matchesR2, m2: (matchesR2 / 2), rest: _byeRestSeq})}</div>
                </div>
            </div>
        `;
    } else if (option === 'playin') {
        const teamSize = parseInt(t.teamSize) || 1;
        const totalTeams = info.count;
        const tLabel = (num) => teamSize > 1 ? (_t('predraw.simTeam') + ' ' + num) : (_t('predraw.simParticipant') + ' ' + num);

        // v1.0.65-beta: Play-in reescrito conforme spec do user.
        // Algoritmo:
        // 1. Se # times é ímpar → 1 BYE forçado (auto-win, conta como winner)
        // 2. R1: (times - byes) / 2 jogos. Quem joga determina o R1.
        // 3. winners_total = R1 winners + BYE auto = playing/2 + (1 se ímpar else 0)
        // 4. bracket = próxima P2 ≥ winners_total
        // 5. excess = bracket - winners_total
        // 6. excess melhores derrotados completam o bracket (SEM jogos extras —
        //    seleção direta por critério de score margin / tiebreaker)
        //
        // Validação:
        //   N=14 (7 times, ímpar): 1 BYE + 6 jogam (3 jogos) → 4 winners → bracket=4 → excess=0
        //   N=20 (10 times, par): 10 jogam (5 jogos) → 5 winners → bracket=8 → excess=3
        //   N=50 (25 times, ímpar): 1 BYE + 24 jogam (12 jogos) → 13 winners → bracket=16 → excess=3
        const isOdd = totalTeams % 2 === 1;
        const numByes = isOdd ? 1 : 0;
        const playing = totalTeams - numByes;
        const matchesR1 = playing / 2;
        const winnersR1 = matchesR1; // R1 jogadores que vencem
        const totalAdvancing = winnersR1 + numByes; // winners + BYE auto
        const losersR1 = matchesR1;
        let bracketSize = 1;
        while (bracketSize < totalAdvancing) bracketSize *= 2;
        const excess = bracketSize - totalAdvancing;
        const matchesR2 = bracketSize / 2;
        // Compat com código abaixo (R2 cards builder usa esses nomes)
        const r2Target = bracketSize;
        const spotsFromRepechage = excess;
        const repechageMatches = 0; // sem jogos de repescagem
        const repechageWinners = excess; // melhores losers selecionados direto
        const tiebreakSpots = 0; // sem tiebreaker — só seleção

        // Match card builder
        const matchCard = (header, headerColor, borderColor, num, t1, t2, t1Color, t2Color) => `
            <div style="background:rgba(15,23,42,0.8);border:1px solid ${borderColor};border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);margin-bottom:10px;">
                <div style="font-size:0.65rem;font-weight:700;color:${headerColor};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06);">${header} ${num}</div>
                <div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid ${t1Color};margin-bottom:4px;">
                    <span style="font-weight:600;font-size:0.85rem;color:#e2e8f0;">${t1}</span>
                </div>
                <div style="text-align:center;font-size:0.6rem;color:#64748b;font-weight:800;letter-spacing:2px;padding:2px 0;">VS</div>
                <div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid ${t2Color};">
                    <span style="font-weight:600;font-size:0.85rem;color:#e2e8f0;">${t2}</span>
                </div>
            </div>`;

        // R1 cards — all teams play
        let r1Html = '';
        for (let i = 0; i < matchesR1; i++) {
            r1Html += matchCard(_t('predraw.simMatch'), '#38bdf8', 'rgba(255,255,255,0.08)',
                i + 1, tLabel((i * 2) + 1), tLabel((i * 2) + 2),
                'rgba(16,185,129,0.4)', 'rgba(239,68,68,0.4)');
        }

        // v1.0.65-beta: SEM jogos de repescagem. Os melhores derrotados são
        // selecionados direto por critério (score margin/tiebreaker).
        let repHtml = '';

        // R2 cards — CROSS-SEEDING: pair R1 winners vs repechage classified
        // For fairness, each R2 match should pit a direct qualifier (R1 winner)
        // against a repechage qualifier whenever possible.
        // v1.0.71-beta: pareamento sequencial conforme spec do user.
        // Vencedor 1 vs Vencedor 2, Vencedor 3 vs Vencedor 4, ...
        // Melhores derrotados preenchem em sequência.
        // BYE sempre na ÚLTIMA posição.
        let r2Html = '';
        let r2Slots = []; // build slot pairs first
        let allSlots = [];
        for (let i = 1; i <= winnersR1; i++) {
            allSlots.push({ name: _t('predraw.simWinnerOfMatch') + ' ' + i, color: 'rgba(16,185,129,0.4)', isRep: false });
        }
        for (let i = 1; i <= spotsFromRepechage; i++) {
            allSlots.push({ name: 'Melhor derrotado ' + i, color: 'rgba(167,139,250,0.4)', isRep: true });
        }
        // BYE no final
        if (numByes > 0) {
            allSlots.push({ name: 'BYE auto', color: 'rgba(245,158,11,0.4)', isRep: false });
        }
        // Pareamento sequencial (1,2), (3,4), ...
        while (allSlots.length >= 2) {
            r2Slots.push([allSlots.shift(), allSlots.shift()]);
        }
        for (let i = 0; i < r2Slots.length; i++) {
            let s1 = r2Slots[i][0];
            let s2 = r2Slots[i][1];
            let crossBadge = (s1.isRep !== s2.isRep) ? '<span style="position:absolute;top:6px;right:8px;font-size:0.55rem;font-weight:800;color:#fbbf24;background:rgba(245,158,11,0.12);padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">' + _t('predraw.simCrossSeed') + '</span>' : '';
            r2Html += `
            <div style="position:relative;background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);margin-bottom:10px;">
                ${crossBadge}
                <div style="font-size:0.65rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06);">${_t('predraw.simR2Match')} ${i + 1}</div>
                <div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid ${s1.color};margin-bottom:4px;">
                    <span style="font-weight:600;font-size:0.85rem;color:${s1.isRep ? '#a78bfa' : '#e2e8f0'};${s1.isRep ? 'font-style:italic;' : ''}">${s1.name}</span>
                </div>
                <div style="text-align:center;font-size:0.6rem;color:#64748b;font-weight:800;letter-spacing:2px;padding:2px 0;">VS</div>
                <div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid ${s2.color};">
                    <span style="font-weight:600;font-size:0.85rem;color:${s2.isRep ? '#a78bfa' : '#e2e8f0'};${s2.isRep ? 'font-style:italic;' : ''}">${s2.name}</span>
                </div>
            </div>`;
        }

        // Tiebreaker note
        const tiebreakNote = tiebreakSpots > 0
            ? `<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:12px;margin-top:1rem;">
                <div style="font-size:0.78rem;color:#fbbf24;font-weight:700;margin-bottom:4px;">${_t('predraw.simTiebreakTitle')}</div>
                <div style="font-size:0.75rem;color:#94a3b8;line-height:1.5;">${_t('predraw.simTiebreakDesc', {w: repechageWinners, n: tiebreakSpots})}</div>
               </div>`
            : `<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:12px;padding:12px;margin-top:1rem;">
                <div style="font-size:0.75rem;color:#86efac;line-height:1.5;">${_t('predraw.simAllRepAdvance', {n: spotsFromRepechage})}</div>
               </div>`;

        // v1.0.65-beta: layout reescrito pra spec do user.
        var _playinUnitStat = teamSize > 1 ? _t('predraw.simStatTeams') : _t('predraw.simStatParticipants');
        var _byeNotice = isOdd
            ? `<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:10px 14px;margin-bottom:1.25rem;display:flex;align-items:center;gap:10px;">
                  <span style="font-size:1.1rem;">⚠️</span>
                  <span style="font-size:0.78rem;color:#fbbf24;font-weight:600;">Número ímpar — 1 BYE forçado (auto-avança pra próxima rodada)</span>
               </div>`
            : '';
        var _excessNotice = excess > 0
            ? `<div style="background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.25);border-radius:12px;padding:10px 14px;margin:1rem 0 1.25rem;">
                  <div style="font-size:0.72rem;color:#a78bfa;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">📊 Repescagem por seleção</div>
                  <div style="font-size:0.78rem;color:#cbd5e1;line-height:1.5;">Os <b style="color:#a78bfa;">${excess} melhores derrotados</b> da R1 (por menor margem de derrota) completam o bracket — sem jogos extras.</div>
               </div>`
            : `<div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:12px;padding:10px 14px;margin:1rem 0 1.25rem;">
                  <div style="font-size:0.78rem;color:#4ade80;font-weight:700;">✓ Todos os ${totalAdvancing} avançam direto pra rodada 2</div>
               </div>`;
        simulationHtml = `
            <div style="text-align:center;margin-bottom:1.5rem;">
                <span style="font-size:3rem;display:block;margin-bottom:0.75rem;">🔁</span>
                <h3 style="color:white;font-size:1.4rem;font-weight:900;margin:0;">${_t('predraw.simPlayinTitle')}</h3>
                <p style="color:#94a3b8;margin:6px 0 0;font-size:0.82rem;">Chaveamento de ${bracketSize} times na rodada 2</p>
            </div>

            ${_byeNotice}

            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:1rem;margin-bottom:1.25rem;">
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center;">
                    <div style="background:rgba(34,197,94,0.1);padding:0.7rem 0.4rem;border-radius:14px;border:1px solid rgba(34,197,94,0.2);">
                        <div style="font-size:1.3rem;font-weight:900;color:#4ade80;">${totalTeams}</div>
                        <div style="font-size:0.6rem;color:#86efac;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">${_playinUnitStat}</div>
                    </div>
                    <div style="background:rgba(96,165,250,0.1);padding:0.7rem 0.4rem;border-radius:14px;border:1px solid rgba(96,165,250,0.2);">
                        <div style="font-size:1.3rem;font-weight:900;color:#60a5fa;">${matchesR1}</div>
                        <div style="font-size:0.6rem;color:#93c5fd;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">Jogos R1</div>
                    </div>
                    <div style="background:rgba(34,197,94,0.1);padding:0.7rem 0.4rem;border-radius:14px;border:1px solid rgba(34,197,94,0.2);">
                        <div style="font-size:1.3rem;font-weight:900;color:#4ade80;">${totalAdvancing}</div>
                        <div style="font-size:0.6rem;color:#86efac;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">Avançam${isOdd ? ` (${winnersR1}V + 1B)` : ''}</div>
                    </div>
                    <div style="background:rgba(167,139,250,0.1);padding:0.7rem 0.4rem;border-radius:14px;border:1px solid rgba(167,139,250,0.2);">
                        <div style="font-size:1.3rem;font-weight:900;color:#a78bfa;">${excess}</div>
                        <div style="font-size:0.6rem;color:#a78bfa;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">Repescados</div>
                    </div>
                </div>
            </div>

            <div style="max-height:500px;overflow-y:auto;padding-right:10px;padding-bottom:1rem;">
                <h4 style="color:#38bdf8;font-size:0.72rem;text-transform:uppercase;letter-spacing:2px;margin:0 0 0.75rem;">R1 — ${matchesR1} ${matchesR1 === 1 ? 'jogo' : 'jogos'}${isOdd ? ' + 1 BYE' : ''}</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${r1Html}
                </div>

                ${_excessNotice}

                <h4 style="color:#38bdf8;font-size:0.72rem;text-transform:uppercase;letter-spacing:2px;margin:1rem 0 0.75rem;">Bracket — ${bracketSize} times · ${matchesR2} ${matchesR2 === 1 ? 'jogo' : 'jogos'} R1 do bracket</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${r2Html}
                </div>
            </div>
        `;
    } else if (option === 'standby') {
        const teamSize = parseInt(t.teamSize) || 1;
        // info.lo and info.excess are already team counts (not individual players)
        const teamsKept = info.lo;
        const teamsMoved = info.excess;
        const keptPlayers = teamSize > 1 ? teamsKept * teamSize : teamsKept;
        const movedPlayers = teamSize > 1 ? teamsMoved * teamSize : teamsMoved;
        const matchesR1 = teamsKept / 2;

        // Standby mode options — always show (2 options)
        var _standbyTeamsDesc = teamSize > 1 ? _t('predraw.simStandbyModeTeamsDescT', {n: movedPlayers, m: teamsMoved}) : _t('predraw.simStandbyModeTeamsDescI', {n: movedPlayers, m: teamsMoved});
        var _standbyIndivDesc = teamSize > 1 ? _t('predraw.simStandbyModeIndivDescT') : _t('predraw.simStandbyModeIndivDescI');
        const standbyModeOptions = `
            <div style="margin-bottom:1.5rem;">
                <h4 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0 0 1rem;">${_t('predraw.simStandbyModeHeader')}</h4>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <label id="standby-opt-teams" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.4);border-radius:12px;padding:12px;transition:all 0.2s;" onclick="document.getElementById('standby-mode-teams').checked=true;window._updateStandbySimViz('teams')">
                        <input type="radio" name="standby-mode" id="standby-mode-teams" value="teams" checked style="margin-top:3px;accent-color:#f59e0b;flex-shrink:0;" />
                        <div>
                            <div style="color:#e2e8f0;font-weight:700;font-size:0.9rem;">${_t('predraw.simStandbyModeTeams')}</div>
                            <div style="color:#64748b;font-size:0.78rem;margin-top:3px;line-height:1.4;">${_standbyTeamsDesc}</div>
                        </div>
                    </label>
                    <label id="standby-opt-individual" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;background:rgba(255,255,255,0.03);border:2px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;transition:all 0.2s;" onclick="document.getElementById('standby-mode-individual').checked=true;window._updateStandbySimViz('individual')">
                        <input type="radio" name="standby-mode" id="standby-mode-individual" value="individual" style="margin-top:3px;accent-color:#f59e0b;flex-shrink:0;" />
                        <div>
                            <div style="color:#e2e8f0;font-weight:700;font-size:0.9rem;">${_t('predraw.simStandbyModeIndiv')}</div>
                            <div style="color:#64748b;font-size:0.78rem;margin-top:3px;line-height:1.4;">${_standbyIndivDesc}</div>
                        </div>
                    </label>
                </div>
            </div>
        `;

        // v2.1.27: QUEM vai para a lista de espera — últimos a se inscrever (padrão)
        // ou sorteio livre entre todos. Não há BYE: a sobra inteira vai pra espera.
        const standbyPickOptions = `
            <div style="margin-bottom:1.5rem;">
                <h4 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0 0 1rem;">📋 Quem vai para a lista de espera?</h4>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <label id="standby-pick-last" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;background:rgba(245,158,11,0.08);border:2px solid rgba(245,158,11,0.4);border-radius:12px;padding:12px;transition:all 0.2s;" onclick="document.getElementById('standby-pick-last-rb').checked=true;window._updateStandbyPickViz('last')">
                        <input type="radio" name="standby-pick" id="standby-pick-last-rb" value="last" checked style="margin-top:3px;accent-color:#f59e0b;flex-shrink:0;" />
                        <div>
                            <div style="color:#e2e8f0;font-weight:700;font-size:0.9rem;">Os últimos a se inscrever</div>
                            <div style="color:#64748b;font-size:0.78rem;margin-top:3px;line-height:1.4;">Quem entrou por último na inscrição é quem espera. Os primeiros já entram na chave.</div>
                        </div>
                    </label>
                    <label id="standby-pick-random" style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;background:rgba(255,255,255,0.03);border:2px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;transition:all 0.2s;" onclick="document.getElementById('standby-pick-random-rb').checked=true;window._updateStandbyPickViz('random')">
                        <input type="radio" name="standby-pick" id="standby-pick-random-rb" value="random" style="margin-top:3px;accent-color:#f59e0b;flex-shrink:0;" />
                        <div>
                            <div style="color:#e2e8f0;font-weight:700;font-size:0.9rem;">Sorteio livre entre todos</div>
                            <div style="color:#64748b;font-size:0.78rem;margin-top:3px;line-height:1.4;">Um sorteio aleatório entre todos os inscritos decide quem vai para a espera.</div>
                        </div>
                    </label>
                </div>
            </div>
        `;
        window._updateStandbyPickViz = function(pick) {
            var lastOpt = document.getElementById('standby-pick-last');
            var randOpt = document.getElementById('standby-pick-random');
            if (lastOpt) { lastOpt.style.background = pick === 'last' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)'; lastOpt.style.borderColor = pick === 'last' ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'; }
            if (randOpt) { randOpt.style.background = pick === 'random' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)'; randOpt.style.borderColor = pick === 'random' ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'; }
        };

        // Build match card with optional yellow accent for standby entries
        const matchCardTeams = (num, t1, t2) => `
            <div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);margin-bottom:10px;">
                <div style="font-size:0.65rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06);">${_t('predraw.simMatch')} ${num}</div>
                <div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid rgba(16,185,129,0.4);margin-bottom:4px;">
                    <span style="font-weight:600;font-size:0.85rem;color:#e2e8f0;">${t1}</span>
                </div>
                <div style="text-align:center;font-size:0.6rem;color:#64748b;font-weight:800;letter-spacing:2px;padding:2px 0;">VS</div>
                <div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid rgba(239,68,68,0.4);">
                    <span style="font-weight:600;font-size:0.85rem;color:#e2e8f0;">${t2}</span>
                </div>
            </div>`;

        // Store params for dynamic viz update
        window._standbySimParams = { teamsKept, teamsMoved, matchesR1, teamSize, movedPlayers, keptPlayers };

        // Function to build viz HTML based on mode
        window._buildStandbyVizHtml = function(mode) {
            const p = window._standbySimParams;
            const tl = (num) => p.teamSize > 1 ? (_t('predraw.simTeam') + ' ' + num) : (_t('predraw.simPlayer') + ' ' + num);

            if (mode === 'teams') {
                // TEAMS MODE: show match cards + standby as formed teams with yellow accent
                let matchesHtml = '';
                for (let i = 0; i < p.matchesR1; i++) {
                    matchesHtml += matchCardTeams(i + 1, tl((i * 2) + 1), tl((i * 2) + 2));
                }

                let standbyTeamsHtml = '';
                for (let i = 0; i < p.teamsMoved; i++) {
                    const teamNum = p.teamsKept + i + 1;
                    const members = p.teamSize > 1
                        ? Array.from({length: p.teamSize}, (_, mi) => _t('predraw.simPlayer') + ' ' + (p.keptPlayers + (i * p.teamSize) + mi + 1)).join(', ')
                        : '';
                    standbyTeamsHtml += '<div style="background:rgba(15,23,42,0.8);border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);margin-bottom:10px;">' +
                        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:' + (members ? '6px' : '0') + ';">' +
                            '<span style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:900;color:#000;flex-shrink:0;">' + (i + 1) + '</span>' +
                            '<span style="font-weight:700;font-size:0.88rem;color:#fbbf24;">' + tl(teamNum) + '</span>' +
                            '<span style="margin-left:auto;font-size:0.6rem;font-weight:800;color:#f59e0b;text-transform:uppercase;background:rgba(245,158,11,0.15);padding:2px 8px;border-radius:6px;">' + _t('predraw.simStandbyBadge') + '</span>' +
                        '</div>' +
                        (members ? '<div style="font-size:0.72rem;color:#94a3b8;padding-left:34px;line-height:1.5;">' + members + '</div>' : '') +
                    '</div>';
                }

                return '<h4 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0 0 1rem;">' + _t('predraw.simStandbyR1Header') + '</h4>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + matchesHtml + '</div>' +
                    '<h4 style="color:#f59e0b;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:1.5rem 0 1rem;">' + (p.teamSize > 1 ? _t('predraw.simStandbyListHeaderTeams', {t: p.teamsMoved, p: p.movedPlayers}) : _t('predraw.simStandbyListHeaderIndiv', {p: p.movedPlayers})) + '</h4>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + standbyTeamsHtml + '</div>';

            } else {
                // INDIVIDUAL MODE: same match cards but standby shown as individual players with yellow accent
                let matchesHtml = '';
                for (let i = 0; i < p.matchesR1; i++) {
                    matchesHtml += matchCardTeams(i + 1, tl((i * 2) + 1), tl((i * 2) + 2));
                }

                let standbyIndivHtml = '';
                for (let i = 0; i < p.movedPlayers; i++) {
                    const playerNum = p.keptPlayers + i + 1;
                    standbyIndivHtml += '<div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:8px 14px;display:flex;align-items:center;gap:8px;">' +
                        '<span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:900;color:#000;flex-shrink:0;">' + (i + 1) + '</span>' +
                        '<span style="font-size:0.82rem;font-weight:700;color:#fbbf24;">' + _t('predraw.simPlayer') + ' ' + playerNum + '</span>' +
                    '</div>';
                }

                return '<h4 style="color:#94a3b8;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0 0 1rem;">' + _t('predraw.simStandbyR1Header') + '</h4>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + matchesHtml + '</div>' +
                    '<h4 style="color:#f59e0b;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:1.5rem 0 1rem;">' + _t('predraw.simStandbyListHeaderIndiv', {p: p.movedPlayers}) + '</h4>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + standbyIndivHtml + '</div>';
            }
        };

        // Dynamic update function for when radio buttons change
        window._updateStandbySimViz = function(mode) {
            const p = window._standbySimParams;
            const vizContainer = document.getElementById('standby-sim-viz');
            if (vizContainer) {
                vizContainer.innerHTML = window._buildStandbyVizHtml(mode);
            }
            // Update stat card and subtitle based on mode
            const statCount = document.getElementById('standby-stat-count');
            const statLabel = document.getElementById('standby-stat-label');
            const subtitle = document.getElementById('standby-subtitle-count');
            if (mode === 'individual') {
                if (statCount) statCount.textContent = p.movedPlayers;
                if (statLabel) statLabel.textContent = _t('predraw.waitingPlayers');
                if (subtitle) subtitle.textContent = _t('predraw.simStandbySubtitleIndiv', {m: p.movedPlayers});
            } else {
                if (statCount) statCount.textContent = p.teamsMoved;
                if (statLabel) statLabel.textContent = _t('predraw.simStandbyWaiting', {unit: (p.teamSize > 1 ? _t('predraw.simStatTeams') : _t('predraw.simStatParticipants'))});
                if (subtitle) subtitle.textContent = p.teamSize > 1 ? _t('predraw.simStandbySubtitleTeams', {m: p.teamsMoved}) : _t('predraw.simStandbySubtitleIndiv', {m: p.teamsMoved});
            }
            // Update option card styling
            const teamsOpt = document.getElementById('standby-opt-teams');
            const indivOpt = document.getElementById('standby-opt-individual');
            if (teamsOpt) {
                teamsOpt.style.background = mode === 'teams' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)';
                teamsOpt.style.borderColor = mode === 'teams' ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)';
            }
            if (indivOpt) {
                indivOpt.style.background = mode === 'individual' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)';
                indivOpt.style.borderColor = mode === 'individual' ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)';
            }
        };

        var _stUnit = teamSize > 1 ? _t('predraw.unitTeams') : _t('predraw.simStandbyPlayersWaitingLabel');
        var _stPlayersParen = teamSize > 1 ? ' (' + keptPlayers + ' ' + _t('predraw.simStandbyPlayersWaitingLabel') + ')' : '';
        var _stStandbyCountFmt = teamSize > 1 ? _t('predraw.simStandbySubtitleTeams', {m: teamsMoved}) : _t('predraw.simStandbySubtitleIndiv', {m: teamsMoved});
        var _stInBracket = teamSize > 1 ? _t('predraw.simStandbyInBracket', {unit: _t('predraw.simStatTeams')}) : _t('predraw.simStandbyInBracket', {unit: _t('predraw.simStatParticipants')});
        var _stWaiting = teamSize > 1 ? _t('predraw.simStandbyWaiting', {unit: _t('predraw.simStatTeams')}) : _t('predraw.simStandbyWaiting', {unit: _t('predraw.simStatParticipants')});
        simulationHtml = `
            <div style="text-align:center;margin-bottom:2rem;">
                <span style="font-size:3rem;display:block;margin-bottom:1rem;">⏳</span>
                <h3 style="color:white;font-size:1.5rem;font-weight:900;margin:0;">${_t('predraw.simStandbyTitle')}</h3>
                <p style="color:#94a3b8;margin:8px 0 0;">${_t('predraw.simStandbyBracketCount', {t: teamsKept, unit: _stUnit, p: _stPlayersParen})}. <span id="standby-subtitle-count">${_stStandbyCountFmt}</span>.</p>
            </div>

            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:1.5rem;margin-bottom:2rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;text-align:center;">
                    <div style="background:rgba(34,197,94,0.1);padding:1rem;border-radius:16px;border:1px solid rgba(34,197,94,0.2);">
                        <div style="font-size:1.5rem;font-weight:900;color:#4ade80;">${teamsKept}</div>
                        <div style="font-size:0.7rem;color:#86efac;text-transform:uppercase;font-weight:800;letter-spacing:1px;margin-top:4px;">${_stInBracket}</div>
                    </div>
                    <div style="background:rgba(96,165,250,0.1);padding:1rem;border-radius:16px;border:1px solid rgba(96,165,250,0.2);">
                        <div style="font-size:1.5rem;font-weight:900;color:#60a5fa;">${matchesR1}</div>
                        <div style="font-size:0.7rem;color:#93c5fd;text-transform:uppercase;font-weight:800;letter-spacing:1px;margin-top:4px;">${_t('predraw.simStandbyR1Matches')}</div>
                    </div>
                    <div style="background:rgba(245,158,11,0.1);padding:1rem;border-radius:16px;border:1px solid rgba(245,158,11,0.2);">
                        <div id="standby-stat-count" style="font-size:1.5rem;font-weight:900;color:#f59e0b;">${teamsMoved}</div>
                        <div id="standby-stat-label" style="font-size:0.7rem;color:#fbbf24;text-transform:uppercase;font-weight:800;letter-spacing:1px;margin-top:4px;">${_stWaiting}</div>
                    </div>
                </div>
            </div>

            <div id="standby-sim-viz" style="max-height:500px;overflow-y:auto;padding-right:10px;padding-bottom:1rem;">
                ${window._buildStandbyVizHtml ? window._buildStandbyVizHtml('teams') : ''}
            </div>

            ${standbyPickOptions}
            ${standbyModeOptions}
        `;
    } else if (option === 'swiss') {
        const teamSize = parseInt(t.teamSize) || 1;
        const totalTeams = info.count;
        const targetTeams = info.lo;
        const recRounds = Math.max(2, Math.ceil(Math.log2(totalTeams)));
        const matchesPerRound = Math.floor(totalTeams / 2);
        const tLabel = (num) => teamSize > 1 ? (_t('predraw.simTeam') + ' ' + num) : (_t('predraw.simParticipant') + ' ' + num);
        const teamWord = teamSize > 1 ? _t('predraw.simStatTeams') : _t('predraw.simStatParticipants');

        // ── Generate round options from 2 up to max (capped at recRounds + 2, max 7) ──
        const minRounds = 2;
        const maxRounds = Math.min(recRounds + 2, Math.max(recRounds, 5), totalTeams - 1); // can't have more rounds than n-1
        const roundOptions = [];
        for (let r = minRounds; r <= maxRounds; r++) roundOptions.push(r);

        // ── Nash scoring per round option ──
        // Criteria: precision (more rounds → better classification quality), effort (more rounds → more work),
        //           fairness (more rounds → fairer), speed (fewer rounds → faster tournament)
        const wPrecision = 0.35, wFairness = 0.30, wEffort = 0.20, wSpeed = 0.15;
        let nashScores = {};
        let nashMax = 0, nashMin = 10;
        roundOptions.forEach(function(r) {
            // Precision: how well does r rounds separate N players? log2(N) is ideal minimum
            const idealMin = Math.log2(totalTeams);
            const precisionRaw = Math.min(r / idealMin, 1.5); // caps at 1.5x ideal
            const precision = Math.min(10, precisionRaw * 7); // 0-10 scale
            // Fairness: more rounds = everyone plays more = fairer ranking
            const fairness = Math.min(10, 4 + (r / maxRounds) * 6);
            // Effort: inverse — fewer rounds = less work
            const effort = Math.max(1, 10 - ((r - minRounds) / Math.max(1, maxRounds - minRounds)) * 7);
            // Speed: inverse — fewer rounds = faster
            const speed = Math.max(1, 10 - ((r - minRounds) / Math.max(1, maxRounds - minRounds)) * 8);

            const score = precision * wPrecision + fairness * wFairness + effort * wEffort + speed * wSpeed;
            nashScores[r] = { precision, fairness, effort, speed, total: score };
            if (score > nashMax) nashMax = score;
            if (score < nashMin) nashMin = score;
        });

        const nashRange = nashMax - nashMin || 1;
        // Recommended = highest score (typically near recRounds)
        let bestRounds = recRounds;
        let bestScore = -1;
        roundOptions.forEach(function(r) {
            if (nashScores[r].total > bestScore) { bestScore = nashScores[r].total; bestRounds = r; }
        });

        // Color palette (same as unified panel Nash colors)
        const _swNashPalette = ['#2ABFA3','#4A90D9','#A8D44B','#B3D9F7','#F5D63D','#F5A623','#F5653D','#D62020'];
        const _swSortedRounds = roundOptions.slice().sort(function(a,b) { return nashScores[b].total - nashScores[a].total; });

        function _swNashColor(r) {
            const rank = _swSortedRounds.indexOf(r);
            const color = _swNashPalette[Math.min(rank < 0 ? _swNashPalette.length - 1 : rank, _swNashPalette.length - 1)];
            return { bg: color + '30', border: color + '80', glow: '0 0 12px ' + color + '25', pill: color, pillBg: color + '20' };
        }

        // Save selected rounds to window for confirm
        window._swissSelectedRounds = bestRounds;

        // v1.0.63-beta: time estimation pra cada # de rounds. User pediu:
        // "seria bom na tela de decisão do suiço, termos o tempo estimado
        // para o torneio todo mostrado dinamicamente conforme clica em
        // cada opção". Cálculo: Swiss phase (selectedRounds × matchesPerRound
        // / courts × timePerSlot) + Eliminatória phase (log2(targetTeams)
        // rodadas com decay de partidas/2 por rodada) + 15min de intervalo
        // entre fases. Se gameDuration ou courtCount não estiverem setados,
        // usa defaults (30min, 1 quadra) — banner ainda mostra estimativa.
        function _swissEstimateTime(rounds) {
            var gameDur = parseInt(t.gameDuration) || 30;
            var callTime = parseInt(t.callTime) || 0;
            var warmupTime = parseInt(t.warmupTime) || 0;
            var courts = Math.max(parseInt(t.courtCount) || 1, 1);
            var timePerSlot = gameDur + callTime + warmupTime + 5; // +5 interval entre slots
            var swissTime = 0;
            for (var sr = 0; sr < rounds; sr++) {
                swissTime += Math.ceil(matchesPerRound / courts) * timePerSlot;
            }
            var elimRounds = Math.ceil(Math.log2(Math.max(targetTeams, 2)));
            var elimTime = 0;
            for (var er = 0; er < elimRounds; er++) {
                var mInR = Math.ceil(targetTeams / Math.pow(2, er + 1));
                elimTime += Math.ceil(mInR / courts) * timePerSlot;
            }
            return { swiss: swissTime, elim: elimTime, total: swissTime + elimTime + 15 };
        }
        function _swissFmtDur(min) {
            if (!min || min <= 0) return '—';
            var h = Math.floor(min / 60);
            var m = Math.round(min % 60);
            if (h === 0) return m + 'min';
            if (m === 0) return h + 'h';
            return h + 'h' + (m < 10 ? '0' : '') + m;
        }
        window._swissEstimateTime = _swissEstimateTime;
        window._swissFmtDur = _swissFmtDur;

        // ── Build round option cards ──
        let roundOptionsHtml = '';
        roundOptions.forEach(function(r) {
            const c = _swNashColor(r);
            const normPct = Math.round(((nashScores[r].total - nashMin) / nashRange) * 100);
            const isBest = r === bestRounds;
            const totalMatches = matchesPerRound * r;
            const isSelected = r === bestRounds;

            roundOptionsHtml += '<button data-swiss-rounds="' + r + '" data-swiss-selected="' + (isSelected ? '1' : '0') + '" style="background:' + (isSelected ? 'linear-gradient(135deg,rgba(139,92,246,0.28),rgba(139,92,246,0.12))' : c.bg) + ';border:' + (isSelected ? '3' : '2') + 'px solid ' + (isSelected ? '#a78bfa' : c.border) + ';box-shadow:' + (isSelected ? '0 0 24px rgba(139,92,246,0.65), inset 0 0 12px rgba(139,92,246,0.18)' : c.glow) + ';border-radius:16px;padding:14px 12px;cursor:pointer;transition:all 0.25s;text-align:center;color:#e2e8f0;display:flex;flex-direction:column;gap:4px;position:relative;transform:' + (isSelected ? 'scale(1.04)' : 'scale(1)') + ';" ' +
                'onmouseover="if(this.getAttribute(\'data-swiss-selected\')!==\'1\'){this.style.transform=\'translateY(-2px)\';this.style.filter=\'brightness(1.12)\'}" ' +
                'onmouseout="if(this.getAttribute(\'data-swiss-selected\')!==\'1\'){this.style.transform=\'\';this.style.filter=\'\'}" ' +
                'onclick="window._selectSwissRounds(' + r + ')">' +
                (isBest ? '<div data-swiss-badge="recommended" style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:rgba(34,197,94,0.9);color:white;padding:2px 10px;border-radius:6px;font-size:0.58rem;font-weight:800;text-transform:uppercase;white-space:nowrap;">' + _t('predraw.nashRecommended') + '</div>' : '') +
                (isSelected ? '<div data-swiss-badge="selected" style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:#a78bfa;color:white;padding:2px 10px;border-radius:6px;font-size:0.58rem;font-weight:800;text-transform:uppercase;white-space:nowrap;box-shadow:0 2px 8px rgba(139,92,246,0.5);">' + _t('predraw.nashSelected') + '</div>' : '') +
                '<div style="font-size:1.8rem;font-weight:900;color:#fff;line-height:1;">' + r + '</div>' +
                '<div style="font-size:0.68rem;color:rgba(255,255,255,0.7);font-weight:700;">' + _t('predraw.simSwissRoundsLabel') + '</div>' +
                '<div style="font-size:0.62rem;color:rgba(255,255,255,0.45);margin-top:2px;">' + totalMatches + ' ' + _t('predraw.simSwissMatchesLabel') + '</div>' +
                '<div style="margin-top:auto;padding-top:6px;"><span style="display:inline-block;padding:3px 10px;border-radius:8px;font-size:0.62rem;font-weight:800;background:' + c.pillBg + ';color:' + c.pill + ';">Nash ' + normPct + '%</span></div>' +
            '</button>';
        });

        // ── Build dynamic Nash criteria legend (updates per selected option) ──
        // Store nashScores globally so _selectSwissRounds can access them
        window._swNashScores = nashScores;

        function _buildNashLegend(r) {
            const s = nashScores[r];
            if (!s) return '';
            return '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:1.5rem;">' +
                '<span style="font-size:0.62rem;color:#a78bfa;">' + _t('predraw.simSwissPrecision') + ' <b>' + Math.round(s.precision * 10) + '%</b></span>' +
                '<span style="font-size:0.62rem;color:#4ade80;">' + _t('predraw.simSwissFairness') + ' <b>' + Math.round(s.fairness * 10) + '%</b></span>' +
                '<span style="font-size:0.62rem;color:#f59e0b;">' + _t('predraw.simSwissEffort') + ' <b>' + Math.round(s.effort * 10) + '%</b></span>' +
                '<span style="font-size:0.62rem;color:#60a5fa;">' + _t('predraw.simSwissSpeed') + ' <b>' + Math.round(s.speed * 10) + '%</b></span>' +
            '</div>';
        }
        window._buildSwissNashLegend = _buildNashLegend;

        // ── Function to build simulation preview for selected round count ──
        // (stored globally so _selectSwissRounds can update it)
        window._buildSwissSimPreview = function(selectedRounds) {
            const mpr = matchesPerRound;
            // Swiss round cards
            const swissCard2 = (roundNum, matchNum, t1, t2) =>
                '<div style="background:rgba(15,23,42,0.8);border:1px solid rgba(139,92,246,0.2);border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);">' +
                '<div style="font-size:0.65rem;font-weight:700;color:#a78bfa;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(139,92,246,0.1);">R' + roundNum + ' — ' + _t('predraw.simMatch') + ' ' + matchNum + '</div>' +
                '<div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid rgba(139,92,246,0.4);margin-bottom:4px;">' +
                '<span style="font-weight:600;font-size:0.85rem;color:#e2e8f0;">' + t1 + '</span></div>' +
                '<div style="text-align:center;font-size:0.6rem;color:#64748b;font-weight:800;letter-spacing:2px;padding:2px 0;">VS</div>' +
                '<div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid rgba(139,92,246,0.4);">' +
                '<span style="font-weight:600;font-size:0.85rem;color:#e2e8f0;">' + t2 + '</span></div></div>';

            const elimCard2 = (num, t1, t2) =>
                '<div style="background:rgba(15,23,42,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);">' +
                '<div style="font-size:0.65rem;font-weight:700;color:#38bdf8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.06);">' + _t('predraw.simMatch') + ' ' + num + '</div>' +
                '<div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid rgba(16,185,129,0.4);margin-bottom:4px;">' +
                '<span style="font-weight:600;font-size:0.85rem;color:#4ade80;">' + t1 + '</span></div>' +
                '<div style="text-align:center;font-size:0.6rem;color:#64748b;font-weight:800;letter-spacing:2px;padding:2px 0;">VS</div>' +
                '<div style="padding:6px 8px;border-radius:6px;background:rgba(0,0,0,0.25);border-left:3px solid rgba(239,68,68,0.4);">' +
                '<span style="font-weight:600;font-size:0.85rem;color:#ef4444;">' + t2 + '</span></div></div>';

            let roundsHtml = '';
            for (let r = 0; r < selectedRounds; r++) {
                const showMax = Math.min(mpr, 4);
                let cards = '';
                for (let m = 0; m < showMax; m++) {
                    if (r === 0) cards += swissCard2(r + 1, m + 1, tLabel((m * 2) + 1), tLabel((m * 2) + 2));
                    else cards += swissCard2(r + 1, m + 1, _t('predraw.simSwissNthPlace', {n: (m * 2 + 1)}), _t('predraw.simSwissNthPlace', {n: (m * 2 + 2)}));
                }
                const moreC = mpr - showMax;
                roundsHtml += '<div style="margin-bottom:1.5rem;">' +
                    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:0.75rem;">' +
                    '<span style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#6d28d9);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:900;color:white;flex-shrink:0;">' + (r + 1) + '</span>' +
                    '<span style="font-weight:700;font-size:0.85rem;color:#e2e8f0;">' + _t('predraw.simSwissRoundLabel') + ' ' + (r + 1) + '</span>' +
                    '<span style="margin-left:auto;font-size:0.68rem;color:#64748b;">' + _t('predraw.simSwissMatchesInRound', {n: mpr}) + '</span>' +
                    '<span style="font-size:0.65rem;color:#a78bfa;background:rgba(139,92,246,0.1);padding:2px 8px;border-radius:6px;font-weight:700;">' + (r === 0 ? _t('predraw.simSwissDraw') : _t('predraw.simSwissByScore')) + '</span>' +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + cards + '</div>' +
                    (moreC > 0 ? '<div style="text-align:center;color:#64748b;font-size:0.72rem;margin-top:6px;font-style:italic;">' + _t('predraw.simSwissMoreInRound', {n: moreC}) + '</div>' : '') +
                    '</div>';
            }

            // Elimination phase
            const elimM = targetTeams / 2;
            const showElimMax2 = Math.min(elimM, 4);
            let elimH = '';
            for (let i = 0; i < showElimMax2; i++) elimH += elimCard2(i + 1, _t('predraw.simSwissNthClassified', {n: ((i * 2) + 1)}), _t('predraw.simSwissNthClassified', {n: ((i * 2) + 2)}));
            const moreElim2 = elimM - showElimMax2;

            return '<h4 style="color:#a78bfa;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:0 0 1rem;">' + _t('predraw.simSwissClassPhase', {n: selectedRounds}) + '</h4>' +
                roundsHtml +
                '<div style="text-align:center;margin:0.75rem 0;padding:12px;background:rgba(34,197,94,0.05);border:1px dashed rgba(34,197,94,0.2);border-radius:12px;">' +
                '<div style="font-size:0.72rem;color:#4ade80;font-weight:700;text-transform:uppercase;letter-spacing:1px;">' + _t('predraw.simSwissFinalClass') + '</div>' +
                '<div style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">' + _t('predraw.simSwissTopAdvance', {n: targetTeams}) + '</div></div>' +
                '<h4 style="color:#38bdf8;font-size:0.75rem;text-transform:uppercase;letter-spacing:2px;margin:1rem 0 1rem;">' + _t('predraw.simSwissElimPhase', {n: targetTeams}) + '</h4>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' + elimH + '</div>' +
                (moreElim2 > 0 ? '<div style="text-align:center;color:#64748b;font-size:0.72rem;margin-top:6px;font-style:italic;">' + _t('predraw.simSwissMoreInElim', {n: moreElim2}) + '</div>' : '');
        };

        window._selectSwissRounds = function(r) {
            window._swissSelectedRounds = r;
            // Update button selection styles
            var btns = document.querySelectorAll('[data-swiss-rounds]');
            btns.forEach(function(btn) {
                var br = parseInt(btn.getAttribute('data-swiss-rounds'));
                var c = _swNashColor(br);
                var existingSelectedBadge = btn.querySelector('[data-swiss-badge="selected"]');
                if (br === r) {
                    btn.setAttribute('data-swiss-selected', '1');
                    btn.style.background = 'linear-gradient(135deg,rgba(139,92,246,0.28),rgba(139,92,246,0.12))';
                    btn.style.borderColor = '#a78bfa';
                    btn.style.borderWidth = '3px';
                    btn.style.boxShadow = '0 0 24px rgba(139,92,246,0.65), inset 0 0 12px rgba(139,92,246,0.18)';
                    btn.style.transform = 'scale(1.04)';
                    btn.style.filter = '';
                    if (!existingSelectedBadge) {
                        var badge = document.createElement('div');
                        badge.setAttribute('data-swiss-badge', 'selected');
                        badge.style.cssText = 'position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);background:#a78bfa;color:white;padding:2px 10px;border-radius:6px;font-size:0.58rem;font-weight:800;text-transform:uppercase;white-space:nowrap;box-shadow:0 2px 8px rgba(139,92,246,0.5);';
                        badge.textContent = _t('predraw.nashSelected');
                        btn.appendChild(badge);
                    }
                } else {
                    btn.setAttribute('data-swiss-selected', '0');
                    btn.style.background = c.bg;
                    btn.style.borderColor = c.border;
                    btn.style.borderWidth = '2px';
                    btn.style.boxShadow = c.glow;
                    btn.style.transform = 'scale(1)';
                    btn.style.filter = '';
                    if (existingSelectedBadge) existingSelectedBadge.remove();
                }
            });
            // Update Nash criteria legend (dynamic per option)
            var legendEl = document.getElementById('swiss-nash-legend');
            if (legendEl && window._buildSwissNashLegend) legendEl.innerHTML = window._buildSwissNashLegend(r);
            // Update simulation preview
            var previewEl = document.getElementById('swiss-sim-preview');
            if (previewEl) previewEl.innerHTML = window._buildSwissSimPreview(r);
            // v1.0.63-beta: update time estimate banner
            try {
                var _est = window._swissEstimateTime(r);
                var _totalEl = document.getElementById('swiss-time-total');
                var _swissEl = document.getElementById('swiss-time-swiss');
                var _elimEl = document.getElementById('swiss-time-elim');
                if (_totalEl) _totalEl.textContent = window._swissFmtDur(_est.total);
                if (_swissEl) _swissEl.textContent = window._swissFmtDur(_est.swiss);
                if (_elimEl) _elimEl.textContent = window._swissFmtDur(_est.elim);
            } catch (_estErr) {}
            // Update summary stats
            var statsEl = document.getElementById('swiss-stats-summary');
            if (statsEl) {
                var tp = matchesPerRound * r;
                statsEl.innerHTML =
                    '<div style="background:rgba(34,197,94,0.1);padding:0.75rem 0.5rem;border-radius:14px;border:1px solid rgba(34,197,94,0.2);">' +
                    '<div style="font-size:1.3rem;font-weight:900;color:#4ade80;">' + totalTeams + '</div>' +
                    '<div style="font-size:0.6rem;color:#86efac;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">' + teamWord + '</div></div>' +
                    '<div style="background:rgba(139,92,246,0.1);padding:0.75rem 0.5rem;border-radius:14px;border:1px solid rgba(139,92,246,0.2);">' +
                    '<div style="font-size:1.3rem;font-weight:900;color:#8b5cf6;">' + r + '</div>' +
                    '<div style="font-size:0.6rem;color:#a78bfa;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">' + _t('predraw.simSwissRoundsCol') + '</div></div>' +
                    '<div style="background:rgba(96,165,250,0.1);padding:0.75rem 0.5rem;border-radius:14px;border:1px solid rgba(96,165,250,0.2);">' +
                    '<div style="font-size:1.3rem;font-weight:900;color:#60a5fa;">' + targetTeams + '</div>' +
                    '<div style="font-size:0.6rem;color:#93c5fd;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">' + _t('predraw.simSwissClassifiedCol') + '</div></div>' +
                    '<div style="background:rgba(245,158,11,0.1);padding:0.75rem 0.5rem;border-radius:14px;border:1px solid rgba(245,158,11,0.2);">' +
                    '<div style="font-size:1.3rem;font-weight:900;color:#f59e0b;">' + tp + '</div>' +
                    '<div style="font-size:0.6rem;color:#fbbf24;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">' + _t('predraw.simSwissMatchesCol') + '</div></div>';
            }
        };

        simulationHtml = `
            <div style="text-align:center;margin-bottom:1.5rem;">
                <span style="font-size:3rem;display:block;margin-bottom:0.75rem;">🏅</span>
                <h3 style="color:white;font-size:1.4rem;font-weight:900;margin:0;">${_t('predraw.simSwissTitle')}</h3>
                <p style="color:#94a3b8;margin:8px 0 0;font-size:0.82rem;">${_t('predraw.simSwissSubtitle')}</p>
            </div>

            <div id="swiss-nash-legend">${_buildNashLegend(bestRounds)}</div>

            <div style="display:grid;grid-template-columns:repeat(${Math.min(roundOptions.length, 4)}, 1fr);gap:10px;margin-bottom:2rem;">
                ${roundOptionsHtml}
            </div>

            <div id="swiss-stats-summary" style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:0.75rem;margin-bottom:1.5rem;">
                <div style="background:rgba(34,197,94,0.1);padding:0.75rem 0.5rem;border-radius:14px;border:1px solid rgba(34,197,94,0.2);">
                    <div style="font-size:1.3rem;font-weight:900;color:#4ade80;">${totalTeams}</div>
                    <div style="font-size:0.6rem;color:#86efac;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">${teamWord}</div>
                </div>
                <div style="background:rgba(139,92,246,0.1);padding:0.75rem 0.5rem;border-radius:14px;border:1px solid rgba(139,92,246,0.2);">
                    <div style="font-size:1.3rem;font-weight:900;color:#8b5cf6;">${bestRounds}</div>
                    <div style="font-size:0.6rem;color:#a78bfa;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">${_t('predraw.simSwissRoundsCol')}</div>
                </div>
                <div style="background:rgba(96,165,250,0.1);padding:0.75rem 0.5rem;border-radius:14px;border:1px solid rgba(96,165,250,0.2);">
                    <div style="font-size:1.3rem;font-weight:900;color:#60a5fa;">${targetTeams}</div>
                    <div style="font-size:0.6rem;color:#93c5fd;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">${_t('predraw.simSwissClassifiedCol')}</div>
                </div>
                <div style="background:rgba(245,158,11,0.1);padding:0.75rem 0.5rem;border-radius:14px;border:1px solid rgba(245,158,11,0.2);">
                    <div style="font-size:1.3rem;font-weight:900;color:#f59e0b;">${matchesPerRound * bestRounds}</div>
                    <div style="font-size:0.6rem;color:#fbbf24;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;margin-top:3px;">${_t('predraw.simSwissMatchesCol')}</div>
                </div>
            </div>

            <div id="swiss-time-estimate" style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);border-radius:14px;padding:12px 14px;margin-bottom:1.5rem;display:flex;align-items:center;gap:14px;">
                <div style="font-size:1.6rem;line-height:1;flex-shrink:0;">⏱️</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.62rem;color:#7dd3fc;text-transform:uppercase;letter-spacing:0.7px;font-weight:800;">Tempo estimado do torneio</div>
                    <div style="font-size:1.15rem;color:#e0f2fe;font-weight:900;line-height:1.2;margin-top:3px;font-variant-numeric:tabular-nums;">
                        <span id="swiss-time-total">${(function(){var e=_swissEstimateTime(bestRounds);return _swissFmtDur(e.total);})()}</span>
                    </div>
                    <div style="font-size:0.7rem;color:#94a3b8;margin-top:4px;line-height:1.3;">
                        Suíço: <span id="swiss-time-swiss" style="color:#a78bfa;font-weight:700;">${(function(){var e=_swissEstimateTime(bestRounds);return _swissFmtDur(e.swiss);})()}</span>
                        · Eliminatória: <span id="swiss-time-elim" style="color:#60a5fa;font-weight:700;">${(function(){var e=_swissEstimateTime(bestRounds);return _swissFmtDur(e.elim);})()}</span>
                        ${(t.gameDuration || t.courtCount) ? '' : '<br><span style="font-size:0.62rem;color:#64748b;font-style:italic;">(usando defaults: 30min/partida, 1 quadra — edite o torneio pra refinar)</span>'}
                    </div>
                </div>
            </div>

            <div id="swiss-sim-preview" style="max-height:400px;overflow-y:auto;padding-right:10px;padding-bottom:1rem;">
                ${window._buildSwissSimPreview(bestRounds)}
            </div>
        `;
    }

    var _tIdSafe2 = String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var _optSafe2 = String(option || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    overlay.innerHTML = `
        <div style="background:#0f172a;width:94%;max-width:600px;border-radius:32px;border:1px solid rgba(255,255,255,0.1);box-shadow:0 50px 150px rgba(0,0,0,0.9);overflow:hidden;animation: modalFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);margin:auto 0;display:flex;flex-direction:column;max-height:95vh;">
            <div style="position:sticky;top:0;z-index:10;background:linear-gradient(135deg,#312e81 0%,#4338ca 50%,#4f46e5 100%);padding:12px 1.5rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);flex-shrink:0;border-radius:32px 32px 0 0;">
                <button onclick="document.getElementById('simulation-panel').remove();document.body.style.overflow=''; var _rp=document.getElementById('p2-resolution-panel')||document.getElementById('unified-resolution-panel'); if(_rp)_rp.style.display='';" style="background:rgba(0,0,0,0.25);color:#c7d2fe;border:2px solid rgba(199,210,254,0.3);padding:8px 20px;border-radius:12px;font-weight:700;font-size:0.85rem;cursor:pointer;transition:all 0.2s;white-space:nowrap;flex-shrink:0;" onmouseover="this.style.background='rgba(0,0,0,0.4)';this.style.borderColor='rgba(199,210,254,0.5)'" onmouseout="this.style.background='rgba(0,0,0,0.25)';this.style.borderColor='rgba(199,210,254,0.3)'">${_t('predraw.backLabel')}</button>
                <button onclick="window._confirmP2Resolution('${_tIdSafe2}', '${_optSafe2}')" style="background:linear-gradient(135deg,#6366f1 0%,#818cf8 100%);color:white;border:none;padding:8px 24px;border-radius:12px;font-weight:700;font-size:0.85rem;cursor:pointer;box-shadow:0 4px 12px rgba(99,102,241,0.3);transition:all 0.2s;white-space:nowrap;flex-shrink:0;" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 16px rgba(99,102,241,0.4)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 12px rgba(99,102,241,0.3)'">${_t('predraw.confirmLabel')}</button>
            </div>
            <div style="padding:2rem 2.5rem 2.5rem;overflow-y:auto;flex:1;">
                ${simulationHtml}
                <p style="margin-top:1rem;text-align:center;color:#64748b;font-size:0.7rem;font-style:italic;">${_t('predraw.simNote')}</p>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};

window._confirmP2Resolution = function (tId, option) {
    // Apply the actual resolution logic here
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
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
        const _vips = t.vips || {};
        // Separar VIPs (protegidos) dos demais
        const vipEntries = [];
        const nonVipEntries = [];
        p.forEach(entry => {
            const nm = typeof entry === 'string' ? entry : (entry.displayName || entry.name || '');
            // VIP se o nome ou qualquer membro do time é VIP
            const members = nm.includes('/') ? nm.split('/').map(n => n.trim()) : [nm];
            const isVip = members.some(m => !!_vips[m]) || !!_vips[nm];
            if (isVip) vipEntries.push(entry);
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
        const _playersOf = (e) => { const nm = typeof e === 'string' ? e : (e.displayName || e.name || ''); return nm.indexOf(' / ') !== -1 ? _ts : 1; };
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
