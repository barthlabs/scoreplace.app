'use strict';
/* A MATRIZ DOS TRÊS DESENHOS — 61 linhas da planilha do dono, TRAVADAS.
 * node tests/matriz-dos-tres-desenhos.test.js
 *
 * ⛔⛔ POR QUE ESTE ARQUIVO EXISTE: o bloco 7 da reforma põe BYE e SOBRA ÚNICA ao lado da repescagem,
 * e os três são ARITMÉTICA — quem erra uma conta dentro de um desenho certo não vê pela tela. Foi
 * exatamente o que aconteceu: o desenho do bye tinha jogos e entrantes CERTOS nas 61 linhas e a
 * contagem de folgas ERRADA, chegando a devolver −2 folgas com 7 inscritos.
 *
 * ⛔ A MATRIZ ABAIXO É DADO DO DONO, copiada da aba "Os 3 desenhos" da planilha
 * `scoreplace-bye-x-repescagem-os-tres-desenhos.xlsx`. Ela NÃO foi gerada pelo código — se fosse, o
 * teste compararia o código consigo mesmo e não provaria nada. Quem mudar um número aqui está
 * mudando a especificação, não consertando um teste.
 *
 * ⚠️ DUAS CONVENÇÕES DA PLANILHA, medidas e conferidas, que explicam toda diferença de 1:
 *  ① a planilha SOMA a disputa de 3º lugar à rodada da final (a final vale 2 jogos). O motor não a
 *     modela em `plano`, então o total do motor é sempre o da planilha MENOS 1;
 *  ② a coluna `Voltam` da planilha conta TODA equipe que ganha segunda chance; o motor chama `repR2`
 *     só quem é convocada para fechar a potência de 2. A relação é exata nas 61 linhas:
 *         Voltam = repR2 + repescagens
 *     (a sobra da 1ª rodada joga contra uma perdedora, que também voltou).
 *     ⭐ Havia anotação minha dizendo que a planilha estava "um acima em todo N ímpar, e o motor é que
 *     está certo". ERRADO: são o mesmo número sob duas definições. Medido nas 61 linhas.
 *
 * ⚠️ E UMA DIVERGÊNCIA DENTRO DA PRÓPRIA PLANILHA, que este teste resolve pela TABELA e não pela
 * prosa: a aba "A mecânica" diz que o desenho misto de 36 equipes (folga nas rodadas de 9 e de 5,
 * repescagem na de 3) dá "35 jogos". A tabela da mesma planilha dá 36 para o desenho todo-folga, e
 * trocar UMA rodada de folga por repescagem acrescenta exatamente 1 jogo ⇒ 37. A tabela é coerente; a
 * prosa está 2 abaixo dela. O teste trava a TABELA.
 */
const path = require('path');
const C = require(path.join(__dirname, '..', 'js', 'views', 'chaves.js'));
const B = require(path.join(__dirname, '..', 'js', 'views', 'bracket-policy.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  \u2717 ' + m); } };

/* N, byesBye, jogosBye, jogosPorRodadaBye, entramBye,
 * voltamRep, jogosRep, jogosPorRodadaRep, entramRep,
 * sobras, jogosComFolga, jogosComRep, jogosPorRodadaFolga, entramSobra */
const MATRIZ = [
  [4, 0, 4, '2 · 2', '4 · 2', 0, 4, '2 · 2', '4 · 2', 0, 4, 4, '2 · 2', '4 · 2'],
  [5, 3, 5, '1 · 2 · 2', '2 · 4 · 2', 2, 7, '3 · 2 · 2', '5 · 4 · 2', 2, 5, 7, '2 · 1 · 2', '5 · 3 · 2'],
  [6, 2, 6, '2 · 2 · 2', '4 · 4 · 2', 1, 7, '3 · 2 · 2', '6 · 4 · 2', 1, 6, 7, '3 · 1 · 2', '6 · 3 · 2'],
  [7, 1, 7, '3 · 2 · 2', '6 · 4 · 2', 1, 8, '4 · 2 · 2', '7 · 4 · 2', 1, 7, 8, '3 · 2 · 2', '7 · 4 · 2'],
  [8, 0, 8, '4 · 2 · 2', '8 · 4 · 2', 0, 8, '4 · 2 · 2', '8 · 4 · 2', 0, 8, 8, '4 · 2 · 2', '8 · 4 · 2'],
  [9, 7, 9, '1 · 4 · 2 · 2', '2 · 8 · 4 · 2', 4, 13, '5 · 4 · 2 · 2', '9 · 8 · 4 · 2', 3, 9, 12, '4 · 2 · 1 · 2', '9 · 5 · 3 · 2'],
  [10, 6, 10, '2 · 4 · 2 · 2', '4 · 8 · 4 · 2', 3, 13, '5 · 4 · 2 · 2', '10 · 8 · 4 · 2', 2, 10, 12, '5 · 2 · 1 · 2', '10 · 5 · 3 · 2'],
  [11, 5, 11, '3 · 4 · 2 · 2', '6 · 8 · 4 · 2', 3, 14, '6 · 4 · 2 · 2', '11 · 8 · 4 · 2', 2, 11, 13, '5 · 3 · 1 · 2', '11 · 6 · 3 · 2'],
  [12, 4, 12, '4 · 4 · 2 · 2', '8 · 8 · 4 · 2', 2, 14, '6 · 4 · 2 · 2', '12 · 8 · 4 · 2', 1, 12, 13, '6 · 3 · 1 · 2', '12 · 6 · 3 · 2'],
  [13, 3, 13, '5 · 4 · 2 · 2', '10 · 8 · 4 · 2', 2, 15, '7 · 4 · 2 · 2', '13 · 8 · 4 · 2', 2, 13, 15, '6 · 3 · 2 · 2', '13 · 7 · 4 · 2'],
  [14, 2, 14, '6 · 4 · 2 · 2', '12 · 8 · 4 · 2', 1, 15, '7 · 4 · 2 · 2', '14 · 8 · 4 · 2', 1, 14, 15, '7 · 3 · 2 · 2', '14 · 7 · 4 · 2'],
  [15, 1, 15, '7 · 4 · 2 · 2', '14 · 8 · 4 · 2', 1, 16, '8 · 4 · 2 · 2', '15 · 8 · 4 · 2', 1, 15, 16, '7 · 4 · 2 · 2', '15 · 8 · 4 · 2'],
  [16, 0, 16, '8 · 4 · 2 · 2', '16 · 8 · 4 · 2', 0, 16, '8 · 4 · 2 · 2', '16 · 8 · 4 · 2', 0, 16, 16, '8 · 4 · 2 · 2', '16 · 8 · 4 · 2'],
  [17, 15, 17, '1 · 8 · 4 · 2 · 2', '2 · 16 · 8 · 4 · 2', 8, 25, '9 · 8 · 4 · 2 · 2', '17 · 16 · 8 · 4 · 2', 4, 17, 21, '8 · 4 · 2 · 1 · 2', '17 · 9 · 5 · 3 · 2'],
  [18, 14, 18, '2 · 8 · 4 · 2 · 2', '4 · 16 · 8 · 4 · 2', 7, 25, '9 · 8 · 4 · 2 · 2', '18 · 16 · 8 · 4 · 2', 3, 18, 21, '9 · 4 · 2 · 1 · 2', '18 · 9 · 5 · 3 · 2'],
  [19, 13, 19, '3 · 8 · 4 · 2 · 2', '6 · 16 · 8 · 4 · 2', 7, 26, '10 · 8 · 4 · 2 · 2', '19 · 16 · 8 · 4 · 2', 3, 19, 22, '9 · 5 · 2 · 1 · 2', '19 · 10 · 5 · 3 · 2'],
  [20, 12, 20, '4 · 8 · 4 · 2 · 2', '8 · 16 · 8 · 4 · 2', 6, 26, '10 · 8 · 4 · 2 · 2', '20 · 16 · 8 · 4 · 2', 2, 20, 22, '10 · 5 · 2 · 1 · 2', '20 · 10 · 5 · 3 · 2'],
  [21, 11, 21, '5 · 8 · 4 · 2 · 2', '10 · 16 · 8 · 4 · 2', 6, 27, '11 · 8 · 4 · 2 · 2', '21 · 16 · 8 · 4 · 2', 3, 21, 24, '10 · 5 · 3 · 1 · 2', '21 · 11 · 6 · 3 · 2'],
  [22, 10, 22, '6 · 8 · 4 · 2 · 2', '12 · 16 · 8 · 4 · 2', 5, 27, '11 · 8 · 4 · 2 · 2', '22 · 16 · 8 · 4 · 2', 2, 22, 24, '11 · 5 · 3 · 1 · 2', '22 · 11 · 6 · 3 · 2'],
  [23, 9, 23, '7 · 8 · 4 · 2 · 2', '14 · 16 · 8 · 4 · 2', 5, 28, '12 · 8 · 4 · 2 · 2', '23 · 16 · 8 · 4 · 2', 2, 23, 25, '11 · 6 · 3 · 1 · 2', '23 · 12 · 6 · 3 · 2'],
  [24, 8, 24, '8 · 8 · 4 · 2 · 2', '16 · 16 · 8 · 4 · 2', 4, 28, '12 · 8 · 4 · 2 · 2', '24 · 16 · 8 · 4 · 2', 1, 24, 25, '12 · 6 · 3 · 1 · 2', '24 · 12 · 6 · 3 · 2'],
  [25, 7, 25, '9 · 8 · 4 · 2 · 2', '18 · 16 · 8 · 4 · 2', 4, 29, '13 · 8 · 4 · 2 · 2', '25 · 16 · 8 · 4 · 2', 3, 25, 28, '12 · 6 · 3 · 2 · 2', '25 · 13 · 7 · 4 · 2'],
  [26, 6, 26, '10 · 8 · 4 · 2 · 2', '20 · 16 · 8 · 4 · 2', 3, 29, '13 · 8 · 4 · 2 · 2', '26 · 16 · 8 · 4 · 2', 2, 26, 28, '13 · 6 · 3 · 2 · 2', '26 · 13 · 7 · 4 · 2'],
  [27, 5, 27, '11 · 8 · 4 · 2 · 2', '22 · 16 · 8 · 4 · 2', 3, 30, '14 · 8 · 4 · 2 · 2', '27 · 16 · 8 · 4 · 2', 2, 27, 29, '13 · 7 · 3 · 2 · 2', '27 · 14 · 7 · 4 · 2'],
  [28, 4, 28, '12 · 8 · 4 · 2 · 2', '24 · 16 · 8 · 4 · 2', 2, 30, '14 · 8 · 4 · 2 · 2', '28 · 16 · 8 · 4 · 2', 1, 28, 29, '14 · 7 · 3 · 2 · 2', '28 · 14 · 7 · 4 · 2'],
  [29, 3, 29, '13 · 8 · 4 · 2 · 2', '26 · 16 · 8 · 4 · 2', 2, 31, '15 · 8 · 4 · 2 · 2', '29 · 16 · 8 · 4 · 2', 2, 29, 31, '14 · 7 · 4 · 2 · 2', '29 · 15 · 8 · 4 · 2'],
  [30, 2, 30, '14 · 8 · 4 · 2 · 2', '28 · 16 · 8 · 4 · 2', 1, 31, '15 · 8 · 4 · 2 · 2', '30 · 16 · 8 · 4 · 2', 1, 30, 31, '15 · 7 · 4 · 2 · 2', '30 · 15 · 8 · 4 · 2'],
  [31, 1, 31, '15 · 8 · 4 · 2 · 2', '30 · 16 · 8 · 4 · 2', 1, 32, '16 · 8 · 4 · 2 · 2', '31 · 16 · 8 · 4 · 2', 1, 31, 32, '15 · 8 · 4 · 2 · 2', '31 · 16 · 8 · 4 · 2'],
  [32, 0, 32, '16 · 8 · 4 · 2 · 2', '32 · 16 · 8 · 4 · 2', 0, 32, '16 · 8 · 4 · 2 · 2', '32 · 16 · 8 · 4 · 2', 0, 32, 32, '16 · 8 · 4 · 2 · 2', '32 · 16 · 8 · 4 · 2'],
  [33, 31, 33, '1 · 16 · 8 · 4 · 2 · 2', '2 · 32 · 16 · 8 · 4 · 2', 16, 49, '17 · 16 · 8 · 4 · 2 · 2', '33 · 32 · 16 · 8 · 4 · 2', 5, 33, 38, '16 · 8 · 4 · 2 · 1 · 2', '33 · 17 · 9 · 5 · 3 · 2'],
  [34, 30, 34, '2 · 16 · 8 · 4 · 2 · 2', '4 · 32 · 16 · 8 · 4 · 2', 15, 49, '17 · 16 · 8 · 4 · 2 · 2', '34 · 32 · 16 · 8 · 4 · 2', 4, 34, 38, '17 · 8 · 4 · 2 · 1 · 2', '34 · 17 · 9 · 5 · 3 · 2'],
  [35, 29, 35, '3 · 16 · 8 · 4 · 2 · 2', '6 · 32 · 16 · 8 · 4 · 2', 15, 50, '18 · 16 · 8 · 4 · 2 · 2', '35 · 32 · 16 · 8 · 4 · 2', 4, 35, 39, '17 · 9 · 4 · 2 · 1 · 2', '35 · 18 · 9 · 5 · 3 · 2'],
  [36, 28, 36, '4 · 16 · 8 · 4 · 2 · 2', '8 · 32 · 16 · 8 · 4 · 2', 14, 50, '18 · 16 · 8 · 4 · 2 · 2', '36 · 32 · 16 · 8 · 4 · 2', 3, 36, 39, '18 · 9 · 4 · 2 · 1 · 2', '36 · 18 · 9 · 5 · 3 · 2'],
  [37, 27, 37, '5 · 16 · 8 · 4 · 2 · 2', '10 · 32 · 16 · 8 · 4 · 2', 14, 51, '19 · 16 · 8 · 4 · 2 · 2', '37 · 32 · 16 · 8 · 4 · 2', 4, 37, 41, '18 · 9 · 5 · 2 · 1 · 2', '37 · 19 · 10 · 5 · 3 · 2'],
  [38, 26, 38, '6 · 16 · 8 · 4 · 2 · 2', '12 · 32 · 16 · 8 · 4 · 2', 13, 51, '19 · 16 · 8 · 4 · 2 · 2', '38 · 32 · 16 · 8 · 4 · 2', 3, 38, 41, '19 · 9 · 5 · 2 · 1 · 2', '38 · 19 · 10 · 5 · 3 · 2'],
  [39, 25, 39, '7 · 16 · 8 · 4 · 2 · 2', '14 · 32 · 16 · 8 · 4 · 2', 13, 52, '20 · 16 · 8 · 4 · 2 · 2', '39 · 32 · 16 · 8 · 4 · 2', 3, 39, 42, '19 · 10 · 5 · 2 · 1 · 2', '39 · 20 · 10 · 5 · 3 · 2'],
  [40, 24, 40, '8 · 16 · 8 · 4 · 2 · 2', '16 · 32 · 16 · 8 · 4 · 2', 12, 52, '20 · 16 · 8 · 4 · 2 · 2', '40 · 32 · 16 · 8 · 4 · 2', 2, 40, 42, '20 · 10 · 5 · 2 · 1 · 2', '40 · 20 · 10 · 5 · 3 · 2'],
  [41, 23, 41, '9 · 16 · 8 · 4 · 2 · 2', '18 · 32 · 16 · 8 · 4 · 2', 12, 53, '21 · 16 · 8 · 4 · 2 · 2', '41 · 32 · 16 · 8 · 4 · 2', 4, 41, 45, '20 · 10 · 5 · 3 · 1 · 2', '41 · 21 · 11 · 6 · 3 · 2'],
  [42, 22, 42, '10 · 16 · 8 · 4 · 2 · 2', '20 · 32 · 16 · 8 · 4 · 2', 11, 53, '21 · 16 · 8 · 4 · 2 · 2', '42 · 32 · 16 · 8 · 4 · 2', 3, 42, 45, '21 · 10 · 5 · 3 · 1 · 2', '42 · 21 · 11 · 6 · 3 · 2'],
  [43, 21, 43, '11 · 16 · 8 · 4 · 2 · 2', '22 · 32 · 16 · 8 · 4 · 2', 11, 54, '22 · 16 · 8 · 4 · 2 · 2', '43 · 32 · 16 · 8 · 4 · 2', 3, 43, 46, '21 · 11 · 5 · 3 · 1 · 2', '43 · 22 · 11 · 6 · 3 · 2'],
  [44, 20, 44, '12 · 16 · 8 · 4 · 2 · 2', '24 · 32 · 16 · 8 · 4 · 2', 10, 54, '22 · 16 · 8 · 4 · 2 · 2', '44 · 32 · 16 · 8 · 4 · 2', 2, 44, 46, '22 · 11 · 5 · 3 · 1 · 2', '44 · 22 · 11 · 6 · 3 · 2'],
  [45, 19, 45, '13 · 16 · 8 · 4 · 2 · 2', '26 · 32 · 16 · 8 · 4 · 2', 10, 55, '23 · 16 · 8 · 4 · 2 · 2', '45 · 32 · 16 · 8 · 4 · 2', 3, 45, 48, '22 · 11 · 6 · 3 · 1 · 2', '45 · 23 · 12 · 6 · 3 · 2'],
  [46, 18, 46, '14 · 16 · 8 · 4 · 2 · 2', '28 · 32 · 16 · 8 · 4 · 2', 9, 55, '23 · 16 · 8 · 4 · 2 · 2', '46 · 32 · 16 · 8 · 4 · 2', 2, 46, 48, '23 · 11 · 6 · 3 · 1 · 2', '46 · 23 · 12 · 6 · 3 · 2'],
  [47, 17, 47, '15 · 16 · 8 · 4 · 2 · 2', '30 · 32 · 16 · 8 · 4 · 2', 9, 56, '24 · 16 · 8 · 4 · 2 · 2', '47 · 32 · 16 · 8 · 4 · 2', 2, 47, 49, '23 · 12 · 6 · 3 · 1 · 2', '47 · 24 · 12 · 6 · 3 · 2'],
  [48, 16, 48, '16 · 16 · 8 · 4 · 2 · 2', '32 · 32 · 16 · 8 · 4 · 2', 8, 56, '24 · 16 · 8 · 4 · 2 · 2', '48 · 32 · 16 · 8 · 4 · 2', 1, 48, 49, '24 · 12 · 6 · 3 · 1 · 2', '48 · 24 · 12 · 6 · 3 · 2'],
  [49, 15, 49, '17 · 16 · 8 · 4 · 2 · 2', '34 · 32 · 16 · 8 · 4 · 2', 8, 57, '25 · 16 · 8 · 4 · 2 · 2', '49 · 32 · 16 · 8 · 4 · 2', 4, 49, 53, '24 · 12 · 6 · 3 · 2 · 2', '49 · 25 · 13 · 7 · 4 · 2'],
  [50, 14, 50, '18 · 16 · 8 · 4 · 2 · 2', '36 · 32 · 16 · 8 · 4 · 2', 7, 57, '25 · 16 · 8 · 4 · 2 · 2', '50 · 32 · 16 · 8 · 4 · 2', 3, 50, 53, '25 · 12 · 6 · 3 · 2 · 2', '50 · 25 · 13 · 7 · 4 · 2'],
  [51, 13, 51, '19 · 16 · 8 · 4 · 2 · 2', '38 · 32 · 16 · 8 · 4 · 2', 7, 58, '26 · 16 · 8 · 4 · 2 · 2', '51 · 32 · 16 · 8 · 4 · 2', 3, 51, 54, '25 · 13 · 6 · 3 · 2 · 2', '51 · 26 · 13 · 7 · 4 · 2'],
  [52, 12, 52, '20 · 16 · 8 · 4 · 2 · 2', '40 · 32 · 16 · 8 · 4 · 2', 6, 58, '26 · 16 · 8 · 4 · 2 · 2', '52 · 32 · 16 · 8 · 4 · 2', 2, 52, 54, '26 · 13 · 6 · 3 · 2 · 2', '52 · 26 · 13 · 7 · 4 · 2'],
  [53, 11, 53, '21 · 16 · 8 · 4 · 2 · 2', '42 · 32 · 16 · 8 · 4 · 2', 6, 59, '27 · 16 · 8 · 4 · 2 · 2', '53 · 32 · 16 · 8 · 4 · 2', 3, 53, 56, '26 · 13 · 7 · 3 · 2 · 2', '53 · 27 · 14 · 7 · 4 · 2'],
  [54, 10, 54, '22 · 16 · 8 · 4 · 2 · 2', '44 · 32 · 16 · 8 · 4 · 2', 5, 59, '27 · 16 · 8 · 4 · 2 · 2', '54 · 32 · 16 · 8 · 4 · 2', 2, 54, 56, '27 · 13 · 7 · 3 · 2 · 2', '54 · 27 · 14 · 7 · 4 · 2'],
  [55, 9, 55, '23 · 16 · 8 · 4 · 2 · 2', '46 · 32 · 16 · 8 · 4 · 2', 5, 60, '28 · 16 · 8 · 4 · 2 · 2', '55 · 32 · 16 · 8 · 4 · 2', 2, 55, 57, '27 · 14 · 7 · 3 · 2 · 2', '55 · 28 · 14 · 7 · 4 · 2'],
  [56, 8, 56, '24 · 16 · 8 · 4 · 2 · 2', '48 · 32 · 16 · 8 · 4 · 2', 4, 60, '28 · 16 · 8 · 4 · 2 · 2', '56 · 32 · 16 · 8 · 4 · 2', 1, 56, 57, '28 · 14 · 7 · 3 · 2 · 2', '56 · 28 · 14 · 7 · 4 · 2'],
  [57, 7, 57, '25 · 16 · 8 · 4 · 2 · 2', '50 · 32 · 16 · 8 · 4 · 2', 4, 61, '29 · 16 · 8 · 4 · 2 · 2', '57 · 32 · 16 · 8 · 4 · 2', 3, 57, 60, '28 · 14 · 7 · 4 · 2 · 2', '57 · 29 · 15 · 8 · 4 · 2'],
  [58, 6, 58, '26 · 16 · 8 · 4 · 2 · 2', '52 · 32 · 16 · 8 · 4 · 2', 3, 61, '29 · 16 · 8 · 4 · 2 · 2', '58 · 32 · 16 · 8 · 4 · 2', 2, 58, 60, '29 · 14 · 7 · 4 · 2 · 2', '58 · 29 · 15 · 8 · 4 · 2'],
  [59, 5, 59, '27 · 16 · 8 · 4 · 2 · 2', '54 · 32 · 16 · 8 · 4 · 2', 3, 62, '30 · 16 · 8 · 4 · 2 · 2', '59 · 32 · 16 · 8 · 4 · 2', 2, 59, 61, '29 · 15 · 7 · 4 · 2 · 2', '59 · 30 · 15 · 8 · 4 · 2'],
  [60, 4, 60, '28 · 16 · 8 · 4 · 2 · 2', '56 · 32 · 16 · 8 · 4 · 2', 2, 62, '30 · 16 · 8 · 4 · 2 · 2', '60 · 32 · 16 · 8 · 4 · 2', 1, 60, 61, '30 · 15 · 7 · 4 · 2 · 2', '60 · 30 · 15 · 8 · 4 · 2'],
  [61, 3, 61, '29 · 16 · 8 · 4 · 2 · 2', '58 · 32 · 16 · 8 · 4 · 2', 2, 63, '31 · 16 · 8 · 4 · 2 · 2', '61 · 32 · 16 · 8 · 4 · 2', 2, 61, 63, '30 · 15 · 8 · 4 · 2 · 2', '61 · 31 · 16 · 8 · 4 · 2'],
  [62, 2, 62, '30 · 16 · 8 · 4 · 2 · 2', '60 · 32 · 16 · 8 · 4 · 2', 1, 63, '31 · 16 · 8 · 4 · 2 · 2', '62 · 32 · 16 · 8 · 4 · 2', 1, 62, 63, '31 · 15 · 8 · 4 · 2 · 2', '62 · 31 · 16 · 8 · 4 · 2'],
  [63, 1, 63, '31 · 16 · 8 · 4 · 2 · 2', '62 · 32 · 16 · 8 · 4 · 2', 1, 64, '32 · 16 · 8 · 4 · 2 · 2', '63 · 32 · 16 · 8 · 4 · 2', 1, 63, 64, '31 · 16 · 8 · 4 · 2 · 2', '63 · 32 · 16 · 8 · 4 · 2'],
  [64, 0, 64, '32 · 16 · 8 · 4 · 2 · 2', '64 · 32 · 16 · 8 · 4 · 2', 0, 64, '32 · 16 · 8 · 4 · 2 · 2', '64 · 32 · 16 · 8 · 4 · 2', 0, 64, 64, '32 · 16 · 8 · 4 · 2 · 2', '64 · 32 · 16 · 8 · 4 · 2'],
];

console.log('\n──── a matriz dos tres desenhos (61 linhas do dono) ────\n');
ok(MATRIZ.length === 61, 'a matriz tem as 61 linhas da planilha (achei ' + MATRIZ.length + ')');

const nums = (s) => String(s).split(' \u00b7 ').map(Number);

MATRIZ.forEach(function (L) {
  const N = L[0];
  const vcDe = (pl) => pl.rodadas.filter((r) => r.fase === 'VC');

  /* ── ① BYE CLÁSSICO: play-in + chave cheia ─────────────────────────────── */
  const bye = B.planClassicBye(N);
  ok(bye.byes === L[1], 'N=' + N + ' bye: folgas ' + bye.byes + ' != ' + L[1]);
  ok(bye.totalGames === L[2], 'N=' + N + ' bye: total ' + bye.totalGames + ' != ' + L[2]);
  ok(JSON.stringify(bye.rounds.map((r) => r.games)) === JSON.stringify(nums(L[3])),
    'N=' + N + ' bye: jogos por rodada');
  ok(JSON.stringify(bye.rounds.map((r) => r.entrants)) === JSON.stringify(nums(L[4])),
    'N=' + N + ' bye: entram por rodada');
  /* e o MOTOR concorda com o contrato: entrantes iguais, total menos o 3o lugar */
  const mBye = vcDe(C.plano(N, 'simples', 'bye'));
  ok(JSON.stringify(mBye.map((r) => r.E)) === JSON.stringify(nums(L[4])),
    'N=' + N + ' bye no MOTOR: entram por rodada');
  ok(mBye.reduce((s, r) => s + r.jogosReais, 0) + 1 === L[2],
    'N=' + N + ' bye no MOTOR: total ' + (mBye.reduce((s, r) => s + r.jogosReais, 0) + 1) + ' != ' + L[2]);
  ok(C.plano(N, 'simples', 'bye').esperamNoPlayin === L[1],
    'N=' + N + ' bye no MOTOR: quem espera o play-in');

  /* ── ② REPESCAGEM: o desenho de hoje ───────────────────────────────────── */
  const rep = C.plano(N, 'simples');
  const vcRep = vcDe(rep);
  ok(JSON.stringify(vcRep.map((r) => r.E)) === JSON.stringify(nums(L[8])),
    'N=' + N + ' rep: entram por rodada');
  const jr = vcRep.map((r) => r.jogos); jr[jr.length - 1] += 1;      /* o 3o lugar da planilha */
  ok(JSON.stringify(jr) === JSON.stringify(nums(L[7])), 'N=' + N + ' rep: jogos por rodada');
  ok(jr.reduce((a, b) => a + b, 0) === L[6], 'N=' + N + ' rep: total');
  ok(rep.repR2 + rep.repescagens === L[5],
    'N=' + N + ' rep: Voltam = repR2+repescagens (' + (rep.repR2 + rep.repescagens) + ' != ' + L[5] + ')');

  /* ── ③ SOBRA ÚNICA: ver a tabela própria, logo abaixo do laço ───────────────
   * ⛔⛔ A COLUNA DE SOBRA ÚNICA DA PLANILHA ANTIGA FICOU OBSOLETA em 26/set/2026, e não por erro
   * dela: o DONO mudou a regra. Ele travou o FIM da chave — _"na semifinal nao tem mais sobra. 4
   * disputam quem vai pra final (vencedores) e quem vai pra disputa de 3o (perdedores das semis)"_ e
   * _"SEMPRE TEM 3o!"_ — e uma trava no fim muda a descida inteira.
   * ⇒ A referência da sobra única passou a ser a tabela `SOBRA_UNICA` abaixo, derivada das fórmulas.
   * Ela NÃO vem do motor: vem da escada limpa. */
});

/* ══════════════════════════════════════════════════════════════════════════════
 * ③ A SOBRA ÚNICA — DESCIDA PURA, SEM RODADA DE ENTRADA.
 *
 * ⭐ ESTA TABELA JÁ FOI TROCADA DUAS VEZES NO MESMO DIA, e o registro é a parte útil:
 *  ① primeiro ela era a coluna da planilha antiga do dono;
 *  ② depois eu inventei uma "escada limpa" com rodada de entrada, para forçar a semifinal a ter 4;
 *  ③ o dono derrubou: _"sobra unica é sobra unica porra"_, _"nao tem rodada de entrada"_.
 * ⛔ O que eu li errado: ele descrevia o que uma semifinal É (4 equipes, duas à final, duas ao 3º) e
 * não uma trava para eu forçar a descida. E "SEMPRE TEM 3º" é sobre a CLASSIFICAÇÃO — todo torneio tem
 * um 3º colocado —, não sobre existir um jogo rotulado "disputa de 3º".
 *
 * ⇒ O desenho é o mais simples dos três: cada rodada corta pela metade; rodada ímpar tem UMA sobra;
 * nenhum alvo de potência de 2; todas jogam a estreia.
 * ⚠️ E a folga nunca cai a menos de 3 rodadas da final — ali a sobra JOGA, e é esse jogo que decide o
 * 3º colocado quando não existe um 4º para disputar.
 * ════════════════════════════════════════════════════════════════════════════ */
/* N, sobras (folga), vidas extras (sobra que jogou), jogos totais, jogos por rodada, entram por rodada */
const SOBRA_UNICA = [
  [4, 0, 0, 3, '2 · 1', '4 · 2'],
  [5, 1, 1, 5, '2 · 2 · 1', '5 · 3 · 2'],
  [6, 0, 1, 6, '3 · 2 · 1', '6 · 3 · 2'],
  [7, 1, 0, 6, '3 · 2 · 1', '7 · 4 · 2'],
  [8, 0, 0, 7, '4 · 2 · 1', '8 · 4 · 2'],
  [9, 2, 1, 9, '4 · 2 · 2 · 1', '9 · 5 · 3 · 2'],
  [10, 1, 1, 10, '5 · 2 · 2 · 1', '10 · 5 · 3 · 2'],
  [11, 1, 1, 11, '5 · 3 · 2 · 1', '11 · 6 · 3 · 2'],
  [12, 0, 1, 12, '6 · 3 · 2 · 1', '12 · 6 · 3 · 2'],
  [13, 2, 0, 12, '6 · 3 · 2 · 1', '13 · 7 · 4 · 2'],
  [14, 1, 0, 13, '7 · 3 · 2 · 1', '14 · 7 · 4 · 2'],
  [15, 1, 0, 14, '7 · 4 · 2 · 1', '15 · 8 · 4 · 2'],
  [16, 0, 0, 15, '8 · 4 · 2 · 1', '16 · 8 · 4 · 2'],
  [17, 3, 1, 17, '8 · 4 · 2 · 2 · 1', '17 · 9 · 5 · 3 · 2'],
  [18, 2, 1, 18, '9 · 4 · 2 · 2 · 1', '18 · 9 · 5 · 3 · 2'],
  [19, 2, 1, 19, '9 · 5 · 2 · 2 · 1', '19 · 10 · 5 · 3 · 2'],
  [20, 1, 1, 20, '10 · 5 · 2 · 2 · 1', '20 · 10 · 5 · 3 · 2'],
  [21, 2, 1, 21, '10 · 5 · 3 · 2 · 1', '21 · 11 · 6 · 3 · 2'],
  [22, 1, 1, 22, '11 · 5 · 3 · 2 · 1', '22 · 11 · 6 · 3 · 2'],
  [23, 1, 1, 23, '11 · 6 · 3 · 2 · 1', '23 · 12 · 6 · 3 · 2'],
  [24, 0, 1, 24, '12 · 6 · 3 · 2 · 1', '24 · 12 · 6 · 3 · 2'],
  [25, 3, 0, 24, '12 · 6 · 3 · 2 · 1', '25 · 13 · 7 · 4 · 2'],
  [26, 2, 0, 25, '13 · 6 · 3 · 2 · 1', '26 · 13 · 7 · 4 · 2'],
  [27, 2, 0, 26, '13 · 7 · 3 · 2 · 1', '27 · 14 · 7 · 4 · 2'],
  [28, 1, 0, 27, '14 · 7 · 3 · 2 · 1', '28 · 14 · 7 · 4 · 2'],
  [29, 2, 0, 28, '14 · 7 · 4 · 2 · 1', '29 · 15 · 8 · 4 · 2'],
  [30, 1, 0, 29, '15 · 7 · 4 · 2 · 1', '30 · 15 · 8 · 4 · 2'],
  [31, 1, 0, 30, '15 · 8 · 4 · 2 · 1', '31 · 16 · 8 · 4 · 2'],
  [32, 0, 0, 31, '16 · 8 · 4 · 2 · 1', '32 · 16 · 8 · 4 · 2'],
  [33, 4, 1, 33, '16 · 8 · 4 · 2 · 2 · 1', '33 · 17 · 9 · 5 · 3 · 2'],
  [34, 3, 1, 34, '17 · 8 · 4 · 2 · 2 · 1', '34 · 17 · 9 · 5 · 3 · 2'],
  [35, 3, 1, 35, '17 · 9 · 4 · 2 · 2 · 1', '35 · 18 · 9 · 5 · 3 · 2'],
  [36, 2, 1, 36, '18 · 9 · 4 · 2 · 2 · 1', '36 · 18 · 9 · 5 · 3 · 2'],
  [37, 3, 1, 37, '18 · 9 · 5 · 2 · 2 · 1', '37 · 19 · 10 · 5 · 3 · 2'],
  [38, 2, 1, 38, '19 · 9 · 5 · 2 · 2 · 1', '38 · 19 · 10 · 5 · 3 · 2'],
  [39, 2, 1, 39, '19 · 10 · 5 · 2 · 2 · 1', '39 · 20 · 10 · 5 · 3 · 2'],
  [40, 1, 1, 40, '20 · 10 · 5 · 2 · 2 · 1', '40 · 20 · 10 · 5 · 3 · 2'],
  [41, 3, 1, 41, '20 · 10 · 5 · 3 · 2 · 1', '41 · 21 · 11 · 6 · 3 · 2'],
  [42, 2, 1, 42, '21 · 10 · 5 · 3 · 2 · 1', '42 · 21 · 11 · 6 · 3 · 2'],
  [43, 2, 1, 43, '21 · 11 · 5 · 3 · 2 · 1', '43 · 22 · 11 · 6 · 3 · 2'],
  [44, 1, 1, 44, '22 · 11 · 5 · 3 · 2 · 1', '44 · 22 · 11 · 6 · 3 · 2'],
  [45, 2, 1, 45, '22 · 11 · 6 · 3 · 2 · 1', '45 · 23 · 12 · 6 · 3 · 2'],
  [46, 1, 1, 46, '23 · 11 · 6 · 3 · 2 · 1', '46 · 23 · 12 · 6 · 3 · 2'],
  [47, 1, 1, 47, '23 · 12 · 6 · 3 · 2 · 1', '47 · 24 · 12 · 6 · 3 · 2'],
  [48, 0, 1, 48, '24 · 12 · 6 · 3 · 2 · 1', '48 · 24 · 12 · 6 · 3 · 2'],
  [49, 4, 0, 48, '24 · 12 · 6 · 3 · 2 · 1', '49 · 25 · 13 · 7 · 4 · 2'],
  [50, 3, 0, 49, '25 · 12 · 6 · 3 · 2 · 1', '50 · 25 · 13 · 7 · 4 · 2'],
  [51, 3, 0, 50, '25 · 13 · 6 · 3 · 2 · 1', '51 · 26 · 13 · 7 · 4 · 2'],
  [52, 2, 0, 51, '26 · 13 · 6 · 3 · 2 · 1', '52 · 26 · 13 · 7 · 4 · 2'],
  [53, 3, 0, 52, '26 · 13 · 7 · 3 · 2 · 1', '53 · 27 · 14 · 7 · 4 · 2'],
  [54, 2, 0, 53, '27 · 13 · 7 · 3 · 2 · 1', '54 · 27 · 14 · 7 · 4 · 2'],
  [55, 2, 0, 54, '27 · 14 · 7 · 3 · 2 · 1', '55 · 28 · 14 · 7 · 4 · 2'],
  [56, 1, 0, 55, '28 · 14 · 7 · 3 · 2 · 1', '56 · 28 · 14 · 7 · 4 · 2'],
  [57, 3, 0, 56, '28 · 14 · 7 · 4 · 2 · 1', '57 · 29 · 15 · 8 · 4 · 2'],
  [58, 2, 0, 57, '29 · 14 · 7 · 4 · 2 · 1', '58 · 29 · 15 · 8 · 4 · 2'],
  [59, 2, 0, 58, '29 · 15 · 7 · 4 · 2 · 1', '59 · 30 · 15 · 8 · 4 · 2'],
  [60, 1, 0, 59, '30 · 15 · 7 · 4 · 2 · 1', '60 · 30 · 15 · 8 · 4 · 2'],
  [61, 2, 0, 60, '30 · 15 · 8 · 4 · 2 · 1', '61 · 31 · 16 · 8 · 4 · 2'],
  [62, 1, 0, 61, '31 · 15 · 8 · 4 · 2 · 1', '62 · 31 · 16 · 8 · 4 · 2'],
  [63, 1, 0, 62, '31 · 16 · 8 · 4 · 2 · 1', '63 · 32 · 16 · 8 · 4 · 2'],
  [64, 0, 0, 63, '32 · 16 · 8 · 4 · 2 · 1', '64 · 32 · 16 · 8 · 4 · 2'],
];
console.log('  • a sobra única: descida pura, uma sobra por rodada ímpar');
ok(SOBRA_UNICA.length === 61, 'a tabela da sobra única cobre 4..64 (achei ' + SOBRA_UNICA.length + ')');
SOBRA_UNICA.forEach(function (L) {
  const N = L[0];
  const pl = C.plano(N, 'simples', 'sobra_unica');
  const vc = pl.rodadas.filter((r) => r.fase === 'VC');
  ok(JSON.stringify(vc.map((r) => r.E)) === JSON.stringify(nums(L[5])), 'N=' + N + ' sobra: entram por rodada');
  ok(JSON.stringify(vc.map((r) => r.jogosReais)) === JSON.stringify(nums(L[4])), 'N=' + N + ' sobra: jogos por rodada');
  ok(vc.reduce((s, r) => s + r.jogosReais, 0) === L[3], 'N=' + N + ' sobra: total de jogos');
  /* ⛔ A FÓRMULA MESTRA: total = (N − 1) + vidas extras. A vida extra é a sobra que JOGOU. */
  ok(L[3] === (N - 1) + L[2], 'N=' + N + ' sobra: total = (N−1) + vidas extras');
  ok(pl.byes === L[1], 'N=' + N + ' sobra: quantas folgas');
  ok(pl.repescagens === L[2], 'N=' + N + ' sobra: quantas sobras jogaram');
  /* ⛔ TODAS jogam a estreia: não existe rodada de entrada neste desenho. */
  ok(vc[0].E === N, 'N=' + N + ' sobra: ⛔ TODAS jogam a estreia — não há rodada de entrada');
  /* ⛔ E folga nunca perto da final, nas duas chaves. */
  C.plano(N, 'dupla', 'sobra_unica').rodadas.forEach(function (r) {
    if (r.acao === 'bye') ok(r.ateFinalChave >= 3, 'N=' + N + ' sobra/dupla: folga perto da final');
  });
});

/* ── O PASSO A PASSO DAS 36 DA CONFRA (aba "36 times, passo a passo") ────────── */
console.log('  \u2022 as 36 equipes da Linha Ouro, rodada a rodada');
const c36 = {
  bye:   { entram: [8, 32, 16, 8, 4, 2], jogos: [4, 16, 8, 4, 2, 2], total: 36 },
  rep:   { entram: [36, 32, 16, 8, 4, 2], jogos: [18, 16, 8, 4, 2, 2], total: 50 },
  sobra: { entram: [36, 18, 9, 5, 3, 2], jogos: [18, 9, 4, 2, 2, 1], total: 36 },
};
const vc36 = (pol) => C.plano(36, 'simples', pol).rodadas.filter((r) => r.fase === 'VC');
ok(JSON.stringify(vc36('bye').map((r) => r.E)) === JSON.stringify(c36.bye.entram), '36 bye: entram');
ok(JSON.stringify(vc36('repescagem').map((r) => r.E)) === JSON.stringify(c36.rep.entram), '36 rep: entram');
ok(JSON.stringify(vc36('sobra_unica').map((r) => r.E)) === JSON.stringify(c36.sobra.entram), '36 sobra: entram');
/* ⭐ E O NÚMERO QUE O DONO ESTRANHOU NA CONFRA: com repescagem, 36 equipes viram 50 jogos e 14 duplas
 * voltam depois de perder a estreia. Com bye são 36 jogos e 28 duplas não jogam a estreia. Com sobra
 * única são 36 jogos, ninguém fica de fora da estreia e são 3 intervenções no torneio inteiro. É a
 * comparação que motivou este bloco da reforma. */
ok(vc36('repescagem').reduce((s, r) => s + r.jogos, 0) + 1 === 50, '36 rep: 50 jogos');
ok(C.plano(36, 'simples').repR2 === 14, '36 rep: 14 duplas voltam');
ok(vc36('bye').reduce((s, r) => s + r.jogosReais, 0) + 1 === 36, '36 bye: 36 jogos');
ok(C.plano(36, 'simples', 'bye').esperamNoPlayin === 28, '36 bye: 28 duplas nao jogam a estreia');
ok(C.plano(36, 'simples', 'sobra_unica').byes + C.plano(36, 'simples', 'sobra_unica').repescagens === 3,
  '36 sobra: 3 sobras no torneio inteiro (rodadas de 9, 5 e 3)');
ok(C.plano(36, 'simples', 'sobra_unica').rodadas.filter((r) => r.fase === 'VC')[0].E === 36,
  '36 sobra: TODAS as 36 jogam a estreia — contra 8 que jogam no bye clássico');

console.log('\n' + (fail ? '\u2717 ' + fail + ' falha(s), ' : '\u2705 ') + pass + ' verificacoes');
process.exit(fail ? 1 : 0);
