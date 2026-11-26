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
  assert.equal(section.displayEntries.length, 12,
    'as quatro duplas ocupam uma linha cada e os oito eliminados na classificatória ficam sozinhos');
  for (const pos of [1, 2, 3, 4]) {
    assert.equal(section.entries.filter(row => row.pos === pos).length, 2,
      `dupla da ${pos}ª colocação tem dois atletas`);
    assert.equal(section.displayEntries.filter(row => row.pos === pos).length, 1,
      `dupla da ${pos}ª colocação aparece em uma linha`);
  }
  assert(section.displayEntries.filter(row => row.pos > 4).every(row => !row.isPair),
    'quem saiu na fase classificatória aparece individualmente');
}
const html = W._renderPodiumsAndClassif(t);
assert.equal((html.match(/Classificação · Categoria/g) || []).length, 2,
  'cada categoria tem bloco de classificação abaixo do pódio');
assert(html.includes(a.pairs[1].people[0]) && html.includes(b.pairs[1].people[0]),
  'o terceiro lugar aparece em ambos os pódios');
assert(!html.includes('tournament-title-awards'), 'os títulos não suprimem a classificação');
assert(!/<details open/.test(html), 'classificações abaixo dos pódios começam fechadas');
assert(html.includes('data-classif-name="' + a.pairs[0].label + '"') &&
       html.includes('data-classif-name="' + b.pairs[0].label + '"'),
  'os dois integrantes de cada dupla são exibidos na mesma linha com /');
assert(!html.includes('data-classif-name="' + a.pairs[0].people[0] + '"'),
  'a primeira integrante da dupla não ganha uma segunda linha isolada');
const bracketHtml = W._renderPhaseBracket(t, false, '');
assert.equal((bracketHtml.match(/Classificação · Categoria/g) || []).length, 2,
  'o chaveamento usa as categorias individuais e não a chave técnica misturada');
assert(bracketHtml.includes('data-classif-name="' + a.pairs[0].label + '"'),
  'a classificação no chaveamento também apresenta a dupla na mesma linha');

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

// Confra: Ouro e Prata são duas chaves independentes dentro da mesma categoria.
const confra = category('Confra', 8);
function lineGame(bracket, tierLabel, id, round, left, right, winner) {
  return { id:`Confra-${id}`, phaseIndex:1, category:'Confra', bracket, tierLabel, round,
    p1:left.label, p2:right.label, winner:winner && winner.label,
    scoreP1:6, scoreP2:4,
    team1Obj:{ participants:left.people.map(name => ({ name })) },
    team2Obj:{ participants:right.people.map(name => ({ name })) } };
}
function lineMatches(bracket, tierLabel, start) {
  const [a, b, c, d] = confra.pairs.slice(start, start + 4);
  return [lineGame(bracket, tierLabel, `${bracket}-s1`, 1, a, b, a),
    lineGame(bracket, tierLabel, `${bracket}-s2`, 1, c, d, c),
    lineGame(bracket, tierLabel, `${bracket}-final`, 2, a, c, a),
    lineGame(bracket, tierLabel, `${bracket}-third`, 2, b, d, b)];
}
const splitConfra = { ...t, id:'confra-ouro-prata', status:'finished', currentPhaseIndex:1,
  phases:[t.phases[0], { ...t.phases[1], grandFinal:false }],
  matches:confra.matches.filter(m => m.isMonarch).concat(
    lineMatches('gold', 'Ouro', 0), lineMatches('silver', 'Prata', 4),
    { ...lineGame('thirdplace', 'Ouro', 'ouro-terceiro', 3, confra.pairs[1], confra.pairs[3], confra.pairs[1]),
      line:'gold', isThirdPlace:true }) };
const confraSections = W._categoryFinalPlacements(splitConfra);
assert.deepEqual(Array.from(confraSections, section => section.line), ['gold', 'silver'],
  'Ouro e Prata viram seções distintas na ordem canônica');
assert.deepEqual(Array.from(confraSections, section => section.lineLabel), ['Ouro', 'Prata'],
  'cada linha preserva o nome oficial da chave');
assert(confraSections.every(section => section.total === 8 && section.entries.length === 8),
  'cada classificação conta somente os oito atletas da própria chave');
const ouroNames = new Set(confraSections[0].entries.map(entry => entry.name));
const prataNames = new Set(confraSections[1].entries.map(entry => entry.name));
assert([...ouroNames].every(name => !prataNames.has(name)), 'atletas da Prata não vazam para a classificação Ouro');
assert([...prataNames].every(name => !ouroNames.has(name)), 'atletas da Ouro não vazam para a classificação Prata');
assert(confraSections.every(section => section.matches.every(match => match.bracket !== 'thirdplace' || match.line === section.line)),
  'terceiro lugar não vira uma terceira linha independente');
const confraHtml = W._renderPodiumsAndClassif(splitConfra);
assert(confraHtml.includes('Confra · Ouro') && confraHtml.includes('Confra · Prata'),
  'a página encerrada mostra os dois títulos de linha');
const confraBracket = W._renderPhaseBracket(splitConfra, false, '');
assert(confraBracket.includes('Classificação · Confra · Ouro') &&
       confraBracket.includes('Classificação · Confra · Prata'),
  'o chaveamento preserva as duas classificações');
const pendingGrandFinal = { ...splitConfra,
  phases:[t.phases[0], { ...t.phases[1], grandFinal:true }],
  matches:splitConfra.matches.concat({ id:'confra-gf-pendente', phaseIndex:1, category:'Confra',
    bracket:'grandfinal', p1:'Ouro', p2:'Prata', winner:null }) };
assert.deepEqual(Array.from(W._categoryFinalPlacements(pendingGrandFinal), section => section.line), ['gold', 'silver'],
  'uma Grande Final pendente não apaga as classificações independentes');
const completedGrandFinal = { ...pendingGrandFinal,
  matches:pendingGrandFinal.matches.map(match => match.id === 'confra-gf-pendente'
    ? { ...match, winner:'p1' } : match) };
const convergedSections = W._categoryFinalPlacements(completedGrandFinal);
assert.equal(convergedSections.length, 1, 'a Grande Final concluída une a classificação da categoria');
assert.equal(convergedSections[0].line, null, 'após a convergência a seção deixa de representar uma linha');
console.log('✅ classificação completa por categoria e posições progressivas');

{
  W.ScoreplaceGroupAlternation=require('../js/domain/group-alternation');
  const field=category('Oito');
  for(const match of [field.semi1,field.semi2,field.final]) {
    match.winner=match.p1;match.scoreP1=6;match.scoreP2=0;
  }
  const noThird={...t,combinedCategories:['Oito'],titleAwards:[],phases:[t.phases[0],
    {...t.phases[1],thirdPlacePolicy:'optional_super8',thirdPlace:false}],matches:field.matches.filter(m=>m!==field.third)};
  let section=W._categoryFinalPlacements(noThird)[0];
  const loserNames=[...field.pairs[1].people,...field.pairs[3].people];
  assert(section.entries.filter(e=>loserNames.includes(e.name)).every(e=>e.pos===3),
    'empate integral na campanha classificatória não inventa um quarto colocado');
  noThird.matches.find(m=>m.id==='Oito-g3-0-2').scoreP1=8;
  section=W._categoryFinalPlacements(noThird)[0];
  assert(section.entries.filter(e=>field.pairs[3].people.includes(e.name)).every(e=>e.pos===3),
    'melhor saldo combinado da classificatória define o terceiro sem criar outro jogo');
  assert(section.entries.filter(e=>field.pairs[1].people.includes(e.name)).every(e=>e.pos===4),JSON.stringify(section.displayEntries));
  assert(!noThird.matches.some(m=>m.isThirdPlace));
  const double={...noThird,phases:[noThird.phases[0],{...noThird.phases[1],elimination:{bracketType:'double'}}]};
  const natural={...double,phases:[double.phases[0],{...double.phases[1],thirdPlacePolicy:undefined}]};
  assert.deepEqual(W._categoryFinalPlacements(double)[0].entries,W._categoryFinalPlacements(natural)[0].entries,
    'a ordem esportiva da dupla eliminatória continua derivada da chave inferior');

  console.log('✓ terceiro opcional: mérito combinado define 3º/4º e empate exato preserva empate');
}
