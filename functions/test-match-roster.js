// Teste PURO da lógica de roster da CF syncMatchRosters (project_match_result_docs
// inc 3b). Sem Firebase — só a matemática de computeRosterChanges. Rodar:
//   node functions/test-match-roster.js
const { collectMatches, matchRoster, slotUids, computeRosterChanges, rosterKey, buildSeedDoc, subdocSignature, buildMirrorDoc } = require("./match-roster");

let pass = 0, fail = 0;
function ok(c, msg) { if (c) { pass++; console.log("  ✓ " + msg); } else { fail++; console.error("  ✗ " + msg); } }
function eqArr(a, b, msg) { ok(rosterKey(a) === rosterKey(b), msg + " (got " + JSON.stringify(a) + ")"); }

const parts = [
  { uid: "uA", displayName: "A" },
  { uid: "uB", displayName: "B" },
  { uid: "uC", displayName: "C" },
  { uid: "uD", displayName: "D" },
  { uid: "uX", displayName: "X" }, { uid: "uY", displayName: "Y" }, // dupla "X / Y"
];

// ── matchRoster: solo, dupla-entrada, TBD/BYE ──
console.log("──── matchRoster ────");
const tSolo = { participants: parts, matches: [{ id: "m1", p1: "A", p2: "B" }] };
eqArr(matchRoster(tSolo, tSolo.matches[0]), ["uA", "uB"], "solo p1/p2 → [uA,uB]");
const tPair = { participants: parts.concat([{ uid: "uXY", displayName: "X / Y" }]), matches: [{ id: "m2", p1: "X / Y", p2: "C" }] };
eqArr(matchRoster(tPair, tPair.matches[0]), ["uXY", "uC"], "dupla registrada 'X / Y' → entrada inteira [uXY,uC]");
const tSplit = { participants: parts, matches: [{ id: "m3", p1: "X / Y", p2: "D" }] };
eqArr(matchRoster(tSplit, tSplit.matches[0]), ["uX", "uY", "uD"], "dupla via split de solos → [uX,uY,uD]");
eqArr(matchRoster(tSolo, { p1: "TBD", p2: "BYE" }), [], "TBD/BYE → []");

// ── computeRosterChanges: AVANÇO (o coração do inc 3b) ──
console.log("──── computeRosterChanges: avanço ────");
const before = {
  participants: parts,
  matches: [
    { id: "semi1", p1: "A", p2: "B", nextMatchId: "final" },
    { id: "semi2", p1: "C", p2: "D", nextMatchId: "final" },
    { id: "final", p1: "TBD", p2: "TBD" },
  ],
};
// A venceu semi1 → avançou pra final.p1
const after1 = JSON.parse(JSON.stringify(before));
after1.matches[0].winner = "A"; after1.matches[2].p1 = "A";
const ch1 = computeRosterChanges(before, after1);
ok(ch1.length === 1 && ch1[0].id === "final", "só o jogo downstream (final) mudou de roster");
eqArr(ch1[0].roster, ["uA"], "final ganhou roster [uA] (semi1 estável, não entra)");

// C venceu semi2 → final.p2 = C (final agora A vs C)
const after2 = JSON.parse(JSON.stringify(after1));
after2.matches[1].winner = "C"; after2.matches[2].p2 = "C";
const ch2 = computeRosterChanges(after1, after2);
ok(ch2.length === 1 && ch2[0].id === "final", "segundo avanço: só final muda de novo");
eqArr(ch2[0].roster, ["uA", "uC"], "final agora [uA,uC]");

// ── nenhuma mudança de roster (ex.: só placar) → zero changes (barato) ──
console.log("──── sem mudança de roster ────");
const afterScoreOnly = JSON.parse(JSON.stringify(after2));
afterScoreOnly.matches[2].winner = "A"; afterScoreOnly.matches[2].scoreP1 = 6; afterScoreOnly.matches[2].scoreP2 = 3;
ok(computeRosterChanges(after2, afterScoreOnly).length === 0, "só placar mudou (roster igual) → 0 changes → CF sai barato");

// ── dupla eliminatória: loser cai na chave inferior ──
console.log("──── dupla elim: loserMatchId ────");
const beforeDE = {
  participants: parts,
  format: "Dupla Eliminatória",
  matches: [
    { id: "u1", p1: "A", p2: "B", nextMatchId: "u2", loserMatchId: "l1" },
    { id: "l1", p1: "TBD", p2: "TBD" },
  ],
};
const afterDE = JSON.parse(JSON.stringify(beforeDE));
afterDE.matches[0].winner = "A"; afterDE.matches[1].p1 = "B"; // loser B cai em l1
const chDE = computeRosterChanges(beforeDE, afterDE);
ok(chDE.length === 1 && chDE[0].id === "l1", "loser drop: l1 mudou de roster");
eqArr(chDE[0].roster, ["uB"], "l1 ganhou o perdedor [uB]");

// ── buildSeedDoc: migração (playerUids + campos de resultado presentes) ──
console.log("──── buildSeedDoc (migração) ────");
const tSeed = { participants: parts, matches: [
  { id: "m1", p1: "A", p2: "B", winner: "A", scoreP1: 6, scoreP2: 3, resultAt: 111, draw: undefined },
  { id: "m2", p1: "C", p2: "D" }, // sem resultado ainda
] };
const seed1 = buildSeedDoc(tSeed, tSeed.matches[0]);
ok(seed1.matchId === "m1" && seed1.winner === "A" && seed1.scoreP1 === 6, "seed copia campos de resultado presentes");
eqArr(seed1.playerUids, ["uA", "uB"], "seed inclui roster [uA,uB]");
ok(!("draw" in seed1), "seed OMITE campo undefined (draw)");
const seed2 = buildSeedDoc(tSeed, tSeed.matches[1]);
ok(!("winner" in seed2) && seed2.playerUids.length === 2, "jogo sem resultado → seed só com matchId+roster");

// ── subdocSignature + buildMirrorDoc: espelho de resultado (all-paths) ──
console.log("──── subdocSignature / buildMirrorDoc ────");
const tW = { participants: parts, matches: [{ id: "m1", p1: "A", p2: "B", winner: "A", scoreP1: 6, scoreP2: 3 }] };
const sigAB_win = subdocSignature(buildSeedDoc(tW, tW.matches[0]));
// mesmo estado no subdoc → assinatura igual (idempotente, CF não reescreve).
// Inclui p1/p2 (display) que agora fazem parte do espelho; ignora tournamentId/updatedAt.
ok(subdocSignature({ playerUids: ["uA", "uB"], winner: "A", scoreP1: 6, scoreP2: 3, p1: "A", p2: "B", tournamentId: "x", updatedAt: "y" }) === sigAB_win, "subdocSignature ignora tournamentId/updatedAt → idempotência");
// W.O.: winner setado sem placar → assinatura muda vs sem winner
const tNoRes = { participants: parts, matches: [{ id: "m1", p1: "A", p2: "B" }] };
ok(subdocSignature(buildSeedDoc(tNoRes, tNoRes.matches[0])) !== sigAB_win, "estado sem resultado ≠ estado com winner (CF detecta mudança)");
const tWO = { participants: parts, matches: [{ id: "m1", p1: "A", p2: "B", winner: "A", wo: true, woAbsentSide: "p2" }] };
const woDoc = buildMirrorDoc(tWO, tWO.matches[0], "T1", "2026-01-01");
ok(woDoc.winner === "A" && woDoc.wo === true && woDoc.woAbsentSide === "p2", "buildMirrorDoc espelha campos de W.O.");
ok(woDoc.tournamentId === "T1" && woDoc.updatedAt === "2026-01-01" && woDoc.matchId === "m1", "buildMirrorDoc inclui tournamentId/updatedAt/matchId");
eqArr(woDoc.playerUids, ["uA", "uB"], "buildMirrorDoc inclui roster");
// reverter/refazer: match sem winner → mirror sem winner (set-sem-merge remove no subdoc)
const cleared = buildMirrorDoc(tNoRes, tNoRes.matches[0], "T1", "z");
ok(!("winner" in cleared) && !("scoreP1" in cleared), "buildMirrorDoc de match zerado OMITE resultado (clobber remove no subdoc)");

// ── DISPLAY_FIELDS: contexto de exibição denormalizado (Fase B) ──
console.log("──── contexto de exibição (Fase B) ────");
const tDisp = { name: "Copa Teste", participants: parts, matches: [
  { id: "m1", p1: "A", p2: "X / Y", winner: "A", scoreP1: 6, scoreP2: 4, label: "Final" },
  { id: "m2", p1: "TBD", p2: "TBD" }, // sem nomes ainda
] };
const d1 = buildSeedDoc(tDisp, tDisp.matches[0]);
ok(d1.p1 === "A" && d1.p2 === "X / Y", "seed denormaliza p1/p2 (nomes dos lados)");
ok(d1.tournamentName === "Copa Teste", "seed denormaliza tournamentName");
ok(d1.roundLabel === "Final", "seed denormaliza roundLabel (m.label)");
const d2 = buildSeedDoc(tDisp, tDisp.matches[1]);
ok(!("p1" in d2) && !("roundLabel" in d2) && d2.tournamentName === "Copa Teste", "TBD → sem p1/roundLabel, mas com tournamentName");
// assinatura sensível ao contexto de exibição (CF re-espelha quando p1/p2 mudam)
const sigBefore = subdocSignature(buildSeedDoc(tDisp, tDisp.matches[1]));
tDisp.matches[1].p1 = "A"; // avanço preenche o nome
ok(subdocSignature(buildSeedDoc(tDisp, tDisp.matches[1])) !== sigBefore, "assinatura muda quando p1 (nome) é preenchido → CF re-espelha");
// buildMirrorDoc carrega o contexto de exibição
const mir = buildMirrorDoc(tDisp, tDisp.matches[0], "T9", "2026-02-02");
ok(mir.p1 === "A" && mir.tournamentName === "Copa Teste" && mir.roundLabel === "Final", "buildMirrorDoc inclui contexto de exibição");

// ── IDENTIDADE POR uid do SLOT (v4.5.74) — a brecha de authz que fecha aqui ──
// A regressão: com o reconcile de nome removido (v4.5.73), resolver o roster por
// NOME libera a pessoa ERRADA em caso de homônimo, e BLOQUEIA quando o nome
// diverge. O slot carrega o uid canônico (team*Uids / p*Uid / team*Obj) — ler
// dele resolve certo. Fallback por nome só quando o slot NÃO tem uid (guest/legado).
console.log("──── roster por uid do slot (homônimo + legado) ────");

// Reproduz a LÓGICA VELHA (só por nome) pra provar que ela erra o homônimo.
function oldMatchRosterByName(t, m) {
  const ps = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  const seen = {};
  ["p1", "p2"].forEach((side) => {
    const entry = m[side];
    if (!entry || entry === "TBD" || entry === "BYE") return;
    const p = ps.find((pp) => typeof pp === "object" && (pp.displayName || pp.name || "") === entry);
    if (p) { (p.uid ? [p.uid] : []).forEach((u) => { if (u) seen[u] = 1; }); return; }
  });
  return Object.keys(seen);
}

// HOMÔNIMO: dois uids, MESMO displayName "João". O slot aponta pro SEGUNDO (uJ2).
const homParts = [
  { uid: "uJ1", displayName: "João" },
  { uid: "uJ2", displayName: "João" },
  { uid: "uZ", displayName: "Zé" },
];
const tHom = { participants: homParts, matches: [{ id: "h1", p1: "João", p2: "Zé", p1Uid: "uJ2", p2Uid: "uZ" }] };
// velho (por nome) casa o PRIMEIRO João = uJ1 → ERRADO (libera a pessoa errada)
eqArr(oldMatchRosterByName(tHom, tHom.matches[0]), ["uJ1", "uZ"], "VELHO (por nome) casa o homônimo ERRADO (uJ1)");
ok(rosterKey(oldMatchRosterByName(tHom, tHom.matches[0])) !== rosterKey(["uJ2", "uZ"]), "VELHO NÃO bate o uid certo do slot (uJ2) — a falha");
// novo (por uid do slot) casa o CERTO = uJ2
eqArr(matchRoster(tHom, tHom.matches[0]), ["uJ2", "uZ"], "NOVO (por uid do slot) casa o homônimo CERTO (uJ2)");

// NOME DIVERGENTE: cache de display velho ("João Antigo") não existe mais nos
// participantes, mas o slot ainda carrega o uid → velho BLOQUEIA, novo resolve.
const tDiv = { participants: homParts, matches: [{ id: "d1", p1: "João Antigo", p2: "Zé", p1Uid: "uJ2", p2Uid: "uZ" }] };
eqArr(oldMatchRosterByName(tDiv, tDiv.matches[0]), ["uZ"], "VELHO perde o lado com nome divergente (só uZ) — bloquearia o outro");
eqArr(matchRoster(tDiv, tDiv.matches[0]), ["uJ2", "uZ"], "NOVO resolve o lado divergente pelo uid do slot (uJ2)");

// DUPLA por team*Uids (identidade estrutural da dupla no slot).
const tTeam = { participants: homParts, matches: [{ id: "t1", p1: "João / Zé", p2: "BYE", team1Uids: ["uJ2", "uZ"] }] };
eqArr(matchRoster(tTeam, tTeam.matches[0]), ["uJ2", "uZ"], "dupla por team1Uids → [uJ2,uZ] (p2 BYE ignorado)");
eqArr(slotUids(tTeam.matches[0], "p1"), ["uJ2", "uZ"], "slotUids lê team1Uids direto");

// team*Obj (objeto participante embutido no slot).
const tObj = { participants: homParts, matches: [{ id: "o1", p1: "Dupla", p2: "Zé", team1Obj: { p1Uid: "uJ1", p2Uid: "uJ2" }, p2Uid: "uZ" }] };
eqArr(matchRoster(tObj, tObj.matches[0]), ["uJ1", "uJ2", "uZ"], "team1Obj resolve via participantUids (p1Uid+p2Uid) + p2 por uid");

// LEGADO/GUEST: slot SEM nenhum uid → cai no fallback por nome e continua autorizando.
const tLegacy = { participants: parts, matches: [{ id: "leg1", p1: "A", p2: "B" }] };
eqArr(matchRoster(tLegacy, tLegacy.matches[0]), ["uA", "uB"], "slot sem uid (legado) → fallback por nome mantém [uA,uB]");
// GUEST sem conta: nome não casa participante nenhum → roster vazio (sem authz), esperado.
const tGuest = { participants: parts, matches: [{ id: "g1", p1: "Convidado Sem Conta", p2: "A" }] };
eqArr(matchRoster(tGuest, tGuest.matches[0]), ["uA"], "guest sem conta (sem uid, sem match de nome) → só o lado com conta [uA]");

console.log("════════════════════════════════════════");
console.log((fail === 0 ? "✅" : "❌") + " match-roster: " + pass + " ok, " + fail + " falharam");
process.exit(fail ? 1 : 0);
