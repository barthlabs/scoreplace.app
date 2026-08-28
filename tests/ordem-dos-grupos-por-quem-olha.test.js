/* A ORDEM DOS GRUPOS DEPENDE DE QUEM ESTÁ OLHANDO
 * node tests/ordem-dos-grupos-por-quem-olha.test.js
 *
 * Ordem do dono (28/ago/2026): _"a ordem dos jogos no detalhe do torneio para os
 * participantes deve aparecer como está e para os organizadores deveria aparecer primeiro
 * os pendentes na ordem do sorteio/formação dos grupos e depois os realizados"_.
 *
 * ⛔ E ANTES DISSO, A CORREÇÃO QUE ORIGINOU TUDO — dele mesmo, sobre a 2.1.8:
 *   _"a ordem alfabética que está aparecendo os jogos concluídos não deveria ser isso.
 *    está certo se é por ordem alfabética, mas eu errei nisso. a ordem certa seria a2
 *    depois do z, então não é alfabética, é ordem do sorteio/formação dos grupos."_
 * E ele fechou a regra em duas frases seguintes: _"B, C, A2 seria a ordem correta"_ e
 * _"de A a Z e depois A2 a Z2 e assim segue"_.
 *
 * ⭐ É a segunda frase que define, e ela NÃO é o índice do array: o sorteio batiza os
 * grupos A, B, C… Z e, acabadas as letras, recomeça em A2, B2… Então o nome carrega
 * DUAS informações — a letra e a VOLTA — e a ordem de formação é (volta, letra). Toda a
 * 1ª volta antes de qualquer grupo da 2ª. O alfabético lê "A2" como vizinho de "A" e
 * enfia a 2ª volta no meio da 1ª, que é o defeito que ele viu na tela.
 *
 * São DUAS PERGUNTAS diferentes, e por isso duas ordens:
 *   quem JOGA    → "quando é o meu jogo?"  → agenda (o seu grupo, depois o relógio)
 *   quem ORGANIZA→ "o que falta fechar?"   → pendentes primeiro, na ordem do sorteio
 */
'use strict';
const path = require('path');

let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (obtido: ' + JSON.stringify(a) + ')'); }

global.window = {};
require(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'));
ok(typeof window._schOrdenarGrupos === 'function', 'o ordenador canônico carregou');

// Grupos na ordem em que o SORTEIO os entregou: A, B, Z, A2, C, B2.
// ⚠️ A2 e B2 vêm DEPOIS do Z de propósito — é o caso que o alfabético erra.
const G = (nome, feito) => ({ name: nome, matches: [{ winner: feito ? 'Alguém' : null, scheduledAt: null }] });
const grupos = () => [G('A', true), G('B', false), G('Z', true), G('A2', false), G('C', false), G('B2', true)];
const nomes = (arr) => arr.map((g) => g.name);

console.log('\n① ORGANIZADOR: pendentes primeiro, na ordem do sorteio');
const org = window._schOrdenarGrupos(grupos(), { organizador: true });
eq(nomes(org), ['B', 'C', 'A2', 'A', 'Z', 'B2'],
   'pendentes (B, C, A2) antes dos realizados (A, Z, B2)');
/* ⛔ ESTA É A ASSERÇÃO QUE O DONO DITOU LETRA POR LETRA: _"B, C, A2 seria a ordem
 * correta"_ · _"de A a Z e depois A2 a Z2 e assim segue"_. Note que NÃO é o índice do
 * array: os grupos entram como A, B, Z, A2, C, B2 — por índice a resposta seria
 * B, A2, C. Quem manda é o CICLO DO NOME, não a posição de chegada. */
const nm = nomes(org);
ok(nm.indexOf('C') < nm.indexOf('A2'),
   '⛔ C (1ª volta) vem ANTES de A2 (2ª volta) — a volta manda, não a letra');
ok(nm.indexOf('B') < nm.indexOf('C'), 'e dentro da mesma volta vale a letra: B antes de C');
const primeiroFeito = org.findIndex((g) => g.matches[0].winner);
const ultimoPendente = org.map((g) => !!g.matches[0].winner).lastIndexOf(false);
ok(ultimoPendente < primeiroFeito, 'nenhum realizado aparece antes de um pendente');

console.log('\n② PARTICIPANTE: nada mudou — a agenda continua a mesma');
const part = window._schOrdenarGrupos(grupos(), {});
eq(nomes(part), ['A', 'B2', 'Z', 'A2', 'B', 'C'],
   'a ordem de quem joga segue a regra da agenda (2.1.8), intacta');
ok(JSON.stringify(nomes(part)) !== JSON.stringify(nomes(org)),
   'e ela é DIFERENTE da do organizador — são duas perguntas, duas respostas');

console.log('\n③ "Meu grupo primeiro" NÃO se aplica a quem organiza');
/* Se aplicasse, um grupo REALIZADO do organizador subiria acima dos pendentes — que é
 * exatamente o que ele pediu pra ver primeiro. Quem organiza olha o torneio, não o
 * próprio jogo. */
const meuFeito = (g) => g.name === 'Z';   // Z é realizado
const orgComMeu = window._schOrdenarGrupos(grupos(), { organizador: true, meu: meuFeito });
eq(nomes(orgComMeu), ['B', 'C', 'A2', 'A', 'Z', 'B2'],
   'o grupo do organizador NÃO fura a fila dos pendentes');
const partComMeu = window._schOrdenarGrupos(grupos(), { meu: meuFeito });
eq(nomes(partComMeu)[0], 'Z', 'mas pra quem JOGA o seu grupo continua vindo primeiro');

console.log('\n④ Lista vazia e entrada torta não derrubam a tela');
eq(window._schOrdenarGrupos([], { organizador: true }), [], 'lista vazia devolve vazia');
eq(window._schOrdenarGrupos(null, { organizador: true }), [], 'entrada não-array devolve vazia');
ok(window._schOrdenarGrupos([{ name: 'X' }], { organizador: true }).length === 1,
   'grupo sem `matches` passa sem estourar');

console.log('\n⑤ A volta continua depois de Z2 — "e assim segue"');
const G2 = (n, f) => ({ name: n, matches: [{ winner: f ? 'x' : null, scheduledAt: null }] });
const muitas = window._schOrdenarGrupos(
  [G2('Z2', false), G2('A3', false), G2('A', false), G2('Z', false), G2('A2', false), G2('B', false)],
  { organizador: true });
eq(muitas.map((g) => g.name), ['A', 'B', 'Z', 'A2', 'Z2', 'A3'],
   'A…Z, depois A2…Z2, depois A3 — a volta é o número, sem teto');

console.log('\n⑥ Nome fora do padrão não é forçado numa ordem inventada');
const livres = window._schOrdenarGrupos(
  [G2('Grupo 10', false), G2('Grupo 2', false)], { organizador: true });
eq(livres.map((g) => g.name), ['Grupo 2', 'Grupo 10'],
   'cai no comparador numérico — "Grupo 2" antes de "Grupo 10", como já era');

console.log(falhas === 0
  ? '\n✅ cada um vê a ordem que responde à SUA pergunta\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
