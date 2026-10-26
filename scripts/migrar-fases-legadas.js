/* Migra somente a representação de fases dos torneios legados.
 *
 * Não recria chave, rodadas, partidas, inscrições, duplas ou placares: a projeção
 * lossless acrescenta `phases` a partir dos campos que o documento já possui.
 * O script é idempotente e começa em dry-run. Para gravar, use --apply.
 *
 * Uso:
 *   node scripts/migrar-fases-legadas.js --id <torneioId>
 *   node scripts/migrar-fases-legadas.js --id <torneioId> --apply --fingerprint <recibo>
 */
'use strict';

const path = require('path');
const { accessTokenForServiceAccountSync } = require('./firebase-service-account-token');
const phaseStore = require('./phase-projection-firestore-core');
const ROOT = path.join(__dirname, '..');
const { _window } = require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const { runOne } = require(path.join(ROOT, 'scripts', 'migrar-fases-legadas-core.js'));

const project = _window && _window.FORMAT2 && _window.FORMAT2.projectLegacyPhases;
if (typeof project !== 'function') {
  console.error('✗ projetor FORMAT2 indisponível; abortando sem escrever');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const requestedIdAt = process.argv.indexOf('--id');
const ONLY_ID = requestedIdAt >= 0 ? process.argv[requestedIdAt + 1] : null;
const fingerprintAt = process.argv.indexOf('--fingerprint');
const FINGERPRINT = fingerprintAt >= 0 ? process.argv[fingerprintAt + 1] : null;
if (requestedIdAt >= 0 && !ONLY_ID) {
  console.error('✗ --id exige o identificador do torneio');
  process.exit(1);
}
if (!ONLY_ID) {
  console.error('✗ esta migração é individual; informe --id <torneioId>');
  process.exit(1);
}
if (APPLY && !ONLY_ID) {
  console.error('✗ --apply exige --id; migração em lote é proibida');
  process.exit(1);
}
if (APPLY && !FINGERPRINT) {
  console.error('✗ --apply exige --fingerprint do dry-run revisado');
  process.exit(1);
}

const token = () => accessTokenForServiceAccountSync();

// Marcadores de transição que um documento antigo pode carregar mesmo depois de
// `phases[]` já descrever completamente o torneio. Eles são SOMENTE medidos
// aqui: removê-los em lote é uma escrita de dados separada, a ser feita apenas
// depois de conferir que nenhuma tela/Function ainda depende daquele fato.
function legacySwissMarkers(tournament) {
  const t = tournament || {};
  return {
    format: String(t.format || '') === 'Suíço Clássico',
    classifyFormat: String(t.classifyFormat || '') === 'swiss',
    currentStage: String(t.currentStage || '') === 'swiss',
    swissRounds: t.swissRounds !== null && t.swissRounds !== undefined
  };
}

async function main() {
  const accessToken = token();
  console.log(`▶ migração individual de fases legadas${APPLY ? '' : ' (DRY-RUN — nenhuma escrita)'}`);
  const result = await runOne({
    tournamentId: ONLY_ID,
    apply: APPLY,
    fingerprint: FINGERPRINT,
    project,
    load: (id) => phaseStore.readTournament(accessToken, id),
    write: (id, projection, updateTime) => phaseStore.writePhaseProjection(accessToken, id, projection, updateTime),
  });
  const plan = result.plan;
  const markers = legacySwissMarkers((await phaseStore.readTournament(accessToken, ONLY_ID)).tournament);
  console.log(`✓ ${ONLY_ID}: ${result.outcome} · ${plan.reason}`);
  console.log(`  recibo: ${plan.fingerprint}`);
  console.log(`  campos protegidos: ${plan.protectedFingerprint}`);
  console.log('  marcadores suíços transitórios (somente censo): ' +
    `format=${markers.format} · classifyFormat=${markers.classifyFormat} · ` +
    `currentStage=${markers.currentStage} · swissRounds=${markers.swissRounds}`);
  if (!APPLY && plan.changed) console.log(`  para aplicar: --id ${ONLY_ID} --apply --fingerprint ${plan.fingerprint}`);
}

main().catch((error) => {
  console.error('✗ migração abortada:', error && error.message ? error.message : error);
  process.exit(1);
});
