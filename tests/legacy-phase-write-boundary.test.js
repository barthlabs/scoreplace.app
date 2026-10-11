'use strict';

/* A migração de fase é uma propriedade da ÚNICA fronteira de escrita, não do
 * formulário que originou a operação. Regressão: havia um guarda `!tDepois.fmt2`
 * que deixava um documento parcialmente migrado continuar com formatCode=liga. */
const fs = require('fs');
const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = source.indexOf('function _gravaTorneio(');
const end = source.indexOf('/* ⛔⛔⛔ VAGA DE REPESCAGEM', start);
const boundary = source.slice(start, end);
let fail = 0;
function ok(value, message) {
  console.log((value ? '✓ ' : '✗ ') + message);
  if (!value) fail++;
}

ok(start >= 0 && end > start, 'encontrou a fronteira única de gravação');
ok(/_legacyPhaseProjection\.planLegacyPhaseProjection\(/.test(boundary) &&
   /drawWindow\.FORMAT2\.projectLegacyPhases/.test(boundary),
   'toda escrita consulta o projetor canônico de fases');
ok(!/!tDepois\.fmt2/.test(boundary),
   'fmt2 não é usado como atalho para pular uma fase legada híbrida');
ok(/lossless[\s\S]{0,300}não recria sorteio, rodada, grupo, jogo ou placar/.test(boundary),
   'a fronteira documenta que a projeção não altera conteúdo competitivo');
process.exit(fail ? 1 : 0);
