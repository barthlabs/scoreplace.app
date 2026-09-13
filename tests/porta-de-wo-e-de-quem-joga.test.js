'use strict';
/* ⛔ QUEM APONTA W.O. É QUEM JOGA — E A PORTA DIZIA "SÓ ORGANIZADOR".
 *
 * A tabela de `functions/partes-permissao.js` é o que vai autorizar a escrita de `woClaims`
 * no dia em que esse campo sair do documento do torneio (a subcoleção é
 * `allow write: if false`, então só o Admin SDK escreve, e a decisão passa a ser esta linha).
 *
 * MEDIDO em 13/set/2026:
 *   · no CLIENTE (`_woDeclare`, js/views/wo-claim.js) quem aponta é quem está no jogo
 *     (`_allCtxUids(t, rc).indexOf(cu.uid) !== -1`) OU o organizador;
 *   · na RULE do Firestore, `woClaims` está em `isParticipantBracketDiff` — um INSCRITO
 *     pode alterar;
 *   · na TABELA DA PORTA, era `ehOrganizador(t, u)` e nada mais.
 *
 * ⚠️ NINGUÉM TINHA PERCEBIDO porque nenhum cliente chama essa porta ainda — a regra errada
 * estava DORMINDO. Ela acordaria exatamente no dia da migração, e o sintoma seria "não
 * consigo mais apontar W.O.", num evento em andamento.
 *
 * ⭐ A trava é `byUid`: cada um aponta EM NOME PRÓPRIO — a mesma regra que fechou a caixa de
 * avisos na 2.3.0. [[project_wo_e_do_grupo_onde_aconteceu]]
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const P = require(path.join(raiz, 'functions/partes-permissao.js'));
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

console.log('\n──── a porta de W.O. é de quem joga ────\n');

const t = { creatorUid: 'org', memberUids: ['org', 'jog', 'outro'], adminUids: [], coHosts: [] };
const pode = (u, parte, valor) => P.autoriza(t, u, { parte, chave: 'wo_1', valor }).ok;

// ── ① o que o PRODUTO precisa ──────────────────────────────────────────────
must(pode('jog', 'woClaims', { byUid: 'jog' }),
  '① ⭐⭐ um JOGADOR aponta W.O. em nome próprio — era isto que a porta negava');
must(pode('org', 'woClaims', { byUid: 'org' }), '① o organizador também aponta');

// ── ② e a trava é a identidade, não o cargo ────────────────────────────────
must(!pode('jog', 'woClaims', { byUid: 'outro' }),
  '② ⛔ ninguém aponta ASSINANDO COMO OUTRO — nem estando no torneio');
must(!pode('fora', 'woClaims', { byUid: 'fora' }),
  '② ⛔ quem não é do torneio não aponta nada');
must(pode('jog', 'woClaims', null),
  '② apagar o próprio registro continua possível (valor nulo)');

// ── ③ o que NÃO mudou, e é medido ──────────────────────────────────────────
must(!pode('jog', 'woLog', {}),
  '③ `woLog` segue do organizador — é escrito pelo MOTOR quando o W.O. é aplicado');
must(!pode('jog', 'categoryNotifications', {}),
  '③ apontamento de categoria segue do organizador');
must(pode('org', 'woLog', {}) && pode('org', 'categoryNotifications', {}),
  '③ e o organizador continua podendo os dois');

// ── ④ a porta bate com o CLIENTE, que é o produto de verdade ───────────────
const WO = fs.readFileSync(path.join(raiz, 'js/views/wo-claim.js'), 'utf8');
must(/_allCtxUids\(t, rc\)\.indexOf\(cu\.uid\) === -1 && !_canManage\(t\)/.test(WO),
  '④ ⭐ o cliente deixa apontar quem está no jogo OU quem organiza — a porta agora diz o mesmo');
must(/byUid: cu\.uid/.test(WO),
  '④ e o registro nasce assinado pelo uid de quem aponta — é o que a porta confere');

// ── ⑤ CONTROLE: a regra antiga negaria o jogador ───────────────────────────
const soOrg = (tt, u) => P.ehOrganizador(tt, u);
must(soOrg(t, 'org') && !soOrg(t, 'jog'),
  '⑤ ⭐ CONTROLE: com a regra ANTIGA (`ehOrganizador` puro) o jogador seria NEGADO');

console.log('\n✅ ' + ok + ' verificações');
