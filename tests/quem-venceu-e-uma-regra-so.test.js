/* quem-venceu-e-uma-regra-so — a cor do placar precisa saber QUEM VENCEU, sempre.
 *
 * 🔴 A FALHA REAL (dono, 21/ago/2026, olhando "Novidades no seu torneio" na dashboard):
 *   _"que caralho é isso dos 2 numeros vermelhos e sem tarja verde?"_ — um jogo 1 × 6 com os
 *   DOIS números em vermelho e nenhuma tarja verde. E a pergunta que veio junto:
 *   _"nao fez uma trava dessa merda?"_. Ele está certo: a 1.9.112 acertou a REGRA de cor
 *   (tarja = estado, número = quem ganhou) e travou os três estados — mas nada travava o
 *   degrau de baixo, que é DESCOBRIR quem ganhou.
 *
 * CAUSA, medida nos documentos REAIS da Confra: o vencedor é gravado como string de nomes
 * composta ("Fulano / Ciclano"), e ela deixa de bater com o slot quando a dupla muda depois
 * do resultado. Aí `winner === p1` e `winner === p2` dão FALSO nos dois lados → ninguém é
 * vencedor → dois perdedores na tela. Caso real (nomes anonimizados na fixture):
 *   winner "Pessoa 53 / Pessoa 52" · p1 "Pessoa 49 / Pessoa 51" · p2 "Pessoa 50 / Pessoa 52"
 *
 * FALHA NO CÓDIGO ANTIGO: sem window._matchWinnerSide, o caso real acima devolve "ninguém".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
console.log('──── quem venceu é uma regra só ────');

// Carrega bracket-model.js num sandbox mínimo (ele só precisa de window/location).
const sandbox = { window: {}, location: { search: '' }, setTimeout: function () {}, console: console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-model.js'), 'utf8'), sandbox);
const lado = sandbox.window._matchWinnerSide;
ok(typeof lado === 'function', 'window._matchWinnerSide existe (regra única)');

// ── 1. O CASO REAL que o dono viu ────────────────────────────────────────────
const real = {
  winner: 'Pessoa 53 / Pessoa 52', p1: 'Pessoa 49 / Pessoa 51', p2: 'Pessoa 50 / Pessoa 52',
  team1Uids: ['uid0051', 'uid0049'], team2Uids: ['uid0052', 'uid0050'],
  scoreP1: 1, scoreP2: 6, setsWonP1: 0, setsWonP2: 1, draw: false
};
ok(lado(real) === 2, 'jogo 1×6 com winner que não bate em NENHUM slot → vence quem fez 6 (não "ninguém")');

// ── 2. O caminho normal não muda ─────────────────────────────────────────────
ok(lado({ winner: 'A', p1: 'A', p2: 'B', scoreP1: 6, scoreP2: 1 }) === 1, 'winner batendo com p1 → lado 1');
ok(lado({ winner: 'B', p1: 'A', p2: 'B', scoreP1: 1, scoreP2: 6 }) === 2, 'winner batendo com p2 → lado 2');
ok(lado({ draw: true, p1: 'A', p2: 'B', scoreP1: 6, scoreP2: 6 }) === 0, 'empate → 0 (ninguém em verde)');

// ── 3. ⛔ NUNCA inventar vencedor ─────────────────────────────────────────────
ok(lado({ p1: 'A', p2: 'B', scoreP1: 0, scoreP2: 0 }) === null, 'sem winner → null (jogo sem resultado segue cinza)');
ok(lado({ p1: 'A', p2: 'B', scoreP1: 6, scoreP2: 1 }) === null, 'placar SEM winner ainda é null — quem decide é o winner, não o palpite');
ok(lado({ winner: 'X / Y', p1: 'A', p2: 'B', scoreP1: 3, scoreP2: 3 }) === null, 'winner solto e placar EMPATADO → null (não há como saber; não chuta)');

// ── 4. Por UID, quando o documento carrega essa prova ────────────────────────
ok(lado({ winner: 'nome velho', p1: 'A', p2: 'B', winnerUids: ['u2'], team1Uids: ['u1'], team2Uids: ['u2'], scoreP1: 6, scoreP2: 1 }) === 2,
  'winnerUids manda mais que o placar — identidade estrutural vence o nome');

// ── 5. VARREDURA nos torneios REAIS (a prova de que a classe sumiu) ──────────
const fx = path.join(__dirname, 'fixtures', 'prod-tournaments.json');
if (fs.existsSync(fx)) {
  const all = JSON.parse(fs.readFileSync(fx, 'utf8'));
  const ts = Array.isArray(all) ? all : (all.tournaments || Object.values(all));
  const jogos = [];
  (function dig(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(dig); return; }
    if (o.winner !== undefined && (o.p1 !== undefined || o.p2 !== undefined)) jogos.push(o);
    Object.values(o).forEach(dig);
  })(ts);
  const comWinner = jogos.filter(m => m.winner && !m.draw && m.winner !== 'draw');
  const soltos = comWinner.filter(m => m.winner !== m.p1 && m.winner !== m.p2);
  const orfaos = soltos.filter(m => lado(m) === null);
  console.log('  · ' + comWinner.length + ' jogos decididos na base real · ' + soltos.length + ' com winner que não bate no slot');
  ok(soltos.length > 0, 'a base real TEM o caso (se zerar um dia, o teste vira vigia e não some)');
  ok(orfaos.length === 0, 'nenhum jogo decidido fica SEM vencedor resolvido (era isso na tela: 2 vermelhos)');
} else {
  console.log('  · fixture de produção ausente (rode scripts/baixar-torneios.js) — varredura pulada');
}

// ── 6. QUEM ESCREVE carimba a identidade do lado (a sangria para na origem) ──
// Sem isto, cada resultado novo nasce com a mesma fragilidade: nome de dupla que envelhece
// na primeira substituição. `_stampWinner` grava o lado E os uids.
(function () {
  const stamp = sandbox.window._stampWinner;
  ok(typeof stamp === 'function', 'window._stampWinner existe (regra única de escrita)');
  sandbox.window._slotUids = function (m, side) { return side === 1 ? (m.team1Uids || []) : (m.team2Uids || []); };
  const m = { p1: 'A / B', p2: 'C / D', team1Uids: ['u1', 'u2'], team2Uids: ['u3', 'u4'] };
  stamp(m, 2);
  ok(m.winner === 'C / D', 'grava o nome do lado que venceu (compatível com quem ainda lê nome)');
  ok(JSON.stringify(m.winnerUids) === JSON.stringify(['u3', 'u4']), 'E carimba os uids do lado — é isso que não envelhece');
  ok(m.draw === false, 'e desmarca empate');
  // Depois de uma substituição, o NOME do slot muda e o carimbo continua valendo.
  m.p2 = 'C / Z';
  ok(lado(m) === 2, 'após trocar o nome da dupla, o vencedor continua sendo o lado 2 (pelo uid)');
  // Guest sem conta: a string é a identidade legítima; não carimbar uid vazio.
  const g = { p1: 'Guest', p2: 'Outro' };
  sandbox.window._slotUids = function () { return []; };
  stamp(g, 1);
  ok(g.winner === 'Guest' && g.winnerUids === undefined, 'guest sem uid não ganha carimbo vazio (a string É a identidade dele)');
})();

// ── 6. E o CARD usa a regra única (não a comparação de nome) ─────────────────
const br = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
ok(/_matchWinnerSide\(m\)/.test(br), 'renderMatchCard resolve o vencedor pela regra única');
ok(!/const p1IsWinner = isDecided && m\.winner === m\.p1;/.test(br),
  'e NÃO voltou pra comparação de string de nomes');
const ui = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-ui.js'), 'utf8');
const lg = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-logic.js'), 'utf8');
ok(!/m\.winner = m\.p1;/.test(ui) && !/m\.winner = m\.p2;/.test(ui),
  'lançar placar não grava mais só o nome — passa por _stampWinner');
ok(/_stampWinner\(m, 1\)/.test(ui) && /_stampWinner\(m, 2\)/.test(ui), 'os dois lados carimbam');
ok(/_stampWinner\(m, 1\)/.test(lg) && /_stampWinner\(m, 2\)/.test(lg),
  'aprovar um placar pendente também carimba (é onde o resultado vira definitivo)');

// ── 7. VARREDURA: nada por nome, em lugar NENHUM ─────────────────────────────
// Ordem do dono (21/ago): "nada por nome porra" · "tudo uid". Eram 78 sítios comparando
// `X.winner === X.p1` — na cor do card, na CLASSIFICAÇÃO (bracket-logic), no campeão/pódio
// (store.js), no compartilhamento, no sorteio. Nos 3 jogos órfãos da Confra a comparação
// dava falso nos DOIS lados: a vitória sumia da conta. Medido no golden depois da troca:
// +6 vitórias contadas = 3 jogos × 2 pessoas da dupla vencedora — exatamente o que faltava.
(function () {
  const dir = path.join(__dirname, '..', 'js');
  const pad = /\b([A-Za-z_][A-Za-z0-9_.]*)\.winner (===|!==) \1\.p[12]\b/;
  const achados = [];
  (function varre(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) return varre(full);
      if (!e.name.endsWith('.js') || e.name === 'release-notes.js') return;
      fs.readFileSync(full, 'utf8').split('\n').forEach(function (ln, i) {
        if (!pad.test(ln)) return;
        // O corpo do PRÓPRIO resolvedor é o único lugar onde o nome ainda é consultado —
        // é o 1º degrau dele (nome → uid → placar).
        if (e.name === 'bracket-model.js') return;
        achados.push(full.replace(dir, 'js') + ':' + (i + 1));
      });
    });
  })(dir);
  if (achados.length) achados.slice(0, 6).forEach(function (a) { console.log('    ↳ ' + a); });
  ok(achados.length === 0, 'NENHUM sítio do app decide vencedor comparando string de nome');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ quem-venceu-e-uma-regra-so FALHOU'); process.exit(1); }
console.log('✅ quem-venceu-e-uma-regra-so: OK');
