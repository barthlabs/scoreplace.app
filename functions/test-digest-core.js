'use strict';
/* O E-MAIL DE NOVIDADES — as três regras que o dono pediu olhando o digest (12/set/2026):
 *  ① não repetir o placar: com tabela, o texto fica só na AUTORIA;
 *  ② mostrar sempre a versão colorida — reconstruindo quando o aviso vier sem `scoreboard`
 *    (foi o caso do aviso da Lucia Cerri, medido: `scoreboard: null`);
 *  ③ ⛔ sem inventar formato: um número por lado NÃO é set, e não vira tabela.
 * Núcleo puro porque `functions/index.js` não é `require`-ável em teste.
 */
const assert = require('assert/strict');
const D = require('./digest-core.js');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const P = D._digestPalette('light');

// ① com tabela, o texto perde as linhas de placar
{
  const it = { level: 'fundamental', tournamentName: 'Confra',
    message: 'Rodrigo Barth confirmou o resultado lançado por Vivi Hirata:\nAna / Mari 2 5\nvs\nVivi / Carolina 6 6',
    scoreboard: { p1: 'Ana / Mari', p2: 'Vivi / Carolina', winner: 'Vivi / Carolina',
      sets: [{ label: 'Set 1', p1: 2, p2: 6 }, { label: 'Set 2', p1: 5, p2: 6 }] } };
  const html = D._buildDigestHtml([it], 'dark');
  must(html.indexOf('confirmou o resultado lançado por Vivi Hirata') > 0, 'a AUTORIA continua no texto');
  must(html.indexOf('Ana / Mari 2 5') === -1, '⛔ as linhas de placar somem do texto (a tabela já as mostra)');
  must(html.indexOf('SET 1') > 0 || html.indexOf('Set 1') > 0, 'e a tabela colorida está lá');
}
// ② sem scoreboard, reconstrói da mensagem
{
  const it = { level: 'fundamental', message: 'Lucia Helena Silva Cerri lançou:\nleila arida / Lucia 6 4 10\nvs\nPaulo Oriente / Nádia 3 6 8' };
  const tabela = D._digestScoreboard(it, P);
  must(tabela !== '', '⛔ aviso sem `scoreboard` ganha tabela reconstruída da mensagem');
  must(/>6</.test(tabela) && /10/.test(tabela) && /8/.test(tabela), 'com os mesmos números do lançamento');
  const html = D._buildDigestHtml([it], 'light');
  must(html.indexOf('leila arida / Lucia 6 4 10') === -1, 'e o texto também perde a repetição');
  must(html.indexOf('lançou') > 0, 'mantendo quem lançou');
}
// ③ o que NÃO pode virar tabela
{
  must(D._digestScoreboard({ message: 'Fulano lançou:\nTime A 2\nvs\nTime B 1' }, P) === '',
    '⛔ UM número por lado não é set — nada de tabela com rótulo "Set 1"');
  must(D._digestScoreboard({ message: 'Fulano entrou no torneio.' }, P) === '', 'texto livre não vira placar');
  must(D._digestScoreboard({ message: 'A 6 4\nB 3 6' }, P) === '', 'sem a linha `vs` não há dois lados claros');
  must(D._digestScoreboard({ message: 'X lançou:\nA 6 4\nvs\nB 3' }, P) === '', 'contagens diferentes ⇒ não adivinha');
}
// e o que já valia continua valendo
{
  const it = { message: 'X lançou:\nA 6\nvs\nB 4',
    scoreboard: { p1: 'A', p2: 'B', winner: 'A', sets: [{ label: 'Set 1', p1: 6, p2: 4, tiebreak: { pointsP1: 9, pointsP2: 7 } }] } };
  const t = D._digestScoreboard(it, P);
  must(t.indexOf('(9)') > 0 && t.indexOf('(7)') > 0, 'o subponto do tie-break continua aparecendo, por lado');
  must(t.indexOf(P.win) > 0 && t.indexOf(P.loss) > 0, 'e a cor continua sendo do SET');
}
console.log('✅ digest: ' + ok + ' asserções — sem repetição, sempre colorido, sem inventar formato');
