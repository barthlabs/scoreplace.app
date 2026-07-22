// ESPEC do dono (jul/2026), Dupla Eliminatória com 12 duplas:
//   "com 6 jogos na R1 sup, deveriam ter 3 jogos na r2 sup e 3 jogos na r1 inf. a repescagem vai
//    ocorrer, com esses numeros, na r3 (sup e inf)"
//   "o numero de repescados deve ser o minimo e manter o mais que der a dupla eliminatoria classica"
//
// ESTADO ANTERIOR (medido): a Dupla Elim montava uma PRÉ-RODADA + chave superior de POTÊNCIA DE 2
// (T=8): 6 jogos na R0, 4 na R1 sup (6 vencedores + 2 melhores derrotados PROMOVIDOS) e só 2 jogos
// na R1 inf, preenchidos por 4 vagas de repescagem (upperR0 ranks #2..#5). Ou seja: 6 repescados
// logo na 1ª virada, quando o mínimo é ZERO — 6 é par, ⌈6/2⌉=3 fecha sem repescar ninguém.
//
// REGRA TRAVADA: a chave usa a FÓRMULA MÍNIMA (⌈E/2⌉ por rodada; repescado SÓ quando E é ímpar,
// e apenas 1). Nada de inflar pra potência de 2. Isso vale pros DOIS lados: superior e inferior.
// A Dupla Elim clássica é preservada no que dá — o que muda é só o tamanho das rodadas.
// [[project_minimal_elim_formula_canon]] / [[project_dupla_elim_repechage]]
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'MIN' + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'closed' };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t);
  return t;
}
// rodadas por chave, normalizadas: a 1ª rodada existente de cada chave vira índice 1
function estrutura(t) {
  const ms = (W._collectAllMatches(t) || []).filter(m => m && !m.isThirdPlace);
  const por = {};
  ms.forEach(m => {
    const b = m.bracket || 'upper';
    (por[b] = por[b] || {});
    const r = (typeof m.round === 'number') ? m.round : 1;
    (por[b][r] = por[b][r] || []).push(m);
  });
  const out = {};
  Object.keys(por).forEach(b => {
    const rs = Object.keys(por[b]).map(Number).sort((x, y) => x - y);
    out[b] = rs.map(r => {
      const lista = por[b][r];
      const reps = lista.reduce((s, m) => s + ((m.repFill || []).length), 0);
      return { jogos: lista.length, repescados: reps };
    });
  });
  return out;
}

console.log('── Dupla Eliminatória usa a FÓRMULA MÍNIMA (12 duplas) ──');

(function () {
  const t = mkT(12);
  const r = dc.drawInitial(t, {});
  ok(!!(r && r.ok), 'sorteio de 12 duplas roda: ' + ((r && r.reason) || 'ok'));
  ok(/dupla/i.test(t.format), 'o mock compilou como DUPLA ELIMINATÓRIA (não Simples): ' + t.format);

  const e = estrutura(t);
  const sup = e.upper || [];
  const inf = e.lower || [];

  // ── chave SUPERIOR: 6 → 3 → 2 → 1
  ok(sup.length >= 4, 'superior tem 4 rodadas (6/3/2/1), tem ' + sup.length);
  ok(sup[0] && sup[0].jogos === 6, '1ª sup = 6 jogos (12 duplas), veio ' + (sup[0] && sup[0].jogos));
  ok(sup[1] && sup[1].jogos === 3, '2ª sup = 3 jogos (⌈6/2⌉), veio ' + (sup[1] && sup[1].jogos));
  ok(sup[2] && sup[2].jogos === 2, '3ª sup = 2 jogos (⌈3/2⌉), veio ' + (sup[2] && sup[2].jogos));
  ok(sup[3] && sup[3].jogos === 1, '4ª sup = 1 jogo (final da superior), veio ' + (sup[3] && sup[3].jogos));

  // ── repescagem MÍNIMA: zero na 2ª (6 é par), exatamente 1 na 3ª (3 é ímpar)
  ok(sup[1] && sup[1].repescados === 0, '2ª sup SEM repescado (6 é par ⇒ mínimo é zero), veio ' + (sup[1] && sup[1].repescados));
  ok(sup[2] && sup[2].repescados === 1, '3ª sup com EXATAMENTE 1 repescado (3 é ímpar), veio ' + (sup[2] && sup[2].repescados));
  ok(sup[3] && sup[3].repescados === 0, 'final da superior sem repescado, veio ' + (sup[3] && sup[3].repescados));

  // ── chave INFERIOR: os 6 derrotados da 1ª sup fazem 3 jogos, sem repescar ninguém
  ok(inf[0] && inf[0].jogos === 3, '1ª inf = 3 jogos (6 derrotados da 1ª sup), veio ' + (inf[0] && inf[0].jogos));
  ok(inf[0] && inf[0].repescados === 0, '1ª inf SEM repescado (6 derrotados fecham em 3 jogos), veio ' + (inf[0] && inf[0].repescados));

  // ── total de repescados na chave inteira: o MÍNIMO (só onde a conta dá ímpar)
  const totalRep = Object.keys(e).reduce((s, b) => s + e[b].reduce((x, r) => x + r.repescados, 0), 0);
  ok(totalRep <= 2, 'total de repescados é o MÍNIMO (≤2 com 12 duplas), veio ' + totalRep);

  if (fail) {
    console.log('\nESTRUTURA MEDIDA:');
    Object.keys(e).sort().forEach(b => console.log('  ' + b + ': ' + e[b].map((r, i) => 'R' + (i + 1) + '=' + r.jogos + 'j/' + r.repescados + 'rep').join('  ')));
  }
})();

console.log('\n' + (fail === 0 ? '✅ dupla-elim-minimal-tree: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
