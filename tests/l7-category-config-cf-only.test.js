'use strict';
const fs=require('fs');let f=0;const ok=(v,s)=>{console.log((v?'✓ ':'✗ ')+s);if(!v)f++;};
const fn=fs.readFileSync('functions-autodraw/index.js','utf8'); const start=fn.indexOf('exports.setTournamentCategoryConfig'); const end=fn.indexOf('exports.setTournamentBranding',start); const part=fn.slice(start,end);
ok(start>=0&&part.includes('db.runTransaction')&&part.includes('_isTournamentAdmin')&&part.includes('combinedCategories'),'configuração de categorias é validada e gravada em transação pela Function');
const ui=fs.readFileSync('js/views/tournaments-enrollment-report.js','utf8');const a=ui.slice(ui.indexOf('function _erCommitCats'),ui.indexOf('window._erToggleGender',ui.indexOf('function _erCommitCats')));
ok(a.includes("_callCF('setTournamentCategoryConfig'")&&!a.includes('saveTournament(t)'),'matriz de categorias não salva a ficha inteira no navegador');
process.exit(f?1:0);
