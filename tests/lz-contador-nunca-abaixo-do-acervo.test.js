#!/usr/bin/env node
/* O CONTADOR NUNCA FICA ABAIXO DO ACERVO — node tests/lz-contador-nunca-abaixo-do-acervo.test.js
 *
 * Bronca do dono (12/ago/2026), depois de passar o @fabiogod DUAS vezes no motor atual:
 *   _"conclui, grava, mas continua roxo e incompleto"_
 *   _"isso volta a acontecer a cada novo ajuste nessa merda de sistema do letzplay porra"_
 *
 * O NÚMERO REAL, medido no doc `letzplayScans/BCjYSe1jRBelWFfHUr0OarO6ICj1`:
 *   games = 397 (todos com lzId, todos distintos) · indexTotal = 397 · gamesTotal = 396
 * Ou seja: o acervo estava COMPLETO e o CONTADOR dizia que não. A completude compara
 * `_lzGamesTotal` com `indexTotal` → 396 < 397 → reprova → violeta, com a barra em
 * "396 de 400 (99%)".
 *
 * POR QUE ELE PASSOU DUAS VEZES E NÃO MUDOU NADA — que é a parte que dói: `mergeImports`
 * unia `games` (união por id) e NUNCA recalculava `gamesTotal`, que vinha do
 * `Object.assign` do lado novo. Cada releitura trazia o mesmo 396 e a união continuava 397.
 * Não era leitura incompleta: era um beco sem saída.
 *
 * A LEI QUE ESTE TESTE TRAVA, e que é a resposta ao "volta a acontecer a cada ajuste":
 * contador guardado ao lado do dado DERIVA dele — quando discordam, o dado ganha. Nenhum
 * ajuste futuro no letzplay pode reintroduzir um total menor que o acervo.
 *
 * Roda o CÓDIGO REAL, extraído dos arquivos (store.js e o merge do report).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? '  [' + extra + ']' : '')); }
};

// ── o helper REAL do store.js ────────────────────────────────────────────────
const store = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
const iG = store.indexOf('window._lzGamesTotal = function (imp) {');
if (iG < 0) { console.error('não achei _lzGamesTotal no store.js'); process.exit(1); }
const srcGamesTotal = store.slice(iG, store.indexOf('\n};', iG) + 3);
const sb = { window: {}, Math: Math, Array: Array };
vm.createContext(sb);
vm.runInContext(srcGamesTotal, sb);
const total = (imp) => vm.runInContext('window._lzGamesTotal(IMP)', Object.assign(sb, { IMP: imp }));

console.log('\n1. O contador nunca fica abaixo do que o acervo tem (o caso @fabiogod)');
// forma idêntica à do doc real, em miniatura: array com 1 a mais que o contador gravado.
const fabio = { games: [{ lzId: 1 }, { lzId: 2 }, { lzId: 3 }], gamesTotal: 2, indexTotal: 3 };
ok(total(fabio) === 3, 'array 3 × contador 2 → vale 3 (o dado ganha do contador)', total(fabio));

console.log('\n2. E o doc TRUNCADO não regride — é pra isso que o contador existe');
const grande = { games: new Array(600).fill({ lzId: 9 }), gamesTotal: 2000 };
ok(total(grande) === 2000, 'acervo de 2000 com 600 no doc → continua 2000', total(grande));
ok(total({ games: [{ lzId: 1 }] }) === 1, 'sem contador → tamanho do array', total({ games: [{ lzId: 1 }] }));
ok(total(null) === 0, 'sem import → 0');

console.log('\n3. COMPLETUDE: com o acervo fechado, a leitura é completa');
const rep = fs.readFileSync(path.join(raiz, 'js/views/tournaments-enrollment-report.js'), 'utf8');
const iC = rep.indexOf('function _lzImportComplete(li) {');
const fimC = rep.indexOf('\n  }', rep.indexOf('return n >= li.declaredGames;', iC)) + 4;
vm.runInContext(
  'function _lzTot(imp){ return window._lzGamesTotal(imp); }\n' + rep.slice(iC, fimC), sb);
const completo = (imp) => vm.runInContext('_lzImportComplete(IMP)', Object.assign(sb, { IMP: imp }));

// o doc do Fabio, na forma real: cursor completo, índice 3, acervo 3, contador atrasado 2.
const fabioDoc = { games: [{ lzId: 1 }, { lzId: 2 }, { lzId: 3 }], gamesTotal: 2, indexTotal: 3,
                   declaredGames: 4, lzCursor: { complete: true, pagesTotal: 20, pageDone: 20 } };
ok(completo(fabioDoc) === true, 'acervo cobre o índice → COMPLETO (era isto que reprovava)');
// ⛔ e o que NÃO pode afrouxar: acervo menor que o índice segue reprovando.
ok(completo({ games: [{ lzId: 1 }], gamesTotal: 1, indexTotal: 3, declaredGames: 4,
              lzCursor: { complete: true } }) === false,
   'acervo devendo ao índice continua INCOMPLETO (o guard não foi afrouxado)');

console.log('\n4. O MERGE recalcula o contador — senão reler nunca conserta');
const iM = rep.indexOf('out.games = ordem.map(function (k) { return mapa[k]; });');
ok(iM > 0, 'achei a união dos jogos no merge');
const trecho = rep.slice(iM, iM + 2200);   // a janela cobre o comentário longo + a atribuição
ok(/out\.gamesTotal\s*=\s*Math\.max\(/.test(trecho),
   'logo depois da união, o contador é recalculado com Math.max');
ok(/out\.games\.length/.test(trecho), 'e o tamanho da união entra na conta');
ok(/delete out\.gamesTruncated/.test(trecho),
   'gamesTruncated vira DERIVADO (bandeira guardada também diverge do dado)');

console.log('\n5. Ninguém mais grava um total menor que o array (varredura)');
// qualquer atribuição futura de gamesTotal tem que passar pelo max ou vir da extensão
// (onde ele é literalmente g.length no momento da gravação).
const escritas = (rep.match(/\bgamesTotal\s*=/g) || []).length;
ok(escritas === 1, 'no app existe UMA escrita de gamesTotal (a do merge)', escritas);

console.log('\n' + (fail ? '✗' : '✅') + ' lz-contador-nunca-abaixo-do-acervo: ' + pass + ' passaram, ' + fail + ' falharam');
if (fail) process.exit(1);
