'use strict';
/* O NOME DA RODADA É CONCEITO: número de jogos E distância da final. Faltando uma, é Rodada X.
 * node tests/nome-da-rodada-e-conceito.test.js
 *
 * O conceito, que não é convenção interna deste projeto — é como a literatura e o esporte usam, e o
 * número está no próprio nome:
 *   FINAL              1 jogo   — define o campeão
 *   SEMIFINAIS         2 jogos  — definem quem vai à final; os perdedores fazem o 3º lugar
 *   QUARTAS DE FINAL   4 jogos  — antecedem as semifinais
 *   OITAVAS DE FINAL   8 jogos  — antecedem as quartas
 *   qualquer outra     RODADA X
 *
 * ⛔⛔ SÃO DUAS CONDIÇÕES JUNTAS: a rodada tem de TER aquele número de jogos **e** estar naquela
 * distância da final. Faltando qualquer uma, o nome é "Rodada X".
 *
 * ⭐ O QUE ESTAVA ERRADO: o rótulo saía só da DISTÂNCIA até o fim — 1ª do fim = Final, 2ª =
 * Semifinais, 3ª = Quartas, 4ª = Oitavas. Isso mente em toda chave que não é potência de 2 exata.
 * MEDIDO: numa chave de 36 pela sobra única os jogos por rodada são 18 · 9 · 4 · 2 · 2 · 1, e a
 * antepenúltima, com DOIS jogos, era anunciada como "Quartas de Final".
 *
 * ⚠️ E DUAS COISAS NÃO CONTAM COMO JOGO DA RODADA: a folga (ninguém joga) e a disputa de 3º lugar
 * (ela mora na rodada da final, mas a final é 1 jogo — o do campeão). Contar a disputa de 3º faria a
 * final ter 2 jogos e ser rebatizada de "Semifinais" pelo próprio critério.
 */
const path = require('path');
const H = require('./headless.js');
H.load('bracket-model.js');
const W = H.window;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o nome da rodada é conceito ────\n');

/* ⛔ A PORTA É `_getUnifiedRounds`: é ela que a tela chama para montar as colunas da chave, e é de lá
 * que sai o rótulo. Testar por dentro de outra função seria testar um caminho que a tela não usa. */
const porta = W._getUnifiedRounds;
ok(typeof porta === 'function', 'a porta que monta as colunas da chave existe (achei ' + typeof porta + ')');

/* Monta jogos falsos com o número de jogos que eu quiser por rodada, na chave principal. */
function jogos(porRodada) {
  const out = [];
  porRodada.forEach(function (n, i) {
    for (let k = 0; k < n; k++) {
      /* ⛔ SEM `bracket`: é assim que a eliminatória simples chega ao construtor. Pôr `bracket:'main'`
       * joga o jogo no caminho da DUPLA eliminatória, que rotula "Rodada N" e não usa os nomes —
       * eu escrevi assim na primeira versão e o teste media o caminho errado. */
      out.push({ id: 'R' + (i + 1) + '-P' + (k + 1), round: i + 1,
        p1: 'A', p2: 'B', winner: null });
    }
  });
  return out;
}
function nomes(porRodada, extras) {
  const ms = jogos(porRodada).concat(extras || []);
  const cols = porta({ id: 't', format: 'Eliminatórias Simples', matches: ms });
  const lista = (cols && cols.columns) || [];
  return lista.map(function (c) { return c.label || ''; });
}

/* ── ① A CHAVE REDONDA: os quatro nomes aparecem ───────────────────────────── */
const r16 = nomes([8, 4, 2, 1]);
ok(r16.join(' | ') === 'Oitavas de Final | Quartas de Final | Semifinais | Final',
  '① chave de 16: ' + r16.join(' | '));
const r8 = nomes([4, 2, 1]);
ok(r8.join(' | ') === 'Quartas de Final | Semifinais | Final', '① chave de 8: ' + r8.join(' | '));
const r4 = nomes([2, 1]);
ok(r4.join(' | ') === 'Semifinais | Final', '① chave de 4: ' + r4.join(' | '));
const r2 = nomes([1]);
ok(r2.join(' | ') === 'Final', '① chave de 2: ' + r2.join(' | '));

/* ── ② A CONTAGEM ERRADA PERDE O NOME, mesmo na distância certa ─────────────
 * ⛔ É o defeito que este arquivo existe para travar: 2 jogos na antepenúltima NÃO é "Quartas". */
const torto = nomes([9, 4, 2, 2, 1]);
ok(torto[torto.length - 1] === 'Final', '② a última com 1 jogo é Final');
ok(torto[torto.length - 2] === 'Semifinais', '② a penúltima com 2 jogos é Semifinais');
ok(/^Rodada /.test(torto[torto.length - 3]),
  '② ⛔⛔ a antepenúltima com DOIS jogos é Rodada X, não Quartas (achei "' + torto[torto.length - 3] + '")');
ok(/^Rodada /.test(torto[0]) && /^Rodada /.test(torto[1]),
  '② e as anteriores também, porque a cadeia já se rompeu');

/* ── ③ A CADEIA NÃO PODE TER BURACO ─────────────────────────────────────────
 * ⛔ Uma rodada só é "a que antecede as quartas" se as quartas existirem de verdade. Com a penúltima
 * errada, a antepenúltima deixa de ser antepenúltima-de-nada — é Rodada X mesmo tendo 4 jogos. */
const buraco = nomes([8, 4, 3, 1]);
ok(buraco[buraco.length - 1] === 'Final', '③ a final continua Final');
ok(/^Rodada /.test(buraco[buraco.length - 2]),
  '③ penúltima com 3 jogos não é Semifinais (achei "' + buraco[buraco.length - 2] + '")');
ok(/^Rodada /.test(buraco[buraco.length - 3]),
  '③ ⛔ e a de 4 jogos ANTES dela não é Quartas: a cadeia tem buraco (achei "' + buraco[buraco.length - 3] + '")');

/* ── ④ A DISPUTA DE 3º LUGAR NÃO CONTA NA FINAL ─────────────────────────────
 * ⛔ Ela mora na rodada da final. Se entrasse na conta, a final teria 2 jogos e seria rebatizada de
 * "Semifinais" pelo próprio critério — e aí a chave inteira perderia os nomes em cascata. */
const comTerceiro = nomes([4, 2, 1], [{ id: '3P', round: 3, isThirdPlace: true,
  p1: 'A', p2: 'B', winner: null }]);
ok(comTerceiro[comTerceiro.length - 1] === 'Final',
  '④ ⛔⛔ com a disputa de 3º na mesma rodada, a última continua Final (achei "' + comTerceiro[comTerceiro.length - 1] + '")');
ok(comTerceiro.join(' | ') === 'Quartas de Final | Semifinais | Final',
  '④ e a chave inteira mantém os nomes: ' + comTerceiro.join(' | '));

/* ── ⑤ A FOLGA NÃO É JOGO ───────────────────────────────────────────────────
 * ⛔ Uma rodada de 5 entrantes tem 2 jogos e uma folga. Se a folga contasse, a rodada teria 3 e o nome
 * mudaria — e o organizador veria "Semifinais" numa rodada que não é. */
const comFolga = nomes([2, 1], [{ id: 'F1', round: 1, isBye: true, p1: 'C', p2: null }]);
ok(comFolga.join(' | ') === 'Semifinais | Final',
  '⑤ ⛔ a folga não entra na conta da rodada (achei ' + comFolga.join(' | ') + ')');

/* ── ⑥ E O CONCEITO ESTÁ ESCRITO NO CÓDIGO, no ponto que já quebrou ─────────── */
const fs = require('fs');
const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-model.js'), 'utf8');
ok(/_NOMES_POR_JOGOS/.test(src), '⑥ a tabela do conceito existe, nomeada');
ok(/1 jogo[\s\S]{0,400}2 jogos[\s\S]{0,400}4 jogos[\s\S]{0,400}8 jogos/.test(src),
  '⑥ e os quatro nomes estão explicados com o número de jogos de cada um');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
