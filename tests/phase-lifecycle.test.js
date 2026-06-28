/* Matriz de CICLO DE VIDA + RESOLUÇÃO NUMÉRICA — node tests/phase-lifecycle.test.js
 *
 * Adversária por construção: materializa de VERDADE a próxima fase (gera a chave) a partir
 * de uma fase 0 jogada, cruzando RESOLUÇÃO (bye/exclusão/standby/repescagem) × contagens
 * NÃO-potência-de-2 e ÍMPARES (5,6,7) + controle pot-2 (8). Invariante inegociável de
 * torneio ao vivo: **nenhum jogador some silenciosamente** e **ninguém entra duplicado**.
 * Conservação é específica por modo (confirmada sondando a saída real do motor):
 *   bye/repescagem → TODOS entram;  exclusão → top-K (resto descartado de propósito);
 *   standby → top-K entra + resto vai pra standbyParticipants (soma = todos).
 * Testa js/views/phases-engine.js REAL via tests/headless.js.
 */
const { E, window: W } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const eqSet = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
const isPow2 = (n) => n > 0 && (n & (n - 1)) === 0;
const nextPow2 = (n) => { let p = 1; while (p < n) p <<= 1; return p; };
const prevPow2 = (n) => { let p = 1; while (p * 2 <= n) p <<= 1; return p; };
const BYE = W._t('bui.byeLabel');
const isBye = (s) => s === 'BYE' || s === BYE;
const isReal = (s) => s && s !== 'TBD' && !isBye(s);

const cs = (g) => (g.players || []).map((p) => ({ name: p.name })); // standings = P1..Pn (P1 = melhor)
function grpN(n) {
  const names = []; for (let i = 1; i <= n; i++) names.push('P' + i);
  return { players: names.map((x) => ({ name: x })), matches: [{ p1: names[0], p2: names[1], winner: names[0] }] };
}
function allNames(n) { const a = []; for (let i = 1; i <= n; i++) a.push('P' + i); return a; }
function topK(k) { const a = []; for (let i = 1; i <= k; i++) a.push('P' + i); return a; }

function materialize(n, mode) {
  const t = {
    id: 'lc' + n + mode, currentPhaseIndex: 0, matches: [], groups: [grpN(n)],
    phases: [
      { name: 'G', formatCode: 'grupos_mata', source: { type: 'enrollment' } },
      { name: 'E', formatCode: 'elim_simples', fixedPairs: false, bracketResolution: mode, source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] } },
    ],
  };
  const r = E.materializeNextPhase(t, cs, 'lc');
  return { r, t };
}

// entrantes = slots reais (não BYE/TBD) na MENOR rodada gerada (round 1, ou round 0 na repescagem)
function entrantsOf(t) {
  const pm = (t.matches || []).filter((m) => (m.phaseIndex || 0) === 1);
  if (!pm.length) return { entrants: [], byeSlots: 0, minRound: null };
  const minRound = Math.min.apply(null, pm.map((m) => Number(m.round)));
  const r1 = pm.filter((m) => Number(m.round) === minRound);
  const entrants = []; let byeSlots = 0;
  r1.forEach((m) => [m.p1, m.p2].forEach((p) => { if (isBye(p)) byeSlots++; else if (isReal(p)) entrants.push(p); }));
  return { entrants, byeSlots, minRound, slotCount: r1.length * 2 };
}

const COUNTS = [8, 6, 5, 7];
['bye', 'exclusion', 'standby', 'playin'].forEach((mode) => {
  COUNTS.forEach((n) => {
    const tag = `[${mode} n=${n}]`;
    const { r, t } = materialize(n, mode);
    ok(r && r.ok, tag + ' materializa (ok)');
    if (!r || !r.ok) return;
    const { entrants } = entrantsOf(t);
    const sb = (t.standbyParticipants || []).slice();

    // universais
    ok(entrants.every((p) => allNames(n).indexOf(p) !== -1), tag + ' sem jogador fantasma na chave');
    ok(new Set(entrants).size === entrants.length, tag + ' sem entrante duplicado [' + entrants.slice().sort().join(',') + ']');

    if (mode === 'bye' || mode === 'playin') {
      ok(eqSet(entrants, allNames(n)), tag + ' TODOS os ' + n + ' entram (ninguém some) [' + entrants.slice().sort().join(',') + ']');
      ok(sb.length === 0, tag + ' sem standby');
    } else { // exclusion / standby → corta pros top-K (K = potência inferior)
      const K = isPow2(n) ? n : prevPow2(n);
      ok(eqSet(entrants, topK(K)), tag + ' entram os top-' + K + ' (melhores) [' + entrants.slice().sort().join(',') + ']');
      if (mode === 'standby') {
        ok(eqSet(entrants.concat(sb.map(String)), allNames(n)), tag + ' entrantes + standby = todos (ninguém some) standby=[' + sb.join(',') + ']');
      } else {
        ok(sb.length === 0, tag + ' exclusão não usa standby (cortados descartados de propósito)');
      }
    }
  });
});

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-lifecycle: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
