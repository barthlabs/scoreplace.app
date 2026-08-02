/* CRONÔMETRO DA RODADA — o "null null 0s" e a regressiva pro FIM DA RODADA.
 * node tests/liga-countdown-round-end.test.js
 *
 * DOIS BUGS reportados pelo dono (ago/2026), com print do card do torneio:
 *
 *  [BUG-1] o box do cronômetro mostrava literalmente "null null 0s".
 *  [BUG-2] depois do sorteio automático, o relógio não era a REGRESSIVA pro fim da rodada
 *          (o tempo que as pessoas têm pra jogar e lançar os placares).
 *
 * O FIXTURE É O DADO REAL DE PRODUÇÃO, lido via REST antes de mexer no código:
 * `tour_1785679864738_sb` — "(SB) Confra BT Alta da Clínica 2026", Liga multifase
 * (Rei/Rainha → Eliminatória), fase 0 sorteada com 78 jogos e ZERO placar/startedAt,
 * drawIntervalDays null (sorteio ÚNICO, já disparado), startDate 02/08 19:00,
 * endDate 31/08 23:00 — nenhuma das 2 fases com data própria.
 *
 * CADEIA DO [BUG-1] (medida, não deduzida): sem nenhum m.startedAt, o início da rodada cai
 * no horário PROGRAMADO do sorteio (02/08 19:00) — que naquele momento ainda estava no
 * FUTURO (o dono olhava o card às 12h). Aí:
 *   _ligaCountdownEvent → kind 'round-in-progress' (ts/labelKey/icon = null, box próprio)
 *   _ligaRoundInProgressRow → '' (não dá pra mostrar "decorrido" de algo que não começou)
 *   dashboard.js → NÃO retornava no branch do 'round-in-progress' quando a linha vinha
 *   vazia; caía no render genérico → icon null + _t(null) null + _formatCountdown(null-now)
 *   '0s'  ⇒  "null null 0s". O detalhe (tournaments.js) tinha o mesmo helper e NÃO tinha o
 *   buraco — a prova de que duas cópias do mesmo render divergem. Por isso o box agora é
 *   UMA função só (_ligaCountdownBoxHtml), exercitada aqui nos dois tamanhos.
 */
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const HOUR = 3600000, D = 86400000;
function iso(ms) { var d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); }

// _photoReadBox vive no store.js (não carregado no headless) — o box tem fallback próprio,
// mas o stub deixa explícito que a tarja escura é a mesma dos dois render sites.
W._photoReadBox = W._photoReadBox || function () { return { bg: 'rgba(0,0,0,0.5)', fg: '#f1f5f9', border: 'rgba(255,255,255,0.12)' }; };

ok(typeof W._roundScheduledEndTs === 'function', '_roundScheduledEndTs existe');
ok(typeof W._currentRoundHasPendingGames === 'function', '_currentRoundHasPendingGames existe');
ok(typeof W._ligaCountdownBoxHtml === 'function', '_ligaCountdownBoxHtml existe (render ÚNICO)');

// ─── O TORNEIO REAL DO PRINT ────────────────────────────────────────────────────────────
// Reproduz o instante do relato: sorteio JÁ FEITO, horário programado da rodada AINDA no
// futuro (o dono viu o card ~7h antes das 19h), prazo da rodada = 31/08 23:00.
function confraSB(nowMs, drawAtMs, endMs) {
  const matches = [];
  for (let i = 0; i < 78; i++) matches.push({ id: 'm' + i, p1: 'A' + i + ' / B' + i, p2: 'C' + i + ' / D' + i });
  return {
    id: 'tour_1785679864738_sb', name: '(SB) Confra BT Alta da Clínica 2026',
    format: 'Liga', status: 'active', currentPhaseIndex: 0,
    drawManual: false, drawIntervalDays: null,
    drawFirstDate: iso(drawAtMs).slice(0, 10), drawFirstTime: iso(drawAtMs).slice(11),
    startDate: iso(drawAtMs), endDate: iso(endMs),
    phases: [
      { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', rounds: 1, reiRainha: true, drawMode: 'rei_rainha', drawFirstDate: iso(drawAtMs).slice(0, 10), drawFirstTime: iso(drawAtMs).slice(11), drawIntervalDays: null },
      { name: 'Eliminatória', formatCode: 'elim_simples', format: 'Eliminatórias Simples', rounds: 1, drawFirstDate: '', drawIntervalDays: null },
    ],
    rounds: [{ round: 1, matches: matches }],   // sorteada, ZERO placar e ZERO startedAt
    matches: [],
  };
}

(function () {
  const now = Date.now();
  const drawAt = now + 7 * HOUR;        // rodada programada pras 19h; são ~12h
  const endAt = now + 29 * D;           // 31/08 23:00
  const t = confraSB(now, drawAt, endAt);

  // A CADEIA que produzia o "null null 0s" (com o código anterior):
  ok(W._ligaCurrentRoundStartTs(t) > now, '[cadeia] início da rodada cai no horário PROGRAMADO, ainda no futuro');
  ok(W._ligaRoundInProgressRow(t, '#fff') === '', '[cadeia] "Rodada em andamento" não tem o que mostrar (rodada não começou)');

  const e = W._ligaCountdownEvent(t);
  ok(e && e.kind === 'round-end', '[BUG-2] sorteado + rodada com jogo pendente → round-end (regressiva) — got ' + (e && e.kind));
  ok(e && e.ts === new Date(t.endDate).getTime(), '[BUG-2] a regressiva mira o FIM DA RODADA (31/08 23:00) — got ' + (e && new Date(e.ts).toString()));
  ok(e && e.labelKey === 'tourn.roundEnd' && e.icon === '⏳', '[BUG-2] rótulo "Fim da rodada" com ⏳ — got ' + (e && e.labelKey + '/' + e.icon));

  // [BUG-1] O HTML: nos DOIS tamanhos, nunca "null", nunca "0s" fantasma.
  ['sm', 'lg'].forEach(function (sz) {
    const html = W._ligaCountdownBoxHtml(t, sz);
    ok(html && html.indexOf('null') === -1, '[BUG-1/' + sz + '] o box NÃO contém "null" — got ' + String(html).slice(0, 120));
    ok(html.indexOf('>0s<') === -1, '[BUG-1/' + sz + '] o box NÃO mostra "0s" com prazo a 29 dias');
    ok(html.indexOf('data-countdown-target="' + e.ts + '"') > -1, '[BUG-1/' + sz + '] o ticker aponta pro fim da rodada');
    ok(html.indexOf('undefined') === -1, '[BUG-1/' + sz + '] o box NÃO contém "undefined"');
  });
})();

// ─── [BUG-1 raiz] evento SEM alvo nunca vira box genérico ───────────────────────────────
// Trava a regra, não só o sintoma: qualquer estado que chegue ao render sem ts/rótulo tem
// que devolver '' — jamais desenhar a caixa com os campos vazios.
(function () {
  const real = W._ligaCountdownEvent;
  W._ligaCountdownEvent = function () { return { ts: null, labelKey: null, icon: null, color: null, kind: 'round-in-progress' }; };
  const t = { id: 'x', format: 'Liga', rounds: [] }; // sem rodada → _ligaRoundInProgressRow devolve ''
  ['sm', 'lg'].forEach(function (sz) {
    ok(W._ligaCountdownBoxHtml(t, sz) === '', '[BUG-1 raiz/' + sz + '] evento vazio → box VAZIO (nunca "null null 0s")');
  });
  // idem pra um kind desconhecido que venha sem alvo (defesa contra estado futuro)
  W._ligaCountdownEvent = function () { return { ts: null, labelKey: 'tourn.nextDraw', icon: '🎲', color: '#fb923c', kind: 'next-draw' }; };
  ok(W._ligaCountdownBoxHtml(t, 'sm') === '', '[BUG-1 raiz] regressiva sem ts → box VAZIO');
  W._ligaCountdownEvent = real;
})();

// ─── PRAZO: de onde ele sai, na ordem ───────────────────────────────────────────────────
(function () {
  const now = Date.now();
  const base = () => ({
    id: 'p', format: 'Liga', drawManual: true, currentPhaseIndex: 0,
    startDate: iso(now - D), endDate: iso(now + 20 * D),
    phases: [{ formatCode: 'liga', rounds: 2 }, { formatCode: 'elim_simples', rounds: 1 }],
    rounds: [{ round: 1, matches: [{ p1: 'A / B', p2: 'C / D' }] }],
  });
  // fase inicial SEM fim próprio → t.endDate é o fim dela (cânone v1.6.80)
  ok(W._roundScheduledEndTs(base()) === new Date(iso(now + 20 * D)).getTime(), '[prazo] fase inicial sem fim próprio → t.endDate');

  // fim CONFIGURADO na fase manda sobre o t.endDate
  const t2 = base();
  t2.phases[0].endDate = iso(now + 5 * D).slice(0, 10); t2.phases[0].endTime = '21:30';
  ok(W._roundScheduledEndTs(t2) === new Date(iso(now + 5 * D).slice(0, 10) + 'T21:30').getTime(), '[prazo] fim da FASE vence o fim do torneio');

  // data sem hora = FIM DO DIA (prazo é o fim do dia, não meio-dia)
  const t3 = base(); t3.endDate = '2026-12-31';
  ok(W._roundScheduledEndTs(t3) === new Date('2026-12-31T23:59:59').getTime(), '[prazo] data sem hora → 23:59:59');

  // sem NENHUMA data → null (não inventa prazo estimado)
  const t4 = base(); t4.endDate = ''; delete t4.phases[0].endDate;
  ok(W._roundScheduledEndTs(t4) == null, '[prazo] sem data configurada → null (nada de prazo inventado)');
  const e4 = W._ligaCountdownEvent(t4);
  ok(e4 && e4.kind !== 'round-end', '[prazo] sem prazo → NÃO promete regressiva (volta pro decorrido) — got ' + (e4 && e4.kind));
})();

// ─── A rodada 100% lançada NÃO conta prazo (não há mais o que jogar) ────────────────────
(function () {
  const now = Date.now();
  const t = {
    id: 'done', format: 'Liga', drawManual: true, currentPhaseIndex: 0,
    startDate: iso(now - 2 * D), endDate: iso(now + 20 * HOUR),
    phases: [{ formatCode: 'liga', rounds: 1 }],
    rounds: [{ round: 1, matches: [{ p1: 'A / B', p2: 'C / D', winner: 'A / B', startedAt: now - 2 * HOUR, resultAt: now - HOUR }] }],
  };
  ok(W._currentRoundHasPendingGames(t) === false, '[encerrada] rodada com todos os placares → sem jogo pendente');
  const e = W._ligaCountdownEvent(t);
  ok(e && e.kind === 'tournament-end', '[encerrada] rodada lançada + fim ≤48h → volta a ser tournament-end — got ' + (e && e.kind));
})();

// ─── Folga/BYE não seguram a rodada aberta ──────────────────────────────────────────────
(function () {
  const now = Date.now();
  const t = {
    id: 'sit', format: 'Liga', drawManual: true, currentPhaseIndex: 0,
    startDate: iso(now - 2 * D), endDate: iso(now + 10 * D),
    phases: [{ formatCode: 'liga', rounds: 1 }],
    rounds: [{ round: 1, matches: [
      { p1: 'A / B', p2: 'C / D', winner: 'A / B', resultAt: now - HOUR },
      { p1: 'E / F', isSitOut: true },
      { p1: 'G / H', p2: 'BYE', isBye: true },
    ] }],
  };
  ok(W._currentRoundHasPendingGames(t) === false, '[folga] só sobrou folga/BYE → rodada NÃO está pendente');
})();

// ─── Prazo VENCIDO não vira regressiva ──────────────────────────────────────────────────
(function () {
  const now = Date.now();
  const t = {
    id: 'late', format: 'Liga', drawManual: true, currentPhaseIndex: 0,
    startDate: iso(now - 10 * D), endDate: iso(now - 2 * D),   // prazo já passou
    phases: [{ formatCode: 'liga', rounds: 1 }],
    rounds: [{ round: 1, matches: [{ p1: 'A / B', p2: 'C / D', startedAt: now - 3 * D }] }],
  };
  ok(W._roundScheduledEndTs(t) < now, '[vencido] o prazo está no passado');
  const e = W._ligaCountdownEvent(t);
  ok(e && e.kind !== 'round-end', '[vencido] prazo passado → NÃO conta regressiva pro passado — got ' + (e && e.kind));
})();

// ─── 2ª linha: a rodada rolando continua VISÍVEL dentro do box da regressiva ────────────
(function () {
  const now = Date.now();
  const t = {
    id: 'both', format: 'Liga', drawManual: true, currentPhaseIndex: 0,
    startDate: iso(now - 2 * D), endDate: iso(now + 10 * D),
    phases: [{ formatCode: 'liga', rounds: 1 }],
    rounds: [{ round: 1, matches: [{ p1: 'A / B', p2: 'C / D', startedAt: now - 3 * HOUR }] }],
  };
  const e = W._ligaCountdownEvent(t);
  ok(e && e.kind === 'round-end', '[2ª linha] rodada JÁ começada + prazo futuro → round-end — got ' + (e && e.kind));
  const html = W._ligaCountdownBoxHtml(t, 'lg');
  ok(html.indexOf('data-countdown-target=') > -1, '[2ª linha] o número principal é a REGRESSIVA do prazo');
  ok(html.indexOf('data-elapsed-since=') > -1, '[2ª linha] e o DECORRIDO da rodada continua no box (nada some)');
  ok(html.indexOf('Rodada em andamento') > -1, '[2ª linha] com o rótulo "Rodada em andamento"');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' liga-countdown-round-end: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
