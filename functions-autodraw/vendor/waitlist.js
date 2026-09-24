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
    /**
     * Chave persistida: uid → id do inscrito MANUAL → nome do convidado legado.
     *
     * ⛔⛔ O NOME É A ÚLTIMA TENTATIVA, NUNCA A PREFERIDA (24/set/2026).
     * O inscrito manual (fictício, sem conta) nasce com `manualParticipantId`
     * (tournaments-enrollment.js). Enquanto a chave caía direto no nome, dois manuais
     * HOMÔNIMOS colapsavam num só: sumiam um do outro na fila e compartilhavam um único
     * número de inscrição. É o mesmo casamento por nome que o uid veio matar — e ele
     * sobrevivia aqui porque quem não tem conta não tem uid.
     * Nome segue valendo para entrada LEGADA, que não tem nenhum dos dois.
     * [[feedback_uid_controls_everything_name_only_ficticio]]
     */
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
        const manual = text(entry.manualParticipantId);
        if (manual)
            return manual;
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
                // ⛔ o id do manual vem ANTES do nome, pela mesma razão de `key()`
                if (entry && !text(entry.uid) && text(entry.manualParticipantId) === wanted)
                    return candidate;
                if ((!entry || (!text(entry.uid) && !text(entry.manualParticipantId))) &&
                    nameForms(candidate, helpers).includes(lower))
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
    function getWaitlistWithSource(tournament, helpers) {
        if (!tournament)
            return [];
        const output = [];
        const seen = new Set();
        const push = (entry, entryKey, source) => {
            if (!entryKey || seen.has(entryKey))
                return;
            seen.add(entryKey);
            output.push({ entry: entry, source: source });
        };
        const addText = (raw, source) => {
            const value = text(raw);
            if (!value)
                return;
            const existing = entryByKeyFromPools(tournament, value, helpers);
            if (existing) {
                push(existing, key(existing, helpers), source);
                return;
            }
            if (helpers.memberUidByName && helpers.memberUidByName(tournament, value))
                return;
            if (looksLikeUid(tournament, value))
                return;
            push({ name: value, displayName: value }, value, source);
        };
        const addEntry = (entry, source) => {
            if (!entry)
                return;
            if (typeof entry === 'string') {
                addText(entry, source);
                return;
            }
            push(entry, key(entry, helpers), source);
        };
        array(tournament.waitlist).forEach((e) => addEntry(e, 'waitlist'));
        array(tournament.standbyParticipants).forEach((e) => addEntry(e, 'standbyParticipants'));
        const monarch = object(tournament.monarchWaitlist);
        if (monarch) {
            Object.keys(monarch).forEach((category) => array(monarch[category]).forEach((e) => addEntry(e, 'monarchWaitlist')));
        }
        return output;
    }
    ScoreplaceWaitlist.getWaitlistWithSource = getWaitlistWithSource;
    const numberOrNull = (value) => {
        if (value == null || value === '')
            return null;
        const n = Number(value);
        return isFinite(n) ? n : null;
    };
    /** Uma entrada é DUPLA quando tem os dois lados, por uid OU por nome. */
    const isPair = (entry) => Boolean((text(entry.p1Uid) || text(entry.p1Name)) && (text(entry.p2Uid) || text(entry.p2Name)));
    /** Chave de UM lado da dupla — mesma ordem de `key()`: uid → manual → nome. */
    const sideKey = (entry, n) => text(entry['p' + n + 'Uid']) || text(entry['p' + n + 'ManualId']) || text(entry['p' + n + 'Name']);
    /**
     * Todas as pessoas da fila, na ordem canônica `participants` → espera, já deduplicadas
     * por `key()`, cada uma com TODOS os seus locators.
     *
     * ⛔ Conflito de sequência: quando duas cópias da mesma pessoa têm números DIFERENTES,
     * vence a MENOR — é a que corresponde à chegada real. A outra NÃO é sobrescrita:
     * reescrever sequência já gravada para acertar exibição é perder dado. O conflito fica
     * visível para uma leva de reparo, se o dono quiser.
     */
    function enumerateEnrollQueue(tournament, helpers) {
        if (!tournament)
            return [];
        const byKey = new Map();
        const ordem = { n: 0 };
        const add = (k, seq, locator, source) => {
            if (!k)
                return;
            let pessoa = byKey.get(k);
            if (!pessoa) {
                pessoa = { key: k, seq: null, order: ordem.n++, locators: [], source: source };
                byKey.set(k, pessoa);
            }
            if (locator)
                pessoa.locators.push(locator);
            // primeira sequência NÃO NULA; entre duas não nulas, a MENOR
            if (seq != null && (pessoa.seq == null || seq < pessoa.seq))
                pessoa.seq = seq;
        };
        const visita = (raw, storage, index, category, source) => {
            if (typeof raw === 'string') {
                /* Texto solto: pode ser o espelho de alguém que TEM entrada real. Se casar, o
                 * número vai no objeto real; se for órfão, entra sem locator — fica como índice
                 * de exibição e nada é gravado, que é o contrato de hoje. */
                const existente = entryByKeyFromPools(tournament, text(raw), helpers);
                if (existente) {
                    add(key(existente, helpers), null, null, source);
                    return;
                }
                add(text(raw), null, null, source);
                return;
            }
            const entry = record(raw);
            if (!entry)
                return;
            if (isPair(entry)) {
                add(sideKey(entry, 1), numberOrNull(entry.p1Seq), { storage, index, category, seqField: 'p1Seq' }, source);
                add(sideKey(entry, 2), numberOrNull(entry.p2Seq), { storage, index, category, seqField: 'p2Seq' }, source);
                return;
            }
            add(key(entry, helpers), numberOrNull(entry.enrollSeq), { storage, index, category, seqField: 'enrollSeq' }, source);
        };
        array(tournament.participants).forEach((e, i) => visita(e, 'participants', i, undefined, 'participants'));
        array(tournament.waitlist).forEach((e, i) => visita(e, 'waitlist', i, undefined, 'waitlist'));
        array(tournament.standbyParticipants).forEach((e, i) => visita(e, 'standbyParticipants', i, undefined, 'standbyParticipants'));
        const monarchQ = object(tournament.monarchWaitlist);
        if (monarchQ)
            Object.keys(monarchQ).forEach((category) => {
                array(monarchQ[category]).forEach((e, i) => visita(e, 'monarchWaitlist', i, category, 'monarchWaitlist'));
            });
        return [...byKey.values()].sort((a, b) => a.order - b.order);
    }
    ScoreplaceWaitlist.enumerateEnrollQueue = enumerateEnrollQueue;
    /**
     * Materializa os números que faltam, na ordem da fila, e devolve quais storages foram
     * tocados. Operação PURA sobre o objeto do torneio — serve o navegador e o servidor.
     *
     * ⛔ Mora aqui, e não no `store.js`, porque o autoDraw roda no servidor e só enxerga o
     * vendor deste módulo. Duas implementações = cliente e servidor numerando diferente.
     * ⛔ O novo número é sempre MAIOR que todos os já usados: quem chega depois nunca pega
     * um número baixo deixado por quem saiu. Fechar a lacuna é papel do rank denso na
     * exibição, não da alocação.
     */
    function allocateEnrollSeqs(tournament, helpers) {
        if (!tournament)
            return [];
        const fila = enumerateEnrollQueue(tournament, helpers);
        let maior = 0;
        fila.forEach((p) => { if (p.seq != null && p.seq > maior)
            maior = p.seq; });
        const tocados = new Set();
        const escreve = (loc, valor) => {
            const lista = loc.category
                ? array((object(tournament.monarchWaitlist) || {})[loc.category])
                : array(tournament[loc.storage]);
            const alvo = record(lista[loc.index]);
            if (!alvo)
                return;
            alvo[loc.seqField] = valor;
            tocados.add(loc.storage);
        };
        fila.forEach((pessoa) => {
            if (!pessoa.locators.length)
                return; // resíduo textual: não se grava
            if (pessoa.seq == null) {
                pessoa.seq = ++maior;
            }
            pessoa.locators.forEach((loc) => {
                const lista = loc.category
                    ? array((object(tournament.monarchWaitlist) || {})[loc.category])
                    : array(tournament[loc.storage]);
                const alvo = record(lista[loc.index]);
                if (!alvo)
                    return;
                // ⛔ não sobrescreve número já gravado (ver o conflito em `enumerateEnrollQueue`)
                if (numberOrNull(alvo[loc.seqField]) == null)
                    escreve(loc, pessoa.seq);
            });
        });
        return [...tocados];
    }
    ScoreplaceWaitlist.allocateEnrollSeqs = allocateEnrollSeqs;
    /** Leitura única e ordenada dos três storages, sem índices órfãos. */
    function getWaitlist(tournament, helpers) {
        return getWaitlistWithSource(tournament, helpers).map((sourced) => sourced.entry);
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
        /* ⛔ O id do MANUAL entra aqui pela mesma razão de `key()`: sem ele, devolver à fila
         * dois fictícios homônimos guardava só o primeiro — o segundo sumia calado. */
        const manual = text(record(entry) ? record(entry).manualParticipantId : '');
        const exists = getWaitlist(tournament, helpers).some((current) => {
            const currentUids = helpers.participantUids(current).filter(Boolean);
            if (uids.length && currentUids.length)
                return currentUids.some((uid) => uids.includes(uid));
            const currentManual = text(record(current) ? record(current).manualParticipantId : '');
            if (manual || currentManual)
                return Boolean(manual) && manual === currentManual;
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
        return { open: (tournament.status !== 'closed' && tournament.status !== 'finished' && !sorteio && !deadlinePassed) || !!ligaOpen, ligaOpen, sorteio, deadlinePassed };
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
