/* OS CRITÉRIOS DE DESEMPATE E A ORDEM DO ORGANIZADOR MANDAM — SEMPRE, EM TODO CAMINHO
 *
 * Ordem do dono (22/ago/2026): _"os critérios devem ser considerados na ordem deixada pelo
 * organizador SEMPRE, senão é perfumaria a tela dos critérios; se ele muda ordem, exclui
 * critério ou inclui e nada muda, não serve pra nada a configuração dos critérios e ordem
 * deles."_ E depois: _"isso tudo deve ser canônico e aplicado sempre dessa forma"_.
 *
 * FALHA REAL, medida no ranking de derrotados que decide a REPESCAGEM (`_rankByTiebreakers`,
 * bracket-logic). Ele era o QUARTO switch de critérios do projeto — os outros três já tinham
 * sido unificados em `standingsCompareConfig` e este ficou para trás:
 *
 *   1. um critério FANTASMA decidia ANTES da lista do organizador:
 *        if (a.lastScoreDiff !== b.lastScoreDiff) return b.lastScoreDiff - a.lastScoreDiff;
 *      a diferença do último jogo, que não está na tela e não pode ser reordenada nem excluída;
 *   2. `pontos_avancados` — o PRIMEIRO critério configurado no Confra — não existia no switch:
 *      caía no default e era ignorado sem aviso;
 *   3. `buchholz` e `sonneborn_berger` eram `case` VAZIOS ("skip for elimination");
 *   4. `sorteio` era neutro.
 *   → de 8 critérios configurados, 4 não faziam nada e um quinto rodava por fora.
 *
 * O QUE ESTE TESTE GUARDA: que mexer na configuração MUDA o resultado. Se reordenar não muda
 * quem é repescado, a tela é enfeite — que é exatamente a frase do dono.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require(path.join(ROOT, 'tests/render-harness'));
const W = H.sandbox;

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
};

console.log('──── os critérios do organizador mandam (sempre) ────');

// ── um cenário pequeno e CONTROLADO, onde cada critério aponta pra um lado ───────────
// A: saldo alto, poucas vitórias   ·  B: saldo baixo, muitas vitórias
// Assim "saldo_pontos primeiro" e "vitorias primeiro" dão ordens OPOSTAS.
function torneio(tiebreakers) {
  return {
    id: 'tst', tiebreakers: tiebreakers,
    matches: [
      // A: vence 1 (6x0), perde 1 (5x6)  → saldo +5, vitórias 1
      { id: 'm1', p1: 'A', p2: 'X', scoreP1: 6, scoreP2: 0, winner: 'A', round: 1 },
      { id: 'm2', p1: 'A', p2: 'Y', scoreP1: 5, scoreP2: 6, winner: 'Y', round: 1 },
      // B: vence 2 apertado (6x5, 6x5)   → saldo +2, vitórias 2
      { id: 'm3', p1: 'B', p2: 'X', scoreP1: 6, scoreP2: 5, winner: 'B', round: 1 },
      { id: 'm4', p1: 'B', p2: 'Y', scoreP1: 6, scoreP2: 5, winner: 'B', round: 1 }
    ]
  };
}
const ordem = (tb) => {
  const r = W._rankByTiebreakers(torneio(tb), ['A', 'B']);
  return r.map(x => x.name).join('');
};

ok('o ranking de derrotados existe', typeof W._rankByTiebreakers === 'function');

const porSaldo = ordem(['saldo_pontos', 'vitorias', 'sorteio']);
const porVitorias = ordem(['vitorias', 'saldo_pontos', 'sorteio']);
ok('com SALDO primeiro, quem tem mais saldo vem na frente', porSaldo === 'AB', 'veio ' + porSaldo);
ok('com VITÓRIAS primeiro, quem tem mais vitórias vem na frente', porVitorias === 'BA', 'veio ' + porVitorias);
ok('⛔ MUDAR A ORDEM MUDA O RESULTADO (senão a tela é perfumaria)', porSaldo !== porVitorias,
  'as duas ordens deram o mesmo resultado (' + porSaldo + ') — a configuração não está mandando');

// EXCLUIR um critério também tem de mudar: sem `vitorias` na lista, sobra o saldo.
const semVitorias = ordem(['saldo_pontos', 'sorteio']);
ok('EXCLUIR um critério muda quem decide', semVitorias === 'AB', 'veio ' + semVitorias);

// ── o critério FANTASMA não pode voltar ─────────────────────────────────────────────
const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket-logic.js'), 'utf8');
const i = src.indexOf('function _rankByTiebreakers');
const corpo = src.slice(i, src.indexOf('\n}', i));
ok('⛔ nenhum critério decide ANTES da lista do organizador',
  !/return\s+b\.lastScoreDiff\s*-\s*a\.lastScoreDiff/.test(corpo.replace(/\/\/[^\n]*/g, '')),
  'voltou um desempate cravado no código, fora da configuração');
ok('o ranking delega ao comparador CANÔNICO', /_cmpStd\(a, b, _opts\)/.test(corpo));
ok('  → passando a lista configurada do organizador', /tiebreakers: tiebreakers/.test(corpo));
ok('  → e o campo primário certo (pontos avançados quando ligado)',
  /primaryField: _advOn \? 'advancedPoints' : 'points'/.test(corpo));

// ── confronto direto: as duas pontas têm de falar a MESMA identidade ────────────────
ok('o confronto direto é chaveado no formato canônico ("|||")', /\|\|\|/.test(corpo),
  'com o formato antigo ({p1|p2:{w1,w2}}) o comparador nunca acha a chave e o critério vira neutro');
ok('  → e a linha do jogador carrega uid, como o comparador espera', /uid: uidDoSlot/.test(corpo));

// ── NENHUM caminho pode ter a sua própria régua ─────────────────────────────────────
// Um switch de critérios fora do comparador canônico é como esta falha nasceu: quatro
// cópias da mesma regra, e a que ninguém olhava foi ficando incompleta.
const arquivos = ['js/views/bracket-logic.js', 'js/views/phases-engine.js', 'js/views/standings-core.js'];
const suspeitos = [];
arquivos.forEach(f => {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // um switch que trata 'buchholz' E 'sonneborn_berger' é uma régua de critérios
  const re = /case\s+'buchholz'/g;
  let m; while ((m = re.exec(s))) {
    if (f.endsWith('standings-core.js')) continue;         // ESTE é o canônico, pode
    suspeitos.push(f + ':' + s.slice(0, m.index).split('\n').length);
  }
});
ok('⛔ só o standings-core implementa a lista de critérios', suspeitos.length === 0,
  'régua paralela em: ' + suspeitos.join(', ') + ' — unifique em standingsCompareConfig');

console.log(falhas === 0
  ? '\n✅ criterios-do-organizador-mandam: OK'
  : '\n❌ criterios-do-organizador-mandam: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
