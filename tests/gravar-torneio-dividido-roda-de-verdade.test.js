/* O RAMO QUE DIVIDE NA GRAVAÇÃO É EXECUTADO — NÃO SÓ LIDO
 * node tests/gravar-torneio-dividido-roda-de-verdade.test.js
 *
 * ⛔⛔ ESTE É O TESTE QUE FALTOU DUAS VEZES, e as duas custaram produção.
 *
 * 28/ago/2026, 12:06 — a 2.1.32 fez torneio novo nascer DIVIDIDO. Minutos depois, na mão
 * do dono: _"criei o torneio mas não consegui salvar 8 placeholders"_. Medido: o documento
 * NÃO chegou ao banco; 41 torneios antes, 41 depois. A criação inteira falhava.
 * A reversão (2.1.33) foi feita às cegas e escreveu: "a causa não está diagnosticada".
 *
 * ⭐ A CAUSA, achada à noite NO SENTRY (não relendo o código):
 *     ReferenceError: S is not defined   ·   6×   ·   15:20 UTC
 * 14 minutos depois do deploy. Em `firebase-db.saveTournament`:
 *     (S.PESADOS || ['participants', 'history']).forEach(...)
 * `var S = window._tSplit` é declarado ~1.100 linhas ABAIXO, dentro de OUTRA função. Esse
 * ramo só roda quando o doc tem `_semPesados` — então ficou invisível enquanto torneio
 * novo nascia inteiro, e derrubou TODA criação no dia em que ele passou a nascer dividido.
 * E o catch daquele bloco RELANÇA de propósito (gravar o objeto inteiro desfaria a divisão
 * em silêncio): a falha era total e muda.
 *
 * ⛔ POR QUE A SUÍTE NÃO PEGOU: os testes do assunto LIAM o fonte com regex — "a criação
 * põe o marcador?", "a CF atualiza a contagem?". Nenhum EXECUTAVA o bloco. Símbolo fora de
 * escopo não aparece em `grep`; aparece quando a linha roda.
 *
 * ⭐ O QUE ESTE TESTE FAZ: recorta o bloco REAL do firebase-db.js e o EXECUTA com um
 * torneio recém-criado. Qualquer identificador que não exista no escopo dele explode aqui,
 * como explodiu em produção. [[feedback_measure_dont_declare_fixed]] [[feedback_no_blind_fixes]]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const S = require(path.join(ROOT, 'functions', 'vendor', 'tournament-split-core.js'));
const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');

// ── recorta o bloco REAL (pelo construto, nunca por linha fixa) ───────────────────
const ini = db.indexOf("var _fora = Array.isArray(cleanData._semPesados)");
ok(ini > 0, 'achei o bloco que divide na gravação');
const fim = db.indexOf("await this.db.collection('tournaments')", ini);
ok(fim > ini, 'e o fim dele (a linha que grava)');
const bloco = db.slice(ini, fim);

/* O bloco roda com EXATAMENTE o que ele tem em escopo de verdade: `cleanData`, `docId` e
 * `window`. Se ele alcançar qualquer outro nome — como o `S` de outra função —, é
 * ReferenceError aqui, que é o ponto. `await` não aparece no trecho recortado. */
const rodar = new Function('cleanData', 'docId', 'window', bloco + '\n return cleanData;');

const novoTorneio = {
  id: 'tour_TESTE', name: 'T', creatorUid: 'u1', status: 'open',
  format: 'Eliminatórias Simples', teamSize: 2,
  participants: [], standbyParticipants: [],
  history: [{ date: '2026-08-28T00:00:00.000Z', message: 'Torneio Criado' }],
  _semPesados: ['matches', 'participants', 'opponentHistory'], _nJogos: 0
};
const win = { _tSplit: S, _error: function () {} };

console.log('\n① O bloco EXECUTA num torneio recém-criado (era aqui que morria)');
let saiu = null, erro = null;
try { saiu = rodar(JSON.parse(JSON.stringify(novoTorneio)), 'tour_TESTE', win); }
catch (e) { erro = e; }
ok(!erro, '⛔ não lança — era `ReferenceError: S is not defined` e a criação inteira morria'
   + (erro ? '  →  ' + erro.constructor.name + ': ' + erro.message : ''));
ok(saiu && saiu._semPesados && saiu._semPesados.length === 3, 'o marcador sobrevive à divisão');
ok(saiu && saiu.creatorUid === 'u1', '⭐ e `creatorUid` continua no doc — sem ele a REGRA nega a criação');
ok(saiu && saiu._nPartes && typeof saiu._nPartes === 'object', 'a contagem por parte é gravada');

console.log('\n② E com um torneio JÁ CHEIO (o caminho de todo dia)');
const cheio = Object.assign({}, novoTorneio, {
  participants: [{ name: 'Ana', enrollSeq: 1 }, { name: 'Bia', enrollSeq: 2 }],
  rounds: [{ name: 'R1', matches: [{ id: 'm1', p1: 'Ana', p2: 'Bia' }] }]
});
let erro2 = null, saiu2 = null;
try { saiu2 = rodar(JSON.parse(JSON.stringify(cheio)), 'tour_TESTE', win); }
catch (e) { erro2 = e; }
ok(!erro2, '⛔ também não lança com elenco e jogos'
   + (erro2 ? '  →  ' + erro2.constructor.name + ': ' + erro2.message : ''));
ok(saiu2 && saiu2._nPartes && saiu2._nPartes.participants === 2,
   'e conta os 2 inscritos que foram morar fora — got ' + (saiu2 && saiu2._nPartes && saiu2._nPartes.participants));

console.log('\n③ O símbolo de outro escopo não volta');
ok(!/\(S\.PESADOS/.test(db),
   '⛔ `(S.PESADOS` — o exato texto que derrubou produção — não existe mais no arquivo');

console.log(falhas === 0
  ? '\n✅ o ramo que divide na gravação é EXECUTADO, não só lido\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
