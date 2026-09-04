/* meu-jogo-uid-do-slot-se-recupera.test.js
 *
 * ⛔ O DEFEITO (relato do dono, 04/set/2026): _"o toggle só meus jogos, nas chaves não está
 * mostrando nada"_. `_userTeamInMatch` — a pergunta "é o meu jogo?" — lia o slot CRU
 * (`_slotUids`), enquanto o card já desenhava a pessoa pelo leitor que RECUPERA o uid
 * (`_slotUidsPositional`). O mesmo jogo era "meu" pra desenhar e "não meu" pra filtrar,
 * então `data-my-match="0"` e o toggle apagava a chave.
 *
 * MEDIDO em produção antes do conserto (funções reais, uid real, somente leitura):
 * Confra BT Alta da Clínica — 214 jogos, **64 sem uid em slot nenhum**.
 *
 * ⭐ Continua uid e nada mais: a recuperação resolve nome→uid pelo elenco e pelos slots do
 * PRÓPRIO torneio. Este teste cobra as duas metades: recupera quem é do torneio, e NÃO
 * inventa dono pra quem não é.
 *
 * node tests/meu-jogo-uid-do-slot-se-recupera.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }

// As funções REAIS do app, carregadas do arquivo — nada de reimplementar a regra no teste.
const sandbox = { window: {}, console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
['identity-core.js', 'bracket-logic.js', 'bracket-ui.js'].forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'js', 'views', f), 'utf8'), sandbox);
});
const W = sandbox.window;

const UID_EU = 'uid-rodrigo';
const UID_OUTRO = 'uid-fulano';

// Torneio de duplas com o buraco REAL: o slot guarda o uid de UM e null do outro, e o
// elenco (inscritos) conhece os dois. É a forma do doc gravado que a medição encontrou.
function torneio() {
  return {
    id: 'tour_teste',
    participants: [
      { displayName: 'Rodrigo Barth / Ana Ribeiro', p1Name: 'Rodrigo Barth', p1Uid: UID_EU,
        p2Name: 'Ana Ribeiro', p2Uid: 'uid-ana' },
      { displayName: 'Fulano / Beltrano', p1Name: 'Fulano', p1Uid: UID_OUTRO,
        p2Name: 'Beltrano', p2Uid: 'uid-beltrano' }
    ],
    matches: []
  };
}

console.log('\n▸ ① slot com uid FALTANDO: o dono do jogo se recupera pelo elenco');
{
  const t = torneio();
  const m = {
    id: 'j1',
    p1: 'Rodrigo Barth / Ana Ribeiro', p2: 'Fulano / Beltrano',
    team1: ['Rodrigo Barth', 'Ana Ribeiro'], team1Uids: [null, 'uid-ana'],
    team2: ['Fulano', 'Beltrano'],          team2Uids: [UID_OUTRO, 'uid-beltrano']
  };
  t.matches = [m];
  // a prova do buraco: o leitor CRU não me acha neste slot
  ok(W._slotUids(m, 'p1').indexOf(UID_EU) === -1, 'o leitor cru NÃO tem o meu uid no slot (é o buraco)');
  eq(W._userTeamInMatch(t, m, { uid: UID_EU }), 1, '⭐ mesmo assim o jogo é MEU — lado 1');
  eq(W._userTeamInMatch(t, m, { uid: UID_OUTRO }), 2, 'e o do outro continua sendo o lado 2');
}

console.log('▸ ② quem NÃO é do jogo continua de fora (a recuperação não inventa dono)');
{
  const t = torneio();
  const m = {
    id: 'j2',
    p1: 'Rodrigo Barth / Ana Ribeiro', p2: 'Fulano / Beltrano',
    team1: ['Rodrigo Barth', 'Ana Ribeiro'], team1Uids: [null, 'uid-ana'],
    team2: ['Fulano', 'Beltrano'],          team2Uids: [UID_OUTRO, null]
  };
  t.matches = [m];
  eq(W._userTeamInMatch(t, m, { uid: 'uid-estranho' }), 0, 'quem não joga não passa a jogar');
  eq(W._userTeamInMatch(t, m, {}), 0, 'usuário sem uid nunca é dono de slot');
  eq(W._userTeamInMatch(t, null, { uid: UID_EU }), 0, 'jogo ausente devolve 0');
}

console.log('▸ ③ nome FICTÍCIO (pessoa sem conta) não vira dono de ninguém');
{
  const t = torneio();
  const m = {
    id: 'j3',
    p1: 'Jogador X / Ana Ribeiro', p2: 'Fulano / Beltrano',
    team1: ['Jogador X', 'Ana Ribeiro'], team1Uids: [null, 'uid-ana'],
    team2: ['Fulano', 'Beltrano'],       team2Uids: [UID_OUTRO, 'uid-beltrano']
  };
  t.matches = [m];
  eq(W._userTeamInMatch(t, m, { uid: UID_EU }), 0, 'o fictício não me empresta o slot dele');
  eq(W._userTeamInMatch(t, m, { uid: 'uid-ana' }), 1, 'e a parceira com uid segue dona do lado 1');
}

console.log('▸ ④ SEM torneio (servidor / autoDraw) o comportamento é o de sempre');
{
  const m = { id: 'j4', team1: ['Rodrigo Barth', 'Ana Ribeiro'], team1Uids: [null, 'uid-ana'],
              team2: ['Fulano', 'Beltrano'], team2Uids: [UID_OUTRO, 'uid-beltrano'] };
  eq(W._userTeamInMatch(null, m, { uid: UID_EU }), 0, 'sem `t` não há o que recuperar — cru, byte a byte');
  eq(W._userTeamInMatch(null, m, { uid: 'uid-ana' }), 1, 'e o uid que ESTÁ gravado continua valendo');
}

console.log('▸ ⑤ 1v1 pelo par p1Uid/p2Uid segue intacto');
{
  const t = torneio();
  const m = { id: 'j5', p1: 'Rodrigo Barth', p2: 'Fulano', p1Uid: UID_EU, p2Uid: UID_OUTRO };
  t.matches = [m];
  eq(W._userTeamInMatch(t, m, { uid: UID_EU }), 1, '1v1: lado 1');
  eq(W._userTeamInMatch(t, m, { uid: UID_OUTRO }), 2, '1v1: lado 2');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
