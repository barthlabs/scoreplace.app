/* SMOKE DE GLOBAIS DAS VIEWS — node tests/view-globals-smoke.test.js
 *
 * BUG REAL (jul/2026, v1.4.12→14): o botão "✏️ Editar" das Ferramentas do Organizador parou
 * de funcionar. Causa: uma definição `window._allowSelfDeactEl = function …` foi inserida por
 * engano DENTRO do template literal que monta o HTML do formulário. Virou texto no meio do
 * markup — a função nunca era definida, e o primeiro call site estourava TypeError.
 *
 * POR QUE NADA PEGOU: `node --check` valida SINTAXE, e código dentro de uma string É sintaxe
 * válida. O arquivo passava limpo enquanto a função não existia em runtime. É a MESMA família
 * do incidente das <script> não-fechadas do index.html (v0.16.11): o parser está feliz, o
 * programa está quebrado.
 *
 * ESTE TESTE: carrega os arquivos de view e afirma que os globais que OUTROS arquivos chamam
 * realmente existem depois do load. Falsificado — com a função de volta dentro do template,
 * `typeof` vira 'undefined' e esta suíte fica vermelha.
 *
 * Ao criar um global novo que outro arquivo chama, adicione-o aqui.
 */
const { window: W, load } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// arquivo → globais que ELE define e que outros arquivos (ou onclick do HTML) chamam.
const SPEC = [
  ['create-tournament.js', [
    // Só globais definidos NO LOAD. _selectDrawMode/_selectEnrollMode NÃO entram: nascem
    // dentro de setupCreateTournamentModal(), que só roda quando o modal é montado.
    '_allowSelfDeactEl',   // lido pelo save/load do form E pelo bloco do format2-ui
  ]],
  ['format2.js', ['FORMAT2']],
  ['format2-ui.js', [
    '_f2SchedManual', '_f2SchedDate', '_f2SchedTime', '_f2SchedInterval',
    '_f2AllowSelfDeact',   // toggle "Deixar inscritos ficarem de fora" (v1.4.12)
    '_f2Rn',
  ]],
  ['tournaments-organizer.js', ['_sendUserNotification', '_notifyTournamentParticipants']],
];

SPEC.forEach(function (row) {
  const file = row[0], globals = row[1];
  let loaded = true;
  try { load(file); } catch (e) { loaded = false; ok(false, file + ' NÃO CARREGA: ' + String(e && e.message).slice(0, 120)); }
  if (!loaded) return;
  globals.forEach(function (g) {
    ok(typeof W[g] !== 'undefined',
      file + ' carregou mas NÃO definiu window.' + g +
      ' — provável definição presa dentro de um template literal (vira texto, não código)');
  });
});

console.log((fail === 0 ? '✅' : '❌') + ` view-globals-smoke: ${pass} ok, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
