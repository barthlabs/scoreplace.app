import { createLogger, defineConfig } from 'vite';
import { transformSync } from 'esbuild';
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
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

/* ⛔⛔⛔ OS COMENTÁRIOS FICAM NO CÓDIGO, MAS NÃO VIAJAM ATÉ O NAVEGADOR.
 *
 * MEDIDO em 27/set/2026: 38% do maior arquivo servido são linhas de comentário, e a primeira
 * visita custava 3.289 KB comprimidos. Esses comentários são a memória do projeto — a regra da
 * trava da anotação existe justamente para eles não saírem do fonte — mas nenhum usuário precisa
 * baixá-los. Tirando comentário e espaço em branco na CÓPIA SERVIDA: 1.474 KB. 55% a menos, e o
 * repositório não muda em uma linha sequer.
 *
 * ⛔ E NÃO SE RENOMEIA NADA, DE PROPÓSITO. Renomear identificadores dava 58% em vez de 55% — três
 * pontos — e quebrava duas coisas medidas: o diagnóstico rotula eventos pelo NOME da função
 * (`fn.name`), que viraria uma letra. Três pontos não pagam perder rastro de diagnóstico, que é o
 * que se usa quando algo quebra em produção.
 *
 * ⚠️ `sw.js` FICA DE FORA: ele carrega o nome do cache, que é conferido por portão contra o
 * arquivo do repositório. Minificar ali seria fazer o portão comparar duas coisas diferentes.
 * [[project_cache_name_do_sw_prende_o_pwa]]
 *
 * ⚠️ Falhou a minificação de um arquivo? Copia o ORIGINAL e avisa. Servir pela metade é pior que
 * servir grande — e falhar calado é pior que os dois. */
const NAO_MINIFICAR = new Set(['sw.js']);

/* ⚠️ `esbuild` É DEPENDÊNCIA DECLARADA de build (devDependency), e tem de ser. Eu tentei duas
 * vias antes, as duas erradas e as duas medidas: importar `esbuild` sem instalar (o build morre
 * com "Cannot find package") e usar o atalho do Vite (`transformWithEsbuild`), que nesta versão
 * está aposentado e exige a mesma instalação. O substituto do Vite (`transformWithOxc`) devolve o
 * arquivo INTACTO aqui — conferido com um caso de teste, comentário e tudo. */
function minificaNoLugar(dir) {
  let antes = 0, depois = 0, falhas = 0;
  const arquivos = [];
  const anda = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { anda(p); continue; }
      if (!e.name.endsWith('.js') || NAO_MINIFICAR.has(e.name)) continue;
      arquivos.push(p);
    }
  };
  anda(dir);
  for (const p of arquivos) {
    const src = readFileSync(p, 'utf8');
    antes += Buffer.byteLength(src);
    try {
      const out = transformSync(src, {
        minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
        legalComments: 'none', loader: 'js'
      });
      writeFileSync(p, out.code);
      depois += Buffer.byteLength(out.code);
    } catch (err) {
      falhas++;
      logger.warn('[build-www] não minifiquei ' + p.split('/').pop() + ' (' + (err && err.message) + ') — servindo o original');
      depois += Buffer.byteLength(src);
    }
  }
  return { antes, depois, falhas };
}

function copyLegacyAssets() {
  return {
    name: 'scoreplace-copy-legacy-assets',
    apply: 'build',
    closeBundle() {
      LEGACY_ASSETS.forEach((asset) => {
        const source = join(ROOT, asset);
        if (existsSync(source)) cpSync(source, join(OUT, asset), { recursive: true });
      });
      /* só o que foi COPIADO para www/ é minificado — o fonte em js/ fica intocado */
      const jsDir = join(OUT, 'js');
      if (existsSync(jsDir)) {
        const r = minificaNoLugar(jsDir);
        const pct = r.antes ? Math.round((r.antes - r.depois) * 100 / r.antes) : 0;
        logger.info('[build-www] servido minificado: ' + Math.round(r.antes / 1024) + ' KB → ' +
          Math.round(r.depois / 1024) + ' KB (-' + pct + '%)' +
          (r.falhas ? ' · ' + r.falhas + ' arquivo(s) servidos originais' : ''));
      }
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
