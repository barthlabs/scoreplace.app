/*
 * Contrato puro da lista de espera.
 *
 * A fila reúne três storages legados (waitlist, standbyParticipants e
 * monarchWaitlist). UID é identidade quando existe; nome só identifica o
 * convidado que não tem conta. O contrato recebe os resolvedores externos
 * como dependências para não conhecer DOM, Firestore, cache ou perfis.
 */
namespace ScoreplaceWaitlist {
  export type Entry = string | Record<string, unknown>;
  export type Tournament = Record<string, unknown>;

  export interface Helpers {
    participantUids(value: unknown): string[];
    displayName(value: unknown): string;
    memberUidByName?(tournament: Tournament, name: string): string;
  }

  const record = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const text = (value: unknown): string => value == null ? '' : String(value).trim();
  const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
  const object = (value: unknown): Record<string, unknown> | null => record(value);

  export function nameForms(value: unknown, helpers: Helpers): string[] {
    const values: unknown[] = [helpers.displayName(value)];
    const entry = record(value);
    if (entry) values.push(entry.displayName, entry.name, entry.email);
    else if (typeof value === 'string') values.push(value);
    return [...new Set(values.map((item) => text(item).toLowerCase()).filter(Boolean))];
  }

  /** Chave persistida: uid do participante ou nome do convidado sem conta. */
  export function key(value: unknown, helpers: Helpers): string {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    const entry = record(value);
    if (!entry) return '';
    const uid = text(entry.uid);
    if (uid) return uid;
    const storedName = text(entry.displayName) || text(entry.name);
    return storedName || text(helpers.displayName(value));
  }

  function entryByKeyFromPools(tournament: Tournament, keyValue: string, helpers: Helpers): Entry | null {
    const wanted = text(keyValue);
    if (!wanted) return null;
    const lower = wanted.toLowerCase();
    for (const pool of [array(tournament.waitlist), array(tournament.standbyParticipants)]) {
      for (const candidate of pool) {
        const entry = record(candidate);
        if (entry && text(entry.uid) === wanted) return candidate as Entry;
        if ((!entry || !text(entry.uid)) && nameForms(candidate, helpers).includes(lower)) return candidate as Entry;
      }
    }
    return null;
  }

  export function entryByKey(tournament: Tournament | null | undefined, keyValue: unknown, helpers: Helpers): Entry | null {
    return tournament ? entryByKeyFromPools(tournament, text(keyValue), helpers) : null;
  }

  function looksLikeUid(tournament: Tournament, candidate: string): boolean {
    for (const pool of [array(tournament.participants), array(tournament.standbyParticipants), array(tournament.waitlist)]) {
      for (const value of pool) {
        const entry = record(value);
        if (!entry) continue;
        if ([entry.uid, entry.p1Uid, entry.p2Uid].some((uid) => text(uid) === candidate)) return true;
      }
    }
    return /^[A-Za-z0-9_-]{20,}$/.test(candidate);
  }

  export type WaitSource = 'waitlist' | 'standbyParticipants' | 'monarchWaitlist';

  export interface SourcedEntry {
    entry: Entry;
    source: WaitSource;
  }

  /**
   * Leitura única e ordenada dos três storages, sem índices órfãos, PRESERVANDO
   * de qual storage cada entrada veio.
   *
   * ⛔ POR QUE A PROCEDÊNCIA TEM DE SAIR DAQUI. `getWaitlist()` normaliza texto
   * órfão em `{name, displayName}` e, a partir daí, a origem NÃO dá mais para
   * recuperar — quem lê depois não distingue um manual real da fila de um
   * espelho textual de Rei/Rainha. Este é o COLETOR ÚNICO, e ele carrega
   * `source` ATRAVÉS da deduplicação; `getWaitlist()` passa a ser um invólucro
   * dele, para as duas leituras nunca divergirem.
   *
   * ⚠️ A procedência serve para AUDITORIA e DEDUPLICAÇÃO — nunca para apagar
   * alguém da contagem. Nome manual não resolvível continua entrando, venha de
   * onde vier; o que se descarta é UID órfão e resíduo, como já era.
   */
  export function getWaitlistWithSource(tournament: Tournament | null | undefined, helpers: Helpers): SourcedEntry[] {
    if (!tournament) return [];
    const output: SourcedEntry[] = [];
    const seen = new Set<string>();
    const push = (entry: Entry, entryKey: string, source: WaitSource): void => {
      if (!entryKey || seen.has(entryKey)) return;
      seen.add(entryKey);
      output.push({ entry: entry, source: source });
    };
    const addText = (raw: unknown, source: WaitSource): void => {
      const value = text(raw);
      if (!value) return;
      const existing = entryByKeyFromPools(tournament, value, helpers);
      if (existing) { push(existing, key(existing, helpers), source); return; }
      if (helpers.memberUidByName && helpers.memberUidByName(tournament, value)) return;
      if (looksLikeUid(tournament, value)) return;
      push({ name: value, displayName: value }, value, source);
    };
    const addEntry = (entry: unknown, source: WaitSource): void => {
      if (!entry) return;
      if (typeof entry === 'string') { addText(entry, source); return; }
      push(entry as Entry, key(entry, helpers), source);
    };
    array(tournament.waitlist).forEach((e) => addEntry(e, 'waitlist'));
    array(tournament.standbyParticipants).forEach((e) => addEntry(e, 'standbyParticipants'));
    const monarch = object(tournament.monarchWaitlist);
    if (monarch) {
      Object.keys(monarch).forEach((category) => array(monarch[category]).forEach((e) => addEntry(e, 'monarchWaitlist')));
    }
    return output;
  }

  /** Leitura única e ordenada dos três storages, sem índices órfãos. */
  export function getWaitlist(tournament: Tournament | null | undefined, helpers: Helpers): Entry[] {
    return getWaitlistWithSource(tournament, helpers).map((sourced) => sourced.entry);
  }

  export function first(tournament: Tournament | null | undefined, helpers: Helpers, filter?: (entry: Entry) => boolean): Entry | null {
    return getWaitlist(tournament, helpers).find((entry) => !filter || filter(entry)) || null;
  }

  export function pushBack(tournament: Tournament | null | undefined, entry: Entry | null | undefined, helpers: Helpers): boolean {
    if (!tournament || !entry) return false;
    const standby = array(tournament.standbyParticipants);
    if (!Array.isArray(tournament.standbyParticipants)) tournament.standbyParticipants = standby;
    const uids = helpers.participantUids(entry).filter(Boolean);
    const name = text(helpers.displayName(entry)).toLowerCase();
    const exists = getWaitlist(tournament, helpers).some((current) => {
      const currentUids = helpers.participantUids(current).filter(Boolean);
      if (uids.length && currentUids.length) return currentUids.some((uid) => uids.includes(uid));
      return Boolean(name) && text(helpers.displayName(current)).toLowerCase() === name;
    });
    if (exists) return false;
    standby.push(entry);
    return true;
  }

  export function removeByName(tournament: Tournament | null | undefined, value: unknown, helpers: Helpers): boolean {
    if (!tournament) return false;
    const target = text(value).toLowerCase();
    if (!target) return false;
    let removed = false;
    const matches = (entry: unknown): boolean => nameForms(entry, helpers).includes(target);
    for (const field of ['waitlist', 'standbyParticipants']) {
      if (!Array.isArray(tournament[field])) continue;
      const before = (tournament[field] as unknown[]).length;
      tournament[field] = (tournament[field] as unknown[]).filter((entry) => !matches(entry));
      if ((tournament[field] as unknown[]).length < before) removed = true;
    }
    const monarch = object(tournament.monarchWaitlist);
    if (monarch) Object.keys(monarch).forEach((category) => {
      if (!Array.isArray(monarch[category])) return;
      const before = (monarch[category] as unknown[]).length;
      monarch[category] = (monarch[category] as unknown[]).filter((entry) => !matches(entry));
      if ((monarch[category] as unknown[]).length < before) removed = true;
    });
    return removed;
  }

  export function removeByKey(tournament: Tournament | null | undefined, keyValue: unknown, helpers: Helpers): boolean {
    if (!tournament) return false;
    const wanted = text(keyValue);
    if (!wanted) return false;
    const lower = wanted.toLowerCase();
    let removed = false;
    const matches = (entry: unknown): boolean => {
      const objectEntry = record(entry);
      if (objectEntry && text(objectEntry.uid)) return text(objectEntry.uid) === wanted;
      return nameForms(entry, helpers).includes(lower);
    };
    for (const field of ['waitlist', 'standbyParticipants']) {
      if (!Array.isArray(tournament[field])) continue;
      const before = (tournament[field] as unknown[]).length;
      tournament[field] = (tournament[field] as unknown[]).filter((entry) => !matches(entry));
      if ((tournament[field] as unknown[]).length < before) removed = true;
    }
    const monarch = object(tournament.monarchWaitlist);
    if (monarch) Object.keys(monarch).forEach((category) => {
      if (!Array.isArray(monarch[category])) return;
      const before = (monarch[category] as unknown[]).length;
      monarch[category] = (monarch[category] as unknown[]).filter((entry) => {
        const raw = text(entry);
        return !(raw === wanted || raw.toLowerCase() === lower);
      });
      if ((monarch[category] as unknown[]).length < before) removed = true;
    });
    return removed;
  }

  export function clear(tournament: Tournament | null | undefined, helpers: Helpers): Entry[] {
    if (!tournament) return [];
    const collected = getWaitlist(tournament, helpers);
    tournament.waitlist = [];
    tournament.standbyParticipants = [];
    tournament.monarchWaitlist = {};
    return collected;
  }

  export function normalizeKey(tournament: Tournament | null | undefined, item: unknown, helpers: Helpers): string {
    if (!tournament) return '';
    const raw = text(record(item) ? key(item, helpers) : item);
    if (!raw) return '';
    const direct = entryByKeyFromPools(tournament, raw, helpers);
    if (direct) return key(direct, helpers);
    return helpers.memberUidByName ? text(helpers.memberUidByName(tournament, raw)) : '';
  }

  export function nameSet(tournament: Tournament | null | undefined, helpers: Helpers): Record<string, 1> {
    const result: Record<string, 1> = {};
    getWaitlist(tournament, helpers).forEach((entry) => {
      const name = text(helpers.displayName(entry)).toLowerCase();
      if (!name) return;
      name.split('/').map((part) => part.trim()).filter(Boolean).forEach((part) => { result[part] = 1; });
    });
    return result;
  }

  export function phaseDrawDone(tournament: Tournament | null | undefined): boolean {
    if (!tournament) return false;
    if (typeof tournament.hasDraw === 'boolean') return tournament.hasDraw;
    return array(tournament.matches).length > 0 || array(tournament.rounds).length > 0 || array(tournament.groups).length > 0;
  }

  export function enrollmentOpenState(tournament: Tournament | null | undefined, nowMs?: number): { open: boolean; ligaOpen: boolean; sorteio: boolean; deadlinePassed: boolean } {
    if (!tournament) return { open: false, ligaOpen: false, sorteio: false, deadlinePassed: false };
    const format = text(tournament.format).toLowerCase();
    const isLiga = format === 'liga' || format === 'ranking';
    const ligaOpen = isLiga && tournament.ligaOpenEnrollment !== false && tournament.status !== 'finished';
    const sorteio = phaseDrawDone(tournament);
    const deadline = new Date(String(tournament.registrationLimit || '')).getTime();
    const deadlinePassed = Boolean(tournament.registrationLimit && Number.isFinite(deadline) && deadline < (typeof nowMs === 'number' ? nowMs : Date.now()));
    return { open: (tournament.status !== 'closed' && tournament.status !== 'finished' && !sorteio && !deadlinePassed) || !!ligaOpen, ligaOpen, sorteio, deadlinePassed };
  }

  /** Quem ocupa confronto ou grupo da fase atual; folga nunca conta como jogo. */
  export function isPlayingCurrentPhase(tournament: Tournament | null | undefined, entry: unknown, helpers: Helpers): boolean {
    if (!tournament || !entry) return false;
    const uids = helpers.participantUids(entry).filter(Boolean);
    const name = text(helpers.displayName(entry)).toLowerCase();
    let uidHit = false;
    let nameHit = false;
    const checkUids = (values: unknown): void => array(values).forEach((value) => {
      if (text(value) && uids.includes(text(value))) uidHit = true;
    });
    const checkNames = (values: unknown): void => array(values).forEach((value) => {
      const candidate = text(value).toLowerCase();
      if (!candidate || !name) return;
      if (candidate === name || (candidate.includes(' / ') && candidate.split(' / ').some((part) => part.trim() === name))) nameHit = true;
    });
    const checkMatch = (value: unknown): void => {
      const match = record(value);
      if (!match || match.isSitOut) return;
      checkUids(match.team1Uids); checkUids(match.team2Uids);
      checkUids([match.p1Uid, match.p2Uid]);
      checkNames([match.p1, match.p2]);
    };
    array(tournament.rounds).forEach((roundValue) => {
      const round = record(roundValue);
      if (!round) return;
      array(round.monarchGroups).forEach((groupValue) => {
        const group = record(groupValue);
        if (group) { checkUids(group.playersUids); checkNames(group.players); }
      });
      array(round.matches).forEach(checkMatch);
    });
    array(tournament.groups).forEach((groupValue) => {
      const group = record(groupValue);
      if (group) { checkUids(group.playersUids); checkNames(group.players); }
    });
    array(tournament.matches).forEach(checkMatch);
    return uids.length ? uidHit : nameHit;
  }
}

declare const module: { exports?: unknown } | undefined;
if (typeof module !== 'undefined' && module) module.exports = ScoreplaceWaitlist;
