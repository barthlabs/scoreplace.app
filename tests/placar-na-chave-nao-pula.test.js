/* O PLACAR NA CHAVE: NÃO PULA, JOGA O FORMATO, APROVA E AVISA A MARGEM.
 *
 * Quatro relatos do dono no mesmo dia (23/ago/2026), simulando lançamentos na R2 da
 * eliminatória do SB da Confra:
 *
 *   ① _"lançando o placar de 1 set pula para outro lugar na chave. sempre que lançarmos um
 *      valor numa chave, qualquer que seja ela, não pode pular para outro lugar. NUNCA."_
 *   ② _"o simular fase (dev) está simulando 1 set e entregando o ganhador do jogo com apenas
 *      1 set. O certo seria simular o melhor de 3 ou de 5 quando for o caso."_
 *   ③ _"o sistema de aprovar placar que já funciona para 1 set deve rodar para melhor de 3
 *      ou 5 também da mesma forma."_
 *   ④ _"quando for tie-break ou STB que tenha diferença de 2 pontos para vencer vamos indicar
 *      isso antes (dif 2 pts)."_
 *
 * ① NÃO ERA DO MELHOR DE 3 — era de QUALQUER chave larga. MEDIDO antes do conserto: chave de
 * 32 a 430px, rolada 750px pra direita pra enxergar a R2; confirmar o set devolvia o
 * `scrollLeft` a ZERO e o card andava 750px pro lado. A causa: `_rerenderBracket` guardava só
 * `.bracket-sticky-scroll-wrapper`, e a tela de detalhe do torneio (onde se lança) usa o
 * outro desenho — `.bracket-scroll-container`, um POR CHAVE. Por isso este teste roda a chave
 * REAL em Chromium, com o CSS real e rolagem real: um teste de unidade não veria o pulo.
 *
 * Roda com: node tests/placar-na-chave-nao-pula.test.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const H = require('./render-harness');
const W = H.window;

const ROOT = path.join(__dirname, '..');
let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}

/* Presets REAIS do form (create-tournament.js GSM_PRESETS) — inventar valor aqui seria
   testar um formato que o app não oferece. */
const UM_SET  = { type:'sets', setsToWin:1, gamesPerSet:6, tiebreakEnabled:true, tiebreakPoints:7, superTiebreak:false, countingType:'tennis', deuceRule:true };
const MELHOR3 = { type:'sets', setsToWin:2, gamesPerSet:6, tiebreakEnabled:true, tiebreakPoints:7, superTiebreak:true, superTiebreakPoints:10, countingType:'tennis', deuceRule:true };
const MELHOR5 = Object.assign({}, MELHOR3, { setsToWin:3 });
const M3_SEM_STB = Object.assign({}, MELHOR3, { superTiebreak:false });

const CSS = ['style.css','components.css','layout.css','bracket.css','responsive.css','trophies.css']
  .map(f => fs.readFileSync(path.join(ROOT,'css',f),'utf8')).join('\n');
/* Mesma ordem do index.html — o render de verdade, não uma montagem de HTML à mão. */
const JS = ['js/logger.js','js/i18n.js','js/i18n-pt.js',
  'js/views/identity-core.js','js/views/persist-core.js','js/views/waitlist-core.js',
  'js/views/standings-core.js','js/views/gender-ratio-core.js','js/views/sport-rules.js',
  'js/views/tournaments-utils.js','js/views/tournaments-draw.js','js/views/tournaments.js',
  'js/store.js','js/views/create-tournament.js','js/views/format2.js',
  'js/views/bracket-logic.js','js/views/bracket-model.js','js/views/bracket.js',
  'js/views/bracket-ui.js','js/views/phases-engine.js','js/views/phase-generators.js','js/views/wo-core.js'];

/* A CENA: eliminatória de 32 em melhor de 3, R1 inteira decidida, R2 esperando placar. */
function montaTorneio() {
  const t = H.buildViaDraw('Eliminatórias Simples', 32, {
    formatCode:'elim_simples', teamSize:1, sport:'🎾 Tênis', name:'Chave melhor de 3',
    scoring: MELHOR3, status:'active'
  });
  (t.matches||[]).filter(m => m.round === 1).forEach((m, i) => {
    m.sets = [{gamesP1:6,gamesP2:4},{gamesP1:6,gamesP2:3}];
    m.setsWonP1 = 2; m.setsWonP2 = 0; m.scoreP1 = 2; m.scoreP2 = 0;
    m.winner = m.p1; m.resultAt = 1755950000000 + i*60000; m.startedAt = m.resultAt - 3600000;
    W._advanceWinner(t, m);
  });
  return JSON.parse(JSON.stringify(t));
}

async function abreChave(browser, torneio, usuario, raizPx) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  /* origem HTTP de verdade: sem ela o store.js morre no sessionStorage e o render nem começa.
     `raizPx` existe porque a escala de fonte do aparelho é o que revela os defeitos de
     largura/linha — a régua da casa é medir na escala grande também. */
  const escala = raizPx ? '<style>html{font-size:' + raizPx + 'px!important}</style>' : '';
  await page.route('http://sp.local/**', r => r.fulfill({ status:200, contentType:'text/html; charset=utf-8',
    body:'<!doctype html><meta charset="utf-8"><style>'+CSS+'</style>'+escala+'<body>'+
         '<div id="view-container"><div id="inline-bracket-container"></div></div></body>' }));
  await page.goto('http://sp.local/chave.html', { waitUntil:'load' });
  await page.evaluate(() => {
    window._initialLang = 'pt';
    window.setInterval = function () { return 0; };
    window.__avisos = [];
    window.showNotification = function (a,b) { window.__avisos.push(['notif',a,b]); };
    window.showAlertDialog  = function (a,b) { window.__avisos.push(['alerta',a,b]); };
    window.showConfirmDialog = function (a,b,cb) { cb && cb(); };
  });
  for (const f of JS) await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT,f),'utf8') });
  await page.evaluate(([t, u]) => {
    const noop = function(){}, tx = function(){ return { then:function(cb){cb&&cb();return{catch:noop};}, catch:noop }; };
    window.AppStore = Object.assign(window.AppStore||{}, {
      tournaments:[t], currentUser:u, isOrganizer:function(){ return !!u.org; },
      logAction:noop, sync:noop, syncImmediate:tx, commitTournamentTx:tx, commitResultTx:tx, commitDrawTx:tx,
      getTournament:function(id){ return window.AppStore.tournaments.find(x=>String(x.id)===String(id)); }
    });
    window.FirestoreDB = { saveTournament: function(){ return Promise.resolve(); } };
    window._sendUserNotification = noop;
    window.location.hash = '#tournaments/' + t.id;
    window.renderBracket(document.getElementById('inline-bracket-container'), t.id, true);
  }, [torneio, usuario]);
  return page;
}

/* ── ① A CHAVE NÃO PULA ─────────────────────────────────────────────────────────────── */
async function naoPula(browser) {
  console.log('\n① Lançar placar não move a chave de lugar');
  const t = montaTorneio();
  const ALVO = (t.matches||[]).filter(m => m.round === 2)[3].id;
  const page = await abreChave(browser, t, { uid:'u-org', displayName:'Org', org:true });

  const pre = await page.evaluate((id) => {
    const c = document.getElementById('card-'+id);
    const w = document.querySelector('.bracket-scroll-container') || document.querySelector('.bracket-sticky-scroll-wrapper');
    window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 300);
    if (w) w.scrollLeft = Math.round((w.scrollWidth - w.clientWidth) * 0.6);   // rolou pra ver a R2
    const r = c.getBoundingClientRect();
    return { rolavel: w ? (w.scrollWidth - w.clientWidth) : 0, x: Math.round(w ? w.scrollLeft : 0),
             topo: Math.round(r.top), esq: Math.round(r.left), scrollY: Math.round(window.scrollY) };
  }, ALVO);
  ok(pre.rolavel > 200, 'a cena tem rolagem horizontal de verdade (' + pre.rolavel + 'px) — sem isso o teste não prova nada');

  const pos = await page.evaluate((id) => {
    document.getElementById('s1-'+id).value = '6';
    document.getElementById('s2-'+id).value = '4';
    document.getElementById('confirm-'+id).click();
    return null;
  }, ALVO);
  await page.waitForTimeout(700);
  const dep = await page.evaluate((id) => {
    const c = document.getElementById('card-'+id);
    const w = document.querySelector('.bracket-scroll-container') || document.querySelector('.bracket-sticky-scroll-wrapper');
    const r = c ? c.getBoundingClientRect() : null;
    return { x: Math.round(w ? w.scrollLeft : 0), topo: r?Math.round(r.top):null, esq: r?Math.round(r.left):null,
             scrollY: Math.round(window.scrollY),
             colunas: c ? c.querySelectorAll('.sp-set-head .sp-set-col').length : 0 };
  }, ALVO);

  ok(dep.colunas === 2, 'o set entrou mesmo (o card passou a ter 2 colunas) — obtido ' + dep.colunas);
  ok(Math.abs(dep.esq - pre.esq) <= 2, 'o card NÃO andou na horizontal (' + Math.abs(dep.esq - pre.esq) + 'px)');
  ok(Math.abs(dep.topo - pre.topo) <= 2, 'nem na vertical (' + Math.abs(dep.topo - pre.topo) + 'px)');
  ok(dep.x === pre.x, 'a rolagem da chave ficou onde estava (' + pre.x + ' → ' + dep.x + ')');
  await page.close();
}

/* ── ② SIMULAR JOGA O FORMATO DA FASE ───────────────────────────────────────────────── */
function simularJogaOFormato() {
  console.log('\n② Simular fase (dev) joga melhor de 3 / de 5, não um set solto');
  [['melhor de 3', MELHOR3], ['melhor de 5', MELHOR5], ['melhor de 3 sem STB', M3_SEM_STB]].forEach(function ([nome, sc]) {
    const plan = W._matchSetPlan(sc, null, {});
    const erros = [];
    let stb = 0, tb = 0;
    for (let k = 0; k < 3000; k++) {
      const r = W._simularPartida(sc, {});
      if (!r) { erros.push('não simulou'); break; }
      if (Math.max(r.setsWonP1, r.setsWonP2) !== plan.setsToWin) erros.push('vencedor sem ' + plan.setsToWin + ' sets');
      if (r.sets.length !== r.setsWonP1 + r.setsWonP2) erros.push('nº de sets não bate com os sets ganhos');
      if (r.sets.length > plan.bestOf) erros.push('passou do melhor de ' + plan.bestOf);
      r.sets.forEach(function (s, i) {
        if (s.gamesP1 === s.gamesP2) erros.push('set empatado');
        if (s.superTiebreak) {
          stb++;
          if (i !== plan.bestOf - 1) erros.push('super tie-break fora do último set possível');
          if (Math.max(s.gamesP1, s.gamesP2) !== plan.superTiebreakPoints) erros.push('STB não chegou aos pontos');
          if (Math.abs(s.gamesP1 - s.gamesP2) < 2) erros.push('STB fechou sem 2 de diferença');
        } else if (s.tiebreak) {
          tb++;
          const pv = Math.max(s.tiebreak.pointsP1, s.tiebreak.pointsP2);
          const pp = Math.min(s.tiebreak.pointsP1, s.tiebreak.pointsP2);
          if (pv - pp < 2) erros.push('tie-break fechou sem 2 de diferença');
          if ((s.gamesP1 > s.gamesP2) !== (s.tiebreak.pointsP1 > s.tiebreak.pointsP2)) erros.push('quem ganhou o tie-break não é quem ganhou o set');
        } else if (Math.max(s.gamesP1, s.gamesP2) !== 6) erros.push('set normal sem 6 games');
      });
    }
    ok(!erros.length, nome + ': 3000 partidas sem uma regra quebrada' + (erros.length ? ' — ' + erros[0] : ''));
    if (plan.superTiebreak) ok(stb > 0, nome + ': o super tie-break acontece quando os sets empatam (' + stb + ' vezes)');
    else ok(stb === 0, nome + ': sem super tie-break configurado, ele nunca nasce');
    ok(tb > 0, nome + ': sets decididos no tie-break também aparecem (' + tb + ')');
  });
  ok(W._simularPartida(UM_SET, {}) === null,
    '1 SET não passa por aqui — o caminho antigo do simulador segue intacto');
}

/* ── ③ APROVAÇÃO EM MELHOR DE 3, IGUAL À DE 1 SET ───────────────────────────────────── */
async function aprovacao(browser) {
  console.log('\n③ Aprovar placar roda igual em melhor de 3');
  const t = montaTorneio();
  t.resultEntry = 'players';
  const alvo = (t.matches||[]).filter(m => m.round === 2)[3];
  const eu = (t.participants||[]).find(p => (p.displayName||p.name) === alvo.p1);
  const page = await abreChave(browser, t, { uid: eu.uid, displayName: eu.displayName||eu.name, org:false });

  const set1 = await page.evaluate((id) => {
    document.getElementById('s1-'+id).value='6'; document.getElementById('s2-'+id).value='4';
    document.getElementById('confirm-'+id).click();
    const m = (window.AppStore.tournaments[0].matches||[]).find(x=>x.id===id);
    return { sets:(m.sets||[]).length, vencedor:m.winner||null, pendente:!!m.pendingResult };
  }, alvo.id);
  await page.waitForTimeout(600);
  ok(set1.sets === 1 && !set1.vencedor && !set1.pendente,
    'set 1 é JOGO EM ANDAMENTO: grava o set, não grava vencedor e não pede aprovação');

  const fecho = await page.evaluate((id) => {
    document.getElementById('s1-'+id).value='6'; document.getElementById('s2-'+id).value='3';
    document.getElementById('confirm-'+id).click();
    const m = (window.AppStore.tournaments[0].matches||[]).find(x=>x.id===id);
    return { vencedor:m.winner||null, pr: m.pendingResult ? {
      kind:m.pendingResult.kind, sets:(m.pendingResult.sets||[]).length,
      setsWonP1:m.pendingResult.setsWonP1, setsWonP2:m.pendingResult.setsWonP2 } : null };
  }, alvo.id);
  await page.waitForTimeout(600);
  ok(!fecho.vencedor && fecho.pr && fecho.pr.kind === 'gsm',
    'o set que FECHA a partida vai pra aprovação, não carimba vencedor');
  ok(fecho.pr && fecho.pr.sets === 2 && fecho.pr.setsWonP1 === 2 && fecho.pr.setsWonP2 === 0,
    'a proposta leva os DOIS sets e o 2×0 — não só o último');

  /* o outro lado: quem aprova precisa saber QUAL coluna é qual */
  const outro = await page.evaluate((id) => {
    const t = window.AppStore.tournaments[0];
    const m = (t.matches||[]).find(x=>x.id===id);
    const adv = (t.participants||[]).find(p => (p.displayName||p.name) === m.p2);
    window.AppStore.currentUser = { uid:adv.uid, displayName:adv.displayName||adv.name };
    window.renderBracket(document.getElementById('inline-bracket-container'), t.id, true);
    const head = document.getElementById('sethead-'+id);
    const card = document.getElementById('card-'+id);
    return { temBotao: /Confirmar|Aprovar/i.test((card?card.textContent:'')),
             rotulos: head ? [...head.querySelectorAll('.sp-set-col')].map(e=>e.textContent.trim()) : null,
             linha: head ? head.querySelector('.sp-set-head-ttl').textContent.trim() : null };
  }, alvo.id);
  ok(outro.temBotao, 'o adversário recebe o botão de confirmar');
  ok(outro.rotulos && outro.rotulos.join('|') === 'Set 1|Set 2',
    'e o placar PENDENTE mostra o rótulo de cada coluna — obtido ' + JSON.stringify(outro.rotulos));
  ok(/Melhor de 3/.test(outro.linha || ''), 'com a linha do formato por cima: "' + outro.linha + '"');

  const aprovado = await page.evaluate((id) => {
    const t = window.AppStore.tournaments[0];
    window._approveResult(String(t.id), id);
    const m = (t.matches||[]).find(x=>x.id===id);
    return { sets:(m.sets||[]).length, vencedor:m.winner||null, placar:[m.scoreP1,m.scoreP2], pendenteSumiu:!m.pendingResult };
  }, alvo.id);
  ok(aprovado.sets === 2 && aprovado.vencedor && aprovado.pendenteSumiu &&
     aprovado.placar[0] === 2 && aprovado.placar[1] === 0,
    'aprovar aplica os dois sets, o vencedor e o 2×0 — e some com o pendente');
  await page.close();
}

/* ── ④ "dif 2 pts" AVISADO ANTES, E COBRADO ─────────────────────────────────────────── */
async function difDoisPontos(browser) {
  console.log('\n④ Tie-break e super tie-break avisam a diferença de 2 pontos ANTES');
  ok(W._difPtsAviso(2) === 'dif 2 pts', 'o dizer é um só: "' + W._difPtsAviso(2) + '"');
  ok(W._difPtsAviso(1) === '', 'morte súbita (margem 1) não avisa nada');
  ok(W._tbMargem({}) === 2 && W._tbMargem({ tiebreakMargin: 3 }) === 3,
    'a margem efetiva sai de UMA função — sem margem gravada, 2');

  const t = montaTorneio();
  const alvo = (t.matches||[]).filter(m => m.round === 2)[3];
  const zerado = (t.matches||[]).filter(m => m.round === 2)[4];
  alvo.sets = [{gamesP1:6,gamesP2:4},{gamesP1:3,gamesP2:6}];       // 1-1: o próximo é o STB
  alvo.setsWonP1 = 1; alvo.setsWonP2 = 1;
  const page = await abreChave(browser, t, { uid:'u-org', displayName:'Org', org:true });

  const anuncio = await page.evaluate((id) => {
    const h = document.getElementById('sethead-'+id);
    return { linha: h ? h.querySelector('.sp-set-head-ttl').textContent.trim() : null,
             rotulos: h ? [...h.querySelectorAll('.sp-set-col')].map(e=>e.textContent.trim()) : null };
  }, alvo.id);
  ok(/Super Tie-Break \(dif 2 pts\)$/.test(anuncio.linha || ''),
    'empatou em 1-1 → a linha já anuncia: "' + anuncio.linha + '"');
  ok((anuncio.rotulos||[]).join('|') === 'Set 1|Set 2|STB (10)',
    'e a coluna do STB continua com o rótulo curto (a largura é do nome da dupla)');

  const noSet = await page.evaluate((id) => {
    const vis = e => !!e && getComputedStyle(e).display !== 'none';
    const antes = vis(document.getElementById('tbhint-'+id));
    document.getElementById('s1-'+id).value='7'; document.getElementById('s2-'+id).value='6';
    window._highlightWinner(id);
    const el = document.getElementById('tbhint-'+id);
    return { antes: antes, depois: vis(el), texto: el ? el.textContent.trim() : null,
             camposTb: vis(document.getElementById('tb1-'+id)) };
  }, zerado.id);
  ok(!noSet.antes, 'o aviso do tie-break de SET nasce escondido');
  ok(noSet.depois && noSet.camposTb, 'e aparece NO MESMO instante que os campos de tie-break');
  ok(/dif 2 pts/.test(noSet.texto || ''), 'dizendo o que precisa: "' + noSet.texto + '"');

  const recusa = await page.evaluate((id) => {
    window.__avisos.length = 0;
    document.getElementById('s1-'+id).value='10'; document.getElementById('s2-'+id).value='9';
    document.getElementById('confirm-'+id).click();
    const m = (window.AppStore.tournaments[0].matches||[]).find(x=>x.id===id);
    return { avisos: window.__avisos.slice(), sets:(m.sets||[]).length, vencedor:m.winner||null };
  }, alvo.id);
  ok(recusa.avisos.length === 1 && recusa.avisos[0][0] === 'alerta' && recusa.sets === 2 && !recusa.vencedor,
    'STB 10-9 é RECUSADO — avisar a margem e aceitar 10-9 seria a tela mentindo');

  const aceita = await page.evaluate((id) => {
    window.__avisos.length = 0;
    document.getElementById('s1-'+id).value='11'; document.getElementById('s2-'+id).value='9';
    document.getElementById('confirm-'+id).click();
    const m = (window.AppStore.tournaments[0].matches||[]).find(x=>x.id===id);
    return { sets:(m.sets||[]).length, vencedor:m.winner||null, ultimo:(m.sets||[]).slice(-1)[0] };
  }, alvo.id);
  ok(aceita.sets === 3 && !!aceita.vencedor && aceita.ultimo.superTiebreak === true,
    'STB 11-9 fecha a partida e o set fica marcado como super tie-break');

  /* contraste nos DOIS temas — regra da casa, medida e não olhada */
  const contraste = await page.evaluate((id) => {
    const par = c => { const m = c.match(/[\d.]+/g).map(Number); return { r:m[0], g:m[1], b:m[2], a:(m[3]==null?1:m[3]) }; };
    const sobre = (f,b) => ({ r:f.r*f.a+b.r*(1-f.a), g:f.g*f.a+b.g*(1-f.a), b:f.b*f.a+b.b*(1-f.a) });
    const lum = c => { const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
      return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
    const out = {};
    ['dark','light'].forEach(tema => {
      document.documentElement.setAttribute('data-theme', tema);
      const el = document.getElementById('tbhint-'+id);
      if (!el) { out[tema] = 0; return; }
      const cs = getComputedStyle(el);
      const fundo = sobre(par(cs.backgroundColor), par(getComputedStyle(el.closest('[id^="card-"]')).backgroundColor));
      const L1 = lum(par(cs.color)), L2 = lum(fundo);
      out[tema] = +(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)).toFixed(2));
    });
    document.documentElement.setAttribute('data-theme','dark');
    return out;
  }, zerado.id);
  ok(contraste.dark >= 4.5 && contraste.light >= 4.5,
    'o aviso tem contraste nos DOIS temas (escuro ' + contraste.dark + ' · claro ' + contraste.light + ')');
  await page.close();
}

/* ── ⑤ O CABEÇALHO DO PENDENTE CABE EM 2 LINHAS ─────────────────────────────────────
 * Ordem do dono (23/ago/2026), com o print do JOGO 79: _"aqui dá pra economizar espaço em
 * linhas. Alinhado na direita em 2 linhas, esse 'aguardando aprovação' no topo, com a
 * ampulheta na esquerda do 'aguardando' e o PENDENTE na esquerda da ampulheta. Assim em 2
 * linhas fica fechado o cabeçalho. Na esquerda continua o JOGO X e embaixo o 'proposto
 * por… há xh'."_
 * MEDIDO antes: na escala de fonte dele (raiz 22px) o bloco da direita gastava QUATRO linhas
 * — tag / ⏳ / AGUARDANDO / APROVAÇÃO — porque um `max-width:104px` na frase não deixava
 * "⏳ Aguardando" caber junto. Por isso o teste mede nas DUAS escalas: na normal o defeito
 * quase não aparece (3 linhas), e é justamente a escala grande que o denuncia. */
async function cabecalhoEmDuasLinhas(browser) {
  console.log('\n⑤ O cabeçalho do card pendente fecha em 2 linhas');
  const t = montaTorneio();
  t.resultEntry = 'players';
  const alvo = (t.matches||[]).filter(m => m.round === 2)[3];
  alvo.pendingResult = { kind:'gsm', proposedBy:'u-x', proposedByName:'MDelia Fernandez',
    proposedAt: 1755950000000, winner: alvo.p1, draw:false, sets:[{gamesP1:6,gamesP2:3}],
    setsWonP1:1, setsWonP2:0, scoreP1:6, scoreP2:3, totalGamesP1:6, totalGamesP2:3,
    useSets:true, isFixedSet:false };

  for (const raiz of [16, 22]) {
    const page = await abreChave(browser, t, { uid:'u-alguem', displayName:'Alguém', org:false }, raiz);
    const r = await page.evaluate((id) => {
      const bloco = document.getElementById('header-btns-' + id);
      if (!bloco) return { erro: 'sem bloco' };
      /* linhas VISUAIS: os tops distintos dos retângulos de texto — não o nº de elementos */
      const rng = document.createRange(), tops = new Set();
      bloco.querySelectorAll('*').forEach(function (e) {
        if (e.children.length === 0) { rng.selectNodeContents(e);
          [...rng.getClientRects()].forEach(function (q) { tops.add(Math.round(q.top)); }); }
      });
      const card = document.getElementById('card-' + id);
      const esquerda = bloco.parentElement.firstElementChild;
      return { linhas: tops.size, texto: bloco.textContent.replace(/\s+/g,' ').trim(),
               transbordo: Math.round(card.scrollWidth - card.clientWidth),
               larguraCard: Math.round(card.getBoundingClientRect().width),
               esquerdaTexto: esquerda.textContent.replace(/\s+/g,' ').trim().slice(0, 60) };
    }, alvo.id);
    ok(r.linhas <= 2, 'raiz ' + raiz + 'px: o bloco da direita cabe em 2 linhas (obtido ' + r.linhas + ')');
    ok(/PENDENTE/.test(r.texto) && /⏳/.test(r.texto) && /Aguardando aprovação/.test(r.texto),
      'raiz ' + raiz + 'px: e leva os três — PENDENTE, ampulheta e a frase: "' + r.texto + '"');
    ok(r.transbordo <= 0, 'raiz ' + raiz + 'px: o card não transborda (' + r.transbordo + 'px)');
    ok(/JOGO/i.test(r.esquerdaTexto) && /proposto por/i.test(r.esquerdaTexto),
      'raiz ' + raiz + 'px: a esquerda segue com JOGO N e "proposto por…" — "' + r.esquerdaTexto + '"');
    await page.close();
  }
}

/* ── ⑥ O NÚMERO DO PLACAR OCUPA O ESPAÇO — SEM ENCAVALAR ────────────────────────────
 * Ordem do dono (23/ago/2026): _"os números no placar também podem ser maiores… a ideia é
 * que tanto nomes quanto números do placar ocupem o maior espaço ali sem encavalar, deixando
 * uma margem elegante nos lados."_
 * O teto NÃO é gosto: o número mora na mesma linha da caixa do nome, então ele não pode ser
 * mais ALTO que ela (senão estica a linha do card) nem mais LARGO que a coluna de set
 * (34/38px, largura por TIPO). Este bloco mede as duas paredes — é o que permite subir o
 * número até encostar nelas e parar ali. */
async function numeroDoPlacar(browser) {
  console.log('\n⑥ O número do placar cresce até as paredes, e não além');
  const t = montaTorneio();
  const simples = (t.matches||[]).filter(m => m.round === 2)[3];
  const comSets = (t.matches||[]).filter(m => m.round === 2)[4];
  simples.sets = null; simples.scoreP1 = 6; simples.scoreP2 = 3; simples.winner = simples.p1;
  comSets.sets = [{gamesP1:6,gamesP2:4},{gamesP1:3,gamesP2:6},{gamesP1:11,gamesP2:9,superTiebreak:true}];
  comSets.setsWonP1 = 2; comSets.setsWonP2 = 1; comSets.scoreP1 = 2; comSets.scoreP2 = 1;
  comSets.winner = comSets.p1;

  for (const raiz of [16, 22]) {
    const page = await abreChave(browser, t, { uid:'u-org', displayName:'Org', org:true }, raiz);
    const r = await page.evaluate(([idSimples, idSets]) => {
      const num = document.querySelector('#card-' + idSimples + ' .sp-mc-num');
      const caixa = document.querySelector('#card-' + idSimples + ' .sp-mc-box');
      const cardS = document.getElementById('card-' + idSimples);
      const linha = num ? num.closest('div[style*="border-radius"]') : null;
      const cols = [...document.querySelectorAll('#card-' + idSets + ' #score-p1-' + idSets + ' .sp-set-col')];
      const estouraColuna = cols.filter(function (c) {
        const n = c.querySelector('.sp-set-num');
        return n && n.getBoundingClientRect().width > c.getBoundingClientRect().width + 0.5;
      }).length;
      const rNum = num ? num.getBoundingClientRect() : null;
      const rCard = cardS.getBoundingClientRect();
      return {
        fonteDoNumero: num ? +parseFloat(getComputedStyle(num).fontSize).toFixed(1) : 0,
        alturaDoNumero: rNum ? Math.round(rNum.height) : 0,
        alturaDaCaixaDoNome: caixa ? Math.round(caixa.getBoundingClientRect().height) : 0,
        alturaDaLinha: linha ? Math.round(linha.getBoundingClientRect().height) : 0,
        folgaAteABorda: rNum ? Math.round(rCard.right - rNum.right) : 0,
        estouraColuna: estouraColuna, colunas: cols.length,
        transbordo: Math.round(cardS.scrollWidth - cardS.clientWidth)
      };
    }, [simples.id, comSets.id]);

    ok(r.fonteDoNumero >= 16 * (raiz / 16) * 1.2,
      'raiz ' + raiz + 'px: o número cresceu de verdade (' + r.fonteDoNumero + 'px — era 1rem)');
    ok(r.alturaDoNumero <= r.alturaDaCaixaDoNome + 1,
      'raiz ' + raiz + 'px: e não passa da altura da caixa do nome (' + r.alturaDoNumero +
      ' ≤ ' + r.alturaDaCaixaDoNome + ') — é ela que define a altura da linha');
    ok(r.colunas === 3 && r.estouraColuna === 0,
      'raiz ' + raiz + 'px: nenhum número de set estoura a largura da sua coluna (3 colunas, STB incluído)');
    ok(r.folgaAteABorda >= 8,
      'raiz ' + raiz + 'px: sobra margem entre o número e a borda do card (' + r.folgaAteABorda + 'px)');
    ok(r.transbordo <= 0, 'raiz ' + raiz + 'px: o card não transborda (' + r.transbordo + 'px)');
    await page.close();
  }
}

(async function () {
  const browser = await chromium.launch();
  try {
    await naoPula(browser);
    simularJogaOFormato();
    await aprovacao(browser);
    await difDoisPontos(browser);
    await cabecalhoEmDuasLinhas(browser);
    await numeroDoPlacar(browser);
  } finally {
    await browser.close();
  }
  console.log('\n' + (falhas ? '✗ ' + falhas + '/' + testes + ' falharam' : '✓ ' + testes + '/' + testes + ' passaram'));
  process.exit(falhas ? 1 : 0);
})();
