'use strict';

/* ⛔⛔ QUEM DISPARA O AVISO NÃO RECEBE O PRÓPRIO AVISO — por UID **ou** por e-mail.
 *
 * O defeito nasceu de um conserto: com o e-mail do organizador fora do documento (LGPD,
 * 25/set/2026), a edição do torneio passou a excluir o autor por UID. Só que o laço dos
 * participantes continuava comparando SÓ e-mail — então o organizador que também está INSCRITO
 * recebia aviso da própria edição. Trocar a chave de um lado e não do outro é o jeito clássico
 * de criar defeito ao consertar; esta suíte prende os DOIS lados.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/views/tournaments-organizer.js'), 'utf8');

// Recorta a função pelo PRÓPRIO identificador (nunca por tamanho fixo, nunca por vizinho).
const ini = src.indexOf('window._notifyTournamentParticipants = async function');
assert.ok(ini > 0, 'achou a função de aviso aos participantes');
const fim = src.indexOf('\n};\n', ini);
const fn = src.slice(ini, fim > ini ? fim : undefined);

/* ⛔ AS ASSERÇÕES DE AUSÊNCIA OLHAM SÓ O CÓDIGO. A primeira versão desta suíte reprovou na
 * PRÓPRIA anotação que eu havia escrito ao lado — a explicação cita o campo que saiu, e o
 * `doesNotMatch` casou no comentário. Comentário não executa; medir texto sem separar código de
 * prosa dá tanto falso VERMELHO quanto falso verde. */
const codigo = fn.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

assert.match(fn, /function\(tournament, notifData, excluir\)/,
  'o parâmetro se chama `excluir` — é e-mail OU uid, e o nome diz isso');
assert.match(fn, /if \(e && e === excluir\) return;/,
  'exclui por e-mail (participante informal, que não tem conta)');
assert.match(fn, /if \(excluir && _allUids\(p\)\.indexOf\(excluir\) !== -1\) return;/,
  '⛔ e exclui por UID — inclusive p1/p2 de dupla, porque `_allUids` devolve os dois');
assert.doesNotMatch(codigo, /excludeEmail/,
  'não sobrou nenhum resíduo do nome antigo, que prometia só e-mail');

// E o organizador entra na lista por uid, não por endereço.
assert.match(fn, /var orgUid = t\.creatorUid \|\| '';/,
  'o organizador entra por uid');
assert.match(fn, /orgUid !== excluir/,
  'e o organizador que dispara o aviso também é excluído');
assert.doesNotMatch(codigo, /t\.organizerEmail/,
  '⛔ nenhuma leitura do e-mail do documento (LGPD): o campo saiu');

// O chamador que gerou o defeito: a edição do torneio exclui o AUTOR por uid.
const criar = fs.readFileSync(path.join(root, 'js/views/create-tournament.js'), 'utf8');
assert.match(criar, /_notifyTournamentParticipants\(_freshEdit, \{[\s\S]{0,200}?\}, _freshEdit\.creatorUid\)/,
  'a edição do torneio exclui o autor por uid (era por e-mail, que saiu do documento)');

console.log('✅ aviso exclui por uid E por e-mail — 8 verificações (ausência medida no CÓDIGO, não no comentário)');
