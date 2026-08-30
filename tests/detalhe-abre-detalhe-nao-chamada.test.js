/* DETALHE ABRE DETALHE, NÃO A CHAMADA
 *
 * O card da dashboard já navega para #tournaments/:id. O detalhe não pode, por
 * sua vez, injetar a lista de inscritos: filtro, presença e W.O. pertencem à
 * rota explícita #participants/:id, acessada pelo botão "👥 Inscritos".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  console.log((condition ? '  ✓ ' : '  ✗ ') + message);
  if (!condition) fail++;
}

console.log('\nDETALHE ABRE DETALHE, NÃO CHAMADA');
const htmlStart = src.indexOf('    const html = `');
const htmlEnd = src.indexOf('    container.innerHTML = html;', htmlStart);
const detailTemplate = htmlStart >= 0 && htmlEnd > htmlStart ? src.slice(htmlStart, htmlEnd) : '';

ok(detailTemplate.length > 0, 'encontrou o template final do detalhe');
ok(!/\$\{\s*hasDrawn\s*\?\s*''\s*:\s*participantsHtml\s*\}/.test(detailTemplate),
   'o detalhe não injeta participantsHtml antes do sorteio');
ok(!/\$\{\s*participantsHtml\s*\}/.test(detailTemplate),
   'a chamada não é emitida em nenhuma condição no detalhe');
ok(/window\.location\.hash='#participants\/\$\{t\.id\}'/.test(src),
   'o botão "👥 Inscritos" continua levando para a rota própria');

console.log(fail ? '\n❌ ' + fail + ' falha(s)\n' : '\n✅ detalhe separado da chamada\n');
process.exit(fail ? 1 : 0);
