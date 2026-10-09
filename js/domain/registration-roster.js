/* GERADO de src/domain/registration-roster.ts por scripts/build-domain.js. Não editar. */
"use strict";
/*
 * Projeção de leitura da inscrição canônica.
 *
 * `registrations` é a fonte de verdade. Este adaptador apenas a apresenta na
 * forma estrutural que o motor e as telas já consomem; não grava, não inventa
 * nomes de contas e não aceita registros ambíguos. Browser e Functions usam o
 * mesmo JavaScript gerado.
 */
var ScoreplaceRegistrationRoster;
(function (ScoreplaceRegistrationRoster) {
    function text(value) { return typeof value === 'string' ? value.trim() : ''; }
    function active(doc) { return !!doc && doc.status === 'confirmed'; }
    function member(doc) {
        const kind = text(doc.participantKind), uid = text(doc.participantUid), manualId = text(doc.manualParticipantId);
        if (kind === 'account' && uid && !manualId)
            return { key: 'uid:' + uid, uid, manualParticipantId: null, name: '' };
        if (kind === 'manual' && manualId && !uid) {
            const name = text(doc.manualDisplayName);
            if (!name)
                throw new Error('convidado manual sem nome de exibição');
            return { key: 'manual:' + manualId, uid: null, manualParticipantId: manualId, name };
        }
        throw new Error('registro de participante inválido');
    }
    function soloEntry(registration, person) {
        const categoryId = text(registration.categoryId);
        // `category`/`categories` são apenas a superfície compatível do motor
        // legado. O ID explícito permite que as portas de mutação nunca tenham de
        // recuperar identidade de um rótulo visível.
        const entry = { categoryId, category: categoryId, categories: [categoryId] };
        if (person.uid)
            entry.uid = person.uid;
        else {
            entry.manualParticipantId = person.manualParticipantId;
            entry.displayName = person.name;
            entry.name = person.name;
        }
        return entry;
    }
    function pairEntry(categoryId, first, second) {
        const entry = { categoryId, category: categoryId, categories: [categoryId], fixedPair: true };
        if (first.uid)
            entry.p1Uid = first.uid;
        if (second.uid)
            entry.p2Uid = second.uid;
        if (first.manualParticipantId)
            entry.p1ManualId = first.manualParticipantId;
        if (second.manualParticipantId)
            entry.p2ManualId = second.manualParticipantId;
        if (first.name)
            entry.p1Name = first.name;
        if (second.name)
            entry.p2Name = second.name;
        return entry;
    }
    /** Retorna entradas estruturais para o motor; pendentes nunca ocupam vaga. */
    function rosterFromRegistrations(registrations) {
        const pairs = new Map();
        const entries = [], seen = new Set();
        const list = Array.isArray(registrations) ? registrations : [];
        list.filter(active).forEach((registration) => {
            const id = text(registration.registrationId), categoryId = text(registration.categoryId);
            if (!id || !categoryId || seen.has(id))
                throw new Error('registro canônico duplicado ou inválido');
            seen.add(id);
            const person = member(registration), pairId = text(registration.fixedPairId);
            if (!pairId) {
                entries.push(soloEntry(registration, person));
                return;
            }
            const key = pairId + '\u0000' + categoryId;
            const group = pairs.get(key) || { categoryId, people: [] };
            group.people.push(person);
            pairs.set(key, group);
        });
        pairs.forEach((group) => {
            if (group.people.length !== 2 || group.people[0].key === group.people[1].key)
                throw new Error('dupla canônica incompleta ou inválida');
            group.people.sort((a, b) => a.key.localeCompare(b.key));
            entries.push(pairEntry(group.categoryId, group.people[0], group.people[1]));
        });
        return entries;
    }
    ScoreplaceRegistrationRoster.rosterFromRegistrations = rosterFromRegistrations;
})(ScoreplaceRegistrationRoster || (ScoreplaceRegistrationRoster = {}));
if (typeof module !== 'undefined' && module)
    module.exports = ScoreplaceRegistrationRoster;
