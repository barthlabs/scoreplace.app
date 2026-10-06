'use strict';
/* Regressão: Inscritos usa a categoria COMPLETA do torneio e a mesma seleção
 * recorta os cards de presença e os jogos operacionais. Não confundir Fem
 * Light com Masc Light, nem separar "Light" como se fosse a categoria. */
const fs = require('fs');
const path = require('path');
const participants = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'participants.js'), 'utf8');
const bracket = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  if (condition) console.log('  ✓ ' + message);
  else { console.error('  ✗ ' + message); fail++; }
}

ok(participants.includes('window._getTournamentCategories(t)') && participants.includes('_canonicalParticipantCategory'),
  'as abas usam a lista canônica de categorias completas do torneio');
ok(participants.includes("id=\"part-category\"") && participants.includes("data-part-category"),
  'a categoria ativa filtra cada card de presença por atributo próprio');
ok(participants.includes("window._renderReadyMatchesBanner(t, { category: _activeParticipantCategory })"),
  'a mesma aba é entregue à lista de jogos prontos e parciais');
ok(participants.indexOf('${_filterBarCtrls}') < participants.indexOf('${readyBannerHtml}'),
  'a presença é desenhada antes dos jogos prontos e de presença parcial');
ok(bracket.includes('const _normCategory = function (value) { return String(value || \'\').trim().toLocaleLowerCase(); };') && bracket.includes('if (!_matchHasCategory(m)) return;'),
  'o recorte de jogos normaliza espaços e caixa antes de comparar a categoria');
ok(bracket.includes('match.category || match.categoryName || match.division || match.skillCategory') && bracket.includes('(t.participants || []).some'),
  'jogos antigos sem categoria própria resolvem a categoria pelos participantes');

console.log('\n' + (fail ? '❌' : '✅') + ' inscritos-abas-categoria: ' + (6 - fail) + ' ok, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;
