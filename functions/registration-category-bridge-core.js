'use strict';

/*
 * Ponte única entre o rótulo que existia no elenco legado e o identificador
 * tipado da categoria. Ela só participa da migração, uma vez, dentro da
 * transação da Function. Depois disso o restante do sistema recebe apenas
 * `categoryId`; rótulos nunca voltam a ser usados como identidade.
 */

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function normalizedLabel(value) { return text(value).normalize('NFKC').toLocaleLowerCase('pt-BR'); }

function categoryBridge(definitions) {
  if (!Array.isArray(definitions) || !definitions.length) {
    throw new Error('a migração exige definições tipadas de categoria');
  }
  const byLegacyLabel = new Map();
  definitions.forEach((definition) => {
    const id = text(definition && definition.id);
    const label = normalizedLabel(definition && definition.label);
    if (!id || !label) throw new Error('definição tipada de categoria inválida');
    if (byLegacyLabel.has(label)) {
      throw new Error('rótulo de categoria ambíguo; corrija as definições antes da migração');
    }
    byLegacyLabel.set(label, id);
  });
  return function categoryIdForLegacyLabel(legacyLabel) {
    const id = byLegacyLabel.get(normalizedLabel(legacyLabel));
    if (!id) throw new Error('categoria legada sem definição tipada correspondente');
    return id;
  };
}

module.exports = { categoryBridge };
