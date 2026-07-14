/* Lote da busca completa letzplay — node tests/letzplay-batch.test.js
 *
 * Decisão do dono: a busca COMPLETA vai em LOTES DE 20min, começando pelos MAIS
 * DESATUALIZADOS; clica de novo pro próximo lote. Motivo: ela lê o histórico inteiro de
 * cada pessoa (~22 requisições: páginas + 1 por competição) e, em cadência humana
 * (~3,5s por requisição — obrigatória, senão o Cloudflare bloqueia e não vem jogo nenhum),
 * isso dá ~2min por pessoa. 100 inscritos somam ~3h: inaceitável numa tacada, tranquilo
 * em lotes de 20min.
 *
 * A ESSENCIAL não é loteada de propósito: 1 navegação por pessoa (~8s) → 100 em ~14min
 * num clique só; lotear seria burocracia sem ganho.
 *
 * Congela: orçamento de 20min, ordem por antiguidade, nunca-varrido primeiro, e o
 * tamanho do lote acompanhando o custo MEDIDO (não um chute fixo).
 * Ver project_letzplay_scan_stability, feedback_dont_canonize_examples.
 */
const { window, load } = require('./headless.js');
load('tournaments-enrollment-report.js');

const plan = window._lzPlanBatch;
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const MIN = 60000;
function pessoas(n) { const a = []; for (let i = 0; i < n; i++) a.push({ uid: 'u' + i, name: 'P' + i }); return a; }
// scanMap controla a antiguidade de cada um (o planner lê de window._lzRenderCtx).
function comScans(map) { window._lzRenderCtx = { scanMap: map }; }
const diasAtras = (d) => new Date(Date.now() - d * 86400000).toISOString();

// ── 1. O orçamento é 20min por clique ──
{
  comScans({});
  const r = plan(pessoas(100), 'full', 2 * MIN);      // 2min por pessoa
  ok(r.cabem === 10, '20min ÷ 2min = 10 pessoas no lote (veio ' + r.cabem + ')');
  ok(r.targets.length === 10, 'o lote leva 10 (veio ' + r.targets.length + ')');
  ok(r.sobram === 90, '90 ficam pro próximo clique (veio ' + r.sobram + ')');
}

// ── 2. O lote acompanha o custo MEDIDO — não é um número fixo ──
{
  comScans({});
  const liberal = plan(pessoas(100), 'full', 80000);   // letzplay leve → 80s/pessoa
  const pesado  = plan(pessoas(100), 'full', 4 * MIN); // letzplay limitando → 4min/pessoa
  ok(liberal.cabem === 15, 'letzplay liberal (80s) → 15 por lote (veio ' + liberal.cabem + ')');
  ok(pesado.cabem === 5, 'letzplay limitando (4min) → 5 por lote (veio ' + pesado.cabem + ')');
  ok(liberal.cabem > pesado.cabem, 'quanto mais devagar o letzplay, MENOR o lote — o teto de tempo é que manda');
}

// ── 3. Nenhum lote estoura os 20min prometidos ──
{
  comScans({});
  for (const perPessoa of [30000, 80000, 2 * MIN, 4 * MIN, 9 * MIN]) {
    const r = plan(pessoas(100), 'full', perPessoa);
    ok(r.targets.length * perPessoa <= 20 * MIN,
      'lote com ' + (perPessoa / 1000) + 's/pessoa não pode passar de 20min (deu ' + Math.round(r.targets.length * perPessoa / MIN) + 'min)');
  }
}
// pessoa mais cara que o orçamento inteiro → ainda leva 1 (senão nunca sairia do lugar)
{
  comScans({});
  const r = plan(pessoas(5), 'full', 45 * MIN);
  ok(r.targets.length === 1, 'pessoa mais cara que o orçamento → lote de 1 (nunca zero, senão trava pra sempre)');
}

// ── 4. MAIS DESATUALIZADOS primeiro; nunca varrido antes de todos ──
{
  comScans({
    recente: { scannedAt: diasAtras(1) },
    velho: { scannedAt: diasAtras(90) },
    medio: { scannedAt: diasAtras(30) },
    // 'novato' não está no scanMap = nunca varrido
  });
  const r = plan([{ uid: 'recente' }, { uid: 'medio' }, { uid: 'novato' }, { uid: 'velho' }], 'full', 2 * MIN);
  const ordem = r.targets.map((t) => t.uid);
  ok(ordem[0] === 'novato', 'quem NUNCA foi varrido vem primeiro (ordem: ' + ordem.join(' → ') + ')');
  ok(ordem[1] === 'velho' && ordem[2] === 'medio' && ordem[3] === 'recente',
    'depois, do mais velho pro mais recente (ordem: ' + ordem.join(' → ') + ')');
}
// e o corte do lote leva os mais desatualizados, não os primeiros da lista
{
  comScans({ a: { scannedAt: diasAtras(1) }, b: { scannedAt: diasAtras(2) }, c: { scannedAt: diasAtras(80) } });
  const r = plan([{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }], 'full', 20 * MIN);   // cabe 1
  ok(r.targets.length === 1 && r.targets[0].uid === 'c',
    'o lote de 1 leva o MAIS desatualizado (c), não o primeiro da lista (veio ' + r.targets[0].uid + ')');
  ok(r.sobram === 2, 'e avisa que 2 ficaram');
}

// ── 5. A ESSENCIAL não é loteada — 100 num clique só ──
{
  comScans({});
  const r = plan(pessoas(100), 'essential');
  ok(r.targets.length === 100, 'essencial leva todos de uma vez (veio ' + r.targets.length + ')');
  ok(r.sobram === 0, 'essencial nunca deixa sobra');
}

// ── 6. Não muta a lista de entrada (o chamador reusa ctx.pend) ──
{
  comScans({ z: { scannedAt: diasAtras(99) } });
  const entrada = [{ uid: 'a' }, { uid: 'z' }];
  const copia = entrada.slice();
  plan(entrada, 'full', 2 * MIN);
  ok(entrada[0].uid === copia[0].uid && entrada.length === copia.length,
    'a lista original não pode ser reordenada/cortada por baixo do chamador');
}

console.log((fail ? '✗' : '✓') + ' letzplay-batch: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
