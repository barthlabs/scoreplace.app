// CRESCIMENTO A PARTIR DE PREFIXO CONGELADO — a regra do dono pra CHAVE CHEIA.
//
// Dono, 25/jul/2026: _"avisa na 9a que precisa da 10a, mas nao mexe nos outros jogos. só cria
// jogo entre 9 e 10"_ + _"nao é só 9/10. o 17/18, 33/34... todos que passarem 1 de pow2"_.
//
// Numa chave com a R1 CHEIA não há vaga: encaixar mais um só seria possível redesenhando a
// semeadura, que é o desastre do torneio de casais ("era para eles entrarem no jogo 7 sem mudar
// nenhum dos demais 6. mudou tudo"). Então a R1 publicada é CONGELADA, os tardios entram AOS
// PARES num jogo novo, e só o downstream é redesenhado.
//
// NOTA (jul/2026): "chave cheia" deixou de ser sinônimo de "potência de 2". Aquilo valia na
// fórmula inflada, em que N virava B = próxima potência de 2 e o resto era folga. Na árvore
// mínima a R1 tem piso(N/2) jogos normais, então TODO N PAR nasce cheio e cresce por aqui —
// o ímpar é que deixa sobra, e para ele o recálculo normal já resolve.
//
// Este arquivo é a cerca das INVARIANTES — o que precisa valer em TODO cenário, e é isso que
// distingue "a chave cresceu" de "a chave virou um grafo quebrado":
//   1. todo confronto publicado sobrevive com o MESMO id e o MESMO par;
//   2. tardio ímpar NÃO entra (espera par) e o motivo é 'falta-par';
//   3. jogando a chave inteira até o fim: nenhum auto-confronto (Time X vs Time X);
//   4. ninguém vivo em dois jogos ao mesmo tempo (double-book);
//   5. nenhum jogo fica pendente — a chave FECHA num campeão único.
//
// A 5 é a que pega slot morto: um jogo da inferior que ninguém alimenta trava a cadeia e a
// grande final nunca enche. Foi assim que dois bugs reais deste motor apareceram (aresta
// interna da inferior sem namespace, e queda consumida duas vezes pela inversão anti-revanche).
const H = require('./headless');
const W = H.window;
const A = W._chavesAdapter;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const BYE = 'BYE (Avança Direto)';
const vazio = (v) => !v || v === 'TBD' || v === BYE;
function parts(n, off) {
  const a = [];
  for (let i = 1; i <= n; i++) { const k = (off || 0) + i; a.push({ displayName: 'P' + k, uid: 'u' + k }); }
  return a;
}

// Base com R1 CHEIA = todo jogo com os dois lados reais. É exatamente quando o
// crescimento com prefixo congelado entra.
//
// ANTES eram só as potências de 2: com a chave inflada até B, qualquer N que não
// fosse potência de 2 nascia com folga na R1 (N=6 virava B=8 com 2 byes). Com a
// ÁRVORE MÍNIMA isso mudou — a R1 tem piso(N/2) jogos normais, então TODO N PAR
// nasce cheio e é candidato a crescer. Os ímpares são os que deixam sobra, e caem
// no bloco de recusa no fim do arquivo.
const BASES = [2, 4, 6, 8, 10, 12, 16, 20, 32];

['simples', 'dupla'].forEach((fmt) => {
  BASES.forEach((N) => {
    [1, 2, 3, 4, 5, 6].forEach((L) => {
      const tag = fmt + ' N=' + N + ' +' + L;
      const base = A.build(N, fmt, { participantes: parts(N), ns: 'p0' });
      const g = A.crescerComPrefixo(base.matches, parts(L, 100), fmt, { ns: 'p0' });

      // ── (2) ímpar sozinho espera par ──
      if (L === 1) {
        ok(!g.ok && g.motivo === 'falta-par',
          tag + ': tardio sozinho ESPERA par (motivo falta-par) — got ' + (g.ok ? 'entrou' : g.motivo));
        return;
      }
      if (!g.ok) { ok(false, tag + ': recusou (' + g.motivo + ')'); return; }

      const ms = g.matches;

      // ── (1) confronto publicado intocado ──
      const antes = base.matches.filter((m) => m.round === 1 && !vazio(m.p1) && !vazio(m.p2))
        .map((m) => m.id + '|' + m.p1 + '|' + m.p2);
      const depois = ms.filter((m) => m.round === 1).map((m) => m.id + '|' + m.p1 + '|' + m.p2);
      ok(antes.every((x) => depois.indexOf(x) !== -1), tag + ': R1 publicada INTACTA (id e par)');

      // ímpar: entra o par, sobra 1 esperando
      ok(g.criados === Math.floor(L / 2), tag + ': criou ' + Math.floor(L / 2) + ' jogo(s) novo(s) (got ' + g.criados + ')');
      ok((g.sobrando || []).length === (L % 2), tag + ': ' + (L % 2) + ' sobrando sem par (got ' + (g.sobrando || []).length + ')');

      // ── (3,4,5) joga a chave INTEIRA ──
      const t = { id: 'GROW', format: fmt === 'dupla' ? 'Dupla Eliminatória' : 'Eliminatórias Simples', matches: ms };
      let guard = 0, erro = null;
      while (guard++ < 800) {
        const self = ms.find((m) => !vazio(m.p1) && !vazio(m.p2) && String(m.p1) === String(m.p2));
        if (self) { erro = 'AUTO-CONFRONTO em ' + self.id + ' (' + self.p1 + ')'; break; }
        const jogaveis = ms.filter((m) => !m.winner && !m.isBye && !vazio(m.p1) && !vazio(m.p2));
        if (!jogaveis.length) break;
        const m = jogaveis[0];
        m.winner = m.p1;
        try { W._advanceWinner(t, m); } catch (e) { erro = 'advanceWinner: ' + e.message; break; }
      }
      ok(!erro, tag + ': playout sem auto-confronto/erro (' + (erro || 'ok') + ')');
      if (erro) return;

      const slots = {};
      ms.filter((m) => !m.winner).forEach((m) => ['p1', 'p2'].forEach((s) => {
        if (!vazio(m[s])) (slots[m[s]] = slots[m[s]] || []).push(m.id);
      }));
      const dup = Object.keys(slots).find((v) => slots[v].length > 1);
      ok(!dup, tag + ': ninguém vivo em 2 jogos (double-book: ' + (dup || 'nenhum') + ')');

      const pendentes = ms.filter((m) => !m.winner && !m.isBye);
      ok(!pendentes.length, tag + ': chave FECHA — 0 jogos pendentes (got ' + pendentes.length +
        (pendentes.length ? ': ' + pendentes.slice(0, 3).map((m) => m.id).join(',') : '') + ')');

      const fim = fmt === 'dupla'
        ? ms.filter((m) => m.bracket === 'grand')
        : ms.filter((m) => m.round === Math.max.apply(null, ms.map((x) => x.round)));
      ok(fim.length >= 1 && !!fim[fim.length - 1].winner, tag + ': campeão único coroado');
    });
  });
});

// ── prefixo INCOMPLETO não cresce: recusa explícita, nunca chave inválida ──
// A R1 com sobra (folga ou repescagem) não fecha o mapeamento — nem todo jogo produz
// vencedor E perdedor —, e é justamente o caso em que o recálculo NORMAL funciona, então
// recusar aqui não custa nada.
//
// Na árvore mínima quem deixa sobra é o N ÍMPAR (piso(N/2) jogos normais + 1 posição
// solta). N=6 saiu desta lista: hoje ele dá 3 jogos exatos e CRESCE — está nas BASES.
[3, 5, 7, 9, 11, 15].forEach((N) => {
  const base = A.build(N, 'dupla', { participantes: parts(N), ns: 'p0' });
  const g = A.crescerComPrefixo(base.matches, parts(2, 100), 'dupla', { ns: 'p0' });
  ok(!g.ok && g.motivo === 'prefixo-com-folga',
    'N=' + N + ' (R1 com folga): recusa explícita em vez de chave inválida — got ' + (g.ok ? 'cresceu' : g.motivo));
});

console.log('\n' + (fail === 0 ? '✅ growth-frozen-prefix: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS (' + fails.length + '):'); fails.slice(0, 25).forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
