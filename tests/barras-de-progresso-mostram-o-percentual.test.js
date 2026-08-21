/* O PERCENTUAL MORA DENTRO DA BARRA (as três: realizado, previsto, torneio completo).
 * node tests/barras-de-progresso-mostram-o-percentual.test.js
 *
 * PEDIDO DO DONO (21/ago/2026, com print do card em andamento):
 *   _"vamos enriquecer essas barras de progresso com os percentuais. As barras precisam ter
 *   mais altura para caber nelas o percentual de cada uma alinhado na direita de onde a cor
 *   já chegou. No torneio completo coloca 20% alinhado com o roxo (dentro do roxo). A mesma
 *   coisa na barra vermelha (realizado) e na azul (programado). Assim saberemos que ocorreu
 *   38% dos jogos da rodada atual e saberemos uma novidade que é quantos % deveria ter
 *   ocorrido."_
 *
 * A NOVIDADE é a AZUL: sozinha, a vermelha diz "38% jogado" e não explica por que o relógio
 * está vermelho. Com o percentual do TEMPO REGULAMENTAR na azul, o card entrega a conta que
 * faltava: 38% feito contra o que já deveria estar feito a esta altura.
 *
 * O que este teste trava:
 *   1) as TRÊS barras carregam o próprio percentual (nenhuma fica muda);
 *   2) o número é o MESMO da barra — a azul NÃO repete o número da vermelha;
 *   3) o rótulo termina exatamente onde a cor termina (width = pct% no span de dentro);
 *   4) percentual pequeno SAI pra fora da cor (senão ficaria espremido/cortado);
 *   5) altura: as barras cresceram pra caber o número (>= 16px).
 */
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const D = 86400000, HOUR = 3600000, MIN = 60000;
const iso = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const hhmm = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()); };
W._photoReadBox = W._photoReadBox || function () { return { bg: 'rgba(0,0,0,0.5)', fg: '#f1f5f9', border: 'rgba(255,255,255,0.12)' }; };

// o torneio do print: multifase, fase 0 em andamento, com prazo pra acabar
function confra(nowMs, fimFase0Ms, fimTorneioMs, nDone, nTotal) {
  const iniMs = nowMs - 8 * D;
  const matches = [];
  for (let i = 0; i < nTotal; i++) {
    const m = { id: 'm' + i, p1: 'A' + i + ' / B' + i, p2: 'C' + i + ' / D' + i, startedAt: iniMs + i * MIN };
    if (i < nDone) { m.winner = m.p1; m.resultAt = iniMs + i * MIN + 30 * MIN; }
    matches.push(m);
  }
  return {
    id: 'tour_pct', name: '(SB) Confra BT', format: 'Liga', status: 'active', currentPhaseIndex: 0,
    drawManual: false, drawIntervalDays: null,
    startDate: iso(iniMs), startTime: hhmm(iniMs), endDate: iso(fimFase0Ms), endTime: hhmm(fimFase0Ms),
    phases: [
      { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', rounds: 1, reiRainha: true, drawMode: 'rei_rainha', startDate: iso(iniMs), startTime: hhmm(iniMs), endDate: iso(fimFase0Ms), endTime: hhmm(fimFase0Ms) },
      { name: 'Eliminatória', formatCode: 'elim_simples', format: 'Eliminatórias Simples', rounds: 1, startDate: iso(fimFase0Ms), startTime: '08:00', endDate: iso(fimTorneioMs), endTime: hhmm(fimTorneioMs) },
    ],
    rounds: [{ round: 1, matches: matches }], matches: [],
  };
}

// lê as barras do HTML: track (altura) + fill (width da cor) + rótulo (texto e se é de dentro)
function barras(html) {
  const re = /<div style="position:relative;width:100%;height:(\d+)px;[^"]*"><div style="width:(\d+)%;[^"]*"><\/div><span style="([^"]*)">(\d+)%<\/span><\/div>/g;
  const out = []; let m;
  while ((m = re.exec(html))) {
    const st = m[3];
    const dentroW = /left:0;width:(\d+)%/.exec(st);
    out.push({ h: +m[1], fill: +m[2], pct: +m[4], dentro: !!dentroW, larguraDoRotulo: dentroW ? +dentroW[1] : null, style: st });
  }
  return out;
}

const now = Date.now();
const fimFase0 = now + 11 * D + 10 * HOUR;
const fimTorneio = now + 84 * D + 10 * HOUR;

ok(typeof W._progBarPct === 'function', '_progBarPct existe (FONTE ÚNICA das três barras)');

// ─── 1) as três barras carregam o próprio percentual ───────────────────────────────────
(function () {
  const t = confra(now, fimFase0, fimTorneio, 39, 102);
  const html = W._buildProgressInner(t);
  const bs = barras(html);
  ok(bs.length === 3, 'as TRÊS barras (realizado, previsto, torneio completo) trazem percentual — got ' + bs.length);
  if (bs.length !== 3) return;

  ok(bs[0].pct === 38, '[realizado] o número é o da BARRA (39/102 = 38%) — got ' + bs[0].pct + '%');
  ok(bs[0].pct === bs[0].fill, '[realizado] rótulo e cor falam o MESMO número');
  ok(bs[1].pct === bs[1].fill, '[previsto] rótulo e cor falam o MESMO número');
  ok(bs[2].pct === bs[2].fill, '[torneio completo] rótulo e cor falam o MESMO número');

  // A NOVIDADE: a azul mede TEMPO, não jogos — não pode ser um eco da vermelha.
  ok(bs[1].style.indexOf('#3b82f6') > -1 || bs[1].h === 16, '[previsto] é a barra azul do tempo regulamentar');
  ok(bs[1].pct !== bs[0].pct, '[previsto] diz quanto DEVERIA ter ocorrido — número próprio, não cópia do realizado (' + bs[0].pct + '% vs ' + bs[1].pct + '%)');

  // 3) alinhado na direita de onde a cor chegou: o span de dentro tem a MESMA largura da cor
  bs.forEach(function (b, i) {
    ok(b.dentro, '[' + i + '] com ' + b.pct + '% o rótulo fica DENTRO da cor');
    ok(b.larguraDoRotulo === b.fill, '[' + i + '] o rótulo termina exatamente onde a cor termina');
    ok(b.style.indexOf('justify-content:flex-end') > -1, '[' + i + '] colado na DIREITA do preenchimento');
  });

  // 5) altura: cresceu pra caber o número (era 11px/7px/8px)
  ok(bs[0].h >= 18, '[realizado] barra mais alta pra caber o número — got ' + bs[0].h + 'px');
  ok(bs[1].h >= 16, '[previsto] barra mais alta pra caber o número — got ' + bs[1].h + 'px');
  ok(bs[2].h >= 18, '[torneio completo] barra mais alta pra caber o número — got ' + bs[2].h + 'px');
})();

// ─── 2) começo do torneio: o número SAI pra fora da cor (não espreme nem corta) ─────────
(function () {
  const t = confra(now, fimFase0, fimTorneio, 3, 102);
  const bs = barras(W._buildProgressInner(t));
  ok(bs.length === 3, '[3%] as três barras seguem rotuladas — got ' + bs.length);
  const real = bs[0];
  ok(real.pct === 3, '[3%] o número é 3% — got ' + real.pct);
  ok(!real.dentro, '[3%] com a cor curta o rótulo SAI pra fora (dentro ele ficaria cortado)');
  ok(real.style.indexOf('left:3%') > -1, '[3%] e começa logo depois da ponta da cor');
  ok(real.style.indexOf('color:#fff') === -1, '[3%] fora da cor o número NÃO é branco (fundo é a trilha, não a barra)');
})();

// ─── 3) 100%: o número continua dentro, e branco ────────────────────────────────────────
(function () {
  const t = confra(now, fimFase0, fimTorneio, 102, 102);
  const bs = barras(W._buildProgressInner(t));
  ok(bs[0].pct === 100 && bs[0].dentro, '[100%] rodada cheia → 100% dentro da cor');
  ok(bs[0].style.indexOf('color:#fff !important') > -1, '[100%] branco com !important (vence a tarja de foto, que força a cor do texto da seção)');
})();

// ─── 4) barra "pobre" (sem janela programada) também é rotulada ─────────────────────────
(function () {
  const t = confra(now, fimFase0, fimTorneio, 39, 102);
  delete t.startDate; delete t.startTime; delete t.endDate; delete t.endTime;
  t.phases.forEach(function (p) { delete p.startDate; delete p.startTime; delete p.endDate; delete p.endTime; });
  const bs = barras(W._buildProgressInner(t));
  ok(bs.length >= 1, '[sem janela] a barra simples também carrega o percentual — got ' + bs.length);
  if (bs.length) ok(bs[0].pct === bs[0].fill, '[sem janela] rótulo e cor falam o mesmo número');
})();

console.log('\n  ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
