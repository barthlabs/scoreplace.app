/* rules-torneio-apagado-nao-volta.test.js
 *
 * ⛔ APAGADO É APAGADO. Ordem do dono (04/set/2026), depois de o "Torneio de Férias só
 * Casais" — que ele tinha APAGADO — reaparecer sozinho: _"apagado é apagado. deveria
 * continuar assim"_, e _"se formos criar lápide para tudo isso aqui vai virar o maior
 * cemitério do mundo"_.
 *
 * O QUE ACONTECEU, medido no `createTime` do SERVIDOR (o campo `createdAt` do app mentia):
 * documento criado em 02/set 12:42 carregando `createdAt` de 20/jun. Recriação a partir de
 * cópia em cache — o tick de 1s do prazo de inscrição chama `saveTournament(t)` com o `t`
 * da MEMÓRIA da aba, e lá dentro é `set(merge:true)`, que num doc inexistente CRIA.
 * 1 dos 47 torneios tinha a marca.
 *
 * A TRAVA, sem guardar defunto: o `allow create` exige `_nascidoEm == request.time`.
 * `serverTimestamp()` só o SERVIDOR carimba — payload de cache não tem o campo (ou tem um
 * velho) e é negado. A regra nunca pergunta "já foi apagado?"; pergunta "está nascendo?".
 *
 * ⚠️ Exceção declarada pelo dono: restaurar de backup roda pelo Admin SDK, que ignora as
 * rules. Recuperar DE PROPÓSITO pode; por acidente, não. (Não se testa aqui: o Admin SDK
 * por definição não passa por esta regra.)
 *
 * node tests/rules-torneio-apagado-nao-volta.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

const rules = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');

console.log('\n▸ ① a regra de CREATE de torneio exige o carimbo do servidor');
{
  const i = rules.indexOf('match /tournaments/{tournamentId}');
  ok(i > 0, 'achei o bloco de `tournaments`');
  const criar = rules.indexOf('allow create:', i);
  const atualizar = rules.indexOf('allow update:', criar);
  ok(criar > 0 && atualizar > criar, 'achei o `allow create` antes do `allow update`');
  const corpo = rules.slice(criar, atualizar);
  ok(/_nascidoEm\s*==\s*request\.time/.test(corpo),
    '⭐ o create exige `_nascidoEm == request.time` — só o servidor carimba isso');
  ok(!/_apagado|tombstone|lapide|deletedAt/i.test(corpo),
    '⛔ e NÃO consulta nenhum registro de defunto (nada de lápide)');
}

console.log('▸ ② quem CRIA de verdade manda o carimbo');
{
  const handler = fs.readFileSync(path.join(RAIZ, 'functions-autodraw', 'tournament-create.js'), 'utf8');
  ok(/_nascidoEm:\s*FieldValue.serverTimestamp\(\)/.test(handler),
    '⭐ a criação server-side leva `_nascidoEm: serverTimestamp()`');

}

console.log('▸ ③ o carimbo sobrevive à limpeza do payload');
{
  const persist = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'persist-core.js'), 'utf8');
  const i = persist.indexOf('window._cleanUndefined = function');
  ok(i > 0, 'achei o `_cleanUndefined`');
  const corpo = persist.slice(i, persist.indexOf('};', i));
  // Só objetos LITERAIS são reconstruídos; o sentinel do FieldValue passa inteiro.
  ok(/constructor === Object/.test(corpo),
    '⭐ ele só reconstrói objeto literal — o sentinel do serverTimestamp passa intacto');
}

console.log('▸ ④ a exclusão deixa LINHA DE LOG, e o log não decide nada');
{
  const fn = fs.readFileSync(path.join(RAIZ, 'functions', 'index.js'), 'utf8');
  const i = fn.indexOf('exports.purgeTournamentCopies');
  ok(i > 0, 'achei o gatilho de exclusão');
  const corpo = fn.slice(i, fn.indexOf('\nexports.', i + 1));
  ok(/tournamentDeletions/.test(corpo), '⭐ grava a linha em `tournamentDeletions`');
  ok(/apagadoEm[\s\S]{0,80}serverTimestamp\(\)/.test(corpo), 'com data e hora do servidor');
  ok(/catch/.test(corpo.slice(corpo.indexOf('tournamentDeletions'))),
    '⛔ e um log que falha NÃO derruba a limpeza das cópias');
  // O log é para gente ler: nenhuma regra pode depender dele.
  ok(!/tournamentDeletions/.test(rules),
    '⭐ nenhuma regra consulta o log — ele é histórico, não porteiro');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
