'use strict';
/* Regressão de configuração visual das fases.
 * Não é teste de CSS: protege as duas regras de produto que a tela deve expor.
 *  1. Fechada não admite entrada tardia, logo não oferece a escolha Suplentes/Novos Confrontos.
 *  2. Prazos por rodada são opt-in; desativar não pode manter datas escondidas no save.
 */
const assert = require('assert');
const fs = require('fs');
const headless = require('./headless');

const create = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const f2ui = fs.readFileSync('js/views/format2-ui.js', 'utf8');
const f2 = fs.readFileSync('js/views/format2.js', 'utf8');
const bracket = fs.readFileSync('js/views/bracket.js', 'utf8');

assert.ok(create.includes('id="late-matchups-choice"'), 'a escolha tardia da fase inicial tem wrapper próprio');
assert.ok(/matchupChoice\.style\.display = isOpen \? '' : 'none'/.test(create), 'Fechadas esconde a escolha de entradas tardias');
assert.ok(/var confRow = !isClosed \? modeSwitch/.test(f2ui), 'a eliminatória também omite a escolha quando fechada');
assert.ok(bracket.includes('(!_leFechadas ? _linhaTog'), 'o atalho da chave segue a mesma regra');

assert.ok(create.includes('id="round-bounds-enabled"'), 'a fase inicial tem toggle explícito para prazos por rodada');
assert.ok(create.includes("if (!((document.getElementById('round-bounds-enabled') || {}).checked)) return [];"), 'desligar limpa os prazos antes do save');
assert.ok(f2.includes('roundBoundsEditorEnabled: false'), 'formato novo nasce com o editor de prazos desligado');
assert.ok(f2ui.includes('window._f2ElimRoundBoundsEnabled'), 'a eliminatória também pode ligar ou desligar o editor');

assert.ok(create.includes('^#novo-torneio(?:\\/|$)'), 'Voltar reconhece a rota de edição #novo-torneio/<id>');

const box = { innerHTML: '' };
headless.window.document = { getElementById: id => id === 'f2-config-mount' ? box : null };
headless.load('format2-ui.js');
const F = headless.window.FORMAT2;
const base = F.defaultConfig('Beach Tennis');
base.parceria = 'fixa';
base.grupos = 2;
base.classifScope = 'per_group';
base.eliminatoria.linhas = 2;
base.eliminatoria.lineAssignment = 'rank_ranges';
base.eliminatoria.lineRankRanges = [{ from: 1, to: 2 }, { from: 3, to: 4 }];
base.eliminatoria.scoring = { type: 'standard', setsToWin: 2, gamesPerSet: 6 };
base.eliminatoria.endDate = '2026-12-15';
base.eliminatoria.endTime = '19:00';
base.eliminatoria.roundBoundsEditorEnabled = true;
base.eliminatoria.roundBounds = ['2026-12-10T19:00'];
base.teamCompetition.enabled = true;
headless.window._f2MountInForm(box, 'Beach Tennis', base, { id: 'test' });
const get = () => headless.window._f2GetConfig();
const titles = () => [box.innerHTML.indexOf('4. 🎯 Fase Classificatória'), box.innerHTML.indexOf('5. 🏆 Fase Eliminatória')];
assert(titles().every(x => x >= 0), 'os dois blocos de fase sempre aparecem');
assert(!box.innerHTML.includes('Haverá classificatória?'), 'não há pergunta redundante');
assert(!box.innerHTML.includes('Como o torneio define o campeão?'), 'não há escolha paralela à fase');
assert.equal(F.compileToPhases(get(), { sport: 'Beach Tennis' }).phases.length, 2);

headless.window._f2Elim(false);
assert.equal(get().eliminatoria.ativa, false);
assert(titles().every(x => x >= 0), 'eliminatória off conserva cabeçalho');
assert(!box.innerHTML.includes('Confrontos na chave'), 'eliminatória off recolhe controles');
assert(!box.innerHTML.includes('2026-12-15'), 'eliminatória off não mostra a data guardada como ativa');
assert.equal(F.compileToPhases(get(), { sport: 'Beach Tennis' }).phases.length, 1);
headless.window._f2ClassifAtiva(false);
assert.equal(get().classifAtiva, true, 'última fase não pode desligar');
headless.window._f2Elim(true);
headless.window._f2ClassifAtiva(false);
assert.equal(get().classifAtiva, false);
assert(!box.innerHTML.includes('Estrutura — nº de grupos'), 'classificatória off recolhe controles');
assert(!box.innerHTML.includes('2026-12-15'), 'eliminação direta não mostra data guardada da segunda fase');
assert(!box.innerHTML.includes('f2-elim-end-date'), 'eliminação direta usa data da fase inicial');
assert(!box.innerHTML.includes('f2elim'), 'eliminação direta usa formato da partida inicial');
assert(!box.innerHTML.includes('f2-elim-round-bounds-box'), 'eliminação direta não mostra a régua guardada da segunda fase');
assert(titles().every(x => x >= 0), 'classificatória off conserva cabeçalho');
assert.equal(F.compileToPhases(get(), { sport: 'Beach Tennis' }).phases.length, 1);
headless.window._f2Elim(false);
assert.equal(get().eliminatoria.ativa, true, 'última fase eliminatória não pode desligar');
assert.equal(get().eliminatoria.lineAssignment, 'rank_ranges', 'desligar fase não altera faixas configuradas');
assert.equal(get().eliminatoria.endDate, '2026-12-15', 'desligar fase não zera data configurada');
assert.equal(get().eliminatoria.scoring.setsToWin, 2, 'desligar fase não zera formato de placar');
assert.equal(get().teamCompetition.enabled, true, 'decisão interna de times permanece guardada');
const direct = F.compileToPhases(get(), { sport: 'Beach Tennis' });
assert.equal(direct.phases[0].scoring || null, null, 'eliminação direta usa o formato inicial, não o formato preservado da segunda fase');
assert.equal(direct.phases[0].endDate || '', '', 'eliminação direta usa datas iniciais, não a data preservada da segunda fase');
assert.equal(direct.phases[0].teamCompetition || null, null, 'fase direta não ativa os times guardados na classificatória');
assert.equal(direct.topLevel.teamCompetition || null, null, 'topo direto não ativa os times guardados');
const dormantTie = F.normalize({ ...base, classifAtiva: false, tieResolution: 'singles_then_draw',
  eliminatoria: { ...base.eliminatoria, ativa: true } }, 'Beach Tennis');
const noTeamTie = F.normalize({ ...base, classifAtiva: false, tieResolution: 'singles_then_draw',
  teamCompetition: { ...base.teamCompetition, enabled: false },
  eliminatoria: { ...base.eliminatoria, ativa: true } }, 'Beach Tennis');
assert.equal(dormantTie.tieResolution, noTeamTie.tieResolution,
  'times guardados não alteram o desempate efetivo sem classificatória');
const reopened = F.normalize(JSON.parse(JSON.stringify(direct.cfg)), 'Beach Tennis');
assert.equal(reopened.teamCompetition.enabled, true, 'salvar e reabrir mantém a decisão interna de times');
assert.equal(reopened.eliminatoria.endDate, '2026-12-15', 'salvar e reabrir mantém data interna');
headless.window._f2MountInForm(box, 'Beach Tennis', reopened, { id: 'reopened', fmt2: reopened, phases: direct.phases });
assert.equal(get().classifAtiva, false, 'reabrir mantém a fase recolhida');
assert.equal(get().teamCompetition.enabled, true, 'reabrir não apaga os times guardados');
headless.window._f2ClassifAtiva(true);
assert.equal(get().eliminatoria.lineAssignment, 'rank_ranges', 'religar recupera faixas');
assert.equal(get().eliminatoria.endDate, '2026-12-15', 'religar recupera data');
assert.equal(get().eliminatoria.scoring.setsToWin, 2, 'religar recupera placar');
assert.equal(F.compileToPhases(get(), { sport: 'Beach Tennis' }).phases.length, 2);
const rotating = F.normalize({ ...base, grupos: 1, parceria: 'rei_rainha', teamCompetition: { ...base.teamCompetition, enabled: true } }, 'Beach Tennis');
assert.equal(rotating.teamCompetition.enabled, false, 'parceria rotativa continua incompatível com pontuação por times');

const drawn = { id: 'drawn', matches: [{ phaseIndex: 0 }] };
headless.window._f2MountInForm(box, 'Beach Tennis', base, drawn);
headless.window._f2ClassifAtiva(false);
assert.equal(get().classifAtiva, true, 'classificatória sorteada não desliga');
const directCfg = F.normalize({ ...base, classifAtiva: false, eliminatoria: { ...base.eliminatoria, ativa: true } }, 'Beach Tennis');
headless.window._f2MountInForm(box, 'Beach Tennis', directCfg, drawn);
headless.window._f2ClassifAtiva(true);
headless.window._f2Elim(false);
assert.equal(get().classifAtiva, false, 'eliminação direta sorteada não vira classificatória');
assert.equal(get().eliminatoria.ativa, true, 'eliminação direta sorteada não desliga');
headless.window._f2MountInForm(box, 'Beach Tennis', base, { id: 'advanced', matches: [{ phaseIndex: 0 }, { phaseIndex: 1 }] });
headless.window._f2Elim(false);
assert.equal(get().eliminatoria.ativa, true, 'eliminatória gerada não desliga');

const historical = F.normalize({ ...base, classifAtiva: false, eliminatoria: { ...base.eliminatoria, ativa: false, scoring: null, endDate: '' } }, 'Beach Tennis');
assert.equal(historical.eliminatoria.ativa, true, 'leitura histórica conserva ao menos uma fase');
const drawCore = require('../functions-autodraw/draw-core.js');
const initialDraw = drawCore.assignCompetitionTeamsAtInitialDraw({ fmt2: { classifAtiva: false }, participants: [] },
  { enabled: true, teamNames: ['A', 'B'], schedule: { enabled: true, mode: 'structured', modeConfirmed: true } });
assert.equal(initialDraw.config.enabled, false, 'o sorteio ignora plano de times obsoleto com classificatória desligada');

console.log('phase controls opt-in: ok');
