/* O REALCE DO CLIQUE CHEGA A SER PINTADO? — prova por QUADRO, no motor do Safari.
 *
 * RELATO DO DONO, repetido por TRÊS DIAS: _"continua sem feedback de clique no card
 * do torneio"_ — enquanto a telemetria do aparelho dizia `sp:1`, ou seja, a classe
 * de realce ERA aplicada. As duas coisas eram verdade ao mesmo tempo:
 *
 *   O NAVEGADOR SÓ PINTA ENTRE TAREFAS. Na MESMA tarefa do clique acontecia
 *     (1) o card recebe a classe de realce e
 *     (2) `_showLoading` cria um overlay `position:fixed;inset:0` com fundo 96%
 *         opaco — a tela INTEIRA coberta.
 *   Quando a tarefa termina e o navegador finalmente pinta, o que existe na tela é
 *   o OVERLAY. O card escurecido nunca chegou a existir em quadro NENHUM. Não era
 *   timing infeliz: era impossível. Nenhum ajuste de CSS consertaria.
 *
 * ESTE TESTE NÃO OLHA CSS NEM CÓDIGO — ele CONTA QUADROS. Em cada quadro (dentro do
 * rAF, que roda ANTES da pintura daquele quadro) registra:
 *     • a opacidade computada do card
 *     • se o overlay já existe
 * Um quadro com card ESCURECIDO e SEM overlay = um quadro em que a pessoa VÊ o
 * realce. Zero desses quadros = a pessoa não vê nada, por mais bonito que o CSS seja.
 *
 * Roda nos DOIS desenhos (o antigo e o novo) para o teste provar que sabe detectar
 * a falha — teste que só passa não prova nada.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
let webkit;
try { webkit = require(path.join(ROOT, 'node_modules', 'playwright')).webkit; }
catch (e) { console.log('  · playwright ausente — teste pulado'); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

// O CSS real do realce, extraído do components.css (não é réplica).
const fs = require('fs');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');

const PAGINA = (modo) => `<!doctype html><html data-theme="dark"><head><style>
:root{--primary-color:#16a34a;--bg-card:#1e293b;--border-color:#334155;--radius-lg:12px;--transition-normal:.2s;}
body{margin:0;background:#0f172a;}
${CSS}
</style></head><body>
<div class="card" id="alvo" onclick="abrir()" style="height:120px;margin:20px;">card do torneio</div>
<script>
window.__frames = [];
function overlayLoader(){
  var ov = document.createElement('div');
  ov.id = 'sp-global-loading';
  ov.style.cssText = 'position:fixed;inset:0;z-index:100050;background:rgba(15,23,42,0.96);';
  document.body.appendChild(ov);
}
function gravaQuadros(n){
  var i = 0;
  (function passo(){
    var c = document.getElementById('alvo');
    window.__frames.push({
      op: c ? getComputedStyle(c).opacity : null,
      temOverlay: !!document.getElementById('sp-global-loading')
    });
    if (++i < n) requestAnimationFrame(passo);
  })();
}
function abrir(){
  var c = document.getElementById('alvo');
  ${modo === 'antigo'
    ? `// DESENHO ANTIGO: realce e overlay na MESMA tarefa
       c.classList.add('sp-abrindo');
       overlayLoader();`
    : `// DESENHO NOVO (2.0.65): realce → CEDE UM QUADRO DE VERDADE → overlay
       c.classList.add('sp-abrindo');
       requestAnimationFrame(function(){ setTimeout(overlayLoader, 110); });`}
}
gravaQuadros(14);
</script></body></html>`;

(async () => {
  console.log('──── o realce do toque chega a ser PINTADO? (motor do Safari, por quadro) ────');
  let browser;
  try { browser = await webkit.launch(); }
  catch (e) {
    // máquina sem o motor baixado (`npx playwright install webkit`): não reprova a
    // suíte por falta de ferramenta — mas DIZ, pra ninguém achar que passou.
    console.log('  · motor WebKit indisponível — teste PULADO (rode: npx playwright install webkit)');
    process.exit(0);
  }
  const resultados = {};
  for (const modo of ['antigo', 'novo']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.setContent(PAGINA(modo), { waitUntil: 'load' });
    await page.evaluate(() => { window.__frames.length = 0; });
    await page.tap('#alvo');
    await page.waitForTimeout(500);
    const frames = await page.evaluate(() => window.__frames);
    // quadro que a pessoa VÊ o realce: card escurecido E overlay ainda não existe
    const visiveis = frames.filter((f) => f.op !== null && Number(f.op) < 0.9 && !f.temOverlay);
    resultados[modo] = { total: frames.length, visiveis: visiveis.length, amostra: frames.slice(0, 5) };
    console.log('  · desenho ' + modo.toUpperCase() + ': ' + visiveis.length +
      ' quadro(s) com o card escurecido ANTES do overlay (de ' + frames.length + ' amostrados)');
    await ctx.close();
  }
  await browser.close();

  // 1) o teste sabe DETECTAR a falha (senão ele não prova nada)
  ok(resultados.antigo.visiveis === 0,
     'o desenho ANTIGO não pinta o realce em quadro NENHUM — é o bug que o dono via (' +
     resultados.antigo.visiveis + ' quadros)');
  // 2) e o desenho novo pinta
  // ⛔ UM quadro (16ms) e' pouco pro olho: o realce tem que FICAR visivel. 110ms de
  // espera = ~6 quadros a 60Hz; exigimos pelo menos 3 pra nao travar no limiar.
  ok(resultados.novo.visiveis >= 3,
     'o desenho NOVO mantem o card escurecido por VARIOS quadros antes do overlay (' +
     resultados.novo.visiveis + ' quadros) — perceptivel, nao um piscar de 16ms');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
  process.exit(fail ? 1 : 0);
})();
