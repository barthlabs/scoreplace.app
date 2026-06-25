// test-draw.js — valida que o autoDraw server-side gera rodadas Rei/Rainha
// corretas (duplas, grupos de 4, parceiros rotativos, folgas justas), igual
// ao cliente. Roda: `node test-draw.js`. Exit 0 = tudo ok, 1 = falha.

const { generateLigaRound } = require('./draw-core.js');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); failures++; }
  else console.log('  ✓ ' + msg);
}

// Mock de torneio com a config real do Ranking Confra 2026.
function mkConfra(n) {
  const parts = [];
  for (let i = 1; i <= n; i++) {
    parts.push({ uid: 'u' + i, displayName: 'Jogador ' + i, name: 'Jogador ' + i, ligaActive: true });
  }
  return {
    id: 'mock-confra', name: 'Ranking Confra 2026', format: 'Liga',
    ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', ligaDrawMode: 'standard',
    equilibrado: true, clusterSize: 16, balanceBy: 'individual', temporada: true,
    teamSize: 2, gameTypes: 'duplas', enrollmentMode: 'individual',
    combinedCategories: [], participants: parts, rounds: [], standings: [],
  };
}

function validateRound(round, n, label) {
  console.log('\n[' + label + '] n=' + n);
  const r = generateLigaRound(round, new Date('2026-06-14T19:00:00-03:00'));
  assert(r.ok, 'sorteio gerou rodada (reason=' + (r.reason || 'ok') + ')');
  if (!r.ok) return null;
  const col = round.rounds[round.rounds.length - 1];
  const matches = col.matches || [];
  const groups = col.monarchGroups || [];
  const real = matches.filter(m => !m.isSitOut && !m.isBye);
  const sitouts = matches.filter(m => m.isSitOut);

  const expectedGroups = Math.floor((n - (n % 4)) / 4);
  assert(groups.length === expectedGroups, 'grupos = ' + expectedGroups + ' (got ' + groups.length + ')');
  assert(real.length === expectedGroups * 3, 'jogos reais = grupos×3 = ' + (expectedGroups * 3) + ' (got ' + real.length + ')');
  // Desde v2.6.99: a sobra do agrupamento por 4 NÃO vira folga — vira lista de
  // espera (t.monarchWaitlist por categoria). Logo, zero folgas e n%4 na fila.
  assert(sitouts.length === 0, 'sem folgas — sobra vai pra lista de espera (got ' + sitouts.length + ')');
  const wl = (round.monarchWaitlist && round.monarchWaitlist['_default_']) || [];
  assert(wl.length === (n % 4), 'lista de espera = n%4 = ' + (n % 4) + ' (got ' + wl.length + ')');

  // Toda partida real precisa ser 2×2 com 4 jogadores distintos (NUNCA 1×1).
  let bad = 0, oneVone = 0;
  real.forEach(m => {
    if (!Array.isArray(m.team1) || !Array.isArray(m.team2)) { oneVone++; return; }
    if (m.team1.length !== 2 || m.team2.length !== 2) { bad++; return; }
    const set = new Set([...m.team1, ...m.team2]);
    if (set.size !== 4) bad++;
  });
  assert(oneVone === 0, 'NENHUM jogo 1×1 na categoria duplas (got ' + oneVone + ' singles)');
  assert(bad === 0, 'todas as duplas válidas (2 jogadores distintos × 2) — defeitos: ' + bad);

  // Todo grupo: exatamente 4 jogadores e 3 jogos com parceiros rotativos.
  let groupsOk = 0;
  groups.forEach(grp => {
    if (grp.players.length === 4 && grp.matches.length === 3) {
      const [A, B, C, D] = grp.players;
      const labels = grp.matches.map(m => m.p1 + ' vs ' + m.p2);
      // AB×CD, AC×BD, AD×BC
      const want = [
        [A, B].join(' / ') + ' vs ' + [C, D].join(' / '),
        [A, C].join(' / ') + ' vs ' + [B, D].join(' / '),
        [A, D].join(' / ') + ' vs ' + [B, C].join(' / '),
      ];
      if (JSON.stringify(labels) === JSON.stringify(want)) groupsOk++;
    }
  });
  assert(groupsOk === groups.length, 'todos os ' + groups.length + ' grupos com parceiros rotativos AB×CD/AC×BD/AD×BC (ok: ' + groupsOk + ')');

  // Cada jogador aparece em no máx 1 grupo (sem duplicação).
  const seen = {};
  let dup = 0;
  groups.forEach(grp => grp.players.forEach(p => { if (seen[p]) dup++; seen[p] = true; }));
  assert(dup === 0, 'nenhum jogador em 2 grupos (duplicados: ' + dup + ')');

  console.log('   sample: ' + (real[0] ? real[0].label + ' → ' + real[0].p1 + '  ×  ' + real[0].p2 : 'n/a'));
  return round;
}

// 1) Primeiro sorteio em 3 tamanhos (atual, projetado, exato múltiplo de 4).
[73, 142, 140].forEach(n => validateRound(mkConfra(n), n, 'PRIMEIRO SORTEIO'));

// 2) Fluxo multi-rodada: sorteia R1, lança resultados, sorteia R2 — confirma
//    que a 2ª rodada também é Rei/Rainha correta e não repete os mesmos grupos.
console.log('\n[MULTI-RODADA] 80 jogadores — R1 → resultados → R2');
const t = mkConfra(80);
generateLigaRound(t, new Date('2026-06-14T19:00:00-03:00'));
const r1 = t.rounds[0];
// lança um vencedor em cada jogo real de R1 (pra standings/anti-repeat ter dados)
r1.matches.forEach(m => { if (!m.isSitOut && !m.isBye) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3; } });
const before = t.rounds.length;
const r2res = generateLigaRound(t, new Date('2026-06-28T19:00:00-03:00'));
assert(r2res.ok && t.rounds.length === before + 1, 'R2 gerada (total rodadas=' + t.rounds.length + ')');
const r2 = t.rounds[1];
const r2real = (r2.matches || []).filter(m => !m.isSitOut && !m.isBye);
assert(r2real.every(m => Array.isArray(m.team1) && m.team1.length === 2), 'R2 toda em duplas 2×2');
// grupos de R2 diferentes dos de R1 (anti-repeat deve embaralhar)
const g1keys = (r1.monarchGroups || []).map(g => g.players.slice().sort().join(',')).sort();
const g2keys = (r2.monarchGroups || []).map(g => g.players.slice().sort().join(',')).sort();
assert(JSON.stringify(g1keys) !== JSON.stringify(g2keys), 'R2 formou grupos diferentes de R1 (anti-repeat)');

// 3) CONFRA REAL: torneio com categorias C/D + inscritos sem categoria válida.
//    Reproduz o desastre de 11/jun: ~56 de 83 ficaram fora porque tinham
//    categoria morta ("Fem TOP 500") ou nenhuma, e o sorteio por categoria os
//    filtrava pra fora. Com o fix (v2.4.28), TODOS entram (na cat mais fraca).
console.log('\n[CONFRA CATEGORIAS] C/D + sem-categoria/categoria-morta → ninguém fica de fora');
function mkConfraCats() {
  const parts = [];
  let id = 1;
  function add(n, cat, extra) {
    for (let i = 0; i < n; i++) {
      const p = { uid: 'u' + id, displayName: 'P' + id, name: 'P' + id, ligaActive: true };
      if (cat) { p.categories = [cat]; p.category = cat; p.categorySource = 'organizador'; }
      if (extra) Object.assign(p, extra);
      parts.push(p); id++;
    }
  }
  add(8, 'C');                                    // 8 já em C
  add(8, 'D');                                    // 8 já em D
  add(6, 'Fem TOP 500');                          // 6 com categoria MORTA (não existe em C/D)
  add(5, null);                                   // 5 totalmente sem categoria
  add(1, null, { skillBySport: { 'Beach Tennis': 'C' } }); // 1 sem cat mas perfil diz C → deve ir pra C
  return {
    id: 'mock-confra-cats', name: 'Ranking Confra 2026', format: 'Liga',
    ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', ligaDrawMode: 'standard',
    sport: 'Beach Tennis', teamSize: 2, gameTypes: 'duplas', enrollmentMode: 'individual',
    temporada: true, combinedCategories: ['C', 'D'], skillCategories: ['C', 'D'],
    participants: parts, rounds: [], standings: [],
  };
}
const tc = mkConfraCats();
const totalParts = tc.participants.length; // 28
const rc = generateLigaRound(tc, new Date('2026-06-14T19:00:00-03:00'));
assert(rc.ok, 'sorteio Confra-cats gerou rodada (reason=' + (rc.reason || 'ok') + ')');

// Coleta TODOS os jogadores que apareceram em QUALQUER coluna (real ou folga).
const drawn = new Set();
(tc.rounds || []).forEach(col => (col.matches || []).forEach(m => {
  if (m.isSitOut) { if (m.p1) drawn.add(m.p1); return; }
  (m.team1 || []).forEach(x => drawn.add(x));
  (m.team2 || []).forEach(x => drawn.add(x));
}));
// Quem sobrou do agrupamento por 4 NÃO fica de fora — vai pra lista de espera
// (t.monarchWaitlist por categoria). "Contemplado" = sorteado em grupo OU na fila.
const waitlisted = new Set();
Object.keys(tc.monarchWaitlist || {}).forEach(k => (tc.monarchWaitlist[k] || []).forEach(nm => waitlisted.add(nm)));
const missing = tc.participants.map(p => p.name).filter(n => !drawn.has(n) && !waitlisted.has(n));
assert(missing.length === 0, 'TODOS os ' + totalParts + ' inscritos contemplados — sorteio(' + drawn.size + ') + lista de espera(' + waitlisted.size + ') (de fora: ' + missing.length + (missing.length ? ' → ' + missing.join(',') : '') + ')');
assert(drawn.size + waitlisted.size === totalParts, 'sorteados + lista de espera = total (' + drawn.size + ' + ' + waitlisted.size + ' = ' + (drawn.size + waitlisted.size) + ' / ' + totalParts + ')');

// Os sem-categoria-válida foram pra D (mais fraca), exceto o de perfil C.
function catOf(name) {
  const p = tc.participants.find(x => x.name === name);
  return p ? (p.categories || []).join(',') : '?';
}
const staleAndUncat = tc.participants.filter(p => p.categorySource === 'auto_fraca');
assert(staleAndUncat.length === 12, '12 inscritos auto-encaixados (6 morta + 5 sem cat + 1 sem cat c/ perfil) — got ' + staleAndUncat.length);
// Quem não tem perfil de habilidade vai pra D (mais fraca); o de perfil C vai pra C.
const wrongFloor = staleAndUncat.filter(p => !p.skillBySport && (p.categories || [])[0] !== 'D');
assert(wrongFloor.length === 0, 'auto-encaixados SEM perfil foram pra D (mais fraca) — fora do esperado: ' + wrongFloor.map(p => p.name + '=' + p.categories).join(','));
// O sem-categoria com perfil C deve ter ido pra C (respeita perfil), não D.
const skillC = tc.participants.find(p => p.skillBySport);
assert(skillC && (skillC.categories || [])[0] === 'C', 'inscrito sem cat mas com perfil C foi pra C (got ' + (skillC && skillC.categories) + ')');
// Categoria morta NÃO permanece em lugar nenhum do participante.
const stillHasDead = tc.participants.filter(p =>
  (p.categories || []).indexOf('Fem TOP 500') !== -1 || p.category === 'Fem TOP 500' || (p.staleCat || []).indexOf('Fem TOP 500') !== -1);
assert(stillHasDead.length === 0, 'categoria morta "Fem TOP 500" removida de todos (ainda em: ' + stillHasDead.length + ')');
console.log('   colunas geradas: ' + tc.rounds.length + ' · jogadores sorteados: ' + drawn.size + '/' + totalParts);

// ─── BRICK 4 ETAPA 4: auto-draw AGENDADO da Liga incremental de FASE POSTERIOR ───
// Prova o caminho server-side novo: detecção da fase, due-check via _nextOwedDrawMs
// (lendo a agenda DA FASE), geração via _phaseGenNextLeagueRound, dedup por slot e
// cap por nº de rodadas. _suppressAutoDrawForPhases NÃO suprime Liga incremental.
(function testIncrementalPhaseAutoDraw() {
  console.log('\n[BRICK4 FASE POSTERIOR] Liga incremental agendada — due-check + geração + dedup + cap');
  const W = require('./draw-core.js')._window;
  const nowMs = new Date('2026-07-01T20:00:00-03:00').getTime(); // 1h após o 1º slot
  const pool = [];
  for (let i = 1; i <= 8; i++) pool.push({ displayName: 'P' + i, name: 'P' + i, uid: 'u' + i });
  const t = {
    id: 'mock-phase-liga', name: 'Temporada Fase 2', format: 'Fase de Grupos + Eliminatórias',
    phases: [{ name: 'F0' }, { name: 'Temporada', formatCode: 'liga', ligaCadence: 'incremental',
      drawFirstDate: '2026-07-01', drawFirstTime: '19:00', drawIntervalDays: 7, rounds: 4 }],
    currentPhaseIndex: 1, matches: [],
    // v3.1.16 (inc 8): sub-state agora é t.phaseRounds[idx] com rounds[] reais.
    phaseRounds: { 1: { pool: pool, rounds: [], opponentHistory: {}, sitOutHistory: {} } }
  };
  const phaseRoundMatches = (idx, rn) => {
    const slot = (t.phaseRounds && t.phaseRounds[idx]) || {};
    const out = [];
    (slot.rounds || []).filter(r => (r.round || 1) === rn).forEach(r => (r.matches || []).forEach(m => out.push(m)));
    return out;
  };
  assert(W._phaseGenNextLeagueRound(t, 1), 'round 1 gerada (avanço manual)');
  assert((t.matches || []).length === 0, 'round NÃO foi pra t.matches (mora em phaseRounds)');
  assert(W._isIncrementalLigaPhase(t) === true, '_isIncrementalLigaPhase = true');
  assert(W._suppressAutoDrawForPhases(t) === false, '_suppressAutoDrawForPhases = false (Liga incremental NÃO suprimida)');
  const owed = W._nextOwedDrawMs(t, nowMs);
  assert(typeof owed === 'number' && owed <= nowMs, 'slot agendado da FASE devido (owed <= now): ' + owed);
  assert(W._phaseGenNextLeagueRound(t, 1), 'round 2 gerada (auto-draw)');
  const r2 = phaseRoundMatches(1, 2).filter(m => !m.isSitOut);
  assert(r2.length === 2, 'round 2 com 2 duplas (got ' + r2.length + ')');
  t.phaseRounds[1].lastAutoDrawAt = owed; // dedup do slot
  const owed2 = W._nextOwedDrawMs(t, nowMs);
  assert(owed2 == null || owed2 > nowMs, 'após disparar o slot não re-dispara (dedup): ' + owed2);
  W._phaseGenNextLeagueRound(t, 1); // round 3
  W._phaseGenNextLeagueRound(t, 1); // round 4 → atinge o cap rounds=4
  assert(W._nextOwedDrawMs(t, nowMs) == null, 'temporada da fase completa (cap 4 rodadas) → sem próximo slot');
  // sanidade: fase única / Fase 0 não é afetada
  assert(W._isIncrementalLigaPhase({ phases: [{}], currentPhaseIndex: 0 }) === false, 'fase única não é incremental-phase');
})();

// ─── INC 8: PARIDADE da agenda Fase-0 (single-phase) após unificar a matemática ──
// _nextOwedDrawMs agora chama o núcleo compartilhado _owedDrawSlotMs nos DOIS ramos
// (Fase 0 e fase posterior incremental). Trava a saída do ramo Fase-0/PROD — tem que
// continuar idêntica (regime futuro / devido / já-disparado / único / manual).
(function testFase0OwedMathUnchanged() {
  console.log('\n[INC8 PARIDADE] _nextOwedDrawMs Fase-0 (single-phase) — math inalterada');
  const W = require('./draw-core.js')._window;
  const first = new Date('2026-08-01T19:00:00-03:00').getTime();
  const day = 86400000;
  const base = { format: 'Liga', drawFirstDate: '2026-08-01', drawFirstTime: '19:00', drawIntervalDays: 7 };
  assert(W._nextOwedDrawMs(Object.assign({}, base), first - day) === first, 'antes do 1º slot → owed=firstDraw (futuro)');
  assert(W._nextOwedDrawMs(Object.assign({}, base), first + 3600000) === first, 'no 1º slot, não disparado → owed=firstDraw (devido)');
  assert(W._nextOwedDrawMs(Object.assign({}, base, { lastAutoDrawAt: first }), first + 3600000) === first + 7 * day, 'slot disparado → próximo slot (futuro)');
  assert(W._nextOwedDrawMs(Object.assign({}, base, { drawIntervalDays: 0, lastAutoDrawAt: first }), first + day) == null, 'sorteio único já feito → null');
  assert(W._nextOwedDrawMs(Object.assign({}, base, { drawManual: true }), first + day) == null, 'manual → null');
  assert(W._nextOwedDrawMs(Object.assign({}, base, { status: 'finished' }), first + day) == null, 'finished → null');
})();

console.log('\n' + (failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + failures + ' FALHA(S)'));
process.exit(failures === 0 ? 0 : 1);
