/* standings-core.js — QUEM ESTÁ NA FRENTE (extraído do bracket-logic.js em ago/2026)
 *
 * ORDEM DO DONO (14/ago/2026): "sem rodar coisas diferentes para o que deveria ser uma coisa
 * só: fase classificatória."
 *
 * O QUE ERA: havia DUAS respostas pra mesma pergunta.
 *   • a TABELA que a pessoa vê (bracket-logic._computeMonarchStandings) — cadeia longa;
 *   • a ordem de QUEM SOBE pra eliminatória (phases-engine._globalStandings) — cadeia CURTA,
 *     que parava em saldo de pontos e, empatando ali, devolvia 0: mantinha a ordem em que os
 *     grupos foram varridos.
 * MEDIDO no sandbox do Confra com a R1 completa: 132 classificados e **80 posições** em que
 * as duas ordens discordavam. Naquele placar a 1ª divergência caía na 40ª posição — o corte
 * do Confra não teria mudado —, mas isso é sorte do dado. A tabela dizer uma ordem e a chave
 * usar outra não se defende.
 *
 * POR QUE VIVE NUM ARQUIVO PRÓPRIO — mesma razão do waitlist-core.js e do identity-core.js.
 * A primeira versão deixou a regra no bracket-logic.js e o phases-engine a lia por
 * `window._standingsCompare`. No navegador e no vendor da CF (`g.window = g`) isso funciona,
 * mas o bracket-logic.js NÃO é `require`-ável em Node — então, em qualquer contexto que
 * carregue só o phases-engine, a chamada caía num fallback e a ordenação sumia EM SILÊNCIO.
 * Dois testes existentes acusaram na hora. Regra que decide classificação não pode depender
 * de quem carregou o quê: aqui ela é `require`-ável em Node e global no browser.
 *
 * ⚠️ ISTO NÃO É A REGRA DE DESEMPATE CONFIGURÁVEL. Fase de Grupos usa os critérios que o
 * ORGANIZADOR escolhe (confronto direto, buchholz, sonneborn-berger…), em
 * phases-engine._groupTeamStandings — e isso é feature, não divergência. O que mora aqui é
 * a cadeia PADRÃO, usada quando não há critério configurado.
 */
(function () {
  'use strict';

  // ── OS CRITÉRIOS QUE O ORGANIZADOR CONFIGURA ─────────────────────────────────
  // Ordem do dono (14/ago/2026): "os critérios de desempate devem sempre ser aplicados como
  // quer que tenha configurado o organizador. em todo o torneio. em todos os torneios. em
  // qualquer fase. ele pode tirar critérios e esses passam a não valer; pode colocar um
  // critério no lugar de outro; pode mudar a ordem de aplicação e isso tudo deve sempre ser
  // observado. o que configurou o organizador e o que aparece deve ser considerado no motor."
  //
  // A configuração mora em `t.tiebreakers` (array ORDENADO) — o que ele tirou simplesmente
  // não está lá. Cada entrada é uma função (a, b, ctx) → número (negativo = `a` na frente),
  // 0 = não desempatou, segue pro próximo.
  //
  // ⚠️ CRITÉRIO SEM DADO É NEUTRO, NUNCA CHUTE. `antiguidade` sem data de nascimento,
  // `confronto_direto` sem os jogos, `buchholz` numa tabela que não os calcula — todos
  // devolvem 0 e a decisão passa adiante. Inventar valor aqui seria decidir classificação
  // por ruído. Quem quiser saber o que não pôde ser aplicado usa `explainTiebreakers`.
  var _n = function (v) { return v || 0; };
  // ⚠️ IDENTIDADE É O UID. A chave de lookup (nascimento, confronto direto) é o uid de quem
  // tem conta; só quem NÃO tem conta é procurado pelo nome, que é a única identidade que ele
  // possui. Nome de quem tem conta nunca entra: ele envelhece (a pessoa se renomeia) e
  // repete (dois homônimos viram um). [[project_uid_identity_canon_locked]]
  var _chave = function (linha) { return (linha && linha.uid) ? linha.uid : (linha && linha.name) || null; };
  // hash 32 bits determinístico (FNV-1a) — mesma entrada, mesmo número, sempre.
  function _hash32(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  // sentido = +1 antiguidade (mais velho antes) · -1 juventude (mais novo antes)
  function _porIdade(a, b, ctx, sentido) {
    var m = (ctx && ctx.birth) || {};
    var x = m[_chave(a)], y = m[_chave(b)];
    var temA = (x != null), temB = (y != null);
    if (temA && !temB) return -1;                     // quem preencheu passa na frente
    if (!temA && temB) return 1;
    if (!temA || x === y) return 0;                   // nenhum tem, ou empatam: passa adiante
    return sentido > 0 ? (x - y) : (y - x);
  }
  var CRITERIOS = {
    // "pontos" da tabela (pontuação avançada / pontos corridos)
    pontos_avancados: function (a, b) { return _n(b.points) - _n(a.points); },
    vitorias: function (a, b) { return _n(b.wins) - _n(a.wins); },
    saldo_pontos: function (a, b) {
      var da = (a.pointsDiff != null) ? a.pointsDiff : (_n(a.pointsFor) - _n(a.pointsAgainst));
      var db = (b.pointsDiff != null) ? b.pointsDiff : (_n(b.pointsFor) - _n(b.pointsAgainst));
      return db - da;
    },
    saldo_sets: function (a, b) { return (_n(b.setsWon) - _n(b.setsLost)) - (_n(a.setsWon) - _n(a.setsLost)); },
    sets_vencidos: function (a, b) { return _n(b.setsWon) - _n(a.setsWon); },
    saldo_games: function (a, b) { return (_n(b.gamesWon) - _n(b.gamesLost)) - (_n(a.gamesWon) - _n(a.gamesLost)); },
    games_vencidos: function (a, b) { return _n(b.gamesWon) - _n(a.gamesWon); },
    saldo_tiebreaks: function (a, b) { return (_n(b.tiebreaksWon) - _n(b.tiebreaksLost)) - (_n(a.tiebreaksWon) - _n(a.tiebreaksLost)); },
    tiebreaks_vencidos: function (a, b) { return _n(b.tiebreaksWon) - _n(a.tiebreaksWon); },
    pontos_a_favor: function (a, b) { return _n(b.pointsFor) - _n(a.pointsFor); },
    aproveitamento: function (a, b) { return _n(b.winRate) - _n(a.winRate); },
    menos_jogos: function (a, b) { return _n(a.played) - _n(b.played); },
    buchholz: function (a, b) {
      if (a.buchholz == null && b.buchholz == null) return 0;   // tabela não calcula → neutro
      return _n(b.buchholz) - _n(a.buchholz);
    },
    sonneborn_berger: function (a, b) {
      if (a.sonnebornBerger == null && b.sonnebornBerger == null) return 0;
      return _n(b.sonnebornBerger) - _n(a.sonnebornBerger);
    },
    // ⚠️ CONFRONTO DIRETO POR UID quando há uid — o mapa antigo era chaveado por NOME, e
    // nome envelhece (a pessoa se renomeia) e repete (dois homônimos viram um). Cai no nome
    // só pra quem não tem conta. [[project_uid_identity_canon_locked]]
    confronto_direto: function (a, b, ctx) {
      var h = ctx && ctx.h2h; if (!h) return 0;
      var ka = _chave(a), kb = _chave(b);
      if (!ka || !kb) return 0;
      var ab = _n(h[ka + '|||' + kb]), ba = _n(h[kb + '|||' + ka]);
      if (ab === ba) return 0;
      return ba - ab;
    },
    // ⚠️ QUEM OMITIU A DATA PERDE O DESEMPATE — ordem do dono (14/ago/2026): "por idade, se
    // um não tiver a idade no perfil, beneficia quem tem a idade no perfil contra quem
    // omitiu (por antiguidade e por juventude)". Vale nos DOIS sentidos: não é "o mais
    // velho ganha" nem "o mais novo ganha", é QUEM PREENCHEU ganha de quem não preencheu.
    // Só quando NENHUM dos dois tem data o critério é neutro e a decisão passa adiante.
    antiguidade: function (a, b, ctx) { return _porIdade(a, b, ctx, +1); },
    juventude: function (a, b, ctx) { return _porIdade(a, b, ctx, -1); },
    // ⚠️ SORTEIO = ORDEM DA CHAVE, não número aleatório. Regra do dono (14/ago/2026):
    // "a questão do sorteio já definimos: deve ser de acordo com a ORDEM DA CHAVE (e não do
    // sorteio, caso o seed distribua as pessoas na chave). Assim, o que aparece em jogos
    // ANTERIORES é considerado como sorteado primeiro, apesar de não ser. A aparência aqui é
    // mais importante, para transparência e para evitar questionamentos: se o primeiro
    // sorteado vai para o último jogo, ninguém entenderia que ele é o primeiro sorteado —
    // está na última posição, então é isso que conta."
    //
    // Ou seja: quem aparece no JOGO MAIS CEDO da chave vem na frente. É a única leitura que
    // o participante consegue conferir olhando a tela.
    //
    // ⚠️ O QUE ISTO SUBSTITUIU, e por que não podia ficar: `_computeStandings` fazia
    // `return Math.random() - 0.5` DENTRO do comparador. MEDIDO: 40 execuções do MESMO dado
    // deram duas ordens (24× A>B, 16× B>A) — a classificação dançava entre um render e outro,
    // e aleatório em comparador ainda viola a consistência que o `sort` exige (podia
    // embaralhar até quem NÃO estava empatado). Sem o mapa de ordem, o critério é NEUTRO:
    // nunca volta a sortear na hora.
    sorteio: function (a, b, ctx) {
      var ord = ctx && ctx.ordem; if (!ord) return 0;
      var ia = ord[_chave(a)], ib = ord[_chave(b)];
      if (ia == null && ib == null) return 0;
      if (ia == null) return 1;                       // quem não aparece na chave vai pro fim
      if (ib == null) return -1;
      return ia - ib;                                 // jogo mais cedo = na frente
    }
  };

  // Aplica a configuração do organizador. `opts`:
  //   { tiebreakers: [...], h2h: {}, birth: {}, adv: bool }
  // Sem `tiebreakers` (ou lista vazia) cai na cadeia PADRÃO — é o comportamento de quem
  // nunca abriu a tela de desempate, e o que os testes antigos congelam.
  function standingsCompareConfig(a, b, opts) {
    opts = opts || {};
    var lista = opts.tiebreakers;
    if (!Array.isArray(lista) || !lista.length) return standingsCompare(a, b, opts.adv);
    // O CAMPO PRIMÁRIO lidera antes de qualquer critério. Normalmente é `points` (é assim em
    // _groupTeamStandings e em _computeStandings); com PONTUAÇÃO AVANÇADA ligada o primário
    // passa a ser `advancedPoints` — quem chama diz qual, em vez de o core adivinhar.
    var pf = opts.primaryField || 'points';
    if (a[pf] != null && b[pf] != null && _n(b[pf]) !== _n(a[pf])) return _n(b[pf]) - _n(a[pf]);
    for (var i = 0; i < lista.length; i++) {
      var fn = CRITERIOS[lista[i]];
      if (!fn) continue;                              // critério desconhecido: ignora
      var d = fn(a, b, opts);
      if (d) return d;
      if (lista[i] === 'sorteio') return 0;            // sorteio decidiu (ou é a mesma pessoa)
    }
    return 0;
  }

  // Diz QUAIS critérios da configuração não puderam ser aplicados nesta tabela (e por quê).
  // Existe pra a resposta "esse critério não pegou" ser verificável em vez de suposta.
  function explainTiebreakers(linhas, opts) {
    opts = opts || {};
    var lista = Array.isArray(opts.tiebreakers) ? opts.tiebreakers : [];
    var amostra = (linhas && linhas[0]) || {};
    var out = { aplicaveis: [], semDado: [], desconhecidos: [] };
    lista.forEach(function (k) {
      if (!CRITERIOS[k]) { out.desconhecidos.push(k); return; }
      var falta = (k === 'buchholz' && amostra.buchholz == null)
        || (k === 'sonneborn_berger' && amostra.sonnebornBerger == null)
        || (k === 'pontos_avancados' && amostra.points == null)
        || ((k === 'antiguidade' || k === 'juventude') && !(opts.birth && Object.keys(opts.birth).length))
        || (k === 'confronto_direto' && !(opts.h2h && Object.keys(opts.h2h).length));
      (falta ? out.semDado : out.aplicaveis).push(k);
    });
    return out;
  }

  // Mapa "quem aparece primeiro na chave": identidade → índice do PRIMEIRO jogo em que ela
  // aparece, na ordem em que os jogos são exibidos (rodada, depois posição). É o que o
  // critério `sorteio` usa — ver o comentário dele acima.
  function buildOrdemChave(matches, slotKeys) {
    var ord = {}, i = 0;
    var lista = (matches || []).slice().sort(function (m1, m2) {
      var r1 = (m1 && m1.round) || 0, r2 = (m2 && m2.round) || 0;
      if (r1 !== r2) return r1 - r2;
      var n1 = (m1 && (m1.gameNumber || m1.number)) || 0, n2 = (m2 && (m2.gameNumber || m2.number)) || 0;
      return n1 - n2;
    });
    lista.forEach(function (m) {
      if (!m) return;
      ['p1', 'p2'].forEach(function (lado) {
        var ks = slotKeys ? (slotKeys(m, lado) || []) : [];
        ks.forEach(function (k) { if (k != null && ord[k] == null) ord[k] = i++; });
      });
    });
    return ord;
  }

  // Monta o mapa de CONFRONTO DIRETO a partir dos jogos, chaveado por uid (nome só pra quem
  // não tem conta). `h2h['X|||Y'] = n` → X venceu Y n vezes.
  function buildH2H(matches, slotKeys) {
    var h = {};
    (matches || []).forEach(function (m) {
      if (!m || !m.winner || m.isBye || m.isSitOut) return;
      var k1 = slotKeys ? slotKeys(m, 'p1') : [], k2 = slotKeys ? slotKeys(m, 'p2') : [];
      if (!k1.length || !k2.length) return;
      var venceu1 = (m.winner === m.p1);
      var venceu2 = (m.winner === m.p2);
      if (!venceu1 && !venceu2) return;                // empate ou vencedor irreconhecível
      var vencedores = venceu1 ? k1 : k2, perdedores = venceu1 ? k2 : k1;
      vencedores.forEach(function (v) {
        perdedores.forEach(function (p) { h[v + '|||' + p] = (h[v + '|||' + p] || 0) + 1; });
      });
    });
    return h;
  }

  // `adv` = pontuação avançada ligada (aí `points` manda antes de tudo).
  // Tiebreakers (desc, salvo nota):
  // 0. PONTOS AVANÇADOS (quando ligado)  1. wins  2. saldo de sets  3. sets vencidos
  // 4. saldo de games  5. games vencidos  6. saldo de tie-breaks  7. tie-breaks vencidos
  // 8. saldo de pontos  9. pontos a favor  10. aproveitamento  11. jogos disputados (asc)
  function standingsCompare(a, b, adv) {
    var n = function (v) { return v || 0; };
    if (adv && n(b.points) !== n(a.points)) return n(b.points) - n(a.points);
    if (n(b.wins) !== n(a.wins)) return n(b.wins) - n(a.wins);
    var aSetD = n(a.setsWon) - n(a.setsLost), bSetD = n(b.setsWon) - n(b.setsLost);
    if (bSetD !== aSetD) return bSetD - aSetD;
    if (n(b.setsWon) !== n(a.setsWon)) return n(b.setsWon) - n(a.setsWon);
    var aGD = n(a.gamesWon) - n(a.gamesLost), bGD = n(b.gamesWon) - n(b.gamesLost);
    if (bGD !== aGD) return bGD - aGD;
    if (n(b.gamesWon) !== n(a.gamesWon)) return n(b.gamesWon) - n(a.gamesWon);
    var aTBD = n(a.tiebreaksWon) - n(a.tiebreaksLost), bTBD = n(b.tiebreaksWon) - n(b.tiebreaksLost);
    if (bTBD !== aTBD) return bTBD - aTBD;
    if (n(b.tiebreaksWon) !== n(a.tiebreaksWon)) return n(b.tiebreaksWon) - n(a.tiebreaksWon);
    var aDiff = n(a.pointsFor) - n(a.pointsAgainst), bDiff = n(b.pointsFor) - n(b.pointsAgainst);
    if (bDiff !== aDiff) return bDiff - aDiff;
    if (n(b.pointsFor) !== n(a.pointsFor)) return n(b.pointsFor) - n(a.pointsFor);
    if (n(b.winRate) !== n(a.winRate)) return n(b.winRate) - n(a.winRate);
    return n(a.played) - n(b.played);
  }

  // browser + vendor da CF (que faz `window = globalThis`)
  if (typeof window !== 'undefined') {
    window._standingsCompare = standingsCompare;              // cadeia padrão
    window._standingsCompareConfig = standingsCompareConfig;  // com a config do organizador
    window._standingsBuildH2H = buildH2H;
    window._standingsOrdemChave = buildOrdemChave;
    window._standingsExplain = explainTiebreakers;
  }
  // Node (teste headless e qualquer módulo que carregue só o phases-engine)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      standingsCompare: standingsCompare,
      standingsCompareConfig: standingsCompareConfig,
      buildH2H: buildH2H,
      buildOrdemChave: buildOrdemChave,
      explainTiebreakers: explainTiebreakers,
      CRITERIOS: CRITERIOS
    };
  }
})();
