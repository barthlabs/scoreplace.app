const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { classificarTorneio, resumir } = require(path.join(ROOT, 'scripts', 'censo-formatos-legados-core'));

const antigo = classificarTorneio({ genderCategories: ['F'], skillCategories: ['A'], rankingInactivity: 2 });
assert.equal(antigo.categoriasPorEixos, true, 'eixos antigos precisam aparecer: fallback ainda necessário');
assert.equal(antigo.rankingLegado, true, 'campo ranking legado precisa aparecer');
const atual = classificarTorneio({ _semPesados: ['matches'], combinedCategories: ['F A'], ligaNewPlayerScore: 'zero' });
assert.equal(atual.dividido, true);
assert.equal(atual.categoriasCanonicas, true);
assert.equal(atual.categoriasPorEixos, false);
assert.equal(atual.ligaAtual, true, 'campo liga atual não pode ser contado como legado');
const r = resumir([{ genderCategories: ['M'] }, { _semPesados: ['matches'], combinedCategories: ['F A'], rankingNewPlayerScore: 10 }]);
assert.deepEqual(r, { total: 2, divididos: 1, inteiros: 1, categoriasCanonicas: 1, categoriasPorEixos: 1, categoriasSemDados: 0, rankingLegado: 1, ligaAtual: 0, semMarcadorDeFonte: 1 });

const fonte = fs.readFileSync(path.join(ROOT, 'scripts', 'censo-formatos-legados.js'), 'utf8');
assert.ok(/SOMENTE LEITURA/.test(fonte));
assert.ok(!/\.post\s*\(/i.test(fonte) && !/\.patch\s*\(/i.test(fonte) && !/\.delete\s*\(/i.test(fonte), 'censo não pode conter mutação HTTP');
console.log('✅ L9: censo de formatos é puro, classifica fallback e não escreve');
