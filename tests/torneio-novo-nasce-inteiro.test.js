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
/* ⛔⛔ REVERTIDO NO MESMO DIA, com o app quebrado na mão do dono:
 *   "não mostra os meus jogos apenas a classificação" · "jogos já jogados perdidos".
 * (No banco nada se perdeu — conferido contra os dois backups: 115 jogos, 72 placares,
 * 148 inscritos, idênticos. O que quebrou foi a TELA não conseguir montar.)
 *
 * A CAUSA: eu construí a REDE do ouvinte — que enxerta os jogos que já estão em MEMÓRIA —
 * e nunca construí a BUSCA. No PRIMEIRO carregamento não há memória, e o carregamento
 * inicial vem pelo ouvinte, não pelo `loadTournamentById` que eu tinha ensinado a montar.
 * Torneio chega sem jogos e ninguém vai buscar.
 * ⛔ E eu tinha escrito essa rede chamando-a de "a rede antes do salto", convencido de que
 * cobria o caso. Ela cobre o RE-render. Não cobre o primeiro.
 *
 * ⭐ O QUE ESTE TESTE TRANCA AGORA: torneio novo nasce INTEIRO. Só volta a nascer dividido
 * quando existirem (1) o ouvinte da subcoleção do torneio ABERTO e (2) a busca no primeiro
 * carregamento — provados num torneio de verdade, não em teste. */
ok(!/_semPesados: \['matches'\]/.test(criacao),
  '⛔ torneio novo NÃO nasce dividido — a busca no 1º carregamento não existe');
ok(!/_nJogos: 0/.test(criacao), '   (nem a contagem, que só faz sentido dividido)');

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

// a rede em si CONTINUA correta e vale a pena manter provada — ela é pré-requisito de
// quando isto voltar. `_nJogos` desfaz o empate entre "não sorteou" e "não carregou".
const novo = { id: 'n1', _semPesados: ['matches'], _nJogos: 0, rounds: [], matches: [] };
const r1 = enxerta(JSON.parse(JSON.stringify(novo)), null);
ok(!r1._faltamPesados,
  '⭐ com _nJogos:0, "não tem jogo" não é confundido com "não carregou"');

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

console.log((fail ? '✗' : '✓') + ' torneio-novo-nasce-inteiro: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
