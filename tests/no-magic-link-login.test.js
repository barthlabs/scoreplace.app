'use strict';

/* Login por link mágico foi descontinuado. Documentação histórica pode citar o
 * mecanismo, mas nenhum artefato executável pode voltar a pedir, gerar, ler ou
 * consumir esse tipo de login. A varredura não percorre docs/ nem tests/. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const roots = ['js', 'functions', 'functions-autodraw'];
const extensions = new Set(['.js', '.html']);
/* ⛔ A LISTA NÃO MORA AQUI (22/set/2026). Ela vem de `scripts/magic-link-patterns.js`,
 * a MESMA que a trava do pacote embarcado usa (`scripts/check-bundle-sem-link-magico.js`,
 * chamada por `check-embedded-www.sh` nos dois releases nativos).
 * Duas listas divergem: a fonte ficaria limpa e o pacote que vai à loja, não — que é
 * exatamente o estado medido naquele dia (fonte com 0, pacotes com o fluxo em 3 arquivos). */
const banned = require('../scripts/magic-link-patterns.js').PADROES.map((p) => p.re);
let fail = 0, files = 0;
function visit(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name.startsWith('.')) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) visit(full);
    else if (extensions.has(path.extname(item.name))) {
      files++;
      const source = fs.readFileSync(full, 'utf8');
      banned.forEach((pattern) => {
        if (pattern.test(source)) { console.error('✗ login mágico ativo: ' + path.relative(ROOT, full) + ' (' + pattern + ')'); fail++; }
      });
    }
  }
}
roots.forEach((relative) => visit(path.join(ROOT, relative)));
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
banned.forEach((pattern) => { if (pattern.test(index)) { console.error('✗ login mágico ativo: index.html (' + pattern + ')'); fail++; } });
// Rules de produção e a cópia de transição também são código publicável. A
// segunda pode voltar a ser aplicada no corte de amizade; por isso não pode
// ressuscitar uma coleção pública de login por link.
['firestore.rules', 'firestore.rules.etapaA'].forEach((file) => {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (/magicLinks|sendMagicLink|[?&]ml=/.test(source)) {
    console.error('✗ login mágico presente em Rules: ' + file);
    fail++;
  }
});
const authSource = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
if (/function\s+(?:handleEmailRegister|toggleEmailMode)\b/.test(authSource)) { console.error('✗ helper legado de cadastro: handleEmailRegister/toggleEmailMode'); fail++; }
console.log((fail ? '❌' : '✅') + ' no-magic-link-login: ' + files + ' arquivos executáveis, ' + fail + ' ocorrência(s)');
process.exit(fail ? 1 : 0);
