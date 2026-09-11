const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { classificarTorneio, resumir } = require(path.join(ROOT, 'scripts', 'censo-formatos-legados-core'));

const antigo = classificarTorneio({ genderCategories: ['F'], skillCategories: ['A'], ligaInactivity: 2 });
assert.equal(antigo.categoriasPorEixos, true, 'eixos antigos precisam aparecer: fallback ainda necessário');
assert.equal(antigo.ligaLegada, true, 'campo legado de liga precisa aparecer');
const atual = classificarTorneio({ _semPesados: ['matches'], combinedCategories: ['F A'], rankingNewPlayerScore: 10 });
assert.equal(atual.dividido, true);
assert.equal(atual.categoriasCanonicas, true);
assert.equal(atual.categoriasPorEixos, false);
const r = resumir([{ genderCategories: ['M'] }, { _semPesados: ['matches'], combinedCategories: ['F A'], rankingNewPlayerScore: 10 }]);
assert.deepEqual(r, { total: 2, divididos: 1, inteiros: 1, categoriasCanonicas: 1, categoriasPorEixos: 1, categoriasSemDados: 0, rankingNovo: 1, rankingInatividade: 0, ligaLegada: 0, semMarcadorDeFonte: 1 });

const fonte = fs.readFileSync(path.join(ROOT, 'scripts', 'censo-formatos-legados.js'), 'utf8');
assert.ok(/SOMENTE LEITURA/.test(fonte));
assert.ok(!/\.post\s*\(/i.test(fonte) && !/\.patch\s*\(/i.test(fonte) && !/\.delete\s*\(/i.test(fonte), 'censo não pode conter mutação HTTP');
console.log('✅ L9: censo de formatos é puro, classifica fallback e não escreve');
