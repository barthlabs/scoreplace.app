/* CICLO DE VIDA — OUTROS PARES DE FORMATO — node tests/phase-lifecycle-formats.test.js
 *
 * Estende phase-lifecycle.test.js (que só cobria Grupos→Elim) pros DEMAIS destinos de
 * formato + Rei/Rainha na ORIGEM. Materializa de VERDADE a próxima fase (materializeNextPhase
 * REAL, phases-engine.js via headless) a partir de uma fase 0 jogada, com mapeamento "todos
 * avançam" (rankTo:999) → invariante de conservação: TODO classificado da origem aparece na
 * próxima fase, exatamente 1x (ninguém some/duplica). Pares cobertos:
 *   • Grupos → Grupos      (round-robin em N grupos; bracket 'group')
 *   • Grupos → Pontos Corridos (liga estática; round-robin único C(n,2); bracket 'league')
 *   • Grupos → Rei/Rainha  (modo de sorteio: grupos de 4 rotativos; bracket 'monarch')
 *   • Rei/Rainha → Eliminatória (origem com modo de sorteio Rei/Rainha; classif. individual)
 */
const { E, window: W } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const cs = (g) => (g.players || []).map((p) => (typeof p === 'string' ? { name: p } : { name: p.name }));
const phaseMatches = (t) => (t.matches || []).filter((m) => (m.phaseIndex || 0) === 1);
function realsOf(ms) {
  const s = [];
  ms.forEach((m) => [m.p1, m.p2].concat(m.team1 || [], m.team2 || []).forEach((x) => {
    if (x && x !== 'TBD' && !/BYE/.test(x)) String(x).split(' / ').forEach((n) => { if (n) s.push(n.trim()); });
  }));
  return s;
}
const distinct = (a) => [...new Set(a)];
const eqSet = (a, b) => JSON.stringify(distinct(a).sort()) === JSON.stringify(b.slice().sort());
function names(n, pfx) { const a = []; for (let i = 1; i <= n; i++) a.push((pfx || 'P') + i); return a; }

// Origem = Grupos (1 grupo round-robin com todos os nomes; standings = ordem dos players).
function gruposOrigin(n, nextCfg) {
  const nm = names(n);
  return {
    id: 'go' + n + JSON.stringify(nextCfg).length, currentPhaseIndex: 0, matches: [],
    groups: [{ players: nm.map((x) => ({ name: x })), matches: [{ p1: nm[0], p2: nm[1], winner: nm[0] }] }],
    phases: [
      { name: 'G', formatCode: 'grupos_mata', source: { type: 'enrollment' } },
      Object.assign({ name: 'N', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] } }, nextCfg),
    ],
  };
}

// ── Grupos → Grupos ────────────────────────────────────────────────────────
[[8, 2, 12], [12, 3, 18]].forEach(([n, gc, expMatches]) => {
  const tag = `[Grupos→Grupos n=${n} grupos=${gc}]`;
  const t = gruposOrigin(n, { formatCode: 'grupos_mata', gruposCount: gc });
  const r = E.materializeNextPhase(t, cs, 'gg');
  ok(r.ok, tag + ' materializa');
  const ms = phaseMatches(t);
  ok(ms.length && ms.every((m) => m.bracket === 'group'), tag + ' todos bracket=group');
  ok(eqSet(realsOf(ms), names(n)), tag + ' conservação: todos os ' + n + ' avançam');
  // (round-robin → cada jogador repete em vários jogos de propósito; conservação+contagem fixam a estrutura)
  ok(distinct(ms.map((m) => m.groupIdx)).length === gc, tag + ' ' + gc + ' grupos gerados');
  ok(ms.length === expMatches, tag + ' nº de jogos round-robin = ' + expMatches + ' (got ' + ms.length + ')');
});

// ── Grupos → Pontos Corridos (liga estática) ───────────────────────────────
[[6, 15], [8, 28]].forEach(([n, expMatches]) => {
  const tag = `[Grupos→PontosCorridos n=${n}]`;
  const t = gruposOrigin(n, { formatCode: 'liga' });
  const r = E.materializeNextPhase(t, cs, 'gl');
  ok(r.ok, tag + ' materializa');
  const ms = phaseMatches(t);
  ok(ms.length && ms.every((m) => m.bracket === 'league'), tag + ' todos bracket=league');
  ok(ms.length === expMatches, tag + ' round-robin C(' + n + ',2) = ' + expMatches + ' jogos (got ' + ms.length + ')');
  ok(eqSet(realsOf(ms), names(n)), tag + ' conservação: todos os ' + n + ' na liga');
});

// ── Grupos → Rei/Rainha (modo de sorteio) ──────────────────────────────────
// Campanha kill-monarch-format: monarch na Fase N é rota league INCREMENTAL —
// materializeNextPhase devolve o pool (t.phaseRounds[1]) e a rodada REAL (grupos de
// 4 rotativos) é gerada pelo motor único via _phaseGenNextLeagueRound (que o
// advanceMultiPhase chama). O teste dirige exatamente esse ciclo.
[[8, 6], [12, 9]].forEach(([n, expMatches]) => {
  const tag = `[Grupos→ReiRainha n=${n}]`;
  const t = gruposOrigin(n, { formatCode: 'liga', drawMode: 'rei_rainha', reiRainha: true });
  const r = E.materializeNextPhase(t, cs, 'gm');
  ok(r.ok && r.incrementalLeague === true, tag + ' materializa (rota league incremental)');
  ok(t.phaseRounds && t.phaseRounds[1] && (t.phaseRounds[1].pool || []).length === n, tag + ' pool de ' + n + ' em t.phaseRounds[1]');
  ok(W._phaseGenNextLeagueRound(t, 1) === true, tag + ' 1ª rodada gerada pelo motor único');
  const st = t.phaseRounds[1];
  const rd0 = (st.rounds && st.rounds[0]) || {};
  const ms = (rd0.matches || []).filter((m) => !m.isSitOut);
  ok(ms.length && ms.every((m) => m.isMonarch && (m.phaseIndex || 0) === 1), tag + ' todos isMonarch taggeados na fase 1');
  ok(ms.length === expMatches, tag + ' floor(n/4)×3 = ' + expMatches + ' jogos (parceiros rotativos) [' + ms.length + ']');
  ok((rd0.monarchGroups || []).length === n / 4, tag + ' monarchGroups: ' + (n / 4) + ' grupos de 4');
  ok(eqSet(realsOf(ms), names(n)), tag + ' conservação: todos os ' + n + ' (múltiplo de 4)');
});

// ── Rei/Rainha → Eliminatória (origem com modo Rei/Rainha) ─────────────────
function monarchOrigin(nGroups) {
  const rounds = [{ monarchGroups: [] }];
  const all = [];
  for (let g = 0; g < nGroups; g++) {
    const nm = ['G' + g + 'a', 'G' + g + 'b', 'G' + g + 'c', 'G' + g + 'd'];
    all.push.apply(all, nm);
    rounds[0].monarchGroups.push({
      name: 'Grupo ' + String.fromCharCode(65 + g), groupIdx: g, players: nm.map((x) => ({ name: x })),
      matches: [{ isMonarch: true, team1: [nm[0], nm[1]], team2: [nm[2], nm[3]],
        winner: nm[0] + ' / ' + nm[1], p1: nm[0] + ' / ' + nm[1], p2: nm[2] + ' / ' + nm[3] }],
    });
  }
  return {
    t: {
      id: 'mo' + nGroups, currentPhaseIndex: 0, matches: [], rounds: rounds,
      phases: [
        { name: 'RR', drawMode: 'rei_rainha', formatCode: 'liga', source: { type: 'enrollment' } },
        { name: 'E', formatCode: 'elim_simples', fixedPairs: false, source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] } },
      ],
    },
    all,
  };
}
[1, 2].forEach((nGroups) => {
  const tag = `[ReiRainha→Elim grupos=${nGroups}]`;
  const { t, all } = monarchOrigin(nGroups);
  const r = E.materializeNextPhase(t, cs, 'me');
  ok(r.ok, tag + ' materializa');
  const ms = phaseMatches(t);
  ok(ms.length && ms.every((m) => m.bracket === 'main'), tag + ' eliminatória (bracket main)');
  ok(eqSet(realsOf(ms), all), tag + ' conservação: os ' + all.length + ' indivíduos entram na chave (classif. individual)');
  ok(distinct(realsOf(ms)).length === realsOf(ms).length, tag + ' sem duplicata na chave');
});

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-lifecycle-formats: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
