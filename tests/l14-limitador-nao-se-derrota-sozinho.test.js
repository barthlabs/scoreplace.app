'use strict';
/* ⛔ O LIMITADOR DE LOGIN SE DERROTAVA SOZINHO.
 * `_throttleHit` guarda o contador num documento chaveado pelo IDENTIFICADOR e o atualiza em
 * TRANSAÇÃO. Um ataque de força bruta martela o MESMO documento → disputa → a transação aborta
 * → caía num `catch (e) { /* fail-open *\/ }` → a chamada era LIBERADA, em silêncio.
 * Quanto mais rápido o ataque, menos ele era limitado.
 * É a família do "não consegui olhar virou não achei" (L16), agora numa porta de LOGIN:
 * `phonePasswordLogin` (15/min) e `checkAccount` (20/min).
 * O conserto distingue: DISPUTA é evidência de volume e conta como batida; os demais erros
 * seguem liberando (um soluço do Firestore não pode trancar quem só quer entrar) — mas apare-
 * cem no log, que antes era mudo.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const F = fs.readFileSync(path.join(__dirname, '..', 'functions/index.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const i = F.indexOf('async function _throttleHit(');
assert.ok(i > 0, 'âncora: o limitador');
const bloco = F.slice(i, F.indexOf('\n}', i));

must(!/catch \(e\) \{ \/\* fail-open \*\/ \}/.test(bloco),
  '① ⛔ o catch que liberava tudo, calado, não existe mais');
must(/ABORTED[\s\S]{0,120}test\(_cod\)/.test(bloco),
  '① disputa é reconhecida pelo código do erro');
must(/if \(_disputa\) \{[\s\S]{0,200}blocked = true;/.test(bloco),
  '① ⛔ e conta como BATIDA — o ataque não desliga mais o próprio limite');
must(/console\.error\('\[throttle\] ' \+ coll \+ ': falhou e LIBEROU a chamada:'/.test(bloco),
  '① quando ainda libera, DIZ que liberou e por quê — antes era silêncio');
must(/console\.warn\('\[throttle\] ' \+ coll \+ ': disputa no contador/.test(bloco),
  '① e a disputa também aparece, com o nome da coleção');

/* ② os dois chamadores continuam sendo portas de identidade — se alguém acrescentar um
 *    terceiro, que seja com consciência de que o erro agora pode BLOQUEAR. */
const chamadas = (F.match(/_throttleHit\(db, "/g) || []).length;
must(chamadas === 2, '② são dois chamadores (login por telefone e checagem de conta) — achei ' + chamadas);
must(/_throttleHit\(db, "phoneLoginThrottle", identifier\.toLowerCase\(\), 15\)/.test(F),
  '② login por telefone: 15 por minuto');
must(/_throttleHit\(db, "checkAccountThrottle", identifier\.toLowerCase\(\), 20\)/.test(F),
  '② checagem de conta: 20 por minuto');

/* ③ a chave é o HASH do identificador, não o identificador — o contador não vira lista de
 *    telefones e e-mails tentados, legível por quem abrir a coleção. */
must(/createHash\("sha256"\)\.update\(String\(key\)\)/.test(bloco),
  '③ a chave do contador é hash — a coleção não vira lista de quem foi tentado');

console.log('\n✅ limitador não se derrota sozinho — ' + ok + ' verificações');
