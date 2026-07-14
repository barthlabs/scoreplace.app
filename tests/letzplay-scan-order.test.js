/* Ordem da varredura letzplay — node tests/letzplay-batch.test.js
 *
 * JOB ÚNICO, sem lote. O lote de 20min foi tentado e DESCARTADO pelo dono:
 * _"divididos em lotes podem confundir o organizador que pensa que puxou tudo mas nao
 * puxou e nao puxa de novo."_ É a mesma família de bug que o resto desta campanha mata —
 * sistema que reporta sucesso sem ter trazido o dado. Um job longo com o tempo na tela e
 * botão de interromper é honesto; um corte silencioso não é.
 *
 * O que sobra e PRECISA ser congelado: a ORDEM. Como o job é interrompível, a ordem decide
 * quem fica de fora quando o organizador para no meio — e o corte nunca pode ser arbitrário.
 * Mais desatualizado primeiro; quem nunca foi varrido antes de todos.
 * Ver project_letzplay_scan_stability, feedback_dont_canonize_examples.
 */
const { window, load } = require('./headless.js');
load('tournaments-enrollment-report.js');

const plan = window._lzPlanScan;
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function pessoas(n) { const a = []; for (let i = 0; i < n; i++) a.push({ uid: 'u' + i, name: 'P' + i }); return a; }
function comScans(map) { window._lzRenderCtx = { scanMap: map }; }
const diasAtras = (d) => new Date(Date.now() - d * 86400000).toISOString();

// ── 1. NADA de corte: o job leva todo mundo ──
{
  comScans({});
  const r = plan(pessoas(100), 'full');
  ok(r.targets.length === 100, 'a completa leva os 100 num job só (veio ' + r.targets.length + ')');
  ok(r.sobram === 0, 'não existe "sobra pro próximo lote" — isso escondia gente do organizador');
}
{
  comScans({});
  const r = plan(pessoas(100), 'essential');
  ok(r.targets.length === 100, 'a essencial também leva todos (veio ' + r.targets.length + ')');
  ok(r.sobram === 0, 'essencial sem sobra');
}

// ── 2. MAIS DESATUALIZADOS primeiro — é o que torna a interrupção segura ──
{
  comScans({
    recente: { scannedAt: diasAtras(1) },
    velho: { scannedAt: diasAtras(90) },
    medio: { scannedAt: diasAtras(30) },
    // 'novato' fora do scanMap = nunca varrido
  });
  const r = plan([{ uid: 'recente' }, { uid: 'medio' }, { uid: 'novato' }, { uid: 'velho' }], 'full');
  const ordem = r.targets.map((t) => t.uid);
  ok(ordem[0] === 'novato', 'quem NUNCA foi varrido vem primeiro (ordem: ' + ordem.join(' → ') + ')');
  ok(ordem[1] === 'velho' && ordem[2] === 'medio' && ordem[3] === 'recente',
    'depois, do mais velho pro mais recente (ordem: ' + ordem.join(' → ') + ')');
}
// interromper no meio deixa de fora justamente os MAIS atualizados (nunca o contrário)
{
  comScans({ a: { scannedAt: diasAtras(1) }, b: { scannedAt: diasAtras(2) }, c: { scannedAt: diasAtras(80) } });
  const r = plan([{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }], 'full');
  ok(r.targets[0].uid === 'c', 'o mais desatualizado é o PRIMEIRO — interromper cedo já resolve quem mais precisava');
  ok(r.targets[r.targets.length - 1].uid === 'a', 'o mais recém-varrido fica por último (é quem menos custa perder)');
}

// ── 3. A essencial não é reordenada (não há nada a priorizar: leva todos em ~14min) ──
{
  comScans({ z: { scannedAt: diasAtras(99) } });
  const r = plan([{ uid: 'a' }, { uid: 'z' }], 'essential');
  ok(r.targets[0].uid === 'a', 'essencial preserva a ordem de entrada');
}

// ── 4. Não muta a lista de entrada (o chamador reusa ctx.pend) ──
{
  comScans({ z: { scannedAt: diasAtras(99) } });
  const entrada = [{ uid: 'a' }, { uid: 'z' }];
  const copia = entrada.slice();
  plan(entrada, 'full');
  ok(entrada[0].uid === copia[0].uid && entrada.length === copia.length,
    'a lista original não pode ser reordenada por baixo do chamador');
}

console.log((fail ? '✗' : '✓') + ' letzplay-scan-order: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
