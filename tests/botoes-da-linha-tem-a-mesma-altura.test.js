/* BOTÕES DA MESMA LINHA: MESMA ALTURA, MESMO TOPO, MESMA BASE — a altura é a do MAIS ALTO.
 *
 * RELATO DO DONO (23/ago/2026, com print da chave da Confra): _"o aplicar wo está
 * desalinhado em relação aos outros botões"_ + a regra, dita logo em seguida: _"botões na
 * mesma linha sempre com a mesma altura e alinhados base/topo"_, _"usar a altura do mais
 * alto"_.
 *
 * A CAUSA MEDIDA — e ela não estava no botão de W.O.: o cabeçalho do card de jogo
 * (bracket.js) nascia com `class=` DUPLICADO:
 *
 *     <div id="header-btns-…" class="btn-row" class="sp-mc-acts">
 *
 * O parser de HTML fica com o PRIMEIRO `class` e descarta o segundo — sem erro, sem aviso,
 * sem nada no console. Quem trazia o `display:flex` era justamente a classe descartada
 * (`.sp-mc-acts`), então a linha caía em layout de BLOCO. Aí os `.btn` (inline-flex) passam
 * a se alinhar pela BASE DO TEXTO: o botão de 2 linhas ("Aplicar / W.O.") sobe em relação
 * aos vizinhos de 1 linha e a regra `align-self:stretch` — que é quem dá a altura do mais
 * alto — nem chega a valer, porque em bloco não existe eixo transversal pra esticar.
 *
 * A CURA, em dois níveis:
 *   1. o `class` duplicado do cabeçalho virou um só (`class="btn-row sp-mc-acts"`);
 *   2. `.btn-row` passou a TRAZER o `display:flex` (components.css). Assim marcar a linha
 *      basta: nenhuma linha do app depende mais de uma SEGUNDA classe pra alinhar.
 *
 * O teste cobre os dois lados, porque cada um sozinho deixa metade do estrago de pé:
 *   • ESTÁTICO: nenhuma tag `.btn-row` do app pode ter `class=` duplicado (a armadilha
 *     silenciosa que nos custou este bug);
 *   • MEDIDO: Chromium com o CSS REAL do app, renderizando o cabeçalho REAL do card —
 *     topo, base e altura iguais, e a altura sendo a do botão mais alto. E o markup
 *     QUEBRADO (o de antes) tem de FALHAR na mesma medição, senão o teste não mede nada.
 *
 * Roda com: node tests/botoes-da-linha-tem-a-mesma-altura.test.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}

/* ── 1. ESTÁTICO — `class=` duplicado em linha de botões ──────────────────────────── */
function varrerClassDuplicado() {
  console.log('\n① Nenhuma linha .btn-row com `class=` duplicado');
  const arquivos = [];
  (function anda(dir) {
    for (const nome of fs.readdirSync(path.join(ROOT, dir))) {
      const rel = dir + '/' + nome;
      const st = fs.statSync(path.join(ROOT, rel));
      if (st.isDirectory()) { if (nome !== 'node_modules') anda(rel); }
      else if (/\.(js|html)$/.test(nome)) arquivos.push(rel);
    }
  })('js');
  arquivos.push('index.html');

  const culpados = [];
  for (const rel of arquivos) {
    const src = read(rel);
    // cada tag de abertura do arquivo; só interessam as que carregam btn-row
    const tags = src.match(/<[a-zA-Z][^<>]*>/g) || [];
    for (const tag of tags) {
      if (tag.indexOf('btn-row') === -1) continue;
      const qtd = (tag.match(/\bclass\s*=/g) || []).length;
      if (qtd > 1) culpados.push(rel + ' → ' + tag.slice(0, 120));
    }
    // e a linha do cabeçalho do card tem de carregar AS DUAS classes no MESMO atributo
    if (rel === 'js/views/bracket.js') {
      // a linha dos botões é a que RECEBE _headerActions (a outra div com o mesmo id é
      // a coluna do cabeçalho PENDENTE, que empilha tag/aviso e não é linha de botão).
      const m = src.match(/<div id="header-btns-\$\{m\.id\}"[^>]*>\$\{_headerActions\}/);
      ok(!!m, 'a linha de botões do card de jogo existe no bracket.js');
      if (m) {
        const cls = (m[0].match(/class="([^"]*)"/) || [])[1] || '';
        ok(/\bbtn-row\b/.test(cls) && /\bsp-mc-acts\b/.test(cls),
          'a linha carrega btn-row E sp-mc-acts no MESMO class (obtido: "' + cls + '")');
      }
    }
  }
  ok(culpados.length === 0, 'nenhuma tag .btn-row com class duplicado' +
    (culpados.length ? ' — ' + culpados.join(' | ') : ''));
}

/* ── 2. MEDIDO — CSS real, cabeçalho real, régua de verdade ───────────────────────── */
const CSS = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css']
  .map(read).join('\n');

// markup do cabeçalho do card, com os 3 botões do print: W.O. (2 linhas, fonte menor),
// Ao Vivo e Confirmar — os estilos inline são os REAIS (store.js _woBtnHtml e bracket.js).
const BTN_WO = '<button type="button" class="btn btn-danger btn-micro" ' +
  'style="font-size:0.62rem;padding:3px 9px;line-height:1.08;height:auto;white-space:normal;text-align:center;">Aplicar<br>W.O.</button>';
const BTN_LIVE = '<button class="btn btn-live btn-micro" style="flex-shrink:0;font-size:0.72rem;">📡 Ao Vivo</button>';
const BTN_OK = '<button class="btn btn-success btn-micro" style="flex-shrink:0;font-size:0.72rem;">✓ Confirmar</button>';

function card(id, classAttr) {
  return '<div class="sp-mc-head">' +
    '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;min-width:0;">' +
      '<span style="font-size:0.7rem;font-weight:700;color:#38bdf8;text-transform:uppercase;">JOGO 154</span>' +
      '<span style="font-size:0.6rem;color:#22c55e;">PRONTO</span>' +
    '</div>' +
    '<div id="' + id + '" ' + classAttr + '>' + BTN_WO + BTN_LIVE + BTN_OK + '</div>' +
  '</div>';
}

async function medir() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const larguras = [390, 768, 1280];
  const saida = {};
  for (const w of larguras) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.setContent(
      '<style>' + CSS + '</style><body style="background:#0b1220;padding:10px;">' +
      '<div style="max-width:400px;">' +
        card('linha-boa', 'class="btn-row sp-mc-acts"') +       // como está agora
        // CONTROLE: a linha caindo em layout de BLOCO — exatamente o que o `class`
        // duplicado produzia antes de `.btn-row` trazer o `display:flex`. Se a régua não
        // acusar ESTE caso, ela não está medindo nada.
        '<style>#linha-ruim{display:block !important;}</style>' +
        card('linha-ruim', 'class="btn-row sp-mc-acts"') +
      '</div></body>', { waitUntil: 'load' });
    saida[w] = await page.evaluate(() => {
      const ler = (id) => {
        const r = [...document.querySelectorAll('#' + id + ' > button')]
          .map((b) => { const x = b.getBoundingClientRect(); return { t: x.top, b: x.bottom, h: x.height }; });
        const d = (k) => +(Math.max(...r.map((x) => x[k])) - Math.min(...r.map((x) => x[k]))).toFixed(2);
        return { topo: d('t'), base: d('b'), altura: d('h'), maisAlto: +Math.max(...r.map((x) => x.h)).toFixed(2) };
      };
      return { boa: ler('linha-boa'), ruim: ler('linha-ruim') };
    });
  }
  await browser.close();
  return saida;
}

(async function () {
  varrerClassDuplicado();

  console.log('\n② Chromium com o CSS real — topo, base e altura iguais');
  const m = await medir();
  for (const w of Object.keys(m)) {
    const { boa, ruim } = m[w];
    ok(boa.topo <= 0.5, w + 'px · mesmo TOPO (Δ=' + boa.topo + 'px)');
    ok(boa.base <= 0.5, w + 'px · mesma BASE (Δ=' + boa.base + 'px)');
    ok(boa.altura <= 0.5, w + 'px · mesma ALTURA (Δ=' + boa.altura + 'px, mais alto=' + boa.maisAlto + 'px)');
    // a régua tem de acusar o markup quebrado — senão não está medindo nada
    ok(ruim.topo > 0.5 || ruim.base > 0.5,
      w + 'px · a linha SEM flex (o bug de antes) FALHA na mesma régua (Δtopo=' + ruim.topo + ', Δbase=' + ruim.base + ')');
  }

  console.log('\n' + (falhas ? '✗ ' + falhas + '/' + testes + ' falharam' : '✓ ' + testes + '/' + testes + ' passaram'));
  process.exit(falhas ? 1 : 0);
})();
