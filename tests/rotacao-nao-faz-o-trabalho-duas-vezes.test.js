'use strict';
/* ⛔⛔ O GIRO NÃO PODE FAZER O MESMO TRABALHO DUAS VEZES (ordem do dono, 25/set/2026).
 *
 * _"já pedi inúmeras vezes para acelerar as coisas e parar com redundância inútil"_ — e era
 * isso mesmo. No giro do aparelho, o observador de tamanho reajusta cada caixa que mudou NA
 * HORA; depois o passe de reserva limpava a marca de TODOS e reajustava o documento inteiro por
 * cima. A segunda passada é a caríssima.
 *
 * ⚠️ E o diagnóstico ANTERIOR (agosto, meu) estava invertido: dizia que o custo era ESPERA e que
 * o ajuste não priorizava o visível. Os dois errados — já existe observador de visibilidade com
 * margem, e o de tamanho age sem espera.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── o giro não faz o trabalho duas vezes ────');

/* Recorte do passe de reserva pelo próprio identificador, com fim ancorado. */
const iRes = src.indexOf("window.addEventListener('resize', function() {\n      if (_rt) clearTimeout(_rt);");
ok(iRes > 0, 'o passe de reserva do giro foi localizado pelo próprio código');
const bloco = src.slice(iRes, src.indexOf('}, 150);', iRes) + 8);

ok(/el\.__fitEm/.test(bloco), 'ele consulta a marca que o observador deixa');
ok(/agora - em\) < JANELA_DA_RAJADA_MS\) return;/.test(bloco),
  '⛔ e PULA quem o observador já ajustou na mesma rajada — era este o trabalho dobrado');
ok(/removeAttribute\('data-fitted'\)/.test(bloco),
  'quem NÃO foi ajustado continua sendo limpo para reajuste');
ok(/_fitNames\(document, 0\)/.test(bloco),
  '⛔ e a varredura CONTINUA existindo: o caso do zoom por área não dispara o observador, e só ela o cobre');

/* O observador marca. */
const iRO = src.indexOf('_ro = new ResizeObserver(');
const blocoRO = src.slice(iRO, src.indexOf('\n  }', iRO));
ok(/_fitOne\(el\);[\s\S]{0,400}el\.__fitEm = Date\.now\(\);/.test(blocoRO),
  'o observador marca DEPOIS de ajustar — marca antes seria promessa não cumprida');

/* ⛔ A janela é curta de propósito: marca velha não pode impedir reajuste legítimo depois. */
const m = src.match(/var JANELA_DA_RAJADA_MS = (\d+);/);
ok(!!m, 'a janela da rajada é uma constante nomeada, não número solto no meio do código');
ok(m && Number(m[1]) > 0 && Number(m[1]) <= 1000,
  '⛔ e é curta (≤ 1s): marca velha não deve bloquear um reajuste legítimo mais tarde (deu ' + (m && m[1]) + 'ms)');

/* ⛔ Nada de esconder o que não está na tela — proibido no repositório, e com razão. */
ok(!/content-visibility/.test(bloco) && !/content-visibility/.test(blocoRO),
  '⛔ e o conserto não usa content-visibility nem esconde o não-visível');

console.log(fail ? `❌ rotacao-nao-faz-o-trabalho-duas-vezes: ${fail} falha(s), ${pass} ok`
                 : `✅ rotacao-nao-faz-o-trabalho-duas-vezes: ${pass} ok`);
process.exit(fail ? 1 : 0);
