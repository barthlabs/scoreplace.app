'use strict';
/* L16 — `setLigaAvailability` não escrevia UMA linha de log, e por isso uma inscrita bloqueada
 * (11/set/2026) custou uma investigação inteira: sem rastro não se separa "não tocou", "não
 * chegou" e "a função recusou". Este gate trava o rastro — e trava também o que ele NÃO pode
 * virar: a recusa continua sendo um HttpsError, não um log silencioso.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const ini = src.indexOf('exports.setLigaAvailability');
assert.ok(ini > 0, 'âncora da função');
const fim = src.indexOf('\n);', ini);
const fn = src.slice(ini, fim);
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

must(/console\.log\("\[setLigaAvailability\] pedido uid=/.test(fn), 'loga o PEDIDO (uid + torneio + intenção)');
must(/console\.warn\("\[setLigaAvailability\] recusado uid=/.test(fn), 'loga a RECUSA com o motivo que o núcleo deu');
must(/console\.log\("\[setLigaAvailability\] ok uid=/.test(fn) && /destino=/.test(fn), 'loga o DESFECHO e o destino (elenco|espera)');
must(/throw new HttpsError\("failed-precondition"/.test(fn), '⛔ a recusa CONTINUA sendo erro para o cliente — log não substitui o HttpsError');
must(!/callerEmail|displayName|\.email/.test(fn), '⛔ nada de PII no log: só uid e tournamentId');
must(fn.indexOf('console.warn("[setLigaAvailability] recusado') < fn.indexOf('throw new HttpsError("failed-precondition"'),
  'o log da recusa vem ANTES do throw — senão nunca roda');

console.log('✅ L16: ' + ok + ' asserções — a disponibilidade de Liga deixa rastro');
