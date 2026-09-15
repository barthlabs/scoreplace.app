/*
 * Contrato puro da escala de arbitragem.
 *
 * O navegador envia somente a intenção. A Function autentica, busca o perfil
 * público e aplica esta transformação dentro da transação do torneio. Assim a
 * entrada persistida nunca depende de nome, foto ou relógio da aba.
 */
namespace ScoreplaceRefereeRoster {
  export type Action = 'invite' | 'self-confirm' | 'remove';
  export interface PublicProfile { displayName?: unknown; name?: unknown; photoURL?: unknown; }
  export interface RefereeEntry {
    uid: string;
    name: string;
    photoURL: string;
    status: 'invited' | 'confirmed';
    invitedAt?: string;
    confirmedAt?: string;
    invitedBy?: string;
  }
  export interface ApplyInput {
    action: Action;
    targetUid: unknown;
    callerUid: unknown;
    profile: PublicProfile | null | undefined;
    now: string;
  }
  export interface ApplyResult { changed: boolean; arbitros: RefereeEntry[]; }

  const text = (value: unknown, max = 0): string => {
    const result = value == null ? '' : String(value).trim();
    return max > 0 ? result.slice(0, max) : result;
  };
  const safeUid = (value: unknown): string => text(value, 160);
  const safeDate = (value: unknown): string => text(value, 80);
  const safeOwnerUid = (value: unknown): string => {
    const valueText = safeUid(value);
    return valueText.includes('@') ? '' : valueText;
  };
  const safeStatus = (value: unknown): 'invited' | 'confirmed' => value === 'confirmed' ? 'confirmed' : 'invited';

  /** Entrada mínima: não propaga e-mail, telefone nem campos privados legados. */
  export function sanitize(entry: unknown): RefereeEntry | null {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const raw = entry as Record<string, unknown>;
    const uid = safeUid(raw.uid);
    if (!uid) return null;
    const out: RefereeEntry = {
      uid,
      name: text(raw.name || raw.displayName, 160) || 'Árbitro',
      photoURL: text(raw.photoURL, 2048),
      status: safeStatus(raw.status),
    };
    const invitedAt = safeDate(raw.invitedAt);
    const confirmedAt = safeDate(raw.confirmedAt);
    const invitedBy = safeOwnerUid(raw.invitedBy);
    if (invitedAt) out.invitedAt = invitedAt;
    if (confirmedAt) out.confirmedAt = confirmedAt;
    if (invitedBy) out.invitedBy = invitedBy;
    return out;
  }

  export function sanitizeAll(value: unknown): RefereeEntry[] {
    const output: RefereeEntry[] = [];
    const seen = new Set<string>();
    (Array.isArray(value) ? value : []).forEach((item) => {
      const clean = sanitize(item);
      if (!clean || seen.has(clean.uid)) return;
      seen.add(clean.uid);
      output.push(clean);
    });
    return output;
  }

  function fromPublicProfile(targetUid: string, callerUid: string, profile: PublicProfile | null | undefined, status: 'invited' | 'confirmed', now: string): RefereeEntry {
    const source = profile || {};
    const entry: RefereeEntry = {
      uid: targetUid,
      name: text(source.displayName || source.name, 160) || 'Árbitro',
      photoURL: text(source.photoURL, 2048),
      status,
    };
    if (status === 'confirmed') entry.confirmedAt = now;
    else entry.invitedAt = now;
    entry.invitedBy = callerUid;
    return entry;
  }

  /** Aplica uma intenção já autenticada; a Function decide autorização e relógio. */
  export function apply(current: unknown, input: ApplyInput): ApplyResult {
    const targetUid = safeUid(input.targetUid);
    const callerUid = safeUid(input.callerUid);
    if (!targetUid || !callerUid) throw new Error('árbitro e autor são obrigatórios');
    if (!['invite', 'self-confirm', 'remove'].includes(input.action)) throw new Error('ação de arbitragem inválida');
    if (input.action === 'self-confirm' && targetUid !== callerUid) throw new Error('autoconfirmação só pode confirmar quem pediu');
    const now = safeDate(input.now);
    if (!now) throw new Error('horário da operação é obrigatório');

    const before = sanitizeAll(current);
    let next: RefereeEntry[];
    if (input.action === 'remove') {
      next = before.filter((entry) => entry.uid !== targetUid);
    } else if (input.action === 'invite') {
      next = before.some((entry) => entry.uid === targetUid)
        ? before
        : before.concat(fromPublicProfile(targetUid, callerUid, input.profile, 'invited', now));
    } else {
      const confirmed = fromPublicProfile(targetUid, callerUid, input.profile, 'confirmed', now);
      const withoutTarget = before.filter((entry) => entry.uid !== targetUid);
      next = withoutTarget.concat(confirmed);
    }
    const source = Array.isArray(current) ? current : [];
    return { changed: JSON.stringify(source) !== JSON.stringify(next), arbitros: next };
  }
}

declare const module: { exports?: unknown } | undefined;
if (typeof module !== 'undefined' && module) module.exports = ScoreplaceRefereeRoster;
