#!/usr/bin/env node
/**
 * scoreplace.app — Static prerender da landing page
 *
 * Gera um snapshot HTML do landing renderizado (logged-out state) e escreve
 * no #boot-skeleton do index.html. Resultado: a landing aparece NO PRIMEIRO
 * PAINT do navegador sem precisar do JS rodar primeiro.
 *
 * Estratégia:
 * 1. Sobe um servidor HTTP local apontando pra raiz do projeto
 * 2. Abre o site em headless Chromium (do @playwright/test, já instalado)
 * 3. Aguarda landing renderizar completamente (logo, CTA, features, footer)
 * 4. Extrai innerHTML do #view-container
 * 5. Substitui o placeholder skeleton no index.html pelo HTML real
 * 6. Marca o bloco com sentinelas de comentário pra detectar regen futura
 *
 * Idempotente: rodar duas vezes produz o mesmo resultado. Detecta
 * sentinelas existentes e só substitui o conteúdo entre elas.
 *
 * Uso:
 *   node tools/prerender-landing.js              # gera + escreve em index.html
 *   node tools/prerender-landing.js --dry-run    # imprime tamanho, não escreve
 *   node tools/prerender-landing.js --port=8765  # porta custom (default 9876)
 *
 * Via npm:
 *   npm run prerender
 *
 * Pré-requisito: `npx playwright install chromium` (já feito no setup E2E).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');

const SENTINEL_START = '<!-- prerender:start -->';
const SENTINEL_END = '<!-- prerender:end -->';

// Argumentos
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const portArg = args.find((a) => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1], 10) : 9876;

// MIME types mínimos pro server local
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function serve(rootDir, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(rootDir, urlPath);
      // Nunca serve fora do rootDir
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';

        // CRITICAL: ao servir index.html, strippa o conteúdo entre as
        // sentinelas. Caso contrário o Chromium carrega o index com
        // prerender existente, e o router (que detecta sentinela) PULA
        // o renderLanding pra preservar o prerender. O resultado é que
        // o snapshot capturaria a versão anterior em vez de fresh render.
        let body = data;
        if (urlPath === '/index.html') {
          let html = data.toString('utf8');
          html = html.replace(
            /<!--\s*prerender:start\s*-->[\s\S]*?<!--\s*prerender:end\s*-->/g,
            '<!-- prerender removed during regen -->'
          );
          body = Buffer.from(html, 'utf8');
        }

        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
        res.end(body);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

async function main() {
  console.log(`[prerender] iniciando servidor local na porta ${PORT}…`);
  const server = await serve(ROOT, PORT);
  let browser;
  try {
    console.log('[prerender] abrindo Chromium headless…');
    browser = await chromium.launch();
    const context = await browser.newContext({
      // viewport mobile pra capturar layout responsivo da landing
      viewport: { width: 390, height: 844 },
      // sem cookies/storage — quer state limpo (logged-out)
      storageState: undefined,
      // Força PT-BR como locale: scoreplace.app é app brasileiro, maioria
      // dos usuários é PT. Headless Chromium default vem com 'en-US'.
      locale: 'pt-BR'
    });
    const page = await context.newPage();
    // Não queremos que o auto-update / SW rodem durante prerender
    await page.addInitScript(() => {
      // Remove SW registration pra não cachear nada do prerender
      Object.defineProperty(navigator, 'serviceWorker', { value: undefined });
      // Força lang='pt' no localStorage pra que i18n bootstrap em theme.js
      // selecione o dict PT (mesmo que navigator.language seja outro)
      try { localStorage.setItem('scoreplace_lang', 'pt'); } catch (e) {}
      // Marca que estamos prerendering
      window._prerendering = true;
    });

    console.log(`[prerender] navegando pra http://localhost:${PORT}/…`);
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });

    // Esperar a landing renderizar de fato
    console.log('[prerender] aguardando landing renderizar…');
    await page.waitForSelector('.landing-hero', { timeout: 15000 });
    await page.waitForSelector('.landing-features', { timeout: 5000 });

    // CRITICAL: aguarda i18n carregar — caso contrário o prerender captura
    // keys cruas tipo `landing.tagline` em vez do texto traduzido. Isso
    // acontece pq lazy i18n (v0.17.68) carrega o dict via async=false que
    // pode resolver DEPOIS do initRouter chamar renderLanding.
    console.log('[prerender] aguardando dict de i18n carregar…');
    await page.waitForFunction(
      () => window._t && window._t('landing.tagline') !== 'landing.tagline',
      null,
      { timeout: 10000 }
    );

    // Re-render uma vez agora que o dict está disponível, pra garantir
    // que o DOM tem texto traduzido (não as keys que renderLanding capturou
    // na primeira passagem). Isso é defensivo — em condições normais o
    // initRouter chamado depois do dict load também re-renderiza, mas
    // explicitar é mais robusto.
    await page.evaluate(() => {
      if (typeof window.initRouter === 'function') window.initRouter();
    });
    await page.waitForTimeout(500);

    // Aguarda redes ficarem ociosas pra capturar todo conteúdo
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    // Extrai HTML renderizado do view-container
    let renderedHtml = await page.evaluate(() => {
      const vc = document.getElementById('view-container');
      if (!vc) return null;
      // Limpa elementos dinâmicos que não fazem sentido em pre-render
      vc.querySelectorAll('[data-no-prerender]').forEach((el) => el.remove());
      return vc.innerHTML;
    });

    // CRITICAL: re-rodar prerender carrega o index.html que já contém as
    // sentinelas dentro de #view-container. vc.innerHTML traz esses comments
    // junto com o conteúdo real. Se não strippar aqui, cada re-run aninha
    // sentinelas (bug observado em v0.17.69 → v0.17.71).
    if (renderedHtml) {
      renderedHtml = renderedHtml
        .replace(/<!--\s*prerender:start\s*-->/g, '')
        .replace(/<!--\s*prerender:end\s*-->/g, '')
        .trim();
    }

    if (!renderedHtml || renderedHtml.length < 500) {
      throw new Error(`[prerender] HTML renderizado vazio ou muito pequeno (${renderedHtml ? renderedHtml.length : 0} bytes) — landing não renderizou?`);
    }

    console.log(`[prerender] HTML renderizado: ${renderedHtml.length} bytes (${(renderedHtml.length / 1024).toFixed(1)} KB)`);

    if (dryRun) {
      console.log('[prerender] --dry-run, não escrevendo. Primeiros 200 chars:');
      console.log(renderedHtml.slice(0, 200) + '…');
      return;
    }

    // Lê index.html atual
    const indexHtml = fs.readFileSync(INDEX_PATH, 'utf8');

    // Procura sentinelas; se existirem (mesmo múltiplas, por bug histórico),
    // remove TUDO entre primeiro START e último END e substitui por 1 pair.
    let newIndex;
    if (indexHtml.includes(SENTINEL_START) && indexHtml.includes(SENTINEL_END)) {
      const startIdx = indexHtml.indexOf(SENTINEL_START);
      const endIdx = indexHtml.lastIndexOf(SENTINEL_END);
      if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new Error('[prerender] sentinelas presentes mas em ordem inválida');
      }
      const before = indexHtml.slice(0, startIdx);
      const after = indexHtml.slice(endIdx + SENTINEL_END.length);
      newIndex = before + SENTINEL_START + '\n' + renderedHtml + '\n        ' + SENTINEL_END + after;
      console.log('[prerender] sentinelas detectadas — atualizando snapshot existente');
    } else {
      // Primeira vez: substitui o div#boot-skeleton inteiro pelo prerendered.
      // Regex tolera atributos em qualquer ordem antes/depois do id.
      const skeletonRegex = /(<div [^>]*id="view-container"[^>]*>)([\s\S]*?)(<\/div>\s*<\/main>)/;
      const match = indexHtml.match(skeletonRegex);
      if (!match) {
        throw new Error('[prerender] não encontrou #view-container … </main> no index.html — estrutura mudou?');
      }
      const wrapped = `\n        ${SENTINEL_START}\n${renderedHtml}\n        ${SENTINEL_END}\n      `;
      newIndex = indexHtml.replace(skeletonRegex, `$1${wrapped}$3`);
      console.log('[prerender] primeira execução — substituindo boot-skeleton');
    }

    fs.writeFileSync(INDEX_PATH, newIndex, 'utf8');
    console.log(`[prerender] ✓ index.html atualizado (${newIndex.length} bytes total)`);

    // v4.5.96: gera /version.txt (versão crua) pra o _checkForUpdate pingar BARATO (~20 bytes)
    // em vez de baixar store.js (400KB) a cada checagem. Sincronizado AQUI porque o prerender
    // roda em TODO bump/deploy (pre-push hook + `npm run prerender`) → nunca fica stale.
    try {
      const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
      const vm = storeSrc.match(/SCOREPLACE_VERSION\s*=\s*'([^']+)'/);
      if (vm && vm[1]) {
        fs.writeFileSync(path.join(ROOT, 'version.txt'), vm[1], 'utf8');
        console.log('[prerender] ✓ version.txt = ' + vm[1]);
      } else {
        console.warn('[prerender] SCOREPLACE_VERSION não encontrado em store.js — version.txt não gerado');
      }
    } catch (e) { console.warn('[prerender] version.txt falhou:', e && e.message); }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('[prerender] erro:', err && err.stack ? err.stack : err);
  process.exit(1);
});
