/* O PERFILADOR TEM DOIS NÍVEIS — o caro NÃO liga por padrão.
 *
 * ⛔ O ERRO QUE ISTO IMPEDE DE VOLTAR, e ele foi MEU. O perfilador era tudo-ou-nada,
 * e o aparelho do dono ficou DIAS com ele ligado — inclusive a parte cara, que
 * embrulha TODO ouvinte de `scroll`/`touchmove` com dois `performance.now()` POR
 * EVENTO, até 60×/s enquanto se rola. Eu pendurei um medidor em cada quadro da
 * rolagem justamente no aparelho que reclamava de rolagem, e ainda somei mais peso
 * (a medição de callback assíncrono, 2.0.80) tentando entender a lentidão.
 * Palavras dele: _"espero que isso leve a algum lugar porque até aqui só piorou o
 * que estava razoável"_.
 *
 * Níveis:
 *   perf=1 (LEVE)  → sentinela de 150ms + relato de travada (duração, direção, nós,
 *                    onde). Responde o que importa, custa um intervalo.
 *   perf=2 (FUNDO) → + embrulho de timers, observers e ouvintes de rolagem/toque.
 *   perf=0         → nada.
 *
 * A regra que se guarda: **instrumentação é pra investigar, não pra cobrar pedágio
 * no caminho quente de quem só quer usar o app.**
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── o perfilador tem dois níveis (o caro não liga sozinho) ────');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

// ── ① os dois níveis existem e são distintos ────────────────────────────────
{
  ok(/var _SP_PERF = false, _SP_FUNDO = false;/.test(src),
     'existem DOIS níveis (_SP_PERF leve e _SP_FUNDO)');
  ok(/perf=2/.test(src), 'o nível de fundo se liga com perf=2');
  ok(/_SP_FUNDO\s*=\s*\(_nivel === '2'\)/.test(src),
     '⛔ o fundo SÓ liga em perf=2 — nunca junto com o leve');
  ok(/_SP_PERF\s*=\s*\(_nivel === '1' \|\| _nivel === '2'\)/.test(src),
     'e o fundo implica o leve (quem caça também quer o relato)');
  ok(/perf=0/.test(src), 'perf=0 continua desligando tudo');
}

// ── ② ⭐ O MAIS CARO fica no fundo: ouvinte de rolagem ──────────────────────
// Dois performance.now() por evento, 60×/s. Se isto voltar pro nível leve, o app
// paga pedágio em cada quadro de rolagem de todo mundo que tiver perf ligado.
{
  const i = src.indexOf("var _origAEL = EventTarget.prototype.addEventListener;");
  ok(i > 0, 'o embrulho de ouvintes existe');
  const volta = src.slice(Math.max(0, i - 400), i);
  ok(/_SP_FUNDO/.test(volta),
     '⛔ embrulhar ouvinte de rolagem/toque exige o nível de FUNDO');
  ok(!/if \(!_SP_PERF\) throw 0;[\s\S]{0,120}var _origAEL/.test(src),
     'e NÃO está mais atrás do nível leve');
}

// ── ③ timers e observers também são de fundo ────────────────────────────────
{
  const iT = src.indexOf('var _origSI = window.setInterval, _origST = window.setTimeout;');
  ok(iT > 0 && /_SP_FUNDO/.test(src.slice(Math.max(0, iT - 300), iT)),
     'embrulhar TODO timer exige o nível de FUNDO');
  const iO = src.indexOf("['IntersectionObserver', 'MutationObserver', 'ResizeObserver']");
  ok(iO > 0 && /_SP_FUNDO/.test(src.slice(Math.max(0, iO - 300), iO)),
     'embrulhar observers exige o nível de FUNDO');
  // a medição de callback assíncrono (2.0.80) mora dentro do embrulho de timers,
  // então herda o nível de fundo — é o peso que eu somei no dia errado.
  const iA = src.indexOf('_marcaFimAssinc');
  ok(iA > iT, '⭐ a medição de callback assíncrono herda o nível de FUNDO');
}

// ── ④ ⛔ O RELATO QUE IMPORTA CONTINUA NO NÍVEL LEVE ────────────────────────
// Se a travada-ao-rolar exigisse o nível caro, medir voltaria a custar caro — e o
// dono ficaria sem instrumento OU com o app pesado. As duas coisas são inaceitáveis.
{
  const i = src.indexOf("'scroll-trav: '");
  ok(i > 0, 'o relato de travada ao rolar existe');
  const volta = src.slice(0, i);
  const ultimoFundo = volta.lastIndexOf('_SP_FUNDO');
  const ultimaSentinela = volta.lastIndexOf('window._travadas = []');
  ok(ultimaSentinela > ultimoFundo || ultimoFundo === -1,
     '⛔ o relato de travada NÃO está dentro de um bloco de nível FUNDO');
  const iSent = src.indexOf('window._travadas = []');
  const gate = _R.ateOFim(src, iSent);
  ok(/if \(!_SP_PERF\) return;/.test(gate),
     '⭐ a sentinela segue no nível LEVE — duração, direção e nós continuam chegando');
}

// ── ⑤ o carimbo de direção é passivo e não depende de nível nenhum ──────────
// Dois números num ouvinte passivo: barato o bastante pra valer sempre.
{
  const i = src.indexOf('_spUltimaRolagemT = 0');
  ok(i > 0, 'o carimbo de direção existe');
  const bloco = _R.ateOFim(src, i);
  ok(/passive:\s*true/.test(bloco), 'e o ouvinte é passivo');
  const iPerf = src.indexOf('var _SP_PERF = false, _SP_FUNDO = false;');
  ok(i < iPerf, 'o carimbo vem ANTES do gate — vale em qualquer nível, custa dois números');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
