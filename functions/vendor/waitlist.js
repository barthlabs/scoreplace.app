/* GERADO de src/domain/waitlist.ts por scripts/build-domain.js. Não editar. */
"use strict";
/*
 * Contrato puro da lista de espera.
 *
 * A fila reúne três storages legados (waitlist, standbyParticipants e
 * monarchWaitlist). UID é identidade quando existe; nome só identifica o
 * convidado que não tem conta. O contrato recebe os resolvedores externos
 * como dependências para não conhecer DOM, Firestore, cache ou perfis.
 */
var ScoreplaceWaitlist;
(function (ScoreplaceWaitlist) {
    const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    const text = (value) => value == null ? '' : String(value).trim();
    const array = (value) => Array.isArray(value) ? value : [];
    const object = (value) => record(value);
    function nameForms(value, helpers) {
        const values = [helpers.displayName(value)];
        const entry = record(value);
        if (entry)
            values.push(entry.displayName, entry.name, entry.email);
        else if (typeof value === 'string')
            values.push(value);
        return [...new Set(values.map((item) => text(item).toLowerCase()).filter(Boolean))];
    }
    ScoreplaceWaitlist.nameForms = nameForms;
    /** Chave persistida: uid do participante ou nome do convidado sem conta. */
    function key(value, helpers) {
        if (value == null)
            return '';
        if (typeof value === 'string')
            return value.trim();
        const entry = record(value);
        if (!entry)
            return '';
        const uid = text(entry.uid);
        if (uid)
            return uid;
        const storedName = text(entry.displayName) || text(entry.name);
        return storedName || text(helpers.displayName(value));
    }
    ScoreplaceWaitlist.key = key;
    function entryByKeyFromPools(tournament, keyValue, helpers) {
        const wanted = text(keyValue);
        if (!wanted)
            return null;
        const lower = wanted.toLowerCase();
        for (const pool of [array(tournament.waitlist), array(tournament.standbyParticipants)]) {
            for (const candidate of pool) {
                const entry = record(candidate);
                if (entry && text(entry.uid) === wanted)
                    return candidate;
                if ((!entry || !text(entry.uid)) && nameForms(candidate, helpers).includes(lower))
                    return candidate;
            }
        }
        return null;
    }
    function entryByKey(tournament, keyValue, helpers) {
        return tournament ? entryByKeyFromPools(tournament, text(keyValue), helpers) : null;
    }
    ScoreplaceWaitlist.entryByKey = entryByKey;
    function looksLikeUid(tournament, candidate) {
        for (const pool of [array(tournament.participants), array(tournament.standbyParticipants), array(tournament.waitlist)]) {
            for (const value of pool) {
                const entry = record(value);
                if (!entry)
                    continue;
                if ([entry.uid, entry.p1Uid, entry.p2Uid].some((uid) => text(uid) === candidate))
                    return true;
            }
        }
        return /^[A-Za-z0-9_-]{20,}$/.test(candidate);
    }
    /** Leitura única e ordenada dos três storages, sem índices órfãos. */
    function getWaitlist(tournament, helpers) {
        if (!tournament)
            return [];
        const output = [];
        const seen = new Set();
        const push = (entry, entryKey) => {
            if (!entryKey || seen.has(entryKey))
                return;
            seen.add(entryKey);
            output.push(entry);
        };
        const addText = (raw) => {
            const value = text(raw);
            if (!value)
                return;
            const existing = entryByKeyFromPools(tournament, value, helpers);
            if (existing) {
                push(existing, key(existing, helpers));
                return;
            }
            if (helpers.memberUidByName && helpers.memberUidByName(tournament, value))
                return;
            if (looksLikeUid(tournament, value))
                return;
            push({ name: value, displayName: value }, value);
        };
        const addEntry = (entry) => {
            if (!entry)
                return;
            if (typeof entry === 'string') {
                addText(entry);
                return;
            }
            push(entry, key(entry, helpers));
        };
        array(tournament.waitlist).forEach(addEntry);
        array(tournament.standbyParticipants).forEach(addEntry);
        const monarch = object(tournament.monarchWaitlist);
        if (monarch)
            Object.keys(monarch).forEach((category) => array(monarch[category]).forEach(addEntry));
        return output;
    }
    ScoreplaceWaitlist.getWaitlist = getWaitlist;
    function first(tournament, helpers, filter) {
        return getWaitlist(tournament, helpers).find((entry) => !filter || filter(entry)) || null;
    }
    ScoreplaceWaitlist.first = first;
    function pushBack(tournament, entry, helpers) {
        if (!tournament || !entry)
            return false;
        const standby = array(tournament.standbyParticipants);
        if (!Array.isArray(tournament.standbyParticipants))
            tournament.standbyParticipants = standby;
        const uids = helpers.participantUids(entry).filter(Boolean);
        const name = text(helpers.displayName(entry)).toLowerCase();
        const exists = getWaitlist(tournament, helpers).some((current) => {
            const currentUids = helpers.participantUids(current).filter(Boolean);
            if (uids.length && currentUids.length)
                return currentUids.some((uid) => uids.includes(uid));
            return Boolean(name) && text(helpers.displayName(current)).toLowerCase() === name;
        });
        if (exists)
            return false;
        standby.push(entry);
        return true;
    }
    ScoreplaceWaitlist.pushBack = pushBack;
    function removeByName(tournament, value, helpers) {
        if (!tournament)
            return false;
        const target = text(value).toLowerCase();
        if (!target)
            return false;
        let removed = false;
        const matches = (entry) => nameForms(entry, helpers).includes(target);
        for (const field of ['waitlist', 'standbyParticipants']) {
            if (!Array.isArray(tournament[field]))
                continue;
            const before = tournament[field].length;
            tournament[field] = tournament[field].filter((entry) => !matches(entry));
            if (tournament[field].length < before)
                removed = true;
        }
        const monarch = object(tournament.monarchWaitlist);
        if (monarch)
            Object.keys(monarch).forEach((category) => {
                if (!Array.isArray(monarch[category]))
                    return;
                const before = monarch[category].length;
                monarch[category] = monarch[category].filter((entry) => !matches(entry));
                if (monarch[category].length < before)
                    removed = true;
            });
        return removed;
    }
    ScoreplaceWaitlist.removeByName = removeByName;
    function removeByKey(tournament, keyValue, helpers) {
        if (!tournament)
            return false;
        const wanted = text(keyValue);
        if (!wanted)
            return false;
        const lower = wanted.toLowerCase();
        let removed = false;
        const matches = (entry) => {
            const objectEntry = record(entry);
            if (objectEntry && text(objectEntry.uid))
                return text(objectEntry.uid) === wanted;
            return nameForms(entry, helpers).includes(lower);
        };
        for (const field of ['waitlist', 'standbyParticipants']) {
            if (!Array.isArray(tournament[field]))
                continue;
            const before = tournament[field].length;
            tournament[field] = tournament[field].filter((entry) => !matches(entry));
            if (tournament[field].length < before)
                removed = true;
        }
        const monarch = object(tournament.monarchWaitlist);
        if (monarch)
            Object.keys(monarch).forEach((category) => {
                if (!Array.isArray(monarch[category]))
                    return;
                const before = monarch[category].length;
                monarch[category] = monarch[category].filter((entry) => {
                    const raw = text(entry);
                    return !(raw === wanted || raw.toLowerCase() === lower);
                });
                if (monarch[category].length < before)
                    removed = true;
            });
        return removed;
    }
    ScoreplaceWaitlist.removeByKey = removeByKey;
    function clear(tournament, helpers) {
        if (!tournament)
            return [];
        const collected = getWaitlist(tournament, helpers);
        tournament.waitlist = [];
        tournament.standbyParticipants = [];
        tournament.monarchWaitlist = {};
        return collected;
    }
    ScoreplaceWaitlist.clear = clear;
    function normalizeKey(tournament, item, helpers) {
        if (!tournament)
            return '';
        const raw = text(record(item) ? key(item, helpers) : item);
        if (!raw)
            return '';
        const direct = entryByKeyFromPools(tournament, raw, helpers);
        if (direct)
            return key(direct, helpers);
        return helpers.memberUidByName ? text(helpers.memberUidByName(tournament, raw)) : '';
    }
    ScoreplaceWaitlist.normalizeKey = normalizeKey;
    function nameSet(tournament, helpers) {
        const result = {};
        getWaitlist(tournament, helpers).forEach((entry) => {
            const name = text(helpers.displayName(entry)).toLowerCase();
            if (!name)
                return;
            name.split('/').map((part) => part.trim()).filter(Boolean).forEach((part) => { result[part] = 1; });
        });
        return result;
    }
    ScoreplaceWaitlist.nameSet = nameSet;
    function phaseDrawDone(tournament) {
        if (!tournament)
            return false;
        if (typeof tournament.hasDraw === 'boolean')
            return tournament.hasDraw;
        return array(tournament.matches).length > 0 || array(tournament.rounds).length > 0 || array(tournament.groups).length > 0;
    }
    ScoreplaceWaitlist.phaseDrawDone = phaseDrawDone;
    function enrollmentOpenState(tournament, nowMs) {
        if (!tournament)
            return { open: false, ligaOpen: false, sorteio: false, deadlinePassed: false };
        const format = text(tournament.format).toLowerCase();
        const isLiga = format === 'liga' || format === 'ranking';
        const ligaOpen = isLiga && tournament.ligaOpenEnrollment !== false && tournament.status !== 'finished';
        const sorteio = phaseDrawDone(tournament);
        const deadline = new Date(String(tournament.registrationLimit || '')).getTime();
        const deadlinePassed = Boolean(tournament.registrationLimit && Number.isFinite(deadline) && deadline < (typeof nowMs === 'number' ? nowMs : Date.now()));
        return { open: (tournament.status !== 'closed' && tournament.status !== 'finished' && !sorteio && !deadlinePassed) || ligaOpen, ligaOpen, sorteio, deadlinePassed };
    }
    ScoreplaceWaitlist.enrollmentOpenState = enrollmentOpenState;
    /** Quem ocupa confronto ou grupo da fase atual; folga nunca conta como jogo. */
    function isPlayingCurrentPhase(tournament, entry, helpers) {
        if (!tournament || !entry)
            return false;
        const uids = helpers.participantUids(entry).filter(Boolean);
        const name = text(helpers.displayName(entry)).toLowerCase();
        let uidHit = false;
        let nameHit = false;
        const checkUids = (values) => array(values).forEach((value) => {
            if (text(value) && uids.includes(text(value)))
                uidHit = true;
        });
        const checkNames = (values) => array(values).forEach((value) => {
            const candidate = text(value).toLowerCase();
            if (!candidate || !name)
                return;
            if (candidate === name || (candidate.includes(' / ') && candidate.split(' / ').some((part) => part.trim() === name)))
                nameHit = true;
        });
        const checkMatch = (value) => {
            const match = record(value);
            if (!match || match.isSitOut)
                return;
            checkUids(match.team1Uids);
            checkUids(match.team2Uids);
            checkUids([match.p1Uid, match.p2Uid]);
            checkNames([match.p1, match.p2]);
        };
        array(tournament.rounds).forEach((roundValue) => {
            const round = record(roundValue);
            if (!round)
                return;
            array(round.monarchGroups).forEach((groupValue) => {
                const group = record(groupValue);
                if (group) {
                    checkUids(group.playersUids);
                    checkNames(group.players);
                }
            });
            array(round.matches).forEach(checkMatch);
        });
        array(tournament.groups).forEach((groupValue) => {
            const group = record(groupValue);
            if (group) {
                checkUids(group.playersUids);
                checkNames(group.players);
            }
        });
        array(tournament.matches).forEach(checkMatch);
        return uids.length ? uidHit : nameHit;
    }
    ScoreplaceWaitlist.isPlayingCurrentPhase = isPlayingCurrentPhase;
})(ScoreplaceWaitlist || (ScoreplaceWaitlist = {}));
if (typeof module !== 'undefined' && module)
    module.exports = ScoreplaceWaitlist;
