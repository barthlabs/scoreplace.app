/* ENTRADA TARDIA = append + RECALCULAR. node tests/late-entry-recalc.test.js
 *
 * Este é o teste do FIASCO: torneio de casais ao vivo, jogos já em andamento, dupla
 * chega atrasada. Na 1.5.x isso passava por ~1.250 linhas de cirurgia incremental
 * (_placeLateEntriesSurgically, _syncLowerBracket, _integrateLateDuplas com cascata
 * Tier 1/2/3, _createExtraGamesFromWaitlist, _ensureLowerLandingForLate,
 * _repropagateDecided, _dedupMatchesByUid, a "porta" superior→inferior…) e quebrou
 * de quatro maneiras diferentes em quatro versões seguidas: tardio sem jogo, jogo
 * preso em "vs a definir", perdedor sem pouso na inferior, e auto-confronto Time X
 * vs X na re-propagação.
 *
 * Com id ESTRUTURAL nada disso é preciso: redesenha do zero e o resultado volta
 * sozinho pro seu jogo. O que este arquivo trava:
 *   1 — placar já lançado SOBREVIVE ao recálculo, no MESMO jogo, com os MESMOS
 *       adversários (é o que o id derivável compra);
 *   2 — o tardio ganha jogo DE VERDADE (não fica de fora, não fica "a definir");
 *       na dupla ele ganha também o pouso na inferior;
 *   3 — nenhum confronto já existente muda;
 *   4 — depois do tardio a chave ainda joga inteira até o campeão, sem órfão e sem
 *       auto-confronto;
 *   5 — vários tardios em sequência (o caso real: gente chegando aos poucos);
 *   6 — cruzar potência de 2 NÃO aplica pela metade: devolve veredito pro organizador.
 */
const H = require('./headless.js');
const W = H.window;
const C = W._chaves, A = W._chavesAdapter;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const parts = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'D' + (i + 1), uid: 'u' + (i + 1) }));
const isBye = (x) => !x || x === 'TBD' || /BYE/.test(String(x));
const fmtApp = (f) => (f === 'dupla' ? 'Dupla Eliminatória' : 'Eliminatórias Simples');

/* Joga `quantos` jogos ESTRUTURAIS (nunca repescagem).
 *
 * A repescagem é CAMADA DERIVADA: recalcula a cada tardio, por desenho. O spec
 * assume que ela não chega a ser disputada durante a janela de admissão ("uma
 * repescagem só é jogável depois dos jogos normais da R1"), mas isso é otimismo —
 * pode acontecer. Quando acontece, recalcular invalidaria um jogo já disputado, e
 * aí a resposta certa é RECUSAR e devolver o veredito (caso 7 abaixo), não aplicar
 * pela metade. Aqui exercitamos o caminho normal; o caso 7 exercita o outro.
 */
function jogarAlguns(t, quantos) {
  const jogados = [];
  for (let i = 0; i < quantos; i++) {
    const m = t.matches.find((x) => !x.winner && !x.isRepechageSlot && !isBye(x.p1) && !isBye(x.p2));
    if (!m) break;
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 2; m.resultAt = 1000 + i;
    jogados.push({ id: m.id, p1: m.p1, p2: m.p2, winner: m.winner, s1: 6, s2: 2 });
    W._advanceWinner(t, m);
  }
  return jogados;
}

function jogarTudo(t) {
  let g = 0;
  for (;;) {
    if (++g > 6000) return false;
    const m = t.matches.find((x) => !x.winner && !isBye(x.p1) && !isBye(x.p2));
    if (!m) return true;
    if (m.p1 === m.p2) { ok(false, `auto-confronto em ${m.id}: ${m.p1}`); return false; }
    m.winner = m.p1;
    W._advanceWinner(t, m);
  }
}

console.log('\n== 1..4) torneio EM ANDAMENTO recebe tardio: placar sobrevive, tardio joga ==');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 5; N <= 22; N++) {
    if (C.plano(N).B !== C.plano(N + 1).B) continue;   // dobrar a chave é o caso 6

    const built = A.build(N, fmt, { participantes: parts(N) });
    const t = { id: 'lt', format: fmtApp(fmt), matches: built.matches };
    const antesIds = t.matches.map((m) => m.id).slice();
    const antesConf = {}, antesDerivado = {};
    t.matches.forEach((m) => {
      antesConf[m.id] = m.p1 + '|' + m.p2;
      // guarda se o jogo JÁ ERA camada derivada (bye ou repescagem) — só o estado
      // ANTERIOR importa: uma repescagem de N pode virar jogo normal em N+1, e isso
      // é o desenho funcionando, não confronto sendo trocado.
      // inclui quem CHEGOU por folga: se a camada de bye muda, essa pessoa passa a
      // ter jogo e o slot volta a TBD até ela vencer — desenho funcionando, não
      // confronto trocado.
      antesDerivado[m.id] = !!(m.isBye || m.isRepechageSlot || m.p1FromBye || m.p2FromBye);
    });

    // o torneio JÁ COMEÇOU: 2 jogos lançados
    const jogados = jogarAlguns(t, 2);
    ok(jogados.length > 0, `${fmt} N=${N}: não consegui lançar placar antes do tardio`);

    // chega o tardio
    const r = A.recalcularComTardio(t.matches, N + 1, fmt, { participantes: parts(N + 1) });
    ok(r.ok, `${fmt} N=${N}→${N + 1}: recálculo recusado (${r.motivo})`);
    if (!r.ok) continue;

    // (1) placar sobreviveu, no mesmo jogo e com os mesmos adversários
    jogados.forEach((j) => {
      const m = r.matches.find((x) => x.id === j.id);
      ok(!!m, `${fmt} N=${N}: jogo ${j.id} sumiu no recálculo`);
      if (!m) return;
      ok(m.winner === j.winner && m.scoreP1 === j.s1 && m.scoreP2 === j.s2,
        `${fmt} N=${N}: placar de ${j.id} não sobreviveu (winner=${m.winner} ${m.scoreP1}x${m.scoreP2})`);
      ok(m.p1 === j.p1 && m.p2 === j.p2,
        `${fmt} N=${N}: ${j.id} trocou de adversários (${j.p1} x ${j.p2} → ${m.p1} x ${m.p2})`);
    });

    // (3) nenhum confronto pré-existente mudou
    antesIds.forEach((id) => {
      const m = r.matches.find((x) => x.id === id);
      if (!m) return;                       // bye/repescagem podem ser recalculados
      const dep = m.p1 + '|' + m.p2;
      const era = antesConf[id];
      // CONFRONTO MUDOU = dois nomes REAIS viraram um par DIFERENTE.
      // Não conta como mudança: camada derivada (bye/repescagem) recalculando, nem
      // um slot voltando a 'TBD'. Slot volta a TBD quando quem tinha avançado por
      // FOLGA passa a ter jogo (a folga virou confronto com o tardio) — a pessoa não
      // foi trocada, ela só precisa jogar agora pra ocupar aquele lugar.
      const derivado = antesDerivado[id] || m.isBye || m.isRepechageSlot;
      const reais = (x) => !/BYE/.test(x) && !/TBD/.test(x);
      if (!derivado && reais(era) && reais(dep)) {
        ok(dep === era, `${fmt} N=${N}: confronto ${id} MUDOU (${era} → ${dep})`);
      }
    });

    // (2) o tardio ganhou jogo de verdade
    const tardio = 'D' + (N + 1);
    const jogosDoTardio = r.matches.filter((m) => m.p1 === tardio || m.p2 === tardio);
    ok(jogosDoTardio.length > 0, `${fmt} N=${N}→${N + 1}: o tardio ${tardio} ficou SEM JOGO`);
    ok(jogosDoTardio.some((m) => !isBye(m.p1) && !isBye(m.p2)),
      `${fmt} N=${N}→${N + 1}: o tardio ${tardio} só tem jogo "a definir"/BYE`);

    // (4) a chave ainda fecha, com campeão e sem órfão
    const t2 = { id: 'lt', format: fmtApp(fmt), matches: r.matches };
    ok(jogarTudo(t2), `${fmt} N=${N}→${N + 1}: playout não converge após o tardio`);
    const orfaos = t2.matches.filter((m) => !m.winner && !m.isExtra && !isBye(m.p1) && !isBye(m.p2));
    ok(orfaos.length === 0, `${fmt} N=${N}→${N + 1}: ${orfaos.length} órfão(s) após o tardio`);
  }
});

console.log('== 2b) na DUPLA o tardio também tem pouso na chave inferior ==');
[5, 9, 10, 11, 13, 20].forEach((N) => {
  if (C.plano(N).B !== C.plano(N + 1).B) return;
  const built = A.build(N, 'dupla', { participantes: parts(N) });
  const t = { id: 'lt', format: 'Dupla Eliminatória', matches: built.matches };
  jogarAlguns(t, 1);
  const r = A.recalcularComTardio(t.matches, N + 1, 'dupla', { participantes: parts(N + 1) });
  ok(r.ok, `dupla N=${N}→${N + 1}: recálculo recusado`);
  if (!r.ok) return;
  const tardio = 'D' + (N + 1);
  const seuJogo = r.matches.filter((m) => (m.p1 === tardio || m.p2 === tardio) && m.bracket === 'upper')[0];
  ok(!!seuJogo, `dupla N=${N}→${N + 1}: tardio sem jogo na chave superior`);
  if (seuJogo) {
    ok(!!seuJogo.loserMatchId || seuJogo.perdedorDesce === false || !!seuJogo.loserNextMatchId,
      `dupla N=${N}→${N + 1}: o jogo do tardio (${seuJogo.id}) não tem pouso pro perdedor`);
  }
});

console.log('== 5) VÁRIOS tardios em sequência (gente chegando aos poucos) ==');
['simples', 'dupla'].forEach((fmt) => {
  let N = 9;
  const built = A.build(N, fmt, { participantes: parts(N) });
  let t = { id: 'seq', format: fmtApp(fmt), matches: built.matches };
  const jogados = jogarAlguns(t, 2);
  while (N < 16) {
    const r = A.recalcularComTardio(t.matches, N + 1, fmt, { participantes: parts(N + 1) });
    ok(r.ok, `${fmt}: recálculo recusado ao entrar o ${N + 1}º`);
    if (!r.ok) break;
    t = { id: 'seq', format: fmtApp(fmt), matches: r.matches };
    N++;
    // os placares originais continuam de pé a cada nova entrada
    jogados.forEach((j) => {
      const m = t.matches.find((x) => x.id === j.id);
      ok(m && m.winner === j.winner, `${fmt}: com ${N} inscritos, o placar de ${j.id} se perdeu`);
    });
  }
  ok(N === 16, `${fmt}: deveria chegar a 16 com tardios em sequência, parou em ${N}`);
  const t2 = { id: 'seq', format: fmtApp(fmt), matches: t.matches };
  ok(jogarTudo(t2), `${fmt}: playout não converge depois de 7 tardios`);
});

console.log('== 6) cruzar potência de 2 NÃO aplica pela metade ==');
['simples', 'dupla'].forEach((fmt) => {
  const built = A.build(16, fmt, { participantes: parts(16) });
  const t = { id: 'p2', format: fmtApp(fmt), matches: built.matches };
  jogarAlguns(t, 2);
  const r = A.recalcularComTardio(t.matches, 17, fmt, { participantes: parts(17) });
  ok(r.ok === false, `${fmt} 16→17: deveria RECUSAR (redesenho total), mas aplicou`);
  ok(r.cruzouPotencia2 === true, `${fmt} 16→17: deveria sinalizar cruzouPotencia2`);
  ok(r.matches === null, `${fmt} 16→17: não pode devolver chave aplicada pela metade`);
  ok(r.perdidos && r.perdidos.length > 0, `${fmt} 16→17: deveria listar o que se perde`);
  // e o aviso existe ANTES, pra o organizador decidir com informação
  ok(C.avisoPotencia2(16).alerta === true, 'avisoPotencia2(16) deveria alertar que a próxima dobra a chave');
});

console.log('== 7) REPESCAGEM já disputada: recusa com veredito, não invalida em silêncio ==');
[9, 10, 11].forEach((N) => {
  if (!C.plano(N).repescagens) return;
  const built = A.build(N, 'simples', { participantes: parts(N) });
  const t = { id: 'rp', format: 'Eliminatórias Simples', matches: built.matches };
  // fecha os jogos normais da R1 até a repescagem ficar jogável, e joga a repescagem
  let g = 0, jogouRep = null;
  for (;;) {
    if (++g > 200) break;
    const m = t.matches.find((x) => !x.winner && !isBye(x.p1) && !isBye(x.p2));
    if (!m) break;
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 1; m.resultAt = 1;
    if (m.isRepechageSlot) { jogouRep = m.id; W._advanceWinner(t, m); break; }
    W._advanceWinner(t, m);
  }
  ok(!!jogouRep, `N=${N}: não consegui disputar a repescagem pro cenário do teste`);
  if (!jogouRep) return;

  const r = A.recalcularComTardio(t.matches, N + 1, 'simples', { participantes: parts(N + 1) });
  // O veredito pode ser "ok" (se a repescagem daquele N sobreviveu ao novo desenho)
  // ou recusa — o que NÃO pode é aplicar perdendo o placar em silêncio.
  if (r.ok) {
    const m = r.matches.find((x) => x.id === jogouRep);
    ok(m && !!m.winner, `N=${N}: aceitou o recálculo mas PERDEU o placar da repescagem ${jogouRep}`);
  } else {
    ok(r.perdidos.length > 0, `N=${N}: recusou sem dizer o que se perde`);
    ok(r.matches === null, `N=${N}: recusou mas devolveu chave aplicada pela metade`);
  }
});

console.log('\n' + (fail === 0 ? '✅ late-entry-recalc: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
