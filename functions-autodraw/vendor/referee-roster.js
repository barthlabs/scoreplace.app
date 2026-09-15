/* GERADO de src/domain/referee-roster.ts por scripts/build-domain.js. Não editar. */
"use strict";
/*
 * Contrato puro da escala de arbitragem.
 *
 * O navegador envia somente a intenção. A Function autentica, busca o perfil
 * público e aplica esta transformação dentro da transação do torneio. Assim a
 * entrada persistida nunca depende de nome, foto ou relógio da aba.
 */
var ScoreplaceRefereeRoster;
(function (ScoreplaceRefereeRoster) {
    const text = (value, max = 0) => {
        const result = value == null ? '' : String(value).trim();
        return max > 0 ? result.slice(0, max) : result;
    };
    const safeUid = (value) => text(value, 160);
    const safeDate = (value) => text(value, 80);
    const safeOwnerUid = (value) => {
        const valueText = safeUid(value);
        return valueText.includes('@') ? '' : valueText;
    };
    const safeStatus = (value) => value === 'confirmed' ? 'confirmed' : 'invited';
    /** Entrada mínima: não propaga e-mail, telefone nem campos privados legados. */
    function sanitize(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            return null;
        const raw = entry;
        const uid = safeUid(raw.uid);
        if (!uid)
            return null;
        const out = {
            uid,
            name: text(raw.name || raw.displayName, 160) || 'Árbitro',
            photoURL: text(raw.photoURL, 2048),
            status: safeStatus(raw.status),
        };
        const invitedAt = safeDate(raw.invitedAt);
        const confirmedAt = safeDate(raw.confirmedAt);
        const invitedBy = safeOwnerUid(raw.invitedBy);
        if (invitedAt)
            out.invitedAt = invitedAt;
        if (confirmedAt)
            out.confirmedAt = confirmedAt;
        if (invitedBy)
            out.invitedBy = invitedBy;
        return out;
    }
    ScoreplaceRefereeRoster.sanitize = sanitize;
    function sanitizeAll(value) {
        const output = [];
        const seen = new Set();
        (Array.isArray(value) ? value : []).forEach((item) => {
            const clean = sanitize(item);
            if (!clean || seen.has(clean.uid))
                return;
            seen.add(clean.uid);
            output.push(clean);
        });
        return output;
    }
    ScoreplaceRefereeRoster.sanitizeAll = sanitizeAll;
    function fromPublicProfile(targetUid, callerUid, profile, status, now) {
        const source = profile || {};
        const entry = {
            uid: targetUid,
            name: text(source.displayName || source.name, 160) || 'Árbitro',
            photoURL: text(source.photoURL, 2048),
            status,
        };
        if (status === 'confirmed')
            entry.confirmedAt = now;
        else
            entry.invitedAt = now;
        entry.invitedBy = callerUid;
        return entry;
    }
    /** Aplica uma intenção já autenticada; a Function decide autorização e relógio. */
    function apply(current, input) {
        const targetUid = safeUid(input.targetUid);
        const callerUid = safeUid(input.callerUid);
        if (!targetUid || !callerUid)
            throw new Error('árbitro e autor são obrigatórios');
        if (!['invite', 'self-confirm', 'remove'].includes(input.action))
            throw new Error('ação de arbitragem inválida');
        if (input.action === 'self-confirm' && targetUid !== callerUid)
            throw new Error('autoconfirmação só pode confirmar quem pediu');
        const now = safeDate(input.now);
        if (!now)
            throw new Error('horário da operação é obrigatório');
        const before = sanitizeAll(current);
        let next;
        if (input.action === 'remove') {
            next = before.filter((entry) => entry.uid !== targetUid);
        }
        else if (input.action === 'invite') {
            next = before.some((entry) => entry.uid === targetUid)
                ? before
                : before.concat(fromPublicProfile(targetUid, callerUid, input.profile, 'invited', now));
        }
        else {
            const confirmed = fromPublicProfile(targetUid, callerUid, input.profile, 'confirmed', now);
            const withoutTarget = before.filter((entry) => entry.uid !== targetUid);
            next = withoutTarget.concat(confirmed);
        }
        const source = Array.isArray(current) ? current : [];
        return { changed: JSON.stringify(source) !== JSON.stringify(next), arbitros: next };
    }
    ScoreplaceRefereeRoster.apply = apply;
})(ScoreplaceRefereeRoster || (ScoreplaceRefereeRoster = {}));
if (typeof module !== 'undefined' && module)
    module.exports = ScoreplaceRefereeRoster;
