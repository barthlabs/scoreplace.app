// Normalize format: 'Ranking' → 'Liga' (unificado em v0.2.6)
var _t = window._t || function(k) { return k; };
// Defined at top level so it's available immediately on script load
window._isLigaFormat = window._isLigaFormat || function(t) {
    return t && (t.format === 'Liga' || t.format === 'Ranking');
};

// Rei/Rainha é MODO de sorteio/chaveamento (parceiro rotativo), NÃO um formato de fase.
// A fonte da verdade é t.drawMode === 'rei_rainha' (ou ligaRoundFormat='rei_rainha' p/ Liga
// Rei/Rainha) — nunca t.format. O antigo string t.format === 'Rei/Rainha da Praia' foi APAGADO
// da campanha kill-monarch-format (jul/2026): monarch NÃO é formato, é modo de sorteio que roda
// no motor de fases via Pontos Corridos + ligaRoundFormat='rei_rainha'. Toda LÓGICA/display que
// precisa saber "é Rei/Rainha?" usa este helper — nunca compara t.format direto.
window._isMonarchFormat = window._isMonarchFormat || function(t) {
    return !!(t && (t.drawMode === 'rei_rainha' || t.ligaRoundFormat === 'rei_rainha'));
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

// ── v2.4.83: estrela de co-organização como ALVO DE SOLTAR no card do
// organizador (seção ORGANIZAÇÃO). Antes o único alvo era a estrela flutuante
// no canto inferior do card do torneio — o usuário arrastava até a estrela do
// organizador e nada acontecia. Agora o card do organizador "transforma"
// (pulsa âmbar + estrela com brilho) enquanto se arrasta um inscrito, e aceita
// o soltar pra abrir o convite de co-organização.
window._setOrgDropActive = function(on) {
  try {
    // v2.8.52: a VAGA de co-organização (.sp-org-dropzone) só aparece DURANTE o
    // arraste — body.sp-org-dragging controla a visibilidade via CSS.
    if (document.body) document.body.classList.toggle('sp-org-dragging', !!on);
    document.querySelectorAll('.sp-org-droptarget').forEach(function(el) {
      el.classList.toggle('sp-org-drag-active', !!on);
      if (!on) el.classList.remove('sp-org-drop-hover');
    });
  } catch (e) {}
};

// Retorna a entrada de co-host PENDENTE (aguardando aceite) que casa com este
// participante — por uid, e-mail ou displayName (a entrada guarda os três).
window._pendingCoHostFor = function(t, name, uid, email) {
  if (!t || !Array.isArray(t.coHosts)) return null;
  for (var i = 0; i < t.coHosts.length; i++) {
    var ch = t.coHosts[i];
    if (!ch || ch.status !== 'pending') continue;
    if (uid && ch.uid && String(ch.uid) === String(uid)) return ch;
    if (email && ch.email && String(ch.email).toLowerCase() === String(email).toLowerCase()) return ch;
    if (name && ch.displayName && String(ch.displayName) === String(name)) return ch;
  }
  return null;
};

// Tag âmbar "Aguardando aceite" com a estrela de organizador à esquerda —
// usada no card do convidado enquanto o convite de co-organização está pendente.
window._pendingCoHostBadgeHtml = function() {
  return '<span class="sp-pending-cohost" title="Convite de co-organização enviado — aguardando aceite" style="display:inline-flex;align-items:center;gap:4px;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.45);color:#fbbf24;font-size:0.6rem;font-weight:800;padding:2px 7px;border-radius:6px;letter-spacing:0.3px;white-space:nowrap;vertical-align:middle;margin-left:4px;">' +
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="#fbbf24" style="flex-shrink:0;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' +
    'Aguardando aceite</span>';
};

// ── Desktop HTML5 Drag-and-Drop handlers ──
window._mergeDragStart = function(e, name, tId) {
    window._mergeDragData = { name: name, tId: tId };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', name); } catch(ex) {}
    // v2.7.89: guarda onde o card foi pego (centra a seção compacta nesse ponto).
    window._spDragPickY = (typeof e.clientY === 'number' && e.clientY > 0) ? e.clientY : (window.innerHeight / 2);
    // v2.7.86/87: esconde o card arrastado + compacta os outros (drop mais perto).
    setTimeout(function () { if (window._markDragSource) window._markDragSource(e.target); if (window._setDragCompact) window._setDragCompact(true); }, 0);
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
        window._setOrgDropActive(true);
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
    window._setOrgDropActive(false);
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

                // Haptic de "peguei o item" no long-press (Android; iOS não
                // dispara fora de gesto direto — limitação do switch trick).
                if (window._haptic) window._haptic('medium');
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

    // v2.6.107: dedup SÓ por uid (mesma conta = mesma inscrição). Identidade = uid,
    // que é autoridade pra quem se inscreveu com a própria conta (self-enrolled).
    // NÃO mescla por e-mail/telefone/nome CACHEADO no entry: o v2.6.102 fazia isso e
    // fundia CONTAS DIFERENTES por dado velho (caso Confra: removeu a "Camila Calia"
    // achando que era o mesmo que uma conta-telefone, por e-mail cacheado errado).
    // Pessoa com 2 CONTAS de verdade é tarefa da mesclagem de CONTA (Cloud Function,
    // por e-mail/telefone REAL do perfil) — não de adivinhar aqui na lista do torneio.
    t.participants.forEach(function (p) {
        if (!p) return;
        if (typeof p === 'string') {
            if (p.indexOf(' / ') === -1 && teamMembers[p.trim().toLowerCase()]) { removedCount++; return; }
            deduped.push(p);
            return;
        }
        if (typeof p !== 'object') return;
        var pName = (p.displayName || p.name || '').trim();
        if (pName && pName.indexOf(' / ') === -1 && teamMembers[pName.toLowerCase()]) { removedCount++; return; }
        if (pName.indexOf(' / ') !== -1) { deduped.push(p); return; } // entrada de TIME
        // dedup só por uid (mesma conta). Sem uid → mantém (não inventa identidade).
        var key = p.uid ? ('uid:' + p.uid) : null;
        if (key && seen[key]) {
            removedCount++; // mesma conta inscrita 2x → descarta a repetida (mantém a 1ª)
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
            window._propagateNameChange(f.oldName, f.newName, uid, email, true); // v2.4.42: silent (fix automático)
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

// ─── v2.7.13: PLANO DE JOGOS DO TORNEIO INTEIRO (todas as fases) ──────────────
// Construtor de fases: total previsto = SOMA de todas as fases. Fase materializada
// conta jogos REAIS; próxima fase é contada RODANDO O MOTOR (não fórmula). Canônico.
window._isMultiPhase = function (t) { return !!(t && Array.isArray(t.phases) && t.phases.length > 1); };

// Jogos reais já materializados de uma fase (i=0 → t.rounds; i>0 → t.matches[phaseIndex]).
function _materializedPhaseGames(t, phaseIdx) {
  // v4.1.31: conta SLOTS de jogo, incluindo os TBD (rodadas futuras de uma chave — semis,
  // final, chave inferior, grande final ainda "a definir"). Antes excluía TBD → uma chave
  // de 8 (single 7 / dupla 14) contava só a 1ª rodada (4) → total do torneio subcontava
  // (ex.: Suíço 21 + dupla-elim = 35, mas mostrava 25). BYE/folga NÃO são jogo → fora.
  function real(m) {
    if (!m || m.isBye || m.isSitOut) return false;
    if (m.p1 === 'BYE' || m.p2 === 'BYE') return false;
    return true;
  }
  if (phaseIdx === 0) {
    // v4.1.31: fase 0 = classificatória Liga/Suíço (rodadas incrementais) → PLANEJA
    // `rodadas × jogos-por-rodada` (não só as rodadas já geradas), pra o total do TORNEIO
    // ficar ESTÁVEL durante a fase (antes crescia 21→28→35 conforme sorteava). Jogos-por-
    // rodada = floor(nº de entradas / 2) (ex.: 14 duplas → 7); usa o maior nº real já visto
    // numa rodada como piso de segurança. Grupos/Rei-Rainha da fase 0 seguem contando o real.
    var _cfg0 = (t.phases && t.phases[0]) || {};
    var _fmt0 = String(_cfg0.format || _cfg0.formatCode || '').toLowerCase();
    // Rei/Rainha = MODO de sorteio (reiRainha/drawMode), nunca formato — não lê o format string
    // (regex apagada na campanha kill-monarch-format, jul/2026).
    var _isMon0 = _cfg0.reiRainha === true || _cfg0.drawMode === 'rei_rainha';
    var _isLg0 = (_cfg0.formatCode === 'liga') || /liga|su[ií]ç|ranking|pontos/.test(_fmt0);
    // v4.x: Pontos Corridos rodada-a-rodada — INDEPENDE do modo (Rei/Rainha, sorteio simples
    // OU duplas formadas). Se a fase 0 Liga tem AGENDAMENTO (1º sorteio + repetição), o total
    // é `rodadas PLANEJADAS × jogos-por-rodada` (estável durante a fase). Rodadas planejadas =
    // _phasePlannedRounds (deriva do agendamento, piso nas sorteadas). Jogos-por-rodada = o
    // maior nº REAL de jogos já visto numa rodada (mode-agnóstico: conta o que o motor gerou),
    // com fallback pela contagem de entradas. Sem agendamento (one-shot) → real-count abaixo.
    if (_isLg0) {
      var _firstD0 = _cfg0.drawFirstDate || t.drawFirstDate || '';
      var _iv0 = parseInt((_cfg0.drawIntervalDays != null && _cfg0.drawIntervalDays !== '') ? _cfg0.drawIntervalDays : t.drawIntervalDays, 10);
      var _incremental0 = !!(_firstD0 && _iv0 >= 1);
      if (_incremental0) {
        var _planR0 = (typeof window._phasePlannedRounds === 'function') ? window._phasePlannedRounds(t, 0) : (parseInt(_cfg0.rounds, 10) || 1);
        var _perRound0 = 0;
        (t.rounds || []).forEach(function (r) { var rc = (r.matches || []).filter(real).length; if (rc > _perRound0) _perRound0 = rc; });
        if (_perRound0 < 1) {
          var _mReal0 = (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === 0 && real(m); }).length;
          if (_mReal0 > 0) _perRound0 = _mReal0;
        }
        if (_perRound0 < 1) {
          var _entries0 = Array.isArray(t.participants) ? t.participants.length : 0;
          _perRound0 = _isMon0 ? (Math.floor(_entries0 / 4) * 3) : Math.floor(_entries0 / 2);
        }
        if (_perRound0 < 1) _perRound0 = 1;
        return _planR0 * _perRound0;
      }
    }
    var c = 0;
    (t.rounds || []).forEach(function (r) { (r.matches || []).forEach(function (m) { if (real(m)) c++; }); });
    // v4.1.77: fase 0 sorteada pelo motor canônico (Rei/Rainha, Grupos) guarda os jogos
    // em t.matches TAGGEADO com phaseIndex 0 — com t.rounds VAZIO. Conta esses também,
    // senão o total do torneio subconta a fase 0 e a barra roxa (torneio inteiro) chega a
    // 100% já na fase classificatória. Mesma raiz do phaseComplete (fase 0 em t.matches).
    c += (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === 0 && real(m); }).length;
    return c;
  }
  // v3.1.16 (inc 8): Liga incremental de fase posterior conta jogos em phaseRounds[idx].
  var slot = t.phaseRounds && t.phaseRounds[phaseIdx];
  if (slot && Array.isArray(slot.rounds)) {
    var lc = 0;
    slot.rounds.forEach(function (r) { (r && r.matches || []).forEach(function (m) { if (real(m)) lc++; }); });
    return lc;
  }
  return (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === phaseIdx && real(m); }).length;
}

// v4.4.48: jogos CONCLUÍDOS (com vencedor) de UMA fase — espelha _materializedPhaseGames
// mas só conta os que já têm resultado. Usado pra escopar a barra VERDE do topo na fase
// atual (a barra roxa "Torneio completo" segue somando todas as fases). BYE/folga fora.
function _completedPhaseGames(t, phaseIdx) {
  function done(m) {
    if (!m || m.isBye || m.isSitOut) return false;
    if (m.p1 === 'BYE' || m.p2 === 'BYE') return false;
    return !!m.winner;
  }
  var c = 0;
  if (phaseIdx === 0) {
    (t.rounds || []).forEach(function (r) { (r.matches || []).forEach(function (m) { if (done(m)) c++; }); });
    c += (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === 0 && done(m); }).length;
    return c;
  }
  var slot = t.phaseRounds && t.phaseRounds[phaseIdx];
  if (slot && Array.isArray(slot.rounds)) {
    var lc = 0;
    slot.rounds.forEach(function (r) { (r && r.matches || []).forEach(function (m) { if (done(m)) lc++; }); });
    return lc;
  }
  return (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) === phaseIdx && done(m); }).length;
}

// Conta os jogos PREVISTOS de uma fase de chave RODANDO O MOTOR REAL
// (window._phasesEngine.buildPhaseBrackets) sobre os grupos da fase anterior.
// Conta jogáveis = não-BYE (inclui rodadas futuras TBD + convergência se houver).
// Como usa os grupos ATUAIS da fase anterior, grupos tardios (lista de espera)
// que aparecem na fase 0 refletem AUTOMATICAMENTE no total da fase seguinte.
function _simulatePhaseGames(t, phaseIdx) {
  var eng = window._phasesEngine;
  if (!eng || typeof eng.buildPhaseBrackets !== 'function') return null;
  var cur = t.currentPhaseIndex || 0;
  if (phaseIdx !== cur + 1) return null; // só a PRÓXIMA fase é simulável sem resultados
  var prevGroups = null;
  if (cur === 0 && typeof eng.prevPhaseGroups === 'function') prevGroups = eng.prevPhaseGroups(t);
  else if (typeof eng.bracketPhaseGroups === 'function') prevGroups = eng.bracketPhaseGroups(t, cur);
  if (!prevGroups || !prevGroups.length) return null;
  // computeStandings só precisa devolver os participantes do grupo (a CONTAGEM da
  // chave depende de quantos entram por linha, não de QUEM). Ordem não importa.
  var cs = function (g) {
    var ps = (g && (g.players || g.participants || g.standings)) || [];
    return ps.map(function (p) {
      var nm = (typeof p === 'string') ? p : (p && (p.displayName || p.name)) || '';
      return { name: nm, displayName: nm };
    });
  };
  try {
    var built = eng.buildPhaseBrackets(prevGroups, t.phases[phaseIdx], cs, 'plan-' + phaseIdx);
    var _uc = (built.matches || []).filter(function (m) {
      return m && !m.isBye && m.p1 !== 'BYE' && m.p2 !== 'BYE';
    }).length;
    // v4.1.31: Dupla Eliminatória clássica → buildPhaseBrackets devolve só a R1 do upper
    // (uc jogos) + needsDoubleElim. O TOTAL da dupla-elim de N entrantes (uc*2, pot2) é
    // 2N−2 = 4*uc−2 (upper N−1 + lower N−2 + grande final 1). Sem isto contava só a R1.
    if (built.needsDoubleElim && _uc > 0) return (4 * _uc) - 2;
    return _uc;
  } catch (e) { if (window._warn) window._warn('[plan] sim falhou', e); return null; }
}

// PLANO canônico: total de jogos previstos somando TODAS as fases.
// Fase materializada = jogos reais (fase 0 inclui grupos tardios da lista de espera).
// Próxima fase = simulada pelo MOTOR real (single-elim por linha + convergência).
window._tournamentGamesPlan = function (t) {
  var prog = window._getTournamentProgress(t);
  var done = prog.completed != null ? prog.completed : (prog.completedAll || 0);
  if (!window._isMultiPhase(t)) {
    var lp = window._ligaTournamentProgress(t);
    var totalSingle = lp ? lp.totalPlanned : prog.total;
    return { multiPhase: false, totalPlanned: totalSingle, totalDone: done,
             pct: totalSingle > 0 ? Math.round(done / totalSingle * 100) : 0, phasesCount: 1 };
  }
  var phases = t.phases;
  var curIdx = t.currentPhaseIndex || 0;
  var totalP = 0, simComplete = true;
  for (var i = 0; i < phases.length; i++) {
    if (i <= curIdx) {
      totalP += _materializedPhaseGames(t, i);            // fase já sorteada → jogos reais
    } else if (i === curIdx + 1) {
      var sim = _simulatePhaseGames(t, i);                // próxima fase → motor real
      if (sim == null) simComplete = false; else totalP += sim;
    } else {
      simComplete = false;                                // fases 3+ só entram ao materializar a anterior
    }
  }
  if (totalP < done) totalP = done;
  return { multiPhase: true, totalPlanned: totalP, totalDone: done,
           pct: totalP > 0 ? Math.round(done / totalP * 100) : 0,
           phasesCount: phases.length, currentPhaseIndex: curIdx, partial: !simComplete };
};

// v4.4.48: progresso da FASE ATUAL (só o estágio corrente) — total = jogos planejados
// da fase, done = jogos já concluídos dela. Escopa a barra VERDE do topo na fase (não no
// torneio inteiro): numa Fase de Grupos com 72 jogos, quando os 72 saem → 100% (e o botão
// de avançar fase aparece). Rodadas de grupos diferentes se encavalam → escopar por RODADA
// enganaria; a fase toda é a medida certa. Torneio inteiro segue na barra roxa (_gp).
window._currentPhaseGames = function (t) {
  var idx = (t && t.currentPhaseIndex) || 0;
  var total = _materializedPhaseGames(t, idx);
  var done = _completedPhaseGames(t, idx);
  if (total < done) total = done;
  return { total: total, done: done, pct: total > 0 ? Math.round(done / total * 100) : 0, phaseIndex: idx };
};

// Janela PROGRAMADA do TORNEIO INTEIRO: início = MENOR data de início entre todas
// as fases (e top-level); fim = MAIOR data de fim entre todas as fases. No multi-
// fase o fim do torneio é o fim da ÚLTIMA fase (ex.: Confra = 12/11), não o fim da
// fase atual (19/06). Datas por fase: phase.startDate/startTime, phase.endDate/endTime.
window._tournamentScheduledWindow = function (t) {
  var starts = [], ends = [];
  function add(arr, dateStr, timeStr) {
    if (!dateStr) return;
    var s = String(dateStr).indexOf('T') > -1 ? dateStr : (dateStr + (timeStr ? ('T' + timeStr) : ''));
    var ms = window._tProgParseMs(s); if (ms != null) arr.push(ms);
  }
  add(starts, t.startDate, t.startTime);
  add(ends, t.endDate, t.endTime);
  if (Array.isArray(t.phases)) t.phases.forEach(function (ph) {
    add(starts, ph.startDate, ph.startTime);
    add(ends, ph.endDate, ph.endTime);
  });
  return {
    startMs: starts.length ? Math.min.apply(null, starts) : null,
    endMs: ends.length ? Math.max.apply(null, ends) : null
  };
};

// v4.3.8: progresso da RODADA ATUAL da fase POSTERIOR (chaves em t.matches, phaseIndex>=1).
// Agrupa os jogos da fase por `round` (as trilhas paralelas — ex.: Ouro/Prata — somam no
// mesmo round). Rodada atual = a 1ª (ordenada) com jogo pendente; se todas prontas, a última.
// roundNum = índice sequencial da rodada dentro da fase (1-based). BYE/sit-out não contam.
window._phaseCurrentRoundProgress = function(t) {
  var _cp = (t && t.currentPhaseIndex) || 0;
  if (!t || _cp < 1 || !Array.isArray(t.matches)) return null;
  var _isBye = window._isByeMatch || function(m){ return !!(m && m.isBye); };
  var pm = t.matches.filter(function(m){ return m && (m.phaseIndex || 0) === _cp && !_isBye(m) && !m.isSitOut; });
  if (!pm.length) return null;
  var byRound = {};
  pm.forEach(function(m){ var r = (m.round == null ? 1 : m.round); (byRound[r] = byRound[r] || []).push(m); });
  var rounds = Object.keys(byRound).map(Number).sort(function(a, b){ return a - b; });
  var curR = null, gi;
  for (gi = 0; gi < rounds.length; gi++) {
    var g = byRound[rounds[gi]];
    if (g.filter(function(m){ return m.winner; }).length < g.length) { curR = rounds[gi]; break; }
  }
  if (curR == null) curR = rounds[rounds.length - 1];
  var cur = byRound[curR];
  var total = cur.length, done = cur.filter(function(m){ return m.winner; }).length;
  var starts = [], ends = [];
  cur.forEach(function(m){ if (m.startedAt) starts.push(+m.startedAt); if (m.resultAt) ends.push(+m.resultAt); });
  var _idx = rounds.indexOf(curR);
  // v4.3.16: NOME FUNCIONAL da rodada (Oitavas/Quartas/Semifinais/Final/3º lugar), por
  // ANALOGIA à nomeação das colunas do bracket — mas contando jogos POR TRILHA (Ouro/Prata
  // somam no mesmo round, então dividimos pelo nº de trilhas). Jogo de 3º lugar não conta
  // como "avanço". Só padrão (1/2/4/8 por trilha) recebe nome; senão "Rodada N".
  var _t2 = window._t || function(k){ return k; };
  var _bks = {}, _thirdN = 0, _isGrand = false;
  cur.forEach(function(m){
    if (m.isThirdPlace) _thirdN++;
    var bk = m.bracket || 'main';
    if (bk === 'grand' || bk === 'grandfinal') _isGrand = true; else _bks[bk] = 1;
  });
  var _nBk = Math.max(Object.keys(_bks).length, 1);
  var _advN = total - _thirdN;
  var _perTier = Math.round(_advN / _nBk);
  var _name;
  if (_isGrand) _name = _t2('bracket.grandFinal');
  else if (_advN === 0 && _thirdN > 0) _name = 'Disputa de 3º/4º lugar';
  else if (_perTier === 1) _name = _t2('bracket.final');
  else if (_perTier === 2) _name = _t2('bracket.semiFinal');
  else if (_perTier === 4) _name = _t2('bracket.quarterFinal');
  else if (_perTier === 8) _name = _t2('bracket.roundOf16');
  else _name = _t2('bracket.round', { n: _idx + 1 });
  // fallback se a chave i18n não resolveu (retornou a própria chave)
  if (!_name || _name.indexOf('bracket.') === 0) _name = 'Rodada ' + (_idx + 1);
  return {
    roundNum: _idx + 1,
    name: _name,
    total: total, done: done, pct: total ? Math.round(done / total * 100) : 0,
    complete: total > 0 && done === total,
    roundStartMs: starts.length ? Math.min.apply(null, starts) : null,
    roundEndMs: (done === total && ends.length) ? Math.max.apply(null, ends) : null
  };
};

// HTML interno (recomputado a cada tick).
window._buildProgressInner = function(t) {
  var prog = window._getTournamentProgress(t);
  // v4.4.48: Multi-fase (ex.: Fase de Grupos → Eliminatória): a barra VERDE do topo reflete
  // a FASE ATUAL (só o estágio corrente). Numa classificatória de 72 jogos, quando os 72
  // saem → 100% e o botão "avançar de fase" aparece — é o que o dono quer VER no topo. O
  // TORNEIO INTEIRO (soma todas as fases) vive na barra ROXA "🏆 Torneio completo" (_gp).
  // Rodadas de grupos diferentes se encavalam → escopar por rodada enganaria; a fase toda é
  // a medida certa. Liga (Pontos Corridos) e fase posterior de chave têm escopo-de-rodada
  // próprio nos ramos _isLiga / _inLaterPhase abaixo (que re-sobrepõem este prog).
  if (window._isMultiPhase && window._isMultiPhase(t) && typeof window._currentPhaseGames === 'function') {
    var _cpHead = window._currentPhaseGames(t);
    if (_cpHead && _cpHead.total > 0) {
      prog = { total: _cpHead.total, completed: _cpHead.done, pct: _cpHead.pct };
    }
  }
  if (!prog.total) return '';
  var isFinished = t.status === 'finished' || !!t.finishedAt;
  var now = Date.now();
  // INÍCIO EFETIVO = tournamentStarted OU, na falta dele, o PRIMEIRO jogo jogado (menor
  // startedAt/resultAt). Lançar resultado É iniciar → a barra não pode ficar em "aguardando
  // início" quando já há placar na mesa. FIM EFETIVO = último jogo (maior resultAt); vira o
  // fim real quando o torneio encerra. Assim início e fim ficam registrados a partir dos JOGOS.
  var _allStampsG = [], _endStampsG = [];
  ((typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : (t.matches || [])).forEach(function (m) {
    if (!m || m.isBye || m.isSitOut) return;
    if (m.startedAt) _allStampsG.push(+m.startedAt);
    if (m.resultAt) { _allStampsG.push(+m.resultAt); _endStampsG.push(+m.resultAt); }
  });
  var _earliestGameMs = _allStampsG.length ? Math.min.apply(null, _allStampsG) : null;
  var _latestGameMs = _endStampsG.length ? Math.max.apply(null, _endStampsG) : null;
  var actualStart = t.tournamentStarted ? (+t.tournamentStarted) : _earliestGameMs;
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
  var _mp = !!(window._isMultiPhase && window._isMultiPhase(t));
  var _cp = t.currentPhaseIndex || 0;
  // v4.3.8: fase POSTERIOR materializada (chaves em t.matches) → a barra verde ("rodada")
  // reflete a RODADA ATUAL DESSA fase, não os rounds da Fase 0 (t.rounds). Senão ficava
  // presa na última rodada da classificatória (bug: "RODADA 1 75/75" estando na R1 da fase 2).
  var _inLaterPhase = _mp && _cp >= 1 && Array.isArray(t.matches) && t.matches.some(function(m){ return m && (m.phaseIndex || 0) === _cp; });
  var _isLiga = !!(window._isLigaFormat && window._isLigaFormat(t)) && Array.isArray(t.rounds) && t.rounds.length > 0 && !_inLaterPhase;
  var _phaseRoundActive = false;
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
    // v4.x: "Rodada N de M" (mesmo estilo do "fase 1 de 2") — M = rodadas PLANEJADAS da fase
    // atual, derivadas do agendamento (window._phasePlannedRounds). Só quando faz sentido
    // (fase multi-rodada de Pontos Corridos); rodada única mostra só "Rodada N".
    var _plannedPhR = (typeof window._phasePlannedRounds === 'function') ? window._phasePlannedRounds(t, t.currentPhaseIndex || 0) : 0;
    _labelHead = (_plannedPhR > 1 && _plannedPhR >= _roundNum)
      ? ('Rodada ' + _roundNum + ' de ' + _plannedPhR)
      : ('Rodada ' + _roundNum);
    // v2.7.12: MULTI-FASE — a fase atual NÃO tem intervalo de sorteio (ex.: Fase 0
    // Rei/Rainha de 1 rodada). O "programado" usa as DATAS CONFIGURADAS (fase ou
    // torneio), nunca 1ºsorteio+intervalo (era de onde saía o 25/06). Sem data
    // configurada → estima pelo tempo de quadra desta rodada. Rótulos viram
    // "início/final programado" (não há "próximo sorteio" em rodada única).
    if (_mp) {
      var _ph = (t.phases && t.phases[t.currentPhaseIndex || 0]) || {};
      var _cfgStartMs = window._tProgParseMs(_ph.startDate ? (_ph.startDate + (_ph.startTime ? ('T' + _ph.startTime) : '')) : '') || window._tProgParseMs(t.startDate);
      var _cfgEndMs = window._tProgParseMs(_ph.endDate ? (_ph.endDate + (_ph.endTime ? ('T' + _ph.endTime) : '')) : '') || window._tProgParseMs(t.endDate);
      if (_cfgStartMs) schedStart = _cfgStartMs;
      if (_cfgEndMs) { plannedEnd = _cfgEndMs; }
      else {
        var _gdMp = parseInt(t.gameDuration) || 30, _ctMp = parseInt(t.callTime) || 0, _wuMp = parseInt(t.warmupTime) || 0;
        var _crtMp = Math.max(parseInt(t.courtCount) || 1, 1), _slotMp = _gdMp + _ctMp + _wuMp + 5;
        plannedEnd = (schedStart || actualStart || Date.now()) + Math.ceil(_rTotal / _crtMp) * _slotMp * 60000;
      }
      // v2.8.8: multi-fase — "início real" é SÓ o 1º ponto da rodada (_roundStart).
      // Não herdar tournamentStarted (linha ~840) nem o fallback _thisDraw (linha ~890):
      // no multi-fase _thisDraw vem de drawFirstDate+intervalo (que NÃO se aplica) e
      // gerava "INÍCIO REAL 21/06 (futuro/passado) + DECORRIDO 0/21h". Sem ponto jogado
      // → actualStart null → _notStarted true → selo "⏳ Aguardando início".
      actualStart = _roundStart || null;
      _labelSchedStart = 'início programado';
      _labelSchedEnd = 'final programado';
    }
  }

  // v4.3.8: barra verde ESCOPADA NA RODADA ATUAL DA FASE POSTERIOR (chaves em t.matches).
  // A rodada = grupo de jogos com o mesmo `round` (as duas trilhas Ouro/Prata somam — R1 da
  // fase 2 com 24 jogos + 2 repescagem = 26; R2 = 16; e por aí). Rodada atual = a 1ª com
  // jogo pendente; se todas prontas, a última. Sobrepõe o prog do torneio inteiro (que fica
  // na barra roxa) só pra ESTA barra verde.
  if (_inLaterPhase && typeof window._phaseCurrentRoundProgress === 'function') {
    var _pr = window._phaseCurrentRoundProgress(t);
    if (_pr && _pr.total > 0) {
      _phaseRoundActive = true;
      prog = { total: _pr.total, completed: _pr.done, pct: _pr.pct };
      progFrac = _pr.total ? (_pr.done / _pr.total) : 0;
      _roundNum = _pr.roundNum;
      _roundComplete = _pr.complete;
      _roundCompletedMs = _pr.roundEndMs;
      _labelHead = _pr.name || ('Rodada ' + _roundNum);
      _labelSchedStart = 'início programado';
      _labelSchedEnd = 'final programado';
      actualStart = _pr.roundStartMs || null;
      var _phL = (t.phases && t.phases[_cp]) || {};
      var _cfgSL = window._tProgParseMs(_phL.startDate ? (_phL.startDate + (_phL.startTime ? ('T' + _phL.startTime) : '')) : '') || window._tProgParseMs(t.startDate);
      var _cfgEL = window._tProgParseMs(_phL.endDate ? (_phL.endDate + (_phL.endTime ? ('T' + _phL.endTime) : '')) : '') || window._tProgParseMs(t.endDate);
      if (_cfgSL) schedStart = _cfgSL;
      if (_cfgEL) { plannedEnd = _cfgEL; }
      else {
        var _gdL = parseInt(t.gameDuration) || 30, _ctL = parseInt(t.callTime) || 0, _wuL = parseInt(t.warmupTime) || 0;
        var _crtL = Math.max(parseInt(t.courtCount) || 1, 1), _slotL = _gdL + _ctL + _wuL + 5;
        plannedEnd = (schedStart || actualStart || Date.now()) + Math.ceil(_pr.total / _crtL) * _slotL * 60000;
      }
    }
  }

  // v2.3.8/2.3.18: barra do TORNEIO inteiro (Liga multi-rodada) com data/hora
  // do 1º ponto e do limite do último ponto.
  var _ligaBarHtml = '';
  var _lp = window._ligaTournamentProgress(t);
  var _gp = (window._tournamentGamesPlan ? window._tournamentGamesPlan(t) : null);
  // v2.7.12: a barra "Torneio completo" aparece na Liga multi-rodada E no
  // construtor de fases (soma TODAS as fases via _tournamentGamesPlan).
  var _useGp = _mp && _gp && _gp.totalPlanned > 0;
  if ((_lp && _lp.roundsPlanned > 1) || _useGp) {
    var _barDone = _useGp ? _gp.totalDone : _lp.completedAll;
    var _barTotal = _useGp ? _gp.totalPlanned : _lp.totalPlanned;
    var _barPct = _useGp ? _gp.pct : _lp.pct;
    var _barSuffix = _useGp ? (' · fase ' + (((_gp.currentPhaseIndex) || 0) + 1) + ' de ' + _gp.phasesCount) : (' · rodada ' + _lp.currentRoundNum + ' de ' + _lp.roundsPlanned);
    // v2.4.78: duração REAL do torneio inteiro — do 1º placar lançado (primeiro
    // m.startedAt de todas as rodadas) ao último (maior m.resultAt). Espelha o
    // painel da rodada (INÍCIO REAL / DUROU / FINAL REAL), mas cobrindo a Liga
    // toda. Inclui naturalmente os dias ociosos entre rodadas.
    var _allStarts = [], _allEnds = [], _endsFallback = [];
    (t.rounds || []).forEach(function(r){
      (r.matches || []).forEach(function(m){
        if (!m || m.isSitOut) return;
        if (m.startedAt) _allStarts.push(+m.startedAt);
        if (m.resultAt) _allEnds.push(+m.resultAt);
      });
      if (r && r.completedAt) _endsFallback.push(+r.completedAt);
    });
    // v2.7.12: fases de chave (1+) vivem em t.matches → cobrem o fim REAL do torneio.
    if (_mp) (t.matches || []).forEach(function(m){
      if (!m || m.isSitOut) return;
      if (m.startedAt) _allStarts.push(+m.startedAt);
      if (m.resultAt) _allEnds.push(+m.resultAt);
    });
    var _firstPointMs = _allStarts.length ? Math.min.apply(null, _allStarts) : (t.tournamentStarted ? (+t.tournamentStarted) : null);
    var _lastPointMs = _allEnds.length ? Math.max.apply(null, _allEnds) : (_endsFallback.length ? Math.max.apply(null, _endsFallback) : null);
    // v2.7.14: fim do torneio inteiro = fim da ÚLTIMA fase (janela programada),
    // não t.endDate (que no multi-fase é a fase ATUAL, ex.: 19/06). O fim real é
    // o da última fase (ex.: Confra 12/11). Janela também dá o início do todo.
    var _win = (_mp && window._tournamentScheduledWindow) ? window._tournamentScheduledWindow(t) : null;
    var _deadlineMs = (_win && _win.endMs) ? _win.endMs : window._tProgParseMs(t.endDate);
    var _tournDone = _barPct >= 100;

    // Linha INÍCIO REAL / DUROU / FINAL REAL (só quando há 1º e último placar).
    var _durRow = '';
    if (_firstPointMs && _lastPointMs && _lastPointMs >= _firstPointMs) {
      var _tDurMs = _lastPointMs - _firstPointMs;
      var _tColor = _tournDone ? '#10b981' : 'var(--text-bright)';
      var _tEndLabel = _tournDone ? 'final real' : 'último placar lançado';
      var _tDurLabel = _tournDone ? 'durou' : 'decorrido';
      var _tTimeS = 'font-size:1rem;font-weight:800;color:var(--text-bright);line-height:1.1;';
      var _tLblS = 'font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:700;line-height:1.25;';
      var _tCol = function(ms, label, align) {
        return '<div style="display:flex;flex-direction:column;align-items:' + align + ';gap:2px;min-width:0;">' +
          '<span style="' + _tTimeS + '">' + _time(ms) + '</span>' +
          '<span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;line-height:1.1;">' + _date(ms) + '</span>' +
          '<span style="' + _tLblS + 'text-align:' + (align === 'flex-end' ? 'right' : 'left') + ';">' + label + '</span>' +
        '</div>';
      };
      // v4.x: no TORNEIO COMPLETO só mostramos "final real" QUANDO encerra — o "último
      // placar lançado" era redundante (já aparece no painel da rodada) e, sendo largo,
      // descentralizava o DECORRIDO. Grid 1fr/auto/1fr mantém o DECORRIDO SEMPRE centrado
      // (a 3ª coluna fica vazia enquanto o torneio corre).
      var _rightCol = _tournDone ? _tCol(_lastPointMs, 'final real', 'flex-end') : '<div></div>';
      _durRow = '<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:flex-start;margin-top:9px;gap:8px;">' +
        _tCol(_firstPointMs, 'início real', 'flex-start') +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;">' +
          '<span style="font-size:1rem;font-weight:800;color:' + _tColor + ';font-variant-numeric:tabular-nums;line-height:1.1;white-space:nowrap;">' + window._tProgFmtDur(_tDurMs) + '</span>' +
          '<span style="' + _tLblS + '">' + _tDurLabel + '</span>' +
        '</div>' +
        _rightCol +
      '</div>';
    }
    // Limite (prazo do torneio). v2.4.79: torneio JÁ encerrado (100%) não mostra
    // mais o prazo — o '🏁 limite' só interessa enquanto há jogos por lançar.
    var _showLimite = !!_deadlineMs && !_tournDone;
    var _limiteLine = _durRow
      ? (_showLimite ? '<div style="display:flex;justify-content:flex-end;margin-top:6px;font-size:0.62rem;color:var(--text-muted);"><span>🏁 limite: ' + _date(_deadlineMs) + ' ' + _time(_deadlineMs) + '</span></div>' : '')
      : ((_firstPointMs || _showLimite)
          ? '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:0.62rem;color:var(--text-muted);">' +
              '<span>' + (_firstPointMs ? 'início: ' + _date(_firstPointMs) + ' ' + _time(_firstPointMs) : '') + '</span>' +
              '<span style="text-align:right;">' + (_showLimite ? '🏁 limite: ' + _date(_deadlineMs) + ' ' + _time(_deadlineMs) : '') + '</span>' +
            '</div>'
          : '');

    // v2.7.14: linha PROGRAMADO do TORNEIO INTEIRO (início da 1ª fase → fim da
    // última fase). Responde "cadê o início do torneio todo" e mostra o fim real
    // (12/11) em vez do fim da fase atual. Só multi-fase com janela definida; nesse
    // caso substitui o "🏁 limite" (que vira redundante com o "fim programado").
    var _schedRow = '';
    if (_win && _win.startMs && _win.endMs) {
      var _spLblS = 'font-size:0.6rem;color:#60a5fa;text-transform:uppercase;letter-spacing:0.4px;font-weight:700;line-height:1.25;';
      var _spCol = function(ms, label, align) {
        return '<div style="display:flex;flex-direction:column;align-items:' + align + ';gap:2px;min-width:0;">' +
          '<span style="font-size:1rem;font-weight:800;color:#93c5fd;line-height:1.1;">' + _time(ms) + '</span>' +
          '<span style="font-size:0.72rem;color:#60a5fa;font-weight:600;line-height:1.1;">' + _date(ms) + '</span>' +
          '<span style="' + _spLblS + 'text-align:' + (align === 'flex-end' ? 'right' : 'left') + ';">' + label + '</span>' +
        '</div>';
      };
      _schedRow = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:9px;gap:8px;">' +
        _spCol(_win.startMs, 'início programado', 'flex-start') +
        _spCol(_win.endMs, 'fim programado', 'flex-end') +
      '</div>';
    }

    _ligaBarHtml = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#a78bfa;">🏆 Torneio completo</span>' +
        '<span style="font-size:0.82rem;font-weight:800;color:var(--text-bright);">' + _barDone + '/' + _barTotal + ' jogos (' + _barPct + '%)' + _barSuffix + '</span>' +
      '</div>' +
      '<div style="width:100%;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;overflow:hidden;">' +
        '<div style="width:' + _barPct + '%;height:100%;background:linear-gradient(90deg,#8b5cf6,#a78bfa);border-radius:4px;transition:width 0.5s ease;"></div>' +
      '</div>' + _durRow + (_schedRow || _limiteLine) +
    '</div>';
  }

  // Status "Torneio em andamento" no TOPO e CENTRO do box (pedido do dono) — verde pulsando.
  // Só no estado ATIVO; "encerrado" e "aguardando início" já têm indicadores próprios abaixo
  // (evita duplicar). Substitui o badge separado que ficava embaixo (tournaments.js).
  var _statusLine = (!isFinished && actualStart)
    ? '<div style="text-align:center;margin-bottom:9px;font-size:0.85rem;font-weight:800;color:#4ade80;display:flex;align-items:center;justify-content:center;gap:7px;">' +
        '<span style="width:9px;height:9px;border-radius:50%;background:#10b981;display:inline-block;flex-shrink:0;animation:pulse 2s infinite;"></span>Torneio em andamento</div>'
    : '';
  var head = _statusLine +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">' +
    '<span style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;opacity:0.85;">' + _labelHead + '</span>' +
    '<span style="font-size:0.92rem;font-weight:800;">' + prog.completed + '/' + prog.total + ((_isLiga || _phaseRoundActive) ? ' jogos' : ' partidas') + ' (' + prog.pct + '%)</span>' +
  '</div>';

  // v2.7.79: barra simples ("pobre") SÓ quando não há janela programada (sem
  // início/fim confiável). Antes exigia também actualStart → torneio sorteado mas
  // ainda não iniciado caía na pobre mesmo tendo datas. Agora, havendo janela, usa
  // a barra RICA em modo "aguardando início" (sem a linha de tempo real ainda).
  if (!schedStart || !plannedEnd || plannedEnd <= schedStart) {
    // v2.7.79: sem âncora de tempo (torneio sem data E sem 1º jogo lançado) não dá
    // pra desenhar a janela programada. Mesmo assim NUNCA mostra a barra pelada:
    // estado "⏳ Aguardando início" + DURAÇÃO ESTIMADA (defaults quando faltam os
    // campos). Quando o 1º placar é lançado (grava tournamentStarted) ou há data,
    // sobe pra barra rica completa (dupla verde+azul + horários).
    var c = prog.pct === 100 ? '#10b981' : (prog.pct > 50 ? '#3b82f6' : '#f59e0b');
    var _pending = !isFinished && prog.pct < 100 && !actualStart;
    var _waitTop2 = _pending
      ? '<div style="text-align:center;margin-bottom:8px;font-size:0.82rem;font-weight:700;color:#93c5fd;">⏳ Aguardando início</div>'
      : '';
    var _estMin2 = Math.round(window._estimateTournamentMinutes ? (window._estimateTournamentMinutes(t) || 0) : 0);
    var _estH = Math.floor(_estMin2 / 60), _estM = _estMin2 % 60;
    var _estStr2 = _estH > 0 ? (_estH + 'h' + (_estM ? (' ' + _estM + 'min') : '')) : (_estM + 'min');
    var _estLine2 = (_pending && _estMin2 > 0)
      ? '<div style="margin-top:7px;font-size:0.72rem;color:#93c5fd;font-weight:600;text-align:center;">⏱️ Duração estimada: ~' + _estStr2 + '</div>'
      : '';
    return head + _waitTop2 +
      '<div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">' +
        '<div style="width:' + prog.pct + '%;height:100%;background:' + c + ';border-radius:4px;transition:width 0.5s ease;"></div>' +
      '</div>' +
      (prog.pct === 100 && !isFinished ? '<div style="margin-top:6px;font-size:0.75rem;color:#10b981;font-weight:600;">✅ ' + ((_isLiga || _phaseRoundActive) ? 'Rodada concluída!' : 'Todas as partidas concluídas!') + '</div>' : '') +
      _estLine2 +
      _ligaBarHtml;
  }

  var finishedMs = t.finishedAt ? (typeof t.finishedAt === 'number' ? t.finishedAt : new Date(t.finishedAt).getTime()) : null;
  if (finishedMs != null && isNaN(finishedMs)) finishedMs = null;
  // fim "real" da rodada (Liga) quando completa → congela o cronômetro
  var _roundEndReal = ((_isLiga || _phaseRoundActive) && _roundComplete && _roundCompletedMs) ? _roundCompletedMs : null;
  var endForElapsed = _roundEndReal ? _roundEndReal : ((isFinished && finishedMs != null) ? finishedMs : now);
  // v2.7.79: não iniciado (sorteado, sem 1º ponto) → modo "aguardando início":
  // não há "início real / decorrido"; usamos só a janela programada + barras.
  var _notStarted = !actualStart;
  var elapsedMs = _notStarted ? 0 : (endForElapsed - actualStart);
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
  // FIM REAL do torneio encerrado = ÚLTIMO jogo jogado (maior resultAt); só cai no finishedAt/
  // now se não houver jogo com resultado. Assim o fim mostra a hora/dia do jogo final, não a
  // hora em que o status virou 'finished'.
  else if (isFinished) estEndMs = (_latestGameMs != null ? _latestGameMs : (finishedMs != null ? finishedMs : now));
  else if (!_notStarted && progFrac > 0.001) estEndMs = actualStart + (elapsedMs / progFrac);
  else estEndMs = plannedEnd;

  var _endLabel = _roundEndReal ? 'final real' : (isFinished ? 'final real' : 'final estimado');
  var _elapsedLabel = (_roundEndReal || isFinished) ? 'durou' : 'decorrido';
  // mostra DATA (dia) na linha REAL quando: (a) início e fim reais caem em dias diferentes, OU
  // (b) o dia REAL dos jogos difere do dia PROGRAMADO (ex.: jogado hoje, programado p/ 25/07) —
  // aí o horário sozinho engana. Pedido do dono.
  var _multiDay = !_notStarted && (
    _date(actualStart) !== _date(estEndMs) ||
    (schedStart && _date(actualStart) !== _date(schedStart)) ||
    (schedStart && _date(estEndMs) !== _date(schedStart))
  );

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

  // v2.7.79: antes de iniciar não há "início real / decorrido" — mostra só um
  // selo "⏳ Aguardando início" (a janela programada vem na linha de baixo).
  var topRow = _notStarted
    ? '<div style="text-align:center;margin-bottom:8px;font-size:0.82rem;font-weight:700;color:#93c5fd;">⏳ Aguardando início</div>'
    : '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px;gap:8px;">' +
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
  // v4.0.60: SOBRE FOTO DE CAPA a seção inteira recebe a tarja de leitura
  // (window._photoReadBox, tema-aware) + texto CLARO com !important na div viva —
  // senão o header "Progresso"/contagens (que herdam a cor) somem sobre a foto.
  // Os textos coloridos (azul/roxo/verde/vermelho) já são legíveis sobre escuro.
  // !important vence a inversão de cor do tema claro (css/style.css).
  var _hasPhoto = !!(t && (t.coverPhotoData || t.venuePhotoUrl));
  var _rb = (_hasPhoto && typeof window._photoReadBox === 'function') ? window._photoReadBox() : null;
  var _wrapStyle = _rb
    ? 'margin-top:1rem;padding:14px 16px;border-radius:14px;background:' + _rb.bg + ';backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid ' + _rb.border + ';'
    : 'margin-top:1rem;';
  // Sobre foto: a CSS do tema claro INVERTE os hex claros de _buildProgressInner
  // (#60a5fa→#1d4ed8 etc.) pra escuro → ilegível na tarja escura. Em vez de caçar
  // cada cor, força TODO o texto da seção pra cor clara (fg) com !important via
  // <style> escopado (vence a inversão por ordem de origem). As BARRAS (background)
  // mantêm as cores semânticas (verde/azul/vermelho). Vale nos 2 temas.
  var _cssId = String((t && t.id) || '').replace(/[^a-zA-Z0-9_-]/g, '');
  var _scoped = _rb ? '<style>.tourn-progress-live[data-tid="' + _cssId + '"] *{color:' + _rb.fg + ' !important;}</style>' : '';
  return '<div class="info-box" style="' + _wrapStyle + '">' + _scoped + '<div class="tourn-progress-live" data-tid="' + _cssId + '">' + window._buildProgressInner(t) + '</div></div>';
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
// v2.4.75: timestamp (ms) em que a temporada da Liga/Ranking encerra — ou null
// se não há limite. Fonte ÚNICA da verdade pra "torneio acabou", espelhada na
// Cloud Function autoDraw (_ligaSeasonEnded). Horários SEMPRE interpretados em
// BRT (UTC-3), independente do fuso do browser/servidor. Respeita a hora
// explícita quando endDate vem com 'T' (ex: '2026-06-13T19:59'); date-only vira
// fim do dia (23:59:59). Bug que motivou: "Teste de Liga" com endDate
// '2026-06-13T19:59' continuava exibindo/agendando sorteio no dia seguinte às
// 20h porque os checks de fim ou ignoravam endDate ou quebravam ao concatenar
// 'T23:59:59' num endDate que já tinha hora (→ data inválida → check anulado).
window._ligaSeasonEndMs = function(t) {
    if (!t) return null;
    function _brt(s, dfltTime) {
        s = String(s || '');
        if (!s) return NaN;
        if (s.indexOf('T') === -1) s = s + 'T' + dfltTime;
        // Anexa offset BRT só se ainda não houver fuso explícito (-03:00 / Z / etc).
        if (!/[+-]\d\d:?\d\d$/.test(s) && s.indexOf('Z') === -1) s = s + '-03:00';
        var d = new Date(s);
        return isNaN(d.getTime()) ? NaN : d.getTime();
    }
    // 1) endDate explícita (fim do dia se date-only; hora exata se vier com 'T')
    if (t.endDate) {
        var endMs = _brt(t.endDate, '23:59:59');
        if (!isNaN(endMs)) return endMs;
    }
    // 2) ligaSeasonMonths / rankingSeasonMonths a partir de startDate
    var months = parseInt(t.ligaSeasonMonths || t.rankingSeasonMonths);
    if (months && t.startDate) {
        var startMs = _brt(t.startDate, '00:00:00');
        if (!isNaN(startMs)) {
            var d = new Date(startMs);
            d.setMonth(d.getMonth() + months);
            return d.getTime();
        }
    }
    return null;
};

// Calculate next automatic draw date for Ranking/Suíço tournaments
window._calcNextDrawDate = function(t) {
    if (!t || !t.drawFirstDate) return null;
    var firstDrawStr = t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00');
    var firstDraw = new Date(firstDrawStr);
    if (isNaN(firstDraw.getTime())) return null;
    var now = new Date();
    // v2.6.55: intervalo < 1 = SEM repetição (1 rodada). O único sorteio é o primeiro;
    // depois dele não há próximo (mesmo com temporada/término ainda em aberto).
    var _interval = parseInt(t.drawIntervalDays, 10);
    if (!_interval || _interval < 1) {
        return (firstDraw > now) ? firstDraw : null;
    }
    var intervalMs = _interval * 86400000;
    var next;
    // If first draw is in the future, that's the next one
    if (firstDraw > now) {
        next = firstDraw;
    } else {
        // Calculate how many intervals have passed
        var elapsed = now.getTime() - firstDraw.getTime();
        var intervals = Math.floor(elapsed / intervalMs);
        next = new Date(firstDraw.getTime() + (intervals + 1) * intervalMs);
    }
    // v2.4.75: temporada encerrada → não há próximo sorteio. Se o sorteio
    // calculado cairia DEPOIS do fim do torneio (endDate/ligaSeasonMonths), os
    // sorteios já cessaram — retorna null pra todo display de "próximo sorteio".
    var seasonEnd = window._ligaSeasonEndMs(t);
    if (seasonEnd != null && next.getTime() > seasonEnd) return null;
    return next;
};

// v2.6.74: timestamp (ms epoch) do próximo sorteio que o sistema AINDA DEVE
// realizar — o "slot devido". DIFERENTE de _calcNextDrawDate (que é só calendário,
// pro display de "próximo sorteio em X"): este considera se o slot atual já foi
// sorteado (via lastAutoDrawAt) — então fica <= now ENQUANTO um sorteio está
// PENDENTE e só avança pro próximo slot DEPOIS que o sorteio acontece. É o campo
// `nextDrawAt` que o autoDraw do servidor consulta com where('nextDrawAt','<=',now)
// pra disparar perto da hora exata sem varrer a coleção inteira (custo). Espelha
// EXATAMENTE a lógica de due-check do servidor (firstDraw + intervalos + dedup por
// lastAutoDrawAt). Parse em BRT (-03:00) pra o ms bater entre cliente e servidor.
// Retorna null quando não há sorteio devido/futuro (manual, sem data, encerrado,
// sorteio único já feito, ou temporada terminada).
// v3.1.16 (inc 8 — uma fonte só): núcleo COMPARTILHADO do cálculo de "qual slot de
// sorteio está devido". Recebe os campos de agenda já resolvidos (firstDate/firstTime/
// intervalo) + o último disparo (cru — number ms ou ISO) + agora; devolve o ms do slot
// devido, ou null (sorteio único já disparado / data inválida). Sem efeitos colaterais.
// É EXATAMENTE a matemática que vivia DUPLICADA nos dois ramos de _nextOwedDrawMs
// (Fase 0 top-level e fase posterior incremental) — agora ambos chamam isto. Parse em
// BRT (-03:00) pra o ms bater entre cliente e servidor.
window._owedDrawSlotMs = function(firstDateStr, firstTimeStr, intervalDays, lastFiredRaw, nowMs) {
    var fd = String(firstDateStr || ''), ft = firstTimeStr || '19:00';
    if (fd.indexOf('T') !== -1) { var pr = fd.split('T'); fd = pr[0]; if (pr[1]) ft = pr[1].slice(0, 5); }
    var firstDraw = new Date(fd + 'T' + ft + ':00-03:00').getTime();
    if (isNaN(firstDraw)) return null;
    var now = (typeof nowMs === 'number') ? nowMs : Date.now();
    var interval = parseInt(intervalDays, 10);
    var noRepeat = !interval || interval < 1;
    var lastFired = (lastFiredRaw != null) ? new Date(lastFiredRaw).getTime() : null;
    if (lastFired != null && isNaN(lastFired)) lastFired = null;
    if (now < firstDraw) return firstDraw;                                   // primeiro sorteio ainda no futuro
    if (noRepeat) return (lastFired != null && lastFired >= firstDraw) ? null : firstDraw; // sorteio único
    var intervalMs = interval * 86400000;
    var intervalsCompleted = Math.floor((now - firstDraw) / intervalMs);
    var mostRecentScheduled = firstDraw + intervalsCompleted * intervalMs;
    return (lastFired != null && lastFired >= mostRecentScheduled)
        ? mostRecentScheduled + intervalMs   // slot atual já sorteado → próximo (futuro)
        : mostRecentScheduled;               // slot atual pendente (<= now → devido)
};

window._nextOwedDrawMs = function(t, nowMs) {
    if (!t) return null;
    var _now = (typeof nowMs === 'number') ? nowMs : Date.now();
    // v3.1.16 (inc 8): Liga incremental de FASE POSTERIOR tem agenda PRÓPRIA (config da
    // fase) + dedup por phaseRounds[cur].lastAutoDrawAt. Mesma MATEMÁTICA do Fase-0 (via
    // _owedDrawSlotMs); só muda a FONTE dos campos + o cap por nº de rodadas da fase.
    if (window._isIncrementalLigaPhase && window._isIncrementalLigaPhase(t)) {
        var _cur = t.currentPhaseIndex || 0;
        var _pcfg = (t.phases && t.phases[_cur]) || {};
        if (_pcfg.drawManual === true || !_pcfg.drawFirstDate || t.status === 'finished') return null;
        var _slot = t.phaseRounds[_cur];
        var _pmax = parseInt(_pcfg.rounds, 10);
        if (_pmax && _pmax >= 1) {
            var _pdone = ((_slot && _slot.rounds) || []).reduce(function (mx, r) { return Math.max(mx, (r && r.round) || 0); }, 0);
            if (_pdone >= _pmax) return null; // temporada da fase completa
        }
        return window._owedDrawSlotMs(_pcfg.drawFirstDate, _pcfg.drawFirstTime, _pcfg.drawIntervalDays, _slot && _slot.lastAutoDrawAt, _now);
    }
    var isLiga = t.format === 'Liga' || t.format === 'Ranking';
    if (!isLiga || t.drawManual === true || !t.drawFirstDate || t.status === 'finished') return null;
    // v3.x: torneio multifase — o auto-draw para no fim da fase classificatória
    // (avanço pra próxima fase é MANUAL). Single-phase → false (zero efeito).
    if (window._suppressAutoDrawForPhases && window._suppressAutoDrawForPhases(t)) return null;
    var owed = window._owedDrawSlotMs(t.drawFirstDate, t.drawFirstTime, t.drawIntervalDays, t.lastAutoDrawAt, _now);
    if (owed == null) return null;
    var seasonEnd = (typeof window._ligaSeasonEndMs === 'function') ? window._ligaSeasonEndMs(t) : null;
    if (seasonEnd != null && owed > seasonEnd) return null;
    return owed;
};

// v3.x: o auto-draw (cron + poller cliente) deve PARAR no construtor de fases —
// (a) Fase 0 classificatória tem nº FIXO de rodadas (phases[0].rounds); auto-draw
//     para ao atingir esse limite (avanço pra próxima fase é MANUAL, nunca cron);
// (b) já em fase de CHAVE (currentPhaseIndex>0): NUNCA auto-sortear (o formato
//     segue 'Liga', então sem este guard o cron geraria uma rodada Liga espúria).
// Single-phase (sem t.phases ≥2) → SEMPRE false: zero mudança de comportamento.
// Self-contained de propósito — NÃO depende de phases-engine, que não está no
// vendor do autoDraw (lá window._isMultiPhase é undefined).
// v3.1.14 (brick 4 etapa 4): a fase ATUAL é uma Liga "Pontos Corridos rodada a rodada"
// (ligaCadence='incremental') de uma fase POSTERIOR já materializada? Self-contained
// (sem phases-engine — não está no vendor do autoDraw): basta o flag de config + a
// sub-state criada na materialização (t.phaseRounds[cur]). É o que destrava o auto-draw
// AGENDADO de fase posterior (poller cliente + Cloud Function).
// v3.1.16 (inc 8): a sub-state agora é t.phaseRounds[cur] (mesma forma de t.rounds da
// Fase 0), não mais o antigo t.phaseLeagueState[cur].
window._isIncrementalLigaPhase = function(t) {
    if (!t || !Array.isArray(t.phases) || t.phases.length <= 1) return false;
    var cur = t.currentPhaseIndex || 0;
    if (cur < 1) return false;
    var cfg = t.phases[cur] || {};
    return cfg.ligaCadence === 'incremental' && !!(t.phaseRounds && t.phaseRounds[cur]);
};

// v4.x: FONTE ÚNICA das RODADAS PLANEJADAS de uma fase Pontos Corridos (Liga comum OU
// Rei/Rainha). Modelo do dono: o organizador define QUALQUER combinação de {nº de rodadas,
// repetição a cada X dias, data de fim} e o resto DERIVA. A verdade é o AGENDAMENTO, não um
// `rounds` cacheado (que congelava resíduo, ex.: Confra 1). Regras:
//  • 1º sorteio + intervalo(≥1) + fim  → rodadas = floor((fim−1ºsorteio)/intervalo)+1.
//  • sem fim (aberto: sorteia a cada X dias até o organizador pôr o fim) → usa o cacheado/1
//    como base, e o PISO das já sorteadas mantém a barra crescendo.
//  • PISO: nunca abaixo das rodadas REALMENTE sorteadas — rodada extra empurra pra frente;
//    reduzir o fim/rodadas e concluir fecha antes.
// Self-contained (sem phases-engine — roda no vendor do autoDraw). Lê fase i, fallback
// top-level pra fase 0. Campos de agendamento por fase: phase.drawFirstDate/Time/IntervalDays.
window._phasePlannedRounds = function (t, phaseIdx) {
    if (!t) return 1;
    var ph = (Array.isArray(t.phases) && t.phases[phaseIdx]) || {};
    var i0 = (phaseIdx === 0);
    var firstDate = ph.drawFirstDate || (i0 ? t.drawFirstDate : '') || '';
    var firstTime = ph.drawFirstTime || (i0 ? t.drawFirstTime : '') || '19:00';
    var _ivRaw = (ph.drawIntervalDays != null && ph.drawIntervalDays !== '') ? ph.drawIntervalDays : (i0 ? t.drawIntervalDays : null);
    var interval = parseInt(_ivRaw, 10);
    var endDate = ph.endDate || (i0 ? t.endDate : '') || '';
    var planned = parseInt(ph.rounds, 10) || 1;
    if (firstDate && interval >= 1 && endDate) {
        var _fs = String(firstDate).indexOf('T') > -1 ? firstDate : (firstDate + 'T' + firstTime);
        var _es = String(endDate).indexOf('T') > -1 ? endDate : (endDate + 'T23:59:59');
        var fd = new Date(_fs).getTime();
        var ed = new Date(_es).getTime();
        if (!isNaN(fd) && !isNaN(ed) && ed > fd) planned = Math.floor((ed - fd) / (interval * 86400000)) + 1;
    }
    // Piso pelas rodadas realmente sorteadas.
    var drawn = 0;
    if (i0) {
        drawn = (Array.isArray(t.rounds) ? t.rounds : []).filter(function (r) {
            return r && Array.isArray(r.matches) && r.matches.some(function (m) { return m && !m.isBye && !m.isSitOut; });
        }).length;
    } else {
        var slot = t.phaseRounds && t.phaseRounds[phaseIdx];
        if (slot && Array.isArray(slot.rounds)) drawn = slot.rounds.length;
    }
    if (drawn > planned) planned = drawn;
    if (planned < 1) planned = 1;
    return planned;
};

window._suppressAutoDrawForPhases = function(t) {
    if (!t || !Array.isArray(t.phases) || t.phases.length <= 1) return false;
    var cur = t.currentPhaseIndex || 0;
    // v3.1.14 (brick 4): fase posterior é suprimida do auto-draw — EXCETO Liga incremental
    // (Pontos Corridos rodada a rodada), que tem agenda própria por fase e SIM auto-sorteia.
    if (cur > 0) return !window._isIncrementalLigaPhase(t);
    // v4.x: cap = rodadas PLANEJADAS derivadas do agendamento (não o `rounds` cacheado).
    var cap = window._phasePlannedRounds(t, 0);
    var drawn = (Array.isArray(t.rounds) ? t.rounds : []).reduce(function (mx, c) { return Math.max(mx, (c && c.round) || 0); }, 0);
    return drawn >= cap;
};

// v4.x: FONTE ÚNICA do "próximo sorteio agendado" (usada pelo relógio no detalhe e no
// card do dashboard). Retorna o timestamp (ms) do próximo sorteio automático REAL, ou
// null quando não há sorteio por vir. "Real" = auto-draw ligado (não manual + data de 1º
// sorteio definida) E a fase ATUAL de fato auto-sorteia (não suprimida por cap/fase-chave)
// E ainda há rodadas por vir. Funciona igual em torneio de fase única e multi-fase (fase 0
// Liga). Assim o relógio nunca mostra "próximo sorteio" pra um sorteio que jamais vai
// disparar, nem esconde o countdown só porque o torneio é multi-fase.
window._ligaNextDrawEventTs = function (t) {
    if (!t || t.drawManual || !t.drawFirstDate) return null;
    // Fase atual não auto-sorteia (cap atingido / fase-chave sem cadência incremental)?
    if (typeof window._suppressAutoDrawForPhases === 'function' && window._suppressAutoDrawForPhases(t)) {
        if (!(typeof window._isIncrementalLigaPhase === 'function' && window._isIncrementalLigaPhase(t))) return null;
    }
    // Fase única: respeita o total de rodadas planejadas (sem cap de fase).
    var _mp = !!(typeof window._isMultiPhase === 'function' && window._isMultiPhase(t));
    if (!_mp && typeof window._ligaTournamentProgress === 'function') {
        var _lp = window._ligaTournamentProgress(t);
        if (_lp && _lp.roundsPlanned && _lp.currentRoundNum >= _lp.roundsPlanned) return null;
    }
    if (typeof window._calcNextDrawDate !== 'function') return null;
    var _nd = window._calcNextDrawDate(t);
    if (!_nd) return null;
    var _ts = _nd.getTime();
    if (isNaN(_ts) || _ts <= Date.now()) return null;
    return _ts;
};

// v4.x: início real do torneio/fase para o relógio de "tempo decorrido" (conta pra cima).
// Prefere t.startDate; cai pro 1º sorteio agendado; por fim, o timestamp da 1ª rodada.
window._ligaElapsedSinceTs = function (t) {
    if (!t) return null;
    if (t.startDate) { var _s = new Date(t.startDate).getTime(); if (!isNaN(_s)) return _s; }
    if (t.drawFirstDate) { var _d = new Date(t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00')).getTime(); if (!isNaN(_d)) return _d; }
    if (Array.isArray(t.rounds) && t.rounds.length) {
        var _r0 = t.rounds[0] || {};
        var _rt = _r0.createdAt || _r0.drawnAt || _r0.at;
        if (_rt) { var _rm = new Date(_rt).getTime(); if (!isNaN(_rm)) return _rm; }
    }
    return null;
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
    var fmt = (window._formatDisplayName ? window._formatDisplayName(t.format) : t.format) || '—';

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
        // v2.6.29: fase final virou fase do construtor de fases — só exibimos quando
        // a Liga legada já tinha o flag ligado, pra não poluir ligas novas.
        if (t.playoffEnabled === true) add('Fase final (playoffs)', 'Sim');
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

    // v2.6.43: read box (opts.bg) theme-aware — texto/borda acompanham o tema
    // (escuro→box claro/texto escuro; claro→box escuro/texto claro).
    var _rbC = (opts.bg && typeof window._photoReadBox === 'function') ? window._photoReadBox() : null;
    // v4.x: sobre foto → tarja densa (_photoReadBox) + backdrop blur pra suavizar o fundo
    // agitado e garantir contraste do texto.
    var bgStyle = opts.bg ? ('background:' + opts.bg + ';color:' + (_rbC ? _rbC.fg : '#f1f5f9') + ' !important;border:1px solid ' + (_rbC ? _rbC.border : 'rgba(255,255,255,0.12)') + ';backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);') : '';
    // v2.7.47: persiste colapsado/expandido POR TORNEIO. Uma vez colapsado, fica
    // colapsado (mesmo após re-render / mudança de versão); só expande se o usuário
    // expandir. Sem estado salvo → usa o default (opts.open).
    var _cfgKey = 'scoreplace_cfgbox_' + String((t && t.id) || '');
    var _cfgSaved = null; try { _cfgSaved = localStorage.getItem(_cfgKey); } catch (e) {}
    var _cfgOpen = (_cfgSaved === '1') ? true : (_cfgSaved === '0') ? false : !!(opts && opts.open);
    var _cfgKeyJs = _cfgKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var openAttr = _cfgOpen ? ' open' : '';
    // v4.x: TÍTULO = formatos das FASES juntos (ex.: "Pontos Corridos / Eliminatórias") —
    // multi-fase mostra as duas. O tipo de jogo (Duplas 2×2) desce pro digest, sem tanto peso.
    var _titleFmt = fmt;
    if (window._isMultiPhase && window._isMultiPhase(t) && Array.isArray(t.phases)) {
        var _pf = t.phases.map(function (ph) { return (window._formatDisplayName ? window._formatDisplayName(ph.format) : ph.format) || ''; }).filter(Boolean);
        var _pfU = []; _pf.forEach(function (x) { if (_pfU[_pfU.length - 1] !== x) _pfU.push(x); });
        if (_pfU.length) _titleFmt = _pfU.join(' / ');
    }
    var summary = esc(_titleFmt);
    // v4.x: RESUMO colapsado com as DEFINIÇÕES do torneio (dá pra entender sem expandir):
    // tipo de jogo, modo de sorteio (se especial), nº de rodadas + periodicidade (Liga) /
    // grupos / suíço, vagas, categorias, e formato de partida (se não for placar simples).
    var _digest = [];
    _digest.push(fmtGameType().replace(' — 2 categorias', ' (2 cat.)'));
    var _dmS = fmtDrawMode();
    if (_dmS && _dmS !== 'Sorteio aleatório') _digest.push(_dmS);
    if (isLiga) {
        var _prS = (typeof window._phasePlannedRounds === 'function') ? window._phasePlannedRounds(t, (t.currentPhaseIndex || 0)) : 0;
        if (!(_prS > 1) && typeof window._ligaTournamentProgress === 'function') { var _lpp = window._ligaTournamentProgress(t); if (_lpp && _lpp.roundsPlanned > 1) _prS = _lpp.roundsPlanned; }
        if (_prS > 1) _digest.push(_prS + ' rodadas');
        if (t.drawManual) _digest.push('sorteio manual');
        else { var _pdd = parseInt(t.drawIntervalDays) || 0; if (_pdd) _digest.push('a cada ' + _pdd + 'd'); }
    } else if (fmt.indexOf('Grupos') !== -1 && t.gruposCount) {
        _digest.push(t.gruposCount + ' grupos' + (t.gruposClassified ? ' · classifica ' + t.gruposClassified : ''));
    } else if (fmt === 'Suíço' && t.swissRounds) {
        _digest.push(t.swissRounds + ' rodadas');
    }
    var _maxD = parseInt(t.maxParticipants) || 0;
    _digest.push(_maxD > 0 ? (_maxD + ' vagas') : 'sem limite de vagas');
    var _catD = fmtCategories();
    if (_catD && _catD !== 'Sem categorias') _digest.push(_catD);
    var _scD = fmtScoring();
    if (_scD && _scD !== 'Placar simples') _digest.push(_scD);
    var digestLine = _digest.join(' · ');

    // v2.6.29: hardening contra overflow lateral. Como esta caixa é um flex item
    // (fica numa linha própria dentro do "Bottom Section" flex-row do card), sem
    // min-width:0 + max-width:100% + box-sizing:border-box + overflow:hidden ela
    // pode, em certos casos de layout/conteúdo, ultrapassar a borda do card e a
    // label "configuração ▾" do fim é cortada. O <span> do meio elipsa o texto
    // longo; o do fim nunca encolhe (flex-shrink:0 + nowrap) — fica sempre legível.
    return '<details class="info-box tourn-config-box"' + openAttr +
        ' ontoggle="try{localStorage.setItem(\'' + _cfgKeyJs + '\', this.open?\'1\':\'0\')}catch(e){}"' +
        ' style="font-size:0.75rem;padding:6px 10px;line-height:1.55;border-radius:8px;min-width:0;max-width:100%;box-sizing:border-box;overflow:hidden;' + bgStyle + '">' +
        '<summary onclick="event.stopPropagation();" style="cursor:pointer;font-weight:700;list-style:none;display:flex;flex-direction:column;gap:3px;min-width:0;max-width:100%;">' +
        '<span style="display:flex;align-items:center;gap:6px;min-width:0;max-width:100%;">' +
        '<span style="flex-shrink:0;">⚙️</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + summary + '</span>' +
        '<span style="opacity:0.7;font-weight:500;font-size:0.68rem;flex-shrink:0;white-space:nowrap;">configuração ▾</span>' +
        '</span>' +
        (digestLine ? '<span style="font-weight:500;font-size:0.68rem;opacity:0.85;line-height:1.4;padding-left:22px;">' + digestLine + '</span>' : '') +
        '</summary>' +
        '<div style="margin-top:6px;display:flex;flex-direction:column;gap:2px;">' + rows.join('') + '</div>' +
        '</details>';
};
