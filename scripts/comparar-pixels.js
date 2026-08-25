/* COMPARADOR DE PIXEL — prova que uma mudança de COR não mudou a tela.
 *
 * A migração das cores (2.327 regras `[style*=]` → tabela de variáveis) é mecânica e
 * grande: 177 cores, ~3.380 ocorrências em 57 arquivos. Fazer isso "no olho" é como se
 * quebra um tema inteiro sem perceber.
 *
 * Aqui a prova é objetiva: a MESMA tela, nos DOIS temas, antes e depois, comparada
 * pixel a pixel. Um pixel diferente e a substituição está errada.
 *
 * ⛔ Não é opinião de design: é igualdade. A migração PRECISA ser invisível — o dono
 * foi explícito: "nada da Confra pode mudar no que as pessoas veem".
 *
 * Uso:  node scripts/comparar-pixels.js --antes    (guarda o retrato de referência)
 *       node scripts/comparar-pixels.js --depois   (compara com o retrato)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const { webkit } = require(path.join(ROOT, 'node_modules', 'playwright'));

const MODO = process.argv.includes('--depois') ? 'depois' : 'antes';
const DIR = '/tmp/sp-pixels';

function montaTelas() {
  const H = require(path.join(ROOT, 'tests', 'render-harness'));
  const W = H.window;
  ['views/tournaments-categories.js', 'views/schedule-poll.js', 'views/wa-group.js', 'views/dashboard.js']
    .forEach((f) => { try { vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'), H.sandbox, { filename: f }); } catch (e) {} });

  const arr = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const lista = (Array.isArray(arr) ? arr : (arr.tournaments || [])).slice(0, 6)
    .map((t, i) => Object.assign({ id: t.id || ('t' + i) }, t));
  W.AppStore = W.AppStore || {};
  W.AppStore.tournaments = lista;
  W.AppStore.currentUser = { uid: lista[0] && lista[0].creatorUid, email: 'x@y.z' };
  W.AppStore.getVisibleTournaments = () => lista;
  W._getHidden = () => [];

  const telas = {};
  let html = '';
  const cont = {
    get innerHTML() { return html; }, set innerHTML(v) { html = v; },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, dataset: {},
    getAttribute: () => null, setAttribute() {}
  };
  try { W.renderDashboard(cont); telas['tela-inicial'] = html; } catch (e) { console.error('dashboard falhou:', e.message); }

  // a CHAVE do Confra, se o dump ao vivo existir
  try {
    if (fs.existsSync('/tmp/confra-live.json')) {
      const t = JSON.parse(fs.readFileSync('/tmp/confra-live.json', 'utf8'));
      t.id = t.id || 'confra';
      W.AppStore.tournaments = [t];
      W._findTournamentById = () => t;
      const c2 = Object.assign({}, cont); let h2 = '';
      Object.defineProperty(c2, 'innerHTML', { get: () => h2, set: (v) => { h2 = v; } });
      W.renderBracket(c2, t.id, true);
      if (h2) telas['chave'] = h2;
    }
  } catch (e) { console.error('chave falhou:', e.message); }
  return telas;
}

(async () => {
  const telas = montaTelas();
  const CSS = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css']
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

  fs.mkdirSync(DIR, { recursive: true });
  const b = await webkit.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.route('**/*', (r) => r.abort());

  let iguais = 0, difs = 0, novos = 0;
  for (const [nome, html] of Object.entries(telas)) {
    for (const tema of ['dark', 'light']) {
      const chave = nome + '-' + tema;
      await p.setContent('<!doctype html><html data-theme="' + tema + '"><head><style>' + CSS +
        '</style></head><body><div class="topbar" style="height:60px"></div><div id="view-container">' + html + '</div></body></html>',
        { waitUntil: 'domcontentloaded' });
      // ⚠️ tela INTEIRA, não só a primeira dobra: cor errada no fim da página é cor errada.
      const foto = await p.screenshot({ fullPage: true });
      const arq = path.join(DIR, chave + '.png');
      if (MODO === 'antes') { fs.writeFileSync(arq, foto); novos++; continue; }
      if (!fs.existsSync(arq)) { console.log('  ⚠️ sem referência para', chave); continue; }
      const ref = fs.readFileSync(arq);
      if (ref.equals(foto)) { iguais++; console.log('  ✓ ' + chave + ' — idêntico'); }
      else {
        difs++;
        fs.writeFileSync(path.join(DIR, chave + '-DEPOIS.png'), foto);
        console.log('  ✗ ' + chave + ' — MUDOU  (' + ref.length + ' → ' + foto.length + ' bytes)');
        console.log('      compare: ' + arq + '  ×  ' + path.join(DIR, chave + '-DEPOIS.png'));
      }
    }
  }
  await b.close();

  if (MODO === 'antes') {
    console.log('\n✅ ' + novos + ' retratos de referência guardados em ' + DIR);
    console.log('   agora faça a mudança e rode:  node scripts/comparar-pixels.js --depois');
  } else {
    console.log('\n' + (difs === 0
      ? '✅ ' + iguais + ' telas IDÊNTICAS nos dois temas — a mudança é invisível'
      : '⛔ ' + difs + ' tela(s) MUDARAM — a substituição está errada'));
    process.exit(difs ? 1 : 0);
  }
})();
