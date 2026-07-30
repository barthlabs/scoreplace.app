/* Rótulo de organização usa o GÊNERO DO PERFIL — node tests/org-gender-label.test.js
 * Defeito visto pelo dono (30/jul/2026): Kelly e Raquel, ambas com gênero declarado,
 * apareciam como "Co-organizador(a)". O resolvedor só olhava o usuário logado e
 * `t.participants[].gender` — e o doc deixou de guardar dados de quem tem perfil, então
 * a co-organizadora caía sempre na forma neutra. O cache de perfis por uid já existia.
 */
const { window, load } = require('./headless.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

window._userProfileCache = {
  'uid-kelly': { displayName: 'Kelly Barth', gender: 'feminino' },
  'uid-raquel': { displayName: 'Raquel Unger', gender: 'feminino' },
  'uid-nelson': { displayName: 'Nelson Barth', gender: 'masculino' },
  'uid-sem': { displayName: 'Alex' }
};
window._genderForUid = function (uid) { var p = uid && window._userProfileCache[uid]; return (p && p.gender) || ''; };
// _genderWord canônico, extraído do store.js (carregar o store inteiro exige DOM).
{
  const fs = require('fs'), pth = require('path');
  const src = fs.readFileSync(pth.join(__dirname, '..', 'js', 'store.js'), 'utf8');
  const i = src.indexOf('window._genderWord = function');
  const j = src.indexOf('\n};', i) + 3;
  require('vm').runInContext(src.slice(i, j), require('./headless.js').sandbox, { filename: 'genderWord.js' });
}

const gw = window._genderWord;
ok(gw(window._genderForUid('uid-kelly'), 'Co-organizador', 'Co-organizadora') === 'Co-organizadora',
  'mulher com gênero no perfil → Co-organizadora');
ok(gw(window._genderForUid('uid-nelson'), 'Co-organizador', 'Co-organizadora') === 'Co-organizador',
  'homem com gênero no perfil → Co-organizador');
ok(gw(window._genderForUid('uid-sem'), 'Co-organizador', 'Co-organizadora') === 'Co-organizador(a)',
  'sem gênero declarado → forma neutra (só aí)');
ok(gw(window._genderForUid('uid-kelly'), 'Organizador', 'Organizadora') === 'Organizadora',
  'vale igual pro rótulo de Organizadora');
ok(window._genderForUid('uid-raquel') === 'feminino', 'o gênero vem do CACHE DE PERFIL, não do doc do torneio');

// o resolvedor da tela precisa consultar o cache — sem isso o defeito volta
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
const bloco = src.slice(src.indexOf('var _resolveOrgGender'), src.indexOf('var _resolveOrgGender') + 1400);
ok(/_genderForUid/.test(bloco), '_resolveOrgGender consulta o cache de perfis por uid');

console.log((fail ? '✗' : '✓') + ' org-gender-label: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
