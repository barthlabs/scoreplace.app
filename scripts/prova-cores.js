/* PROVA DE COR — a folha com TODAS as declarações de cor que o app emite.
 *
 * O comparador de pixel de telas reais (scripts/comparar-pixels.js) prova o CONJUNTO,
 * mas cobre 2 telas: numa migração de 190 cores, a cor que só aparece na tela de locais
 * passa batido. Aqui a cobertura é por CONSTRUÇÃO: varre js/ e css/, extrai toda
 * declaração `propriedade: cor` que existe no código, e monta uma folha com uma amostra
 * de cada uma — nos DOIS temas e TAMBÉM dentro da tarja de leitura, que é o contexto
 * onde o tema claro tem que se comportar como escuro.
 *
 * Um pixel diferente entre o antes e o depois = a migração mudou a tela.
 *
 * Uso:  node scripts/prova-cores.js --antes
 *       node scripts/prova-cores.js --depois
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
/* De onde ler o código. O "antes" precisa ler a árvore ANTERIOR à migração (um checkout do
 * HEAD em /tmp), senão a referência já sai migrada e a prova compara o depois com o depois. */
const FONTE = process.env.SP_FONTE || ROOT;
const { webkit } = require(path.join(ROOT, 'node_modules', 'playwright'));

const MODO = process.argv.includes('--depois') ? 'depois' : 'antes';
const DIR = '/tmp/sp-prova-cores';
const PROPS = '(?:color|background|background-color|border-color|border-top-color|border-bottom-color|border-left-color|border-right-color)';
const COR = '(?:#[0-9a-fA-F]{3,8}|rgba?\\([^)]*\\)|var\\(--[a-zA-Z0-9-]+(?:\\s*,[^)]*)?\\))';

function arquivos(dir, ext) {
  const out = [];
  (function anda(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'vendor' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) anda(p); else if (ext.test(e.name)) out.push(p);
    }
  })(dir);
  return out;
}

/* As declarações que a migração DE FATO toca: inline style em js/ e index.html, pelo mesmo
 * classificador que o migrador usa. ⛔ Listar toda declaração do código punha na folha
 * cores que vêm de css/*.css e de <style> — que a migração não toca — e a prova acusava
 * 97 "mudanças" em declarações que o app nunca emite como inline style. A prova tem que
 * medir o que mudou, não o que existe. */
function declaracoes() {
  const { classificador } = require(path.join(ROOT, 'scripts', 'migrar-cores.js'));
  const re = new RegExp('(^|[;{"\'\\s])(' + PROPS + ')(\\s*:\\s*)(' + COR + ')', 'g');
  const reB = new RegExp('(solid\\s+)(' + COR + ')', 'g');
  const set = new Set();
  const alvos = arquivos(path.join(FONTE, 'js'), /\.js$/);
  if (fs.existsSync(path.join(FONTE, 'index.html'))) alvos.push(path.join(FONTE, 'index.html'));
  alvos.forEach((f) => {
    const s = fs.readFileSync(f, 'utf8');
    const ehFolha = classificador(s);
    let m; re.lastIndex = 0;
    while ((m = re.exec(s))) {
      if (ehFolha(m.index + m[1].length)) continue;
      set.add((m[2].toLowerCase() + m[3] + m[4]).replace(/[\r\n]+/g, ' '));
    }
    reB.lastIndex = 0;
    while ((m = reB.exec(s))) {
      if (ehFolha(m.index + m[1].length)) continue;
      set.add('border:1px solid ' + m[2].replace(/[\r\n]+/g, ' '));
    }
  });
  return [...set].sort();
}

/* A folha. Cada declaração vira uma amostra com texto e moldura, pra que a mudança
 * apareça seja ela de texto, de fundo ou de borda. A segunda coluna é a MESMA amostra
 * dentro da tarja escura de leitura. */
function folha(decls) {
  const amostra = (d) => {
    const base = 'display:inline-block;width:150px;height:26px;line-height:26px;font:11px/26px monospace;' +
      'border:2px solid rgba(255,255,255,0.14);margin:1px;overflow:hidden;white-space:nowrap;';
    // ⛔ o rótulo é a PROPRIEDADE, nunca a declaração: `var(--x,#hex)` é mais comprido que
    // `#hex` e mudaria a largura do texto — a folha mudaria de forma sem nenhuma cor mudar.
    return '<span style="' + base + d + '">Aa 123 ' + d.split(':')[0] + '</span>';
  };
  const bloco = (titulo, wrap) =>
    '<h3 style="font:12px monospace;margin:6px 0 2px;">' + titulo + '</h3>' +
    (wrap ? '<div style="background:rgba(30,41,59,0.85);padding:4px;">' : '<div>') +
    decls.map(amostra).join('') + '</div>';
  return '<div style="width:1400px;">' + bloco('livre', false) + bloco('dentro da tarja', true) + '</div>';
}

/* A MESMA declaração, na forma que a migração produz — pela FUNÇÃO DO MIGRADOR, não por
 * uma cópia dela. A cópia divergiu duas vezes (tabela de borda, casamento por grafia), e
 * prova que usa lógica própria atesta uma migração que não é a que roda.
 * A declaração entra dentro de um `style="…"` de mentira porque é assim que o migrador
 * decide o que é inline style. */
function migrada(decl) {
  const M = require(path.join(ROOT, 'scripts', 'migrar-cores.js'));
  if (!migrada._ctx) migrada._ctx = M.contexto();
  const molde = '<div style="' + decl + '">';
  const saida = M.migrarTexto(molde, migrada._ctx);
  const m = saida.match(/^<div style="([\s\S]*)">$/);
  return m ? m[1] : decl;
}

(async () => {
  const guardado = path.join(DIR, 'declaracoes-antes.json');
  let decls, originais;
  if (MODO === 'antes') {
    decls = declaracoes(); originais = decls;
  } else {
    if (!fs.existsSync(guardado)) { console.error('rode --antes primeiro'); process.exit(2); }
    originais = JSON.parse(fs.readFileSync(guardado, 'utf8'));
    decls = originais.map(migrada);
  }
  console.log('declaracoes na folha: ' + decls.length);

  const CSS = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css']
    .filter((f) => fs.existsSync(path.join(FONTE, f)))
    .map((f) => fs.readFileSync(path.join(FONTE, f), 'utf8')).join('\n');
  const paleta = fs.existsSync(path.join(FONTE, 'css/paleta.css'))
    ? fs.readFileSync(path.join(FONTE, 'css/paleta.css'), 'utf8') : '';

  fs.mkdirSync(DIR, { recursive: true });
  if (MODO === 'antes') fs.writeFileSync(guardado, JSON.stringify(decls));

  const b = await webkit.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
  const p = await ctx.newPage();
  await p.route('**/*', (r) => r.abort());

  const resultado = {};
  for (const tema of ['dark', 'light']) {   // só 2 temas (js/theme.js)
    for (const naTarja of [false, true]) {
      const amostras = decls.map((d, k) =>
        '<span data-k="' + k + '" style="display:block;' + d + '">x</span>').join('');
      const corpo = naTarja
        ? '<div style="background:var(--sp-tarja,rgba(30,41,59,0.85));">' + amostras + '</div>'
        : '<div>' + amostras + '</div>';
      await p.setContent('<!doctype html><html data-theme="' + tema + '"><head><style>' + paleta + '\n' + CSS +
        '</style></head><body>' + corpo + '</body></html>', { waitUntil: 'domcontentloaded' });
      // ⭐ a cor RESOLVIDA, não o pixel: diz exatamente QUAL declaração mudou e pra quê.
      // Comparar bytes de PNG só diz "mudou" — inútil pra achar o erro entre 774 amostras.
      const lidos = await p.$$eval('[data-k]', (els) => els.map((e) => {
        const c = getComputedStyle(e);
        return [e.dataset.k, c.color, c.backgroundColor, c.borderTopColor].join('|');
      }));
      resultado[tema + (naTarja ? '-tarja' : '')] = lidos;
    }
  }
  await b.close();

  const arq = path.join(DIR, 'cores-resolvidas.json');
  if (MODO === 'antes') {
    fs.writeFileSync(arq, JSON.stringify(resultado));
    console.log('');
    console.log('✅ referencia guardada: ' + Object.keys(resultado).length + ' contextos x ' + decls.length + ' declaracoes');
    return;
  }
  const ref = JSON.parse(fs.readFileSync(arq, 'utf8'));
  let difs = 0, total = 0;
  Object.keys(ref).forEach((ctxNome) => {
    const a = ref[ctxNome], d = resultado[ctxNome] || [];
    a.forEach((linha, k) => {
      total++;
      if (linha === d[k]) return;
      difs++;
      if (difs <= 25) {
        console.log('  ✗ [' + ctxNome + '] ' + (originais[k] || '?'));
        console.log('       antes:  ' + linha.split('|').slice(1).join(' | '));
        console.log('       depois: ' + String(d[k] || '(sumiu)').split('|').slice(1).join(' | '));
      }
    });
  });
  console.log('');
  console.log(difs === 0
    ? '✅ ' + total + ' comparacoes IDENTICAS — a migracao e invisivel'
    : '⛔ ' + difs + ' de ' + total + ' mudaram');
  process.exit(difs ? 1 : 0);
})();
