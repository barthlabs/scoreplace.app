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
  }
  interface Person { key: string; uid: string | null; manualParticipantId: string | null; name: string; }
  function text(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
  function active(doc: Registration): boolean { return !!doc && doc.status === 'confirmed'; }
  function member(doc: Registration): Person {
    const kind = text(doc.participantKind), uid = text(doc.participantUid), manualId = text(doc.manualParticipantId);
    if (kind === 'account' && uid && !manualId) return { key: 'uid:' + uid, uid, manualParticipantId: null, name: '' };
    if (kind === 'manual' && manualId && !uid) {
      const name = text(doc.manualDisplayName);
      if (!name) throw new Error('convidado manual sem nome de exibição');
      return { key: 'manual:' + manualId, uid: null, manualParticipantId: manualId, name };
    }
    throw new Error('registro de participante inválido');
  }
  function soloEntry(registration: Registration, person: Person): Record<string, unknown> {
    const categoryId = text(registration.categoryId);
    const entry: Record<string, unknown> = { category: categoryId, categories: [categoryId] };
    if (person.uid) entry.uid = person.uid;
    else { entry.manualParticipantId = person.manualParticipantId as string; entry.displayName = person.name; entry.name = person.name; }
    return entry;
  }
  function pairEntry(categoryId: string, first: Person, second: Person): Record<string, unknown> {
    const entry: Record<string, unknown> = { category: categoryId, categories: [categoryId], fixedPair: true };
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
    const pairs = new Map<string, { categoryId: string; people: Person[] }>();
    const entries: Record<string, unknown>[] = [], seen = new Set<string>();
    const list = Array.isArray(registrations) ? registrations as Registration[] : [];
    list.filter(active).forEach((registration) => {
      const id = text(registration.registrationId), categoryId = text(registration.categoryId);
      if (!id || !categoryId || seen.has(id)) throw new Error('registro canônico duplicado ou inválido');
      seen.add(id);
      const person = member(registration), pairId = text(registration.fixedPairId);
      if (!pairId) { entries.push(soloEntry(registration, person)); return; }
      const key = pairId + '\u0000' + categoryId;
      const group = pairs.get(key) || { categoryId, people: [] };
      group.people.push(person); pairs.set(key, group);
    });
    pairs.forEach((group) => {
      if (group.people.length !== 2 || group.people[0].key === group.people[1].key) throw new Error('dupla canônica incompleta ou inválida');
      group.people.sort((a, b) => a.key.localeCompare(b.key));
      entries.push(pairEntry(group.categoryId, group.people[0], group.people[1]));
    });
    return entries;
  }
}
declare const module: { exports?: unknown } | undefined;
if (typeof module !== 'undefined' && module) module.exports = ScoreplaceRegistrationRoster;
