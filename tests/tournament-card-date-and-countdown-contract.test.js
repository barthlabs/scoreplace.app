'use strict';
/* Na ficha, logo do local acompanha o título; data e resumo vêm antes da
 * classificação. A dashboard não repete "Começa em X dias". */
const fs = require('fs');
const vm = require('node:vm');
const detail = fs.readFileSync('js/views/tournaments.js', 'utf8');
const componentsCss = fs.readFileSync('css/components.css', 'utf8');
const dashboard = fs.readFileSync('js/views/dashboard.js', 'utf8');
const editor = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const DateCard = require('../js/views/tournament-date-card.js');
const superEightEstimate = DateCard.displayRange({ superEight:true, courtCount:9, gameDuration:30,
  callTime:5, warmupTime:5, startDate:'2026-11-21T09:00', endDate:'2026-11-21T23:59' },
  { start:'2026-11-21T09:00', end:'2026-11-21T23:59' });
if (superEightEstimate.end !== '2026-11-21T13:40' || !superEightEstimate.estimated) throw new Error('Super 8 deve prever sete blocos de dois jogos nas quadras disponíveis');
const dateColors = require('../functions-autodraw/date-card-colors-core.js');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
const titleAt = detail.indexOf('Middle Left: Nome + Logo + Favorito');
const slotAt = detail.indexOf('sp-tournament-title-slot', titleAt);
const actionsAt = detail.indexOf('sp-tournament-date-actions', slotAt);
const datesAt = detail.indexOf('id="sp-tournament-detail-date"', actionsAt);
const countdownAt = detail.indexOf('Evento concentrado: a janela publicada manda no relógio');
const detailSlotAt = detail.indexOf('data-vlogo-pid', titleAt);
const overviewAt = detail.indexOf('class="sp-overview-stats"', datesAt);
const podiumAt = detail.indexOf('tournamentId ? podiumHtml', overviewAt);
ok(titleAt >= 0 && slotAt > titleAt && detailSlotAt > slotAt && detailSlotAt < actionsAt && actionsAt < datesAt,
  'logo do local fica junto ao título e data vem após as ações na mesma faixa');
ok(detail.includes('!tournamentId && !dateCardHtml && t.venuePlaceId'),
  'cards da lista conservam o logo do local ao lado da data textual');
ok(datesAt > detailSlotAt && actionsAt < datesAt && overviewAt > datesAt && podiumAt > overviewAt && podiumAt < countdownAt,
  'data e contagem de inscritos por categoria vêm antes do pódio e da classificação');
ok(detail.includes('var _detailOverviewAtTop = !!tournamentId;'), 'ordem da ficha vale para todo torneio');
ok(detail.includes('class="sp-tournament-logo"') &&
  detail.includes('sp-tournament-date-stack sp-tournament-identity-date') &&
  componentsCss.includes('.sp-tournament-identity-row .sp-tournament-identity-date'),
  'sem logo, a data ocupa a linha de identidade ao lado do título');
ok(detail.includes('id="sp-tournament-detail-date"') && detail.includes('sp-tournament-date-actions--logo') &&
  !componentsCss.includes('.sp-tournament-date-actions:has(.sp-date-card') &&
  !componentsCss.includes('.sp-tournament-date-actions:has(:is(.sp-date-card'),
  'data com logo aparece uma vez dentro da identidade e não ocupa a linha de ações');
ok(componentsCss.includes('#sp-tournament-detail-date .sp-date-card-trigger { width:100%;') &&
  componentsCss.includes('#sp-tournament-detail-date .sp-date-card { width:min(100%,clamp(150px,18vw,270px));') &&
  componentsCss.includes('#sp-tournament-detail-date :is(.sp-date-card--one-day, .sp-date-card--start-only) { min-width:0; min-height:0;') &&
  componentsCss.includes('#sp-tournament-detail-date .sp-date-card--cross-month { width:min(100%,clamp(180px,19vw,270px));') &&
  componentsCss.includes('#sp-tournament-detail-date .sp-date-card { min-width:0; max-width:100%;') &&
  componentsCss.includes('#sp-tournament-detail-date :is(.sp-date-card--one-day, .sp-date-card--start-only) { width:min(100%,var(--sp-date-one-day-width));'),
  'larguras do cartão respeitam a coluna do título no desktop e celular');
ok(['.sp-date-days', '.sp-date-month', '.sp-date-time']
  .every(selector => componentsCss.includes('#sp-tournament-detail-date :is(.sp-date-card--one-day, .sp-date-card--start-only) ' + selector)) &&
  componentsCss.includes('#sp-tournament-detail-date .sp-date-cross-item .sp-date-day') &&
  componentsCss.includes('#sp-tournament-detail-date .sp-date-cross-item .sp-date-month') &&
  componentsCss.includes('clamp(20px,2.8vw,32px) * var(--sp-date-month-scale, 1)') &&
  componentsCss.includes('clamp(16px,4.7vw,22px) * var(--sp-date-month-scale, 1)'),
  'fontes responsivas preservam a escala do organizador');
const dashboardLogoAt = dashboard.indexOf('sp-dashboard-logo-date');
const dashboardSlotAt = dashboard.indexOf('sp-tournament-title-slot', dashboardLogoAt);
ok(dashboardLogoAt >= 0 && dashboardSlotAt > dashboardLogoAt && !dashboard.includes('sp-tournament-date-stack'),
  'cartão do dashboard permanece fora da coluna de título');
const dashboardDatesAt = dashboard.indexOf('Quando há logo do torneio, o logo do local continua ao lado da data.');
const dashboardCountdownAt = dashboard.indexOf('if (isFinished) return \'\';', dashboardDatesAt);
const dashboardDateBlock = dashboard.slice(dashboardDatesAt, dashboardCountdownAt);
ok(!/tournament\\.starts(In|Today|Tomorrow)/.test(dashboardDateBlock), 'dashboard não duplica a regressiva com “Começa em”');
ok(dashboard.includes('sp-dashboard-identity--date-first') && componentsCss.includes('.sp-dashboard-identity--date-first .sp-tournament-title-slot'),
  'sem logo, título do card inicial alinha ao topo da data');
const dashboardIdentityAt = dashboard.indexOf('sp-tournament-identity-row ${dateCardHtml');
const dashboardStatsAt = dashboard.indexOf('<!-- Inscritos e configuração vêm imediatamente após a data. -->', dashboardIdentityAt);
const dashboardConfigAt = dashboard.indexOf('<!-- Configuração Completa do Torneio', dashboardStatsAt);
const dashboardVenueAt = dashboard.indexOf('${t.venueName ? `', dashboardStatsAt);
const dashboardWeatherAt = dashboard.indexOf('window._weatherSlotHtml(t, \'sm\')', dashboardConfigAt);
ok(dashboardIdentityAt >= 0 && dashboardStatsAt > dashboardIdentityAt && dashboardConfigAt > dashboardStatsAt &&
  dashboardVenueAt > dashboardConfigAt && dashboardWeatherAt > dashboardVenueAt,
  'dashboard mostra inscritos e configuração sob a data e deixa a previsão no rodapé');
ok(dashboard.includes('sp-dashboard-identity--venue-bottom') && componentsCss.includes('.sp-dashboard-identity--venue-bottom .sp-tournament-title-slot'),
  'sem logo do torneio, logo do local alinha à base da data');
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
const longRangeHtml = DateCard.render('2026-08-02T19:00', '2026-11-12T23:00');
ok(longRangeHtml.includes('sp-date-card--extended-range') && longRangeHtml.includes('sp-date-cross-grid') &&
  longRangeHtml.includes('<span class="sp-date-cross-item"><span class="sp-date-day">2</span><span class="sp-date-month">AGO</span>') &&
  !longRangeHtml.includes('<div class="sp-date-time">') && !longRangeHtml.includes('19:00 — 23:00'),
  'período de meses centraliza cada dia sobre seu mês e não sugere horário diário');
ok(DateCard.render('2026-10-30T09:00', '2026-11-02T18:00').includes('09:00 — 18:00'),
  'intervalo curto entre meses conserva os horários aprovados');
const estimatedHtml = DateCard.render('2026-11-21T09:00', '2026-11-21T13:40', null, { estimatedEnd:true });
ok(estimatedHtml.includes('09:00 — 13:40*</div><div class="sp-date-estimate-note">(* estimado)</div>') &&
  !estimatedHtml.includes('13:40 (estimado)'), 'previsão fica em nota abaixo do horário');
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
