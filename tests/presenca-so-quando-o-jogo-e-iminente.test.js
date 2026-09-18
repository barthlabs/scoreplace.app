'use strict';
/* ⛔ "PARCIAL" NÃO APARECE EM JOGO QUE NÃO ACONTECE NAS PRÓXIMAS HORAS (18/set/2026)
 * Relato do dono (print do Confra, prazo 16/10): "passa a ideia errada de que há algo parcial
 * num jogo que não acontecerá nas próximas horas ou dias". Presença é informação de torneio
 * de UM DIA ou de jogo com horário marcado nas próximas 24h. */
const assert = require('assert/strict');
const H = require('./render-harness'); const W = H.window;
let ok = 0; const must = (c, m) => { assert.ok(c, m); ok++; console.log('  ✓ ' + m); };
console.log('\n──── presença só quando o jogo é iminente ────\n');
function cenario(datas, extra) {
  const t = H.buildDupla(8); Object.assign(t, datas, extra || {});
  W.AppStore.currentUser = { uid: 'org1', email: 'org@test.com', displayName: 'Org' };
  W.AppStore.isOrganizer = function () { return true; }; W.AppStore.tournaments = [t];
  const m = W._collectAllMatches(t).find(j => j && j.p1 && j.p2 && j.p1 !== 'TBD' && j.p2 !== 'TBD' && !j.winner);
  t.checkedIn = {}; String(m.p1).split('/').map(s => s.trim()).forEach(n => { t.checkedIn[n] = true; });
  return { t, m, html: String(W.renderMatchCard(m, true, t.id, 1)) };
}
const umDia = cenario({ startDate: '2026-09-20T09:00', endDate: '2026-09-20T18:00' });
must(/PARCIAL|Parcial|PRONTOS|Prontos/.test(umDia.html.replace(/<[^>]+>/g, ' ')) || /#f59e0b|#10b981/.test(umDia.html),
  '① torneio de UM DIA com um lado presente: o card mostra a presença (parcial/prontos)');
const longo = cenario({ startDate: '2026-08-02T19:00', endDate: '2026-11-12T23:00' });
must(!/PARCIAL|Parcial/.test(longo.html.replace(/<[^>]+>/g, ' ')), '② ⭐⭐ torneio de semanas, jogo sem horário: NADA de "parcial"');
const marcado = cenario({ startDate: '2026-08-02T19:00', endDate: '2026-11-12T23:00' });
marcado.m.scheduledAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
const html3 = String(W.renderMatchCard(marcado.m, true, marcado.t.id, 1));
must(/PARCIAL|Parcial|PRONTOS|Prontos/.test(html3.replace(/<[^>]+>/g, ' ')) || /#f59e0b|#10b981/.test(html3),
  '③ mesmo torneio longo, jogo marcado para daqui a 3h: a presença volta a aparecer');
const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
const i = src.indexOf('<span title="proposto por');
must(i > 0 && /white-space:normal/.test(src.slice(i, i + 400)) && !/text-overflow:ellipsis/.test(src.slice(i, i + 400)),
  '④ "proposto por" quebra linha em vez de cortar o nome (o "há quanto tempo" fica visível)');
console.log('\n✅ ' + ok + ' verificações');
