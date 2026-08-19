/* O USUÁRIO É SEMPRE O TIME AZUL, NO PRIMEIRO SLOT.
 *
 * Ordem do dono (15/ago/2026, testando no relógio): "o usuário deve ocupar
 * sempre o slot que seria do jogador 1, ficando o parceiro como jogador 2 e os
 * adversários como jogador 3 e 4. se resortear no segundo jogo são esses os
 * nomes. não pode aparecer um jogador 1 (isso seria o usuário)." E, sobre o
 * sintoma: "os slots estão frouxos e trocam de nome parece" · "o ideal seria o
 * usuário ser sempre o time azul".
 *
 * MEDIDO ANTES DE MEXER, rodando o `_computeRestartTeams` REAL do arquivo:
 * em 2000 re-sorteios ele tirava o usuário do slot azul em **73,2%** das vezes
 * (51,0% com duplas mistas). Havia TRÊS pontos que distribuem 4 pessoas em 2
 * times e só a montagem inicial respeitava a regra.
 *
 * Esta suíte trava as duas pontas:
 *   (1) a REGRA — `window._anchorUserFirst` (store.js, fonte única), incluindo
 *       o que ela NÃO pode fazer: mudar a partição (quem joga com quem);
 *   (2) o CASO — o `_computeRestartTeams` REAL, extraído do bracket-ui.js,
 *       nos dois ramos (sorteio comum e duplas mistas).
 * Mais o creditador de vitórias por NOME, que é o que torna a troca de lado
 * segura: com a âncora, `state.winner === 1` deixou de significar "pairing.t1".
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── usuario-sempre-time-azul ────');

const ROOT = path.join(__dirname, '..');
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const BUI = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');

// ── carrega a REGRA real do store.js ──────────────────────────────────────
global.window = global.window || {};
const mStore = STORE.match(/window\._anchorUserFirst = function[\s\S]*?\n};/);
ok(!!mStore, 'window._anchorUserFirst existe no store.js');
eval(mStore[0]);
const anchor = window._anchorUserFirst;

// ── extrai as funções REAIS do bracket-ui.js ─────────────────────────────
function extrai(nome) {
  const i = BUI.indexOf('function ' + nome + '(');
  if (i < 0) throw new Error('não achei ' + nome);
  let d = 0, k = BUI.indexOf('{', i);
  for (; k < BUI.length; k++) {
    if (BUI[k] === '{') d++;
    else if (BUI[k] === '}') { d--; if (!d) { k++; break; } }
  }
  return BUI.slice(i, k);
}

// contexto do closure, com os MESMOS nomes
let p1Players = [], p2Players = [], isDoubles = true, autoShuffle = true;
let _mixedDoublesEnabled = false, _coachMode = false;
let _sessionGameHistory = [];
let _reiRainhaPlayers = null, _reiRainhaWins = [0, 0, 0, 0];
const _playerMeta = {};
// v1.9.62: `_ancorarUsuario` passou a consultar quais NOMES estão duplicados na
// partida, pra recuar em vez de ancorar a pessoa errada quando há homônimo. Aqui
// nenhum nome se repete, então o mapa é vazio e o comportamento travado abaixo é o
// mesmo de sempre. O caso do homônimo é coberto em `formacao-de-duplas-casual`.
// ⚠️ Este harness declara à mão o escopo de `_openLiveScoring` — foi exatamente
// assim que ele ficou VERDE por semanas sobre um `_ancorarUsuario` que lançava
// ReferenceError em produção (`_coachMode` nunca esteve declarado lá). A suíte nova
// recorta a declaração de dentro da função real em vez de inventá-la.
const _nomesAmbiguos = {};
const _gmap = {};
function _genderByNameLS() { return _gmap; }
function _shuffleArrLS(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
const _ancorarUsuario = eval('(' + extrai('_ancorarUsuario') + ')');
const _parKey = eval('(' + extrai('_parKey') + ')');
const _computeRestartTeams = eval('(' + extrai('_computeRestartTeams') + ')');
const _rrCreditar = eval('(' + extrai('_rrCreditar') + ')');

const USER = 'Rodrigo';
window.AppStore = { currentUser: { uid: 'u1', displayName: USER } };
_playerMeta[USER] = { uid: 'u1' };
_playerMeta['Kelly'] = { uid: 'u2' };
_playerMeta['Nelson'] = { uid: 'u3' };
_playerMeta['Ana'] = { uid: 'u4' };

// ── (1) A REGRA ───────────────────────────────────────────────────────────
const uidOf = (n) => (_playerMeta[n] ? _playerMeta[n].uid : null);
let r = anchor(['Kelly', 'Ana'], [USER, 'Nelson'], uidOf, 'u1', USER);
ok(r.t1[0] === USER, 'usuário no vermelho → vem pro azul, primeiro slot');
ok(r.t1.indexOf('Nelson') === 1, 'e leva o parceiro junto — a dupla não se desfaz');
ok(r.t2.indexOf('Kelly') >= 0 && r.t2.indexOf('Ana') >= 0, 'os adversários seguem juntos do outro lado');

r = anchor(['Kelly', USER], ['Nelson', 'Ana'], uidOf, 'u1', USER);
ok(r.t1[0] === USER && r.t1[1] === 'Kelly', 'usuário no 2º slot do azul → vai pro 1º sem trocar de time');

r = anchor([USER, 'Kelly'], ['Nelson', 'Ana'], uidOf, 'u1', USER);
ok(r.t1[0] === USER, 'já certo → fica como está');

// a partição NUNCA muda — é o que a série do Rei/Rainha precisa preservar
function part(t1, t2) {
  const a = t1.slice().sort().join('|'), b = t2.slice().sort().join('|');
  return [a, b].sort().join('::');
}
const antes = part(['Kelly', 'Ana'], [USER, 'Nelson']);
const dep = anchor(['Kelly', 'Ana'], [USER, 'Nelson'], uidOf, 'u1', USER);
ok(part(dep.t1, dep.t2) === antes, '🔒 a âncora NÃO muda quem joga com quem (só o lado)');

// usuário fora de campo (modo técnico / partida de terceiros) → não inventa nada
r = anchor(['Kelly', 'Ana'], ['Nelson', 'Bia'], uidOf, 'u1', USER);
ok(r.t1[0] === 'Kelly' && r.t2[0] === 'Nelson', 'usuário que não está jogando não é forçado pra dentro');

// casa por NOME quando o slot não tem uid (é o estado de quem digitou o nome)
r = anchor(['Kelly', 'Ana'], [USER, 'Nelson'], () => null, null, USER);
ok(r.t1[0] === USER, 'sem uid, o nome do usuário ainda ancora');

// ── (2) O CASO: o re-sorteio REAL ─────────────────────────────────────────
const N = 2000;
let fora = 0;
for (let n = 0; n < N; n++) {
  p1Players = [USER, 'Kelly']; p2Players = ['Nelson', 'Ana'];
  const t = _computeRestartTeams();
  if (t.t1[0] !== USER) fora++;
}
ok(fora === 0, '🔒 "Jogar novamente": em ' + N + ' sorteios o usuário NUNCA sai do slot azul (saíram ' + fora + ')');

// ⚠️ ASSERÇÃO REVISADA DE PROPÓSITO. Ela exigia as 3 divisões saindo daqui —
// o que era verdade quando o sorteio era livre. Agora o re-sorteio EXCLUI a
// divisão que acabou de ser jogada (ver (2b)), então de um estado dado saem
// exatamente as 2 OUTRAS. O invariante que ela defendia — "o sorteio não virou
// fixo, ainda varia" — segue travado, agora no número certo.
const vistas = {};
for (let n = 0; n < 600; n++) {
  p1Players = [USER, 'Kelly']; p2Players = ['Nelson', 'Ana'];
  _sessionGameHistory = [];
  const t = _computeRestartTeams();
  vistas[part(t.t1, t.t2)] = true;
}
ok(Object.keys(vistas).length === 2,
   'o re-sorteio varia entre as 2 duplas AINDA NÃO jogadas (' + Object.keys(vistas).length + ')');

// duplas mistas: âncora + mistura preservada
_mixedDoublesEnabled = true;
_gmap[USER] = 'masculino'; _gmap['Nelson'] = 'masculino';
_gmap['Kelly'] = 'feminino'; _gmap['Ana'] = 'feminino';
let foraM = 0, misturaQuebrada = 0;
for (let n = 0; n < N; n++) {
  p1Players = [USER, 'Kelly']; p2Players = ['Nelson', 'Ana'];
  const t = _computeRestartTeams();
  if (t.t1[0] !== USER) foraM++;
  const g1 = t.t1.map((x) => _gmap[x]).sort().join(',');
  const g2 = t.t2.map((x) => _gmap[x]).sort().join(',');
  if (g1 !== 'feminino,masculino' || g2 !== 'feminino,masculino') misturaQuebrada++;
}
ok(foraM === 0, '🔒 duplas MISTAS: usuário nunca sai do azul (saíram ' + foraM + ')');
ok(misturaQuebrada === 0, 'e cada time continua com 1 homem + 1 mulher (quebras: ' + misturaQuebrada + ')');

// modo técnico: o dono do celular NÃO joga → a âncora sai de cena.
// Determinístico de propósito: contar quantas vezes o sorteio calhou de pôr o
// usuário no azul seria estatística, e ele cai lá ~25% das vezes por acaso.
_mixedDoublesEnabled = false; _coachMode = true;
const tec = _ancorarUsuario(['Kelly', 'Ana'], [USER, 'Nelson']);
ok(tec.t1[0] === 'Kelly' && tec.t2[0] === USER,
   'modo técnico: a âncora não mexe em nada (o técnico não é jogador)');
_coachMode = false;
const jog = _ancorarUsuario(['Kelly', 'Ana'], [USER, 'Nelson']);
ok(jog.t1[0] === USER, 'e fora do modo técnico ela volta a valer');

// ── (2b) O RE-SORTEIO NÃO REPETE DUPLA JÁ JOGADA ──────────────────────────
// Esta é a causa medida do "não funcionou o terceiro jogo Rei/Rainha quando
// rodou 2 duplas antes": o sorteio livre repetia a divisão do jogo anterior em
// 33,4% das vezes (6000 sorteios com a função antiga). Repetindo, a sessão fica
// com UMA divisão só e a sugestão 👑 — que exige DOIS pares distintos — nunca
// aparece. Sem 3º jogo pra oferecer.
_mixedDoublesEnabled = false;
const kJogo1 = _parKey([USER, 'Kelly'], ['Nelson', 'Ana']);
let repetiu = 0;
for (let n = 0; n < 1500; n++) {
  p1Players = [USER, 'Kelly']; p2Players = ['Nelson', 'Ana'];
  _sessionGameHistory = [];
  const t = _computeRestartTeams();
  if (_parKey(t.t1, t.t2) === kJogo1) repetiu++;
}
ok(repetiu === 0, '🔒 o jogo 2 NUNCA repete a dupla do jogo 1 (repetiu ' + repetiu + '× em 1500)');

// e o jogo 3 tem que ser exatamente o par que falta
let terceiroErrado = 0;
const kJogo2 = _parKey([USER, 'Nelson'], ['Kelly', 'Ana']);
for (let n = 0; n < 1500; n++) {
  p1Players = [USER, 'Nelson']; p2Players = ['Kelly', 'Ana'];
  _sessionGameHistory = [{ p1: [USER, 'Kelly'], p2: ['Nelson', 'Ana'], winner: 1 }];
  const t = _computeRestartTeams();
  const k = _parKey(t.t1, t.t2);
  if (k === kJogo1 || k === kJogo2) terceiroErrado++;
}
ok(terceiroErrado === 0, '🔒 o jogo 3 é o par que FALTA — nunca um dos dois já jogados (' + terceiroErrado + ')');

// esgotadas as 3, volta a sortear livre em vez de travar
_sessionGameHistory = [
  { p1: [USER, 'Kelly'], p2: ['Nelson', 'Ana'], winner: 1 },
  { p1: [USER, 'Nelson'], p2: ['Kelly', 'Ana'], winner: 1 },
  { p1: [USER, 'Ana'], p2: ['Kelly', 'Nelson'], winner: 1 }
];
p1Players = [USER, 'Kelly']; p2Players = ['Nelson', 'Ana'];
const esgot = _computeRestartTeams();
ok(esgot.t1.length === 2 && esgot.t2.length === 2 && esgot.t1[0] === USER,
   'com as 3 duplas já jogadas ele volta a sortear (e ainda ancora o usuário)');

// histórico de OUTRAS pessoas não pode restringir este quarteto
_sessionGameHistory = [{ p1: ['Bia', 'Caio'], p2: ['Dora', 'Edu'], winner: 1 }];
const vistas2 = {};
for (let n = 0; n < 900; n++) {
  p1Players = [USER, 'Kelly']; p2Players = ['Nelson', 'Ana'];
  vistas2[_parKey(...Object.values(_computeRestartTeams()))] = true;
}
ok(Object.keys(vistas2).length === 2,
   'jogo de outro quarteto não conta: sobram as 2 divisões novas deste (' + Object.keys(vistas2).length + ')');
_sessionGameHistory = [];

// ── (3) O CRÉDITO DE VITÓRIA É POR NOME ───────────────────────────────────
// É isto que torna a troca de lado segura. Com índices de pairing, ancorar
// daria a vitória à dupla errada.
_reiRainhaPlayers = [USER, 'Kelly', 'Nelson', 'Ana'];
_reiRainhaWins = [0, 0, 0, 0];
_rrCreditar([USER, 'Nelson'], ['Kelly', 'Ana'], 1);
ok(_reiRainhaWins[0] === 1 && _reiRainhaWins[2] === 1, 'vitória do time 1 credita quem estava NELE');
ok(_reiRainhaWins[1] === 0 && _reiRainhaWins[3] === 0, 'e não credita o time perdedor');
_rrCreditar([USER, 'Nelson'], ['Kelly', 'Ana'], 2);
ok(_reiRainhaWins[1] === 1 && _reiRainhaWins[3] === 1, 'vitória do time 2 credita o outro lado');
_reiRainhaWins = [0, 0, 0, 0];
_rrCreditar([USER, 'Nelson'], ['Kelly', 'Ana'], 0);
ok(_reiRainhaWins.join(',') === '0,0,0,0', 'empate não credita ninguém');

// mesma dupla, lados TROCADOS pela âncora → o mérito tem que ser o mesmo
_reiRainhaWins = [0, 0, 0, 0];
_rrCreditar(['Kelly', 'Ana'], [USER, 'Nelson'], 2);
ok(_reiRainhaWins[0] === 1 && _reiRainhaWins[2] === 1,
   '🔒 com os lados trocados, a MESMA dupla vencedora recebe as mesmas vitórias');

// ── (4) varredura: ninguém volta a distribuir times sem passar pela âncora ─
const semAncora = [];
['_computeRestartTeams'].forEach(function (fn) {
  const corpo = extrai(fn);
  if (corpo.indexOf('_ancorarUsuario') === -1) semAncora.push(fn);
});
ok(semAncora.length === 0, '🔒 _computeRestartTeams passa pela âncora (' + semAncora.join(', ') + ')');
const rot = BUI.slice(BUI.indexOf('// 5. Define novas duplas'), BUI.indexOf('// 6. Reinicia estado de placar'));
ok(rot.indexOf('_ancorarUsuario') !== -1,
   '🔒 a rotação do Rei/Rainha também ancora (era ela que jogava o usuário pro vermelho no meio da série)');
ok(BUI.indexOf('window._anchorUserFirst') !== -1, 'a regra vem do store.js, não é reimplementada aqui');

console.log('usuario-sempre-time-azul:', pass, 'ok,', fail, 'falhas');
if (fail > 0) process.exit(1);
