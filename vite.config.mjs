import { createLogger, defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'www');
const logger = createLogger();
const warn = logger.warn;
logger.warn = (message, options) => {
  /* Enquanto a migração modular é gradual, Vite não empacota scripts clássicos — o plugin
   * os copia com a ordem original. Esta mensagem não é falha nem ação pendente; esconder só
   * ela deixa visíveis warnings que exigem correção. */
  if (String(message).includes('can\'t be bundled without type="module" attribute')) return;
  warn(message, options);
};
/* Scripts clássicos ainda compõem a aplicação. Enquanto cada fronteira não for movida para
 * módulos, Vite preserva exatamente esses arquivos e a ordem declarada no index. */
const LEGACY_ASSETS = ['sw.js', 'manifest.json', 'robots.txt', 'sitemap.xml', 'css', 'js', 'icons', 'assets'];

function copyLegacyAssets() {
  return {
    name: 'scoreplace-copy-legacy-assets',
    apply: 'build',
    closeBundle() {
      LEGACY_ASSETS.forEach((asset) => {
        const source = join(ROOT, asset);
        if (existsSync(source)) cpSync(source, join(OUT, asset), { recursive: true });
      });
    }
  };
}

export default defineConfig({
  appType: 'spa',
  publicDir: false,
  customLogger: logger,
  plugins: [copyLegacyAssets()],
  build: {
    outDir: 'www',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: { input: join(ROOT, 'index.html') }
  }
});
