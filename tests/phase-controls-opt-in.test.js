'use strict';
/* Regressão de configuração visual das fases.
 * Não é teste de CSS: protege as duas regras de produto que a tela deve expor.
 *  1. Fechada não admite entrada tardia, logo não oferece a escolha Suplentes/Novos Confrontos.
 *  2. Prazos por rodada são opt-in; desativar não pode manter datas escondidas no save.
 */
const assert = require('assert');
const fs = require('fs');

const create = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const f2ui = fs.readFileSync('js/views/format2-ui.js', 'utf8');
const f2 = fs.readFileSync('js/views/format2.js', 'utf8');
const bracket = fs.readFileSync('js/views/bracket.js', 'utf8');

assert.ok(create.includes('id="late-matchups-choice"'), 'a escolha tardia da fase inicial tem wrapper próprio');
assert.ok(/matchupChoice\.style\.display = isOpen \? '' : 'none'/.test(create), 'Fechadas esconde a escolha de entradas tardias');
assert.ok(/var confRow = !isClosed \? modeSwitch/.test(f2ui), 'a eliminatória também omite a escolha quando fechada');
assert.ok(bracket.includes('(!_leFechadas ? _linhaTog'), 'o atalho da chave segue a mesma regra');

assert.ok(create.includes('id="round-bounds-enabled"'), 'a fase inicial tem toggle explícito para prazos por rodada');
assert.ok(create.includes("if (!((document.getElementById('round-bounds-enabled') || {}).checked)) return [];"), 'desligar limpa os prazos antes do save');
assert.ok(f2.includes('roundBoundsEditorEnabled: false'), 'formato novo nasce com o editor de prazos desligado');
assert.ok(f2ui.includes('window._f2ElimRoundBoundsEnabled'), 'a eliminatória também pode ligar ou desligar o editor');

assert.ok(create.includes('^#novo-torneio(?:\\/|$)'), 'Voltar reconhece a rota de edição #novo-torneio/<id>');

console.log('phase controls opt-in: ok');
