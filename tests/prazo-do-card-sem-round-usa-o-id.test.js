'use strict';
/* ⛔ "JOGAR ATÉ" NA DASHBOARD SEM round/phaseIndex NO JOGO (18/set/2026)
 * Relato do dono: o card na chave mostra o prazo da rodada; o mesmo jogo em "Seu próximo
 * jogo" não. Medido no Confra: os docs de `matches`/`results` não trazem round nem
 * phaseIndex — quem os põe é o motor da chave, que a dashboard não roda. O id estrutural
 * carrega as duas coordenadas, e o resolvedor do prazo passa a lê-las de lá quando o
 * objeto não diz. */
const assert = require('assert/strict');
const H = require('./render-harness'); const W = H.window;
let ok = 0; const must = (c, m) => { assert.ok(c, m); ok++; console.log('  ✓ ' + m); };
console.log('\n──── o prazo do card sai do id quando o jogo não traz round/phaseIndex ────\n');

must(JSON.stringify(W._matchCoordsFromId('ph-tour_1780009816637-1-gold-VC-R2-P5')) === '{"phaseIndex":1,"round":2}',
  '① id da eliminatória: fase 1, rodada 2');
must(JSON.stringify(W._matchCoordsFromId('match-rr-r1-wl32-0-17865710986')) === '{"phaseIndex":0,"round":1}',
  '① id de grupo: fase 0, rodada 1');
must(W._matchCoordsFromId('abc') === null && W._matchCoordsFromId(null) === null, '① id sem coordenadas devolve null, não chuta');

// torneio de 2 fases com prazo por rodada na fase 1 (eliminatória), como o Confra
// forma REAL do Confra (lida do banco em 18/set/2026): limites como strings ISO locais
const t = { id: 'T', name: 'T', startDate: '2026-08-02T19:00', endDate: '2026-08-31T23:00', currentPhaseIndex: 1,
  phaseStartedAt: { '1': '2026-09-17T21:11:58.129Z' }, phases: [
  { name: 'Rei/Rainha', format: 'Liga', roundBounds: [] },
  { name: 'Eliminatória', format: 'Eliminatórias Simples', endDate: '2026-11-12', endTime: '23:00',
    roundBounds: ['2026-09-30T23:00', '2026-10-16T23:00', '2026-10-26T23:00', '2026-11-05T23:00', '2026-11-11T23:00'] } ] };
const completo = { id: 'ph-tour_1780009816637-1-gold-VC-R2-P5', phaseIndex: 1, round: 2, p1: 'A', p2: 'B' };
const magro    = { id: 'ph-tour_1780009816637-1-gold-VC-R2-P5', p1: 'A', p2: 'B' };   // como chega à dashboard
const f = W._matchCardRoundDeadlineMs;
if (typeof f !== 'function') { console.log('  · _matchCardRoundDeadlineMs não exposto no harness — teste do ① basta'); console.log('\n✅ ' + ok + ' verificações'); process.exit(0); }
const a = f(t, completo), b = f(t, magro);
must(a != null, '② o jogo COMPLETO resolve um prazo (' + a + ')');
must(b === a, '② ⭐⭐ o jogo MAGRO da dashboard resolve o MESMO prazo pelo id (' + b + ')');
must(new Date(a).getDate() === 16 && new Date(a).getMonth() === 9, '② e é o prazo da 2ª rodada: 16/10 (o "Jogar até" que o dono espera)');
console.log('\n✅ ' + ok + ' verificações');
