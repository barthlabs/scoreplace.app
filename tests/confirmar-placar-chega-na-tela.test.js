#!/usr/bin/env node
/* O "CONFIRMAR" TEM QUE CHEGAR NA TELA — node tests/confirmar-placar-chega-na-tela.test.js
 *
 * INCIDENTE (Confra, 17/ago/2026, Rei/Rainha, grupo 24, "jogo 74"): o dono relatou
 * "ninguém consegue confirmar o jogo 74; nem eu como organizador". Medido no doc REAL,
 * eram DUAS falhas somadas — e cada uma sozinha já travava a quadra:
 *
 *   (1) QUEM PODIA CONFIRMAR NÃO EXISTIA NAQUELE JOGO. J1 propôs os três jogos da rodada
 *       e J3 aprovou dois em ~2 min. No terceiro, J1 e J3 são PARCEIROS — o lado
 *       adversário não estava com o app na mão. E o ORGANIZADOR não tinha botão de
 *       confirmar: a UI só lhe dava "✏️ Editar", embora `_approveResult` sempre tenha
 *       aceitado organizador/co-host. Ele só destravou relançando o placar à mão, 24
 *       minutos depois.
 *       ⚠️ No Rei/Rainha isso NÃO é azar: as duplas rodam dentro do grupo, então se só
 *       duas pessoas do grupo usam o app existe SEMPRE exatamente um dos três jogos em
 *       que elas caem no mesmo time. Todo grupo, toda rodada.
 *
 *   (2) A PROPOSTA NÃO ACORDAVA A TELA DE QUEM JÁ ESTAVA OLHANDO. O gate de re-render
 *       (`_tournamentDetailSig`) lia `m.score1`/`m.score2` — campo que NÃO EXISTE no
 *       modelo (é `scoreP1`/`scoreP2`) — e ignorava `pendingResult` por completo. Com o
 *       torneio aberto, a proposta chegava pela rede, a assinatura não mudava,
 *       `_softRefreshView` concluía "nada mudou" e o card NUNCA ganhava o ✅ Confirmar.
 *
 * O que este arquivo trava é o INVARIANTE, não os dois mecanismos:
 *   "quando um placar é proposto, alguém com poder de homologar tem o botão, E a tela de
 *    quem está com o torneio aberto percebe que a proposta chegou."
 * Forma nova de o Confirmar não chegar na tela entra NESTE arquivo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let passes = 0, falhas = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log('  ✓ ' + msg); }
  else { falhas++; console.log('  ✗ ' + msg); }
}
function sec(t) { console.log('\n' + t); }

// ─── 1 · O GATE DE RE-RENDER ENXERGA PLACAR E PROPOSTA ──────────────────────
// Roda a `_tournamentDetailSig` REAL extraída do store.js (casamento de chaves, não
// réplica): se alguém reescrever a função, é a de verdade que este teste mede.
sec('1. A assinatura do detalhe enxerga o que a tela mostra');

const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const ini = storeSrc.indexOf('window._tournamentDetailSig = function');
ok(ini !== -1, '_tournamentDetailSig existe no store.js');
const fim = storeSrc.indexOf('\n};', ini);
const fnSrc = storeSrc.slice(ini, fim + 3);

const sandbox = { window: {} };
sandbox.window._collectAllMatches = function (t) {
  const out = [];
  (t.matches || []).forEach(m => out.push(m));
  (t.rounds || []).forEach(r => (r.matches || []).forEach(m => out.push(m)));
  return out;
};
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);
const sig = sandbox.window._tournamentDetailSig;
ok(typeof sig === 'function', 'a função REAL foi extraída e roda');

function torneioBase() {
  return {
    id: 'tour_x', status: 'active', participants: [1, 2, 3, 4],
    rounds: [{ round: 1, matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D' }] }]
  };
}
const jogo = t => t.rounds[0].matches[0];

// (a) a PROPOSTA acorda a tela
let t1 = torneioBase();
const semProposta = sig(t1);
jogo(t1).pendingResult = { scoreP1: 2, scoreP2: 6, winner: 'C / D', proposedBy: 'uidJ1' };
const comProposta = sig(t1);
ok(comProposta !== semProposta,
   'proposta de placar CHEGANDO muda a assinatura (era isso que deixava o adversário sem o ✅ Confirmar)');

// (b) a CONTRA-PROPOSTA é uma fase diferente do consenso (muda os botões)
let t2 = torneioBase();
jogo(t2).pendingResult = { scoreP1: 2, scoreP2: 6, proposedBy: 'uidJ1' };
const antesContra = sig(t2);
jogo(t2).pendingResult = { scoreP1: 3, scoreP2: 6, proposedBy: 'uidJ2', isCounterProposal: true };
ok(sig(t2) !== antesContra, 'contra-proposta muda a assinatura');

// (c) DISPUTA tira os botões do corpo do card → tem que re-renderizar
let t3 = torneioBase();
jogo(t3).pendingResult = { scoreP1: 2, scoreP2: 6, proposedBy: 'uidJ1' };
const antesDisputa = sig(t3);
jogo(t3).pendingResult.disputed = true;
ok(sig(t3) !== antesDisputa, 'jogo marcado como EM DISPUTA muda a assinatura');

// (d) o PLACAR de verdade entra — o campo é scoreP1/scoreP2, não score1/score2
let t4 = torneioBase();
const semPlacar = sig(t4);
jogo(t4).scoreP1 = 6; jogo(t4).scoreP2 = 3;
ok(sig(t4) !== semPlacar,
   'placar em scoreP1/scoreP2 muda a assinatura (o gate lia score1/score2, que não existe)');

// (e) placar EDITADO sem trocar o vencedor ainda re-renderiza
let t5 = torneioBase();
jogo(t5).winner = 'A / B'; jogo(t5).scoreP1 = 6; jogo(t5).scoreP2 = 3;
const antesEdicao = sig(t5);
jogo(t5).scoreP2 = 4;
ok(sig(t5) !== antesEdicao, 'corrigir só o placar (mesmo vencedor) muda a assinatura');

// (f) ANTI-TRAVA: eco sem mudança de conteúdo NÃO pode re-renderizar.
// É o outro lado da moeda — foi por causa dele que updatedAt saiu do gate
// ([[project_detail_view_sig_no_updatedat]]); o fix não pode reintroduzir o pulo.
let t6 = torneioBase();
jogo(t6).scoreP1 = 6; jogo(t6).scoreP2 = 3;
jogo(t6).pendingResult = { scoreP1: 6, scoreP2: 3, proposedBy: 'uidJ1' };
const eco1 = sig(t6);
t6.updatedAt = Date.now() + 99999;      // só o carimbo do servidor mudou
const eco2 = sig(t6);
ok(eco1 === eco2, 'eco do snapshot SEM mudança de conteúdo NÃO muda a assinatura (não volta o pulo)');

// ─── 2 · QUEM PODE HOMOLOGAR TEM O BOTÃO ────────────────────────────────────
sec('2. O organizador tem o ✅ Confirmar quando há placar pendente');

const bracketSrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');

// O branch da autoridade no montador de botões do card pendente.
const mBranch = bracketSrc.match(/else if \(_isAuthorityInner && !_isProposerSelf\) \{[\s\S]{0,1600}?\n    \}/);
ok(!!mBranch, 'o branch do organizador/co-host existe no card de placar pendente');
const branch = mBranch ? mBranch[0] : '';
ok(/pendingActionBtns\s*=\s*_btnEdit\s*\+\s*_btnConfirm\s*;/.test(branch),
   'o organizador recebe ✏️ Editar + ✅ Confirmar (antes era só Editar — foi o que travou o jogo 74)');
ok(branch.indexOf('_btnConfirm') > branch.indexOf('_btnEdit'),
   'ordem canônica: confirmar à DIREITA [[feedback_button_order_confirm_right]]');

// O botão tem que chamar o caminho que já valida autoridade no servidor da regra.
ok(/_btnConfirm\s*=\s*`?<button[^`]*window\._approveResult\(/.test(bracketSrc),
   'o ✅ Confirmar chama window._approveResult');

// E `_approveResult` precisa continuar aceitando organizador/co-host — se alguém
// apertar essa permissão, o botão vira um clique que não faz nada.
const uiSrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
const mApr = uiSrc.match(/window\._approveResult = function[\s\S]{0,900}/);
ok(!!mApr && /_isUserOrgOrCoHost\(t,\s*cu\)\s*\|\|\s*_isOpposingProposer\(/.test(mApr[0]),
   '_approveResult aceita organizador/co-host OU o time adversário');

// ─── 3 · NÃO VIRAR ATALHO PRA QUEM NÃO PODE ─────────────────────────────────
sec('3. O atalho não vaza para quem não pode homologar');

// Quem PROPÔS não homologa a própria proposta — nem sendo organizador (o branch
// exige !_isProposerSelf). E jogo em disputa continua sem botão no corpo do card:
// o organizador resolve pelo painel do banner, caminho único.
ok(/else if \(_isProposerSelf && !_isAuthorityInner\) \{[\s\S]{0,300}?pendingActionBtns = _btnEdit;/.test(bracketSrc),
   'o proponente segue só com ✏️ Editar');
ok(/if \(_pr && _pr\.disputed\) \{\s*\n\s*pendingActionBtns = '';/.test(bracketSrc),
   'jogo EM DISPUTA continua sem botões no corpo do card');
// 1.9.109: somente-leitura continua vencendo qualquer papel — a ÚNICA exceção é o
// consenso pedido pelo chamador (`dashConsensus`, a dashboard), e mesmo aí os botões
// saem por `data-pending-action`, nunca por onclick pras funções da chave: fora dela o
// `_editPendingResult` mexe em ids (`score-p1-<id>`) que não existem, que foi o defeito
// que criou o readOnly na v1.8.67.
// ⚠️ ESTAS TRÊS OLHAM O FONTE — e já quebraram duas vezes por REFORMATAÇÃO, não por
// regressão. O comportamento fino (quem vê Confirmar/Contestar/Editar, em que estado)
// tem teste próprio, que RENDERIZA: tests/consenso-na-dashboard.test.js. Aqui ficam só
// os invariantes grosseiros, escritos para tolerar reescrita.
// sem os comentários: eles CITAM `_editPendingResult` justamente pra explicar por que ele
// não pode estar ali — e a citação fazia a asserção abaixo acusar o próprio comentário.
const _blocoRO = bracketSrc
  .slice(bracketSrc.indexOf('if (_readOnly) {'), bracketSrc.indexOf('if (_readOnly) {') + 2000)
  .split('\n').filter(function (l) { return l.trim().indexOf('//') !== 0; }).join('\n');
ok(/_dashConsensus/.test(_blocoRO),
   'somente-leitura vence qualquer papel — só o consenso pedido pelo chamador escapa');
ok(!/_editPendingResult/.test(_blocoRO),
   'o consenso fora da chave NÃO chama a edição in-place (ela mexe em ids que só existem na chave)');
ok(/data-pending-action/.test(_blocoRO) || /_dashPendBtn/.test(_blocoRO),
   'e ele despacha por data-pending-action — quem age é o listener da dashboard');

// ─── resultado ──────────────────────────────────────────────────────────────
console.log('\n' + (falhas === 0 ? '✅' : '❌') +
  ' confirmar-placar-chega-na-tela: ' + (passes + falhas) + ' asserções, ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
