/*
 * Projeção de leitura da inscrição canônica.
 *
 * `registrations` é a fonte de verdade. Este adaptador apenas a apresenta na
 * forma estrutural que o motor e as telas já consomem; não grava, não inventa
 * nomes de contas e não aceita registros ambíguos. Browser e Functions usam o
 * mesmo JavaScript gerado.
 */
namespace ScoreplaceRegistrationRoster {
  interface Registration {
    registrationId?: unknown;
    categoryId?: unknown;
    participantKind?: unknown;
    participantUid?: unknown;
    manualParticipantId?: unknown;
    manualDisplayName?: unknown;
    status?: unknown;
    fixedPairId?: unknown;
    enrollSeq?: unknown;
    p1Seq?: unknown;
    p2Seq?: unknown;
    registrationOrder?: unknown;
    createdAt?: unknown;
  }
  interface Person { key: string; uid: string | null; manualParticipantId: string | null; name: string; order: OrderKey; }
  interface OrderKey { rank: number; fallback: string; index: number; }
  function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
  function active(doc: Registration): boolean { return !!doc && doc.status === 'confirmed'; }
  function timestamp(value: unknown): number | null {
    if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
      const n = Number((value as { toMillis: () => unknown }).toMillis());
      return Number.isFinite(n) ? n : null;
    }
    if (value && typeof value === 'object' && typeof (value as { seconds?: unknown }).seconds === 'number') {
      return Number((value as { seconds: number }).seconds) * 1000;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = Date.parse(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  function numericName(value: string): number | null {
    const match = value.match(/(?:jogador|player|inscrito|placeholder)\s*0*(\d+)$/i);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
  }
  function orderOf(doc: Registration, name: string, index: number): OrderKey {
    const explicit = [doc.enrollSeq, doc.registrationOrder, doc.p1Seq, doc.p2Seq]
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => Number(value)).find((value) => Number.isFinite(value));
    if (explicit !== undefined) return { rank: explicit, fallback: '', index };
    const named = numericName(name);
    if (named !== null) return { rank: named, fallback: '', index };
    const created = timestamp(doc.createdAt);
    if (created !== null) return { rank: created, fallback: '', index };
    return { rank: Number.POSITIVE_INFINITY, fallback: name.toLocaleLowerCase(), index };
  }
  function compareOrder(a: OrderKey, b: OrderKey): number {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const fallback = a.fallback.localeCompare(b.fallback, 'pt-BR', { sensitivity: 'base', numeric: true });
    return fallback || a.index - b.index;
  }
  function member(doc: Registration, index: number): Person {
    const kind = text(doc.participantKind), uid = text(doc.participantUid), manualId = text(doc.manualParticipantId);
    if (kind === 'account' && uid && !manualId) return { key: 'uid:' + uid, uid, manualParticipantId: null, name: '', order: orderOf(doc, '', index) };
    if (kind === 'manual' && manualId && !uid) {
      const name = text(doc.manualDisplayName);
      if (!name) throw new Error('convidado manual sem nome de exibição');
      return { key: 'manual:' + manualId, uid: null, manualParticipantId: manualId, name, order: orderOf(doc, name, index) };
    }
    throw new Error('registro de participante inválido');
  }
  function soloEntry(registration: Registration, person: Person): Record<string, unknown> {
    const categoryId = text(registration.categoryId);
    // `category`/`categories` são apenas a superfície compatível do motor
    // legado. O ID explícito permite que as portas de mutação nunca tenham de
    // recuperar identidade de um rótulo visível.
    const entry: Record<string, unknown> = { categoryId, category: categoryId, categories: [categoryId] };
    if (person.uid) entry.uid = person.uid;
    else { entry.manualParticipantId = person.manualParticipantId as string; entry.displayName = person.name; entry.name = person.name; }
    return entry;
  }
  function pairEntry(categoryId: string, first: Person, second: Person): Record<string, unknown> {
    // A dupla é uma unidade visual, mas cada integrante continua tendo o seu
    // número de inscrição. Sem carregar a sequência para a projeção legada, a
    // tela precisava recriá-la pela posição do array (que o Firestore não
    // garante) e os pares apareciam embaralhados a cada leitura.
    const entry: Record<string, unknown> = {
      categoryId, category: categoryId, categories: [categoryId], fixedPair: true,
      p1Seq: first.order.rank,
      p2Seq: second.order.rank,
    };
    if (first.uid) entry.p1Uid = first.uid;
    if (second.uid) entry.p2Uid = second.uid;
    if (first.manualParticipantId) entry.p1ManualId = first.manualParticipantId;
    if (second.manualParticipantId) entry.p2ManualId = second.manualParticipantId;
    if (first.name) entry.p1Name = first.name;
    if (second.name) entry.p2Name = second.name;
    return entry;
  }
  /** Retorna entradas estruturais para o motor; pendentes nunca ocupam vaga. */
  export function rosterFromRegistrations(registrations: unknown): Record<string, unknown>[] {
    const pairs = new Map<string, { categoryId: string; people: Person[]; order: OrderKey }>();
    const ordered: Array<{ order: OrderKey; entry?: Record<string, unknown>; pairKey?: string }> = [], seen = new Set<string>();
    // Firestore não garante a ordem de uma leitura de subcoleção. A ordem de
    // inscrição (enrollSeq/createdAt) é a fonte principal; para reservas legadas
    // sem esse campo, "Jogador N" conserva o número cronológico da vaga. O ID
    // técnico só é desempate final e nunca pode embaralhar a lista visível.
    const list = (Array.isArray(registrations) ? registrations as Registration[] : [])
      .map((registration, index) => ({ registration, index }))
      .filter((item) => active(item.registration))
      .sort((a, b) => {
        const an = text(a.registration.manualDisplayName), bn = text(b.registration.manualDisplayName);
        const result = compareOrder(orderOf(a.registration, an, a.index), orderOf(b.registration, bn, b.index));
        return result || text(a.registration.registrationId).localeCompare(text(b.registration.registrationId));
      });
    list.forEach(({ registration, index }, order) => {
      const id = text(registration.registrationId), categoryId = text(registration.categoryId);
      if (!id || !categoryId || seen.has(id)) throw new Error('registro canônico duplicado ou inválido');
      seen.add(id);
      const person = member(registration, index), pairId = text(registration.fixedPairId);
      if (!pairId) { ordered.push({ order: person.order, entry: soloEntry(registration, person) }); return; }
      const key = pairId + '\u0000' + categoryId;
      const group = pairs.get(key) || { categoryId, people: [], order: person.order };
      group.people.push(person); pairs.set(key, group);
    });
    pairs.forEach((group, pairKey) => ordered.push({ order: group.order, pairKey }));
    const entries: Record<string, unknown>[] = [];
    ordered.sort((a, b) => compareOrder(a.order, b.order)).forEach((item) => {
      if (item.entry) { entries.push(item.entry); return; }
      const group = pairs.get(item.pairKey as string) as { categoryId: string; people: Person[]; order: OrderKey };
      if (group.people.length !== 2 || group.people[0].key === group.people[1].key) throw new Error('dupla canônica incompleta ou inválida');
      group.people.sort((a, b) => compareOrder(a.order, b.order));
      entries.push(pairEntry(group.categoryId, group.people[0], group.people[1]));
    });
    return entries;
  }
}
declare const module: { exports?: unknown } | undefined;
if (typeof module !== 'undefined' && module) module.exports = ScoreplaceRegistrationRoster;
