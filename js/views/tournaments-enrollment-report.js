// scoreplace.app — v1.3.0-beta: Análise de Inscritos
// Modal pro organizador entender como os inscritos se distribuem nas
// categorias configuradas (gênero × habilidade × idade), receber sugestão
// de formato + tempo estimado por categoria, e ver quem tá com perfil
// incompleto pra justificar onde encaixar.
//
// Disponível pelo botão "📊 Análise" nas Ferramentas do Organizador,
// só renderiza quando há ≥ 1 inscrito.
//
// Limitação: birthDate vive só em users/{uid}, não no participantObj.
// Pra computar idade, fazemos N=#participantes leituras do Firestore na
// abertura do modal (em paralelo via Promise.all). Custo bounded — só
// dispara quando organizador abre o modal manualmente.

(function () {
  'use strict';

  // ─── Helpers de cálculo ──────────────────────────────────────────────

  function _computeAge(birthDateStr) {
    if (!birthDateStr) return null;
    var d = new Date(birthDateStr);
    if (isNaN(d.getTime())) return null;
    var now = new Date();
    var age = now.getFullYear() - d.getFullYear();
    var m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 0 && age < 150 ? age : null;
  }

  // v1.3.8-beta: faixa etária é MUTUAMENTE EXCLUSIVA — bucket único.
  // 52 anos com [40+, 50+, 60+, 70+] retorna ['50+'] (não 40+ também).
  // Algoritmo: ordena por threshold descendente, pega o primeiro que cabe.
  // Mantém retorno array (length 0 ou 1) pra preservar callsites existentes.
  function _ageBuckets(age, ageCats) {
    if (age == null || !ageCats || ageCats.length === 0) return [];
    var thresholds = ageCats.map(function (cat) {
      var m = cat.match(/^(\d+)\+$/);
      return m ? { cat: cat, val: parseInt(m[1]) } : null;
    }).filter(Boolean);
    thresholds.sort(function (a, b) { return b.val - a.val; }); // desc
    for (var i = 0; i < thresholds.length; i++) {
      if (age >= thresholds[i].val) return [thresholds[i].cat];
    }
    return [];
  }

  // v1.3.8-beta: aceita TANTO chaves curtas (fem/masc/misto_*) usadas em
  // t.genderCategories quanto strings completas (feminino/masculino/outro)
  // que o perfil salva via <select id="profile-edit-gender">. Antes só
  // conhecia as curtas — masculino caía em null e gerava "Sem gênero 1".
  function _genderLabel(g) {
    if (!g) return null;
    var key = String(g).toLowerCase().trim();
    var map = {
      fem: 'Fem',
      feminino: 'Fem',
      f: 'Fem',
      masc: 'Masc',
      masculino: 'Masc',
      m: 'Masc',
      misto: 'Misto',
      misto_aleatorio: 'Misto',
      misto_obrigatorio: 'Misto',
      // 'outro' / 'other' fica null — gênero não-binário não tem cat hoje
    };
    return map[key] || null;
  }

  // Decompõe "Fem A Duplas" em { gender:'Fem', skill:'A', gameType:'Duplas' }
  // Aceita também "Misto A", "Masc 40+", "A", etc.
  //
  // v1.3.8-beta: fallback pra defaults quando t.skillCategories ou
  // t.ageCategories estão vazios (modo derivado). Antes 'D' não era
  // reconhecido como skill quando torneio não tinha config — count caía
  // em zero. Defaults: skills=['A','B','C','D','FUN'], ages=[40+/50+/60+/70+].
  var _DEFAULT_SKILLS = ['A', 'B', 'C', 'D', 'FUN'];
  var _DEFAULT_AGES = ['40+', '50+', '60+', '70+'];

  function _decomposeCat(cat, t) {
    if (!cat) return {};
    var skillCatsRaw = (t && t.skillCategories && t.skillCategories.length > 0) ? t.skillCategories : _DEFAULT_SKILLS;
    var ageCatsRaw = (t && t.ageCategories && t.ageCategories.length > 0) ? t.ageCategories : _DEFAULT_AGES;
    var skillCats = skillCatsRaw.slice().sort(function (a, b) { return b.length - a.length; });
    var ageCats = ageCatsRaw.slice();
    var gameTypes = ['Duplas', 'Simples'];
    var GENDER_PREFIXES = ['Fem', 'Masc', 'Misto Aleat.', 'Misto Obrig.', 'Misto'];

    var rest = String(cat).trim();
    var out = { gender: null, skill: null, age: null, gameType: null };

    // Gender prefix
    for (var i = 0; i < GENDER_PREFIXES.length; i++) {
      var p = GENDER_PREFIXES[i];
      if (rest.indexOf(p + ' ') === 0 || rest === p) {
        out.gender = p.indexOf('Misto') === 0 ? 'Misto' : p;
        rest = rest.slice(p.length).trim();
        break;
      }
    }

    // GameType suffix
    for (var j = 0; j < gameTypes.length; j++) {
      var gt = gameTypes[j];
      if (rest.endsWith(' ' + gt) || rest === gt) {
        out.gameType = gt;
        rest = rest.slice(0, rest.length - gt.length).trim();
        break;
      }
    }

    // Skill match (longest first)
    for (var k = 0; k < skillCats.length; k++) {
      if (rest === skillCats[k]) { out.skill = skillCats[k]; rest = ''; break; }
    }
    // Age match
    if (!out.skill) {
      for (var a = 0; a < ageCats.length; a++) {
        if (rest === ageCats[a]) { out.age = ageCats[a]; rest = ''; break; }
      }
    }

    return out;
  }

  // ─── Sugestão de formato + tempo ─────────────────────────────────────

  // v2.4.38: estimativa por categoria RESPEITA o formato que o organizador
  // escolheu (t.format) — não "sugere" eliminatórias. Liga/Ranking é temporada
  // contínua → estimativa POR RODADA (Rei/Rainha = grupos de 4; padrão = duplas).
  // Tempo é orientativo (usa gameDuration/courtCount; defaults 30min/1 quadra).
  function _suggestForCount(n, t) {
    var gameDur = parseInt(t && t.gameDuration) || 30;
    var courts = Math.max(parseInt(t && t.courtCount) || 1, 1);
    if (n < 2) return { format: '— insuficiente', desc: 'Precisa de pelo menos 2 inscritos.', matches: 0, durationMin: 0, color: '#64748b' };

    var fmt = String((t && t.format) || '');
    var lf = fmt.toLowerCase();
    var isLiga = (typeof window._isLigaFormat === 'function') ? window._isLigaFormat(t) : (fmt === 'Liga' || fmt === 'Ranking');
    var isSuico = lf.indexOf('su') === 0 && (lf.indexOf('suí') !== -1 || lf.indexOf('sui') !== -1);
    var isDupla = lf.indexOf('dupla') !== -1;
    var isMonarchFmt = !!(window._isMonarchFormat && window._isMonarchFormat(t));
    // Rei/Rainha (modo) tem precedência sobre "grupos": é grupos de 4 rotativos, estimativa própria.
    var isGrupos = !isMonarchFmt && lf.indexOf('grupo') !== -1;

    // ── LIGA / RANKING — temporada contínua: estimativa POR RODADA ──────────
    if (isLiga) {
      if (t.ligaRoundFormat === 'rei_rainha') {
        var grp = Math.floor(n / 4), folga = n % 4, games = grp * 3;
        return { format: 'Liga (Rei/Rainha)', perRound: true, matches: games, color: '#10b981',
          durationMin: Math.ceil(games / courts) * gameDur,
          desc: 'Por rodada: ' + grp + ' grupo' + (grp !== 1 ? 's' : '') + ' de 4 = ' + games + ' jogo' + (games !== 1 ? 's' : '') + (folga ? ' (+' + folga + ' folga' + (folga !== 1 ? 's' : '') + ')' : '') + '.' };
      }
      var perGame = (parseInt(t.teamSize) || 1) >= 2 ? 4 : 2;
      var gms = Math.max(1, Math.floor(n / perGame)), rem = n % perGame;
      return { format: 'Liga', perRound: true, matches: gms, color: '#10b981',
        durationMin: Math.ceil(gms / courts) * gameDur,
        desc: 'Por rodada: ' + gms + ' jogo' + (gms !== 1 ? 's' : '') + (rem ? ' (+' + rem + ' folga' + (rem !== 1 ? 's' : '') + ')' : '') + '.' };
    }

    // ── SUÍÇO — rodadas suíças (~log2 n rodadas, n/2 jogos cada) ─────────────
    if (isSuico) {
      var sr = Math.max(1, Math.ceil(Math.log2(Math.max(n, 2))));
      var sper = Math.floor(n / 2), stotal = sper * sr;
      return { format: 'Suíço', matches: stotal, color: '#8b5cf6',
        durationMin: sr * Math.ceil(sper / courts) * gameDur,
        desc: sr + ' rodada' + (sr !== 1 ? 's' : '') + ' × ~' + sper + ' jogos = ' + stotal + ' jogos.' };
    }

    // ── REI/RAINHA DA PRAIA (MODO de sorteio de Pontos Corridos, não formato) ──
    if (isMonarchFmt) {
      var rg = Math.floor(n / 4), rgames = rg * 3, rem2 = n % 4, gem0 = Math.max(0, rg - 1);
      var tot0 = rgames + gem0;
      return { format: 'Rei/Rainha', matches: tot0, color: '#fbbf24',
        durationMin: Math.ceil(tot0 / courts) * gameDur,
        desc: rg + ' grupo' + (rg !== 1 ? 's' : '') + ' de 4 (' + rgames + ' jogos)' + (rem2 ? ' (+' + rem2 + ' sobra' + (rem2 !== 1 ? 's' : '') + ')' : '') + ' + final.' };
    }

    // ── ELIMINATÓRIAS (Simples / Dupla / Grupos+Elim) — bracket ─────────────
    var nextPow2 = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
    var nrounds = Math.max(1, Math.ceil(Math.log2(Math.max(n, 2))));
    var elimMin = 0;
    for (var r = 0; r < nrounds; r++) {
      var mir = Math.ceil(n / Math.pow(2, r + 1));
      elimMin += Math.ceil(mir / courts) * gameDur;
    }
    if (isDupla) {
      var dm = Math.round((n - 1) * 1.9);
      return { format: 'Dupla Eliminatória', matches: dm, color: '#ef4444',
        durationMin: Math.round(elimMin * 1.9),
        desc: 'Bracket de ' + nextPow2 + ' (upper + lower). ~' + dm + ' partidas.' };
    }
    if (isGrupos) {
      var ng = Math.max(1, Math.round(n / 4));
      var groupGames = ng * 6, qualifiers = ng * 2, gem = Math.max(0, qualifiers - 1);
      var gtot = groupGames + gem;
      return { format: 'Fase de Grupos', matches: gtot, color: '#3b82f6',
        durationMin: Math.ceil(gtot / courts) * gameDur,
        desc: '~' + ng + ' grupo' + (ng !== 1 ? 's' : '') + ' de 4 (' + groupGames + ' jogos) + elim (' + gem + ' partidas).' };
    }
    // Eliminatórias Simples (default / formato não-reconhecido)
    return { format: fmt && /elimin/i.test(fmt) ? fmt : 'Eliminatórias Simples', matches: n - 1, color: '#3b82f6',
      durationMin: elimMin,
      desc: 'Bracket de ' + nextPow2 + '. ' + (n - 1) + ' partidas' + (nextPow2 > n ? ' (com BYEs)' : '') + '.' };
  }

  function _fmtDuration(min) {
    if (!min || min <= 0) return '—';
    var h = Math.floor(min / 60);
    var m = Math.round(min % 60);
    if (h === 0) return m + 'min';
    if (m === 0) return h + 'h';
    return h + 'h' + (m < 10 ? '0' : '') + m;
  }

  // ─── Profile fetch ───────────────────────────────────────────────────
  //
  // v1.3.24-beta: agora resolve perfil em 3 camadas pra recuperar inscritos
  // que perderam uid no participantObj por bug em algum path de enrollment
  // (não é "manual add" — bug reportado pelo dono: "AS pessoas entraram
  // tem perfil"):
  //
  //   1. Direct uid fetch (caminho normal)
  //   2. Email lookup — se participantObj.email existe e não temos uid,
  //      query users where email == X. Se único match, vincula.
  //   3. DisplayName lookup — último recurso quando não tem email nem uid.
  //      Só vincula se houver EXATAMENTE 1 match no users collection
  //      (case-insensitive trim) — caso contrário deixa não-vinculado pra
  //      evitar falso positivo.
  //
  // Retorna { byUid: {uid: profileData}, resolvedFor: {participantIdx:
  // {uid, profile, resolvedVia}} } — o caller usa resolvedFor pra saber
  // que aquele inscrito foi rescued e via qual mecanismo.

  function _fetchProfiles(parts) {
    if (!parts || parts.length === 0) return Promise.resolve({ byUid: {}, resolvedFor: {} });
    if (!window.firebase || !firebase.firestore) return Promise.resolve({ byUid: {}, resolvedFor: {} });
    var db = firebase.firestore();
    var byUid = {};
    var resolvedFor = {};

    // ─ Camada 1: direct uid fetch ────────────────────────────────────
    var uids = {};
    parts.forEach(function (p) { if (p && p.uid) uids[p.uid] = 1; });
    var uidPromises = Object.keys(uids).map(function (uid) {
      return db.collection('users').doc(uid).get()
        .then(function (doc) { if (doc.exists) byUid[uid] = doc.data(); })
        .catch(function () { /* per-user err — silencioso */ });
    });

    return Promise.all(uidPromises).then(function () {
      // ─ Camada 2 + 3: rescue inscritos sem uid ──────────────────────
      var rescueIdxs = [];
      parts.forEach(function (p, idx) {
        if (!p || p.uid) return; // já tem uid; nada a fazer
        // Pular orgs adições reais — heuristic: orgs add manual quase
        // sempre tem só name+displayName, sem email. Mas vamos tentar
        // mesmo assim: se não houver match, deixa não-vinculado.
        rescueIdxs.push(idx);
      });

      if (rescueIdxs.length === 0) return { byUid: byUid, resolvedFor: resolvedFor };

      var rescuePromises = rescueIdxs.map(function (idx) {
        var p = parts[idx];
        var email = p && p.email ? String(p.email).trim().toLowerCase() : '';
        var name = p && (p.displayName || p.name) ? String(p.displayName || p.name).trim() : '';

        // Camada 2: email lookup (alta confiança)
        var emailQ = email
          ? db.collection('users').where('email', '==', email).limit(2).get()
          : Promise.resolve(null);

        return emailQ.then(function (snap) {
          if (snap && snap.size === 1) {
            var doc = snap.docs[0];
            var uid = doc.id;
            byUid[uid] = doc.data();
            resolvedFor[idx] = { uid: uid, profile: doc.data(), via: 'email' };
            return null;
          }
          // Camada 3: displayName lookup (média confiança — só se 1 match)
          if (!name) return null;
          // Tenta displayName primeiro (campo comum em users).
          return db.collection('users').where('displayName', '==', name).limit(2).get()
            .then(function (nameSnap) {
              if (nameSnap && nameSnap.size === 1) {
                var doc = nameSnap.docs[0];
                var uid = doc.id;
                byUid[uid] = doc.data();
                resolvedFor[idx] = { uid: uid, profile: doc.data(), via: 'displayName' };
              }
            })
            .catch(function () { /* swallow */ });
        }).catch(function () { /* swallow */ });
      });

      return Promise.all(rescuePromises).then(function () {
        return { byUid: byUid, resolvedFor: resolvedFor };
      });
    });
  }

  // ─── Build per-participant rows ──────────────────────────────────────
  //
  // v1.3.1-beta: profile (users/{uid}) é a fonte de verdade preferida pra
  // gênero/nome/foto — só cai no participantObj quando o uid não resolve ou
  // o profile fetch falhou. Antes o snapshot do enrollment vencia, o que
  // dava report stale quando usuário atualizava perfil depois.
  // BirthDate só vive no profile mesmo (não é capturado no participantObj),
  // então é sempre fresh.
  //
  // v1.3.2-beta: agora também lê profile.defaultCategory como skill derivado
  // quando o organizador não atribuiu manualmente via 🏷️ Categorias. Antes
  // só funcionava se o org tinha rodado a atribuição. Agora cai do auto:
  // perfil.defaultCategory='D' + profile.gender='masc' = inscrito conta como
  // 'Masc D' nas estatísticas.

  // v2.8.56: expande DUPLAS (entrada estrutural p1Name/p2Name) em 2 pessoas, pra a
  // Análise contar e decompor CADA inscrito individualmente. Antes a dupla virava 1
  // linha (só o p1) → o relatório mostrava menos gente do que o nº real de inscritos
  // num torneio de casais. Cada membro carrega o próprio uid (perfil resolve
  // gênero/idade/habilidade) + a categoria do time.
  function _expandDuplas(parts) {
    var out = [];
    (parts || []).forEach(function (p, idx) {
      if (p && typeof p === 'object' && p.p1Name && p.p2Name) {
        var baseCats = (Array.isArray(p.categories) && p.categories.length) ? p.categories.slice() : (p.category ? [p.category] : []);
        // v2.8.62: cada membro carrega a identidade da dupla (_duplaIdx = índice em
        // t.participants, _duplaSide = 'p1'/'p2') pra o SAVE conseguir gravar o gênero
        // de volta (p1Gender/p2Gender no doc da dupla). Lê o override per-membro que já
        // exista (p1Gender/p2Gender) pra o relatório mostrar o que foi atribuído.
        out.push({ uid: p.p1Uid || '', displayName: p.p1Name, name: p.p1Name, email: p.p1Email || '', categories: baseCats.slice(), category: p.category || '', gender: p.p1Gender || '', genderSource: p.p1Gender ? 'organizador' : '', _fromDupla: true, _duplaIdx: idx, _duplaSide: 'p1' });
        out.push({ uid: p.p2Uid || '', displayName: p.p2Name, name: p.p2Name, email: p.p2Email || '', categories: baseCats.slice(), category: p.category || '', gender: p.p2Gender || '', genderSource: p.p2Gender ? 'organizador' : '', _fromDupla: true, _duplaIdx: idx, _duplaSide: 'p2' });
      } else {
        out.push(p);
      }
    });
    return out;
  }

  function _buildRows(t, parts, fetchResult) {
    var ageCats = (t.ageCategories || []).slice();
    var skillCats = (t.skillCategories || []).slice();
    // Compat: se passar profileMap antigo (objeto uid→profile direto),
    // converter pro shape novo. Evita quebrar callers durante refactor.
    var profileMap = (fetchResult && fetchResult.byUid) ? fetchResult.byUid : (fetchResult || {});
    var resolvedFor = (fetchResult && fetchResult.resolvedFor) ? fetchResult.resolvedFor : {};

    return parts.map(function (p, idx) {
      var uid = p && p.uid ? p.uid : null;
      var resolvedVia = null; // 'email' | 'displayName' | null (uid direto)
      // v1.3.24-beta: rescue — se participantObj não tinha uid mas
      // _fetchProfiles conseguiu match por email/displayName, usa o uid
      // resolvido. Inscrito conta como "vinculado" no report.
      if (!uid && resolvedFor[idx] && resolvedFor[idx].uid) {
        uid = resolvedFor[idx].uid;
        resolvedVia = resolvedFor[idx].via;
      }
      var profile = uid ? profileMap[uid] : null;
      // Profile vence — mantém report fresh quando user atualiza perfil
      // depois de se inscrever. Cai pra participantObj se profile não existe.
      // v2.4.32: EXCETO quando o organizador editou o gênero na ficha do inscrito
      // (genderSource='organizador') — aí a edição do org é autoritativa e vence
      // o perfil (e funciona pra inscrito SEM conta, que não tem profile).
      var gender = (p && p.gender && p.genderSource === 'organizador')
        ? p.gender
        : ((profile && profile.gender) || (p && p.gender) || null);
      var name = (profile && profile.displayName)
        || p.displayName || p.name
        || (typeof p === 'string' ? p : '(sem nome)');
      var email = (profile && profile.email) || p.email || null;
      var birthDate = profile && profile.birthDate ? profile.birthDate : null;
      var age = _computeAge(birthDate);
      var ageBks = _ageBuckets(age, ageCats);

      // Categorias atribuídas pelo organizador (manual via 🏷️ Categorias)
      var assigned = Array.isArray(p.categories) && p.categories.length > 0
        ? p.categories.slice()
        : (p.category ? [p.category] : []);

      // Quais skills estão presentes nas atribuições manuais
      var assignedSkills = [];
      assigned.forEach(function (c) {
        var d = _decomposeCat(c, t);
        if (d.skill && assignedSkills.indexOf(d.skill) === -1) assignedSkills.push(d.skill);
      });

      // v1.3.2-beta: skill derivado do perfil — cai aqui se o org não
      // atribuiu manualmente.
      // v1.3.6-beta: prioriza profile.skillBySport[t.sport] (habilidade
      // específica daquela modalidade). Fallback pra defaultCategory legacy.
      // v2.1.79: a habilidade do perfil SÓ vale se for categoria existente
      // (A/B/C/D/FUN). defaultCategory legado era texto livre — "Intermediario",
      // "D/C" etc. — e sem normalização o relatório mostrava "categorias" que não
      // existem (caso real: Silvia M. Ferreira = "Intermediario" no Confra 2026).
      // Split em "/" recupera legados compostos ("D/C" → D e C). Token sem match
      // (ex.: "Intermediario") é descartado → habilidade conta como faltando.
      var VALID_SKILLS = { A: 1, B: 1, C: 1, D: 1, FUN: 1 };
      var _validSkillTokens = function (raw) {
        if (!raw) return [];
        return String(raw).split('/')
          .map(function (s) { return s.trim().toUpperCase(); })
          .filter(function (s) { return VALID_SKILLS[s]; });
      };
      var profileSkills = [];
      if (profile && profile.skillBySport && typeof profile.skillBySport === 'object') {
        var tSport = t && t.sport ? String(t.sport).trim() : null;
        if (tSport && profile.skillBySport[tSport]) {
          profileSkills = _validSkillTokens(profile.skillBySport[tSport]);
        }
      }
      if (profileSkills.length === 0 && profile && profile.defaultCategory) {
        profileSkills = _validSkillTokens(profile.defaultCategory);
      }
      var profileSkill = profileSkills.length > 0 ? profileSkills[0] : null;

      // Skill efetivo: usa atribuição do org se houver, senão cai pro perfil
      var effectiveSkills = assignedSkills.length > 0
        ? assignedSkills
        : profileSkills;

      // v1.3.20-beta: missing[] reporta SEMPRE qualquer campo de perfil que
      // está vazio — não só os que o org configurou em t.ageCategories /
      // t.skillCategories. Antes, se o org não tinha categoria de idade
      // explicitamente, ninguém aparecia "faltando data de nascimento" mesmo
      // que 6 inscritos não tivessem nascimento cadastrado. Mesma coisa
      // habilidade. O report é "perfis incompletos" — relativo ao perfil em
      // si, não relativo à config atual do torneio.
      //
      // Para inscritos sem uid (org adicionou manualmente sem vincular conta),
      // não vale enumerar "gênero / idade / habilidade" um por um — todos
      // estão indisponíveis por construção. Mostra mensagem única clara,
      // direcionando o org pra ação correta.
      var missing = [];
      var hasUid = !!uid;
      if (!hasUid) {
        // Chegou aqui = não tem uid no participantObj E rescue por email/
        // displayName falhou. Pode ser bug de enrollment OU manual-add real.
        // Mensagem reflete os dois casos sem assumir.
        missing.push('uid não vinculado (precisa rastrear pelo email/nome — pode ser bug)');
      } else {
        if (!gender) missing.push('gênero');
        if (effectiveSkills.length === 0) missing.push('habilidade');
        if (age == null) missing.push('data de nascimento');
      }

      return {
        order: idx + 1,                     // ordem de inscrição (1-based)
        name: name,
        email: email,
        uid: uid,
        gender: gender,
        age: age,
        ageBuckets: ageBks,
        assigned: assigned,
        assignedSkills: assignedSkills,
        profileSkill: profileSkill,        // skill auto-declarado no perfil
        effectiveSkills: effectiveSkills,  // skill efetivo (assigned > profile)
        missing: missing,
        hasUid: hasUid,
        resolvedVia: resolvedVia,           // null | 'email' | 'displayName'
        categoryCommAt: (p && p.categoryCommAt) || null,        // v2.3.92: quando a cobrança de perfil foi enviada
        categoryCommFields: (p && p.categoryCommFields) || null,
        // v2.8.62: identidade da dupla (quando esta linha é um membro de dupla expandido)
        _duplaSide: (p && p._duplaSide) || null,
        _duplaIdx: (p && typeof p._duplaIdx === 'number') ? p._duplaIdx : null,
      };
    });
  }

  // ─── Render helpers ──────────────────────────────────────────────────

  function _esc(s) {
    return (typeof window._safeHtml === 'function')
      ? window._safeHtml(String(s == null ? '' : s))
      : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
  }

  function _statPill(label, value, color) {
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;background:rgba(' + color + ',0.12);border:1px solid rgba(' + color + ',0.25);color:rgb(' + color + ');font-weight:600;font-size:0.78rem;">' + _esc(label) + ' <strong>' + value + '</strong></span>';
  }

  function _renderOverview(rows, t) {
    // v1.4.5-beta: habilidade e idade agora quebradas POR GÊNERO — facilita
    // decidir se faremos torneio misto por habilidade ou por faixa etária.
    var totalEnrolled = rows.length;
    var byGender = { Fem: 0, Masc: 0, Misto: 0, sem: 0 };
    var DEFAULT_AGE_CATS = ['40+', '50+', '60+', '70+'];
    var ageCats = (t.ageCategories && t.ageCategories.length > 0) ? t.ageCategories : DEFAULT_AGE_CATS;
    var skillOrder = (t.skillCategories || []).slice();

    // Indexed by gender key → { [skill|age]: count }
    var _gKeys = ['Fem', 'Masc', 'Misto', 'sem'];
    var bySkillG = { Fem: {}, Masc: {}, Misto: {}, sem: {} };
    var byAgeG   = { Fem: {}, Masc: {}, Misto: {}, sem: {} };

    rows.forEach(function (r) {
      var gLabel = _genderLabel(r.gender) || 'sem';
      if (byGender[gLabel] != null) byGender[gLabel]++; else byGender.sem++;

      // Skill by gender
      if (r.effectiveSkills && r.effectiveSkills.length > 0) {
        r.effectiveSkills.forEach(function (s) {
          bySkillG[gLabel][s] = (bySkillG[gLabel][s] || 0) + 1;
        });
      } else {
        bySkillG[gLabel].sem = (bySkillG[gLabel].sem || 0) + 1;
      }

      // Age by gender
      var bks = (r.age != null) ? _ageBuckets(r.age, ageCats) : [];
      if (bks.length > 0) {
        bks.forEach(function (a) {
          byAgeG[gLabel][a] = (byAgeG[gLabel][a] || 0) + 1;
        });
      } else {
        byAgeG[gLabel].sem = (byAgeG[gLabel].sem || 0) + 1;
      }
    });

    // Gender config for sub-row rendering
    var _gCfg = [
      { key: 'Fem',   label: '♀ Fem',  color: '236,72,153' },
      { key: 'Masc',  label: '♂ Masc', color: '59,130,246' },
      { key: 'Misto', label: '⚥ Misto', color: '168,85,247' },
      // v2.3.53: rótulo explícito "Sem gên." (antes era só "?") — a linha do
      // grupo sem gênero ficava colada na do Masc e parecia parte dele, levando
      // a somar "5 (Masc s/hab) + 2 (sem gênero s/hab)" como se fossem 7 Masc.
      // São grupos de gênero distintos: os 2 não têm gênero no perfil.
      { key: 'sem',   label: '? Sem gên.', color: '148,163,184' },
    ];

    // Render one "by-gender" breakdown block (skill or age)
    function _renderByGenderBlock(title, getKeys, sortFn, pillColor, semLabel) {
      var hasAny = _gKeys.some(function (g) {
        var d = (title === 'habilidade' ? bySkillG : byAgeG)[g];
        return Object.keys(d).some(function (k) { return d[k] > 0; });
      });
      if (!hasAny) return '';
      var out = '<div style="margin-bottom:10px;">';
      out += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Por ' + title + '</div>';
      out += '<div style="display:flex;flex-direction:column;gap:6px;">';
      _gCfg.forEach(function (gc) {
        var d = (title === 'habilidade' ? bySkillG : byAgeG)[gc.key];
        var keys = getKeys(d);
        sortFn(keys);
        var hasSem = d.sem > 0;
        if (keys.length === 0 && !hasSem) return;
        out += '<div style="display:flex;align-items:flex-start;gap:8px;">';
        out += '<span style="font-size:0.68rem;font-weight:700;color:rgb(' + gc.color + ');min-width:40px;padding-top:3px;flex-shrink:0;white-space:nowrap;">' + gc.label + '</span>';
        out += '<div style="display:flex;flex-wrap:wrap;gap:5px;">';
        keys.forEach(function (k) { if (d[k] > 0) out += _statPill(k, d[k], pillColor); });
        if (hasSem) out += _statPill(semLabel, d.sem, '148,163,184');
        out += '</div></div>';
      });
      out += '</div></div>';
      return out;
    }

    var html = '<div style="background:rgba(168,85,247,0.06); border:1px solid rgba(168,85,247,0.18); border-radius:12px; padding:14px 16px; margin-bottom:14px;">';
    html += '<p style="margin:0 0 10px;font-size:0.74rem;color:#a855f7;font-weight:700;text-transform:uppercase;letter-spacing:1px;">📊 Visão Geral</p>';
    html += '<div style="font-size:0.95rem;color:var(--text-bright);font-weight:700;margin-bottom:8px;">' + totalEnrolled + ' inscrito' + (totalEnrolled === 1 ? '' : 's') + '</div>';

    // Gender row (totals)
    html += '<div style="margin-bottom:10px;"><div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Por gênero</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    if (byGender.Fem > 0)  html += _statPill('♀ Fem',     byGender.Fem,  '236,72,153');
    if (byGender.Masc > 0) html += _statPill('♂ Masc',    byGender.Masc, '59,130,246');
    if (byGender.Misto > 0) html += _statPill('⚥ Misto',  byGender.Misto,'168,85,247');
    if (byGender.sem > 0)  html += _statPill('? Sem gênero', byGender.sem, '148,163,184');
    html += '</div></div>';

    // Skill rows broken down by gender
    html += _renderByGenderBlock(
      'habilidade',
      function (d) { return Object.keys(d).filter(function (k) { return k !== 'sem' && d[k] > 0; }); },
      function (keys) {
        keys.sort(function (a, b) {
          var ai = skillOrder.indexOf(a), bi = skillOrder.indexOf(b);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1; if (bi !== -1) return 1;
          return a.localeCompare(b);
        });
      },
      '99,102,241',
      '? s/hab.'
    );

    // Age rows broken down by gender
    html += _renderByGenderBlock(
      'idade',
      function (d) { return Object.keys(d).filter(function (k) { return k !== 'sem' && d[k] > 0; }); },
      function (keys) { keys.sort(function (a, b) { return (parseInt(a) || 0) - (parseInt(b) || 0); }); },
      '245,158,11',
      '? s/nasc.'
    );

    html += '</div>';
    return html;
  }

  function _renderCategoryTable(rows, t) {
    // v1.3.2-beta: derivar categorias dos inscritos quando o organizador
    // não configurou. Lógica: se t tem combinedCategories + ageCategories,
    // usa. Senão, deriva do que aparece nos perfis (gender × skill,
    // gender × age).
    var combined = (t.combinedCategories || []).slice();
    var ageCats = (t.ageCategories || []).slice();
    var genders = (t.genderCategories || []).slice();
    var genderLabels = { fem: 'Fem', masc: 'Masc', misto_aleatorio: 'Misto', misto_obrigatorio: 'Misto' };
    var hasOrgConfig = combined.length > 0 || ageCats.length > 0 || genders.length > 0;

    // Quando NÃO há configuração, derivar das presenças reais
    var derivedSource = false;
    if (!hasOrgConfig) {
      derivedSource = true;
      // Coletar gêneros únicos vistos nos perfis
      var seenGenders = {};
      var seenSkills = {};
      var seenAges = {};
      var DEFAULT_AGE_BUCKETS = ['40+', '50+', '60+', '70+'];
      rows.forEach(function (r) {
        var gLabel = _genderLabel(r.gender);
        if (gLabel) seenGenders[gLabel] = 1;
        (r.effectiveSkills || []).forEach(function (s) { seenSkills[s] = 1; });
        if (r.age != null) {
          _ageBuckets(r.age, DEFAULT_AGE_BUCKETS).forEach(function (a) { seenAges[a] = 1; });
        }
      });
      // Sintetizar combined cats (gender × skill) e age cats
      var gKeys = Object.keys(seenGenders);
      var sKeys = Object.keys(seenSkills);
      var aKeys = Object.keys(seenAges).sort(function (a, b) { return (parseInt(a) || 0) - (parseInt(b) || 0); });

      if (gKeys.length > 0 && sKeys.length > 0) {
        gKeys.forEach(function (g) {
          sKeys.forEach(function (s) { combined.push(g + ' ' + s); });
        });
      } else if (gKeys.length > 0) {
        combined = gKeys.slice();
      } else if (sKeys.length > 0) {
        combined = sKeys.slice();
      }
      ageCats = aKeys;
      // Genders pra cross com age
      genders = gKeys.slice(); // já em formato display ('Fem', 'Masc', 'Misto')
    }

    // Age × gender
    var ageCombined = [];
    if (ageCats.length > 0) {
      if (genders.length > 0) {
        // Use unique gender labels (Misto Aleat./Obrig. → Misto)
        var seen = {};
        genders.forEach(function (g) {
          var lbl = genderLabels[g] || g; // se já tá em display label, mantém
          if (!seen[lbl]) { seen[lbl] = 1; }
        });
        Object.keys(seen).forEach(function (lbl) {
          ageCats.forEach(function (a) { ageCombined.push(lbl + ' ' + a); });
        });
      } else {
        ageCombined = ageCats.slice();
      }
    }

    // Display name simplification (Misto Aleat./Obrig. → Misto)
    var dn = (typeof window._displayCategoryName === 'function') ? window._displayCategoryName : function (c) { return c; };

    // Count for each cat
    function countFor(cat) {
      var d = _decomposeCat(cat, t);
      if (d.age) {
        // Age-based cat: count rows whose age fits d.age bucket AND gender matches d.gender (if any).
        // Use bucket against DEFAULT cats too (so derived ageCats work even when t.ageCategories empty).
        var DEFAULT_AGE = ['40+', '50+', '60+', '70+'];
        var ageCheckCats = (t.ageCategories && t.ageCategories.length > 0) ? t.ageCategories : DEFAULT_AGE;
        return rows.filter(function (r) {
          var bks = (r.age != null) ? _ageBuckets(r.age, ageCheckCats) : [];
          if (bks.indexOf(d.age) === -1) return false;
          if (d.gender) {
            var rGen = _genderLabel(r.gender) || '';
            if (rGen !== d.gender) return false;
          }
          return true;
        }).length;
      }
      // Skill-based cat: count rows whose effectiveSkills (assigned > profile.defaultCategory)
      // include d.skill AND gender matches d.gender (if any).
      // Fallback: legacy match against r.assigned[] (for cats without skill component).
      if (d.skill) {
        return rows.filter(function (r) {
          if ((r.effectiveSkills || []).indexOf(d.skill) === -1) return false;
          if (d.gender) {
            var rGen2 = _genderLabel(r.gender) || '';
            if (rGen2 !== d.gender) return false;
          }
          return true;
        }).length;
      }
      // Legacy / gender-only cat: count by display match in assigned[] OR by gender alone
      var displayCat = dn(cat);
      return rows.filter(function (r) {
        var assignedDisplay = r.assigned.map(dn);
        if (assignedDisplay.indexOf(displayCat) !== -1) return true;
        // Also match if cat is just a gender label and r.gender resolves to it
        var rGen3 = _genderLabel(r.gender) || '';
        return displayCat === rGen3;
      }).length;
    }

    // Bucket by gender for visual grouping (same pattern as _updateCategoryPreview)
    var GENDER_ORDER = ['Fem', 'Masc', 'Misto', '_other'];
    var buckets = { Fem: [], Masc: [], Misto: [], _other: [] };

    function getBucket(displayName) {
      for (var i = 0; i < 3; i++) {
        var p = GENDER_ORDER[i];
        if (displayName === p || displayName.indexOf(p + ' ') === 0) return p;
      }
      return '_other';
    }

    var allCats = combined.concat(ageCombined);
    // Dedup
    var seenCat = {};
    var uniqueCats = [];
    allCats.forEach(function (c) {
      var k = dn(c);
      if (!seenCat[k]) { seenCat[k] = 1; uniqueCats.push(c); }
    });

    uniqueCats.forEach(function (c) {
      var displayC = dn(c);
      buckets[getBucket(displayC)].push({ cat: c, displayCat: displayC, count: countFor(c) });
    });

    if (uniqueCats.length === 0) {
      return '<div style="background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.18); border-radius:12px; padding:14px 16px; margin-bottom:14px;">' +
        '<p style="margin:0 0 8px;font-size:0.74rem;color:#818cf8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">📋 Distribuição por Categoria</p>' +
        '<p style="font-size:0.85rem;color:var(--text-muted);margin:0;">Sem categorias configuradas e sem dados suficientes nos perfis dos inscritos pra derivar categorias automaticamente.</p>' +
        '</div>';
    }

    var html = '<div style="background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.18); border-radius:12px; padding:14px 16px; margin-bottom:14px;">';
    html += '<p style="margin:0 0 4px;font-size:0.74rem;color:#818cf8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">📋 Distribuição por Categoria' + (derivedSource ? ' <span style="color:var(--text-muted);font-weight:500;text-transform:none;letter-spacing:0;font-size:0.66rem;">(sugeridas pelos perfis)</span>' : '') + '</p>';
    var subtxt = derivedSource
      ? 'Categorias derivadas automaticamente dos perfis dos inscritos (gênero × habilidade do perfil + idade computada da data de nascimento). Configure manualmente em ✏️ Editar → Categorias do Torneio se quiser fixar quais valem.'
      : 'Cada linha = 1 categoria, no formato do torneio (' + _esc(String(t.format || '—')) + '). O tempo é orientativo (' + (parseInt(t.gameDuration) || 30) + 'min/partida, ' + Math.max(parseInt(t.courtCount) || 1, 1) + ' quadra' + ((Math.max(parseInt(t.courtCount) || 1, 1) > 1) ? 's' : '') + ')' + ((typeof window._isLigaFormat === 'function' && window._isLigaFormat(t)) ? ' — na Liga, é por rodada' : '') + '. Inscritos podem aparecer em mais de uma categoria.';
    html += '<p style="font-size:0.7rem;color:var(--text-muted);margin:0 0 10px;">' + subtxt + '</p>';

    // Render bucket-by-bucket
    GENDER_ORDER.forEach(function (b) {
      var items = buckets[b];
      if (items.length === 0) return;
      // Header
      var bLabel = (b === '_other') ? 'Sem gênero' : b;
      html += '<div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">' + _esc(bLabel) + '</div>';
      // Items
      items.forEach(function (it) {
        var sugg = _suggestForCount(it.count, t);
        var bgColor = sugg.color || '#64748b';
        html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-top:4px;flex-wrap:wrap;">';
        // Cat name + count
        html += '<div style="display:flex;align-items:center;gap:8px;min-width:140px;flex:0 0 auto;">';
        html += '<span style="padding:3px 10px;background:rgba(' + (b === 'Misto' ? '168,85,247' : (b === 'Fem' ? '236,72,153' : (b === 'Masc' ? '59,130,246' : '148,163,184'))) + ',0.15);border:1px solid rgba(' + (b === 'Misto' ? '168,85,247' : (b === 'Fem' ? '236,72,153' : (b === 'Masc' ? '59,130,246' : '148,163,184'))) + ',0.30);border-radius:6px;font-size:0.78rem;color:var(--text-bright);font-weight:600;">' + _esc(it.displayCat) + '</span>';
        html += '<span style="font-size:0.92rem;font-weight:700;color:var(--text-bright);">' + it.count + '</span>';
        html += '<span style="font-size:0.7rem;color:var(--text-muted);">inscrito' + (it.count === 1 ? '' : 's') + '</span>';
        html += '</div>';
        // Format suggestion
        html += '<div style="flex:1;min-width:180px;font-size:0.78rem;color:' + bgColor + ';font-weight:600;">' + _esc(sugg.format) + '</div>';
        // Duration
        html += '<div style="font-size:0.78rem;color:var(--text-bright);font-weight:700;flex:0 0 auto;">' + (sugg.matches > 0 ? '⏱ ' + _fmtDuration(sugg.durationMin) + (sugg.perRound ? '/rodada' : '') : '—') + '</div>';
        html += '</div>';
        if (sugg.desc) {
          html += '<div style="font-size:0.7rem;color:var(--text-muted);margin:2px 0 0 12px;font-style:italic;">' + _esc(sugg.desc) + '</div>';
        }
      });
    });

    html += '</div>';
    return html;
  }


  // v1.3.9-beta: Análise de Inscritos é page-route (#analise/<tId>) — não
  // mais modal-overlay full-screen. Topbar fica visível (logo + nav +
  // hamburger). Padrão centralizado igual a #profile, #support, #privacy.
  // Compat: _openEnrollmentReport agora navega pra hash. _closeEnrollmentReport
  // navega pro #dashboard (preservando call-sites que esperam fechamento).

  function _closeReport() {
    if (window.location.hash.indexOf('#analise/') === 0) {
      window.location.hash = '#dashboard';
    }
  }
  window._closeEnrollmentReport = _closeReport;

  function _renderDiagnostic(t, rows, profileMap, parts, resolvedFor) {
    resolvedFor = resolvedFor || {};
    // v1.3.2-beta: bloco diagnóstico pro organizador entender por que algum
    // inscrito não tá sendo categorizado. Mostra dados crus do torneio +
    // dados crus por inscrito (uid, profile fetched, gender resolvido,
    // age, effectiveSkills, missing). Só visível quando expandido.
    var html = '<details style="background:rgba(148,163,184,0.04);border:1px solid rgba(148,163,184,0.15);border-radius:10px;padding:8px 12px;margin-top:14px;font-size:0.72rem;color:var(--text-muted);">';
    html += '<summary style="cursor:pointer;font-weight:600;user-select:none;">🔧 Diagnóstico (dados crus do torneio + perfis)</summary>';
    html += '<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">';
    html += '<div><b>Torneio.id:</b> <code>' + _esc(t.id) + '</code></div>';
    html += '<div><b>genderCategories:</b> <code>' + _esc(JSON.stringify(t.genderCategories || [])) + '</code></div>';
    html += '<div><b>skillCategories:</b> <code>' + _esc(JSON.stringify(t.skillCategories || [])) + '</code></div>';
    html += '<div><b>ageCategories:</b> <code>' + _esc(JSON.stringify(t.ageCategories || [])) + '</code></div>';
    html += '<div><b>combinedCategories:</b> <code>' + _esc(JSON.stringify(t.combinedCategories || [])) + '</code></div>';
    var profileKeys = profileMap ? Object.keys(profileMap) : [];
    html += '<div><b>Profiles fetched:</b> ' + profileKeys.length + ' / ' + parts.filter(function (p) { return p && p.uid; }).length + ' uids</div>';
    html += '<hr style="border:none;border-top:1px solid rgba(148,163,184,0.15);margin:6px 0;">';
    html += '<div style="font-weight:600;color:var(--text-bright);">Por inscrito:</div>';
    rows.forEach(function (r, i) {
      html += '<div style="padding:6px 8px;background:rgba(0,0,0,0.15);border-radius:6px;font-family:monospace;font-size:0.68rem;line-height:1.4;">';
      html += '<div><b>#' + (i + 1) + ' ' + _esc(r.name) + '</b></div>';
      // v1.3.24-beta: indica se uid veio direto do participantObj ou foi
      // resgatado via email/displayName lookup. Resgate = bug de enrollment
      // que perdeu uid mas a pessoa tem perfil real.
      var uidSource = '';
      if (r.resolvedVia === 'email') {
        uidSource = ' <span style="color:#22d3ee;font-weight:600;">⚙ resgatado via email lookup</span>';
      } else if (r.resolvedVia === 'displayName') {
        uidSource = ' <span style="color:#22d3ee;font-weight:600;">⚙ resgatado via displayName lookup</span>';
      }
      html += '<div>uid: <code>' + _esc(r.uid || '(sem uid)') + '</code>' + uidSource + '</div>';
      var p = parts[i];
      // v1.3.20-beta: mostra email + displayName + selfEnrolled — assim o
      // org distingue inscrição manual (sem email/uid) de auto-enroll que
      // perdeu o uid por algum motivo (raro).
      html += '<div>participantObj: name=<code>' + _esc((p && (p.displayName || p.name)) || '—') + '</code> email=<code>' + _esc((p && p.email) || '—') + '</code> selfEnrolled=<code>' + _esc((p && p.selfEnrolled) ? 'true' : 'false') + '</code></div>';
      html += '<div>participantObj: gender=<code>' + _esc((p && p.gender) || '—') + '</code> categories=<code>' + _esc(JSON.stringify((p && p.categories) || [])) + '</code></div>';
      var prof = r.uid ? profileMap[r.uid] : null;
      if (prof) {
        var skillMapStr = (prof.skillBySport && typeof prof.skillBySport === 'object')
          ? JSON.stringify(prof.skillBySport)
          : '—';
        html += '<div>profile: gender=<code>' + _esc(prof.gender || '—') + '</code> birthDate=<code>' + _esc(prof.birthDate || '—') + '</code> defaultCategory=<code>' + _esc(prof.defaultCategory || '—') + '</code></div>';
        html += '<div>profile.skillBySport: <code>' + _esc(skillMapStr) + '</code></div>';
        // v1.3.22-beta: timestamps + terms — distingue perfil alpha-leftover
        // (createdAt antes de 2026-04-29 OU acceptedTerms !== true) de
        // novato beta. Beta começou em 2026-04-29 com reset; users foram
        // preservados, então perfis alpha que nunca atualizaram pra fields
        // novos (gender/birthDate/skillBySport) ficam stale em torneios beta.
        var betaCutoff = '2026-04-29';
        var createdAt = prof.createdAt || '';
        var isPreBeta = createdAt && createdAt < betaCutoff;
        var noTerms = prof.acceptedTerms !== true;
        var stragglerFlag = '';
        if (isPreBeta && noTerms) {
          stragglerFlag = ' <span style="color:#fbbf24;font-weight:600;">🕰️ alpha-leftover (pre-beta + sem aceite)</span>';
        } else if (isPreBeta) {
          stragglerFlag = ' <span style="color:#fbbf24;font-weight:600;">🕰️ pré-beta (perfil pode estar stale)</span>';
        } else if (noTerms) {
          stragglerFlag = ' <span style="color:#fbbf24;font-weight:600;">⚠️ sem aceite de termos</span>';
        }
        html += '<div>profile.meta: createdAt=<code>' + _esc(createdAt || '—') + '</code> acceptedTerms=<code>' + _esc(prof.acceptedTerms === true ? 'true' : 'false') + '</code> acceptedTermsAt=<code>' + _esc(prof.acceptedTermsAt || '—') + '</code>' + stragglerFlag + '</div>';
      } else {
        html += '<div style="color:#f87171;">profile: NÃO carregado (uid não bate, doc não existe, ou rules block)</div>';
      }
      html += '<div>resolvido: gender=<code>' + _esc(r.gender || '—') + '</code> age=<code>' + _esc(r.age != null ? r.age : '—') + '</code> effectiveSkills=<code>' + _esc(JSON.stringify(r.effectiveSkills || [])) + '</code></div>';
      html += '<div>missing: <code>' + _esc(JSON.stringify(r.missing)) + '</code></div>';
      html += '</div>';
    });
    html += '</div>';
    html += '</details>';
    return html;
  }

  // ─── v2.3.78: Lista de inscritos com busca + sort + filtros ──────────
  // Estado vivo (rows + torneio atual) usado pelo re-render client-side dos
  // filtros/sort/busca. Setado em _renderPage; lido por _erRenderInscritos.
  var _liveState = null;
  // v2.4.34: mudanças staged (gênero/categoria) por order, aplicadas só no "Salvar".
  var _pendingEdits = {};

  function _norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function _inscritoItemHtml(r) {
    var isOrg = !!(_liveState && _liveState.isOrg);
    // v2.4.34: edição em LOTE — o <select> só MARCA a mudança (staged em
    // _pendingEdits); nada é gravado/re-renderizado até o organizador clicar em
    // "Salvar alterações". Por isso o <select> mostra o valor STAGED se houver.
    var pe = _pendingEdits[r.order] || null;
    var gMap = { Fem: { l: '♀ Fem', c: '236,72,153' }, Masc: { l: '♂ Masc', c: '59,130,246' }, Misto: { l: '⚥ Misto', c: '168,85,247' } };
    var gl = _genderLabel(r.gender);
    var rowGVal = gl === 'Fem' ? 'feminino' : (gl === 'Masc' ? 'masculino' : (gl === 'Misto' ? 'misto' : ''));
    var curG = (pe && 'gender' in pe) ? pe.gender : rowGVal;
    var gBadge;
    if (isOrg) {
      var glCur = curG === 'feminino' ? 'Fem' : (curG === 'masculino' ? 'Masc' : (curG === 'misto' ? 'Misto' : null));
      var gc = (glCur && gMap[glCur]) ? gMap[glCur].c : '148,163,184';
      var gOpt = function (v, lbl) { return '<option value="' + v + '"' + (curG === v ? ' selected' : '') + '>' + lbl + '</option>'; };
      gBadge = '<select title="Editar gênero do inscrito" onchange="window._erStageGender(' + r.order + ',this.value)" ' +
        'style="font-size:0.68rem;font-weight:700;color:rgb(' + gc + ');background:rgba(' + gc + ',0.14);border:1px solid rgba(' + gc + ',0.35);border-radius:6px;padding:2px 6px;cursor:pointer;-webkit-appearance:none;appearance:none;">' +
        gOpt('', '? Sem gên. ✎') + gOpt('feminino', '♀ Fem') + gOpt('masculino', '♂ Masc') + gOpt('misto', '⚥ Misto') +
        '</select>';
    } else {
      gBadge = (gl && gMap[gl])
        ? '<span style="font-size:0.68rem;font-weight:700;color:rgb(' + gMap[gl].c + ');background:rgba(' + gMap[gl].c + ',0.14);border-radius:6px;padding:2px 7px;">' + gMap[gl].l + '</span>'
        : '<span style="font-size:0.68rem;font-weight:600;color:#94a3b8;background:rgba(148,163,184,0.12);border-radius:6px;padding:2px 7px;">? Sem gên.</span>';
    }
    var _catsList = (isOrg && typeof window._getTournamentCategories === 'function' && _liveState && _liveState.t)
      ? (window._getTournamentCategories(_liveState.t) || []) : [];
    var rowCat = (r.assigned && r.assigned.length > 0) ? r.assigned[0] : '';
    var curCat = (pe && 'category' in pe) ? pe.category : rowCat;
    // v2.8.63: categoria por inscrito SÓ aparece quando há 2+ categorias. Em torneio de
    // categoria única (ex.: só Misto) não há o que escolher — esconde o seletor/badge
    // (mesmo princípio da seção de categorias, v2.8.55). Gênero continua (importa pra
    // análise mesmo em Misto).
    var skills = '';
    if (_catsList.length > 1) {
      if (isOrg) {
        var cOpt = function (v, lbl) { return '<option value="' + _esc(v) + '"' + (curCat === v ? ' selected' : '') + '>' + _esc(lbl) + '</option>'; };
        skills = '<select title="Editar categoria do inscrito" onchange="window._erStageCategory(' + r.order + ',this.value)" ' +
          'style="font-size:0.68rem;font-weight:700;color:#a5b4fc;background:rgba(99,102,241,0.14);border:1px solid rgba(99,102,241,0.35);border-radius:6px;padding:2px 6px;cursor:pointer;-webkit-appearance:none;appearance:none;">' +
          cOpt('', 'sem categoria ✎') +
          _catsList.map(function (c) { return cOpt(c, (window._displayCategoryName ? window._displayCategoryName(c) : c)); }).join('') +
          '</select>';
      } else {
        skills = (r.effectiveSkills && r.effectiveSkills.length > 0)
          ? r.effectiveSkills.map(function (s) { return '<span style="font-size:0.68rem;font-weight:700;color:#a5b4fc;background:rgba(99,102,241,0.14);border-radius:6px;padding:2px 7px;">' + _esc(s) + '</span>'; }).join('')
          : '<span style="font-size:0.68rem;color:#94a3b8;background:rgba(148,163,184,0.12);border-radius:6px;padding:2px 7px;">sem hab.</span>';
      }
    }
    // v2.8.63: categoria única (skills vazio) → reserva o espaço do seletor de categoria
    // com um placeholder INVISÍVEL, pra TODOS os cards terem a mesma altura (como se o
    // espaço da categoria estivesse preservado).
    if (!skills) skills = '<select aria-hidden="true" disabled tabindex="-1" style="font-size:0.68rem;font-weight:700;padding:2px 6px;border:1px solid transparent;border-radius:6px;-webkit-appearance:none;appearance:none;visibility:hidden;"><option>sem categoria</option></select>';
    // v2.4.33: mostra a CATEGORIA por idade que a pessoa entraria (ex.: "50+"),
    // nunca a idade real (privacidade). Sem categoria de idade no torneio → nada.
    var ageBadge = (r.ageBuckets && r.ageBuckets.length > 0)
      ? '<span style="font-size:0.68rem;font-weight:700;color:#fbbf24;background:rgba(245,158,11,0.12);border-radius:6px;padding:2px 7px;">' + _esc(r.ageBuckets[0]) + '</span>'
      : '';
    var _mod = !!(pe && Object.keys(pe).length > 0); // card com mudança não-salva
    var _cBorder = _mod ? '1px solid rgba(245,158,11,0.6)' : '1px solid rgba(255,255,255,0.08)';
    var _cBg = _mod ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.02)';
    var _modDot = _mod ? '<span title="alteração não salva" style="color:#fbbf24;font-size:0.9rem;line-height:1;flex-shrink:0;">●</span>' : '';
    return '<div style="padding:8px 10px;border:' + _cBorder + ';border-radius:10px;background:' + _cBg + ';">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:0.72rem;font-weight:700;color:var(--text-muted);min-width:24px;flex-shrink:0;">#' + r.order + '</span>' +
        '<span style="flex:1;min-width:0;font-size:0.84rem;font-weight:600;color:var(--text-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(r.name) + '</span>' + _modDot +
      '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;padding-left:32px;">' + gBadge + skills + ageBadge + '</div>' +
    '</div>';
  }

  // v2.4.34: EDIÇÃO EM LOTE. Os <select> de gênero/categoria só STAGE a mudança
  // em _pendingEdits — nada grava nem re-renderiza. O organizador corrige vários
  // e clica "Salvar alterações": aí sim grava na ficha do inscrito (sorteio usa)
  // E manda gênero+habilidade pro PERFIL dos jogadores com conta (Cloud Function).
  function _erFindParticipant(parts, row, order) {
    var p = null;
    if (row) {
      for (var i = 0; i < parts.length; i++) {
        var cp = parts[i]; if (!cp || typeof cp !== 'object') continue;
        if ((row.uid && cp.uid === row.uid) ||
            (row.email && (cp.email || '').toLowerCase() === String(row.email).toLowerCase()) ||
            (row.name && (cp.displayName || cp.name) === row.name)) { p = cp; break; }
      }
    }
    if (!p) p = parts[order - 1];
    return (p && typeof p === 'object') ? p : null;
  }

  window._erStageGender = function (order, val) {
    if (!_liveState || !_liveState.isOrg) return;
    if (!_pendingEdits[order]) _pendingEdits[order] = {};
    _pendingEdits[order].gender = val;
    _erMarkCardModified(order);
    window._erUpdateSaveBar();
  };
  window._erStageCategory = function (order, val) {
    if (!_liveState || !_liveState.isOrg) return;
    if (!_pendingEdits[order]) _pendingEdits[order] = {};
    _pendingEdits[order].category = val;
    _erMarkCardModified(order);
    window._erUpdateSaveBar();
  };

  function _erPendingCount() {
    var n = 0;
    Object.keys(_pendingEdits).forEach(function (k) { var pe = _pendingEdits[k]; if (pe && Object.keys(pe).length > 0) n++; });
    return n;
  }
  window._erUpdateSaveBar = function () {
    var bar = document.getElementById('er-save-bar');
    var btn = document.getElementById('er-save-btn');
    if (!bar || !btn) return;
    var n = _erPendingCount();
    if (n > 0) { bar.style.display = ''; btn.disabled = false; btn.textContent = '💾 Salvar alterações (' + n + ')'; }
    else { bar.style.display = 'none'; btn.disabled = true; btn.textContent = '💾 Salvar alterações'; }
  };
  // Realça o card editado sem re-render da lista (o ● aparece só no próximo render).
  function _erMarkCardModified(order) {
    try {
      var sel = document.querySelector('[onchange*="_erStageGender(' + order + ',"]');
      var card = sel; while (card && !(card.parentElement && card.parentElement.id === 'er-inscritos-list')) card = card.parentElement;
      if (card) { card.style.border = '1px solid rgba(245,158,11,0.6)'; card.style.background = 'rgba(245,158,11,0.07)'; }
    } catch (e) {}
  }

  // Aplica TODAS as mudanças staged de uma vez.
  window._erSaveEdits = function (tId, sport) {
    if (!_liveState || !_liveState.isOrg) return;
    var t = window.AppStore && window.AppStore.tournaments
      ? window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); }) : null;
    if (!t) return;
    var parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
    var validCats = (typeof window._getTournamentCategories === 'function') ? (window._getTournamentCategories(t) || []) : [];
    var rows = _liveState.rows || [];
    var profileAssignments = [];
    Object.keys(_pendingEdits).forEach(function (orderKey) {
      var pe = _pendingEdits[orderKey]; if (!pe || Object.keys(pe).length === 0) return;
      var order = parseInt(orderKey, 10);
      var row = rows.filter(function (r) { return r.order === order; })[0];
      // v2.8.62: linha de MEMBRO de dupla → o alvo é o DOC da dupla (parts[_duplaIdx])
      // e o gênero é gravado per-membro (p1Gender/p2Gender). Antes _erFindParticipant
      // não achava o membro em t.participants (ele é p1/p2 dentro da dupla) e o gênero
      // "não gravava". Categoria continua no doc da dupla (o time tem 1 categoria).
      var isDuplaMember = !!(row && row._duplaSide && typeof row._duplaIdx === 'number' && parts[row._duplaIdx] && typeof parts[row._duplaIdx] === 'object');
      var p = isDuplaMember ? parts[row._duplaIdx] : _erFindParticipant(parts, row, order);
      if (!p) return;
      var asg = {};
      if ('gender' in pe) {
        var gv = (pe.gender === 'feminino' || pe.gender === 'masculino' || pe.gender === 'misto') ? pe.gender : '';
        if (isDuplaMember) {
          if (gv) p[row._duplaSide + 'Gender'] = gv; else delete p[row._duplaSide + 'Gender'];
        } else {
          if (gv) { p.gender = gv; p.genderSource = 'organizador'; } else { delete p.gender; delete p.genderSource; }
        }
        if (row) row.gender = gv || null;
        if (gv === 'feminino' || gv === 'masculino') asg.gender = gv; // CF só aceita masc/fem/outro
      }
      if ('category' in pe) {
        var cv = pe.category;
        if (cv && validCats.indexOf(cv) !== -1) {
          if (typeof window._setParticipantCategories === 'function') window._setParticipantCategories(p, [cv]);
          else { p.categories = [cv]; p.category = cv; }
          p.categorySource = 'organizador'; delete p.wasUncategorized; delete p.autoWeakestCat; delete p.staleCat;
          var d = _decomposeCat(cv, t);
          if (row) { row.assigned = [cv]; row.effectiveSkills = (d && d.skill) ? [d.skill] : (row.profileSkill ? [row.profileSkill] : []); }
          if (d && d.skill) asg.category = d.skill; // o perfil guarda a HABILIDADE
        } else if (!cv) {
          if (typeof window._setParticipantCategories === 'function') window._setParticipantCategories(p, []);
          else { p.categories = []; p.category = ''; }
          if (['organizador', 'auto_fraca', 'perfil'].indexOf(p.categorySource) !== -1) delete p.categorySource;
          delete p.autoWeakestCat; delete p.wasUncategorized;
          if (row) { row.assigned = []; row.effectiveSkills = row.profileSkill ? [row.profileSkill] : []; }
        }
      }
      // v2.8.62: pro membro de dupla, o perfil a atualizar é o do MEMBRO (row.uid),
      // não o do doc da dupla.
      var _asgUid = (isDuplaMember && row && row.uid) ? row.uid : p.uid;
      if (_asgUid && (asg.gender || asg.category)) { asg.uid = _asgUid; profileAssignments.push(asg); }
    });
    var nEdits = _erPendingCount();
    // grava a ficha do torneio (sorteio + inscritos sem conta)
    try { if (window.FirestoreDB && window.FirestoreDB.saveTournament) { if (!Array.isArray(t.participants)) t.participants = parts; window.FirestoreDB.saveTournament(t); } } catch (e) {}
    _pendingEdits = {};
    var btn = document.getElementById('er-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    var finish = function (extra) {
      window._erUpdateSaveBar();
      if (typeof window._erRenderInscritos === 'function') window._erRenderInscritos();
      if (typeof showNotification === 'function') showNotification('✅ Alterações salvas', nEdits + ' inscrito(s) atualizado(s).' + (extra ? ' ' + extra : ''), 'success');
    };
    if (profileAssignments.length > 0 && window.firebase && firebase.functions) {
      firebase.functions().httpsCallable('setParticipantsProfile')({ tournamentId: String(tId), sport: String(sport || ''), assignments: profileAssignments })
        .then(function (res) { var r = (res && res.data) || {}; finish('Perfis: ' + (r.written || 0) + ' atualizado(s).'); })
        .catch(function (err) { finish('(perfis não gravados: ' + ((err && err.message) || 'falha') + ')'); });
    } else {
      finish('');
    }
  };

  // Re-renderiza só a lista conforme busca/sort/filtros — sem refetch nem
  // re-render da página. Chamado por oninput/onchange dos controles.
  window._erRenderInscritos = function () {
    if (!_liveState) return;
    var rows = _liveState.rows || [];
    var listEl = document.getElementById('er-inscritos-list');
    if (!listEl) return;
    var gv = function (id, d) { var e = document.getElementById(id); return e ? e.value : d; };
    var q = _norm(gv('er-search', ''));
    var sort = gv('er-sort', 'order-asc');
    var gf = gv('er-gender', 'all');
    var sf = gv('er-skill', 'all');

    var filtered = rows.filter(function (r) {
      if (q && _norm(r.name).indexOf(q) === -1 && _norm(r.email).indexOf(q) === -1) return false;
      if (gf !== 'all') {
        var gl = _genderLabel(r.gender);
        if (gf === 'none') { if (gl) return false; }
        else if (gl !== gf) return false;
      }
      if (sf !== 'all') {
        var sk = r.effectiveSkills || [];
        if (sf === 'none') { if (sk.length > 0) return false; }
        else if (sk.indexOf(sf) === -1) return false;
      }
      return true;
    });

    filtered.sort(function (a, b) {
      if (sort === 'order-asc') return a.order - b.order;
      if (sort === 'order-desc') return b.order - a.order;
      var an = _norm(a.name), bn = _norm(b.name);
      if (sort === 'name-asc') return an < bn ? -1 : an > bn ? 1 : a.order - b.order;
      if (sort === 'name-desc') return an > bn ? -1 : an < bn ? 1 : a.order - b.order;
      return 0;
    });

    var countEl = document.getElementById('er-inscritos-count');
    if (countEl) countEl.textContent = (filtered.length === rows.length)
      ? '(' + rows.length + ')'
      : '(' + filtered.length + ' de ' + rows.length + ')';

    listEl.innerHTML = filtered.length
      ? filtered.map(_inscritoItemHtml).join('')
      : '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:0.8rem;">Nenhum inscrito com esses filtros.</div>';
    window._erUpdateSaveBar(); // mantém o botão Salvar coerente após filtrar/ordenar
  };

  function _renderInscritosList(rows, t) {
    if (!rows || rows.length === 0) return '';
    // v2.6.108: barra canônica compartilhada (window._inscritosFilterBar em store.js).
    // Esta é a referência; a tela de Inscritos (#participants) usa a MESMA função.
    var _isOrgList = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));
    var _tIdEsc = String(t.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var _sportEsc = String(t.sport || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    // v2.4.34: barra de salvar (só org) — fica oculta até haver alteração staged.
    var saveBar = _isOrgList
      ? '<div id="er-save-bar" style="display:none;margin-top:12px;position:sticky;bottom:8px;">' +
          '<button id="er-save-btn" disabled onclick="window._erSaveEdits(\'' + _tIdEsc + '\',\'' + _sportEsc + '\')" class="btn btn-success hover-lift" style="width:100%;font-weight:800;padding:12px;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;box-shadow:0 4px 14px rgba(16,185,129,0.35);">💾 Salvar alterações</button>' +
          '<p style="font-size:0.66rem;color:var(--text-muted);margin:6px 0 0;text-align:center;">As mudanças vão para o perfil dos jogadores (quem tem conta) e valem no sorteio.</p>' +
        '</div>'
      : '';

    return '<div style="background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.18);border-radius:12px;padding:14px 16px;margin-bottom:14px;">' +
      '<p style="margin:0 0 10px;font-size:0.74rem;color:#818cf8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">📋 Inscritos <span id="er-inscritos-count" style="color:var(--text-muted);font-weight:600;"></span></p>' +
      (_isOrgList ? '<p style="margin:-4px 0 10px;font-size:0.68rem;color:var(--text-muted);">Edite gênero e categoria de quantos quiser e clique em <b>Salvar alterações</b> no fim.</p>' : '') +
      (typeof window._inscritosFilterBar === 'function'
        ? window._inscritosFilterBar({ stateKey: 'enrollReport', searchId: 'er-search', sortId: 'er-sort', genderId: 'er-gender', skillId: 'er-skill', onChange: 'window._erRenderInscritos()', skillCategories: (t.skillCategories || []) })
        : '') +
      '<div id="er-inscritos-list" style="display:flex;flex-direction:column;gap:6px;"></div>' +
      saveBar +
    '</div>';
  }

  // v1.3.9-beta: render no view-container — page-route #analise/<tId>.
  // Topbar fica visível, _renderBackHeader cuida do cabeçalho com hamburger
  // funcional. Padrão centralizado (vide CLAUDE.md "REGRA CRITICA v1.3.5").
  // Seção "Histórico letzplay" — status por inscrito (lê letzplayImport/handle/consent
  // do perfil). Anti-gato do organizador: quem já tem histórico (com categoria OFICIAL),
  // quem autorizou e falta buscar, quem NÃO autorizou (🔴), e quem não informou @.
  // Rank de nível: A=0 (mais forte) … D=3, FUN=4. Extrai o token de nível mais
  // FORTE de uma ou mais strings de categoria do letzplay (ex.: "Social Masc D+ / C-"
  // → C=2). Só pega letra A-D como token (precedida de espaço/barra/início e seguida
  // de +/-/espaço/barra/fim), pra não casar letras dentro de "Social", "Masc" etc.
  var _SKILL_RANK = { A: 0, B: 1, C: 2, D: 3, FUN: 4, F: 4, OPEN: 4 };
  function _lzRankFrom(catStrs) {
    var ranks = [];
    (catStrs || []).forEach(function (cs) {
      var s = ' ' + String(cs || '').toUpperCase() + ' ';
      if (/\bFUN\b|\bOPEN\b/.test(s)) ranks.push(4);
      var re = /[\s\/]([A-D])[+\-]?(?=[\s\/])/g, m;
      while ((m = re.exec(s))) ranks.push(_SKILL_RANK[m[1]]);
    });
    return ranks.length ? Math.min.apply(null, ranks) : null;
  }
  function _declRankFrom(skills) {
    var ranks = (skills || []).map(function (x) {
      var u = String(x || '').toUpperCase().replace(/[^A-Z]/g, '');
      return (u in _SKILL_RANK) ? _SKILL_RANK[u] : null;
    }).filter(function (v) { return v != null; });
    return ranks.length ? Math.min.apply(null, ranks) : null;
  }
  // Status/cor da categoria (declarada × nível real). gap = declRank - realRank
  // (rank: A=0 mais forte … D=3, FUN=4). declarou mais fraco (gap>0) = deve subir.
  //   🟢 verde  = coerente (gap 0)
  //   🟡 amarelo= deve subir leve (gap 1)
  //   🔴 vermelho= precisa subir (gap ≥2)
  //   🔵 azul   = deve rebaixar (gap <0 — declarou mais forte que joga)
  function _lzStatus(declRank, realRank) {
    if (declRank == null || realRank == null) return { color: '#8592a6', emoji: '', label: 'sem comparação', flag: false };
    var gap = declRank - realRank;
    if (gap <= -1) return { color: '#38bdf8', emoji: '🔵', label: 'deve rebaixar', flag: false };
    if (gap === 0) return { color: '#2dd4a0', emoji: '🟢', label: 'coerente', flag: false };
    if (gap === 1) return { color: '#f0b445', emoji: '🟡', label: 'deve subir', flag: true };
    return { color: '#f26a6a', emoji: '🔴', label: 'precisa subir', flag: true };
  }

  function _renderLetzplaySection(rows, t, profileMap, scanMap) {
    profileMap = profileMap || {}; scanMap = scanMap || {};
    window._lzRenderCtx = { t: t, rows: rows, profileMap: profileMap };   // p/ re-render in-place pós-busca
    var imp = [], scanned = [], wait = [], denied = [], noh = [];
    (rows || []).forEach(function (r) {
      var prof = (r.uid && profileMap[r.uid]) ? profileMap[r.uid] : null;
      var li = prof && prof.letzplayImport;
      var handle = prof && prof.letzplayHandle;
      var consent = prof && prof.letzplayConsent === true;
      var sc = (r.uid && scanMap[r.uid] && scanMap[r.uid].scan) ? scanMap[r.uid].scan : null;
      if (li) imp.push({ r: r, li: li });
      else if (sc) scanned.push({ r: r, scan: sc });
      else if (handle && consent) wait.push({ r: r, handle: handle });
      else if (handle && !consent) denied.push(r);
      else noh.push(r);
    });
    // Só mostra a seção se ao menos alguém tem @ letzplay (evita poluir torneios sem uso).
    if (imp.length + scanned.length + wait.length + denied.length === 0) return '';

    var C = {
      green: { bg: 'rgba(16,185,129,0.14)', fg: '#2dd4a0' },
      blue: { bg: 'rgba(56,189,248,0.14)', fg: '#38bdf8' },
      amber: { bg: 'rgba(240,180,69,0.14)', fg: '#f0b445' },
      red: { bg: 'rgba(242,106,106,0.14)', fg: '#f26a6a' },
      grey: { bg: 'rgba(133,146,166,0.14)', fg: '#8592a6' }
    };
    function pill(c, n, label) {
      return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;padding:5px 10px;border-radius:20px;background:' + c.bg + ';color:' + c.fg + ';"><span style="width:8px;height:8px;border-radius:50%;background:' + c.fg + ';"></span>' + n + ' ' + label + '</span>';
    }
    function line(name, extra) {
      return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:12.5px;"><span>' + _esc(name || '—') + '</span>' + (extra || '') + '</div>';
    }
    function group(color, label, itemsHtml) {
      return itemsHtml ? '<div style="font-size:11px;font-weight:700;color:' + color + ';margin:8px 0 2px;">' + label + '</div>' + itemsHtml : '';
    }
    // Anti-gato: compara a categoria DECLARADA no torneio (effectiveSkills) com o
    // NÍVEL REAL do letzplay (categoria/rating do import OU do perfil público buscado).
    // Se declarou mais FRACO que joga, sinaliza. Ranks: A=0 (mais forte) … D=3, FUN=4.
    var flagged = 0;
    function knownLine(name, realCat, realRank, effSkills, srcIcon) {
      var declRank = _declRankFrom(effSkills);
      var declLabel = (effSkills && effSkills.length) ? effSkills.join('/') : '—';
      var st = _lzStatus(declRank, realRank);
      var known = (declRank != null && realRank != null);
      if (st.flag) flagged++;
      var nameColor = known ? st.color : 'var(--text-main,#e5e7eb)';
      var right = '<span style="font-family:ui-monospace,Menlo,monospace;font-weight:700;color:' + st.color + ';">' + _esc(realCat) + ' <span style="opacity:0.55;">' + srcIcon + '</span></span>';
      var sub = '';
      if (known) {
        sub = (st.emoji === '🟢')
          ? '<div style="font-size:11px;color:' + st.color + ';margin-top:1px;">' + st.emoji + ' declarou ' + _esc(declLabel) + ' · coerente</div>'
          : '<div style="font-size:11px;color:' + st.color + ';margin-top:1px;">' + st.emoji + ' declarou <b>' + _esc(declLabel) + '</b> · joga <b>' + _esc(realCat) + '</b> → <b>' + st.label + '</b></div>';
      }
      return '<div style="padding:4px 0;font-size:12.5px;">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;"><span style="color:' + nameColor + ';font-weight:600;">' + _esc(name || '—') + '</span>' + right + '</div>' +
        sub +
      '</div>';
    }
    var impHtml = imp.map(function (o) {
      var oc = o.li.officialCategory, band = o.li.rating && o.li.rating.band;
      var realCat = oc ? oc.categoryRaw : (band || '—');
      return knownLine(o.r.name, realCat, _lzRankFrom([oc ? oc.categoryRaw : '', band || '']), o.r.effectiveSkills, '🎾');
    }).join('');
    var scannedHtml = scanned.map(function (o) {
      var cat = o.scan.rankingCategory || '—';
      return knownLine(o.r.name, cat, _lzRankFrom([cat]), o.r.effectiveSkills, '🔎');
    }).join('');
    var restHtml = function (arr) { return arr.map(function (x) { return line(x.r ? x.r.name : x.name); }).join(''); };

    // Alvos da busca ativa (autorizaram, têm @, ainda sem histórico/scan).
    var targets = wait.map(function (w) { return { uid: w.r.uid, handle: w.handle, name: w.r.name }; })
      .filter(function (x) { return x.uid && x.handle; });
    window._lzScanCtx = { tId: t.id, targets: targets };
    var scanBtn = targets.length
      ? '<button type="button" id="lz-scan-btn" onclick="window._lzOrgScan()" style="margin-bottom:12px;width:100%;background:var(--info-pill-bg,rgba(99,102,241,0.15));border:1px solid var(--border-color);border-radius:10px;padding:10px 12px;cursor:pointer;color:var(--text-bright,#fff);font-size:0.82rem;font-weight:700;">🔎 Buscar histórico de quem autorizou (' + targets.length + ' · letzplay público)</button>'
      : '';

    var flagBanner = flagged > 0
      ? '<div style="background:rgba(242,106,106,0.12);border:1px solid rgba(242,106,106,0.4);border-radius:10px;padding:9px 12px;margin-bottom:12px;font-size:12.5px;color:#f26a6a;font-weight:600;">🚩 ' +
          flagged + ' inscrito' + (flagged === 1 ? '' : 's') + ' declarou categoria mais fraca que o nível do letzplay — confira abaixo.</div>'
      : '';
    return '<div id="lz-history-section" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:15px 16px;margin-bottom:14px;">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">🎾 Histórico letzplay</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
        pill(C.green, imp.length, 'com histórico') + (scanned.length ? pill(C.blue, scanned.length, 'buscado') : '') +
        pill(C.amber, wait.length, 'aguardando') +
        pill(C.red, denied.length, 'não autorizou') + pill(C.grey, noh.length, 'sem @') +
      '</div>' +
      flagBanner +
      scanBtn +
      group('#2dd4a0', '🟢 Com histórico (categoria oficial)', impHtml) +
      group('#38bdf8', '🔵 Buscado no letzplay (público)', scannedHtml) +
      group('#f0b445', '🟡 Autorizou, aguardando busca', restHtml(wait)) +
      group('#f26a6a', '🔴 Não autorizou', restHtml(denied)) +
      group('#8592a6', '⚪ Sem @ letzplay', restHtml(noh)) +
      '<div style="font-size:11px;color:var(--text-muted);margin-top:11px;border-top:1px solid var(--border-color);padding-top:9px;">A busca ativa lê o <b>perfil público</b> do letzplay (nome, categoria/nível) — precisa da <b>extensão do scoreplace no Chrome (desktop)</b> e uma aba do letzplay aberta. 🎾 = histórico importado · 🔎 = perfil público buscado.</div>' +
      '</div>';
  }

  // ── Overlay de progresso da busca ativa ──
  function _lzScanOverlay(html) {
    var o = document.getElementById('lz-scan-overlay');
    if (!o) {
      o = document.createElement('div');
      o.id = 'lz-scan-overlay';
      o.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(6,8,16,0.72);display:flex;align-items:center;justify-content:center;padding:20px;';
      o.innerHTML = '<div id="lz-scan-card" style="background:var(--bg-card,#1e2235);border:1px solid var(--border-color,rgba(255,255,255,0.12));border-radius:18px;max-width:440px;width:100%;padding:22px;color:var(--text-main,#cbd5e1);box-shadow:0 20px 60px rgba(0,0,0,0.5);text-align:center;"></div>';
      document.body.appendChild(o);
    }
    var c = document.getElementById('lz-scan-card'); if (c) c.innerHTML = html;
  }
  function _lzScanClose() { var o = document.getElementById('lz-scan-overlay'); if (o) o.remove(); }
  function _lzScanErrHtml(msg) {
    return '<div style="font-size:2rem;margin-bottom:6px;">⚠️</div>' +
      '<div style="font-weight:700;color:var(--text-bright,#fff);margin-bottom:8px;">Não deu pra buscar</div>' +
      '<div style="font-size:0.82rem;color:var(--text-muted,#cbd5e1);line-height:1.5;margin-bottom:14px;">' + _esc(msg) + '</div>' +
      '<button type="button" onclick="var o=document.getElementById(\'lz-scan-overlay\');if(o)o.remove();" style="background:var(--info-pill-bg,rgba(99,102,241,0.15));border:1px solid var(--border-color);border-radius:10px;padding:9px 18px;cursor:pointer;color:var(--text-bright,#fff);font-weight:700;">Fechar</button>';
  }
  // barra + números + lista de pessoas (nome + @) sendo carregadas
  function _lzScanProgressHtml(targets, doneN, total) {
    var pct = total ? Math.min(99, Math.round(doneN / total * 100)) : 4;
    var list = (targets || []).map(function (t, i) {
      var mark = i < doneN ? '<span style="color:#2dd4a0;">✓</span>' : (i === doneN ? '<span>🔄</span>' : '<span style="opacity:0.4;">•</span>');
      var active = i === doneN;
      return '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px;' + (active ? 'color:var(--text-bright,#fff);font-weight:600;' : 'color:var(--text-muted,#94a3b8);') + '">' +
        mark + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(t.name || t.handle) + ' <span style="opacity:0.6;">@' + _esc(t.handle) + '</span></span></div>';
    }).join('');
    return '<div style="font-size:1.5rem;margin-bottom:6px;">🔎</div>' +
      '<div style="font-weight:700;color:var(--text-bright,#fff);margin-bottom:12px;">Buscando histórico no letzplay</div>' +
      '<div style="height:12px;border-radius:999px;background:var(--bg-darker,#171a2b);overflow:hidden;border:1px solid var(--border-color,rgba(255,255,255,0.1));"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#38bdf8,#0ea5e9);transition:width .3s;"></div></div>' +
      '<div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);margin:8px 0 12px;">' + Math.min(doneN, total) + ' de ' + total + ' inscritos</div>' +
      '<div style="text-align:left;max-height:220px;overflow-y:auto;border-top:1px solid var(--border-color);padding-top:8px;">' + list + '</div>';
  }
  // compara versões "a.b.c" — a >= b?
  function _verGE(a, b) {
    a = String(a || '0').split('.').map(Number); b = String(b || '0').split('.').map(Number);
    for (var i = 0; i < Math.max(a.length, b.length); i++) { var x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; }
    return true;
  }
  var _LZ_MIN_EXT = '1.28';

  // Busca ativa: pinga a extensão (checa versão), dispara o scan e mostra progresso.
  window._lzOrgScan = function () {
    var ctx = window._lzScanCtx;
    if (!ctx || !ctx.targets || !ctx.targets.length) return;
    _lzScanOverlay('<div style="font-size:1.5rem;margin-bottom:8px;">🔌</div><div style="font-weight:700;color:var(--text-bright,#fff);">Conectando à extensão…</div>');
    var started = false, done = false, versions = [];
    function onMsg(e) {
      if (e.source !== window) return; var d = e.data; if (!d) return;
      // Coleta as versões que anunciam (pode haver content scripts órfãos de versões
      // antigas na página) — a decisão usa a MAIOR versão, tomada no timeout abaixo.
      if (d.__sp_lp === 'extension-present') { if (d.version) versions.push(d.version); return; }
      if (d.__sp_lp === 'org-scan-progress' && d.tournamentId === ctx.tId) {
        _lzScanOverlay(_lzScanProgressHtml(ctx.targets, d.done || 0, d.total || ctx.targets.length));
        return;
      }
      if (d.__sp_lp === 'org-scan-result' && d.tournamentId === ctx.tId) {
        done = true; window.removeEventListener('message', onMsg);
        if (!d.ok) { _lzScanOverlay(_lzScanErrHtml('Erro: ' + (d.error || 'desconhecido') + '.')); return; }
        _saveScansAndReload(ctx.tId, d.scans || []);
      }
    }
    window.addEventListener('message', onMsg);
    window.postMessage({ __sp_lp: 'ext-ping' }, window.location.origin);
    // Junta as respostas do ping (~900ms) e decide pela MAIOR versão presente.
    setTimeout(function () {
      if (done || started) return;
      var reload = 'Recarregue a extensão pra v' + _LZ_MIN_EXT + ' em chrome://extensions, recarregue esta página e tente de novo.';
      if (!versions.length) { window.removeEventListener('message', onMsg); _lzScanOverlay(_lzScanErrHtml('A extensão do scoreplace não respondeu. ' + reload)); return; }
      var best = versions.reduce(function (m, v) { return _verGE(v, m) ? v : m; }, '0');
      if (!_verGE(best, _LZ_MIN_EXT)) { window.removeEventListener('message', onMsg); _lzScanOverlay(_lzScanErrHtml('Sua extensão está na versão ' + best + '. ' + reload)); return; }
      started = true;
      _lzScanOverlay(_lzScanProgressHtml(ctx.targets, 0, ctx.targets.length));
      window.postMessage({ __sp_lp: 'run-org-scan', targets: ctx.targets, tournamentId: ctx.tId }, window.location.origin);
    }, 900);
    // segurança: scan iniciou mas travou
    setTimeout(function () {
      if (done || !started) return; window.removeEventListener('message', onMsg);
      _lzScanOverlay(_lzScanErrHtml('A busca demorou demais. Tente de novo.'));
    }, 90000);
  };
  function _saveScansAndReload(tId, scans) {
    var ok = scans.filter(function (s) { return s.uid && s.scan; });
    var failed = scans.filter(function (s) { return !(s.uid && s.scan); });
    if (!ok.length) {
      var err = (failed[0] && failed[0].error) || 'sem dados';
      _lzScanOverlay(_lzScanErrHtml('Nenhum perfil carregado (' + err + '). Tente de novo.'));
      return;
    }
    var db = firebase.firestore();
    var meUid = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid) || null;
    var writes = ok.map(function (s) {
      return db.collection('tournaments').doc(tId).collection('letzplayScans').doc(s.uid)
        .set({ handle: s.handle, scan: s.scan, scannedAt: new Date().toISOString(), scannedBy: meUid }, { merge: true });
    });
    Promise.all(writes).then(function () {
      // re-render SÓ a seção letzplay (sem mexer no scroll da página)
      _fetchScans(tId).then(function (newScanMap) {
        var rctx = window._lzRenderCtx, el = document.getElementById('lz-history-section');
        if (rctx && el && rctx.t && rctx.t.id === tId) {
          var tmp = document.createElement('div');
          tmp.innerHTML = _renderLetzplaySection(rctx.rows, rctx.t, rctx.profileMap, newScanMap);
          var newEl = tmp.firstElementChild;
          if (newEl) el.replaceWith(newEl);
        } else if (window.location.hash === '#analise/' + tId) {
          var c = document.getElementById('view-container'); if (c) window.renderEnrollmentReportPage(c, tId);
        }
        _lzScanClose();
        if (typeof showNotification === 'function') showNotification('Busca concluída', ok.length + ' carregado(s)' + (failed.length ? (' · ' + failed.length + ' falhou') : ''), 'success');
      });
    }).catch(function (e) {
      _lzScanOverlay(_lzScanErrHtml('Erro ao salvar: ' + String((e && e.message) || e)));
    });
  }

  function _renderPage(container, t, rows, profileMap, parts, resolvedFor, scanMap) {
    if (!container) return;
    scanMap = scanMap || {};
    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({
        href: '#tournaments/' + t.id,
        label: 'Voltar',
        middleHtml: '<span style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">📊 Análise de Inscritos</span>',
      })
      : '';

    var tName = _esc(t.name || 'Torneio');
    var subtitle = '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px;">' + tName + '</div>';

    // Estado vivo pra busca/sort/filtros da lista de inscritos.
    var _isOrg = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));
    _liveState = { rows: rows, t: t, isOrg: _isOrg };
    _pendingEdits = {}; // v2.4.34: cada carga da página começa sem edições pendentes

    container.innerHTML = hdr +
      '<div style="max-width:760px;margin:0 auto;padding:1rem;">' +
      subtitle +
      _renderOverview(rows, t) +
      _renderLetzplaySection(rows, t, profileMap, scanMap) +
      _renderCategoryTable(rows, t) +
      _renderInscritosList(rows, t) +
      // v2.4.33: seção "Perfis Incompletos" editável removida — a edição de
      // gênero E categoria agora vive na própria lista filtrável de Inscritos
      // (acima). Pra achar quem falta dado, use os filtros "? Sem gênero" /
      // "Sem habilidade". (v3.0.x: _renderIncomplete + _saveParticipantAssignments
      // removidas — eram dead code, zero callers.)
      _renderDiagnostic(t, rows, profileMap || {}, parts || [], resolvedFor || {}) +
      '</div>';

    // Popula a lista (defaults: ordem de inscrição ↑, sem filtros).
    if (typeof window._erRenderInscritos === 'function') window._erRenderInscritos();

    if (typeof window._reflowChrome === 'function') window._reflowChrome();
  }

  function _renderLoading(container, t) {
    if (!container) return;
    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({
        href: '#tournaments/' + (t && t.id ? t.id : ''),
        label: 'Voltar',
        middleHtml: '<span style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">📊 Análise de Inscritos</span>',
      })
      : '';
    // v1.3.26-beta: usa helper canônico (🎾 girando), padronizando com
    // boot loader e router cache loader.
    var loaderHtml = (typeof window._renderBallLoader === 'function')
      ? window._renderBallLoader('Carregando perfis dos inscritos…', { minHeight: '40vh' })
      : '<div style="text-align:center;padding:48px 12px;color:var(--text-muted);font-size:0.85rem;">⏳ Carregando perfis dos inscritos…</div>';
    container.innerHTML = hdr + '<div style="max-width:760px;margin:0 auto;padding:1rem;">' + loaderHtml + '</div>';
    if (typeof window._reflowChrome === 'function') window._reflowChrome();
  }

  // ─── Public renderer ─ chamado pelo router ──────────────────────────
  // Padrão centralizado: igual a renderProfilePage / renderSupportPage etc.
  window.renderEnrollmentReportPage = function (container, tId) {
    var t = window.AppStore && window.AppStore.tournaments
      ? window.AppStore.tournaments.find(function (x) { return x.id === tId; })
      : null;
    if (!t) {
      if (typeof showNotification === 'function') showNotification('Erro', 'Torneio não encontrado.', 'error');
      window.location.replace('#dashboard');
      return;
    }
    // v2.8.56: expande duplas em pessoas individuais (conta todos os inscritos).
    var parts = _expandDuplas(Array.isArray(t.participants) ? t.participants : []);

    // Verifica se user é organizador — relatório é restrito.
    if (!window.AppStore || !window.AppStore.isOrganizer || !window.AppStore.isOrganizer(t)) {
      window.location.replace('#tournaments/' + tId);
      return;
    }

    _renderLoading(container, t);

    // v1.3.24-beta: passa parts inteiro pro _fetchProfiles — agora ele
    // tenta rescue por email/displayName quando participantObj não tem uid.
    // v1.15.24: carrega também os scans do organizador (busca ativa letzplay).
    Promise.all([_fetchProfiles(parts), _fetchScans(tId)]).then(function (res) {
      var fetchResult = res[0], scanMap = res[1] || {};
      // Re-checa se ainda na rota — user pode ter navegado fora durante o fetch
      if (window.location.hash !== '#analise/' + tId) return;
      var rows = _buildRows(t, parts, fetchResult);
      var byUid = fetchResult.byUid || {};
      var resolved = fetchResult.resolvedFor || {};
      window._log('[EnrollmentReport v1.3.24] profiles fetched:', Object.keys(byUid).length,
        'rescued:', Object.keys(resolved).length, 'scans:', Object.keys(scanMap).length);
      _renderPage(container, t, rows, byUid, parts, resolved, scanMap);
    }).catch(function (err) {
      window._error('[EnrollmentReport] erro:', err);
      if (window.location.hash !== '#analise/' + tId) return;
      var rows = _buildRows(t, parts, { byUid: {}, resolvedFor: {} });
      _renderPage(container, t, rows, {}, parts, {}, {});
    });
  };

  // Scans do organizador (busca ativa): tournaments/{tId}/letzplayScans/{uid}.
  function _fetchScans(tId) {
    try {
      var db = firebase.firestore();
      return db.collection('tournaments').doc(tId).collection('letzplayScans').get()
        .then(function (snap) { var m = {}; snap.forEach(function (doc) { m[doc.id] = doc.data(); }); return m; })
        .catch(function () { return {}; });
    } catch (e) { return Promise.resolve({}); }
  }

  // Compat: preserva _openEnrollmentReport pra todos os call-sites antigos —
  // navega pra hash #analise/<tId> que dispara renderEnrollmentReportPage.
  window._openEnrollmentReport = function (tId) {
    if (!tId) return;
    window.location.hash = '#analise/' + tId;
  };


})();
