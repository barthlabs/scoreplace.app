/* GERADO de src/domain/round-bounds.ts por scripts/build-domain.js. Não editar. */
"use strict";
/*
 * Regras puras para os limites internos das rodadas.
 *
 * Esta é a fonte de verdade tipada. O browser legado continua recebendo a ponte
 * em `js/views/round-bounds-core.js`, mas nenhuma regra de data aqui depende de
 * `window`, DOM ou Firestore. Isso permite migrar consumidores por etapas sem
 * duplicar o cálculo que decide a janela de cada jogo.
 */
var ScoreplaceRoundBounds;
(function (ScoreplaceRoundBounds) {
    ScoreplaceRoundBounds.HOUR_MS = 3600000;
    ScoreplaceRoundBounds.DAY_MS = 86400000;
    ScoreplaceRoundBounds.MIN_BETWEEN_STOPS_MS = ScoreplaceRoundBounds.HOUR_MS;
    const pad = (value) => (value < 10 ? '0' : '') + value;
    const count = (value) => Number.parseInt(String(value), 10) || 1;
    /** Interpreta strings sem offset como BRT, igual ao comportamento histórico da tela. */
    function toMillis(value) {
        if (value == null || value === '')
            return Number.NaN;
        if (typeof value === 'number')
            return value;
        let text = String(value);
        if (!text.includes('T'))
            text += 'T00:00';
        if (!/[+-]\d\d:?\d\d$/.test(text) && !text.includes('Z'))
            text += '-03:00';
        const parsed = new Date(text).getTime();
        return Number.isNaN(parsed) ? Number.NaN : parsed;
    }
    ScoreplaceRoundBounds.toMillis = toMillis;
    /** Converte milissegundos para o formato persistido pelo app, em BRT. */
    function toIsoBrt(milliseconds) {
        const local = new Date(milliseconds);
        const utc = local.getTime() + local.getTimezoneOffset() * 60000;
        const brt = new Date(utc - 3 * ScoreplaceRoundBounds.HOUR_MS);
        return `${brt.getFullYear()}-${pad(brt.getMonth() + 1)}-${pad(brt.getDate())}` +
            `T${pad(brt.getHours())}:${pad(brt.getMinutes())}`;
    }
    ScoreplaceRoundBounds.toIsoBrt = toIsoBrt;
    function toDayMonthBrt(milliseconds) {
        const local = new Date(milliseconds);
        const utc = local.getTime() + local.getTimezoneOffset() * 60000;
        const brt = new Date(utc - 3 * ScoreplaceRoundBounds.HOUR_MS);
        return `${pad(brt.getDate())}/${pad(brt.getMonth() + 1)}`;
    }
    ScoreplaceRoundBounds.toDayMonthBrt = toDayMonthBrt;
    function formatDays(milliseconds) {
        const days = milliseconds / ScoreplaceRoundBounds.DAY_MS;
        if (days >= 10)
            return String(Math.round(days));
        return String(Math.round(days * 10) / 10).replace('.', ',');
    }
    ScoreplaceRoundBounds.formatDays = formatDays;
    /**
     * Retorna null quando o arranjo salvo já não descreve a fase atual. null significa
     * "usar a divisão igual"; [] jamais é usado como resposta para essa situação.
     */
    function normalise(raw, startMs, endMs, rounds) {
        if (!Array.isArray(raw) || raw.length === 0)
            return null;
        if (!(startMs > 0) || !(endMs > startMs))
            return null;
        const expected = count(rounds) - 1;
        if (expected < 1)
            return null;
        const values = raw.map(toMillis).filter((value) => !Number.isNaN(value));
        if (values.length !== expected)
            return null;
        for (let index = 0; index < values.length; index += 1) {
            if (values[index] <= startMs || values[index] >= endMs)
                return null;
            if (index > 0 && values[index] <= values[index - 1])
                return null;
        }
        return values;
    }
    ScoreplaceRoundBounds.normalise = normalise;
    function limitsOf(tournament, phaseIndex, startMs, endMs, rounds) {
        try {
            if (!tournament)
                return null;
            const phase = Array.isArray(tournament.phases) ? tournament.phases[phaseIndex] : null;
            let raw = phase && phase.roundBounds;
            if (!raw && phaseIndex === 0)
                raw = tournament.roundBounds;
            return normalise(raw, startMs, endMs, rounds);
        }
        catch (_) {
            return null;
        }
    }
    ScoreplaceRoundBounds.limitsOf = limitsOf;
    function equalBounds(startMs, endMs, rounds) {
        const totalRounds = count(rounds);
        if (totalRounds < 2 || !(endMs > startMs))
            return [];
        const step = (endMs - startMs) / totalRounds;
        const bounds = [];
        for (let index = 1; index < totalRounds; index += 1) {
            bounds.push(Math.round(startMs + index * step));
        }
        return bounds;
    }
    ScoreplaceRoundBounds.equalBounds = equalBounds;
    /** Move um único stop sem mutar o array recebido. */
    function moveBound(bounds, index, nextMs, startMs, endMs) {
        const result = (bounds || []).slice();
        if (index < 0 || index >= result.length)
            return result;
        const min = (index === 0 ? startMs : result[index - 1]) + ScoreplaceRoundBounds.MIN_BETWEEN_STOPS_MS;
        let max = (index === result.length - 1 ? endMs : result[index + 1]) - ScoreplaceRoundBounds.MIN_BETWEEN_STOPS_MS;
        if (max < min)
            max = min;
        result[index] = Math.max(min, Math.min(max, Math.round(nextMs)));
        return result;
    }
    ScoreplaceRoundBounds.moveBound = moveBound;
    /** Primeira faixa horizontal livre para cada rótulo já medido pelo adaptador de DOM. */
    function labelLanes(boxes, gap = 6) {
        const occupied = [];
        return (boxes || []).map((box) => {
            for (let index = 0; index < occupied.length; index += 1) {
                if (box.left >= occupied[index] + gap) {
                    occupied[index] = box.right;
                    return index;
                }
            }
            occupied.push(box.right);
            return occupied.length - 1;
        });
    }
    ScoreplaceRoundBounds.labelLanes = labelLanes;
})(ScoreplaceRoundBounds || (ScoreplaceRoundBounds = {}));
if (typeof module !== 'undefined' && module)
    module.exports = ScoreplaceRoundBounds;
