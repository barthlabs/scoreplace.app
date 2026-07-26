// Dupla Eliminatória — ÁRVORE MÍNIMA pelo caminho REAL da CF (draw-core → vendor).
//
// Esta suíte travava a RESOLUÇÃO AUTOMÁTICA pow2 ("12 duplas → byes=16−12=4 → pad até 16 →
// superior 8/4/2/1"). O dono decidiu (jul/2026) que **o desenho novo substitui o anterior,
// para ter menos repescagens e poucos byes**: a chave não é mais inflada até a potência de 2.
// Com 12 duplas aquilo dava 4 equipes avançando sem jogar; a árvore mínima dá 6/3/2/1 na
// superior, ZERO folga e 2 repescagens.
//
// A regra é uma recorrência: rodada com E entrantes → teto(E/2) jogos; sobem teto(E/2),
// descem piso(E/2). E ímpar deixa UMA sobra, que recebe folga (dentro do teto de 3 a cada 12,
// nunca a menos de 3 rodadas da final e NUNCA na 1ª rodada da principal) ou repescagem.
//
// O QUE ESTA SUÍTE PROTEGE, e por que roda por `draw-core` e não por `chaves.js`:
// o sorteio de produção roda na Cloud Function, que usa `functions-autodraw/vendor/`. Testar
// só `js/views/chaves.js` provaria o desenho e não provaria que a CF o reproduz. Aqui o
// desenho REAL emitido pelo motor da CF é comparado rodada a rodada com `plano(N)` — é o
// contrato "functions espelham o app", medido em vez de presumido.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
const HH = require('./headless.js');
HH.load('chaves.js');
const { plano } = HH.window._chaves;

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
// rodadas por chave: a 1ª rodada existente de cada chave vira índice 0
function estrutura(t) {
  const ms = (W._collectAllMatches(t) || []).filter(m => m && !m.isThirdPlace && !m.isExtra && !m.condicional);
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
    out[b] = rs.map(r => ({
      jogos: por[b][r].length,
      rep: por[b][r].filter(m => m.isRepechageSlot).length,
      bye: por[b][r].filter(m => m.isBye).length
    }));
  });
  return out;
}
const isEmpty = v => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];
const jogosDe = (e, b) => (e[b] || []).map(r => r.jogos).join('/');

console.log('── CASO CANÔNICO: 12 duplas (o que o dono validou) ──');
(function () {
  const t = mkT(12);
  const r = dc.drawInitial(t, {});
  ok(!!(r && r.ok), 'sorteio de 12 duplas roda: ' + ((r && r.reason) || 'ok'));
  ok(/dupla/i.test(t.format), 'o mock compilou como DUPLA ELIMINATÓRIA (não Simples): ' + t.format);

  const e = estrutura(t);
  ok(jogosDe(e, 'upper') === '6/3/2/1', 'superior = 6/3/2/1, veio ' + jogosDe(e, 'upper'));
  ok(jogosDe(e, 'lower') === '3/3/2/2/1', 'inferior = 3/3/2/2/1, veio ' + jogosDe(e, 'lower'));
  ok(jogosDe(e, 'grand') === '1', 'grande final = 1 jogo, veio ' + jogosDe(e, 'grand'));

  const totBye = Object.keys(e).reduce((s, b) => s + e[b].reduce((x, r2) => x + r2.bye, 0), 0);
  const totRep = Object.keys(e).reduce((s, b) => s + e[b].reduce((x, r2) => x + r2.rep, 0), 0);
  ok(totBye === 0, '12 duplas: ZERO folga na chave inteira, veio ' + totBye);
  ok(totRep === 2, '12 duplas: exatamente 2 repescagens, veio ' + totRep);

  const disputados = all(t).filter(m => !m.isThirdPlace && !m.isExtra && !m.condicional && !m.isBye).length;
  ok(disputados === 24, '12 duplas: 24 jogos de verdade, veio ' + disputados);

  if (fail) {
    console.log('\nESTRUTURA MEDIDA:');
    Object.keys(e).sort().forEach(b => console.log('  ' + b + ': ' + e[b].map((x, i) => 'R' + (i + 1) + '=' + x.jogos + 'j/' + x.rep + 'rep/' + x.bye + 'bye').join('  ')));
  }
})();

console.log('── PARIDADE CF ↔ motor: a chave emitida bate com plano(N) rodada a rodada, N=4..24 ──');
// Se este bloco quebrar, o vendor está fora de sincronia com js/views/ — o sorteio de
// produção passaria a desenhar uma chave que nenhum teste do app descreve.
for (let N = 4; N <= 24; N++) {
  const t = mkT(N);
  const r = dc.drawInitial(t, {});
  if (!(r && r.ok)) { ok(false, 'N=' + N + ': sorteio recusado (' + ((r && r.reason) || '?') + ')'); continue; }
  const e = estrutura(t);
  const p = plano(N, 'dupla');
  const supEsp = p.rodadas.filter(x => x.fase === 'VC').map(x => x.jogos).join('/');
  const infEsp = p.rodadas.filter(x => x.fase === 'PD').map(x => x.jogos).join('/');
  ok(jogosDe(e, 'upper') === supEsp, 'N=' + N + ' superior: CF=' + jogosDe(e, 'upper') + ' vs plano=' + supEsp);
  ok(jogosDe(e, 'lower') === infEsp, 'N=' + N + ' inferior: CF=' + jogosDe(e, 'lower') + ' vs plano=' + infEsp);

  // jogos REALMENTE disputados = 2N−2+repescagens (a folga não é jogo)
  const disputados = all(t).filter(m => !m.isThirdPlace && !m.isExtra && !m.condicional && !m.isBye).length;
  ok(disputados === 2 * N - 2 + p.repescagens,
    'N=' + N + ': ' + disputados + ' jogos disputados, esperado ' + (2 * N - 2 + p.repescagens) + ' (2N−2+rep)');

  // a 1ª rodada da SUPERIOR nunca folga — é a posição do último inscrito
  const supR1 = (e.upper || [])[0];
  ok(supR1 && supR1.bye === 0, 'N=' + N + ': folga na 1ª superior (proibida — é a vaga do último inscrito)');
  ok(supR1 && supR1.rep === (N % 2 === 1 ? 1 : 0),
    'N=' + N + ': 1ª superior deveria ter ' + (N % 2 === 1 ? 1 : 0) + ' repescagem, tem ' + (supR1 && supR1.rep));
}

console.log('── PLAYOUT: a chave fecha num campeão, sem travar e sem duplicar ninguém ──');
for (let N = 4; N <= 24; N++) {
  const t = mkT(N);
  if (!dc.drawInitial(t, {}).ok) continue;
  W.AppStore.tournaments = [t];
  let g = 0, erro = null;
  while (g++ < 4000) {
    const self = all(t).find(m => m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2));
    if (self) { erro = 'AUTO-CONFRONTO em ' + self.id + ' (' + self.p1 + ')'; break; }
    const slots = {};
    all(t).filter(m => !m.winner).forEach(m => ['p1', 'p2'].forEach(s => { if (!isEmpty(m[s])) (slots[m[s]] = slots[m[s]] || []).push(m.id); }));
    const dup = Object.keys(slots).find(v => slots[v].length > 1);
    if (dup) { erro = 'DOUBLE-BOOK: ' + dup + ' em ' + slots[dup].join(','); break; }
    const p = all(t).filter(m => m && !m.winner && !m.isBye && !m.isSitOut && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5;
    try { W._advanceWinner(t, m); } catch (e2) { erro = 'advanceWinner: ' + e2.message; break; }
    if (W._resolveRepFills) { try { W._resolveRepFills(t); } catch (e2) {} }
  }
  ok(!erro, 'N=' + N + ': playout limpo (' + (erro || 'ok') + ')');
  if (erro) continue;
  const travados = all(t).filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  ok(travados.length === 0, 'N=' + N + ': nenhum jogo travado no fim (' + travados.length + ')');
  const gf = all(t).filter(m => m.bracket === 'grand');
  ok(gf.length >= 1 && gf[gf.length - 1].winner, 'N=' + N + ': grande final coroou um campeão');
}

console.log('\n' + (fail === 0 ? '✅ dupla-elim-minimal-tree: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.slice(0, 20).forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
