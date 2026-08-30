const { planoDoEspelho } = require('./match-result-mirror-core');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } }

const t = { name: 'Copa', participants: [
  { uid: 'uA', displayName: 'A' }, { uid: 'uB', displayName: 'B' },
], rounds: [{ matches: [{ id: 'm1', p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 3 }] }] };

const novo = planoDoEspelho(t, 'm1', null, 'T1', '2026-08-30T00:00:00.000Z');
ok(novo.acao === 'set', 'jogo canônico sem results gera espelho');
ok(novo.doc.winner === 'A' && novo.doc.scoreP1 === 6 && novo.doc.tournamentId === 'T1', 'espelho vem do jogo e carrega contexto');
ok((novo.doc.playerUids || []).slice().sort().join('|') === 'uA|uB', 'roster é calculado do torneio montado');

const igual = planoDoEspelho(t, 'm1', Object.assign({}, novo.doc, { updatedAt: 'outra-data' }), 'T1', 'nova-data');
ok(igual.acao === 'skip', 'metadata diferente não reescreve espelho já compatível');

const velho = Object.assign({}, novo.doc, { replay: { points: [1] }, winner: 'B', scoreP1: 2, scoreP2: 6 });
const corrigido = planoDoEspelho(t, 'm1', velho, 'T1', '2026-08-30T01:00:00.000Z');
ok(corrigido.acao === 'set' && corrigido.doc.winner === 'A' && corrigido.doc.scoreP1 === 6, 'resultado antigo é substituído pela fonte');
ok(corrigido.doc.replay && corrigido.doc.replay.points.length === 1, 'replay do espelho anterior é preservado');

const removido = planoDoEspelho({ participants: t.participants, rounds: [{ matches: [] }] }, 'm1', novo.doc, 'T1', 'x');
ok(removido.acao === 'delete', 'sem jogo canônico, o espelho é removido');

console.log((fail ? '❌' : '✅') + ' match-result-mirror-core: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
