const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { planoDeMigracao } = require('../scripts/migrar-ranking-legado-para-liga-core');

let total = 0;
function ok(cond, msg) { total++; assert.ok(cond, msg); }

let p = planoDeMigracao({ rankingNewPlayerScore: 'zero', rankingInactivityX: 3, rankingOpenEnrollment: false });
ok(p.preencher.ligaNewPlayerScore === 'zero', 'copia pontuação legada quando liga está ausente');
ok(p.preencher.ligaInactivityX === 3, 'copia número legado quando liga está ausente');
ok(p.preencher.ligaOpenEnrollment === false, 'false é valor válido, não ausência');
ok(p.conflitos.length === 0, 'não cria conflito ao preencher campos ausentes');

p = planoDeMigracao({ rankingNewPlayerScore: 'avg', ligaNewPlayerScore: 'zero' });
ok(p.conflitos.length === 1, 'divergência entre contratos não é sobrescrita');
ok(Object.keys(p.preencher).length === 0, 'divergência não produz escrita');

p = planoDeMigracao({ rankingInactivity: 'keep', ligaInactivity: null });
ok(p.preencher.ligaInactivity === 'keep', 'null atual recebe a configuração legada');

p = planoDeMigracao({ rankingSeasonMonths: null });
ok(Object.keys(p.preencher).length === 0, 'nulo legado não inventa configuração nova');
ok(p.prontoParaAposentar, 'campo legado nulo não bloqueia futura retirada após o censo');

// Depois do corte nativo, o produto não pode reintroduzir o fallback. Os únicos
// lugares que conhecem esses nomes são o censo e o migrador acima.
const raiz = path.join(__dirname, '..');
[
  'js/views/create-tournament.js', 'js/views/tournaments-utils.js',
  'js/views/tournaments.js', 'js/views/dashboard.js', 'js/views/tournaments-organizer.js',
  'functions-autodraw/index.js', 'functions-autodraw/tournament-summary-core.js',
  'functions-autodraw/vendor/tournaments-utils.js', 'functions-autodraw/vendor/tournaments.js'
].forEach((arquivo) => {
  const fonte = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
  ok(!/ranking(NewPlayerScore|InactivityX|Inactivity|SeasonMonths|OpenEnrollment)/.test(fonte),
    arquivo + ' não relê nem regrava o contrato ranking*');
});

console.log('etapa8-ranking-legado-para-liga:', total, 'ok');
