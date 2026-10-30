"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { cleanParticipantTournament } = require("../functions/delete-account-tournament-core");

const root = path.join(__dirname, "..");
const caller = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
const block = caller.slice(caller.indexOf("// 2) Torneios em que ela PARTICIPA"),
  caller.indexOf("// 3a) Inscrições canônicas"));
assert.match(block, /await cleanParticipantTournament\(/);
assert.doesNotMatch(block, /doc\.ref\.set\(next\)/);
assert.doesNotMatch(block, /\.catch\(/);
assert.ok(block.indexOf("if (outcome === \"anonymized\")") > block.indexOf("await cleanParticipantTournament("));
const cleanupPosition = caller.indexOf("await cleanParticipantTournament(", caller.indexOf("// 2) Torneios em que ela PARTICIPA"));
const tombstonePosition = caller.indexOf('await db.collection("users").doc(uid).set({\n      deleted: true', cleanupPosition);
const authDeletePosition = caller.indexOf('await admin.auth().deleteUser(uid)', tombstonePosition);
assert(cleanupPosition >= 0 && tombstonePosition > cleanupPosition && authDeletePosition > tombstonePosition,
  "falha na limpeza de torneio não pode apagar a conta ou o login antes do retry");

const deps = {
  findUidPaths: (value, uid) => JSON.stringify(value).includes(uid) ? ["uid"] : [],
  hasPlayedMatches: (value) => value.played === true,
  anonymizeEntries: (value) => Object.assign({}, value, { anonymized: true }),
  stripNamesInMatches: (value) => Object.assign({}, value, { namesStripped: true }),
  purgeUidEverywhere: (value, uid) => Object.assign({}, value, { otherUid: null, purgeRan: uid }),
  nowIso: "2026-10-29T00:00:00.000Z",
};

(async () => {
  const ref = { id: "tour_test" };
  let current = { participants: [{ uid: "alvo" }], memberUids: ["alvo"], phaseGroupStandings: { "0": [1] } };
  let reads = 0;
  const db = {
    runTransaction: async (fn) => {
      let staged;
      const tx = {
        get: async () => { reads++; return { exists: true, data: () => structuredClone(current) }; },
        set: (_ref, value) => { staged = value; },
      };
      const result = await fn(tx);
      if (staged) current = staged;
      return result;
    },
  };
  // O retrato chegou depois do censo; a transação precisa lê-lo, não regravar a foto antiga.
  assert.equal(await cleanParticipantTournament(db, ref, "alvo", deps), "left");
  assert.deepEqual(current.phaseGroupStandings, { "0": [1] });
  assert.equal(current.participants.length, 0);
  assert.deepEqual(current.memberUids, []);
  assert.equal(reads, 1);

  current = { participants: [{ uid: "alvo" }], memberUids: ["alvo"], played: true,
    phaseGroupStandings: { "0": [2] } };
  assert.equal(await cleanParticipantTournament(db, ref, "alvo", deps), "anonymized");
  assert.deepEqual(current.phaseGroupStandings, { "0": [2] });
  assert.equal(current.anonymized, true);
  assert.equal(current.namesStripped, true);

  // Simula retry: a primeira tentativa não comita; a segunda relê o novo retrato.
  current = { participants: [{ uid: "alvo" }], memberUids: ["alvo"], phaseGroupStandings: { "0": [3] } };
  db.runTransaction = async (fn) => {
    let last;
    for (let attempt = 0; attempt < 2; attempt++) {
      let staged;
      last = await fn({ get: async () => ({ exists: true, data: () => structuredClone(current) }),
        set: (_ref, value) => { staged = value; } });
      if (attempt === 0) { current.phaseGroupStandings = { "0": [4] }; continue; }
      current = staged;
    }
    return last;
  };
  assert.equal(await cleanParticipantTournament(db, ref, "alvo", deps), "left");
  assert.deepEqual(current.phaseGroupStandings, { "0": [4] });

  let attempts = 0;
  db.runTransaction = async (fn) => {
    for (let i = 0; i < 3; i++) {
      attempts++;
      await fn({ get: async () => ({ exists: true, data: () => structuredClone(current) }), set: () => {} });
    }
    throw new Error("transaction-aborted");
  };
  await assert.rejects(cleanParticipantTournament(db, ref, "alvo", deps), /transaction-aborted/);
  assert.equal(attempts, 3);
  assert.deepEqual(current.phaseGroupStandings, { "0": [4] });
  console.log("✅ delete-account-tournament-transaction");
})().catch((error) => { console.error(error); process.exitCode = 1; });
