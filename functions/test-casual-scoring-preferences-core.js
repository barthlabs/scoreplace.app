'use strict';
const C = require('./casual-scoring-preferences-core');
let pass = 0, fail = 0;
const ok = (name, condition) => { if (condition) pass++; else { fail++; console.error('  ✗ ' + name); } };
const rejects = (name, value) => { try { C.normalize(value); ok(name, false); } catch (_) { ok(name, true); } };

const clean = C.normalize({
  'Beach Tennis': { setsToWin: 1, gamesPerSet: 6, countingType: 'tennis', deuceRule: false, tieRule: 'ask' },
  'Tênis': { setsToWin: 3, gamesPerSet: 8, countingType: 'numeric', advantageRule: true },
});
ok('preserva apenas ajustes configuráveis', JSON.stringify(clean['Beach Tennis']) === JSON.stringify({ setsToWin: 1, gamesPerSet: 6, countingType: 'tennis' }));
ok('aceita mais de uma modalidade canônica', clean['Tênis'].setsToWin === 3);
rejects('rejeita modalidade desconhecida', { Futebol: { setsToWin: 1 } });
rejects('rejeita campo arbitrário', { Padel: { setsToWin: 1, uid: 'outro' } });
rejects('rejeita sets fora da interface', { Padel: { setsToWin: 4 } });
rejects('rejeita jogos fora da interface', { Padel: { gamesPerSet: 7 } });
rejects('rejeita contagem inválida', { Padel: { countingType: 'livre' } });
rejects('rejeita somente regra derivada', { Padel: { tieRule: 'ask' } });
rejects('rejeita mapa vazio', {});

console.log((fail ? '❌' : '✅') + ' casual-scoring-preferences-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
