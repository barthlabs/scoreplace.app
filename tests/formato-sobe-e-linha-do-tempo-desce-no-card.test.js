'use strict';
/* Regra atual: prazo/horário fica ao lado de Jogo N em qualquer formato;
   "Melhor de 3" permanece abaixo dessa linha e antes do cabeçalho de sets. */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const H = require('./render-harness');
const W = H.window;
const CSS = fs.readFileSync(path.join(__dirname, '..', 'css/components.css'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const M3 = { type: 'sets', setsToWin: 2, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, superTiebreak: true, superTiebreakPoints: 10 };
const UM = { type: 'sets', setsToWin: 1, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, superTiebreak: false };
function card(scoring, extra) {
  const m = Object.assign({ id: 'M1', p1: 'Veronica Frasso / Maria Betânia', p2: 'Fernando Cerri / Monique Monteux', round: 0, bracket: 'main' }, extra || {});
  const t = { id: 'T1', name: 'Teste', sport: 'Beach Tennis', scoring, matches: [m], participants: [] };
  W.AppStore.tournaments = [t]; W.AppStore.currentUser = { uid: 'org', displayName: 'Org' }; W.AppStore.isOrganizer = () => true;
  W._currentBracketTournament = t; W._currentBracketTournamentId = 'T1'; delete W._effectiveScoring;
  return W.renderMatchCard(m, true, 'T1', 108);
}
const jogado = card(M3, { sets: [{ gamesP1: 1, gamesP2: 6 }, { gamesP1: 3, gamesP2: 6 }], setsWonP1: 0, setsWonP2: 2, winner: 'Fernando Cerri / Monique Monteux', resultAt: Date.UTC(2026, 8, 18, 14, 48) });
const iJogo = jogado.indexOf('Jogo 108'), iTtl = jogado.indexOf('class="sp-set-head-ttl"'), iHead = jogado.indexOf('class="sp-set-head"'), iSlot = jogado.indexOf('data-match-time-status');
must(iJogo > -1 && iSlot > iJogo && iTtl > iSlot && iTtl < iHead, 'melhor de 3: prazo junto ao jogo, formato abaixo e antes do cabeçalho de sets');
must(iSlot < iHead && /Jogado em/.test(jogado), '"Jogado em" fica no cabeçalho do jogo, não no rodapé nem nos sets');
must((jogado.match(/data-match-time-status/g) || []).length === 1, 'a linha do tempo continua sendo UM slot só (atualização ao vivo intacta)');
const umSet = card(UM, { resultAt: Date.UTC(2026, 8, 18, 14, 48), winner: 'Fernando Cerri / Monique Monteux', scoreP1: 4, scoreP2: 6 });
must(umSet.indexOf('sp-set-head') === -1 && umSet.indexOf('data-match-time-status') > umSet.indexOf('Jogo 108'), 'set único: sem cabeçalho de sets, prazo ao lado de Jogo N');
const oldConcentrated = W._isConcentratedTournament;
W._isConcentratedTournament = () => true;
const concentrated = card(UM, { category: 'Fem Light', court: 'Quadra 4' });
W._isConcentratedTournament = oldConcentrated;
const concHeader = concentrated.slice(concentrated.indexOf('class="sp-mc-head"'), concentrated.indexOf('class="sp-mc-acts"'));
must(concHeader.indexOf('Jogo 108') < concHeader.indexOf('data-match-time-status') &&
  (concHeader.match(/data-match-time-status/g) || []).length === 1 &&
  concHeader.includes('Fem Light'), 'evento concentrado: categoria uma vez abaixo de Jogo N e antes dos botões');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 480, height: 600 } });
  await p.setContent('<style>' + CSS + '</style><body style="background:#0b1220;padding:10px"><div style="width:400px">' + jogado + '</div></body>');
  const r = await p.evaluate(() => {
    const y = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().top : null; };
    const ttl = document.querySelector('.sp-set-head-ttl'), slot = document.querySelector('[data-match-time-status]');
    return { jogo: y('[id^="card-"] span'), ttl: y('.sp-set-head-ttl'), slot: y('[data-match-time-status]'), sets: y('.sp-set-head-sets'),
      ttlCorta: ttl.scrollWidth > ttl.clientWidth + 1, slotCorta: slot.scrollWidth > slot.clientWidth + 1 };
  });
  await b.close();
  must(r.slot < r.ttl && r.ttl < r.sets, 'na tela: prazo no cabeçalho, formato abaixo e depois SETS (' + [r.slot, r.ttl, r.sets].map(Math.round).join(' < ') + 'px)');
  must(!r.ttlCorta && !r.slotCorta, 'nenhuma das duas linhas corta a 400px');
  console.log('\n✅ formato sobe e linha do tempo desce — ' + ok + ' verificações');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
