/* O caso REAL da Kelly: leitura completa que ficava violeta — node tests/kelly-verde.test.js
 *
 * MEDIDO no documento dela em 03/ago/2026, depois de puxar com a extensão 1.95:
 *   160 de 160 partidas no acervo · índice varrido inteiro · 8 torneios e 8 rankings no
 *   footprint, com nome e classificação · e o nome VIOLETA.
 * Duas causas independentes, as duas minhas:
 *   1) o veredito lia `li.tournaments` e `li.rankings`, campos que o `normalize` NUNCA
 *      devolve (ele entrega games/footprint/categories/rating/pairs). A evidência sempre
 *      esteve no FOOTPRINT.
 *   2) a completude exigia contagem de PÁGINAS além dos ids: `pagesTotal: 9` com 8
 *      marcadas, porque a 9ª (2 jogos) já tinha vindo por outro caminho e nunca precisou
 *      ser aberta. Com índice, quem prova cobertura é o id, não a página.
 */
const path = require('path'), fs = require('fs');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');

console.log('\n── a evidência sai do footprint, não de campos que não existem ──');
{
  ok(!/\(li\.tournaments \|\| \[\]\)\.filter/.test(app), 'ninguém mais lê `li.tournaments` (o normalize não devolve isso)');
  ok(/var _fpT = _fp\.filter\(function \(x\) \{ return x && x\.official; \}\);/.test(app), 'torneios saem do footprint (official)');
  ok(/var _fpR = _fp\.filter\(function \(x\) \{ return x && !x\.official; \}\);/.test(app), 'e rankings idem');
  ok(/_lzEvidence\(champCats, _fpR,/.test(app), 'e é isso que alimenta a evidência');
  const imp = fs.readFileSync(path.join(__dirname, '..', 'extension', 'lib', 'letzplay-import.js'), 'utf8');
  const ret = imp.slice(imp.indexOf("      source: 'letzplay',") - 20, imp.indexOf("      stats: raw.stats || null"));
  ok(!/^\s*tournaments:/m.test(ret), 'o normalize de fato NÃO devolve tournaments — era leitura de campo inexistente');
  ok(/footprint: footprint/.test(ret), 'ele devolve footprint, que é onde title/standings/winPct moram');
}

console.log('\n── com índice, a PÁGINA não decide a completude ──');
{
  const fn = app.slice(app.indexOf('function _lzImportComplete'), app.indexOf('function _lzImportComplete') + 2600);
  ok(/if \(!\(li\.indexTotal > 0\) && _c\.pagesTotal > 0/.test(fn),
     'a contagem de páginas só vale quando NÃO há índice');
  ok(/PÁGINA É MEIO, NÃO FIM/.test(fn), 'com a razão escrita no código');

  // a regra em si, com os números reais dela
  function completa(li) {
    const n = li.gamesTotal;
    const c = li.lzCursor;
    if (c && c.complete === true && !li.partialReason) {
      const alvo = li.indexTotal > 0 ? li.indexTotal : (li.declaredGames > 0 ? Math.floor(li.declaredGames * 0.95) : 0);
      if (alvo > 0 && n < alvo) return false;
      if (!(li.indexTotal > 0) && c.pagesTotal > 0 && c.pagesRead) {
        let lidas = 0; for (let k = 1; k <= c.pagesTotal; k++) if (c.pagesRead[k]) lidas++;
        if (lidas < c.pagesTotal) return false;
      }
      return true;
    }
    return false;
  }
  const kelly = { gamesTotal: 162, indexTotal: 160, declaredGames: 162,
    lzCursor: { complete: true, pagesTotal: 9, pagesRead: {1:1,2:1,3:1,4:1,5:1,6:1,7:1,8:1} } };
  ok(completa(kelly) === true, 'Kelly: 160 de 160 ids no acervo → COMPLETA, mesmo com a página 9 nunca aberta');

  const truncada = { gamesTotal: 20, indexTotal: 160, declaredGames: 162,
    lzCursor: { complete: true, pagesTotal: 9, pagesRead: {1:1} } };
  ok(completa(truncada) === false, 'e um acervo de 20 com índice de 160 continua INCOMPLETO — o id é que manda');

  const semIndice = { gamesTotal: 150, declaredGames: 158,
    lzCursor: { complete: true, pagesTotal: 8, pagesRead: {1:1,2:1,3:1} } };
  ok(completa(semIndice) === false, 'sem índice, a página volta a ser a única prova e reprova leitura pela metade');
}

console.log((fail ? '✗' : '✓') + ' kelly-verde: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
