'use strict';
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'planejar-migracao-fases-legadas.js'), 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
ok(source.includes('planLegacyPhaseProjection') && source.includes('projectLegacyPhases'), 'planejador usa o mesmo projetor canônico da leitura e da migração individual');
ok(source.includes('protectedFingerprint') && source.includes('fingerprint'), 'manifesto expõe recibos para revisão sem carregar o documento inteiro');
ok(source.includes('purpose: \'legacy-phase-projection-read-only\'') && source.includes('não aceita opções'), 'planejador declara leitura somente');
ok(!/method:\s*['\"](?:PATCH|POST|DELETE|PUT)['\"]/.test(source) && !/\.set\(/.test(source) && !/\.update\(/.test(source) && !/\.delete\(/.test(source), 'planejador não contém caminho de escrita');
process.exit(failed ? 1 : 0);
