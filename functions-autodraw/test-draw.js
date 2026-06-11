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
  assert(sitouts.length === (n % 4), 'folgas = n%4 = ' + (n % 4) + ' (got ' + sitouts.length + ')');

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

console.log('\n' + (failures === 0 ? '✅ TODOS OS TESTES PASSARAM' : '❌ ' + failures + ' FALHA(S)'));
process.exit(failures === 0 ? 0 : 1);
