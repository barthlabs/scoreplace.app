'use strict';
/* Datas e logo do local são um bloco único no detalhe. A regressiva já
 * informa o início: o card da dashboard não pode repetir "Começa em X dias". */
const fs = require('fs');
const vm = require('node:vm');
const detail = fs.readFileSync('js/views/tournaments.js', 'utf8');
const dashboard = fs.readFileSync('js/views/dashboard.js', 'utf8');
const editor = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const DateCard = require('../js/views/tournament-date-card.js');
const dateColors = require('../functions-autodraw/date-card-colors-core.js');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
const datesAt = detail.indexOf('Datas e logo do local formam um único bloco');
const countdownAt = detail.indexOf('Evento concentrado: a janela publicada manda no relógio');
const titleAt = detail.indexOf('Middle Left: Nome + Logo + Favorito');
const detailSlotAt = detail.indexOf('data-vlogo-pid', datesAt);
ok(datesAt >= 0 && detailSlotAt > datesAt && detailSlotAt < countdownAt, 'logo do local fica ao lado das datas no detalhe');
ok(detail.indexOf('sp-tournament-date-stack', titleAt) > titleAt && detail.indexOf('sp-tournament-date-stack', titleAt) < datesAt, 'logo do local acompanha a data sem ocupar o título');
const dashboardDatesAt = dashboard.indexOf('Datas e logo do local. A regressiva logo abaixo');
const dashboardCountdownAt = dashboard.indexOf('if (isFinished) return \'\';', dashboardDatesAt);
const dashboardDateBlock = dashboard.slice(dashboardDatesAt, dashboardCountdownAt);
ok(!/tournament\\.starts(In|Today|Tomorrow)/.test(dashboardDateBlock), 'dashboard não duplica a regressiva com “Começa em”');
const cases = [
  ['2026-11-29T08:00', '2026-11-29T16:00', 'one-day', ['29', 'NOV', '08:00 — 16:00']],
  ['2026-11-06T08:00', '2026-11-08T18:00', 'same-month', ['6', '>a<', '8', 'NOV', '08:00 — 18:00']],
  ['2026-10-30T09:00', '2026-11-02T18:00', 'cross-month', ['30', 'OUT', '2', 'NOV', '09:00 — 18:00']],
  ['2026-11-29T08:00', '', 'start-only', ['29', 'NOV', '08:00']]
];
cases.forEach(([start, end, kind, fragments]) => {
  const html = DateCard.render(start, end);
  ok(html.includes('sp-date-card--' + kind) && fragments.every(s => html.includes(s)) && !html.includes('Período do torneio'), kind + ' usa um único bloco com o conteúdo aprovado');
});
ok(DateCard.model('2026-11-29T08:00', '2026-11-29').kind === 'start-only', 'sem hora final não inventa término');
ok(!DateCard.render('2026-11-29', '2026-11-29') && !DateCard.render('2026-12-30T08:00', '2027-01-02T18:00'), 'sem hora e entre anos mantêm exibição anterior');
const custom = { background:'#123456', text:'#abcdef', day:'#112233', month:'#fedcba', time:'#010203' };
const customHtml = DateCard.render('2026-11-06T08:00', '2026-11-08T18:00', custom);
ok(Object.entries(custom).every(([key, color]) => customHtml.includes('--sp-date-' + (key === 'background' ? 'bg' : key) + ':' + color)), 'as cinco cores personalizadas aparecem no bloco');
ok(dateColors.validate(custom) === custom, 'servidor aceita as cinco cores legadas');
const typography = { daySize:115, dayWeight:600, monthSize:105, monthWeight:800, timeSize:90, timeWeight:500 };
const withTypography = { ...custom, typography };
ok(dateColors.validate(withTypography) === withTypography, 'servidor aceita cores e seis ajustes tipográficos');
ok(DateCard.validate(withTypography) === withTypography, 'cliente aceita o mesmo contrato do servidor');
const customTypeHtml = DateCard.render('2026-11-29T08:00', '2026-11-29T16:00', withTypography);
ok(customTypeHtml.includes('--sp-date-day-scale:1.15') && customTypeHtml.includes('--sp-date-month-weight:800') &&
  customTypeHtml.includes('sp-date-card--custom-typography'), 'cartão aplica tamanho e peso escolhidos');
ok(!DateCard.render('2026-11-29T08:00', '2026-11-29T16:00', custom).includes('--sp-date-day-scale'),
  'cartão legado conserva as regras CSS existentes');
ok(dateColors.mergeLegacyTypography(custom, withTypography).typography.monthSize === 105,
  'cliente antigo muda cores sem apagar tipografia do documento');
ok(dateColors.mergeLegacyTypography(withTypography, custom).typography.daySize === 115,
  'cliente novo grava a tipografia enviada');
try { dateColors.validate({ ...custom, typography: { ...typography, daySize:135 } }); ok(false, 'servidor recusa tamanho fora do limite'); }
catch (error) { ok(/tipografia/.test(error.message), 'servidor recusa tamanho fora do limite'); }
try { dateColors.mergeLegacyTypography({ ...custom, typography: { ...typography, monthWeight:900 } }, withTypography); ok(false, 'servidor recusa peso inválido mesmo com valor salvo'); }
catch (error) { ok(/tipografia/.test(error.message), 'servidor não preserva peso salvo para mascarar patch inválido'); }
try { dateColors.validate({ ...custom, month:'red' }); ok(false, 'servidor recusa cor inválida'); }
catch (error) { ok(/cores e tipografia válidas/.test(error.message), 'servidor recusa cor inválida'); }
const noDateScript = { window: {}, document: { getElementById: () => null } };
vm.runInNewContext(editor.slice(0, editor.indexOf('// ── Controle canônico')), noDateScript);
ok(noDateScript.window._readTournamentDateColors().month === '#ffc400', 'falha ao carregar módulo de datas não impede salvar o formulário');
ok(noDateScript.window._readTournamentDateColors().typography.daySize === 100,
  'editor sem módulo carregado ainda salva a tipografia padrão');
ok(['daySize','dayWeight','monthSize','monthWeight','timeSize','timeWeight'].every(key => editor.includes('tourn-date-typo-${entry[0]}') && editor.includes(key.endsWith('Size') ? "'create.dateCardSize'" : "'create.dateCardWeight'")),
  'editor contém controles de tamanho e peso para os três grupos');
process.exit(failed ? 1 : 0);
