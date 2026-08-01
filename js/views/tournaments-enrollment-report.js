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
  // GÊNERO DE PESSOA é só Fem ou Masc. "Misto" é CATEGORIA (fem e masc jogando juntos) e
  // NUNCA gênero de ninguém — quando aparece no campo `gender` de um inscrito, é resíduo de
  // atribuição de categoria escrita no lugar errado. Contar isso na linha "por gênero" dava
  // a pílula sem sentido que o dono viu: "Misto 3" no meio de Fem 91 e Masc 14.
  // `_genderLabel` continua entendendo os rótulos de CATEGORIA (usado no casamento
  // categoria×inscrito); quem fala de PESSOA usa `_personGender`.
  function _personGender(g) {
    var L = _genderLabel(g);
    return (L === 'Fem' || L === 'Masc') ? L : null;
  }
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
      var gLabel = _personGender(r.gender) || 'sem';
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
    // sem pílula de "Misto" aqui: ninguém TEM gênero misto. Quem estiver com esse resíduo
    // no perfil cai em "sem gênero", que é a verdade — e é acionável (dá pra corrigir).
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
        var gLabel = _personGender(r.gender);
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
    var gMap = { Fem: { l: '♀ Fem', c: '236,72,153' }, Masc: { l: '♂ Masc', c: '59,130,246' } };
    var gl = _personGender(r.gender);
    var rowGVal = gl === 'Fem' ? 'feminino' : (gl === 'Masc' ? 'masculino' : '');
    var curG = (pe && 'gender' in pe) ? pe.gender : rowGVal;
    var gBadge;
    if (isOrg) {
      var glCur = curG === 'feminino' ? 'Fem' : (curG === 'masculino' ? 'Masc' : null);
      var gc = (glCur && gMap[glCur]) ? gMap[glCur].c : '148,163,184';
      var gOpt = function (v, lbl) { return '<option value="' + v + '"' + (curG === v ? ' selected' : '') + '>' + lbl + '</option>'; };
      gBadge = '<select title="Editar gênero do inscrito" onchange="window._erStageGender(' + r.order + ',this.value)" ' +
        'style="font-size:0.68rem;font-weight:700;color:rgb(' + gc + ');background:rgba(' + gc + ',0.14);border:1px solid rgba(' + gc + ',0.35);border-radius:6px;padding:2px 6px;cursor:pointer;-webkit-appearance:none;appearance:none;">' +
        // sem opção "Misto": o organizador não pode gravar uma CATEGORIA no campo de
        // gênero de uma pessoa — foi assim que 3 inscritos ficaram com gender='misto'.
        gOpt('', '? Sem gên. ✎') + gOpt('feminino', '♀ Fem') + gOpt('masculino', '♂ Masc') +
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
  // white = NÃO AUTORIZOU (branco puro) · violet = autorizou mas ainda não verificado.
  // O estado "sem verificação" (cinza) foi removido: agora todo nome é ou verificado
  // (verde/amarelo/azul/vermelho), ou autorizado-aguardando (violeta), ou não-autorizou
  // (branco). Ver _erApplyLzToRows.
  var _LZ_COL = { white: '#f3f4f6', violet: '#a78bfa', green: '#2dd4a0', blue: '#38bdf8', yellow: '#f0b445', red: '#f26a6a' };
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
  function _lzVerdict(declRank, ev, apuradoRank) {
    ev = ev || {};
    // SEM nível declarado, mas COM nível apurado no letzplay → COERENTE (verde), e o
    // apurado vira a categoria. Não há divergência possível: o número veio do próprio
    // letzplay, então não tem como ser incoerente com ele. Antes isto caía em 'white'
    // e a pessoa ficava ROXA ("autorizou, aguardando") mesmo com o perfil lido com
    // sucesso — só saía do roxo quando ELA MESMA logava no app e o _selfPopulate
    // gravava o skillBySport. Caso real: Flavia Campion, scan OK (Fem D+/C-, apurado D),
    // roxa porque skillBySport={} — enquanto a Kelly, que tinha logado depois do scan,
    // ficou verde. A leitura do organizador não pode depender do login do inscrito.
    if (declRank == null) {
      return (apuradoRank != null)
        ? { key: 'green', apurada: apuradoRank }
        : { key: 'white', apurada: null };
    }
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
  // O scan capturou TUDO o que o perfil do letzplay diz que existe? O próprio perfil
  // declara os totais ("3 Rankings · 2 Torneios · 66 Jogos") e nós contamos o que veio —
  // então a incompletude é AUTO-DECLARADA, não inferida. Medido em produção (14/jul):
  // os 4 inscritos declaravam torneios e capturaram menos do que declaram.
  // Sem total declarado (dado antigo) não dá pra afirmar completude → trata como incompleto.
  // O AUTOIMPORT trouxe tudo? Agora dá pra AFIRMAR em vez de presumir: o import guarda
  // `declaredGames` — quantos o letzplay declara na própria página ("81 Jogos • 36 Vit").
  // 81 declarados e 81 guardados = completo. Sem o campo (import anterior à v1.39) caímos
  // no antigo "se salvou, paginou tudo" — que era verdade só porque falhar não salvava;
  // agora que salvamos parcial, presumir seria absolver dado pela metade.
  // Quantos jogos o import REPRESENTA (≠ quantos couberam no doc) — ver
  // window._lzGamesTotal em store.js. Atalho local com fallback pra ordem de carga.
  function _lzTot(imp) {
    if (typeof window._lzGamesTotal === 'function') return window._lzGamesTotal(imp);
    if (!imp) return 0;
    return (imp.gamesTotal != null) ? imp.gamesTotal : ((imp.games || []).length);
  }
  // TORNEIO LIDO ≠ torneio conhecido — e é UMA regra, num lugar só, porque a tela mostra
  // esse número em dois pontos (as 3 barras do dialog e as 3 barras do overlay ao vivo) e
  // eles divergiram: o overlay contava "conhecido" e nascia em "35 de 35 (100%)" com a
  // leitura ainda no torneio 16. Um id de torneio entra no footprint só porque algum jogo o
  // citou; LIDO é ter aberto a página dele, o que se prova pela CLASSIFICAÇÃO ou pelo NOME
  // real resolvido (a categoria crua não conta como nome).
  // ── LISTA DE TORNEIOS DO ATLETA (dialog "Puxar histórico") ────────────────────
  // Uma linha por torneio: DATA · nome · CATEGORIA · CLASSIFICAÇÃO, em cores distintas,
  // ordenada do mais recente pro mais antigo. Pedido do dono (30/jul): _"precisa colocar
  // as datas aqui. e ordenar em ordem cronológica inversa. Tem que ter a categoria e a
  // classificação… dando destaque com cores"_.
  var _LZ_C_DATA = '#7dd3fc';   // data       — azul-céu
  var _LZ_C_CAT = '#a78bfa';    // categoria  — violeta (a cor do letzplay no app)
  var _LZ_C_POS = '#fbbf24';    // colocação  — âmbar (pódio)
  var _LZ_C_TRILHA = '#f3f4f6'; // trilha     — BRANCO (é contexto, não classificação)

  function _lzPad2(n) { return (n < 10 ? '0' : '') + n; }
  var _LZ_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  // Data de CALENDÁRIO montada dos componentes (nunca parse de string, nunca UTC) — ver
  // js/letzplay-model.js dateParts. A data que o atleta vê é a data em que jogou.
  function _lzFmtDataNum(n) {
    var M = window._spLzModel;
    var p = (M && M.dateParts) ? M.dateParts(n) : null;
    if (!p) return null;
    return _lzPad2(p.d) + ' ' + (_LZ_MES[p.m - 1] || '') + ' ' + String(p.y).slice(2);
  }
  // Data do torneio = a do jogo MAIS RECENTE dela ali. O footprint só guarda o ano; a data
  // real vive nos jogos. Quando o jogo daquele torneio está fora do recorte do doc (o doc
  // carrega os mais recentes), sobra o ano — que é melhor que nada e nunca mente.
  // Data do jogo → número comparável (aaaammdd). Usa o modelo canônico quando ele está
  // carregado e, se não estiver, lê o dd/mm/aa em QUALQUER posição da string — o letzplay
  // manda "Quarta, 29/07/26 às 08:00hs", com o dia da semana na frente.
  function _lzDataNumDe(d) {
    var M = window._spLzModel;
    var n = (M && typeof M.dateNum === 'function') ? (M.dateNum(d) || 0) : 0;
    if (n) return n;
    var m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return 0;
    var ano = +m[3]; if (ano < 100) ano += 2000;
    return ano * 10000 + (+m[2]) * 100 + (+m[1]);
  }
  // Data de cada competição = a do jogo MAIS RECENTE dela. Indexa torneio E ranking: a aba
  // de rankings precisa ordenar igual à de torneios.
  function _lzTourneyDateIdx(imp) {
    var out = {};
    ((imp && imp.games) || []).forEach(function (g) {
      if (!g) return;
      var id = (g.tourneyId != null) ? ('t/' + (g.club || '') + '/' + g.tourneyId)
             : ((g.rankingId != null) ? ('r/' + (g.club || '') + '/' + g.rankingId) : null);
      if (!id) return;
      var n = _lzDataNumDe(g.date);
      if (!n) return;
      if (!out[id] || n > out[id]) out[id] = n;
    });
    return out;
  }
  function _lzMedalha(pos) {
    return pos === 1 ? '🥇' : (pos === 2 ? '🥈' : (pos === 3 ? '🥉' : '🏅'));
  }
  // O nome real do letzplay quase sempre TERMINA na categoria ("… Ortobom - DUPLA FEMININA
  // D"). Se a gente só evitasse repetir, a categoria ficava dentro do nome e portanto SEM
  // cor — o pedido do dono era exatamente destacá-la. Então tiramos o sufixo do nome e a
  // categoria vira sempre um campo próprio, colorido. Bônus: encurta nomes que ocupavam 3
  // linhas na caixa.
  // "Ver trilha de X/Y" é o caminho da DUPLA na chave, não a categoria — e por um erro de
  // parse foi gravado no campo da categoria. Aqui ele é reconhecido, tirado de lá e
  // mostrado no fim da linha, em BRANCO (pedido do dono: "dá pra deixar isso branco e o
  // feminina C nesse roxo?").
  function _lzEhTrilha(s) { return /ver\s+trilha|trilha\s+de/i.test(String(s || '')); }
  // Isto se parece com uma categoria? ("Feminina C", "DUPLA FEMININA D", "CAT. FUN
  // FEMININO", "Mista FUN"). Serve pra rejeitar o que caiu no campo por engano.
  function _lzPareceCategoria(s) {
    var t = String(s || '').trim();
    if (!t || t.length > 40 || _lzEhTrilha(t)) return false;
    if (/(masculin|feminin|mist[ao]|\bmasc\b|\bfem\b)/i.test(t)) return true;
    return t.length <= 20 && /(^|[\s\/])(FUN|[A-D])\s*[+\-]?\s*($|[\s\/])/i.test(t);
  }
  // Categoria a partir do NOME real: o letzplay escreve "<evento> - <categoria>", então o
  // último trecho depois de " - " costuma ser ela. É o que salva os imports cujo
  // `categoryRaw` está contaminado — a categoria estava lá, só não no campo dela.
  function _lzCatDoNome(nome) {
    var partes = String(nome || '').split(/\s+[-–—]\s+/);
    if (partes.length < 2) return null;
    var ult = partes[partes.length - 1].trim();
    return _lzPareceCategoria(ult) ? ult : null;
  }
  function _lzSplitCat(nome, cat) {
    var n = String(nome || '').trim();
    if (!cat) return { nome: n, cat: null };
    var c = String(cat).trim();
    var low = n.toLowerCase(), lowc = c.toLowerCase();
    if (low.length > lowc.length && low.slice(-lowc.length) === lowc) {
      var corte = n.slice(0, n.length - c.length).replace(/[\s\-–—·.,:]+$/, '').trim();
      if (corte) return { nome: corte, cat: c };
    }
    // categoria aparece no meio do nome → não mexe (cortar ali mutilaria o nome)
    if (low.indexOf(lowc) >= 0) return { nome: n, cat: null };
    return { nome: n, cat: c };
  }
  window._lzTourneyRows = function (imp, handle, kind) {
    if (!imp) return '';
    var _rank = (kind === 'rank');
    var _pre = _rank ? 'r/' : 't/';
    var datas = _lzTourneyDateIdx(imp);
    var linhas = [], vistos = {}, porId = {};
    ((imp.footprint) || []).forEach(function (f) {
      if (!f || (!!f.official === _rank)) return;
      var k = _pre + (f.club || '') + '/' + (_rank ? (f.rankingId || '') : (f.tourneyId || ''));
      vistos[k] = 1;
      // UMA LINHA POR TORNEIO. Imports antigos têm o footprint fragmentado (o mesmo torneio
      // em várias entradas, uma por trilha de dupla) — sem isto a lista repetia o mesmo
      // torneio 3, 4 vezes, que é como o dono viu "2º Final's Ranking 7BTW" duplicado.
      var nomeBruto = f.name || f.categoryRaw || 'torneio';
      var cat = _lzPareceCategoria(f.categoryRaw) ? String(f.categoryRaw).trim() : _lzCatDoNome(nomeBruto);
      var part = _lzSplitCat(nomeBruto, cat);
      var trilha = _lzEhTrilha(f.categoryRaw) ? String(f.categoryRaw).trim() : null;
      var pos = _lzMyPosIn(f.standings, handle);
      var ja = porId[k];
      if (ja) {
        // funde: a melhor colocação e a primeira categoria/trilha conhecidas vencem
        if (ja.pos == null || (pos != null && pos < ja.pos)) ja.pos = pos;
        if (!ja.cat && part.cat) ja.cat = part.cat;
        if (!ja.trilha && trilha) ja.trilha = trilha;
        if (!ja.data && datas[k]) ja.data = _lzFmtDataNum(datas[k]);
        return;
      }
      porId[k] = {
        lido: true, ord: datas[k] || 0, nome: part.nome, cat: part.cat, trilha: trilha,
        data: datas[k] ? _lzFmtDataNum(datas[k]) : (f.year ? String(f.year) : null),
        pos: pos
      };
      linhas.push(porId[k]);
    });
    // AINDA NÃO LIDOS: a lista pública vem do mais recente pro mais antigo, então a posição
    // nela é a única noção de tempo que temos deles — vão no fim, nessa mesma ordem.
    var pend = 0;
    ((_rank ? imp.rankingsList : imp.tournamentsList) || []).forEach(function (p) {
      var _pid = _rank ? p && p.rid : p && p.tid;
      if (!p || !_pid) return;
      if (vistos[_pre + (p.club || '') + '/' + _pid]) return;
      pend++;
      var pn = p.title || ((_rank ? 'ranking ' : 'torneio ') + _pid);
      var pc = _lzCatDoNome(pn);                       // o título da lista já traz a categoria
      var pp = _lzSplitCat(pn, pc);
      linhas.push({ lido: false, ord: -pend, nome: pp.nome, cat: pp.cat, trilha: null, data: null, pos: null });
    });
    if (!linhas.length) return '';
    // cronológica INVERSA; sem data (não lido) desce, preservando a ordem da lista pública
    linhas.sort(function (a, b) { return b.ord - a.ord; });
    // ORDEM DOS CAMPOS (pedido do dono): data · nome · CATEGORIA · CLASSIFICAÇÃO · trilha.
    // A trilha vem por último e em BRANCO — ela é contexto (com quem ela jogou), não
    // classificação nem categoria, e disputava a atenção quando estava colorida.
    return linhas.map(function (L) {
      var h = '<div style="padding:2px 0;">' + (L.lido ? (_rank ? '📊 ' : '🏆 ') : '⏳ ');
      if (L.lido && L.data) h += '<span style="color:' + _LZ_C_DATA + ';font-variant-numeric:tabular-nums;">' + _esc(L.data) + '</span> · ';
      h += '<span' + (L.lido ? '' : ' style="opacity:0.6;"') + '>' + _esc(L.nome) + '</span>';
      if (L.cat) h += ' · <span style="color:' + _LZ_C_CAT + ';font-weight:700;">' + _esc(L.cat) + '</span>';
      if (L.pos != null) h += ' · <span style="color:' + _LZ_C_POS + ';font-weight:800;">' + _lzMedalha(L.pos) + ' ' + L.pos + 'º</span>';
      if (L.trilha) h += ' · <span style="color:' + _LZ_C_TRILHA + ';">' + _esc(L.trilha) + '</span>';
      if (!L.lido) h += ' · <span style="opacity:0.5;">ainda não lido</span>';
      return h + '</div>';
    }).join('');
  };

  // JUNTA O QUE É DO SCOREPLACE às abas do diálogo. Assíncrono de propósito: o histórico
  // do letzplay já está em memória e abre na hora; o do scoreplace é uma leitura do
  // Firestore e entra quando chega. Competição do app vai pra RANKINGS quando é Pontos
  // Corridos (temporada contínua, o equivalente ao ranking do letzplay) e pra TORNEIOS no
  // resto — é a mesma distinção que o letzplay faz.
  // JOGOS DO SCOREPLACE DE OUTRA PESSOA: NÃO vêm de users/{uid}/matchHistory. A regra do
  // Firestore só libera esse caminho pro PRÓPRIO dono (firestore.rules: `request.auth.uid
  // == userId`), então a leitura do organizador voltava permission-denied, o catch devolvia
  // [] e a aba de jogos ficava só com o letzplay — sem dizer nada. Afrouxar a regra seria
  // expor o histórico de qualquer um; a fonte certa é a que o organizador JÁ pode ver: os
  // TORNEIOS dele. Se a pessoa jogou num torneio que ele organiza ou disputa, aquelas
  // partidas são visíveis por definição.
  // ── OS JOGOS DO SCOREPLACE DE QUALQUER PESSOA ─────────────────────────────────
  // Regra do dono (01/ago/2026): _"os jogos do scoreplace entre os jogos do letzplay devem
  // aparecer para TODOS os usuários... tem que estar no perfil de qualquer um que tenha
  // jogo no scoreplace, MESMO SEM AUTORIZAÇÃO DO LETZPLAY"_. Faz sentido: jogo feito aqui
  // é nosso registro, não depende de o atleta ter autorizado a leitura de outro site.
  //
  // POR QUE NÃO APARECIA NADA: eu lia o placar de `m.p1Score` no objeto da partida. O
  // placar não mora mais ali desde que virou documento próprio —
  // `tournaments/{id}/results/{matchId}`, com `playerUids[]`. Medido em 01/ago no banco
  // real: dos torneios carregados, ZERO partidas tinham p1Score; e os `results` tinham
  // tudo (placar, sets, vencedor, quando). Então a lista do scoreplace vinha vazia pra
  // todo mundo — inclusive pra quem tem jogo comigo semana passada.
  //
  // A busca é UMA query, por uid, sem carregar torneio: collectionGroup('results') com
  // array-contains em playerUids. É o mesmo caminho que o dashboard já usa.
  function _lzJogosDoScoreplace(uid) {
    var db = window.FirestoreDB && window.FirestoreDB.db;
    if (!db || !uid) return Promise.resolve([]);
    return db.collectionGroup('results').where('playerUids', 'array-contains', uid).limit(400).get()
      .then(function (qs) {
        var out = [];
        qs.forEach(function (d) {
          var r = d.data() || {};
          var meu = -1;
          // de que lado ela jogou: o nome do slot contém o nome dela? não — uid manda.
          // `results` guarda os uids num array só, então o lado sai dos uids por slot
          // quando existirem; senão, do nome (último recurso, e só pra escolher o lado).
          if (Array.isArray(r.p1Uids) && r.p1Uids.indexOf(uid) >= 0) meu = 0;
          else if (Array.isArray(r.p2Uids) && r.p2Uids.indexOf(uid) >= 0) meu = 1;
          if (meu < 0) {
            var nome = _lzNomeDoUid(uid);
            if (nome && String(r.p1 || '').indexOf(nome) >= 0) meu = 0;
            else if (nome && String(r.p2 || '').indexOf(nome) >= 0) meu = 1;
          }
          if (meu < 0) return;                       // não dá pra dizer o lado: não inventa
          var meuNome = meu === 0 ? r.p1 : r.p2, outro = meu === 0 ? r.p2 : r.p1;
          var meuSc = meu === 0 ? r.scoreP1 : r.scoreP2, outroSc = meu === 0 ? r.scoreP2 : r.scoreP1;
          var venceu = (r.draw === true) ? null : (r.winner != null ? (String(r.winner) === String(meuNome)) : null);
          out.push({
            ts: (typeof window._spTsData === 'function')
                  ? window._spTsData(r.resultAt || r.updatedAt || r.startedAt || 0, { fallback: 0 })
                  : (r.resultAt || 0),
            source: 'scoreplace', sport: r.sport || '', official: true,
            venue: r.venue || '',
            competition: r.tournamentName || 'Torneio',
            competitionLabel: 'Torneio' + (r.tournamentName ? ' · ' + r.tournamentName : '') +
                              (r.roundLabel ? ' · ' + r.roundLabel : ''),
            tournamentId: r.tournamentId || null, tournamentFormat: r.format || '',
            opponent: outro || '—', partner: null,
            result: (venceu === true) ? 'V' : (venceu === false ? 'D' : (r.draw ? 'E' : '?')),
            scoreA: (meuSc != null) ? String(meuSc) : '',
            scoreB: (outroSc != null) ? String(outroSc) : ''
          });
        });
        return out;
      })
      .catch(function (e) {
        window._warn && window._warn('[letzplay] jogos do scoreplace não vieram:', (e && e.message) || e);
        return [];
      });
  }
  // ── PARTIDAS CASUAIS ──────────────────────────────────────────────────────────
  // "torneios ou casuais. diferenciados." (dono). O card já distingue pelo selo e pela
  // linha de contexto: torneio mostra o nome do torneio e a fase; casual diz "Partida
  // casual". `casualMatches` tem `playerUids` e é leitura pública, então vale pra
  // qualquer pessoa — sem depender de autorização nenhuma.
  function _lzCasuaisDoScoreplace(uid) {
    var db = window.FirestoreDB && window.FirestoreDB.db;
    if (!db || !uid) return Promise.resolve([]);
    return db.collection('casualMatches').where('playerUids', 'array-contains', uid).limit(200).get()
      .then(function (qs) {
        var out = [];
        qs.forEach(function (d) {
          var c = d.data() || {};
          if (c.status !== 'finished' || !c.result) return;
          var jog = Array.isArray(c.players) ? c.players : [];
          var eu = null;
          for (var i = 0; i < jog.length; i++) if (jog[i] && jog[i].uid === uid) { eu = jog[i]; break; }
          if (!eu) return;
          var meuTime = eu.team || 1, outroTime = meuTime === 1 ? 2 : 1;
          function lado(t) {
            return jog.filter(function (j) { return j && (j.team || 1) === t; })
                      .map(function (j) { return j.name || 'Jogador'; }).join(' / ');
          }
          var par = jog.filter(function (j) { return j && (j.team || 1) === meuTime && j.uid !== uid; })
                       .map(function (j) { return j.name; })[0] || null;
          // o placar do casual vem no resumo ("6-0"); os campos p1/p2Score podem vir nulos
          var sm = String((c.result && c.result.summary) || '');
          var mm = sm.match(/(\d+)\s*[-x–]\s*(\d+)/);
          var a = (c.result.p1Score != null) ? c.result.p1Score : (mm ? +mm[1] : null);
          var b = (c.result.p2Score != null) ? c.result.p2Score : (mm ? +mm[2] : null);
          if (meuTime === 2) { var t = a; a = b; b = t; }
          var venceu = (c.result.winner != null) ? (Number(c.result.winner) === meuTime) : null;
          out.push({
            ts: (typeof window._spTsData === 'function')
                  ? window._spTsData(c.finishedAt || c.lastActivityAt || 0, { fallback: 0 })
                  : 0,
            source: 'scoreplace', sport: c.sport || '', official: false,
            venue: c.venueName || '',
            competition: 'Partida casual',
            competitionLabel: 'Partida casual',
            tournamentId: null, tournamentFormat: '',
            opponent: lado(outroTime) || '—', partner: par,
            result: (venceu === true) ? 'V' : (venceu === false ? 'D' : '?'),
            scoreA: (a != null) ? String(a) : '', scoreB: (b != null) ? String(b) : ''
          });
        });
        return out;
      })
      .catch(function (e) {
        window._warn && window._warn('[letzplay] casuais não vieram:', (e && e.message) || e);
        return [];
      });
  }
  function _lzNomeDoUid(uid) {
    var r = window._lzRenderCtx || {};
    var p = (r.profiles && r.profiles[uid]) || null;
    return (p && (p.displayName || p.name)) || null;
  }

  function _lzJuntarScoreplace(uid, meNome) {
    if (!uid) return;
    var proprio = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid) === uid;
    // pro PRÓPRIO usuário o matchHistory é legível e é mais completo (inclui casuais);
    // pros outros, o que dá pra ver são os torneios em comum.
    // O PRÓPRIO usuário tem matchHistory legível (inclui casuais); pra QUALQUER pessoa,
    // os jogos de torneio vêm dos documentos de placar, que são legíveis por qualquer
    // autenticado. Ninguém mais fica sem os próprios jogos por não ter autorizado nada.
    var fonte = (proprio && typeof window._spScoreplaceItems === 'function')
      ? Promise.resolve(window._spScoreplaceItems(uid))
      : Promise.all([_lzJogosDoScoreplace(uid), _lzCasuaisDoScoreplace(uid)])
          .then(function (r) { return r[0].concat(r[1]); });
    fonte.then(function (itens) {
      itens = (itens || []).filter(Boolean);
      if (!itens.length) return;
      var A = window._lzAbas || (window._lzAbas = {});

      // ── jogos: entram na MESMA lista, que é reordenada por data ──
      if (typeof window._spGameCard === 'function' && typeof window._lzRenderJogos === 'function') {
        window._lzGameItens = (window._lzGameItens || []).concat(itens);
        A.jogo = window._lzRenderJogos(meNome);
      }

      // ── competições: uma linha por torneio/ranking do app ──
      var porComp = {};
      itens.forEach(function (it) {
        if (!it.official) return;                       // casual não é competição
        var k = it.tournamentId || ('nome:' + (it.competition || ''));
        var b = porComp[k] || (porComp[k] = { nome: it.competition || 'Torneio', ts: 0, fmt: it.tournamentFormat || '' });
        if ((it.ts || 0) > b.ts) b.ts = it.ts || 0;
      });
      var linhasT = [], linhasR = [];
      Object.keys(porComp).forEach(function (k) {
        var c = porComp[k];
        var liga = (typeof window._isLigaFormat === 'function') ? window._isLigaFormat(c.fmt) : /liga|ranking|pontos corridos/i.test(c.fmt || '');
        var d = c.ts ? new Date(c.ts) : null;
        var data = d ? (_lzPad2(d.getDate()) + ' ' + (_LZ_MES[d.getMonth()] || '') + ' ' + String(d.getFullYear()).slice(2)) : null;
        var h = '<div style="padding:2px 0;">🏆 ' +
          (data ? '<span style="color:' + _LZ_C_DATA + ';font-variant-numeric:tabular-nums;">' + _esc(data) + '</span> · ' : '') +
          '<span>' + _esc(c.nome) + '</span> · ' +
          '<span style="color:#818cf8;font-weight:700;">scoreplace</span></div>';
        (liga ? linhasR : linhasT).push({ ts: c.ts, h: h });
      });
      function juntar(alvo, lista) {
        if (!lista.length) return;
        lista.sort(function (a, b) { return b.ts - a.ts; });
        A[alvo] = (A[alvo] || '') + lista.map(function (x) { return x.h; }).join('');
      }
      juntar('tour', linhasT);
      juntar('rank', linhasR);
      // O NÚMERO DA ABA TAMBÉM É DAS DUAS FONTES. Ele era carimbado no HTML com o total do
      // letzplay e nunca mais mexido — então os jogos do app entravam na lista e a aba
      // continuava dizendo o número antigo. Pior: quando não havia nenhum jogo do app, não
      // dava pra saber se era "não tem" ou "não procurou". Agora o número se mexe.
      window._lzAbaNum('jogo', (window._lzGameItens || []).length);
      window._lzAbaNum('tour', linhasT.length, true);
      window._lzAbaNum('rank', linhasR.length, true);

      // repinta a aba aberta, se o diálogo ainda está na tela
      var abas = document.getElementById('lz-abas');
      if (!abas) return;
      var ativo = [].slice.call(abas.querySelectorAll('[data-lz-aba]')).filter(function (b) {
        return b.style.color === 'rgb(255, 255, 255)' || b.getAttribute('data-lz-ativo') === '1';
      })[0];
      window._lzAba((ativo && ativo.getAttribute('data-lz-aba')) || 'tour');
    }).catch(function () {});
  }

  // ── A LEITURA SÓ AVANÇOU SE A ESCRITA FOI CONFIRMADA ──────────────────────────
  // 31/jul/2026: as regras do Firestore rejeitaram todo write em letzplayScans (campo novo
  // fora da whitelist) e a tela seguiu subindo as barras — "33 de 33 (100%)" com ZERO
  // gravado. O progresso vinha da extensão, que de fato leu; mas ler não é gravar, e a
  // tela mostrava leitura como se fosse registro.
  // É a MESMA regra que já vale pro convite de co-organização desde a 1.6.9: só existe
  // "aconteceu" depois da escrita CONFIRMADA. Aqui ela passa a valer pro histórico.
  window._lzGravouOk = true;
  function _lzFalhouGravar(em) {
    window._lzGravouOk = false;
    window._lzUltimoErroGravacao = String(em || '').slice(0, 160);
    if (typeof window._lzAvisarFalhaGravacao === 'function') {
      try { window._lzAvisarFalhaGravacao(window._lzUltimoErroGravacao); } catch (e) {}
    }
  }

  // Ações da barra do topo — fazem exatamente o que os botões do rodapé fazem.
  // A barra do topo DISPARA OS BOTÕES NATIVOS (que ficam escondidos). Assim o caminho de
  // fechar e o de confirmar continuam sendo um só — sem duplicar callback nem correr o
  // risco de a barra fechar o diálogo por fora e o `onConfirm` nunca rodar.
  function _lzBotaoNativo(id) {
    var d = document.getElementById('custom-confirm-dialog');
    return d ? d.querySelector('#' + id) : null;
  }
  window._lzFecharDialogo = function () {
    var b = _lzBotaoNativo('confirm-cancel-btn');
    if (b) { b.click(); return; }
    var d = document.getElementById('custom-confirm-dialog');
    if (d && d.parentNode) d.parentNode.removeChild(d);
  };
  window._lzPuxarDoTopo = function () {
    var b = _lzBotaoNativo('confirm-ok-btn');
    if (b) { b.click(); return; }
    // sem diálogo na tela (chamada solta): faz o que o botão faria
    var uid = window._lzDialogUid;
    if (!uid) return;
    try { window._lzAthleteImport(uid); }
    catch (e) {
      var m = (e && (e.stack || e.message)) || String(e);
      if (window._warn) window._warn('[letzplay] falha ao iniciar leitura:', m);
      if (typeof showNotification === 'function') showNotification('Não deu pra iniciar a leitura', String(m).slice(0, 120), 'error');
    }
  };

  // Troca a aba visível. Só mexe no innerHTML da caixa — nada de re-renderizar o diálogo
  // (que apagaria a barra de progresso de uma leitura em curso).
  // Soma (ou fixa) o número exibido na aba. `somar` = acrescenta ao que já está lá.
  window._lzAbaNum = function (qual, n, somar) {
    var abas = document.getElementById('lz-abas'); if (!abas) return;
    var b = abas.querySelector('[data-lz-aba="' + qual + '"]'); if (!b) return;
    var sp = b.querySelector('span'); if (!sp) return;
    var atual = parseInt(sp.textContent, 10) || 0;
    sp.textContent = String(somar ? (atual + (n || 0)) : (n || 0));
  };
  window._lzAba = function (qual) {
    var box = document.getElementById('lz-aba-box');
    if (!box) return;
    var A = window._lzAbas || {};
    var vazio = { tour: 'Nenhum torneio lido ainda.', rank: 'Nenhum ranking lido ainda.', jogo: 'Nenhum jogo gravado ainda.' };
    box.innerHTML = A[qual] || ('<div style="opacity:0.6;padding:6px 0;">' + (vazio[qual] || '—') + '</div>');
    box.scrollTop = 0;
    var abas = document.getElementById('lz-abas');
    if (!abas) return;
    [].slice.call(abas.querySelectorAll('[data-lz-aba]')).forEach(function (b) {
      var on = b.getAttribute('data-lz-aba') === qual;
      b.style.background = on ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'var(--bg-darker,rgba(0,0,0,0.25))';
      b.style.color = on ? '#fff' : 'var(--text-secondary,#c8cdd6)';
      b.style.borderColor = on ? 'rgba(99,102,241,0.55)' : 'var(--border-color,rgba(255,255,255,0.12))';
      b.setAttribute('data-lz-ativo', on ? '1' : '0');
    });
  };

  // HISTÓRICO DE JOGOS — os MESMOS CARDS da tela #histórico (dois times empilhados, placar
  // à direita na cor do time, selo LetzPlay/Scoreplace, data e a linha de contexto). Eu
  // tinha escrito uma lista de uma linha aqui, e o dono comparou lado a lado: as duas
  // telas mostram a mesma coisa e têm que ler igual. `_spLzGameItems`/`_spGameCard` vêm de
  // match-history.js — nada é recriado aqui.
  // UMA LISTA SÓ, das duas fontes, do mais recente pro mais antigo (pedido do dono,
  // 31/jul/2026). Antes eu ANEXAVA a grade do scoreplace depois da do letzplay: dois
  // blocos, cada um ordenado por dentro, e o jogo de ontem do app aparecia embaixo de um
  // jogo de 2023 do letzplay. Ordem cronológica só existe se a lista for uma.
  // O selo de cada card já diz de onde veio (🎾 LetzPlay / 🏆 Scoreplace).
  window._lzGameItens = [];
  window._lzRenderJogos = function (meNome) {
    var itens = (window._lzGameItens || []).slice();
    if (!itens.length) return '';
    itens.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var LIM = 300, corte = itens.length > LIM;
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;">' +
      itens.slice(0, LIM).map(function (it) { return window._spGameCard(it, meNome || 'Ela/Ele'); }).join('') +
      '</div>' + (corte ? '<div style="opacity:0.6;padding:8px 0;">… e mais ' + (itens.length - LIM) + ' jogo(s) — o acervo completo está gravado.</div>' : '');
  };
  window._lzGameCards = function (imp, meNome) {
    if (typeof window._spLzGameItems !== 'function' || typeof window._spGameCard !== 'function') return null;
    window._lzGameItens = (window._spLzGameItems(imp) || []).filter(Boolean);
    if (!window._lzGameItens.length) return '';
    return window._lzRenderJogos(meNome);
  };

  // Formato de UMA LINHA — usado só quando o módulo do histórico não está carregado.
  window._lzGameRows = function (imp, handle) {
    var gs = (imp && imp.games) || [];
    if (!gs.length) return '';
    var lin = gs.map(function (g, i) {
      var d = _lzDataNumDe(g && g.date);
      return { ord: d || (1 - i / 1e6), g: g, data: d ? _lzFmtDataNum(d) : null };
    });
    lin.sort(function (a, b) { return b.ord - a.ord; });
    var LIM = 400;                                   // não despeja 2 mil linhas de uma vez
    var corte = lin.length > LIM;
    return lin.slice(0, LIM).map(function (L) {
      var g = L.g;
      var venceu = (g.won === true), perdeu = (g.won === false);
      var placar = (g.myScore != null && g.oppScore != null) ? (g.myScore + '–' + g.oppScore) : null;
      var advs = (g.oppNames && g.oppNames.length ? g.oppNames : g.oppHandles || []).filter(Boolean).join(' / ');
      var h = '<div style="padding:2px 0;">' + (venceu ? '✅ ' : (perdeu ? '❌ ' : '• '));
      if (L.data) h += '<span style="color:' + _LZ_C_DATA + ';font-variant-numeric:tabular-nums;">' + _esc(L.data) + '</span> · ';
      if (placar) h += '<span style="color:' + (venceu ? '#2dd4a0' : (perdeu ? '#f87171' : _LZ_C_POS)) + ';font-weight:800;font-variant-numeric:tabular-nums;">' + _esc(placar) + '</span> · ';
      if (advs) h += '<span>vs ' + _esc(advs) + '</span>';
      if (g.competition) h += ' · <span style="color:' + _LZ_C_CAT + ';">' + _esc(g.competition) + '</span>';
      return h + '</div>';
    }).join('') + (corte ? '<div style="opacity:0.6;padding:6px 0;">… e mais ' + (lin.length - LIM) + ' jogo(s) — o acervo completo está gravado.</div>' : '');
  };

  // Conta TORNEIOS DISTINTOS (por club/tourneyId), não entradas de footprint. Imports
  // gravados antes de 30/jul/2026 têm o footprint FRAGMENTADO: o extrator pegava o link
  // "Ver trilha de X/Y" no lugar do da categoria, e como o agrupamento usava esse texto, o
  // mesmo torneio virava várias entradas (medido: 35 torneios → 55 entradas). Contar
  // entradas dava 55, o teto cortava em 35 e a tela dizia "35 de 35 (100%)" com 14 torneios
  // ainda por ler. Contar por ID acerta nos dois: no dado novo e no já gravado.
  window._lzTournamentsRead = function (imp) {
    // O CURSOR MANDA quando existe: `toursDone` só recebe uma competição depois que a
    // página dela foi aberta com sucesso. O footprint é prova mais fraca — competição sem
    // classificação publicada não entra nele, e por isso 3 dos 35 torneios da Camila
    // ficavam eternamente "não lidos" enquanto eram rebuscados em toda rodada.
    var c = imp && imp.lzCursor;
    if (c && c.toursDone) return Object.keys(c.toursDone).length;
    var ids = {};
    ((imp && imp.footprint) || []).forEach(function (f) {
      if (!f || !f.official) return;
      if (!(f.standings || (f.name && f.name !== f.categoryRaw))) return;
      ids[(f.club || '') + '/' + (f.tourneyId != null ? f.tourneyId : ('?' + (f.categoryRaw || '')))] = 1;
    });
    return Object.keys(ids).length;
  };
  // ── QUANTAS COMPETIÇÕES EXISTEM DE VERDADE ────────────────────────────────────
  // REGRA DO DONO (31/jul/2026): **só conta competição que tem jogo**. A página inicial
  // do atleta não é fonte confiável — e se acharmos jogos de um torneio que não aparece
  // na lista dele, esse torneio conta e é registrado.
  //
  // As duas metades da regra saíram de medição no perfil dele:
  //   • `tournaments.json` lista 2 torneios, mas os jogos citam 4 — os outros dois
  //     (01/12/2024, um deles o BTG) ele DISPUTOU e a lista não enumera. Confiar na lista
  //     apagaria torneio de verdade. Ele viu na tela: "cadê meu BTG?".
  //   • `rankings.json` lista 4, mas um deles (2023) não tem UM jogo sequer. Contar a
  //     inscrição como participação inflava o total e a barra nunca fechava.
  // Sobrou o critério mais simples e o mais verificável: JOGO. Ele é o registro que a
  // fonte mais leva a sério, e é o que a pessoa lembra de ter feito.
  //
  // O footprint só entra quando o acervo de jogos foi truncado (perfil grande), porque aí
  // os jogos antigos não estão mais no documento — mas a pegada deles ficou.
  function _lzCompsReais(imp, oficial) {
    var set = {};
    ((imp && imp.games) || []).forEach(function (g) {
      if (!g) return;
      var ehOficial = (g.official === true) || g.kind === 'tournament';
      if (ehOficial !== !!oficial) return;
      var id = oficial ? g.tourneyId : g.rankingId;
      if (id != null) set[(g.club || '') + '/' + id] = 1;
    });
    if (imp && imp.gamesTruncated) ((imp && imp.footprint) || []).forEach(function (f) {
      if (!f || !!f.official !== !!oficial) return;
      var id = oficial ? f.tourneyId : f.rankingId;
      if (id != null) set[(f.club || '') + '/' + id] = 1;
    });
    return set;
  }
  window._lzCompsReaisN = function (imp, oficial) { return Object.keys(_lzCompsReais(imp, oficial)).length; };

  // Conta COMPETIÇÕES DISTINTAS num footprint (por club/id), não entradas — o footprint
  // fragmenta: a mesma competição entra uma vez por categoria/trilha.
  function _lzContarDistintos(fp, oficial) {
    var ids = {};
    (fp || []).forEach(function (f) {
      if (!f || !!f.official !== !!oficial) return;
      ids[(f.club || '') + '/' + (oficial ? (f.tourneyId || '') : (f.rankingId || ''))] = 1;
    });
    return Object.keys(ids).length;
  }
  // QUAL DOS DOIS IMPORTS VALE. O histórico mora em dois lugares (users/{uid}.letzplayImport,
  // feito pela própria pessoa, e letzplayScans/{uid}.fullImport, feito pelo organizador).
  // A regra antiga — "vence quem tem MAIS jogos" — inverteu de sentido no dia em que a
  // limpeza chegou: medido em 30/jul, o doc do organizador tinha os 469 jogos LIMPOS (todos
  // com o id do letzplay) e o da pessoa tinha os 569 SUJOS do pipeline velho, de 15 minutos
  // antes. Mais jogos venceu, e a tela voltou a mostrar 569.
  // Quantidade não é qualidade: quem carrega o id da partida veio do pipeline novo e vence.
  // Empatado nisso, vence o mais RECENTE; só então o maior.
  function _lzTemIds(x) {
    var g = (x && x.games) || [];
    return g.length > 0 && g.every(function (y) { return y && y.lzId; });
  }
  function _lzQuando(x) {
    var ms = Date.parse((x && (x.importedAt || x.at)) || '');
    return isNaN(ms) ? 0 : ms;
  }
  function _lzMelhorImport(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    var ia = _lzTemIds(a), ib = _lzTemIds(b);
    if (ia !== ib) return ia ? a : b;
    var qa = _lzQuando(a), qb = _lzQuando(b);
    if (qa !== qb) return qa > qb ? a : b;
    return (_lzTot(a) >= _lzTot(b)) ? a : b;
  }
  window._lzMelhorImport = _lzMelhorImport;

  function _lzImportComplete(li) {
    if (!li) return false;
    var n = _lzTot(li);
    // O CURSOR COMPLETO É A PROVA MAIS FORTE: a última página do histórico foi lida.
    // Comparar com `declaredGames` não fecha nunca quando o contador do letzplay conta
    // card e não partida (medido: 478 cards × 469 partidas em @camilacalia).
    // MAS "completo" tem que ser VERIFICÁVEL: quando o cursor diz quantas páginas existem e
    // quais foram lidas, exigimos que o conjunto cubra o total. Sem isso, um cursor que se
    // declarou completo por engano (aconteceu hoje) fazia um histórico de 20 jogos aparecer
    // como VERDE — absolvição baseada em quase nada.
    if (li.lzCursor && li.lzCursor.complete === true && !li.partialReason) {
      var _c = li.lzCursor;
      // COMPLETO TEM QUE BATER COM O TAMANHO. O cursor pode se declarar completo por engano
      // (aconteceu) e um histórico truncado passava por verificado. Com índice, a conta é
      // exata; sem ele, o declarado (que conta cards) serve de piso com folga de 5%.
      var _alvo = (li.indexTotal > 0) ? li.indexTotal
                : (li.declaredGames > 0 ? Math.floor(li.declaredGames * 0.95) : 0);
      if (_alvo > 0 && n < _alvo) return false;
      if (_c.pagesTotal > 0 && _c.pagesRead && typeof _c.pagesRead === 'object') {
        var _lidas = 0;
        for (var _k = 1; _k <= _c.pagesTotal; _k++) if (_c.pagesRead[_k]) _lidas++;
        if (_lidas < _c.pagesTotal) return false;      // diz que fechou, mas não fechou
      }
      return true;
    }
    if (li.declaredGames == null) return n > 0;          // legado: sem o número, confia no all-or-nothing
    if (li.partialReason) return false;                   // ele mesmo diz que parou no meio
    return n >= li.declaredGames;
  }
  // VERDE SÓ COM LEITURA RECENTE. Verde é ABSOLVIÇÃO — dizer que a pessoa está na categoria
  // certa —, e isso depende de dado fresco: um título tirado depois da leitura muda o
  // veredito e a leitura velha não o conhece.
  // JANELA = 3 MESES (regra do dono, 31/jul/2026; era 1 mês na véspera): "se estiver
  // atualizado até 3 meses ele considera verde; se for a mais tempo, volta pro roxo".
  // Vermelho e amarelo NÃO envelhecem: evidência positiva encontrada continua sendo prova.
  // A cor sai PRONTA DO BANCO no render — a página busca os perfis e os letzplayScans por
  // uid antes de pintar (ver renderEnrollmentReportPage), sem depender de clique nenhum.
  var _LZ_FRESCO_DIAS = 90;
  function _lzFresco(x) {
    if (!x) return false;
    var t = x.importedAt || x.at || x.scannedAt || x.updatedAt || null;
    if (t && typeof t.toDate === 'function') { try { t = t.toDate(); } catch (e) {} }
    var ms = (t instanceof Date) ? t.getTime() : Date.parse(t || '');
    if (!ms || isNaN(ms)) return false;                   // sem data conhecida → não absolve
    return (Date.now() - ms) <= _LZ_FRESCO_DIAS * 86400000;
  }
  function _lzScanComplete(sc) {
    if (!sc) return false;
    var t = sc.totals || {};
    if (t.rankings == null || t.tournaments == null) return false;
    return (sc.rankings || []).length >= t.rankings && (sc.tournaments || []).length >= t.tournaments;
  }
  function _erApplyLzToRows(rows, profileMap, scanMap) {
    profileMap = profileMap || {}; scanMap = scanMap || {};
    (rows || []).forEach(function (r) {
      r._lzColor = null; r._lzSkill = null; r._lzSrc = null;
      r._lzVerified = false; r._lzAuthorized = false;
      var prof = r.uid && profileMap[r.uid];
      // Autorizou = tem letzplay indicado no perfil (@handle) E ligou o toggle
      // "Autorizar importação". É o que separa violeta (autorizou) de branco (não).
      r._lzAuthorized = !!(prof && prof.letzplayHandle && prof.letzplayConsent === true);
      // O HISTÓRICO PODE ESTAR EM DOIS LUGARES, e eu só olhava um:
      //   • users/{uid}.letzplayImport      → a pessoa fez o autoimport dela;
      //   • letzplayScans/{uid}.fullImport  → o ORGANIZADOR puxou por ela (busca completa).
      // Caso real (14/jul 17:57): a Kelly tinha 152 jogos COMPLETOS no fullImport do scan e
      // aparecia ROXA — porque ela nunca fez autoimport, então eu caía no scan resumido
      // (torneios 2/8), julgava incompleto e não absolvia. O dado estava lá; a tela mentia.
      // Não dá pra depender do letzplayImport: ele só é preenchido pela applyLetzplayScans
      // (que roda depois) ou pelo login da própria pessoa — de novo fazendo a leitura do
      // organizador depender do inscrito. Vence o que tem MAIS jogos (mesma regra da CF).
      var _fi = (r.uid && scanMap[r.uid] && scanMap[r.uid].fullImport) || null;
      var _own = prof && prof.letzplayImport;
      var li = _lzMelhorImport(_fi, _own);
      var sc = (r.uid && scanMap[r.uid] && scanMap[r.uid].scan) ? scanMap[r.uid].scan : null;
      if (li) {
        var oc = li.officialCategory, band = li.rating && li.rating.band;
        var champCats = (li.tournaments || []).filter(function (x) { return x.title; }).map(function (x) { return x.categoryRaw; });
        var ev = _lzEvidence(champCats, li.rankings || [], [oc ? oc.categoryRaw : '', band || '']);
        // apurado = o MESMO nível que exibimos em _lzSkill; serve de veredito quando a
        // pessoa não declarou nada (veio do letzplay → coerente por definição).
        var apuLi = (oc && oc.skill) ? _declRankFrom([oc.skill]) : null;
        var v = _lzVerdict(_declRankFrom(r.effectiveSkills), ev, apuLi);
        r._lzSrc = '🎾';
        r._lzSkill = (oc && oc.skill) ? oc.skill : (v.apurada != null ? _LTR[v.apurada] : null);
        // Veredito 'white' = importado mas sem nível declarado pra comparar → não é
        // "verificado" de fato; cai pro estado autorizado (violeta) abaixo.
        // Mesma regra do scan: VERDE (coerente) exige ter olhado TUDO. Com o histórico
        // pela metade, "não achei título contra" é ausência de dado, não absolvição —
        // e título é o que manda subir. Vermelho/amarelo seguem valendo: achar é prova.
        if (v.key === 'green' && !_lzImportComplete(li)) v = { key: 'white', apurada: null };
        if (v.key === 'green' && !_lzFresco(li)) v = { key: 'white', apurada: null };
        // VERDE EXIGE O MOTOR NOVO. Data recente não basta: um import de 16 dias atrás é
        // "fresco" e mesmo assim foi lido pelo pipeline velho, que duplicava partida e
        // perdia competição. A prova de motor novo está no dado — o id da partida vindo do
        // letzplay (`lzId`). Sem ele, violeta: autorizou, mas ainda não foi lido direito.
        if (v.key === 'green' && !_lzTemIds(li)) v = { key: 'white', apurada: null };
        if (v.key !== 'white') { r._lzColor = _LZ_COL[v.key]; r._lzVerified = true; }
      } else if (sc) {
        var ev2 = _lzEvidence(sc.champions || [], sc.rankings || [], [sc.rankingCategory].concat(sc.allCategories || []));
        // profileSkill = borda MAIS FRACA da banda ativa (conservador, ver _spDeriveScan).
        var apuSc = _declRankFrom([sc.profileSkill || sc.skill]);
        var v2 = _lzVerdict(_declRankFrom(r.effectiveSkills), ev2, apuSc);
        // VERDE EXIGE CAPTURA COMPLETA. O próprio scan sabe quanto FALTOU: o perfil do
        // letzplay declara os totais e nós contamos o que veio. Medido em produção:
        //   Flavia  → 2 torneios declarados, 0 capturados
        //   Kelly   → 8 declarados, 2 capturados
        // Verde significa "coerente". Afirmar coerência sem ter olhado os torneios é
        // chute: o TÍTULO é o que manda subir de categoria e mora justamente lá. Sem eles,
        // "não achei nada contra" não é evidência de nada — é ausência de dado.
        // Cai pra violeta (autorizou, aguardando informação boa), que é o estado honesto.
        // Vermelho/amarelo NÃO dependem disso: evidência positiva encontrada é prova,
        // mesmo com captura incompleta. O que a falta de dado impede é a ABSOLVIÇÃO.
        if (v2.key === 'green' && !_lzScanComplete(sc)) v2 = { key: 'white', apurada: null };
        if (v2.key === 'green' && !_lzFresco(sc) && !_lzFresco(scanMap[r.uid])) v2 = { key: 'white', apurada: null };
        r._lzSrc = '🔎';
        r._lzSkill = sc.profileSkill || sc.skill || (v2.apurada != null ? _LTR[v2.apurada] : null);
        if (v2.key !== 'white') { r._lzColor = _LZ_COL[v2.key]; r._lzVerified = true; }
      }
      // Cor final do nome (o cinza "sem verificação" SAIU): veredito verificado >
      // autorizou-mas-ainda-não-verificado (violeta) > não-autorizou (branco).
      if (!r._lzColor) r._lzColor = r._lzAuthorized ? _LZ_COL.violet : _LZ_COL.white;
    });
  }
  // Exposto pro teste headless (tests/letzplay-verdict-color.test.js) e por ser o
  // resolvedor CANÔNICO da cor do nome — quem precisar da cor usa esta, não recria.
  window._erApplyLzToRows = _erApplyLzToRows;
  // Exposto pra verificação da seção (botões de busca + rótulo de data) sem precisar de
  // torneio real + auth — é a tela onde o organizador ficou travado sem saber.
  window._erRenderCategoriesSection = function (rows, t, profileMap, scanMap) {
    return _renderCategoriesSection(rows, t, profileMap, scanMap);
  };
  window._LZ_COL = _LZ_COL;

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
  function _erIsMistoTok(v) { return /^misto/i.test(String(v || '')); }
  function _erIsFMTok(v) { var s = String(v || '').toLowerCase(); return s.indexOf('fem') === 0 || s.indexOf('masc') === 0; }
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

    // FORMALIZAÇÃO de categorias (torneio informal → formal). genderOn = divisão
    // Fem/Masc criada; mistoOn = categoria Misto criada (box indicador acima do grid —
    // Misto é UMA categoria com todo mundo, não duas separadas Fem/Masc; as pessoas
    // continuam nas colunas do gênero delas). createdSkills = habilidades formalizadas.
    var gcatsAll = t.genderCategories || [];
    var mistoOn = gcatsAll.some(_erIsMistoTok);
    var genderOn = gcatsAll.some(_erIsFMTok);
    var createdSkills = (t.skillCategories || []);
    var tIdEsc = _esc(String(t.id));
    var MIN_CAT = 2; // mínimo de pessoas pra oferecer "Criar categoria"
    function skillTotal(sk) { return fem[sk].length + masc[sk].length + semG[sk].length; }
    function catCount(catName) {
      var d = _decomposeCat(catName, t), n = 0;
      (rows || []).forEach(function (r) {
        var g = _mxGenderOf(r), sk = _mxSkillOf(r, t);
        // Categoria Mista = UMA categoria com todo mundo → conta fem E masc juntos.
        var gOk = !d.gender || d.gender === 'Misto' || (d.gender === 'Fem' && g === 'feminino') || (d.gender === 'Masc' && g === 'masculino');
        var sOk = !d.skill || (sk === d.skill);
        if (gOk && sOk) n++;
      });
      return n;
    }
    // v1.5.16 (dono): TOGGLE no lugar do botão "➕ cat." — "vai funcionar melhor e ocupar menos
    // espaço. sem texto algum. ligar o toggle ativa a categoria equivalente." A semântica já era
    // de liga/desliga (os handlers se chamam _erToggle*), e o botão gastava largura preciosa numa
    // coluna de 50% no celular — era ele que empurrava a coluna Masculino pra fora. O toggle é o
    // componente canônico do app (.toggle-switch), então herda tamanho/foco/toque de tudo o mais.
    // Sem texto VISÍVEL, mas com title/aria-label: leitor de tela e tooltip não podem sumir junto.
    function createToggle(call, on, rotulo) {
      var _t = _esc(rotulo || '');
      return '<label class="toggle-switch toggle-sm" title="' + _t + '" aria-label="' + _t + '" '
        + 'style="--toggle-on-bg:#10b981;--toggle-on-glow:rgba(16,185,129,0.3);--toggle-on-border:#10b981;flex-shrink:0;" '
        + 'onclick="event.stopPropagation();">'
        + '<input type="checkbox"' + (on ? ' checked' : '') + ' onclick="event.stopPropagation();' + call + '">'
        + '<span class="toggle-slider"></span></label>';
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
    // v1.1.21: hover mostra a última atualização (< 1 mês); clique em AUTORIZADO
    // (organizador) abre a tela de puxar o histórico individual do letzplay.
    var _mxIsOrg = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));
    function chip(r) {
      var pe = _pendingEdits[r.order] || {}; var edited = Object.keys(pe).length > 0;
      // _lzColor já vem resolvido por _erApplyLzToRows: veredito verificado, ou
      // violeta (autorizou), ou branco (não autorizou). Fallback branco por segurança.
      var nameCol = edited ? '#f59e0b' : (r._lzColor || _LZ_COL.white);
      var border = edited ? 'rgba(245,158,11,0.55)' : (r._lzColor ? (r._lzColor + '55') : 'var(--border-color)');
      var ctx = window._lzScanCtx || {};
      var canPull = _mxIsOrg && r.uid && ctx.byUid && ctx.byUid[r.uid];
      var lu = r.uid ? _lzLastUpdateOf(r.uid) : null;
      var fresh = lu && (Date.now() - lu.ts) < 30 * 86400000;   // < 1 mês
      var tip = _esc(r.name || '(sem nome)') +
        (fresh ? (' — Última atualização: ' + lu.label) : '') +
        (canPull ? ' — clique pra puxar o histórico do letzplay' : '') +
        ' — arraste pra atribuir gênero/categoria';
      var click = canPull ? ' onclick="window._lzAthleteDialog(\'' + String(r.uid).replace(/['\\]/g, '') + '\')"' : '';
      return '<div draggable="true" ondragstart="window._erMxDragStart(event,' + r.order + ')"' + click + ' ' +
        'style="cursor:' + (canPull ? 'pointer' : 'grab') + ';font-size:0.74rem;font-weight:600;padding:4px 7px;border-radius:6px;min-width:0;background:var(--bg-card,rgba(0,0,0,0.25));color:' + nameCol + ';border:1px solid ' + border + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + tip + '">' + _esc(r.name || '(sem nome)') + '</div>';
    }
    function cardGrid(arr) {
      // minmax(0,...) e o que impede o estouro: com min-width:auto o nome longo
      // empurrava a coluna pra fora da tela (a Masculino ficava cortada).
      return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(130px,100%),1fr));gap:4px;min-width:0;">' + sortList(arr).map(chip).join('') + '</div>';
    }
    // Box de categoria (borda na cor do gênero) — título "C (N)" + botão criar. Drop = gênero+categoria.
    function catBox(genderKey, sk, arr, color, tint) {
      var label = (sk === '__none__') ? 'Sem habilidade' : sk;
      // Botao em TODAS as habilidades do torneio (A/B/C/D/FUN), nao so nas que ja tem
      // gente. Antes o gate era skillTotal(sk) >= MIN_CAT — um total GLOBAL (soma dos 3
      // generos) enquanto a caixa mostra a contagem LOCAL: dava "C (0)" COM botao (12
      // pessoas em C no torneio) e "A (0)" SEM botao. Mesmo numero na tela, comportamento
      // diferente = parece bug. Pedido do dono: tem que ter em todas.
      var btn = (sk !== '__none__')
        ? createToggle('window._erToggleSkill(\'' + tIdEsc + '\',\'' + sk + '\',this)', createdSkills.indexOf(sk) !== -1,
            (createdSkills.indexOf(sk) !== -1 ? 'Desativar' : 'Ativar') + ' a categoria ' + sk)
        : '';
      return '<div ondragover="window._erMxOver(event)" ondrop="window._erMxDrop(event,\'' + (genderKey || '') + '\',\'' + sk + '\')" ' +
        'style="border:1.5px solid ' + tint + ';border-radius:10px;padding:8px 10px;background:var(--bg-darker,rgba(0,0,0,0.15));">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px;min-width:0;"><span style="font-size:14px;font-weight:800;color:' + color + ';min-width:0;">' + label + ' <span style="opacity:0.7;font-weight:700;">(' + arr.length + ')</span></span>' + btn + '</div>' +
        cardGrid(arr) + '</div>';
    }
    // Cabeçalho do gênero (drop = só gênero) + botão criar categoria por gênero.
    function ghead(icon, gKey, name, color, tot) {
      var btn = (tot >= MIN_CAT)
        ? createToggle('window._erToggleGender(\'' + tIdEsc + '\',this)', genderOn,
            (genderOn ? 'Desativar' : 'Ativar') + ' as categorias Feminino e Masculino')
        : '';
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
    var grid = '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 8px;align-items:stretch;">' + gridRows + '</div>';
    // BOX MISTO acima do grid (pedido do dono, 23/jul): NÃO é uma coluna — só indica
    // que a categoria do torneio é MISTA (uma categoria só, fem e masc juntos) e dá o
    // ➕ Criar categoria / ↩ Reverter próprio. Quem é fem segue na coluna fem, masc na
    // masc — igual ao box "Sem gênero" abaixo, mas de indicação/formalização.
    // LAYOUT (pedido do dono, 30/jul): TÍTULO e TOGGLE na mesma linha, o toggle à direita;
    // a DESCRIÇÃO abaixo do título. Antes título e descrição eram um parágrafo só e o
    // `flex-wrap` jogava o toggle pra linha de baixo quando o texto crescia — o controle
    // aparecia solto no canto inferior, longe do que ele controla.
    var mistoStrip = '<div style="margin-bottom:10px;background:var(--bg-darker,rgba(0,0,0,0.18));border:1.5px solid rgba(168,85,247,0.55);border-radius:12px;padding:10px 12px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
        '<span style="font-size:17px;font-weight:800;color:#a855f7;min-width:0;">⚥ Misto' +
          (mistoOn ? ' <span style="opacity:0.8;font-size:15px;">(' + total + ')</span>' : '') + '</span>' +
        createToggle('window._erToggleGenderMisto(\'' + tIdEsc + '\',this)', mistoOn,
          (mistoOn ? 'Desativar' : 'Ativar') + ' a categoria Misto') +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-muted);margin-top:3px;">categoria única — fem e masc jogam juntos, não são duas categorias</div>' +
    '</div>';
    // "Categorias no torneio" — resultado das formalizações + contagem (acima do total).
    var formalCats = (typeof window._getTournamentCategories === 'function') ? (window._getTournamentCategories(t) || []) : [];
    var catsBoxInner = formalCats.length
      ? '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + formalCats.map(function (c) {
          return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:16px;font-weight:700;padding:6px 14px;border-radius:20px;background:rgba(99,102,241,0.16);color:var(--text-bright,#fff);border:1px solid rgba(99,102,241,0.4);">' + _esc(c) + ' <span style="opacity:0.7;">(' + catCount(c) + ')</span></span>';
        }).join('') + '</div>'
      : '<span style="font-size:15px;color:var(--text-muted);">Nenhuma categoria formal — o sorteio mistura todos. Ligue os toggles abaixo para ativar as categorias.</span>';
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
    return catsBox + totalBar + mistoStrip + grid + semSection;
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
  // v1.5.16: o controle virou TOGGLE (input dentro do label) — escrever textContent nele
  // apagaria o próprio input. Agora trava e esmaece o toggle inteiro até o re-render da matriz
  // (que vem logo em seguida e devolve o estado real). Mantém o caminho do <button> pra quem
  // ainda passe um. [[project_busy_button_canonical]]
  function _erSetBtnBusy(btn, reverting) {
    if (!btn) return;
    if (btn.tagName === 'INPUT') {
      btn.disabled = true;
      var lab = btn.closest ? btn.closest('.toggle-switch') : null;
      if (lab) { lab.style.opacity = '0.55'; lab.style.cursor = 'wait'; lab.style.pointerEvents = 'none'; }
      return;
    }
    btn.disabled = true;
    btn.className = 'btn btn-outline btn-sm';
    btn.textContent = reverting ? '⏳ Revertendo…' : '⏳ Criando…';
  }
  function _erCommitCats(t) {
    t.combinedCategories = _erComputeCombined(t.genderCategories, t.skillCategories);
    // O onSnapshot troca os OBJETOS de AppStore.tournaments — _liveState.t pode estar
    // apontando pro objeto VELHO. O toggle muta o novo (via _erFindT) mas o re-render
    // lia o velho: o botão mostrava o estado antigo e "Reverter não funcionava"
    // (bug real, 23/jul). Sincroniza a referência antes de re-renderizar.
    if (_liveState) _liveState.t = t;
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
    // Alterna SÓ a divisão Fem/Masc — a categoria Misto (coluna do meio) tem toggle
    // próprio e sobrevive intacta a este botão.
    var gc = (t.genderCategories || []).slice();
    var others = gc.filter(function (v) { return !_erIsFMTok(v); });
    var reverting = gc.length > others.length;
    _erSetBtnBusy(btn, reverting);
    t.genderCategories = reverting ? others : others.concat(['Fem', 'Masc']);
    _erCommitCats(t);
  };
  window._erToggleGenderMisto = function (tId, btn) {
    if (!_liveState || !_liveState.isOrg) return;
    var t = _erFindT(tId); if (!t) return;
    var gc = (t.genderCategories || []).slice();
    var others = gc.filter(function (v) { return !_erIsMistoTok(v); });
    var reverting = gc.length > others.length;
    _erSetBtnBusy(btn, reverting);
    t.genderCategories = reverting ? others : others.concat(['Misto']);
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
  // ── Frescor da verificação (v1.1.18) ────────────────────────────────
  // "Os que estão atualizados a menos de 6 dias não precisam ser atualizados."
  // Fontes de dado fresco, por pessoa: (a) o scan global do organizador
  // (letzplayScans/{uid}.scannedAt + scan._mode) e (b) o import que a PRÓPRIA pessoa
  // fez do histórico dela (perfil.letzplayImport.importedAt) — que é sempre completo.
  var _LZ_FRESH_DAYS = 6;
  // TRAVA DESLIGADA enquanto não fechamos que a busca funciona de ponta a ponta.
  // A regra dos 6 dias existe pra não re-buscar à toa (cada busca é leitura no letzplay,
  // que responde com rate-limit em rajada). Mas ela também IMPEDE re-testar: em 14/jul o
  // scan gravou _mode='full' sem trazer jogo nenhum, os 4 inscritos passaram a contar como
  // "atualizados", e os dois botões ficaram inativos — o organizador ficou travado sem
  // saber, sem poder tentar de novo. Enquanto o sistema não está validado, poder repetir
  // vale mais que economizar leitura. Religar = _LZ_FRESH_OFF = false.
  var _LZ_FRESH_OFF = true;
  function _lzIsFresh(iso) {
    if (_LZ_FRESH_OFF) return false;   // nada é "fresco" → os botões nunca ficam inativos
    var ts = iso ? (Date.parse(iso) || 0) : 0;
    if (!ts) return false;
    return (Date.now() - ts) < (_LZ_FRESH_DAYS * 86400000);
  }
  // → { essential: bool, full: bool } = "já tenho dado fresco o bastante pra este modo?"
  function _lzFreshness(uid, profileMap, scanMap) {
    var out = { essential: false, full: false };
    if (!uid) return out;
    var prof = profileMap && profileMap[uid];
    var imp = prof && prof.letzplayImport;
    if (imp && _lzIsFresh(imp.importedAt)) { out.essential = true; out.full = true; }
    var sc = scanMap && scanMap[uid];
    if (sc && _lzIsFresh(sc.scannedAt)) {
      out.essential = true;
      // Completa só está coberta por outra completa DE VERDADE. Duas armadilhas aqui,
      // ambas viram fantasma (14/jul/2026):
      //  • _mode='full' era gravado mesmo quando o histórico não veio (fullImport=null)
      //    → o app dava a completa por feita e DESABILITAVA o botão de buscar de novo.
      //    Agora _saveScansAndReload só grava 'full' quando vieram jogos.
      //  • sc.fullImport sobrevive ao set({merge:true}) de um scan NOVO que não trouxe
      //    nada — um import de ontem parecia fresco por causa do scannedAt de hoje.
      //    Por isso o frescor do histórico é medido pelo timestamp DELE (importedAt),
      //    nunca pelo scannedAt do scan que o acompanha.
      if ((sc.scan && sc.scan._mode) === 'full') out.full = true;
      if (sc.fullImport && _lzIsFresh(sc.fullImport.importedAt)) out.full = true;
    }
    return out;
  }

  // Última atualização do dado letzplay de UMA pessoa — o mais novo entre o import
  // próprio dela (perfil) e o que o organizador puxou (scan). → {ts, label} ou null.
  window._lzLastUpdateOf = _lzLastUpdateOf;   // exposto pro teste travar a data mostrada
  function _lzLastUpdateOf(uid) {
    var ctx = window._lzRenderCtx || {};
    var prof = ctx.profileMap && ctx.profileMap[uid];
    var sc = ctx.scanMap && ctx.scanMap[uid];
    // A DATA É A DO HISTÓRICO QUE ESTÁ EM USO — não o carimbo mais novo que existir no
    // documento. Pegar o Math.max de tudo fazia a tela dizer "Última atualização: 30/07
    // 18:49" enquanto o histórico exibido era o de 14/jul: o 30/07 era um `scannedAt` de
    // outra coisa. Data que não é do dado mostrado é mentira — e foi o que levou o dono a
    // perguntar "se eu estou com 100% por que continua roxo?".
    var _li = _lzMelhorImport(sc && sc.fullImport, prof && prof.letzplayImport);
    var ts = _lzQuando(_li);
    // Só cai no scannedAt quando não há histórico nenhum (aí ele é a única notícia que temos)
    if (!ts && sc && sc.scannedAt) ts = Date.parse(sc.scannedAt) || 0;
    if (!ts) return null;
    var d = new Date(ts);
    return { ts: ts, label: d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
  }
  // Tela individual (v1.1.21): nome + @ + última atualização + botão de puxar a
  // COMPLETA daquele atleta — substitui os botões de lote da Análise.
  // Posição do atleta na classificação gravada de um torneio (footprint[].standings).
  function _lzMyPosIn(standings, handle) {
    var low = String(handle || '').toLowerCase(), out = null;
    (standings || []).forEach(function (g) {
      (g.rows || []).forEach(function (r) {
        if (out == null && r.pos != null && (r.handles || []).some(function (x) { return String(x).toLowerCase() === low; })) out = r.pos;
      });
    });
    return out;
  }
  window._lzAthleteDialog = function (uid) {
    var ctx = window._lzScanCtx || {};
    var tg = ctx.byUid && ctx.byUid[uid];
    if (!tg) return;
    window._lzDialogUid = uid;      // a barra do topo age sobre este atleta
    var lu = _lzLastUpdateOf(uid);
    // Melhor import disponível (scan do organizador OU import próprio — o de mais jogos).
    var rctx = window._lzRenderCtx || {};
    var _p1 = rctx.profileMap && rctx.profileMap[uid] && rctx.profileMap[uid].letzplayImport;
    var _p2 = rctx.scanMap && rctx.scanMap[uid] && rctx.scanMap[uid].fullImport;
    var imp = _lzMelhorImport(_p1, _p2);
    // cursor de uma leitura que não fechou fica FORA do fullImport (o histórico oficial só
    // é substituído por leitura completa) — mas ele é o que permite retomar de onde parou.
    var _curParcial = rctx.scanMap && rctx.scanMap[uid] && rctx.scanMap[uid].lzCursorParcial;
    if (imp && _curParcial && !(imp.lzCursor && imp.lzCursor.complete)) {
      imp = Object.assign({}, imp, { lzCursor: _curParcial });
    }
    // MEDIDOR DE NÍVEL no topo — a MESMA barra das estatísticas (`_lzLevelBar`).
    // O card INTEIRO estava aqui e virou um rolo sem fim dentro do diálogo: as três listas
    // empilhadas, sem como chegar no fim de nenhuma ("essa tela está imprestável"). As
    // listas passaram a ser ABAS, com UMA área de rolagem — ver `_lzAba`.
    var _nivel = (imp && typeof window._lzLevelBar === 'function') ? window._lzLevelBar(imp) : '';
    var body = (_nivel ? '<div style="background:var(--bg-card,#141a24);border:1px solid var(--border-color,#28313f);border-radius:12px;padding:11px 12px;margin-bottom:9px;text-align:left;">' + _nivel + '</div>' : '') +
      '<div style="font-size:0.8rem;">Histórico público de <b>' + _esc(tg.name || tg.handle) + '</b> ' +
      // O @ ABRE O PERFIL DELA no letzplay. Antes só a leitura navegava a aba compartilhada,
      // então quem só queria conferir a fonte não tinha caminho nenhum.
      '(<a href="https://letzplay.me/' + encodeURIComponent(tg.handle) + '" target="_blank" rel="noopener" ' +
      'style="color:#7dd3fc;text-decoration:none;font-weight:700;">@' + _esc(tg.handle) + ' ↗</a>) no letzplay.</div>';
    var btnLabel = '📚 Puxar histórico completo';
    // 3 BARRAS (x = gravado · y = total do perfil letzplay). Os "de y" que faltarem são
    // completados ao vivo pela extensão (lz-profile-counts lê "472 Jogos · 29 Rankings ·
    // 35 Torneios" do perfil público) — direto na tela, como o dono pediu.
    function barLine(id, icon, label, x, y, _authY) {
      // x jamais passa do declarado: 35 de 35 é 100%, "38 de 35" não existe.
      if (y != null && y > 0) x = Math.min(x, y);
      var pct = (y && y > 0) ? Math.min(100, Math.round(x / y * 100)) : null;
      return '<div id="' + id + '" data-x="' + x + '" data-y="' + (y || 0) + '" data-auth="' + (_authY ? 1 : 0) + '" style="margin:5px 0;">' +
        '<div style="display:flex;justify-content:space-between;gap:8px;font-size:0.8rem;"><span>' + icon + ' ' + label + '</span><span class="lz-bar-txt"><b>' + x + '</b>' + (y ? (' de ' + y + ' (' + pct + '%)') : ' de …') + '</span></div>' +
        '<div style="height:7px;border-radius:99px;background:var(--bg-darker,#171a2b);overflow:hidden;border:1px solid var(--border-color,rgba(255,255,255,0.08));"><div class="lz-bar-fill" style="height:100%;width:' + (pct != null ? Math.max(2, pct) : 2) + '%;background:linear-gradient(90deg,#10b981,#059669);"></div></div>' +
      '</div>';
    }
    var gX = _lzTot(imp);
    var gY = (imp && imp.declaredGames != null) ? imp.declaredGames : null;
    // o declarado pode ficar pequeno — barra travada em "478 de 478" enquanto ainda
    // entram jogos é mentira
    if (gX > (gY || 0)) gY = gX;
    // TOTAL DE JOGOS — na ordem de confiança:
    //   1) o ÍNDICE (ext ≥1.83): o letzplay serve /{h}/matches.json e ali cada linha é uma
    //      PARTIDA. É o único número que é fato.
    //   2) o declarado no perfil, que conta CARDS (478 pra 469 reais) — serve de piso.
    // O QUE NÃO PODE, e era o que estava acontecendo: deixar o total virar o próprio número
    // lido quando o cursor diz "completo". Um documento truncado em 20 jogos aparecia como
    // "20 de 20 (100%)" — leitura pela metade exibida como perfeita. Um cursor errado não
    // pode redefinir a verdade; ele é justamente o que costuma estar errado.
    // TOTAIS vêm do bloco de ESTRUTURA (ext ≥1.84), que é conhecido antes de ler HTML e
    // nunca deriva do quanto deu tempo de ler. Índice e declarado são os degraus abaixo.
    var _T = (imp && imp.totais) ||
             (rctx.scanMap && rctx.scanMap[uid] && rctx.scanMap[uid].totaisLetzplay) || null;
    // ORDEM DE AUTORIDADE: índice (partidas DISTINTAS, contadas por id) > total gravado de
    // outra procedência > contador do perfil, que conta LINHAS e por isso só serve de PISO.
    // O contador do perfil pode ser MAIOR que a verdade: a lista do letzplay repete linha
    // (Kelly: 158 linhas, 157 partidas). Deixar o piso vencer o índice fazia a barra parar
    // em 99% pra sempre, esperando um jogo que não existe.
    var _idxT = (imp && imp.indexTotal > 0) ? imp.indexTotal
              : ((_T && _T.fonte === 'indice' && _T.jogos > 0) ? _T.jogos : 0);
    // ── VARREDURA FECHADA MATA O JOGO FANTASMA ────────────────────────────────
    // "se existe um jogo que não existe, exclua ele sempre, de qualquer atleta" (dono).
    // Quando a leitura passou por TODAS as páginas, o que ela encontrou É o histórico —
    // o contador do perfil, que conta LINHAS e repete linha, não pode inventar um jogo
    // que a varredura completa não achou.
    // O QUE IMPEDE ISSO DE VIRAR O ANTIGO "20 de 20 (100%)": não basta o cursor DIZER que
    // terminou — cursor errado é justamente o sintoma. A prova é ARITMÉTICA: a fonte serve
    // 20 por página, então uma varredura de N páginas tem que devolver entre 20(N-1)+1 e
    // 20N partidas. Kelly: 8 páginas, 157 → cabe em (140,160] → 157 de 157, fecha.
    // Um doc truncado em 20 com 8 páginas não cabe em (140,160] → o declarado segue de pé
    // e a tela mostra 20 de 158, que é a verdade feia.
    var _cur = (imp && imp.lzCursor) || null;
    var _POR_PG = 20;
    if (!(_idxT > 0) && _cur && _cur.complete === true && _cur.pagesTotal > 0 &&
        _cur.pageDone >= _cur.pagesTotal &&
        gX > (_cur.pagesTotal - 2) * _POR_PG && gX <= _cur.pagesTotal * _POR_PG) {
      _idxT = gX;
    }
    if (_idxT > 0) gY = _idxT;
    else if (_T && _T.jogos > 0) gY = _T.jogos;
    else if (imp && imp.declaredGames > 0) gY = Math.max(imp.declaredGames, gX);
    var offFp = imp ? (imp.footprint || []).filter(function (f) { return f.official; }) : [];
    var rkFp = imp ? (imp.footprint || []).filter(function (f) { return !f.official; }) : [];
    var tX = window._lzTournamentsRead(imp);   // mesma regra do overlay ao vivo
    // TOTAL = o MAIOR entre o que o perfil declara e o que a lista pública realmente
    // ENUMERA. O contador do perfil da Camila diz 35, mas a lista tem mais entradas — e
    // aí "35 de 35 (100%)" aparecia junto de itens "ainda não lido" na mesma tela. Uma
    // lista que se pode contar vale mais que um contador que a gente não sabe o que conta.
    // O CONTADOR DO PERFIL NÃO É PISO: ele conta inscrição, não participação (e erra
    // pros dois lados). Quem manda é a competição com jogo. Enquanto nenhum jogo foi
    // lido, o total é desconhecido — e a barra diz "de …", que é honesto.
    var tY = window._lzCompsReaisN(imp, true) || null;
    // SEM TOTAL DECLARADO, CONTA O QUE SE CONHECE. A Kelly não tinha `declaredTournaments`
    // (import antigo) nem `tournamentsList`, e a barra ficava em "5 de …" pra sempre — um
    // total desconhecido é indistinguível de barra quebrada. Competição distinta no
    // footprint é um total honesto: é o que sabemos existir.
    if (tY == null) {
      var tFp = _lzContarDistintos(offFp, true);
      tY = Math.max(tFp, tX) || null;
    }
    if (tY != null && tX > tY) tX = tY;
    var _cur = imp && imp.lzCursor;
    var rX = (_cur && _cur.ranksDone) ? Object.keys(_cur.ranksDone).length
      : rkFp.filter(function (f) { return f.standings || (f.name && f.name !== f.categoryRaw); }).length;
    // MESMA REGRA DOS TORNEIOS: o total é o que o perfil DECLARA ou o que a LISTA enumera,
    // o que for maior — nunca a contagem de ENTRADAS do footprint. O footprint fragmenta:
    // 30 entradas pros 29 rankings da Camila e 21 pros 8 da Kelly. Contar entradas prendia
    // a barra em "29 de 30" e inventava "21 rankings" pra quem tem 8.
    var rY = window._lzCompsReaisN(imp, false) || null;
    if (rY == null) rY = _lzContarDistintos(rkFp, false) || null;
    if (rY != null && rX > rY) rX = rY;      // x jamais passa de y
    body += '<div style="margin:8px 0 6px;">' +
      barLine('lz-ath-t', '🏆', 'Torneios', tX, tY) +
      barLine('lz-ath-r', '📊', 'Rankings', rX, rY) +
      barLine('lz-ath-g', '🎾', 'Jogos', gX, gY, _idxT > 0) +
      '</div>';
    if (imp) {
      // TRÊS ABAS, UMA ROLAGEM (pedido do dono, 30/jul/2026: "tem que ter um botão com
      // torneios, outro com rankings e outro com histórico de jogos, de forma que possamos
      // abrir, ler e scrollar"). Empilhar as três listas travava o diálogo.
      // O conteúdo é montado UMA vez e guardado em `window._lzAbas`; trocar de aba só
      // troca o innerHTML — não re-renderiza o diálogo (e não perde a barra de progresso
      // se uma leitura estiver rodando).
      // AS DUAS FONTES NAS TRÊS ABAS (pedido do dono, 31/jul/2026): "na lista de jogos tem
      // que aparecer os jogos do letzplay e do scoreplace. torneios de ambos e rankings de
      // ambos." Os do scoreplace chegam depois (uma leitura do Firestore) e são costurados
      // nas abas já montadas — a tela não espera por eles pra abrir.
      window._lzAbas = {
        tour: _lzTourneyRows(imp, tg.handle, 'tour'),
        rank: _lzTourneyRows(imp, tg.handle, 'rank'),
        jogo: (window._lzGameCards(imp, tg.name || ('@' + tg.handle)) || _lzGameRows(imp, tg.handle))
      };
      _lzJuntarScoreplace(uid, tg.name || ('@' + tg.handle));
      var _n = { tour: tX, rank: rX, jogo: gX };
      body += '<div id="lz-abas" style="display:flex;gap:6px;margin:9px 0 0;">' +
        [['tour', '🏆', 'Torneios'], ['rank', '📊', 'Rankings'], ['jogo', '🎾', 'Jogos']].map(function (A) {
          return '<button type="button" data-lz-aba="' + A[0] + '" onclick="window._lzAba(\'' + A[0] + '\')" ' +
            'style="flex:1;min-width:0;padding:7px 4px;border-radius:9px;cursor:pointer;font-size:0.78rem;font-weight:700;' +
            'border:1px solid var(--border-color,rgba(255,255,255,0.12));background:var(--bg-darker,rgba(0,0,0,0.25));color:var(--text-secondary,#c8cdd6);">' +
            A[1] + ' ' + A[2] + ' <span style="opacity:0.65;font-weight:500;">' + (_n[A[0]] || 0) + '</span></button>';
        }).join('') + '</div>' +
        '<div id="lz-aba-box" style="max-height:340px;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;' +
        'font-size:0.78rem;line-height:1.5;color:var(--text-secondary,#c8cdd6);background:var(--bg-darker,rgba(0,0,0,0.2));' +
        'border:1px solid var(--border-color,rgba(255,255,255,0.08));border-radius:8px;padding:7px 10px;margin:6px 0;text-align:left;">' +
        // A PRIMEIRA ABA JÁ VEM RENDERIZADA NO HTML. Eu tinha deixado a caixa vazia pra um
        // setTimeout preencher — e o patch que adicionava esse setTimeout falhou sem eu ver:
        // resultado, a caixa aparecia VAZIA na tela do dono. Conteúdo que existe na hora de
        // montar vai montado; nada de depender de o diálogo já estar no DOM.
        (window._lzAbas.tour || '<div style="opacity:0.6;padding:6px 0;">Nenhum torneio lido ainda.</div>') +
        '</div>';
      var incompleto = (gY && gX < gY) || (imp.partialReason != null);
      if (incompleto) {
        body += '<div style="font-size:0.8rem;color:#fbbf24;">Perfil INCOMPLETO — puxe de novo pra continuar de onde parou (o que já veio está gravado).</div>';
        btnLabel = '▶️ Continuar de onde parou';
      }
      // POR QUE ESTÁ ROXO. 100% capturado não é o mesmo que lido pelo motor atual — e sem
      // dizer isso a tela parece contraditória ("estou com 100%, por que continua roxo?").
      var _velho = !_lzTemIds(imp), _antigo = !_lzFresco(imp);
      if (_velho || _antigo) {
        body += '<div style="font-size:0.8rem;color:#a78bfa;margin-top:6px;line-height:1.45;">' +
          (_velho
            ? 'Este histórico foi lido pelo <b>motor antigo</b> — por isso o nome fica violeta mesmo em 100%. Puxe de novo pra ele contar como verificado.'
            : 'Leitura com mais de 3 meses — o nome fica violeta até ser puxada de novo.') +
          '</div>';
      }
      body += (lu ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">Última atualização: <b>' + lu.label + '</b>' +
        (_velho ? ' <span style="color:#a78bfa;">(motor antigo)</span>' : '') + '</div>' : '');
    } else {
      body += '<div style="font-size:0.8rem;color:var(--text-muted);">Nada gravado ainda — leio torneios (nome, categoria, classificação) e depois os jogos, gravando a cada passo.</div>';
    }
    if (typeof window.showConfirmDialog === 'function') {
      window.showConfirmDialog('🎾 ' + (tg.name || '@' + tg.handle), body,
        // ERRO DENTRO DO CALLBACK DO DIALOG É ENGOLIDO. Se qualquer coisa estourar aqui, o
        // dialog fecha e a tela volta — exatamente o "clica em continuar e não faz nada",
        // sem toast, sem console, sem pista. Nunca deixar este callback nu.
        function () {
          try { window._lzAthleteImport(uid); }
          catch (e) {
            var m = (e && (e.stack || e.message)) || String(e);
            if (window._warn) window._warn('[letzplay] falha ao iniciar leitura:', m);
            if (typeof window.showAlertDialog === 'function') {
              window.showAlertDialog('Não deu pra iniciar a leitura',
                '<div style="text-align:left;font-size:0.82rem;">Aconteceu um erro antes de a leitura começar. Recarregue a página e tente de novo.<br><br>' +
                '<details><summary style="cursor:pointer;">detalhe técnico</summary><pre style="white-space:pre-wrap;font-size:0.7rem;margin-top:6px;">' +
                _esc(String(m).slice(0, 400)) + '</pre></details></div>');
            } else if (typeof showNotification === 'function') {
              showNotification('Não deu pra iniciar a leitura', String(m).slice(0, 120), 'error');
            }
          }
        }, null,
        // SEM RODAPÉ: esta tela tem a barra fixa no topo. Dois pares de botões era o
        // "fantasma" que o dono via embaixo. Os botões nativos seguem no DOM, escondidos,
        // e a barra de cima dispara ELES — um caminho só de confirmação/cancelamento.
        // AS AÇÕES FICAM NA LINHA DO NOME. Antes eram uma barra `sticky` dentro do corpo:
        // ela vazava por cima do conteúdo ao rolar e roubava uma faixa inteira de altura.
        // No cabeçalho elas já estão sempre visíveis por construção (o cabeçalho é fixo,
        // `flex: 0 0 auto`) e não ocupam linha nenhuma a mais.
        { confirmText: btnLabel, cancelText: '← Voltar', type: 'info', maxWidth: '760px', hideFooter: true,
          headerHtml:
            '<button type="button" onclick="window._lzFecharDialogo()" ' +
            'style="padding:8px 12px;border-radius:9px;cursor:pointer;font-size:0.78rem;font-weight:700;' +
            'border:1px solid var(--border-color,rgba(255,255,255,0.15));background:rgba(255,255,255,0.08);' +
            'color:var(--text-main,#e8ecf3);white-space:nowrap;">← Voltar</button>' +
            '<button type="button" onclick="window._lzPuxarDoTopo()" ' +
            'style="padding:8px 14px;border-radius:9px;cursor:pointer;font-size:0.78rem;font-weight:800;' +
            'border:1px solid rgba(59,130,246,0.5);background:linear-gradient(135deg,#3b82f6,#2563eb);' +
            'color:#fff;white-space:nowrap;">' + _esc(btnLabel) + '</button>' });
      // a aba de torneios já está montada; isto só pinta o botão ativo
      setTimeout(function () { if (typeof window._lzAba === 'function') window._lzAba('tour'); }, 0);
      // Completa os "de y" das barras AO VIVO com os totais do perfil público
      // (a extensão lê "472 Jogos · 29 Rankings · 35 Torneios" e devolve).
      setTimeout(function () { _lzAskProfileCounts(tg.handle); }, 60);
    } else {
      window._lzAthleteImport(uid);
    }
  };
  // Pede os TOTAIS do perfil público à extensão e atualiza as barras do dialog aberto.
  function _lzAskProfileCounts(handle) {
    function onMsg(e) {
      if (e.source !== window) return; var d = e.data;
      if (!d || d.__sp_lp !== 'lz-profile-counts-result' || d.handle !== handle) return;
      window.removeEventListener('message', onMsg);
      if (d.error) return;
      // ESTE É O SEGUNDO ESCRITOR DA BARRA — e era o que escapava do teto. Ele pega os
      // contadores AO VIVO do perfil e reescrevia o texto usando o `x` já pintado, sem
      // capar: 4 torneios lidos com um total novo de 2 virava "4 de 2 (100%)" na tela do
      // dono. Duas mãos escrevendo o mesmo número e só uma conhecia a regra.
      //   • x NUNCA passa de y (a mesma lei do barLine e do _updBars);
      //   • um total que é FATO (índice varrido / varredura fechada) não é rebaixado pelo
      //     contador do perfil, que conta LINHAS — é ele que diz 81 onde a lista enumera 80.
      function upd(id, y) {
        var el = document.getElementById(id); if (!el || y == null) return;
        if (el.getAttribute('data-auth') === '1') return;
        // NUNCA ENCOLHER: o contador do perfil pode enumerar MENOS do que existe (ele diz
        // 2 torneios pro dono, que jogou 4). Aceitar um total menor apagaria da tela um
        // torneio que ele disputou — foi assim que o BTG sumiu.
        var yAtual = parseInt(el.getAttribute('data-y'), 10) || 0;
        if (yAtual > 0 && y < yAtual) return;
        el.setAttribute('data-y', String(y));
        var x = parseInt(el.getAttribute('data-x'), 10) || 0;
        if (y > 0 && x > y) { x = y; el.setAttribute('data-x', String(x)); }
        var pct = y > 0 ? Math.min(100, Math.round(x / y * 100)) : 0;
        var t = el.querySelector('.lz-bar-txt'); if (t) t.innerHTML = '<b>' + x + '</b> de ' + y + ' (' + pct + '%)';
        var f = el.querySelector('.lz-bar-fill'); if (f) f.style.width = Math.max(2, pct) + '%';
      }
      // Torneios e rankings NÃO vêm mais daqui: o contador do perfil conta inscrição
      // (um ranking de 2023 sem nenhum jogo) e esquece participação (dois torneios de
      // 2024 que ele jogou). Só competição com jogo conta, e isso o app já sabe.
      upd('lz-ath-g', d.games);
    }
    window.addEventListener('message', onMsg);
    setTimeout(function () { window.removeEventListener('message', onMsg); }, 15000);
    window.postMessage({ __sp_lp: 'lz-profile-counts', handle: handle }, window.location.origin);
  }
  // Puxa a COMPLETA de UM atleta pelo @ público — o caminho do autoimport (fetch das
  // páginas /{handle}/matches), sem navegar o perfil SPA (a causa do lote travar).
  window._lzAthleteImport = function (uid) {
    window._lzGravouOk = true; window._lzUltimoErroGravacao = null;
    if (window._log) window._log('[letzplay] iniciar leitura de', uid, '· travaAtiva=', !!window._lzScanRunning,
      '· overlay=', !!document.getElementById('sp-import-overlay'), '· ctx=', !!(window._lzScanCtx && window._lzScanCtx.byUid));
    // NENHUM CLIQUE PODE MORRER CALADO. Estes três `return` mudos faziam o botão
    // "Continuar de onde parou" não fazer NADA — sem toast, sem log, sem pista. O caso real:
    // uma leitura que terminou de forma anormal (aba fechada, página trocada, extensão
    // recarregada no meio) deixa `_lzScanRunning = true` pra sempre, e a partir daí TODO
    // clique seguinte retorna aqui em silêncio. A trava só vale enquanto existe leitura de
    // verdade na tela; sem overlay, ela é lixo de uma sessão morta e é limpa na hora.
    // CLICAR SEMPRE PUXA QUEM FOI PEDIDO. Antes, se houvesse qualquer leitura na tela, o
    // clique era RECUSADO ("já tem uma leitura rodando") — inclusive quando a leitura em
    // curso era de outra pessoa ou era resto de uma sessão morta. Recusar é preguiça
    // nossa: quem pediu a Camila quer a Camila. A leitura anterior é ENCERRADA (overlay
    // fora, trava limpa) e a nova começa na hora.
    if (window._lzScanRunning || document.getElementById('sp-import-overlay')) {
      try { if (typeof window._spCloseImportOverlay === 'function') window._spCloseImportOverlay(); } catch (e) {}
      var _ov = document.getElementById('sp-import-overlay');
      if (_ov && _ov.parentNode) _ov.parentNode.removeChild(_ov);
      window._lzScanRunning = false;
    }
    var ctx = window._lzScanCtx || {};
    var tg = ctx.byUid && ctx.byUid[uid];
    // A PÁGINA DA PESSOA ABRE NO INSTANTE DO CLIQUE. Isto é resposta ao toque, não
    // trabalho de raspagem: vai por um canal próprio (`lz-open-profile` → `lp-nav-now`)
    // que NÃO passa pela fila de trabalho da extensão. Antes a navegação era enfileirada
    // junto com as buscas e esperava o passo aprendido — dezenas de segundos até a aba
    // sequer mudar de página, com o organizador olhando pra uma tela parada.
    if (tg && tg.handle) {
      try { window.postMessage({ __sp_lp: 'lz-open-profile', handle: tg.handle }, '*'); } catch (e) {}
    }
    if (!tg || !tg.handle) {
      if (typeof showNotification === 'function') showNotification('Não deu pra puxar', !tg ? 'Não achei este inscrito na tela — recarregue a página.' : 'Este inscrito não tem @ do letzplay no perfil.', 'error');
      return;
    }
    window._lzScanRunning = true;
    window._lzPendingMode = 'full';
    var done = false, started = false, versions = [], idleTimer = null;
    var who = tg.name || ('@' + tg.handle);
    // RODADAS ENCADEADAS: uma leitura grande não cabe numa rodada só (o perfil da Camila
    // são ~140 requisições com espaçamento humano ≈ 9 min, e uma pausa do letzplay pode
    // interromper antes disso). Quando a rodada devolve `done:false`, o app dispara a
    // seguinte SOZINHO com o cursor — ninguém tem que clicar de novo pra continuar.
    // Regra do dono: "o processo deve demorar mais, mas não falhar nunca."
    var rodada = 0, MAX_RODADAS = 40, _progAnterior = null;
    var cursorAtual = null, ultimoImp = null;
    var ultimaNota = '';   // último passo REAL anunciado — sobrevive às esperas
    var _unidadeDesde = 0, _unidadePasso = '';   // há quanto tempo preso no MESMO passo
    // BARRAS AO VIVO (v1.4.22): as 3 barras do dialog (Torneios/Rankings/Jogos, x de y %)
    // ficam VISÍVEIS no overlay durante a busca e crescem conforme as coisas chegam.
    // Semente = melhor import já gravado (mesma escolha do prior lá embaixo); depois a
    // extensão manda `counts` em cada progresso e os parciais confirmam pelo fullImport.
    var _bs = { t: { x: 0, y: null }, r: { x: 0, y: null }, g: { x: 0, y: null } };
    function _seedBarsFrom(imp) {
      if (!imp) return;
      _updBars({
        g: _lzTot(imp),
        t: window._lzTournamentsRead(imp),   // LIDOS, não conhecidos — regra única
        // rankings RESOLVIDOS (nome/classificação lidos), não só descobertos
        r: (imp.footprint || []).filter(function (f) {
          return !f.official && (f.standings || (f.name && f.name !== f.categoryRaw));
        }).length,
        // total de jogos = o MAIOR entre o declarado e o que já temos. Numa RETOMADA isso
        // faz a barra começar já no número real, em vez de nascer em "478" e pular pro
        // verdadeiro no meio da leitura — que foi o que o dono viu e reclamou com razão.
        gY: Math.max((imp.declaredGames != null) ? imp.declaredGames : 0, _lzTot(imp)) || null,
        tY: (imp.declaredTournaments != null) ? imp.declaredTournaments : null,
        // total = rankings DESCOBERTOS. O do perfil não é alcançável (medido: 29 declarados,
        // 20 com jogo no histórico) e barra que nunca fecha é barra quebrada.
        rY: ((imp.footprint || []).filter(function (f) { return !f.official; }).length)
          || ((imp.declaredRankings != null) ? imp.declaredRankings : null)
      });
    }
    // x nunca anda pra trás (critérios de contagem variam entre fontes) e NUNCA passa de y:
    // o total declarado pelo perfil é a verdade, então 35 de 35 é 100% — "38 de 35" não é
    // um número, é um bug na cara do organizador (regra explícita do dono, 30/jul).
    function _cap(x, y) { return (y != null && y > 0) ? Math.min(x, y) : x; }
    function _updBars(c) {
      if (!c) return;
      if (c.tY != null) _bs.t.y = c.tY;
      if (c.rY != null) _bs.r.y = c.rY;
      if (c.gY != null) _bs.g.y = c.gY;
      // TOTAL de torneios = o MAIOR entre o contador do perfil e o que a lista pública
      // ENUMERA. O perfil da Camila diz 35 e a lista tem mais — e era assim que "35 de 35
      // (100%)" convivia com itens "ainda não lido" na mesma tela. Uma lista que se pode
      // contar vale mais que um contador cujo critério a gente não conhece. Fica AQUI (e
      // não na extensão) pra não obrigar mais um recarregamento dela: o app sabe a lista
      // pelo `tournamentsList` do próprio import.
      var _lst = (ultimoImp && window._lzCompsReaisN) ? window._lzCompsReaisN(ultimoImp, true) : 0;
      if (_lst > 0) _bs.t.y = (_bs.t.y != null) ? Math.max(_bs.t.y, _lst) : _lst;
      var _lsr = (ultimoImp && window._lzCompsReaisN) ? window._lzCompsReaisN(ultimoImp, false) : 0;
      if (_lsr > 0) _bs.r.y = (_bs.r.y != null) ? Math.max(_bs.r.y, _lsr) : _lsr;
      if (c.t != null) _bs.t.x = Math.max(_bs.t.x, c.t);
      if (c.r != null) _bs.r.x = Math.max(_bs.r.x, c.r);
      if (c.g != null) _bs.g.x = Math.max(_bs.g.x, c.g);
      // capa DEPOIS do max e DEPOIS de y ter chegado — senão um x semeado grande fica
      // preso acima do total quando o declarado só aparece na requisição seguinte.
      _bs.t.x = _cap(_bs.t.x, _bs.t.y);
      _bs.r.x = _cap(_bs.r.x, _bs.r.y);
      _bs.g.x = _cap(_bs.g.x, _bs.g.y);
    }
    function _barsArr() {
      return [
        { id: 't', icon: '🏆', label: 'Torneios', x: _bs.t.x, y: _bs.t.y },
        { id: 'r', icon: '📊', label: 'Rankings', x: _bs.r.x, y: _bs.r.y },
        { id: 'g', icon: '🎾', label: 'Jogos', x: _bs.g.x, y: _bs.g.y }
      ];
    }
    // ── DECORRIDO e FALTAM ───────────────────────────────────────────────────────
    // O ritmo é MEDIDO nesta leitura, não estimado por tabela: divide o tempo já gasto
    // pelo trabalho já feito e projeta no que falta. Se o letzplay ficar lento, a conta
    // sobe sozinha — é honesto por construção e não precisa de calibração.
    //
    // Unidade de trabalho = requisição: cada torneio custa ~2 (a página dele + a de jogos),
    // cada página do histórico custa 1. É a mesma conta que mostrou que o perfil da Camila
    // são ~172 requisições — a razão de tudo isto existir.
    var _t0 = Date.now();
    // SEMPRE com segundos. Sem eles o decorrido ficava um minuto inteiro no mesmo texto —
    // e um número parado é justamente o que faz uma leitura sadia parecer travada. Os
    // segundos vão com 2 dígitos pra largura não mudar (a linha usa dígitos tabulares).
    // Acima de 1h continua em minutos ("78min 04s") em vez de "1h 18min": é mais compacto
    // numa linha que já divide espaço com o restante, e continua andando a cada segundo.
    function _fmtDur(ms) {
      var s = Math.max(0, Math.round(ms / 1000));
      if (s < 60) return s + 's';
      var m = Math.floor(s / 60), r = s % 60;
      return m + 'min ' + (r < 10 ? '0' : '') + r + 's';
    }
    // UMA FONTE SÓ: a barra geral e o tempo saem das MESMAS três barras que estão na tela.
    // Antes cada um tinha sua conta: o `pct` era uma faixa fixa por fase (torneios 4–30,
    // rankings 31–45, jogos 46–97), então com os jogos já completos pelo cursor a barra
    // geral ficava presa em 45% "quase terminando"; e o tempo somava torneios + páginas mas
    // ESQUECIA os rankings — na fase deles o decorrido crescia e o feito não, então o
    // "restam" SUBIA em vez de descer. Derivar das barras é consistente por construção.
    function _trabalho() {
      var feito = (_bs.t.x || 0) + (_bs.r.x || 0) + (_bs.g.x || 0);
      var total = (_bs.t.y || 0) + (_bs.r.y || 0) + (_bs.g.y || 0);
      return { feito: feito, total: Math.max(total, feito) };
    }
    // pct geral = o quanto do trabalho declarado já está em casa
    function _pctGeral() {
      var w = _trabalho();
      if (!w.total) return null;
      return Math.max(2, Math.min(100, Math.round(w.feito / w.total * 100)));
    }
    // Linha de base do trabalho JÁ FEITO quando esta leitura começou (o acumulado vem
    // semeado das rodadas anteriores). Sem descontar, o ritmo sai fantasioso.
    // ⚠️ Esta declaração foi apagada por engano na 1.6.23 quando reescrevi `_trabalho()` —
    // `_tempos()` continuou usando `_w0`, e como o relógio de 1s chama `setProg` (que chama
    // `_tempos`), virava ReferenceError A CADA SEGUNDO: a leitura não andava e o clique em
    // "Continuar" morria. O Sentry pegou (8 ocorrências) antes de eu adivinhar mais uma vez.
    var _w0 = null;
    // Mediana dos intervalos entre itens concluídos — o ritmo real, em segundos por item.
    var _ritmos = [], _ultimoItem = 0, _bloqueios = 0;
    function _ritmoTexto() {
      if (_ritmos.length < 2) return '';
      var o = _ritmos.slice().sort(function (a, b) { return a - b; });
      var med = o[Math.floor(o.length / 2)];
      return ' · ' + (med >= 1000 ? (med / 1000).toFixed(1) + 's' : med + 'ms') + '/item';
    }
    function _tempos() {
      var dec = Date.now() - _t0;
      var w = _trabalho();
      if (_w0 == null) _w0 = w.feito;
      var feitoAgora = w.feito - _w0, falta = w.total - w.feito;
      // O "restam" ficava eternamente em "—" numa releitura: quase tudo já estava no banco,
      // então `feito` mal se mexia e nunca chegava nas 3 unidades exigidas. Amostra de 1 já
      // dá uma estimativa útil (e ela se corrige a cada segundo) — melhor um número que se
      // ajusta do que um traço que não diz nada. Continua "—" só enquanto NADA foi feito
      // nesta leitura, que é o único caso em que não há o que medir.
      // SEM "RESTAM" (pedido do dono, 31/jul). A projeção dependia de um total que o
      // letzplay conta em CARDS (478 pra 469 partidas, 158 pra 157) — ela prometia um fim
      // que nunca chegava e virava mais uma coisa errada na tela. O que fica é o que é
      // medido de verdade: o tempo decorrido e o ritmo por item.
      return { decorrido: _fmtDur(dec) + _ritmoTexto(), restante: '' };
    }
    // Relógio de 1s: é ele que faz a tela se MEXER durante as esperas longas. O passo
    // (`sub`) e as barras ficam parados porque nada novo chegou — o que não pode é a tela
    // inteira parecer morta enquanto a leitura está viva.
    var _relogio = setInterval(function () { if (!done) setProg({}); }, 1000);
    function setProg(o) {
      o = o || {};
      if (o.sub == null) o.sub = ultimaNota;   // sem passo novo, mantém o que está em curso
      var _pg = _pctGeral();
      window._spProgressOverlay({ label: '📚 ' + who, sub: o.sub || '', pct: (_pg != null ? _pg : o.pct),
        feedAdd: o.feedAdd || null, bars: _barsArr(), tempos: _tempos(), onCancel: cancel });
    }
    function cleanup() {
      done = true;
      window._lzScanRunning = false;
      window.removeEventListener('message', onMsg);
      if (idleTimer) clearTimeout(idleTimer);
      if (_relogio) { clearInterval(_relogio); _relogio = null; }   // sem relógio órfão
      if (typeof window._spCloseImportOverlay === 'function') window._spCloseImportOverlay();
    }
    function cancel() {
      if (done) return;
      cleanup();
      // SUSPENDER, não cancelar: os parciais já foram gravados e o cursor está salvo —
      // clicar no nome de novo continua daqui, sem reler nada.
      if (typeof showNotification === 'function') {
        showNotification('⏸️ Leitura suspensa', 'O que já veio está gravado. Clique no nome de novo pra continuar de onde parou.', 'info');
      }
      try { if (typeof window._erRenderMatrix === 'function') window._erRenderMatrix(); } catch (e) {}
    }
    function fail(msg) {
      if (done) return;
      cleanup();
      if (typeof showNotification === 'function') showNotification('Não deu pra puxar', msg, 'error');
    }
    function ping() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { fail('A extensão parou de responder (3 min em silêncio). Recarregue a página e tente de novo.'); }, _LZ_IDLE_MS);
    }
    function onMsg(e) {
      if (e.source !== window) return; var d = e.data; if (!d) return;
      if (d.__sp_lp === 'extension-present') { if (d.version) versions.push(d.version); return; }
      // Rate-limit NUNCA aparece pro usuário (regra do dono, 14/jul: "demorar mais, mas
      // não falhar — nunca resolver rate-limit com aviso"). Esperar e ler são a mesma
      // coisa pra ele: texto neutro, watchdog rearmado, barra intacta. A pausa-e-grava
      // automática (rate-budget) continua existindo — só que MUDA, sem ameaça na tela.
      if (d.__sp_lp === 'lz-throttle') {
        ping();
        // TETO POR UNIDADE DE TRABALHO. O `ping()` é rearmado a cada espera, então uma
        // SEQUÊNCIA de esperas no MESMO passo nunca disparava o corte por ociosidade — a
        // leitura ficava indefinidamente no mesmo item, calada, e de fora isso é idêntico a
        // travado ("parece que travou faltando 2"). Passados 4 min preso no mesmo passo, a
        // rodada é encerrada COMO PAUSA e a seguinte retoma pelo cursor: o que veio já está
        // gravado. Não é desistir — é parar de fingir que anda.
        if (!_unidadeDesde || _unidadePasso !== ultimaNota) { _unidadePasso = ultimaNota; _unidadeDesde = Date.now(); }
        else if (Date.now() - _unidadeDesde > 240000 && rodada < MAX_RODADAS) {
          _unidadeDesde = 0;
          setProg({ sub: 'retomando…' });
          proximaRodada();
        }
        // MANTÉM O PASSO NA TELA. Antes isto trocava o texto por uma frase genérica, e o
        // "página 10 de 24" — a única informação real ali — DESAPARECIA justo no momento em
        // que a leitura demora mais. Ficava minutos sem dizer nada, e sem dizer nada é
        // indistinguível de travado. O passo continua; quem se mexe é a linha de baixo.
        // O BLOQUEIO TEM QUE APARECER. Eu vinha ajustando velocidade no escuro e o dono
        // olhando barra parada, sem nunca saber se era lentidão nossa ou o letzplay
        // fechando a porta. Cada espera vira uma linha no feed, com o tempo e o motivo —
        // um número que ele lê na hora, em vez de eu supor.
        _bloqueios++;
        setProg({ sub: ultimaNota || 'lendo o letzplay', pct: null,
          feedAdd: '🚧 letzplay limitou o acesso (' + _bloqueios + 'ª vez) — esperando ' +
            Math.round((d.waitMs || 0) / 1000) + 's' +
            (d.gap ? ' · passo agora ' + (d.gap >= 1000 ? (d.gap / 1000).toFixed(1) + 's' : d.gap + 'ms') : '') });
        return;
      }
      if (d.__sp_lp === 'athlete-import-progress' && d.uid === uid) {
        ping();
        var cur = d.current || {};
        // passo NOVO = progresso de verdade → zera o relógio da unidade
        if (cur.note && cur.note !== ultimaNota) { _unidadeDesde = Date.now(); _unidadePasso = cur.note; }
        if (cur.note) ultimaNota = cur.note;   // o passo em curso, preservado durante as esperas
        // counts (ext ≥1.44): x/y ao vivo das 3 barras — cresce a cada torneio/página lida.
        _updBars(d.counts || null);
        // pct REAL (0–100, calculado pela extensão por etapa) + feed do que foi lido
        // (nome do torneio · classificação · nº de jogos) num box de 2 linhas com scroll.
        // RITMO MEDIDO, NA TELA. Eu vinha ajustando a velocidade por raciocínio e o dono
        // continuava esperando minutos — sem nunca ver um número. Cada item concluído
        // (torneio, ranking, lote de páginas) chega aqui com `feed`; a distância entre dois
        // desses é o custo REAL de uma unidade de trabalho, do clique dele até o dado.
        // Mediana, não média: uma espera de rate-limit não pode mascarar o ritmo normal.
        if (d.feed) {
          var _ag = Date.now();
          if (_ultimoItem) _ritmos.push(_ag - _ultimoItem);
          _ultimoItem = _ag;
          if (_ritmos.length > 40) _ritmos.shift();
        }
        // O CURSOR VEM JUNTO DO PROGRESSO (ext 1.69) — guardamos A CADA página/competição.
        // Antes ele só chegava no PARCIAL, de 3 em 3 páginas: uma interrupção perdia até
        // duas páginas e a retomada refazia trabalho. Aqui é só memória; quem grava é o
        // parcial (o cursor viaja dentro do fullImport).
        if (d.cursor) cursorAtual = d.cursor;
        setProg({ sub: cur.note || '', pct: (d.pct != null ? Math.max(3, d.pct) : null), feedAdd: d.feed || null });
        return;
      }
      // PARCIAL (v1.41): a extensão grava por etapa — a cada torneio lido e a cada
      // 3 páginas de jogos. Persistimos NA HORA: se a rodada morrer no meio (rate-limit,
      // aba fechada), o que veio ficou; a próxima rodada continua de onde parou (prior).
      if (d.__sp_lp === 'athlete-import-partial' && d.uid === uid) {
        ping();
        if (d.cursor) cursorAtual = d.cursor;
        if (d.fullImport) ultimoImp = d.fullImport;
        if (d.scan && d.fullImport && typeof _lzPersistScans === 'function') {
          _lzPersistScans(ctx.tId, [{ uid: uid, handle: tg.handle, name: tg.name || null, scan: d.scan, fullImport: d.fullImport }], d.gamesDelta)
            .catch(function (e) { window._log && window._log('[athlete parcial] não gravou (segue):', (e && e.message) || e); });
        }
        // O parcial traz o fullImport consolidado — atualiza as barras por ele (também
        // cobre extensão antiga sem `counts` no progresso).
        _seedBarsFrom(d.fullImport || null);
        // "gravado" só se GRAVOU. O texto dizia gravado enquanto o servidor recusava tudo.
        var _ok = window._lzGravouOk !== false;
        setProg({ sub: _ok
          ? (d.stage === 'torneios' ? ('torneio ' + d.done + ' de ' + d.total + ' gravado') : ('página ' + d.done + ' de ' + d.total + ' gravada'))
          : ('⚠️ nada foi gravado — ' + (window._lzUltimoErroGravacao || 'escrita recusada')), pct: null });
        if (!_ok) { fail('Nada foi gravado — ' + (window._lzUltimoErroGravacao || 'o servidor recusou a escrita') + '.'); return; }
        return;
      }
      if (d.__sp_lp === 'athlete-import-result' && d.uid === uid) {
        if (done) return;
        if (!d.ok) {
          fail(d.error === 'sem-jogos' ? 'O perfil público de @' + tg.handle + ' não mostrou nenhum jogo.' : ('Falhou: ' + (d.error || 'erro')));
          return;
        }
        if (d.cursor) cursorAtual = d.cursor;
        if (d.fullImport) ultimoImp = d.fullImport;
        // AINDA FALTA LER → grava o que veio e CONTINUA na hora, na mesma sessão, com o
        // cursor. Nada de pedir clique: pra quem está olhando é uma leitura só, que anda.
        // RODADA QUE NÃO ANDA NÃO SE REPETE. Encadear era pra continuar de onde parou —
        // mas quando uma rodada termina com exatamente o mesmo tanto de jogos, torneios e
        // rankings da anterior, ela não continuou nada: vai repetir o mesmo trabalho (perfil
        // + listas + página 1) e chegar no mesmo lugar. Foi isto que transformou "faltam 2
        // jogos" em dois minutos: dezenas de rodadas idênticas, cada uma com meia dúzia de
        // requisições. Uma requisição pelo nosso caminho leva 400ms (medido em 31/jul), então
        // minutos só se explicam por centenas delas.
        var _prog = (function (imp) {
          if (!imp) return '0/0/0';
          var c = imp.lzCursor || {};
          return _lzTot(imp) + '/' + Object.keys(c.toursDone || {}).length + '/' +
                 Object.keys(c.ranksDone || {}).length;
        })(d.fullImport);
        var _andou = (_prog !== _progAnterior);
        _progAnterior = _prog;
        // ESCRITA REJEITADA = A LEITURA NÃO AVANÇOU. Encadear mais rodadas em cima de um
        // banco que está recusando tudo só faz a barra subir mentindo. Para aqui e diz.
        if (window._lzGravouOk === false) {
          fail('Nada foi gravado — ' + (window._lzUltimoErroGravacao || 'o servidor recusou a escrita') +
               '. A leitura parou pra não mostrar avanço que não existe.');
          return;
        }
        if (d.done !== true && rodada < MAX_RODADAS && _andou) {
          ping();
          if (d.scan && d.fullImport && typeof _lzPersistScans === 'function') {
            _lzPersistScans(ctx.tId, [{ uid: uid, handle: tg.handle, name: tg.name || null, scan: d.scan, fullImport: d.fullImport }], d.gamesDelta)
              .catch(function (e) { window._log && window._log('[athlete rodada] não gravou (segue):', (e && e.message) || e); });
          }
          _seedBarsFrom(d.fullImport || null);
          setProg({ sub: 'continuando de onde parou…', pct: null });
          proximaRodada();
          return;
        }
        cleanup();
        if (typeof window._showLoading === 'function') window._showLoading('Salvando ' + who + '…');
        var n = _lzTot(d.fullImport);
        var nDecl = d.fullImport && d.fullImport.declaredGames;
        _saveScansAndReload(ctx.tId, [{ uid: uid, handle: tg.handle, name: tg.name || null, scan: d.scan, fullImport: d.fullImport }],
          function (m) { if (typeof showNotification === 'function') showNotification('Não deu pra salvar', m, 'error'); });
        // PAUSADO/PARCIAL: RELATÓRIO NA TELA (pedido do dono) — o que puxou e o que
        // não puxou, torneio a torneio + jogos gerais — e como retomar.
        var _isParcial = (d.done !== true) || (d.fullImport && d.fullImport.partialReason);
        var rep = d.report || null;
        if (_isParcial && rep && typeof window.showAlertDialog === 'function') {
          var html = '<div style="text-align:left;font-size:0.85rem;line-height:1.55;">';
          html += '<div style="margin-bottom:6px;">' + (d.paused ? 'A leitura desta rodada terminou — <b>o que veio está gravado</b>.' : 'A leitura foi interrompida — <b>o que veio está gravado</b>.') + '</div>';
          if (rep.tournaments && rep.tournaments.length) {
            html += '<div style="font-weight:800;margin:8px 0 3px;">Torneios</div>';
            // BOX SCROLLÁVEL (v1.4.31, pedido do dono): 35 torneios estouravam a página e
            // os botões do dialog sumiam. Lista rola dentro do box; o resto fica visível.
            html += '<div style="max-height:14em;overflow-y:auto;background:var(--bg-darker,rgba(0,0,0,0.2));border:1px solid var(--border-color,rgba(255,255,255,0.08));border-radius:8px;padding:6px 9px;">';
            rep.tournaments.forEach(function (tt) {
              html += '<div style="padding:1px 0;">' + (tt.got ? '✅' : '❌') + ' ' + _esc(tt.title) +
                (tt.got ? ((tt.pos != null ? (' · ' + tt.pos + 'º lugar') : '') + ' · ' + tt.games + ' jogo(s)') : ' · não lido') + '</div>';
            });
            html += '</div>';
          }
          html += '<div style="font-weight:800;margin:8px 0 3px;">Jogos gerais</div>';
          html += '<div>' + (rep.pagesRead >= rep.maxPage ? '✅' : '⏳') + ' páginas lidas: <b>' + rep.pagesRead + ' de ' + rep.maxPage + '</b> · jogos gravados: <b>' + rep.games + (rep.declared ? (' de ' + rep.declared) : '') + '</b></div>';
          html += '<div style="margin-top:10px;color:#fbbf24;">▶️ Clique no nome de novo mais tarde — continuo <b>de onde parei</b> (nada se perde).</div>';
          html += '</div>';
          window.showAlertDialog('⏸️ ' + who + ' — relatório da leitura', html);
        }
        if (typeof showNotification === 'function') {
          if (_isParcial) {
            showNotification('⏸️ Parcial salvo', who + ': ' + n + (nDecl ? (' de ' + nDecl) : '') + ' jogo(s) gravados.', 'warning');
          } else {
            showNotification('🎾 Histórico puxado', who + ' — ' + n + ' jogo(s).', 'success');
          }
        }
        return;
      }
    }
    // PRIOR = o que já foi gravado (scan do organizador OU import próprio do atleta —
    // o de MAIS jogos vence): a extensão semeia o acumulado, PULA torneios já completos
    // e para cedo nos jogos gerais quando alcança o que já está gravado. Computado JÁ
    // (não só no dispatch) pra semear as barras do overlay com o que está gravado.
    var rctx = window._lzRenderCtx || {};
    var _prof = rctx.profileMap && rctx.profileMap[uid];
    var _sc = rctx.scanMap && rctx.scanMap[uid];
    var _pImp = (_prof && _prof.letzplayImport) || null;
    var _sImp = (_sc && _sc.fullImport) || null;
    var prior = _sImp || _pImp || null;
    if (_sImp && _pImp) {
      prior = (_lzTot(_pImp) > _lzTot(_sImp)) ? _pImp : _sImp;
    }
    // CURSOR gravado: onde a última leitura parou. Sem ele a retomada recomeça do zero.
    cursorAtual = (prior && prior.lzCursor) || null;
    ultimoImp = prior;
    // Dispara UMA rodada. A extensão devolve `done:false` enquanto sobrar trabalho e o
    // handler do resultado chama isto de novo — sempre com o cursor mais recente.
    function proximaRodada() {
      if (done) return;
      rodada++;
      window.postMessage({ __sp_lp: 'run-athlete-import', handle: tg.handle, uid: uid,
        tournamentId: ctx.tId, prior: ultimoImp || prior, cursor: cursorAtual }, window.location.origin);
    }
    _seedBarsFrom(prior);
    setProg({ sub: 'conectando à extensão…', pct: 2 });
    window.addEventListener('message', onMsg);
    window.postMessage({ __sp_lp: 'ext-ping' }, window.location.origin);
    ping();
    setTimeout(function () {
      if (done || started) return;
      if (!versions.length) { cleanup(); _lzExtDialog(null); return; }
      var best = versions.reduce(function (m, v) { return _verGE(v, m) ? v : m; }, '0');
      if (!_verGE(best, _LZ_MIN_EXT)) { cleanup(); _lzExtDialog(best); return; }
      started = true;
      proximaRodada();
    }, 900);
  };

  // Seção ÚNICA da Análise: Categorias com apuração pelo letzplay. Junta os botões
  // de busca, a legenda de cores e a matriz (nomes pintados pela verificação).
  function _renderCategoriesSection(rows, t, profileMap, scanMap) {
    profileMap = profileMap || {}; scanMap = scanMap || {};
    _erApplyLzToRows(rows, profileMap, scanMap);
    window._lzRenderCtx = { t: t, rows: rows, profileMap: profileMap, scanMap: scanMap };
    var _isOrg = !!(window.AppStore && typeof window.AppStore.isOrganizer === 'function' && window.AppStore.isOrganizer(t));

    // Alvos da busca = TODOS os competidores autorizados (@ + consentimento). O ORGANIZADOR
    // competidor entra auto-autorizado (é o próprio dado público dele). Inclui quem JÁ tem
    // import — pra atualizar os desatualizados; a precedência (scan mais novo) só sobrescreve
    // quando de fato é mais recente, então perfil atual não é clobbado à toa.
    var _meUid = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid) || null;
    var targets = (rows || []).filter(function (r) {
      var prof = r.uid && profileMap[r.uid];
      if (!prof || !prof.letzplayHandle) return false;
      return (_meUid && r.uid === _meUid) || prof.letzplayConsent === true;
    }).map(function (r) { return { uid: r.uid, handle: profileMap[r.uid].letzplayHandle, name: r.name }; });
    // v1.1.21: FIM do lote (Essencial/Completa em batch) — travava e não trazia nada.
    // A busca virou INDIVIDUAL: clicar num nome autorizado abre a tela de puxar o
    // histórico DAQUELE atleta (caminho do autoimport, pelo @ público). O hover no
    // nome mostra a última atualização (< 1 mês). byUid alimenta o clique/hover.
    var byUid = {};
    targets.forEach(function (tg) { if (tg.uid) byUid[tg.uid] = tg; });
    window._lzScanCtx = { tId: t.id, targets: targets, byUid: byUid };
    var scanBtn = '';
    // Legenda (todos os rótulos) — código de cor da verificação.
    function leg(c, txt) { return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:700;color:' + c + ';"><span style="width:11px;height:11px;border-radius:50%;background:' + c + ';"></span>' + txt + '</span>'; }
    var legend = '<div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:12px;">' +
      leg(_LZ_COL.red, 'deve subir') + leg(_LZ_COL.yellow, 'pode subir') + leg(_LZ_COL.blue, 'rebaixar') + leg(_LZ_COL.green, 'coerente') + leg(_LZ_COL.violet, 'autorizado') + leg(_LZ_COL.white, 'não autorizou') +
      '</div>';
    var hint = _isOrg ? '<div style="font-size:14px;color:var(--text-muted);margin-bottom:12px;">Arraste um nome pro box de gênero (atribui gênero) ou pra uma categoria dentro dele (atribui gênero + categoria). Salve no topo. <b style="color:var(--text-secondary,#c8cdd6);">Clique</b> num nome <span style="color:' + _LZ_COL.violet + ';font-weight:700;">autorizado</span> pra puxar o histórico do letzplay dele (um por vez); pare o mouse em cima pra ver a última atualização.</div>' : '';
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
        var gl = _personGender(r.gender);   // filtro de PESSOA: só Fem/Masc/sem
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
  // compara versões "a.b.c" — a >= b?
  function _verGE(a, b) {
    a = String(a || '0').split('.').map(Number); b = String(b || '0').split('.').map(Number);
    for (var i = 0; i < Math.max(a.length, b.length); i++) { var x = a[i] || 0, y = b[i] || 0; if (x !== y) return x > y; }
    return true;
  }
  // FONTE ÚNICA: window.SP_EXT_VERSION (store.js). Este valor era '1.25' fixo enquanto a
  // extensão já ia na 1.36 — foi o que deixou a busca de 14/jul/2026 rodar com a 1.35 e
  // gravar ZERO jogos (a 1.35 desiste na 4ª tentativa de rajada; a 1.36 tem fila global +
  // 8 tentativas + respeita retry-after). Sem número solto aqui, nunca mais diverge.
  var _LZ_MIN_EXT = window.SP_EXT_VERSION;

  // Fração de progresso DENTRO de uma pessoa (o modo completo lê perfil → jogos →
  // torneios). Sem isto a barra fica parada em "0% · Fulano" por minutos no 1º
  // participante e parece travada — foi o que o organizador reportou.
  var _LZ_PHASE_FRAC = { perfil: 0.15, jogos: 0.45, torneios: 0.8 };

  // Busca ativa do organizador. REGRAS (v1.1.18):
  //  • Barra de progresso canônica (bolinha girando + fase descrita) — nunca "travado".
  //  • NÃO existe prazo total: a busca completa de 4 pessoas passa MUITO de 90s
  //    (paginação + 1 fetch por torneio + espera do rate-limit). O antigo timeout de
  //    90s matava buscas SADIAS no meio → "não deu pra buscar" com tudo funcionando.
  //    Agora o único corte é OCIOSIDADE: 3 min sem NENHUMA notícia da extensão.
  //  • Clicar de novo enquanto roda: não faz nada (a barra já está na tela).
  //  • O que já foi lido é salvo mesmo se o resto falhar (resultado parcial).
  var _LZ_IDLE_MS = 180000;
  var _LZ_FULL_MS_KEY = 'scoreplace_lz_full_ms';
  // Quanto custa, MEDIDO, uma pessoa na busca completa. Começa em ~2min (a conta pela
  // cadência da extensão: ~22 requisições × ~3,5s) e passa a valer o tempo real assim que
  // uma busca termina — inclusive o quanto o letzplay estiver limitando HOJE. É isso que
  // faz o tamanho do lote e o regressivo acertarem em vez de repetir um chute fixo.
  function _lzMeasuredFullMs() {
    var v = parseInt(localStorage.getItem(_LZ_FULL_MS_KEY) || '', 10);
    return (v > 5000 && v < 900000) ? v : 120000;
  }
  function _lzRecordFullMs(ms) {
    if (!(ms > 5000)) return;
    var cur = _lzMeasuredFullMs();
    localStorage.setItem(_LZ_FULL_MS_KEY, String(Math.round(cur * 0.5 + ms * 0.5)));
  }
  // Antiguidade em ms (maior = mais desatualizado). Nunca varrido → vem primeiro sempre.
  function _lzStaleness(tg) {
    var sc = (window._lzRenderCtx && window._lzRenderCtx.scanMap) ? window._lzRenderCtx.scanMap[tg.uid] : null;
    var ts = (sc && sc.scannedAt) ? (Date.parse(sc.scannedAt) || 0) : 0;
    return ts ? (Date.now() - ts) : Number.MAX_SAFE_INTEGER;
  }
  // Ordena a varredura: JOB ÚNICO, sem corte por lote.
  //
  // O lote de 20min foi tentado e DESCARTADO pelo dono, por um motivo que vale mais que o
  // tempo: _"divididos em lotes podem confundir o organizador que pensa que puxou tudo mas
  // nao puxou e nao puxa de novo."_ É a MESMA família de bug que passamos o dia matando —
  // sistema que reporta sucesso sem ter trazido o dado. Um job longo com o tempo na tela e
  // um botão de interromper é honesto; um lote silencioso não é.
  //
  // Segurança do job longo (é o que torna as 3h aceitáveis):
  //   • cada pessoa é GRAVADA assim que conclui (_lzPersistScans no parcial) — fechar a
  //     aba/dormir o notebook perde no máximo a pessoa em andamento;
  //   • Interromper salva o que já veio;
  //   • a ordem é do MAIS DESATUALIZADO pro mais recente, então interromper no meio deixa
  //     pra trás justamente quem estava mais atualizado — o corte nunca é arbitrário.
  // Exposto pra teste (tests/letzplay-batch.test.js): a ordem é decisão do dono.
  window._lzPlanScan = function (targets, mode) {
    targets = (targets || []).slice();
    if (mode !== 'full') return { targets: targets, sobram: 0 };
    // Mais desatualizado primeiro; nunca varrido vem antes de todo mundo.
    targets.sort(function (a, b) { return _lzStaleness(b) - _lzStaleness(a); });
    return { targets: targets, sobram: 0 };
  };
  // Extensão ausente/velha → DIÁLOGO COM BOTÃO QUE BAIXA, não um toast de texto.
  //
  // O organizador NÃO passa pelo onboarding do letzplay (#importar-letzplay) — aquilo é o
  // fluxo de quem importa o PRÓPRIO histórico. Ele vive na Análise de Inscritos, e aqui o
  // gate mandava "baixe a v1.38 em scoreplace.app/..." num toast: texto que some, não
  // clica, e manda o cara copiar URL na mão. O zip existia, servido, e mesmo assim não
  // havia como chegar nele a partir da tela onde o bloqueio acontece.
  // Sem versão na loja não há auto-update, então o download TEM que estar aqui.
  function _lzExtDialog(versaoAtual) {
    var url = (typeof window._spExtZipUrl === 'function') ? window._spExtZipUrl() : null;
    var titulo = versaoAtual ? ('🧩 Sua extensão é a v' + versaoAtual) : '🧩 Extensão não encontrada';
    var corpo = versaoAtual
      ? 'A busca precisa da <b>v' + _LZ_MIN_EXT + '</b>. A v' + versaoAtual + ' desiste quando o letzplay limita o acesso e conclui a busca <b>sem trazer os jogos</b> — sem erro nenhum.'
      : 'Não achei a extensão do scoreplace neste navegador. É ela que lê o letzplay dentro da sua sessão logada.';
    corpo += '<br><br><b>Instalar:</b><br>' +
      '1. Baixe o zip e <b>descompacte</b><br>' +
      '2. Abra <code>chrome://extensions</code> → ligue <b>Modo do desenvolvedor</b><br>' +
      '3. <b>Carregar sem compactação</b> → escolha a pasta que saiu do zip' +
      (versaoAtual ? ' (e remova a v' + versaoAtual + ')' : '') + '<br>' +
      '4. Recarregue esta página';
    if (typeof window.showConfirmDialog !== 'function' || !url) {
      _toastErr(titulo + ' — a busca precisa da v' + _LZ_MIN_EXT + '.');
      return;
    }
    window.showConfirmDialog(titulo, corpo, function () {
      var a = document.createElement('a');
      a.href = url; a.setAttribute('download', '');
      document.body.appendChild(a); a.click(); a.remove();
    }, null, { confirmText: '⬇️ Baixar a v' + _LZ_MIN_EXT, cancelText: 'Agora não', type: 'warning' });
  }

  // Quanto tempo a busca vai levar, em texto — MOSTRADO ANTES de começar. Um job de 3h
  // que arranca sem avisar é uma emboscada; avisado, é uma escolha.
  function _lzEtaLabel(n, mode) {
    var ms = n * (mode === 'full' ? _lzMeasuredFullMs() : 8500);
    var min = Math.round(ms / 60000);
    if (min < 60) return '~' + Math.max(1, min) + 'min';
    return '~' + (ms / 3600000).toFixed(1).replace('.', ',') + 'h';
  }
  window._lzScanRunning = false;
  window._lzOrgScan = function (mode) {
    mode = (mode === 'full') ? 'full' : 'essential';
    if (window._lzScanRunning) return;   // já rodando → a barra está na tela
    var ctx = window._lzScanCtx;
    if (!ctx || !ctx.targets || !ctx.targets.length) return;
    // Alvos = só quem está DESATUALIZADO (> 6 dias). Com zero pendentes o botão está
    // cinza/inativo, então este caminho é só rede de segurança (nunca deve ser clicável).
    var targets = (ctx.pend && ctx.pend[mode]) || ctx.targets;
    if (!targets.length) return;
    // A COMPLETA custa ~22 requisições por pessoa (páginas do histórico + 1 por competição)
    // → ~2min em cadência humana (obrigatória: correr faz o Cloudflare bloquear e não vem
    // jogo nenhum). 100 inscritos = ~3h. É UM job, avisado e interrompível — o lote foi
    // descartado por esconder do organizador que faltava gente (ver _lzPlanScan).
    var _plano = window._lzPlanScan(targets, mode);
    targets = _plano.targets;
    // Job longo (>20min) avisa ANTES. Diz que dá pra interromper e que nada se perde —
    // sem isso o organizador ou não clica (com medo) ou clica e abandona no meio achando
    // que travou. Só a completa costuma chegar lá; a essencial de 100 dá ~14min.
    if (mode === 'full' && targets.length * _lzMeasuredFullMs() > 20 * 60 * 1000 &&
        typeof window.showConfirmDialog === 'function') {
      var _eta = _lzEtaLabel(targets.length, mode);
      window.showConfirmDialog(
        '📚 Busca completa: ' + _eta,
        'Vou ler o histórico inteiro de ' + targets.length + ' inscrito(s) no letzplay, no ritmo que ele aceita (ir mais rápido faz ele bloquear e não vir jogo nenhum).\n\n' +
        'Pode deixar rodando e usar o app normalmente. Dá pra <b>interromper a qualquer momento</b> — cada pessoa é salva assim que fica pronta, então nada do que já veio se perde.\n\n' +
        'Começo pelos mais desatualizados.',
        function () { _lzRunScan(mode, targets); },
        null, { confirmText: 'Buscar (' + _eta + ')', cancelText: 'Agora não', type: 'info' }
      );
      return;
    }
    _lzRunScan(mode, targets);
  };
  function _lzRunScan(mode, targets) {
    var ctx = window._lzScanCtx;
    if (!ctx || !targets || !targets.length) return;
    window._lzScanRunning = true;
    window._lzPendingMode = mode; // registra o modo pra gravar no scan (última verificação)
    var total = targets.length;
    // Semente do regressivo: a essencial é 1 navegação por pessoa; a completa é a paginação
    // inteira. A medição real corrige já na 1ª pessoa concluída.
    window._spEtaBegin(total, mode === 'full' ? _lzMeasuredFullMs() : 8500);
    var bestScans = {}, versions = [], started = false, done = false, resultTimer = null, idleTimer = null;
    var _gravados = {};   // uids já persistidos incrementalmente (não regrava no fim)
    function scanList() { return Object.keys(bestScans).map(function (u) { return bestScans[u]; }); }
    function setProg(o) {
      o = o || {};
      window._spProgressOverlay({
        label: o.label || (mode === 'full' ? '📚 Busca completa no letzplay' : '🔎 Verificando no letzplay'),
        sub: o.sub || '', pct: o.pct, onCancel: o.noCancel ? null : cancel
      });
    }
    var _startedAt = Date.now();
    function cleanup() {
      done = true;
      window._lzScanRunning = false;
      // Guarda o custo REAL por pessoa da completa: é o que dimensiona o próximo lote e
      // a estimativa inicial. Assim o "N mais desatualizados" acompanha o quanto o
      // letzplay está limitando hoje, em vez de repetir um chute fixo.
      var _feitos = scanList().filter(function (s) { return s.uid && s.scan; }).length;
      if (mode === 'full' && _feitos > 0) _lzRecordFullMs((Date.now() - _startedAt) / _feitos);
      if (typeof window._spEtaEnd === 'function') window._spEtaEnd();
      window.removeEventListener('message', onMsg);
      if (idleTimer) clearTimeout(idleTimer);
      if (resultTimer) clearTimeout(resultTimer);
      if (typeof window._spCloseImportOverlay === 'function') window._spCloseImportOverlay();
    }
    function cancel() {
      if (done) return;
      var got = scanList().filter(function (s) { return s.uid && s.scan; });
      cleanup();
      // Cancelou no meio? O que JÁ foi lido não se perde — grava e mostra.
      if (got.length) _saveScansAndReload(ctx.tId, got, function (m) { _toastErr(m); });
      else if (typeof showNotification === 'function') showNotification('Busca cancelada', 'Nada foi alterado.', 'info');
    }
    function _toastErr(msg) { if (typeof showNotification === 'function') showNotification('Não deu pra buscar', msg, 'error'); }
    // Falha: NUNCA joga fora o que já foi lido — salva o parcial e explica o resto.
    function fail(msg) {
      var got = scanList().filter(function (s) { return s.uid && s.scan; });
      cleanup();
      if (got.length) {
        _saveScansAndReload(ctx.tId, got, _toastErr);
        if (typeof showNotification === 'function') {
          showNotification('Busca interrompida', got.length + ' de ' + total + ' foram salvos. ' + msg, 'warning');
        }
        return;
      }
      _toastErr(msg);
    }
    // Watchdog por OCIOSIDADE: rearmado a cada notícia da extensão. Só dispara se a
    // busca ficar realmente muda (extensão morta/recarregada no meio).
    function ping() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (done) return;
        fail('A extensão parou de responder (3 min em silêncio). Recarregue a página e tente de novo — o que já foi lido está salvo.');
      }, _LZ_IDLE_MS);
    }
    function mergeScans(list) {
      // Merge preferindo o scan COM categoria — cobre extensões duplicadas (uma
      // velha devolve null, uma nova devolve a categoria).
      (list || []).forEach(function (s) {
        if (!s.uid) return;
        var cur = bestScans[s.uid];
        var sCat = !!(s.scan && s.scan.rankingCategory);
        var cCat = !!(cur && cur.scan && cur.scan.rankingCategory);
        if (!cur || (sCat && !cCat)) bestScans[s.uid] = s;
      });
    }
    function onMsg(e) {
      if (e.source !== window) return; var d = e.data; if (!d) return;
      // Junta as versões anunciadas (pode haver content scripts órfãos) — usa a MAIOR.
      if (d.__sp_lp === 'extension-present') { if (d.version) versions.push(d.version); return; }
      // O letzplay pediu pra esperar. Isso é PROGRESSO (o sistema está se adaptando ao
      // ritmo dele), não travamento: rearma o watchdog e explica a espera. Sem isto, uma
      // pausa legítima de 60s ficava muda e, somada, podia estourar os 3 min de ociosidade
      // e matar uma busca que estava indo bem.
      if (d.__sp_lp === 'lz-throttle') {
        ping();
        // A espera entra na conta: o regressivo AUMENTA (é o previsto — "pode ir ajustando,
        // aumentando ou diminuindo"). Sem isso ele desceria durante a pausa e mentiria.
        window._spEtaDelay(d.waitMs || 0);
        // NÃO expor "o letzplay pediu pra ir mais devagar" nem o ritmo em s/página: é
        // detalhe de infraestrutura NOSSO. Pro organizador, esperar o rate-limit e ler uma
        // página são a mesma coisa — a busca está andando. A espera já entra no regressivo
        // (_spEtaDelay), então o "quanto falta" segue honesto sem virar ansiedade.
        setProg({ label: '⚙️ Processando informações…',
          sub: 'a busca continua — pode deixar rodando e usar o app', pct: null });
        return;
      }
      if (d.__sp_lp === 'org-scan-progress' && d.tournamentId === ctx.tId) {
        ping();
        var tot = d.total || total;
        var cur = d.current || {};
        var frac = _LZ_PHASE_FRAC[cur.phase] || 0;
        // pct e regressivo saem da MESMA contagem (_spEtaSync/_spEtaFrac) — é o que garante
        // que 100% e 0s chegam juntos, sem ajuste cosmético no fim.
        window._spEtaSync(d.done || 0);
        window._spEtaFrac(frac);
        var pct = window._spEtaPct() || (tot ? Math.min(99, Math.round(((d.done || 0) + frac) / tot * 100)) : 0);
        var who = cur.name || cur.handle || '';
        var note = cur.note ? (' · ' + cur.note) : '';
        setProg({ label: (mode === 'full' ? '📚 Busca completa no letzplay' : '🔎 Verificando no letzplay'),
          sub: ((d.done || 0) + 1) + ' de ' + tot + ' · ' + who + note, pct: Math.max(3, pct) });
        return;
      }
      if (d.__sp_lp === 'org-scan-result' && d.tournamentId === ctx.tId) {
        if (!d.ok) return;   // uma extensão falhou; aguarda outra (caso duplicadas)
        ping();
        mergeScans(d.scans);
        // parcial = a extensão avisando o que já leu. GRAVA AGORA quem acabou de ficar
        // pronto: antes isto era `return` seco e o Firestore só era tocado no FIM, então
        // uma busca de 3h que morresse no minuto 179 perdia tudo — apesar de a extensão
        // prometer que "o que já foi lido está salvo". Cada uid é gravado UMA vez (_gravados).
        if (d.partial) {
          var novos = scanList().filter(function (s) { return s.uid && s.scan && !_gravados[s.uid]; });
          if (novos.length) {
            novos.forEach(function (s) { _gravados[s.uid] = 1; });
            _lzPersistScans(ctx.tId, novos).catch(function (e) {
              // Falhou a gravação incremental? Solta o uid pra tentar de novo no fim —
              // melhor gravar duas vezes que perder.
              novos.forEach(function (s) { delete _gravados[s.uid]; });
              window._log && window._log('[lz parcial] não gravou (tenta no fim):', (e && e.message) || e);
            });
          }
          return;
        }
        // debounce: espera ~2s por resultados de outras extensões, depois salva o melhor
        if (resultTimer) clearTimeout(resultTimer);
        resultTimer = setTimeout(function () {
          var got = scanList();
          cleanup();
          if (typeof window._showLoading === 'function') window._showLoading('Salvando o que foi encontrado…');
          _saveScansAndReload(ctx.tId, got, _toastErr);
        }, 2000);
      }
    }
    setProg({ label: '🔌 Conectando à extensão…', sub: 'só um instante', pct: 2, noCancel: true });
    window.addEventListener('message', onMsg);
    window.postMessage({ __sp_lp: 'ext-ping' }, window.location.origin);
    ping();
    setTimeout(function () {
      if (done || started) return;
      if (!versions.length) { cleanup(); _lzExtDialog(null); return; }
      var best = versions.reduce(function (m, v) { return _verGE(v, m) ? v : m; }, '0');
      // BLOQUEIA versão velha — não avisa e deixa passar. Em 14/jul/2026 o mínimo estava
      // congelado em '1.25' enquanto a extensão ia na 1.36: a 1.35 passou no gate e gravou
      // ZERO jogos para 4 inscritos, reportando "busca concluída". Uma extensão defasada
      // não é um detalhe cosmético — ela silenciosamente não traz o dado.
      if (!_verGE(best, _LZ_MIN_EXT)) { cleanup(); _lzExtDialog(best); return; }
      started = true;
      setProg({ sub: 'preparando ' + total + (total === 1 ? ' inscrito' : ' inscritos'), pct: 3 });
      window.postMessage({ __sp_lp: 'run-org-scan', targets: targets, tournamentId: ctx.tId, mode: mode }, window.location.origin);
    }, 900);
  };
  // GRAVA um punhado de scans em letzplayScans/{uid}. Extraído de _saveScansAndReload
  // pra poder ser chamado A CADA PESSOA concluída, e não só no fim.
  //
  // POR QUE ISSO IMPORTA: a extensão sempre mandou resultado parcial a cada pessoa, mas o
  // app fazia `if (d.partial) return;` — acumulava em MEMÓRIA e só escrevia no Firestore
  // no fim. Numa busca completa de 100 inscritos (~3h), fechar a aba, dormir o notebook ou
  // um refresh perdia TUDO, apesar de o comentário na extensão prometer que "o que já foi
  // lido está salvo". Agora cada pessoa é gravada assim que fica pronta.
  // ⚠️ TRAVA ÚNICA CONTRA REGRESSÃO — usada por TODOS os caminhos de escrita.
  // O histórico da pessoa não pode diminuir. Aconteceu três vezes hoje (158→20, 469→20,
  // 469→569) e cada vez que esse número piora o app perde credibilidade inteira.
  // Duas defesas, porque uma só não basta:
  //   • MARCA D'ÁGUA EM MEMÓRIA (`_lzMaxJogos`): um parcial atrasado não pode vencer o
  //     fechamento. Os dois escrevem no MESMO doc e a ordem de chegada não é garantida —
  //     foi exatamente assim que o `partialReason` ficou grudado antes.
  //   • CONFERÊNCIA NO BANCO: cobre sessão nova, outra aba, outro organizador.
  // Devolve o `doc` já ajustado (sem `fullImport` quando seria regressão).
  var _lzMaxJogos = {};
  function _lzBarrarRegressao(uid, doc, db) {
    var agora = doc.fullImport ? _lzTot(doc.fullImport) : 0;
    if (!doc.fullImport) return Promise.resolve(doc);
    var pico = _lzMaxJogos[uid] || 0;
    function barrar(antes, origem) {
      delete doc.fullImport;
      window._warn && window._warn('[letzplay] regressão barrada (' + origem + '): chegaram ' +
        agora + ' jogos, já havia ' + antes + ' — histórico mantido.');
      if (typeof showNotification === 'function') {
        showNotification('Histórico preservado',
          'A leitura trouxe ' + agora + ' jogo(s) e já havia ' + antes + ' — mantive os ' + antes + '.', 'info');
      }
      return doc;
    }
    // ⚠️ TETO: o guard não pode proteger um documento CORROMPIDO. O letzplay declara
    // quantos jogos a pessoa tem (`declaredGames`) e esse é o número de CARDS — o total de
    // partidas distintas nunca passa disso. Um documento com mais que o declarado é
    // provadamente errado (aconteceu: 478 viraram 1038 por um bug meu), e proteger esse
    // número impediria a própria correção de entrar. Acima do teto, a escrita menor passa.
    var teto = (doc.fullImport && doc.fullImport.declaredGames) || 0;
    function corrompido(n) { return teto > 0 && n > teto; }
    if (pico > agora && !corrompido(pico)) return Promise.resolve(barrar(pico, 'memória'));
    return db.collection('letzplayScans').doc(uid).get()
      .then(function (d) {
        var antes = d.exists ? _lzTot((d.data() || {}).fullImport) : 0;
        if (antes > agora && !corrompido(antes)) return barrar(antes, 'banco');
        if (corrompido(antes)) {
          window._warn && window._warn('[letzplay] o gravado tinha ' + antes + ' jogos com ' +
            teto + ' declarados — corrompido, será substituído por ' + agora + '.');
        }
        _lzMaxJogos[uid] = Math.max(corrompido(pico) ? 0 : pico, agora);
        return doc;
      })
      .catch(function () { _lzMaxJogos[uid] = Math.max(pico, agora); return doc; });
  }

  function _lzPersistScans(tId, scans, gamesDelta) {
    var ok = (scans || []).filter(function (s) { return s.uid && s.scan; });
    if (!ok.length) return Promise.resolve(0);
    var db = firebase.firestore();
    var meUid = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid) || null;
    var nowIso = new Date().toISOString();
    var scanMode = (window._lzPendingMode === 'full') ? 'full' : 'essential';
    var meName = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.displayName) || null;
    var _tour = (typeof window._findTournamentById === 'function') ? window._findTournamentById(tId)
      : ((window.AppStore && window.AppStore.tournaments) || []).filter(function (t) { return String(t.id) === String(tId); })[0];
    var tName = _tour ? (_tour.name || null) : null;
    return Promise.all(ok.map(function (s) {
      var gotFull = !!(s.fullImport && Array.isArray(s.fullImport.games) && s.fullImport.games.length);
      if (s.scan && typeof s.scan === 'object') {
        s.scan._mode = (scanMode === 'full' && gotFull) ? 'full' : 'essential';
        s.scan._fullGames = gotFull ? _lzTot(s.fullImport) : 0;
        s.scan._fullError = (scanMode === 'full' && !gotFull) ? (s.fullError || 'sem-jogos') : null;
      }
      var doc = { handle: s.handle, scan: s.scan, scannedAt: nowIso, scannedBy: meUid, scannedByName: meName, tournamentId: String(tId), tournamentName: tName };
      // ⚠️ PARCIAL NUNCA VIRA DOCUMENTO OFICIAL.
      // Esta é a causa-raiz de TODOS os episódios de hoje: os parciais gravavam o
      // `fullImport`, então uma leitura interrompida no meio deixava 20 jogos como se
      // fossem o histórico da pessoa — e a tela, corretamente, mostrava o que estava
      // gravado. Não existe display que conserte um banco com dado errado.
      // Agora o parcial grava só o PROGRESSO: o cursor (pra retomar de onde parou) e o
      // resumo. O histórico em si só é substituído pelo fechamento de uma leitura
      // COMPLETA — ver _saveScansAndReload. As partidas já lidas não se perdem: elas vão,
      // uma a uma, pro acervo canônico (letzplayTournaments/{comp}/matches/{id}), que é
      // append-only e não depende deste documento.
      if (gotFull && s.fullImport && s.fullImport.lzCursor) doc.lzCursorParcial = s.fullImport.lzCursor;
      // OS TOTAIS PODEM (e devem) IR NO PARCIAL: eles são fato conhecido antes de ler o
      // detalhe, e é justamente isso que impede a tela de mostrar "20 de 20" enquanto a
      // leitura ainda está preenchendo. Histórico não vai; estrutura vai.
      if (s.fullImport && s.fullImport.totais) doc.totaisLetzplay = s.fullImport.totais;
      var w = _lzBarrarRegressao(s.uid, doc, db)
        .then(function (d2) { return db.collection('letzplayScans').doc(s.uid).set(d2, { merge: true }); })
        .catch(function (err) {
          // NUNCA falhar MUDO (caso Camila: 472 jogos → doc >1MiB → todos os writes
          // morriam em silêncio e "não gravava porra nenhuma"). Mostra o ERRO REAL e
          // regrava SEM o fullImport — o resumo (scan) sempre cabe e sempre fica.
          var em = ((err && err.code) ? err.code + ': ' : '') + ((err && err.message) || err);
          _lzFalhouGravar(em);
          if (typeof showNotification === 'function') showNotification('⚠️ Falha ao gravar histórico', String(em).slice(0, 140), 'error');
          if (doc.fullImport) {
            var lean = { handle: doc.handle, scan: doc.scan, scannedAt: doc.scannedAt, scannedBy: doc.scannedBy, scannedByName: doc.scannedByName, tournamentId: doc.tournamentId, tournamentName: doc.tournamentName };
            if (lean.scan && typeof lean.scan === 'object') { lean.scan._mode = 'essential'; lean.scan._fullError = ('write: ' + String(em)).slice(0, 120); }
            return db.collection('letzplayScans').doc(s.uid).set(lean, { merge: true });
          }
          throw err;
        });
      // ESCRITA DUPLA (transição): o histórico também vai pro canônico — 1 doc por
      // competição, 1 por partida, compartilhado. É aqui que o ganho aparece: a mesma
      // partida trazida por 4 pessoas vira UM doc, e varrer alguém já preenche o pedaço
      // dos parceiros/adversários dela. Best-effort: falhar aqui não pode derrubar o scan.
      // Só o DELTA quando ele vem (parciais da leitura individual): o acervo canônico é
      // cumulativo por gid, então regravar o histórico inteiro a cada parcial não adiciona
      // nada e é o que fazia uma leitura de 472 jogos emitir ~25 mil escritas.
      if (gotFull && typeof window._lzHistoryWrite === 'function') {
        var _lote = Array.isArray(gamesDelta) ? gamesDelta : null;
        if (!_lote || _lote.length) {
          w = w.then(function () {
            return window._lzHistoryWrite(s.fullImport, s.handle, _lote)
              .then(function (r) { window._log && window._log('[lz história] scan', s.handle + ':', JSON.stringify(r)); })
              .catch(function (e) { window._log && window._log('[lz história] scan falhou (não bloqueia):', (e && e.message) || e); });
          });
        }
      }
      return w;
    })).then(function () { return ok.length; });
  }
  function _saveScansAndReload(tId, scans, onFail) {
    var ok = scans.filter(function (s) { return s.uid && s.scan; });
    var failed = scans.filter(function (s) { return !(s.uid && s.scan); });
    if (!ok.length) {
      if (typeof window._hideLoading === 'function') window._hideLoading();
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
    var meName = (window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.displayName) || null;
    var _tour = (typeof window._findTournamentById === 'function') ? window._findTournamentById(tId)
      : ((window.AppStore && window.AppStore.tournaments) || []).filter(function (t) { return String(t.id) === String(tId); })[0];
    var tName = _tour ? (_tour.name || null) : null;
    var writes = ok.map(function (s) {
      // "Completa" é uma AFIRMAÇÃO sobre o dado, não sobre a intenção do clique: só vale
      // quando os jogos REALMENTE vieram. Em 14/jul/2026 gravamos _mode='full' para 4
      // inscritos com fullImport=null (a extensão 1.35 tomou 403 e desistiu em silêncio)
      // → o app deu a completa por feita e travou o botão de refazer pela regra dos 6 dias.
      var gotFull = !!(s.fullImport && Array.isArray(s.fullImport.games) && s.fullImport.games.length);
      if (s.scan && typeof s.scan === 'object') {
        // sub-campos do scan: a regra do Firestore valida as chaves do TOPO do doc, então
        // diagnóstico novo entra aqui sem precisar mexer/deployar firestore.rules.
        s.scan._mode = (scanMode === 'full' && gotFull) ? 'full' : 'essential';
        s.scan._fullGames = gotFull ? _lzTot(s.fullImport) : 0;
        // POR QUE não veio o histórico — o `catch {}` da extensão engolia isto e a busca
        // reportava sucesso sem nenhum jogo. Sem motivo gravado, não há como diagnosticar.
        s.scan._fullError = (scanMode === 'full' && !gotFull) ? (s.fullError || 'sem-jogos') : null;
      }
      var doc = { handle: s.handle, scan: s.scan, scannedAt: nowIso, scannedBy: meUid, scannedByName: meName, tournamentId: String(tId), tournamentName: tName };
      // Só o scan COMPLETO leva o histórico inteiro (letzplayImport) pro perfil do participante.
      // Não gravar `fullImport: null` quando falhou: o set é merge, e apagar um histórico
      // BOM de uma varredura anterior por causa de um 403 de hoje seria perda de dado real.
      // SÓ LEITURA COMPLETA SUBSTITUI O HISTÓRICO. Um fechamento por pausa/erro traz o que
      // deu tempo de ler — e isso é progresso, não é o histórico da pessoa. Gravar como se
      // fosse é o que produziu "20 jogos" para quem tem 158. Incompleta grava só o cursor.
      var _completa = !!(s.fullImport && s.fullImport.lzCursor && s.fullImport.lzCursor.complete === true
                         && !s.fullImport.partialReason);
      if (gotFull && _completa) doc.fullImport = s.fullImport;
      else if (gotFull && s.fullImport.lzCursor) {
        doc.lzCursorParcial = s.fullImport.lzCursor;
        window._warn && window._warn('[letzplay] leitura incompleta — gravei só o progresso, o histórico ficou como estava.');
      }
      // MESMA TRAVA DO CAMINHO DOS PARCIAIS. Os dois escrevem no MESMO documento e a ordem
      // de chegada não é garantida — pôr a guarda só num deles é não ter guarda.
      return _lzBarrarRegressao(s.uid, doc, db)
        .then(function (d2) { return db.collection('letzplayScans').doc(s.uid).set(d2, { merge: true }); })
        .catch(function (err) {
          // Erro REAL na tela + regrava sem o fullImport (o resumo sempre cabe) — ver
          // _lzPersistScans; mesmo fallback aqui (caso Camila: doc >1MiB falhava mudo).
          var em = ((err && err.code) ? err.code + ': ' : '') + ((err && err.message) || err);
          _lzFalhouGravar(em);
          if (typeof showNotification === 'function') showNotification('⚠️ Falha ao gravar histórico', String(em).slice(0, 140), 'error');
          if (doc.fullImport) {
            var lean = { handle: doc.handle, scan: doc.scan, scannedAt: doc.scannedAt, scannedBy: doc.scannedBy, scannedByName: doc.scannedByName, tournamentId: doc.tournamentId, tournamentName: doc.tournamentName };
            if (lean.scan && typeof lean.scan === 'object') { lean.scan._mode = 'essential'; lean.scan._fullError = ('write: ' + String(em)).slice(0, 120); }
            return db.collection('letzplayScans').doc(s.uid).set(lean, { merge: true });
          }
          throw err;
        });
    });
    Promise.all(writes).then(function () {
      // APLICA no perfil de cada inscrito (gênero + nível + histórico) AGORA, via Cloud
      // Function — as rules não deixam o organizador escrever em users/{uid} alheio, e
      // esperar a pessoa logar (o _selfPopulate) fazia a Análise depender do login dela.
      // Best-effort: se a CF falhar, os scans já estão gravados e a cor já sai do scan;
      // o _selfPopulate continua existindo como rede de segurança no login.
      try {
        if (window.firebase && firebase.functions) {
          firebase.functions().httpsCallable('applyLetzplayScans')({
            tournamentId: String(tId), uids: ok.map(function (s) { return s.uid; })
          }).then(function (res) {
            var r = (res && res.data) || {};
            window._log && window._log('[applyLetzplayScans] perfis gravados:', r.written, 'pulados:', (r.skipped || []).length);
          }).catch(function (err) {
            window._log && window._log('[applyLetzplayScans] falhou (não bloqueia):', (err && err.message) || err);
          });
        }
      } catch (e) {}
      if (typeof window._hideLoading === 'function') window._hideLoading();
      // re-render a seção Categorias in-place, mesclando os scans novos no scanMap.
      var rctx = window._lzRenderCtx, el = document.getElementById('er-categories-section');
      if (rctx && el && rctx.t && rctx.t.id === tId) {
        var merged = Object.assign({}, rctx.scanMap || {});
        // fullImport vai junto: é o que marca este uid como "completa fresca" no
        // re-render (senão o botão Completa voltaria a pedir os mesmos inscritos).
        ok.forEach(function (s) { merged[s.uid] = { handle: s.handle, scan: s.scan, scannedAt: nowIso, scannedBy: meUid, fullImport: s.fullImport || null }; });
        var tmp = document.createElement('div');
        tmp.innerHTML = _renderCategoriesSection(rctx.rows, rctx.t, rctx.profileMap, merged);
        var newEl = tmp.firstElementChild;
        if (newEl) el.replaceWith(newEl);
      } else if (window.location.hash === '#analise/' + tId) {
        var c = document.getElementById('view-container'); if (c) window.renderEnrollmentReportPage(c, tId);
      }
      // Diz quantos JOGOS vieram, não só "carregado". Um scan sem jogos é o modo de falha
      // real (14/jul: 4 "carregados", zero jogos) — o número tem que estar na cara.
      var _comJogos = ok.filter(function (s) { return s.scan && s.scan._fullGames > 0; }).length;
      var _det = (window._lzPendingMode === 'full')
        ? (_comJogos + ' com histórico' + (_comJogos < ok.length ? (' · ' + (ok.length - _comJogos) + ' sem jogos') : ''))
        : (ok.length + ' carregado(s)');
      if (typeof showNotification === 'function') {
        showNotification('Busca concluída', _det + (failed.length ? (' · ' + failed.length + ' falhou') : ''), 'success');
      }
    }).catch(function (e) {
      if (typeof window._hideLoading === 'function') window._hideLoading();
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
    // FONTE ÚNICA de lookup (String-safe, também olha publicDiscovery). O `find` com
    // `x.id === tId` cru dependia do tipo do id bater exatamente.
    var t = (typeof window._findTournamentById === 'function')
      ? window._findTournamentById(tId)
      : ((window.AppStore && window.AppStore.tournaments)
          ? window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); })
          : null);
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
      // O view-container TEM que ser pintado (cabeçalho + bola) junto com o loader
      // global. O loader global é um overlay em `body`: enquanto ele girava, o
      // view-container ficava VAZIO — e a rede de segurança "tela em branco" do
      // router (5s) chutava a Análise pra dashboard na PRIMEIRA abertura, quando os
      // perfis dos inscritos ainda vêm da rede. Na segunda o cache do Firestore
      // respondia antes dos 5s e "funcionava". Tela pintada = nunca mais é branca.
      _renderLoading(container, t);
      if (typeof window._showLoading === 'function') window._showLoading('Carregando análise dos inscritos…');
    }

    // v1.3.24-beta: _fetchProfiles tenta rescue por email/displayName sem uid.
    // v1.15.35: os scans letzplay são GLOBAIS por uid (letzplayScans/{uid}) — precisamos
    // dos perfis primeiro pra saber quem autorizou-sem-import, e só então buscar os scans.
    _fetchProfiles(parts).then(function (fetchResult) {
      if (window.location.hash !== '#analise/' + tId) { _doneLoading(); return; }
      var byUid = fetchResult.byUid || {};
      // Candidatos = TODO inscrito com @ + consentimento (v1.1.18: inclui quem já tem
      // import próprio). Antes eles ficavam de fora e a página não sabia QUANDO cada um
      // foi verificado — sem isso não dá pra aplicar a regra dos 6 dias. O veredito não
      // muda: em _erApplyLzToRows o import próprio continua tendo precedência sobre o scan.
      var candUids = parts.filter(function (p) {
        var prof = p.uid && byUid[p.uid];
        return prof && prof.letzplayHandle && prof.letzplayConsent === true;
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
