'use strict';
/* ⛔⛔ "NÃO CONSEGUI OLHAR" NÃO PODE VIRAR "NÃO TEM" — L16, o último silêncio do inventário.
 *
 * `admin.auth().getUser(uid)` falha por dois motivos muito diferentes: a conta não existe (e
 * aí a exceção É a resposta) ou a leitura não deu (rede, cota, prazo). Um `catch` que engole os
 * dois transforma uma falha em um fato — e o fato errado.
 *
 * ⛔ O QUE ISSO CUSTAVA, medido no código em 14/set/2026:
 *   · pedir o código de verificação → a pessoa ouvia "conta sem e-mail" sobre uma conta que TEM;
 *   · retomar uma exclusão → ouvia "esta conta já foi excluída" sobre uma conta VIVA;
 *   · excluir a conta → o aviso de exclusão não era enviado, e ninguém sabia;
 *   · troféu com regra quebrada → deixava de ser concedido A TODO MUNDO, sem uma linha de log.
 *
 * ⚠️ E já tinha mordido nesta mesma semana: um `.catch(()=>null)` numa leitura com prazo
 * estourado virou "ninguém autenticou esse telefone" e invalidou uma conclusão inteira.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const SRC = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
/* ⛔ SEM COMENTÁRIO: a primeira medição contou `catch (e) {}` escrito DENTRO de comentários que
 * descreviam o defeito antigo, e reportou 7 onde havia 5. Rótulo de varredura é hipótese. */
const CODIGO = SRC.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

console.log('\n──── erro de leitura não vira resposta ────\n');

// ── ① a porta única existe e separa os dois casos ──────────────────────────
must(/async function _contaOuNulo\(uid, onde\)/.test(CODIGO), '① existe uma porta só para ler conta');
const iP = CODIGO.indexOf('async function _contaOuNulo(');
const PORTA = CODIGO.slice(iP, CODIGO.indexOf('\n}', iP));
must(/auth\/user-not-found/.test(PORTA) && /return null/.test(PORTA),
  '① ⭐ "não existe" devolve nulo — a exceção É a resposta, e isso é legítimo');
must(/throw new HttpsError\("unavailable"/.test(PORTA),
  '① ⭐⭐ qualquer OUTRA falha é lançada — "não consegui olhar" nunca vira "não tem"');
must(/console\.error/.test(PORTA), '① e fica registrada, com o lugar de onde veio');

// ── ② os três caminhos que enganavam a pessoa usam a porta ─────────────────
[['sendVerificationCode', 'pedir o código de verificação'],
 ['deleteAccount', 'excluir a conta']].forEach(([fn, oque]) => {
  const i = CODIGO.indexOf('exports.' + fn + ' = onCall(');
  const bloco = CODIGO.slice(i, CODIGO.indexOf('\nexports.', i + 10));
  must(i > 0 && /_contaOuNulo\(uid/.test(bloco), '② ⭐ ' + oque + ' lê pela porta');
  must(!/getUser\(uid\); *[a-z_]* *= *\(/.test(bloco),
    '② ⛔ e não tem mais leitura solta de conta ali');
});

// ── ③ o troféu quebrado deixou de ser invisível ────────────────────────────
must(/function _trofeuQueFalhou\(id, e\)/.test(CODIGO), '③ existe um lugar que reclama do troféu');
const iT = CODIGO.indexOf('function _trofeuQueFalhou(');
const TROF = CODIGO.slice(iT, CODIGO.indexOf('\n}', iT));
must(/NÃO está sendo/.test(TROF) || /console\.error/.test(TROF),
  '③ ⭐⭐ e ela diz QUAL troféu parou de ser concedido');
must(/_trofeusJaReclamados\[id\]/.test(TROF),
  '③ ⛔ uma vez por execução — a varredura roda sobre a base inteira e o ruído esconderia o resto');
must((CODIGO.match(/_trofeuQueFalhou\(def\.id, e\)/g) || []).length === 2,
  '③ ⭐ os DOIS lugares que conferem troféu usam ela (a varredura e o agendado)');

// ── ④ e nenhum silêncio novo entrou ────────────────────────────────────────
const mudos = (CODIGO.match(/catch \([a-zA-Z_]*\) \{\s*\}/g) || []).length;
must(mudos === 0,
  '④ ⛔⛔ zero `catch` mudo no servidor (achei ' + mudos + ')');

console.log('\n✅ ' + ok + ' verificações');
