/* O RELÓGIO DO MEIO: REGRESSIVA quando existe FIM PROGRAMADO.
 * node tests/progresso-regressiva-fim-programado.test.js
 *
 * RELATO DO DONO (20/ago/2026, com print do card do torneio em andamento):
 *   _"na tela de torneio em andamento, tanto no card de RODADA quanto no de TORNEIO
 *   COMPLETO, o campo central do tempo hoje mostra SEMPRE 'DECORRIDO'. Se a fase/torneio
 *   tem data e hora de fim programado, calcule o tempo restante a partir de agora até esse
 *   fim e exiba contagem REGRESSIVA ao vivo, decrementando a cada segundo. Se não existe
 *   data de fim programado, mantém como está."_
 *
 * No print: RODADA 1 com FINAL PROGRAMADO 23:00 31/08 e TORNEIO COMPLETO com FIM
 * PROGRAMADO 23:00 12/11 — os dois mostravam DECORRIDO contando pra cima.
 *
 * SÃO DOIS RENDERIZADORES no mesmo `_buildProgressInner` (o painel da RODADA e o painel
 * roxo do TORNEIO COMPLETO). Consertar um só deixa metade do defeito de pé — foi o que a
 * verificação da 1.7.84 pegou quando o relógio ganhou 2 linhas. Este teste exige os DOIS.
 *
 * E exige o que faz o número ANDAR: `data-sp-cd2l`. O painel inteiro é repintado pelo
 * `_progressTick` a cada 5s (1.9.80) — sem o atributo, os segundos pulariam de 5 em 5.
 */
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const D = 86400000, HOUR = 3600000, MIN = 60000;
function iso(ms) { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function hhmm(ms) { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()); }

// _tournamentDateRange vive no store.js (fora do headless); _tournamentScheduledWindow tem
// fallback próprio com a MESMA regra — é ele que roda aqui.
W._photoReadBox = W._photoReadBox || function () { return { bg: 'rgba(0,0,0,0.5)', fg: '#f1f5f9', border: 'rgba(255,255,255,0.12)' }; };

// ─── O TORNEIO DO PRINT ─────────────────────────────────────────────────────────────────
// Multifase (Rei/Rainha → Eliminatória), fase 0 EM ANDAMENTO com placares lançados,
// fim da fase 0 daqui a ~11 dias (o "31/08 23:00") e fim da fase 1 daqui a ~84 dias
// (o "12/11 23:00"). Jogos com startedAt/resultAt = a rodada COMEÇOU (senão o painel
// entra em "⏳ Aguardando início" e não há relógio nenhum).
function confra(nowMs, fimFase0Ms, fimTorneioMs) {
  const iniMs = nowMs - 2 * D;
  const matches = [];
  for (let i = 0; i < 20; i++) {
    const m = { id: 'm' + i, p1: 'A' + i + ' / B' + i, p2: 'C' + i + ' / D' + i, startedAt: iniMs + i * MIN };
    if (i < 8) { m.winner = m.p1; m.resultAt = iniMs + i * MIN + 30 * MIN; }
    matches.push(m);
  }
  return {
    id: 'tour_regressiva', name: '(SB) Confra BT Alta da Clínica 2026',
    format: 'Liga', status: 'active', currentPhaseIndex: 0,
    drawManual: false, drawIntervalDays: null,
    startDate: iso(iniMs), startTime: hhmm(iniMs),
    endDate: iso(fimFase0Ms), endTime: hhmm(fimFase0Ms),
    phases: [
      { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', rounds: 1, reiRainha: true, drawMode: 'rei_rainha',
        startDate: iso(iniMs), startTime: hhmm(iniMs), endDate: iso(fimFase0Ms), endTime: hhmm(fimFase0Ms) },
      { name: 'Eliminatória', formatCode: 'elim_simples', format: 'Eliminatórias Simples', rounds: 1,
        startDate: iso(fimFase0Ms), startTime: '08:00', endDate: iso(fimTorneioMs), endTime: hhmm(fimTorneioMs) },
    ],
    rounds: [{ round: 1, matches: matches }],
    matches: [],
  };
}

const now = Date.now();
const fimFase0 = now + 11 * D + 10 * HOUR;    // o "31/08 23:00" do print
const fimTorneio = now + 84 * D + 10 * HOUR;  // o "12/11 23:00" do print

ok(typeof W._tProgClock2L === 'function', '_tProgClock2L existe (FONTE ÚNICA dos 2 relógios)');

// ─── 1) COM fim programado → REGRESSIVA nos DOIS painéis ────────────────────────────────
(function () {
  const t = confra(now, fimFase0, fimTorneio);
  const html = W._buildProgressInner(t);

  ok(html.indexOf('Aguardando início') === -1, '[pré] a fase começou (senão não há relógio pra testar)');

  const alvos = [];
  html.replace(/data-sp-cd2l="(\d+)"/g, function (_, n) { alvos.push(parseInt(n)); return _; });
  ok(alvos.length === 2, '[DOIS renderizadores] RODADA e TORNEIO COMPLETO viram regressiva — got ' + alvos.length);

  const fimFase0Esperado = new Date(iso(fimFase0) + 'T' + hhmm(fimFase0)).getTime();
  const fimTornEsperado = new Date(iso(fimTorneio) + 'T' + hhmm(fimTorneio)).getTime();
  ok(alvos.indexOf(fimFase0Esperado) > -1, '[RODADA] a regressiva mira o FINAL PROGRAMADO da fase (' + new Date(fimFase0Esperado).toLocaleString('pt-BR') + ')');
  ok(alvos.indexOf(fimTornEsperado) > -1, '[TORNEIO COMPLETO] a regressiva mira o FIM PROGRAMADO do torneio (' + new Date(fimTornEsperado).toLocaleString('pt-BR') + ')');

  const nRest = (html.match(/>restante</g) || []).length;
  ok(nRest === 2, '[rótulo] os DOIS campos dizem "restante" — got ' + nRest);
  ok(html.indexOf('>decorrido<') === -1, '[rótulo] e NENHUM ainda diz "decorrido"');

  // O texto renderizado tem que ser o tempo QUE FALTA (11d …), não o decorrido (2d …).
  ok(/>11d \d+h</.test(html), '[valor] o número mostrado é o que FALTA (11d …h), não o decorrido');
  ok(!/>2d \d+h</.test(html), '[valor] e o decorrido (2d) não sobrou em lugar nenhum do relógio');
})();

// ─── 2) SEM fim programado → segue DECORRIDO (nada muda) ────────────────────────────────
(function () {
  const t = confra(now, fimFase0, fimTorneio);
  delete t.endDate; delete t.endTime;
  t.phases.forEach(function (p) { delete p.endDate; delete p.endTime; });
  const html = W._buildProgressInner(t);
  ok(html.indexOf('data-sp-cd2l') === -1, '[sem prazo] nenhuma regressiva — prazo estimado por tempo de quadra é promessa inventada');
  ok(html.indexOf('>decorrido<') > -1, '[sem prazo] o campo central continua DECORRIDO');
})();

// ─── 3) Prazo JÁ VENCIDO → volta pro decorrido (não trava em "0s restante") ─────────────
(function () {
  const t = confra(now, now - 1 * HOUR, now - 1 * HOUR);
  const html = W._buildProgressInner(t);
  ok(html.indexOf('data-sp-cd2l') === -1, '[vencido] sem regressiva depois do prazo');
  ok(html.indexOf('>decorrido<') > -1, '[vencido] volta a mostrar o DECORRIDO ("0s restante" parado não informa nada)');
})();

// ─── 4) Torneio ENCERRADO → congela em "durou" (regressiva não ressuscita) ──────────────
(function () {
  const t = confra(now, fimFase0, fimTorneio);
  t.status = 'finished'; t.finishedAt = now - HOUR;
  t.rounds[0].matches.forEach(function (m, i) { m.winner = m.p1; m.resultAt = now - 2 * HOUR + i * MIN; });
  const html = W._buildProgressInner(t);
  ok(html.indexOf('data-sp-cd2l') === -1, '[encerrado] relógio congelado — nenhuma regressiva');
  ok(html.indexOf('>durou<') > -1, '[encerrado] o campo central diz "durou"');
})();

// ─── 5) O helper isolado, nas 4 esquinas ───────────────────────────────────────────────
(function () {
  const alvo = now + 3 * D;
  const a = W._tProgClock2L(alvo, false, 5000, 'decorrido');
  ok(a.label === 'restante' && a.attr.indexOf('data-sp-cd2l="' + alvo + '"') > -1, '[helper] prazo futuro → restante + atributo do tique de 1s');
  ok(W._tProgClock2L(alvo, true, 5000, 'durou').label === 'durou', '[helper] congelado → mantém o rótulo de duração');
  ok(W._tProgClock2L(now - 1000, false, 5000, 'decorrido').label === 'decorrido', '[helper] prazo vencido → decorrido');
  ok(W._tProgClock2L(null, false, 5000, 'decorrido').label === 'decorrido', '[helper] sem prazo → decorrido');
})();

console.log((fail ? '✗' : '✓') + ' regressiva do fim programado: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
