/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
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

// v4.4.96: enrollmentMode CANÔNICO — 'time' (legado) e 'teams' (format2, ver
// format2.js:215/244) são SINÔNIMOS de "equipe/dupla"; 'misto' também permite
// duplas. Helper único pra matar o drift 'time' vs 'teams' que fazia torneios de
// dupla-formada criados pelo format2 (enrollmentMode='teams') caírem no grid
// individual misturado (regressão do card canônico de duplas). Sempre usar este
// helper — NUNCA comparar `enrollmentMode === 'time'` cru (fica cego a 'teams').
window._isTeamEnrollMode = window._isTeamEnrollMode || function(mode) {
    return mode === 'time' || mode === 'teams' || mode === 'misto';
};

// Nº de rodada 1-based pra EXIBIÇÃO — NUNCA R0. A primeira rodada é SEMPRE R1 (pode ser
// oitavas/quartas/semi, mas nunca "R0"). No modelo, a repescagem/play-in usa m.round=0 (o
// bracket 'upper' começa em round 0 = "R1 upper"), então o número CRU vira "Rodada 0"/"R0"
// nos rótulos-satélite (dashboard, etc.). Devolve a POSIÇÃO 1-based da rodada do jogo entre
// as rodadas DISTINTAS do SEU bracket — igual ao roundLabel do bracket (idx+1). Formatos
// 1-based (eliminatória normal, Liga) não mudam (ordinal == round).
// Ver [[project_round_naming]] / [[feedback_sweep_all_render_sites]].
window._matchRoundDisplayNum = window._matchRoundDisplayNum || function(t, m) {
    if (!m) return 1;
    if (typeof m.roundIndex === 'number' && m.roundIndex >= 0) return m.roundIndex + 1;
    var r = m.round;
    if (typeof r !== 'number') return 1;
    var all = (typeof window._collectAllMatches === 'function') ? window._collectAllMatches(t) : ((t && t.matches) || []);
    var bk = (m.bracket || 'main');
    var seen = {};
    for (var i = 0; i < (all ? all.length : 0); i++) {
        var x = all[i];
        if (x && (x.bracket || 'main') === bk && typeof x.round === 'number') seen[x.round] = 1;
    }
    var sorted = Object.keys(seen).map(Number).sort(function(a, b){ return a - b; });
    var idx = sorted.indexOf(r);
    return idx >= 0 ? (idx + 1) : Math.max(1, r); // fallback: nunca abaixo de 1
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
  return '<span class="sp-pending-cohost" title="Convite de co-organização enviado — aguardando aceite" style="display:inline-flex;align-items:center;gap:4px;background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.45);color:var(--sp-c-fbbf24,#fbbf24);font-size:0.6rem;font-weight:800;padding:2px 7px;border-radius:6px;letter-spacing:0.3px;white-space:nowrap;vertical-align:middle;margin-left:4px;">' +
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
    // v1.5.20: todo render varre clone órfão de um arraste anterior (não mexe em
    // arraste ativo — _killDragGhosts sai cedo se window._activeDragReset existe).
    if (typeof window._killDragGhosts === 'function') window._killDragGhosts();
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
        var _watchdog = null;     // v1.5.20: mata arraste órfão (re-render / gesto perdido)
        var _lastTouchAt = 0;

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
            if (_touchSourceCard) {
                _touchSourceCard.style.opacity = '1';
                _touchSourceCard.style.boxShadow = '';
                _touchSourceCard.removeAttribute('data-drag-dimmed');
            }
            container.querySelectorAll('[data-merge-name],.participant-card').forEach(function(c) {
                c.style.outline = ''; c.style.outlineOffset = '';
            });
            _touchClone = null;
            _touchSourceCard = null;
            _touchSourceName = null;
            _isDragging = false;
            if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
            if (_watchdog) { clearInterval(_watchdog); _watchdog = null; }
            if (window._activeDragReset === _resetAll) window._activeDragReset = null;
            // v1.5.20: rede final — se o container já saiu do DOM (re-render no meio
            // do arraste), o clone acima pode não ser o único órfão no <body>.
            if (typeof window._killDragGhosts === 'function') window._killDragGhosts(true);
        }

        // v1.5.20: vigia do arraste. O clone vive no <body>, mas os listeners vivem no
        // container — se a lista re-renderiza no meio do gesto, o container é trocado e
        // NENHUM touchend/touchcancel volta pra esta closure: o clone ficava preso na
        // tela até fechar o app (fantasma). O vigia derruba o arraste quando o container
        // (ou o card de origem) sai do DOM, ou quando o dedo some sem avisar.
        function _startWatchdog() {
            if (_watchdog) clearInterval(_watchdog);
            _lastTouchAt = Date.now();
            _watchdog = setInterval(function() {
                if (!_isDragging) { clearInterval(_watchdog); _watchdog = null; return; }
                var gone = !document.body.contains(container) ||
                           (_touchSourceCard && !document.body.contains(_touchSourceCard));
                // 8s sem NENHUM movimento de dedo = gesto morto (dedo parado num
                // arraste real produz micro-movimento constante). Folga grande de
                // propósito: derrubar um arraste legítimo é pior que esperar.
                if (gone || (Date.now() - _lastTouchAt) > 8000) _resetAll();
            }, 400);
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
                card.setAttribute('data-drag-dimmed', '1'); // v1.5.20: varredura global

                // Create floating clone
                var rect = card.getBoundingClientRect();
                _touchClone = card.cloneNode(true);
                // v1.5.20: marca o clone como fantasma varrível e limpa atributos que
                // fariam ele ser confundido com um card real da lista.
                _touchClone.setAttribute('data-drag-ghost', '1');
                _touchClone.removeAttribute('data-drag-dimmed');
                _touchClone.removeAttribute('data-merge-name');
                _touchClone.removeAttribute('data-participant-name');
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

                // v1.5.20: publica a limpeza deste arraste + liga o vigia. A rede global
                // (touchcancel/pointercancel/app pro fundo/hashchange, em store.js) chama
                // _resetAll mesmo que o evento nunca volte pra este container.
                window._activeDragReset = _resetAll;
                _startWatchdog();

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
            _lastTouchAt = Date.now(); // v1.5.20: pulso pro vigia

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
    // v1.3.132: SEM placeholder fantasma de 3º lugar. Era resíduo da opção (já MORTA) de
    // ligar/desligar a disputa de 3º lugar — fabricava um match "TBD" pra reservar o slot no
    // total antes de existir. Hoje o 3º lugar é SEMPRE criado como match real (isThirdPlace,
    // pelo motor de fases) → já é contado quando existe. Contamos SÓ jogos reais; nada de inventar.
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
// v1.7.83: o MESMO tempo, quebrado em DUAS linhas — "6d 13h" em cima, "2m 27s"
// embaixo. Nasceu de um estouro medido: na escala 1.7 o relógio da coluna do
// meio (DECORRIDO) escrevia POR CIMA do "19:00" da coluna INÍCIO REAL (+43px).
// Ordem do dono: "aqui pode quebrar a linha com xxd xxh na linha de cima e xxm
// e xxs na linha de baixo."
// ⚠️ NÃO mexer no `_tProgFmtDur` acima: ele devolve TEXTO e há caller que faz
// regex nele (`.replace(/\s\d+s$/,'')` no card de torneio encerrado) — devolver
// HTML dali quebraria esses usos. Esta é uma função IRMÃ, só pro relógio.
// Sem dia nem hora (duração curta) devolve uma linha só — quebrar "2m 27s" em
// duas seria pior que o problema.
// v1.7.83: rótulo de coluna em DUAS linhas — "início" em cima, "programado"
// embaixo. Ordem do dono, olhando o box na escala 1.7: "inicio numa linha
// programado na de baixo. final numa linha e programado na outra. nos 4 casos."
// Quebra na ÚLTIMA palavra (não na primeira): é ela que é longa e comum aos 4
// ("programado"). Rótulo de uma palavra só passa intacto.
window._tProgLbl2L = function(label) {
  var s = String(label || '');
  var i = s.lastIndexOf(' ');
  return i === -1 ? s : (s.slice(0, i) + '<br>' + s.slice(i + 1));
};
window._tProgFmtDur2L = function(ms) {
  var txt = window._tProgFmtDur(ms);
  var p = txt.split(' ');
  if (p.length < 3) return '<span style="white-space:nowrap;">' + txt + '</span>';
  var cima = p.slice(0, p.length - 2).join(' ');   // "6d 13h" (ou só "13h")
  var baixo = p.slice(p.length - 2).join(' ');      // "2m 27s"
  return '<span style="white-space:nowrap;">' + cima + '</span><br>' +
         '<span style="white-space:nowrap;">' + baixo + '</span>';
};
// ── 1.9.101/102 · OS DOIS RELÓGIOS DO BOX MEDEM COISAS DIFERENTES ────────────
// Ordem do dono (20-21/ago/2026, olhando o card do Confra):
//   • RODADA ATUAL → _"sempre a regressiva de quanto tempo ainda tem para terminar a
//     rodada (quando existe prazo para acabar)"_.
//   • TORNEIO COMPLETO → _"o tempo decorrido desde o início até o fim. Como início
//     vamos considerar o início programado ou o sorteio (quando os jogos podem começar
//     a acontecer) e o fim vamos considerar o fim efetivo"_.
// Faz sentido: a rodada é um PRAZO (dá pra perder), o torneio inteiro é uma TRAVESSIA
// (dá pra medir). Na 1.9.101 os dois viraram regressiva e o de baixo ficou dizendo
// "83d restante", que não é informação que alguém use.
// Este helper é a FONTE ÚNICA dos dois — o mesmo motivo de sempre: são DOIS
// renderizadores no mesmo `_buildProgressInner`, e a 1.7.84 já provou que consertar um
// só deixa metade do defeito de pé.
// Regras que ele carrega:
//   • prazo JÁ VENCIDO ou relógio CONGELADO (rodada/torneio encerrado) → decorrido/durou.
//     "0s restante" parado pra sempre não informa nada.
//   • `data-sp-cd2l` (conta pra trás) e `data-sp-el2l` (conta pra cima) são o que fazem o
//     número andar A CADA SEGUNDO: o tique global de 1s (js/store.js) reescreve SÓ este
//     span. O `_progressTick` do painel roda a cada 5s (1.9.80, pra não invalidar o
//     layout da página inteira) — segundos pulando de 5 em 5 seriam relógio quebrado.
//   • congelado não ganha atributo nenhum: quem parou, parou.
window._tProgClock2L = function(o) {
  o = o || {};
  var _rest = (!o.frozen && o.deadlineMs) ? (o.deadlineMs - Date.now()) : -1;
  if (_rest > 0) {
    return { attr: ' data-sp-cd2l="' + o.deadlineMs + '"', html: window._tProgFmtDur2L(_rest), label: 'restante' };
  }
  var _vivo = (!o.frozen && o.anchorMs) ? ' data-sp-el2l="' + o.anchorMs + '"' : '';
  return { attr: _vivo, html: window._tProgFmtDur2L(Math.max(0, o.elapsedMs || 0)), label: o.elapsedLabel };
};

// ── 1.9.102 · DE QUANDO OS JOGOS PODEM COMEÇAR A ACONTECER ───────────────────
// A âncora do relógio do TORNEIO COMPLETO, na definição do dono: "o início programado
// ou o sorteio". Os dois são condição — antes do início programado o torneio não abriu,
// e antes do sorteio não existe jogo pra jogar. Logo é o MAIS TARDE dos dois, não o
// primeiro que aparecer: é esse instante que responde "a partir de quando dava pra jogar".
// Sorteio: o REAL (rodada 1 sorteada) na frente do agendado — o que aconteceu vale mais
// que o que estava marcado. Sem nenhum dos dois, quem chama cai no 1º placar lançado.
window._tournamentPlayableFromTs = function (t) {
  if (!t) return null;
  var _cands = [];
  var _win = (typeof window._tournamentScheduledWindow === 'function') ? window._tournamentScheduledWindow(t) : null;
  if (_win && _win.startMs) _cands.push(_win.startMs);
  var _sorteio = null;
  var _r0 = (Array.isArray(t.rounds) && t.rounds.length) ? (t.rounds[0] || {}) : {};
  var _rt = _r0.drawnAt || _r0.createdAt || _r0.at;
  if (_rt) { var _rm = (typeof _rt === 'number') ? _rt : new Date(_rt).getTime(); if (!isNaN(_rm)) _sorteio = _rm; }
  if (_sorteio == null) {
    var _ph0 = (Array.isArray(t.phases) && t.phases[0]) || {};
    var _dd = _ph0.drawFirstDate || t.drawFirstDate;
    var _dt = (_ph0.drawFirstDate ? _ph0.drawFirstTime : t.drawFirstTime) || '19:00';
    if (_dd) {
      var _s = String(_dd);
      var _dm = new Date(_s.indexOf('T') > -1 ? _s : (_s + 'T' + _dt)).getTime();
      if (!isNaN(_dm)) _sorteio = _dm;
    }
  }
  if (_sorteio != null) _cands.push(_sorteio);
  if (!_cands.length) return null;
  return Math.max.apply(null, _cands);
};
// ══ O CARTÃO LÊ O RESUMO, OU O DOCUMENTO COMPLETO ═══════════════════════════
// Desenho do dono: _"na dashboard precisamos da versão reduzida sempre e clicando no
// torneio traz os detalhes"_. A tela inicial vai passar a ler `tournaments_summary`
// (documento leve), mas o MESMO cartão continua sendo desenhado a partir do documento
// completo em outros lugares (detalhe, busca, sandbox).
//
// Estes acessadores são a ponte: se o campo já veio calculado, usa; senão calcula como
// sempre calculou. ⛔ Números IDÊNTICOS nos dois caminhos — o resumo é montado pelas
// PRÓPRIAS funções abaixo (functions-autodraw/tournament-summary-core.js recebe-as por
// injeção), então não existe "segunda regra". Travado em
// tests/cartao-le-resumo-ou-documento.test.js, torneio por torneio, na base real.
//
// ⚠️ Passo INVISÍVEL de propósito: aqui só se ensina o cartão a tolerar as duas formas.
// Trocar a FONTE de dados é a leva seguinte — fazer as duas juntas foi o que já obrigou
// uma reversão.
var _num = function (v) { return (typeof v === 'number' && isFinite(v)) ? v : null; };

window._cardCompetidores = function (t) {
  if (!t) return { people: 0, teams: 0 };
  var p = _num(t.competitorsCount);
  if (p != null) return { people: p, teams: _num(t.teamsCount) || 0 };
  return (typeof window._countCompetitors === 'function')
    ? window._countCompetitors(t) : { people: 0, teams: 0 };
};

window._cardEspera = function (t) {
  if (!t) return 0;
  var n = _num(t.waitlistCount);
  if (n != null) return n;
  return (typeof window._waitlistPeopleCount === 'function')
    ? window._waitlistPeopleCount(t)
    : (Array.isArray(t.waitlist) ? t.waitlist.length : 0);
};

window._cardProgresso = function (t) {
  if (!t) return { total: 0, completed: 0, pct: 0 };
  var tot = _num(t.matchesTotal), done = _num(t.matchesDone);
  if (tot != null && done != null) {
    var pct = _num(t.progressPct);
    return { total: tot, completed: done, pct: (pct != null) ? pct : (tot > 0 ? Math.round(done / tot * 100) : 0) };
  }
  return (typeof window._getTournamentProgress === 'function')
    ? window._getTournamentProgress(t) : { total: 0, completed: 0, pct: 0 };
};

// "Já sorteou?" — no documento completo é a presença das listas; no resumo é um
// booleano (as listas não viajam, é justamente o ponto).
window._cardTemChave = function (t) {
  if (!t) return false;
  if (typeof t.hasDraw === 'boolean') return t.hasDraw;
  return (Array.isArray(t.matches) && t.matches.length > 0)
    || (Array.isArray(t.rounds) && t.rounds.length > 0)
    || (Array.isArray(t.groups) && t.groups.length > 0);
};

// ⭐ 2.0.90 — "estou inscrito?" e "estou na espera?" também aceitam o RESUMO.
// A lista deixa de baixar o torneio inteiro (236 KB do Confra pra desenhar duas
// linhas), e o resumo carrega `participantUids`/`standbyUids` em vez das listas.
// ⛔ Comparação por UID, nunca por nome — identidade neste app é uid
// ([[feedback_uid_controls_everything_name_only_ficticio]]). Com o documento
// completo, delega pras funções de sempre: mesmo resultado, zero regressão.
window._cardSouInscrito = function (t, cu) {
  if (!t || !cu) return false;
  if (Array.isArray(t.participantUids)) return t.participantUids.indexOf(String(cu.uid || '')) !== -1;
  return (typeof window._isUserEnrolledInTournament === 'function')
    ? !!window._isUserEnrolledInTournament(cu, t) : false;
};

window._cardSouEspera = function (t, cu) {
  if (!t || !cu) return false;
  if (Array.isArray(t.standbyUids)) return t.standbyUids.indexOf(String(cu.uid || '')) !== -1;
  if (typeof window._userMatchesParticipant !== 'function') return false;
  var casa = function (p) { return window._userMatchesParticipant(cu, p); };
  return (Array.isArray(t.standbyParticipants) && t.standbyParticipants.some(casa))
    || (Array.isArray(t.waitlist) && t.waitlist.some(casa));
};

// v2.0.74: DUAS correções, ambas do dono, na mesma régua.
//
// ① O tempo configurado é POR SET (`_minutosDaPartida`, em sport-rules.js) e cada
//    FASE tem o seu formato: melhor de 3 não dura o mesmo que set único. Logo a conta
//    é FASE A FASE, não "total de jogos × um tempo só".
// ② ⛔ A previsão é do TORNEIO INTEIRO — fase que ainda NÃO foi sorteada entra pelos
//    jogos PLANEJADOS. Palavras do dono: _"por mais que não se saiba quem ocupará os
//    slots, sabemos que esses jogos ocorrerão, então o tempo tem que estar alocado"_ ·
//    _"isso é fundamental num torneio, principalmente de 1 dia/3 dias"_.
//    Antes eu somava só o materializado: no Confra a eliminatória valia ZERO e a
//    previsão dava 9h para um torneio de ~23h. E o número saltava 57% no dia do
//    sorteio — quando nada tinha mudado de verdade.
//
// ⛔ O plano NÃO é recalculado aqui: usa os MESMOS primitivos de
// `window._tournamentGamesPlan` (materializado → motor real). Uma segunda tabela de
// fórmulas é exatamente o que já divergiu em 4 lugares neste repo.
window._estimateTournamentMinutes = function(t) {
  if (!t) return 0;
  var courts = Math.max(parseInt(t.courtCount) || 1, 1);
  var INTERVALO = 5; // entre partidas na mesma quadra
  var tempoDe = function (fase, n) {
    return Math.ceil(n / courts) * (window._minutosDaPartida(t, fase) + INTERVALO);
  };

  if (!window._isMultiPhase(t)) {
    // Fase única: Liga planeja todas as rodadas agendadas; o resto é o que existe.
    var lp = window._ligaTournamentProgress(t);
    var n1 = lp ? lp.totalPlanned : (window._getTournamentProgress(t).total || 0);
    return (n1 > 0) ? tempoDe(window._faseDoTorneio(t, 0), n1) : 0;
  }

  var phases = t.phases, curIdx = t.currentPhaseIndex || 0, min = 0;
  for (var i = 0; i < phases.length; i++) {
    // Jogo que EXISTE manda sempre — inclusive numa fase acima do índice corrente
    // (sorteada mas ainda não "aberta"). Só na falta dele é que se planeja: o motor
    // real simula a próxima fase; a 3ª em diante só ao materializar a anterior.
    var n = _materializedPhaseGames(t, i);
    if (!(n > 0) && i > curIdx) n = _simulatePhaseGames(t, i) || 0;
    if (n > 0) min += tempoDe(phases[i], n);
  }
  return min;
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
      // v4.x: contagem ESTRITA (mesma regra de _phasePlannedRounds) — um sorteio agendado
      // EXATAMENTE no fim não dispara, logo não conta como rodada. Sem isto, o organizador
      // via "3 rodadas" quando só 2 aconteciam.
      roundsPlanned = Math.floor((endMs - firstDraw - 1) / intervalMs) + 1;
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
  var totalP = 0, doneP = 0, simComplete = true;
  for (var i = 0; i < phases.length; i++) {
    if (i <= curIdx) {
      totalP += _materializedPhaseGames(t, i);            // fase já sorteada → jogos reais
      doneP += _completedPhaseGames(t, i);                // v4.4.57: MESMA contagem (real+vencedor)
    } else if (i === curIdx + 1) {
      var sim = _simulatePhaseGames(t, i);                // próxima fase → motor real
      if (sim == null) simComplete = false; else totalP += sim;
    } else {
      simComplete = false;                                // fases 3+ só entram ao materializar a anterior
    }
  }
  // v4.4.57: `done` do TORNEIO COMPLETO vem da soma por-fase (_completedPhaseGames),
  // NÃO de _getTournamentProgress().completed — este superconta 1 no multi-fase (contava
  // 125/123 pra 124/122 reais), fazendo a barra dizer "falta 1 jogo" quando faltam 2
  // (final + 3º lugar). Somar total e done com o MESMO filtro elimina a divergência.
  if (totalP < doneP) totalP = doneP;
  return { multiPhase: true, totalPlanned: totalP, totalDone: doneP,
           pct: totalP > 0 ? Math.round(doneP / totalP * 100) : 0,
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
// v1.6.84: UMA LEI SÓ. A regra ("início = min de todas as datas de início; fim = max de todas as
// de fim, contando o top-level e as N fases") vive em window._tournamentDateRange (store.js) —
// aqui só a convertemos pra ms. Antes esta função tinha a SUA cópia da regra, e as duas
// DIVERGIAM em dois pontos medidos:
//   • data sem hora: o range usa 00:00 (início) / 23:59 (FIM DO DIA — prazo acaba no fim do dia),
//     esta usava _tProgParseMs, que assume 12:00 pros dois → 12h de diferença no fim do torneio;
//   • com duas fases terminando NO MESMO DIA, uma com hora e outra sem, cada implementação
//     elegia uma fase diferente como "a última" → duas telas do app com fins diferentes.
// O fallback abaixo (quando _tournamentDateRange não está carregado — o vendor da CF autoDraw
// não leva o store.js) repete a MESMA regra, e tests/convite-data-multifase.test.js exige que os
// dois caminhos deem o mesmo resultado.
window._tournamentScheduledWindow = function (t) {
  if (!t) return { startMs: null, endMs: null };
  function _ms(dateStr, timeStr, defTime) {
    if (!dateStr) return null;
    var s = String(dateStr);
    if (s.indexOf('T') === -1) s += 'T' + (timeStr || defTime);
    var m = new Date(s).getTime();
    return isNaN(m) ? null : m;
  }
  if (typeof window._tournamentDateRange === 'function') {
    var r = window._tournamentDateRange(t) || {};
    return { startMs: _ms(r.start, '', '00:00'), endMs: _ms(r.end, '', '23:59') };
  }
  var starts = [], ends = [];
  [{ startDate: t.startDate, startTime: t.startTime, endDate: t.endDate, endTime: t.endTime }]
    .concat(Array.isArray(t.phases) ? t.phases : [])
    .forEach(function (ph) {
      if (!ph) return;
      var s = _ms(ph.startDate, ph.startTime, '00:00'); if (s != null) starts.push(s);
      var e = _ms(ph.endDate, ph.endTime, '23:59');     if (e != null) ends.push(e);
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
  // "Lançar resultado É iniciar" (mesma regra do início efetivo do torneio, ~L863): o placar
  // conta como início mesmo sem startedAt (lançamento direto, sem placar ao vivo). Senão uma
  // rodada jogada só por lançamento direto ficava "aguardando início" (roundStartMs null).
  cur.forEach(function(m){ if (m.startedAt) starts.push(+m.startedAt); if (m.resultAt) { starts.push(+m.resultAt); ends.push(+m.resultAt); } });
  var _idx = rounds.indexOf(curR);
  // Fim da rodada ANTERIOR desta fase (maior resultAt fora da rodada atual): quando a rodada
  // atual está sorteada mas ainda sem 1º jogo, é DAQUI que ela ficou "valendo" — a fase não
  // parou. Usado como fallback do início da rodada (evita "aguardando início" no meio da fase).
  var _prevEnds = pm.filter(function(m){ return (m.round == null ? 1 : m.round) !== curR && m.resultAt; }).map(function(m){ return +m.resultAt; });
  var prevRoundEndMs = _prevEnds.length ? Math.max.apply(null, _prevEnds) : null;
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
    // quantas rodadas esta fase tem (colunas com jogo real) — é o divisor do prazo da fase
    // quando a regressiva é POR RODADA. Ver window._phaseRoundWindow.
    roundsTotal: rounds.length,
    name: _name,
    total: total, done: done, pct: total ? Math.round(done / total * 100) : 0,
    complete: total > 0 && done === total,
    roundStartMs: starts.length ? Math.min.apply(null, starts) : null,
    prevRoundEndMs: prevRoundEndMs,
    roundEndMs: (done === total && ends.length) ? Math.max.apply(null, ends) : null
  };
};

// HTML interno (recomputado a cada tick).
// ── 1.9.106 · O PERCENTUAL MORA DENTRO DA BARRA ──────────────────────────────
// Pedido do dono: as três barras (vermelha = realizado, azul = previsto, roxa =
// torneio completo) passam a CARREGAR o próprio percentual, colado na direita de
// onde a cor chegou. A azul é a novidade que faltava: além de "quanto já foi
// jogado" (vermelha), o card passa a dizer "quanto DEVERIA ter sido jogado" a
// esta altura do tempo regulamentar — é a leitura que explica a cor do relógio.
// Por isso as barras ficaram mais altas (era 8/11/7px): o número precisa de casa.
// REGRA DO RÓTULO: dentro do preenchimento (branco, ponta direita) enquanto a cor
// for larga o bastante pra caber "100%" com folga (>=16%); abaixo disso ele SAI
// pra fora, logo depois da ponta, na cor da própria barra — senão o número ficaria
// espremido/cortado no começo do torneio, que é justo quando o card mais aparece.
// O `!important` do branco vence o <style> escopado da tarja de foto (que força
// TODO o texto da seção pra cor de leitura) — sobre a cor cheia o branco é o que
// lê. O rótulo de FORA usa hex que a CSS do tema claro já inverte (a78bfa/3b82f6/
// ef4444 → escuros), então vale nos DOIS temas.
// ── 1.9.107 · A COR DO RITMO É UMA RÉGUA SÓ, E ELA TEM QUE SOBREVIVER À FOTO ──
// Ordem do dono (21/ago/2026, com o card na frente): _"no plano, os contadores de tempo
// apareciam em cores de acordo com adiantado, no programado e atrasado (verde, azul,
// vermelho). isso não está na tela."_ Duas coisas faltavam:
//   1) A COR não existia como semáforo. Régua definida pelo dono (2ª volta, 21/ago):
//      _"vermelho quando atrasado. conforme estiver ficando próxima amarelo; quando
//      estiver junto ou adiantado verde."_ São três estados: VERDE (junto ou adiantado),
//      AMARELO (a defasagem está crescendo — o aviso antes do vermelho) e VERMELHO
//      (atrasado). A 1ª volta tinha proposto AZUL pro "no programado"; o dono trocou
//      pelo semáforo, que é o que se lê sem legenda.
//   2) SOBRE FOTO DE CAPA a cor sumia. A tarja de leitura força TODO o texto da seção
//      pra uma cor só (senão os hex claros invertidos pelo tema claro ficam ilegíveis
//      sobre ela) — e levava junto o relógio, que ficava branco. Por isso os relógios
//      saem marcados com `data-sp-fixa` e o <style> escopado passou a poupá-los; a cor
//      deles mora em CLASSE (css/style.css: .sp-ritmo-*), que tem tom próprio pro tema
//      claro e pro escuro E dentro da tarja. Cor semântica em hex inline não sobrevive
//      aos dois temas — a classe sobrevive.
// A BARRA do realizado segue a MESMA régua (hex sólido); número e barra nunca podem
// contar histórias diferentes no mesmo card.
window._tProgRitmo = function(progFrac, expectedFrac, done) {
  if (done) return 'emdia';
  if (!isFinite(progFrac) || !isFinite(expectedFrac)) return null;
  // arredonda em pontos de mil antes de comparar: 0.20-0.18 dá 0.020000000000000018 em
  // ponto flutuante, e a fronteira do verde cairia justo nesse fio de cabelo.
  var atraso = Math.round((expectedFrac - progFrac) * 1000) / 1000;   // >0 = jogou menos do que o tempo pedia
  if (atraso <= 0.02) return 'emdia';      // junto ou adiantado
  if (atraso <= 0.12) return 'apertando';  // ficando perto — o aviso antes do vermelho
  return 'atrasado';
};
window._tProgRitmoBarra = function(ritmo) {
  return ritmo === 'atrasado' ? '#ef4444' : (ritmo === 'apertando' ? '#f59e0b' : '#10b981');
};
// atributos do span do relógio: classe do ritmo + o selo que a tarja de foto poupa
window._tProgRitmoAttr = function(ritmo) {
  // classe DUPLA (`sp-ritmo` + o estado): é ela que dá especificidade pra vencer o
  // achatamento da tarja de foto. `data-sp-fixa` fica como gancho de leitura/teste.
  return ritmo ? ' class="sp-ritmo sp-ritmo-' + ritmo + '" data-sp-fixa="1"' : ' data-sp-fixa="1"';
};
window._progBarPct = function(pct, color, h, radius, trackBg, outColor) {
  var p = Math.round(Number(pct) || 0);
  if (p < 0) p = 0; if (p > 100) p = 100;
  var fs = (h >= 17) ? '0.66rem' : '0.6rem';
  var base = 'position:absolute;top:0;height:100%;display:flex;align-items:center;font-size:' + fs +
    ';font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:0.2px;line-height:1;pointer-events:none;';
  var lbl = (p >= 16)
    ? '<span style="' + base + 'left:0;width:' + p + '%;justify-content:flex-end;padding-right:6px;box-sizing:border-box;color:#fff !important;text-shadow:0 1px 2px rgba(0,0,0,0.35);">' + p + '%</span>'
    : '<span style="' + base + 'left:' + p + '%;padding-left:6px;color:' + window._spCor((outColor || color), 'color') + ';">' + p + '%</span>';
  return '<div style="position:relative;width:100%;height:' + h + 'px;background:' + window._spCor(trackBg, 'background') + ';border-radius:' + radius + ';overflow:hidden;">' +
    '<div style="width:' + p + '%;height:100%;background:' + window._spCor(color, 'background') + ';transition:width 0.5s ease,background 0.5s ease;"></div>' + lbl +
  '</div>';
};
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
  // ── 1.9.101 · O FIM PROGRAMADO É REAL OU É CHUTE? ────────────────────────────
  // O relógio do meio vira REGRESSIVA ("restante") SÓ quando o fim programado é uma
  // data/hora que ALGUÉM CONFIGUROU (fase ou torneio) ou um evento REALMENTE agendado
  // (o próximo sorteio da Liga). Quando o fim é ESTIMADO por tempo de quadra
  // (gameDuration × jogos ÷ quadras), continua "decorrido": contagem regressiva pra um
  // prazo inventado é promessa que o app não tem como cumprir — o mesmo defeito que os
  // testes de "MENTIRA" (tests/liga-countdown.test.js) travam pro sorteio.
  var _schedEndReal = !!plannedEnd;
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
    // próximo sorteio = evento REALMENTE agendado (não estimativa) → vale regressiva.
    if (_nextDraw) { plannedEnd = _nextDraw; _schedEndReal = true; }
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
      var _rwP = null;
      if (_cfgEndMs) {
        // ⏱️ mesma régua do ramo das chaves: o prazo da FASE dividido pelas rodadas dela.
        // Rodada única (_plannedPhR<=1) devolve a janela inteira — sem regressão.
        _rwP = window._phaseRoundWindow(_cfgStartMs, _cfgEndMs, _roundNum, _plannedPhR);
        if (_rwP) {
          // (o rótulo das colunas é decidido UMA vez, no fim deste ramo)
          schedStart = _rwP.startMs; plannedEnd = _rwP.endMs; _schedEndReal = true;
        } else { plannedEnd = _cfgEndMs; _schedEndReal = true; }
      }
      else {
        // v2.0.74: tempo é POR SET — a partida desta FASE (`_ph`) pode ser 3 sets
        // (Rei/Rainha) ou 2,5 (melhor de 3). Régua única em sport-rules.js.
        var _crtMp = Math.max(parseInt(t.courtCount) || 1, 1), _slotMp = window._minutosDaPartida(t, _ph) + 5;
        plannedEnd = (schedStart || actualStart || Date.now()) + Math.ceil(_rTotal / _crtMp) * _slotMp * 60000;
        _schedEndReal = false;   // estimado por tempo de quadra → sem regressiva
      }
      // v2.8.8: multi-fase — "início real" é SÓ o 1º ponto da rodada (_roundStart).
      // Não herdar tournamentStarted (linha ~840) nem o fallback _thisDraw (linha ~890):
      // no multi-fase _thisDraw vem de drawFirstDate+intervalo (que NÃO se aplica) e
      // gerava "INÍCIO REAL 21/06 (futuro/passado) + DECORRIDO 0/21h". Sem ponto jogado
      // → actualStart null → _notStarted true → selo "⏳ Aguardando início".
      // v4.4.66: AUTO-DRAW (drawManual!==true) — a rodada foi sorteada automaticamente e já está
      // VALENDO a partir do início PROGRAMADO da fase; não é "aguardando início" (não há botão de
      // iniciar — é automático). Sem 1º ponto ainda, se a rodada está sorteada (_rTotal>0) e o
      // início programado (schedStart) já passou, usa schedStart como início real → "em andamento".
      // Antes do horário programado (ou manual) segue "aguardando início".
      if (_roundStart) actualStart = _roundStart;
      else if (t.drawManual !== true && _rTotal > 0 && schedStart && now >= schedStart) actualStart = schedStart;
      else actualStart = null;
      // rótulo: com a janela FATIADA por rodada as duas colunas são da RODADA (não da fase);
      // sem fatia (rodada única) seguem "programado", como antes.
      if (_rwP && _rwP.sliced) { _labelSchedStart = 'início da rodada'; _labelSchedEnd = 'final da rodada'; }
      else { _labelSchedStart = 'início programado'; _labelSchedEnd = 'final programado'; }
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
      // v4.5.x: fase eliminatória JÁ EM ANDAMENTO mas a rodada atual (ex.: Semifinais) ainda
      // sem 1º jogo → NÃO é "aguardando início" (o torneio não parou). Usa o fim da rodada
      // anterior desta fase como início efetivo. Só fica null quando a fase inteira não tem
      // nenhum jogo jogado — aí sim é "aguardando início" de verdade (mesma fonte do torneio).
      actualStart = _pr.roundStartMs || _pr.prevRoundEndMs || null;
      var _phL = (t.phases && t.phases[_cp]) || {};
      var _cfgSL = window._tProgParseMs(_phL.startDate ? (_phL.startDate + (_phL.startTime ? ('T' + _phL.startTime) : '')) : '') || window._tProgParseMs(t.startDate);
      var _cfgEL = window._tProgParseMs(_phL.endDate ? (_phL.endDate + (_phL.endTime ? ('T' + _phL.endTime) : '')) : '') || window._tProgParseMs(t.endDate);
      if (_cfgSL) schedStart = _cfgSL;
      if (_cfgEL) {
        // ⏱️ A REGRESSIVA É DA RODADA: fatia a janela da fase pelas rodadas dela e pega a
        // fatia desta rodada. Ver window._phaseRoundWindow (a régua e o porquê).
        var _rwL = window._phaseRoundWindow(_cfgSL || schedStart, _cfgEL, _pr.roundNum, _pr.roundsTotal);
        if (_rwL) {
          schedStart = _rwL.startMs; plannedEnd = _rwL.endMs; _schedEndReal = true;
          if (_rwL.sliced) { _labelSchedStart = 'início da rodada'; _labelSchedEnd = 'final da rodada'; }
        } else { plannedEnd = _cfgEL; _schedEndReal = true; }
      }
      else {
        // v2.0.74: tempo é POR SET — a partida desta fase (`_phL`). Ver sport-rules.js.
        var _crtL = Math.max(parseInt(t.courtCount) || 1, 1), _slotL = window._minutosDaPartida(t, _phL) + 5;
        plannedEnd = (schedStart || actualStart || Date.now()) + Math.ceil(_pr.total / _crtL) * _slotL * 60000;
        _schedEndReal = false;   // estimado por tempo de quadra → sem regressiva
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
      // ── v1.8.80 · O RELÓGIO DO TORNEIO COMPLETO ────────────────────────────
      // Relato do dono: _"o relógio do torneio completo está travado. vamos mudar a
      // consideração aqui para contar a partir do início programado até o final real
      // (assim não ficam 2 relógios com o mesmo valor durante toda a primeira fase)"_.
      // Eram DOIS defeitos numa conta só, e a conta antiga era
      // `último placar − primeiro placar`:
      //   • TRAVADO — o fim era o ÚLTIMO PLACAR, que não anda sozinho. Entre um jogo e
      //     outro o número ficava parado, parecendo relógio quebrado.
      //   • DUPLICADO — durante a 1ª fase o primeiro e o último placar do TORNEIO são
      //     os mesmos da FASE, então os dois painéis mostravam o mesmo valor o tempo
      //     todo. Dois relógios idênticos não informam nada; um deles é ruído.
      // Agora o torneio inteiro conta da sua PRÓPRIA âncora — o início PROGRAMADO
      // (`_win.startMs`, o início da 1ª fase, que já aparece na linha de baixo) — até o
      // final REAL quando encerra, ou até AGORA enquanto corre (é o `_progressTick` de
      // 1s que repinta este bloco, então o número anda de verdade).
      // Sem janela programada (torneio de fase única) NADA muda: não há segundo relógio
      // pra duplicar, e a medida entre placares é a que faz sentido ali.
      // 1.9.102: a âncora é QUANDO OS JOGOS PODERIAM COMEÇAR — o mais tarde entre o início
      // programado do torneio e o sorteio (window._tournamentPlayableFromTs). Só o início
      // programado não bastava: num torneio cujo sorteio sai depois da abertura, o relógio
      // já nascia contando dias em que ninguém tinha jogo pra jogar.
      var _tStartMs = (typeof window._tournamentPlayableFromTs === 'function' ? window._tournamentPlayableFromTs(t) : null)
        || (_win && _win.startMs) || _firstPointMs;
      // FIM EFETIVO: encerrado → o último placar lançado (o fim que de fato aconteceu);
      // correndo → AGORA. Fim = último placar enquanto o torneio corre foi o defeito da
      // 1.8.80: entre um jogo e outro o número ficava parado, parecendo relógio quebrado.
      var _tEndMs = _tournDone ? _lastPointMs : Date.now();
      var _tDurMs = Math.max(0, _tEndMs - _tStartMs);
      // 1.9.107: o DECORRIDO do torneio também ganha a cor do ritmo — a mesma régua da
      // rodada, medida na travessia inteira: quanto do torneio já foi jogado (_barPct)
      // contra quanto da janela programada já passou. SEM fim programado não há previsto
      // com que comparar → fica neutro (cor de texto), porque cor sem medida é palpite.
      var _tExpFrac = (_deadlineMs && _deadlineMs > _tStartMs) ? ((Date.now() - _tStartMs) / (_deadlineMs - _tStartMs)) : null;
      if (_tExpFrac != null) _tExpFrac = Math.max(0, Math.min(1, _tExpFrac));
      var _tRitmo = (_tExpFrac == null && !_tournDone) ? null : window._tProgRitmo((_barPct || 0) / 100, _tExpFrac == null ? 0 : _tExpFrac, _tournDone);
      var _tEndLabel = _tournDone ? 'final real' : 'último placar lançado';
      var _tDurLabel = _tournDone ? 'durou' : 'decorrido';
      // ⛔ 1.9.102 — AQUI NÃO ENTRA REGRESSIVA. Ordem do dono, com o card na frente: o
      // torneio completo mede a TRAVESSIA (decorrido), a rodada é que mede o PRAZO. Na
      // 1.9.101 os dois viraram regressiva e este ficou dizendo "83d restante" — número
      // grande que ninguém usa pra nada. Por isso `deadlineMs` NÃO é passado.
      var _tClk = window._tProgClock2L({ frozen: _tournDone, elapsedMs: _tDurMs, elapsedLabel: _tDurLabel, anchorMs: _tStartMs });
      var _tClkTitle = (_tStartMs === _firstPointMs)
        ? 'Desde o primeiro placar lançado'
        : 'Desde quando já dava pra jogar — início programado ou sorteio, o que veio depois (' + _date(_tStartMs) + ' ' + _time(_tStartMs) + ')';
      var _tTimeS = 'font-size:1rem;font-weight:800;color:var(--text-bright);line-height:1.1;';
      var _tLblS = 'font-size:0.6rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:700;line-height:1.25;';
      var _tCol = function(ms, label, align) {
        return '<div style="display:flex;flex-direction:column;align-items:' + align + ';gap:2px;min-width:0;">' +
          '<span style="' + _tTimeS + '">' + _time(ms) + '</span>' +
          '<span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;line-height:1.1;">' + _date(ms) + '</span>' +
          '<span style="' + _tLblS + 'text-align:' + (align === 'flex-end' ? 'right' : 'left') + ';">' + window._tProgLbl2L(label) + '</span>' +
        '</div>';
      };
      // v4.x: no TORNEIO COMPLETO só mostramos "final real" QUANDO encerra — o "último
      // placar lançado" era redundante (já aparece no painel da rodada) e, sendo largo,
      // descentralizava o DECORRIDO. Grid 1fr/auto/1fr mantém o DECORRIDO SEMPRE centrado
      // (a 3ª coluna fica vazia enquanto o torneio corre).
      var _rightCol = _tournDone ? _tCol(_lastPointMs, 'final real', 'flex-end') : '<div></div>';
      _durRow = '<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:flex-start;margin-top:9px;gap:8px;">' +
        _tCol(_firstPointMs, 'início real', 'flex-start') +
        // O `title` diz de ONDE o número parte: a coluna à esquerda mostra o início REAL
        // (primeira bola jogada), mas a contagem ancora no PROGRAMADO — sem isso o leitor
        // não teria como saber por que os dois não fecham.
        '<div title="' + _tClkTitle + '" style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;">' +
          '<span' + _tClk.attr + window._tProgRitmoAttr(_tRitmo) + ' style="font-size:1rem;font-weight:800;' + (_tRitmo ? '' : 'color:var(--text-bright);') + 'font-variant-numeric:tabular-nums;line-height:1.15;text-align:center;">' + _tClk.html + '</span>' +
          '<span style="' + _tLblS + '">' + _tClk.label + '</span>' +
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
      var _spLblS = 'font-size:0.6rem;color:var(--sp-c-60a5fa,#60a5fa);text-transform:uppercase;letter-spacing:0.4px;font-weight:700;line-height:1.25;';
      var _spCol = function(ms, label, align) {
        return '<div style="display:flex;flex-direction:column;align-items:' + align + ';gap:2px;min-width:0;">' +
          '<span style="font-size:1rem;font-weight:800;color:var(--sp-c-93c5fd,#93c5fd);line-height:1.1;">' + _time(ms) + '</span>' +
          '<span style="font-size:0.72rem;color:var(--sp-c-60a5fa,#60a5fa);font-weight:600;line-height:1.1;">' + _date(ms) + '</span>' +
          '<span style="' + _spLblS + 'text-align:' + (align === 'flex-end' ? 'right' : 'left') + ';">' + window._tProgLbl2L(label) + '</span>' +
        '</div>';
      };
      _schedRow = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:9px;gap:8px;">' +
        _spCol(_win.startMs, 'início programado', 'flex-start') +
        _spCol(_win.endMs, 'fim programado', 'flex-end') +
      '</div>';
    }

    _ligaBarHtml = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--sp-b-255-255-255-008,rgba(255,255,255,0.08));">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">' +
        '<span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--sp-c-a78bfa,#a78bfa);">🏆 Torneio completo</span>' +
        '<span style="font-size:0.82rem;font-weight:800;color:var(--text-bright);">' + _barDone + '/' + _barTotal + ' jogos (' + _barPct + '%)' + _barSuffix + '</span>' +
      '</div>' +
      window._progBarPct(_barPct, 'linear-gradient(90deg,#8b5cf6,#a78bfa)', 18, '7px', 'rgba(255,255,255,0.08)', '#a78bfa') +
      _durRow + (_schedRow || _limiteLine) +
    '</div>';
  }

  // Status "Torneio em andamento" no TOPO e CENTRO do box (pedido do dono) — verde pulsando.
  // Só no estado ATIVO; "encerrado" e "aguardando início" já têm indicadores próprios abaixo
  // (evita duplicar). Substitui o badge separado que ficava embaixo (tournaments.js).
  var _statusLine = (!isFinished && actualStart)
    ? '<div style="text-align:center;margin-bottom:9px;font-size:0.85rem;font-weight:800;color:var(--sp-c-4ade80,#4ade80);display:flex;align-items:center;justify-content:center;gap:7px;">' +
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
      ? '<div style="text-align:center;margin-bottom:8px;font-size:0.82rem;font-weight:700;color:var(--sp-c-93c5fd,#93c5fd);">⏳ Aguardando início</div>'
      : '';
    var _estMin2 = Math.round(window._estimateTournamentMinutes ? (window._estimateTournamentMinutes(t) || 0) : 0);
    var _estH = Math.floor(_estMin2 / 60), _estM = _estMin2 % 60;
    var _estStr2 = _estH > 0 ? (_estH + 'h' + (_estM ? (' ' + _estM + 'min') : '')) : (_estM + 'min');
    var _estLine2 = (_pending && _estMin2 > 0)
      ? '<div style="margin-top:7px;font-size:0.72rem;color:var(--sp-c-93c5fd,#93c5fd);font-weight:600;text-align:center;">⏱️ Duração estimada: ~' + _estStr2 + '</div>'
      : '';
    return head + _waitTop2 +
      window._progBarPct(prog.pct, c, 18, '7px', 'rgba(255,255,255,0.1)', c) +
      (prog.pct === 100 && !isFinished ? '<div style="margin-top:6px;font-size:0.75rem;color:var(--sp-c-10b981,#10b981);font-weight:600;">✅ ' + ((_isLiga || _phaseRoundActive) ? 'Rodada concluída!' : 'Todas as partidas concluídas!') + '</div>' : '') +
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

  // 1.9.107: ADIANTADO (verde) · NO PROGRAMADO (azul) · ATRASADO (vermelho) — régua
  // única do card (window._tProgRitmo), a mesma que pinta o relógio e a barra.
  var _ritmo = window._tProgRitmo(progFrac, expectedFrac, !!(isFinished || _roundComplete));
  var color = window._tProgRitmoBarra(_ritmo);

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
  // 1.9.101: fase/rodada COM fim programado de verdade (`_schedEndReal` — a mesma data que
  // a coluna azul da direita mostra como "final programado"/"próximo sorteio") → o relógio
  // do meio conta pra TRÁS até lá. Rodada encerrada ou torneio finalizado congela em "durou".
  var _clk = window._tProgClock2L({
    deadlineMs: _schedEndReal ? plannedEnd : null,
    frozen: !!(_roundEndReal || isFinished),
    elapsedMs: elapsedMs, elapsedLabel: _elapsedLabel,
    anchorMs: _notStarted ? null : actualStart
  });
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
  // 1.9.107: o rótulo lateral quebra em 2 linhas ("final<br>estimado", "início<br>real").
  // Numa linha só ele é a coisa mais larga da coluna e EMPURRAVA o relógio pra esquerda do
  // centro (relato do dono com o print). Mesma quebra que a linha azul do programado já usa.
  var _realCol = function(ms, label, align, withDate) {
    return '<div style="display:flex;flex-direction:column;align-items:' + align + ';gap:2px;min-width:0;">' +
      '<span style="' + _timeS + '">' + _time(ms) + '</span>' +
      (withDate ? '<span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;line-height:1.1;">' + _date(ms) + '</span>' : '') +
      '<span style="' + _lblS + 'text-align:' + (align === 'flex-end' ? 'right' : 'left') + ';">' + window._tProgLbl2L(label) + '</span>' +
    '</div>';
  };
  // coluna PROGRAMADO: horário + data + label (3 linhas, azul)
  var _progCol = function(ms, label, align) {
    return '<div style="display:flex;flex-direction:column;align-items:' + align + ';gap:2px;min-width:0;">' +
      '<span style="' + _timeS + 'color:var(--sp-c-93c5fd,#93c5fd);">' + _time(ms) + '</span>' +
      '<span style="font-size:0.72rem;color:var(--sp-c-60a5fa,#60a5fa);font-weight:600;line-height:1.1;">' + _date(ms) + '</span>' +
      '<span style="' + _lblS + 'color:var(--sp-c-60a5fa,#60a5fa);text-align:' + (align === 'flex-end' ? 'right' : 'left') + ';">' + window._tProgLbl2L(label) + '</span>' +
    '</div>';
  };

  // v2.7.79: antes de iniciar não há "início real / decorrido" — mostra só um
  // selo "⏳ Aguardando início" (a janela programada vem na linha de baixo).
  var topRow = _notStarted
    ? '<div style="text-align:center;margin-bottom:8px;font-size:0.82rem;font-weight:700;color:var(--sp-c-93c5fd,#93c5fd);">⏳ Aguardando início</div>'
    : '<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:flex-start;margin-bottom:7px;gap:8px;">' +
        _realCol(actualStart, 'início real', 'flex-start', _multiDay) +
        '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;">' +
          // v1.7.83/84: 2 linhas — este é o SEGUNDO renderizador do relógio (o do
          // painel da rodada); o outro é o do TORNEIO COMPLETO. Consertar só um
          // deixava o defeito de pé, que foi exatamente o que a verificação pegou.
          '<span' + _clk.attr + window._tProgRitmoAttr(_ritmo) + ' style="font-size:1rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.15;text-align:center;">' + _clk.html + '</span>' +
          '<span style="' + _lblS + '">' + _clk.label + '</span>' +
        '</div>' +
        _realCol(estEndMs, _endLabel, 'flex-end', _multiDay || !!_roundEndReal) +
      '</div>';
  // realizado (cor do ritmo) em cima, previsto (azul) embaixo — coladas, com o
  // percentual de cada uma dentro da própria cor.
  var realBar = window._progBarPct(progFrac * 100, color, 18, '7px 7px 0 0', 'rgba(255,255,255,0.1)', color);
  var blueBar = window._progBarPct(expectedFrac * 100, '#3b82f6', 16, '0 0 7px 7px', 'rgba(255,255,255,0.06)', '#3b82f6');
  var botRow = '<div style="display:grid;grid-template-columns:1fr 1fr;align-items:flex-start;margin-top:7px;gap:8px;">' +
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
  var _hasPhoto = !!(t && (window._tourCoverSrc(t) || t.venuePhotoUrl));
  var _rb = (_hasPhoto && typeof window._photoReadBox === 'function') ? window._photoReadBox() : null;
  var _wrapStyle = _rb
    ? 'margin-top:1rem;padding:14px 16px;border-radius:14px;background:' + window._spCor(_rb.bg, 'background') + ';border:1px solid ' + window._spCor(_rb.border, 'borda') + ';'
    : 'margin-top:1rem;';
  // Sobre foto: a CSS do tema claro INVERTE os hex claros de _buildProgressInner
  // (#60a5fa→#1d4ed8 etc.) pra escuro → ilegível na tarja escura. Em vez de caçar
  // cada cor, força TODO o texto da seção pra cor clara (fg) com !important via
  // <style> escopado (vence a inversão por ordem de origem). As BARRAS (background)
  // mantêm as cores semânticas (verde/azul/vermelho). Vale nos 2 temas.
  var _cssId = String((t && t.id) || '').replace(/[^a-zA-Z0-9_-]/g, '');
  // 1.9.107: o relógio do ritmo (verde/azul/vermelho) escapa deste achatamento pela
  // CLASSE, não por um `:not()` aqui — MEDIDO: o número do relógio mora em spans FILHOS
  // (_tProgFmtDur2L quebra em 2 linhas), então excluir só o pai deixava os filhos brancos,
  // que é exatamente o defeito relatado. `.sp-ritmo.sp-ritmo-X` (+ descendentes) tem
  // especificidade MAIOR que este seletor e leva !important — vence sem depender de
  // `:not(a b)` (CSS4: se o WebView não entendesse, a regra inteira cairia e a tarja
  // perderia o contraste de TODO o resto). Ver css/style.css · .sp-ritmo-*.
  var _scoped = _rb ? '<style>.tourn-progress-live[data-tid="' + _cssId + '"] *{color:' + _rb.fg + ' !important;}</style>' : '';
  return '<div class="info-box" style="' + _wrapStyle + '">' + _scoped + '<div class="tourn-progress-live" data-tid="' + _cssId + '">' + window._buildProgressInner(t) + '</div></div>';
};
// ── 1.9.80 · O TIQUE DO PROGRESSO ERA O TREM DE TRAVADAS ─────────────────────
// MEDIDO no aparelho do dono (Sentry, builds 78/79): travadas de ~1s repetidas a
// cada ~1,2s, SEM nome — scroll morto por 2s ("pode tentar o quanto for"), chave
// cortada ao rolar, toque sem feedback. Era este ticker: `innerHTML` POR SEGUNDO
// em TODAS as instâncias (vários cards da dash + o detalhe), e cada reescrita
// invalida o layout da página inteira (o detalhe do Confra tem ~6.000 nós).
// O conteúdo só muda em resolução de MINUTO (horas são HH:MM) ou quando um jogo
// conclui — reescrever por segundo era 60× desperdício com preço de ~1s de
// thread cada. Agora: (a) o DOM só é tocado se o HTML MUDOU (dirty-check por
// string; no segundo típico = ZERO writes, zero layout); (b) cadência 1s → 5s
// (imperceptível em resolução de minuto); (c) MEDIDO ('progress-tick') — se
// voltar a pesar, o relato do toque o nomeia.
window._progressTick = function() {
  var els = document.querySelectorAll('.tourn-progress-live');
  if (!els || !els.length) return;
  var passo = function () {
    var tours = (window.AppStore && window.AppStore.tournaments) || [];
    Array.prototype.forEach.call(els, function(el) {
      var tid = el.getAttribute('data-tid');
      var t = tours.find(function(x) { return String(x.id) === String(tid); });
      if (!t) return;
      try {
        var html = window._buildProgressInner(t);
        if (html !== el._spProgHtml) { el._spProgHtml = html; el.innerHTML = html; }
      } catch (e) {}
    });
  };
  if (window._medirTrecho) window._medirTrecho('progress-tick', passo); else passo();
};
window._ensureProgressTicker = function() {
  if (window._progressTickerOn) return;
  window._progressTickerOn = true;
  setInterval(window._progressTick, 5000);
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
    // v1.6.83 — DELIBERADO: aqui é t.endDate CRU, e tem que continuar sendo. Esta função
    // responde "quando a TEMPORADA da Liga acaba" (= a fase de pontos corridos), não "quando o
    // torneio acaba": é ela que faz o autoDraw parar de sortear rodadas. Num torneio de 2 fases,
    // trocar pelo fim da eliminatória faria a Liga seguir sorteando rodadas depois da fase já ter
    // avançado. Para MOSTRAR o fim do torneio use window._tournamentEndDate.
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

// ── 2.0.36 · A REGRESSIVA DA RODADA É DA RODADA, NÃO DA FASE ─────────────────
// Ordem do dono (24/ago/2026, ao avançar de fase no sandbox): _"está contando na regressiva
// da rodada o prazo até o final da FASE e não da rodada. O certo é ver o número de rodadas
// que teremos e dividir o prazo total da fase pelo número de rodadas e dar a regressiva para
// o final da rodada. E repetir isso até o final da fase."_
//
// O que acontecia: a fase materializada trazia início/fim CONFIGURADOS da fase e o relógio do
// meio contava até o fim da fase inteira. Numa fase de 4 rodadas isso diz "faltam 6 dias" na
// R1 — prazo que ninguém tem, porque a R1 precisa acabar muito antes disso.
//
// A régua, exatamente como o dono definiu: fatia [início da fase, fim da fase] em N pedaços
// IGUAIS (N = nº de rodadas da fase) e a rodada k fica com o k-ésimo pedaço. Rodada 1 de 4
// numa fase de 8 dias → 2 dias. Ao virar a rodada, a fatia anda — e repete até o fim da fase,
// onde a última fatia termina exatamente no fim da fase (sem sobra e sem estourar).
//
// FONTE ÚNICA de propósito: os DOIS ramos que montam a janela (Pontos Corridos multi-fase e
// fase posterior materializada) chamam esta função. Já foi provado neste arquivo que corrigir
// um ramo só deixa metade do defeito de pé. [[feedback_unify_dual_entry_points]]
// N=1 devolve a janela inteira da fase — rodada única e fase são a MESMA coisa, sem regressão.
window._phaseRoundWindow = function (phaseStartMs, phaseEndMs, roundNum, roundsTotal) {
    if (!phaseStartMs || !phaseEndMs || phaseEndMs <= phaseStartMs) return null;
    var n = parseInt(roundsTotal, 10); if (!n || n < 1) n = 1;
    var k = parseInt(roundNum, 10); if (!k || k < 1) k = 1;
    // mais rodadas do que o planejado (rodada extra) → o divisor é o que EXISTE, senão a
    // última rodada herdaria uma fatia que já venceu.
    if (k > n) n = k;
    var slot = (phaseEndMs - phaseStartMs) / n;
    return {
        startMs: Math.round(phaseStartMs + (k - 1) * slot),
        endMs: Math.round(phaseStartMs + k * slot),
        slotMs: slot, roundNum: k, roundsTotal: n, sliced: n > 1
    };
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
    // Nº de rodadas explicitamente configurado pelo organizador (phases[i].rounds). Quando
    // presente, é a INTENÇÃO — a janela de datas é só o limite EXTERNO, não a intenção.
    var _hasCfg = (ph.rounds != null && ph.rounds !== '' && !isNaN(parseInt(ph.rounds, 10)));
    var _cfg = _hasCfg ? parseInt(ph.rounds, 10) : 0;
    var planned = _hasCfg ? _cfg : 1;
    if (firstDate && interval >= 1 && endDate) {
        var _fs = String(firstDate).indexOf('T') > -1 ? firstDate : (firstDate + 'T' + firstTime);
        var _es = String(endDate).indexOf('T') > -1 ? endDate : (endDate + 'T23:59:59');
        var fd = new Date(_fs).getTime();
        var ed = new Date(_es).getTime();
        if (!isNaN(fd) && !isNaN(ed) && ed > fd) {
            // v4.x: contagem ESTRITA. Um sorteio agendado EXATAMENTE no fim da fase NÃO
            // dispara — o poller pula qualquer slot com horário >= fim (bracket-logic
            // _checkLigaAutoDraws: guardas now>fim e scheduled>fim). Então esse último
            // slot não pode virar rodada e não deve entrar na contagem, senão o organizador
            // é enganado ("marca 3 rodadas" mas só 2 acontecem). floor((diff-1)/step)+1 =
            // nº de sorteios fd+k*step ESTRITAMENTE antes de ed. Só difere de
            // floor(diff/step)+1 quando o último slot coincide com o fim — exatamente o caso.
            var _derived = Math.floor((ed - fd - 1) / (interval * 86400000)) + 1;
            // v4.x (pedido do dono, "Nº de rodadas manda"): a janela de datas é o LIMITE
            // EXTERNO; o Nº configurado é a intenção. Se a janela comporta MAIS sorteios que
            // o N pedido (ex.: N=2 mas fim 11/07 23:00 dá 3 slots diários), o N manda (cap);
            // se comporta MENOS (fim antes de 1º+N×intervalo), a janela reduz (não dá pra
            // sortear além do fim). Sem N explícito, a janela deriva sozinha (comportamento
            // legado, sem regressão). Reconcilia o estado inconsistente onde phases[i].rounds
            // e o fim da fase discordam — a barra passa a bater com o motor de config.
            planned = _hasCfg ? Math.min(_cfg, _derived) : _derived;
        }
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
    if (!t) return null;
    // v1.2.42 — FONTE ÚNICA: a MESMA matemática que o SERVIDOR usa pra decidir se/quando
    // sortear (`_nextOwedDrawMs` → `nextDrawAt`, o campo que o cron do autoDraw consulta em
    // `where('nextDrawAt','<=',now)`). O relógio promete "Próximo sorteio" SE E SOMENTE SE o
    // sorteio VAI acontecer.
    // Antes usava `_calcNextDrawDate`, que é só ARITMÉTICA DE DATA (1º sorteio + N×intervalo)
    // e não sabe de `drawManual`, `lastAutoDrawAt`, "sem repetição" (intervalo vazio = sorteio
    // ÚNICO), `status:'finished'` nem do cap de fase. Resultado: prometia sorteio que nunca
    // vinha — torneio MANUAL, torneio RESETADO (o reset seta drawManual=true), e data de
    // sorteio no PASSADO sem intervalo (já disparou, não repete). Duas noções de "próximo
    // sorteio" = drift garantido; agora é uma só, e é a do servidor.
    // Cap de FASE ÚNICA por rodadas planejadas fica aqui de propósito: `_nextOwedDrawMs` só
    // capa por fase (`_suppressAutoDrawForPhases` é no-op em fase única) e por fim de temporada.
    var _mp = !!(typeof window._isMultiPhase === 'function' && window._isMultiPhase(t));
    if (!_mp && typeof window._ligaTournamentProgress === 'function') {
        var _lp = window._ligaTournamentProgress(t);
        if (_lp && _lp.roundsPlanned && _lp.currentRoundNum >= _lp.roundsPlanned) return null;
    }
    if (typeof window._nextOwedDrawMs !== 'function') return null;
    var _ts = window._nextOwedDrawMs(t);
    // Slot DEVIDO (<= agora) não é "próximo": o cron dispara em ≤1min — não há o que contar.
    if (_ts == null || isNaN(_ts) || _ts <= Date.now()) return null;
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

// v4.4.x: início (ms) da RODADA ATUAL da Liga — pra "Rodada em andamento" (tempo decorrido
// da rodada, não do torneio). Mesma regra do progresso: 1º ponto real da rodada (m.startedAt);
// sem ponto ainda, cai no horário PROGRAMADO do sorteio desta rodada (drawFirstDate + ri*intervalo);
// sem agendamento (sorteio manual), usa createdAt/drawnAt da rodada. null se não há rodada.
window._ligaCurrentRoundStartTs = function (t) {
    if (!t || !Array.isArray(t.rounds) || !t.rounds.length) return null;
    var _ri = t.rounds.length - 1;
    var _curR = t.rounds[_ri] || {};
    var _rMatches = (_curR.matches || []).filter(function (m) { return !m.isSitOut; });
    var _starts = _rMatches.map(function (m) { return m.startedAt ? (+m.startedAt) : 0; }).filter(function (x) { return x; });
    if (_starts.length) return Math.min.apply(null, _starts); // 1º ponto real da rodada
    var _fdStr = String(t.drawFirstDate || '').indexOf('T') > -1 ? t.drawFirstDate : (t.drawFirstDate ? (t.drawFirstDate + 'T' + (t.drawFirstTime || '19:00')) : '');
    var _firstDrawMs = _fdStr ? new Date(_fdStr).getTime() : NaN;
    if (!isNaN(_firstDrawMs)) {
        var _intvDays = parseInt(t.drawIntervalDays) || 7; if (_intvDays < 1) _intvDays = 1;
        return _firstDrawMs + _ri * (_intvDays * 86400000);
    }
    var _rt = _curR.createdAt || _curR.drawnAt || _curR.at; // sorteio manual: carimbo da rodada
    if (_rt) { var _rm = new Date(_rt).getTime(); if (!isNaN(_rm)) return _rm; }
    return null;
};

// v4.4.x: fim (ms) da RODADA ATUAL da Liga QUANDO todos os resultados já foram lançados
// (todas as partidas não-folga têm vencedor). = último placar concluído (max m.resultAt) ou
// completedAt da rodada. null se a rodada AINDA não encerrou (ou não dá pra carimbar o fim) →
// nesse caso o relógio segue "em andamento". Usado pra CONGELAR o relógio em "Rodada encerrada".
window._ligaCurrentRoundEndTs = function (t) {
    if (!t || !Array.isArray(t.rounds) || !t.rounds.length) return null;
    var _curR = t.rounds[t.rounds.length - 1] || {};
    var _rMatches = (_curR.matches || []).filter(function (m) { return !m.isSitOut; });
    if (!_rMatches.length) return null;
    var _allDone = _rMatches.every(function (m) { return !!m.winner || m.isBye; });
    if (!_allDone) return null; // rodada não encerrada
    var _ends = _rMatches.map(function (m) { return m.resultAt ? (+m.resultAt) : 0; }).filter(function (x) { return x; });
    if (_ends.length) return Math.max.apply(null, _ends);
    if (_curR.completedAt) { var _c = new Date(_curR.completedAt).getTime(); if (!isNaN(_c)) return _c; }
    return null; // encerrada mas sem carimbo de fim → não congela com valor errado
};

// v1.6.85: a RODADA ATUAL ainda tem jogo por jogar? (true = há placar pendente). Base do
// estado 'round-end' do relógio: só faz sentido contar o prazo de quem AINDA TEM O QUE JOGAR.
// Cobre as três formas de storage: fase posterior de chave (t.matches por phaseIndex),
// rodadas nativas de Pontos Corridos/Suíço/Rei-Rainha (t.rounds) e chave de fase única.
// BYE e folga não são jogo → não seguram a rodada aberta.
window._currentRoundHasPendingGames = function (t) {
    if (!t) return false;
    var _cp = t.currentPhaseIndex || 0;
    if (_cp >= 1 && typeof window._phaseCurrentRoundProgress === 'function') {
        var _pr = window._phaseCurrentRoundProgress(t);
        if (_pr && _pr.total > 0) return !_pr.complete;
    }
    if (Array.isArray(t.rounds) && t.rounds.length) {
        var _rm = ((t.rounds[t.rounds.length - 1] || {}).matches || []).filter(function (m) { return m && !m.isSitOut && !m.isBye; });
        if (_rm.length) return _rm.some(function (m) { return !m.winner; });
    }
    if (Array.isArray(t.matches) && t.matches.length) {
        return t.matches.some(function (m) { return m && !m.winner && !m.isBye && !m.isSitOut && (m.phaseIndex || 0) === _cp; });
    }
    return false;
};

// v1.6.85: FIM PROGRAMADO DA RODADA ATUAL (ms) — o PRAZO que as pessoas têm pra jogar e lançar
// os placares desta rodada. É a fonte do estado 'round-end' do relógio (o pedido do dono,
// ago/2026: "depois do sorteio automático o cronômetro tem que ser a regressiva pro FIM DA
// RODADA ATUAL"). Vale o MAIS APERTADO entre os dois prazos que o torneio REALMENTE tem:
//   • próximo sorteio agendado (a rodada vale até a próxima começar) — pela math do SERVIDOR
//     (_ligaNextDrawEventTs), nunca por aritmética de data: prazo que ninguém vai disparar
//     não é prazo (ver [MENTIRA-1]/[MENTIRA-2] em tests/liga-countdown.test.js);
//   • fim configurado da FASE ATUAL (phases[i].endDate/endTime); na fase INICIAL sem fim
//     próprio, `t.endDate` É o fim dela (cânone v1.6.80 — o box "📅 Datas da fase" do
//     formulário mora dentro da fase inicial).
// Data SEM hora vira FIM DO DIA (23:59:59): prazo é o fim do dia, não meio-dia.
// Sem NENHUMA data configurada → null (o relógio volta pro "Rodada em andamento", que conta
// pra cima). Não estimamos por tempo de quadra aqui de propósito: prazo estimado é promessa
// inventada — o mesmo defeito que os testes de "MENTIRA" travam pro sorteio.
// Nota: a barra "Progresso do Torneio" (_buildProgressInner) mostra este mesmo instante como
// "final programado", derivado dos MESMOS campos (fase → torneio).
function _rseParseMs(dateStr, timeStr) {
    if (!dateStr) return null;
    var s = String(dateStr);
    var ms = new Date(s.indexOf('T') > -1 ? s : (s + 'T' + (timeStr || '23:59:59'))).getTime();
    return isNaN(ms) ? null : ms;
}
window._roundScheduledEndTs = function (t) {
    if (!t) return null;
    var _cands = [];
    var _nd = (typeof window._ligaNextDrawEventTs === 'function') ? window._ligaNextDrawEventTs(t) : null;
    if (_nd) _cands.push(_nd);
    var _cp = t.currentPhaseIndex || 0;
    var _ph = (Array.isArray(t.phases) && t.phases[_cp]) || {};
    var _pe = _rseParseMs(_ph.endDate, _ph.endTime);
    if (_pe == null && _cp === 0) _pe = _rseParseMs(t.endDate, t.endTime);
    if (_pe != null) _cands.push(_pe);
    if (!_cands.length) return null;
    return Math.min.apply(null, _cands);
};

// v4.4.x: FONTE ÚNICA do indicador da RODADA ATUAL. Enquanto a rodada roda → "▶️ Rodada em
// andamento" com o tempo decorrido tickando (data-elapsed-since). Quando TODOS os resultados
// foram lançados → "🏁 Rodada encerrada" com a DURAÇÃO TOTAL CONGELADA (sem data-elapsed-since,
// não conta mais). Qualquer box que mostre isso DEVE usar este helper — texto/semântica num só
// lugar. Retorna os 3 <span> internos, ou '' quando não há rodada. O box (borda/fundo) é do chamador.
//   color: cor do texto. opts: { iconSize, labelSize, valueSize }.
window._ligaRoundInProgressRow = function (t, color, opts) {
    var _since = (typeof window._ligaCurrentRoundStartTs === 'function' && window._ligaCurrentRoundStartTs(t))
        || (typeof window._ligaElapsedSinceTs === 'function' && window._ligaElapsedSinceTs(t));
    if (!_since || _since > Date.now()) return '';
    opts = opts || {};
    var _icon = opts.iconSize || '1.3rem', _lbl = opts.labelSize || '0.85rem', _val = opts.valueSize || '1.15rem';
    var _endTs = (typeof window._ligaCurrentRoundEndTs === 'function') ? window._ligaCurrentRoundEndTs(t) : null;
    // v1.7.86: mesma regra da linha de cima — rótulo e relógio EMPILHADOS, porque
    // dividindo uma linha só o rótulo virava "Rodada em …". Ordem do dono: "a mesma
    // coisa logo abaixo." O ícone segue na coluna da esquerda.
    var _valStyle = 'font-size:' + _val + ';font-weight:800;color:' + color + ' !important;font-variant-numeric:tabular-nums;letter-spacing:0.3px;line-height:1.15;overflow-wrap:anywhere;';
    var _lblStyle = 'font-size:' + _lbl + ';font-weight:700;color:' + color + ' !important;line-height:1.2;overflow-wrap:anywhere;';
    // v1.8.98: mesma grade da linha de cima — ícone, rótulo (pode quebrar) e o relógio
    // à DIREITA. O nome `_pilha` ficou do layout empilhado anterior; o que ele monta
    // agora são três colunas. Os dois relógios da caixa precisam alinhar entre si, então
    // as duas linhas TÊM que usar a mesma grade — se divergirem, um fica fora do prumo
    // do outro e o alinhamento pedido se perde justamente na comparação.
    var _pilha = function (icone, rotulo, valorHtml) {
        return '<span style="font-size:' + _icon + ';">' + icone + '</span>' +
            '<span style="' + _lblStyle + 'min-width:0;">' + rotulo + '</span>' +
            '<span style="text-align:right;white-space:nowrap;">' + valorHtml + '</span>';
    };
    if (_endTs && _endTs >= _since) {
        // ENCERRADA — relógio congelado na duração total (sem data-elapsed-since → não ticka).
        var _dur = window._formatCountdown ? window._formatCountdown(_endTs - _since) : '';
        return _pilha('🏁', 'Rodada encerrada', '<span style="' + _valStyle + '">' + _dur + '</span>');
    }
    var _txt = window._formatCountdown ? window._formatCountdown(Date.now() - _since) : '';
    return _pilha('▶️', 'Rodada em andamento',
        '<span data-elapsed-since="' + _since + '" style="' + _valStyle + '">' + _txt + '</span>');
};

// v4.x: FONTE ÚNICA da decisão do COUNTDOWN da Liga (o box "Início da temporada / Próximo
// sorteio / Rodada em andamento / Fim do torneio"). Detalhe (tournaments.js) e card
// (dashboard.js) chamam DAQUI e só renderizam — a lógica de estados vive num lugar só, com
// teste, pra parar de regredir. Retorna { ts, labelKey, icon, color, kind } ou null.
//   kind: 'season-start' | 'first-draw' | 'next-draw' | 'round-end' | 'tournament-end' |
//         'round-in-progress'.
//   'round-in-progress' vem com ts=null (box próprio, decorrido da rodada). No 'next-draw' e
//   no 'round-end' o chamador ainda desenha a 2ª linha "Rodada em andamento".
// ESTADOS (na ordem de prioridade — o dono definiu):
//   1) ANTES do 1º sorteio → regressiva "Início da temporada" pro 1º evento futuro:
//      startDate se futuro; senão o 1º sorteio agendado (drawFirstDate) — cobre auto E manual,
//      e o caso em que o startDate já passou mas o sorteio ainda não (bug do print).
//   2) sorteado + próximo sorteio AUTO agendado (≤ fim) → "Próximo sorteio".
//   3) sorteado + rodada com jogo PENDENTE + prazo da rodada no futuro → "Fim da rodada":
//      REGRESSIVA pro fim programado da rodada (_roundScheduledEndTs) = o tempo que as
//      pessoas têm pra jogar e lançar os placares. Pedido do dono (ago/2026).
//   4) sorteado + rodada ATIVA (ainda não encerrada), sem prazo conhecido → "Rodada em
//      andamento" (conta PRA CIMA) — PRIORIDADE sobre o "Fim do torneio": um jogo rolando
//      NUNCA fica escondido pela regressiva de fim.
//   5) "Fim do torneio" só nas últimas 48h (multi-fase = fim da ÚLTIMA fase).
//   6) sorteado, fora das 48h, sem sorteio por vir → "Rodada em andamento" (mesmo encerrada).
window._ligaCountdownEvent = function (t) {
    if (!t) return null;
    var now = Date.now();
    var drew = (Array.isArray(t.matches) && t.matches.length > 0) || (Array.isArray(t.rounds) && t.rounds.length > 0) || (Array.isArray(t.groups) && t.groups.length > 0);
    // 1) Antes do 1º sorteio. DOIS casos, e o rótulo TEM que dizer a verdade:
    //    a) startDate no FUTURO → a temporada ainda não começou → "Início da Temporada".
    //    b) startDate JÁ PASSOU (temporada em curso) mas o 1º sorteio ainda não rolou → o que
    //       falta é o SORTEIO → "Próximo sorteio" (🎲). Rotular isto de "Início da Temporada"
    //       é mentira — a temporada já começou (bug reportado pelo dono, 17/jul).
    //    kind 'first-draw' ≠ 'next-draw' de propósito: aqui NÃO há rodada rolando, então o
    //    chamador não pode desenhar a linha "Rodada em andamento" (o _ligaRoundInProgressRow
    //    cai no fallback do startDate e inventaria uma rodada que não existe).
    if (!drew) {
        if (t.startDate) { var _sd = new Date(t.startDate).getTime(); if (!isNaN(_sd) && _sd > now) return { ts: _sd, labelKey: 'tourn.ligaStart', icon: '🏁', color: '#10b981', kind: 'season-start' }; }
        // v1.2.42: o 1º sorteio só é PROMETIDO se ele VAI acontecer — mesma math do servidor
        // (_ligaNextDrawEventTs → _nextOwedDrawMs → o que o cron do autoDraw dispara). Antes
        // lia drawFirstDate cru e prometia "Próximo sorteio" até em torneio MANUAL, onde nada
        // dispara sozinho (o organizador é quem sorteia).
        var _fd = (typeof window._ligaNextDrawEventTs === 'function') ? window._ligaNextDrawEventTs(t) : null;
        if (_fd) return { ts: _fd, labelKey: 'tourn.nextDraw', icon: '🎲', color: '#fb923c', kind: 'first-draw' };
    }
    // Fim (ms): endDate ou temporada; multi-fase = fim da ÚLTIMA fase (janela programada).
    var tEnd = null;
    if (t.endDate) { var _ed = new Date(String(t.endDate).indexOf('T') > -1 ? t.endDate : (t.endDate + 'T23:59:59')).getTime(); if (!isNaN(_ed)) tEnd = _ed; }
    if (tEnd == null) { var _sm = t.ligaSeasonMonths || t.rankingSeasonMonths; if (_sm && t.startDate) { var _ss = new Date(t.startDate); if (!isNaN(_ss.getTime())) { var _se = new Date(_ss); _se.setMonth(_se.getMonth() + parseInt(_sm)); tEnd = _se.getTime(); } } }
    if (window._isMultiPhase && window._isMultiPhase(t) && typeof window._tournamentScheduledWindow === 'function') { var _w = window._tournamentScheduledWindow(t); if (_w && _w.endMs) tEnd = _w.endMs; }
    // 2) Sorteado + próximo sorteio AUTO agendado (≤ fim) → próximo sorteio.
    if (drew && typeof window._ligaNextDrawEventTs === 'function') {
        var _nd = window._ligaNextDrawEventTs(t);
        if (_nd && _nd > now && (tEnd == null || _nd <= tEnd)) return { ts: _nd, labelKey: 'tourn.nextDraw', icon: '🎲', color: '#fb923c', kind: 'next-draw' };
    }
    // 3) Sorteado + rodada com jogo PENDENTE + prazo conhecido no futuro → REGRESSIVA pro fim
    //    da rodada. É o relógio que o dono pediu: depois do sorteio, o que importa pra quem vai
    //    jogar é QUANTO TEMPO FALTA pra jogar e lançar o placar — não há de onde tirar isso
    //    contando pra cima. Vem ANTES do 'round-in-progress' (que conta o decorrido e vira a 2ª
    //    linha do box) e antes do 'tournament-end'. Rodada já 100% lançada não entra: aí não há
    //    mais o que jogar e o relógio volta a ser o do fim/decorrido congelado.
    if (drew && typeof window._roundScheduledEndTs === 'function' &&
        typeof window._currentRoundHasPendingGames === 'function' && window._currentRoundHasPendingGames(t)) {
        var _rEndSched = window._roundScheduledEndTs(t);
        if (_rEndSched != null && _rEndSched > now) {
            return { ts: _rEndSched, labelKey: 'tourn.roundEnd', icon: '⏳', color: '#38bdf8', kind: 'round-end' };
        }
    }
    // 4) Sorteado + rodada ATIVA (não encerrada) → rodada em andamento (PRIORIDADE sobre o fim).
    if (drew && typeof window._ligaCurrentRoundStartTs === 'function') {
        var _rs = window._ligaCurrentRoundStartTs(t);
        var _reEnd = (typeof window._ligaCurrentRoundEndTs === 'function') ? window._ligaCurrentRoundEndTs(t) : null;
        if (_rs && _reEnd == null) return { ts: null, labelKey: null, icon: null, color: null, kind: 'round-in-progress' };
    }
    // 5) Fim do torneio SÓ nas últimas 48h.
    if (tEnd != null && tEnd > now && (tEnd - now) <= 48 * 3600000) return { ts: tEnd, labelKey: 'event.tournamentEnd', icon: '🏆', color: '#8b5cf6', kind: 'tournament-end' };
    // 6) Sorteado, fora das 48h, sem sorteio por vir → rodada em andamento (mesmo encerrada).
    if (drew && typeof window._ligaRoundInProgressRow === 'function') return { ts: null, labelKey: null, icon: null, color: null, kind: 'round-in-progress' };
    return null;
};

// v1.6.85: FONTE ÚNICA do BOX do relógio da Liga (o HTML, não só a decisão). O detalhe
// (tournaments.js) e o card do dashboard (dashboard.js) desenhavam o MESMO box em cópias
// separadas, e as cópias divergiram: o detalhe tratava o caso "sem linha de rodada pra
// desenhar" e o card CAÍA no render genérico com o evento vazio do 'round-in-progress'
// (ts/labelKey/icon = null) — imprimindo literalmente "null null 0s" no card (relato do
// dono, ago/2026, sandbox do Confra: rodada sorteada às 12h pra valer às 19h, então o
// "decorrido" ainda não existia). Com um render só, o buraco não tem onde se esconder.
//   size: 'lg' (detalhe) | 'sm' (card); marginTop: espaço acima (o card encosta o box no
//   toggle da Liga quando ele existe). Devolve '' quando não há nada a mostrar.
window._ligaCountdownBoxHtml = function (t, size, marginTop) {
    if (!t) return '';
    var _mt = marginTop || '10px';
    var _ce = (typeof window._ligaCountdownEvent === 'function') ? window._ligaCountdownEvent(t) : null;
    if (!_ce) return '';
    var _lg = (size !== 'sm');
    var _rb = (typeof window._photoReadBox === 'function') ? window._photoReadBox()
        : { bg: 'rgba(0,0,0,0.5)', fg: '#f1f5f9', border: 'rgba(255,255,255,0.12)' };
    var _fg = _rb.fg; // SEMPRE tarja escura + texto claro → legível em qualquer tema/foto
    var _rowFn = (typeof window._ligaRoundInProgressRow === 'function') ? window._ligaRoundInProgressRow : null;

    // Rodada em andamento (sem regressiva) → box próprio com o tempo DECORRIDO.
    if (_ce.kind === 'round-in-progress') {
        var _solo = _rowFn ? _rowFn(t, _fg) : '';
        if (!_solo) return ''; // nada a dizer — NUNCA cair no render genérico (era o "null null 0s")
        return '<div style="margin-top:' + _mt + ';display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:10px 14px;background:' + window._spCor(_rb.bg, 'background') + ';border:1px solid rgba(56,189,248,0.45);border-radius:12px;">' + _solo + '</div>';
    }
    // Guarda dura: box com regressiva EXIGE alvo e rótulo. Sem isso não se desenha nada.
    var _ts = _ce.ts;
    if (_ts == null || isNaN(_ts) || !_ce.labelKey) return '';
    var _label = (typeof window._t === 'function') ? window._t(_ce.labelKey) : _ce.labelKey;
    if (!_label) return '';
    var _txt = window._formatCountdown ? window._formatCountdown(_ts - Date.now()) : '';
    var _cm = { '#10b981': '16,185,129', '#fb923c': '251,146,60', '#8b5cf6': '139,92,246', '#38bdf8': '56,189,248' };
    var _rgb = _cm[_ce.color] || '139,92,246';

    // 2ª linha "Rodada em andamento" (decorrido) quando o box é de sorteio/prazo da rodada —
    // a rodada rolando nunca some, só deixa de ser o número principal.
    var _line2 = '';
    if ((_ce.kind === 'next-draw' || _ce.kind === 'round-end') && _rowFn) {
        var _row = _rowFn(t, _fg, _lg ? { iconSize: '1.2rem', labelSize: '0.9rem', valueSize: '1.25rem' }
                                      : { iconSize: '1.1rem', labelSize: '0.8rem', valueSize: '1.05rem' });
        if (_row) {
            _line2 = '<div style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;margin-top:' + (_lg ? '12px;padding-top:12px' : '8px;padding-top:8px') + ';border-top:1px solid rgba(' + _rgb + ',0.3);">' + _row + '</div>';
        }
    }
    var _box = _lg
        ? 'padding:14px 18px;background:' + window._spCor(_rb.bg, 'background') + ';border:1.5px solid rgba(' + _rgb + ',0.7);border-radius:14px;box-shadow:0 0 0 1px rgba(' + _rgb + ',0.15);'
        : 'padding:10px 14px;background:' + window._spCor(_rb.bg, 'background') + ';border:1px solid rgba(' + _rgb + ',0.55);border-radius:12px;';
    return '<div style="margin-top:' + _mt + ';' + _box + '">' +
        // v1.7.86: rótulo e relógio EMPILHADOS. Antes dividiam UMA linha e, com a
        // escala grande, o rótulo virava "Fim da r…" — some justamente a palavra
        // que diz DE QUE prazo se trata. Ordem do dono, olhando o card: "aqui o
        // fim da r... e o timer devem ficar em 2 linhas para nao truncar."
        // O ícone fica na coluna da esquerda (não empilha com o texto); rótulo em
        // cima, número embaixo — e o rótulo pode quebrar em quantas linhas quiser.
        // ── v1.8.98: contador à DIREITA, ícone e rótulo à esquerda ──────────────
        // Ordem do dono: "vamos alinhar os contadores na direita e deixar o titulo e
        // icone como estao na esquerda".
        // ⚠️ NÃO é voltar ao layout de UMA linha da v1.7.85 — aquele TRUNCAVA o rótulo
        // ("Fim da r…"), e foi o dono quem mandou empilhar por causa disso (v1.7.86).
        // Aqui são duas COLUNAS: a da esquerda pode quebrar em quantas linhas precisar
        // (nunca corta), e a da direita é só o relógio, com `white-space:nowrap` pra ele
        // jamais partir no meio. É o alinhamento pedido sem reabrir o corte.
        '<div style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:' + (_lg ? '12px' : '10px') + ';">' +
          '<span style="font-size:' + (_lg ? '1.5rem' : '1.3rem') + ';">' + _ce.icon + '</span>' +
          '<span style="font-size:' + (_lg ? '0.95rem' : '0.85rem') + ';font-weight:700;color:' + _fg + ' !important;line-height:1.2;overflow-wrap:anywhere;min-width:0;">' + _label + '</span>' +
          '<span data-countdown-target="' + _ts + '" style="font-size:' + (_lg ? '1.35rem' : '1.1rem') + ';font-weight:900;color:' + _fg + ' !important;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;">' + _txt + '</span>' +
        '</div>' + _line2 +
    '</div>';
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
        return (m === 'time' || m === 'teams') ? 'Apenas times' : m === 'misto' ? 'Misto (individual + times)' : 'Individual';
    }
    function fmtScoring() {
        var s = t.scoring;
        if (!s || s.type !== 'sets') return 'Placar simples';
        var stw = parseInt(s.setsToWin) || 1;
        var parts = [stw <= 1 ? '1 set' : 'Melhor de ' + (stw * 2 - 1) + ' sets'];
        parts.push((parseInt(s.gamesPerSet) || 6) + ' games/set');
        if (s.countingType === 'tennis') parts.push('15/30/40');
        if (s.advantageRule) parts.push('com vantagem');
        if (s.tiebreakEnabled) {
            // Mostra ONDE o tie-break dispara (5-5 / 6-6) — só "tiebreak 7pts" não dizia em que
            // placar de games ele entra, que é justamente o que muda entre Beach Tennis e Tênis.
            // Fonte ÚNICA: _tbLoserGames (a mesma que o placar ao vivo usa pra disparar o TB) —
            // nada de recalcular a regra aqui. [[project_live_scoring_canonical]]
            var _tbAtG = (typeof window._tbLoserGames === 'function')
                ? window._tbLoserGames(s, t.sport)
                : ((s.tiebreakAt === 'g-1') ? Math.max(1, (parseInt(s.gamesPerSet) || 6) - 1) : (parseInt(s.gamesPerSet) || 6));
            parts.push('tiebreak ' + (parseInt(s.tiebreakPoints) || 7) + 'pts (' + _tbAtG + '-' + _tbAtG + ')');
        }
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
        var le = (window._effectiveLateEnrollment ? window._effectiveLateEnrollment(t) : t.lateEnrollment) || 'closed';
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
    var bgStyle = opts.bg ? ('background:' + window._spCor(opts.bg, 'background') + ';color:' + (_rbC ? _rbC.fg : '#f1f5f9') + ' !important;border:1px solid ' + window._spCor((_rbC ? _rbC.border : 'rgba(255,255,255,0.12)'), 'borda') + ';') : '';
    // v4.4.x: SEMPRE colapsado por padrão — no DETALHE e na DASHBOARD (pedido do dono:
    // "sempre fechado no detalhe e na dashboard"). Abre só quando o usuário clica (estado
    // do <details> na sessão); sem persistência de "aberto" — todo render começa fechado.
    var openAttr = '';
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
        ' style="font-size:0.75rem;padding:6px 10px;line-height:1.55;border-radius:8px;min-width:0;max-width:100%;box-sizing:border-box;overflow:hidden;' + bgStyle + '">' +
        '<summary onclick="event.stopPropagation();" style="cursor:pointer;font-weight:700;list-style:none;display:flex;flex-direction:column;gap:3px;min-width:0;max-width:100%;">' +
        // v1.7.83: a ordem era ⚙️ + NOME DO FORMATO + "configuração ▾" na MESMA
        // linha, com o nome elipsado — e com a escala grande (até 1.7) ele nunca
        // cabia: "Pontos Corridos / El…" (medido +8px). O nome do formato é a
        // informação; "configuração ▾" é o CONTROLE de abrir/fechar.
        // Ordem do dono: "aqui a configuracao com a seta para descolapsar fica na
        // primeira linha e o resto vai para a linha de baixo" · "aqui o box pode
        // ter mais linhas quando necessario."
        // Então: linha 1 = ⚙️ configuração ▾ (sempre cabe, é curto); linha 2+ =
        // o formato INTEIRO, quebrando em quantas linhas precisar. Zero corte.
        '<span style="display:flex;align-items:center;gap:6px;min-width:0;max-width:100%;">' +
        '<span style="flex-shrink:0;">⚙️</span>' +
        '<span style="opacity:0.7;font-weight:500;font-size:0.68rem;white-space:nowrap;">configuração ▾</span>' +
        '</span>' +
        '<span style="min-width:0;max-width:100%;overflow-wrap:anywhere;line-height:1.35;padding-left:22px;">' + summary + '</span>' +
        (digestLine ? '<span style="font-weight:500;font-size:0.68rem;opacity:0.85;line-height:1.4;padding-left:22px;">' + digestLine + '</span>' : '') +
        '</summary>' +
        '<div style="margin-top:6px;display:flex;flex-direction:column;gap:2px;">' + rows.join('') + '</div>' +
        '</details>';
};

// ─── A FASE ATUAL É ELIMINATÓRIA? (fonte ÚNICA) ──────────────────────────────
// Critério ESTRUTURAL, não por nome de formato nem por lista de brackets: uma fase de
// RODADAS SUCESSIVAS (Pontos Corridos / Suíço / Rei-Rainha) guarda os jogos em
// `t.rounds[].matches`; uma fase de CHAVE guarda em `t.matches` com `bracket`. Se a fase
// ATUAL tem jogo em t.matches, é eliminatória.
//
// POR QUE NÃO LISTAR NOMES DE BRACKET: as linhas de uma fase usam o nome que o organizador
// deu ('gold'/'silver' na Confra), não só main/upper/lower/grand — foi por assumir a lista
// fixa que o guard do botão não pegou nada e "Rodada Extra" continuou aparecendo nas Oitavas.
//
// EXTRAÍDO (v1.6.98) de tournaments.js, que já fazia exatamente esta conta inline pra decidir
// se mostra "Rodada Extra". Agora a trava de re-sorteio (generateDrawFunction) usa A MESMA
// leitura — se as duas divergissem, o gate recusaria numa fase que o botão trata como de
// rodadas (ou o contrário). Ver [[feedback_unify_dual_entry_points]].
window._currentPhaseIsElimination = function (t) {
    if (!t) return false;
    var cur = t.currentPhaseIndex || 0;
    return (Array.isArray(t.matches) ? t.matches : []).some(function (m) {
        if (!m || !m.bracket) return false;
        return ((m.phaseIndex == null) ? 0 : m.phaseIndex) === cur;
    });
};
