/* NUMERAÇÃO "JOGO N" — UM CONTADOR SÓ. node tests/game-number-single-counter.test.js
 *
 * REGRESSÃO VISTA AO VIVO (torneio de casais): número de jogo da chave SUPERIOR
 * repetido na INFERIOR. Já tinha sido corrigido antes e voltou.
 *
 * CAUSA: existiam DOIS contadores carimbando `m._gameNum` sobre os mesmos jogos —
 *   (1) window._assignGlobalGameNumbers (bracket.js), a FONTE ÚNICA: pula BYE
 *       (_gameNum = null) e deduplica por id (numById);
 *   (2) um _assignGameNums inline dentro de renderDoubleElimBracket, que rodava
 *       DEPOIS e sobrescrevia: NÃO pulava BYE e NÃO deduplicava.
 * Como o nº 2 gastava número com BYE e o nº 1 não, as duas sequências divergiam e
 * o número que a inferior recebia colidia com o que outro jogo já tinha.
 * js/store.js:541 já PROIBIA explicitamente um segundo contador.
 *
 * Este teste é a cerca: falha se alguém reintroduzir `_gameNum = ++<contador>`
 * fora da fonte única. Guarda de código-fonte de propósito — o bug vive na
 * INTERAÇÃO entre duas funções de render, que nenhum teste de unidade pega.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const ROOT = path.join(__dirname, '..');
const alvo = path.join(ROOT, 'js/views/bracket.js');
const src = fs.readFileSync(alvo, 'utf8');
const linhas = src.split('\n');

// Delimita a FONTE ÚNICA: de `window._assignGlobalGameNumbers = function` até o
// `};` na coluna 0 que a fecha. Atribuições a _gameNum aí dentro são legítimas.
let ini = linhas.findIndex((l) => /window\._assignGlobalGameNumbers\s*=\s*function/.test(l));
ok(ini >= 0, 'não achei window._assignGlobalGameNumbers em js/views/bracket.js');
let fim = ini;
for (let i = ini + 1; i < linhas.length; i++) {
  if (/^\};/.test(linhas[i])) { fim = i; break; }
}
ok(fim > ini, 'não consegui delimitar o corpo de _assignGlobalGameNumbers');

console.log('── contadores de _gameNum fora da fonte única ──');
const foraDaFonte = [];
linhas.forEach((linha, i) => {
  if (i >= ini && i <= fim) return;                   // dentro da fonte única: ok
  if (/^\s*(\/\/|\*)/.test(linha)) return;            // comentário
  // qualquer INCREMENTO carimbado em _gameNum é um contador paralelo
  if (/_gameNum\s*=\s*\+\+/.test(linha) || /_gameNum\s*=\s*\w+\s*\+\+/.test(linha)) {
    foraDaFonte.push((i + 1) + ': ' + linha.trim());
  }
});
ok(foraDaFonte.length === 0,
  'CONTADOR PARALELO de "JOGO N" (proibido por js/store.js:541 — a fonte única é\n' +
  '     _assignGlobalGameNumbers, que pula BYE e deduplica por id):\n       ' +
  foraDaFonte.join('\n       '));

console.log('── a fonte única continua pulando BYE e deduplicando por id ──');
const corpo = linhas.slice(ini, fim + 1).join('\n');
ok(/isSitOut\s*\|\|\s*isBye\(m\)/.test(corpo) && /_gameNum\s*=\s*null/.test(corpo),
  'a fonte única deixou de zerar o número de BYE/folga (BYE não pode consumir número)');
// Dedup por id: checagem agnóstica a nome de variável (já foi `numById`, hoje é
// `copiasPorId`). O que importa é que o id seja consultado pra agrupar cópias do
// MESMO jogo — o comportamento em si está coberto por game-numbering.test.js
// (grupos Rei/Rainha: a cópia no grupo e a no array plano recebem o mesmo número).
ok(/m\.id/.test(corpo),
  'a fonte única deixou de consultar m.id — cópias do mesmo jogo receberiam números diferentes');

console.log('\n' + (fail === 0 ? '✅ game-number-single-counter: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
