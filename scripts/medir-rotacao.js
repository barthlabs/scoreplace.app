/* MEDE o que acontece quando a LARGURA muda (girar o celular).
 *
 * Relato do dono (25/ago/2026): _"quando estamos com o celular em pé e deitamos ele, a
 * largura da página muda e vejo que ele demora um tempo além do razoável para se adaptar"_.
 *
 * O que roda no `resize`: a igualada de altura dos botões (`evenRows`, js/ui.js) e o
 * ajuste de fonte dos nomes (`_fitNames`, js/store.js). O `_fitNames` já foi consertado
 * na 1.9.82 (lê e escreve em FASES). O `evenRows` não: ele limpa `min-height`, LÊ
 * `getBoundingClientRect()` e escreve de volta — POR LINHA. Escrever e depois ler força
 * um reflow SÍNCRONO, e são tantos quanto houver linhas de botão na tela.
 *
 * Aqui as duas formas são medidas na MESMA tela:
 *   A) POR LINHA  — como é hoje;
 *   B) EM FASES   — limpa TODAS, lê TODAS, escreve TODAS (2 reflows no total).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { webkit } = require(path.join(ROOT, 'node_modules', 'playwright'));

function html() {
  const vm = require('vm');
  const H = require(path.join(ROOT, 'tests', 'render-harness'));
  const W = H.window;
  /* ⛔ SEM AS VIEWS DE CHIP NÃO HÁ O QUE MEDIR. A linha de botões do cabeçalho do grupo
   * (`.btn-row`) só nasce quando existem os chips de WhatsApp / propor datas / cheguei —
   * e eles vêm destes arquivos. Sem carregá-los a chave sai com ZERO linhas de botão e a
   * medição responde "não custa nada" medindo nada. */
  ['views/wa-group.js', 'views/schedule-poll.js', 'views/liga-substitution.js',
   'views/tournaments-utils.js', 'views/tournaments-categories.js'].forEach((f) => {
    const abs = path.join(ROOT, 'js', f);
    if (!fs.existsSync(abs)) return;
    try { vm.runInContext(fs.readFileSync(abs, 'utf8'), H.sandbox, { filename: f }); } catch (e) {}
  });
  const t = JSON.parse(fs.readFileSync('/tmp/confra-live.json', 'utf8'));
  t.id = t.id || 'confra';
  W.AppStore = W.AppStore || {}; W.AppStore.tournaments = [t];
  // ORGANIZADOR: é pra ele que os chips aparecem em TODO grupo (2.0.57)
  W.AppStore.currentUser = { uid: t.creatorUid || 'x', notifyWhatsApp: true, displayName: 'Org' };
  W._isUserOrgOrCoHost = () => true;
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
    while (document.querySelectorAll('.btn-row').length < 60) alvo.insertAdjacentHTML('beforeend', molde);
    const rows = Array.prototype.slice.call(document.querySelectorAll('.btn-row'))
      .filter((r) => r.querySelectorAll('.btn').length >= 2);

    void document.body.offsetHeight;   // aquece: a 1ª operação pagaria o layout inicial

    const porLinha = () => {
      rows.forEach((row) => {
        const btns = row.querySelectorAll('.btn');
        let max = 0;
        for (let j = 0; j < btns.length; j++) btns[j].style.minHeight = '';
        for (let j = 0; j < btns.length; j++) max = Math.max(max, btns[j].getBoundingClientRect().height);
        if (!max) return;
        for (let j = 0; j < btns.length; j++) btns[j].style.minHeight = max + 'px';
      });
    };
    const emFases = () => {
      const todos = rows.map((row) => Array.prototype.slice.call(row.querySelectorAll('.btn')));
      todos.forEach((btns) => btns.forEach((b) => { b.style.minHeight = ''; }));   // 1: só escrita
      const alturas = todos.map((btns) => btns.map((b) => b.getBoundingClientRect().height)); // 2: só leitura
      todos.forEach((btns, i) => {                                                 // 3: só escrita
        const max = Math.max.apply(null, alturas[i]);
        if (max) btns.forEach((b) => { b.style.minHeight = max + 'px'; });
      });
    };

    // ⛔ cada repetição SUJA o estado: repetir com o min-height já correto não invalida
    // nada e o navegador pula o trabalho (a variante cara apareceria com 0,0ms).
    const REP = 10;
    const bloco = (fn) => {
      let t = 0;
      for (let k = 0; k < REP; k++) {
        rows.forEach((r) => r.querySelectorAll('.btn').forEach((b) => { b.style.minHeight = (k % 2 ? 31 : 29) + 'px'; }));
        void document.body.offsetHeight;
        const t0 = performance.now();
        fn();
        void document.body.offsetHeight;
        t += performance.now() - t0;
      }
      return t / REP;
    };
    const amostra = { porLinha: [], emFases: [] };
    for (let r = 0; r < 3; r++) { amostra.porLinha.push(bloco(porLinha)); amostra.emFases.push(bloco(emFases)); }
    const mediana = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    return { linhas: rows.length, botoes: rows.reduce((a, r) => a + r.querySelectorAll('.btn').length, 0),
      total: document.querySelectorAll('*').length,
      porLinha: mediana(amostra.porLinha), emFases: mediana(amostra.emFases) };
  });
  await b.close();

  const ms = (x) => x.toFixed(1).padStart(7) + ' ms';
  console.log('linhas de botão ... ' + m.linhas + '   (' + m.botoes + ' botões, ' + m.total + ' elementos na tela)');
  console.log('');
  console.log('  A) POR LINHA (como é hoje) ' + ms(m.porLinha));
  console.log('  B) EM FASES  (proposta) .. ' + ms(m.emFases));
  console.log('');
  console.log('  economia por rotação ..... ' + ms(m.porLinha - m.emFases));
})();
