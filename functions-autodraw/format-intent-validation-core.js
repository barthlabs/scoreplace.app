'use strict';

// Valida a intenção declarada na criação e na edição sem sorteio. O projetor
// de torneios históricos continua aceitando seus dialetos antigos; não validar
// documentos já salvos durante leitura, sorteio ou lançamento de resultado.
const ENUMS = [
  ['disputa', ['individual', 'dupla']],
  ['parceria', ['fixa', 'rei_rainha', 'sorteio_rodada']],
  ['formacaoDupla', ['manual', 'sorteio']],
  ['classifScope', ['overall', 'per_group']],
  ['rodadas.modo', ['todos', 'fixo']],
  ['rodadas.turnos', ['ida', 'ida_volta']],
  ['classificationPairing.strategy', ['ranking_clusters', 'free_draw']],
  ['classificationPairing.rematchPolicy', ['exhaust_cluster_before_repeat']],
  ['classificationSchedule.mode', ['free', 'structured']],
  ['eliminatoria.formacao', ['performance', 'equilibrio', 'sorteio']],
  ['eliminatoria.lateEnrollment', ['inherit', 'closed', 'standby', 'expand']],
  ['eliminatoria.newMatchups', ['inherit', true, false]],
  ['eliminatoria.linhas', [1, 2, 4]]
];

function explicitValue(object, path) {
  const parts = path.split('.');
  let current = object;
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !Object.prototype.hasOwnProperty.call(current, part)) {
      return { present: false };
    }
    current = current[part];
  }
  return { present: true, value: current };
}

function validateNewFormatIntent(fmt2, HttpsError) {
  if (!fmt2 || typeof fmt2 !== 'object' || Array.isArray(fmt2)) {
    throw new HttpsError('invalid-argument', 'Configuração de formato inválida.');
  }
  for (const [path, allowed] of ENUMS) {
    const field = explicitValue(fmt2, path);
    // Null é normalizado para disputa individual ou, sem disputa explícita,
    // para a parceria fixa da disputa dupla assumida pelo compilador.
    if (!field.present || (path === 'parceria' && field.value === null && (fmt2.disputa === 'individual' || !Object.prototype.hasOwnProperty.call(fmt2, 'disputa')))) continue;
    if (!allowed.includes(field.value)) {
      throw new HttpsError('invalid-argument', 'Valor de formato inválido em fmt2.' + path + '.');
    }
  }
}

module.exports = { validateNewFormatIntent };
