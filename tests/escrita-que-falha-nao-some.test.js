'use strict';
/* ⛔ ESCRITA QUE FALHA CALADA É PONTO CEGO — havia 23 delas.
 *
 * MEDIDO em 13/set/2026, varrendo `js/`: 23 gravações no Firestore terminavam em
 * `.catch(function () {})`. São escritas de MELHOR ESFORÇO de propósito — o token de push,
 * os locais preferidos, o telefone vinculado, o estado da sessão ao vivo — e é certo que
 * elas não derrubem a tela. O errado é SUMIREM: no dia em que uma passar a falhar sempre
 * (regra, rede, cota), o sintoma chega como "não salva meus clubes" ou "não recebo
 * notificação" e não há UMA linha em lugar nenhum para começar a olhar.
 *
 * ⭐ A PORTA NÃO MUDA O COMPORTAMENTO: continua engolindo, a tela segue igual. Passa a
 * deixar rastro — console + breadcrumb sempre, e exceção reportada a partir da SEGUNDA
 * falha do mesmo ponto (a primeira pode ser rede de alguém no elevador; a segunda é sinal).
 * [[feedback_try_catch_nao_pega_promessa]]
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

console.log('\n──── escrita que falha não some ────\n');

// ── ① a porta, rodando de verdade ──────────────────────────────────────────
const LOG = fs.readFileSync(path.join(raiz, 'js/logger.js'), 'utf8');
const W = { console: { warn() {}, error() {}, log() {}, debug() {} }, location: { search: '' }, navigator: {} };
W.window = W;
const avisos = []; const excecoes = [];
vm.runInNewContext(LOG, { window: W, console: W.console, document: { referrer: '' }, location: W.location, navigator: {} });
W._warn = (m) => avisos.push(String(m));
W._captureException = (e, ctx) => excecoes.push({ e: String(e && e.message), ctx });

must(typeof W._falhouCalado === 'function', '① a porta existe');
const cai = W._falhouCalado('meuPonto');
const r1 = cai({ code: 'permission-denied' });
must(r1 === null, '① ⭐ devolve null — a cadeia segue RESOLVIDA, igual ao `{}` que havia antes');
must(avisos.length === 1 && /meuPonto/.test(avisos[0]) && /permission-denied/.test(avisos[0]),
  '① ⭐ e deixa rastro com o ponto e o código');
must(excecoes.length === 0,
  '① ⛔ a PRIMEIRA falha não vira exceção — pode ser rede de alguém no elevador');
cai({ code: 'permission-denied' });
must(excecoes.length === 1 && excecoes[0].ctx.onde === 'meuPonto' && excecoes[0].ctx.vezes === 2,
  '① ⭐⭐ a SEGUNDA do MESMO ponto vira exceção reportada — aí é sinal, não ruído');
W._falhouCalado('outro')({ code: 'x' });
must(excecoes.length === 1, '① a contagem é POR PONTO — um ponto novo recomeça do zero');

// ── ② nenhuma escrita ficou muda ───────────────────────────────────────────
const arqs = [];
(function anda(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') anda(f); }
    else if (e.name.endsWith('.js')) arqs.push(f);
  }
})(path.join(raiz, 'js'));
const RE_MUDO = /\.catch\(\s*(?:function\s*\([^)]*\)\s*\{\s*\}|\([^)]*\)\s*=>\s*\{\s*\})\s*\)/;
const mudos = [];
for (const f of arqs) {
  const L = fs.readFileSync(f, 'utf8').split('\n');
  L.forEach((l, i) => {
    if (/^\s*(\*|\/\/|\/\*)/.test(l) || !RE_MUDO.test(l)) return;
    const janela = L.slice(Math.max(0, i - 4), i + 1).join(' ');
    if (!/\.set\(|\.update\(|\.add\(|\.delete\(|_callFn\(|httpsCallable/.test(janela)) return;
    mudos.push(path.relative(raiz, f) + ':' + (i + 1));
  });
}
must(mudos.length === 0,
  '② ⭐⭐ nenhuma ESCRITA no Firestore termina em `.catch` mudo (achadas: ' + mudos.join(', ') + ')');

// ── ③ e as que existiam passaram pela porta ───────────────────────────────
const ligadas = arqs.reduce((n, f) => n + (fs.readFileSync(f, 'utf8').match(/_falhouCalado\('/g) || []).length, 0);
// A remoção da escrita direta de celular vinculado eliminou um ponto local;
// o mínimo só pode cair com nova remoção comprovada de writer, nunca por
// silenciosamente trocar o tratamento de erro.
must(ligadas >= 22,
  '③ ' + ligadas + ' pontos de escrita passam pela porta (eram 23 mudos; 1 foi removido)');
const VEN = fs.readFileSync(path.join(raiz, 'js/views/venues.js'), 'utf8');
must((VEN.match(/_falhouCalado\('preferredLocations'\)/g) || []).length === 3,
  '③ ⭐ os 3 pontos que salvam os clubes preferidos usam o MESMO rótulo — a contagem por ponto só funciona se o nome for o mesmo');

console.log('\n✅ ' + ok + ' verificações');
