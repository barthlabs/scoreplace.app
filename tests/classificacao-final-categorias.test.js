/* Pódio e colocação individual de todos os atletas em classificatória Rei/Rainha
 * seguida de duplas fixas. Exercita o render público e a progressão dos placares. */
'use strict';
const assert = require('node:assert/strict');
const H = require('./render-harness');
const W = H.sandbox;

function category(name, groupCount) {
  const matches = [], groups = [];
  for (let g = 0; g < (groupCount || 4); g++) {
    const names = Array.from({ length: 4 }, (_, i) => `${name} G${g + 1} J${i + 1}`);
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      matches.push({ id:`${name}-g${g}-${a}-${b}`, phaseIndex:0, category:name,
        monarchGroup:g, groupName:`Grupo ${g + 1}`, isMonarch:true, round:1,
        team1:[names[a]], team2:[names[b]], p1:names[a], p2:names[b],
        winner:names[a], scoreP1:6, scoreP2:0 });
    }
    groups.push(names.slice(0, 2));
  }
  const pairs = groups.map((people, i) => ({ label:people.join(' / '), people, i }));
  function match(id, round, left, right, third) {
    return { id:`${name}-${id}`, phaseIndex:1, category:name, bracket:'main',
      round, isThirdPlace:!!third, p1:left.label, p2:right.label,
      team1Obj:{ participants:left.people.map(name => ({ name })) },
      team2Obj:{ participants:right.people.map(name => ({ name })) } };
  }
  const quarters = pairs.length === 8 ? [0, 2, 4, 6].map((i, index) =>
    match('q' + index, 1, pairs[i], pairs[i + 1])) : [];
  const semiRound = quarters.length ? 2 : 1;
  const semi1 = match('s1', semiRound, pairs[0], quarters.length ? pairs[2] : pairs[1]);
  const semi2 = match('s2', semiRound, quarters.length ? pairs[4] : pairs[2], quarters.length ? pairs[6] : pairs[3]);
  const final = match('final', semiRound + 1, pairs[0], quarters.length ? pairs[4] : pairs[2]);
  const third = match('third', semiRound + 1, quarters.length ? pairs[2] : pairs[1], quarters.length ? pairs[6] : pairs[3], true);
  return { matches:matches.concat(quarters, [semi1, semi2, final, third]),
    quarters, semi1, semi2, final, third, pairs };
}

const a = category('Categoria A'), b = category('Categoria B');
const t = { id:'categorias-final', status:'active', rulesContractVersion:2,
  rankingPrimary:'games_diff', tiebreakers:[],
  currentPhaseIndex:1, phases:[{kind:'classification', reiRainha:true},
    {kind:'elimination', fixedPairs:true, rankingType:'individual'}],
  titleAwards:[{scope:'category', label:'Categoria A', winnerName:a.pairs[0].label}],
  matches:a.matches.concat(b.matches) };

let sections = W._categoryFinalPlacements(t);
const partialHtml = W._renderPodiumsAndClassif(t);
assert.equal((partialHtml.match(/Classificação · Categoria/g) || []).length, 2,
  'colocações definidas já aparecem durante o torneio');
assert(!partialHtml.includes('podium-step'), 'pódio aguarda as finais');
assert.equal(sections.length, 2, 'cada categoria tem classificação própria');
for (const section of sections) {
  assert.equal(section.total, 16, 'todos os atletas entram na contagem');
  assert.equal(section.entries.length, 8, 'antes da eliminatória só quem saiu nos grupos tem posição final');
  assert(section.entries.every(row => row.pos >= 5), 'não antecipa pódio nem resultado de quem ainda joga');
  const scores = H.E.prevPhaseGroups(t).filter(g => g.category === section.category)
    .flatMap(g => W._computeMonarchStandings(g, t, section.category))
    .reduce((map, row) => (map[row.name] = row.gamesWon - row.gamesLost, map), {});
  for (let i = 1; i < section.entries.length; i++) {
    const before = section.entries[i - 1], after = section.entries[i];
    assert(scores[before.name] >= scores[after.name], 'quem saiu na fase de grupos segue o saldo de games');
    if (scores[before.name] === scores[after.name])
      assert.equal(before.pos, after.pos, 'saldo igual sem desempate mantém colocação empatada');
  }
}
for (const fixture of [a, b]) {
  fixture.semi1.winner = fixture.pairs[0].label;
  fixture.semi2.winner = fixture.pairs[2].label;
}
sections = W._categoryFinalPlacements(t);
assert(sections.every(section => section.entries.length === 8),
  'semifinalistas ainda podem mudar de posição na disputa de terceiro');
for (const fixture of [a, b]) {
  fixture.third.winner = fixture.pairs[1].label;
}
sections = W._categoryFinalPlacements(t);
assert(sections.every(section => section.entries.length === 12), 'terceiros e quartos lugares ficam definidos');
for (const fixture of [a, b]) fixture.final.winner = fixture.pairs[0].label;
t.status = 'finished';
sections = W._categoryFinalPlacements(t);
for (const section of sections) {
  assert.equal(section.entries.length, 16, 'classificação final inclui todos os atletas');
  for (const pos of [1, 2, 3, 4]) {
    assert.equal(section.entries.filter(row => row.pos === pos).length, 2,
      `dupla da ${pos}ª colocação tem dois atletas`);
  }
}
const html = W._renderPodiumsAndClassif(t);
assert.equal((html.match(/Classificação · Categoria/g) || []).length, 2,
  'cada categoria tem bloco de classificação abaixo do pódio');
assert(html.includes(a.pairs[1].people[0]) && html.includes(b.pairs[1].people[0]),
  'o terceiro lugar aparece em ambos os pódios');
assert(!html.includes('tournament-title-awards'), 'os títulos não suprimem a classificação');
const bracketHtml = W._renderPhaseBracket(t, false, '');
assert.equal((bracketHtml.match(/Classificação · Categoria/g) || []).length, 2,
  'o chaveamento usa as categorias individuais e não a chave técnica misturada');

const c = category('Categoria C', 8);
const eight = { ...t, id:'eight-pairs', status:'active', matches:c.matches,
  phases:[t.phases[0], { ...t.phases[1], elimination:{ bracketType:'single' } }] };
const margins = [2, 5, 2, 4];
c.quarters.forEach((game, i) => {
  game.winner = c.pairs[i * 2].label;
  game.scoreP1 = 6;
  game.scoreP2 = 6 - margins[i];
});
const quarterRows = W._categoryFinalPlacements(eight)[0].entries;
const placeOf = name => quarterRows.find(row => row.name === name).pos;
assert.equal(placeOf(c.pairs[1].people[0]), 5, 'melhor saldo entre eliminadas nas quartas lidera a faixa');
assert.equal(placeOf(c.pairs[5].people[0]), 5, 'saldo igual nas quartas conserva empate');
assert.equal(placeOf(c.pairs[7].people[0]), 7, 'saldo intermediário fica depois das empatadas');
assert.equal(placeOf(c.pairs[3].people[0]), 8, 'pior saldo fica no fim da mesma faixa');
console.log('✅ classificação completa por categoria e posições progressivas');
