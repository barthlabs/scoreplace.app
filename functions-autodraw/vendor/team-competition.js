/* GERADO de src/domain/team-competition.ts por scripts/build-domain.js. Não editar. */
"use strict";
/*
 * Contrato puro da classificação por times.
 *
 * A dupla continua sendo a unidade que entra em quadra e pertence a uma categoria.
 * O time é uma camada de representação: recebe os pontos dos jogos de todas as suas
 * duplas. Não há inferência por nome — o vínculo é sempre `competitionTeamId`.
 */
var ScoreplaceTeamCompetition;
(function (ScoreplaceTeamCompetition) {
    const number = (value, fallback) => {
        const parsed = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const text = (value) => value == null ? '' : String(value).trim();
    const record = (value) => (value && typeof value === 'object' && !Array.isArray(value))
        ? value : {};
    /** Normaliza a escolha feita ANTES do sorteio; ausência mantém torneios existentes intactos. */
    function normalize(value) {
        const raw = record(value);
        const scoring = record(raw.scoring);
        return {
            enabled: raw.enabled === true,
            teamCount: Math.max(2, Math.floor(number(raw.teamCount, 8))),
            formation: raw.formation === 'manual' ? 'manual' : 'draw',
            internalMatches: raw.internalMatches === 'allow' ? 'allow' : 'avoid',
            // Pontos preserva os torneios existentes. Saldo de games é uma escolha explícita
            // do organizador para eventos em que o placar — e não a vitória isolada — define o time.
            ranking: raw.ranking === 'games_diff' ? 'games_diff' : 'points',
            // Geral soma categorias (por exemplo, feminino + masculino) no mesmo time.
            // Por categoria mantém tabelas independentes sem alterar os confrontos.
            aggregation: raw.aggregation === 'per_category' ? 'per_category' : 'overall',
            // A escala padrão é a mesma da classificatória atual: 3/1/0. O organizador
            // pode substituí-la, inclusive com valores zero ou negativos, de forma explícita.
            scoring: {
                win: number(scoring.win, 3),
                draw: number(scoring.draw, 1),
                loss: number(scoring.loss, 0),
            },
        };
    }
    ScoreplaceTeamCompetition.normalize = normalize;
    /** Identidade estável do time que uma dupla representa; rótulo nunca participa. */
    function teamIdOf(entry) {
        return text(record(entry).competitionTeamId);
    }
    ScoreplaceTeamCompetition.teamIdOf = teamIdOf;
    /** O toggle só veda confronto ENTRE DUPLAS DO MESMO TIME; não muda as categorias. */
    function allowsMatch(first, second, config) {
        const cfg = normalize(config);
        if (!cfg.enabled || cfg.internalMatches === 'allow')
            return true;
        const a = teamIdOf(first), b = teamIdOf(second);
        return !a || !b || a !== b;
    }
    ScoreplaceTeamCompetition.allowsMatch = allowsMatch;
    function matchTeamId(match, side) {
        const direct = side === 'p1' ? match.p1CompetitionTeamId : match.p2CompetitionTeamId;
        if (text(direct))
            return text(direct);
        return teamIdOf(side === 'p1' ? match.team1Obj : match.team2Obj);
    }
    /** Soma games dos sets; placar simples usa scoreP1/scoreP2 como unidade do jogo. */
    function gamesOf(match) {
        const sets = Array.isArray(match.sets) ? match.sets : [];
        if (sets.length)
            return sets.reduce((total, raw) => {
                const set = record(raw);
                return { p1: total.p1 + number(set.gamesP1, 0), p2: total.p2 + number(set.gamesP2, 0) };
            }, { p1: 0, p2: 0 });
        return { p1: number(match.scoreP1, 0), p2: number(match.scoreP2, 0) };
    }
    /**
     * Soma somente jogos reais e decididos. Folga, W.O. sem adversário, pendência e dupla
     * sem time não viram ponto de ninguém. O chamador fornece os times existentes para que
     * um time sem jogo ainda apareça com zero na tabela.
     */
    function standings(teams, matches, config) {
        const cfg = normalize(config);
        if (!cfg.enabled)
            return [];
        const rows = {};
        (Array.isArray(teams) ? teams : []).forEach((raw) => {
            const team = record(raw), id = text(team.id);
            if (!id || rows[id])
                return;
            rows[id] = { id, name: text(team.name) || id, points: 0, wins: 0, draws: 0, losses: 0, played: 0, gamesWon: 0, gamesLost: 0, gamesDiff: 0 };
        });
        (Array.isArray(matches) ? matches : []).forEach((raw) => {
            const match = record(raw);
            if (match.isBye === true || match.isSitOut === true)
                return;
            const a = matchTeamId(match, 'p1'), b = matchTeamId(match, 'p2');
            if (!a || !b || a === b || !rows[a] || !rows[b])
                return;
            const winner = text(match.winner);
            if (!winner)
                return;
            const games = gamesOf(match);
            rows[a].gamesWon += games.p1;
            rows[a].gamesLost += games.p2;
            rows[b].gamesWon += games.p2;
            rows[b].gamesLost += games.p1;
            rows[a].gamesDiff = rows[a].gamesWon - rows[a].gamesLost;
            rows[b].gamesDiff = rows[b].gamesWon - rows[b].gamesLost;
            if (winner === 'draw' || match.draw === true) {
                rows[a].played++;
                rows[b].played++;
                rows[a].draws++;
                rows[b].draws++;
                rows[a].points += cfg.scoring.draw;
                rows[b].points += cfg.scoring.draw;
                return;
            }
            const p1Won = winner === text(match.p1) || winner === 'p1';
            const p2Won = winner === text(match.p2) || winner === 'p2';
            if (!p1Won && !p2Won)
                return; // vencedor incompatível nunca decide tabela por suposição
            rows[a].played++;
            rows[b].played++;
            const win = p1Won ? rows[a] : rows[b], loss = p1Won ? rows[b] : rows[a];
            win.wins++;
            win.points += cfg.scoring.win;
            loss.losses++;
            loss.points += cfg.scoring.loss;
        });
        return Object.keys(rows).map((id) => rows[id]).sort((a, b) => cfg.ranking === 'games_diff'
            ? (b.gamesDiff - a.gamesDiff) || (b.gamesWon - a.gamesWon) || (b.wins - a.wins) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
            : (b.points - a.points) || (b.wins - a.wins) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    }
    ScoreplaceTeamCompetition.standings = standings;
})(ScoreplaceTeamCompetition || (ScoreplaceTeamCompetition = {}));
if (typeof module !== 'undefined' && module)
    module.exports = ScoreplaceTeamCompetition;
