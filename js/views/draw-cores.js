/* draw-cores.js — Núcleos PUROS de geração de sorteio (pool-based, canônicos).
 *
 * Motor de fases ÚNICO (ordem do dono, 25/27-jun): a geração de QUALQUER fase roda
 * pelo MESMO núcleo. A Fase 0 (sorteio inicial, pool = inscritos) e a Fase N (pool =
 * saída da transição) chamam estes cores. Aqui mora a LÓGICA PURA extraída dos
 * geradores APROVADOS da Fase 0 (generateDrawFunction) — sem tocar em `t`, sem DOM,
 * sem Firestore, com aleatoriedade/tempo INJETÁVEIS (determinismo de teste). NÃO vai
 * pro vendor do autoDraw (cron só usa bracket-logic/tournaments-utils/categories/model).
 *
 * Increment 7 (plano partitioned-dancing-spindle): extrair Fase 0 → núcleo pool-based.
 * Começa por GRUPOS. Depois: Eliminatória, Rei/Rainha. Liga já é canônica
 * (_generateNextRound). Quando a Fase N adotar estes cores, os buildPhase* duplicados
 * de phases-engine.js são removidos.
 */
(function () {
  'use strict';

  function _defaultShuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ── GRUPOS (round-robin) — núcleo pool-based ────────────────────────────────
  // Extração FIEL de generateDrawFunction (tournaments-draw.js, branch "Fase de
  // Grupos") linhas ~1077-1174: shuffle → cabeças de chave (VIP/categoria) →
  // distribuição (módulo OU grupos-iguais) → round-robin (método do círculo via
  // núcleo compartilhado) → standings. Recebe a lista de NOMES já preparada (duplas
  // como "A / B"); a formação de times/lista-de-espera fica no chamador.
  //
  // opts: {
  //   numGroups, equalOnly, seedVip, seedCategory,
  //   isVip(name)->bool, catOf(name)->string,          // helpers de seeding (do chamador)
  //   roundRobin(players)->[{round,pairs:[{a,b}]}],     // window._roundRobinSchedule
  //   groupName(i)->string, safeHtml(s)->string,        // window._groupName / _safeHtml
  //   shuffle(arr)->arr (default Fisher-Yates), now (default Date.now())
  // }
  // → { groups:[{name,participants[],standings[],rounds[]}], waitNames:[] }
  function buildGroupsCore(grpNames, opts) {
    opts = opts || {};
    var names = (grpNames || []).slice();
    var numGroups = opts.numGroups || 4;
    var rr = opts.roundRobin;
    var groupName = opts.groupName || function (i) { return 'Grupo ' + (i + 1); };
    var safeHtml = opts.safeHtml || function (s) { return s; };
    var now = (typeof opts.now === 'number') ? opts.now : Date.now();
    var shuffle = opts.shuffle || _defaultShuffle;

    // Shuffle
    names = shuffle(names);

    // 🎯 Cabeças de chave (VIP / categoria) — reordena ANTES da distribuição por módulo.
    if (opts.seedVip || opts.seedCategory) {
      var vipFirst = [], rest = [];
      names.forEach(function (n) {
        if (opts.seedVip && opts.isVip && opts.isVip(n)) vipFirst.push(n); else rest.push(n);
      });
      if (opts.seedCategory && opts.catOf) {
        rest = rest.map(function (n, i) { return { n: n, i: i, c: String(opts.catOf(n) || '~') }; })
          .sort(function (a, b) { return a.c < b.c ? -1 : a.c > b.c ? 1 : a.i - b.i; })
          .map(function (o) { return o.n; });
      }
      names = vipFirst.concat(rest);
    }

    // Grupos vazios
    var groups = [];
    for (var gi0 = 0; gi0 < numGroups; gi0++) {
      groups.push({ name: groupName(gi0), participants: [], standings: [], rounds: [] });
    }

    // Distribuição (snake/módulo OU "apenas grupos de mesmo tamanho" → excedente vira suplente)
    var waitNames = [];
    if (opts.equalOnly && numGroups > 0) {
      var equalSize = Math.floor(names.length / numGroups);
      if (equalSize >= 1) {
        var placed = equalSize * numGroups;
        for (var idx = 0; idx < placed; idx++) { groups[idx % numGroups].participants.push(names[idx]); }
        waitNames = names.slice(placed);
      } else {
        names.forEach(function (name, idx) { groups[idx % numGroups].participants.push(name); });
      }
    } else {
      names.forEach(function (name, idx) { groups[idx % numGroups].participants.push(name); });
    }

    // Round-robin (método do círculo, núcleo compartilhado) + standings
    groups.forEach(function (g, gi) {
      var mi = 0;
      rr(g.participants).forEach(function (rd) {
        var r = rd.round - 1;
        var roundMatches = rd.pairs.map(function (pr) {
          var a = pr.a, b = pr.b;
          return {
            id: 'grp' + gi + '-r' + r + '-m' + (mi++) + '-' + now,
            p1: a, p2: b, winner: null, group: gi, roundIndex: r,
            label: safeHtml(g.name) + ' • ' + safeHtml(a) + ' vs ' + safeHtml(b)
          };
        });
        g.rounds.push({ round: rd.round, status: r === 0 ? 'active' : 'pending', matches: roundMatches });
      });
      g.standings = g.participants.map(function (name) {
        return { name: name, points: 0, wins: 0, losses: 0, draws: 0, pointsDiff: 0, played: 0 };
      });
    });

    return { groups: groups, waitNames: waitNames };
  }

  // ── REI/RAINHA DA PRAIA (monarch): SEM núcleo próprio ───────────────────────
  // Rei/Rainha é MODO de sorteio do Pontos Corridos — as rodadas (grupos de 4 com
  // parceiro rotativo) são geradas pelo motor incremental canônico
  // (_generateNextRound com ligaRoundFormat='rei_rainha' → _buildMonarchGroup em
  // bracket-logic.js). O antigo buildMonarchCore (rodada única, wrapper de grupo da
  // Fase 0) foi REMOVIDO na campanha project_kill_monarch_format_campaign.

  var api = { buildGroupsCore: buildGroupsCore };
  if (typeof window !== 'undefined') { window._drawCores = api; window._buildGroupsCore = buildGroupsCore; }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
