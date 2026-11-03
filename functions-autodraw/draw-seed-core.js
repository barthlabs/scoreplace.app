'use strict';

// Um sorteio publicado grava a semente. O contexto é síncrono: o motor de
// sorteio não aguarda I/O, então nenhum outro callback JS executa enquanto
// Math.random aponta para esta sequência. try/finally restaura a função global
// mesmo se o motor recusar a configuração.
function generator(seed) {
  const text = String(seed || '');
  if (!text) throw new Error('semente de sorteio ausente');
  let state = 2166136261;
  for (let i = 0; i < text.length; i++) {
    state ^= text.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  if (!state) state = 0x9e3779b9;
  return function random() {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function withSeed(seed, run) {
  if (typeof run !== 'function') throw new Error('operação de sorteio ausente');
  const previous = Math.random;
  Math.random = generator(seed);
  try {
    const result = run();
    if (result && typeof result.then === 'function') throw new Error('sorteio assíncrono não pode usar contexto síncrono');
    return result;
  } finally {
    Math.random = previous;
  }
}

module.exports = { generator, withSeed };
