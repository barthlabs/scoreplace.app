/* REMOVE o que sobrou dos temas SUNSET e OCEAN.
 *
 * `js/theme.js` diz desde a v2.6.27: _"SÓ 2 temas — escuro e claro (sunset/ocean
 * removidos)"_. Removidos da ESCOLHA — mas o código deles ficou: dois blocos inteiros de
 * variáveis no style.css, regras de balão de dica, e ramos `else if (_theme === 'sunset')`
 * em três views que nunca executam.
 *
 * Ordem do dono (25/ago/2026), ao me ver dizer "3 temas": _"2 temas, que 3 temas?"_ e
 * _"podemos eliminar esse código morto?"_.
 *
 * ⛔ Código morto não é só peso: ele MENTE. Eu mesmo escrevi "3 temas" num relatório
 * porque a prova renderizava o sunset. O próximo leitor tomaria a mesma decisão errada.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let mudou = 0;
const edita = (rel, fn) => {
  const p = path.join(ROOT, rel);
  const antes = fs.readFileSync(p, 'utf8');
  const depois = fn(antes);
  if (depois === antes) { console.log('  = ' + rel + ' (nada a tirar)'); return; }
  fs.writeFileSync(p, depois);
  const dl = antes.split('\n').length - depois.split('\n').length;
  console.log('  ✂ ' + rel + '  −' + dl + ' linhas');
  mudou++;
};

/* Tira um bloco `seletor { … }` inteiro, com o comentário colado nele. */
function tiraBloco(css, seletor) {
  const i = css.indexOf(seletor + ' {');
  if (i === -1) return css;
  const f = css.indexOf('\n}', i);
  if (f === -1) return css;
  let ini = i;
  const antes = css.slice(0, i);
  const c = antes.lastIndexOf('/*');
  if (c !== -1 && antes.indexOf('*/', c) === -1) ini = c;      // comentário aberto colado
  else {
    const m = antes.match(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/\s*$/);
    if (m) ini = i - m[0].length;
  }
  return css.slice(0, ini) + css.slice(f + 2).replace(/^\n+/, '\n');
}

edita('css/style.css', (s) => {
  s = tiraBloco(s, '[data-theme="sunset"]');
  s = tiraBloco(s, '[data-theme="ocean"]');
  // regras avulsas dos dois temas
  s = s.replace(/^\[data-theme="(sunset|ocean)"\][^\n{]*\{[^}]*\}\n/gm, '');
  s = s.replace(/^\[data-theme="(sunset|ocean)"\][^\n{]*,\n/gm, '');
  s = s.replace('Ordem de ciclagem: dark → light → sunset → ocean',
                'Ordem de ciclagem: dark → light (só 2 temas — ver js/theme.js)');
  return s;
});

edita('css/components.css', (s) =>
  s.replace(/^\[data-theme="(sunset|ocean)"\][^\n{]*\{[^}]*\}\n/gm, '')
   .replace(/^\[data-theme="(sunset|ocean)"\][^\n{]*,\n/gm, ''));

edita('css/bracket.css', (s) => s.replace('Tema light/sunset:', 'Tema light:'));

/* As views: o ramo do tema morto sai, e o `_isLight` para de citá-lo. */
const tiraRamo = (s, tema) =>
  s.replace(new RegExp("\\s*\\} else if \\(_theme === '" + tema + "'\\) \\{[\\s\\S]*?(?=\\s*\\} else)", 'g'), '\n    ');

['js/views/dashboard.js', 'js/views/tournaments.js'].forEach((f) => edita(f, (s) => {
  s = tiraRamo(tiraRamo(s, 'sunset'), 'ocean');
  return s.replace(/\(_theme === 'light' \|\| _theme === 'sunset'\)/g, "(_theme === 'light')");
}));

/* hints.js: cadeia de ternários por tema. Tira os dois ramos mortos de qualquer forma que
 * eles apareçam (os valores diferem entre as duas linhas), em vez de casar o texto exato —
 * foi assim que a primeira versão deste script deixou a linha 795 passar. */
edita('js/hints.js', (s) => s.replace(
  /theme === '(?:sunset|ocean)' \? '[^']*' : /g, ''));

/* auth.js: mapa de cor POR TEMA — as chaves mortas nunca são consultadas. */
edita('js/views/auth.js', (s) => s.replace(
  /(\{\s*dark: '[^']*', light: '[^']*'), sunset: '[^']*', ocean: '[^']*'(\s*\})/,
  "$1$2  // só 2 temas (js/theme.js)"));

console.log('\narquivos alterados: ' + mudou);
