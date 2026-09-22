'use strict';
/* ⛔ O DOCUMENTO DO TORNEIO É PÚBLICO — E A INSCRIÇÃO GRAVAVA E-MAIL DENTRO DELE.
 * MEDIDO em 12/set/2026 por leitura ANÔNIMA (REST, sem cabeçalho de auth) do doc do Confra:
 * 138 KB e 4 e-mails distintos, dos quais 3 vinham de `participants[].email`. Esse é o pior
 * dos dois tipos de vazamento: não é o e-mail do organizador, é o de TERCEIROS.
 * A L4 registrava a ordem certa — ① provar que uid cobre os admins → ② tirar e-mail das
 * DECISÕES → ③ parar de gravar e remover. ① e ② já estavam cumpridos; esta é a primeira
 * fatia de ③: estancar a ENTRADA na inscrição própria, onde o uid SEMPRE existe.
 * ⛔ O que esta leva NÃO faz: não toca no inscrito SEM uid (digitado pelo organizador), onde
 * o e-mail ainda é a única âncora de deduplicação; e não remove o que já está gravado.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const E = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-enrollment.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const i = E.indexOf('const participantObj = {');
assert.ok(i > 0, 'âncora: o objeto do inscrito próprio');
const obj = E.slice(i, E.indexOf('\n', i));

must(!/email:/.test(obj), '⛔ o objeto gravado na inscrição própria NÃO carrega e-mail');
must(/uid: user\.uid/.test(obj), 'e continua carregando o uid — que é a identidade');
must(!/selfEnrolled:/.test(obj), 'a marca de inscrição própria não é declarada pelo cliente');
const F = fs.readFileSync(path.join(__dirname, '..', 'functions', 'enroll-core.js'), 'utf8');
must(/out\.selfEnrolled = uid === callerUid/.test(F), 'a Function deriva a marca de inscrição própria do uid autenticado');
must(!/_safeEmail/.test(E), '⛔ a variável que carregava o e-mail não sobrou em lugar nenhum');

/* ③ O FALLBACK SEM UID CONTINUA DE PÉ — tirá-lo quebraria a deduplicação do sorteio.
 * A chave de identidade do sorteio é `p.uid || p.email`: sem uid, o e-mail é a única âncora. */
const D = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-draw.js'), 'utf8');
must(/String\(p\.uid \|\| p\.email\)/.test(D),
  '③ a âncora de quem NÃO tem uid segue intacta — esta leva só mexe em quem tem');

console.log('\n✅ inscrição própria não grava e-mail no doc público — ' + ok + ' verificações');
