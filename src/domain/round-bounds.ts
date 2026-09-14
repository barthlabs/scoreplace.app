/*
 * Regras puras para os limites internos das rodadas.
 *
 * Esta é a fonte de verdade tipada. O browser legado continua recebendo a ponte
 * em `js/views/round-bounds-core.js`, mas nenhuma regra de data aqui depende de
 * `window`, DOM ou Firestore. Isso permite migrar consumidores por etapas sem
 * duplicar o cálculo que decide a janela de cada jogo.
 */

namespace ScoreplaceRoundBounds {
  export const HOUR_MS = 3_600_000;
  export const DAY_MS = 86_400_000;
  export const MIN_BETWEEN_STOPS_MS = HOUR_MS;

  export type SavedBound = string | number | Date;
  export interface PhaseWithRoundBounds { roundBounds?: unknown; }
  export interface TournamentWithRoundBounds {
    phases?: Array<PhaseWithRoundBounds | null | undefined>;
    roundBounds?: unknown;
  }
  export interface LabelBox { left: number; right: number; }

  const pad = (value: number): string => (value < 10 ? '0' : '') + value;
  const count = (value: unknown): number => Number.parseInt(String(value), 10) || 1;

  /** Interpreta strings sem offset como BRT, igual ao comportamento histórico da tela. */
  export function toMillis(value: unknown): number {
    if (value == null || value === '') return Number.NaN;
    if (typeof value === 'number') return value;
    let text = String(value);
    if (!text.includes('T')) text += 'T00:00';
    if (!/[+-]\d\d:?\d\d$/.test(text) && !text.includes('Z')) text += '-03:00';
    const parsed = new Date(text).getTime();
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }

  /** Converte milissegundos para o formato persistido pelo app, em BRT. */
  export function toIsoBrt(milliseconds: number): string {
    const local = new Date(milliseconds);
    const utc = local.getTime() + local.getTimezoneOffset() * 60_000;
    const brt = new Date(utc - 3 * HOUR_MS);
    return `${brt.getFullYear()}-${pad(brt.getMonth() + 1)}-${pad(brt.getDate())}` +
      `T${pad(brt.getHours())}:${pad(brt.getMinutes())}`;
  }

  export function toDayMonthBrt(milliseconds: number): string {
    const local = new Date(milliseconds);
    const utc = local.getTime() + local.getTimezoneOffset() * 60_000;
    const brt = new Date(utc - 3 * HOUR_MS);
    return `${pad(brt.getDate())}/${pad(brt.getMonth() + 1)}`;
  }

  export function formatDays(milliseconds: number): string {
    const days = milliseconds / DAY_MS;
    if (days >= 10) return String(Math.round(days));
    return String(Math.round(days * 10) / 10).replace('.', ',');
  }

  /**
   * Retorna null quando o arranjo salvo já não descreve a fase atual. null significa
   * "usar a divisão igual"; [] jamais é usado como resposta para essa situação.
   */
  export function normalise(
    raw: unknown,
    startMs: number,
    endMs: number,
    rounds: unknown,
  ): number[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null;
    if (!(startMs > 0) || !(endMs > startMs)) return null;
    const expected = count(rounds) - 1;
    if (expected < 1) return null;
    const values = raw.map(toMillis).filter((value) => !Number.isNaN(value));
    if (values.length !== expected) return null;
    for (let index = 0; index < values.length; index += 1) {
      if (values[index] <= startMs || values[index] >= endMs) return null;
      if (index > 0 && values[index] <= values[index - 1]) return null;
    }
    return values;
  }

  export function limitsOf(
    tournament: TournamentWithRoundBounds | null | undefined,
    phaseIndex: number,
    startMs: number,
    endMs: number,
    rounds: unknown,
  ): number[] | null {
    try {
      if (!tournament) return null;
      const phase = Array.isArray(tournament.phases) ? tournament.phases[phaseIndex] : null;
      let raw = phase && phase.roundBounds;
      if (!raw && phaseIndex === 0) raw = tournament.roundBounds;
      return normalise(raw, startMs, endMs, rounds);
    } catch (_) {
      return null;
    }
  }

  export function equalBounds(startMs: number, endMs: number, rounds: unknown): number[] {
    const totalRounds = count(rounds);
    if (totalRounds < 2 || !(endMs > startMs)) return [];
    const step = (endMs - startMs) / totalRounds;
    const bounds: number[] = [];
    for (let index = 1; index < totalRounds; index += 1) {
      bounds.push(Math.round(startMs + index * step));
    }
    return bounds;
  }

  /** Move um único stop sem mutar o array recebido. */
  export function moveBound(
    bounds: readonly number[] | null | undefined,
    index: number,
    nextMs: number,
    startMs: number,
    endMs: number,
  ): number[] {
    const result = (bounds || []).slice();
    if (index < 0 || index >= result.length) return result;
    const min = (index === 0 ? startMs : result[index - 1]) + MIN_BETWEEN_STOPS_MS;
    let max = (index === result.length - 1 ? endMs : result[index + 1]) - MIN_BETWEEN_STOPS_MS;
    if (max < min) max = min;
    result[index] = Math.max(min, Math.min(max, Math.round(nextMs)));
    return result;
  }

  /** Primeira faixa horizontal livre para cada rótulo já medido pelo adaptador de DOM. */
  export function labelLanes(boxes: readonly LabelBox[] | null | undefined, gap = 6): number[] {
    const occupied: number[] = [];
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
}

/* CJS serve os testes e futuros consumidores de servidor; no browser o namespace acima
 * continua global para o adaptador clássico. */
declare const module: { exports?: unknown } | undefined;
if (typeof module !== 'undefined' && module) module.exports = ScoreplaceRoundBounds;
