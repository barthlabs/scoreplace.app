/* MOTOR DE CHAVES — TESTES DE ACEITE — node tests/chaves-aceite.test.js
 *
 * Trava o desenho determinístico de js/views/chaves.js: a chave é função pura de
 * (N, formato). Cada N tem UM desenho.
 *
 * ESTA SUÍTE FOI REESCRITA (jul/2026) porque a fórmula que ela travava DEIXOU DE
 * EXISTIR. Antes, N era inflado até B = próxima potência de 2 e as B−N posições
 * vazias viravam folga ou repescagem — daí a tabela de `vagas`/`pool`/`menor` e
 * coisas como "VC-R1-P2 é sempre #8 x #9" ou "16→17 é redesenho total". Com 36
 * duplas aquilo produzia uma chave de 64 com 24 equipes avançando sem jogar.
 *
 * A regra nova é uma RECORRÊNCIA, e é ela que esta suíte trava agora:
 *   rodada com E entrantes -> teto(E/2) jogos; sobem teto(E/2), descem piso(E/2).
 *   E ímpar deixa UMA sobra (a última posição), que recebe folga ou repescagem —
 *   e a topologia é a MESMA nos dois casos, então a chave continua sendo função
 *   pura de (N, formato).
 *
 * O que cada bloco protege:
 *   1 — a recorrência em si (teto/piso), N=2..64, nos dois formatos.
 *   2 — a tabela oficial de 8 a 16 (rodadas, folgas, repescagens, modo, jogos).
 *   3 — as fórmulas de contagem: simples = N−1+rep, dupla = 2N−2+rep.
 *   4 — EMPARELHAMENTO ADJACENTE: VC-R1-Pk é #(2k−1) x #2k em QUALQUER N. É o que
 *       permite admitir tardio sem resortear. Se quebrar, a chave voltou a ser
 *       instável e o fiasco do torneio de casais pode se repetir.
 *   5 — nenhum jogo normal da R1 some de N -> N+1 (o invariante que falhou ao vivo).
 *   6 — NÃO existe mais ponto de ruptura: cruzar potência de 2 não redesenha nada.
 *   7 — ids únicos: o id é a coordenada estrutural, chave dos resultados.
 *   8 — política de folga: teto de 3 a cada 12, nunca em semi/final, e NUNCA na 1ª
 *       rodada da principal (lá a sobra é o último inscrito — regra do dono).
 *   9 — o caso N=11 por extenso, e o caso canônico de 12 duplas.
 */
const H = require('./headless.js');
H.load('chaves.js');
const { plano, chave, delta, avisoPotencia2 } = H.window._chaves;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const teto = (x) => Math.ceil(x / 2);
const piso = (x) => Math.floor(x / 2);

console.log('── 1) a RECORRÊNCIA: teto(E/2) jogos, sobem teto, descem piso — N=2..64 ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 64; N++) {
    const p = plano(N, fmt);
    const sup = p.rodadas.filter((r) => r.fase === 'VC');

    ok(sup[0] && sup[0].E === N, `${fmt} N=${N}: a 1ª rodada deveria receber os ${N} inscritos, recebeu ${sup[0] && sup[0].E}`);
    sup.forEach((r, i) => {
      ok(r.jogos === teto(r.E), `${fmt} N=${N} VC-R${r.rodada}: E=${r.E} deveria dar ${teto(r.E)} jogos, deu ${r.jogos}`);
      ok(r.sobe === teto(r.E), `${fmt} N=${N} VC-R${r.rodada}: deveriam subir ${teto(r.E)}, sobem ${r.sobe}`);
      ok(r.desce === piso(r.E), `${fmt} N=${N} VC-R${r.rodada}: deveriam descer ${piso(r.E)}, descem ${r.desce}`);
      ok(r.impar === (r.E % 2 === 1), `${fmt} N=${N} VC-R${r.rodada}: flag ímpar errada`);
      const prox = sup[i + 1];
      if (prox) ok(prox.E === r.sobe, `${fmt} N=${N}: VC-R${prox.rodada} recebe ${prox.E} mas VC-R${r.rodada} sobe ${r.sobe}`);
    });
    // a superior termina com exatamente 1 sobrevivente — o campeão da chave
    const ultima = sup[sup.length - 1];
    ok(ultima && ultima.sobe === 1, `${fmt} N=${N}: a superior deveria terminar em 1 campeão, terminou em ${ultima && ultima.sobe}`);
    ok(p.rodadasSup === sup.length, `${fmt} N=${N}: rodadasSup=${p.rodadasSup} mas há ${sup.length} rodadas na superior`);

    // toda rodada ímpar tem UMA ação (folga ou repescagem); rodada par não tem nenhuma
    p.rodadas.forEach((r) => {
      if (r.impar) ok(r.acao === 'bye' || r.acao === 'repescagem',
        `${fmt} N=${N} ${r.fase}-R${r.rodada}: E ímpar sem ação (acao=${r.acao})`);
      else ok(r.acao === null, `${fmt} N=${N} ${r.fase}-R${r.rodada}: E par não pode ter ação (acao=${r.acao})`);
    });

    // B deixou de ser a potência de 2: a chave não é mais inflada
    ok(p.B === N, `${fmt} N=${N}: B deveria ser o próprio N (chave não inflada), veio ${p.B}`);
  }
});

console.log('── 1b) a chave inferior da DUPLA consome exatamente quem cai da superior ──');
for (let N = 4; N <= 64; N++) {
  const p = plano(N, 'dupla');
  const sup = p.rodadas.filter((r) => r.fase === 'VC');
  const inf = p.rodadas.filter((r) => r.fase === 'PD');
  ok(inf.length === p.rodadasInf, `N=${N}: rodadasInf=${p.rodadasInf} mas há ${inf.length} rodadas na inferior`);
  // cada rodada da inferior recebe os vivos da anterior + as quedas da superior daquele momento
  let vivos = 0;
  inf.forEach((r) => {
    const daSup = sup.filter((s) => s.rodada === r.aposSup)[0];
    const caem = daSup ? daSup.desce : 0;
    ok(r.E === vivos + caem,
      `N=${N} PD-R${r.rodada}: deveria receber ${vivos}+${caem}=${vivos + caem}, recebeu ${r.E}`);
    ok(r.jogos === teto(r.E), `N=${N} PD-R${r.rodada}: E=${r.E} deveria dar ${teto(r.E)} jogos, deu ${r.jogos}`);
    vivos = r.sobe;
  });
  ok(vivos === 1, `N=${N}: a inferior deveria terminar em 1 campeão, terminou em ${vivos}`);
}

console.log('── 2) tabela oficial de plano(N), N = 8..16 ──');
// Gerada do motor e conferida contra a recorrência à mão. Se um número mudar aqui,
// o desenho mudou — e mudar desenho é decisão do dono, não efeito colateral.
const TABELA = {
  8:  { rodadasSup: 3, rodadasInf: 4, teto: 2, sByes: 0, sRep: 0, sModo: 'exata',      sJogos: 7,  dByes: 0, dRep: 1, dModo: 'repescagem', dJogos: 15 },
  9:  { rodadasSup: 4, rodadasInf: 5, teto: 2, sByes: 1, sRep: 2, sModo: 'misto',      sJogos: 10, dByes: 2, dRep: 3, dModo: 'misto',      dJogos: 19 },
  10: { rodadasSup: 4, rodadasInf: 5, teto: 2, sByes: 1, sRep: 1, sModo: 'misto',      sJogos: 10, dByes: 2, dRep: 3, dModo: 'misto',      dJogos: 21 },
  11: { rodadasSup: 4, rodadasInf: 5, teto: 2, sByes: 0, sRep: 2, sModo: 'repescagem', sJogos: 12, dByes: 1, dRep: 3, dModo: 'misto',      dJogos: 23 },
  12: { rodadasSup: 4, rodadasInf: 5, teto: 3, sByes: 0, sRep: 1, sModo: 'repescagem', sJogos: 12, dByes: 0, dRep: 2, dModo: 'repescagem', dJogos: 24 },
  13: { rodadasSup: 4, rodadasInf: 5, teto: 3, sByes: 1, sRep: 1, sModo: 'misto',      sJogos: 13, dByes: 2, dRep: 1, dModo: 'misto',      dJogos: 25 },
  14: { rodadasSup: 4, rodadasInf: 5, teto: 3, sByes: 1, sRep: 0, sModo: 'bye',        sJogos: 13, dByes: 3, dRep: 0, dModo: 'bye',        dJogos: 26 },
  15: { rodadasSup: 4, rodadasInf: 5, teto: 3, sByes: 0, sRep: 1, sModo: 'repescagem', sJogos: 15, dByes: 1, dRep: 1, dModo: 'misto',      dJogos: 29 },
  16: { rodadasSup: 4, rodadasInf: 5, teto: 4, sByes: 0, sRep: 0, sModo: 'exata',      sJogos: 15, dByes: 0, dRep: 0, dModo: 'exata',      dJogos: 30 },
};
Object.keys(TABELA).map(Number).forEach((N) => {
  const t = TABELA[N], s = plano(N, 'simples'), d = plano(N, 'dupla');
  ok(s.rodadasSup === t.rodadasSup, `N=${N} rodadasSup ${s.rodadasSup} != ${t.rodadasSup}`);
  ok(d.rodadasInf === t.rodadasInf, `N=${N} rodadasInf ${d.rodadasInf} != ${t.rodadasInf}`);
  ok(s.tetoFolgas === t.teto, `N=${N} tetoFolgas ${s.tetoFolgas} != ${t.teto}`);
  ok(s.byes === t.sByes, `N=${N} simples byes ${s.byes} != ${t.sByes}`);
  ok(s.repescagens === t.sRep, `N=${N} simples repescagens ${s.repescagens} != ${t.sRep}`);
  ok(s.modo === t.sModo, `N=${N} simples modo ${s.modo} != ${t.sModo}`);
  ok(d.byes === t.dByes, `N=${N} dupla byes ${d.byes} != ${t.dByes}`);
  ok(d.repescagens === t.dRep, `N=${N} dupla repescagens ${d.repescagens} != ${t.dRep}`);
  ok(d.modo === t.dModo, `N=${N} dupla modo ${d.modo} != ${t.dModo}`);
  ok(chave(N, 'simples').totalJogos === t.sJogos, `N=${N} simples jogos ${chave(N, 'simples').totalJogos} != ${t.sJogos}`);
  ok(chave(N, 'dupla').totalJogos === t.dJogos, `N=${N} dupla jogos ${chave(N, 'dupla').totalJogos} != ${t.dJogos}`);
});

console.log('── 3) contagem de jogos: simples = N−1+rep (N=2..64), dupla = 2N−2+rep (N=4..64) ──');
// Cada jogo elimina exatamente 1 competidor; a repescagem devolve uma vida, então
// custa 1 jogo a mais. N=2 e N=3 na dupla são degenerados (não há chave inferior
// completa nem grande final), por isso a fórmula da dupla começa em 4.
for (let N = 2; N <= 64; N++) {
  const c = chave(N, 'simples');
  const esperado = N - 1 + c.plano.repescagens;
  ok(c.totalJogos === esperado, `N=${N} simples total ${c.totalJogos} != ${esperado}`);
}
for (let N = 4; N <= 64; N++) {
  const c = chave(N, 'dupla');
  const esperado = 2 * N - 2 + c.plano.repescagens;
  ok(c.totalJogos === esperado, `N=${N} dupla total ${c.totalJogos} != ${esperado}`);
}

console.log('── 4) EMPARELHAMENTO ADJACENTE: VC-R1-Pk = #(2k−1) x #2k, em qualquer N ──');
// Este é o invariante que compra a admissão de tardio sem resorteio. O par do seed
// i é sempre o vizinho, e o vizinho NÃO depende de N — por isso crescer N não move
// confronto nenhum. (Na fórmula inflada o par de i era 2B+1−i e mudava junto com B.)
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 64; N++) {
    const r1 = chave(N, fmt).jogos.filter((j) => j.fase === 'VC' && j.rodada === 1);
    const normais = r1.filter((j) => j.tipo === 'normal');
    ok(normais.length === piso(N), `${fmt} N=${N}: R1 deveria ter ${piso(N)} jogos normais, tem ${normais.length}`);
    normais.forEach((j, k) => {
      const seeds = j.entradas.filter((e) => e.tipo === 'seed').map((e) => e.seed).sort((a, b) => a - b);
      ok(seeds.length === 2 && seeds[0] === 2 * k + 1 && seeds[1] === 2 * k + 2,
        `${fmt} N=${N} ${j.id}: seeds=${seeds} (esperado ${2 * k + 1},${2 * k + 2})`);
    });
    // e a SOBRA do N ímpar é sempre a ÚLTIMA posição — a que o tardio ocupa
    if (N % 2 === 1) {
      const sobra = r1.filter((j) => j.tipo !== 'normal');
      ok(sobra.length === 1, `${fmt} N=${N}: deveria haver exatamente 1 jogo de sobra na R1, há ${sobra.length}`);
      const seedSobra = sobra[0] && sobra[0].entradas.filter((e) => e.tipo === 'seed').map((e) => e.seed);
      ok(seedSobra && seedSobra.length === 1 && seedSobra[0] === N,
        `${fmt} N=${N}: a sobra da R1 deveria ser o seed #${N} (a última posição), veio ${seedSobra}`);
    }
  }
});

console.log('── 5) nenhum jogo normal da R1 some de N -> N+1, N = 2..63 ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 63; N++) {
    const d = delta(N, N + 1, fmt);
    const mortos = d.destruidos.filter((x) => x.era.indexOf('normal') === 0);
    ok(mortos.length === 0, `${fmt} N=${N}->${N + 1} destruiu confronto normal: ${JSON.stringify(mortos)}`);
  }
});

console.log('── 6) NÃO existe mais ponto de ruptura (a chave não dobra em nenhum N) ──');
// Era o oposto: 8→9, 16→17, 32→33 eram "redesenho total" e exigiam confirmação do
// organizador. Com a árvore mínima o inscrito seguinte só completa a última posição
// ou abre um jogo novo no fim. Se algum N voltar a alertar, a inflação voltou.
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 63; N++) {
    ok(delta(N, N + 1, fmt).redesenhoTotal === false, `${fmt} ${N}->${N + 1} declarou redesenho total`);
  }
});
[2, 4, 8, 16, 32, 64].forEach((N) => {
  ok(avisoPotencia2(N).alerta === false, `avisoPotencia2(${N}) não pode alertar: a chave não dobra`);
  ok(avisoPotencia2(N).vagasAteDobrar === 0, `avisoPotencia2(${N}).vagasAteDobrar deveria ser 0`);
});

console.log('── 7) ids únicos dentro de cada chave, N = 2..64, ambos formatos ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 64; N++) {
    const ids = chave(N, fmt).jogos.map((j) => j.id);
    ok(ids.length === new Set(ids).size, `N=${N} ${fmt}: ids duplicados`);
  }
});

console.log('── 8) política de FOLGA: teto respeitado, nunca em semi/final, nunca na R1 da principal ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 64; N++) {
    const p = plano(N, fmt);
    const comFolga = p.rodadas.filter((r) => r.acao === 'bye');
    ok(comFolga.length === p.byes, `${fmt} N=${N}: plano diz ${p.byes} folgas mas há ${comFolga.length} rodadas com folga`);
    ok(p.byes <= p.tetoFolgas, `${fmt} N=${N}: ${p.byes} folgas ultrapassa o teto de ${p.tetoFolgas}`);
    ok(p.tetoFolgas === Math.max(1, Math.floor(N / 4)), `${fmt} N=${N}: teto ${p.tetoFolgas} != 3 a cada 12`);
    comFolga.forEach((r) => {
      // >=3 rodadas até a final DAQUELA chave => a folga nunca cai em semi nem final
      ok(r.ateFinalChave >= 3,
        `${fmt} N=${N}: folga em ${r.fase}-R${r.rodada} a ${r.ateFinalChave} rodada(s) da final (semi/final não pode)`);
      // REGRA DO DONO (jul/2026): na 1ª rodada da principal a sobra é o ÚLTIMO
      // INSCRITO — o tardio. Ele joga a repescagem; folga ali é proibida.
      ok(!(r.fase === 'VC' && r.rodada === 1),
        `${fmt} N=${N}: folga na 1ª rodada da principal — o último inscrito avançaria sem jogar`);
    });
    // e o que sobrou de ímpar sem folga virou repescagem: as duas somam as rodadas ímpares
    const impares = p.rodadas.filter((r) => r.impar).length;
    ok(p.byes + p.repescagens === impares,
      `${fmt} N=${N}: ${impares} rodadas ímpares mas ${p.byes} folgas + ${p.repescagens} repescagens`);
  }
});

console.log('── 8b) a 1ª rodada da principal com N ímpar entra por REPESCAGEM (nunca folga) ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 3; N <= 64; N += 2) {
    const r1 = chave(N, fmt).jogos.filter((j) => j.fase === 'VC' && j.rodada === 1);
    const sobra = r1.filter((j) => j.tipo !== 'normal')[0];
    ok(sobra && sobra.tipo === 'repescagem',
      `${fmt} N=${N}: a sobra da R1 é '${sobra && sobra.tipo}' — tinha que ser repescagem`);
    if (!sobra || sobra.tipo !== 'repescagem') continue;
    // ela enfrenta o perdedor do PRIMEIRO jogo normal da própria rodada…
    ok(sobra.origemRepescado === 'VC-R1-P1',
      `${fmt} N=${N}: repescagem vem de ${sobra.origemRepescado}, esperado VC-R1-P1`);
    // …e a descida daquele perdedor é ADIADA (senão ele estaria em dois lugares)
    const origem = chave(N, fmt).porId['VC-R1-P1'];
    ok(origem.perdedorDesce === false,
      `${fmt} N=${N}: VC-R1-P1 ainda solta perdedor — quem desce tem que ser o perdedor da repescagem`);
  }
});

console.log('── 9) o caso N=11 (simples) por extenso ──');
{
  const r1 = chave(11, 'simples').jogos.filter((j) => j.fase === 'VC' && j.rodada === 1);
  ok(r1.length === 6, `N=11: R1 deveria ter 6 jogos (teto(11/2)), tem ${r1.length}`);
  ok(r1.filter((j) => j.tipo === 'normal').length === 5, `N=11: 5 jogos normais esperados`);
  ok(r1.filter((j) => j.tipo === 'repescagem').length === 1, `N=11: 1 repescagem esperada`);
  ok(r1.filter((j) => j.tipo === 'bye').length === 0, `N=11: nenhuma folga na R1`);

  const par = (j) => j.entradas.filter((e) => e.tipo === 'seed').map((e) => e.seed).sort((a, b) => a - b).join('x');
  const conf = r1.filter((j) => j.tipo === 'normal').map(par);
  ok(JSON.stringify(conf) === JSON.stringify(['1x2', '3x4', '5x6', '7x8', '9x10']),
    `N=11: confrontos normais ${JSON.stringify(conf)}`);
  ok(par(r1[5]) === '11', `N=11: a sobra deveria ser o seed #11, veio ${par(r1[5])}`);

  const p = plano(11, 'simples');
  ok(JSON.stringify(p.rodadas.map((r) => r.jogos)) === JSON.stringify([6, 3, 2, 1]),
    `N=11 simples: rodadas ${JSON.stringify(p.rodadas.map((r) => r.jogos))} (esperado 6,3,2,1)`);
  // 11 jogam a R1 inteira: 10 nos jogos normais + a sobra na repescagem. Ninguém folga.
  const jogamR1 = r1.reduce((s, j) => s + (j.tipo === 'normal' ? 2 : 1), 0);
  ok(jogamR1 === 11, `N=11: deveriam jogar a R1 os 11 inscritos, jogam ${jogamR1}`);
}

console.log('── 9b) o caso canônico: 12 duplas (validado pelo dono) ──');
{
  const p = plano(12, 'dupla'), c = chave(12, 'dupla');
  const sup = p.rodadas.filter((r) => r.fase === 'VC').map((r) => r.jogos);
  const inf = p.rodadas.filter((r) => r.fase === 'PD').map((r) => r.jogos);
  ok(JSON.stringify(sup) === JSON.stringify([6, 3, 2, 1]), `12 duplas: superior ${JSON.stringify(sup)} (esperado 6,3,2,1)`);
  ok(JSON.stringify(inf) === JSON.stringify([3, 3, 2, 2, 1]), `12 duplas: inferior ${JSON.stringify(inf)} (esperado 3,3,2,2,1)`);
  ok(c.totalJogos === 24, `12 duplas: ${c.totalJogos} jogos (esperado 24)`);
  ok(p.byes === 0, `12 duplas: ${p.byes} folgas (esperado ZERO)`);
  ok(p.repescagens === 2, `12 duplas: ${p.repescagens} repescagens (esperado 2)`);
  ok(!!c.porId['GF'], '12 duplas: sem grande final');
}

console.log('\n' + (fail === 0 ? '✅ chaves-aceite: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
