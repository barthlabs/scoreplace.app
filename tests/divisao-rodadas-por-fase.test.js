/* Regressão: a régua de uma fase nunca pode usar as rodadas ou o prazo da outra.
 * Caso real: Confra com R1 classificatória encerrada e seis rodadas eliminatórias. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
const W = sandbox;
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'format2.js'), 'utf8'), W, { filename: 'format2.js' });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── divisão das rodadas pertence à fase certa ────');

const cfg = W.FORMAT2.normalize({
  disputa: 'dupla', grupos: 1, parceria: 'rei_rainha', classifAtiva: true,
  rodadas: { modo: 'fixo', n: 1 },
  eliminatoria: { ativa: true, linhas: 2, endDate: '2026-11-12', endTime: '23:00',
    roundBounds: ['2026-08-20T00:00', '2026-09-05T00:00', '2026-09-22T00:00', '2026-10-08T00:00', '2026-10-26T00:00'] }
}, 'Beach Tennis');
const out = W.FORMAT2.compileToPhases(cfg, { sport: 'Beach Tennis' });
ok(out.phases[0].rounds === 1, '① classificatória mantém somente R1');
const elim = out.phases[out.phases.length - 1];
ok(elim.roundBounds.length === 5, '② limites da eliminatória atravessam o compilador');
ok(elim.endDate === '2026-11-12', '③ prazo da eliminatória atravessa o compilador');
ok(!out.phases[0].roundBounds, '④ limites da eliminatória não vazam para a classificatória');

const ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'create-tournament.js'), 'utf8');
ok(/var fi = 0;[\s\S]{0,300}_rodadasVisiveisDaFase\(t, fi\)/.test(ui),
  '⑤ controle da classificatória lê a fase 0, mesmo com currentPhaseIndex=1');
ok(!/var fi = \(t0 && t0\.currentPhaseIndex\)/.test(ui),
  '⑥ salvar a classificatória não reaproveita o índice da fase em execução');
ok(/_elimBounds[\s\S]{0,450}tourData\.phases\[tourData\.phases\.length - 1\]\.roundBounds/.test(ui),
  '⑦ salvar preserva limites próprios da eliminatória após recompilar phases[]');

const f2ui = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'format2-ui.js'), 'utf8');
ok(/var started = \(S\.t\.phaseStartedAt \|\| \{\}\)\[String\(i\)\] \|\| '';/.test(f2ui) && /f2-elim-round-bounds-box/.test(f2ui),
  '⑧ controle eliminatório usa exclusivamente o início carimbado no avanço');
ok(/n < 2 \|\| !win\) \{ box\.style\.display = 'none'; return; \}/.test(f2ui),
  '⑨ uma fase de rodada única não mostra controle de divisão');
ok(/_elimRoundCount[\s\S]{0,600}_rodadasVisiveisDaFase/.test(f2ui),
  '⑩ eliminatória materializada usa suas rodadas reais');
ok(/\['R2', 'R3', 'OF', 'QF', 'SF', 'F'\]/.test(f2ui),
  '⑪ eliminatória de seis etapas recebe os rótulos R2, R3, OF, QF, SF e F');
/* ⛔ RECORTE POR ÂNCORA, NUNCA POR TAMANHO FIXO: este teste media 500 caracteres a partir
 * de `deadlineHtml` e quebrou sozinho quando o bloco ganhou um comentário — sem que nada do
 * comportamento mudasse. O que importa é que o editor de hora viva DENTRO do deadlineHtml e
 * chame `_f2ElimRoundEndTime`; é isso que se afirma agora, no bloco inteiro e só nele. */
const _dhIni = f2ui.indexOf('      deadlineHtml: function (ms, idx) {');
const _dhFim = f2ui.indexOf('\n      },', _dhIni);
const _dh = (_dhIni > 0 && _dhFim > _dhIni) ? f2ui.slice(_dhIni, _dhFim) : '';
ok(_dh && /_f2ElimRoundEndTime/.test(_dh) && /<input type="time"/.test(_dh),
  '⑫ o horário editável nasce sob o respectivo divisor da régua');
ok(!/_elimRoundDeadlineTimesHtml/.test(f2ui),
  '⑬ não há uma segunda lista de campos grandes de horário abaixo da régua');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
