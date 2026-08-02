/* A versão da extensão tem UMA fonte — node tests/ext-version-single-source.test.js
 * "faz o programa exigir sempre a versão atual". A extensão foi de 1.61 a 1.66 e o app
 * continuou exigindo (e oferecendo pra baixar) a 1.61 — o gate passava calado porque
 * 1.66 >= 1.61. A trava que acusa isso existia mas não rodava; e acusar não basta:
 * alguém ainda tinha que corrigir à mão. Agora a versão é DERIVADA do manifest.
 */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.resolve(__dirname, '..');
const R = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const manifestVer = JSON.parse(R('extension/manifest.json')).version;

// 1) as três batem AGORA
ok(new RegExp("EXT_VERSION\\s*=\\s*'" + manifestVer + "'").test(R('extension/content.js')),
  'content.js na mesma versão do manifest (' + manifestVer + ')');
ok(new RegExp("SP_EXT_VERSION\\s*=\\s*'" + manifestVer + "'").test(R('js/store.js')),
  'o gate do app exige exatamente a versão atual');
ok(fs.existsSync(path.join(root, 'scoreplace-letzplay-ext-' + manifestVer + '.zip')),
  'o zip que o app oferece existe NA versão exigida');

// 2) não sobrou zip de versão antiga (o link é derivado, mas o arquivo velho confunde)
const zips = fs.readdirSync(root).filter((f) => /^scoreplace-letzplay-ext-.+\.zip$/.test(f));
ok(zips.length === 1, 'existe UM zip publicado, o da versão atual (achei: ' + zips.join(', ') + ')');

// 3) o gate do app é o mesmo valor em todo lugar (nada hardcodado)
ok(/_LZ_MIN_EXT = window\.SP_EXT_VERSION/.test(R('js/views/tournaments-enrollment-report.js')),
  'a Análise lê o mínimo de SP_EXT_VERSION');
ok(/MIN_EXT_VERSION = window\.SP_EXT_VERSION/.test(R('js/views/letzplay-onboarding.js')),
  'o onboarding também — nenhum número solto');
ok(/_spExtZipUrl = function \(\) \{ return '\/scoreplace-letzplay-ext-' \+ window\.SP_EXT_VERSION/.test(R('js/store.js')),
  'o link de download é derivado do mesmo valor');

// 4) a propagação é AUTOMÁTICA e roda em todo deploy
ok(fs.existsSync(path.join(root, 'scripts/sync-ext-version.js')), 'existe o sincronizador');
const pkg = JSON.parse(R('package.json'));
ok(/sync-ext-version/.test(pkg.scripts.prerender), 'ele roda no prerender (todo deploy passa por lá)');
ok(/check-ext-version/.test(pkg.scripts.test), 'e a conferência roda no npm test');

// 5) prova de fogo: mexer só no manifest tem que arrumar o resto sozinho
{
  const bkp = { c: R('extension/content.js'), s: R('js/store.js') };
  fs.writeFileSync(path.join(root, 'extension/content.js'), bkp.c.replace(/EXT_VERSION\s*=\s*'[^']+'/, "EXT_VERSION = '0.1'"));
  fs.writeFileSync(path.join(root, 'js/store.js'), bkp.s.replace(/window\.SP_EXT_VERSION\s*=\s*'[^']+'/, "window.SP_EXT_VERSION = '0.1'"));
  cp.execFileSync('node', [path.join(root, 'scripts/sync-ext-version.js')], { cwd: root, stdio: 'pipe' });
  const okC = new RegExp("EXT_VERSION\\s*=\\s*'" + manifestVer + "'").test(R('extension/content.js'));
  const okS = new RegExp("SP_EXT_VERSION\\s*=\\s*'" + manifestVer + "'").test(R('js/store.js'));
  if (!okC || !okS) { fs.writeFileSync(path.join(root, 'extension/content.js'), bkp.c); fs.writeFileSync(path.join(root, 'js/store.js'), bkp.s); }
  ok(okC, 'content.js foi reposto na versão do manifest sozinho');
  ok(okS, 'e o gate do app também — divergir manualmente não sobrevive a um deploy');
}

// ── O GATE SÓ VALE SE CHEGAR NO NAVEGADOR ──────────────────────────────────────────────
// 02/ago/2026: a extensão foi pra 1.91 e o gate no repositório também — mas o cache-buster
// do store.js ficou parado, então o navegador seguiu servindo o store.js que exigia 1.90.
// O dono viu o app aceitar a 1.90 de boa. Valor certo entregue tarde = valor errado.
{
  const idx = R('index.html');
  const m = idx.match(/js\/store\.js\?v=([^"']+)/);
  ok(!!m, 'o index.html tem cache-buster no store.js');
  ok(!!m && m[1].indexOf('-x' + manifestVer) >= 0,
     'e ele carrega a versão da extensão (' + manifestVer + ') — veio "' + (m ? m[1] : '') + '"');

  // e o sincronizador é quem faz isso, não a memória de quem edita
  const sync = R('scripts/sync-ext-version.js');
  ok(/js\\\/store\\\.js\\\?v=/.test(sync) || /store\\.js\\?v=/.test(sync),
     'o sync-ext-version mexe no cache-buster do store.js');
  ok(/'-x' \+ ver/.test(sync), 'carimbando a versão da extensão nele');
}

console.log((fail ? '✗' : '✓') + ' ext-version-single-source: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
