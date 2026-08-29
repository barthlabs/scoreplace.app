/* O CARD DE INSCRITO TEM UM DONO SÓ — QUALQUER OUTRO EMISSOR É PIRATA
 * node tests/card-de-inscrito-tem-um-dono-so.test.js
 *
 * ⛔ POR QUE ESTA TRAVA EXISTE, e é a pergunta que o dono fez depois de um dia inteiro:
 *   _"se a cada nova versão eu tiver que corrigir tudo o que já corrigimos na rodada
 *   anterior como vai ser?"_ e _"não mandei eliminar qualquer coisa que não seja a
 *   canônica exatamente para não ter que ficar fazendo tudo de novo?"_
 *
 * Ele está certo, e o histórico prova: o commit 23931d4b (v1.3.35) já tinha matado a
 * "versão pirata do detalhe" — e em 28/ago/2026 eu a RESSUSCITEI, com intenção boa (um
 * card de emergência pro caso do builder canônico faltar). Card de emergência é uma
 * segunda versão: nasce simples, alguém a melhora, e vira a divergência que aparece na
 * tela dele. No mesmo dia apareceram TRÊS medidas diferentes pra a grade desses cards.
 *
 * ⭐ A REGRA: quem emite um card de pessoa tem nome e endereço. Emissor novo reprova aqui
 * — e o autor precisa OU usar o canônico, OU justificar entrando nesta lista, que é um ato
 * consciente e revisável, não um acidente.
 *
 * ⚠️ Não é varredura de estilo: casa a CLASSE que o CSS e os filtros usam
 * (`class="participant-card"`), que é o que faz um bloco SER um card de inscrito.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

/* Os emissores APROVADOS, com o porquê de cada um. Três cards, três papéis distintos —
 * nenhum é substituível pelos outros:
 *   · _inscritoIndividualCard — o inscrito individual PRÉ-sorteio. A fonte única que o
 *     detalhe E o #participants usam (v1.3.35).
 *   · painel por pessoa PÓS-sorteio — mostra o JOGO da pessoa (nº, time, adversários).
 *     É outro conteúdo, não outra versão do mesmo card.
 *   · _duplaCard — a dupla formada. Fonte única das 3 telas (v1.3.37).
 */
const APROVADOS = [
  { arquivo: 'js/views/participants.js', marca: 'data-part-card="1" data-part-org=',
    quem: '_inscritoIndividualCard (individual pré-sorteio) — FONTE ÚNICA' },
  { arquivo: 'js/views/participants.js', marca: 'data-panel-card="1"',
    quem: 'painel por pessoa pós-sorteio (mostra o jogo) — outro CONTEÚDO' },
  { arquivo: 'js/views/tournaments.js', marca: 'data-dupla-card="1"',
    quem: '_duplaCard (dupla formada) — FONTE ÚNICA' }
];

function varrer(dir) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') out.push.apply(out, varrer(full)); return; }
    if (e.name.endsWith('.js')) out.push(full);
  });
  return out;
}

console.log('\n① Quem emite card de inscrito');
const achados = [];
varrer(path.join(ROOT, 'js')).forEach((abs) => {
  const rel = path.relative(ROOT, abs);
  fs.readFileSync(abs, 'utf8').split('\n').forEach((linha, n) => {
    if (linha.indexOf('class="participant-card') === -1) return;
    achados.push({ arquivo: rel, linha: n + 1, texto: linha.trim().slice(0, 150) });
  });
});
ok(achados.length > 0, 'a varredura acha os emissores (se der 0, o seletor mudou e a trava virou decoração)');
achados.forEach((a) => {
  const dono = APROVADOS.find((p) => p.arquivo === a.arquivo && a.texto.indexOf(p.marca) !== -1);
  ok(!!dono, (dono ? '   ' + a.arquivo + ':' + a.linha + ' → ' + dono.quem
                   : '⛔ EMISSOR NÃO APROVADO em ' + a.arquivo + ':' + a.linha + '\n      ' + a.texto +
                     '\n      → use o card canônico, ou entre na lista APROVADOS deste teste com o motivo'));
});

console.log('\n② E cada aprovado ainda existe (lista que envelhece é lista que mente)');
APROVADOS.forEach((p) => {
  const src = fs.readFileSync(path.join(ROOT, p.arquivo), 'utf8');
  ok(src.indexOf(p.marca) !== -1, '   ' + p.quem + ' segue no código');
});

console.log('\n③ A pirata que já foi apagada DUAS vezes não voltou');
const tj = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');
ok(!/background:rgba\(255,255,255,0\.04\);'\s*\+/.test(tj),
   '⛔ o card de emergência escrito à mão no detalhe não voltou (morto em 1.3.35 e de novo em 2.1.46)');

console.log(falhas === 0
  ? '\n✅ ' + achados.length + ' emissor(es), todos com dono e motivo\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
