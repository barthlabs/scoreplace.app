/* GERADO de src/domain/participant-identity.ts por scripts/build-domain.js. Não editar. */
"use strict";
/*
 * Contrato puro de identidade de participante.
 *
 * A identidade persistida de uma pessoa é o UID. Nome serve apenas de exibição
 * ou de identidade de convidado que ainda não tem conta. Este domínio não sabe
 * de DOM, Firestore ou cache de perfis: ele somente lê a forma estrutural que
 * as entradas de torneio já usam, para que cliente e motor de sorteio partam da
 * mesma definição de participante e de dupla.
 */
var ScoreplaceParticipantIdentity;
(function (ScoreplaceParticipantIdentity) {
    function uidOf(value) {
        if (value == null)
            return null;
        const uid = String(value).trim();
        return uid || null;
    }
    function nameOf(value) {
        return value == null ? '' : String(value).trim();
    }
    /**
     * Retorna cada UID estrutural uma vez, na ordem dos slots. Duplas carregam
     * p1Uid/p2Uid e entradas compostas carregam participants[]. UID vazio nunca
     * é identidade; convidados sem conta retornam uma lista vazia.
     */
    function participantUids(value) {
        if (!value || typeof value !== 'object')
            return [];
        const entry = value;
        const seen = new Set();
        const result = [];
        const add = (candidate) => {
            const uid = uidOf(candidate);
            if (!uid || seen.has(uid))
                return;
            seen.add(uid);
            result.push(uid);
        };
        add(entry.uid);
        add(entry.p1Uid);
        add(entry.p2Uid);
        if (Array.isArray(entry.participants)) {
            entry.participants.forEach((slot) => {
                if (slot && typeof slot === 'object')
                    add(slot.uid);
            });
        }
        return result;
    }
    ScoreplaceParticipantIdentity.participantUids = participantUids;
    /**
     * Cada SLOT DE PESSOA de uma entrada, com ou sem conta.
     *
     * ⛔ POR QUE NÃO BASTA `participantUids()`. Ele devolve só os UIDs, então numa
     * equipe composta `[{uid}, {displayName}]` o slot manual DESAPARECE. Quem
     * precisa saber "quantas pessoas existem aqui e quantas eu consigo medir"
     * — a análise de conta duplicada do organizador — teria de adivinhar a
     * diferença, e adivinhar aqui significa deixar gente de fora da contagem em
     * silêncio.
     *
     * ⛔ Slot VAZIO não vira slot: sem UID e sem nome é VAGA, não pessoa. Contar
     * vaga como "não medida" diria que faltou olhar alguém que não existe.
     *
     * Convidado sem conta é identidade legítima e limitada ao torneio; ele entra
     * com `uid: null` e o nome que o organizador escreveu. Nome NUNCA é
     * convertido em UID.
     */
    function participantSlots(value) {
        const slots = [];
        const vistosUid = new Set();
        const vistosNome = new Set();
        const add = (rawUid, rawName) => {
            const uid = uidOf(rawUid);
            const name = nameOf(rawName);
            if (!uid && !name)
                return; // vaga, não pessoa
            if (uid) {
                if (vistosUid.has(uid))
                    return;
                vistosUid.add(uid);
                slots.push({ uid: uid, name: name });
                return;
            }
            const chave = name.toLowerCase();
            if (vistosNome.has(chave))
                return;
            vistosNome.add(chave);
            slots.push({ uid: null, name: name });
        };
        // Entrada TEXTUAL — a fila legada guarda nome solto. É pessoa, não lixo.
        if (typeof value === 'string') {
            add(null, value);
            return slots;
        }
        if (!value || typeof value !== 'object')
            return slots;
        const entry = value;
        add(entry.uid, entry.displayName || entry.name);
        if (Array.isArray(entry.participants) && entry.participants.length > 0) {
            // Equipe composta: `participants[]` MANDA sobre p1/p2.
            entry.participants.forEach((slot) => {
                if (typeof slot === 'string') {
                    add(null, slot);
                    return;
                }
                if (slot && typeof slot === 'object') {
                    const person = slot;
                    add(person.uid, person.displayName || person.name);
                }
            });
            return slots;
        }
        add(entry.p1Uid, entry.p1Name);
        add(entry.p2Uid, entry.p2Name);
        return slots;
    }
    ScoreplaceParticipantIdentity.participantSlots = participantSlots;
    /**
     * Uma dupla existe quando os dois slots estão ocupados por UID ou, no caso de
     * convidado sem conta, por nome. Uma barra no texto não transforma alguém em
     * dupla: ela é somente apresentação.
     */
    function entryTeamMembers(value) {
        if (!value || typeof value !== 'object')
            return null;
        const entry = value;
        if (Array.isArray(entry.participants) && entry.participants.length > 0) {
            return entry.participants
                .map((slot) => {
                if (!slot || typeof slot !== 'object')
                    return nameOf(slot);
                const person = slot;
                return nameOf(person.displayName) || nameOf(person.name);
            })
                .filter(Boolean);
        }
        const firstOccupied = Boolean(uidOf(entry.p1Uid) || nameOf(entry.p1Name));
        const secondOccupied = Boolean(uidOf(entry.p2Uid) || nameOf(entry.p2Name));
        if (!firstOccupied || !secondOccupied)
            return null;
        return [nameOf(entry.p1Name) || uidOf(entry.p1Uid) || '', nameOf(entry.p2Name) || uidOf(entry.p2Uid) || ''];
    }
    ScoreplaceParticipantIdentity.entryTeamMembers = entryTeamMembers;
})(ScoreplaceParticipantIdentity || (ScoreplaceParticipantIdentity = {}));
if (typeof module !== 'undefined' && module)
    module.exports = ScoreplaceParticipantIdentity;
