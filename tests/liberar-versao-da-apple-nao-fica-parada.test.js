'use strict';
/* ⛔ APROVADA NÃO É PUBLICADA — e o script dizia que era.
 *
 * MEDIDO em 12/set/2026: a iOS 2.2.81 passou na revisão da Apple e ficou parada em
 * `PENDING_DEVELOPER_RELEASE`, esperando alguém apertar "Liberar esta versão". Todas as
 * versões anteriores da conta estão em `AFTER_APPROVAL`; só ela saiu `MANUAL`.
 *
 * DUAS falhas nossas, no mesmo arquivo:
 *   ① `releaseType: 'AFTER_APPROVAL'` só era escrito no ramo que CRIA a versão. Quando ela
 *      já existia — criada pelo upload do Xcode ou pela interface, que nascem MANUAL — o
 *      ramo do "já existe" não tocava no campo.
 *   ② e o script IMPRIMIA, no fim, "Liberação: automática após aprovação" de qualquer jeito.
 *      Foi essa frase que nos fez acreditar que a publicação sairia sozinha.
 *   ③ e não havia verbo pra LIBERAR: o script sabia submeter e parava ali, então a última
 *      perna era clique manual — sem rastro, e fácil de ninguém dar.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const ASC = fs.readFileSync(path.join(raiz, 'scripts/asc.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① versão que JÁ EXISTIA também é corrigida ──────────────────────────────
const iSub = ASC.indexOf("if (cmd === 'submeter')");
assert.ok(iSub > 0, 'âncora: o verbo submeter');
const sub = semComentario(ASC.slice(iSub));

must(/if \(ver\.attributes\.releaseType !== 'AFTER_APPROVAL'\)/.test(sub),
  '① ⭐ o ramo do "já existe" confere a liberação (antes só o ramo que CRIA definia)');
must(/attributes: \{ releaseType: 'AFTER_APPROVAL' \}/.test(sub),
  '① e corrige, com PATCH na própria versão');
must(/if \(APLICAR\)/.test(sub.slice(sub.indexOf("!== 'AFTER_APPROVAL'"))),
  '① ⛔ a correção é escrita e exige --apply, como todo verbo que escreve');

// ── ② a mensagem final diz o que É ──────────────────────────────────────────
must(!/console\.log\('   Liberação: automática após aprovação \(AFTER_APPROVAL\)\.'\)/.test(ASC),
  '② ⛔ sumiu a frase cravada que prometia liberação automática sempre');
must(/Liberação: \$\{ver\.attributes\.releaseType === 'AFTER_APPROVAL'/.test(sub),
  '② ⭐ agora a frase é lida do estado real da versão');
must(/vai FICAR PARADA esperando o botão/.test(ASC),
  '② e quando for manual, o script DIZ que vai ficar parada');

// ── ③ existe o verbo de liberar, e ele é estreito ───────────────────────────
const iLib = ASC.indexOf("if (cmd === 'liberar')");
assert.ok(iLib > 0, 'âncora: o verbo liberar');
const lib = semComentario(ASC.slice(iLib, iSub > iLib ? iSub : ASC.length));

must(/appStoreVersionReleaseRequests/.test(lib), '③ o verbo liberar existe e pede a liberação à Apple');
must(/if \(st !== 'PENDING_DEVELOPER_RELEASE'\)/.test(lib),
  '③ ⛔ só libera quem está ESPERANDO O BOTÃO — não vira "publica qualquer coisa"');
must(/if \(!APLICAR\) \{[\s\S]{0,120}dry-run/.test(lib),
  '③ ⛔ sem --apply é ensaio: a ação mais externa que existe aqui não sai por acidente');
must(lib.indexOf("if (st !== 'PENDING_DEVELOPER_RELEASE')") < lib.indexOf('appStoreVersionReleaseRequests'),
  '③ ORDEM: a recusa vem ANTES do pedido de publicação');

// ── ④ o uso no cabeçalho não mente ──────────────────────────────────────────
must(/node scripts\/asc\.js liberar/.test(ASC), '④ o verbo aparece no uso, no topo do arquivo');

console.log('\n✅ liberar versão da Apple não fica parada — ' + ok + ' verificações');
