// test-groupsby.js — valida o toggle Rei/Rainha groupsBy ('ranking' | 'sorteio')
// na 1ª rodada. ranking = ordem de classificação (determinístico); sorteio =
// embaralha (varia entre execuções). Roda: `node test-groupsby.js`.
const { generateLigaRound } = require('./draw-core.js');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('  ✗ ' + msg); failures++; }
  else console.log('  ✓ ' + msg);
}

function mkT(groupsBy) {
  const parts = [];
  for (let i = 1; i <= 16; i++) parts.push({ uid: 'u' + i, displayName: 'J' + i, name: 'J' + i, ligaActive: true });
  return {
    id: 'gb', name: 'GB', format: 'Liga',
    ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', ligaDrawMode: 'standard',
    equilibrado: false, temporada: true, teamSize: 2, gameTypes: 'duplas',
    enrollmentMode: 'individual', combinedCategories: [], participants: parts,
    rounds: [], standings: [], reiRainhaGroupsBy: groupsBy,
    // critério determinístico (sem o tiebreaker 'sorteio') p/ isolar o groupsBy:
    // round 1 todos empatados → ordem estável de inscrição quando groupsBy='ranking'.
    tiebreakers: ['saldo_pontos']
  };
}
function round1Key(groupsBy) {
  const t = mkT(groupsBy);
  const r = generateLigaRound(t, new Date('2026-06-14T19:00:00-03:00'));
  if (!r.ok) return null;
  const col = t.rounds[t.rounds.length - 1];
  return (col.monarchGroups || []).map(g => g.players.join(',')).join(' | ');
}

// 'ranking': determinístico — mesma chave em execuções repetidas.
const rk = [];
for (let i = 0; i < 5; i++) rk.push(round1Key('ranking'));
assert(rk.every(k => k && k === rk[0]), "ranking: grupos da 1ª rodada são determinísticos");

// 'sorteio': varia — entre N execuções, pelo menos 2 chaves diferentes.
const sk = new Set();
for (let i = 0; i < 25; i++) { const k = round1Key('sorteio'); if (k) sk.add(k); }
assert(sk.size > 1, "sorteio: grupos da 1ª rodada variam entre execuções (got " + sk.size + " distintos)");

// 'sorteio' difere do arranjo determinístico de 'ranking' em ao menos 1 caso.
assert([...sk].some(k => k !== rk[0]), "sorteio produz arranjo diferente do ranking");

console.log('\n' + (failures === 0 ? '✅' : '❌') + ' groupsBy: ' + (failures === 0 ? 'OK' : failures + ' falha(s)'));
process.exit(failures === 0 ? 0 : 1);
