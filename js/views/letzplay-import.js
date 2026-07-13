/* scoreplace.app — letzplay-import.js
 * ESTRUTURA normalizada do histórico BAIXADO do letzplay + normalizador + validação.
 *
 * FASE: lógica PURA, testável headless (tests/letzplay-import.test.js). Ainda NÃO
 * fiada no index.html. A EXTRAÇÃO (navegador do organizador / extensão) produz o
 * objeto `raw`; AQUI normalizamos pro schema canônico que vai pro Firestore em
 * `users/{uid}.letzplayImport`. Depende de window._spRating (letzplay-rating.js).
 *
 * `raw` (o que a extração entrega):
 * {
 *   handle, name, memberSince, gender('M'|'F'|'X'), sport(s),
 *   venues: [nomeClube...],           // venue vem do CLUBE, nunca do nome do torneio (patrocínio!)
 *   totals: { matches, wins, losses },
 *   rankings:    [{ name, club, sport, categoryRaw, gender, year, status, position, players, wins, losses, winPct, points }],
 *   tournaments: [{ name, club, sport, categoryRaw, gender, ageBand, year, status, players, partnerName, partnerHandle, title }],
 *   matches:     [{ date, categoryRaw, round, partnerHandle, partnerName, oppHandles:[], oppNames:[], won }],
 *   ladder: 'beach-masc-2025'         // escada (modalidade×gênero×ano) pra derivar a banda
 * }
 */
(function () {
  var root = (typeof window !== 'undefined') ? window
           : (typeof global !== 'undefined') ? global : this;

  // v2: passou a preservar os jogos individuais (games[]) — matéria-prima do
  // Histórico de Jogos cronológico. Imports v1 (sem games) continuam válidos.
  var SCHEMA_VERSION = 2;

  // Token de categoria → rating-base (escala beach, calibrável). Faixa sobreposta
  // ("D+/C-") vira a média dos tokens presentes.
  var CAT_RATING = {
    'FUN': 1300, 'E': 1340, 'D': 1450, 'D+': 1490, 'C-': 1510, 'C': 1590,
    'C+': 1630, 'B-': 1670, 'B': 1730, 'B+': 1770, 'A-': 1800, 'A': 1850, 'PRO': 1950
  };

  // Extrai TODOS os tokens de skill presentes na categoria (ignora gênero/idade).
  function skillTokens(categoryRaw) {
    var up = String(categoryRaw || '').toUpperCase();
    var out = [];
    Object.keys(CAT_RATING).sort(function (a, b) { return b.length - a.length; }).forEach(function (tok) {
      var esc = tok.replace('+', '\\+').replace('-', '\\-');
      var re = new RegExp('(^|[^A-Z+\\-])' + esc + '($|[^A-Z+\\-])');
      if (re.test(up)) out.push(tok);
    });
    return out;
  }

  function ageBandOf(categoryRaw, explicit) {
    if (explicit != null) return explicit;
    var m = String(categoryRaw || '').match(/\b(40|50|60|70)\b/);
    return m ? +m[1] : null;
  }

  /** Rating-semente a partir de uma categoria + desempenho (win% desloca dentro da faixa,
   * volume derruba a incerteza). É o bootstrap do import; refina depois com jogos nativos. */
  function seedRating(categoryRaw, winPct, games) {
    var toks = skillTokens(categoryRaw);
    var vals = toks.map(function (t) { return CAT_RATING[t]; });
    var base = vals.length ? (vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 1450;
    if (typeof winPct === 'number' && !isNaN(winPct)) base += (winPct - 50) * 1.5;
    var rd = Math.max(40, 200 - (games || 0) * 3);
    return { value: Math.round(base), rd: Math.round(rd) };
  }

  function footprintEntry(x, ctx) {
    return {
      ctx: ctx,
      official: ctx === 'tournament',                              // torneio = OFICIAL; ranking = recreativo
      name: x.name || '',
      club: x.club || '',
      sport: x.sport || '',
      categoryRaw: x.categoryRaw || '',
      gender: x.gender || null,
      ageBand: ageBandOf(x.categoryRaw, x.ageBand),
      year: x.year != null ? x.year : null,
      status: x.status || null,
      position: x.position != null ? x.position : null,
      players: x.players != null ? x.players : null,
      wins: x.wins != null ? x.wins : null,
      losses: x.losses != null ? x.losses : null,
      winPct: x.winPct != null ? x.winPct : null,
      title: x.title === true
    };
  }

  /** Normaliza o `raw` extraído no schema canônico letzplayImport. importedAt passado
   * de fora (pureza — nada de Date.now aqui dentro). */
  function normalize(raw, opts) {
    opts = opts || {};
    raw = raw || {};
    var R = root._spRating || null;
    var ladder = raw.ladder || opts.ladder || null;

    var rankings = Array.isArray(raw.rankings) ? raw.rankings : [];
    var tournaments = Array.isArray(raw.tournaments) ? raw.tournaments : [];
    var matches = Array.isArray(raw.matches) ? raw.matches : [];

    // Footprint: rankings + torneios
    var footprint = rankings.map(function (r) { return footprintEntry(r, 'ranking'); })
      .concat(tournaments.map(function (t) { return footprintEntry(t, 'tournament'); }));

    // Categorias por competição (multi-competição): ranking=pontos/forma, torneio=conquista.
    var categories = rankings.map(function (r) {
      return { competition: r.name || '', categoryRaw: r.categoryRaw || '', rule: 'points', year: r.year != null ? r.year : null };
    }).concat(tournaments.map(function (t) {
      return { competition: t.name || '', categoryRaw: t.categoryRaw || '', rule: 'achievement', year: t.year != null ? t.year : null };
    }));

    // Rating medido: semeia da categoria MAIS FORTE com volume real (ignora idade).
    var strongest = null, strongestVal = -1;
    rankings.forEach(function (r) {
      if (ageBandOf(r.categoryRaw, r.ageBand)) return;
      var vol = (r.wins || 0) + (r.losses || 0);
      if (vol < 6 && !r.title) return;
      var sd = seedRating(r.categoryRaw, r.winPct, vol);
      if (sd.value > strongestVal) { strongestVal = sd.value; strongest = { r: r, sd: sd }; }
    });
    var rating = null;
    if (strongest) {
      var band = (R && ladder) ? R.bandForRating(ladder, strongest.sd.value) : null;
      rating = {
        ladder: ladder,
        value: strongest.sd.value,
        rd: strongest.sd.rd,
        band: band,
        fromCategory: strongest.r.categoryRaw || '',
        played: (strongest.r.wins || 0) + (strongest.r.losses || 0)
      };
    }

    // Duplas (rating próprio virá dos jogos da parceria; aqui registramos a parceria + categoria).
    var pairSeen = {};
    var pairs = [];
    tournaments.forEach(function (t) {
      if (!t.partnerName && !t.partnerHandle) return;
      var key = (t.partnerHandle || t.partnerName) + '|' + (t.categoryRaw || '');
      if (pairSeen[key]) return;
      pairSeen[key] = 1;
      pairs.push({
        partnerHandle: t.partnerHandle || null,
        partnerName: t.partnerName || null,
        categoryRaw: t.categoryRaw || '',
        context: t.name || '',
        club: t.club || ''
      });
    });

    // Observações de terceiros (adversários/parceiros vistos nos jogos) — OCULTAS até
    // a pessoa entrar no app. Ancoradas em múltiplas chaves (só handle preenchido na v1).
    var obsSeen = {};
    var observations = [];
    matches.forEach(function (m) {
      var handles = [].concat(m.oppHandles || []);
      if (m.partnerHandle) handles.push(m.partnerHandle);
      handles.forEach(function (h) {
        if (!h) return;
        var key = h + '|' + (m.categoryRaw || '');
        if (obsSeen[key]) return;
        obsSeen[key] = 1;
        observations.push({
          anchors: { handle: h, phone: null, cpf: null, photo: null },
          categoryRaw: m.categoryRaw || '',
          sport: raw.sport || (Array.isArray(raw.sports) ? raw.sports[0] : null) || null,
          sourceImport: '@' + (raw.handle || ''),
          visible: false
        });
      });
    });

    // Categoria OFICIAL (torneio) = âncora do anti-gato; ranking é recreativo. Pega a
    // categoria oficial de skill mais ALTA já disputada (ignora idade). Recreativo (form)
    // vem do `rating`/`footprint` de ranking.
    var officialCategory = null, offBest = -1;
    footprint.forEach(function (f) {
      if (!f.official || f.ageBand) return;
      var hardest = null, hv = -1;
      skillTokens(f.categoryRaw).forEach(function (t) { if (CAT_RATING[t] > hv) { hv = CAT_RATING[t]; hardest = t; } });
      if (hv > offBest) { offBest = hv; officialCategory = { categoryRaw: f.categoryRaw, skill: hardest }; }
    });

    // v2: jogos individuais preservados (data, oponente, parceiro, placar, won,
    // torneio/ranking, clube). A ordem do array = ordem de import (letzplay
    // entrega mais recente primeiro) — usada como fallback de ordenação quando a
    // data crua não é parseável. Matéria-prima do Histórico de Jogos cronológico.
    var lpSport = raw.sport || (Array.isArray(raw.sports) ? raw.sports[0] : null) || null;
    var games = matches.map(function (m, i) {
      return {
        idx: i,
        date: m.date || null,
        sport: lpSport,
        official: m.official === true,
        kind: m.kind || (m.official === true ? 'tournament' : 'ranking'),
        competition: m.categoryRaw || '',
        // Nome REAL do torneio (og:title da página do torneio, via fillTourneyNames) —
        // o Histórico/Estatísticas exibem tourneyName quando existe, senão a categoria.
        tourneyName: m.tourneyName || null,
        tourneyId: (m.tourneyId != null) ? m.tourneyId : null,
        club: m.club || null,
        round: (m.round != null) ? m.round : null,
        year: (m.year != null) ? m.year : null,
        partnerName: m.partnerName || null,
        partnerHandle: m.partnerHandle || null,
        oppNames: Array.isArray(m.oppNames) ? m.oppNames.slice() : [],
        oppHandles: Array.isArray(m.oppHandles) ? m.oppHandles.slice() : [],
        myScore: (typeof m.myScore === 'number') ? m.myScore : null,
        oppScore: (typeof m.oppScore === 'number') ? m.oppScore : null,
        won: (m.won === true) ? true : (m.won === false ? false : null)
      };
    });

    return {
      source: 'letzplay',
      version: SCHEMA_VERSION,
      handle: raw.handle || '',
      importedAt: opts.importedAt || null,
      officialCategory: officialCategory,
      games: games,
      profile: {
        name: raw.name || '',
        memberSince: raw.memberSince || null,
        gender: raw.gender || null,
        venues: Array.isArray(raw.venues) ? raw.venues.slice() : [],
        sports: Array.isArray(raw.sports) ? raw.sports.slice() : (raw.sport ? [raw.sport] : []),
        totals: raw.totals || { matches: 0, wins: 0, losses: 0 }
      },
      footprint: footprint,
      categories: categories,
      rating: rating,
      pairs: pairs,
      observations: observations,
      stats: raw.stats || null
    };
  }

  /** Validação estrutural — retorna { valid, errors[] }. */
  function validate(obj) {
    var errors = [];
    function req(cond, msg) { if (!cond) errors.push(msg); }
    req(obj && typeof obj === 'object', 'não é objeto');
    if (!obj || typeof obj !== 'object') return { valid: false, errors: errors };
    req(obj.source === 'letzplay', 'source deve ser "letzplay"');
    req(typeof obj.version === 'number', 'version numérica ausente');
    req(typeof obj.handle === 'string' && obj.handle.length > 0, 'handle vazio');
    req(obj.profile && typeof obj.profile === 'object', 'profile ausente');
    req(Array.isArray(obj.footprint), 'footprint não é array');
    req(Array.isArray(obj.categories), 'categories não é array');
    req(Array.isArray(obj.pairs), 'pairs não é array');
    req(Array.isArray(obj.observations), 'observations não é array');
    if (Array.isArray(obj.observations)) {
      obj.observations.forEach(function (o, i) {
        req(o && o.anchors && typeof o.anchors.handle === 'string', 'observation[' + i + '] sem anchors.handle');
        req(o && o.visible === false, 'observation[' + i + '] deve nascer visible:false');
      });
    }
    if (obj.rating != null) {
      req(typeof obj.rating.value === 'number', 'rating.value não numérico');
      req(typeof obj.rating.rd === 'number', 'rating.rd não numérico');
    }
    return { valid: errors.length === 0, errors: errors };
  }

  root._spImport = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    normalize: normalize,
    validate: validate,
    seedRating: seedRating,
    skillTokens: skillTokens
  };
})();
