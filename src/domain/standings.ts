/*
 * Contrato puro da classificação.
 *
 * Este domínio decide apenas ordem: a cadeia padrão, os critérios configurados,
 * confronto direto, ordem visual da chave e pontos de tie-break. Quem sabe ler
 * o vencedor e o tie-break é recebido por parâmetro; portanto não há DOM,
 * Firebase, cache nem estado de tela nesta fronteira.
 */
namespace ScoreplaceStandings {
  export type RecordValue = Record<string, unknown>;
  export type StandingLine = RecordValue;
  export type NumericMap = Record<string, number>;
  export type ValueMap = Record<string, unknown>;
  export type SlotKeys = (match: RecordValue, side: 'p1' | 'p2') => unknown[];
  export type WinnerSide = (match: RecordValue) => unknown;
  export type SetTiebreak = (set: RecordValue) => { p1?: unknown; p2?: unknown } | null | undefined;
  export type Criterion = (a: StandingLine, b: StandingLine, options?: CompareOptions) => number;

  export interface CompareOptions {
    tiebreakers?: string[];
    h2h?: NumericMap;
    birth?: ValueMap;
    ordem?: NumericMap;
    adv?: boolean;
    primaryField?: string;
  }

  export interface TiebreakExplanation {
    aplicaveis: string[];
    semDado: string[];
    desconhecidos: string[];
  }

  const n = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const text = (value: unknown): string => value == null ? '' : String(value);
  const values = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
  const record = (value: unknown): RecordValue | null => value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue : null;
  const identity = (line: StandingLine | null | undefined): string | null => {
    if (!line) return null;
    const uid = text(line.uid);
    if (uid) return uid;
    const name = text(line.name);
    return name || null;
  };
  const difference = (line: StandingLine, won: string, lost: string): number => n(line[won]) - n(line[lost]);

  function byAge(a: StandingLine, b: StandingLine, options: CompareOptions | undefined, direction: 1 | -1): number {
    const birth = options?.birth || {};
    const ka = identity(a), kb = identity(b);
    const x = ka ? birth[ka] : undefined;
    const y = kb ? birth[kb] : undefined;
    const hasA = x != null, hasB = y != null;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    if (!hasA || x === y) return 0;
    return direction > 0 ? n(x) - n(y) : n(y) - n(x);
  }

  /* A ESCADA DO SALDO, do mais rico ao mais pobre. Ver a explicação em `saldo_pontos`. */
  export const NIVEIS_DE_SALDO = [
    { nivel: 'pontos', ganhou: 'rallyFor', perdeu: 'rallyAgainst' },
    { nivel: 'games', ganhou: 'gamesWon', perdeu: 'gamesLost' },
    { nivel: 'sets', ganhou: 'setsWon', perdeu: 'setsLost' },
  ] as const;

  const temNivel = (line: StandingLine | null | undefined, i: number): boolean => {
    if (!line) return false;
    const d = NIVEIS_DE_SALDO[i];
    return line[d.ganhou] != null || line[d.perdeu] != null;
  };

  const temNivelNomeado = (line: StandingLine | null | undefined, nivel: string): boolean => {
    const i = NIVEIS_DE_SALDO.findIndex((x) => x.nivel === nivel);
    return i >= 0 && temNivel(line, i);
  };

  /** O nível mais rico que AS DUAS linhas têm. `null` quando nenhuma tem nenhum. */
  export function nivelMaisRicoComum(a: StandingLine, b: StandingLine): string | null {
    for (let i = 0; i < NIVEIS_DE_SALDO.length; i++) {
      if (temNivel(a, i) && temNivel(b, i)) return NIVEIS_DE_SALDO[i].nivel;
    }
    return null;
  }

  /** O saldo de uma linha num nível nomeado da escada. */
  export function saldoNoNivel(line: StandingLine, nivel: string): number {
    const d = NIVEIS_DE_SALDO.find((x) => x.nivel === nivel);
    if (!d) return 0;
    return difference(line, d.ganhou, d.perdeu);
  }

  export const CRITERIOS: Record<string, Criterion> = {
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
    saldo_pontos: (a, b) => {
      /* ⛔⛔ DESCE A ESCADA ATÉ ALGUÉM FALAR — e esta parte nasceu de um defeito MEU, pego por teste
       * no mesmo dia: a primeira versão parava no nível mais rico COMUM e devolvia o que ele dissesse,
       * inclusive ZERO. Numa linha com games 12-12 e pontos 10-14 contra 20-10, o critério virava
       * NEUTRO — a diferença real de pontos era engolida por um empate em games.
       * ⇒ O certo é percorrer do mais rico ao mais pobre e devolver a PRIMEIRA diferença que não é
       * zero. Nível que empata não decide nada, então não pode calar o nível de baixo. */
      for (const degrau of NIVEIS_DE_SALDO) {
        if (!temNivelNomeado(a, degrau.nivel) || !temNivelNomeado(b, degrau.nivel)) continue;
        const d = saldoNoNivel(b, degrau.nivel) - saldoNoNivel(a, degrau.nivel);
        if (d) return d;
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
      if (!h2h || !ka || !kb) return 0;
      const ab = n(h2h[ka + '|||' + kb]), ba = n(h2h[kb + '|||' + ka]);
      return ab === ba ? 0 : ba - ab;
    },
    antiguidade: (a, b, options) => byAge(a, b, options, +1),
    juventude: (a, b, options) => byAge(a, b, options, -1),
    sorteio: (a, b, options) => {
      const ordem = options?.ordem;
      const ka = identity(a), kb = identity(b);
      if (!ordem || !ka || !kb) return 0;
      const ia = ordem[ka], ib = ordem[kb];
      if (ia == null && ib == null) return 0;
      if (ia == null) return 1;
      if (ib == null) return -1;
      return ia - ib;
    },
  };

  export function standingsCompare(a: StandingLine, b: StandingLine, advanced = false): number {
    if (advanced && n(b.points) !== n(a.points)) return n(b.points) - n(a.points);
    if (n(b.wins) !== n(a.wins)) return n(b.wins) - n(a.wins);
    const setDifference = CRITERIOS.saldo_sets(a, b);
    if (setDifference) return setDifference;
    if (n(b.setsWon) !== n(a.setsWon)) return n(b.setsWon) - n(a.setsWon);
    const gamesDifference = CRITERIOS.saldo_games(a, b);
    if (gamesDifference) return gamesDifference;
    const tiebreakPointsDifference = CRITERIOS.saldo_pontos_tiebreak(a, b);
    if (tiebreakPointsDifference) return tiebreakPointsDifference;
    if (n(b.gamesWon) !== n(a.gamesWon)) return n(b.gamesWon) - n(a.gamesWon);
    const tiebreakDifference = CRITERIOS.saldo_tiebreaks(a, b);
    if (tiebreakDifference) return tiebreakDifference;
    if (n(b.tiebreaksWon) !== n(a.tiebreaksWon)) return n(b.tiebreaksWon) - n(a.tiebreaksWon);
    const pointsDifference = CRITERIOS.saldo_pontos(a, b);
    if (pointsDifference) return pointsDifference;
    if (n(b.pointsFor) !== n(a.pointsFor)) return n(b.pointsFor) - n(a.pointsFor);
    if (n(b.winRate) !== n(a.winRate)) return n(b.winRate) - n(a.winRate);
    return n(a.played) - n(b.played);
  }

  export function standingsCompareConfig(a: StandingLine, b: StandingLine, options: CompareOptions = {}): number {
    const list = options.tiebreakers;
    if (!Array.isArray(list) || !list.length) return standingsCompare(a, b, Boolean(options.adv));
    const primary = options.primaryField || 'points';
    if (a[primary] != null && b[primary] != null && n(b[primary]) !== n(a[primary])) return n(b[primary]) - n(a[primary]);
    for (const criterionName of list) {
      const criterion = CRITERIOS[criterionName];
      if (!criterion) continue;
      const result = criterion(a, b, options);
      if (result) return result;
      if (criterionName === 'sorteio') return 0;
    }
    return 0;
  }

  export function explainTiebreakers(lines: StandingLine[] | null | undefined, options: CompareOptions = {}): TiebreakExplanation {
    const list = Array.isArray(options.tiebreakers) ? options.tiebreakers : [];
    const sample = lines?.[0] || {};
    const output: TiebreakExplanation = { aplicaveis: [], semDado: [], desconhecidos: [] };
    for (const name of list) {
      if (!CRITERIOS[name]) { output.desconhecidos.push(name); continue; }
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

  export function tiebreakPointsOfMatch(match: RecordValue | null | undefined, readTiebreak?: SetTiebreak): { p1: number; p2: number } {
    const output = { p1: 0, p2: 0 };
    for (const rawSet of values(match?.sets)) {
      const set = record(rawSet);
      if (!set) continue;
      let tiebreak = readTiebreak?.(set) || null;
      if (!tiebreak) {
        const nested = record(set.tiebreak);
        if (nested && (nested.pointsP1 != null || nested.pointsP2 != null || nested.p1 != null || nested.p2 != null)) {
          tiebreak = { p1: nested.pointsP1 != null ? nested.pointsP1 : nested.p1, p2: nested.pointsP2 != null ? nested.pointsP2 : nested.p2 };
        }
      }
      if (!tiebreak) continue;
      output.p1 += n(tiebreak.p1);
      output.p2 += n(tiebreak.p2);
    }
    return output;
  }

  export function buildOrdemChave(matches: RecordValue[] | null | undefined, slotKeys?: SlotKeys): NumericMap {
    const order: NumericMap = {};
    let index = 0;
    const list = values(matches).map(record).filter((match): match is RecordValue => Boolean(match)).slice().sort((first, second) => {
      const firstRound = n(first.round), secondRound = n(second.round);
      if (firstRound !== secondRound) return firstRound - secondRound;
      return n(first.gameNumber != null ? first.gameNumber : first.number) - n(second.gameNumber != null ? second.gameNumber : second.number);
    });
    for (const match of list) {
      for (const side of ['p1', 'p2'] as const) {
        for (const rawKey of slotKeys?.(match, side) || []) {
          const key = text(rawKey);
          if (key && order[key] == null) order[key] = index++;
        }
      }
    }
    return order;
  }

  export function buildH2H(matches: RecordValue[] | null | undefined, slotKeys: SlotKeys | undefined, winnerSide: WinnerSide): NumericMap {
    const headToHead: NumericMap = {};
    for (const match of values(matches)) {
      const value = record(match);
      if (!value || !value.winner || value.isBye || value.isSitOut) continue;
      const first = slotKeys?.(value, 'p1') || [], second = slotKeys?.(value, 'p2') || [];
      if (!first.length || !second.length) continue;
      const winner = winnerSide(value);
      const firstWon = winner === 1, secondWon = winner === 2;
      if (!firstWon && !secondWon) continue;
      const winners = firstWon ? first : second, losers = firstWon ? second : first;
      for (const rawWinner of winners) for (const rawLoser of losers) {
        const winnerKey = text(rawWinner), loserKey = text(rawLoser);
        if (!winnerKey || !loserKey) continue;
        const key = winnerKey + '|||' + loserKey;
        headToHead[key] = n(headToHead[key]) + 1;
      }
    }
    return headToHead;
  }
}

declare const module: { exports?: unknown } | undefined;
if (typeof module !== 'undefined' && module) module.exports = ScoreplaceStandings;
