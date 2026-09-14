/*
 * Contrato puro de identidade de participante.
 *
 * A identidade persistida de uma pessoa é o UID. Nome serve apenas de exibição
 * ou de identidade de convidado que ainda não tem conta. Este domínio não sabe
 * de DOM, Firestore ou cache de perfis: ele somente lê a forma estrutural que
 * as entradas de torneio já usam, para que cliente e motor de sorteio partam da
 * mesma definição de participante e de dupla.
 */
namespace ScoreplaceParticipantIdentity {
  export type Uid = string;

  export interface ParticipantSlot {
    uid?: unknown;
    displayName?: unknown;
    name?: unknown;
  }

  export interface ParticipantEntry extends ParticipantSlot {
    p1Uid?: unknown;
    p2Uid?: unknown;
    p1Name?: unknown;
    p2Name?: unknown;
    participants?: unknown;
  }

  function uidOf(value: unknown): Uid | null {
    if (value == null) return null;
    const uid = String(value).trim();
    return uid || null;
  }

  function nameOf(value: unknown): string {
    return value == null ? '' : String(value).trim();
  }

  /**
   * Retorna cada UID estrutural uma vez, na ordem dos slots. Duplas carregam
   * p1Uid/p2Uid e entradas compostas carregam participants[]. UID vazio nunca
   * é identidade; convidados sem conta retornam uma lista vazia.
   */
  export function participantUids(value: unknown): Uid[] {
    if (!value || typeof value !== 'object') return [];
    const entry = value as ParticipantEntry;
    const seen = new Set<Uid>();
    const result: Uid[] = [];
    const add = (candidate: unknown): void => {
      const uid = uidOf(candidate);
      if (!uid || seen.has(uid)) return;
      seen.add(uid);
      result.push(uid);
    };
    add(entry.uid);
    add(entry.p1Uid);
    add(entry.p2Uid);
    if (Array.isArray(entry.participants)) {
      entry.participants.forEach((slot) => {
        if (slot && typeof slot === 'object') add((slot as ParticipantSlot).uid);
      });
    }
    return result;
  }

  /**
   * Uma dupla existe quando os dois slots estão ocupados por UID ou, no caso de
   * convidado sem conta, por nome. Uma barra no texto não transforma alguém em
   * dupla: ela é somente apresentação.
   */
  export function entryTeamMembers(value: unknown): string[] | null {
    if (!value || typeof value !== 'object') return null;
    const entry = value as ParticipantEntry;
    if (Array.isArray(entry.participants) && entry.participants.length > 0) {
      return entry.participants
        .map((slot) => {
          if (!slot || typeof slot !== 'object') return nameOf(slot);
          const person = slot as ParticipantSlot;
          return nameOf(person.displayName) || nameOf(person.name);
        })
        .filter(Boolean);
    }
    const firstOccupied = Boolean(uidOf(entry.p1Uid) || nameOf(entry.p1Name));
    const secondOccupied = Boolean(uidOf(entry.p2Uid) || nameOf(entry.p2Name));
    if (!firstOccupied || !secondOccupied) return null;
    return [nameOf(entry.p1Name) || uidOf(entry.p1Uid) || '', nameOf(entry.p2Name) || uidOf(entry.p2Uid) || ''];
  }
}

declare const module: { exports?: unknown } | undefined;
if (typeof module !== 'undefined' && module) module.exports = ScoreplaceParticipantIdentity;
