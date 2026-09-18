'use strict';
/* ⭐ 2.3.81 · Relato do dono (18/set/2026), olhando a chave da Confra: com 3 placares
   lançados o nome da dupla ficava minúsculo/cortado e o card estreito, mesmo com
   largura sobrando no painel. MEDIDO com o card REAL (renderMatchCard + motor de
   ajuste de nome do store.js): o placar de 3 colunas ocupa 144px fixos; num card
   de 279px (3 colunas a 880px) sobravam 52px para o nome e a fonte caía a 7px.
   Regra: 1) liberar espaço — cada coluna da chave precisa de 360px;
          2) se ainda assim não couber, o nome encolhe/quebra, mas NUNCA corta. */
const path = require('path'), fs = require('fs'), assert = require('assert/strict');
const { chromium } = require('playwright');
const H = require('./render-harness');
const W = H.window;
const ROOT = path.join(__dirname, '..');
const CSS = fs.readFileSync(path.join(ROOT, 'css/components.css'), 'utf8');
const STORE = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const i = STORE.indexOf('window._fitNameToBox = _fitOne;');
const FIT = STORE.slice(STORE.lastIndexOf('\n(function() {', i), STORE.indexOf('\n})();', i) + 6);
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const SC = { type: 'sets', setsToWin: 2, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: true, superTiebreakPoints: 10, countingType: 'tennis' };
// jogo real da Confra: ph-tour_1780009816637-1-gold-VC-R1-P1
const m = { id: 'P1', round: 1, bracket: 'gold', phaseIndex: 1, p1: 'Roberta Rocchi / Camila Putignani', p2: 'Erika de Paula / loraine soares',
  sets: [{ gamesP2: 6, gamesP1: 2 }, { gamesP1: 6, tiebreak: { pointsP2: 4, pointsP1: 7 }, gamesP2: 5 }, { gamesP1: 11, gamesP2: 13, superTiebreak: true }],
  winner: 'Erika de Paula / loraine soares', setsWonP1: 1, setsWonP2: 2,
  team1Uids: ['u1', 'u2'], team2Uids: ['u3', 'u4'],
  team1Obj: { p1Uid: 'u1', p2Uid: 'u2', p1Name: 'Roberta Rocchi', p2Name: 'Camila Putignani' },
  team2Obj: { p1Uid: 'u3', p2Uid: 'u4', p1Name: 'Erika de Paula', p2Name: 'loraine soares' } };
const NOMES = { u1: 'Roberta Rocchi', u2: 'Camila Putignani', u3: 'Erika de Paula', u4: 'loraine soares' };
const t = { id: 'T1', name: 'Confra', sport: 'Beach Tennis', teamSize: 2, scoring: SC, matches: [m], participants: [] };
W.AppStore.tournaments = [t]; W.AppStore.currentUser = { uid: 'org', displayName: 'Org' }; W.AppStore.isOrganizer = () => true;
W._currentBracketTournament = t; W._currentBracketTournamentId = 'T1'; delete W._effectiveScoring;
const card = W.renderMatchCard(m, true, 'T1', 154);
assert.ok(/sp-set-grid/.test(card), 'âncora: o card real desenha a grade de sets');
const painel = (id, w) => '<div id="' + id + '" class="bracket-sticky-scroll-wrapper" style="width:' + w + 'px"><div class="bracket-scroll-content">' +
  '<div class="bracket-round-column" style="display:flex;min-width:280px">' + card + '</div>'.repeat(1) +
  '<div class="bracket-round-column" style="display:flex;min-width:280px">' + card + '</div></div></div>';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  await p.setContent('<style>' + CSS + '</style><body style="background:#0b1220">' + painel('largo', 920) + painel('duas', 736) + painel('apertado', 300) + '</body>', { waitUntil: 'load' });
  // fluxo real: 1º ajuste sem os nomes por uid; eles chegam depois, marcam data-sp-renamed e o app reajusta
  await p.evaluate((code) => { eval(code); window._fitNames(document, 0); }, FIT);
  await p.waitForTimeout(150);
  await p.evaluate((NM) => {
    document.querySelectorAll('[data-uid-name]').forEach((e) => { const n = NM[e.getAttribute('data-uid-name')]; if (n) { e.textContent = n; e.setAttribute('data-sp-renamed', '1'); } });
    document.querySelectorAll('.sp-name-fit[data-fitted]').forEach((el) => { if (el.querySelector('[data-sp-renamed]')) el.removeAttribute('data-fitted'); });
    window._fitNames(document, 0);
  }, NOMES);
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const um = (id) => {
      const root = document.getElementById(id);
      const cols = [...root.querySelectorAll('.bracket-round-column')].map((c) => Math.round(c.getBoundingClientRect().width));
      const nomes = [...root.querySelector('.sp-match-card').querySelectorAll('.sp-name-fit')].map((el) => {
        const box = el.parentElement;
        return { n: el.textContent.trim(), fs: parseFloat(getComputedStyle(el).fontSize),
          corta: el.scrollWidth > box.clientWidth + 1 || el.scrollHeight > box.clientHeight + 1 };
      });
      return { cols, nomes };
    };
    return { largo: um('largo'), duas: um('duas'), apertado: um('apertado') };
  });
  await b.close();
  must(r.largo.cols[0] >= 450 && r.largo.cols.length === 2 && r.largo.cols[1] >= 450,
    'painel de 920px: DUAS colunas largas (' + r.largo.cols.join('/') + 'px), não três apertadas');
  must(r.duas.cols.every((w) => w >= 359), 'painel de 736px: duas colunas de pelo menos 360px (' + r.duas.cols.join('/') + 'px)');
  must(r.largo.nomes.length === 4 && r.largo.nomes.every((n) => n.n.length > 5), 'os 4 nomes da dupla chegaram ao card');
  r.largo.nomes.forEach((n) => must(n.fs >= 13.5 && !n.corta, n.n + ': tamanho canônico (' + n.fs.toFixed(1) + 'px) e inteiro, com 3 sets lançados'));
  must(r.apertado.nomes.every((n) => !n.corta), 'sem espaço (card de 300px), o nome encolhe/quebra mas NÃO corta (' + r.apertado.nomes.map((n) => n.fs.toFixed(1)).join('/') + 'px)');
  must(r.apertado.nomes.every((n) => n.fs < 13), 'e é o ESPAÇO que faltava, não o motor: apertado ele reduz de fato');
  console.log('\n✅ coluna da chave comporta 3 sets — ' + ok + ' verificações');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
