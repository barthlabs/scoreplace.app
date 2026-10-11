'use strict';

const assert = require('assert');
global.window = { _warn: function () {} };
require('../js/views/format2.js');

let pass = 0;
function ok(value, message) { assert.ok(value, message); pass++; console.log('  ✓ ' + message); }

const legacySwiss = {
  format: 'Suíço Clássico', teamSize: 2, swissRounds: 4,
  classifyFormat: 'swiss', currentStage: 'swiss',
  p2Resolution: 'swiss', p2TargetCount: 8
};
const cfg = window.FORMAT2.configFromTournament(legacySwiss, 'Beach Tennis');
ok(cfg.classifAtiva === true, 'Suíço legado abre como classificatória');
ok(cfg.grupos === 1 && cfg.rodadas.modo === 'fixo' && cfg.rodadas.n === 4, 'preserva as quatro rodadas históricas');
ok(cfg.classificationPairing.strategy === 'ranking_clusters', 'pareamento vira clusters canônicos');
ok(cfg.eliminatoria.ativa === true && cfg.classificados === 8, 'preserva o corte legado para a eliminatória');

const legacyElim = { format: 'Eliminatórias Simples', teamSize: 1 };
const elimCfg = window.FORMAT2.configFromTournament(legacyElim, 'Tênis');
ok(elimCfg.classifAtiva === false && elimCfg.eliminatoria.ativa === true, 'eliminação direta legada não ganha classificatória inventada');

console.log('✓ format2-legacy-config: ' + pass + ' passaram');
