'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'auditar-inscricoes-canonicas.js'), 'utf8');
let failed = 0;
function ok(condition, label) {
  console.log((condition ? '✓ ' : '✗ ') + label);
  if (!condition) failed++;
}

ok(source.includes("registration-migration-core.js"),
  'censo usa o mesmo decisor puro da materialização canônica');
ok(source.includes("legacy-category-definition-core.js") && source.includes('legacyCategoryDefinitions.resolve'),
  'censo usa a mesma normalização de categorias da Function e do planejador');
ok(/canonicalRegistrationsForTournament[\s\S]*?\/registrations/.test(source) &&
   /materialization\.decideMaterialization\(id, report, existing\)/.test(source),
  'censo lê os documentos físicos e compara a projeção na rota legada');
ok(source.indexOf("audit.routeFor(tournament) === 'canonical'") < source.indexOf('const [entries, existing] = await Promise.all') &&
   /canonicalBoundary\.verifiedRoster/.test(source) &&
   /audit\.canonicalDocuments\(existing\)/.test(source),
  'censo roteia a autoridade antes de ler o legado e valida o canônico pelo núcleo de produção');
ok(/canônico — torneios íntegros/.test(source) &&
   /canônico — torneios bloqueados/.test(source) &&
   /legado — inscrições divergentes/.test(source) &&
   /legado — documentos fora da projeção/.test(source) &&
   /legado — torneios bloqueados para materialização/.test(source),
  'censo expõe integridade canônica e pendências legadas com rótulos separados');
ok(!/method:\s*['\"]PATCH['\"]/.test(source) &&
   !/\.set\(/.test(source) && !/\.update\(/.test(source) && !/\.delete\(/.test(source),
  'censo permanece estritamente somente leitura');

process.exit(failed ? 1 : 0);
