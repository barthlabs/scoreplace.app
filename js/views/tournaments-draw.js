// tournaments-draw.js — Draw generation & bracket building (extracted from tournaments.js)
(function() {
var _t = window._t || function(k) { return k; };

window.showFinalReviewPanel = function (tId) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;

    const existing = document.getElementById('final-review-panel');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'final-review-panel';
    overlay.style.cssText = 'position:fixed;inset:0;width:100vw;min-height:100vh;min-height:100dvh;background:rgba(0,0,0,0.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:0.75rem;overflow:hidden;';
    document.body.style.overflow = 'hidden';

    const tIdSafe = String(tId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    overlay.innerHTML = `
        <div style="background:var(--bg-card,#1e293b);width:94%;max-width:600px;border-radius:24px;border:1px solid rgba(34,197,94,0.3);box-shadow:0 30px 100px rgba(0,0,0,0.8);overflow:hidden;display:flex;flex-direction:column;max-height:94svh;animation:modalFadeIn 0.3s ease-out;">
            <!-- Header (sticky-like, doesn't scroll) -->
            <div style="background:linear-gradient(135deg,#14532d 0%,#22c55e 100%);padding:1rem 1.25rem;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:1.8rem;">🎉</span>
                    <div>
                        <h3 style="margin:0;color:#f0fdf4;font-size:1.05rem;font-weight:800;letter-spacing:-0.01em;">${_t('tdraw.readyTitle')}</h3>
                        <p style="margin:2px 0 0;color:#bbf7d0;font-size:0.78rem;line-height:1.35;">${_t('tdraw.readySubtitle')}</p>
                    </div>
                </div>
            </div>

            <!-- Scrollable middle -->
            <div style="overflow-y:auto;flex:1;padding:1rem 1.25rem;">
                <!-- Summary Checklist -->
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:1rem;">
                    <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.1);padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.2);">
                        <span style="color:#22c55e;font-size:1.05rem;flex-shrink:0;">✅</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:white;font-size:0.85rem;">${_t('tdraw.enrollClosed')}</div>
                            <div style="font-size:0.7rem;color:#94a3b8;line-height:1.3;">${_t('tdraw.enrollClosedDesc')}</div>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.1);padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.2);">
                        <span style="color:#22c55e;font-size:1.05rem;flex-shrink:0;">✅</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:white;font-size:0.85rem;">${_t('tdraw.teamsConsolidated')}</div>
                            <div style="font-size:0.7rem;color:#94a3b8;line-height:1.3;">${_t('tdraw.teamsConsolidatedDesc')}</div>
                        </div>
                    </div>

                    <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.1);padding:9px 12px;border-radius:10px;border:1px solid rgba(34,197,94,0.2);">
                        <span style="color:#22c55e;font-size:1.05rem;flex-shrink:0;">✅</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:700;color:white;font-size:0.85rem;">${_t('tdraw.bracketStructure')}</div>
                            <div style="font-size:0.7rem;color:#94a3b8;line-height:1.3;">${_t('tdraw.p2AchievedVia', {resolution: window._safeHtml(t.p2Resolution || 'Natural')})}</div>
                        </div>
                    </div>
                </div>

                <!-- History / Log -->
                <div>
                    <h4 style="margin:0 0 6px;color:#94a3b8;font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;">${_t('tdraw.resolutionHistory')}</h4>
                    <div style="background:rgba(0,0,0,0.2);border-radius:12px;padding:0.75rem;max-height:100px;overflow-y:auto;font-family:monospace;font-size:0.72rem;color:#cbd5e1;">
                        ${(t.history || []).slice().reverse().map(log => `
                            <div style="margin-bottom:5px;display:flex;gap:8px;">
                                <span style="color:#64748b;flex-shrink:0;">[${new Date(log.date).toLocaleTimeString()}]</span>
                                <span>${window._safeHtml(log.message)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Sticky footer (always visible) -->
            <div style="padding:0.85rem 1.25rem;border-top:1px solid rgba(255,255,255,0.08);background:var(--bg-card,#1e293b);display:flex;flex-direction:column;gap:8px;flex-shrink:0;">
                <button onclick="window.generateDrawFunction('${tIdSafe}')" style="background:linear-gradient(135deg,#16a34a,#22c55e);color:white;border:none;padding:13px;border-radius:14px;font-weight:800;font-size:1rem;cursor:pointer;box-shadow:0 8px 24px rgba(34,197,94,0.3);display:flex;align-items:center;justify-content:center;gap:8px;">
                    <span>🎲</span> ${_t('tdraw.rollDrawNow')}
                </button>
                <button onclick="document.getElementById('final-review-panel').remove();document.body.style.overflow='';" style="background:rgba(255,255,255,0.05);color:#94a3b8;border:none;padding:10px;border-radius:10px;font-weight:600;font-size:0.85rem;cursor:pointer;">
                    ${_t('tdraw.backAndReview')}
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};


window.generateDrawFunction = function (tId) {
    const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
    if (!t) return;

    // ── Proteção contra re-sorteio acidental ────────────────────────
    var _hasExistingDraw = (Array.isArray(t.matches) && t.matches.length > 0) ||
        (Array.isArray(t.rounds) && t.rounds.length > 0) ||
        (Array.isArray(t.groups) && t.groups.length > 0);
    if (_hasExistingDraw) {
        // Check if any match has a result recorded — use canonical collector
        // so results hiding in t.groups[].matches, t.thirdPlaceMatch, or
        // t.rodadas can't be silently overwritten by a redraw.
        var _hasResults = false;
        if (typeof window._collectAllMatches === 'function') {
            _hasResults = window._collectAllMatches(t).some(function(m) {
                return m && (m.winner || m.score1 || m.score2);
            });
        } else {
            // Defensive fallback: bracket-model.js not loaded.
            if (Array.isArray(t.matches)) {
                _hasResults = t.matches.some(function(m) { return m.winner || m.score1 || m.score2; });
            }
            if (!_hasResults && Array.isArray(t.rounds)) {
                _hasResults = t.rounds.some(function(r) {
                    return (r.matches || []).some(function(m) { return m.winner || m.score1 || m.score2; });
                });
            }
        }
        if (_hasResults) {
            showAlertDialog(_t('draw.alreadyDoneTitle'),
                _t('draw.alreadyDoneMsg'),
                function() {
                    // User confirmed — allow redraw by clearing existing data
                    t.matches = [];
                    t.rounds = [];
                    t.groups = [];
                    t.standings = null;
                    window.generateDrawFunction(tId);
                },
                { type: 'danger', confirmText: _t('draw.alreadyDoneConfirm'), cancelText: _t('btn.cancel') }
            );
            return;
        }
        // Draw exists but no results yet — warn but lighter
        showAlertDialog(_t('draw.redrawTitle'),
            _t('draw.redrawMsg'),
            function() {
                t.matches = [];
                t.rounds = [];
                t.groups = [];
                t.standings = null;
                window.generateDrawFunction(tId);
            },
            { type: 'warning', confirmText: _t('draw.redrawConfirm'), cancelText: _t('draw.redrawCancel') }
        );
        return;
    }

    // Store active tournament ID for views that need it
    window._lastActiveTournamentId = tId;

    // ── Fix orphaned names + Deduplicação de participantes ────
    if (typeof window._fixOrphanedMatchNames === 'function') window._fixOrphanedMatchNames(t);
    if (typeof window._deduplicateParticipants === 'function') {
        var _dupCount = window._deduplicateParticipants(t);
        if (_dupCount > 0) {
            window.FirestoreDB.saveTournament(t);
            showNotification(_t('tdraw.dupsRemoved'), _t('tdraw.dupsRemovedMsg', { n: _dupCount }), 'info');
        }
    }

    // ── Times incompletos: tratados pelo painel unificado (_showRemainderPanel)
    //    chamado via showUnifiedResolutionPanel em _handleSortearClick. Aqui
    //    não precisamos mais interceptar — se chegou até generateDrawFunction,
    //    o organizador já decidiu o que fazer com o resto.

    // ── Verificação de número ímpar (formatos não-eliminatórios, exceto Grupos, Suíço e Liga) ──────
    const isElim = t.format === 'Eliminatórias Simples' || t.format === 'Dupla Eliminatória';
    const isGruposFmt = t.format === 'Fase de Grupos + Eliminatórias' || (t.format || '').indexOf('Grupo') !== -1;
    const isSuicoOrLiga = t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss' || t.currentStage === 'swiss' || (window._isLigaFormat && window._isLigaFormat(t));
    if (!isElim && !isGruposFmt && !isSuicoOrLiga && !t.oddResolution && typeof window.checkOddEntries === 'function') {
        const oddInfo = window.checkOddEntries(t);
        if (oddInfo.isOdd) {
            window.showOddEntriesPanel(tId);
            return;
        }
    }

    // ── Verificação de potência de 2 para eliminatórias (não Grupos) ──────────────
    if (isElim && !isGruposFmt && !t.p2Resolution) {
        const info = window.checkPowerOf2(t);
        if (info.count < 2) {
            const _label = (info.teamSize > 1) ? 'times' : 'participantes';
            showAlertDialog(_t('draw.tooFewTitle'), _t('draw.tooFewDrawMsg', { label: _label }), null, { type: 'warning' });
            return;
        }
        if (!info.isPowerOf2) {
            window.showPowerOf2Panel(tId);
            return;
        }
    }

    // ── Validação: participantes sem categoria (quando torneio tem categorias) ─
    var _tournHasCats = Array.isArray(t.combinedCategories) && t.combinedCategories.length > 0;
    if (_tournHasCats) {
        var _allParts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
        var _noCat = _allParts.filter(function(p) {
            if (typeof p !== 'object') return true;
            var cats = window._getParticipantCategories(p);
            return cats.length === 0;
        });
        if (_noCat.length > 0) {
            var _names = _noCat.map(function(p) {
                return typeof p === 'string' ? p : (p.displayName || p.name || '?');
            }).slice(0, 5).join(', ');
            var _extra = _noCat.length > 5 ? ' e mais ' + (_noCat.length - 5) + '...' : '';
            showAlertDialog(_t('draw.noCatTitle'),
                _t('draw.noCatMsg', { n: _noCat.length, names: _names, extra: _extra }),
                function() {
                    // User chose to proceed anyway — continue draw
                    t._skipCatValidation = true;
                    window.generateDrawFunction(tId);
                },
                { type: 'warning', confirmText: _t('draw.noCatConfirm'), cancelText: _t('btn.back') }
            );
            if (!t._skipCatValidation) return;
            delete t._skipCatValidation;
        }
    }

    // Divulgação sempre imediata a todos
    if (!t.drawVisibility) {
        t.drawVisibility = 'public';
    }

    // ── Liga / Suíço Puro / Ranking: generate first round standings ──────────────────
    // Note: Swiss-as-p2Resolution (t.p2Resolution === 'swiss') is handled separately below
    if ((window._isLigaFormat(t) || t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss') && !t.p2Resolution) {
        let participants = Array.isArray(t.participants) ? [...t.participants] : Object.values(t.participants || {});

        // Shuffle participants
        for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]];
        }

        // Initialize standings (with category if applicable)
        t.standings = participants.map(p => {
            const name = typeof p === 'string' ? p : (p.displayName || p.name || '');
            var entry = { name, points: 0, wins: 0, losses: 0, pointsDiff: 0, played: 0 };
            if (typeof p === 'object') {
                var _pcs = window._getParticipantCategories(p);
                if (_pcs.length > 0) { entry.category = _pcs[0]; entry.categories = _pcs; }
            }
            return entry;
        });
        t.rounds = [];
        t.status = 'active';

        // Generate first round using Swiss pairing (respects categories automatically)
        _generateNextRound(t);

        var _roundMatchCount = (t.rounds[0].matches || []).filter(function(m) { return !m.isSitOut; }).length;
        var _roundSitOuts = (t.rounds[0].matches || []).filter(function(m) { return m.isSitOut; }).length;
        window.AppStore.logAction(tId, `Sorteio Realizado — ${t.format}: Rodada 1 gerada com ${_roundMatchCount} partida(s)` + (_roundSitOuts ? ` e ${_roundSitOuts} folga(s)` : ''));

        if (document.getElementById('final-review-panel')) document.getElementById('final-review-panel').remove(); document.body.style.overflow = '';
        showNotification(_t('tdraw.started'), _t('tdraw.startedMsg', { n: _roundMatchCount }), 'success');

        // Notify all participants — personalized per recipient (shows their match)
        if (typeof window._notifyDrawPersonalized === 'function') {
            window._notifyDrawPersonalized(t, tId);
        }

        // Save immediately to Firestore, then navigate
        window.AppStore.syncImmediate(tId).then(function() {
            // Notify Liga round via WhatsApp (fire-and-forget)
            if (typeof _notifyLigaRoundWhatsApp === 'function') {
                _notifyLigaRoundWhatsApp(t, 0);
            }
            window.location.hash = `#bracket/${tId}`;
        });
        return;
    }

    // ── Rei/Rainha da Praia ──────────────────────────────────────────
    if (t.format === 'Rei/Rainha da Praia') {
        let participants = Array.isArray(t.participants) ? [...t.participants] : Object.values(t.participants || {});
        const getName = (p) => typeof p === 'string' ? p : (p.displayName || p.name || '');

        // Shuffle
        for (let i = participants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [participants[i], participants[j]] = [participants[j], participants[i]];
        }

        if (participants.length < 4) {
            showAlertDialog(_t('monarch.minParticipantsTitle'), _t('monarch.minParticipants'), null, { type: 'warning' });
            return;
        }

        const numGroups = Math.floor(participants.length / 4);
        const remainder = participants.length % 4;
        const groups = [];
        const ts = Date.now();

        for (let g = 0; g < numGroups; g++) {
            const players = [getName(participants[g*4]), getName(participants[g*4+1]), getName(participants[g*4+2]), getName(participants[g*4+3])];
            const [A, B, C, D] = players;
            groups.push({
                name: _t('label.group') + ' ' + String.fromCharCode(65 + g),
                players: players,
                rounds: [{
                    round: 1, status: 'active',
                    matches: [
                        { id: 'monarch-g'+g+'-m0-'+ts, team1:[A,B], team2:[C,D], p1:A+' / '+B, p2:C+' / '+D, scoreP1:null, scoreP2:null, winner:null, group:g, matchIndex:0, isMonarch:true },
                        { id: 'monarch-g'+g+'-m1-'+ts, team1:[A,C], team2:[B,D], p1:A+' / '+C, p2:B+' / '+D, scoreP1:null, scoreP2:null, winner:null, group:g, matchIndex:1, isMonarch:true },
                        { id: 'monarch-g'+g+'-m2-'+ts, team1:[A,D], team2:[B,C], p1:A+' / '+D, p2:B+' / '+C, scoreP1:null, scoreP2:null, winner:null, group:g, matchIndex:2, isMonarch:true }
                    ]
                }],
                individualStandings: players.map(function(n) { return { name:n, wins:0, losses:0, pointsFor:0, pointsAgainst:0, played:0 }; })
            });
        }

        // Remainder players join last group (5-player group with more rotations) or show warning
        if (remainder > 0) {
            showNotification(_t('draw.warning'), _t('tdraw.monarchWarningMsg', { n: remainder }), 'warning');
        }

        t.groups = groups;
        t.currentStage = 'groups';
        t.status = 'active';
        window.AppStore.logAction(tId, _t('monarch.drawDone') + ' — ' + numGroups + ' grupos de 4');

        // Notify participants — personalized per recipient
        if (typeof window._notifyDrawPersonalized === 'function') {
            window._notifyDrawPersonalized(t, tId);
        }
        if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
            window.FirestoreDB.saveTournament(t).then(function() {
                showNotification(_t('monarch.drawDone'), _t('monarch.groupsFormed', {count: numGroups}), 'success');
                window.location.hash = '#bracket/' + tId;
            });
        } else {
            window.FirestoreDB.saveTournament(t);
            showNotification(_t('monarch.drawDone'), _t('monarch.groupsFormed', {count: numGroups}), 'success');
            window.location.hash = '#bracket/' + tId;
        }
        return;
    }

    // ── Fase de Grupos + Eliminatórias ──────────────────────────────
    if (t.format === 'Fase de Grupos + Eliminatórias') {
        let participants = Array.isArray(t.participants) ? [...t.participants] : Object.values(t.participants || {});
        const getName = (p) => typeof p === 'string' ? p : (p.displayName || p.name || '');

        // --- Team formation (when teamSize > 1) ---
        let _grpTeamSize = parseInt(t.teamSize) || 1;
        const _grpEnrMode = t.enrollmentMode || t.enrollment || 'individual';
        if ((_grpEnrMode === 'time' || _grpEnrMode === 'misto') && _grpTeamSize < 2) {
            _grpTeamSize = 2;
        }
        if (_grpTeamSize > 1) {
            let _grpIndividuals = [];
            let _grpPreFormed = [];
            participants.forEach(p => {
                const name = getName(p);
                if (name.includes(' / ')) {
                    _grpPreFormed.push(name);
                } else {
                    _grpIndividuals.push(name);
                }
            });
            // Shuffle individuals before forming teams
            for (let i = _grpIndividuals.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [_grpIndividuals[i], _grpIndividuals[j]] = [_grpIndividuals[j], _grpIndividuals[i]];
            }
            let _grpNewTeams = [];
            while (_grpIndividuals.length >= _grpTeamSize) {
                const group = _grpIndividuals.splice(0, _grpTeamSize);
                _grpNewTeams.push(group.join(' / '));
            }
            if (!t.teamOrigins) t.teamOrigins = {};
            _grpNewTeams.forEach(tn => { t.teamOrigins[tn] = 'sorteada'; });
            // Replace participants with formed teams
            participants = [..._grpPreFormed, ..._grpNewTeams, ..._grpIndividuals];
            t.participants = participants;
            if (_grpNewTeams.length > 0) {
                window.AppStore.logAction(tId, `Sorteio de times: ${_grpNewTeams.length} time(s) de ${_grpTeamSize} formado(s)`);
            }
        }

        // Convert participants to name strings
        let _grpNames = participants.map(p => getName(p));

        // Shuffle
        for (let i = _grpNames.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [_grpNames[i], _grpNames[j]] = [_grpNames[j], _grpNames[i]];
        }

        const numGroups = t.gruposCount || 4;
        const classifiedPerGroup = t.gruposClassified || 2;

        // Distribute participants into groups (snake draft)
        const groups = Array.from({ length: numGroups }, (_, i) => ({
            name: `${_t('label.group')} ${String.fromCharCode(65 + i)}`,
            participants: [],
            standings: [],
            rounds: []
        }));

        _grpNames.forEach((name, idx) => {
            groups[idx % numGroups].participants.push(name);
        });

        // Generate round-robin matches within each group
        groups.forEach((g, gi) => {
            const players = g.participants;
            const n = players.length;
            // Round-robin: each pair plays once
            const matchesForGroup = [];
            for (let i = 0; i < n; i++) {
                for (let j = i + 1; j < n; j++) {
                    matchesForGroup.push({
                        id: `grp${gi}-m${i}v${j}-${Date.now()}`,
                        p1: players[i],
                        p2: players[j],
                        winner: null,
                        group: gi,
                        label: `${window._safeHtml(g.name)} • ${window._safeHtml(players[i])} vs ${window._safeHtml(players[j])}`
                    });
                }
            }
            // Split into rounds (n-1 rounds for even, n rounds for odd)
            const roundCount = n % 2 === 0 ? n - 1 : n;
            const matchesPerRound = Math.floor(n / 2);
            const assigned = new Set();
            for (let r = 0; r < roundCount; r++) {
                const roundMatches = [];
                matchesForGroup.forEach(m => {
                    if (assigned.has(m.id)) return;
                    if (roundMatches.length >= matchesPerRound) return;
                    const playersInRound = roundMatches.flatMap(rm => [rm.p1, rm.p2]);
                    if (playersInRound.includes(m.p1) || playersInRound.includes(m.p2)) return;
                    m.roundIndex = g.rounds.length + r;
                    roundMatches.push(m);
                    assigned.add(m.id);
                });
                if (roundMatches.length > 0) {
                    g.rounds.push({
                        round: r + 1,
                        status: r === 0 ? 'active' : 'pending',
                        matches: roundMatches
                    });
                }
            }
            // Any remaining unassigned matches go into extra rounds
            const remaining = matchesForGroup.filter(m => !assigned.has(m.id));
            if (remaining.length > 0) {
                g.rounds.push({
                    round: g.rounds.length + 1,
                    status: 'pending',
                    matches: remaining
                });
            }

            // Initialize standings
            g.standings = players.map(name => ({
                name, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0
            }));
        });

        t.groups = groups;
        t.gruposClassified = classifiedPerGroup;
        t.currentStage = 'groups';
        t.status = 'active';

        window.AppStore.logAction(tId, `Sorteio Realizado — ${numGroups} grupos criados com rodízio interno`);

        if (document.getElementById('final-review-panel')) document.getElementById('final-review-panel').remove(); document.body.style.overflow = '';
        showNotification(_t('tdraw.groupsStarted'), _t('tdraw.groupsStartedMsg', { n: numGroups }), 'success');
        // Notify participants — personalized per recipient
        if (typeof window._notifyDrawPersonalized === 'function') {
            window._notifyDrawPersonalized(t, tId);
        }
        window.AppStore.syncImmediate(tId).then(function() {
            window.location.hash = `#bracket/${tId}`;
        });
        return;
    }

    let participants = Array.isArray(t.participants) ? [...t.participants] : Object.values(t.participants || {});

    // --- ETAPA 1: Formação de Times (quando teamSize > 1) ---
    let teamSize = parseInt(t.teamSize) || 1;
    // Fallback: se modo de inscrição é time/misto mas teamSize ficou 1, forçar mínimo 2
    const enrMode = t.enrollmentMode || t.enrollment || 'individual';
    if ((enrMode === 'time' || enrMode === 'misto') && teamSize < 2) {
        teamSize = 2;
    }
    if (teamSize > 1) {
        let individuals = [];
        let preFormedTeams = [];

        participants.forEach(p => {
            const name = typeof p === 'string' ? p : (p.displayName || p.name || '');
            if (name.includes(' / ')) {
                preFormedTeams.push(name);
            } else {
                individuals.push(name);
            }
        });

        // Embaralha individuais antes de agrupar em times
        for (let i = individuals.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [individuals[i], individuals[j]] = [individuals[j], individuals[i]];
        }

        let newTeams = [];
        while (individuals.length >= teamSize) {
            const group = individuals.splice(0, teamSize);
            newTeams.push(group.join(' / '));
        }

        // Registrar origem: equipes sorteadas
        if (!t.teamOrigins) t.teamOrigins = {};
        newTeams.forEach(tn => { t.teamOrigins[tn] = 'sorteada'; });

        // Resultado: times pré-formados + novos times sorteados + sobras
        participants = [...preFormedTeams, ...newTeams, ...individuals];

        // Salvar os times formados no torneio para referência
        t.participants = participants;

        if (newTeams.length > 0) {
            window.AppStore.logAction(tId, `Sorteio de times: ${newTeams.length} time(s) de ${teamSize} formado(s) aleatoriamente`);
        }
        if (individuals.length > 0) {
            window.AppStore.logAction(tId, `${individuals.length} jogador(es) sem time completo (sobra)`);
        }
    }

    // 1. Shuffling agora é feito por categoria dentro do loop de geração de matches

    // 2. Handle Swiss/Classificatória — classification phase before elimination
    if (t.p2Resolution === 'swiss') {
        var _swissNames = participants.map(function(p) {
            return typeof p === 'string' ? p : (p.displayName || p.name || '');
        });
        // Shuffle
        for (var _si = _swissNames.length - 1; _si > 0; _si--) {
            var _sj = Math.floor(Math.random() * (_si + 1));
            var _stmp = _swissNames[_si]; _swissNames[_si] = _swissNames[_sj]; _swissNames[_sj] = _stmp;
        }
        // Initialize standings
        t.standings = _swissNames.map(function(name) {
            return { name: name, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0 };
        });
        t.rounds = [];
        t.status = 'active';
        t.currentStage = 'swiss';
        t.classifyFormat = 'swiss';
        // Calculate target: nearest power-of-2 below participant count
        var _swCount = _swissNames.length;
        var _swLo = 1;
        while (_swLo * 2 <= _swCount) _swLo *= 2;
        t.p2TargetCount = _swLo;
        // Swiss rounds: use organizer-selected value if set, otherwise ceil(log2(participants))
        if (!t.swissRounds || t.swissRounds < 2) {
            t.swissRounds = Math.max(2, Math.ceil(Math.log2(_swCount)));
        }
        // Generate first Swiss round
        _generateNextRound(t);

        var _swRoundMatches = (t.rounds[0] && t.rounds[0].matches || []).filter(function(m) { return !m.isSitOut; }).length;
        if (document.getElementById('final-review-panel')) document.getElementById('final-review-panel').remove(); document.body.style.overflow = '';
        showNotification(_t('tdraw.swissStarted'), _t('tdraw.swissStartedMsg', { rounds: t.swissRounds, n: _swRoundMatches, lo: _swLo, format: t.format || 'Eliminatórias' }), 'success');
        // Notify participants — personalized per recipient
        if (typeof window._notifyDrawPersonalized === 'function') {
            window._notifyDrawPersonalized(t, tId);
        }
        window.AppStore.syncImmediate(tId).then(function() {
            // Notify Liga round via WhatsApp if this is a Liga/Suíço tournament (fire-and-forget)
            if (typeof _notifyLigaRoundWhatsApp === 'function') {
                _notifyLigaRoundWhatsApp(t, 0);
            }
            window.location.hash = '#bracket/' + tId;
        });
        return;
    }

    // 3. Handle Elimination (Simples/Dupla)
    let matches = [];
    const timestamp = Date.now();
    const isDupla = t.format === 'Dupla Eliminatória';
    const getName = (p) => typeof p === 'string' ? p : (p.displayName || p.name);

    // ── Agrupar por categoria (se houver) ───────────────────────────
    var _hasCats = Array.isArray(t.combinedCategories) && t.combinedCategories.length > 0;
    var _catGroups = {};
    if (_hasCats) {
        // Build map: category → [participants]
        t.combinedCategories.forEach(function(cat) { _catGroups[cat] = []; });
        participants.forEach(function(p) {
            var pCats = (typeof p === 'object') ? window._getParticipantCategories(p) : [];
            if (pCats.length > 0) {
                pCats.forEach(function(c) {
                    if (_catGroups[c]) _catGroups[c].push(p);
                });
            } else {
                // Participante sem categoria: incluir no primeiro grupo (fallback)
                var firstCat = t.combinedCategories[0];
                _catGroups[firstCat].push(p);
            }
        });
        // Remove categorias vazias
        t.combinedCategories.forEach(function(cat) {
            if (_catGroups[cat].length === 0) delete _catGroups[cat];
        });
    } else {
        _catGroups[''] = participants;
    }

    // ── Gerar chaveamento para cada categoria ───────────────────────
    var _matchCounter = 0;
    Object.keys(_catGroups).forEach(function(catName) {
        var catParticipants = _catGroups[catName];

        // Shuffle dentro da categoria
        if (!t.p2OrderedList) {
            for (var si = catParticipants.length - 1; si > 0; si--) {
                var sj = Math.floor(Math.random() * (si + 1));
                var tmp = catParticipants[si];
                catParticipants[si] = catParticipants[sj];
                catParticipants[sj] = tmp;
            }
        }

        // BYE handling por categoria — interleave for proper bracket distribution
        if (t.p2Resolution === 'bye') {
            var catLen = catParticipants.length;
            var catTarget = 1;
            while (catTarget < catLen) catTarget *= 2;
            var catByes = catTarget - catLen;
            if (catByes > 0) {
                // Split: players for real matches vs players who get BYEs
                // realMatches = catTarget/2 - catByes = matches with 2 real players
                // byeMatches = catByes = matches with 1 real + 1 BYE
                var _realMatchCount = catTarget / 2 - catByes;
                var _realMatchPlayers = _realMatchCount * 2; // these play each other
                var _byePlayers = catByes; // these get auto-advance

                var _rmGroup = catParticipants.slice(0, _realMatchPlayers);
                var _byGroup = catParticipants.slice(_realMatchPlayers);

                // VIP priority: move VIPs to BYE group so they auto-advance
                var _vips = t.vips || {};
                var _gn = function(p) { return typeof p === 'string' ? p : (p.displayName || p.name || ''); };
                if (Object.keys(_vips).length > 0) {
                    // Find VIPs in real match group and swap with non-VIPs in bye group
                    for (var _vi2 = 0; _vi2 < _rmGroup.length; _vi2++) {
                        var _vn = _gn(_rmGroup[_vi2]);
                        if (_vips[_vn]) {
                            // Find a non-VIP in bye group to swap with
                            for (var _bj = 0; _bj < _byGroup.length; _bj++) {
                                if (!_vips[_gn(_byGroup[_bj])]) {
                                    var _swpTmp = _rmGroup[_vi2];
                                    _rmGroup[_vi2] = _byGroup[_bj];
                                    _byGroup[_bj] = _swpTmp;
                                    break;
                                }
                            }
                        }
                    }
                }

                // Build interleaved array: alternate [real pair, bye pair]
                // This ensures R2 cross-seeding: each R2 match gets 1 R1 winner + 1 BYE winner
                var _newArr = [];
                var _rIdx = 0; // index into real match players (step 2)
                var _bIdx = 0; // index into bye players
                while (_rIdx < _rmGroup.length || _bIdx < _byGroup.length) {
                    // Add a real match pair
                    if (_rIdx < _rmGroup.length) {
                        _newArr.push(_rmGroup[_rIdx++]);
                        _newArr.push(_rmGroup[_rIdx++]);
                    }
                    // Add a BYE match pair
                    if (_bIdx < _byGroup.length) {
                        _newArr.push(_byGroup[_bIdx++]);
                        _newArr.push('BYE (Avança Direto)');
                    }
                }
                catParticipants = _newArr;
            }
        }

        // ── Repescagem (true repechage): ALL play R1, losers get 2nd chance ──
        // System: best R1 losers go to repechage. Repechage winners qualify.
        // If odd spots needed: best repechage loser (by R1 score) also qualifies.
        // NO BYEs — worst R1 loser(s) are eliminated immediately.
        if (t.p2Resolution === 'playin') {
            var catLen = catParticipants.length;
            if (catLen >= 3) {
                var r1MatchCount = Math.floor(catLen / 2);
                var r1Winners = r1MatchCount;
                var hasOddBye = (catLen % 2 !== 0);
                if (hasOddBye) r1Winners++;

                var r2Target = 1;
                while (r2Target < r1Winners) r2Target *= 2;
                var spotsFromRepechage = r2Target - r1Winners;

                if (spotsFromRepechage > 0 && r1MatchCount > 0) {
                    // ── Step 1: Generate R1 matches (ALL participants play) ──
                    var r1MatchIds = [];
                    for (var ri1 = 0; ri1 < catParticipants.length - 1; ri1 += 2) {
                        var rp1 = catParticipants[ri1];
                        var rp2 = catParticipants[ri1 + 1];
                        var r1m = {
                            id: 'match-r1-' + timestamp + '-' + _matchCounter,
                            round: 1,
                            bracket: isDupla ? 'upper' : undefined,
                            p1: getName(rp1),
                            p2: getName(rp2),
                            winner: null,
                            isRepechageR1: true
                        };
                        if (catName) r1m.category = catName;
                        matches.push(r1m);
                        r1MatchIds.push(r1m.id);
                        _matchCounter++;
                    }
                    var byePlayer = null;
                    if (hasOddBye) {
                        byePlayer = getName(catParticipants[catParticipants.length - 1]);
                    }

                    // ── Step 2: SEM jogos de repescagem (v1.0.66 spec) ──
                    // Algoritmo simplificado: os `spotsFromRepechage` melhores
                    // derrotados da R1 vão DIRETO pro bracket por seleção
                    // (menor margem de derrota). Sem partidas de repescagem.
                    var r1Losers = r1MatchCount; // total losers from R1
                    var repMatchCount = 0; // sem jogos de repescagem
                    var repMatchIds = [];
                    var bestLoserCount = spotsFromRepechage; // todos os spots vão direto pra bestloser
                    var eliminatedCount = r1Losers - bestLoserCount; // worst losers eliminados

                    // ── Step 3: Generate R2 matches ──
                    var r2Slots = [];
                    for (var rw = 0; rw < r1MatchIds.length; rw++) {
                        r2Slots.push({ tbd: true, fromMatch: r1MatchIds[rw], type: 'r1winner' });
                    }
                    if (byePlayer) {
                        r2Slots.push({ name: byePlayer, type: 'bye' });
                    }
                    // Best-loser slots → R2 (preenchidos após R1 completar via _assignRepechageLosers)
                    var bestLoserR2Ids = [];
                    for (var bl = 0; bl < bestLoserCount; bl++) {
                        r2Slots.push({ tbd: true, type: 'bestloser' });
                    }

                    // v1.0.71-beta: pareamento sequencial. Vencedor 1 vs
                    // Vencedor 2, Vencedor 3 vs Vencedor 4, ... Best losers
                    // preenchem em sequência. BYE sempre na ÚLTIMA posição.
                    var r2OrderedSlots = [];
                    // R1 winners primeiro (na ordem dos jogos)
                    r2Slots.forEach(function(s) {
                        if (s.type === 'r1winner') r2OrderedSlots.push(s);
                    });
                    // Best losers / repqualifier no meio
                    r2Slots.forEach(function(s) {
                        if (s.type === 'bestloser' || s.type === 'repqualifier') r2OrderedSlots.push(s);
                    });
                    // BYE no FINAL (última posição absoluta)
                    r2Slots.forEach(function(s) {
                        if (s.type === 'bye') r2OrderedSlots.push(s);
                    });
                    var r2Pairs = [];
                    for (var pIdx = 0; pIdx + 1 < r2OrderedSlots.length; pIdx += 2) {
                        r2Pairs.push({ p1: r2OrderedSlots[pIdx], p2: r2OrderedSlots[pIdx + 1] });
                    }

                    // Generate R2 match objects
                    for (var r2i = 0; r2i < r2Pairs.length; r2i++) {
                        var rp = r2Pairs[r2i];
                        var r2p1Name = rp.p1.name || 'TBD';
                        var r2p2Name = rp.p2.name || 'TBD';
                        var r2m = {
                            id: 'match-r2-' + timestamp + '-' + _matchCounter,
                            round: 2,
                            bracket: isDupla ? 'upper' : undefined,
                            p1: r2p1Name,
                            p2: r2p2Name,
                            winner: null
                        };
                        if (catName) r2m.category = catName;
                        // v1.0.73-beta: marca AMBOS os slots quando p1 E p2
                        // são bestloser (acontece quando há 2+ best losers no
                        // final da ordem). Antes só um era marcado, deixando
                        // o outro como "A definir" pra sempre.
                        var _bestLoserSlots = [];
                        if (rp.p1.type === 'bestloser') _bestLoserSlots.push('p1');
                        if (rp.p2.type === 'bestloser') _bestLoserSlots.push('p2');
                        if (_bestLoserSlots.length > 0) r2m.awaitsBestLoser = _bestLoserSlots.join(',');
                        // v1.0.67-beta: mark slots that came from BYE — usado
                        // pelo renderMatchCard pra exibir tag "BYE" só nesta
                        // rodada (rodadas seguintes, vitórias normais não
                        // sinalizam mais).
                        if (rp.p1.type === 'bye') r2m.p1FromBye = true;
                        if (rp.p2.type === 'bye') r2m.p2FromBye = true;
                        matches.push(r2m);
                        _matchCounter++;

                        // Link sources → R2
                        if (rp.p1.tbd && rp.p1.fromMatch) {
                            var srcM1 = matches.find(function(m) { return m.id === rp.p1.fromMatch; });
                            if (srcM1) { srcM1.nextMatchId = r2m.id; srcM1.nextSlot = 'p1'; }
                        }
                        if (rp.p2.tbd && rp.p2.fromMatch) {
                            var srcM2 = matches.find(function(m) { return m.id === rp.p2.fromMatch; });
                            if (srcM2) { srcM2.nextMatchId = r2m.id; srcM2.nextSlot = 'p2'; }
                        }
                        // Track best-loser R2 match IDs
                        if (rp.p1.type === 'bestloser' || rp.p2.type === 'bestloser') {
                            bestLoserR2Ids.push(r2m.id);
                        }
                    }

                    // ── Step 4: Generate remaining rounds (R3+) ──
                    var currentRoundMatches = r2Pairs.length;
                    var roundNum = 3;
                    var prevRoundR = matches.filter(function(m) { return m.round === 2 && (!catName || m.category === catName); });
                    while (currentRoundMatches > 1) {
                        var nextRoundCount = Math.floor(currentRoundMatches / 2);
                        var nextRoundMatches = [];
                        for (var nr = 0; nr < nextRoundCount; nr++) {
                            var nrm = {
                                id: 'match-r' + roundNum + '-' + timestamp + '-' + _matchCounter,
                                round: roundNum,
                                bracket: isDupla ? 'upper' : undefined,
                                p1: 'TBD',
                                p2: 'TBD',
                                winner: null
                            };
                            if (catName) nrm.category = catName;
                            matches.push(nrm);
                            nextRoundMatches.push(nrm);
                            _matchCounter++;
                        }
                        for (var lnk = 0; lnk < prevRoundR.length; lnk++) {
                            var tgtNr = Math.floor(lnk / 2);
                            var tgtSl = (lnk % 2 === 0) ? 'p1' : 'p2';
                            if (tgtNr < nextRoundMatches.length) {
                                prevRoundR[lnk].nextMatchId = nextRoundMatches[tgtNr].id;
                                prevRoundR[lnk].nextSlot = tgtSl;
                            }
                        }
                        prevRoundR = nextRoundMatches;
                        currentRoundMatches = nextRoundCount;
                        roundNum++;
                    }

                    // Store repechage config for bracket-logic.js advancement
                    // v1.0.66-beta: repMatchIds vazio (sem jogos de repescagem),
                    // todos os spots vão direto via bestLoser. repParticipants
                    // mantido = 0 pra compat.
                    t.repechageConfig = {
                        r1MatchIds: r1MatchIds,
                        repMatchIds: repMatchIds, // []
                        repParticipants: 0,
                        bestLoserCount: bestLoserCount,
                        bestLoserR2Ids: bestLoserR2Ids,
                        eliminatedCount: eliminatedCount,
                        spotsFromRepechage: spotsFromRepechage,
                        category: catName || ''
                    };
                    t.hasRepechage = true;
                    return; // continue to next category via forEach callback
                }
            }
        }

        // Gerar partidas de 1ª Rodada (standard — no play-in)
        for (var mi = 0; mi < catParticipants.length; mi += 2) {
            var p1 = catParticipants[mi];
            var p2 = mi + 1 < catParticipants.length ? catParticipants[mi + 1] : 'BYE (Avança Direto)';
            var p1Name = getName(p1);
            var p2Name = getName(p2);
            var isBye = p2Name === 'BYE (Avança Direto)';
            var matchObj = {
                id: 'match-' + timestamp + '-' + _matchCounter,
                round: 1,
                bracket: isDupla ? 'upper' : undefined,
                p1: p1Name,
                p2: p2Name,
                winner: isBye ? p1Name : null,
                isBye: isBye
            };
            if (catName) matchObj.category = catName;
            matches.push(matchObj);
            _matchCounter++;
        }
    });

    t.matches = matches;
    t.status = 'active';
    t.currentStage = 'elimination';

    // 4. Handle Repescagem (Incomplete Teams Lottery)
    if (t.incompleteResolution === 'lottery_direct') {
        window.AppStore.logAction(tId, 'Repescagem aplicada: times completados via sorteio');
    }

    // Build bracket structure with advancement links
    if (isDupla) {
        window._buildDoubleElimBracket(t);
    } else {
        window._buildNextMatchLinks(t);
    }

    window.AppStore.logAction(tId, 'Sorteio Realizado e Chaveamento Gerado');

    if (document.getElementById('final-review-panel')) document.getElementById('final-review-panel').remove(); document.body.style.overflow = '';

    showNotification(_t('draw.changesSaved'), _t('tdraw.drawDone'), 'success');

    // Notify all participants — personalized per recipient
    if (typeof window._notifyDrawPersonalized === 'function') {
        window._notifyDrawPersonalized(t, tId);
    }

    window._lastActiveTournamentId = tId;
    // Save immediately — critical: draw MUST persist to Firestore before navigating
    window.AppStore.syncImmediate(tId).then(function() {
        window.location.hash = `#bracket/${tId}`;
    });
};

// Build nextMatchId links for single elim bracket
// Gera TODAS as rodadas futuras (R2, R3, ..., Final) com participantes TBD
// Suporta categorias: cada categoria tem seu próprio chaveamento independente
window._buildNextMatchLinks = function (t) {
    if (!t.matches || !t.matches.length) return;
    // Repechage tournaments already have all rounds + links built — skip
    if (t.hasRepechage) return;

    // Agrupar matches R1 por categoria
    var _catSet = {};
    t.matches.filter(function(m) { return m.round === 1; }).forEach(function(m) {
        var cat = m.category || '';
        if (!_catSet[cat]) _catSet[cat] = true;
    });
    var _categories = Object.keys(_catSet);

    _categories.forEach(function(catName) {
        // Filtrar matches desta categoria
        var catMatches = t.matches.filter(function(m) {
            return (m.category || '') === catName;
        });

        var roundsMap = {};
        catMatches.forEach(function(m) {
            if (!roundsMap[m.round]) roundsMap[m.round] = [];
            roundsMap[m.round].push(m);
        });

        var r1Matches = (roundsMap[1] || []).length;
        if (r1Matches === 0) return;
        var totalRounds = Math.ceil(Math.log2(r1Matches * 2));
        var timestamp = Date.now();

        for (var r = 2; r <= totalRounds; r++) {
            var prevRound = roundsMap[r - 1] || [];
            var expectedNext = Math.ceil(prevRound.length / 2);
            if (!roundsMap[r]) roundsMap[r] = [];

            while (roundsMap[r].length < expectedNext) {
                var idx = roundsMap[r].length;
                var nm = {
                    id: 'match-r' + r + '-' + idx + '-' + (timestamp + r) + (catName ? '-' + catName.replace(/\s+/g, '_') : ''),
                    round: r,
                    p1: 'TBD', p2: 'TBD', winner: null
                };
                if (catName) nm.category = catName;
                roundsMap[r].push(nm);
                window._appendCanonicalColumn(t, { phase: 'elim', round: r, matches: [nm] });
            }

            prevRound.forEach(function(m, idx) {
                var nextMatchIdx = Math.floor(idx / 2);
                if (roundsMap[r][nextMatchIdx]) {
                    m.nextMatchId = roundsMap[r][nextMatchIdx].id;
                }
            });
        }

        // Processar BYE matches — avançar automaticamente
        (roundsMap[1] || []).forEach(function(m) {
            if (m.isBye && m.winner && m.nextMatchId) {
                var next = t.matches.find(function(nm) { return nm.id === m.nextMatchId; });
                if (next) {
                    if (!next.p1 || next.p1 === 'TBD') next.p1 = m.winner;
                    else if (!next.p2 || next.p2 === 'TBD') next.p2 = m.winner;
                }
            }
        });
    });
};

// ─── Build Double Elimination Bracket ───────────────────────────────
window._buildDoubleElimBracket = function (t) {
    if (!t.matches || !t.matches.length) return;
    const ts = Date.now();

    // --- UPPER BRACKET: build rounds like single elim ---
    const upperR1 = t.matches.filter(m => m.round === 1);
    const totalUpperRounds = Math.ceil(Math.log2(upperR1.length * 2));

    // Create upper bracket shell rounds
    const upperRounds = { 1: upperR1 };
    for (let r = 2; r <= totalUpperRounds; r++) {
        const prevCount = (upperRounds[r - 1] || []).length;
        const nextCount = Math.ceil(prevCount / 2);
        upperRounds[r] = [];
        for (let i = 0; i < nextCount; i++) {
            const m = {
                id: `upper-r${r}-${i}-${ts}`,
                round: r,
                bracket: 'upper',
                label: `Upper R${r} • P${i + 1}`,
                p1: 'TBD', p2: 'TBD', winner: null
            };
            upperRounds[r].push(m);
            window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'upper', round: r, matches: [m] });
        }
    }

    // Link upper bracket: winner → next upper, loser → lower
    for (let r = 1; r < totalUpperRounds; r++) {
        const cur = upperRounds[r];
        const nxt = upperRounds[r + 1];
        cur.forEach((m, idx) => {
            const nextIdx = Math.floor(idx / 2);
            if (nxt[nextIdx]) m.nextMatchId = nxt[nextIdx].id;
        });
    }

    // --- LOWER BRACKET ---
    // v1.0.91-beta: Lower bracket has 2*totalUpperRounds - 2 rounds
    // (era 'totalUpperRounds-1)*2-1' que estava ERRADO — não criava a Lower
    // Final). Estrutura: rounds alternando "merge" (recebem upper losers) e
    // "battle" (LR winners enfrentam-se internamente). O ÚLTIMO merge round
    // é a LOWER FINAL: LR(n) winner + UR(final) loser jogam pra ir pra GF.
    // User: 'deveria haver uma lower final? acho que é isso e essa não
    // aparece no chaveamento.'
    const lowerRounds = {};
    let lowerRoundNum = 1;

    // For each upper round (1 to totalUpperRounds), losers drop to lower
    // v1.0.91-beta: <= em vez de < — pra incluir o upper final loser na
    // Lower Final. Antes (com <), o UR final loser ficava órfão e LR3
    // winner ia direto pra GF (Lower Final inexistente).
    for (let ur = 1; ur <= totalUpperRounds; ur++) {
        const upperLosersCount = upperRounds[ur].length;

        if (ur === 1) {
            // Lower R1: upper R1 losers play each other
            const matchCount = Math.ceil(upperLosersCount / 2);
            lowerRounds[lowerRoundNum] = [];
            for (let i = 0; i < matchCount; i++) {
                const m = {
                    id: `lower-r${lowerRoundNum}-${i}-${ts}`,
                    round: lowerRoundNum,
                    bracket: 'lower',
                    label: `Lower R${lowerRoundNum} • P${i + 1}`,
                    p1: 'TBD', p2: 'TBD', winner: null
                };
                lowerRounds[lowerRoundNum].push(m);
                window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: lowerRoundNum, matches: [m] });
            }

            // Link upper R1 losers → lower R1
            upperRounds[1].forEach((um, idx) => {
                const lowerIdx = Math.floor(idx / 2);
                if (lowerRounds[lowerRoundNum][lowerIdx]) {
                    um.loserMatchId = lowerRounds[lowerRoundNum][lowerIdx].id;
                }
            });

            lowerRoundNum++;
        } else {
            // "Merge" round: lower winners vs upper losers dropping down
            const actualMergeCount = (lowerRounds[lowerRoundNum - 1] || []).length;

            lowerRounds[lowerRoundNum] = [];
            for (let i = 0; i < actualMergeCount; i++) {
                const m = {
                    id: `lower-r${lowerRoundNum}-${i}-${ts}`,
                    round: lowerRoundNum,
                    bracket: 'lower',
                    label: `Lower R${lowerRoundNum} • P${i + 1}`,
                    p1: 'TBD', p2: 'TBD', winner: null
                };
                lowerRounds[lowerRoundNum].push(m);
                window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: lowerRoundNum, matches: [m] });
            }

            // Link previous lower round winners → this round
            (lowerRounds[lowerRoundNum - 1] || []).forEach((lm, idx) => {
                if (lowerRounds[lowerRoundNum][idx]) {
                    lm.nextMatchId = lowerRounds[lowerRoundNum][idx].id;
                }
            });

            // Link upper round losers → this merge round
            upperRounds[ur].forEach((um, idx) => {
                if (lowerRounds[lowerRoundNum][idx]) {
                    um.loserMatchId = lowerRounds[lowerRoundNum][idx].id;
                }
            });

            lowerRoundNum++;

            // "Battle" round: lower bracket internal (winners play each other)
            if (actualMergeCount > 1) {
                const battleCount = Math.ceil(actualMergeCount / 2);
                lowerRounds[lowerRoundNum] = [];
                for (let i = 0; i < battleCount; i++) {
                    const m = {
                        id: `lower-r${lowerRoundNum}-${i}-${ts}`,
                        round: lowerRoundNum,
                        bracket: 'lower',
                        label: `Lower R${lowerRoundNum} • P${i + 1}`,
                        p1: 'TBD', p2: 'TBD', winner: null
                    };
                    lowerRounds[lowerRoundNum].push(m);
                    window._appendCanonicalColumn(t, { phase: 'elim', bracket: 'lower', round: lowerRoundNum, matches: [m] });
                }

                // Link merge round winners → battle round
                (lowerRounds[lowerRoundNum - 1] || []).forEach((lm, idx) => {
                    const nextIdx = Math.floor(idx / 2);
                    if (lowerRounds[lowerRoundNum][nextIdx]) {
                        lm.nextMatchId = lowerRounds[lowerRoundNum][nextIdx].id;
                    }
                });

                lowerRoundNum++;
            }
        }
    }

    // --- GRAND FINAL ---
    const grandFinal = {
        id: `grand-final-${ts}`,
        round: totalUpperRounds + 1,
        bracket: 'grand',
        label: 'Grande Final',
        p1: 'TBD', p2: 'TBD', winner: null
    };
    window._appendCanonicalColumn(t, { phase: 'grandfinal', bracket: 'grand', round: totalUpperRounds + 1, matches: [grandFinal] });

    // Link upper bracket final winner → grand final
    const upperFinal = upperRounds[totalUpperRounds];
    if (upperFinal && upperFinal[0]) {
        upperFinal[0].nextMatchId = grandFinal.id;
    }

    // Link lower bracket final winner → grand final
    const lastLowerRound = lowerRounds[lowerRoundNum - 1];
    if (lastLowerRound && lastLowerRound[0]) {
        lastLowerRound[0].nextMatchId = grandFinal.id;
    }

    // Auto-advance BYE winners in upper bracket
    t.matches.filter(m => m.isBye && m.winner && m.bracket === 'upper').forEach(m => {
        if (m.nextMatchId) {
            const next = t.matches.find(n => n.id === m.nextMatchId);
            if (next) {
                if (!next.p1 || next.p1 === 'TBD') next.p1 = m.winner;
                else if (!next.p2 || next.p2 === 'TBD') next.p2 = m.winner;
            }
        }
    });
};

// ========== Drag-and-drop handlers ==========
window.handleDragStart = function (e, idx, tId) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ idx, tId }));
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.style.opacity = '0.4', 0);
    // Store participant data for potential use
    var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
    if (t && Array.isArray(t.participants) && t.participants[idx]) {
      window._participantDragData = t.participants[idx];
      window._participantDragTId = tId;
    }
    // Show crown drop target while dragging
    var crownBtn = document.getElementById('crown-org-btn');
    if (crownBtn) crownBtn.style.display = 'flex';
};

window.handleDragEnd = function (e) {
    e.target.style.opacity = '1';
    window._participantDragData = null;
    // Hide crown drop target
    var crownBtn = document.getElementById('crown-org-btn');
    if (crownBtn) crownBtn.style.display = 'none';
    // Restore original styles on all cards that might have been highlighted
    document.querySelectorAll('.participant-card').forEach(c => {
        if (c.dataset.originalBg) {
            c.style.background = c.dataset.originalBg;
            c.style.border = c.dataset.originalBorder;
            delete c.dataset.originalBg;
            delete c.dataset.originalBorder;
        }
    });
};

window.handleDragOver = function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};

window.handleDragEnter = function (e) {
    e.preventDefault();
    const card = e.currentTarget;
    if (!card.dataset.originalBg) {
        card.dataset.originalBg = card.style.background;
        card.dataset.originalBorder = card.style.border;
    }
    card.style.border = '2px dashed var(--primary-color)';
    card.style.background = 'rgba(255,255,255,0.05)';
};

window.handleDragLeave = function (e) {
    const card = e.currentTarget;
    if (card.dataset.originalBg) {
        card.style.background = card.dataset.originalBg;
        card.style.border = card.dataset.originalBorder;
    }
};

window.handleDropTeam = function (e, targetIdx) {
    e.preventDefault();
    const card = e.currentTarget;

    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        const sourceIdx = data.idx;
        const tId = data.tId;

        if (sourceIdx === targetIdx) return;

        const t = window.AppStore.tournaments.find(tour => tour.id.toString() === tId.toString());
        if (!t) return;

        if (t.enrollmentMode === 'individual') {
            showAlertDialog(_t('draw.soloModeTitle'), _t('draw.soloModeMsg'), null, { type: 'warning' });
            return;
        }

        showConfirmDialog(
            _t('draw.groupPartsTitle'),
            _t('draw.groupPartsMsg'),
            () => {
                let arr = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);

                const p1 = arr[sourceIdx];
                const p2 = arr[targetIdx];

                const name1 = typeof p1 === 'string' ? p1 : (p1.displayName || p1.name || p1.email);
                const name2 = typeof p2 === 'string' ? p2 : (p2.displayName || p2.name || p2.email);

                const newName = name1 + ' / ' + name2;

                const maxIdx = Math.max(sourceIdx, targetIdx);
                const minIdx = Math.min(sourceIdx, targetIdx);

                arr.splice(maxIdx, 1);
                arr.splice(minIdx, 1);

                arr.splice(minIdx, 0, newName);
                t.participants = arr;
                // Registrar origem: equipe formada pelo organizador (drag & drop)
                if (!t.teamOrigins) t.teamOrigins = {};
                t.teamOrigins[newName] = 'formada';

                window.FirestoreDB.saveTournament(t);

                const container = document.getElementById('view-container');
                if (container) {
                    renderTournaments(container, tId);
                }
            },
            null,
            { type: 'info', confirmText: _t('btn.group'), cancelText: _t('btn.keepSeparate') }
        );

    } catch (err) { window._error(err); }
};


/**
 * v1.8.1-beta: Personalized draw / new-round notifications.
 * Each participant gets their own notification showing their specific
 * match with real name + "(você)" in the email body.
 *
 * @param {object} t      - tournament object (already mutated with matches)
 * @param {string} tId    - tournament id
 * @param {object} [opts] - { type:'new_round', roundIndex: N } for Liga rounds 2+
 *                          Defaults: type='draw', roundIndex=last round for rounds-based,
 *                          or auto-detect from groups / matches.
 *
 * Supports: Eliminatórias / Dupla Elim (t.matches R1),
 *           Liga / Suíço (t.rounds[N].matches),
 *           Grupos + Elim / Rei-Rainha (t.groups[*].rounds[0].matches).
 */
window._notifyDrawPersonalized = async function(t, tId, opts) {
    if (typeof window._sendUserNotification !== 'function') return;
    if (!window.FirestoreDB || !window.FirestoreDB.db) return;

    opts = opts || {};
    var notifType = opts.type || 'draw';
    var _tId = String(tId || t.id || '');
    var tUrl = 'https://scoreplace.app/#tournaments/' + _tId;
    var venue = t.venue || '';
    var startDate = t.startDate || '';
    var tName = t.name || 'Torneio';

    // ── Collect matches to notify about ─────────────────────────────────
    // allMatches = [{p1, p2, groupName?}]
    var allMatches = [];
    var isGroupsStage = Array.isArray(t.groups) && t.groups.length > 0 && t.currentStage === 'groups';

    if (isGroupsStage) {
        t.groups.forEach(function(g) {
            var gName = g.name || '';
            var r0 = Array.isArray(g.rounds) && g.rounds[0];
            if (r0 && Array.isArray(r0.matches)) {
                r0.matches.forEach(function(m) {
                    if (!m.isSitOut) allMatches.push({ p1: m.p1 || '', p2: m.p2 || '', groupName: gName });
                });
            }
        });
    } else if (Array.isArray(t.rounds) && t.rounds.length > 0) {
        // Liga / Suíço — use specified roundIndex or last round
        var _ri = (opts.roundIndex !== undefined) ? opts.roundIndex : (t.rounds.length - 1);
        var _rnd = t.rounds[_ri] || {};
        (_rnd.matches || []).forEach(function(m) {
            if (!m.isSitOut) allMatches.push({ p1: m.p1 || '', p2: m.p2 || '' });
        });
    } else if (Array.isArray(t.matches)) {
        // Eliminatórias / Dupla Elim — round 1 only, skip BYEs
        t.matches.forEach(function(m) {
            if (m.round === 1 && !m.isBye && !m.isSitOut && (m.p1 || m.p2)) {
                allMatches.push({ p1: m.p1 || '', p2: m.p2 || '' });
            }
        });
    }

    if (!allMatches.length) return;

    // ── Build matchLines for email (Jogo N: P1 vs P2) ───────────────────
    var matchLines = allMatches.map(function(m, i) {
        var prefix = m.groupName ? (m.groupName + ' · Jogo ' + (i + 1)) : ('Jogo ' + (i + 1));
        return prefix + ': ' + (m.p1 || '?') + ' vs ' + (m.p2 || '?');
    });

    // ── Check if playerName appears in a match side (handles "A / B" teams) ──
    var _isInSide = function(playerName, side) {
        if (!playerName || !side) return false;
        var pn = playerName.trim().toLowerCase();
        return side.split(' / ').some(function(s) { return s.trim().toLowerCase() === pn; });
    };

    // ── Format date for WhatsApp text ────────────────────────────────────
    var _fmtDate = function(d) {
        try { var dt = new Date(d); return isNaN(dt) ? d : dt.toLocaleDateString('pt-BR'); } catch(e) { return d; }
    };

    // ── Notification labels per type ────────────────────────────────────
    var _isNewRound = (notifType === 'new_round');
    var notifIcon = _isNewRound ? '🔄' : '🎲';
    var notifTitle = (_isNewRound ? '🔄 Nova Rodada: ' : '🎲 Chaveamento: ') + tName;
    var baseMsg = _isNewRound
        ? 'Uma nova rodada foi gerada no torneio ' + tName + '.'
        : 'O chaveamento do torneio ' + tName + ' foi gerado.';
    var ctaText = _isNewRound ? 'Ver rodada' : 'Ver chaveamento';

    // ── Notify each participant individually ─────────────────────────────
    var parts = Array.isArray(t.participants)
        ? t.participants
        : (t.participants ? Object.values(t.participants) : []);

    for (var _pi = 0; _pi < parts.length; _pi++) {
        var p = parts[_pi];
        if (typeof p === 'string') continue;
        var uid = p.uid;
        if (!uid) continue;
        var pName = p.displayName || p.name || '';
        if (!pName) continue;

        // Find this player's match
        var playerMatch = null;
        var playerMatchNum = 0;
        for (var _mi = 0; _mi < allMatches.length; _mi++) {
            var am = allMatches[_mi];
            if (_isInSide(pName, am.p1) || _isInSide(pName, am.p2)) {
                playerMatch = am;
                playerMatchNum = _mi + 1;
                break;
            }
        }

        // Personalized plain-text (WhatsApp)
        var msg = baseMsg;
        if (playerMatch && playerMatchNum) {
            var _gmatch = playerMatch.groupName ? (' (' + playerMatch.groupName + ')') : '';
            msg = notifIcon + ' ' + (_isNewRound ? 'Nova rodada no torneio' : 'Chaveamento do torneio') +
                ' ' + tName + '!' +
                '\n\nSeu Jogo ' + playerMatchNum + _gmatch + ': ' + playerMatch.p1 + ' vs ' + playerMatch.p2 +
                (venue ? '\n📍 ' + venue : '') +
                (startDate ? '\n📅 ' + _fmtDate(startDate) : '');
        }

        try {
            await window._sendUserNotification(uid, {
                type: notifType,
                level: 'fundamental',
                title: notifTitle,
                message: msg,
                tournamentId: _tId,
                tournamentName: tName,
                ctaUrl: tUrl,
                ctaText: ctaText,
                matchLines: matchLines,
                playerMatch: playerMatch || undefined,
                playerMatchNum: playerMatchNum || 0,
                playerName: pName,
                venue: venue,
                startDate: startDate
            });
        } catch(e) {
            window._warn('[notifyDrawPersonalized] uid=' + uid, e);
        }
    }
};

})();
