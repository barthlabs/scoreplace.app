/* MOTOR DE CHAVES — STRESS DOS INVARIANTES QUE FALHARAM AO VIVO (1.5.2 → 1.5.5)
 * node tests/chaves-stress.test.js
 *
 * Cada bloco aqui corresponde a um bug REAL que quebrou no torneio de casais.
 * Não é teste de cobertura — é cerca em volta de cova conhecida.
 *
 *  A/B — AUTO-CONFRONTO (Time X vs Time X). Foi o bug da 1.5.5 ("blindagem
 *        anti-auto-confronto na re-propagação, visto AO VIVO"). B não olha só a
 *        declaração: SIMULA a chave inteira até o campeão propagando vencedores
 *        e perdedores reais, e confere que ninguém joga contra si mesmo.
 *    C — TARDIO NÃO ALTERA CONFRONTO EXISTENTE, na chave INTEIRA (superior +
 *        inferior + grande final), nos dois formatos. O teste de aceite nº 5 só
 *        cobre a R1 do formato simples; o fiasco foi na dupla eliminatória.
 *    D — cada tardio cria EXATAMENTE 1 jogo normal novo (nem 0 — bug da 1.5.2,
 *        "presença pós-sorteio SEMPRE gera jogo" — nem 2, que duplicaria).
 *    E — cada participante entra na chave EXATAMENTE uma vez: ninguém some
 *        (tardio sem jogo) e ninguém aparece em dois slots (raiz do auto-confronto).
 *    F — todo perdedor de jogo disputado da superior tem POUSO na inferior. Foi
 *        o bug da 1.5.4 ("dupla tardia também abre jogo na R1 INFERIOR").
 *
 * Se qualquer um destes ficar vermelho, alguém reintroduziu patch incremental
 * na chave — o modelo que gerou ~1.250 linhas de cirurgia e quebrou em quadra.
 */
const H = require('./headless.js');
H.load('chaves.js');
const { plano, chave } = H.window._chaves;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const assinatura = (j) => j.tipo + ':' + j.entradas
  .map((e) => (e.tipo === 'seed' ? '#' + e.seed : e.tipo === 'vazio' ? '-' : e.tipo + '(' + e.de + ')'))
  .join(' x ');

console.log('── A) auto-confronto declarado: nenhum jogo tem a mesma origem dos dois lados ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 64; N++) {
    chave(N, fmt).jogos.forEach((j) => {
      const [e1, e2] = j.entradas;
      if (!e1 || !e2) return;
      if (e1.tipo === 'seed' && e2.tipo === 'seed') {
        ok(e1.seed !== e2.seed, `${fmt} N=${N} ${j.id}: seed #${e1.seed} contra si mesmo`);
      }
      // GF-EXTRA é a exceção legítima: vencedor(GF) x perdedor(GF) são pessoas distintas.
      if (e1.de && e2.de && e1.de === e2.de && j.id !== 'GF-EXTRA') {
        ok(false, `${fmt} N=${N} ${j.id}: ambas entradas vêm de ${e1.de} (${e1.tipo} x ${e2.tipo})`);
      }
    });
  }
});

console.log('── B) auto-confronto REAL: joga a chave inteira até o campeão, N = 2..64 ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 64; N++) {
    const c = chave(N, fmt);
    const res = {}; // id -> {v, p, pBruto} com equipes CONCRETAS (seed) ou null p/ BYE
    const resolve = (e) => {
      if (e.tipo === 'vazio') return null;
      if (e.tipo === 'seed') return e.seed <= N ? e.seed : null;
      const f = res[e.de];
      if (!f) return null;
      if (e.tipo === 'vencedor') return f.v;
      if (e.tipo === 'repescado') return f.pBruto;
      return c.porId[e.de].perdedorDesce === false ? null : f.p;
    };
    c.ordem.forEach((id) => {
      const j = c.porId[id];
      const a = resolve(j.entradas[0]);
      const b = resolve(j.entradas[1]);
      if (a !== null && b !== null) {
        ok(a !== b, `${fmt} N=${N} ${j.id}: equipe #${a} jogaria contra ELA MESMA`);
      }
      // vencedor determinístico (menor seed) só para propagar a simulação
      if (a === null && b === null) res[j.id] = { v: null, p: null, pBruto: null };
      else if (a === null || b === null) res[j.id] = { v: a === null ? b : a, p: null, pBruto: null };
      else res[j.id] = { v: Math.min(a, b), p: Math.max(a, b), pBruto: Math.max(a, b) };
    });
  }
});

console.log('── C) tardio NÃO altera confronto existente — chave INTEIRA, ambos formatos ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 63; N++) {
    if (plano(N).B !== plano(N + 1).B) continue; // cruzar pow2 redesenha: é esperado e declarado
    const antes = chave(N, fmt), depois = chave(N + 1, fmt);
    antes.jogos.forEach((j) => {
      if (j.tipo === 'bye' || j.tipo === 'repescagem') return; // camada DERIVADA: pode mudar
      const d = depois.porId[j.id];
      ok(!!d, `${fmt} N=${N}->${N + 1}: jogo ${j.id} (${j.tipo}) DESAPARECEU`);
      if (d) {
        ok(assinatura(j) === assinatura(d),
          `${fmt} N=${N}->${N + 1}: ${j.id} MUDOU\n      era:   ${assinatura(j)}\n      virou: ${assinatura(d)}`);
      }
    });
  }
});

console.log('── D) cada tardio cria EXATAMENTE 1 jogo normal novo na R1 ──');
{
  const nR1 = (M) => chave(M, 'simples').jogos
    .filter((j) => j.fase === 'VC' && j.rodada === 1 && j.tipo === 'normal').length;
  for (let N = 2; N <= 63; N++) {
    if (plano(N).B !== plano(N + 1).B) continue;
    ok(nR1(N + 1) === nR1(N) + 1, `N=${N}->${N + 1}: normais na R1 ${nR1(N)} -> ${nR1(N + 1)} (esperado +1)`);
  }
}

console.log('── E) cada participante entra na chave EXATAMENTE 1 vez, N = 2..64 ──');
['simples', 'dupla'].forEach((fmt) => {
  for (let N = 2; N <= 64; N++) {
    const cont = new Map();
    chave(N, fmt).jogos.forEach((j) => j.entradas.forEach((e) => {
      if (e.tipo === 'seed' && e.seed <= N) cont.set(e.seed, (cont.get(e.seed) || 0) + 1);
    }));
    for (let s = 1; s <= N; s++) {
      ok(cont.get(s) === 1, `${fmt} N=${N}: seed #${s} aparece ${cont.get(s) || 0}x na chave (esperado 1)`);
    }
  }
});

console.log('── F) dupla elim: perdedor da superior SEMPRE tem pouso na inferior ──');
for (let N = 4; N <= 64; N++) {
  const c = chave(N, 'dupla');
  const consumidos = new Set();
  c.jogos.forEach((j) => j.entradas.forEach((e) => { if (e.tipo === 'perdedor') consumidos.add(e.de); }));
  c.jogos.forEach((j) => {
    if (j.fase !== 'VC' || j.perdedorDesce === false || j.tipo === 'bye') return;
    ok(consumidos.has(j.id), `N=${N}: perdedor de ${j.id} (${j.tipo}) não tem destino na inferior`);
  });
}

console.log('\n' + (fail === 0 ? '✅ chaves-stress: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
