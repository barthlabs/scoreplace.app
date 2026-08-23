/* O NOME NO CARD DA CHAVE USA A CLASSE QUE SEMPRE ESTEVE ESCRITA — `class=` DUPLICADO.
 *
 * A ARMADILHA, medida em 23/ago/2026 (bracket.js, `_teamAvatarHtml`): o span do nome
 * nascia com DOIS atributos `class` na MESMA tag —
 *
 *     <span class="sp-name-fit" data-maxrem="…" data-minrem="…" class="sp-mc-nm">
 *
 * O parser de HTML fica com o PRIMEIRO `class` e joga o segundo fora, sem erro, sem
 * aviso, sem nada no console. Ou seja: `.sp-mc-nm` (font-weight:600, white-space:nowrap,
 * display:inline-flex, align-items:center, gap:2px — components.css) NUNCA valeu nos
 * nomes do card da chave, embora estivesse escrita ali desde a 1.9.39. Os nomes saíam em
 * peso 400 (o resto do app usa 600) e SEM `nowrap`.
 *
 * É a MESMA armadilha da 2.0.25, um card acima: a linha de botões do cabeçalho nascia
 * `class="btn-row" class="sp-mc-acts"`, perdia o `display:flex` e o "Aplicar W.O."
 * desalinhava (tests/botoes-da-linha-tem-a-mesma-altura.test.js). Por isso o item ①
 * daquele teste deixou de olhar só as tags `.btn-row`: hoje ele proíbe `class=` duplicado
 * em QUALQUER tag de js/ e index.html — o defeito é da forma, não daquela linha.
 *
 * ⚠️ POR QUE ISTO PRECISA DE RÉGUA, E NÃO SÓ DE UM `sed`: juntar as duas classes muda
 * `font-weight`, `white-space` e o `display` do MESMO span que o auto-fit de nome
 * (`.sp-name-fit` → `_fitNames`/`_fitEmLote`, store.js) usa pra MEDIR o texto. Peso 600 é
 * ~2% mais largo que 400, e o fit encolhe por LARGURA — então a cura podia, em tese,
 * empurrar nomes longos para o piso e daí para o corte. MEDIDO (varredura de 0 a 9
 * sobrenomes, com e sem coroa, em 390/768/1280): a fronteira do corte NÃO se move — não
 * existe nome que caiba no markup quebrado e deixe de caber no curado.
 *
 * O teste cobre os dois lados, porque cada um sozinho deixa metade do estrago de pé:
 *   ⓪ PREMISSA: o navegador de verdade DESCARTA o segundo `class` (senão não há bug);
 *   ① ESTÁTICO: o span do nome carrega as DUAS classes num atributo SÓ;
 *   ② MEDIDO: Chromium com o CSS REAL e o `_fitOne`/`_fitNames` REAIS extraídos do
 *      store.js (não réplica), no claro e no escuro, em 390/768/1280 — a classe chega
 *      (peso 600, nowrap, flex), a fonte fica dentro do envelope rem, e o markup QUEBRADO
 *      tem de sair DIFERENTE na mesma régua, senão ela não está medindo nada.
 *
 * ⚠️ REBASEADO SOBRE A 2.0.30, que mexeu no MESMO span por outro motivo ("nome longo vira
 * bloco de duas linhas"). Duas consequências que este teste absorve:
 *   • a caixa passou a ter altura de DUAS linhas (`--sp-box-h` × 2.2), e com isso os 62
 *     nomes que esta varredura media CORTADOS foram a ZERO. O que era achado anexo virou
 *     assert que reprova — se voltar a cortar, alguém encolheu a caixa de novo.
 *   • o piso da fonte na QUEBRA deixou de ser `data-minrem` e passou a ser `_PISO_QUEBRA`
 *     (store.js), de propósito: pra duas linhas caberem, a fonte tem de descer abaixo do
 *     que uma linha dava. O envelope aqui lê essa constante do store.js, não a crava.
 * E as duas levas se completam: o motor da 2.0.30 faz `whiteSpace = ''` pra "devolver o
 * nowrap original" — nowrap que só existe porque `.sp-mc-nm` agora vale. Sem esta cura,
 * aquele reset devolvia `normal`.
 *
 * Roda com: node tests/nome-do-card-da-chave-nao-perde-a-classe.test.js
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
function nota(msg) { console.log('  · ' + msg); }

const CSS = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css']
  .map(read).join('\n');

/* O auto-fit REAL, extraído do store.js — o que roda aqui é o código de produção.
 * (Réplica já deixou suíte verde sobre código revertido nesta casa; ver CLAUDE.md.) */
const STORE = read('js/store.js');
const _iFit = STORE.indexOf('window._fitNameToBox = _fitOne;');
const FIT_IIFE = _iFit < 0 ? '' : STORE.slice(
  STORE.lastIndexOf('\n(function() {', _iFit),
  STORE.indexOf('\n})();', _iFit) + 6
);

/* O piso da QUEBRA (2.0.30) sai do store.js — cravar o número aqui faria o teste mentir
 * no dia em que ele mudasse. */
const PISO_QUEBRA = parseFloat((STORE.match(/_PISO_QUEBRA\s*=\s*([\d.]+)/) || [])[1]);

/* ── ① ESTÁTICO ───────────────────────────────────────────────────────────────────── */
function estatico() {
  console.log('\n① O span do nome carrega as duas classes num atributo só');
  const src = read('js/views/bracket.js');
  ok(FIT_IIFE.indexOf('window._fitNames') !== -1,
    'o auto-fit real foi extraído do store.js (não é réplica)');

  // ⚠️ há DOIS spans com `data-maxrem="${_nomeMaxRem}"` no arquivo: o do slot normal
  // (este) e o do slot com W.O. PENDENTE, logo acima, que é âmbar e traz os estilos
  // inline próprios. Só o normal usa `.sp-mc-nm` — pegar "o primeiro" olharia o outro.
  const spans = src.match(/<span [^<>]*sp-name-fit[^<>]*data-maxrem="\$\{_nomeMaxRem\}"[^<>]*>/g) || [];
  ok(spans.length >= 2, 'os spans de nome do card da chave existem no bracket.js (achados: ' + spans.length + ')');
  const alvo = spans.filter((s) => s.indexOf('sp-mc-nm') !== -1);
  ok(alvo.length === 1, 'exatamente um deles é o do slot normal, com sp-mc-nm (achados: ' + alvo.length + ')');
  if (alvo.length === 1) {
    const attrs = (alvo[0].match(/\bclass\s*=/g) || []).length;
    ok(attrs === 1, 'a tag tem UM único atributo class (obtidos: ' + attrs + ')');
    const cls = (alvo[0].match(/class="([^"]*)"/) || [])[1] || '';
    ok(/\bsp-name-fit\b/.test(cls) && /\bsp-mc-nm\b/.test(cls),
      'carrega sp-name-fit E sp-mc-nm no MESMO class (obtido: "' + cls + '")');
  }
  // a classe descartada tem de continuar EXISTINDO no CSS — se alguém a apagar achando
  // que é resíduo, o `class` curado passa a apontar pra nada e o teste fica verde à toa.
  ok(/\.sp-mc-nm\s*\{[^}]*font-weight\s*:\s*600[^}]*\}/.test(read('css/components.css')),
    '.sp-mc-nm existe em components.css com font-weight:600');
}

/* ── ② MEDIDO ─────────────────────────────────────────────────────────────────────── */
const CROWN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(251,191,36,0.85)" ' +
  'style="flex-shrink:0;vertical-align:middle;margin-left:2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 ' +
  '1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

// markup REAL do slot (bracket.js, `_teamAvatarHtml`, ramo não-pendente). `quebrado`
// reproduz o `class` DUPLICADO como estava — é o navegador que descarta o segundo.
function slot(nomes, opts) {
  const multi = nomes.length > 1;
  const maxR = multi ? 0.78 : 0.85, minR = multi ? 0.52 : 0.58;
  const av = multi ? '20px' : '24px';
  const clsAttr = opts.quebrado
    ? 'class="sp-name-fit" data-maxrem="' + maxR + '" data-minrem="' + minR + '" class="sp-mc-nm"'
    : 'class="sp-name-fit sp-mc-nm" data-maxrem="' + maxR + '" data-minrem="' + minR + '"';
  let html = multi ? '<div class="sp-mc-col">' : '';
  nomes.forEach(function (n, i) {
    const inner = '<span data-uid-name="u' + i + '">' + n + '</span>' +
      (opts.coroa && i === 0 ? ' ' + CROWN : '');
    html += '<div class="sp-mc-side">' +
      '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" class="sp-av" style="--sp-av:' + av + '">' +
      '<div class="sp-mc-box" style="--sp-box-h:' + (maxR * 1.35).toFixed(2) + 'rem">' +
        '<span ' + clsAttr + '>' + inner + '</span></div>' +
    '</div>';
  });
  if (multi) html += '</div>';
  return html;
}

// a linha do jogo, com os estilos inline REAIS de `rowStyle` + o card e o grid reais
const ROW = 'padding:8px 10px;border-radius:8px;display:flex;justify-content:space-between;' +
  'align-items:center;background:var(--placar-linha-bg);border-left:3px solid var(--placar-tarja-neutra);';

function card(id, nomes, opts) {
  return '<div id="' + id + '" style="box-sizing:border-box;max-width:calc(100vw - 24px);' +
    'background:var(--bg-card);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;">' +
    '<div style="' + ROW + '"><div style="flex:1;overflow:hidden;min-width:0;">' + slot(nomes, opts) + '</div>' +
      '<div class="sp-mc-sc"><span style="font-weight:800;font-size:1rem;">6</span></div></div>' +
    '<div class="sp-mc-vs">VS</div>' +
    '<div style="' + ROW + '"><div style="flex:1;overflow:hidden;min-width:0;">' + slot(nomes, opts) + '</div>' +
      '<div class="sp-mc-sc"><span style="font-weight:800;font-size:1rem;">4</span></div></div>' +
  '</div>';
}

// nomes curtos, longos e de dupla — com e sem coroa. Os "N sobrenomes" varrem a FRONTEIRA
// do corte: é ali que a diferença de largura do peso 600 apareceria, se aparecesse.
const SOBRE = ['Maria', 'Fernanda', 'Albuquerque', 'Nascimento', 'Cavalcanti', 'Rodrigues',
  'Wanderley', 'Bittencourt', 'Vasconcelos'];
const CASOS = [];
CASOS.push({ id: 'curto', nomes: ['Ana'] });
CASOS.push({ id: 'curto-coroa', nomes: ['Ana'], coroa: true });
CASOS.push({ id: 'medio', nomes: ['Rodrigo Barth'] });
CASOS.push({ id: 'medio-coroa', nomes: ['Rodrigo Barth'], coroa: true });
CASOS.push({ id: 'dupla', nomes: ['Iliane Geraldi Garcia', 'Flávia Barchetta'] });
CASOS.push({ id: 'dupla-coroa', nomes: ['Iliane Geraldi Garcia', 'Flávia Barchetta'], coroa: true });
for (let n = 1; n <= SOBRE.length; n++) {
  const nome = 'Ana ' + SOBRE.slice(0, n).join(' ');
  CASOS.push({ id: 'sobrenomes' + n, nomes: [nome] });
  CASOS.push({ id: 'sobrenomes' + n + '-coroa', nomes: [nome], coroa: true });
}

async function medir() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const saida = {};
  for (const tema of ['dark', 'light']) {
    for (const w of [390, 768, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      const cards = CASOS.map((c) =>
        card('quebrado-' + c.id, c.nomes, { coroa: c.coroa, quebrado: true }) +
        card('curado-' + c.id, c.nomes, { coroa: c.coroa, quebrado: false })).join('');
      await page.setContent(
        '<!doctype html><html data-theme="' + tema + '"><head><style>' + CSS + '</style></head>' +
        '<body style="margin:0;padding:12px;background:var(--bg-main,#0b1220);">' +
        '<div class="card"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));' +
        'gap:8px;">' + cards + '</div></div></body></html>', { waitUntil: 'load' });
      // o auto-fit REAL de produção
      await page.evaluate((code) => { eval(code); }, FIT_IIFE);
      await page.evaluate(() => window._fitNames(document, 0));
      await page.waitForTimeout(400);
      saida[tema + '@' + w] = await page.evaluate((ids) => {
        const raiz = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const r = {};
        ids.forEach((id) => {
          ['quebrado', 'curado'].forEach((v) => {
            const el = document.querySelector('#' + v + '-' + id + ' .sp-name-fit');
            if (!el) return;
            const box = el.parentElement;
            const cs = getComputedStyle(el);
            r[id + '/' + v] = {
              fsRem: +(parseFloat(cs.fontSize) / raiz).toFixed(3),
              maxRem: parseFloat(el.getAttribute('data-maxrem')),
              minRem: parseFloat(el.getAttribute('data-minrem')),
              peso: cs.fontWeight,
              display: cs.display,
              ws: cs.whiteSpace,
              corta: (el.scrollWidth > box.clientWidth + 1) || (el.scrollHeight > box.clientHeight + 1),
            };
          });
        });
        return r;
      }, CASOS.map((c) => c.id));
    }
  }
  await browser.close();
  return saida;
}

(async function () {
  /* ⓪ PREMISSA — sem isto o bug inteiro não existiria */
  console.log('\n⓪ Premissa: o navegador descarta MESMO o segundo `class`');
  {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<span id="x" class="um" data-a="1" class="dois">n</span>');
    const cls = await page.evaluate(() => document.getElementById('x').className);
    await browser.close();
    ok(cls === 'um', 'tag com dois `class` fica só com o PRIMEIRO (obtido: "' + cls + '")');
  }

  estatico();

  console.log('\n② Chromium com o CSS real e o auto-fit real');
  const med = await medir();
  let cortesPreexistentes = 0, regressoes = [], caroDemais = [];
  for (const ctx of Object.keys(med)) {
    const m = med[ctx];
    // a) a classe CHEGA no curado — e não chegava no quebrado (senão a régua não mede nada)
    const q = m['medio/quebrado'], c = m['medio/curado'];
    ok(c.peso === '600', ctx + ' · curado: font-weight 600 (obtido: ' + c.peso + ')');
    ok(q.peso === '400', ctx + ' · quebrado: font-weight 400 — a régua acusa o markup de antes');
    ok(c.display === 'flex', ctx + ' · curado: display flex — inline-flex blocado no flex item (obtido: ' + c.display + ')');
    ok(q.display === 'block', ctx + ' · quebrado: display block (obtido: ' + q.display + ')');
    ok(c.ws === 'nowrap', ctx + ' · curado: white-space nowrap (obtido: ' + c.ws + ')');
    ok(q.ws === 'normal', ctx + ' · quebrado: white-space normal — o fit media texto que podia quebrar');

    // b) a fonte fica DENTRO do envelope. ⚠️ O PISO NÃO É MAIS `data-minrem`: a 2.0.30
    //    ("nome longo vira bloco de duas linhas") deixou o caminho da QUEBRA descer até
    //    `_PISO_QUEBRA` (store.js), de propósito — pra duas linhas caberem, a fonte tem
    //    de ir abaixo do que uma linha dava. `data-minrem` segue valendo como piso de
    //    UMA linha. O teto, esse, continua sendo `data-maxrem`.
    let foraDoEnvelope = [];
    for (const cs of CASOS) {
      const x = m[cs.id + '/curado'];
      if (!x) continue;
      if (x.fsRem > x.maxRem + 0.001 || x.fsRem < PISO_QUEBRA - 0.001) {
        foraDoEnvelope.push(cs.id + '=' + x.fsRem + 'rem');
      }
    }
    ok(foraDoEnvelope.length === 0,
      ctx + ' · toda fonte final dentro de [' + PISO_QUEBRA + ', maxrem]' +
      (foraDoEnvelope.length ? ' — ' + foraDoEnvelope.join(', ') : ''));

    // c) O QUE MAIS IMPORTA: a fronteira do corte NÃO se move. Peso 600 é mais largo,
    //    então a pergunta é se algum nome que cabia deixou de caber. Nenhum pode.
    for (const cs of CASOS) {
      const a = m[cs.id + '/quebrado'], d = m[cs.id + '/curado'];
      if (!a || !d) continue;
      if (a.corta) cortesPreexistentes++;
      if (!a.corta && d.corta) regressoes.push(ctx + '/' + cs.id);
      // O PREÇO DO NEGRITO, LIMITADO. Peso 600 é ~2,3% mais largo que 400, então a fonte
      // pode descer — mas pouco, e o teto disso é o que a régua guarda. MEDIDO nos 52
      // casos: 42 sem diferença nenhuma, 9 custando UM passo de 0,03rem, e UM
      // (4 sobrenomes + coroa em 390px, 0.69→0.63) custando dois. Esse é artefato da
      // GRANULARIDADE da busca binária do `_fitEmLote`, não perda sistemática: ela anda em
      // degraus de 0,03rem em 7 iterações e nem todo valor do grid chega a ser provado, de
      // modo que 2,3% de largura a mais pode empurrar o resultado um degrau extra. Se um
      // dia custar TRÊS, não é mais granularidade — é outra coisa que mudou junto.
      if (a.fsRem - d.fsRem > 0.061) caroDemais.push(ctx + '/' + cs.id + ': ' + a.fsRem + '→' + d.fsRem);
    }
  }
  ok(regressoes.length === 0,
    'nenhum nome que cabia no markup quebrado passa a ser cortado no curado' +
    (regressoes.length ? ' — ' + regressoes.join(', ') : ''));
  ok(caroDemais.length === 0,
    'o negrito custa no máximo dois passos de 0,03rem em qualquer caso' +
    (caroDemais.length ? ' — ' + caroDemais.join(', ') : ''));

  // Antes da 2.0.30 esta varredura acusava 62 nomes CORTADOS (a caixa tinha altura de UMA
  // linha e a quebra do piso escondia a segunda). A 2.0.30 deu duas linhas à caixa e zerou
  // isso. Fica medido: se voltar a subir, alguém encolheu a caixa de novo.
  ok(cortesPreexistentes === 0,
    'nenhum nome cortado na varredura inteira (era 62 antes da caixa de 2 linhas da 2.0.30)' +
    (cortesPreexistentes ? ' — ' + cortesPreexistentes + ' cortando' : ''));

  console.log('\n' + (falhas ? '✗ ' + falhas + '/' + testes + ' falharam' : '✓ ' + testes + '/' + testes + ' passaram'));
  process.exit(falhas ? 1 : 0);
})();
