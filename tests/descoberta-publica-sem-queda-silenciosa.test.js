'use strict';
/* ⛔⛔ A DESCOBERTA PÚBLICA NÃO TEM MAIS QUEDA SILENCIOSA (24/set/2026).
 *
 * Fui investigar o relato de agosto — "os ocultados sumindo" — e a causa real não era essa.
 * MEDIDO: dos 38 ocultados do dono, 36 aparecem e 2 apontam para torneios APAGADOS (id morto
 * que nunca renderiza). Em toda a base: 288 contas, 65 ids em preferências, 4 mortos em 3
 * contas. Nada está sumindo.
 *
 * O que EU achei no caminho, e era uma armadilha de verdade: `loadPublicOpenTournaments` ficava
 * como QUEDA do carregador da descoberta, e estava quebrada de duas formas silenciosas —
 * consulta sem índice (FAILED_PRECONDITION, medido no projeto) e `catch` devolvendo LISTA
 * VAZIA. Se a função boa faltasse, a descoberta ficaria em branco sem aviso nenhum.
 * ⚠️ Ela também me enganou: li a consulta dela e quase relatei que a descoberta estava quebrada
 * em produção. A função em uso é outra, e ela removeu o `orderBy` justamente para não depender
 * de índice nem excluir quem não tem `createdAt`.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── descoberta pública sem queda silenciosa ────');

ok(!/async loadPublicOpenTournaments\(/.test(db),
  '⛔ a função-armadilha não existe mais');
ok(/FOI APAGADA \(24\/set\/2026\), e ela era uma ARMADILHA/.test(db),
  'e a anotação conta por que ela saiu, no lugar onde ela morava');

/* O carregador em uso: recorte pelo próprio identificador, com casamento de chaves. */
const iFn = db.indexOf('async loadAllPublicTournaments(');
ok(iFn > 0, 'o carregador em uso existe');
let nivel = 0, fim = -1;
for (let k = db.indexOf('{', iFn); k < db.length; k++) {
  if (db[k] === '{') nivel++;
  else if (db[k] === '}') { nivel--; if (nivel === 0) { fim = k; break; } }
}
const corpo = db.slice(iFn, fim + 1);
ok(fim > iFn, 'e foi recortado por casamento de chaves, não por tamanho fixo');
ok(/where\('isPublic', '==', true\)/.test(corpo), 'ele filtra por público no servidor');
/* ⛔ Procura no código MASCARADO: os comentários da função CITAM `orderBy` para explicar por
 * que ele saiu, e casar o texto cru reprovava a própria anotação. Mesma lição de hoje de manhã.
 * ⭐ Mascaro o ARQUIVO INTEIRO e corto o MESMO intervalo: o mascarador preserva o comprimento,
 * então o offset continua valendo — é a garantia dele. Tentei embrulhar só o corpo da função
 * num `(function(){…})` e não compilou: método de objeto com `await` não é função solta. */
const dbMascarado = require('./pontos-frageis-validador.js').lerJs(db).mascarado;
const corpoMascarado = dbMascarado.slice(iFn, fim + 1);
ok(!/orderBy\s*\(/.test(corpoMascarado),
  "⛔ e NÃO ordena no servidor: `orderBy` exigiria índice e excluiria em silêncio quem não tem o campo de data");

/* A queda: o `||` saiu. */
const iLoad = store.indexOf('async loadPublicDiscovery(');
const trecho = store.slice(iLoad, store.indexOf('\n  },', iLoad));
ok(/var loader = window\.FirestoreDB\.loadAllPublicTournaments;/.test(trecho),
  '⛔ o carregador é UM só — a queda para a função quebrada saiu');
ok(!/\|\|\s*window\.FirestoreDB\.loadPublicOpenTournaments/.test(trecho),
  'e não há mais alternativa silenciosa');
ok(/SEM QUEDA \(24\/set\/2026\)/.test(trecho),
  'com a anotação dizendo por que sair sem nada é mais honesto que fingir mundo vazio');

/* O índice declarado NÃO serve a forma antiga — é o que fazia a queda falhar. Guardo isto para
 * que ninguém reintroduza a consulta achando que há índice. */
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'firestore.indexes.json'), 'utf8'));
const tourn = (idx.indexes || []).filter((i) => i.collectionGroup === 'tournaments');
const serveIsPublicMaisData = tourn.some((i) => {
  const f = (i.fields || []).map((x) => x.fieldPath);
  return f.length === 2 && f[0] === 'isPublic' && f[1] === 'createdAt';
});
ok(!serveIsPublicMaisData,
  '⛔ não existe índice `isPublic + createdAt` — quem reintroduzir aquele orderBy quebra de novo');

console.log(fail ? `❌ descoberta-publica-sem-queda-silenciosa: ${fail} falha(s), ${pass} ok`
                 : `✅ descoberta-publica-sem-queda-silenciosa: ${pass} ok`);
process.exit(fail ? 1 : 0);
