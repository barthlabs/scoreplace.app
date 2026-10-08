'use strict';

// Contrato de avanço: classificação por rodadas é uma configuração da fase,
// não um "modo suíço" paralelo. A chave antiga continua apenas como entrada
// de compatibilidade e nunca sai do núcleo validado.
const core = require('../functions-autodraw/advance-core.js');
let pass = 0, fail = 0;
function ok(value, message) {
  if (value) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
}
function validate(value) {
  return core.validaDecisoes(value, { precisaDecidirInativos: false, mostraWo: false }, {});
}

console.log('──── contrato de classificação por rodadas ────');
const current = validate({ classificationRounds: 4 });
ok(current.classificationRounds === 4 && current.swissRounds === undefined,
  'entrada atual permanece canônica');

const legacy = validate({ swissRounds: 3 });
ok(legacy.classificationRounds === 3 && legacy.swissRounds === undefined,
  'entrada legada é traduzida sem vazar apelido histórico');

let mixedRejected = false;
try { validate({ classificationRounds: 3, swissRounds: 3 }); }
catch (error) { mixedRejected = /apenas decisions\.classificationRounds/.test(String(error && error.message)); }
ok(mixedRejected, 'cliente não pode enviar os dois contratos');

let invalidRejected = false;
try { validate({ classificationRounds: 0 }); }
catch (error) { invalidRejected = /classificationRounds inválido/.test(String(error && error.message)); }
ok(invalidRejected, 'limites da classificação continuam validados');

console.log((fail ? '❌' : '✅') + ' advance-decisions-contract: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
