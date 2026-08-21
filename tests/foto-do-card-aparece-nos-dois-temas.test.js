/* A FOTO DO CARD APARECE NOS DOIS TEMAS.
 * node tests/foto-do-card-aparece-nos-dois-temas.test.js
 *
 * RELATO DO DONO (21/ago/2026): _"no tema claro não vejo a foto do local ou do torneio
 * carregada no card como acontece no tema escuro."_
 *
 * MEDIDO no navegador antes do conserto: o MESMO card entregava `background-image: none`
 * no tema claro e a foto no escuro. A causa é a soma de duas decisões antigas, cada uma
 * certa sozinha:
 *   • a foto NÃO vem no HTML do card — pintar a URL do Places era PAGAR (v1.7.53) e a
 *     base64 saiu da string na 1.9.50; ela é pintada DEPOIS, pelos hidratadores, em
 *     `element.style.backgroundImage`;
 *   • o tema claro força `background: var(--bg-card) !important` em `.card`, pra que os
 *     cards de gradiente escuro não fiquem escuros no claro.
 * Estilo inline SEM `!important` perde pra folha COM `!important` → a foto recém-pintada
 * era apagada. `.card-has-photo` não cobria o caso: essa classe só existe quando o card
 * JÁ NASCE com foto, e o card de foto de LOCAL nasce sem. O sinal certo é
 * `data-vphoto-on`, que os dois hidratadores ligam SÓ quando a foto foi mesmo pintada.
 *
 * ⚠️ POR QUE ESTE TESTE É DE STRING E NÃO DE NAVEGADOR: o gate (`npm test`) é headless.
 * A prova visual foi feita à parte, no Chromium, e ela tem uma armadilha registrada:
 * `.card` tem `transition: color .3s, background-color .3s` — ler `getComputedStyle`
 * logo depois de mudar atributo/classe devolve o valor ANTIGO e parece que o motor não
 * reavaliou o seletor. Medir depois de ~400ms.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js', 'store.js'), 'utf8');

// ─── 1) a regra do tema claro POUPA quem tem foto pintada ──────────────────────────────
(function () {
  const re = /\[data-theme="light"\]\s+\.card:not\(\.card-has-photo\)(:not\(\[data-vphoto-on\]\))?/g;
  const achados = css.match(re) || [];
  ok(achados.length >= 2, 'a regra do tema claro para `.card` existe (fundo e títulos) — got ' + achados.length);
  ok(achados.every(function (a) { return a.indexOf('[data-vphoto-on]') > -1; }),
     'TODAS elas poupam `[data-vphoto-on]` — deixar uma de fora é deixar metade do defeito de pé');
})();

// ─── 2) título sobre foto é claro nos DOIS temas ───────────────────────────────────────
(function () {
  ok(/\[data-vphoto-on\]\s+h4/.test(css), 'título sobre foto tem regra própria (h1..h6 têm cor própria — no claro, quase preta)');
})();

// ─── 3) os DOIS hidratadores pintam pela MESMA porta, e ela marca o card ───────────────
(function () {
  ok(store.indexOf('function _pintarFotoNoCard') > -1, '_pintarFotoNoCard existe (fonte única da pintura)');
  const i = store.indexOf('function _pintarFotoNoCard');
  const corpo = store.slice(i, i + 700);
  ok(/setProperty\('background-image', imagem, 'important'\)/.test(corpo), 'a foto é pintada com !important (não depende da ordem em que o marcador chega)');
  ok(corpo.indexOf("setAttribute('data-vphoto-on', '1')") > -1, 'e liga o marcador `data-vphoto-on` — é ele que o CSS lê');
  // nenhum hidratador pode voltar a pintar "na mão"
  const pinturasSoltas = (store.match(/style\.backgroundImage\s*=/g) || []).length;
  ok(pinturasSoltas === 0, 'nenhum hidratador pinta por fora da porta única — got ' + pinturasSoltas);
  const chamadas = (store.match(/_pintarFotoNoCard\(/g) || []).length;
  ok(chamadas >= 3, 'os DOIS hidratadores (foto do local e capa do torneio) chamam a porta — got ' + (chamadas - 1) + ' chamada(s)');
})();

console.log('\n  ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
