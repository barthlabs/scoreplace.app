/* A LISTA DE INSCRITOS CHEGA EM FATIAS — e NUNCA fica pela metade (1.9.61).
 *
 * node tests/inscritos-em-fatias.test.js
 *
 * Proposta do dono: _"renderizar em blocos — não precisa entregar os últimos jogos que
 * vai ter que scrollar até lá; fica aceitável um processamento enquanto se lê ou digita"_.
 *
 * MEDIDO no Confra (111 inscritos, 390×844, Chromium), antes → depois:
 *   • 1ª pintura de `renderParticipants`: 34,5ms → 11,1ms
 *   • cabem 4 cards na tela; os outros 107 eram trabalho que ninguém via
 *   • lista final IDÊNTICA: 111 cards, documento de 15.629px
 *
 * ⚠️ ESTE ARQUIVO GUARDA O INVARIANTE, NÃO O MECANISMO:
 *   «a lista pode chegar em pedaços, mas o que a tela AFIRMA tem que ser verdade —
 *    nunca falta card, nunca há branco onde a pessoa olha, nunca a tela pula.»
 * Forma nova de quebrar isso entra AQUI. Foi cada correção anterior travar só o próprio
 * mecanismo que deixou o sintoma voltar por outro caminho.
 *
 * As quatro dores JÁ PAGAS que a fatia poderia ressuscitar — e que cada bloco cobra:
 *   1. lista incompleta se afirmando completa (rAF que não dispara em aba de fundo /
 *      no painel de navegador) — o pior dos quatro, porque é silencioso;
 *   2. branco onde a pessoa está olhando (re-render no meio da lista) — a mesma queixa
 *      do `content-visibility`: "quando scrolla vem cortado";
 *   3. o "sobe uma linha e desce rapidinho" — trava de altura solta antes da hora,
 *      agora em tamanho grande (15.600px → 3.100px);
 *   4. a lista remexendo enquanto se lê (ordem das fatias ≠ ordem final).
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

const TIPOS = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml' };

function servidor() {
  return new Promise((res) => {
    const s = http.createServer((req, rep) => {
      const u = decodeURIComponent((req.url || '/').split('?')[0]);
      let f = path.join(ROOT, u === '/' ? '/index.html' : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); return rep.end(); }
      rep.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
      rep.end(fs.readFileSync(f));
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

(async () => {
  console.log('\n== a lista de inscritos chega em fatias ==');

  // ── 1. o CÓDIGO: rede dupla de agendamento + porta síncrona ────────────────
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'participants.js'), 'utf8');
  const fn = (src.match(/function _pintarInscritosEmFatias[\s\S]*?\n}/) || [''])[0];
  ok(fn.length > 0, 'existe a função que anexa as fatias');
  ok(/requestAnimationFrame/.test(fn), 'agenda por quadro (rAF) — a fatia não trava a mão de quem rola');
  ok(/setTimeout\(/.test(fn), 'E por timeout: rAF NÃO dispara em aba de fundo nem no painel de navegador — sem esta rede a lista ficaria pela metade PRA SEMPRE');
  ok(/feito\s*=\s*true/.test(fn), 'trava de uma-vez-só: os dois agendadores não pintam a mesma fatia duas vezes');
  ok(/insertAdjacentHTML/.test(fn), 'a fatia ANEXA (não reconstrói o que já está na tela — reconstruir é o que colapsa o documento)');
  ok(/window\._flushInscritosPaint\s*=\s*function/.test(src), 'há porta síncrona pra terminar a lista agora');

  // ⛔ content-visibility não volta por esta porta: ele reserva ESPAÇO em vez de
  // entregar conteúdo — "vem cortado" ao rolar e o 1º toque é engolido.
  const vivo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/content-visibility/.test(vivo), 'nenhum content-visibility no caminho dos inscritos (a fatia entrega card REAL, não retângulo vazio)');

  // a trava de altura tem que ser solta pelo GANCHO da última fatia, não por quadro
  ok(/window\._inscritosPinturaCompleta\s*=\s*function/.test(src), 'a trava de altura é solta por gancho da última fatia');
  ok(/setTimeout\(function \(\) \{ _restore\(\); _unlock\(\); \}, 4000\)/.test(src), 'rede: se a pintura não completar, a trava sai assim mesmo (trava presa é pior que pulinho)');

  // ── 2. o COMPORTAMENTO, no navegador, com o Confra real ───────────────────
  const srv = await servidor();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(base + '/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2000);

  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
  await p.evaluate((t) => {
    window._findTournamentById = () => t;
    window.AppStore = Object.assign(window.AppStore || {}, {
      currentUser: { uid: t.creatorUid || 'org', email: t.organizerEmail || 'o@x.com', displayName: 'Org' },
      isOrganizer: () => true, getTournament: () => t, tournaments: [t],
      sync() {}, syncImmediate() { return Promise.resolve(); }, mutate() { return Promise.resolve(); }
    });
    history.replaceState(null, '', '#participants/' + t.id);
    // Isola a fatia: neste ambiente os perfis não resolvem, e o soft-refresh que a
    // hidratação dispara repinta a lista vazia depois de ~1s. É comportamento PRÉ-
    // EXISTENTE (o código anterior faz igual, conferido) e nada tem a ver com fatiar —
    // deixá-lo solto mediria o ambiente em vez do que este teste guarda.
    window._softRefreshView = function () {};
    // e o router: `onAuthStateChanged` chama `initRouter()` quando o Firebase resolve
    // (router.js:216) e ele REPINTA o #view-container — sem login real cai noutra tela e
    // a lista some. Também é pré-existente e alheio a fatiar; este teste chama
    // `renderParticipants` direto e não precisa de router.
    window.initRouter = function () {};
  }, fx);

  const total = (fx.participants || []).length;
  ok(total > 100, 'o fixture é grande de verdade (' + total + ' inscritos) — fatiar só se prova em lista grande');

  // (a) no topo: a 1ª fatia é MENOR que a lista, e o que ela traz é card REAL
  const a = await p.evaluate(() => {
    const c = document.getElementById('view-container');
    c.innerHTML = ''; window.scrollTo(0, 0);
    window.renderParticipants(c, 'x');
    const cards = c.querySelectorAll('[data-part-card]');
    let visiveis = 0;
    Array.prototype.slice.call(cards).forEach(x => {
      const r = x.getBoundingClientRect();
      if (r.bottom > 0 && r.top < 844 && r.height > 0) visiveis++;
    });
    return { naFatia1: cards.length, visiveis, alturaDoc: Math.round(document.documentElement.scrollHeight) };
  });
  ok(a.naFatia1 > 0 && a.naFatia1 < total, 'no topo a 1ª fatia traz só parte da lista (' + a.naFatia1 + ' de ' + total + ')');
  ok(a.visiveis >= 3, 'e o que ela traz é card REAL preenchendo a tela (' + a.visiveis + ' visíveis) — nunca só o cabeçalho, que é o que produz a piscada preta');

  // (b) O INVARIANTE MAIS IMPORTANTE: sem rAF, a lista COMPLETA ainda chega.
  // É o cenário da aba de fundo e do painel de navegador. Sem isto a pessoa ficaria
  // com 20 de 111 e a tela afirmando 111.
  const semRaf = await p.evaluate(async () => {
    const c = document.getElementById('view-container');
    const guardado = window.requestAnimationFrame;
    // ⚠️ rAF DEFINIDO que NUNCA chama de volta — é assim que ele se comporta em aba de
    // fundo e no painel de navegador. Apagá-lo (`undefined`) seria um cenário que não
    // existe e ainda quebraria outros caminhos que o chamam sem guarda.
    window.requestAnimationFrame = function () { return 0; };
    c.innerHTML = ''; window.scrollTo(0, 0);
    window.renderParticipants(c, 'x');
    const logo = c.querySelectorAll('[data-part-card]').length;
    await new Promise(r => setTimeout(r, 600));    // só o timeout pode salvar
    const depois = c.querySelectorAll('[data-part-card]').length;
    window.requestAnimationFrame = guardado;
    return { logo, depois };
  });
  ok(semRaf.logo < total, 'sem rAF a 1ª fatia continua sendo fatia (' + semRaf.logo + ')');
  ok(semRaf.depois === total, 'SEM rAF NENHUM a lista chega COMPLETA pelo timeout (' + semRaf.depois + '/' + total + ') — lista incompleta que se diz completa é pior que lista lenta');

  // (c) a porta síncrona entrega tudo, e a ordem é a MESMA que a ordenação produz
  const ordem = await p.evaluate(() => {
    const c = document.getElementById('view-container');
    c.innerHTML = ''; window.scrollTo(0, 0);
    window.renderParticipants(c, 'x');
    window._flushInscritosPaint();
    const chaves = () => Array.prototype.slice.call(c.querySelectorAll('[data-part-card]'))
      .map(x => x.getAttribute('data-card-key') || x.getAttribute('data-part-name'));
    const antes = chaves();
    window._partApplyFilter();
    const depois = chaves();
    return { n: antes.length, igual: JSON.stringify(antes) === JSON.stringify(depois) };
  });
  ok(ordem.n === total, 'a porta síncrona entrega a lista inteira (' + ordem.n + '/' + total + ')');
  ok(ordem.igual, 'a ordem em que as fatias entram JÁ é a ordem final — a lista não remexe enquanto a pessoa lê');

  // (c2) DIGITAR ENQUANTO AS FATIAS CHEGAM: filtrar exige a lista inteira, senão as
  //      fatias seguintes nascem sem o `display` do filtro e aparecem sem casar com a
  //      busca — quem digitou "Kelly" veria estranhos pipocando.
  const busca = await p.evaluate(() => {
    const c = document.getElementById('view-container');
    c.innerHTML = ''; window.scrollTo(0, 0);
    window.renderParticipants(c, 'x');                 // fatias PENDENTES de propósito
    const antesDeDigitar = c.querySelectorAll('[data-part-card]').length;
    const inp = document.getElementById('part-search');
    if (inp) inp.value = 'zzzznaoexiste';
    window._partApplyFilter();                          // a pessoa digita
    const noDom = c.querySelectorAll('[data-part-card]').length;
    const visiveis = Array.prototype.slice.call(c.querySelectorAll('[data-part-card]'))
      .filter(x => x.style.display !== 'none').length;
    if (inp) { inp.value = ''; window._partApplyFilter(); }
    return { antesDeDigitar, noDom, visiveis };
  });
  ok(busca.antesDeDigitar < total, 'antes de digitar a lista ainda estava em fatias (' + busca.antesDeDigitar + ')');
  ok(busca.noDom === total, 'digitar COMPLETA a lista antes de filtrar (' + busca.noDom + '/' + total + ') — filtrar meia lista deixaria as fatias seguintes aparecerem sem casar com a busca');
  ok(busca.visiveis === 0, 'e o filtro vale pra TODOS, inclusive os que acabaram de chegar (' + busca.visiveis + ' visíveis pra uma busca que não casa com ninguém)');

  // (d) re-render no MEIO da lista: a fatia 1 acompanha o scroll (nada de branco),
  //     a trava de altura segura o documento e só sai depois da última fatia
  const meio = await p.evaluate(async () => {
    const c = document.getElementById('view-container');
    c.innerHTML = ''; window.scrollTo(0, 0);
    window.renderParticipants(c, 'x'); window._flushInscritosPaint();
    const alturaCheia = Math.round(document.documentElement.scrollHeight);
    window.scrollTo(0, 8000);
    const yAntes = Math.round(window.scrollY);

    window._reRenderParticipantsStable();          // o caminho REAL de marcar presença
    const durante = {
      cards: c.querySelectorAll('[data-part-card]').length,
      trava: c.style.minHeight,
      altura: Math.round(document.documentElement.scrollHeight),
      y: Math.round(window.scrollY)
    };
    let cobrindo = 0;
    Array.prototype.slice.call(c.querySelectorAll('[data-part-card]')).forEach(x => {
      const r = x.getBoundingClientRect();
      if (r.bottom > 0 && r.top < 844 && r.height > 0) cobrindo++;
    });
    window._flushInscritosPaint();
    await new Promise(r => setTimeout(r, 50));
    return {
      alturaCheia, yAntes, durante, cobrindo,
      fim: c.querySelectorAll('[data-part-card]').length,
      travaFim: c.style.minHeight || '',
      yFim: Math.round(window.scrollY)
    };
  });
  ok(meio.durante.cards > 20, 'no meio da lista a 1ª fatia CRESCE pra alcançar o scroll (' + meio.durante.cards + ' cards) — entregar só os 20 primeiros deixaria branco onde a pessoa olha');
  ok(meio.cobrindo >= 3, 'e há card REAL sob a tela durante a re-pintura (' + meio.cobrindo + ')');
  ok(meio.durante.trava !== '', 'a trava de altura está posta durante o rebuild');
  ok(Math.abs(meio.durante.altura - meio.alturaCheia) < 200, 'o documento NÃO encolhe (' + meio.durante.altura + ' vs ' + meio.alturaCheia + 'px) — encolher clampa o scroll e traz de volta o "sobe uma linha e desce rapidinho"');
  ok(meio.durante.y === meio.yAntes, 'o scroll fica onde estava durante a re-pintura (' + meio.durante.y + ')');
  ok(meio.fim === total, 'a lista fica completa depois (' + meio.fim + '/' + total + ')');
  ok(meio.travaFim === '', 'e a trava de altura sai — só depois da última fatia');
  ok(meio.yFim === meio.yAntes, 'e o scroll continua no mesmo ponto no fim (' + meio.yFim + ')');

  await b.close();
  srv.close();

  console.log('\n' + pass + ' ok, ' + fail + ' falhas');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
