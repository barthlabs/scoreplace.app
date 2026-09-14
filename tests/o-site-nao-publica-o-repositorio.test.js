'use strict';
/* ⛔⛔ O SITE PUBLICA O SITE — NÃO O REPOSITÓRIO INTEIRO.
 *
 * ⛔ COMO ISSO APARECEU (13/set/2026): a publicação falhou duas vezes seguidas no envio, e ao
 * abrir o log eu vi que estavam subindo 1452 arquivos. O Hosting apontava para a raiz e a
 * lista de exclusão era frágil: qualquer diretório novo poderia ir para a web.
 *
 * ⛔ E NÃO ERA SÓ PESO. MEDIDO no ar: `scoreplace.app/tests/fixtures/prod-tournaments.json`
 * respondia 200 com 470 KB — e dentro dela havia **um e-mail real de uma pessoa** que tinha
 * escapado da anonimização. Qualquer um podia baixar.
 *
 * ⭐ A regra: só vai ao ar o que o site REALMENTE usa. Conferido varrendo `js/`, `css/`,
 * `index.html`, `sw.js` e `manifest.json` — as citações a `tests/` e `scripts/` que existiam
 * estavam todas dentro de COMENTÁRIOS.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const cfg = JSON.parse(fs.readFileSync(path.join(raiz, 'firebase.json'), 'utf8'));

console.log('\n──── o site não publica o repositório ────\n');

// ── ① o que NUNCA pode ir ao ar ────────────────────────────────────────────
must(cfg.hosting && cfg.hosting.public === 'www',
  '① ⛔ Firebase só pode servir `www/`, o artefato gerado — nunca a raiz do repositório');
const predeploy = (cfg.hosting && cfg.hosting.predeploy) || [];
must(predeploy.includes('npm run build:hosting'),
  '① ⛔ o artefato Vite é montado no predeploy, depois do prerender da versão');

// ── ② e o que o site PRECISA continua entrando ─────────────────────────────
['js', 'css', 'icons', 'assets'].forEach((d) => {
  must(fs.existsSync(path.join(raiz, d)),
    '② ⭐ a fonte contém `' + d + '/` para o Vite montar no artefato');
});

// ── ③ nenhum dado de pessoa real nas fixturas ──────────────────────────────
/* ⛔ A trava real: mesmo fora do ar, fixtura com e-mail de gente é dado de pessoa dentro de um
 * repositório público. Foi assim que um endereço vazou. */
const fixturas = path.join(raiz, 'tests/fixtures');
let achados = [];
if (fs.existsSync(fixturas)) {
  fs.readdirSync(fixturas).filter((f) => /\.json$/.test(f)).forEach((f) => {
    const t = fs.readFileSync(path.join(fixturas, f), 'utf8');
    (t.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).forEach((e) => {
      if (!/@(exemplo\.test|example\.(com|test)|teste\.local)$/i.test(e) &&
          !/@phone\.scoreplace\.app$/i.test(e)) achados.push(f + ': ' + e);
    });
  });
}
must(achados.length === 0,
  '③ ⭐⭐ nenhuma fixtura carrega e-mail de pessoa real' +
  (achados.length ? ' — achei: ' + achados.slice(0, 3).join(' · ') : ''));

console.log('\n✅ ' + ok + ' verificações');
