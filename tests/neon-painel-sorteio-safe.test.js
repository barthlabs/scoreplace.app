'use strict';
// Executa o painel REAL: a quota Neon usa safe() antes de renderizar os 24
// seletores de dia. Um teste que só procura texto no arquivo não vê o erro.
const { window: W, sandbox } = require('./render-harness');
const categories = ['Fem Light', 'Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'];
const counts = [24, 8, 8, 8, 8, 8];
let sequence = 1;
const participants = categories.flatMap((category, categoryIndex) => Array.from({ length: counts[categoryIndex] }, () => {
  const p1Seq = sequence + 100;
  sequence += 2;
  return { category, fixedPairId: 'pair-' + p1Seq, p1Seq,
    p1Uid: 'uid-first-' + p1Seq, p2Uid: 'uid-second-' + p1Seq };
}));
participants[23].p1Uid = '';
participants[23].p1Name = '<img src=x onerror=alert(1)>';
const tournament = {
  id: 'sb_neon_regression', startDate: '2026-10-22T18:00', endDate: '2026-10-23T22:40',
  categories, participants, courtCount: 6,
  teamCompetition: { enabled: true, teamCount: 8,
    teamNames: ['Blackout', 'Blast', 'Eclipse', 'Panic', 'Phantom', 'Venom', 'Volt', 'Vortex'],
    schedule: { enabled: true, gamesPerTeam: 3, pairDayAssignments: [
      { fixedPairId: 'pair-101', day: '2026-10-23' },
      { fixedPairId: 'pair-133', day: '2026-10-22' }
    ] } }
};
W._findTournamentById = () => tournament;
W._nameForUid = (uid) => uid === 'uid-first-101' ? 'Andrea Ruschmann' : uid === 'uid-second-101' ? 'Juliana Marques' : '';
let hydratedRoot;
W._hydrateUidNames = (root) => { hydratedRoot = root; return Promise.resolve(); };
let overlay;
sandbox.document.createElement = () => {
  overlay = {
    style: {}, innerHTML: '', remove() {},
    querySelector(selector) { return selector === '#team-draw-cancel-top' ? {} : null; },
    querySelectorAll() { return []; }
  };
  return overlay;
};
let opened;
try { opened = W._showTeamCompetitionDrawReview(tournament.id, { _canonicalRosterLoaded: true }); }
catch (error) { console.error('Painel Neon lançou:', error); process.exit(1); }
if (!opened || !overlay) throw new Error('Painel Neon não abriu');
const selectors = overlay.innerHTML.match(/<select data-pair-day=/g) || [];
if (selectors.length !== 24) throw new Error('Esperados 24 seletores de dia Fem Light; encontrados ' + selectors.length);
if (/O sorteio está bloqueado/.test(overlay.innerHTML)) throw new Error('Elenco Neon válido foi bloqueado');
if (hydratedRoot !== overlay) throw new Error('Painel UID-only não pediu hidratação canônica');
if (!overlay.innerHTML.includes('Andrea Ruschmann') || !overlay.innerHTML.includes('Juliana Marques')) throw new Error('Nomes de perfis carregados não aparecem');
if ((overlay.innerHTML.match(/data-uid-name=/g) || []).length !== 47) throw new Error('Faltam marcadores dos 47 perfis UID Fem Light');
if (overlay.innerHTML.includes('<img src=x') || !overlay.innerHTML.includes('&lt;img src=x')) throw new Error('Nome manual sem escape HTML');
if (!overlay.innerHTML.includes('Nome ainda não carregado')) throw new Error('Perfil pendente deve ter rótulo legível');
const visibleHtml = overlay.innerHTML.replace(/\sdata-uid-name="[^"]*"/g, '').replace(/\sdata-pair-day="[^"]*"/g, '');
if (/uid-(?:first|second)-/.test(visibleHtml)) throw new Error('UID cru vazou no conteúdo visível');
if (!overlay.innerHTML.includes('grid-template-columns:repeat(2,minmax(0,1fr))') ||
    !overlay.innerHTML.includes('.sp-team-pair-card select{display:block;width:100%;min-width:0;')) throw new Error('Grade/select não têm contenção responsiva');
const pairOptions = Array.from(overlay.innerHTML.matchAll(/<select data-pair-day="[^"]+"[^>]*>(.*?)<\/select>/g), (match) => match[1]);
if (pairOptions.filter((options) => /value="2026-10-22" selected/.test(options)).length !== 16 ||
    pairOptions.filter((options) => /value="2026-10-23" selected/.test(options)).length !== 8) throw new Error('Sugestão de quinta/sexta não é 16/8');
if ((overlay.innerHTML.match(/<small>Sugestão<\/small>/g) || []).length !== 22 ||
    (overlay.innerHTML.match(/<small>Dia salvo<\/small>/g) || []).length !== 2) throw new Error('Dias salvos e sugestões devem ser identificados');
console.log('✓ Painel Neon: 64 duplas, 24 seletores, nomes hidratáveis, sugestão 16/8 e cards contidos');

// Checagem visual opcional em Chromium real: o harness não calcula geometria.
// Use SP_VISUAL_CHECK=1 node tests/neon-painel-sorteio-safe.test.js antes do deploy.
if (process.env.SP_VISUAL_CHECK === '1') (async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const stressedHtml = overlay.innerHTML.replace(/Nome ainda não carregado/g, 'Mariana de Albuquerque Vasconcelos e Silva');
      await page.setContent('<!doctype html><html><body style="margin:0;background:#020617;color:white"><div id="team-draw-review-panel">' + stressedHtml + '</div></body></html>');
      const geometry = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.sp-team-pair-card')];
        const grid = document.querySelector('.sp-team-pair-grid');
        return { viewport: innerWidth, template: getComputedStyle(grid).gridTemplateColumns,
          columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          overflow: cards.filter((card) => {
            const bounds = card.getBoundingClientRect();
            const select = card.querySelector('select').getBoundingClientRect();
            return card.scrollWidth > card.clientWidth + 1 || select.right > bounds.right + 1 || select.left < bounds.left - 1;
          }).length };
      });
      if (geometry.columns !== (width <= 780 ? 1 : 2) || geometry.overflow !== 0) {
        throw new Error('Layout ' + width + 'px: ' + JSON.stringify(geometry));
      }
      console.log('✓ Layout real ' + width + 'px: ' + geometry.columns + ' coluna(s), nenhum cartão vazando');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
