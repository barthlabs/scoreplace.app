'use strict';
const fs=require('fs');let f=0;const ok=(v,s)=>{console.log((v?'✓ ':'✗ ')+s);if(!v)f++;};
const ui=fs.readFileSync('js/views/tournaments-enrollment-report.js','utf8');
const start=ui.indexOf('window._erSaveEdits = function');const end=ui.indexOf('// ─── Verificação letzplay',start);const part=ui.slice(start,end);
ok(part.includes("httpsCallable('applyEnrollmentAssignments'")&&!part.includes('saveTournament(t)')&&!part.includes("setParticipantsProfile"),'análise apenas despacha a intenção atômica; não grava snapshot nem perfil separadamente');
const fn=fs.readFileSync('functions-autodraw/index.js','utf8');const a=fn.indexOf('exports.applyEnrollmentAssignments');const b=fn.indexOf('\nexports.',a+8);const srv=fn.slice(a,b<0?fn.length:b);
ok(a>=0&&srv.includes('db.runTransaction')&&srv.includes('_isTournamentAdmin')&&srv.includes('_gravaTorneio'),'servidor autoriza, relê e grava as atribuições na transação canônica');
/* ⛔ INVERTIDO EM 23/set/2026. Este teste EXIGIA a escrita global de `skillBySport` — ou seja,
 * exigia o defeito: a categoria que o organizador digita ia parar no perfil GLOBAL de terceiro.
 * Decisão do dono: o que o organizador define vale DENTRO do torneio.
 * ⚠️ O GÊNERO continua sendo escrito, de propósito — hoje ele só "cola" no sorteio porque foi
 * empurrado ao perfil, e tirar isso exige migrar os 19 leitores de gênero (consolidação própria).
 * Sem afirmar isso aqui, um corte errado (tirar os dois) passaria no teste. */
ok(!srv.includes('skillBySport')&&!srv.includes('skillSetBy')&&!srv.includes('skillBySportSource'),
  '⛔ a categoria NÃO vai para o perfil global: nem o mapa, nem o carimbo, nem a marca de procedência');
/* ⛔ INVERTIDO DE NOVO, e agora até o fim: a escrita de GÊNERO no perfil também saiu (23/set).
 * Medido antes de tirar: 181 slots com uid na base, ZERO divergências entre o gênero do inscrito e
 * o do perfil — a escrita não sustentava nada. A decisão vale pelo `genderSource` no inscrito. */
ok(!srv.includes("collection('users')") && !srv.includes('genderSetBy'),
  '⛔ a porta NÃO escreve em perfil de terceiro: nem categoria, nem gênero, nem carimbo');
ok(srv.includes("target.genderSource='organizador'"),
  '⭐ e a decisão de gênero fica no INSCRITO, marcada com a procedência');
ok(srv.includes('uncategorizedByOrganizer')&&srv.includes("target.categorySource='organizador'")&&srv.includes('target.wasUncategorized=true'),'remoção administrativa preserva no servidor a marca de inscrito sem categoria');
ok(srv.includes('markWasUncategorized')&&srv.includes('notifyCategory')&&srv.includes('categoryNotifications')&&srv.includes('slice(-200)'),'atribuição direta preserva marca e limita o histórico de aviso na mesma transação');
ok(fn.includes('exports.mergeTournamentCategories')&&fn.includes('_categoryMutationsCore.merge')&&fn.includes('_isTournamentAdmin'),'mesclagem relê e aplica o núcleo no servidor autorizado');
ok(fn.includes('exports.normalizeTournamentCategories')&&fn.includes('_categoryMutationsCore.normalize')&&fn.includes('_isTournamentAdmin'),'normalização de categorias relê e grava somente na transação autorizada');
ok(fn.includes('exports.autoAssignTournamentCategories')&&fn.includes('_categoryMutationsCore.autoAssign')&&fn.includes("collection('users')"),'autoenquadramento lê perfil e grava a categoria somente na transação canônica');
ok(fn.includes('exports.applyCategoryCommunicationMarkers')&&fn.includes('_isTournamentAdmin')&&fn.includes('categoryCommPending'),'marcadores de comunicação são persistidos na transação autorizada');
ok(!part.includes('.finally(function(){')&&part.includes('window._erUpdateSaveBar();'),'falha da CF preserva alterações staged para nova tentativa, sem recarga');
process.exit(f?1:0);
