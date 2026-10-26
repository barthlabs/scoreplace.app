'use strict';

const fs = require('fs');
const path = require('path');
const { routeFor } = require('../scripts/auditar-inscricoes-canonicas-core');
const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'planejar-materializacao-inscricoes-canonicas.js'), 'utf8');
let failed = 0;
function ok(value, label) {
  console.log((value ? '✓ ' : '✗ ') + label);
  if (!value) failed++;
}

ok(source.includes('registration-batch-plan-core.js') && source.includes('batch.planBatch(inspected'),
  'planejador produz o manifesto pelo núcleo puro compartilhado');
ok(source.includes('materialization.decideMaterialization') && source.includes('registration.projectLegacyRoster'),
  'planejador reusa a mesma projeção e decisão da materialização individual');
ok(source.includes('legacy-category-definition-core.js') && source.includes('legacyCategoryDefinitions.resolve'),
  'planejador traduz categorias legadas pela mesma projeção da Function transacional');
const main = source.slice(source.indexOf('async function main()'));
const filter = main.indexOf('audit.routeFor(documentToObject(document))');
const inspect = main.indexOf('inspectTournament(document, token)');
ok(filter >= 0 && inspect > filter && main.includes('legacy.slice(offset, offset + 8)'),
  'filtra os canônicos antes de inspecionar e ler o espelho legado');
ok(main.indexOf('if (!legacy.length)') >= 0 && main.indexOf('if (!legacy.length)') < main.indexOf('batch.planBatch(inspected'),
  'lote sem legados aborta explicitamente antes de gerar manifesto');
ok(source.includes('for (let offset = 0; offset < legacy.length; offset += 8)'),
  'planejador limita leituras concorrentes sem omitir torneios');
ok(routeFor({}) === 'legacy' && routeFor({ canonicalRegistrationMigration: null }) === 'legacy' &&
   routeFor({ canonicalRegistrationMigration: {} }) === 'legacy' &&
   routeFor({ canonicalRegistrationMigration: { fingerprint: '' } }) === 'legacy' &&
   routeFor({ canonicalRegistrationMigration: { fingerprint: 'fp' } }) === 'canonical' &&
   routeFor({ canonicalRegistrationMigration: { fingerprint: '   ' } }) === 'canonical',
   'o mesmo marcador da produção separa legado de canônico sem fallback por trim');
ok(!/method:\s*['\"](?:PATCH|POST|DELETE|PUT)['\"]/.test(source) &&
   !/\.set\(/.test(source) && !/\.update\(/.test(source) && !/\.delete\(/.test(source),
  'planejador permanece estritamente somente leitura');
ok(!source.includes('--apply') || source.includes('não aceita opções'),
  'planejador não tem caminho de escrita acidental');

process.exit(failed ? 1 : 0);
