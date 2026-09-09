/* Prazo da rodada eliminatória é a janela configurada, não o ritmo dos placares.
 * Reproduz a Confra: fase 1 consumiu R1; a primeira coluna eliminatória é R2,
 * começa em 02/09 e deve contar até 20/09 às 23:00. */
'use strict';
const fs = require('fs');
const path = require('path');
const { window: W, load } = require('./headless');
load('tournaments-utils.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
console.log('──── prazo configurado da rodada eliminatória ────');
const now = Date.now();
const start = now - 2 * 86400000;
const end = now + 9 * 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const t = {
 id:'prazo-r2', status:'active', multiPhase:true, currentPhaseIndex:1,
 phases:[{rounds:1}, {rounds:5, startDate:iso(start), startTime:'00:00', endDate:iso(end), endTime:'23:00'}],
 rounds:[{matches:[{winner:'x'}]}], participants:[{uid:'u'}],
 matches:[
  {phaseIndex:1,round:1,p1:'A',p2:'B',winner:'A',resultAt:start + 3600000},
  {phaseIndex:1,round:1,p1:'C',p2:'D',winner:null}
 ]
};
const html = W._buildProgressInner(t);
const pr = W._phaseCurrentRoundProgress(t);
const win = W._phaseRoundWindow(W._inicioDaFase(t,1), W._fimDaFase(t,1), pr.roundNum, pr.roundsTotal);
ok(pr.roundNum === 1 && pr.roundNumGlobal === 2, 'a primeira coluna da eliminatória é exibida como R2, mas agenda localmente como R1');
const cd = /data-sp-cd2l="(\d+)"/.exec(html);
ok(!!cd && +cd[1] === win.endMs, 'a regressiva termina no prazo configurado da R2');
ok(html.indexOf('Rodada 2') >= 0, 'o cabeçalho conserva o nome global correto');
ok(html.indexOf('final<br>estimado') >= 0, 'o cartão preserva o rótulo de previsão');
// O cartão precisa ancorar a coluna superior na janela, e não no primeiro placar.
ok(html.indexOf('início<br>real') >= 0 && html.indexOf(String(new Date(win.startMs).getDate()).padStart(2, '0') + '/') >= 0,
  'a coluna superior inclui o início configurado da rodada');
const fmt = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'format2-ui.js'), 'utf8');
ok(fmt.indexOf('Prazo de cada rodada — duração, data e horário') >= 0, 'o ajuste sempre lista prazo e duração de todas as rodadas, mesmo nas faixas estreitas');
ok(fmt.indexOf('window._f2ElimRoundEndTime') >= 0 && fmt.indexOf('window._numeroGlobalDaRodada') >= 0, 'cada prazo expõe horário editável e o número global/nome da chave');
console.log(fail ? '\n❌ prazo-da-rodada-eliminatoria: ' + fail + ' falha(s)' : '\n✅ prazo-da-rodada-eliminatoria: OK (' + pass + ')');
process.exit(fail ? 1 : 0);
