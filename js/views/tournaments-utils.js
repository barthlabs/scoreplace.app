// Normalize format: 'Ranking' → 'Liga' (unificado em v0.2.6)
var _t = window._t || function(k) { return k; };
// Defined at top level so it's available immediately on script load
window._isLigaFormat = window._isLigaFormat || function(t) {
    return t && (t.format === 'Liga' || t.format === 'Ranking');
};

// ── Merge Participants: mesclar dois participantes (organizer, após sorteio) ──
// Supports both desktop drag-and-drop AND mobile touch drag.
// Core logic in _executeMerge(); drag/touch just determine source+target names.

window._mergeDragData = null;

// ── Core merge logic (reusable) ──
window._executeMerge = function(sourceName, targetName, tId) {
    if (sourceName === targetName) return;
    if (!tId) return;

    var t = null;
    if (window.AppStore && Array.isArray(window.AppStore.tournaments)) {
        t = window.AppStore.tournaments.find(function(x) { return x.id === tId; });
    }
    if (!t) return;

    // Determine which name is "in the draw" (exists in matches) vs the "phantom"
    var _nameInDraw = function(nm) {
        var found = false;
        var _check = function(m) {
            if (!m) return;
            if (m.p1 && m.p1.indexOf(nm) !== -1) found = true;
            if (m.p2 && m.p2.indexOf(nm) !== -1) found = true;
            if (m.winner && m.winner.indexOf(nm) !== -1) found = true;
        };
        if (typeof window._collectAllMatches === 'function') {
            window._collectAllMatches(t).forEach(_check);
        } else {
            // Defensive fallback: bracket-model.js not loaded.
            if (Array.isArray(t.matches)) t.matches.forEach(_check);
            if (t.thirdPlaceMatch) _check(t.thirdPlaceMatch);
            if (Array.isArray(t.rounds)) t.rounds.forEach(function(r) { if (r && Array.isArray(r.matches)) r.matches.forEach(_check); });
            if (Array.isArray(t.groups)) t.groups.forEach(function(g) {
                if (!g) return;
                if (Array.isArray(g.matches)) g.matches.forEach(_check);
                if (Array.isArray(g.rounds)) g.rounds.forEach(function(gr) { if (Array.isArray(gr)) gr.forEach(_check); else if (gr && Array.isArray(gr.matches)) gr.matches.forEach(_check); });
            });
            if (Array.isArray(t.rodadas)) t.rodadas.forEach(function(r) {
                if (Array.isArray(r)) r.forEach(_check);
                else if (r && Array.isArray(r.matches)) r.matches.forEach(_check);
                else if (r && Array.isArray(r.jogos)) r.jogos.forEach(_check);
            });
        }
        return found;
    };

    var sourceInDraw = _nameInDraw(sourceName);
    var targetInDraw = _nameInDraw(targetName);

    var oldName, newName;
    if (sourceInDraw && !targetInDraw) {
        oldName = sourceName; newName = targetName;
    } else if (!sourceInDraw && targetInDraw) {
        oldName = targetName; newName = sourceName;
    } else {
        oldName = sourceName; newName = targetName;
    }

    var msg = 'Mesclar participantes?\n\n"' + oldName + '" sera substituido por "' + newName + '" em todas as partidas, times e classificacoes.\n\nEsta acao nao pode ser desfeita.';

    if (typeof showConfirmDialog === 'function') {
        showConfirmDialog(_t('utils.mergePartsTitle'), msg, function() {
            if (typeof window._propagateNameChange === 'function') {
                window._propagateNameChange(oldName, newName);
            }
            // Remove phantom duplicate from participants
            var parts = Array.isArray(t.participants) ? t.participants : [];
            var _removeIdx = -1;
            for (var i = parts.length - 1; i >= 0; i--) {
                var pi = parts[i];
                if (typeof pi === 'object' && pi) {
                    var nm = pi.displayName || pi.name || '';
                    if (nm === newName) {
                        var inTeam = parts.some(function(p2) {
                            return typeof p2 === 'string' && p2.indexOf(newName) !== -1 && p2.indexOf(' / ') !== -1;
                        });
                        if (inTeam) { _removeIdx = i; break; }
                    }
                }
            }
            if (_removeIdx !== -1) {
                parts.splice(_removeIdx, 1);
                window._debug('[Merge] Removed duplicate at index ' + _removeIdx);
            }

            t.updatedAt = new Date().toISOString();
            if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
                window.FirestoreDB.saveTournament(t).catch(function(e) { window._warn('[Merge] Save error:', e); });
            }
            window.AppStore.logAction(tId, 'Participantes mesclados: "' + oldName + '" -> "' + newName + '"');
            if (typeof showNotification === 'function') {
                showNotification(_t('utils.partsMerged'), _t('utils.partsMergedMsg', { old: oldName, 'new': newName }), 'success');
            }
            setTimeout(function() {
                if (typeof window._softRefreshView === 'function') window._softRefreshView();
                else if (typeof renderTournaments === 'function') {
                    var c = document.getElementById('view-container');
                    if (c) renderTournaments(c, tId);
                }
            }, 300);
        });
    }
};

// ── Desktop HTML5 Drag-and-Drop handlers ──
window._mergeDragStart = function(e, name, tId) {
    window._mergeDragData = { name: name, tId: tId };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', name); } catch(ex) {}
    var card = e.target.closest('.participant-card') || e.target.closest('[draggable]');
    if (card) {
        card.style.opacity = '0.4';
        card.style.boxShadow = '0 0 15px rgba(251,191,36,0.4)';
    }
};

window._mergeDragEnd = function(e) {
    window._mergeDragData = null;
    var card = e.target.closest('.participant-card') || e.target.closest('[draggable]');
    if (card) { card.style.opacity = '1'; card.style.boxShadow = ''; }
    document.querySelectorAll('.participant-card, [draggable="true"]').forEach(function(el) {
        el.style.outline = ''; el.style.outlineOffset = ''; el.style.opacity = '1';
    });
};

window._mergeDragEnter = function(e) {
    e.preventDefault();
    var card = e.target.closest('.participant-card') || e.target.closest('[draggable]');
    if (card) { card.style.outline = '2px dashed #fbbf24'; card.style.outlineOffset = '-2px'; }
};

window._mergeDragLeave = function(e) {
    var card = e.target.closest('.participant-card') || e.target.closest('[draggable]');
    if (card) { card.style.outline = ''; card.style.outlineOffset = ''; }
};

window._mergeDrop = function(e, targetName, tId) {
    e.preventDefault();
    e.stopPropagation();
    var card = e.target.closest('.participant-card') || e.target.closest('[draggable]');
    if (card) { card.style.outline = ''; card.style.outlineOffset = ''; }
    if (!window._mergeDragData) return;
    var sourceName = window._mergeDragData.name;
    window._mergeDragData = null;
    sourceName = sourceName.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    targetName = targetName.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    window._executeMerge(sourceName, targetName, tId);
};

// ── Touch Drag-and-Drop for Mobile ──
// Called after rendering participant list. Attaches touch handlers to the container.
window._mergeTouchState = null;

window._initMergeTouchDrag = function(tId) {
    // Find the participant grid container
    var containers = document.querySelectorAll('[data-merge-container]');
    containers.forEach(function(container) {
        // Remove old listeners if any (via flag)
        if (container._mergeTouchBound) return;
        container._mergeTouchBound = true;

        var _touchClone = null;
        var _touchSourceCard = null;
        var _touchSourceName = null;
        var _longPressTimer = null;
        var _isDragging = false;

        function _getCardName(card) {
            if (!card) return null;
            return card.getAttribute('data-participant-name') || card.getAttribute('data-merge-name') || null;
        }

        function _findCardAt(x, y) {
            // Hide clone temporarily to get element underneath
            if (_touchClone) _touchClone.style.display = 'none';
            var el = document.elementFromPoint(x, y);
            if (_touchClone) _touchClone.style.display = '';
            if (!el) return null;
            return el.closest('[data-merge-name]') || el.closest('.participant-card');
        }

        function _resetAll() {
            if (_touchClone && _touchClone.parentElement) _touchClone.remove();
            if (_touchSourceCard) { _touchSourceCard.style.opacity = '1'; _touchSourceCard.style.boxShadow = ''; }
            container.querySelectorAll('[data-merge-name],.participant-card').forEach(function(c) {
                c.style.outline = ''; c.style.outlineOffset = '';
            });
            _touchClone = null;
            _touchSourceCard = null;
            _touchSourceName = null;
            _isDragging = false;
            if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
        }

        container.addEventListener('touchstart', function(e) {
            var card = e.target.closest('[data-merge-name]') || e.target.closest('.participant-card');
            if (!card) return;
            var name = _getCardName(card);
            if (!name) return;

            // Long-press to initiate merge drag (500ms)
            _longPressTimer = setTimeout(function() {
                _isDragging = true;
                _touchSourceCard = card;
                _touchSourceName = name;

                // Visual feedback on source
                card.style.opacity = '0.4';
                card.style.boxShadow = '0 0 15px rgba(251,191,36,0.4)';

                // Create floating clone
                var rect = card.getBoundingClientRect();
                _touchClone = card.cloneNode(true);
                _touchClone.style.position = 'fixed';
                _touchClone.style.left = rect.left + 'px';
                _touchClone.style.top = rect.top + 'px';
                _touchClone.style.width = rect.width + 'px';
                _touchClone.style.opacity = '0.85';
                _touchClone.style.zIndex = '99999';
                _touchClone.style.pointerEvents = 'none';
                _touchClone.style.boxShadow = '0 8px 32px rgba(251,191,36,0.3)';
                _touchClone.style.border = '2px solid #fbbf24';
                _touchClone.style.borderRadius = '12px';
                _touchClone.style.transform = 'scale(1.05)';
                document.body.appendChild(_touchClone);

                // Vibrate if supported
                if (navigator.vibrate) navigator.vibrate(50);
            }, 500);
        }, { passive: true });

        container.addEventListener('touchmove', function(e) {
            if (!_isDragging || !_touchClone) {
                // If moved before long-press, cancel it (user is scrolling)
                if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
                return;
            }
            e.preventDefault(); // Prevent scroll while dragging

            var touch = e.touches[0];
            _touchClone.style.left = (touch.clientX - _touchClone.offsetWidth / 2) + 'px';
            _touchClone.style.top = (touch.clientY - _touchClone.offsetHeight / 2) + 'px';

            // Highlight drop target
            var targetCard = _findCardAt(touch.clientX, touch.clientY);
            container.querySelectorAll('[data-merge-name],.participant-card').forEach(function(c) {
                c.style.outline = ''; c.style.outlineOffset = '';
            });
            if (targetCard && targetCard !== _touchSourceCard) {
                targetCard.style.outline = '2px dashed #fbbf24';
                targetCard.style.outlineOffset = '-2px';
            }
        }, { passive: false });

        container.addEventListener('touchend', function(e) {
            if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
            if (!_isDragging || !_touchSourceName) { _resetAll(); return; }

            var touch = e.changedTouches[0];
            var targetCard = _findCardAt(touch.clientX, touch.clientY);
            var targetName = targetCard ? _getCardName(targetCard) : null;

            _resetAll();

            if (targetName && targetName !== _touchSourceName) {
                window._executeMerge(_touchSourceName, targetName, tId);
            }
        }, { passive: true });

        container.addEventListener('touchcancel', function() {
            _resetAll();
        }, { passive: true });
    });
};

// ── Deduplicação de participantes por uid/email ──────────────────────────────
// Remove duplicatas causadas por troca de nome no perfil.
// Mantém a entrada mais recente (última no array = nome atualizado).
// Retorna número de duplicatas removidas.
window._deduplicateParticipants = function(t) {
    if (!t || !Array.isArray(t.participants)) return 0;
    var seen = {};
    var deduped = [];
    var removedCount = 0;

    // Pass 1: collect all names that are part of teams (strings with " / ")
    var teamMembers = {};
    t.participants.forEach(function(p) {
        var name = typeof p === 'string' ? p : (p ? (p.displayName || p.name || '') : '');
        if (name.indexOf(' / ') !== -1) {
            name.split(' / ').forEach(function(n) {
                var nm = n.trim().toLowerCase();
                if (nm) teamMembers[nm] = name; // track which team they belong to
            });
        }
    });

    // Pass 2: deduplicate by uid/email AND by name-in-team
    t.participants.forEach(function(p) {
        if (!p) return;
        if (typeof p === 'string') {
            // Check if this individual name is already part of a team entry
            if (p.indexOf(' / ') === -1 && teamMembers[p.trim().toLowerCase()]) {
                removedCount++;
                return; // skip — already represented inside a team
            }
            deduped.push(p);
            return;
        }
        if (typeof p !== 'object') return;
        var pName = (p.displayName || p.name || '').trim();

        // Check if this individual is already inside a team string
        if (pName && pName.indexOf(' / ') === -1 && teamMembers[pName.toLowerCase()]) {
            removedCount++;
            return; // skip — already represented inside a team
        }

        // Deduplicate by uid/email
        var key = p.uid ? ('uid:' + p.uid) : (p.email ? ('email:' + p.email) : null);
        if (key && seen[key]) {
            removedCount++;
            var prevIdx = deduped.indexOf(seen[key]);
            if (prevIdx !== -1) deduped[prevIdx] = p;
            seen[key] = p;
        } else {
            if (key) seen[key] = p;
            deduped.push(p);
        }
    });

    if (removedCount > 0) {
        t.participants = deduped;
        window._debug('[Dedup] Removed ' + removedCount + ' duplicate participant(s) from tournament ' + (t.name || t.id));
    }
    return removedCount;
};

// ── Fix orphaned match names ─────────────────────────────────────────────────
// Detects phantom participant objects (name not in any team string or match)
// and pairs them with team string members that have no corresponding object.
// Example: Object "Ciça Mange" + String "C M / Michelle" → "C M" is old name of "Ciça Mange"
// Returns number of fixes applied.
window._fixOrphanedMatchNames = function(t) {
    if (!t) return 0;
    // Only run AFTER draw — before draw, no one has matches and that's normal
    var hasMatches = (Array.isArray(t.matches) && t.matches.length > 0) ||
                     (Array.isArray(t.rounds) && t.rounds.length > 0) ||
                     (Array.isArray(t.groups) && t.groups.length > 0);
    if (!hasMatches) return 0;
    var parts = Array.isArray(t.participants) ? t.participants : [];
    if (parts.length === 0) return 0;

    // 1. Separate participant OBJECT names from team STRING member names
    var objectNames = {};  // names from participant objects
    var stringMemberNames = {};  // individual names extracted from team strings
    var objectByEmail = {}; // email → object name

    parts.forEach(function(p) {
        if (typeof p === 'string') {
            if (p.indexOf(' / ') !== -1) {
                p.split(' / ').forEach(function(n) { var nm = n.trim(); if (nm) stringMemberNames[nm] = true; });
            } else {
                stringMemberNames[p] = true;
            }
        } else if (typeof p === 'object' && p) {
            var nm = p.displayName || p.name || '';
            if (nm) {
                objectNames[nm] = true;
                if (p.email) objectByEmail[p.email] = nm;
            }
        }
    });

    // 2. Find phantom objects: object names NOT in any team string
    var phantoms = []; // participant objects whose names don't appear in team strings or matches
    var allStringNames = Object.keys(stringMemberNames);

    Object.keys(objectNames).forEach(function(objName) {
        if (!stringMemberNames[objName]) {
            phantoms.push(objName);
        }
    });

    if (phantoms.length === 0) return 0;

    // 3. Find unaccounted team members: team string names that have no participant object
    var unaccounted = [];
    allStringNames.forEach(function(strName) {
        if (!objectNames[strName]) {
            unaccounted.push(strName);
        }
    });

    if (unaccounted.length === 0) return 0;
    window._debug('[FixOrphans] Phantom objects (not in draw):', phantoms, 'Unaccounted team members:', unaccounted);

    // 4. Try to pair phantoms with unaccounted names
    var fixes = [];

    // Strategy A: if exactly 1 phantom and 1 unaccounted → same person
    if (phantoms.length === 1 && unaccounted.length === 1) {
        fixes.push({ oldName: unaccounted[0], newName: phantoms[0] });
    } else {
        // Strategy B: initials matching — "C M" could be initials of "Ciça Mange"
        var _usedPhantoms = {};
        var _usedUnaccounted = {};
        phantoms.forEach(function(phantom) {
            if (_usedPhantoms[phantom]) return;
            var phantomParts = phantom.split(/\s+/).filter(function(w) { return w.length > 0; });
            if (phantomParts.length < 2) return; // need at least 2 words to match initials

            unaccounted.forEach(function(uName) {
                if (_usedUnaccounted[uName] || _usedPhantoms[phantom]) return;
                // Check if uName could be initials of phantom
                var uParts = uName.split(/\s+/).filter(function(w) { return w.length > 0; });
                if (uParts.length !== phantomParts.length) return; // must have same number of parts
                var allMatch = true;
                for (var i = 0; i < uParts.length; i++) {
                    // Each part of uName should be 1-2 chars and match the first char of phantom part (case-insensitive, accent-insensitive)
                    var uPart = uParts[i].replace(/[.]/g, '');
                    if (uPart.length > 3) { allMatch = false; break; } // not an initial
                    var pFirstChar = phantomParts[i].charAt(0).toLowerCase()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    var uFirstChar = uPart.charAt(0).toLowerCase()
                        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    if (pFirstChar !== uFirstChar) { allMatch = false; break; }
                }
                if (allMatch) {
                    window._debug('[FixOrphans] Initials match: "' + uName + '" → "' + phantom + '"');
                    fixes.push({ oldName: uName, newName: phantom });
                    _usedPhantoms[phantom] = true;
                    _usedUnaccounted[uName] = true;
                }
            });
        });
    }

    if (fixes.length === 0) {
        // Strategy C: show organizer notification for manual fix
        if (typeof window.AppStore !== 'undefined' && window.AppStore.currentUser) {
            var isOrg = typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t);
            if (isOrg && phantoms.length > 0 && unaccounted.length > 0) {
                // Show a banner/notification the organizer can act on
                phantoms.forEach(function(phantom) {
                    var msg = '"' + phantom + '" está inscrito(a) mas não aparece nas partidas.';
                    if (unaccounted.length <= 3) {
                        msg += ' Pode ser: ' + unaccounted.map(function(u) { return '"' + u + '"'; }).join(', ') + '.';
                        msg += ' Use a edição inline (clique no nome) para corrigir.';
                    }
                    if (typeof showNotification === 'function') {
                        showNotification(_t('utils.noMatch'), msg, 'warning', 10000);
                    }
                });
            }
        }
        return 0;
    }

    // 5. Apply fixes using _propagateNameChange
    window._debug('[FixOrphans] Applying ' + fixes.length + ' fix(es):', fixes.map(function(f) { return '"' + f.oldName + '" → "' + f.newName + '"'; }));
    var fixCount = 0;
    fixes.forEach(function(f) {
        if (typeof window._propagateNameChange === 'function') {
            var uid = null, email = null;
            parts.forEach(function(p) {
                if (typeof p !== 'object' || !p) return;
                var nm = p.displayName || p.name || '';
                if (nm === f.newName) { uid = p.uid || null; email = p.email || null; }
            });
            window._propagateNameChange(f.oldName, f.newName, uid, email);
            fixCount++;
        }
    });

    // Also remove the duplicate object participant (the phantom) after propagation
    // because the team string now has the correct name
    if (fixCount > 0) {
        fixes.forEach(function(f) {
            // Remove the object participant — their name is now in the team string
            for (var i = parts.length - 1; i >= 0; i--) {
                var p = parts[i];
                if (typeof p === 'object' && p) {
                    var nm = p.displayName || p.name || '';
                    if (nm === f.newName) {
                        // Check if their name now exists in a team string (after propagation)
                        var inTeam = parts.some(function(p2) {
                            return typeof p2 === 'string' && p2.indexOf(f.newName) !== -1 && p2.indexOf(' / ') !== -1;
                        });
                        if (inTeam) {
                            parts.splice(i, 1);
                            window._debug('[FixOrphans] Removed duplicate object "' + nm + '" (now in team string)');
                        }
                    }
                }
            }
        });

        if (window.FirestoreDB && typeof window.FirestoreDB.saveTournament === 'function') {
            t.updatedAt = new Date().toISOString();
            window.FirestoreDB.saveTournament(t).catch(function(e) { window._warn('[FixOrphans] Save error:', e); });
        }
        if (typeof showNotification === 'function') {
            showNotification(_t('utils.namesFixed'), fixes.map(function(f) { return '"' + f.oldName + '" → "' + f.newName + '"'; }).join(', '), 'info');
        }
    }
    return fixCount;
};

window._getTournamentProgress = function(t) {
    if (!t) return { total: 0, completed: 0, pct: 0 };
    var allMatches = (typeof window._collectAllMatches === 'function')
        ? window._collectAllMatches(t).slice()
        : [];
    // Defensive fallback: helper not loaded yet — replicate legacy inline scan.
    if (allMatches.length === 0 && typeof window._collectAllMatches !== 'function') {
        if (Array.isArray(t.matches)) allMatches = allMatches.concat(t.matches);
        if (Array.isArray(t.rounds)) {
            t.rounds.forEach(function(r) {
                if (Array.isArray(r.matches)) allMatches = allMatches.concat(r.matches);
            });
        }
        if (Array.isArray(t.groups)) {
            t.groups.forEach(function(g) {
                if (Array.isArray(g.matches)) allMatches = allMatches.concat(g.matches);
                if (Array.isArray(g.rounds)) {
                    g.rounds.forEach(function(gr) {
                        if (Array.isArray(gr.matches)) allMatches = allMatches.concat(gr.matches);
                    });
                }
            });
        }
        if (Array.isArray(t.rodadas)) {
            t.rodadas.forEach(function(rd) {
                if (Array.isArray(rd.matches)) allMatches = allMatches.concat(rd.matches);
                if (Array.isArray(rd.jogos)) allMatches = allMatches.concat(rd.jogos);
            });
        }
        if (t.thirdPlaceMatch) allMatches.push(t.thirdPlaceMatch);
    }
    // For elimination formats with 2+ rounds, always count 3rd place even if not yet created.
    // v1.0.91-beta: EXCLUI Dupla Eliminatória — em DE o 3º lugar vem do Lower
    // Final loser, não tem match dedicado de 3º lugar. Antes esse placeholder
    // inflava o total e gerava progresso "13/14" quando deveria ser "13/14"
    // ou "14/14" sem placeholder.
    if (!t.thirdPlaceMatch) {
        var _fmt = (t.format || '').toLowerCase();
        var _isElim = _fmt.indexOf('eliminat') === 0;
        var _isDuplaElim = _fmt.indexOf('dupla') !== -1;
        var _hasMultipleRounds = (Array.isArray(t.matches) && t.matches.some(function(m) { return m.round >= 2; }));
        if (_isElim && !_isDuplaElim && _hasMultipleRounds) {
            allMatches.push({ id: 'match-3rd-placeholder', p1: 'TBD', p2: 'TBD', winner: null });
        }
    }
    // Filter out BYE matches (keep TBD — they are real future matches)
    var realMatches = allMatches.filter(function(m) {
        var p1 = m.p1 || m.player1 || '';
        var p2 = m.p2 || m.player2 || '';
        if (m.isBye) return false;
        if (m.isSitOut) return false;
        if (p2.indexOf('BYE') === 0) return false;
        if (p1.indexOf('BYE') === 0) return false;
        return p1 && p2;
    });
    var completed = realMatches.filter(function(m) {
        return m.winner || m.result || (m.score1 !== undefined && m.score2 !== undefined && (m.score1 !== null && m.score2 !== null));
    });
    var total = realMatches.length;
    var pct = total > 0 ? Math.round((completed.length / total) * 100) : 0;
    return { total: total, completed: completed.length, pct: pct };
};
// Calculate next automatic draw date for Ranking/Suíço tournaments
window._calcNextDrawDate = function(t) {
    if (!t || !t.drawFirstDate) return null;
    var firstDrawStr = t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00');
    var firstDraw = new Date(firstDrawStr);
    if (isNaN(firstDraw.getTime())) return null;
    var intervalMs = (t.drawIntervalDays || 7) * 86400000;
    var now = new Date();
    // If first draw is in the future, that's the next one
    if (firstDraw > now) return firstDraw;
    // Calculate how many intervals have passed
    var elapsed = now.getTime() - firstDraw.getTime();
    var intervals = Math.floor(elapsed / intervalMs);
    var next = new Date(firstDraw.getTime() + (intervals + 1) * intervalMs);
    return next;
};

// Navigate to tournament detail and scroll to highlight the enrolled participant
window._scrollToParticipant = function(tId, participantName) {
    window.location.hash = '#tournaments/' + tId;
    // Wait for render, then scroll to the participant card
    var _attempts = 0;
    var _tryScroll = function() {
        _attempts++;
        var cards = document.querySelectorAll('.participant-card[data-participant-name]');
        var target = null;
        cards.forEach(function(c) {
            var n = c.getAttribute('data-participant-name') || '';
            if (n.toLowerCase().indexOf(participantName.toLowerCase()) !== -1 ||
                participantName.toLowerCase().indexOf(n.toLowerCase()) !== -1) {
                target = c;
            }
        });
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight animation
            target.style.transition = 'box-shadow 0.3s, transform 0.3s';
            target.style.boxShadow = '0 0 0 3px rgba(16,185,129,0.6), 0 0 20px rgba(16,185,129,0.3)';
            target.style.transform = 'scale(1.03)';
            setTimeout(function() {
                target.style.boxShadow = '';
                target.style.transform = '';
            }, 2500);
        } else if (_attempts < 15) {
            setTimeout(_tryScroll, 200);
        }
    };
    setTimeout(_tryScroll, 300);
};
// ── Centralized Notification System ──
// Notification levels: 'fundamental' (always sent), 'important', 'all'
// User pref notifyLevel: 'todas' (receives all), 'importantes' (fundamental+important), 'fundamentais' (only fundamental)
window._notifLevelAllowed = function(userLevel, notifLevel) {
    if (!userLevel || userLevel === 'todas') return true;
    if (userLevel === 'none') return false;
    if (userLevel === 'importantes') return notifLevel === 'fundamental' || notifLevel === 'important';
    if (userLevel === 'fundamentais') return notifLevel === 'fundamental';
    return true;
};

// ── Tournament Venue Map (detail page) ──
window._initTournamentVenueMap = async function(el) {
    if (!el || !window.google || !window.google.maps) {
        if (el) el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.75rem;">Mapa indisponível</div>';
        return;
    }
    var lat = parseFloat(el.getAttribute('data-lat'));
    var lng = parseFloat(el.getAttribute('data-lng'));
    var venueName = el.getAttribute('data-venue') || '';
    if (isNaN(lat) || isNaN(lng)) return;

    try {
        var { Map } = await google.maps.importLibrary('maps');
        var { AdvancedMarkerElement } = await google.maps.importLibrary('marker');

        var map = new Map(el, {
            center: { lat: lat, lng: lng },
            zoom: 15,
            mapId: 'scoreplace-venue-map',
            disableDefaultUI: true,
            zoomControl: true,
            gestureHandling: 'cooperative',
            clickableIcons: false,
            colorScheme: 'DARK'
        });

        var pin = document.createElement('div');
        pin.style.cssText = 'width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;';
        pin.textContent = '📍';

        new AdvancedMarkerElement({
            map: map,
            position: { lat: lat, lng: lng },
            content: pin,
            title: venueName
        });
    } catch (e) {
        window._warn('[venue-map] init error:', e);
        el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:0.75rem;">Mapa indisponível</div>';
    }
};
