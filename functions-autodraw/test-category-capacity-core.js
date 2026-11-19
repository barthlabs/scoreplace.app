'use strict';
const { validateCapacityConfig } = require('./category-capacity-core');
const fs = require('fs');
const path = require('path');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
let failures = 0;
function check(name, fn, shouldReject) {
  let rejected = false;
  try { fn(); } catch (e) { rejected = e instanceof HttpsError && e.code === 'invalid-argument'; }
  const good = rejected === !!shouldReject;
  console.log((good ? '✓ ' : '✗ ') + name);
  if (!good) failures++;
}
const base = { combinedCategories: ['Fem Light', 'Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'],
  maxParticipantsPerCategory: 16, maxParticipants: 96, maxParticipantsByCategory: {} };
check('capacidade uniforme 6 × 16 = 96', () => validateCapacityConfig(base, HttpsError), false);
const custom = Object.assign({}, base, { maxParticipants: 128, maxParticipantsByCategory: {
  'Fem Light': 32, 'Fem Power': 16, 'Fem Extreme': 16, 'Masc Light': 32, 'Masc Power': 16, 'Masc Extreme': 16
} });
check('capacidade personalizada soma 128', () => validateCapacityConfig(custom, HttpsError), false);
check('campo excludedCategories ausente continua compatível com torneios anteriores', () => validateCapacityConfig(base, HttpsError), false);
check('exclusão parcial calcula capacidade somente das categorias ativas', () => validateCapacityConfig({
  combinedCategories:['Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'], excludedCategories:['Fem Light'],
  maxParticipantsPerCategory:16, maxParticipants:80, maxParticipantsByCategory:{}
}, HttpsError), false);
check('lista de exclusões vazia equivale ao contrato antigo', () => validateCapacityConfig(Object.assign({}, base, { excludedCategories:[] }), HttpsError), false);
check('rejeita exclusões duplicadas por normalização', () => validateCapacityConfig(Object.assign({}, base, { excludedCategories:['Fem Light',' fem light '] }), HttpsError), true);
check('rejeita categoria ao mesmo tempo ativa e excluída', () => validateCapacityConfig(Object.assign({}, base, { excludedCategories:['Fem Light'] }), HttpsError), true);
check('rejeita todas as categorias sem vagas', () => validateCapacityConfig({
  combinedCategories:[], excludedCategories:base.combinedCategories, maxParticipantsPerCategory:null,
  maxParticipants:null, maxParticipantsByCategory:{}
}, HttpsError), true);
const mapOnly = Object.assign({}, custom, { maxParticipantsPerCategory: null });
check('mapa completo dispensa vagas gerais', () => validateCapacityConfig(mapOnly, HttpsError), false);
check('mapa completo sem geral ainda exige total correto', () => validateCapacityConfig(Object.assign({}, mapOnly, { maxParticipants: 127 }), HttpsError), true);
check('mapa parcial sem geral é recusado', () => validateCapacityConfig(Object.assign({}, mapOnly, {
  maxParticipantsByCategory: { 'Fem Light': 32 }
}), HttpsError), true);
check('sem categorias de capacidade não inventa limite', () => validateCapacityConfig(Object.assign({}, base, {
  maxParticipantsPerCategory: null, maxParticipantsByCategory: {}, maxParticipants: null
}), HttpsError), false);
check('modo sorteio aceita capacidade personalizada sem total de inscrições', () => validateCapacityConfig(Object.assign({}, mapOnly, {
  maxParticipants: null, enrollmentLimitMode: 'draw'
}), HttpsError), false);
for (const bad of [-5, 0, 0.5, 'abc']) {
  check('rejeita valor inválido ' + bad, () => validateCapacityConfig(Object.assign({}, custom, {
    maxParticipantsByCategory: Object.assign({}, custom.maxParticipantsByCategory, { 'Fem Light': bad })
  }), HttpsError), true);
}
check('rejeita categoria inexistente', () => validateCapacityConfig(Object.assign({}, custom, {
  maxParticipantsByCategory: Object.assign({}, custom.maxParticipantsByCategory, { X: 10 })
}), HttpsError), true);
check('rejeita total divergente', () => validateCapacityConfig(Object.assign({}, custom, { maxParticipants: 127 }), HttpsError), true);
check('edição não relacionada preserva documento antigo inconsistente', () => validateCapacityConfig({ name: 'Novo nome', maxParticipantsByCategory: {} }, HttpsError,
  Object.assign({}, base, { maxParticipants: 128 })), false);
check('edição não relacionada preserva 128 mesmo com categorias reordenadas', () => validateCapacityConfig({
  name:'Novo nome', combinedCategories:base.combinedCategories.slice().reverse(), maxParticipantsByCategory:{}
}, HttpsError, Object.assign({}, base, { maxParticipants:128 })), false);
const index = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const create = fs.readFileSync(path.join(__dirname, 'tournament-create.js'), 'utf8');
const createWired = /if \(validateCapacity\) validateCapacity\(config\)/.test(create) && /validateCapacity: config =>/.test(index);
const updateWired = /validateCapacityConfig\(patch, HttpsError, t\)/.test(index);
console.log((createWired ? '✓ ' : '✗ ') + 'porta createTournament invoca validação');
console.log((updateWired ? '✓ ' : '✗ ') + 'porta updateTournamentConfiguration invoca validação');
if (!createWired) failures++;
if (!updateWired) failures++;
process.exit(failures ? 1 : 0);
