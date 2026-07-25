/* MOTOR DE CHAVES — TESTES DE ACEITE (spec seção 8) — node tests/chaves-aceite.test.js
 *
 * Trava o desenho determinístico de js/views/chaves.js: a chave é função pura de
 * (N, formato). Cada N tem UM desenho. Estes testes são a tabela oficial de 8 a 16
 * mais as fórmulas gerais de N=2..64.
 *
 * O que cada teste protege (por que ele existe):
 *  1/1b — a regra do ajuste de entrada (vagas vs perdedores, EMPATE VAI PARA BYE).
 *   2/3 — contagem de jogos: simples = N-1+rep, dupla = 2N-2+rep.
 *     4 — VC-R1-P2 é sempre #8 x #9 de N=9 a 16: o confronto NÃO SE MOVE quando
 *         entra tardio. Se este quebrar, a chave voltou a ser instável.
 *     5 — nenhum jogo normal da R1 desaparece de N -> N+1. Este é o invariante
 *         que falhou ao vivo na 1.5.5 (tardio derrubava confronto existente).
 *     6 — cruzar potência de 2 É redesenho total e deve ser declarado como tal
 *         (o organizador confirma; ver avisoPotencia2).
 *     7 — ids únicos: id é a coordenada estrutural, chave dos resultados.
 *     8 — o caso 11 por extenso (o spec fala "posições 3,4,5 / 1,2" mas se refere
 *         a SEEDS — o seed #2 mora na posição física 5).
 */
const H = require('./headless.js');
H.load('chaves.js');
const { plano, chave, delta } = H.window._chaves;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// Tabela oficial da seção 2 do spec.
const TABELA = {
  8:  { vagas: 0, pool: 4, menor: 0, repesc: 0, byes: 0, simples: 7,  dupla: 14 },
  9:  { vagas: 7, pool: 1, menor: 1, repesc: 1, byes: 6, simples: 9,  dupla: 17 },
  10: { vagas: 6, pool: 2, menor: 2, repesc: 2, byes: 4, simples: 11, dupla: 20 },
  11: { vagas: 5, pool: 3, menor: 3, repesc: 3, byes: 2, simples: 13, dupla: 23 },
  12: { vagas: 4, pool: 4, menor: 4, repesc: 0, byes: 4, simples: 11, dupla: 22 }, // empate -> BYE
  13: { vagas: 3, pool: 5, menor: 3, repesc: 0, byes: 3, simples: 12, dupla: 24 },
  14: { vagas: 2, pool: 6, menor: 2, repesc: 0, byes: 2, simples: 13, dupla: 26 },
  15: { vagas: 1, pool: 7, menor: 1, repesc: 0, byes: 1, simples: 14, dupla: 28 },
  16: { vagas: 0, pool: 8, menor: 0, repesc: 0, byes: 0, simples: 15, dupla: 30 },
};

console.log('── 1) plano(N) bate com a tabela oficial, N = 8..16 ──');
Object.keys(TABELA).map(Number).forEach((N) => {
  const p = plano(N), t = TABELA[N];
  ok(p.vagas === t.vagas, `N=${N} vagas ${p.vagas} != ${t.vagas}`);
  ok(p.pool === t.pool, `N=${N} pool ${p.pool} != ${t.pool}`);
  ok(p.menor === t.menor, `N=${N} menor ${p.menor} != ${t.menor}`);
  ok(p.repescagens === t.repesc, `N=${N} repescagens ${p.repescagens} != ${t.repesc}`);
  ok(p.byes === t.byes, `N=${N} byes ${p.byes} != ${t.byes}`);
});

console.log('── 1b) totalJogos bate com a tabela, N = 8..16 ──');
Object.keys(TABELA).map(Number).forEach((N) => {
  const t = TABELA[N];
  ok(chave(N, 'simples').totalJogos === t.simples, `N=${N} simples ${chave(N, 'simples').totalJogos} != ${t.simples}`);
  ok(chave(N, 'dupla').totalJogos === t.dupla, `N=${N} dupla ${chave(N, 'dupla').totalJogos} != ${t.dupla}`);
});

console.log('── 2) simples: totalJogos === N-1+repescagens, N = 2..64 ──');
for (let N = 2; N <= 64; N++) {
  const c = chave(N, 'simples');
  const esperado = N - 1 + c.plano.repescagens;
  ok(c.totalJogos === esperado, `N=${N} simples total ${c.totalJogos} != ${esperado}`);
}

console.log('── 3) dupla: totalJogos === 2N-2+repescagens, N = 4..64 ──');
for (let N = 4; N <= 64; N++) {
  const c = chave(N, 'dupla');
  const esperado = 2 * N - 2 + c.plano.repescagens;
  ok(c.totalJogos === esperado, `N=${N} dupla total ${c.totalJogos} != ${esperado}`);
}

console.log('── 4) VC-R1-P2 é SEMPRE #8 x #9, N = 9..16 (o confronto não se move) ──');
for (let N = 9; N <= 16; N++) {
  const j = chave(N, 'simples').porId['VC-R1-P2'];
  const seeds = j.entradas.filter((e) => e.tipo === 'seed').map((e) => e.seed).sort((a, b) => a - b);
  ok(j.tipo === 'normal', `N=${N} VC-R1-P2 tipo=${j.tipo} (esperado normal)`);
  ok(seeds[0] === 8 && seeds[1] === 9, `N=${N} VC-R1-P2 seeds=${seeds} (esperado 8,9)`);
}

console.log('── 5) nenhum jogo normal da R1 some de N -> N+1, N = 9..15 ──');
for (let N = 9; N <= 15; N++) {
  const d = delta(N, N + 1, 'simples');
  const mortos = d.destruidos.filter((x) => x.era.indexOf('normal') === 0);
  ok(mortos.length === 0, `N=${N}->${N + 1} destruiu confronto normal: ${JSON.stringify(mortos)}`);
}

console.log('── 6) 16 -> 17 é redesenho total (exige confirmação do organizador) ──');
ok(delta(16, 17, 'simples').redesenhoTotal === true, '16->17 não marcou redesenhoTotal');

console.log('── 7) ids únicos dentro de cada chave, N = 2..64, ambos formatos ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 64; N++) {
    const ids = chave(N, fmt).jogos.map((j) => j.id);
    ok(ids.length === new Set(ids).size, `N=${N} ${fmt}: ids duplicados`);
  }
});

console.log('── 8) o caso N=11 por extenso ──');
{
  const r1 = chave(11, 'simples').jogos.filter((j) => j.fase === 'VC' && j.rodada === 1);
  const normais = r1.filter((j) => j.tipo === 'normal');
  const repesc = r1.filter((j) => j.tipo === 'repescagem');
  const byes = r1.filter((j) => j.tipo === 'bye');
  ok(normais.length === 3, `normais=${normais.length} (esperado 3)`);
  ok(repesc.length === 3, `repescagens=${repesc.length} (esperado 3)`);
  ok(byes.length === 2, `byes=${byes.length} (esperado 2)`);

  const par = (j) => j.entradas.filter((e) => e.tipo === 'seed').map((e) => e.seed).sort((a, b) => a - b).join('x');
  const conf = new Set(normais.map(par));
  ok(conf.has('8x9') && conf.has('7x10') && conf.has('6x11'), `confrontos normais: ${[...conf]} (esperado 8x9, 7x10, 6x11)`);

  // O spec diz "posições 3,4,5" e "1,2" mas se refere a SEEDS: o seed #2 mora na
  // posição física 5. Byes vão para os MELHORES seeds; repescados caem nos piores.
  const dono = (j) => Math.min.apply(null, j.entradas.filter((e) => e.tipo === 'seed').map((e) => e.seed));
  ok(JSON.stringify(repesc.map(dono).sort((a, b) => a - b)) === '[3,4,5]', `seeds com repescagem: ${repesc.map(dono).sort((a, b) => a - b)}`);
  ok(JSON.stringify(byes.map(dono).sort((a, b) => a - b)) === '[1,2]', `seeds com bye: ${byes.map(dono).sort((a, b) => a - b)}`);

  const jogamR1 = r1.filter((j) => j.tipo !== 'bye').reduce((s, j) => s + (j.tipo === 'normal' ? 2 : 1), 0);
  ok(jogamR1 === 9, `jogam a R1: ${jogamR1} (esperado 9)`);
}

console.log('\n' + (fail === 0 ? '✅ chaves-aceite: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
