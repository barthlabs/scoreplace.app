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
    // Guard: null/undefined source ou target nunca deve disparar merge
    if (!sourceName || !targetName) return;
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

    // v2.0.2: UNIFICAÇÃO — touch (celular) e drag nativo do view de detalhe
    // passam a usar o MESMO overlay de 2 botões (Mesclar / Formar equipe) do
    // view de Inscritos. Auto-detecta quem é o PLACEHOLDER (o que está na chave)
    // e quem é a PESSOA (o que não está), pra a direção do gesto não importar.
    // "Mesclar" usa o motor novo (_mergeParticipantConfirm) que tem DESFAZER.
    var placeholderName, personName;
    if (sourceInDraw && !targetInDraw) { placeholderName = sourceName; personName = targetName; }
    else if (!sourceInDraw && targetInDraw) { placeholderName = targetName; personName = sourceName; }
    else { placeholderName = targetName; personName = sourceName; } // ambos/nenhum: assume alvo = placeholder

    var arr = Array.isArray(t.participants) ? t.participants : [];
    var uidOf = function(nm) {
        var p = arr.find(function(x) { return x && typeof x === 'object' && (x.displayName || x.name) === nm; });
        return p ? (p.uid || '') : '';
    };
    var hasMatches = (Array.isArray(t.matches) && t.matches.length) ||
                     (Array.isArray(t.rounds) && t.rounds.length) ||
                     (Array.isArray(t.groups) && t.groups.length);
    var drawDone = !!hasMatches || t.status === 'started' || t.status === 'in_progress';
    var allowTeam = !drawDone && t.enrollmentMode !== 'individual';

    if (typeof window._showDropChoiceOverlay === 'function') {
        window._showDropChoiceOverlay({
            tId: tId,
            sourceName: personName, sourceUid: uidOf(personName),
            targetName: placeholderName, targetUid: uidOf(placeholderName),
            allowTeam: allowTeam
        });
    }
};

// ── Desktop HTML5 Drag-and-Drop handlers ──
window._mergeDragStart = function(e, name, tId) {
    window._mergeDragData = { name: name, tId: tId };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', name); } catch(ex) {}
    // v2.3.79: revela a estrela de co-organização (#crown-org-btn) e popula
    // window._participantDragData — assim arrastar um inscrito pós-sorteio
    // (caminho merge, ex.: Liga já sorteada) também permite soltar na estrela
    // pra torná-lo co-organizador. Antes só o caminho pré-sorteio
    // (handleDragStart) fazia isso, então em torneios já sorteados a estrela
    // nunca aparecia.
    try {
        var t = (window.AppStore && window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tId); });
        var pObj = null;
        if (t && Array.isArray(t.participants)) {
            pObj = t.participants.find(function(p) {
                var pn = (typeof p === 'string') ? p : (p.displayName || p.name || '');
                return pn === name;
            });
        }
        window._participantDragData = (pObj && typeof pObj === 'object') ? pObj : { displayName: name, name: name };
        window._participantDragTId = tId;
        var crownBtn = document.getElementById('crown-org-btn');
        if (crownBtn) crownBtn.style.display = 'flex';
    } catch (ex2) {}
    var card = e.target.closest('.participant-card') || e.target.closest('[draggable]');
    if (card) {
        card.style.opacity = '0.4';
        card.style.boxShadow = '0 0 15px rgba(251,191,36,0.4)';
    }
};

window._mergeDragEnd = function(e) {
    window._mergeDragData = null;
    window._participantDragData = null;
    var crownBtn = document.getElementById('crown-org-btn');
    if (crownBtn) crownBtn.style.display = 'none';
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

            // Auto-scroll quando o dedo chega perto das bordas superior/inferior
            // da viewport — permite arrastar participantes para fora do viewport.
            var EDGE = 90; // px da borda que ativa o scroll
            var cy = touch.clientY;
            var vh = window.innerHeight;
            if (cy < EDGE) {
                // Próximo da borda superior → scroll para cima
                var speed = Math.round(10 * (1 - cy / EDGE));
                window.scrollBy({ top: -speed, behavior: 'instant' });
                // Também tenta scroll do container pai (view-container)
                var vc = document.getElementById('view-container');
                if (vc) vc.scrollTop -= speed;
            } else if (cy > vh - EDGE) {
                // Próximo da borda inferior → scroll para baixo
                var speed2 = Math.round(10 * ((cy - (vh - EDGE)) / EDGE));
                window.scrollBy({ top: speed2, behavior: 'instant' });
                var vc2 = document.getElementById('view-container');
                if (vc2) vc2.scrollTop += speed2;
            }

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

            // CRÍTICO: salvar sourceName ANTES de _resetAll() zerar _touchSourceName.
            // Bug anterior: _resetAll() era chamado primeiro → _touchSourceName virava
            // null → _executeMerge(null, targetName) → "merge com null" / dialog errado.
            var sourceName = _touchSourceName;
            _resetAll();

            // Só executa merge se há source e target distintos
            if (sourceName && targetName && targetName !== sourceName) {
                window._executeMerge(sourceName, targetName, tId);
            }
            // Se targetName === sourceName ou null: usuário soltou no mesmo card
            // ou fora — não faz nada (comportamento correto).
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

// ─── v2.1.47: Progresso do Torneio com RITMO (verde/amarelo/vermelho) + barra
// azul de progresso PREVISTO (tempo) + rótulos vivos (início real, fim estimado
// pelo ritmo, tempo decorrido). Atualiza a cada segundo via _progressTick. ─────
window._tProgParseMs = function(s) {
  if (s == null || s === '') return null;
  if (typeof s === 'number') return s;
  var str = String(s);
  var d = new Date(str.indexOf('T') !== -1 ? str : (str + 'T12:00'));
  var ms = d.getTime();
  return isNaN(ms) ? null : ms;
};
window._tProgFmtClock = function(ms) {
  if (ms == null) return '—';
  var d = new Date(ms);
  var hh = String(d.getHours()).padStart(2, '0');
  var mm = String(d.getMinutes()).padStart(2, '0');
  var today = new Date();
  var sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  if (sameDay) return hh + ':' + mm;
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + hh + ':' + mm;
};
window._tProgFmtDur = function(ms) {
  if (ms == null || ms < 0) ms = 0;
  var s = Math.floor(ms / 1000);
  var d = Math.floor(s / 86400); s -= d * 86400;
  var h = Math.floor(s / 3600); s -= h * 3600;
  var m = Math.floor(s / 60); s -= m * 60;
  var out = [];
  if (d > 0) out.push(d + 'd');
  if (d > 0 || h > 0) out.push(h + 'h');
  out.push(m + 'm');
  out.push(s + 's');
  return out.join(' ');
};
window._estimateTournamentMinutes = function(t) {
  var prog = window._getTournamentProgress(t);
  var totalMatches = prog.total || 0;
  if (totalMatches < 1) return 0;
  var gameDur = parseInt(t.gameDuration) || 30;
  var callTime = parseInt(t.callTime) || 0;
  var warmupTime = parseInt(t.warmupTime) || 0;
  var courts = Math.max(parseInt(t.courtCount) || 1, 1);
  var timePerSlot = gameDur + callTime + warmupTime + 5;
  var slots = Math.ceil(totalMatches / courts);
  return slots * timePerSlot;
};
// v2.3.8: progresso do TORNEIO INTEIRO para Liga (todas as rodadas planejadas).
// Diferente de _getTournamentProgress, que conta só as rodadas que JÁ existem.
// Retorna null se não for Liga ou não houver rodada. perRound usa a 1ª rodada
// (sem sit-outs) como referência; roundsPlanned vem do agendamento
// (drawFirstDate..endDate / intervalo) quando agendado, senão das existentes.
window._ligaTournamentProgress = function(t) {
  if (!t || !(window._isLigaFormat && window._isLigaFormat(t))) return null;
  if (!Array.isArray(t.rounds) || t.rounds.length === 0) return null;
  var perRound = (t.rounds[0].matches || []).filter(function(m){ return !m.isSitOut; }).length;
  if (perRound < 1) return null;
  var completedAll = 0;
  t.rounds.forEach(function(r){
    (r.matches || []).forEach(function(m){ if (m.winner && !m.isSitOut) completedAll++; });
  });
  var roundsPlanned = t.rounds.length;
  if (t.drawManual !== true && t.drawFirstDate) {
    // v2.3.14: parsing robusto — drawFirstDate/endDate podem já vir com 'T<hora>'
    // (ex.: endDate "2026-06-12T19:59"). Antes concatenava 'T...' num valor que
    // já tinha T → Data inválida → roundsPlanned ficava 1 → barra roxa sumia.
    var _fdStr = String(t.drawFirstDate).indexOf('T') > -1 ? t.drawFirstDate : (t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00'));
    var firstDraw = new Date(_fdStr).getTime();
    var _endStr = t.endDate ? (String(t.endDate).indexOf('T') > -1 ? t.endDate : (t.endDate + 'T23:59:59')) : null;
    var endMs = _endStr ? new Date(_endStr).getTime() : null;
    var intervalDays = parseInt(t.drawIntervalDays) || 7; if (intervalDays < 1) intervalDays = 1;
    var intervalMs = intervalDays * 86400000;
    if (!isNaN(firstDraw) && endMs && endMs > firstDraw) {
      roundsPlanned = Math.floor((endMs - firstDraw) / intervalMs) + 1;
    }
  }
  if (roundsPlanned < t.rounds.length) roundsPlanned = t.rounds.length;
  var totalPlanned = roundsPlanned * perRound;
  var pct = totalPlanned > 0 ? Math.round(completedAll / totalPlanned * 100) : 0;
  return { perRound: perRound, completedAll: completedAll, roundsPlanned: roundsPlanned,
           totalPlanned: totalPlanned, pct: pct, currentRoundNum: t.rounds.length };
};
// HTML interno (recomputado a cada tick).
window._buildProgressInner = function(t) {
  var prog = window._getTournamentProgress(t);
  if (!prog.total) return '';
  var isFinished = t.status === 'finished' || !!t.finishedAt;
  var now = Date.now();
  var actualStart = t.tournamentStarted ? (+t.tournamentStarted) : null;
  var schedStart = window._tProgParseMs(t.startDate);
  var plannedEnd = window._tProgParseMs(t.endDate);
  if (!plannedEnd) {
    var estMin = window._estimateTournamentMinutes(t);
    var base = schedStart || actualStart;
    if (base && estMin > 0) plannedEnd = base + estMin * 60000;
  }
  if (!schedStart) schedStart = actualStart;
  var progFrac = prog.total > 0 ? (prog.completed / prog.total) : 0;

  var _time = function(ms) { var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  var _date = function(ms) { var d = new Date(ms); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };

  // ── v2.3.18: Liga → barra ESCOPADA NA RODADA ATUAL ──────────────────────
  // 🟢 verde = % da rodada concluída; 🔵 azul = tempo regulamentar (do sorteio
  // desta rodada até o PRÓXIMO sorteio); início real = 1º ponto da rodada;
  // final real = último ponto (round.completedAt).
  var _isLiga = !!(window._isLigaFormat && window._isLigaFormat(t)) && Array.isArray(t.rounds) && t.rounds.length > 0;
  var _roundComplete = false, _roundCompletedMs = null, _roundNum = 0;
  var _labelSchedStart = 'início programado', _labelSchedEnd = 'final programado', _labelHead = 'Progresso do Torneio';
  if (_isLiga) {
    var _ri = t.rounds.length - 1;
    var _curR = t.rounds[_ri] || {};
    var _rMatches = (_curR.matches || []).filter(function(m){ return !m.isSitOut; });
    var _rTotal = _rMatches.length;
    var _rDone = _rMatches.filter(function(m){ return m.winner; }).length;
    if (_rTotal > 0) { prog = { total: _rTotal, completed: _rDone, pct: Math.round(_rDone / _rTotal * 100) }; progFrac = _rDone / _rTotal; }
    _roundNum = _ri + 1;
    _roundComplete = _rTotal > 0 && _rDone === _rTotal;
    // v2.3.60: quando a rodada está 100% (todos os placares lançados), o "final
    // estimado" vira "FINAL REAL" = o momento em que o ÚLTIMO placar foi
    // concluído (último m.resultAt, gravado tanto no placar ao vivo quanto no
    // lançamento direto). Não depende de fechamento formal da rodada. Fallback
    // pro completedAt (set no _doCloseRound) pra rodadas legadas.
    var _lastResultMs = null;
    if (_roundComplete) {
      var _resEnds = _rMatches.map(function(m){ return m.resultAt ? (+m.resultAt) : 0; }).filter(function(x){ return x; });
      if (_resEnds.length) _lastResultMs = Math.max.apply(null, _resEnds);
    }
    _roundCompletedMs = _lastResultMs || (_curR.completedAt ? (+_curR.completedAt) : null);
    var _starts = _rMatches.map(function(m){ return m.startedAt ? (+m.startedAt) : 0; }).filter(function(x){ return x; });
    var _roundStart = _starts.length ? Math.min.apply(null, _starts) : null;
    var _fdStr2 = String(t.drawFirstDate || '').indexOf('T') > -1 ? t.drawFirstDate : (t.drawFirstDate ? (t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00')) : '');
    var _firstDrawMs = _fdStr2 ? new Date(_fdStr2).getTime() : NaN;
    var _intvDays = parseInt(t.drawIntervalDays) || 7; if (_intvDays < 1) _intvDays = 1;
    var _intvMs = _intvDays * 86400000;
    var _thisDraw = !isNaN(_firstDrawMs) ? _firstDrawMs + _ri * _intvMs : null;
    var _nextDraw = !isNaN(_firstDrawMs) ? _firstDrawMs + (_ri + 1) * _intvMs : null;
    if (_roundStart) actualStart = _roundStart; else if (_thisDraw) actualStart = _thisDraw;
    if (_thisDraw) schedStart = _thisDraw;
    if (_nextDraw) plannedEnd = _nextDraw;
    _labelSchedStart = 'sorteio da rodada';
    _labelSchedEnd = 'próximo sorteio';
    _labelHead = 'Rodada ' + _roundNum;
  }

  // v2.3.8/2.3.18: barra do TORNEIO inteiro (Liga multi-rodada) com data/hora
  // do 1º ponto e do limite do último ponto.
  var _ligaBarHtml = '';
  var _lp = window._ligaTournamentProgress(t);
  if (_lp && _lp.roundsPlanned > 1) {
    var _allStarts = [];
    (t.rounds || []).forEach(function(r){ (r.matches || []).forEach(function(m){ if (m && m.startedAt && !m.isSitOut) _allStarts.push(+m.startedAt); }); });
    var _firstPointMs = _allStarts.length ? Math.min.apply(null, _allStarts) : (t.tournamentStarted ? (+t.tournamentStarted) : null);
    var _deadlineMs = window._tProgParseMs(t.endDate);
    var _dtLine = (_firstPointMs || _deadlineMs)
      ? '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:0.62rem;color:var(--text-muted);">' +
          '<span>' + (_firstPointMs ? 'início: ' + _date(_firstPointMs) + ' ' + _time(_firstPointMs) : '') + '</span>' +
          '<span style="text-align:right;">' + (_deadlineMs ? '🏁 limite: ' + _date(_deadlineMs) + ' ' + _time(_deadlineMs) : '') + '</span>' +
        '</div>'
      : '';
    _ligaBarHtml = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#a78bfa;">🏆 Torneio completo</span>' +
        '<span style="font-size:0.82rem;font-weight:800;color:var(--text-bright);">' + _lp.completedAll + '/' + _lp.totalPlanned + ' jogos (' + _lp.pct + '%) · rodada ' + _lp.currentRoundNum + ' de ' + _lp.roundsPlanned + '</span>' +
      '</div>' +
      '<div style="width:100%;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">' +
        '<div style="width:' + _lp.pct + '%;height:100%;background:linear-gradient(90deg,#8b5cf6,#a78bfa);border-radius:4px;transition:width 0.5s ease;"></div>' +
      '</div>' + _dtLine +
    '</div>';
  }

  var head = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">' +
    '<span style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;opacity:0.85;">' + _labelHead + '</span>' +
    '<span style="font-size:0.92rem;font-weight:800;">' + prog.completed + '/' + prog.total + (_isLiga ? ' jogos' : ' partidas') + ' (' + prog.pct + '%)</span>' +
  '</div>';

  // Sem timeline confiável → barra simples (comportamento antigo).
  if (!actualStart || !schedStart || !plannedEnd || plannedEnd <= schedStart) {
    var c = prog.pct === 100 ? '#10b981' : (prog.pct > 50 ? '#3b82f6' : '#f59e0b');
    return head +
      '<div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">' +
        '<div style="width:' + prog.pct + '%;height:100%;background:' + c + ';border-radius:4px;transition:width 0.5s ease;"></div>' +
      '</div>' +
      (prog.pct === 100 && !isFinished ? '<div style="margin-top:6px;font-size:0.75rem;color:#10b981;font-weight:600;">✅ ' + (_isLiga ? 'Rodada concluída!' : 'Todas as partidas concluídas!') + '</div>' : '') +
      _ligaBarHtml;
  }

  var finishedMs = t.finishedAt ? (typeof t.finishedAt === 'number' ? t.finishedAt : new Date(t.finishedAt).getTime()) : null;
  if (finishedMs != null && isNaN(finishedMs)) finishedMs = null;
  // fim "real" da rodada (Liga) quando completa → congela o cronômetro
  var _roundEndReal = (_isLiga && _roundComplete && _roundCompletedMs) ? _roundCompletedMs : null;
  var endForElapsed = _roundEndReal ? _roundEndReal : ((isFinished && finishedMs != null) ? finishedMs : now);
  var elapsedMs = endForElapsed - actualStart;
  var expectedFrac = (now - schedStart) / (plannedEnd - schedStart);
  if (expectedFrac < 0) expectedFrac = 0;
  if (expectedFrac > 1) expectedFrac = 1;
  // v2.3.20: a barra azul é o TEMPO REGULAMENTAR — ela só chega a 100% na hora
  // estipulada (próximo sorteio). NÃO antecipar pra 100% só porque a rodada
  // terminou cedo. O bump só vale pro torneio inteiro finalizado.
  if (isFinished) expectedFrac = Math.max(expectedFrac, progFrac);

  var diff = expectedFrac - progFrac;
  var color;
  if (isFinished || _roundComplete || diff <= 0.02) color = '#10b981';
  else if (diff <= 0.12) color = '#f59e0b';
  else color = '#ef4444';

  var estEndMs;
  if (_roundEndReal) estEndMs = _roundEndReal;
  else if (isFinished) estEndMs = (finishedMs != null ? finishedMs : now);
  else if (progFrac > 0.001) estEndMs = actualStart + (elapsedMs / progFrac);
  else estEndMs = plannedEnd;

  var _endLabel = _roundEndReal ? 'final real' : (isFinished ? 'final real' : 'final estimado');
  var _elapsedLabel = (_roundEndReal || isFinished) ? 'durou' : 'decorrido';
  // mostra DATA quando início e fim caem em dias diferentes
  var _multiDay = _date(actualStart) !== _date(estEndMs);

  var _timeS = 'font-size:1rem;font-weight:800;color:var(--text-bright);line-height:1.1;';
  var _lblS = 'font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:700;line-height:1.25;';
  // coluna REAL: horário (+ data quando multi-dia) + label
  var _realCol = function(ms, label, align, withDate) {
    return '<div style="display:flex;flex-direction:column;align-items:' + align + ';gap:2px;min-width:0;">' +
      '<span style="' + _timeS + '">' + _time(ms) + '</span>' +
      (withDate ? '<span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;line-height:1.1;">' + _date(ms) + '</span>' : '') +
      '<span style="' + _lblS + 'text-align:' + (align === 'flex-end' ? 'right' : 'left') + ';">' + label + '</span>' +
    '</div>';
  };
  // coluna PROGRAMADO: horário + data + label (3 linhas, azul)
  var _progCol = function(ms, label, align) {
    return '<div style="display:flex;flex-direction:column;align-items:' + align + ';gap:2px;min-width:0;">' +
      '<span style="' + _timeS + 'color:#93c5fd;">' + _time(ms) + '</span>' +
      '<span style="font-size:0.72rem;color:#60a5fa;font-weight:600;line-height:1.1;">' + _date(ms) + '</span>' +
      '<span style="' + _lblS + 'color:#60a5fa;text-align:' + (align === 'flex-end' ? 'right' : 'left') + ';">' + label + '</span>' +
    '</div>';
  };

  var topRow = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px;gap:8px;">' +
    _realCol(actualStart, 'início real', 'flex-start', _multiDay) +
    '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;">' +
      '<span style="font-size:1rem;font-weight:800;color:' + color + ';font-variant-numeric:tabular-nums;line-height:1.1;white-space:nowrap;">' + window._tProgFmtDur(elapsedMs) + '</span>' +
      '<span style="' + _lblS + '">' + _elapsedLabel + '</span>' +
    '</div>' +
    _realCol(estEndMs, _endLabel, 'flex-end', _multiDay || !!_roundEndReal) +
  '</div>';
  var realBar = '<div style="width:100%;height:11px;background:rgba(255,255,255,0.1);border-radius:6px 6px 0 0;overflow:hidden;">' +
    '<div style="width:' + Math.round(progFrac * 100) + '%;height:100%;background:' + color + ';transition:width 0.5s ease,background 0.5s ease;"></div>' +
  '</div>';
  var blueBar = '<div style="width:100%;height:7px;background:rgba(255,255,255,0.06);border-radius:0 0 6px 6px;overflow:hidden;">' +
    '<div style="width:' + Math.round(expectedFrac * 100) + '%;height:100%;background:#3b82f6;transition:width 0.9s linear;"></div>' +
  '</div>';
  var botRow = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:7px;gap:8px;">' +
    _progCol(schedStart, _labelSchedStart, 'flex-start') +
    _progCol(plannedEnd, _labelSchedEnd, 'flex-end') +
  '</div>';
  return head + topRow + realBar + blueBar + botRow + _ligaBarHtml;
};
window._renderTournamentProgress = function(t) {
  var prog = window._getTournamentProgress(t);
  if (!prog.total) return '';
  window._ensureProgressTicker();
  var _id = String((t && t.id) || '').replace(/"/g, '&quot;');
  // v2.1.52: classe (não id) — o box pode existir em vários cards da dashboard
  // E no detalhe ao mesmo tempo; o ticker atualiza todas as instâncias.
  return '<div class="info-box" style="margin-top:1rem;"><div class="tourn-progress-live" data-tid="' + _id + '">' + window._buildProgressInner(t) + '</div></div>';
};
window._progressTick = function() {
  var els = document.querySelectorAll('.tourn-progress-live');
  if (!els || !els.length) return;
  var tours = (window.AppStore && window.AppStore.tournaments) || [];
  Array.prototype.forEach.call(els, function(el) {
    var tid = el.getAttribute('data-tid');
    var t = tours.find(function(x) { return String(x.id) === String(tid); });
    if (!t) return;
    try { el.innerHTML = window._buildProgressInner(t); } catch (e) {}
  });
};
window._ensureProgressTicker = function() {
  if (window._progressTickerOn) return;
  window._progressTickerOn = true;
  setInterval(window._progressTick, 1000);
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
    // Guard: participantName pode ser null para inscritos sem nome (phone-only)
    if (!participantName) return;

    // Garantir que estamos na página do torneio
    if (window.location.hash !== '#tournaments/' + tId) {
        window.location.hash = '#tournaments/' + tId;
    }

    var _attempts = 0;
    var _MAX = 30; // até ~6s de tentativas
    var _pLow = participantName.toLowerCase();

    var _tryScroll = function() {
        _attempts++;

        // Buscar em todos os cards de participante (lista de inscritos e seção sem dupla)
        var cards = document.querySelectorAll(
            '[data-participant-name], [data-merge-name], .participant-card'
        );
        var target = null;
        cards.forEach(function(c) {
            if (target) return;
            var n = (c.getAttribute('data-participant-name') ||
                     c.getAttribute('data-merge-name') || '').toLowerCase();
            if (!n) return;
            if (n.indexOf(_pLow) !== -1 || _pLow.indexOf(n) !== -1) {
                target = c;
            }
        });

        if (target) {
            // Scroll suave centralizando o card
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Highlight pulsante em verde para deixar claro que está inscrito
            target.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease, outline 0.3s ease';
            target.style.outline = '2px solid rgba(16,185,129,0.9)';
            target.style.boxShadow = '0 0 0 4px rgba(16,185,129,0.25), 0 8px 32px rgba(16,185,129,0.2)';
            target.style.transform = 'scale(1.02)';

            // Pulsar 3 vezes
            var _pulseCount = 0;
            var _pulse = setInterval(function() {
                _pulseCount++;
                if (_pulseCount % 2 === 0) {
                    target.style.boxShadow = '0 0 0 4px rgba(16,185,129,0.25), 0 8px 32px rgba(16,185,129,0.2)';
                } else {
                    target.style.boxShadow = '0 0 0 8px rgba(16,185,129,0.1), 0 8px 32px rgba(16,185,129,0.1)';
                }
                if (_pulseCount >= 6) {
                    clearInterval(_pulse);
                    setTimeout(function() {
                        target.style.outline = '';
                        target.style.boxShadow = '';
                        target.style.transform = '';
                    }, 300);
                }
            }, 400);

        } else if (_attempts < _MAX) {
            setTimeout(_tryScroll, 200);
        }
    };

    // Aguardar render inicial (inscrição otimista → re-render do Firestore)
    setTimeout(_tryScroll, 400);
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

// ── Caixa de Configuração Completa do Torneio (dinâmica, por formato) ──────────
// v2.3.90: mostra TODAS as configurações do organizador que ainda não aparecem
// no card. Lê tudo de `t`, então atualiza sozinha quando o organizador edita.
// Usada no card de detalhe (tournaments.js) e no card da dashboard (dashboard.js),
// substituindo a antiga linha "Formato · Inscrição · Acesso".
//   opts.bg    → fundo de legibilidade (sobre foto do local)
//   opts.open  → abre o <details> por padrão (detalhe = true, dashboard = false)
window._buildTournamentConfigBox = function (t, opts) {
    if (!t) return '';
    opts = opts || {};
    var esc = window._safeHtml || function (s) { return s == null ? '' : String(s); };
    var isLiga = window._isLigaFormat(t);
    var fmt = t.format || '—';

    // ── helpers de formatação ──
    function fmtDrawMode() {
        var dm = t.drawMode;
        if (isLiga) {
            if (t.ligaRoundFormat === 'rei_rainha' || dm === 'rei_rainha') return 'Rei/Rainha da Praia';
            if (t.ligaDrawMode === 'round_robin' || dm === 'round_robin') {
                var tn = parseInt(t.ligaTurnos) || 0;
                return 'Todos contra todos' + (tn ? ' (' + tn + ' turno' + (tn > 1 ? 's' : '') + ')' : '');
            }
            return 'Sorteio aleatório';
        }
        if (dm === 'rei_rainha') return 'Rei/Rainha da Praia';
        if (dm === 'round_robin') return 'Todos contra todos';
        return 'Sorteio aleatório';
    }
    function fmtGameType() {
        var gt = (t.gameTypes || '').toString().toLowerCase();
        var hasS = gt.indexOf('simples') !== -1, hasD = gt.indexOf('duplas') !== -1;
        if (!hasS && !hasD) { hasD = parseInt(t.teamSize) >= 2; hasS = !hasD; }
        if (hasS && hasD) return 'Individual (1×1) e Duplas (2×2) — 2 categorias';
        if (hasD) return 'Duplas (2×2)';
        return 'Individual (1×1)';
    }
    function fmtEnroll() {
        var m = t.enrollmentMode || 'individual';
        return m === 'time' ? 'Apenas times' : m === 'misto' ? 'Misto (individual + times)' : 'Individual';
    }
    function fmtScoring() {
        var s = t.scoring;
        if (!s || s.type !== 'sets') return 'Placar simples';
        var stw = parseInt(s.setsToWin) || 1;
        var parts = [stw <= 1 ? '1 set' : 'Melhor de ' + (stw * 2 - 1) + ' sets'];
        parts.push((parseInt(s.gamesPerSet) || 6) + ' games/set');
        if (s.countingType === 'tennis') parts.push('15/30/40');
        if (s.advantageRule) parts.push('com vantagem');
        if (s.tiebreakEnabled) parts.push('tiebreak ' + (parseInt(s.tiebreakPoints) || 7) + 'pts');
        if (s.superTiebreak) parts.push('super tiebreak ' + (parseInt(s.superTiebreakPoints) || 10) + 'pts');
        return parts.join(' · ');
    }
    function fmtResultEntry() {
        var v = t.resultEntry || 'organizer';
        var arr = Array.isArray(v) ? v : [v];
        var L = { organizer: 'Organizador', players: 'Participantes', referee: 'Árbitro' };
        var out = arr.map(function (k) { return L[k] || k; });
        return out.length ? out.join(' + ') : 'Organizador';
    }
    function fmtTiebreakers() {
        if (!Array.isArray(t.tiebreakers) || !t.tiebreakers.length) return '';
        var TB = {
            pontos_avancados: 'Pontos avançados', confronto_direto: 'Confronto direto',
            saldo_pontos: 'Saldo de pontos', saldo_sets: 'Saldo de sets', saldo_games: 'Saldo de games',
            sets_vencidos: 'Sets vencidos', games_vencidos: 'Games vencidos', tiebreaks_vencidos: 'Tiebreaks vencidos',
            vitorias: 'Vitórias', buchholz: 'Buchholz', sonneborn_berger: 'Sonneborn-Berger',
            antiguidade: 'Antiguidade', juventude: 'Juventude', sorteio: 'Sorteio'
        };
        return t.tiebreakers.map(function (k) { return TB[k] || k; }).join(' › ');
    }
    function fmtCategories() {
        var dn = window._displayCategoryName || function (c) { return c; };
        var list = [];
        if (Array.isArray(t.combinedCategories) && t.combinedCategories.length) list = t.combinedCategories.slice();
        else {
            [].concat(t.genderCategories || [], t.ageCategories || [], t.skillCategories || []).forEach(function (c) {
                if (c && list.indexOf(c) === -1) list.push(c);
            });
        }
        if (!list.length) return 'Sem categorias';
        return list.map(function (c) { return esc(dn(c)); }).join(', ');
    }
    function fmtSchedule() {
        if (!t.drawFirstDate) return '';
        var d = t.drawFirstDate;
        try { var p = d.split('-'); d = p[2] + '/' + p[1] + '/' + p[0]; } catch (e) { }
        return d + ' às ' + (t.drawFirstTime || '19:00');
    }
    function fmtPeriodicity() {
        if (t.drawManual) return 'Manual (organizador sorteia)';
        var n = parseInt(t.drawIntervalDays) || 0;
        if (!n) return '';
        return 'A cada ' + n + ' dia' + (n > 1 ? 's' : '') + ' (automático)';
    }

    // ── monta as linhas ──
    var rows = [];
    function add(label, value) {
        if (value === '' || value == null) return;
        rows.push('<div><strong>' + label + ':</strong> ' + value + '</div>');
    }

    add('Formato', esc(fmt));
    add('Modo de sorteio', fmtDrawMode());
    add('Tipo de jogo', fmtGameType());
    add('Modo de inscrição', fmtEnroll());
    add('Visibilidade', t.isPublic !== false ? 'Público' : 'Privado');
    var maxp = parseInt(t.maxParticipants) || 0;
    add('Máximo de participantes', maxp > 0 ? String(maxp) : 'Sem limite');

    if (isLiga) {
        var season = t.ligaSeasonMonths || t.rankingSeasonMonths;
        add('Temporada contínua', (t.temporada !== false)
            ? ('Sim' + (season ? ' — ' + season + ' meses' : '')) : 'Não (evento único)');
        var equil = (t.equilibrado !== false);
        add('Sorteio equilibrado', equil ? 'Sim' : 'Não');
        if (equil) {
            if (t.clusterSize) add('Tamanho do cluster', String(t.clusterSize));
            var bb = t.balanceBy || 'individual';
            add('Equilibra por', bb === 'team' ? 'Time' : 'Jogador');
        }
        var nps = t.ligaNewPlayerScore || t.rankingNewPlayerScore;
        var NPS = { zero: 'Zero', min: 'Mínima do grupo', avg: 'Média do grupo', organizer: 'Organizador decide' };
        if (nps) add('Pontuação de novos inscritos', NPS[nps] || nps);
        var inact = t.ligaInactivity || t.rankingInactivity;
        var INA = { keep: 'Manter pontos', decay: 'Decaimento', remove: 'Remover da temporada' };
        if (inact) {
            var ix = t.ligaInactivityX || t.rankingInactivityX;
            add('Regra de inatividade', (INA[inact] || inact) +
                ((inact !== 'keep' && ix) ? ' (após ' + ix + ' rodadas)' : ''));
        }
        var openEnroll = (t.ligaOpenEnrollment !== undefined) ? t.ligaOpenEnrollment
            : (t.rankingOpenEnrollment !== undefined ? t.rankingOpenEnrollment : true);
        add('Inscrição durante a temporada', openEnroll !== false ? 'Permitida' : 'Fechada após início');
        add('Fase final (playoffs)', t.playoffEnabled === true ? 'Sim' : 'Não');
        add('Agendamento do 1º sorteio', fmtSchedule());
        add('Periodicidade do sorteio', fmtPeriodicity());
    } else if (fmt === 'Grupos + Eliminatórias' || fmt === 'Grupos') {
        if (t.gruposCount) add('Número de grupos', String(t.gruposCount));
        if (t.gruposClassified) add('Classificados por grupo', String(t.gruposClassified));
    } else if (fmt === 'Suíço') {
        if (t.swissRounds) add('Rodadas', String(t.swissRounds));
        add('Agendamento do 1º sorteio', fmtSchedule());
        add('Periodicidade do sorteio', fmtPeriodicity());
    }

    add('Formato da partida', fmtScoring());
    add('Lançamento dos resultados', fmtResultEntry());
    add('Forma do W.O.', (t.woScope || 'individual') === 'time'
        ? 'Time inteiro leva W.O.' : 'Individual (substitui só o ausente)');
    // Inscrições após início / novos confrontos (formatos de chave; Liga já tratou acima)
    if (!isLiga) {
        var le = t.lateEnrollment || 'closed';
        if (le === 'expand') {
            add('Inscrições após início', 'Abertas — geram novos confrontos');
        } else {
            add('Inscrições após início', 'Fechadas após o sorteio');
        }
    }
    add('Categorias', fmtCategories());
    add('Critérios de desempate', fmtTiebreakers());

    var bgStyle = opts.bg ? ('background:' + opts.bg + ';border:1px solid rgba(255,255,255,0.12);') : '';
    var openAttr = opts.open ? ' open' : '';
    var summary = esc(fmt) + ' · ' + fmtGameType().replace(' — 2 categorias', ' (2 cat.)');

    return '<details class="info-box tourn-config-box"' + openAttr +
        ' style="font-size:0.75rem;padding:6px 10px;line-height:1.55;border-radius:8px;' + bgStyle + '">' +
        '<summary onclick="event.stopPropagation();" style="cursor:pointer;font-weight:700;list-style:none;display:flex;align-items:center;gap:6px;">' +
        '<span>⚙️</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + summary + '</span>' +
        '<span style="opacity:0.6;font-weight:500;font-size:0.68rem;">configuração ▾</span>' +
        '</summary>' +
        '<div style="margin-top:6px;display:flex;flex-direction:column;gap:2px;">' + rows.join('') + '</div>' +
        '</details>';
};
