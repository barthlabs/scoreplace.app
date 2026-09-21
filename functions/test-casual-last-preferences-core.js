'use strict';
const C = require('./casual-last-preferences-core');
let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) pass++; else { fail++; console.error('  ✗ ' + name); } };
const rejects = (name, value) => { try { C.normalize(value); ok(name, false); } catch (_) { ok(name, true); } };

const accepted = C.normalize({ sport: 'Beach Tennis', isDoubles: true });
ok('aceita modalidade canônica e dupla', accepted.sport === 'Beach Tennis' && accepted.isDoubles === true);
ok('aceita individual de modalidade canônica', C.normalize({ sport: 'Tênis', isDoubles: false }).isDoubles === false);
rejects('rejeita modalidade desconhecida', { sport: 'Futebol', isDoubles: true });
rejects('rejeita ausência de modalidade', { isDoubles: true });
rejects('rejeita ausência do tipo de equipe', { sport: 'Padel' });
rejects('rejeita tipo de equipe não booleano', { sport: 'Padel', isDoubles: 'true' });
rejects('rejeita campo extra', { sport: 'Padel', isDoubles: true, uid: 'outro' });

console.log((fail ? '❌' : '✅') + ' casual-last-preferences-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
