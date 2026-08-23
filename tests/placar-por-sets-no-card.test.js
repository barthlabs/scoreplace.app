/* MELHOR DE 3 E MELHOR DE 5 NO CARD: UMA COLUNA POR SET, CONFIRMADA UMA POR VEZ.
 *
 * ORDEM DO DONO (23/ago/2026): _"esses cards de jogos estão perfeitos para disputas de 1
 * set, mas aqui temos melhor de 3. nesse caso precisava de mais uma linha indicando melhor
 * de 3 - set 1 entre os botões e os nomes/placares. confirmou o placar do 1º set, esses
 * números ficam na esquerda do box para o placar do set 2 que fica zerado até receber o
 * placar do set 2. empatou em 1-1 os sets, o placar do set 1 na esquerda do placar do set 2
 * que por sua vez fica na esquerda do box para o Super Tie Break. Em cima dos box de placar
 * deve aparecer set 1, set 2, super tie-break (10), conforme o caso."_ E logo depois: _"já
 * escreva também o código canônico para a melhor de 5"_.
 *
 * O QUE ESTE TESTE TRAVA, nas quatro camadas em que a coisa pode quebrar:
 *
 *   ① A RÉGUA (window._matchSetPlan) — quais colunas existem, qual está em disputa, o
 *     rótulo e a largura de cada uma. Melhor de 3 e melhor de 5 saem da MESMA conta
 *     (setsToWin*2-1) e o super tie-break é sempre o DECISIVO — nada de caso especial.
 *   ② A DECISÃO — o Confirmar fecha O SET enquanto ninguém chegou a setsToWin, e fecha A
 *     PARTIDA quando chega. É aqui que mora o risco de o card encerrar um jogo no 1º set.
 *   ③ O QUE O PARCIAL GRAVA — `sets` e nada mais. Se ele escrever `winner`/`scoreP1`, a
 *     classificação passa a contar um jogo que ainda está sendo jogado.
 *   ④ A TELA — rótulo EM CIMA do box, medido em Chromium com o CSS real, nas duas linhas
 *     (os dois jogadores) e em todos os estados. E o card de 1 SET intacto.
 *
 * Roda com: node tests/placar-por-sets-no-card.test.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');
const H = require('./render-harness');
const W = H.window;

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (obtido: ' + JSON.stringify(a) + ')'); }

/* Os presets REAIS do form (create-tournament.js GSM_PRESETS). Copiar aqui seria inventar
   um formato que o app não oferece — então os valores são os de lá. */
const UM_SET   = { type: 'sets', setsToWin: 1, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, superTiebreak: false, superTiebreakPoints: 10 };
const MELHOR3  = { type: 'sets', setsToWin: 2, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, superTiebreak: true,  superTiebreakPoints: 10 };
const MELHOR5  = { type: 'sets', setsToWin: 3, gamesPerSet: 6, tiebreakEnabled: true, tiebreakPoints: 7, superTiebreak: true,  superTiebreakPoints: 10 };
const MELHOR3_SEM_STB = Object.assign({}, MELHOR3, { superTiebreak: false });
const BEACH_FIXO = { type: 'sets', setsToWin: 1, gamesPerSet: 6, fixedSet: true, tiebreakEnabled: true, superTiebreak: false };

const S = (a, b) => ({ gamesP1: a, gamesP2: b });
const rotulos = (plan) => plan.columns.map(function (c) { return c.label; });
const estados = (plan) => plan.columns.map(function (c) { return c.state; });

/* ── ① A RÉGUA ────────────────────────────────────────────────────────────────────── */
function regua() {
  console.log('\n① O plano de sets (window._matchSetPlan)');
  const plano = (sc, sets) => W._matchSetPlan(sc, { sets: sets || [] });

  ok(typeof W._matchSetPlan === 'function', 'window._matchSetPlan existe');

  // 1 SET — o card de hoje não muda em NADA
  ok(plano(UM_SET, []).multi === false, '1 set: multi=false (o card antigo segue intacto)');
  ok(plano(BEACH_FIXO, []).multi === false, 'Beach Tennis set fixo: multi=false');
  ok(plano(null, []).multi === false, 'torneio sem scoring: multi=false');

  // MELHOR DE 3 — a progressão que o dono descreveu
  let p = plano(MELHOR3, []);
  ok(p.multi === true && p.bestOf === 3, 'melhor de 3: multi=true, bestOf=3');
  eq(rotulos(p), ['Set 1'], 'sem set jogado: só a coluna do Set 1');
  eq(estados(p), ['live'], 'e ela está EM DISPUTA');
  eq(p.headline, 'Melhor de 3 · Set 1', 'a linha nova diz "Melhor de 3 · Set 1"');

  p = plano(MELHOR3, [S(6, 4)]);
  eq(rotulos(p), ['Set 1', 'Set 2'], 'set 1 confirmado: ele à esquerda, box do Set 2 à direita');
  eq(estados(p), ['done', 'live'], 'set 1 confirmado, set 2 em disputa');
  eq([p.setsWonP1, p.setsWonP2], [1, 0], 'sets ganhos 1×0');
  eq(p.headline, 'Melhor de 3 · Set 2', 'a linha nova acompanha o set em disputa');

  p = plano(MELHOR3, [S(6, 4), S(3, 6)]);
  eq(rotulos(p), ['Set 1', 'Set 2', 'STB (10)'], 'empatou 1-1: entra a coluna do super tie-break, rotulada STB (o nome inteiro já está na linha de cima)');
  eq(estados(p), ['done', 'done', 'live'], 'os dois sets à esquerda, o super tie-break em disputa');
  ok(p.columns[2].kind === 'stb' && p.columns[2].points === 10, 'a 3ª coluna é super tie-break de 10 pontos');

  p = plano(MELHOR3_SEM_STB, [S(6, 4), S(3, 6)]);
  eq(rotulos(p), ['Set 1', 'Set 2', 'Set 3'], 'sem super tie-break configurado, o decisivo é o Set 3');
  ok(p.columns[2].kind === 'set', 'e ele é um SET, não um tie-break');

  p = plano(MELHOR3, [S(6, 4), S(6, 3)]);
  ok(p.done === true && p.live === null, '2×0 fecha: não há mais coluna em disputa');
  eq(rotulos(p), ['Set 1', 'Set 2'], 'e sobram só os 2 sets jogados — nada de coluna fantasma');
  eq(p.headline, 'Melhor de 3 · 2 × 0', 'fechado, a linha mostra o placar de sets');

  // MELHOR DE 5 — mesma conta, sem caso especial
  p = plano(MELHOR5, []);
  ok(p.multi === true && p.bestOf === 5 && p.setsToWin === 3, 'melhor de 5: bestOf=5, setsToWin=3');
  eq(p.headline, 'Melhor de 5 · Set 1', 'a linha nova diz "Melhor de 5 · Set 1"');
  p = plano(MELHOR5, [S(6, 4), S(3, 6), S(6, 2)]);
  eq(rotulos(p), ['Set 1', 'Set 2', 'Set 3', 'Set 4'], '2×1 na de 5: quatro colunas, a 4ª em disputa');
  ok(p.columns[3].kind === 'set', 'o Set 4 ainda é um set comum');
  p = plano(MELHOR5, [S(6, 4), S(3, 6), S(6, 2), S(4, 6)]);
  eq(rotulos(p), ['Set 1', 'Set 2', 'Set 3', 'Set 4', 'STB (10)'],
    '2×2 na de 5: o 5º é que vira o super tie-break');
  p = plano(MELHOR5, [S(6, 4), S(3, 6), S(6, 2), S(6, 1)]);
  ok(p.done === true, '3×1 fecha a melhor de 5');

  // ⭐ O SUPER TIE-BREAK SÓ EXISTE SE A PARTIDA CHEGAR NO ÚLTIMO SET.
  // Correção do dono (23/ago/2026): _"em melhor de 3 se ganhar 2 não tem super tie-break;
  // em melhor de 5 se ganhar 3 não tem STB; assim, nem sempre o STB é o set decisivo e às
  // vezes nem tem STB."_ O set que DECIDE pode ser o 2 (2×0) ou o 4 (3×1) — sets comuns.
  const temStb = (sc, sets) => plano(sc, sets).columns.some(function (c) { return c.kind === 'stb'; });
  ok(temStb(MELHOR3, [S(6, 4), S(6, 3)]) === false, 'melhor de 3, 2×0: NÃO existe coluna de super tie-break');
  ok(temStb(MELHOR3, [S(6, 4)]) === false, 'melhor de 3, 1×0: ainda não — o Set 2 pode fechar');
  ok(temStb(MELHOR3, [S(6, 4), S(3, 6)]) === true, 'melhor de 3, 1-1: aí sim');
  ok(temStb(MELHOR5, [S(6, 4), S(6, 3), S(6, 2)]) === false, 'melhor de 5, 3×0: NÃO existe');
  ok(temStb(MELHOR5, [S(6, 4), S(3, 6), S(6, 2), S(6, 1)]) === false, 'melhor de 5, 3×1: NÃO existe');
  ok(temStb(MELHOR5, [S(6, 4), S(3, 6), S(6, 2)]) === false, 'melhor de 5, 2×1: ainda não — o Set 4 pode fechar');
  ok(temStb(MELHOR5, [S(6, 4), S(3, 6), S(6, 2), S(4, 6)]) === true, 'melhor de 5, 2-2: aí sim');
  eq(plano(MELHOR3, [S(6, 4), S(3, 6)]).headline, 'Melhor de 3 · Super Tie-Break',
    'e a linha de cima ANUNCIA o STB no instante em que empata');
  eq(plano(MELHOR5, [S(6, 4), S(3, 6), S(6, 2), S(4, 6)]).headline, 'Melhor de 5 · Super Tie-Break',
    'idem na melhor de 5');

  // LARGURA POR TIPO, nunca por estado — é o que mantém o rótulo em cima do box
  const antes = plano(MELHOR3, []).columns[0].w;
  const depois = plano(MELHOR3, [S(6, 4)]).columns[0].w;
  ok(antes === depois, 'a coluna do Set 1 mede IGUAL em disputa e confirmada (' + antes + 'px)');
}

/* ── ② A DECISÃO + ③ O QUE O PARCIAL GRAVA ────────────────────────────────────────── */
function decisao() {
  console.log('\n② O Confirmar fecha o SET; só o último fecha a PARTIDA');

  function cenario(scoring) {
    const m = { id: 'M1', p1: 'A / B', p2: 'C / D', round: 0, bracket: 'main' };
    const t = { id: 'T1', name: 'Teste', sport: 'Beach Tennis', scoring: scoring, matches: [m] };
    const est = { fechou: null, avisos: [], notas: [], txs: 0, payloads: [], erro: null };
    W.AppStore = W.AppStore || {};
    W.AppStore.tournaments = [t];
    W.AppStore.currentUser = { uid: 'org', displayName: 'Org' };
    W.AppStore.isOrganizer = function () { return true; };
    W.AppStore.commitTournamentTx = function (id, fn) { est.txs++; try { fn(t); } catch (e) {} return Promise.resolve(true); };
    // ⭐ commitResultTx é a porta da CF. O stub roda o MESMO `_applyResultToTournament` que
    // a CF roda sobre o doc fresco — então o que este teste exercita é o código do SERVIDOR
    // (o arquivo é vendorado por copy-vendor.js), não uma imitação dele.
    W.AppStore.commitResultTx = function (id, mid, payload, log) {
      est.txs++; est.payloads.push(payload);
      try { W._applyResultToTournament(t, mid, payload); } catch (e) { est.erro = e; }
      return Promise.resolve(true);
    };
    W.AppStore.logAction = function () {};
    W.showAlertDialog = function (titulo) { est.avisos.push(titulo); };
    W.showNotification = function (titulo) { est.notas.push(titulo); };
    W._rerenderBracket = function () {};
    W._commitSetsResult = function (tid, mid, sets, p1, p2) { est.fechou = { sets: sets, p1: p1, p2: p2 }; };
    est.t = t; est.m = m;
    est.confirma = function (s1, s2, extra) {
      const plan = W._matchSetPlan(scoring, m);
      W._confirmSetFromCard('T1', 'M1', Object.assign({ s1: s1, s2: s2, plan: plan, scoring: scoring }, extra || {}));
      return est;
    };
    return est;
  }

  // melhor de 3: 6-4 · 3-6 · super tie-break 10-8
  let c = cenario(MELHOR3);
  c.confirma(6, 4);
  ok(c.fechou === null, 'set 1 confirmado NÃO fecha a partida');
  eq((c.m.sets || []).length, 1, 'gravou 1 set');
  ok(c.txs === 1, 'e gravou por transação');
  ok(c.payloads.length === 1 && c.payloads[0].setsInProgress === true,
    'a gravação foi pela porta da CF (commitResultTx) com payload setsInProgress');
  ok(!c.erro, 'e o ramo do servidor (_applyResultToTournament) aplicou sem estourar');

  console.log('\n③ Set parcial NÃO é resultado');
  ok(c.m.winner === undefined, 'não carimba vencedor');
  ok(c.m.scoreP1 === undefined && c.m.scoreP2 === undefined, 'não escreve scoreP1/scoreP2');
  ok(c.m.resultAt === undefined, 'não escreve resultAt');
  ok(!!c.m.startedAt, 'mas marca que a partida COMEÇOU (startedAt)');
  eq([c.m.setsWonP1, c.m.setsWonP2], [1, 0], 'espelho de sets ganhos em dia');

  console.log('\n② (continuação)');
  c.confirma(3, 6);
  ok(c.fechou === null, 'empatou 1-1: ainda não fecha');
  eq((c.m.sets || []).length, 2, 'dois sets gravados');
  c.confirma(10, 8);
  ok(c.fechou !== null, 'o super tie-break FECHA a partida');
  eq([c.fechou.p1, c.fechou.p2], [2, 1], 'e fecha 2×1 em sets');
  eq(c.fechou.sets.length, 3, 'com os 3 sets no array');
  ok(c.fechou.sets[2].superTiebreak === true, 'o 3º set fica marcado como super tie-break');

  // recusas
  c = cenario(MELHOR3);
  c.confirma(6, 6);
  ok(c.avisos.length === 1 && !(c.m.sets || []).length, 'set empatado é RECUSADO (nada gravado)');
  c = cenario(MELHOR3);
  c.confirma(6, 4); c.confirma(3, 6);
  c.confirma(7, 5);
  ok(c.avisos.length === 1 && (c.m.sets || []).length === 2,
    'super tie-break que não chegou a 10 é RECUSADO');
  ok(c.fechou === null, 'e a partida não fecha por engano');

  // melhor de 5 precisa de 3 sets
  c = cenario(MELHOR5);
  c.confirma(6, 4); c.confirma(6, 3);
  ok(c.fechou === null, 'melhor de 5: 2×0 ainda NÃO fecha');
  c.confirma(6, 2);
  ok(c.fechou !== null, 'melhor de 5: o 3º set vencido fecha');
  eq([c.fechou.p1, c.fechou.p2], [3, 0], 'fecha 3×0');

  // 1 SET não passa por aqui
  c = cenario(UM_SET);
  const plan1 = W._matchSetPlan(UM_SET, c.m);
  ok(plan1.multi === false && plan1.live === null, '1 set: sem coluna em disputa — o card antigo cuida');

  // corrigir um set já confirmado apaga ele e os seguintes
  c = cenario(MELHOR3);
  c.confirma(6, 4); c.confirma(3, 6);
  W.showConfirmDialog = function (a, b, onConfirm) { onConfirm(); };
  W._effectiveScoring = function () { return MELHOR3; };
  W._reopenSet('T1', 'M1', 0);
  eq((c.m.sets || []).length, 0, 'corrigir o Set 1 apaga ele E o Set 2');
}

/* ── ④ A TELA ─────────────────────────────────────────────────────────────────────── */
const CSS = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css']
  .map(read).join('\n');

function cardHtml(scoring, sets, extra) {
  const m = Object.assign({ id: 'M1', p1: 'Ana Cattani / Maria Helena', p2: 'Rodrigo Barth / Livia', round: 0, bracket: 'main' }, extra || {});
  if (sets && sets.length) {
    m.sets = sets;
    let a = 0, b = 0;
    sets.forEach(function (s) { if (s.gamesP1 > s.gamesP2) a++; else if (s.gamesP2 > s.gamesP1) b++; });
    m.setsWonP1 = a; m.setsWonP2 = b;
  }
  const t = { id: 'T1', name: 'Teste', sport: 'Beach Tennis', scoring: scoring, matches: [m], participants: [] };
  W.AppStore = W.AppStore || {};
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = { uid: 'org', displayName: 'Org' };
  W.AppStore.isOrganizer = function () { return true; };
  W._currentBracketTournament = t;
  W._currentBracketTournamentId = 'T1';
  delete W._effectiveScoring;                 // volta a valer a função REAL do store
  return W.renderMatchCard(m, true, 'T1', 154);
}

async function tela() {
  console.log('\n④ A tela — Chromium com o CSS real: rótulo EM CIMA do box');
  const casos = [
    { nome: 'melhor de 3 · Set 1 em disputa', sc: MELHOR3, sets: [], cols: 1 },
    { nome: 'melhor de 3 · Set 1 confirmado', sc: MELHOR3, sets: [S(6, 4)], cols: 2 },
    { nome: 'melhor de 3 · 1-1, super tie-break', sc: MELHOR3, sets: [S(6, 4), S(3, 6)], cols: 3 },
    { nome: 'melhor de 5 · 2-2, super tie-break', sc: MELHOR5, sets: [S(6, 4), S(3, 6), S(6, 2), S(4, 6)], cols: 5 }
  ];
  const htmls = casos.map(function (c) { return cardHtml(c.sc, c.sets); });
  const html1set = cardHtml(UM_SET, []);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  await page.setContent('<style>' + CSS + '</style><body style="background:#0b1220;padding:10px;">' +
    htmls.map(function (h, i) { return '<div class="caso" data-i="' + i + '" style="max-width:400px;margin-bottom:14px;">' + h + '</div>'; }).join('') +
    '<div id="umset" style="max-width:400px;">' + html1set + '</div></body>', { waitUntil: 'load' });

  const r = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('.caso').forEach((box) => {
      const lbls = [...box.querySelectorAll('.sp-set-head .sp-set-col')].map((e) => {
        const q = e.getBoundingClientRect();
        return { x: +q.left.toFixed(1), w: +q.width.toFixed(1), txt: e.textContent.trim() };
      });
      const linha = (n) => [...box.querySelectorAll('#score-p' + n + '-M1 .sp-set-col')].map((e) => {
        const q = e.getBoundingClientRect();
        return { x: +q.left.toFixed(1), w: +q.width.toFixed(1) };
      });
      out.push({
        headline: (box.querySelector('.sp-set-head-ttl') || {}).textContent || '',
        tituloCortado: (() => {
          const e = box.querySelector('.sp-set-head-ttl');
          if (!e) return false;
          // corte de verdade = o texto não coube na caixa que o desenha
          return e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1;
        })(),
        rotulos: lbls, p1: linha(1), p2: linha(2),
        inputs: [...box.querySelectorAll('input[id^="s1-"],input[id^="s2-"]')].map((e) => e.id),
        larguraCard: +box.getBoundingClientRect().width.toFixed(1),
        transbordo: box.scrollWidth - box.clientWidth
      });
    });
    const um = document.getElementById('umset');
    return { casos: out, umSet: {
      temHead: !!um.querySelector('.sp-set-head'),
      temGrid: !!um.querySelector('.sp-set-grid'),
      temInput: !!um.querySelector('#s1-M1')
    } };
  });
  await browser.close();

  casos.forEach(function (c, i) {
    const g = r.casos[i];
    ok(g.rotulos.length === c.cols, c.nome + ': ' + c.cols + ' rótulo(s) (obtido ' + g.rotulos.length + ')');
    ok(g.p1.length === c.cols && g.p2.length === c.cols, c.nome + ': ' + c.cols + ' box(es) nas DUAS linhas');
    const casa = g.rotulos.every(function (l, k) {
      return g.p1[k] && g.p2[k] &&
        Math.abs(l.x - g.p1[k].x) <= 0.5 && Math.abs(l.w - g.p1[k].w) <= 0.5 &&
        Math.abs(l.x - g.p2[k].x) <= 0.5 && Math.abs(l.w - g.p2[k].w) <= 0.5;
    });
    ok(casa, c.nome + ': cada rótulo está EM CIMA do seu box, nas duas linhas');
    ok(g.transbordo <= 0, c.nome + ': o card não transborda na horizontal (' + g.transbordo + 'px)');
  });
  ok(/Set 1$/.test(r.casos[0].headline), 'a linha nova aparece: "' + r.casos[0].headline + '"');
  ok(/Super Tie-Break$/.test(r.casos[2].headline),
    'assim que empata, a linha JÁ anuncia o super tie-break: "' + r.casos[2].headline + '"');
  ok(r.casos.every(function (g) { return !g.tituloCortado; }),
    'e o aviso nunca sai cortado — quebra em duas linhas em vez de reticências');
  eq(r.casos[1].inputs.sort(), ['s1-M1', 's2-M1'], 'só a coluna EM DISPUTA tem campo (ids de sempre)');
  eq(r.casos[2].rotulos.map(function (x) { return x.txt; }), ['Set 1', 'Set 2', 'STB (10)'],
    'os rótulos são os que o dono pediu (o CAIXA ALTA é do CSS, não do texto)');

  ok(!r.umSet.temHead && !r.umSet.temGrid, '1 SET: nenhuma linha nova, nenhuma coluna — o card antigo intacto');
  ok(r.umSet.temInput, '1 SET: o campo de placar de sempre continua lá');
}

/* ── ⑤ AS CINCO CORREÇÕES DO SANDBOX (23/ago) ─────────────────────────────────────
 * Relatos do dono, olhando o SB do Confra:
 *   a) _"não pode cortar a tela dessa forma quando a largura é mais estreita"_
 *   b) _"quando lança o primeiro set, não pode abrir o placar copiando o anterior.
 *       Tem que ser 0-0 no set 2"_ + _"mesma coisa em 5 sets e STB"_
 *   c) _"super tie-break já está escrito antes, pode colocar STB em cima do box"_
 *   d) _"coloca uma cor mais brilhando no melhor de x - set 1, 2 STB"_
 *   e) _"depois que o jogo termina, pode eliminar a linha do melhor de 3/5"_
 */
async function correcoesDoSandbox() {
  console.log('\n⑤ As cinco correções do sandbox');
  const browser = await chromium.launch();

  // (a) o card não passa da borda — MEDIDO na escala de fonte do aparelho do dono.
  //     A chave vive num scroll com min-width:max-content, então sem teto o card assume a
  //     largura do conteúdo e some pra fora da tela. Raiz 22px = --ui-scale alto.
  const htmlLargo = cardHtml(MELHOR3, [S(3, 6), S(6, 2)]);
  for (const raiz of [16, 20, 22]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.setContent('<style>' + CSS + ' html{font-size:' + raiz + 'px !important;}</style>' +
      '<body style="background:#0b1220;margin:0;">' +
      '<div style="overflow-x:auto;"><div style="display:flex;min-width:max-content;padding:8px;">' +
      '<div style="flex-shrink:0;">' + htmlLargo + '</div></div></div></body>', { waitUntil: 'load' });
    const m = await page.evaluate(() => {
      const c = document.querySelector('[id^=card-]'); const q = c.getBoundingClientRect();
      return { passa: +(q.right - window.innerWidth).toFixed(0), card: +q.width.toFixed(0) };
    });
    ok(m.passa <= 0, '(a) raiz ' + raiz + 'px em tela de 390: o card (' + m.card + 'px) NÃO passa da borda (sobra ' + (-m.passa) + 'px)');
    await page.close();
  }

  // (b) o box do set em disputa nasce VAZIO — nunca com o placar do set anterior
  const page2 = await browser.newPage({ viewport: { width: 430, height: 900 } });
  await page2.setContent('<style>' + CSS + '</style><body style="background:#0b1220;padding:8px;">' +
    '<div id="a">' + cardHtml(MELHOR3, [S(6, 3)]) + '</div>' +
    '<div id="b">' + cardHtml(MELHOR3, [S(6, 3), S(3, 6)]) + '</div>' +
    '<div id="c">' + cardHtml(MELHOR5, [S(6, 4), S(3, 6), S(6, 2), S(4, 6)]) + '</div>' +
    '</body>', { waitUntil: 'load' });
  const vazios = await page2.evaluate(() => ['a', 'b', 'c'].map((id) => {
    const box = document.getElementById(id);
    return [...box.querySelectorAll('input[id^="s1-"],input[id^="s2-"]')].map((e) => e.value);
  }));
  eq(vazios[0], ['', ''], '(b) set 1 confirmado → o box do Set 2 nasce VAZIO');
  eq(vazios[1], ['', ''], '(b) 1-1 → o box do super tie-break nasce VAZIO');
  eq(vazios[2], ['', ''], '(b) melhor de 5, 2-2 → o box do STB nasce VAZIO');

  // (b·2) A OUTRA METADE: o markup nasce vazio, mas quem enchia o box era a RESTAURAÇÃO
  // pós-render (`_typedScores`, por ID). Como a coluna em disputa reusa `s1-`/`s2-`, o
  // placar recém-salvo voltava pra dentro do box do set seguinte. O jogo re-renderizado
  // tem que sair da lista de restauração ANTES do laço que devolve os valores.
  const fonte = read('js/views/bracket-ui.js');
  const trecho = fonte.slice(fonte.indexOf('function _rerenderBracket'), fonte.indexOf('// 6. Restore scroll'));
  const iLimpa = trecho.indexOf("delete _typedScores[pref + anchorMatchId]");
  const iRestaura = trecho.indexOf('inp.value = _typedScores[inputId]');
  ok(iLimpa !== -1, '(b·2) _rerenderBracket tira o jogo recém-gravado da lista de restauração');
  ok(iLimpa !== -1 && iRestaura !== -1 && iLimpa < iRestaura,
    '(b·2) e tira ANTES de restaurar — depois não adiantaria nada');
  ok(/\['s1-', 's2-', 'tb1-', 'tb2-'\]/.test(trecho),
    '(b·2) cobre os 4 campos do card (placar dos dois lados + os dois do tie-break)');

  // (c)(d)(e) rótulo curto, cor de destaque e a linha que some no fim
  const res = await page2.evaluate(() => {
    const st = document.querySelector('#b .sp-set-head-ttl');
    const rot = [...document.querySelectorAll('#b .sp-set-head .sp-set-lbl')].map((e) => e.textContent.trim());
    const cor = st ? getComputedStyle(st).color : '';
    return { rot: rot, cor: cor, mudo: getComputedStyle(document.body).getPropertyValue('--text-muted') };
  });
  ok(res.rot[res.rot.length - 1] === 'STB (10)',
    '(c) o box do super tie-break é rotulado "STB" — o nome inteiro já está na linha de cima');
  ok(res.cor && res.cor !== 'rgb(148, 163, 184)' && res.cor !== res.mudo,
    '(d) a linha de cima tem cor de DESTAQUE, não a cinza de texto secundário (' + res.cor + ')');
  await page2.close();

  // (e) jogo TERMINADO: sem a linha do "Melhor de N", só os placares
  const decidido = cardHtml(MELHOR3, [S(6, 4), S(3, 6), S(10, 8)], { winner: 'Ana Cattani / Maria Helena' });
  const page3 = await browser.newPage({ viewport: { width: 430, height: 700 } });
  await page3.setContent('<style>' + CSS + '</style><body style="background:#0b1220;padding:8px;">' + decidido + '</body>', { waitUntil: 'load' });
  const fim = await page3.evaluate(() => ({
    temLinha: !!document.querySelector('.sp-set-head'),
    colunas: document.querySelectorAll('#score-p1-M1 .sp-set-col').length,
    numeros: [...document.querySelectorAll('#score-p1-M1 .sp-set-num')].map((e) => e.textContent.trim())
  }));
  ok(!fim.temLinha, '(e) jogo terminado: a linha do "Melhor de 3" SOME');
  ok(fim.colunas === 3, '(e) e os 3 placares de set continuam lá (obtido ' + fim.colunas + ')');
  eq(fim.numeros, ['6', '3', '10'], '(e) com os números dos sets, na ordem');
  await page3.close();
  await browser.close();
}

(async function () {
  regua();
  decisao();
  await tela();
  await correcoesDoSandbox();
  console.log('\n' + (falhas ? '✗ ' + falhas + '/' + testes + ' falharam' : '✓ ' + testes + '/' + testes + ' passaram'));
  process.exit(falhas ? 1 : 0);
})();
