/* DETALHE ABRE DETALHE, NÃO A CHAMADA
 *
 * O card da dashboard já navega para #tournaments/:id. O detalhe não pode, por
 * sua vez, injetar a CHAMADA: filtro, presença e W.O. pertencem à rota explícita
 * #participants/:id. Antes do sorteio, os cards canônicos aparecem logo abaixo
 * da Organização; depois do sorteio, ficam exclusivamente na chamada.
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
ok(/\$\{\s*tournamentId\s*\?\s*detailParticipantsHtml\s*:\s*''\s*\}/.test(detailTemplate),
   'o detalhe emite a seção própria de cards canônicos');
ok(detailTemplate.indexOf('detailParticipantsHtml') > detailTemplate.indexOf('_organizersHtml'),
   'os cards entram logo abaixo da Organização');
ok(/data-detail-participants="1"/.test(src),
   'a seção de cards da ficha é identificável e exclusiva');
ok(/canRollCall:\s*false[\s\S]{0,220}cardPresence:\s*null/.test(src),
   'os cards da ficha não recebem ações de chamada');
ok(/chrome:\s*false/.test(src),
   'a seção canônica de duplas entra sem filtro, presença ou W.O.');
const detailBuilder = src.slice(src.indexOf('// ── Inscritos NA FICHA'), src.indexOf('// Check if tournament has bracket content'));
ok(/if\s*\(\s*!drawDone\s*\)/.test(detailBuilder) && /data-detail-participants="1"/.test(detailBuilder),
   'os cards da ficha são montados somente antes do sorteio');
ok(/window\.location\.hash='#participants\/\$\{t\.id\}'/.test(src),
   'o botão "👥 Inscritos" continua levando para a rota própria');
const preDrawActions = src.slice(src.indexOf('} else {\n                    // A ficha mostra os cards'), src.indexOf('} else if (!window.AppStore.currentUser)', src.indexOf('} else {\n                    // A ficha mostra os cards')));
ok(/grid-template-columns:1fr 1fr/.test(preDrawActions) && /#participants\/\$\{t\.id\}/.test(preDrawActions),
   'antes do sorteio, a ficha também mantém o botão Inscritos para a chamada');
const organizerActions = src.slice(src.indexOf('// --- Build actionsHtml based on tournament state ---'), src.indexOf('} else if (!window.AppStore.currentUser)'));
ok((organizerActions.match(/#participants\/\$\{t\.id\}/g) || []).length === 3,
   'Regras e Inscritos aparecem canonicamente nos três estados do organizador');

console.log(fail ? '\n❌ ' + fail + ' falha(s)\n' : '\n✅ detalhe separado da chamada\n');
process.exit(fail ? 1 : 0);
