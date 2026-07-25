/* ADAPTER chaves.js -> match do app: JOGA A CHAVE INTEIRA com o motor REAL.
 * node tests/chaves-adapter.test.js
 *
 * Não testa a declaração — testa o COMPORTAMENTO: monta a chave pelo adapter e
 * joga até o campeão chamando o `_advanceWinner` de verdade (bracket-logic.js),
 * o mesmo que roda em produção quando alguém lança um placar.
 *
 * Cobre o que o teatro de teste não pegaria:
 *   1 — sai EXATAMENTE 1 campeão, e nenhum jogo real fica órfão (sem vencedor
 *       ou com slot 'TBD' pendente). Órfão = jogo que trava o torneio na quadra.
 *   2 — durante a partida INTEIRA ninguém enfrenta a si mesmo (o bug da 1.5.5).
 *   3 — TARDIO: entra participante, recalcula a chave e os resultados já lançados
 *       continuam ancorados no MESMO jogo (é isto que o id estrutural compra) —
 *       e nenhum confronto já existente muda.
 *   4 — a reconciliação devolve `perdidos` quando cruza potência de 2, em vez de
 *       engolir resultado em silêncio.
 */
const H = require('./headless.js');
H.load('chaves.js');
H.load('chaves-adapter.js');
H.load('bracket-logic.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const isBye = (x) => !x || x === 'TBD' || /BYE/.test(String(x));
const parts = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'D' + (i + 1), uid: 'u' + (i + 1) }));

function novoTorneio(N, formato) {
  const built = W._chavesAdapter.build(N, formato, { participantes: parts(N), tierThird: true });
  return {
    t: { id: 'tst', format: formato === 'dupla' ? 'Dupla Eliminatória' : 'Eliminatórias Simples', matches: built.matches },
    meta: built.meta
  };
}

/** Joga tudo que estiver pronto até não sobrar jogo jogável. p1 sempre vence. */
function jogarTudo(t, onMatch) {
  let guard = 0;
  for (;;) {
    if (++guard > 5000) throw new Error('loop infinito no playout');
    const pronto = t.matches.find((m) => !m.winner && !isBye(m.p1) && !isBye(m.p2));
    if (!pronto) break;
    if (onMatch) onMatch(pronto);
    pronto.winner = pronto.p1;
    pronto.scoreP1 = 6; pronto.scoreP2 = 3; pronto.resultAt = 1;
    W._advanceWinner(t, pronto);
  }
}

console.log('── 1 e 2) joga a chave inteira: 1 campeão, zero órfãos, zero auto-confronto ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 24; N++) {
    const { t, meta } = novoTorneio(N, fmt);
    let autoConfronto = null;
    jogarTudo(t, (m) => {
      if (m.p1 === m.p2) autoConfronto = `${fmt} N=${N} ${m.id}: ${m.p1} contra si mesmo`;
    });
    ok(!autoConfronto, autoConfronto || '');

    // GF-EXTRA é condicional (só existe se o vice vencer a grande final) — não conta como órfão.
    const orfaos = t.matches.filter((m) => !m.winner && !m.isExtra && !isBye(m.p1) && !isBye(m.p2));
    ok(orfaos.length === 0, `${fmt} N=${N}: ${orfaos.length} jogo(s) órfão(s): ${orfaos.map((m) => m.id).join(', ')}`);

    const final = t.matches.find((m) => m.id === meta.finalId);
    ok(final && !!final.winner, `${fmt} N=${N}: final ${meta.finalId} sem campeão`);

    // 3º/4º: existe na Eliminatória Simples com semifinal (N>=4 => 2+ rodadas) e
    // recebe os DOIS perdedores de semifinal. Na Dupla NÃO existe — o 3º sai como
    // perdedor do último jogo da chave inferior, sem partida extra.
    const terceiro = t.matches.find((m) => m.isThirdPlace);
    if (fmt === 'dupla') {
      ok(!terceiro, `dupla N=${N}: não deveria existir jogo de 3º/4º`);
    } else if (N >= 4) {
      ok(!!terceiro, `simples N=${N}: faltou a disputa de 3º/4º`);
      if (terceiro) {
        ok(!isBye(terceiro.p1) && !isBye(terceiro.p2),
          `simples N=${N}: 3º/4º ficou com slot vazio (${terceiro.p1} x ${terceiro.p2})`);
        ok(!!terceiro.winner, `simples N=${N}: 3º/4º não foi disputado`);
      }
    }
  }
});

console.log('── 3) TARDIO: recalcula e os resultados continuam no MESMO jogo ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 5; N <= 23; N++) {
    const { plano } = W._chaves;
    if (plano(N).B !== plano(N + 1).B) continue; // cruzar pow2 é redesenho declarado (teste 4)

    // sorteia, joga UM jogo da R1, e então entra o tardio
    const antes = W._chavesAdapter.build(N, fmt, { participantes: parts(N) });
    const t = { id: 'tst', format: fmt === 'dupla' ? 'Dupla Eliminatória' : 'Eliminatórias Simples', matches: antes.matches };
    const jogo = t.matches.find((m) => m.round === 1 && !isBye(m.p1) && !isBye(m.p2));
    if (!jogo) continue;
    const idJogado = jogo.id, p1Jogado = jogo.p1, p2Jogado = jogo.p2;
    jogo.winner = jogo.p1; jogo.scoreP1 = 6; jogo.scoreP2 = 4; jogo.resultAt = 1;

    // tardio entra: participantes[] cresce, chave é REDESENHADA do zero
    const depois = W._chavesAdapter.build(N + 1, fmt, { participantes: parts(N + 1) });
    const rec = W._chavesAdapter.reconciliar(t.matches, depois.matches);

    const mesmo = rec.matches.find((m) => m.id === idJogado);
    ok(!!mesmo, `${fmt} N=${N}->${N + 1}: jogo ${idJogado} sumiu no recálculo`);
    if (mesmo) {
      ok(mesmo.winner === p1Jogado && mesmo.scoreP1 === 6 && mesmo.scoreP2 === 4,
        `${fmt} N=${N}->${N + 1}: resultado de ${idJogado} não sobreviveu (winner=${mesmo.winner})`);
      ok(mesmo.p1 === p1Jogado && mesmo.p2 === p2Jogado,
        `${fmt} N=${N}->${N + 1}: ${idJogado} trocou de adversários (${p1Jogado} x ${p2Jogado} -> ${mesmo.p1} x ${mesmo.p2})`);
    }
    ok(rec.perdidos.length === 0, `${fmt} N=${N}->${N + 1}: perdeu resultado de ${rec.perdidos.map((x) => x.id).join(', ')}`);

    // e a chave nova ainda joga inteira, sem órfão
    const t2 = { id: 'tst', format: t.format, matches: rec.matches };
    jogarTudo(t2);
    const orfaos = t2.matches.filter((m) => !m.winner && !m.isExtra && !isBye(m.p1) && !isBye(m.p2));
    ok(orfaos.length === 0, `${fmt} N=${N}->${N + 1}: pós-tardio ficou ${orfaos.length} órfão(s)`);
  }
});

console.log('── 4) cruzar potência de 2 DECLARA a perda (não engole em silêncio) ──');
{
  const antes = W._chavesAdapter.build(16, 'simples', { participantes: parts(16) });
  const t = { id: 'tst', format: 'Eliminatórias Simples', matches: antes.matches };
  const j = t.matches.find((m) => m.round === 1 && !isBye(m.p1) && !isBye(m.p2));
  j.winner = j.p1; j.scoreP1 = 6; j.scoreP2 = 0; j.resultAt = 1;

  const depois = W._chavesAdapter.build(17, 'simples', { participantes: parts(17) });
  const rec = W._chavesAdapter.reconciliar(t.matches, depois.matches);
  ok(rec.perdidos.length > 0, '16->17 deveria DECLARAR resultado perdido (redesenho total), mas devolveu 0');

  const aviso = W._chaves.avisoPotencia2(16);
  ok(aviso.alerta === true, 'avisoPotencia2(16) deveria alertar que a próxima inscrição dobra a chave');
  ok(W._chaves.avisoPotencia2(11).alerta === false, 'avisoPotencia2(11) não deveria alertar');
  ok(W._chaves.podeRedesenhar({ 'VC-R1-P2': {} }).ok === false, 'podeRedesenhar deveria travar com resultado lançado');
  ok(W._chaves.podeRedesenhar({}).ok === true, 'podeRedesenhar deveria liberar sem resultado');
}

console.log('\n' + (fail === 0 ? '✅ chaves-adapter: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
