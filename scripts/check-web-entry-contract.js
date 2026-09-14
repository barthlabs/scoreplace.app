#!/usr/bin/env node
/* Verifica o contrato estático do shell web antes de copiá-lo ou testá-lo.
 *
 * O Scoreplace ainda usa scripts clássicos por compatibilidade. A ordem deles é, portanto,
 * uma API: referenciar um arquivo ausente ou inverter produtor/consumidor pode deixar a tela
 * parcialmente montada sem erro de sintaxe. Este gate lê o HTML servido, não uma lista manual.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LOCAL = (url) => url && !/^(?:https?:)?\/\//i.test(url) && !/^(?:data:|mailto:|tel:|#)/i.test(url);
/* URLs iniciadas em `/` são raiz do site, não raiz do sistema de arquivos. O index de
 * saída do Vite usa essa forma para assets processados; dentro de `www/` ela aponta para
 * o mesmo pacote. */
const cleanUrl = (url) => String(url).split(/[?#]/, 1)[0].replace(/^\.?\//, '');

function verify(root = ROOT, report = console) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [];
  const styles = [];
  let match;
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const styleRe = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  while ((match = scriptRe.exec(html))) scripts.push(cleanUrl(match[1]));
  while ((match = styleRe.exec(html))) styles.push(cleanUrl(match[1]));

  const localScripts = scripts.filter(LOCAL);
  const localStyles = styles.filter(LOCAL);
  const failures = [];
  function requireFile(asset, type) {
    const resolved = path.resolve(root, asset);
    if (!resolved.startsWith(root + path.sep)) failures.push(type + ' sai da raiz: ' + asset);
    else if (!fs.existsSync(resolved)) failures.push(type + ' referenciado não existe: ' + asset);
  }
  localScripts.forEach((asset) => requireFile(asset, 'script'));
  localStyles.forEach((asset) => requireFile(asset, 'stylesheet'));
  localScripts.forEach((asset, index) => {
    if (localScripts.indexOf(asset) !== index) failures.push('script carregado mais de uma vez: ' + asset);
  });
  const requiredOrder = [
    ['js/domain/round-bounds.js', 'js/views/round-bounds-core.js'],
  ];
  requiredOrder.forEach(([producer, consumer]) => {
    const before = localScripts.indexOf(producer);
    const after = localScripts.indexOf(consumer);
    if (before < 0 || after < 0 || before >= after) {
      failures.push('ordem obrigatória violada: ' + producer + ' deve vir antes de ' + consumer);
    }
  });
  if (failures.length) {
    failures.forEach((failure) => report.error('✗ ' + failure));
    return false;
  }
  report.log('✓ contrato do shell: ' + localScripts.length + ' scripts e ' + localStyles.length + ' folhas locais resolvidos');
  return true;
}

if (require.main === module) process.exit(verify() ? 0 : 1);
module.exports = { verify };
