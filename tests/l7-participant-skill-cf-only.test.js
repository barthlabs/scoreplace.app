'use strict';
const fs=require('fs');let f=0;const ok=(v,s)=>{console.log((v?'✓ ':'✗ ')+s);if(!v)f++;};
const ui=fs.readFileSync('js/views/participants.js','utf8');
const start=ui.indexOf('window._setParticipantSkillCategory');
const end=ui.indexOf('// ═══════════════════════════════════════════════════════════════════════════',start);
const part=ui.slice(start,end);
ok(start>=0&&part.includes("_callCF('applyEnrollmentAssignments'")&&!part.includes('AppStore.mutate')&&!part.includes('saveTournament'),'card de nível só despacha a intenção de atribuição; não grava o torneio no navegador');
ok(part.includes('tournamentId: String(tId)')&&part.includes('sport: String(t.sport || t.sportType ||')&&part.includes('category: newCategory'),'payload limita-se ao torneio, esporte, identidade e categoria calculada');
process.exit(f?1:0);
