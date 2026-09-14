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
    ScoreplaceStandings.CRITERIOS = {
        pontos_avancados: (a, b) => n(b.points) - n(a.points),
        vitorias: (a, b) => n(b.wins) - n(a.wins),
        saldo_pontos: (a, b) => {
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
