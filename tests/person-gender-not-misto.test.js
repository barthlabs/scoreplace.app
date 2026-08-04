/* "Misto" é CATEGORIA, nunca gênero de pessoa — node tests/person-gender-not-misto.test.js
 * O dono viu a pílula "Misto 3" na linha "por gênero", entre Fem 91 e Masc 14, num torneio
 * de categoria única. Três inscritos estavam com a CATEGORIA gravada no campo `gender`.
 * Contar isso como gênero é inventar um gênero que não existe.
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

ok(/function _personGender\(g\)/.test(src), 'existe uma regra separada pra gênero de PESSOA');
const fn = src.slice(src.indexOf('function _personGender'), src.indexOf('function _personGender') + 220);
ok(/'Fem' \|\| L === 'Masc'/.test(fn), 'e ela só admite Fem ou Masc');

// a linha "por gênero" não conta nem oferece Misto
ok(!/byGender\.Misto > 0/.test(src), 'a pílula "⚥ Misto" saiu da linha por gênero');
const overview = src.slice(src.indexOf('function _renderOverview'), src.indexOf('function _renderOverview') + 1500);
ok(/_personGender\(r\.gender\) \|\| 'sem'/.test(overview), 'a contagem por gênero usa a regra de pessoa');

// o seletor da linha do inscrito também não oferece "misto" como gênero
const linha = src.slice(src.indexOf('var gMap = {'), src.indexOf('var gMap = {') + 420);
ok(!/Misto:/.test(linha), 'o seletor de gênero do inscrito não oferece Misto');
ok(!/'misto'/.test(linha), 'e não grava "misto" no campo de gênero de ninguém');

// o filtro por gênero idem
const filtro = src.slice(src.indexOf("if (gf !== 'all')"), src.indexOf("if (gf !== 'all')") + 300);
ok(/_personGender\(r\.gender\)/.test(filtro), 'o filtro por gênero usa a regra de pessoa');

// e o casamento de CATEGORIA continua entendendo "Misto" (não pode ter quebrado)
ok(/misto: 'Misto'/.test(src), '_genderLabel continua reconhecendo a CATEGORIA Misto');
ok(/GENDER_PREFIXES = \['Fem', 'Masc', 'Misto Aleat\.', 'Misto Obrig\.', 'Misto'\]/.test(src),
  'os prefixos de categoria seguem intactos');

console.log((fail ? '✗' : '✓') + ' person-gender-not-misto: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
