'use strict';
const C = require('./legacy-phase-adapter-core'); let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
let r = C.classifyLegacyPhase({ formatCode: 'liga', drawMode: 'rei_rainha' });
ok('Liga Rei/Rainha vira classificatória monarch', r.kind === 'classification' && r.drawModality === 'monarch' && r.migratable);
r = C.classifyLegacyPhase({ formatCode: 'grupos_mata' });
ok('grupos vira classificatória groups', r.kind === 'classification' && r.structure === 'groups');
r = C.classifyLegacyPhase({ formatCode: 'elim_dupla' });
ok('elim dupla preserva repescagem explícita', r.kind === 'elimination' && r.bracketPolicy === 'repescagem' && r.migratable);
r = C.classifyLegacyPhase({ formatCode: 'elim_simples', bracketResolution: 'bye' });
ok('elim simples não inventa BYE do campo histórico ignorado', r.kind === 'elimination' && r.bracketPolicy === null && !r.migratable && r.reason === 'missing_historical_bracket_policy');
r = C.classifyLegacyPhase({ formatCode: 'super8' });
ok('formato desconhecido não recebe classificação arbitrária', !r.supported && r.reason === 'unsupported_format_code');
console.log((fail ? '❌' : '✅') + ' legacy-phase-adapter-core: ' + pass + ' ok, ' + fail + ' falharam'); process.exit(fail ? 1 : 0);
