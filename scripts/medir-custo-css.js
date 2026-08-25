/* MEDE o custo de CASAMENTO DE SELETOR do CSS do app, na mesma tela, no WebKit.
 *
 * É a medição que motivou a tabela de cor: as regras `[style*="..."]` são casamento de
 * SUBSTRING DE ATRIBUTO — nenhum índice do navegador (tag, classe, id) filtra antes, então
 * cada uma é testada contra cada elemento. O custo é LINEAR no número dessas regras.
 *
 * Uso:  node scripts/medir-custo-css.js            (CSS de agora)
 *       SP_FONTE=/tmp/sp-antes node scripts/medir-custo-css.js   (CSS de antes)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FONTE = process.env.SP_FONTE || ROOT;
const { webkit } = require(path.join(ROOT, 'node_modules', 'playwright'));

/* A tela mais pesada que o app desenha: a chave do torneio real. Sem ela a medição vira
 * teoria — o custo só aparece com muitos elementos. */
function html() {
  const H = require(path.join(ROOT, 'tests', 'render-harness'));
  const W = H.window;
  const dump = '/tmp/confra-agora-obj.json';
  if (!fs.existsSync(dump)) return null;
  const t = JSON.parse(fs.readFileSync(dump, 'utf8'));
  t.id = t.id || 'confra';
  W.AppStore = W.AppStore || {};
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = { uid: t.creatorUid || 'x' };
  W._findTournamentById = () => t;
  let h = '';
  const cont = {
    get innerHTML() { return h; }, set innerHTML(v) { h = v; },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, dataset: {},
    getAttribute: () => null, setAttribute() {}
  };
  try { W.renderBracket(cont, t.id, true); } catch (e) { console.error('render falhou: ' + e.message); }
  return h;
}

(async () => {
  const corpo = html();
  if (!corpo) { console.error('falta /tmp/confra-agora-obj.json (o dump da chave real)'); process.exit(2); }
  const folhas = ['css/paleta.css', 'css/style.css', 'css/components.css', 'css/layout.css',
    'css/bracket.css', 'css/responsive.css', 'css/trophies.css']
    .filter((f) => fs.existsSync(path.join(FONTE, f)));
  const CSS = folhas.map((f) => fs.readFileSync(path.join(FONTE, f), 'utf8')).join('\n');
  const attr = (CSS.match(/\[style[*^$]=/g) || []).length;

  const b = await webkit.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.route('**/*', (r) => r.abort());
  await p.setContent('<!doctype html><html data-theme="light"><head><style>' + CSS +
    '</style></head><body><div id="view-container">' + corpo + '</div></body></html>',
    { waitUntil: 'domcontentloaded' });

  const m = await p.evaluate(() => {
    // ⚠️ A CHAVE NASCE PREGUIÇOSA (2.0.88): só o primeiro grupo é montado, e 218 elementos
    // não fazem custo nenhum aparecer. A tela que o dono usa é a EXPANDIDA — ele abre os
    // grupos. Replico o conteúdo até a ordem de grandeza real (~5.000 elementos), que é
    // onde a medição anterior encontrou os 486ms.
    const alvo = document.getElementById('view-container');
    const molde = alvo.innerHTML;
    while (document.querySelectorAll('*').length < 5000) alvo.insertAdjacentHTML('beforeend', molde);
    const n = document.querySelectorAll('*').length;

    // ⭐ Trocar o TEMA invalida o estilo de todo mundo (as regras de tema estão na raiz),
    // então o navegador tem que RECASAR todos os seletores contra todos os elementos.
    // É exatamente o custo que as regras `[style*=]` inflavam. Ler `offsetHeight` força
    // o trabalho a acontecer ANTES de a medição parar.
    const amostras = [];
    for (let k = 0; k < 9; k++) {
      const tema = (k % 2) ? 'light' : 'dark';
      const t0 = performance.now();
      document.documentElement.setAttribute('data-theme', tema);
      void document.body.offsetHeight;
      amostras.push(performance.now() - t0);
    }
    amostras.sort((a, b) => a - b);
    return { n: n, mediana: amostras[Math.floor(amostras.length / 2)],
             min: amostras[0], max: amostras[amostras.length - 1] };
  });
  await b.close();

  console.log('fonte ................. ' + FONTE);
  console.log('folhas ................ ' + folhas.length + ' (' + Math.round(CSS.length / 1024) + ' KB)');
  console.log('regras [style*=] ...... ' + attr);
  console.log('elementos na tela ..... ' + m.n);
  console.log('recalculo de estilo ... ' + m.mediana.toFixed(1) + ' ms  (min ' + m.min.toFixed(1) + ' / max ' + m.max.toFixed(1) + ')');
})();
