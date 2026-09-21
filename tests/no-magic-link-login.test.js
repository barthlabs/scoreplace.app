'use strict';

/* Login por link mágico foi descontinuado. Documentação histórica pode citar o
 * mecanismo, mas nenhum artefato executável pode voltar a pedir, gerar, ler ou
 * consumir esse tipo de login. A varredura não percorre docs/ nem tests/. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const roots = ['js', 'functions', 'functions-autodraw'];
const extensions = new Set(['.js', '.html']);
const banned = [
  /sendMagicLink\b/, /signInWithEmailLink\b/, /isSignInWithEmailLink\b/,
  /generateSignInWithEmailLink\b/, /collection\(\s*['"]magicLinks['"]\s*\)/,
  /[?&]ml=/, /['"]email_link['"]/,
];
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
console.log((fail ? '❌' : '✅') + ' no-magic-link-login: ' + files + ' arquivos executáveis, ' + fail + ' ocorrência(s)');
process.exit(fail ? 1 : 0);
