'use strict';

// Contrato de persistência, separado da lista visual do cliente. O servidor
// só aceita modalidades para as quais há regra canônica de placar.
const SPORTS = new Set([
  'Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel',
  'Vôlei de Praia', 'Futevôlei',
]);

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('última configuração casual inválida');
  }
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes('sport') || !keys.includes('isDoubles')) {
    throw new Error('campos da última configuração casual inválidos');
  }
  if (typeof input.sport !== 'string' || !SPORTS.has(input.sport)) {
    throw new Error('modalidade casual inválida');
  }
  if (typeof input.isDoubles !== 'boolean') {
    throw new Error('tipo de equipe casual inválido');
  }
  return { sport: input.sport, isDoubles: input.isDoubles };
}

module.exports = { SPORTS, normalize };
