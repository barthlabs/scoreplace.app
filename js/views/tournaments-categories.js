// tournaments-categories.js — Category system (extracted from tournaments.js)

(function() {
var _t = window._t || function(k) { return k; };

// ========== Category enrollment helpers ==========
// Maps user gender to tournament gender category codes
window._userGenderToCatCodes = function(userGender) {
    if (!userGender) return [];
    var g = userGender.toLowerCase().trim();
    var codes = [];
    if (g === 'feminino' || g === 'female' || g === 'fem' || g === 'f') {
        codes.push('fem', 'misto_aleatorio', 'misto_obrigatorio');
    } else if (g === 'masculino' || g === 'male' || g === 'masc' || g === 'm') {
        codes.push('masc', 'misto_aleatorio', 'misto_obrigatorio');
    } else {
        // Non-binary or other — eligible for misto categories
        codes.push('misto_aleatorio', 'misto_obrigatorio');
    }
    return codes;
};

// Normalize format: 'Ranking' → 'Liga' (unificado em v0.2.6)
window._isLigaFormat = function(t) {
  return t && (t.format === 'Liga' || t.format === 'Ranking');
};

// Get participant categories as array (backward compat: string → [string])
window._getParticipantCategories = function(p) {
    if (!p || typeof p !== 'object') return [];
    if (Array.isArray(p.categories) && p.categories.length > 0) return p.categories;
    if (p.category) return [p.category];
    return [];
};

// Check if participant belongs to a specific category
window._participantInCategory = function(p, cat) {
    return window._getParticipantCategories(p).indexOf(cat) !== -1;
};

// Set participant categories (writes both .categories array and .category for compat)
window._setParticipantCategories = function(p, cats) {
    if (!p || typeof p !== 'object') return;
    p.categories = Array.isArray(cats) ? cats : [cats];
    p.category = p.categories[0] || '';
};

// Add a category to a participant (for non-exclusive enrollment)
window._addParticipantCategory = function(p, cat) {
    var current = window._getParticipantCategories(p);
    if (current.indexOf(cat) === -1) current.push(cat);
    window._setParticipantCategories(p, current);
};

// Display name for categories: simplifies "Misto Aleat." and "Misto Obrig." to just "Misto"
// Full name only appears in rules, tournament card, and detail info.
window._displayCategoryName = function(cat) {
    if (!cat) return '';
    // "Misto Aleat. A" → "Misto A", "Misto Obrig. B" → "Misto B", "Misto Aleat." → "Misto"
    return cat.replace(/^Misto Aleat\.\s*/i, 'Misto ').replace(/^Misto Obrig\.\s*/i, 'Misto ').trim();
};

// Sort categories respecting the skill order defined by the organizer.
// E.g., if skillCategories = ['A','B','C','D'], then:
//   "Fem A" < "Fem B" < "Fem C/D" < "Masc A" < "Masc A/B" < "Masc C"
// Merged categories like "A/B" sort by their earliest component.
// Gender prefix order: Fem, Masc, Misto Aleat., Misto Obrig.
window._sortCategoriesBySkillOrder = function(categories, skillCats) {
    if (!categories || categories.length <= 1) return categories;
    if (!skillCats || skillCats.length === 0) return categories;

    var genderOrder = ['Fem', 'Masc', 'Misto Aleat.', 'Misto Obrig.'];
    var skillOrder = {};
    skillCats.forEach(function(sc, i) { skillOrder[sc.trim()] = i; });

    function getCatSortKey(cat) {
        // Determine gender prefix index
        var genderIdx = genderOrder.length; // default: after all known prefixes
        var suffix = cat;
        for (var g = 0; g < genderOrder.length; g++) {
            if (cat.toLowerCase().startsWith(genderOrder[g].toLowerCase())) {
                genderIdx = g;
                suffix = cat.substring(genderOrder[g].length).trim();
                break;
            }
        }
        // Determine skill index from the suffix (possibly merged like "A/B")
        // Use the earliest (lowest-index) component
        var skillIdx = 9999;
        if (suffix === '') {
            // Bare prefix (all skills merged) — sort at position 0 within this gender
            skillIdx = -1;
        } else {
            var parts = suffix.split('/');
            parts.forEach(function(s) {
                var trimmed = s.trim();
                if (skillOrder.hasOwnProperty(trimmed) && skillOrder[trimmed] < skillIdx) {
                    skillIdx = skillOrder[trimmed];
                }
            });
        }
        return { gender: genderIdx, skill: skillIdx };
    }

    var sorted = categories.slice().sort(function(a, b) {
        var keyA = getCatSortKey(a);
        var keyB = getCatSortKey(b);
        if (keyA.gender !== keyB.gender) return keyA.gender - keyB.gender;
        return keyA.skill - keyB.skill;
    });
    return sorted;
};

// Non-exclusive gender prefixes (participant can be in these + one exclusive)
window._nonExclusivePrefixes = ['misto aleat.', 'misto obrig.', 'misto'];

// Get the gender prefix of a category (e.g., "Fem A" → "Fem", "Misto Aleat. B" → "Misto Aleat.")
window._getCategoryGenderPrefix = function(cat) {
    if (!cat) return '';
    var prefixes = ['Misto Aleat.', 'Misto Obrig.', 'Fem', 'Masc', 'Misto'];
    for (var i = 0; i < prefixes.length; i++) {
        if (cat.indexOf(prefixes[i]) === 0) return prefixes[i];
    }
    return cat;
};

// Given eligible categories, group into exclusive (pick one) and non-exclusive (can add all)
// Exclusive = Fem/Masc categories (pick one). Non-exclusive = Misto (can combine with exclusive)
window._groupEligibleCategories = function(eligibleCats) {
    var exclusive = [];
    var nonExclusive = [];
    var nonExclPrefixes = window._nonExclusivePrefixes;
    eligibleCats.forEach(function(cat) {
        var prefix = window._getCategoryGenderPrefix(cat);
        var isNonExcl = nonExclPrefixes.some(function(np) {
            return prefix.toLowerCase() === np.toLowerCase();
        });
        if (isNonExcl) {
            nonExclusive.push(cat);
        } else {
            exclusive.push(cat);
        }
    });
    return { exclusive: exclusive, nonExclusive: nonExclusive };
};

// Resolve enrollment category for a participant.
// Shows a modal if multiple eligible categories. Auto-picks if only one.
window._resolveEnrollmentCategory = function(tId, callback) {
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
    if (!t) { if (callback) callback(null); return; }
    // Use _getTournamentCategories so genderCategories/skillCategories work as
    // fallback when combinedCategories is missing (e.g. older tournament saves).
    var allCats = window._getTournamentCategories(t);
    if (allCats.length === 0) {
        if (callback) callback(null); // No categories
        return;
    }
    if (allCats.length === 1) {
        if (callback) callback(allCats[0]);
        return;
    }

    var user = window.AppStore.currentUser;
    var eligible = allCats.slice();

    // ── 1. Filtrar por gênero ──────────────────────────────────────────────
    if (user && user.gender) {
        var validGenderCodes = window._userGenderToCatCodes(user.gender);
        // prefixos de gênero reconhecidos nas categorias combinadas
        var genderPrefixMap = { fem: 'fem', masc: 'masc', misto_aleatorio: 'misto aleat.', misto_obrigatorio: 'misto obrig.' };
        var allGenderPrefixes = ['fem', 'masc', 'misto aleat.', 'misto obrig.'];
        var filtered = eligible.filter(function(cat) {
            var prefix = cat.split(' ')[0].toLowerCase();
            var firstTwo = (cat.split(' ').slice(0, 2).join(' ')).toLowerCase();
            // Categoria sem prefixo de gênero (ex: "A", "B", "40+") — sem filtro
            var hasGenderPrefix = allGenderPrefixes.some(function(gp) {
                return cat.toLowerCase().startsWith(gp);
            });
            if (!hasGenderPrefix) return true;
            return validGenderCodes.some(function(code) {
                var label = genderPrefixMap[code] || code;
                return cat.toLowerCase().startsWith(label);
            });
        });
        if (filtered.length > 0) eligible = filtered;
    }
    if (eligible.length === 1) { if (callback) callback(eligible[0]); return; }

    // ── 2. Filtrar por faixa etária (birthDate do perfil) ─────────────────
    var birthDate = user && user.birthDate;
    if (birthDate) {
        var bd = new Date(birthDate);
        if (!isNaN(bd.getTime())) {
            var now = new Date();
            var age = now.getFullYear() - bd.getFullYear();
            if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
            // Quais faixas etárias existem nas categorias elegíveis?
            var ageBuckets = [];
            eligible.forEach(function(cat) {
                var m = cat.match(/(\d+)\+/);
                if (m) { var v = parseInt(m[1]); if (ageBuckets.indexOf(v) === -1) ageBuckets.push(v); }
            });
            if (ageBuckets.length > 0) {
                // Seleciona o maior threshold que o usuário atingiu (bucket exclusivo)
                ageBuckets.sort(function(a, b) { return b - a; });
                var myBucket = null;
                for (var bi = 0; bi < ageBuckets.length; bi++) {
                    if (age >= ageBuckets[bi]) { myBucket = ageBuckets[bi]; break; }
                }
                if (myBucket !== null) {
                    var byAge = eligible.filter(function(cat) { return cat.indexOf(myBucket + '+') !== -1; });
                    if (byAge.length > 0) eligible = byAge;
                } else {
                    // Usuário mais jovem que todos os buckets — remove categorias de idade
                    var noAge = eligible.filter(function(cat) { return !cat.match(/\d+\+/); });
                    if (noAge.length > 0) eligible = noAge;
                }
            }
        }
    }
    if (eligible.length === 1) { if (callback) callback(eligible[0]); return; }

    // ── 3. Filtrar por habilidade (skillBySport ou defaultCategory) ────────
    var profileSkill = null;
    if (user && user.skillBySport && typeof user.skillBySport === 'object') {
        var tSport = t.sport ? String(t.sport).trim() : null;
        if (tSport && user.skillBySport[tSport]) profileSkill = String(user.skillBySport[tSport]).trim().toUpperCase();
    }
    if (!profileSkill && user && user.defaultCategory) {
        profileSkill = String(user.defaultCategory).trim().toUpperCase();
    }
    if (profileSkill) {
        // Tokens de cada categoria que são habilidade (não são prefixo de gênero nem faixa etária)
        var skillFiltered = eligible.filter(function(cat) {
            var tokens = cat.split(' ');
            return tokens.some(function(tok) { return tok.toUpperCase() === profileSkill; });
        });
        if (skillFiltered.length > 0) eligible = skillFiltered;
    }
    if (eligible.length === 1) { if (callback) callback(eligible[0]); return; }

    // ── 4. Ainda ambíguo — mostrar picker com opções já filtradas ──────────
    var modalId = 'modal-category-enroll-' + tId;
    var mod = document.getElementById(modalId);
    if (mod) mod.remove();
    var html = '<div class="modal" id="' + modalId + '" style="display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;justify-content:center;align-items:center;">' +
        '<div class="modal-content" style="background:var(--bg-card,#1a2235);color:var(--text-main,#fff);border-radius:15px;padding:25px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
        '<h2 style="margin:0 0 8px;font-size:1.1rem;">Selecionar Categoria</h2>' +
        '<p style="margin:0 0 16px;opacity:0.75;font-size:0.9rem;">Escolha a categoria em que deseja se inscrever:</p>';
    for (var k = 0; k < eligible.length; k++) {
        var cat = eligible[k];
        var escapedCat = cat.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/</g, '\\x3c').replace(/>/g, '\\x3e');
        html += '<button class="btn btn-primary" style="display:block;width:100%;margin:10px 0;cursor:pointer;" onclick="(function(){var cb=' + (callback ? 'window._enrollCategoryCallback' : 'null') + ';var mod=document.getElementById(\'' + modalId + '\');if(mod)mod.remove();if(cb)cb(\'' + escapedCat + '\');})();">' + window._displayCategoryName(cat) + '</button>';
    }
    html += '<button class="btn btn-outline" style="display:block;width:100%;margin-top:15px;cursor:pointer;" onclick="var mod=document.getElementById(\'' + modalId + '\');if(mod)mod.remove();">Cancelar</button>' +
        '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
    window._enrollCategoryCallback = callback;
};

// Apply gender categories and update UI
window._applyGenderCatUI = function(tId, selected) {
    var t = window.AppStore.tournaments.find(function(tour) { return tour.id.toString() === tId.toString(); });
    if (!t) return;
    var checkboxes = {
        'fem': document.getElementById('cat-gender-fem'),
        'masc': document.getElementById('cat-gender-masc'),
        'misto_aleatorio': document.getElementById('cat-gender-misto-aleatorio'),
        'misto_obrigatorio': document.getElementById('cat-gender-misto-obrigatorio')
    };
    for (var key in checkboxes) {
        if (checkboxes[key]) checkboxes[key].checked = (selected[key] ? true : false);
    }
};

// Toggle a gender category button
window._toggleGenderCat = function(code) {
    var btn = document.getElementById('cat-btn-' + code);
    if (!btn) return;
    btn.classList.toggle('active');
    var state = {
        'fem': document.getElementById('cat-btn-fem') && document.getElementById('cat-btn-fem').classList.contains('active'),
        'masc': document.getElementById('cat-btn-masc') && document.getElementById('cat-btn-masc').classList.contains('active'),
        'misto_aleatorio': document.getElementById('cat-btn-misto-aleatorio') && document.getElementById('cat-btn-misto-aleatorio').classList.contains('active'),
        'misto_obrigatorio': document.getElementById('cat-btn-misto-obrigatorio') && document.getElementById('cat-btn-misto-obrigatorio').classList.contains('active')
    };
    window._updateCategoryPreview(state);
};

// Update preview pills as user toggles gender categories
window._updateCategoryPreview = function(genderState) {
    var skillCats = [];
    var skillInputs = document.querySelectorAll('input[name="skill-cat"]');
    skillInputs.forEach(function(inp) {
        if (inp.value && inp.value.trim()) skillCats.push(inp.value.trim());
    });
    var container = document.getElementById('category-preview');
    if (!container) return;
    container.innerHTML = '';
    var combined = [];
    for (var g in genderState) {
        if (!genderState[g]) continue;
        var genderPrefix = g === 'fem' ? 'Fem' : (g === 'masc' ? 'Masc' : (g === 'misto_aleatorio' ? 'Misto Aleat.' : 'Misto Obrig.'));
        if (skillCats.length === 0) {
            combined.push(genderPrefix);
        } else {
            for (var i = 0; i < skillCats.length; i++) {
                combined.push(genderPrefix + ' ' + skillCats[i]);
            }
        }
    }
    combined.forEach(function(cat) {
        var pill = document.createElement('span');
        pill.className = 'category-pill';
        pill.style.cssText = 'display:inline-block;background:#dbeafe;color:#1e40af;padding:6px 12px;border-radius:20px;font-size:0.85rem;margin-right:8px;margin-bottom:8px;border:1px solid #93c5fd;';
        pill.textContent = cat;
        container.appendChild(pill);
    });
};

// Get combined tournament categories (cross-product of genders and skills)
window._getTournamentCategories = function(t) {
    if (!t) return [];
    if (Array.isArray(t.combinedCategories) && t.combinedCategories.length > 0) return t.combinedCategories;
    // Backward compat: compute from gender/skill arrays if they exist
    var combined = [];
    var genders = t.genderCategories || [];
    var skills = t.skillCategories || [];
    if (genders.length === 0 && skills.length === 0) return combined;
    if (genders.length === 0) {
        for (var s = 0; s < skills.length; s++) {
            combined.push(skills[s]);
        }
    } else if (skills.length === 0) {
        for (var g = 0; g < genders.length; g++) {
            combined.push(genders[g]);
        }
    } else {
        for (var g = 0; g < genders.length; g++) {
            for (var s = 0; s < skills.length; s++) {
                combined.push(genders[g] + ' ' + skills[s]);
            }
        }
    }
    return combined;
};

// NOTE: _confirmMergeCategories, _executeMerge, _executeUnmerge are defined
// as local functions inside the IIFE below (lines ~1043, ~1110, ~1352).
// They are only called internally by the category manager drag-and-drop system.

// Build HTML showing category participant counts
window._buildCategoryCountHtml = function(t) {
    var cats = t.combinedCategories;
    if (!cats || cats.length === 0) return '';
    var sorted = window._sortCategoriesBySkillOrder(cats, t.skillCategories);
    var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];

    // Count per category
    var counts = {};
    sorted.forEach(function(c) { counts[c] = 0; });
    parts.forEach(function(p) {
        if (typeof p !== 'object' && typeof p !== 'string') return;
        var pCats = window._getParticipantCategories(p);
        pCats.forEach(function(pc) {
            if (counts.hasOwnProperty(pc)) counts[pc]++;
        });
    });

    // Group by gender prefix for row layout
    var genderPrefixes = ['Fem', 'Masc', 'Misto Aleat.', 'Misto Obrig.'];
    var rows = []; // { displayPrefix, cats: [{name, display, count}] }
    var used = {};
    genderPrefixes.forEach(function(gp) {
        var rowCats = [];
        sorted.forEach(function(c) {
            if (used[c]) return;
            if (c.toLowerCase().startsWith(gp.toLowerCase())) {
                rowCats.push({ name: c, display: window._displayCategoryName(c), count: counts[c] || 0 });
                used[c] = true;
            }
        });
        if (rowCats.length > 0) {
            var displayPrefix = gp.replace(/\s*Aleat\./, '').replace(/\s*Obrig\./, '');
            // Merge Misto rows if both exist
            var existingMisto = null;
            for (var r = 0; r < rows.length; r++) {
                if (rows[r].displayPrefix === 'Misto') { existingMisto = rows[r]; break; }
            }
            if (displayPrefix === 'Misto' && existingMisto) {
                existingMisto.cats = existingMisto.cats.concat(rowCats);
            } else {
                rows.push({ displayPrefix: displayPrefix, cats: rowCats });
            }
        }
    });
    // Any ungrouped
    sorted.forEach(function(c) {
        if (!used[c]) {
            rows.push({ displayPrefix: '', cats: [{ name: c, display: c, count: counts[c] || 0 }] });
            used[c] = true;
        }
    });

    if (rows.length === 0) return '';

    var html = '<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">';
    rows.forEach(function(row) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;">';
        row.cats.forEach(function(cat) {
            html += '<div style="display:inline-flex;align-items:center;gap:4px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);padding:3px 8px;border-radius:10px;">' +
                '<span style="font-size:0.65rem;font-weight:600;color:#818cf8;">' + cat.display + '</span>' +
                '<span style="font-size:0.75rem;font-weight:800;color:var(--text-bright,#e2e8f0);">' + cat.count + '</span>' +
                '</div>';
        });
        html += '</div>';
    });
    html += '</div>';
    return html;
};

// Estimated tournament duration
window._buildTimeEstimation = function(t) {
  // Só mostra se NÃO tem data/hora de fim
  if (t.endDate) return '';
  // v0.16.82: Liga não tem duração estimada — formato é uma "temporada
  // contínua" com sorteios automáticos a cada N dias, não um evento de
  // duração fixa. Mostrar simulação de partidas é enganoso. Pedido do
  // usuário: "quando o campeonato for liga vamos ocultar a sessao duração
  // estimada que não faz sentido em ligas."
  var isLigaFmt = (typeof window._isLigaFormat === 'function')
    ? window._isLigaFormat(t)
    : (t.format === 'Liga' || t.format === 'Ranking');
  if (isLigaFmt) return '';

  var format = t.format || 'Eliminatórias';
  var gameDur = parseInt(t.gameDuration) || 30; // minutos por partida
  var callTime = parseInt(t.callTime) || 0;
  var warmupTime = parseInt(t.warmupTime) || 0;
  var courts = Math.max(parseInt(t.courtCount) || 1, 1);
  var slotTime = gameDur + callTime + warmupTime; // tempo total por slot (partida + chamada + aquecimento)
  var intervalBetween = 5; // intervalo entre slots no mesmo court (min)
  var timePerSlot = slotTime + intervalBetween;

  // Número de partidas por formato
  function calcMatches(n, fmt) {
    if (fmt === 'Eliminatórias' || fmt === 'Eliminatórias Simples') {
      return n - 1; // single elim (sem 3o lugar)
    } else if (fmt === 'Dupla Elim.' || fmt === 'Dupla Eliminatória') {
      // Upper bracket: n-1, Lower bracket: ~n-1, Grand final: 1-2
      return Math.ceil(n * 2 - 1);
    } else if (fmt === 'Grupos + Elim.' || fmt === 'Fase de Grupos + Eliminatórias') {
      // Grupos (round robin dentro dos grupos) + eliminatória dos classificados
      var groupSize = 4;
      var numGroups = Math.max(Math.ceil(n / groupSize), 1);
      var perGroup = Math.ceil(n / numGroups);
      var groupMatches = numGroups * (perGroup * (perGroup - 1) / 2);
      var qualified = numGroups * 2; // top 2 de cada grupo
      var elimMatches = Math.max(qualified - 1, 0);
      return Math.round(groupMatches + elimMatches);
    } else if (fmt === 'Suíço' || fmt === 'Suíço Clássico') {
      var rounds = Math.ceil(Math.log2(Math.max(n, 2)));
      return rounds * Math.floor(n / 2);
    } else if (fmt === 'Liga' || fmt === 'Ranking' || window._isLigaFormat && window._isLigaFormat(t)) {
      return n * (n - 1) / 2;
    }
    return n - 1; // fallback
  }

  // Estimar duração em minutos considerando quadras paralelas
  function estimateDuration(n, fmt) {
    if (n < 2) return 0;
    var totalMatches = calcMatches(n, fmt);

    // Para eliminatórias, calcular por rodadas (mais realista)
    if (fmt === 'Eliminatórias' || fmt === 'Eliminatórias Simples') {
      var rounds = Math.ceil(Math.log2(n));
      var totalMin = 0;
      for (var r = 0; r < rounds; r++) {
        var matchesInRound = Math.ceil(n / Math.pow(2, r + 1));
        var slotsNeeded = Math.ceil(matchesInRound / courts);
        totalMin += slotsNeeded * timePerSlot;
      }
      return totalMin;
    }

    if (fmt === 'Dupla Elim.' || fmt === 'Dupla Eliminatória') {
      // Aproximação: ~2x da simples
      var roundsDE = Math.ceil(Math.log2(n)) * 2 + 1;
      var avgPerRound = Math.ceil(totalMatches / roundsDE);
      var totalMinDE = 0;
      for (var rd = 0; rd < roundsDE; rd++) {
        totalMinDE += Math.ceil(avgPerRound / courts) * timePerSlot;
      }
      return totalMinDE;
    }

    if (fmt === 'Grupos + Elim.' || fmt === 'Fase de Grupos + Eliminatórias') {
      var gSize = 4;
      var nGroups = Math.max(Math.ceil(n / gSize), 1);
      var pGroup = Math.ceil(n / nGroups);
      // Fase de grupos: rodadas round-robin dentro do grupo
      var groupRounds = pGroup - 1;
      var matchesPerGroupRound = Math.floor(pGroup / 2) * nGroups;
      var groupMin = 0;
      for (var gr = 0; gr < groupRounds; gr++) {
        groupMin += Math.ceil(matchesPerGroupRound / courts) * timePerSlot;
      }
      // Fase eliminatória
      var qual = nGroups * 2;
      var elimRounds = Math.ceil(Math.log2(Math.max(qual, 2)));
      var elimMin = 0;
      for (var er = 0; er < elimRounds; er++) {
        var mInR = Math.ceil(qual / Math.pow(2, er + 1));
        elimMin += Math.ceil(mInR / courts) * timePerSlot;
      }
      return groupMin + elimMin + 15; // +15 intervalo entre fases
    }

    if (fmt === 'Suíço' || fmt === 'Suíço Clássico') {
      var swissRounds = Math.ceil(Math.log2(Math.max(n, 2)));
      var matchesPerRound = Math.floor(n / 2);
      var totalMinS = 0;
      for (var sr = 0; sr < swissRounds; sr++) {
        totalMinS += Math.ceil(matchesPerRound / courts) * timePerSlot;
      }
      return totalMinS;
    }

    // Liga/fallback: todas as partidas sequenciais com quadras paralelas
    var slots = Math.ceil(totalMatches / courts);
    return slots * timePerSlot;
  }

  // Formatar duração em horas e minutos
  function fmtDur(min) {
    if (min <= 0) return '—';
    var h = Math.floor(min / 60);
    var m = Math.round(min % 60);
    if (h === 0) return m + 'min';
    if (m === 0) return h + 'h';
    return h + 'h' + (m < 10 ? '0' : '') + m;
  }

  // Formatar hora de término estimada
  function fmtEndTime(startDateStr, durationMin) {
    if (!startDateStr) return '';
    try {
      var d = new Date(startDateStr);
      if (isNaN(d.getTime())) return '';
      // Só mostra se tem hora definida (contém 'T')
      if (!startDateStr.includes('T')) return '';
      d.setMinutes(d.getMinutes() + durationMin);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  // Potências de 2 para simulação
  var powersOf2 = [8, 16, 32, 64];

  // Inscritos reais (contar pessoas individuais, não times)
  var parts = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
  var unitCount = parts.length; // unidades competitivas (times ou individuais) para cálculo do bracket
  var realCount = 0;
  parts.forEach(function(p) {
    if (typeof p === 'object' && p !== null && Array.isArray(p.participants)) {
      realCount += p.participants.length;
    } else {
      var pStr = typeof p === 'string' ? p : (p.displayName || p.name || p.email || '');
      if (pStr.includes('/')) {
        realCount += pStr.split('/').filter(function(n) { return n.trim().length > 0; }).length;
      } else {
        realCount++;
      }
    }
  });

  // Verificar se formato é Liga com muitos jogadores (seria longo demais)
  var isLiga = window._isLigaFormat && window._isLigaFormat(t);
  if (isLiga && unitCount > 20) {
    // Liga com muitos jogadores: muitas rodadas, estimativa perde sentido prático
    // Só mostra nota informativa
  }

  // Construir linhas de simulação — ordem crescente de participantes
  // com inscritos reais posicionados entre a potência inferior e superior
  var rows = [];

  // Linhas para potências de 2
  powersOf2.forEach(function(n) {
    if (n === realCount) return; // será incluído como "inscritos"
    var dur = estimateDuration(n, format);
    var endTime = fmtEndTime(t.startDate, dur);
    rows.push({
      n: n,
      label: n + ' inscritos',
      duration: fmtDur(dur),
      endTime: endTime,
      matches: calcMatches(n, format),
      highlight: false
    });
  });

  // Linha com inscritos reais (se houver 2+)
  if (unitCount >= 2) {
    var durReal = estimateDuration(unitCount, format);
    var endTimeReal = fmtEndTime(t.startDate, durReal);
    rows.push({
      n: realCount,
      label: realCount + ' inscritos',
      duration: fmtDur(durReal),
      endTime: endTimeReal,
      matches: calcMatches(unitCount, format),
      highlight: true
    });
  }

  // Sort ascending by participant count
  rows.sort(function(a, b) { return a.n - b.n; });

  if (rows.length === 0) return '';

  // Montar HTML
  var courtsLabel = courts > 1 ? _t('cat.nCourtsLabel', {n: courts}) : _t('cat.oneCourtLabel');
  var html = '<div style="margin-top: 8px; padding: 10px 14px; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.2); border-radius: 12px;">';
  html += '<div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">';
  html += '<span style="font-size:1.1rem;">⏱️</span>';
  html += '<span style="font-size:0.8rem; font-weight:700; color:#a5b4fc; text-transform:uppercase; letter-spacing:0.5px;">' + _t('cat.estimatedDuration') + '</span>';
  html += '<span style="font-size:0.65rem; color:var(--text-muted); opacity:0.7;">(' + gameDur + 'min/partida · ' + courtsLabel + ')</span>';
  html += '</div>';

  html += '<div style="display:flex; flex-direction:column; gap:4px;">';
  rows.forEach(function(r) {
    var bg = r.highlight ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)';
    var border = r.highlight ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(255,255,255,0.05)';
    var labelColor = r.highlight ? '#60a5fa' : 'var(--text-muted)';
    var durColor = r.highlight ? '#e2e8f0' : 'rgba(255,255,255,0.7)';
    html += '<div style="display:flex; align-items:center; gap:8px; padding:6px 10px; background:' + bg + '; border:' + border + '; border-radius:8px; flex-wrap:wrap;">';
    html += '<span style="font-size:0.78rem; font-weight:600; color:' + labelColor + '; min-width:110px;">' + r.label + '</span>';
    html += '<span style="font-size:0.78rem; color:var(--text-muted); opacity:0.6;">' + r.matches + ' ' + _t('cat.matchesSuffix') + '</span>';
    html += '<span style="font-size:0.85rem; font-weight:700; color:' + durColor + '; margin-left:auto;">' + r.duration + '</span>';
    if (r.endTime) {
      html += '<span style="font-size:0.72rem; color:#a5b4fc; opacity:0.8;">' + _t('cat.endTimePrefix') + r.endTime + '</span>';
    }
    html += '</div>';
  });
  html += '</div>';
  html += '</div>';
  return html;
};

// Open category manager modal
// v1.3.12-beta: Category Manager convertido pra page-route #categorias/<tId>.
// Padrão centralizado: topbar visível, _renderBackHeader, hamburger funcional.
// Compat: _openCategoryManager(tId) virou wrapper que navega pra hash.
window._openCategoryManager = function(tId) {
    window.location.hash = '#categorias/' + tId;
};

// Renderer canonical chamado pelo router. Contém toda a lógica de drag/drop,
// detail view, mesclagem etc. Detail view (clicar num card) continua como
// modal-overlay porque é transiente — perfeito caso de uso pra overlay.
window.renderCategoryManagerPage = function(container, tId) {
    if (!container) return;
    var modalId = 'cat-manager-modal';

    // ---- Main view: category overview ----
    var _renderModal = function() {
        // Always re-read fresh data from AppStore (fixes stale closure after sync)
        var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
        if (!t) return;
        var categories = window._sortCategoriesBySkillOrder((t.combinedCategories || []).slice(), t.skillCategories);
        var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];

        // Count participants per category & find uncategorized
        // A participant can belong to multiple categories (non-exclusive)
        var catCounts = {};
        categories.forEach(function(c) { catCounts[c] = 0; });
        var uncategorized = [];
        parts.forEach(function(p, idx) {
            var pName = typeof p === 'string' ? p : (p.displayName || p.name || '');
            var pCats = window._getParticipantCategories(p);
            var hasValidCat = false;
            pCats.forEach(function(pc) {
                if (categories.indexOf(pc) !== -1) {
                    catCounts[pc] = (catCounts[pc] || 0) + 1;
                    hasValidCat = true;
                }
            });
            if (!hasValidCat) {
                uncategorized.push({ name: pName, idx: idx });
            }
        });

        // Group categories by gender prefix for row layout
        var genderPrefixes = ['Fem', 'Masc', 'Misto Aleat.', 'Misto Obrig.'];
        var catRows = []; // Array of { prefix, cats: [cat names] }
        var usedCats = {};
        genderPrefixes.forEach(function(prefix) {
            var rowCats = categories.filter(function(c) {
                return c.toLowerCase().startsWith(prefix.toLowerCase());
            });
            if (rowCats.length > 0) {
                catRows.push({ prefix: prefix, cats: rowCats });
                rowCats.forEach(function(c) { usedCats[c] = true; });
            }
        });
        // Any categories that don't match a gender prefix go in their own row
        var otherCats = categories.filter(function(c) { return !usedCats[c]; });
        if (otherCats.length > 0) {
            catRows.push({ prefix: '', cats: otherCats });
        }

        // Determine which categories are merged:
        // 1. Has mergeHistory entry
        // 2. Name contains "/" (e.g., "Fem A/B")
        // 3. Name is a bare gender prefix when skill categories exist (e.g., "Masc" when skillCats has A,B,C,D)
        var mergedCatSet = {};
        (t.mergeHistory || []).forEach(function(mh) {
            mergedCatSet[mh.mergedName] = true;
        });
        var _skillCats = t.skillCategories || [];
        var _genderPrefixList = ['Fem', 'Masc', 'Misto Aleat.', 'Misto Obrig.'];
        categories.forEach(function(cat) {
            if (mergedCatSet[cat]) return; // already marked
            // Contains "/" → result of a merge
            if (cat.indexOf('/') !== -1) {
                mergedCatSet[cat] = true;
                return;
            }
            // Bare prefix when skill categories exist → all skills were merged
            if (_skillCats.length > 0) {
                var isBarePrefix = _genderPrefixList.some(function(gp) {
                    return cat === gp;
                });
                if (isBarePrefix) {
                    mergedCatSet[cat] = true;
                }
            }
        });

        // Build category rows HTML — compact cards, clickable to see detail
        var catRowsHtml = catRows.map(function(row) {
            var cardsHtml = row.cats.map(function(cat) {
                var count = catCounts[cat] || 0;
                var catEsc = cat.replace(/\\/g, '\\\\').replace(/"/g, '&quot;').replace(/'/g, "\\'");
                var catDisplay = window._displayCategoryName(cat);
                var isMerged = !!mergedCatSet[cat];
                // Unmerge icon — small split icon in top-right corner, only for merged categories
                var unmergeIcon = isMerged
                    ? '<div class="cat-unmerge-btn" data-unmerge-cat="' + catEsc + '" title="Desmesclar" style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;z-index:2;" onmouseenter="this.style.background=\'rgba(239,68,68,0.35)\'" onmouseleave="this.style.background=\'rgba(239,68,68,0.15)\'">' +
                      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linecap="round"><path d="M16 3h5v5M8 3H3v5M16 21h5v-5M8 21H3v-5"/></svg>' +
                      '</div>'
                    : '';
                return '<div class="cat-mgr-card" draggable="true" data-cat="' + catEsc + '" ' +
                    'style="position:relative;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 14px;border-radius:12px;background:rgba(99,102,241,0.08);border:2px solid rgba(99,102,241,0.2);cursor:pointer;transition:all 0.2s;min-width:80px;">' +
                    unmergeIcon +
                    '<div style="font-weight:700;font-size:0.8rem;color:#818cf8;white-space:nowrap;">' + catDisplay + '</div>' +
                    '<div style="font-size:1.4rem;font-weight:900;color:var(--text-bright);line-height:1.2;">' + count + '</div>' +
                    '<div style="font-size:0.65rem;color:var(--text-muted);">inscrito' + (count !== 1 ? 's' : '') + '</div>' +
                    '</div>';
            }).join('');
            return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">' + cardsHtml + '</div>';
        }).join('');

        // Uncategorized participants HTML — below categories
        var uncatHtml = '';
        if (uncategorized.length > 0) {
            var uncatCards = uncategorized.map(function(u) {
                return '<div class="cat-mgr-participant" draggable="true" data-pidx="' + u.idx + '" ' +
                    'style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);cursor:grab;font-size:0.85rem;font-weight:500;color:#fca5a5;touch-action:none;">' +
                    '<span style="font-size:0.7rem;">👤</span> ' + (u.name || 'Sem nome') +
                    '</div>';
            }).join('');
            uncatHtml = '<div style="margin-top:1rem;padding:1rem;background:rgba(239,68,68,0.06);border:1px dashed rgba(239,68,68,0.3);border-radius:12px;">' +
                '<div style="font-weight:700;color:#fca5a5;font-size:0.85rem;margin-bottom:8px;">' + _t('cat.noCategory', {count: uncategorized.length}) + '</div>' +
                '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;">' + _t('cat.dragToAssign') + '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + uncatCards + '</div>' +
                '</div>';
        }

        // v1.3.12-beta: cabeçalho padronizado via _renderBackHeader.
        // Voltar navega de volta pro detalhe do torneio.
        var hdr = (typeof window._renderBackHeader === 'function')
            ? window._renderBackHeader({
                href: '#tournaments/' + tId,
                label: 'Voltar',
                middleHtml: '<span style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">🏷️ Categorias</span>'
            })
            : '';

        // Conteúdo da página renderizado direto no view-container (sem
        // modal-overlay wrapper). Mantém o id="cat-manager-modal" no nó
        // interno pra preservar selectors usados pelo drag/drop.
        var pageHtml = hdr +
            '<div id="' + modalId + '" style="max-width:760px;margin:0 auto;padding:1rem;">' +
            '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:1rem;">' + _t('cat.dragInstructions') + '</div>' +
            '<div id="cat-mgr-cards">' + catRowsHtml + '</div>' +
            uncatHtml +
            '</div>';

        container.innerHTML = pageHtml;
        _attachCatManagerDragDrop(tId);
        if (typeof window._reflowChrome === 'function') window._reflowChrome();

        // Attach click handlers for category detail view
        var catCardEls = document.querySelectorAll('.cat-mgr-card');
        catCardEls.forEach(function(cardEl) {
            cardEl.addEventListener('click', function(e) {
                // Don't open detail if clicking unmerge button
                if (e.target.closest && e.target.closest('.cat-unmerge-btn')) return;
                // Only open detail if not a drag operation
                if (cardEl._wasDragged) { cardEl._wasDragged = false; return; }
                var catName = cardEl.getAttribute('data-cat');
                _renderCategoryDetail(catName);
            });
        });

        // Attach click handlers for unmerge buttons
        var unmergeBtns = document.querySelectorAll('.cat-unmerge-btn');
        unmergeBtns.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var catName = btn.getAttribute('data-unmerge-cat');
                _unmergeCategoryAction(tId, catName);
            });
        });
    };

    // ---- Detail view: participants in a specific category ----
    var _renderCategoryDetail = function(catName) {
        var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
        if (!t) return;
        var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];

        // Filter participants in this category (supports multi-category) — track their index in parts[]
        var catParticipants = [];
        parts.forEach(function(p, idx) {
            if (typeof p !== 'object') return;
            if (window._participantInCategory(p, catName)) {
                catParticipants.push({ p: p, idx: idx });
            }
        });

        // Build participant cards with source badges and remove button
        var pCardsHtml = catParticipants.length > 0
            ? catParticipants.map(function(item) {
                var p = item.p;
                var pIdx = item.idx;
                var name = p.displayName || p.name || 'Sem nome';
                var email = p.email || '';
                var initial = name.charAt(0).toUpperCase();
                var origCat = p.originalCategory ? ' <span style="font-size:0.7rem;color:var(--text-muted);opacity:0.7;">(' + window._safeHtml(p.originalCategory) + ')</span>' : '';
                // Source badge
                var srcBadge = '';
                if (p.categorySource === 'perfil') {
                    srcBadge = '<span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:0.6rem;font-weight:600;background:rgba(34,197,94,0.12);color:#4ade80;border:1px solid rgba(34,197,94,0.25);margin-left:4px;">(perfil)</span>';
                } else if (p.wasUncategorized) {
                    srcBadge = '<span style="display:inline-block;padding:1px 6px;border-radius:6px;font-size:0.6rem;font-weight:600;background:rgba(239,68,68,0.1);color:#fca5a5;border:1px solid rgba(239,68,68,0.2);margin-left:4px;">(sem cat.)</span>';
                }
                // Remove button
                var catNameEsc = catName.replace(/\\/g, '\\\\').replace(/"/g, '&quot;');
                var removeBtn = '<button class="cat-remove-participant-btn" data-pidx="' + pIdx + '" data-cat="' + catNameEsc + '" title="Remover da categoria" ' +
                    'style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;" ' +
                    'onmouseenter="this.style.background=\'rgba(239,68,68,0.3)\'" onmouseleave="this.style.background=\'rgba(239,68,68,0.1)\'">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
                    '</button>';
                return '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);">' +
                    '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#818cf8);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.9rem;flex-shrink:0;">' + initial + '</div>' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-weight:600;font-size:0.9rem;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(name) + srcBadge + origCat + '</div>' +
                    (email ? '<div style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window._safeHtml(email) + '</div>' : '') +
                    '</div>' +
                    removeBtn +
                    '</div>';
            }).join('')
            : '<div style="text-align:center;padding:2rem 1rem;color:var(--text-muted);font-size:0.9rem;font-style:italic;">Nenhum inscrito nesta categoria.</div>';

        var catNameEscId = catName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        var detailModalId = 'cat-detail-modal-' + catNameEscId;
        var detailHtml = '<div id="' + detailModalId + '" style="display:flex;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:10001;align-items:flex-start;justify-content:center;overflow-y:auto;padding:2rem 1rem;" onclick="event.stopPropagation();">' +
            '<div style="background:var(--bg-card);width:95%;max-width:600px;border-radius:18px;border:1px solid var(--border-color);box-shadow:0 24px 48px rgba(0,0,0,0.5);margin:auto;animation:fadeIn 0.2s ease;">' +
            '<div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">' +
            '<h3 style="margin:0;font-size:1.15rem;color:var(--text-bright);">🏷️ ' + window._displayCategoryName(catName) + '</h3>' +
            '<button style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;line-height:1;" onclick="document.getElementById(\'' + detailModalId + '\').remove();">&times;</button>' +
            '</div>' +
            '<div style="padding:10px 1.5rem 0;">' +
            '<button class="btn btn-outline btn-sm hover-lift" style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:20px;font-size:0.8rem;" onclick="window._catManagerRender();"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> Voltar</button>' +
            '</div>' +
            '<div style="padding:0 1.5rem 1.5rem;">' +
            '<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;">' + catParticipants.length + ' inscrito' + (catParticipants.length !== 1 ? 's' : '') + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px;">' + pCardsHtml + '</div>' +
            '</div>' +
            '</div></div>';

        var el = document.getElementById(detailModalId);
        if (el) el.remove();
        document.body.insertAdjacentHTML('beforeend', detailHtml);

        // Attach click handlers for remove-from-category buttons
        var removeBtns = document.querySelectorAll('.cat-remove-participant-btn');
        removeBtns.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var pIdx = parseInt(btn.getAttribute('data-pidx'), 10);
                var cat = btn.getAttribute('data-cat');
                _removeParticipantFromCategory(tId, pIdx, cat);
            });
        });
    };

    _renderModal();

    // Save reference for re-render
    window._catManagerRender = _renderModal;
    window._catManagerTid = tId;

    // Auto-assign uncategorized participants based on their Firestore profiles.
    // Fire-and-forget: if anything gets assigned, re-render the manager.
    if (typeof window._autoAssignCategoriesAsync === 'function') {
        window._autoAssignCategoriesAsync(tId).then(function(n) {
            if (n > 0) _renderModal();
        }).catch(function() {});
    }
};

// Attach drag-and-drop events for category manager (desktop + mobile touch)
function _attachCatManagerDragDrop(tId) {
    var _dragData = null; // Shared drag state for both desktop and touch

    // Category card drag (for merging)
    var catCards = document.querySelectorAll('.cat-mgr-card');
    catCards.forEach(function(card) {
        card.addEventListener('dragstart', function(e) {
            card._wasDragged = true;
            _dragData = { type: 'cat', cat: card.getAttribute('data-cat') };
            e.dataTransfer.setData('text/plain', 'cat');
            e.dataTransfer.effectAllowed = 'move';
            card.style.opacity = '0.5';
        });
        card.addEventListener('dragend', function() {
            card.style.opacity = '1';
            _dragData = null;
            catCards.forEach(function(c) { c.style.border = '2px solid rgba(99,102,241,0.2)'; });
        });
        card.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            card.style.border = '2px solid #fbbf24';
        });
        card.addEventListener('dragleave', function() {
            card.style.border = '2px solid rgba(99,102,241,0.2)';
        });
        card.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            card.style.border = '2px solid rgba(99,102,241,0.2)';
            var targetCat = card.getAttribute('data-cat');

            if (_dragData && _dragData.type === 'cat' && _dragData.cat !== targetCat) {
                _confirmMergeCategories(tId, _dragData.cat, targetCat);
            } else if (_dragData && _dragData.type === 'participant') {
                _assignParticipantCategory(tId, _dragData.pidx, targetCat);
            }
            _dragData = null;
        });
    });

    // Participant drag (for assigning to category)
    var pCards = document.querySelectorAll('.cat-mgr-participant');
    pCards.forEach(function(pc) {
        pc.addEventListener('dragstart', function(e) {
            _dragData = { type: 'participant', pidx: parseInt(pc.getAttribute('data-pidx')) };
            e.dataTransfer.setData('text/plain', 'participant');
            e.dataTransfer.effectAllowed = 'move';
            pc.style.opacity = '0.5';
        });
        pc.addEventListener('dragend', function() {
            pc.style.opacity = '1';
            _dragData = null;
        });
    });

    // Touch drag-and-drop support for mobile
    var _touchDragEl = null;
    var _touchClone = null;

    function _getTouchTarget(x, y) {
        if (_touchClone) _touchClone.style.display = 'none';
        var el = document.elementFromPoint(x, y);
        if (_touchClone) _touchClone.style.display = '';
        // Walk up to find .cat-mgr-card
        while (el && !el.classList.contains('cat-mgr-card')) {
            el = el.parentElement;
        }
        return el;
    }

    function _onTouchStart(e) {
        var target = e.target.closest('.cat-mgr-participant, .cat-mgr-card');
        if (!target) return;
        _touchDragEl = target;
        if (target.classList.contains('cat-mgr-participant')) {
            _dragData = { type: 'participant', pidx: parseInt(target.getAttribute('data-pidx')) };
        } else {
            _dragData = { type: 'cat', cat: target.getAttribute('data-cat') };
        }
        // Create visual clone
        var rect = target.getBoundingClientRect();
        _touchClone = target.cloneNode(true);
        _touchClone.style.position = 'fixed';
        _touchClone.style.left = rect.left + 'px';
        _touchClone.style.top = rect.top + 'px';
        _touchClone.style.width = rect.width + 'px';
        _touchClone.style.opacity = '0.8';
        _touchClone.style.zIndex = '99999';
        _touchClone.style.pointerEvents = 'none';
        document.body.appendChild(_touchClone);
        target.style.opacity = '0.3';
    }

    function _onTouchMove(e) {
        if (!_touchClone) return;
        e.preventDefault();
        var touch = e.touches[0];
        _touchClone.style.left = (touch.clientX - _touchClone.offsetWidth / 2) + 'px';
        _touchClone.style.top = (touch.clientY - _touchClone.offsetHeight / 2) + 'px';
        // Highlight drop target
        var targetEl = _getTouchTarget(touch.clientX, touch.clientY);
        catCards.forEach(function(c) { c.style.border = '2px solid rgba(99,102,241,0.2)'; });
        if (targetEl && targetEl !== _touchDragEl) {
            targetEl.style.border = '2px solid #fbbf24';
        }
        if (typeof window._dragAutoScrollOnTouchMove === 'function') window._dragAutoScrollOnTouchMove(e);
    }

    function _onTouchEnd(e) {
        if (!_touchClone) return;
        var touch = e.changedTouches[0];
        var targetEl = _getTouchTarget(touch.clientX, touch.clientY);
        if (_touchClone.parentElement) _touchClone.remove();
        if (_touchDragEl) _touchDragEl.style.opacity = '1';
        catCards.forEach(function(c) { c.style.border = '2px solid rgba(99,102,241,0.2)'; });

        if (targetEl && _dragData) {
            var targetCat = targetEl.getAttribute('data-cat');
            if (_dragData.type === 'cat' && _dragData.cat !== targetCat) {
                _confirmMergeCategories(tId, _dragData.cat, targetCat);
            } else if (_dragData.type === 'participant') {
                _assignParticipantCategory(tId, _dragData.pidx, targetCat);
            }
        }

        _touchDragEl = null;
        _touchClone = null;
        _dragData = null;
        if (typeof window._dragAutoScrollStop === 'function') window._dragAutoScrollStop();
    }

    var modalContent = document.getElementById('cat-manager-modal');
    if (modalContent) {
        modalContent.addEventListener('touchstart', _onTouchStart, { passive: true });
        modalContent.addEventListener('touchmove', _onTouchMove, { passive: false });
        modalContent.addEventListener('touchend', _onTouchEnd, { passive: true });
    }
}

// Sort skill suffixes by strength (alphabetical = strongest first: A > B > C > D ...)
function _sortSkillParts(parts) {
    return parts.slice().sort(function(a, b) {
        // Compare alphabetically — A < B < C means A is stronger
        return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    });
}

// Confirm and execute category merge
function _confirmMergeCategories(tId, sourceCat, targetCat) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    var skillCats = (t && t.skillCategories) ? t.skillCategories : [];

    // Build merged name with skill suffixes sorted by strength (A before B before C...)
    // "Fem C" + "Fem A" → "Fem A/C" (not "Fem C/A")
    // "Fem B/C" + "Fem D" → "Fem B/C/D"
    // If ALL skill categories are merged → simplify to just the prefix ("Masc A/B/C/D" → "Masc")
    // Gender prefixes can be multi-word: "Misto Aleat.", "Misto Obrig."
    var _gPrefixes = ['Misto Aleat.', 'Misto Obrig.', 'Fem', 'Masc'];
    function _extractGenderPrefix(cat) {
        for (var i = 0; i < _gPrefixes.length; i++) {
            if (cat.startsWith(_gPrefixes[i])) {
                var suffix = cat.substring(_gPrefixes[i].length).trim();
                return { prefix: _gPrefixes[i], suffix: suffix };
            }
        }
        // Fallback: first word
        var sp = cat.indexOf(' ');
        if (sp !== -1) return { prefix: cat.substring(0, sp), suffix: cat.substring(sp + 1) };
        return { prefix: cat, suffix: '' };
    }
    var sInfo = _extractGenderPrefix(sourceCat);
    var tInfo = _extractGenderPrefix(targetCat);
    var mergedName = '';
    if (sInfo.prefix === tInfo.prefix) {
        // Common prefix — collect all skill suffixes, deduplicate and sort by strength
        var prefix = sInfo.prefix;
        var sSuffixes = sInfo.suffix.split('/').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
        var tSuffixes = tInfo.suffix.split('/').map(function(s) { return s.trim(); }).filter(function(s) { return s; });
        var allSuffixes = {};
        sSuffixes.concat(tSuffixes).forEach(function(s) { if (s) allSuffixes[s] = true; });
        var sorted = _sortSkillParts(Object.keys(allSuffixes));

        // Check if all skill categories are now merged — simplify to just prefix
        if (skillCats.length > 0 && sorted.length >= skillCats.length) {
            var allPresent = skillCats.every(function(sc) { return allSuffixes[sc.trim()]; });
            if (allPresent) {
                mergedName = prefix;
            } else {
                mergedName = prefix + ' ' + sorted.join('/');
            }
        } else {
            mergedName = prefix + ' ' + sorted.join('/');
        }
    } else {
        // No common prefix — sort the two full names
        var both = [sourceCat, targetCat].sort(function(a, b) {
            return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
        });
        mergedName = both.join('/');
    }

    var _dn = window._displayCategoryName || function(c) { return c; };
    showAlertDialog(
        _t('cat.mergeDialogTitle'),
        _t('cat.mergeDialogMsg', {src: _dn(sourceCat), target: _dn(targetCat), merged: _dn(mergedName)}),
        function() {
            _executeMerge(tId, sourceCat, targetCat, mergedName);
        },
        { type: 'warning', confirmText: _t('btn.merge'), cancelText: _t('btn.cancel'), showCancel: true }
    );
}

// Execute the actual merge
function _executeMerge(tId, sourceCat, targetCat, mergedName) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t) return;

    var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];

    // FIRST: Record pre-merge mapping BEFORE moving participants
    // This is critical for unmerge — we need to know who was in sourceCat vs targetCat
    var premergeMap = {};
    parts.forEach(function(p) {
        if (typeof p !== 'object') return;
        var email = p.email || p.displayName || p.name || '';
        if (!email) return;
        if (window._participantInCategory(p, sourceCat)) {
            premergeMap[email] = sourceCat;
        } else if (window._participantInCategory(p, targetCat)) {
            premergeMap[email] = targetCat;
        }
    });

    // THEN: Update all participants in source or target category to new merged category
    parts.forEach(function(p) {
        if (typeof p !== 'object') return;
        var pCats = window._getParticipantCategories(p);
        var changed = false;
        var newCats = pCats.map(function(c) {
            if (c === sourceCat || c === targetCat) {
                if (!p.originalCategory) p.originalCategory = c;
                changed = true;
                return mergedName;
            }
            return c;
        });
        // Deduplicate (both source and target might be present)
        var unique = [];
        newCats.forEach(function(c) { if (unique.indexOf(c) === -1) unique.push(c); });
        if (changed) {
            window._setParticipantCategories(p, unique);
        }
    });

    // Update combinedCategories: remove source and target, add merged
    var cats = t.combinedCategories || [];
    var newCats = cats.filter(function(c) { return c !== sourceCat && c !== targetCat; });
    newCats.push(mergedName);
    t.combinedCategories = newCats;

    // Also update category references on every match — use canonical
    // collector so refs in t.groups/t.thirdPlaceMatch/t.rodadas also move.
    if (typeof window._collectAllMatches === 'function') {
        window._collectAllMatches(t).forEach(function(m) {
            if (m && (m.category === sourceCat || m.category === targetCat)) {
                m.category = mergedName;
            }
        });
    } else {
        // Defensive fallback: bracket-model.js not loaded.
        (t.rounds || []).forEach(function(r) {
            (r.matches || []).forEach(function(m) {
                if (m.category === sourceCat || m.category === targetCat) {
                    m.category = mergedName;
                }
            });
        });
    }

    // Also update standings category references
    (t.standings || []).forEach(function(s) {
        if (s.category === sourceCat || s.category === targetCat) {
            s.category = mergedName;
        }
    });

    // Save merge history for undo support — uses premergeMap captured BEFORE moving
    if (!t.mergeHistory) t.mergeHistory = [];
    var mergeRecord = {
        mergedName: mergedName,
        sourceCat: sourceCat,
        targetCat: targetCat,
        timestamp: Date.now(),
        participants: premergeMap // email → category before this merge (sourceCat or targetCat)
    };
    t.mergeHistory.push(mergeRecord);

    // Log action
    window.AppStore.logAction(tId, 'Categorias mescladas: ' + sourceCat + ' + ' + targetCat + ' → ' + mergedName);

    // Persist — use FirestoreDB.saveTournament directly for reliability
    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        window.FirestoreDB.saveTournament(t);
    } else {
        window.AppStore.sync();
    }

    if (typeof showNotification === 'function') {
        showNotification(_t('cat.merged'), _t('cat.mergedMsg', { src: sourceCat, target: targetCat, merged: mergedName }), 'success');
    }

    // Re-render the modal after a small delay to ensure data is settled
    setTimeout(function() {
        if (window._catManagerRender) window._catManagerRender();
    }, 100);
}

// Remove a participant from a specific category (set as uncategorized)
function _removeParticipantFromCategory(tId, pIdx, category) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t || !t.participants) return;

    var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
    if (pIdx < 0 || pIdx >= parts.length) return;

    var p = parts[pIdx];
    if (typeof p !== 'object') return;
    var pName = p.displayName || p.name || 'Sem nome';

    showAlertDialog(
        _t('cat.removeFromCatTitle'),
        _t('cat.removeFromCatMsg', {name: pName, cat: window._displayCategoryName(category)}),
        function() {
            _executeRemoveFromCategory(tId, pIdx, category);
        },
        { type: 'warning', confirmText: _t('btn.remove'), cancelText: _t('btn.cancel'), showCancel: true }
    );
}

function _executeRemoveFromCategory(tId, pIdx, category) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t || !t.participants) return;

    var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
    if (pIdx < 0 || pIdx >= parts.length) return;

    var p = parts[pIdx];
    if (typeof p !== 'object') return;
    var pName = p.displayName || p.name || 'Sem nome';

    // Remove the specific category from the participant
    var pCats = window._getParticipantCategories(p);
    var newCats = pCats.filter(function(c) { return c !== category; });
    window._setParticipantCategories(p, newCats);

    // Mark as uncategorized if no categories left
    if (newCats.length === 0) {
        p.wasUncategorized = true;
        p.categorySource = '';
    }

    // Ensure the array is written back
    if (!Array.isArray(t.participants)) {
        t.participants = parts;
    }

    // Log action
    window.AppStore.logAction(tId, 'Participante removido da categoria: ' + pName + ' ← ' + category);

    // Persist
    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        window.FirestoreDB.saveTournament(t);
    } else {
        window.AppStore.sync();
    }

    if (typeof showNotification === 'function') {
        showNotification(_t('cat.participantRemoved'), _t('cat.removedMsg', { name: pName, cat: window._displayCategoryName(category) }), 'success');
    }

    // Re-render the category detail view (refreshed data)
    setTimeout(function() {
        if (window._catManagerRender) {
            // Go back to main view since the detail might be stale
            window._catManagerRender();
        }
    }, 100);
}

// Unmerge a previously merged category
function _unmergeCategoryAction(tId, catName) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t) return;

    // Find the most recent merge that produced this category in mergeHistory
    var mergeIdx = -1;
    if (t.mergeHistory && t.mergeHistory.length > 0) {
        for (var i = t.mergeHistory.length - 1; i >= 0; i--) {
            if (t.mergeHistory[i].mergedName === catName) { mergeIdx = i; break; }
        }
    }

    if (mergeIdx !== -1) {
        // Has mergeHistory — use it
        var record = t.mergeHistory[mergeIdx];
        var _dn2 = window._displayCategoryName || function(c) { return c; };
        showAlertDialog(
            _t('cat.unmergeDialogTitle'),
            _t('cat.unmergeDialogMsg', {cat: _dn2(catName), src: _dn2(record.sourceCat), target: _dn2(record.targetCat)}),
            function() {
                _executeUnmerge(tId, mergeIdx);
            },
            { type: 'warning', confirmText: _t('btn.unmerge'), cancelText: _t('btn.cancel'), showCancel: true }
        );
        return;
    }

    // No mergeHistory — infer original categories from the name
    var skillCats = t.skillCategories || [];
    var inferredCats = [];

    if (catName.indexOf('/') !== -1) {
        // "Fem A/B" → split into "Fem A" and "Fem B"
        var spaceIdx = catName.indexOf(' ');
        if (spaceIdx !== -1) {
            var prefix = catName.substring(0, spaceIdx);
            var suffixPart = catName.substring(spaceIdx + 1);
            var suffixes = suffixPart.split('/').map(function(s) { return s.trim(); });
            suffixes.forEach(function(s) { if (s) inferredCats.push(prefix + ' ' + s); });
        } else {
            // No space — full names joined by /
            inferredCats = catName.split('/').map(function(s) { return s.trim(); });
        }
    } else if (skillCats.length > 0) {
        // Bare prefix like "Masc" → expand to "Masc A", "Masc B", etc.
        var genderPrefixes = ['Fem', 'Masc', 'Misto Aleat.', 'Misto Obrig.'];
        var isBare = genderPrefixes.indexOf(catName) !== -1;
        if (isBare) {
            skillCats.forEach(function(sc) { inferredCats.push(catName + ' ' + sc.trim()); });
        }
    }

    if (inferredCats.length < 2) {
        if (typeof showNotification === 'function') {
            showNotification(_t('auth.error'), _t('cat.unmergeError'), 'error');
        }
        return;
    }

    var _dn3 = window._displayCategoryName || function(c) { return c; };
    var _inferredCatsStr = '<strong>' + inferredCats.map(function(ic) { return _dn3(ic); }).join('</strong>, <strong>') + '</strong>';
    showAlertDialog(
        _t('cat.unmergeDialogTitle'),
        _t('cat.unmergeDialogMsgInferred', {cat: _dn3(catName), cats: _inferredCatsStr}),
        function() {
            _executeInferredUnmerge(tId, catName, inferredCats);
        },
        { type: 'warning', confirmText: _t('btn.unmerge'), cancelText: _t('btn.cancel'), showCancel: true }
    );
}

function _executeUnmerge(tId, mergeIdx) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t || !t.mergeHistory || !t.mergeHistory[mergeIdx]) return;

    var record = t.mergeHistory[mergeIdx];
    var mergedName = record.mergedName;
    var sourceCat = record.sourceCat;
    var targetCat = record.targetCat;
    var participantMap = record.participants || {};

    var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];

    // Reassign participants back to their original categories
    // Priority: 1) mergeRecord.participants (pre-merge map), 2) p.originalCategory, 3) uncategorized
    parts.forEach(function(p) {
        if (typeof p !== 'object') return;
        var pCats = window._getParticipantCategories(p);
        var idx = pCats.indexOf(mergedName);
        if (idx === -1) return;

        var pKey = p.email || p.displayName || p.name || '';
        // participantMap has the exact pre-merge category (sourceCat or targetCat)
        var fromMap = participantMap[pKey] || '';
        var fromOrig = p.originalCategory || '';

        // Determine restore target: prefer mergeRecord map, fallback to originalCategory
        var restoreTo = '';
        if (fromMap && (fromMap === sourceCat || fromMap === targetCat)) {
            restoreTo = fromMap;
        } else if (fromOrig && (fromOrig === sourceCat || fromOrig === targetCat)) {
            restoreTo = fromOrig;
        }

        if (restoreTo) {
            // Restore to the pre-merge category
            pCats[idx] = restoreTo;
            window._setParticipantCategories(p, pCats);
            // Clear originalCategory if it matches (participant is back to their original)
            if (p.originalCategory === restoreTo) {
                delete p.originalCategory;
            }
        } else {
            // No original info — set as uncategorized (remove merged cat)
            pCats.splice(idx, 1);
            if (pCats.length === 0) {
                window._setParticipantCategories(p, []);
                p.wasUncategorized = true;
            } else {
                window._setParticipantCategories(p, pCats);
            }
        }
    });

    // Restore combinedCategories: remove merged, add back source and target
    var cats = t.combinedCategories || [];
    var newCats = cats.filter(function(c) { return c !== mergedName; });
    if (newCats.indexOf(sourceCat) === -1) newCats.push(sourceCat);
    if (newCats.indexOf(targetCat) === -1) newCats.push(targetCat);
    t.combinedCategories = newCats;

    // Revert rounds/matches category references
    (t.rounds || []).forEach(function(r) {
        (r.matches || []).forEach(function(m) {
            if (m.category === mergedName) {
                // Can't know which original — leave as merged for safety
                // (matches shouldn't exist before a draw anyway)
            }
        });
    });

    // Remove this merge record from history
    t.mergeHistory.splice(mergeIdx, 1);

    // Log action
    window.AppStore.logAction(tId, 'Mesclagem desfeita: ' + mergedName + ' → ' + sourceCat + ' + ' + targetCat);

    // Persist
    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        window.FirestoreDB.saveTournament(t);
    } else {
        window.AppStore.sync();
    }

    if (typeof showNotification === 'function') {
        showNotification(_t('cat.unmerged'), _t('cat.unmergedMsg', { merged: mergedName, src: sourceCat, target: targetCat }), 'success');
    }

    // Re-render
    setTimeout(function() {
        if (window._catManagerRender) window._catManagerRender();
    }, 100);
}

// Unmerge without mergeHistory — infer from name pattern
function _executeInferredUnmerge(tId, mergedName, inferredCats) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t) return;

    var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];

    // Restore participants to their original categories using p.originalCategory
    parts.forEach(function(p) {
        if (typeof p !== 'object') return;
        var pCats = window._getParticipantCategories(p);
        var idx = pCats.indexOf(mergedName);
        if (idx === -1) return;

        // p.originalCategory (shown in parentheses) tells us where the participant came from
        var origCat = p.originalCategory || '';
        if (origCat && inferredCats.indexOf(origCat) !== -1) {
            // Restore to the original category shown in parentheses
            pCats[idx] = origCat;
            window._setParticipantCategories(p, pCats);
            delete p.originalCategory;
        } else {
            // No matching original — set as uncategorized for manual reassignment
            pCats.splice(idx, 1);
            if (pCats.length === 0) {
                window._setParticipantCategories(p, []);
                p.wasUncategorized = true;
            } else {
                window._setParticipantCategories(p, pCats);
            }
        }
    });

    // Restore combinedCategories: remove merged, add back inferred originals
    var cats = t.combinedCategories || [];
    var newCats = cats.filter(function(c) { return c !== mergedName; });
    inferredCats.forEach(function(ic) {
        if (newCats.indexOf(ic) === -1) newCats.push(ic);
    });
    t.combinedCategories = newCats;

    // Remove any mergeHistory entries for this merged name (cleanup)
    if (t.mergeHistory) {
        t.mergeHistory = t.mergeHistory.filter(function(mh) { return mh.mergedName !== mergedName; });
    }

    // Log action
    window.AppStore.logAction(tId, 'Mesclagem desfeita: ' + mergedName + ' → ' + inferredCats.join(' + '));

    // Persist
    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        window.FirestoreDB.saveTournament(t);
    } else {
        window.AppStore.sync();
    }

    if (typeof showNotification === 'function') {
        showNotification(_t('cat.unmerged'), _t('cat.unmergedInferredMsg', { merged: mergedName, cats: inferredCats.join(' + ') }), 'success');
    }

    // Re-render
    setTimeout(function() {
        if (window._catManagerRender) window._catManagerRender();
    }, 100);
}

// Assign an uncategorized participant to a category (manual by organizer)
function _assignParticipantCategory(tId, pIdx, category) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t || !t.participants) return;

    // Work directly on the tournament's participants array
    var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants);
    if (pIdx < 0 || pIdx >= parts.length) return;

    var p = parts[pIdx];
    var pName = typeof p === 'string' ? p : (p.displayName || p.name || '');

    // Convert string participant to object if needed
    if (typeof p === 'string') {
        parts[pIdx] = { name: p, displayName: p, categories: [category], category: category, categorySource: 'organizador', wasUncategorized: true };
        p = parts[pIdx];
    } else {
        window._addParticipantCategory(p, category);
        p.categorySource = 'organizador';
        p.wasUncategorized = true;
    }

    // Ensure the array is written back (in case Object.values created a copy)
    if (!Array.isArray(t.participants)) {
        t.participants = parts;
    }

    // Add notification for the participant
    _addCategoryNotification(t, parts[pIdx], category);

    // Persist — use FirestoreDB.saveTournament directly for reliability
    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        window.FirestoreDB.saveTournament(t);
    } else {
        window.AppStore.sync();
    }

    if (typeof showNotification === 'function') {
        showNotification(_t('cat.assigned'), _t('cat.assignedMsg', { name: pName, cat: window._displayCategoryName(category) }), 'success');
    }

    // Re-render the modal after a small delay to ensure data is settled
    setTimeout(function() {
        if (window._catManagerRender) window._catManagerRender();
    }, 100);
}

// Category assignment notification
function _addCategoryNotification(t, participant, category) {
    if (!t || !participant) return;
    var pEmail = participant.email || '';
    if (!pEmail) return;

    // Initialize notifications array if needed
    if (!t.categoryNotifications) t.categoryNotifications = [];

    t.categoryNotifications.push({
        targetEmail: pEmail,
        targetName: participant.displayName || participant.name || '',
        category: category,
        source: participant.categorySource || 'organizador',
        timestamp: Date.now(),
        read: false
    });
}

// Auto-assign categories based on participant profile gender
// Helper: resolve eligible categories for a participant using gender, age and skill.
// Mirrors the logic of _resolveEnrollmentCategory but reads from the participant
// object (p.gender, p.birthDate, p.skillBySport, p.defaultCategory) instead of
// window.AppStore.currentUser so it works for every participant, not just the
// logged-in one.
function _eligibleCatsForParticipant(p, allCats, tSport) {
    if (!allCats || allCats.length === 0) return [];
    var eligible = allCats.slice();

    var allGenderPrefixes = ['fem', 'masc', 'misto aleat.', 'misto obrig.'];
    var genderPrefixMap = { fem: 'fem', masc: 'masc', misto_aleatorio: 'misto aleat.', misto_obrigatorio: 'misto obrig.' };

    // ── 1. Gênero ─────────────────────────────────────────────────────────────
    var pGender = p.gender || '';
    if (pGender && typeof window._userGenderToCatCodes === 'function') {
        var validGenderCodes = window._userGenderToCatCodes(pGender);
        if (validGenderCodes && validGenderCodes.length > 0) {
            var gFiltered = eligible.filter(function(cat) {
                var hasGenderPrefix = allGenderPrefixes.some(function(gp) { return cat.toLowerCase().startsWith(gp); });
                if (!hasGenderPrefix) return true; // no gender prefix = open to everyone
                return validGenderCodes.some(function(code) {
                    return cat.toLowerCase().startsWith(genderPrefixMap[code] || code);
                });
            });
            if (gFiltered.length > 0) eligible = gFiltered;
        }
    }
    if (eligible.length === 1) return eligible;

    // ── 2. Idade ──────────────────────────────────────────────────────────────
    var birthDate = p.birthDate || '';
    if (birthDate) {
        var bd = new Date(birthDate);
        if (!isNaN(bd.getTime())) {
            var now = new Date();
            var age = now.getFullYear() - bd.getFullYear();
            if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) age--;
            var ageBuckets = [];
            eligible.forEach(function(cat) {
                var m = cat.match(/(\d+)\+/);
                if (m) { var v = parseInt(m[1]); if (ageBuckets.indexOf(v) === -1) ageBuckets.push(v); }
            });
            if (ageBuckets.length > 0) {
                ageBuckets.sort(function(a, b) { return b - a; });
                var myBucket = null;
                for (var bi = 0; bi < ageBuckets.length; bi++) {
                    if (age >= ageBuckets[bi]) { myBucket = ageBuckets[bi]; break; }
                }
                if (myBucket !== null) {
                    var byAge = eligible.filter(function(cat) { return cat.indexOf(myBucket + '+') !== -1; });
                    if (byAge.length > 0) eligible = byAge;
                } else {
                    var noAge = eligible.filter(function(cat) { return !cat.match(/\d+\+/); });
                    if (noAge.length > 0) eligible = noAge;
                }
            }
        }
    }
    if (eligible.length === 1) return eligible;

    // ── 3. Habilidade ─────────────────────────────────────────────────────────
    var profileSkill = null;
    if (p.skillBySport && typeof p.skillBySport === 'object' && tSport) {
        var raw = p.skillBySport[tSport];
        if (raw) profileSkill = String(raw).trim().toUpperCase();
    }
    if (!profileSkill && p.defaultCategory) {
        profileSkill = String(p.defaultCategory).trim().toUpperCase();
    }
    if (profileSkill) {
        var skillFiltered = eligible.filter(function(cat) {
            return cat.split(' ').some(function(tok) { return tok.toUpperCase() === profileSkill; });
        });
        if (skillFiltered.length > 0) eligible = skillFiltered;
    }

    return eligible;
}

window._autoAssignCategories = function(tId) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t) return 0;

    var allCats = window._getTournamentCategories ? window._getTournamentCategories(t) : (t.combinedCategories || []);
    var genderCats = t.genderCategories || [];
    if (allCats.length === 0 && genderCats.length === 0) return 0;

    var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];
    if (parts.length === 0) return 0;

    var tSport = t.sport ? String(t.sport).trim() : null;
    var assigned = 0;

    parts.forEach(function(p) {
        if (typeof p !== 'object') return;

        // Skip if already manually set by organizer
        if (p.categorySource === 'organizador') return;

        // Skip if already has a valid category from the current category set
        var existingCats = window._getParticipantCategories ? window._getParticipantCategories(p) : (p.categories || (p.category ? [p.category] : []));
        var hasValidCat = existingCats.some(function(c) { return allCats.indexOf(c) !== -1; });
        if (hasValidCat) return;

        // Skip if participant has no profile data to work with
        var hasAnyProfileData = p.gender || p.birthDate || p.skillBySport || p.defaultCategory;
        if (!hasAnyProfileData) return;

        var eligible = _eligibleCatsForParticipant(p, allCats, tSport);
        if (eligible.length === 0) return;

        // Auto-assign: if exactly one candidate → assign; if ambiguous → skip
        // (user will need to self-select or organizer assigns manually)
        var groups = typeof window._groupEligibleCategories === 'function'
            ? window._groupEligibleCategories(eligible)
            : { exclusive: eligible, nonExclusive: [] };

        var autoAssigned = [];
        if (groups.exclusive.length === 1) autoAssigned.push(groups.exclusive[0]);
        autoAssigned = autoAssigned.concat(groups.nonExclusive);

        if (autoAssigned.length > 0) {
            if (typeof window._setParticipantCategories === 'function') {
                window._setParticipantCategories(p, autoAssigned);
            } else {
                p.categories = autoAssigned;
                p.category = autoAssigned[0];
            }
            p.categorySource = 'perfil';
            p.wasUncategorized = true;
            autoAssigned.forEach(function(cat) {
                try { _addCategoryNotification(t, p, cat); } catch (_e) {}
            });
            assigned++;
        }
    });

    if (assigned > 0) {
        if (!Array.isArray(t.participants)) t.participants = parts;
        if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
            window.FirestoreDB.saveTournament(t);
        } else if (window.AppStore && window.AppStore.sync) {
            window.AppStore.sync();
        }
    }

    return assigned;
};

// Async version: loads Firestore profiles for participants missing profile data,
// then runs the sync auto-assign. Caller should fire-and-forget.
window._autoAssignCategoriesAsync = async function(tId) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tId); });
    if (!t || !window.FirestoreDB) return 0;

    var allCats = window._getTournamentCategories ? window._getTournamentCategories(t) : (t.combinedCategories || []);
    if (allCats.length === 0) return 0;

    var parts = t.participants ? (Array.isArray(t.participants) ? t.participants : Object.values(t.participants)) : [];

    // Needs enrichment: participants missing profile data AND uncategorized
    function _needsEnrichment(p) {
        if (typeof p !== 'object') return false;
        if (p.categorySource === 'organizador') return false;
        var existingCats = (p.categories || (p.category ? [p.category] : []));
        var hasValidCat = existingCats.some(function(c) { return allCats.indexOf(c) !== -1; });
        if (hasValidCat) return false;
        return !(p.birthDate || p.skillBySport || p.defaultCategory);
    }

    // Participants with uid — load by uid
    var toLoadByUid = parts.filter(function(p) { return _needsEnrichment(p) && p.uid; });
    // Participants without uid but with email — load by email query
    var toLoadByEmail = parts.filter(function(p) { return _needsEnrichment(p) && !p.uid && p.email; });

    // Enrich by uid
    for (var i = 0; i < toLoadByUid.length; i++) {
        try {
            var profile = await window.FirestoreDB.loadUserProfile(toLoadByUid[i].uid);
            if (profile) {
                if (profile.birthDate && !toLoadByUid[i].birthDate) toLoadByUid[i].birthDate = profile.birthDate;
                if (profile.skillBySport && !toLoadByUid[i].skillBySport) toLoadByUid[i].skillBySport = profile.skillBySport;
                if (profile.defaultCategory && !toLoadByUid[i].defaultCategory) toLoadByUid[i].defaultCategory = profile.defaultCategory;
                if (profile.gender && !toLoadByUid[i].gender) toLoadByUid[i].gender = profile.gender;
            }
        } catch (_e) {}
    }

    // Enrich by email (participants added before uid was stored)
    if (toLoadByEmail.length > 0 && window.FirestoreDB.db) {
        for (var j = 0; j < toLoadByEmail.length; j++) {
            try {
                var emailQ = toLoadByEmail[j].email.toLowerCase();
                var snap = await window.FirestoreDB.db.collection('users')
                    .where('email_lower', '==', emailQ).limit(1).get();
                if (!snap.empty) {
                    var pdata = snap.docs[0].data();
                    if (pdata.birthDate && !toLoadByEmail[j].birthDate) toLoadByEmail[j].birthDate = pdata.birthDate;
                    if (pdata.skillBySport && !toLoadByEmail[j].skillBySport) toLoadByEmail[j].skillBySport = pdata.skillBySport;
                    if (pdata.defaultCategory && !toLoadByEmail[j].defaultCategory) toLoadByEmail[j].defaultCategory = pdata.defaultCategory;
                    if (pdata.gender && !toLoadByEmail[j].gender) toLoadByEmail[j].gender = pdata.gender;
                    if (!toLoadByEmail[j].uid && snap.docs[0].id) toLoadByEmail[j].uid = snap.docs[0].id;
                }
            } catch (_e) {}
        }
    }

    // Run the sync assign now that data is enriched
    return window._autoAssignCategories(tId);
};

// Check and show category notifications for current user
window._checkCategoryNotifications = function(t) {
    if (!t || !t.categoryNotifications || t.categoryNotifications.length === 0) return;
    var user = window.AppStore.currentUser;
    if (!user || !user.email) return;

    var userNotifs = t.categoryNotifications.filter(function(n) {
        return n.targetEmail === user.email && !n.read;
    });

    if (userNotifs.length === 0) return;

    userNotifs.forEach(function(n) {
        n.read = true; // Mark as read

        var sourceLabel = n.source === 'perfil' ? _t('cat.sourceProfile') : _t('cat.sourceOrganizer');
        var orgEmail = t.organizerEmail || '';
        var orgName = t.organizerName || t.organizerEmail || 'organizador';

        var questionBtnId = 'cat-question-btn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);

        showAlertDialog(
            _t('cat.assigned'),
            _t('cat.assignedDialogMsg', {cat: window._displayCategoryName(n.category), source: sourceLabel, tournament: (t.name || '')}) +
            '<br><br><button id="' + questionBtnId + '" style="background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border:none;padding:8px 16px;border-radius:10px;font-weight:600;font-size:0.85rem;cursor:pointer;">' + _t('cat.questionOrg') + '</button>',
            function() {
                // Dialog dismissed
            },
            { type: 'info', confirmText: 'OK' }
        );

        // Attach question button handler after dialog renders
        setTimeout(function() {
            var btn = document.getElementById(questionBtnId);
            if (btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var subject = encodeURIComponent('Questionamento sobre categoria - ' + (t.name || ''));
                    var body = encodeURIComponent('Olá ' + orgName + ',\n\nFui atribuído à categoria "' + n.category + '" no torneio "' + (t.name || '') + '" e gostaria de questionar essa atribuição.\n\nMotivo: \n\nAtenciosamente,\n' + (user.displayName || ''));
                    window.open('mailto:' + orgEmail + '?subject=' + subject + '&body=' + body, '_blank');
                });
            }
        }, 300);
    });

    // Persist the read status
    if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
        window.FirestoreDB.saveTournament(t);
    }
};

})();
