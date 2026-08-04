/* FONTE ÚNICA das libs do letzplay — node tests/letzplay-single-source.test.js
 *
 * POR QUE ESTE TESTE EXISTE (medido em 04/ago/2026): existiam DUAS cópias de
 * letzplay-{import,extract,rating}.js — uma em extension/lib/ (a que EXECUTA, carregada
 * pelo manifest/background/popup) e outra em js/views/, que o index.html NUNCA carregou.
 * As duas DIVERGIRAM e a distância CRESCEU com o tempo: no import eram 10 linhas na 1.6.5
 * e 16 na 1.7.12 — a cópia morta ficou sem `lzId` (a identidade do jogo) e sem `dateISO`
 * (o fim de "10 de março virou 3 de outubro"). Pior: os 3 testes unitários davam
 * require('../js/views/…'), então executavam a cópia MORTA e ficavam verdes enquanto a
 * lib real seguia sozinha. Cópias apagadas, testes repontados.
 *
 * É a mesma família de project_vendor_sandbox_parity_trap ("editei e não surtiu efeito").
 *
 * NOTA sobre vendor: aqui NÃO se aplica o padrão functions-autodraw/vendor/ (cópia gerada
 * no predeploy). Lá existe um segundo runtime real (a Cloud Function não carrega js/views/
 * em produção). Aqui o único runtime é a extensão — não há segundo consumidor, logo não há
 * nada pra "vendorizar": copiar só recria a divergência, e a fonte de verdade acabaria num
 * diretório que ninguém carrega.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// A lista de libs vem do MANIFEST (fonte de verdade do que é injetado), nunca hardcoded —
// assim uma lib nova entra sozinha na trava, sem precisar editar este teste.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'extension', 'manifest.json'), 'utf8'));
const csManifest = ((manifest.content_scripts || [])[0] || {}).js || [];
const LIB_PATHS = csManifest.filter(function (f) { return /^lib\/letzplay-.+\.js$/.test(f); });
const LIBS = LIB_PATHS.map(function (f) { return path.basename(f); });

ok(LIBS.length > 0, 'o manifest declara as libs do letzplay (achei ' + LIBS.length + ')');

// ── 1. Cada lib existe em extension/lib e é a ÚNICA cópia no repositório ──
LIBS.forEach(function (lib) {
  ok(fs.existsSync(path.join(ROOT, 'extension', 'lib', lib)), 'extension/lib/' + lib + ' existe (é a que executa)');
});

const SKIP_DIRS = new Set(['node_modules', '.git', 'www', 'dist', 'build', 'ios', 'android', '.claude']);
function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); }
    else out.push(path.join(dir, e.name));
  }
  return out;
}
const allFiles = walk(ROOT, []);
LIBS.forEach(function (lib) {
  const copias = allFiles.filter(function (f) { return path.basename(f) === lib; })
    .map(function (f) { return path.relative(ROOT, f); });
  ok(copias.length === 1 && copias[0] === path.join('extension', 'lib', lib),
    lib + ' tem UMA cópia, em extension/lib (achei ' + copias.length + ': ' + copias.join(', ') + ')');
});

// ── 2. Nenhum teste pode executar/apontar pra fora de extension/lib ──
// Foi exatamente isto que manteve a cópia morta verde enquanto a real seguia sozinha.
const testFiles = allFiles.filter(function (f) {
  return f.indexOf(path.join(ROOT, 'tests')) === 0 && f.endsWith('.js');
});
LIBS.forEach(function (lib) {
  const base = lib.replace('.js', '');
  const reRequire = new RegExp("require\\((['\"])([^'\"]*" + base + "\\.js)\\1\\)", 'g');
  const foraDoCanon = [];
  const porCaminho = [];
  testFiles.forEach(function (f) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    let m;
    while ((m = reRequire.exec(src)) !== null) {
      if (m[2].indexOf('extension/lib/') < 0) foraDoCanon.push(rel + ' → "' + m[2] + '"');
    }
    // caminho por STRING: as suítes de Chromium carregam as libs com
    // addScriptTag(readFileSync(path)), que o check de require() acima não enxerga.
    if (src.indexOf('js/views/' + lib) >= 0) porCaminho.push(rel);
  });
  ok(foraDoCanon.length === 0, 'nenhum teste requer ' + base + ' fora de extension/lib'
    + (foraDoCanon.length ? ' — infratores: ' + foraDoCanon.join('; ') : ''));
  ok(porCaminho.length === 0, 'nenhum teste aponta pra js/views/' + lib
    + (porCaminho.length ? ' — infratores: ' + porCaminho.join('; ') : ''));
});

// ── 3. index.html não pode voltar a carregar as libs da extensão ──
// O app usa letzplay-model/bridge/onboarding/profile/history-write; estas são da extensão.
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
LIBS.forEach(function (lib) {
  ok(indexHtml.indexOf(lib) < 0, 'index.html NÃO carrega ' + lib + ' (se voltar, é cópia nova)');
});

// ── 4. manifest ≡ CS_FILES do background ──
// São a MESMA injeção (automática e programática). Divergir aqui quebra calado: a lib
// entra por um caminho e falta no outro, e só um dos dois fluxos de import quebra.
const bgSrc = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');
const csMatch = bgSrc.match(/CS_FILES\s*=\s*\[([^\]]*)\]/);
ok(!!csMatch, 'background.js declara CS_FILES');
if (csMatch) {
  const csBg = csMatch[1].split(',').map(function (s) { return s.trim().replace(/^['"]|['"]$/g, ''); }).filter(Boolean);
  ok(JSON.stringify(csBg) === JSON.stringify(csManifest),
    'CS_FILES ≡ content_scripts do manifest (mesma lista, mesma ordem)'
    + (JSON.stringify(csBg) === JSON.stringify(csManifest) ? ''
      : '\n       manifest: ' + JSON.stringify(csManifest) + '\n       CS_FILES: ' + JSON.stringify(csBg)));
  ok(csManifest[csManifest.length - 1] === 'content.js', 'content.js por último (consome as libs)');
}

// ── 5. popup.html carrega um SUBCONJUNTO das libs, na mesma ordem relativa ──
// Não é a mesma lista de propósito: letzplay-api.js só serve ao content.js, e o popup não
// a usa. O que precisa valer é (a) o popup não inventar lib que a extensão não injeta e
// (b) a ordem relativa bater — as libs dependem umas das outras (rating ← import,
// extract ← flow), então inverter quebraria o popup em silêncio.
const popupSrc = fs.readFileSync(path.join(ROOT, 'extension', 'popup.html'), 'utf8');
const popupLibs = [];
const reScript = /<script\s+src=["']([^"']+)["']/g;
let sm;
while ((sm = reScript.exec(popupSrc)) !== null) {
  if (/^lib\/letzplay-.+\.js$/.test(sm[1])) popupLibs.push(sm[1]);
}
const foraDoManifest = popupLibs.filter(function (f) { return LIB_PATHS.indexOf(f) < 0; });
ok(foraDoManifest.length === 0,
  'popup.html só carrega libs que a extensão injeta' + (foraDoManifest.length ? ' — sobrando: ' + foraDoManifest.join(', ') : ''));
const ordemEsperada = LIB_PATHS.filter(function (f) { return popupLibs.indexOf(f) >= 0; });
ok(JSON.stringify(popupLibs) === JSON.stringify(ordemEsperada),
  'popup.html respeita a ordem de dependência do manifest'
  + (JSON.stringify(popupLibs) === JSON.stringify(ordemEsperada) ? ''
    : '\n       popup:    ' + JSON.stringify(popupLibs) + '\n       esperado: ' + JSON.stringify(ordemEsperada)));

console.log((fail ? '✗' : '✓') + ' letzplay-single-source: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
