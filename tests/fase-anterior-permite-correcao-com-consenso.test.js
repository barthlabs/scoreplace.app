/* FASE ANTERIOR — correção segue a permissão normal e o consenso entre os times.
 *
 * Regressão observada na Confra: depois que a fase seguinte começava, a tela da fase
 * anterior forçava `canEnterResult=false`. Um jogo com set lançado pela metade ficava
 * sem campos para corrigir e sem como registrar o super tie-break. A fase anterior deve
 * manter a mesma porta de resultado: autoridade corrige; participante propõe e o fluxo
 * existente de consenso decide a alteração.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  if (condition) console.log('  ✓ ' + message);
  else { fail++; console.error('  ✗ ' + message); }
}

console.log('\n== Fase anterior: correção com consenso ==');
const phaseFn = src.slice(src.indexOf('function _renderPhaseBracket('), src.indexOf('// ─── Compute standings'));
ok(!/if \(_viewPhaseIdx != null && _viewPhaseIdx < _realCur\) canEnterResult = false;/.test(phaseFn),
  'fase anterior não zera a permissão canônica de lançar resultado');
ok(/window\._renderPhaseBracket\(t, canEnterResult, '', _ppi\)/.test(src),
  'o revelador da fase anterior entrega a mesma permissão ao renderer');
ok(/_saveResultInline/.test(phaseFn) && /confirmação ou contestação/.test(phaseFn),
  'a regra documenta que participante continua no fluxo de consenso');

console.log((fail ? '❌' : '✅') + ' fase-anterior-permite-correcao-com-consenso: ' + (3 - fail) + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
