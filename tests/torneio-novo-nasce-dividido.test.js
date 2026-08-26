/* TORNEIO NOVO NASCE NO FORMATO NOVO (2.0.106)
 * node tests/torneio-novo-nasce-dividido.test.js
 *
 * Depois que o Confra foi dividido, o caminho novo passou a ser exercitado por 1 torneio
 * contra 38. ⛔ Caminho que é exceção APODRECE: mudança futura quebra o raro em silêncio,
 * porque a suíte e o uso real martelam o comum. E a exceção ser justo o torneio ao vivo
 * com 148 pessoas é o pior arranjo possível.
 *
 * ⭐ E nascer dividido é o caso MAIS SEGURO que existe: torneio novo não tem jogo nenhum,
 * então não há o que mover nem o que perder. Ele já sorteia direto no lugar certo.
 *
 * ⚠️ O DETALHE QUE FAZ ISSO NÃO QUEBRAR A TELA: "documento sem jogo" é ambíguo — pode ser
 * "ainda não sorteou" (zero jogos MESMO) ou "dividido e a tela não buscou". Os dois pintam
 * vazio e só um é honesto. `_nJogos` desfaz o empate.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');

// ── ① a criação põe o marcador ──────────────────────────────────────────────
const i = store.indexOf('tourData = Object.assign({');
ok(i > 0, 'o caminho de CRIAÇÃO existe (separado do de edição)');
const criacao = store.slice(i, i + 700);
ok(/_semPesados: \['matches'\]/.test(criacao), '⭐ torneio novo nasce dividido');
ok(/_nJogos: 0/.test(criacao),
  '⛔ e com a contagem ZERO — sem ela a tela acusaria todo torneio novo de "não carregou"');

// ── ② o número é mantido por quem grava ─────────────────────────────────────
ok(/_nJogos = \(pDepois\.matches \|\| \[\]\)\.length/.test(cf),
  '⭐ a CF atualiza a contagem toda vez que grava (senão ela envelhece e mente)');
ok(/_nJogos = \(_p\.matches \|\| \[\]\)\.length/.test(db),
  'e o cliente também, no mesmo lugar em que divide');

// ── ③ a rede usa o número em vez de adivinhar — rodando a função REAL ──────
const i0 = store.indexOf('function _enxertaJogos(');
const corpo = store.slice(i0, store.indexOf('\n    }', i0) + 6);
const ctx = { store: { tournaments: [] } }; vm.createContext(ctx);
vm.runInContext(corpo + '\nthis.f = _enxertaJogos;', ctx);
const enxerta = ctx.f;

const novo = { id: 'n1', _semPesados: ['matches'], _nJogos: 0, rounds: [], matches: [] };
const r1 = enxerta(JSON.parse(JSON.stringify(novo)), null);
ok(!r1._faltamPesados,
  '⭐ torneio NOVO (0 jogos, nada em memória) NÃO é acusado de incompleto');

const cheio = { id: 'c1', _semPesados: ['matches'], _nJogos: 12,
                rounds: [{ round: 1, matches: [] }], matches: [] };
const r2 = enxerta(JSON.parse(JSON.stringify(cheio)), null);
ok(r2._faltamPesados === true,
  '⛔ mas torneio com 12 jogos fora e nada em memória É — "não carregou" ≠ "não tem"');

const r3 = enxerta(JSON.parse(JSON.stringify(cheio)),
  { id: 'c1', rounds: [{ round: 1, matches: [{ id: 'm1' }] }] });
ok(!r3._faltamPesados && r3.rounds[0].matches.length === 1,
  'e com memória, os jogos voltam e a marca sai');

const velho = { id: 'v1', _semPesados: ['matches'], rounds: [{ round: 1, matches: [] }], matches: [] };
ok(enxerta(JSON.parse(JSON.stringify(velho)), null)._faltamPesados === true,
  '⚠️ documento SEM `_nJogos` (dividido antes desta versão) cai no comportamento antigo, que é o seguro');

console.log((fail ? '✗' : '✓') + ' torneio-novo-nasce-dividido: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
