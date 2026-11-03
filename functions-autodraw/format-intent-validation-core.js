'use strict';

// Valida a intenção declarada na criação e na edição sem sorteio. O projetor
// de torneios históricos continua aceitando seus dialetos antigos; não validar
// documentos já salvos durante leitura, sorteio ou lançamento de resultado.
const ENUMS = [
  ['disputa', ['individual', 'dupla']],
  ['parceria', ['fixa', 'rei_rainha', 'sorteio_rodada', 'super_eight']],
  ['formacaoDupla', ['manual', 'sorteio']],
  ['classifScope', ['overall', 'per_group']],
  ['tieResolution', ['draw_order', 'singles_then_draw']],
  ['rodadas.modo', ['todos', 'fixo']],
  ['rodadas.turnos', ['ida', 'ida_volta']],
  ['classificationPairing.strategy', ['ranking_clusters', 'free_draw']],
  ['classificationPairing.rematchPolicy', ['exhaust_cluster_before_repeat']],
  ['rankingRemainderPolicy', ['lottery_average', 'waitlist_legacy']],
  ['rankingSitOutScoring.mode', ['average', 'zero', 'fixed']],
  ['classificationSchedule.mode', ['free', 'structured']],
  ['eliminatoria.formacao', ['performance', 'equilibrio', 'sorteio']],
  ['eliminatoria.semeadura', ['performance', 'equilibrio', 'sorteio']],
  ['eliminatoria.lateEnrollment', ['inherit', 'closed', 'standby', 'expand']],
  ['eliminatoria.newMatchups', ['inherit', true, false]]
];
const INTEGERS = [
  ['grupos', 1],
  ['eliminatoria.linhas', 1],
  ['classificados', 1],
  ['rodadas.n', 1],
  ['classificationPairing.clusterSize', 2],
  ['classificationSchedule.gamesPerUnit', 1]
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

function validateHistoricalSinglesIdentity(stored, requestedTeamSize, HttpsError) {
  if (!stored || !stored.fmt2 || stored.fmt2.historicalSinglesOverride !== true) return;
  if ((stored.teamSize !== 1 && stored.teamSize !== '1') ||
      requestedTeamSize !== stored.teamSize) {
    throw new HttpsError('failed-precondition', 'O formato individual histórico não pode mudar de modalidade.');
  }
}

function validateCompletedMixedIdentity(stored, requestedTeamSize, HttpsError) {
  if (!stored || !stored.fmt2 || stored.fmt2.completedMixedGroupOnly !== true) return;
  const phase = Array.isArray(stored.phases) && stored.phases.length === 1 ? stored.phases[0] : null;
  if (stored.status !== 'finished' || stored.sport !== 'Futevôlei' ||
      stored.teamSize !== 2 || requestedTeamSize !== stored.teamSize ||
      stored.enrollmentMode !== 'misto' ||
      stored.format !== 'Fase de Grupos + Eliminatórias' ||
      stored.gruposCount !== 2 || stored.gruposClassified !== 4 ||
      stored.drawMode !== 'sorteio' || stored.manualPairing !== 'open' ||
      stored.politicaDaChave != null ||
      stored.mixedPairingSeparated !== false ||
      !Array.isArray(stored.matches) || stored.matches.length !== 0 ||
      !phase || phase.kind !== 'classification' ||
      phase.formatCode !== 'classification_groups' ||
      phase.format !== 'Fase de Grupos + Eliminatórias' ||
      phase.fixedPairs !== true || phase.gruposCount !== 2 ||
      phase.gruposClassified !== 4 || phase.drawMode !== 'sorteio' ||
      !phase.classification || phase.classification.structure !== 'groups') {
    throw new HttpsError('failed-precondition', 'O formato misto histórico não pode mudar de modalidade.');
  }
}

function validateNewFormatIntent(fmt2, HttpsError, stored, requestedTeamSize) {
  if (!fmt2 || typeof fmt2 !== 'object' || Array.isArray(fmt2)) {
    throw new HttpsError('invalid-argument', 'Configuração de formato inválida.');
  }
  const historicalField = explicitValue(fmt2, 'historicalSinglesOverride');
  const storedHistorical = !!(stored && stored.fmt2 && stored.fmt2.historicalSinglesOverride === true);
  if (storedHistorical && (!historicalField.present || historicalField.value !== true)) {
    throw new HttpsError('failed-precondition', 'Atualize o app para editar este torneio.');
  }
  if (historicalField.present) {
    if (historicalField.value !== true) {
      throw new HttpsError('invalid-argument', 'Valor de formato inválido em fmt2.historicalSinglesOverride.');
    }
    if (!storedHistorical) {
      throw new HttpsError('failed-precondition', 'Atualize o app para editar este torneio.');
    }
    if (fmt2.disputa !== 'individual') {
      throw new HttpsError('invalid-argument', 'Formato individual histórico exige disputa individual.');
    }
    validateHistoricalSinglesIdentity(stored, requestedTeamSize, HttpsError);
  }
  const mixedField = explicitValue(fmt2, 'completedMixedGroupOnly');
  const storedMixed = !!(stored && stored.fmt2 && stored.fmt2.completedMixedGroupOnly === true);
  if (storedMixed && (!mixedField.present || mixedField.value !== true)) {
    throw new HttpsError('failed-precondition', 'Atualize o app para editar este torneio.');
  }
  if (mixedField.present) {
    if (mixedField.value !== true) {
      throw new HttpsError('invalid-argument', 'Valor de formato inválido em fmt2.completedMixedGroupOnly.');
    }
    if (!storedMixed) {
      throw new HttpsError('failed-precondition', 'Atualize o app para editar este torneio.');
    }
    if (fmt2.disputa !== 'dupla') {
      throw new HttpsError('invalid-argument', 'Formato misto histórico exige disputa em dupla.');
    }
    validateCompletedMixedIdentity(stored, requestedTeamSize, HttpsError);
  }
  // Um contêiner explicitamente enviado não pode sumir durante a validação
  // dos filhos e reaparecer como default no compilador tolerante de legado.
  for (const path of ['rodadas', 'classificationPairing', 'eliminatoria', 'rankingSitOutScoring']) {
    const field = explicitValue(fmt2, path);
    if (field.present && (!field.value || typeof field.value !== 'object' ||
        Array.isArray(field.value) || Object.getPrototypeOf(field.value) !== Object.prototype)) {
      throw new HttpsError('invalid-argument', 'Valor de formato inválido em fmt2.' + path + '.');
    }
  }
  const sitOutScoring = explicitValue(fmt2, 'rankingSitOutScoring');
  if (sitOutScoring.present && sitOutScoring.value.mode === 'fixed') {
    const points = explicitValue(fmt2, 'rankingSitOutScoring.points');
    if (!points.present || !Number.isSafeInteger(points.value) || points.value < 0) {
      throw new HttpsError('invalid-argument', 'Valor de formato inválido em fmt2.rankingSitOutScoring.points.');
    }
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
  if (fmt2.eliminatoria && fmt2.eliminatoria.lateEnrollment === 'closed' &&
      fmt2.eliminatoria.newMatchups === true) {
    throw new HttpsError('invalid-argument', 'Novos confrontos exigem inscrições abertas na fase eliminatória.');
  }
  // O compilador tolerante lê documentos históricos, mas uma intenção nova
  // não pode transformar "3abc" ou 3.5 em três jogos sem avisar o organizador.
  // Não há teto aqui: a edição integral pode reenviar valores antigos acima do
  // alcance atual dos sliders, mesmo quando esse campo não foi alterado.
  const schedule = explicitValue(fmt2, 'classificationSchedule');
  if (schedule.present && schedule.value !== null &&
      (!schedule.value || typeof schedule.value !== 'object' || Array.isArray(schedule.value))) {
    throw new HttpsError('invalid-argument', 'Valor de formato inválido em fmt2.classificationSchedule.');
  }
  if (schedule.present && schedule.value !== null &&
      !explicitValue(fmt2, 'classificationSchedule.gamesPerUnit').present) {
    throw new HttpsError('invalid-argument', 'Valor de formato inválido em fmt2.classificationSchedule.gamesPerUnit.');
  }
  for (const [path, minimum] of INTEGERS) {
    const field = explicitValue(fmt2, path);
    if (!field.present) continue;
    const value = field.value;
    const parsed = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || parsed < minimum) {
      throw new HttpsError('invalid-argument', 'Valor de formato inválido em fmt2.' + path + '.');
    }
    if (path === 'eliminatoria.linhas' && parsed > 32) {
      throw new HttpsError('invalid-argument', 'São permitidas no máximo 32 chaves paralelas.');
    }
  }
}

module.exports = { validateNewFormatIntent, validateHistoricalSinglesIdentity, validateCompletedMixedIdentity };
