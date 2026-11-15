'use strict';

// Fonte única do índice de vagas manuais. O autoDraw recebe uma cópia exata
// pelo copy-vendor; ambos os codebases consultam e gravam a mesma chave.
function nameKey(value) {
  const key = String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return key.split(' ').filter(Boolean).length >= 2 ? key : '';
}

module.exports = { nameKey };
