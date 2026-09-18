'use strict';
/* ⭐ 2.3.83 · Ordem do dono (18/set/2026): no card canônico de jogo (chave, Novidades,
   Últimos Resultados, Próximo Jogo), "Melhor de 3 · 0 × 2" fica logo abaixo de "Jogo N" e a
   linha do tempo ("Jogado em" / "Agendado" / "Jogar até") desce para o cabeçalho de sets.
   Card de set único não muda: a linha do tempo segue sob "Jogo N". */
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
must(iJogo > -1 && iTtl > iJogo && iTtl < iHead, 'melhor de 3: "Melhor de 3 · 0 × 2" vem logo depois de "Jogo 108", antes do cabeçalho de sets');
must(iSlot > iHead && /Jogado em/.test(jogado), 'e "Jogado em" mora dentro do cabeçalho de sets, como primeira linha');
must((jogado.match(/data-match-time-status/g) || []).length === 1, 'a linha do tempo continua sendo UM slot só (atualização ao vivo intacta)');
const umSet = card(UM, { resultAt: Date.UTC(2026, 8, 18, 14, 48), winner: 'Fernando Cerri / Monique Monteux', scoreP1: 4, scoreP2: 6 });
must(umSet.indexOf('sp-set-head') === -1 && umSet.indexOf('data-match-time-status') > umSet.indexOf('Jogo 108'), 'set único: sem cabeçalho de sets, a linha do tempo segue sob "Jogo N"');
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
  must(r.ttl < r.slot && r.slot < r.sets, 'na tela: formato acima, linha do tempo abaixo dele e acima de "SETS" (' + [r.ttl, r.slot, r.sets].map(Math.round).join(' < ') + 'px)');
  must(!r.ttlCorta && !r.slotCorta, 'nenhuma das duas linhas corta a 400px');
  console.log('\n✅ formato sobe e linha do tempo desce — ' + ok + ' verificações');
})().catch((e) => { console.error(e.stack || e); process.exit(1); });
