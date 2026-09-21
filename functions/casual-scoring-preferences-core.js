'use strict';

const SPORTS = new Set([
  'Beach Tennis', 'Pickleball', 'Tênis', 'Tênis de Mesa', 'Padel',
  'Vôlei de Praia', 'Futevôlei',
]);
const MUTABLE_KEYS = new Set(['setsToWin', 'gamesPerSet', 'countingType']);
// Objetos legados incluíam regras derivadas da modalidade. Eles são aceitos
// apenas para migração e descartados; nunca voltam a ser persistidos.
const LEGACY_DERIVED_KEYS = new Set([
  'type', 'tiebreakEnabled', 'tiebreakPoints', 'tiebreakMargin',
  'superTiebreak', 'superTiebreakPoints', 'deuceRule',
  'twoPointAdvantage', 'tieRule', 'advantageRule',
]);
const ALL_INPUT_KEYS = new Set([...MUTABLE_KEYS, ...LEGACY_DERIVED_KEYS]);

function normalize(preferences) {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    throw new Error('preferências casuais inválidas');
  }
  const sports = Object.keys(preferences);
  if (!sports.length || sports.some((sport) => !SPORTS.has(sport))) {
    throw new Error('modalidade casual inválida');
  }
  const out = {};
  for (const sport of sports) {
    const input = preferences[sport];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('configuração casual inválida');
    }
    const keys = Object.keys(input);
    if (!keys.length || keys.some((key) => !ALL_INPUT_KEYS.has(key))) {
      throw new Error('campo de configuração casual não permitido');
    }
    const config = {};
    if (Object.prototype.hasOwnProperty.call(input, 'setsToWin')) {
      if (![1, 2, 3].includes(input.setsToWin)) throw new Error('sets para vencer inválido');
      config.setsToWin = input.setsToWin;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'gamesPerSet')) {
      if (![4, 6, 8, 11].includes(input.gamesPerSet)) throw new Error('jogos por set inválido');
      config.gamesPerSet = input.gamesPerSet;
    }
    if (Object.prototype.hasOwnProperty.call(input, 'countingType')) {
      if (input.countingType !== 'tennis' && input.countingType !== 'numeric') {
        throw new Error('tipo de contagem inválido');
      }
      config.countingType = input.countingType;
    }
    // Pelo menos um ajuste do usuário precisa existir; campos derivados não são
    // uma configuração independente e não devem criar entrada vazia no perfil.
    if (!Object.keys(config).length) throw new Error('configuração casual sem ajuste permitido');
    out[sport] = config;
  }
  return out;
}

module.exports = { SPORTS, normalize };
