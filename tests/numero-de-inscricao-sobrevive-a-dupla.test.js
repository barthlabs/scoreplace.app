/* O NÚMERO DE INSCRIÇÃO SOBREVIVE À DUPLA — E STRING NÃO COLIDE NA CHAVE
 * node tests/numero-de-inscricao-sobrevive-a-dupla.test.js
 *
 * RELATO DO DONO (28/ago/2026), com print: _"veja que está cagando também a ordem de
 * inscrição. o jogador 1 foi o inscrito 1 e o 2 foi o 2. ao formar a dupla isso se
 * inverteu. e ao desformar, cagou a numeração."_ E o cânone, na mesma mensagem: _"a única
 * hipótese de mudar o número de inscrição é quando um anterior se desinscreve. o seguinte
 * assume o número do desinscrito e todos os seguintes recebem o número do anterior."_
 * Depois, direto: _"quando forma dupla o número de inscrição de cada membro é mantido.
 * ao dissolver a dupla fica muito fácil de manter os números originais de cada um."_
 *
 * ⭐ MEDIDO NO BANCO (tour_1787954731771), não deduzido: 8 inscritos no documento, e
 * `participants[0]` e `[7]` eram as STRINGS "Jogador 02" e "Jogador 01" — sem enrollSeq —
 * enquanto os outros seis eram objetos com 1..6. `_buildEnrollOrderMap` manda quem é
 * string pro FIM da fila, e por isso o 01 aparecia como 8 e o 02 como 7.
 *
 * A CAUSA: `computeSplitPair` fazia `if (!uid) return name` — quem não tem conta voltava
 * como TEXTO SOLTO, e texto não guarda campo nenhum. O número já estava salvo em
 * p1Seq/p2Seq; só não tinha onde pousar na volta.
 *
 * ⛔ A SEGUNDA CARA, mais grave: na subcoleção `inscritos` havia SETE docs pra oito
 * inscritos. `chaveDoInscrito` devolvia a constante `'x'` pra QUALQUER string — os dois
 * strings escreveram na mesma chave e um comeu o outro. Daí o outro relato do mesmo
 * minuto: _"remover o jogador está quebrado. removi e ele voltou."_
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const pc = require(path.join(ROOT, 'functions', 'pair-core.js'));

// ── ① O caso do print: duas VAGAS (sem uid) formam dupla e desfazem ────────────────
console.log('\n① Vaga sem conta: forma a dupla e desfaz');
const doc = { participants: [
  { name: 'Jogador 01', displayName: 'Jogador 01', isPlaceholder: true, enrollSeq: 1 },
  { name: 'Jogador 02', displayName: 'Jogador 02', isPlaceholder: true, enrollSeq: 2 },
  { name: 'Jogador 03', displayName: 'Jogador 03', isPlaceholder: true, enrollSeq: 3 }
] };
const formado = pc.computeFormPair(doc, { uid1: '', name1: 'Jogador 01', uid2: '', name2: 'Jogador 02' });
ok(formado.outcome === 'formed', 'a dupla se forma');
const dupla = formado.participants.find((p) => p && p.p1Name === 'Jogador 01');
ok(!!dupla, 'a entrada de dupla existe');
ok(dupla && dupla.p1Seq === 1 && dupla.p2Seq === 2,
   '⛔ FORMAR mantém o nº de CADA membro (1 e 2), não realoca — got ' + JSON.stringify([dupla && dupla.p1Seq, dupla && dupla.p2Seq]));
ok(dupla && dupla.p1Placeholder === true && dupla.p2Placeholder === true,
   'e guarda que cada um era uma VAGA, pro desfazer devolver igual');

const desfeito = pc.computeSplitPair({ participants: formado.participants },
  { id1: 'Jogador 01', id2: 'Jogador 02' });
ok(desfeito.outcome === 'split', 'a dupla se desfaz');
const v1 = desfeito.participants.find((p) => p && typeof p === 'object' && (p.name || p.displayName) === 'Jogador 01');
const v2 = desfeito.participants.find((p) => p && typeof p === 'object' && (p.name || p.displayName) === 'Jogador 02');
ok(!!v1 && !!v2, '⛔ os dois voltam como OBJETO — antes viravam string solta');
ok(v1 && v1.enrollSeq === 1, '⛔ e o Jogador 01 volta com o SEU número (1) — got ' + (v1 && v1.enrollSeq));
ok(v2 && v2.enrollSeq === 2, '⛔ e o Jogador 02 com o dele (2) — got ' + (v2 && v2.enrollSeq));
ok(v1 && v1.isPlaceholder === true && v2 && v2.isPlaceholder === true, 'e voltam sendo VAGA, como entraram');
ok(!desfeito.participants.some((p) => typeof p === 'string'),
   '⛔ nenhuma string solta sobrou no roster (era ela que perdia o número E colidia na chave)');

// ── ② A ida e volta não mexe em quem não entrou na dupla ──────────────────────────
console.log('\n② E quem ficou de fora não é renumerado');
const terceiro = desfeito.participants.find((p) => p && (p.name || p.displayName) === 'Jogador 03');
ok(terceiro && terceiro.enrollSeq === 3, 'Jogador 03 continua 3 — got ' + (terceiro && terceiro.enrollSeq));

// ── ③ A chave da subcoleção: duas strings NÃO podem cair no mesmo doc ─────────────
console.log('\n③ Chave do inscrito: string tem conteúdo, e o conteúdo é o nome');
/* ⛔ carrega a cópia que a CF RODA (functions/vendor/), não o fonte: vendor velho faz o
 * teste passar sem exercitar o servidor. E confere que as duas são a MESMA. */
const fs = require('fs');
const S = require(path.join(ROOT, 'functions', 'vendor', 'tournament-split-core.js'));
ok(fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournament-split-core.js'), 'utf8')
   === fs.readFileSync(path.join(ROOT, 'functions', 'vendor', 'tournament-split-core.js'), 'utf8'),
   '⛔ functions/vendor/ está em dia com o fonte (esta cópia NÃO tem trava no npm test)');
const dividir = S && S.dividir;
ok(typeof dividir === 'function', 'o módulo de divisão carregou');
if (typeof dividir === 'function') {
  const t = { id: 't1', participants: ['Jogador 01', 'Jogador 02', { name: 'Jogador 03', enrollSeq: 3 }] };
  const partes = dividir(t, ['participants']);
  const regs = (partes && (partes.participants || partes.inscritos)) || [];
  const chaves = regs.map((r) => r._k);
  ok(chaves.length === 3, 'três inscritos → três registros — got ' + chaves.length);
  ok(new Set(chaves).size === chaves.length,
     '⛔ TRÊS CHAVES DISTINTAS — era aqui que dois strings viravam o mesmo doc `x` — got ' + JSON.stringify(chaves));
  ok(!chaves.includes('x'), 'e nenhuma delas é a constante `x`');
}

console.log(falhas === 0
  ? '\n✅ o número é da PESSOA: a dupla não o toma, e o desfazer o devolve\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
