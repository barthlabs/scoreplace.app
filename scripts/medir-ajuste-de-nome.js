/* MEDE o que custa a caixa de nome com FONTE VARIÁVEL e QUEBRA DE LINHA.
 *
 * Pergunta do dono (25/ago/2026): _"os boxes das fontes e quebras de linhas variáveis não
 * interferem na performance?"_ — pergunta certa: interferem, e já foram O problema.
 * O histórico está no próprio código (store.js, v1.9.82): escrever `fontSize` e ler
 * `scrollWidth` alternadamente força um reflow SÍNCRONO por leitura. Eram ~200 por nome;
 * viraram 2 por LOTE, em três fases (escreve todos → lê todos → escreve todos).
 *
 * Aqui a medição compara as DUAS formas na MESMA chave real, pra que a resposta seja um
 * número e não uma opinião:
 *   A) INTERCALADO — como era: escreve e lê nome a nome;
 *   B) EM FASES    — como é hoje: escreve todos, lê todos, escreve todos;
 *   C) SEM AJUSTE  — fonte fixa, o piso do que dá pra economizar.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { webkit } = require(path.join(ROOT, 'node_modules', 'playwright'));

function html() {
  const H = require(path.join(ROOT, 'tests', 'render-harness'));
  const W = H.window;
  const t = JSON.parse(fs.readFileSync('/tmp/confra-live.json', 'utf8'));
  t.id = t.id || 'confra';
  W.AppStore = W.AppStore || {}; W.AppStore.tournaments = [t];
  W.AppStore.currentUser = { uid: t.creatorUid || 'x' };
  W._findTournamentById = () => t;
  let h = '';
  const c = { get innerHTML() { return h; }, set innerHTML(v) { h = v; },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, dataset: {},
    getAttribute: () => null, setAttribute() {} };
  W.renderBracket(c, t.id, true);
  return h;
}

(async () => {
  const corpo = html();
  const CSS = ['css/paleta.css', 'css/style.css', 'css/components.css', 'css/layout.css',
    'css/bracket.css', 'css/responsive.css', 'css/trophies.css']
    .filter((f) => fs.existsSync(path.join(ROOT, f)))
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

  const b = await webkit.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.route('**/*', (r) => r.abort());
  await p.setContent('<!doctype html><html data-theme="dark"><head><style>' + CSS +
    '</style></head><body><div id="v">' + corpo + '</div></body></html>', { waitUntil: 'domcontentloaded' });

  const m = await p.evaluate(() => {
    const alvo = document.getElementById('v');
    const molde = alvo.innerHTML;
    while (document.querySelectorAll('.sp-name-fit').length < 400) alvo.insertAdjacentHTML('beforeend', molde);
    const els = Array.prototype.slice.call(document.querySelectorAll('.sp-name-fit'));

    // ⛔ AQUECER ANTES DE MEDIR. A primeira operação paga o layout INICIAL da página
    // inteira — na primeira versão desta medição a variante "fonte fixa" apareceu com
    // 58ms e a "em fases" com 1ms, o que diria que ajustar é de graça e não ajustar é
    // caro. Não era medição, era ordem de execução.
    void document.body.offsetHeight;
    els.forEach((e) => { e.style.fontSize = '0.85rem'; });
    void document.body.offsetHeight;

    /* ⛔ DUAS ARMADILHAS que já falsearam esta medição:
     *  ① a 1ª variante a rodar paga o layout inicial da página (deu "fonte fixa 58ms");
     *  ② rodar de novo com a fonte JÁ correta não invalida nada e o navegador pula o
     *     trabalho — a variante mais cara apareceu com 0,0ms.
     * Então: cada repetição SUJA o estado com um tamanho diferente antes de medir, e o
     * relógio do WebKit tem passo de 1ms, o que exige medir um BLOCO de repetições. */
    const REP = 12;
    const suja = (k) => { const v = (k % 2) ? '0.9rem' : '0.8rem'; els.forEach((e) => { e.style.fontSize = v; }); void document.body.offsetHeight; };

    const variantes = {
      semAjuste: () => { els.forEach((e) => { e.style.fontSize = '0.78rem'; }); },
      emFases: () => {
        els.forEach((e) => { e.style.fontSize = '0.85rem'; });
        const lidos = els.map((e) => [e.scrollWidth, (e.parentElement || e).clientWidth]);
        els.forEach((e, i) => {
          const sw = lidos[i][0], bw = lidos[i][1];
          if (sw > bw + 1) e.style.fontSize = (0.85 * ((bw + 1) / Math.max(1, sw))).toFixed(2) + 'rem';
        });
      },
      intercalado: () => {
        els.forEach((e) => {
          e.style.fontSize = '0.85rem';
          const sw = e.scrollWidth, bw = (e.parentElement || e).clientWidth;
          if (sw > bw + 1) e.style.fontSize = (0.85 * ((bw + 1) / Math.max(1, sw))).toFixed(2) + 'rem';
        });
      }
    };
    const bloco = (fn) => {
      let t = 0;
      for (let k = 0; k < REP; k++) {
        suja(k);                       // fora do relógio: é preparação, não a medida
        const t0 = performance.now();
        fn();
        void document.body.offsetHeight;
        t += performance.now() - t0;
      }
      return t / REP;
    };
    const amostras = { semAjuste: [], emFases: [], intercalado: [] };
    for (let r = 0; r < 3; r++) Object.keys(variantes).forEach((k) => { amostras[k].push(bloco(variantes[k])); });
    const mediana = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

    return { n: els.length, total: document.querySelectorAll('*').length,
      semAjuste: mediana(amostras.semAjuste), emFases: mediana(amostras.emFases),
      intercalado: mediana(amostras.intercalado) };
  });
  await b.close();

  const ms = (x) => x.toFixed(1).padStart(7) + ' ms';
  console.log('nomes com caixa ajustável .. ' + m.n + '   (de ' + m.total + ' elementos na tela)');
  console.log('');
  console.log('  C) sem ajuste (fonte fixa) ' + ms(m.semAjuste));
  console.log('  B) em FASES (como é hoje)  ' + ms(m.emFases));
  console.log('  A) INTERCALADO (como era)  ' + ms(m.intercalado));
  console.log('');
  console.log('  o ajuste custa hoje ....... ' + ms(m.emFases - m.semAjuste) + '  a mais que fonte fixa');
  console.log('  intercalar custaria ....... ' + ms(m.intercalado - m.emFases) + '  a mais que hoje');
})();
