/* GERADO de src/domain/standings.ts por scripts/build-domain.js. Não editar. */
"use strict";
/*
 * Contrato puro da classificação.
 *
 * Este domínio decide apenas ordem: a cadeia padrão, os critérios configurados,
 * confronto direto, ordem visual da chave e pontos de tie-break. Quem sabe ler
 * o vencedor e o tie-break é recebido por parâmetro; portanto não há DOM,
 * Firebase, cache nem estado de tela nesta fronteira.
 */
var ScoreplaceStandings;
(function (ScoreplaceStandings) {
    const n = (value) => {
        if (typeof value === 'number')
            return Number.isFinite(value) ? value : 0;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const text = (value) => value == null ? '' : String(value);
    const values = (value) => Array.isArray(value) ? value : [];
    const record = (value) => value && typeof value === 'object' && !Array.isArray(value)
        ? value : null;
    const identity = (line) => {
        if (!line)
            return null;
        const uid = text(line.uid);
        if (uid)
            return uid;
        const name = text(line.name);
        return name || null;
    };
    const difference = (line, won, lost) => n(line[won]) - n(line[lost]);
    function byAge(a, b, options, direction) {
        const birth = options?.birth || {};
        const ka = identity(a), kb = identity(b);
        const x = ka ? birth[ka] : undefined;
        const y = kb ? birth[kb] : undefined;
        const hasA = x != null, hasB = y != null;
        if (hasA && !hasB)
            return -1;
        if (!hasA && hasB)
            return 1;
        if (!hasA || x === y)
            return 0;
        return direction > 0 ? n(x) - n(y) : n(y) - n(x);
    }
    /* ⛔⛔⛔ A UNIDADE DO SALDO — e NÃO é uma escada de tentativas.
     *
     * Ordem do dono, 26/set/2026, em duas partes que só fazem sentido juntas:
     *   ① _"sempre o valor mais rico; sets/games/pontos (no caso de placar ao vivo aplicado). sempre
     *      isso deve ser considerado como saldo de pontos. em todo o programa."_
     *   ② _"o criterio de desempate tem que ser rigorosamente como deixou configurado o organizador.
     *      mudou algo, muda; tirou dali, sai. simples assim. nao tem que ter critério por fora."_
     *
     * ⭐ E A SEGUNDA DERRUBOU A MINHA PRIMEIRA IMPLEMENTAÇÃO. Eu havia feito `saldo_pontos` descer uma
     * ESCADA — rally, depois games, depois sets — até achar diferença. Isso é critério por fora: se o
     * organizador tirou `saldo_sets` da lista dele, comparar sets dentro do `saldo_pontos` ressuscita um
     * critério que ele removeu, pela porta dos fundos. Errado, e ele cortou na hora.
     *
     * ⇒ O CERTO: `saldo_pontos` tem UMA unidade, a do torneio — a mais rica que aquele torneio de fato
     * produz. Compara nela e só nela. Empatou, o critério ACABOU: quem decide é o PRÓXIMO da lista do
     * organizador, não um degrau escondido aqui dentro.
     *
     *      placar ao vivo aplicado  →  'pontos'  (rallyFor / rallyAgainst)
     *      torneio por sets         →  'games'   (gamesWon / gamesLost)
     *      torneio por pontos       →  'pontos'  (pointsFor / pointsAgainst — o legado)
     *
     * ⚠️ Quem informa a unidade é o CHAMADOR (`options.unidadeDoSaldo`), porque só ele conhece o
     * torneio. Sem a unidade, vale o comportamento antigo — é o que mantém intacto o torneio por pontos
     * corridos, onde `pointsFor` já É a unidade certa.
     * ⚠️ E foi a AUSÊNCIA disso que causou o estrago medido na Confra: `saldo_pontos` comparava o placar
     * de SETS (1×2, 0×2), dava dois valores entre 18 duplas, não separava ninguém, e a repescagem caía
     * no sorteio — 6-1/6-1 entrou, 6-4/6-4 ficou fora. */
    ScoreplaceStandings.UNIDADES_DE_SALDO = {
        pontos: { ganhou: 'rallyFor', perdeu: 'rallyAgainst' },
        games: { ganhou: 'gamesWon', perdeu: 'gamesLost' },
        sets: { ganhou: 'setsWon', perdeu: 'setsLost' },
    };
    /** O saldo de uma linha numa unidade nomeada. */
    function saldoNaUnidade(line, unidade) {
        const d = ScoreplaceStandings.UNIDADES_DE_SALDO[unidade];
        if (!d)
            return 0;
        return difference(line, d.ganhou, d.perdeu);
    }
    ScoreplaceStandings.saldoNaUnidade = saldoNaUnidade;
    /* ⛔⛔ "TEM A RÉGUA" NÃO É "O CAMPO EXISTE" — é ter MEDIDA nela.
     * ⭐ Defeito meu, pego por teste: eu aceitava o campo presente, e `gamesWon: 0, gamesLost: 0` é
     * presente. Como o construtor das linhas zera esses campos mesmo quando o jogo não tem games
     * gravados, TODO torneio passava a ser medido em games — numa régua vazia, onde todos empatam em 0.
     * O efeito era o oposto do pedido: em vez de usar a régua mais rica, o saldo deixava de valer.
     * ⇒ A régua só conta quando há o que medir: a soma dos dois lados é maior que zero. Partida
     * disputada sempre tem pelo menos um set; games só existem em torneio que os registra; ponto de
     * rally, só com placar ao vivo. */
    const temUnidade = (line, unidade) => {
        const d = ScoreplaceStandings.UNIDADES_DE_SALDO[unidade];
        if (!line || !d)
            return false;
        if (line[d.ganhou] == null && line[d.perdeu] == null)
            return false;
        return (n(line[d.ganhou]) + n(line[d.perdeu])) > 0;
    };
    /* A ordem da riqueza. O chamador pode dizer a unidade (ele conhece o torneio); quando não diz,
     * vale o dado que existe — e é a mesma regra: sets só quando não há games, games só quando não há
     * ponto de rally. A unidade tem de existir nos DOIS lados: comparar rally de um com games do outro
     * não é comparar nada. */
    ScoreplaceStandings.RIQUEZA_DO_SALDO = ['pontos', 'games', 'sets'];
    function unidadeMaisRicaComum(a, b) {
        for (const unidade of ScoreplaceStandings.RIQUEZA_DO_SALDO) {
            if (temUnidade(a, unidade) && temUnidade(b, unidade))
                return unidade;
        }
        return null;
    }
    ScoreplaceStandings.unidadeMaisRicaComum = unidadeMaisRicaComum;
    ScoreplaceStandings.CRITERIOS = {
        pontos_avancados: (a, b) => n(b.points) - n(a.points),
        vitorias: (a, b) => n(b.wins) - n(a.wins),
        /* ⛔⛔⛔ SALDO É SEMPRE O MAIS RICO QUE DER — ordem do dono, 26/set/2026, e vale em TODO o programa:
         * _"sempre o valor mais rico; sets/games/pontos (no caso de placar ao vivo aplicado). sempre isso
         * deve ser considerado como saldo de pontos. em todo o programa. falou em saldo temos que ter o
         * saldo mais rico possivel considerado."_
         *
         * ⭐ NASCEU DE UM ERRO CARO: na Confra, `saldo_pontos` era calculado sobre o placar de SETS (1×2,
         * 0×2). Entre 18 duplas derrotadas isso produzia DOIS valores distintos — repetia o critério
         * anterior e não separava ninguém —, a lista de critérios se esgotava e a ordem caía no SORTEIO.
         * Resultado na quadra: quem perdeu 6-1/6-1 entrou na repescagem e quem perdeu 6-4/6-4 ficou fora.
         * Com o saldo de GAMES, o mesmo critério produz 12 valores distintos e ordena certo.
         *
         * ⛔ A ESCADA, do mais rico ao mais pobre:
         *      ① PONTOS de rally  (só existe com placar ao vivo aplicado)   `rallyFor` / `rallyAgainst`
         *      ② GAMES                                                     `gamesWon` / `gamesLost`
         *      ③ SETS                                                      `setsWon`  / `setsLost`
         *
         * ⚠️ E O NÍVEL TEM DE SER COMUM AOS DOIS LADOS. Comparar o saldo de rally de um com o saldo de
         * games do outro não é comparar nada — são unidades diferentes. Então desce-se a escada até o
         * primeiro nível que AMBOS têm. É isso que "o mais rico POSSÍVEL" quer dizer.
         * ⚠️ `pointsDiff`/`pointsFor`/`pointsAgainst` continuam como ÚLTIMA reserva, para as linhas antigas
         * que só carregam eles — tirar isso quebraria torneio por pontos corridos, que é outro jogo. */
        saldo_pontos: (a, b, options) => {
            /* ⛔ UMA unidade só, e ela é escolhida por DISPONIBILIDADE, nunca por empate:
             *      saldo de sets quando não há games · saldo de games quando não há pontos ao vivo.
             * Escolhida a régua, compara-se nela e pronto. Empatou, o critério ACABOU — quem decide é o
             * próximo da lista do organizador, nunca um degrau escondido aqui dentro.
             * ⚠️ A diferença entre "escolher por disponibilidade" e "descer quando empata" é a diferença
             * entre uma régua e um critério por fora. Eu implementei a segunda primeiro e o dono cortou. */
            const pedida = options?.unidadeDoSaldo;
            const unidade = (pedida && temUnidade(a, pedida) && temUnidade(b, pedida))
                ? pedida : unidadeMaisRicaComum(a, b);
            if (unidade && temUnidade(a, unidade) && temUnidade(b, unidade)) {
                return saldoNaUnidade(b, unidade) - saldoNaUnidade(a, unidade);
            }
            const da = a.pointsDiff != null ? n(a.pointsDiff) : difference(a, 'pointsFor', 'pointsAgainst');
            const db = b.pointsDiff != null ? n(b.pointsDiff) : difference(b, 'pointsFor', 'pointsAgainst');
            return db - da;
        },
        saldo_sets: (a, b) => difference(b, 'setsWon', 'setsLost') - difference(a, 'setsWon', 'setsLost'),
        sets_vencidos: (a, b) => n(b.setsWon) - n(a.setsWon),
        saldo_games: (a, b) => difference(b, 'gamesWon', 'gamesLost') - difference(a, 'gamesWon', 'gamesLost'),
        games_vencidos: (a, b) => n(b.gamesWon) - n(a.gamesWon),
        saldo_tiebreaks: (a, b) => difference(b, 'tiebreaksWon', 'tiebreaksLost') - difference(a, 'tiebreaksWon', 'tiebreaksLost'),
        tiebreaks_vencidos: (a, b) => n(b.tiebreaksWon) - n(a.tiebreaksWon),
        saldo_pontos_tiebreak: (a, b) => difference(b, 'tbPointsWon', 'tbPointsLost') - difference(a, 'tbPointsWon', 'tbPointsLost'),
        pontos_a_favor: (a, b) => n(b.pointsFor) - n(a.pointsFor),
        aproveitamento: (a, b) => n(b.winRate) - n(a.winRate),
        menos_jogos: (a, b) => n(a.played) - n(b.played),
        buchholz: (a, b) => a.buchholz == null && b.buchholz == null ? 0 : n(b.buchholz) - n(a.buchholz),
        sonneborn_berger: (a, b) => a.sonnebornBerger == null && b.sonnebornBerger == null ? 0 : n(b.sonnebornBerger) - n(a.sonnebornBerger),
        confronto_direto: (a, b, options) => {
            const h2h = options?.h2h;
            const ka = identity(a), kb = identity(b);
            if (!h2h || !ka || !kb)
                return 0;
            const ab = n(h2h[ka + '|||' + kb]), ba = n(h2h[kb + '|||' + ka]);
            return ab === ba ? 0 : ba - ab;
        },
        antiguidade: (a, b, options) => byAge(a, b, options, +1),
        juventude: (a, b, options) => byAge(a, b, options, -1),
        sorteio: (a, b, options) => {
            const ordem = options?.ordem;
            const ka = identity(a), kb = identity(b);
            if (!ordem || !ka || !kb)
                return 0;
            const ia = ordem[ka], ib = ordem[kb];
            if (ia == null && ib == null)
                return 0;
            if (ia == null)
                return 1;
            if (ib == null)
                return -1;
            return ia - ib;
        },
    };
    function standingsCompare(a, b, advanced = false) {
        if (advanced && n(b.points) !== n(a.points))
            return n(b.points) - n(a.points);
        if (n(b.wins) !== n(a.wins))
            return n(b.wins) - n(a.wins);
        const setDifference = ScoreplaceStandings.CRITERIOS.saldo_sets(a, b);
        if (setDifference)
            return setDifference;
        if (n(b.setsWon) !== n(a.setsWon))
            return n(b.setsWon) - n(a.setsWon);
        const gamesDifference = ScoreplaceStandings.CRITERIOS.saldo_games(a, b);
        if (gamesDifference)
            return gamesDifference;
        const tiebreakPointsDifference = ScoreplaceStandings.CRITERIOS.saldo_pontos_tiebreak(a, b);
        if (tiebreakPointsDifference)
            return tiebreakPointsDifference;
        if (n(b.gamesWon) !== n(a.gamesWon))
            return n(b.gamesWon) - n(a.gamesWon);
        const tiebreakDifference = ScoreplaceStandings.CRITERIOS.saldo_tiebreaks(a, b);
        if (tiebreakDifference)
            return tiebreakDifference;
        if (n(b.tiebreaksWon) !== n(a.tiebreaksWon))
            return n(b.tiebreaksWon) - n(a.tiebreaksWon);
        const pointsDifference = ScoreplaceStandings.CRITERIOS.saldo_pontos(a, b);
        if (pointsDifference)
            return pointsDifference;
        if (n(b.pointsFor) !== n(a.pointsFor))
            return n(b.pointsFor) - n(a.pointsFor);
        if (n(b.winRate) !== n(a.winRate))
            return n(b.winRate) - n(a.winRate);
        return n(a.played) - n(b.played);
    }
    ScoreplaceStandings.standingsCompare = standingsCompare;
    function standingsCompareConfig(a, b, options = {}) {
        const list = options.tiebreakers;
        if (!Array.isArray(list) || !list.length)
            return standingsCompare(a, b, Boolean(options.adv));
        const primary = options.primaryField || 'points';
        if (a[primary] != null && b[primary] != null && n(b[primary]) !== n(a[primary]))
            return n(b[primary]) - n(a[primary]);
        for (const criterionName of list) {
            const criterion = ScoreplaceStandings.CRITERIOS[criterionName];
            if (!criterion)
                continue;
            const result = criterion(a, b, options);
            if (result)
                return result;
            if (criterionName === 'sorteio')
                return 0;
        }
        return 0;
    }
    ScoreplaceStandings.standingsCompareConfig = standingsCompareConfig;
    function explainTiebreakers(lines, options = {}) {
        const list = Array.isArray(options.tiebreakers) ? options.tiebreakers : [];
        const sample = lines?.[0] || {};
        const output = { aplicaveis: [], semDado: [], desconhecidos: [] };
        for (const name of list) {
            if (!ScoreplaceStandings.CRITERIOS[name]) {
                output.desconhecidos.push(name);
                continue;
            }
            const missing = (name === 'buchholz' && sample.buchholz == null)
                || (name === 'sonneborn_berger' && sample.sonnebornBerger == null)
                || (name === 'pontos_avancados' && sample.points == null)
                || ((name === 'antiguidade' || name === 'juventude') && !(options.birth && Object.keys(options.birth).length))
                || (name === 'confronto_direto' && !(options.h2h && Object.keys(options.h2h).length))
                || (name === 'saldo_pontos_tiebreak' && sample.tbPointsWon == null && sample.tbPointsLost == null);
            (missing ? output.semDado : output.aplicaveis).push(name);
        }
        return output;
    }
    ScoreplaceStandings.explainTiebreakers = explainTiebreakers;
    function tiebreakPointsOfMatch(match, readTiebreak) {
        const output = { p1: 0, p2: 0 };
        for (const rawSet of values(match?.sets)) {
            const set = record(rawSet);
            if (!set)
                continue;
            /* Super tie-break registra PONTOS nos campos gamesP1/gamesP2 por legado de
             * placar. Ele não é um set de games: 10–8 deve desempatar em tbPoints,
             * nunca inflar gamesWon/gamesLost. */
            if (set.superTiebreak) {
                output.p1 += n(set.gamesP1);
                output.p2 += n(set.gamesP2);
                continue;
            }
            /* Um TB de set normal também é decisivo: 6–5 (10–8) não equivale a
             * 6–5 (10–0). Os dois continuam com o mesmo saldo de GAMES; os pontos
             * 10–8/10–0 entram aqui, no saldo secundário de tie-break. */
            let tiebreak = readTiebreak?.(set) || null;
            if (!tiebreak) {
                const nested = record(set.tiebreak);
                if (nested && (nested.pointsP1 != null || nested.pointsP2 != null || nested.p1 != null || nested.p2 != null)) {
                    tiebreak = { p1: nested.pointsP1 != null ? nested.pointsP1 : nested.p1, p2: nested.pointsP2 != null ? nested.pointsP2 : nested.p2 };
                }
            }
            if (!tiebreak)
                continue;
            output.p1 += n(tiebreak.p1);
            output.p2 += n(tiebreak.p2);
        }
        return output;
    }
    ScoreplaceStandings.tiebreakPointsOfMatch = tiebreakPointsOfMatch;
    function buildOrdemChave(matches, slotKeys) {
        const order = {};
        let index = 0;
        const list = values(matches).map(record).filter((match) => Boolean(match)).slice().sort((first, second) => {
            const firstRound = n(first.round), secondRound = n(second.round);
            if (firstRound !== secondRound)
                return firstRound - secondRound;
            return n(first.gameNumber != null ? first.gameNumber : first.number) - n(second.gameNumber != null ? second.gameNumber : second.number);
        });
        for (const match of list) {
            for (const side of ['p1', 'p2']) {
                for (const rawKey of slotKeys?.(match, side) || []) {
                    const key = text(rawKey);
                    if (key && order[key] == null)
                        order[key] = index++;
                }
            }
        }
        return order;
    }
    ScoreplaceStandings.buildOrdemChave = buildOrdemChave;
    function buildH2H(matches, slotKeys, winnerSide) {
        const headToHead = {};
        for (const match of values(matches)) {
            const value = record(match);
            if (!value || !value.winner || value.isBye || value.isSitOut)
                continue;
            const first = slotKeys?.(value, 'p1') || [], second = slotKeys?.(value, 'p2') || [];
            if (!first.length || !second.length)
                continue;
            const winner = winnerSide(value);
            const firstWon = winner === 1, secondWon = winner === 2;
            if (!firstWon && !secondWon)
                continue;
            const winners = firstWon ? first : second, losers = firstWon ? second : first;
            for (const rawWinner of winners)
                for (const rawLoser of losers) {
                    const winnerKey = text(rawWinner), loserKey = text(rawLoser);
                    if (!winnerKey || !loserKey)
                        continue;
                    const key = winnerKey + '|||' + loserKey;
                    headToHead[key] = n(headToHead[key]) + 1;
                }
        }
        return headToHead;
    }
    ScoreplaceStandings.buildH2H = buildH2H;
})(ScoreplaceStandings || (ScoreplaceStandings = {}));
if (typeof module !== 'undefined' && module)
    module.exports = ScoreplaceStandings;
