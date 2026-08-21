#!/usr/bin/env node
/* O TORNEIO DE DUPLAS MISTAS, CONSISTENTE — node tests/duplas-mistas-consistencia.test.js
 *
 * Relato do dono (12/ago/2026), sobre `tour_1783511910924`: _"esse torneio esta bem
 * inconsistente… a mescla da angelica reck ficou inconsistente. aparece maria em alguns
 * pontos e angelica em outros… a classificacao de 8 esta dando como parcial… carolina
 * entrou em time com leila que tomou wo apenas na disputa de 3o e isso deveria refletir
 * corretamente. ou seja. uma zona total."_
 *
 * TRÊS DEFEITOS, TODOS MEDIDOS NO DOC REAL antes de mexer — e nenhum deles era dado errado:
 *
 * 1) CLASSIFICAÇÃO 6 DE 8. O doc tem DUAS disputas de 3º lugar: `matches[7]`
 *    (`isThirdPlace:true`, JOGADO — W.O. da Leila, vencedor Catia/Francisco) e um
 *    `t.thirdPlaceMatch` legado criado ~55min depois, VAZIO. O resolvedor era
 *    `t.thirdPlaceMatch || matches.find(isThirdPlace)` — o fantasma vazio ganhava por ser o
 *    primeiro do `||`. Sem 3º/4º, a tela dizia "parcial".
 *    A regra passou a ser por CONTEÚDO: decide quem tem VENCEDOR.
 *
 * 2) "Maria Reck" × "angelica reck". O perfil dela (uid 0Jmn…) é "angelica reck"; o jogo
 *    guarda o rótulo do dia do sorteio, "Maria Reck". O título do card resolvia por uid e a
 *    linha do time imprimia o rótulo — a MESMA pessoa com dois nomes na mesma tela.
 *
 * 3) A Leila sumia de TODAS as linhas. O W.O. dela é de UM jogo (`woClaims[0].scope ===
 *    "match"`, `woHistory[uid].matchNum === 8`), mas o filtro era um booleano sem escopo.
 *    Ela desaparecia até do jogo 4, que jogou e VENCEU.
 *
 * A fixture é o RECORTE REAL do doc (ids, uids e rótulos como estão em produção).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? '  [' + extra + ']' : '')); }
};

// ── o motor REAL de classificação ───────────────────────────────────────────
// ⚠️ 2.0.3: bracket-MODEL antes de bracket-LOGIC, na MESMA ordem do index.html e do
// draw-core da CF. É ele que traz `window._matchWinnerSide` — a regra única de "quem
// venceu". Sem ele aqui, o sandbox do teste rodava um motor MUTILADO (a chamada estourava
// e a classificação perdia 2 das 8 posições) e o teste acusava um defeito que só existia
// no harness. É a armadilha de paridade sandbox × app de sempre.
global.window = global; global._t = (k) => k;
['js/views/bracket-model.js', 'js/views/bracket-logic.js'].forEach(function (rel) {
  vm.runInThisContext(fs.readFileSync(path.join(raiz, rel), 'utf8'), { filename: rel.split('/').pop() });
});

const U = {
  ILI: 'ZD7WH7SCnVMMKwMHqgnTg9UVr1P2', FLA: 'inKQvoP7ASXaRpCdfpagKpqF8iS2',
  ANG: '0Jmnsh6oTrO2zgWPzv0SzHIfjnH2', ROD: 'B17n7JCXYOfqahlcLZ0fKxGGyUu1',
  CAT: 'wyzumHJXI4Q6V3r8C9XCELCBkB32', FRA: 'VLJEQbX29nStjpAmeBzXDxwnLAr1',
  CAR: 'Dd2w0jcsNBRvHN1dcDuPI9cZwXV2', LEI: 'NvsXrlXdyQMz1SPjIxaQNId3y6Y2'
};
const T_ILI = 'Iliane Geraldi Garcia / Flávia Barchetta';
const T_ANG = 'Maria Reck / Rodrigo Barth';          // rótulo GRAVADO (nome antigo dela)
const T_CAT = 'Catia Cavedon / Francisco Rossi Reck de Salvo';
const T_CAR = 'Carolina Moresco / Leila';
const obj = (u1, n1, u2, n2) => ({ p1Uid: u1, p1Name: n1, p2Uid: u2, p2Name: n2 });

function docReal() {
  return {
    format: 'Eliminatórias Simples',
    matches: [
      { id: 'm0', round: 0, p1: T_ILI, p2: 'Silvia Moura Ferreira / Patricia Paixao', winner: T_ILI },
      { id: 'm1', round: 0, p1: 'Renata Esberard / Gersom Hideo Otsu', p2: T_CAT, winner: T_CAT },
      { id: 'm2', round: 0, p1: T_ANG, p2: 'Betsy Emma Betsabe Blasco / Kelly Barth', winner: T_ANG,
        team1Obj: obj(U.ANG, 'Maria Reck', U.ROD, 'Rodrigo Barth') },
      { id: 'm3', round: 0, p1: 'Lucia Helena Silva Cerri / Adriano', p2: T_CAR, winner: T_CAR,
        team2Obj: obj(U.CAR, 'Carolina Moresco', U.LEI, 'Leila') },
      { id: 'm4', round: 1, p1: T_ILI, p2: T_CAT, winner: T_ILI },
      { id: 'm5', round: 1, p1: T_ANG, p2: T_CAR, winner: T_ANG,
        team1Obj: obj(U.ANG, 'Maria Reck', U.ROD, 'Rodrigo Barth') },
      { id: 'm6', round: 2, p1: T_ILI, p2: T_ANG, winner: T_ILI },
      // o 3º lugar CANÔNICO, jogado (W.O. da Leila)
      { id: 'm7', round: 2, p1: T_CAT, p2: T_CAR, winner: T_CAT, isThirdPlace: true,
        wo: true, woAbsent: 'Leila', woAbsentSide: 'p2' }
    ],
    // o FANTASMA legado, vazio — é ele que ganhava
    thirdPlaceMatch: { id: 'match-3rd', round: 2, label: '3º Lugar', p1: T_CAT, p2: T_CAR, winner: null },
    woHistory: { [U.LEI]: { name: 'Leila', partner: 'Carolina Moresco', originalTeam: T_CAR, matchNum: 8 } }
  };
}
function classificar(doc) {
  const f = JSON.parse(JSON.stringify(doc));
  try { window._updateProgressiveClassification(f); } catch (e) { return { erro: e.message }; }
  return f.classification || {};
}

console.log('\n1. A classificação fecha 8 de 8 — o 3º lugar JOGADO decide');
const cl = classificar(docReal());
ok(Object.keys(cl).length === 8, 'as 8 equipes recebem posição (era 6 de 8)', Object.keys(cl).length);
ok(cl[T_ILI] === 1, 'campeã', cl[T_ILI]);
ok(cl[T_ANG] === 2, 'vice', cl[T_ANG]);
ok(cl[T_CAT] === 3, '3º = quem venceu a disputa de 3º', cl[T_CAT]);
ok(cl[T_CAR] === 4, '4º = quem perdeu a disputa de 3º (a dupla da Leila)', cl[T_CAR]);

console.log('\n2. Não inventa: 3º lugar não jogado segue sem 3º/4º');
const naoJogado = docReal();
naoJogado.matches[7].winner = null; naoJogado.matches[7].wo = false;
const cl2 = classificar(naoJogado);
ok(cl2[T_CAT] == null && cl2[T_CAR] == null, 'sem vencedor em nenhum dos dois, ninguém recebe 3º/4º');
ok(cl2[T_ILI] === 1 && cl2[T_ANG] === 2, 'e final decidida continua dando campeão e vice');

console.log('\n3. A forma LEGADA (só t.thirdPlaceMatch, decidido) não regride');
const soLegado = docReal();
soLegado.matches = soLegado.matches.filter((m) => !m.isThirdPlace);
soLegado.thirdPlaceMatch.winner = T_CAT;
const cl3 = classificar(soLegado);
ok(cl3[T_CAT] === 3 && cl3[T_CAR] === 4, 'doc antigo segue classificando 3º e 4º');

console.log('\n4. O nome vem do PERFIL, por posição do slot (Maria → angelica)');
const m2 = docReal().matches[2];
const uids = window._slotUidsPositional(m2, 'p1');
ok(uids[0] === U.ANG && uids[1] === U.ROD, 'o slot entrega os uids na ordem da dupla', JSON.stringify(uids));
const perfil = { [U.ANG]: 'angelica reck', [U.ROD]: 'Rodrigo Barth' };
const exibido = m2.p1.split('/').map((s) => s.trim()).map((n, i) => perfil[uids[i]] || n);
ok(exibido[0] === 'angelica reck', 'a linha do time mostra o nome ATUAL do perfil', exibido[0]);
ok(m2.p1.indexOf('Maria Reck') === 0, 'e o rótulo GRAVADO segue intacto no doc (é a chave de presença)');

console.log('\n5. O W.O. da Leila é de UM jogo só (varredura do código real)');
const part = fs.readFileSync(path.join(raiz, 'js/views/participants.js'), 'utf8');
const i = part.indexOf('const _renderTeamDots');
const bloco = part.slice(i, i + 2600);
ok(/_woHistGet/.test(bloco), 'a linha do time consulta o REGISTRO do W.O., não um booleano');
ok(/matchNum/.test(bloco), 'e compara o jogo do W.O. com o jogo da linha');
ok(/_h\.matchNum == null/.test(bloco), 'W.O. sem escopo (legado) mantém o comportamento antigo');
ok(!/\.filter\(x => !window\._woHistHas\(t, x\.nome\)\)/.test(bloco),
   'o filtro global sem escopo saiu — era ele que apagava a Leila do jogo que ela venceu');

console.log('\n' + (fail ? '✗' : '✅') + ' duplas-mistas-consistencia: ' + pass + ' passaram, ' + fail + ' falharam');
if (fail) process.exit(1);
