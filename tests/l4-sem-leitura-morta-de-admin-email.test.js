'use strict';
/* L4.P8 — o documento público carrega e-mail, e `functions/index.js` ainda LIA `t.adminEmails`
 * para jogar fora: 7 declarações mortas, resíduo da 2.0.107 (quando os caminhos por e-mail
 * saíram das CFs e a autorização virou `_isTournamentOrgCaller`, uid puro). Mais 3 de
 * `coHostUids`, mortas pelo mesmo motivo e nas mesmas funções.
 *
 * ⛔ ESTE GATE NÃO AFIRMA NADA sobre `creatorEmail`/`organizerEmail`: os dois são lidos de
 * propósito no mesmo arquivo — fusão de conta (:313) e migração de uid (:7310) trocam o e-mail
 * antigo pelo novo, e há uma exibição. Eles saem na leva seguinte, que precisa decidir o que
 * essas duas migrações fazem quando o campo não existir mais. Um gate que os proibisse aqui
 * ficaria vermelho na própria árvore correta.
 */
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const arquivo = path.join(__dirname, '..', 'functions', 'index.js');
const src = fs.readFileSync(arquivo, 'utf8');
let ok = 0;
function must(v, m) { assert.ok(v, m); ok++; console.log('  ✓ ' + m); }

const mortas = src.match(/^\s*const adminEmails = Array\.isArray\(t\.adminEmails\)/gm) || [];
must(mortas.length === 0, 'nenhuma leitura morta de `t.adminEmails` (declarada e nunca usada) — havia 7');

const coHost = src.match(/^\s*const coHostUids = Array\.isArray\(t\.coHosts\)/gm) || [];
must(coHost.length === 0, 'nenhuma declaração morta de `coHostUids` — havia 3');

// ⛔ A EXCEÇÃO É NOMEADA: o campo derivado continua sendo GRAVADO, e isso não é o alvo desta leva.
must(/upd\.adminEmails = _coHostCore\.computeAdminEmails\(/.test(src),
  '⛔ o writer legítimo do campo derivado CONTINUA (a leva não apagou a escrita de `adminEmails`)');

// A porta de autorização segue sendo a de uid — se ela sumisse, o gate acima viraria decoração.
must((src.match(/_isTournamentOrgCaller\(/g) || []).length >= 7,
  'a autorização continua passando por `_isTournamentOrgCaller` (uid puro)');

// E os dois campos que NÃO são desta leva continuam onde estão, de propósito.
must(/update\.creatorEmail = keepEmail/.test(src),
  'fusão de conta ainda troca `creatorEmail` — leva 2 decide o que fazer quando o campo sair');
must(/update\.organizerEmail = newEmail \|\| t\.organizerEmail/.test(src),
  'migração de uid ainda troca `organizerEmail` — idem');

console.log('✅ L4.P8: ' + ok + ' asserções — leitura morta de e-mail fora, escrita derivada e migração de identidade intactas');
