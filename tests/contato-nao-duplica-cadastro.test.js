'use strict';
/* ⛔ O ORGANIZADOR REGISTRAVA O CELULAR DE ALGUÉM NA CONTA ERRADA — E DUPLICAVA A PESSOA.
 *
 * MEDIDO em produção em 13/set/2026, com o conferidor: **4 telefones aparecem em DUAS contas
 * VIVAS**, e o padrão é o mesmo nos quatro — numa delas o número foi digitado pelo
 * organizador (a porta de contato), na outra ele é a identidade da pessoa.
 *
 * Consequência real: a pessoa fica com dois cadastros. Os resultados dela se dividem, e o
 * convite vai para a metade errada. É o defeito que mais custa a desfazer no produto, porque
 * unir contas mexe em seis lugares.
 *
 * ⛔ A porta nunca perguntou se o número já tinha dono. Agora pergunta e RECUSA: quando a
 * pessoa já tem conta, o certo não é carimbar o telefone dela num segundo cadastro — é
 * convidar pelo número, para ela entrar na conta que já tem.
 *
 * ⚠️ A recusa NÃO diz quem é o outro dono. O organizador não precisa do cadastro alheio para
 * entender que deve convidar em vez de digitar.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const SRC = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
const i = SRC.indexOf('exports.setParticipantContactPhone');
const bruto = SRC.slice(i, SRC.indexOf('\n);', i));
const codigo = bruto.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

console.log('\n──── registrar contato não duplica cadastro ────\n');

// ── ① a pergunta existe, e vem ANTES de gravar ─────────────────────────────
const iPergunta = codigo.indexOf('where("phone", "==", r.update.phone)');
const iGrava = codigo.indexOf('.set(r.update, { merge: true })');
must(iPergunta > 0, '① a porta procura quem já tem esse número');
must(iGrava > 0 && iPergunta < iGrava,
  '① ⭐⭐ e procura ANTES de gravar — depois já teria duplicado');

// ── ② quem NÃO conta como dono ─────────────────────────────────────────────
must(/if \(d\.id === targetUid\) return false;/.test(codigo),
  '② ⭐ o próprio alvo não é "outro dono" — corrigir o número da mesma pessoa continua possível');
must(/if \(o\.mergedInto\) return false;/.test(codigo),
  '② ⭐ conta já unida a outra não é dona de nada — lápide não bloqueia ninguém');

// ── ③ a recusa é clara e NÃO entrega o cadastro alheio ────────────────────
must(/already-exists/.test(codigo),
  '③ a recusa tem código próprio, não vira erro genérico');
const msg = (codigo.match(/"Esse celular já pertence[\s\S]*?"\);/) || [''])[0];
must(/Convide a pessoa pelo número/.test(msg),
  '③ ⭐ e diz o que FAZER: convidar pelo número, em vez de digitar');
must(!/o\.displayName|o\.email|d\.id/.test(msg),
  '③ ⛔ sem entregar nome, e-mail ou id do outro dono');

// ── ④ número curto não dispara a consulta ─────────────────────────────────
must(/_fone\.length >= 10/.test(codigo),
  '④ só consulta com número plausível — não gasta leitura com lixo');

// ── ⑤ CONTROLE: sem a checagem, a gravação seguiria ───────────────────────
const sem = codigo.replace(/const _fone[\s\S]*?\n    \}\n/, '');
must(sem.length < codigo.length && !/already-exists/.test(sem),
  '⑤ ⭐ removida a checagem, a porta volta a gravar sem perguntar — o portão tem dentes');

console.log('\n✅ ' + ok + ' verificações');
