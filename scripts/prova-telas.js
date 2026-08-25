/* PROVA DE TELA — a cor RESOLVIDA de cada elemento, nas telas reais, nos dois temas.
 *
 * Irmão da prova-cores.js, e o que de fato pega os erros: a prova de cores mede o
 * MAPEAMENTO (declaração x → cor y) e passou 4.560/4.560 enquanto 44 elementos da chave
 * estavam errados — porque a cor deles não está escrita junto da propriedade, ela chega
 * por argumento e é concatenada. Só renderizando a tela isso aparece.
 *
 * ⛔ Compara COR RESOLVIDA, não pixel: um diff de PNG diz "mudou" e não diz onde. E as
 * telas com regressiva mudam de pixel a cada minuto sem nada ter mudado.
 * ⛔ Um PROCESSO por árvore: o render-harness guarda estado global, e rodar as duas no
 * mesmo processo devolve a PRIMEIRA nas duas vezes (custou um diagnóstico inteiro).
 *
 * Uso:  node scripts/prova-telas.js <raiz> <saida.json>     (colhe de uma árvore)
 *       node scripts/prova-telas.js --comparar <a.json> <b.json>
 */
const fs = require('fs');
const path = require('path');

if (process.argv[2] === '--comparar') {
  const A = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const B = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  let difs = 0, total = 0;
  Object.keys(A).forEach((ch) => {
    const a = A[ch], b = B[ch] || [];
    if (a.length !== b.length) {
      console.log('  ⚠️ ' + ch + ': ' + a.length + ' elementos x ' + b.length + ' — estrutura mudou');
    }
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      total++;
      if (a[i].v === b[i].v) continue;
      difs++;
      if (difs <= 15) {
        console.log('  ✗ [' + ch + '] #' + i + ' <' + a[i].t.toLowerCase() + '> "' + a[i].txt + '"');
        console.log('       antes:  ' + a[i].v);
        console.log('       depois: ' + b[i].v);
        console.log('       style:  ' + b[i].st);
      }
    }
  });
  console.log('');
  console.log(difs === 0 ? '✅ ' + total + ' elementos com a MESMA cor resolvida'
                         : '⛔ ' + difs + ' de ' + total + ' mudaram de cor');
  process.exit(difs ? 1 : 0);
}

const RAIZ = process.argv[2] || path.join(__dirname, '..');
const SAIDA = process.argv[3] || '/tmp/sp-telas.json';
const { webkit } = require(path.join(__dirname, '..', 'node_modules', 'playwright'));

const vm = require('vm');
const H = require(path.join(RAIZ, 'tests', 'render-harness'));
const W = H.window;
/* O harness carrega só a camada de lógica. As views de TELA entram aqui — é nelas que a
 * inline style é montada, e sem elas a prova mediria meia dúzia de divs. */
['views/tournaments-categories.js', 'views/schedule-poll.js', 'views/wa-group.js',
 'views/dashboard.js', 'views/tournaments-utils.js', 'views/liga-substitution.js']
  .forEach((f) => {
    const abs = path.join(RAIZ, 'js', f);
    if (!fs.existsSync(abs)) return;
    try { vm.runInContext(fs.readFileSync(abs, 'utf8'), H.sandbox, { filename: f }); }
    catch (e) { console.error('  (' + f + ' nao carregou: ' + e.message + ')'); }
  });

function container() {
  let h = '';
  return {
    get innerHTML() { return h; }, set innerHTML(v) { h = v; },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, dataset: {},
    getAttribute: () => null, setAttribute() {}, get _html() { return h; }
  };
}

function telas() {
  const out = {};
  const arr = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tests', 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const lista = (Array.isArray(arr) ? arr : (arr.tournaments || [])).slice(0, 6)
    .map((t, i) => Object.assign({ id: t.id || ('t' + i) }, t));
  W.AppStore = W.AppStore || {};
  W.AppStore.tournaments = lista;
  W.AppStore.currentUser = { uid: (lista[0] && lista[0].creatorUid) || 'x', email: 'x@y.z' };
  W.AppStore.getVisibleTournaments = () => lista;
  W._getHidden = () => [];

  const tenta = (nome, fn) => {
    try { const c = container(); fn(c); if (c._html) out[nome] = c._html; }
    catch (e) { console.error('  (' + nome + ' nao renderizou: ' + e.message + ')'); }
  };
  tenta('tela-inicial', (c) => W.renderDashboard(c));
  if (fs.existsSync('/tmp/confra-live.json')) {
    const t = JSON.parse(fs.readFileSync('/tmp/confra-live.json', 'utf8'));
    t.id = t.id || 'confra';
    W.AppStore.tournaments = [t];
    W._findTournamentById = () => t;
    tenta('chave', (c) => W.renderBracket(c, t.id, true));
    tenta('detalhe', (c) => W.renderTournamentDetail && W.renderTournamentDetail(c, t.id));
  }
  return out;
}

(async () => {
  const t = telas();
  const css = ['css/paleta.css', 'css/style.css', 'css/components.css', 'css/layout.css',
    'css/bracket.css', 'css/responsive.css', 'css/trophies.css']
    .filter((f) => fs.existsSync(path.join(RAIZ, f)))
    .map((f) => fs.readFileSync(path.join(RAIZ, f), 'utf8')).join('\n');

  const b = await webkit.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.route('**/*', (r) => r.abort());
  const out = {};
  for (const [nome, html] of Object.entries(t)) {
    for (const tema of ['dark', 'light']) {
      await p.setContent('<!doctype html><html data-theme="' + tema + '"><head><style>' + css +
        '</style></head><body><div id="v">' + html + '</div></body></html>', { waitUntil: 'domcontentloaded' });
      out[nome + '-' + tema] = await p.$$eval('#v *', (els) => els.map((e) => {
        const c = getComputedStyle(e);
        /* ⛔ COR DE BORDA SÓ CONTA ONDE A BORDA TEM LARGURA. A regra antiga (`solid rgba(...)`)
         * respondia com `border-color`, que pinta os QUATRO lados; o token pinta só o lado
         * declarado. Num `border-top:1px solid X` os outros três mudam de cor computada e
         * ficam invisíveis do mesmo jeito (largura zero). Comparar a cor crua acusava 152
         * "mudanças" que ninguém vê — a prova tem que medir a TELA, não o valor computado. */
        const lado = (w, cor) => (parseFloat(w) > 0 ? cor : '-');
        return { t: e.tagName, st: (e.getAttribute('style') || '').slice(0, 110),
          v: [c.color, c.backgroundColor,
              lado(c.borderTopWidth, c.borderTopColor), lado(c.borderRightWidth, c.borderRightColor),
              lado(c.borderBottomWidth, c.borderBottomColor), lado(c.borderLeftWidth, c.borderLeftColor),
              c.outlineWidth !== '0px' ? c.outlineColor : '-'].join(' | '),
          txt: (e.textContent || '').trim().slice(0, 30) };
      }));
    }
  }
  await b.close();
  fs.writeFileSync(SAIDA, JSON.stringify(out));
  console.log(Object.entries(out).map(([k, v]) => k + ': ' + v.length).join('  ·  '));
})();
