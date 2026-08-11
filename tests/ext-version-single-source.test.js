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
  'o zip de PUBLICAÇÃO existe na versão atual (é o que se sobe pra Chrome Web Store)');

// 2) não sobrou zip de versão antiga (arquivo velho confunde na hora de subir pra loja)
const zips = fs.readdirSync(root).filter((f) => /^scoreplace-letzplay-ext-.+\.zip$/.test(f));
ok(zips.length === 1, 'existe UM zip, o da versão atual (achei: ' + zips.join(', ') + ')');

// 3) o gate do app é o mesmo valor em todo lugar (nada hardcodado)
ok(/_LZ_MIN_EXT = window\.SP_EXT_VERSION/.test(R('js/views/tournaments-enrollment-report.js')),
  'a Análise lê o mínimo de SP_EXT_VERSION');
ok(/MIN_EXT_VERSION = window\.SP_EXT_VERSION/.test(R('js/views/letzplay-onboarding.js')),
  'o onboarding também — nenhum número solto');
// ⚠️ REVISADO na 1.8.4, com o motivo: aqui se travava que "o link de download do zip é
// derivado de SP_EXT_VERSION". Esse invariante MORREU — não existe mais link de download:
// a extensão está na Chrome Web Store e o app aponta só pra ela (ordem do dono). O que
// entra no lugar é o invariante NOVO, mais forte: nenhuma tela pode oferecer zip, e a URL
// da loja é fonte ÚNICA no store.js (ela já morou dentro de uma view e as outras duas
// telas não a enxergavam — foi assim que a migração ficou pela metade).
ok(/window\.SP_EXT_STORE_URL\s*=\s*'https:\/\/chromewebstore\.google\.com\//.test(R('js/store.js')),
  'a URL da loja é fonte única no store.js');
// procura a ATRIBUIÇÃO, não o nome: o comentário-lápide cita `_spExtZipUrl` de propósito,
// pra quem grepar achar por que ele sumiu. Nome citado ≠ função viva.
// ⚠️ REVISADO na 1.8.9, com o motivo: a 1.8.4 travava "zero zip na UI". A regra mudou por
// ordem do dono — "ter alternativa enquanto a loja nao aprova". A loja leva dias revisando
// e nesse intervalo o gate exige uma versão que ela AINDA NÃO SERVE: mandar pra lá não
// resolve (o Chrome diz "já está atualizada"). O zip volta como SECUNDÁRIO e CONDICIONADO
// ao caso de extensão desatualizada; é também o canal de teste da versão nova.
// O que continua travado, e é o que importa: a loja é a porta PRINCIPAL, a URL é fonte
// única, e quem não tem extensão nenhuma NÃO recebe zip.
ok(/window\._spExtZipUrl\s*=/.test(R('js/store.js')), 'o helper do zip existe de novo (alternativa da janela de revisão)');
for (const f of ['js/views/letzplay-onboarding.js', 'js/views/tournaments-enrollment-report.js']) {
  ok(/SP_EXT_STORE_URL/.test(R(f)), f + ' aponta pra loja');
}
{
  const onb = R('js/views/letzplay-onboarding.js');
  ok(/_zipAlternativa/.test(onb), 'o zip do onboarding é uma função à parte, não o caminho principal');
  // o ramo "sem extensão" monta a mensagem com _storeBtn e NÃO chama a alternativa
  const semExt = onb.slice(onb.indexOf("'Precisa da extensão do scoreplace"), onb.indexOf("'Precisa da extensão do scoreplace") + 220);
  ok(!/_zipAlternativa/.test(semExt), 'quem NÃO tem extensão vai só pra loja — sem zip');
  const rep = R('js/views/tournaments-enrollment-report.js');
  ok(/versaoAtual && typeof window\._spExtZipUrl/.test(rep),
     'na Análise o zip só aparece quando JÁ existe extensão desatualizada');
}

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

// ── O MÍNIMO TEM QUE ESTAR VIVO, NÃO CONGELADO NO CACHE ────────────────────────────────
// 03/ago/2026: o site servia 1.95, a aba do dono tinha o store.js antigo em cache e exigia
// 1.94 — e aceitava a extensão 1.94 numa boa. "não pode aceitar nada abaixo de 1.95."
// Um gate que mora só numa constante do bundle é refém do cache do próprio bundle.
{
  ok(fs.existsSync(path.join(root, 'ext-version.txt')), 'existe o arquivo consultado ao vivo');
  ok(R('ext-version.txt').trim() === manifestVer,
     'e ele carrega a versão do manifest (' + manifestVer + ') — veio "' + R('ext-version.txt').trim() + '"');
  const sync = R('scripts/sync-ext-version.js');
  ok(/ext-version\.txt/.test(sync), 'quem o mantém é o sincronizador, não a memória de quem edita');

  const rep = R('js/views/tournaments-enrollment-report.js');
  ok(/function _lzMinimoVivo\(\)/.test(rep), 'o app confere o mínimo no servidor');
  const fn = rep.slice(rep.indexOf('function _lzMinimoVivo'), rep.indexOf('function _lzMinimoVivo') + 1200);
  ok(/cache: 'no-store'/.test(fn), 'com cache desligado — senão herda o mesmo problema');
  ok(/_verGE\(v, _LZ_MIN_EXT\)\) _LZ_MIN_EXT = v;/.test(fn),
     'e só ACEITA um mínimo MAIOR: rede fora nunca afrouxa o portão');
  ok(/setTimeout\(fim, 2500\)/.test(fn), 'com teto de espera, pra rede lenta não travar a leitura');
  ok((rep.match(/_lzMinimoVivo\(\)\.then/g) || []).length === 2,
     'e os DOIS portões (leitura de um atleta e busca do organizador) esperam por ele');
}

console.log((fail ? '✗' : '✓') + ' ext-version-single-source: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
