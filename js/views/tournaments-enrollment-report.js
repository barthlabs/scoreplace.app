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
    // Busca TODOS os uids — inclusive p1Uid/p2Uid das duplas (senão o nome do
    // parceiro sai "(sem nome)": a inscrição guarda só uid, o nome vem do perfil).
    var uids = {};
    parts.forEach(function (p) {
      if (!p) return;
      if (p.uid) uids[p.uid] = 1;
      if (p.p1Uid) uids[p.p1Uid] = 1;
      if (p.p2Uid) uids[p.p2Uid] = 1;
    });
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
    var n = _erPendingCount();
    // Barra inline no back-header (Cancelar/Salvar) — display flex.
    var inline = document.getElementById('er-mx-save-inline');
    var inlineBtn = document.getElementById('er-mx-save-btn');
    if (inline && inlineBtn) {
      if (n > 0) { inline.style.display = 'flex'; inlineBtn.disabled = false; inlineBtn.textContent = '💾 Salvar (' + n + ')'; }
      else { inline.style.display = 'none'; inlineBtn.disabled = true; inlineBtn.textContent = '💾 Salvar'; }
    }
    // Barra da lista de inscritos legada (er-save-bar), se existir.
    var bar = document.getElementById('er-save-bar'); var btn = document.getElementById('er-save-btn');
    if (bar && btn) {
      if (n > 0) { bar.style.display = ''; btn.disabled = false; btn.textContent = '💾 Salvar alterações (' + n + ')'; }
      else { bar.style.display = 'none'; btn.disabled = true; btn.textContent = '💾 Salvar alterações'; }
    }
  };
  // Cancelar: descarta as edições pendentes (drag de gênero/categoria) e re-renderiza.
  window._erCancelEdits = function () {
    _pendingEdits = {};
    if (typeof window._erRenderMatrix === 'function') window._erRenderMatrix();
    if (typeof window._erRenderInscritos === 'function') window._erRenderInscritos();
    window._erUpdateSaveBar();
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
        // Aceita cv em validCats OU (torneio sem categorias configuradas / cat
        // fabricada pela matriz) qualquer cv que decomponha numa habilidade válida.
        var _cvOk = cv && (validCats.indexOf(cv) !== -1 || (function () { var dd = _decomposeCat(cv, t); return !!(dd && dd.skill); })());
        if (_cvOk) {
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
      if (typeof window._erRenderMatrix === 'function') window._erRenderMatrix();
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

  // ─── Verificação letzplay (escopo do módulo — usada pela matriz) ─────
  var _LZ_COL = { white: '#8592a6', green: '#2dd4a0', blue: '#38bdf8', yellow: '#f0b445', red: '#f26a6a' };
  var _LTR = ['A', 'B', 'C', 'D', 'FUN'];
  // DESEMPENHO manda — NÃO a banda do ranking. Estar ranqueado numa banda acima
  // (ex: clube joga a pessoa numa C/B) NÃO é sinal de subir; só DOMINAR é:
  //   • título (campeão) → titleRank    • topo da tabela / win% alto → standingRank
  function _lzEvidence(champCats, rankings, bandCats) {
    var titleRanks = (champCats || []).map(function (c) { return _lzRankFrom([c]); }).filter(function (r) { return r != null; });
    var standingRanks = [];
    (rankings || []).forEach(function (r) {
      var cr = _lzRankFrom([r.category || r.categoryRaw]);
      if (cr == null || r.active === false) return;
      var topStanding = (r.position && r.fieldSize && (r.position / r.fieldSize) <= 0.15);
      var highWin = (typeof r.winPct === 'number' && r.winPct >= 70 && (r.games == null || r.games >= 6));
      if (topStanding || highWin) standingRanks.push(cr);
    });
    var bandRanks = (bandCats || []).map(function (c) { return _lzRankFrom([c]); }).filter(function (r) { return r != null; });
    return {
      titleRank: titleRanks.length ? Math.min.apply(null, titleRanks) : null,
      standingRank: standingRanks.length ? Math.min.apply(null, standingRanks) : null,
      bandRank: bandRanks.length ? Math.min.apply(null, bandRanks) : null,
      titleCount: titleRanks.length
    };
  }
  // 5 níveis: ⚪ sem info · 🟢 coerente · 🔵 rebaixar · 🟡 pode subir · 🔴 deve subir.
  // SÓ domínio (título/topo) empurra pra cima. Banda alta sem dominar = coerente.
  function _lzVerdict(declRank, ev) {
    ev = ev || {};
    if (declRank == null) return { key: 'white', apurada: null };
    // Campeão na categoria declarada (ou mais fácil) → DEVE subir (regra federação).
    if (ev.titleRank != null) {
      var shouldT = Math.max(0, ev.titleRank - 1);
      if (shouldT < declRank) return { key: 'red', apurada: shouldT };
    }
    // Topo da tabela / vencendo muito na categoria declarada (ou mais fácil) → PODE subir.
    if (ev.standingRank != null) {
      var shouldS = Math.max(0, ev.standingRank - 1);
      if (shouldS < declRank) return { key: 'yellow', apurada: shouldS };
    }
    // Sem domínio → coerente. Jogar/ser ranqueado acima é permitido (compete acima).
    return { key: 'green', apurada: declRank };
  }
  // Marca cada linha com a verificação letzplay: _lzColor (cor do status), _lzSkill
  // (categoria apurada), _lzSrc (🎾 import / 🔎 scan). null = não verificado.
  function _erApplyLzToRows(rows, profileMap, scanMap) {
    profileMap = profileMap || {}; scanMap = scanMap || {};
    (rows || []).forEach(function (r) {
      r._lzColor = null; r._lzSkill = null; r._lzSrc = null;
      var prof = r.uid && profileMap[r.uid];
      var li = prof && prof.letzplayImport;
      var sc = (r.uid && scanMap[r.uid] && scanMap[r.uid].scan) ? scanMap[r.uid].scan : null;
      if (li) {
        var oc = li.officialCategory, band = li.rating && li.rating.band;
        var champCats = (li.tournaments || []).filter(function (x) { return x.title; }).map(function (x) { return x.categoryRaw; });
        var ev = _lzEvidence(champCats, li.rankings || [], [oc ? oc.categoryRaw : '', band || '']);
        var v = _lzVerdict(_declRankFrom(r.effectiveSkills), ev);
        r._lzColor = _LZ_COL[v.key]; r._lzSrc = '🎾';
        r._lzSkill = (oc && oc.skill) ? oc.skill : (v.apurada != null ? _LTR[v.apurada] : null);
      } else if (sc) {
        var ev2 = _lzEvidence(sc.champions || [], sc.rankings || [], [sc.rankingCategory].concat(sc.allCategories || []));
        var v2 = _lzVerdict(_declRankFrom(r.effectiveSkills), ev2);
        r._lzColor = _LZ_COL[v2.key]; r._lzSrc = '🔎';
        r._lzSkill = sc.profileSkill || sc.skill || (v2.apurada != null ? _LTR[v2.apurada] : null);
      }
    });
  }

  // ─── Matriz Gênero × Categoria (drag-and-drop) ──────────────────────
  // 2 colunas (♀ Feminino · ♂ Masculino) + "? Sem gênero" numa FAIXA embaixo.
  // Nomes agrupados por categoria (aferida pelo letzplay quando verificado) e
  // PINTADOS pela verificação letzplay. Arrastar → atribui gênero; soltar numa
  // categoria → gênero + categoria. Reusa _pendingEdits + save.
  var _GENMAP = { feminino: 'Fem', masculino: 'Masc' };
  function _mxGenderOf(r) {
    var pe = _pendingEdits[r.order] || {};
    var g = (pe.gender != null) ? pe.gender : (r.gender || '');
    g = String(g).toLowerCase();
    if (g.indexOf('fem') === 0) return 'feminino';
    if (g.indexOf('masc') === 0) return 'masculino';
    return null;
  }
  function _mxSkillOf(r, t) {
    var pe = _pendingEdits[r.order] || {};
    if (pe.category != null) { if (!pe.category) return null; var d = _decomposeCat(pe.category, t); return d.skill || null; }
    if (r.effectiveSkills && r.effectiveSkills.length) return r.effectiveSkills[0];
    if (r._lzSkill) return r._lzSkill; // org buscou no letzplay mas a pessoa ainda não logou
    return null;
  }
  function _mxFindValidCat(t, genderKey, skill) {
    var cats = (typeof window._getTournamentCategories === 'function') ? (window._getTournamentCategories(t) || []) : [];
    var gTok = _GENMAP[genderKey];
    var i, d;
    for (i = 0; i < cats.length; i++) { d = _decomposeCat(cats[i], t); if (d.skill === skill && d.gender === gTok) return cats[i]; }
    for (i = 0; i < cats.length; i++) { d = _decomposeCat(cats[i], t); if (d.skill === skill && (d.gender === 'Misto' || !d.gender)) return cats[i]; }
    // Torneio sem essa categoria configurada (ex: informal, skillCategories vazio) →
    // FABRICA a categoria pelo gênero + habilidade. `_decomposeCat` reconhece "Fem D".
    return gTok ? (gTok + ' ' + skill) : skill;
  }
  function _matrixInner(rows, t) {
    // Buckets do ESTUDO = sempre A-D-FUN (+ custom); NÃO dependem de skillCategories
    // (essas marcam quais foram FORMALIZADAS via botão "Criar categoria").
    var skills = _DEFAULT_SKILLS.slice();
    (t.skillCategories || []).forEach(function (s) { if (skills.indexOf(s) < 0) skills.push(s); });
    var groups = skills.concat(['__none__']);
    function emptyBox() { var o = {}; groups.forEach(function (g) { o[g] = []; }); return o; }
    var fem = emptyBox(), masc = emptyBox(), semG = emptyBox();
    (rows || []).forEach(function (r) {
      var g = _mxGenderOf(r), sk = _mxSkillOf(r, t);
      var key = (sk && groups.indexOf(sk) !== -1) ? sk : '__none__';
      (g === 'feminino' ? fem : g === 'masculino' ? masc : semG)[key].push(r);
    });
    function sumBox(b) { return groups.reduce(function (a, g) { return a + b[g].length; }, 0); }
    var femTotal = sumBox(fem), mascTotal = sumBox(masc), semTotal = sumBox(semG), total = (rows || []).length;

    // FORMALIZAÇÃO de categorias (torneio informal → formal). genderOn = divisão por
    // gênero criada; createdSkills = habilidades formalizadas. Botões abaixo alternam.
    var genderOn = (t.genderCategories || []).length > 0;
    var createdSkills = (t.skillCategories || []);
    var tIdEsc = _esc(String(t.id));
    var MIN_CAT = 2; // mínimo de pessoas pra oferecer "Criar categoria"
    function skillTotal(sk) { return fem[sk].length + masc[sk].length + semG[sk].length; }
    function catCount(catName) {
      var d = _decomposeCat(catName, t), n = 0;
      (rows || []).forEach(function (r) {
        var g = _mxGenderOf(r), sk = _mxSkillOf(r, t);
        var gOk = !d.gender || (d.gender === 'Fem' && g === 'feminino') || (d.gender === 'Masc' && g === 'masculino');
        var sOk = !d.skill || (sk === d.skill);
        if (gOk && sOk) n++;
      });
      return n;
    }
    function createBtn(call, created) {
      var cls = created ? 'btn btn-outline btn-sm hover-lift' : 'btn btn-success btn-sm hover-lift';
      var lbl = created ? '↩ Reverter' : '➕ Criar categoria';
      return '<button type="button" onclick="event.stopPropagation();' + call + '" class="' + cls + '">' + lbl + '</button>';
    }

    // Ordena: EDITADOS (âmbar, ainda não salvos) vão pro FINAL; entre os demais,
    // VERIFICADOS (apuração letzplay) no topo, depois alfabético. Ao salvar, o
    // pending limpa → cada um entra no lugar certo (cor + alfabético).
    function sortList(arr) {
      return arr.slice().sort(function (a, b) {
        var ae = (_pendingEdits[a.order] && Object.keys(_pendingEdits[a.order]).length) ? 1 : 0;
        var be = (_pendingEdits[b.order] && Object.keys(_pendingEdits[b.order]).length) ? 1 : 0;
        if (ae !== be) return ae - be; // editados por último
        var av = a._lzColor ? 0 : 1, bv = b._lzColor ? 0 : 1;
        if (av !== bv) return av - bv; // verificados no topo
        return String(a.name || '~').localeCompare(String(b.name || '~'), 'pt', { sensitivity: 'base' });
      });
    }
    // Card do atleta — tamanho padrão (min 150px), nome com ellipsis.
    function chip(r) {
      var pe = _pendingEdits[r.order] || {}; var edited = Object.keys(pe).length > 0;
      // não verificado = MESMO cinza da legenda "sem verificação" (_LZ_COL.white).
      var nameCol = edited ? '#f59e0b' : (r._lzColor || _LZ_COL.white);
      var border = edited ? 'rgba(245,158,11,0.55)' : (r._lzColor ? (r._lzColor + '55') : 'var(--border-color)');
      return '<div draggable="true" ondragstart="window._erMxDragStart(event,' + r.order + ')" ' +
        'style="cursor:grab;font-size:0.9rem;font-weight:600;padding:6px 10px;border-radius:7px;background:var(--bg-card,rgba(0,0,0,0.25));color:' + nameCol + ';border:1px solid ' + border + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + _esc(r.name || '(sem nome)') + ' — arraste pra atribuir gênero/categoria">' + _esc(r.name || '(sem nome)') + '</div>';
    }
    function cardGrid(arr) { return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;">' + sortList(arr).map(chip).join('') + '</div>'; }
    // Box de categoria (borda na cor do gênero) — título "C (N)" + botão criar. Drop = gênero+categoria.
    function catBox(genderKey, sk, arr, color, tint) {
      var label = (sk === '__none__') ? 'Sem habilidade' : sk;
      var btn = (sk !== '__none__' && skillTotal(sk) >= MIN_CAT)
        ? createBtn('window._erToggleSkill(\'' + tIdEsc + '\',\'' + sk + '\',this)', createdSkills.indexOf(sk) !== -1)
        : '';
      return '<div ondragover="window._erMxOver(event)" ondrop="window._erMxDrop(event,\'' + (genderKey || '') + '\',\'' + sk + '\')" ' +
        'style="border:1.5px solid ' + tint + ';border-radius:10px;padding:8px 10px;background:var(--bg-darker,rgba(0,0,0,0.15));">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px;"><span style="font-size:14px;font-weight:800;color:' + color + ';">' + label + ' <span style="opacity:0.7;font-weight:700;">(' + arr.length + ')</span></span>' + btn + '</div>' +
        cardGrid(arr) + '</div>';
    }
    // Cabeçalho do gênero (drop = só gênero) + botão criar categoria por gênero.
    function ghead(icon, gKey, name, color, tot) {
      var btn = (tot >= MIN_CAT) ? createBtn('window._erToggleGender(\'' + tIdEsc + '\',this)', genderOn) : '';
      return '<div ondragover="window._erMxOver(event)" ondrop="window._erMxDrop(event,\'' + gKey + '\',\'\')" ' +
        'style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:17px;font-weight:800;color:' + color + ';border-bottom:2px solid ' + color + ';padding-bottom:6px;">' +
        '<span>' + icon + ' ' + name + ' <span style="opacity:0.8;font-size:15px;">(' + tot + ')</span></span>' + btn + '</div>';
    }
    var femCol = '#ec4899', mascCol = '#3b82f6';
    var femTint = 'rgba(236,72,153,0.45)', mascTint = 'rgba(59,130,246,0.45)';
    // GRID alinhado: 2 colunas (Feminino | Masculino); cada habilidade é uma LINHA →
    // C fem e C masc na mesma linha. align-items:stretch mantém a linha uniforme.
    var gridRows = ghead('♀', 'feminino', 'Feminino', femCol, femTotal) + ghead('♂', 'masculino', 'Masculino', mascCol, mascTotal);
    groups.forEach(function (sk) {
      gridRows += catBox('feminino', sk, fem[sk], femCol, femTint) + catBox('masculino', sk, masc[sk], mascCol, mascTint);
    });
    var grid = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px 12px;align-items:stretch;">' + gridRows + '</div>';
    // "Categorias no torneio" — resultado das formalizações + contagem (acima do total).
    var formalCats = (typeof window._getTournamentCategories === 'function') ? (window._getTournamentCategories(t) || []) : [];
    var catsBoxInner = formalCats.length
      ? '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + formalCats.map(function (c) {
          return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:16px;font-weight:700;padding:6px 14px;border-radius:20px;background:rgba(99,102,241,0.16);color:var(--text-bright,#fff);border:1px solid rgba(99,102,241,0.4);">' + _esc(c) + ' <span style="opacity:0.7;">(' + catCount(c) + ')</span></span>';
        }).join('') + '</div>'
      : '<span style="font-size:15px;color:var(--text-muted);">Nenhuma categoria formal — o sorteio mistura todos. Use os botões “Criar categoria” abaixo.</span>';
    var catsBox = '<div style="background:var(--bg-darker,rgba(0,0,0,0.18));border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;margin-bottom:12px;">' +
      '<div style="font-size:15px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--text-secondary,#c8cdd6);margin-bottom:9px;">🗂️ Categorias no torneio</div>' + catsBoxInner + '</div>';
    var totalBar = '<div style="font-size:18px;font-weight:800;color:var(--text-bright,#fff);margin-bottom:12px;">Total de inscritos: ' + total + '</div>';
    // Sem gênero: faixa full-width embaixo, mesmas caixas de categoria.
    var semSection = '';
    if (semTotal) {
      var semInner = groups.map(function (sk) { return catBox('', sk, semG[sk], '#8592a6', 'rgba(133,146,166,0.45)'); }).join('');
      semSection = '<div style="margin-top:14px;background:var(--bg-darker,rgba(0,0,0,0.18));border:1.5px solid #8592a6;border-radius:12px;padding:10px 12px;">' +
        '<div style="font-size:17px;font-weight:800;color:#8592a6;border-bottom:2px solid #8592a6;padding-bottom:6px;margin-bottom:8px;">? Sem gênero <span style="opacity:0.8;font-size:15px;">(' + semTotal + ')</span> — arraste pra Feminino ou Masculino</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:9px;">' + semInner + '</div></div>';
    }
    return catsBox + totalBar + grid + semSection;
  }
  window._erRenderMatrix = function () {
    var el = document.getElementById('er-cat-matrix');
    if (el && _liveState) el.innerHTML = _matrixInner(_liveState.rows, _liveState.t);
  };
  // ─ Formalizar categorias (botões "Criar categoria") — mexe em genderCategories /
  //   skillCategories / combinedCategories do torneio e PERSISTE. NÃO atribui p.category
  //   (a matriz é estudo administrativo — o sorteio só passa a separar se houver categorias).
  function _erFindT(tId) { return (window.AppStore && window.AppStore.tournaments) ? window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); }) : null; }
  function _erComputeCombined(genders, skills) {
    genders = genders || []; skills = skills || [];
    if (!genders.length && !skills.length) return [];
    if (!genders.length) return skills.slice();
    if (!skills.length) return genders.slice();
    var out = []; genders.forEach(function (g) { skills.forEach(function (s) { out.push(g + ' ' + s); }); }); return out;
  }
  // Feedback imediato no botão clicado (cinza "Criando…"/"Revertendo…") sem re-render.
  function _erSetBtnBusy(btn, reverting) {
    if (!btn) return;
    btn.disabled = true;
    btn.className = 'btn btn-outline btn-sm';
    btn.textContent = reverting ? '⏳ Revertendo…' : '⏳ Criando…';
  }
  function _erCommitCats(t) {
    t.combinedCategories = _erComputeCombined(t.genderCategories, t.skillCategories);
    // Suprime o re-render da página inteira que o snapshot do Firestore dispararia
    // (era o "carregando" que pulava a tela). Re-render só a matriz, in-place.
    window._suppressSoftRefresh = true;
    var done = function () {
      window._erRenderMatrix();
      setTimeout(function () { window._suppressSoftRefresh = false; }, 1200);
    };
    try {
      var p = (window.FirestoreDB && window.FirestoreDB.saveTournament) ? window.FirestoreDB.saveTournament(t) : null;
      if (p && typeof p.then === 'function') p.then(done, done); else setTimeout(done, 300);
    } catch (e) { done(); }
  }
  window._erToggleGender = function (tId, btn) {
    if (!_liveState || !_liveState.isOrg) return;
    var t = _erFindT(tId); if (!t) return;
    var reverting = (t.genderCategories || []).length > 0;
    _erSetBtnBusy(btn, reverting);
    t.genderCategories = reverting ? [] : ['Fem', 'Masc'];
    _erCommitCats(t);
  };
  window._erToggleSkill = function (tId, sk, btn) {
    if (!_liveState || !_liveState.isOrg) return;
    var t = _erFindT(tId); if (!t) return;
    var sc = (t.skillCategories || []).slice();
    var i = sc.indexOf(sk);
    _erSetBtnBusy(btn, i >= 0);
    if (i >= 0) sc.splice(i, 1); else sc.push(sk);
    sc.sort(function (a, b) { return _DEFAULT_SKILLS.indexOf(a) - _DEFAULT_SKILLS.indexOf(b); });
    t.skillCategories = sc;
    _erCommitCats(t);
  };
  window._erMxDragStart = function (ev, order) { window._erMxDrag = order; try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(order)); } catch (e) {} };
  window._erMxOver = function (ev) { ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch (e) {} };
  window._erMxDrop = function (ev, genderKey, sk) {
    ev.preventDefault(); ev.stopPropagation();
    if (!_liveState || !_liveState.isOrg) return;
    var order = (window._erMxDrag != null) ? window._erMxDrag : parseInt((ev.dataTransfer && ev.dataTransfer.getData('text/plain')) || '', 10);
    window._erMxDrag = null;
    if (order == null || isNaN(order)) return;
    if (!_pendingEdits[order]) _pendingEdits[order] = {};
    if (genderKey === 'feminino' || genderKey === 'masculino') _pendingEdits[order].gender = genderKey;
    if (sk && sk !== '__none__') { var vc = _mxFindValidCat(_liveState.t, genderKey, sk); if (vc) _pendingEdits[order].category = vc; }
    else if (sk === '__none__') { _pendingEdits[order].category = ''; }
    window._erRenderMatrix();
    window._erUpdateSaveBar();
  };
  // Seção ÚNICA da Análise: Categorias com apuração pelo letzplay. Junta os botões
  // de busca, a legenda de cores e a matriz (nomes pintados pela verificação).
  function _renderCategoriesSection(rows, t, profileMap, scanMap) {
    profileMap = profileMap || {}; scanMap = scanMap || {};
    _erApplyLzToRows(rows, profileMap, scanMap);
    window._lzRenderCtx = { t: t, rows: rows, profileMap: profileMap, scanMap: scanMap };
    var _isOrg = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));

    // Alvos da busca ativa = quem autorizou (@ + consentimento) e não tem import próprio.
    var targets = (rows || []).filter(function (r) {
      var prof = r.uid && profileMap[r.uid];
      return prof && prof.letzplayHandle && prof.letzplayConsent === true && !prof.letzplayImport;
    }).map(function (r) { return { uid: r.uid, handle: profileMap[r.uid].letzplayHandle, name: r.name }; });
    window._lzScanCtx = { tId: t.id, targets: targets };

    // Última verificação + o MODO usado (essencial/completa) do scan mais recente.
    var lastTs = 0, lastMode = null;
    Object.keys(scanMap).forEach(function (uid) {
      var s = scanMap[uid]; if (s && s.scannedAt) { var v = Date.parse(s.scannedAt) || 0; if (v > lastTs) { lastTs = v; lastMode = (s.scan && s.scan._mode) || 'essential'; } }
    });
    var _ld = lastTs ? new Date(lastTs) : null;
    var _dateStr = _ld ? (_ld.toLocaleDateString('pt-BR') + ' ' + _ld.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })) : '';
    function dateLine() { return _ld ? '<div style="font-size:12px;color:var(--text-muted);margin-top:6px;">Última verificação: <b style="color:var(--text-bright,#fff);">' + _dateStr + '</b></div>' : ''; }
    // Título + botões Essencial / Completa (padrão do app; Completa com BRILHO). A data
    // da última verificação fica EMBAIXO do botão que foi efetivamente usado.
    var essCss = 'width:100%;font-size:0.96rem;font-weight:800;padding:12px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;cursor:pointer;';
    var fullCss = 'width:100%;font-size:0.96rem;font-weight:800;padding:12px;border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;cursor:pointer;';
    var scanBtn = (_isOrg && targets.length)
      ? '<div style="font-size:15px;font-weight:800;color:var(--text-secondary,#c8cdd6);margin-bottom:8px;">🎾 Verificar histórico no letzplay (' + targets.length + ')</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:flex-start;">' +
          '<div style="flex:1;"><button type="button" id="lz-scan-btn-essential" onclick="window._lzOrgScan(\'essential\')" title="Busca rápida: só o nível real do ranking ativo" class="btn hover-lift" style="' + essCss + '">🔎 Essencial</button>' + (lastMode === 'essential' ? dateLine() : '') + '</div>' +
          '<div style="flex:1;"><button type="button" id="lz-scan-btn-full" onclick="window._lzOrgScan(\'full\')" title="Busca completa: rankings + torneios + jogos" class="btn btn-shine hover-lift" style="' + fullCss + '">📚 Completa</button>' + (lastMode === 'full' ? dateLine() : '') + '</div>' +
        '</div>'
      : (_ld ? '<div style="margin-bottom:10px;">' + dateLine() + '</div>' : '');
    // Legenda (todos os rótulos) — código de cor da verificação.
    function leg(c, txt) { return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:700;color:' + c + ';"><span style="width:11px;height:11px;border-radius:50%;background:' + c + ';"></span>' + txt + '</span>'; }
    var legend = '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:12px;">' +
      leg(_LZ_COL.red, 'deve subir') + leg(_LZ_COL.yellow, 'pode subir') + leg(_LZ_COL.blue, 'rebaixar') + leg(_LZ_COL.green, 'coerente') + leg(_LZ_COL.white, 'sem verificação') +
      '</div>';
    var hint = _isOrg ? '<div style="font-size:14px;color:var(--text-muted);margin-bottom:12px;">Arraste um nome pro box de gênero (atribui gênero) ou pra uma categoria dentro dele (atribui gênero + categoria). Salve no topo.</div>' : '';
    // Barra Cancelar/Salvar — STICKY no topo (abaixo do cabeçalho fixo), aparece só
    // quando há alteração pendente (drag de gênero/categoria).
    // Cancelar/Salvar vive na barra Voltar (rightHtml, em _renderPage) — não aqui.
    var saveBar = '';
    return '<div id="er-categories-section" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:16px 18px;margin-bottom:14px;">' +
      '<div style="font-size:15px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:var(--text-secondary,#c8cdd6);margin-bottom:8px;">🗂️ Categorias <span style="opacity:0.7;">· apuração pelo letzplay</span></div>' +
      saveBar + scanBtn + legend + hint +
      '<div id="er-cat-matrix">' + _matrixInner(rows, t) + '</div>' +
    '</div>';
  }

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
    window._lzRenderCtx = { t: t, rows: rows, profileMap: profileMap, scanMap: scanMap };   // p/ re-render in-place pós-busca
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
      return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:6px 12px;border-radius:20px;background:' + c.bg + ';color:' + c.fg + ';"><span style="width:8px;height:8px;border-radius:50%;background:' + c.fg + ';"></span>' + n + ' ' + label + '</span>';
    }
    function line(name, extra) {
      return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:0.86rem;"><span>' + _esc(name || '—') + '</span>' + (extra || '') + '</div>';
    }
    // Itens em COLUNAS (grid) pra aproveitar a largura e economizar altura.
    // minw = largura mínima da coluna (nomes simples: estreita; conhecidos c/ categoria: larga).
    function group(color, label, itemsHtml, minw) {
      if (!itemsHtml) return '';
      return '<div style="font-size:12px;font-weight:700;color:' + color + ';margin:12px 0 3px;">' + label + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(' + (minw || '150px') + ',1fr));gap:0 18px;">' + itemsHtml + '</div>';
    }
    // Anti-gato pela REGRA DA FEDERAÇÃO (pode competir ACIMA, não ABAIXO; desempenho
    // manda; campeão sobe). Só é violação quem DOMINA (título ou topo da tabela) numa
    // categoria igual/mais fácil que a declarada → deve subir. Jogar num ranking mais
    // forte SEM dominar (como quem sobe de nível aos poucos) é permitido → não sinaliza.
    // Ranks: A=0 (mais forte) … D=3, FUN=4.
    var flagged = 0;
    var _LTR = ['A', 'B', 'C', 'D', 'FUN'];
    // Junta os sinais de desempenho: banda (onde está ranqueado), categorias DOMINADAS
    // (título OU top-15% da tabela OU winPct alto), e nº de títulos.
    function _lzEvidence(champCats, rankings, bandCats) {
      var titleRanks = (champCats || []).map(function (c) { return _lzRankFrom([c]); }).filter(function (r) { return r != null; });
      var domRanks = titleRanks.slice();
      (rankings || []).forEach(function (r) {
        var cr = _lzRankFrom([r.category || r.categoryRaw]);
        if (cr == null) return;
        if (r.active === false) return;
        var topStanding = (r.position && r.fieldSize && (r.position / r.fieldSize) <= 0.15);
        var highWin = (typeof r.winPct === 'number' && r.winPct >= 70 && (r.games == null || r.games >= 6));
        if (topStanding || highWin) domRanks.push(cr);
      });
      var bandRanks = (bandCats || []).map(function (c) { return _lzRankFrom([c]); }).filter(function (r) { return r != null; });
      return {
        bandRank: bandRanks.length ? Math.min.apply(null, bandRanks) : null,
        dominatedRank: domRanks.length ? Math.min.apply(null, domRanks) : null,
        titleCount: titleRanks.length
      };
    }
    // Veredito → 5 níveis (código de cor É o status; sem palavras no item):
    //   ⚪ branco  = sem info      🟢 verde = coerente
    //   🔵 azul   = sug. rebaixar 🟡 amarelo = pode subir  🔴 vermelho = deve subir
    var _LZ_COL = { white: '#8592a6', green: '#2dd4a0', blue: '#38bdf8', yellow: '#f0b445', red: '#f26a6a' };
    function _lzVerdict(declRank, ev) {
      ev = ev || {};
      if (declRank == null) return { key: 'white', apurada: null };
      // DOMÍNIO (título/topo) numa categoria <= declarada → deve/pode subir.
      if (ev.dominatedRank != null) {
        var shouldRank = Math.max(0, ev.dominatedRank - 1); // campeão da X vai pra X-1
        if (shouldRank < declRank) {
          var strong = (declRank - shouldRank) >= 2 || (ev.titleCount || 0) >= 3;
          return { key: strong ? 'red' : 'yellow', apurada: shouldRank }; // deve / pode subir
        }
      }
      // Sem domínio: ranqueado ACIMA da declarada = pode subir; ABAIXO = sug. rebaixar.
      if (ev.bandRank != null && ev.bandRank < declRank) return { key: 'yellow', apurada: ev.bandRank };
      if (ev.bandRank != null && ev.bandRank > declRank) return { key: 'blue', apurada: ev.bandRank };
      return { key: 'green', apurada: (ev.bandRank != null ? ev.bandRank : declRank) };
    }
    // Linha de uma pessoa COM dado → { key, html }. Nome colorido pelo status + (declarada / apurada).
    function personLine(name, effSkills, ev, srcIcon) {
      var declRank = _declRankFrom(effSkills);
      var declLabel = (effSkills && effSkills.length) ? effSkills.join('/') : '—';
      var v = _lzVerdict(declRank, ev);
      var known = (declRank != null && v.apurada != null);
      var color = known ? _LZ_COL[v.key] : _LZ_COL.white;
      var apLabel = (v.apurada != null) ? _LTR[v.apurada] : '—';
      var right = '<span style="font-family:ui-monospace,Menlo,monospace;font-weight:700;color:' + color + ';">' +
        (known ? ('(' + _esc(declLabel) + ' / ' + _esc(apLabel) + ')') : '—') + ' <span style="opacity:0.5;">' + srcIcon + '</span></span>';
      var html = '<div style="padding:4px 0;font-size:0.86rem;display:flex;justify-content:space-between;gap:10px;">' +
        '<span style="color:' + color + ';font-weight:600;">' + _esc(name || '—') + '</span>' + right +
      '</div>';
      return { key: known ? v.key : 'white', html: html };
    }
    // Classifica TODOS com dado (import 🎾 ou scan 🔎) por STATUS (não por fonte).
    var buckets = { red: [], yellow: [], blue: [], green: [], white: [] };
    imp.forEach(function (o) {
      var li = o.li, oc = li.officialCategory, band = li.rating && li.rating.band;
      var champCats = (li.tournaments || []).filter(function (t) { return t.title; }).map(function (t) { return t.categoryRaw; });
      var ev = _lzEvidence(champCats, li.rankings || [], [oc ? oc.categoryRaw : '', band || '']);
      var pl = personLine(o.r.name, o.r.effectiveSkills, ev, '🎾');
      buckets[pl.key].push(pl.html);
    });
    scanned.forEach(function (o) {
      var s = o.scan;
      var ev = _lzEvidence(s.champions || [], s.rankings || [], [s.rankingCategory].concat(s.allCategories || []));
      var pl = personLine(o.r.name, o.r.effectiveSkills, ev, '🔎');
      buckets[pl.key].push(pl.html);
    });
    flagged = buckets.red.length; // 🚩 = só "deve subir" (obrigatório)
    var restHtml = function (arr) { return arr.map(function (x) { return line(x.r ? x.r.name : x.name); }).join(''); };

    // Alvos da busca ativa = TODOS que autorizaram (@ + consentimento) e ainda não
    // têm histórico PRÓPRIO importado. Inclui os já buscados (pra atualizar).
    var targets = (rows || []).filter(function (r) {
      var prof = r.uid && profileMap[r.uid];
      return prof && prof.letzplayHandle && prof.letzplayConsent === true && !prof.letzplayImport;
    }).map(function (r) { return { uid: r.uid, handle: profileMap[r.uid].letzplayHandle, name: r.name }; });
    window._lzScanCtx = { tId: t.id, targets: targets };

    // Última atualização = scan mais recente do torneio.
    var lastTs = 0;
    Object.keys(scanMap).forEach(function (uid) { var s = scanMap[uid]; if (s && s.scannedAt) { var v = Date.parse(s.scannedAt) || 0; if (v > lastTs) lastTs = v; } });
    var _ld = lastTs ? new Date(lastTs) : null;
    var lastUpdateHtml = _ld
      ? '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Última atualização: <b style="color:var(--text-bright,#fff);">' + _ld.toLocaleDateString('pt-BR') + ' ' + _ld.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</b></div>'
      : '';
    // Dois modos: ESSENCIAL (só o ranking real — rápido, pra flag) e COMPLETA (perfil
    // inteiro: rankings + torneios + jogos — pra migrar a pessoa pro scoreplace).
    var btnCss = 'flex:1;background:var(--info-pill-bg,rgba(99,102,241,0.15));border:1px solid var(--border-color);border-radius:10px;padding:11px 12px;cursor:pointer;color:var(--text-bright,#fff);font-size:0.86rem;font-weight:700;';
    var scanBtn = targets.length
      ? '<div style="display:flex;gap:8px;margin-bottom:8px;">' +
          '<button type="button" id="lz-scan-btn-essential" onclick="window._lzOrgScan(\'essential\')" title="Busca rápida: só o nível real do ranking ativo (pra conferir a categoria)" style="' + btnCss + '">🔎 Essencial (' + targets.length + ')</button>' +
          '<button type="button" id="lz-scan-btn-full" onclick="window._lzOrgScan(\'full\')" title="Busca completa: rankings + torneios + jogos (perfil inteiro do letzplay)" style="' + btnCss + '">📚 Completa (' + targets.length + ')</button>' +
        '</div>'
      : '';

    var flagBanner = flagged > 0
      ? '<div style="background:rgba(242,106,106,0.12);border:1px solid rgba(242,106,106,0.4);border-radius:10px;padding:10px 13px;margin-bottom:12px;font-size:0.86rem;color:#f26a6a;font-weight:600;">🚩 ' +
          flagged + ' inscrito' + (flagged === 1 ? '' : 's') + ' com título/domínio na categoria — deve' + (flagged === 1 ? '' : 'm') + ' subir. Confira abaixo.</div>'
      : '';
    return '<div id="lz-history-section" style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:16px 18px;margin-bottom:14px;">' +
      '<div style="font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px;">🎾 Histórico letzplay</div>' +
      scanBtn +
      lastUpdateHtml +
      // Pills = contagem por STATUS (só as 5 cores do anti-gato). Só mostra > 0.
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
        (buckets.red.length ? pill(C.red, buckets.red.length, 'deve subir') : '') +
        (buckets.yellow.length ? pill(C.amber, buckets.yellow.length, 'pode subir') : '') +
        (buckets.blue.length ? pill(C.blue, buckets.blue.length, 'rebaixar') : '') +
        (buckets.green.length ? pill(C.green, buckets.green.length, 'coerente') : '') +
        (buckets.white.length ? pill(C.grey, buckets.white.length, 'sem info') : '') +
      '</div>' +
      flagBanner +
      // Grupos por STATUS — cabeçalho na COR do status (código de cor consistente).
      group(C.red.fg, '🔴 Deve subir (título / domínio)', buckets.red.join(''), '250px') +
      group(C.amber.fg, '🟡 Pode subir (ranqueado acima)', buckets.yellow.join(''), '250px') +
      group(C.blue.fg, '🔵 Sugestão de rebaixamento', buckets.blue.join(''), '250px') +
      group(C.green.fg, '🟢 Coerente', buckets.green.join(''), '250px') +
      group(C.grey.fg, '⚪ Sem informação (com @, sem comparação)', buckets.white.join(''), '250px') +
      // Sem histórico ainda — NEUTRO (cinza), não usa as cores de status. É processo, não veredito.
      (wait.length + denied.length + noh.length > 0
        ? '<div style="font-size:12px;font-weight:700;color:var(--text-muted);margin:14px 0 3px;border-top:1px solid var(--border-color);padding-top:10px;">Sem histórico ainda</div>' +
          (wait.length ? '<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:4px;">🔎 ' + wait.length + ' autorizou — falta buscar</div>' + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0 16px;">' + restHtml(wait) + '</div>' : '') +
          (denied.length ? '<div style="font-size:0.82rem;color:var(--text-muted);margin:6px 0 4px;">🚫 ' + denied.length + ' não autorizou a busca</div>' + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0 16px;">' + restHtml(denied) + '</div>' : '') +
          (noh.length ? '<div style="font-size:0.82rem;color:var(--text-muted);margin-top:6px;">👤 ' + noh.length + ' sem @ letzplay</div>' : '')
        : '') +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:11px;border-top:1px solid var(--border-color);padding-top:9px;line-height:1.5;">Cor = nível apurado vs. declarado. 🎾 histórico importado · 🔎 perfil público buscado. A busca lê o <b>perfil público</b> do letzplay e precisa da <b>extensão no Chrome (desktop)</b>.</div>' +
      '</div>';
  }

  // compara versões "a.b.c" — a >= b?
  function _verGE(a, b) {
    a = String(a || '0').split('.').map(Number); b = String(b || '0').split('.').map(Number);
    for (var i = 0; i < Math.max(a.length, b.length); i++) { var x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; }
    return true;
  }
  var _LZ_MIN_EXT = '1.16';

  // Busca ativa: o PRÓPRIO botão vira barra de progresso 0–100% (sem modal, o
  // organizador fica na tela). Erros viram toast e o botão volta ao normal.
  window._lzOrgScan = function (mode) {
    mode = (mode === 'full') ? 'full' : 'essential';
    window._lzPendingMode = mode; // registra o modo pra gravar no scan (última verificação)
    var ctx = window._lzScanCtx;
    if (!ctx || !ctx.targets || !ctx.targets.length) return;
    var btn = document.getElementById(mode === 'full' ? 'lz-scan-btn-full' : 'lz-scan-btn-essential');
    var otherBtn = document.getElementById(mode === 'full' ? 'lz-scan-btn-essential' : 'lz-scan-btn-full');
    var origHtml = btn ? btn.innerHTML : '';
    var origBg = btn ? btn.style.background : ''; // preserva o gradiente do botão
    var pillBg = 'rgba(99,102,241,0.20)'; // trilho de fundo do progresso
    function setBtn(txt, pct) {
      if (otherBtn) otherBtn.disabled = true;
      if (!btn) return;
      btn.disabled = true;
      btn.style.background = (pct != null) ? ('linear-gradient(90deg, rgba(56,189,248,0.65) ' + pct + '%, ' + pillBg + ' ' + pct + '%)') : pillBg;
      btn.textContent = txt;
    }
    function restore() { if (otherBtn) otherBtn.disabled = false; if (btn) { btn.disabled = false; btn.style.background = origBg; btn.innerHTML = origHtml; } }
    function fail(msg) { restore(); if (typeof showNotification === 'function') showNotification('Não deu pra buscar', msg, 'error'); }
    setBtn('🔌 Conectando à extensão…', null);
    var started = false, done = false, versions = [], bestScans = {}, resultTimer = null;
    function onMsg(e) {
      if (e.source !== window) return; var d = e.data; if (!d) return;
      // Junta as versões anunciadas (pode haver content scripts órfãos) — usa a MAIOR.
      if (d.__sp_lp === 'extension-present') { if (d.version) versions.push(d.version); return; }
      if (d.__sp_lp === 'org-scan-progress' && d.tournamentId === ctx.tId) {
        var total = d.total || ctx.targets.length; var pct = total ? Math.round((d.done || 0) / total * 100) : 0;
        var who = (d.current && d.current.name) ? (' · ' + d.current.name) : '';
        setBtn('🔎 Buscando… ' + pct + '%' + who, pct);
        return;
      }
      if (d.__sp_lp === 'org-scan-result' && d.tournamentId === ctx.tId) {
        if (!d.ok) return;   // uma extensão falhou; aguarda outra (caso duplicadas)
        // Merge preferindo o scan COM categoria — cobre extensões duplicadas (uma
        // velha devolve null, uma nova devolve a categoria).
        (d.scans || []).forEach(function (s) {
          if (!s.uid) return;
          var cur = bestScans[s.uid];
          var sCat = !!(s.scan && s.scan.rankingCategory);
          var cCat = !!(cur && cur.scan && cur.scan.rankingCategory);
          if (!cur || (sCat && !cCat)) bestScans[s.uid] = s;
        });
        // debounce: espera ~2s por resultados de outras extensões, depois salva o melhor
        if (resultTimer) clearTimeout(resultTimer);
        resultTimer = setTimeout(function () {
          done = true; window.removeEventListener('message', onMsg);
          setBtn('💾 Salvando…', 100);
          _saveScansAndReload(ctx.tId, Object.keys(bestScans).map(function (u) { return bestScans[u]; }), fail);
        }, 2000);
      }
    }
    window.addEventListener('message', onMsg);
    window.postMessage({ __sp_lp: 'ext-ping' }, window.location.origin);
    setTimeout(function () {
      if (done || started) return;
      var reload = 'Recarregue a extensão pra v' + _LZ_MIN_EXT + ' em chrome://extensions, recarregue a página e tente de novo.';
      if (!versions.length) { window.removeEventListener('message', onMsg); fail('A extensão não respondeu. ' + reload); return; }
      var best = versions.reduce(function (m, v) { return _verGE(v, m) ? v : m; }, '0');
      if (!_verGE(best, _LZ_MIN_EXT)) { window.removeEventListener('message', onMsg); fail('Sua extensão está na versão ' + best + '. ' + reload); return; }
      started = true;
      setBtn('🔎 Buscando… 0%', 0);
      window.postMessage({ __sp_lp: 'run-org-scan', targets: ctx.targets, tournamentId: ctx.tId, mode: mode }, window.location.origin);
    }, 900);
    setTimeout(function () { if (done || !started) return; window.removeEventListener('message', onMsg); fail('A busca demorou demais. Tente de novo.'); }, 90000);
  };
  function _saveScansAndReload(tId, scans, onFail) {
    var ok = scans.filter(function (s) { return s.uid && s.scan; });
    var failed = scans.filter(function (s) { return !(s.uid && s.scan); });
    if (!ok.length) {
      var err = (failed[0] && failed[0].error) || 'sem dados';
      if (typeof onFail === 'function') onFail('Nenhum perfil carregado (' + err + ').');
      return;
    }
    var db = firebase.firestore();
    var meUid = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid) || null;
    var nowIso = new Date().toISOString();
    // GRAVA POR PESSOA (uid), GLOBAL — reutilizável em qualquer torneio. Puxou uma
    // vez, vale pra sempre (letzplayScans/{uid}, não mais por torneio).
    var scanMode = (window._lzPendingMode === 'full') ? 'full' : 'essential';
    var writes = ok.map(function (s) {
      if (s.scan && typeof s.scan === 'object') s.scan._mode = scanMode; // modo dentro do scan (regra Firestore não bloqueia sub-campo)
      return db.collection('letzplayScans').doc(s.uid)
        .set({ handle: s.handle, scan: s.scan, scannedAt: nowIso, scannedBy: meUid }, { merge: true });
    });
    Promise.all(writes).then(function () {
      // re-render a seção Categorias in-place, mesclando os scans novos no scanMap.
      var rctx = window._lzRenderCtx, el = document.getElementById('er-categories-section');
      if (rctx && el && rctx.t && rctx.t.id === tId) {
        var merged = Object.assign({}, rctx.scanMap || {});
        ok.forEach(function (s) { merged[s.uid] = { handle: s.handle, scan: s.scan, scannedAt: nowIso, scannedBy: meUid }; });
        var tmp = document.createElement('div');
        tmp.innerHTML = _renderCategoriesSection(rctx.rows, rctx.t, rctx.profileMap, merged);
        var newEl = tmp.firstElementChild;
        if (newEl) el.replaceWith(newEl);
      } else if (window.location.hash === '#analise/' + tId) {
        var c = document.getElementById('view-container'); if (c) window.renderEnrollmentReportPage(c, tId);
      }
      if (typeof showNotification === 'function') showNotification('Busca concluída', ok.length + ' carregado(s)' + (failed.length ? (' · ' + failed.length + ' falhou') : ''), 'success');
    }).catch(function (e) {
      if (typeof onFail === 'function') onFail('Erro ao salvar: ' + String((e && e.message) || e));
    });
  }

  function _renderPage(container, t, rows, profileMap, parts, resolvedFor, scanMap) {
    if (!container) return;
    scanMap = scanMap || {};
    var _isOrgHdr = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));
    // Cancelar/Salvar DENTRO da barra Voltar (canônico rightHtml) — sempre visível
    // com a barra fixa, nunca atrás dela. Escondido até haver alteração.
    var _saveInline = _isOrgHdr
      ? '<div id="er-mx-save-inline" style="display:none;align-items:center;gap:8px;flex-shrink:0;">' +
          '<button type="button" onclick="window._erCancelEdits()" class="btn btn-outline btn-sm hover-lift" style="flex-shrink:0;">Cancelar</button>' +
          '<button id="er-mx-save-btn" onclick="window._erSaveEdits(\'' + _esc(String(t.id)) + '\',\'' + _esc(String(t.sport || '')) + '\')" class="btn btn-success btn-sm btn-shine hover-lift" style="flex-shrink:0;">💾 Salvar</button>' +
        '</div>'
      : '';
    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({
        href: '#tournaments/' + t.id,
        label: 'Voltar',
        middleHtml: '<span style="flex:1;font-size:0.88rem;font-weight:700;color:var(--text-bright);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📊 Análise de Inscritos</span>',
        rightHtml: _saveInline,
      })
      : '';

    var tName = _esc(t.name || 'Torneio');
    var subtitle = '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:14px;">' + tName + '</div>';

    // Estado vivo pra busca/sort/filtros da lista de inscritos.
    var _isOrg = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));
    _liveState = { rows: rows, t: t, isOrg: _isOrg };
    _pendingEdits = {}; // v2.4.34: cada carga da página começa sem edições pendentes

    container.innerHTML = hdr +
      '<div style="max-width:100%;margin:0 auto;padding:1rem 1.25rem;">' +
      subtitle +
      // Seção ÚNICA: Categorias com apuração pelo letzplay (busca + legenda + matriz
      // drag-and-drop). Visão geral, distribuição por categoria e lista de inscritos
      // foram consolidadas aqui (v1.15.44).
      _renderCategoriesSection(rows, t, profileMap, scanMap) +
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
    container.innerHTML = hdr + '<div style="max-width:100%;margin:0 auto;padding:1rem 1.25rem;">' + loaderHtml + '</div>';
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

    // Loading = tela RICA (window._showLoading: bola + barra) SÓ na primeira carga.
    // No re-render (a seção já existe) não mostra loader nenhum — troca silenciosa.
    var _firstLoad = !(container && container.querySelector && container.querySelector('#er-categories-section'));
    function _doneLoading() { if (typeof window._hideLoading === 'function') window._hideLoading(); }
    if (_firstLoad) {
      if (typeof window._showLoading === 'function') window._showLoading('Carregando análise dos inscritos…');
      else _renderLoading(container, t);
    }

    // v1.3.24-beta: _fetchProfiles tenta rescue por email/displayName sem uid.
    // v1.15.35: os scans letzplay são GLOBAIS por uid (letzplayScans/{uid}) — precisamos
    // dos perfis primeiro pra saber quem autorizou-sem-import, e só então buscar os scans.
    _fetchProfiles(parts).then(function (fetchResult) {
      if (window.location.hash !== '#analise/' + tId) { _doneLoading(); return; }
      var byUid = fetchResult.byUid || {};
      // candidatos = inscritos com @ + consentimento, sem import próprio.
      var candUids = parts.filter(function (p) {
        var prof = p.uid && byUid[p.uid];
        return prof && prof.letzplayHandle && prof.letzplayConsent === true && !prof.letzplayImport;
      }).map(function (p) { return p.uid; });
      _fetchGlobalScans(candUids).then(function (scanMap) {
        if (window.location.hash !== '#analise/' + tId) { _doneLoading(); return; }
        var rows = _buildRows(t, parts, fetchResult);
        window._log('[EnrollmentReport] profiles:', Object.keys(byUid).length, 'scans:', Object.keys(scanMap).length);
        _renderPage(container, t, rows, byUid, parts, fetchResult.resolvedFor || {}, scanMap);
        _doneLoading();
      });
    }).catch(function (err) {
      window._error('[EnrollmentReport] erro:', err);
      _doneLoading();
      if (window.location.hash !== '#analise/' + tId) return;
      var rows = _buildRows(t, parts, { byUid: {}, resolvedFor: {} });
      _renderPage(container, t, rows, {}, parts, {}, {});
    });
  };

  // Scans letzplay GLOBAIS por uid (letzplayScans/{uid}) — reutilizáveis entre torneios.
  // Busca só os uids relevantes (autorizaram-sem-import) → poucos reads.
  function _fetchGlobalScans(uids) {
    try {
      var db = firebase.firestore();
      var uniq = {}; (uids || []).forEach(function (u) { if (u) uniq[u] = 1; });
      var list = Object.keys(uniq);
      if (!list.length) return Promise.resolve({});
      return Promise.all(list.map(function (u) {
        return db.collection('letzplayScans').doc(u).get()
          .then(function (d) { return d.exists ? { uid: u, data: d.data() } : null; })
          .catch(function () { return null; });
      })).then(function (arr) { var m = {}; arr.forEach(function (x) { if (x) m[x.uid] = x.data; }); return m; });
    } catch (e) { return Promise.resolve({}); }
  }

  // Compat: preserva _openEnrollmentReport pra todos os call-sites antigos —
  // navega pra hash #analise/<tId> que dispara renderEnrollmentReportPage.
  window._openEnrollmentReport = function (tId) {
    if (!tId) return;
    window.location.hash = '#analise/' + tId;
  };


})();
