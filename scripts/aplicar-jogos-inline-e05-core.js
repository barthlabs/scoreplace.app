'use strict';

// Contrato do lote fechado; a rede e as transações ficam no CLI administrativo.
const preview = require('./planejar-jogos-inline-e05-core.js');
const split = require('../js/views/tournament-split-core.js');

function insist(ok, why) { if (!ok) throw new Error('[E05] ' + why); }
function same(a, b) { return preview.same(a, b); }

function validateManifest(manifest) {
  insist(manifest && manifest.schema === 'scoreplace/e05-inline-preview/1' &&
    manifest.project === 'scoreplace-app' && manifest.applicable === false &&
    Array.isArray(manifest.targets) && manifest.targets.length === 3,
  'manifesto inválido');
  const copy = { ...manifest };
  delete copy.digest;
  insist(preview.hash(copy) === manifest.digest, 'digest do manifesto inválido');
  let count = 0;
  for (let i = 0; i < preview.TARGETS.length; i++) {
    const target = preview.TARGETS[i];
    const entry = manifest.targets[i];
    insist(entry && entry.name === target.name && Array.isArray(entry.entries) &&
      entry.entries.length === target.count && entry.root &&
      /^tournaments\/[^/]+$/.test(entry.root.path) &&
      Number.isSafeInteger(entry.existingMatches), 'alvo ou contagem fora do lote');
    const ids = new Set();
    for (const game of entry.entries) {
      insist(game && typeof game.id === 'string' && game.id && !game.id.includes('/') &&
        !ids.has(game.id) && game.destination === entry.root.path + '/matches/' + game.id &&
        game.loc && game.loc.tipo === target.kind && game.gameHash === preview.hash(game.game),
      'jogo fora do lote');
      ids.add(game.id);
      count++;
    }
  }
  insist(count === 14, 'total fora do lote');
  return manifest.digest;
}

function proposed(root, target, entry) {
  insist(root && preview.hash(root) === entry.root.hash, 'raiz diferente da prévia');
  insist(root._inlineGamesExternalized !== true, 'raiz já migrada');
  const inline = preview.inlineGames(root, target.kind);
  insist(inline.length === target.count, 'quantidade inline alterada');
  const splitRoot = split.dividir(root, ['matches'], { migracaoAdministrativa: true });
  insist(splitRoot, 'divisão inválida');
  const selected = splitRoot.matches.filter(record => record._loc.tipo === target.kind);
  insist(selected.length === target.count, 'extração incompleta');
  const byId = new Map(selected.map(record => [record._chave, record]));
  insist(byId.size === target.count, 'chave física duplicada');
  for (const item of entry.entries) {
    const found = byId.get(item.id);
    insist(found && same(found._loc, item.loc) && same(found.jogo, item.game) &&
      found._chave === item.id, 'jogo ou posição alterado');
  }
  const newCount = entry.existingMatches + target.count;
  const patch = {
    _inlineGamesExternalized: true,
    _nPartes: { ...(root._nPartes || {}), matches: newCount },
    _nJogos: newCount
  };
  if (target.kind === 'groupRounds') patch.groups = splitRoot.config.groups;
  else patch.thirdPlaceMatch = null; // CLI converte para FieldValue.delete().
  return { records: selected, patch };
}

function validateApplied(root, physicalById, target, entry) {
  insist(root && root._inlineGamesExternalized === true, 'marcador da migração ausente');
  insist(preview.inlineGames(root, target.kind).length === 0, 'jogos ainda embutidos');
  insist(root._nPartes && root._nPartes.matches === entry.existingMatches + target.count &&
    root._nJogos === entry.existingMatches + target.count, 'contagem física divergente');
  const records = [];
  for (const item of entry.entries) {
    const record = physicalById.get(item.id);
    insist(record && record._chave === item.id && same(record._loc, item.loc) &&
      same(record.jogo, item.game), 'destino físico divergente');
    records.push(record);
  }
  const mounted = split.remontar({ config: root, matches: records });
  insist(mounted && preview.inlineGames(mounted, target.kind).length === target.count,
    'jogos não remontáveis');
  return true;
}

module.exports = { validateManifest, proposed, validateApplied };
