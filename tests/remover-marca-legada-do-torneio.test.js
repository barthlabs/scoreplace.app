/* REMOÇÃO DE MARCA NÃO PODE RESSUSCITAR BASE64 LEGADO
 *
 * A tela manda `coverUrl: ''` quando o organizador remove a capa. O documento antigo
 * pode ainda conter `coverPhotoData`; se a Function só apagar a URL, o acessor visual
 * cai no base64 e a capa reaparece. Esta trava exige a limpeza dos dois lados.
 */
const fs = require('fs');
const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
let fail = 0;
function ok(value, message) { if (value) console.log('✓ ' + message); else { fail++; console.error('✗ ' + message); } }

ok(/const removesLegacyBranding = \(patch\.coverUrl === '' && !!\(t\.coverUrl \|\| t\.coverPhotoData\)\)/.test(source),
  'URL vazia de capa é tratada como alteração quando ainda existe marca legada');
ok(/key === 'coverUrl' && patch\[key\] === ''[\s\S]*?delete t\.coverUrl;[\s\S]*?delete t\.coverPhotoData;/.test(source),
  'remover capa apaga URL e base64 legado no documento canônico');
ok(/key === 'logoUrl' && patch\[key\] === ''[\s\S]*?delete t\.logoUrl;[\s\S]*?delete t\.logoData;/.test(source),
  'o mesmo contrato vale para logo, evitando a mesma regressão');
process.exit(fail ? 1 : 0);
