'use strict';
const assert = require('node:assert/strict');
const { window:W, load } = require('./headless');
load('bracket-logic.js');
const categories = ['Categoria A','Categoria B'];
const athletes = Object.fromEntries(categories.map(cat => [cat,
  Array.from({length:24}, (_,i) => cat + ' Atleta ' + (i+1))]));
const official = Object.fromEntries(categories.map(cat => [cat,
  Array.from({length:6}, (_,i) => athletes[cat].slice(i*4,i*4+4).reverse())]));
const t = { id:'cult-new-tournament', name:'Cult', format:'Fase de Grupos + Eliminatórias',
  participants:categories.flatMap(cat => athletes[cat].map(name => ({name,displayName:name,category:cat}))),
  officialGroupsByCategory:official, rounds:[], matches:[], equilibrado:false };
W._computeStandings = (_t, cat) => athletes[cat].map(name => ({name}));
for (const cat of categories) W._generateReiRainhaRoundForPlayers(t, cat, 1, {ts:1,rnd:() => .5});
const groups = t.rounds.flatMap(round => round.monarchGroups || []);
assert.equal(groups.length, 12, '48 atletas em 2 categorias formam 12 grupos');
for (const cat of categories) {
  const drawn = groups.filter(group => group.matches[0].category === cat);
  assert.equal(drawn.length, 6);
  assert.deepEqual(drawn.map(group => Array.from(group.players || [])), official[cat],
    'a ordem oficial é aplicada pelo formato, sem ID específico do Camis');
}
const invalid = { ...t, rounds:[], matches:[], officialGroupsByCategory:{ ...official,
  'Categoria A':official['Categoria A'].slice(1) } };
assert.throws(() => W._generateReiRainhaRoundForPlayers(invalid, 'Categoria A', 1, {ts:1,rnd:() => .5}),
  /officialGroupsByCategory do torneio cult-new-tournament.*divergem das inscrições/,
  'um elenco oficial divergente é bloqueado com a origem do erro');
console.log('✓ Rei/Rainha reutiliza grupos oficiais em torneio de 48 atletas e 2 categorias');
