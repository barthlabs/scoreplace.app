'use strict';

const assert = require('node:assert/strict');
const draw = require('../functions-autodraw/draw-core');
const format = draw._window.FORMAT2;
const engine = draw._window._phasesEngine;
const validate = require('../functions-autodraw/format-intent-validation-core').validateNewFormatIntent;
const W = require('./render-harness').sandbox;
const headless = require('./headless');
headless.load('../domain/match-timing.js');
headless.load('../domain/next-match.js');
headless.load('../domain/match-day.js');
headless.load('../tv-layout-core.js');
headless.load('tv-live.js');

function scenario(sizes, reverse, localFormation) {
  const categories = sizes.map((_, index) => 'Chave ' + (index + 1));
  const cfg = format.defaultConfig('beach_tennis');
  cfg.parceria = 'rotation_groups_8';
  cfg.groupFormation = { mode:'size', value:8 };
  cfg.classifScope = 'per_group';
  cfg.classificados = 2;
  Object.assign(cfg.eliminatoria, { ativa:true, origem:'formar', formacao:'performance', linhas:1, dupla:false });
  cfg.rotationCategoryRules = categories.map((category, i) => ({
    category, rounds:sizes[i] === 8 ? 7 : 5,
    destination:sizes[i] === 8 ? 'ranking' : 'elimination'
  }));
  if (localFormation) cfg.groupCategoryRules = categories.map((category, i) => ({
    category, groupFormation:{mode:'count', value:sizes[i] / 8}
  }));
  const rotationRulesBefore = structuredClone(cfg.rotationCategoryRules);
  validate(cfg, Error, undefined, 2, categories);
  const entries = categories.flatMap((category, i) => Array.from({length:sizes[i]}, (_, j) => ({
    displayName:category + ' Atleta ' + (j + 1), uid:'u-' + i + '-' + j, category, categories:[category], ligaActive:true
  })));
  const t = { id:'rotation-category-fixture', sport:'beach_tennis', fmt2:cfg, combinedCategories:reverse ? categories.slice().reverse() : categories,
    participants:entries, rulesContractVersion:2, storageCanonico:true, status:'open', matches:[], rounds:[],
    rankingPrimary:'wins', tiebreakers:['saldo_pontos'] };
  const compiled = draw.compileFromFmt2(t);
  assert.equal(compiled.ok, true);
  const finalsExpected = cfg.rotationCategoryRules.filter(rule => rule.destination === 'elimination').length;
  assert.equal(t.phases.length, finalsExpected ? 2 : 1);
  assert.equal(draw.drawInitial(t, {idStamp:123}).ok, true);
  assert.equal(draw.drawInitial(t, {idStamp:123}).reason, 'already-drawn');
  assert.deepEqual(t.phases[0].classification.rotationCategoryRules, rotationRulesBefore);
  const plannedGames = sizes.reduce((sum,n) => sum + n / 8 * (n === 8 ? 14 : 10), finalsExpected);
  assert.equal(W._tournamentGamesPlan(t).totalPlanned, plannedGames);
  const preview = W._sumulaUpcomingBracket(t, 1);
  if (finalsExpected) {
    assert.deepEqual(Array.from(preview.categories, c => c.category).sort(),
      cfg.rotationCategoryRules.filter(r => r.destination === 'elimination').map(r => r.category).sort());
    assert(preview.categories.every(c => c.matches.length === 1));
  } else assert.equal(preview, null);
  const broadcast = W._tvLiveBuildSnapshot(t);
  assert.deepEqual(Array.from(broadcast.brackets, b => b.category).sort(),
    cfg.rotationCategoryRules.filter(rule => rule.destination === 'elimination').map(rule => rule.category).sort());
  const groups = engine.prevPhaseGroups(t);
  const groupsByName = new Set(groups.map(g => g.name));
  assert.equal(groups.length, groupsByName.size);
  const leaders = new Map();
  const officialRanking = g => engine.standingsDaFaseAnterior(g, t, { rankingPrimary:t.rankingPrimary, tiebreakers:t.tiebreakers }, true);
  const rankingByCategory = new Map();
  for (const group of groups) {
    const rule = format.rotationRuleForCategory(cfg, group.category);
    const games = group.matches;
    assert.equal(games.length, rule.rounds * 2);
    const partners = new Set();
    for (let round = 1; round <= rule.rounds; round++) {
      const roundGames = games.filter(m => m.round === round);
      assert.equal(roundGames.length, 2);
      assert.equal(new Set(roundGames.flatMap(m => m.team1Uids.concat(m.team2Uids))).size, 8);
    }
    games.forEach((m, index) => {
      for (const team of [m.team1Uids, m.team2Uids]) {
        const pair = team.slice().sort().join('/');
        assert(!partners.has(pair)); partners.add(pair);
      }
      m.scoreP1 = [7, 2, 6, 3, 5, 1, 4][index % 7];
      m.scoreP2 = 7 - m.scoreP1;
      const left = m.scoreP1 > m.scoreP2;
      m.winner = left ? m.p1 : m.p2;
      m.winnerUids = left ? m.team1Uids : m.team2Uids;
    });
    const ranking = officialRanking(group);
    assert.equal(ranking.length, 8);
    assert.equal(new Set(ranking.map(row => row.uid)).size, 8);
    assert(ranking.every(row => row.played === rule.rounds));
    if (rule.destination === 'elimination') {
      const list = leaders.get(group.category) || [];
      list.push(ranking.slice(0, 2).map(row => row.uid).sort().join('/'));
      leaders.set(group.category, list);
    } else rankingByCategory.set(group.category, ranking);
  }
  assert.equal(engine.phaseComplete(t), true);
  if (!finalsExpected) {
    assert.equal(engine.materializeNextPhase(t, officialRanking, 'no-final').ok, false);
    const sections = W._categoryFinalPlacements(t);
    assert(sections.every(section => section.entries.length === 8 && !section.matches.length));
    assert.equal(sections.length, sizes.length);
    const awards = draw._window.ScoreplaceTournamentTitles.resolve(t, {engine, rotationTiesChecked:true});
    assert(awards.ok, JSON.stringify(awards));
    assert.equal(awards.titles.length, sizes.length);
    assert(awards.titles.every(title => title.winnerUids.length === 1 && !title.sourceMatchId));
    return t;
  }
  const snap = engine.capturePhaseGroupStandings(t, officialRanking, '2026-01-01', groups, 0);
  assert.equal(snap.snapshot.groups.length, groups.length);
  const advance = engine.materializeNextPhase(t, officialRanking, 'fixture-final', {agoraIso:'2026-01-01'});
  assert.equal(advance.ok, true, advance.error);
  const finals = t.matches.filter(m => m.phaseIndex === 1);
  assert.equal(finals.length, leaders.size);
  assert(t.matches.every(m => !m.isBye && !m.isSitOut));
  for (const m of finals) {
    assert.deepEqual([m.team1Obj, m.team2Obj].map(team => team.participants.map(p => p.uid).sort().join('/')).sort(),
      leaders.get(m.category).slice().sort());
    m.scoreP1 = 6; m.scoreP2 = 5; m.winner = m.p1;
  }
  assert.equal(engine.phaseComplete(t), true);
  assert.equal(engine.materializeNextPhase(t, officialRanking, 'replay').ok, false);
  assert.equal(t.matches.length, plannedGames);
  const awards = draw._window.ScoreplaceTournamentTitles.resolve(t, {engine, rotationTiesChecked:true});
  assert(awards.ok, JSON.stringify(awards));
  assert.equal(awards.titles.length, sizes.length);
  assert.equal(awards.titles.filter(title => title.sourceMatchId).length, finalsExpected);
  const sections = W._categoryFinalPlacements(JSON.parse(JSON.stringify(t)));
  assert.equal(sections.length, sizes.length);
  assert.equal(W._tvLiveBuildSnapshot(t).finalPlacements.length, sizes.length);
  for (const section of sections) {
    const expected = rankingByCategory.get(section.category);
    assert.equal(section.entries.length, expected ? 8 : 16);
    if (expected) {
      assert.equal(section.matches.length, 0);
      assert.equal(section.displayEntries.length, 8);
      assert.deepEqual(Array.from(section.entries.filter(e => e.pos === 1), r => r.uids[0]).sort(),
        expected.filter(r => r.wins === expected[0].wins && r.pointsDiff === expected[0].pointsDiff).map(r => r.uid).sort());
    }
  }
  return t;
}
const mixed = scenario([16, 8], false);
const cfg = mixed.fmt2;
const rankingsOnly = scenario([8, 8], false);
scenario([16, 16, 16, 8, 8, 8, 8], true);
scenario([16, 8], false, true);
scenario([16, 16, 16, 8, 8, 8, 8], true, true);
const categories = cfg.rotationCategoryRules.map(r => r.category);
for (const bad of [
  [{category:'desconhecida', rounds:5, destination:'ranking'}],
  [cfg.rotationCategoryRules[0], cfg.rotationCategoryRules[0]],
  [{...cfg.rotationCategoryRules[0], rounds:'5'}], [{...cfg.rotationCategoryRules[0], rounds:8}],
  [{...cfg.rotationCategoryRules[0], destination:'outro'}]
]) assert.throws(() => validate({...cfg, rotationCategoryRules:bad}, Error, undefined, 2, categories));
const legacy = structuredClone(mixed);
delete legacy.fmt2.rotationCategoryRules;
delete legacy.phases[0].classification.rotationCategoryRules;
legacy.currentPhaseIndex = 0; legacy._phaseMaterialized = 0;
legacy.matches = legacy.matches.filter(m => m.phaseIndex === 0);
const legacyCfg = format.compileToPhases(legacy.fmt2, {categories});
assert.equal(legacyCfg.phases.length, 2);
assert.equal(Object.hasOwn(legacyCfg.cfg, 'rotationCategoryRules'), false);
assert.deepEqual(legacyCfg.phases[0].classification, legacy.phases[0].classification);
const defaultAdvance = engine.materializeNextPhase(legacy,
  g => engine.standingsDaFaseAnterior(g, legacy, {}, true), 'legacy');
assert(defaultAdvance.ok);
assert(legacy.matches.some(m => m.phaseIndex === 1 && m.category === categories[1] && m.isBye));
const terminal = {...cfg, rotationCategoryRules:cfg.rotationCategoryRules.map(rule => ({...rule, destination:'ranking'}))};
assert.equal(format.compileToPhases(terminal, {categories}).phases.length, 1);
console.log('✓ 24/80 atletas, 35/119 jogos, grupos de oito, rodízios 5/7, duplas da final, ranking individual, replay e validação');

async function formRoundTrip(t) {
  const browser = await require('playwright').chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="f2-config-mount"></main>');
    for (const file of ['sport-rules', 'standings-core', 'super-eight-core', 'format2', 'tournaments-categories',
      'bracket-model', 'chaves', 'chaves-adapter', 'phases-engine', 'tournaments-utils', 'format2-ui']) {
      await page.addScriptTag({path:require.resolve('../js/views/' + file + '.js')});
    }
    await page.evaluate(t => {
      window.fixture = {...t, matches:[], rounds:[], groups:[], phases:[], currentPhaseIndex:0};
      delete window.fixture.fmt2.rotationCategoryRules;
      window._f2MountInForm(document.querySelector('main'), t.sport, window.fixture.fmt2, window.fixture);
    }, t);
    async function degree(index,value) {
      await page.locator('#f2-rotation-games-'+index).evaluate((el,n)=>{
        el.value=n;el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));
      },value);
    }
    await degree(0,5); await degree(1,7);
    const fields=page.locator('#f2-rotation-destinations fieldset');
    await fields.nth(1).locator('[data-value="ranking"]').click();
    const saved=await page.evaluate(()=>window._f2GetConfig());
    assert.deepEqual(saved.rotationCategoryRules.map(({category,rounds,destination})=>({category,rounds,destination})),t.fmt2.rotationCategoryRules);
    assert.match(await page.locator('main').innerText(), /35 jogos/);
    await page.evaluate(saved => {
      window._f2MountInForm(document.querySelector('main'), window.fixture.sport, saved,
        {...window.fixture, matches:[{phaseIndex:0}], fmt2:saved});
    }, saved);
    assert.equal(await page.locator('#f2-rotation-games-1').inputValue(), '7');
    assert.equal(await fields.nth(1).locator('[data-value="ranking"]').getAttribute('aria-pressed'), 'true');
    assert(await page.locator('#f2-rotation-games-1').isDisabled());
    assert(await fields.nth(0).locator('[data-value="elimination"]').isDisabled());
    console.log('✓ Chromium: personalizar categorias, estimar 35 jogos, salvar, reabrir e congelar');
  } finally { await browser.close(); }
}

async function callableRoundTrip() {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:\d+$/);
  process.env.GCLOUD_PROJECT = 'demo-scoreplace';
  process.env.FIREBASE_CONFIG = JSON.stringify({projectId:'demo-scoreplace'});
  const api = require('../functions-autodraw/index.js');
  const backend = require('node:module').createRequire(require.resolve('../functions-autodraw/index.js'));
  const db = backend('firebase-admin/firestore').getFirestore();
  const invoke = (fn, data) => fn.run({data, auth:{uid:'org', token:{uid:'org'}}, rawRequest:{headers:{}}});
  async function save(t) {
    const ref = db.collection('tournaments').doc('tour_' + Date.now() + '_' + require('node:crypto').randomBytes(16).toString('hex'));
    const data = JSON.parse(JSON.stringify({...t, id:ref.id, creatorUid:'org', status:'active', notificationsMuted:true}));
    await ref.set(data);
    return ref;
  }
  const only = await save(rankingsOnly);
  const closed = await invoke(api.finishTournament, {tournamentId:only.id});
  assert.equal(closed.ok, true);
  assert.equal(closed.tournament.status, 'finished');
  assert.equal(closed.tournament.phases.length, 1);
  assert.equal(closed.tournament.titleAwards.filter(a => a.winnerUids.length === 1).length, 2);

  const active = scenario([8, 16], true);
  active.matches = active.matches.filter(m => m.phaseIndex === 0);
  active.currentPhaseIndex = 0; active._phaseMaterialized = 0;
  active.fmt2.tieResolution = 'singles_then_draw';
  active.fmt2.tieSinglesPoints = 5; active.fmt2.tieSinglesMargin = 1;
  const groups = engine.prevPhaseGroups(active);
  const finalGroups = groups.filter(g => !engine.categoryEndsInRanking(active, g.category));
  const target = finalGroups[0];
  const ranking = group => engine.standingsDaFaseAnterior(group, active, {}, true);
  function setResult(m, left, win, lose) {
    m.scoreP1 = left ? win : lose; m.scoreP2 = left ? lose : win;
    m.winner = left ? m.p1 : m.p2; m.winnerUids = left ? m.team1Uids : m.team2Uids;
  }
  // Procura uma série curta de placares que produza precisamente o empate 2º/3º.
  const tie = (a, b) => a.wins === b.wins && a.pointsDiff === b.pointsDiff;
  let top;
  for (let mask = 0; mask < 1024; mask++) {
    target.matches.forEach((m,i) => setResult(m, !!(mask & (1 << i)), 6, i % 3));
    top = ranking(target);
    if (!tie(top[0], top[1]) && tie(top[1],top[2]) && !tie(top[2],top[3])) break;
  }
  assert(tie(top[1],top[2]) && !tie(top[0],top[1]) && !tie(top[2],top[3]));
  const ref = await save(active);
  const legacy = {...active.fmt2}; delete legacy.rotationCategoryRules;
  await assert.rejects(invoke(api.updateTournamentConfiguration, {tournamentId:ref.id, patch:{fmt2:legacy}}), /fixadas pelo sorteio/);
  const data = {tournamentId:ref.id, operationId:require('node:crypto').randomUUID()};
  let advance = await invoke(api.advanceTournamentPhase, data);
  assert.equal(advance.ok, false, JSON.stringify(advance));
  assert.equal(advance.reason, 'tie-match-pending');
  assert.equal((await ref.get()).data().currentPhaseIndex, 0);
  const id = advance.tie.decisionId;
  const extra = advance.decision.matches[0];
  assert.deepEqual([extra.p1.key, extra.p2.key].sort(), [top[1].key, top[2].key].sort());
  const won = extra.p2.key;
  advance = await invoke(api.advanceTournamentPhase, {...data, tieAction:{type:'score', decisionId:id,
    matchId:extra.id, sets:[{p1:1,p2:5}]}});
  assert.equal(advance.ok, true, JSON.stringify(advance));
  advance = await invoke(api.advanceTournamentPhase, data);
  assert.equal(advance.ok, true, JSON.stringify(advance));
  const final = advance.tournament.matches.filter(m => m.phaseIndex === 1);
  assert.equal(final.length, 1);
  assert([final[0].team1Obj, final[0].team2Obj].some(team =>
    team.participants.some(p => 'uid:' + p.uid === won) && team.participants.some(p => p.uid === top[0].uid)));
  console.log('✓ Firestore demo: 2 títulos individuais, cliente antigo bloqueado, empate 2º/3º e final após a simples');
}
(process.env.SP_TEST_ROTATION_CALLABLES ? callableRoundTrip() : formRoundTrip(mixed))
  .catch(error => { console.error(error); process.exitCode = 1; });
