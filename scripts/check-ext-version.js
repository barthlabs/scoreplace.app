#!/usr/bin/env node
/* check-ext-version.js — trava de deploy: a versão da extensão letzplay tem que ser
 * IDÊNTICA nos três lugares, e o zip que o usuário instala tem que existir nessa versão.
 *
 * POR QUE ISTO EXISTE (incidente de 14/jul/2026):
 * A extensão foi pra 1.36 (manifest + content.js), mas o gate da Análise de Inscritos
 * seguia exigindo '1.25' e o do onboarding '1.35'. Como 1.35 >= 1.25, a busca completa
 * rodou com a extensão 1.35 — que desiste na 4ª tentativa de rajada — tomou 403 do
 * Cloudflare e gravou ZERO jogos para os 4 inscritos, SEM erro visível (o resumo veio
 * normal porque usa navegação de aba, não fetch). Pior: nem existia zip 1.36 pra instalar.
 * O commit a12d811a já tinha unificado isto uma vez e a divergência voltou — disciplina
 * manual ("bumpar junto") não segura. Por isso é uma trava executável.
 *
 * Uso:  node scripts/check-ext-version.js
 * Sai com código 1 (e explica) se algo divergir.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = [];

// 1) manifest.json
const manifestVer = JSON.parse(read('extension/manifest.json')).version;

// 2) content.js — o número que o APP LÊ (anunciado via extension-present)
const contentMatch = read('extension/content.js').match(/EXT_VERSION\s*=\s*'([^']+)'/);
const contentVer = contentMatch && contentMatch[1];

// 3) store.js — a versão EXIGIDA pelo app (fonte única dos dois gates)
const storeMatch = read('js/store.js').match(/window\.SP_EXT_VERSION\s*=\s*'([^']+)'/);
const storeVer = storeMatch && storeMatch[1];

if (!contentVer) fail.push('extension/content.js: EXT_VERSION não encontrado');
if (!storeVer) fail.push('js/store.js: window.SP_EXT_VERSION não encontrado');

if (contentVer && storeVer && !(manifestVer === contentVer && contentVer === storeVer)) {
  fail.push(
    'Versões da extensão DIVERGEM:\n' +
    '    extension/manifest.json      = ' + manifestVer + '\n' +
    '    extension/content.js         = ' + contentVer + '\n' +
    '    js/store.js SP_EXT_VERSION   = ' + storeVer + '\n' +
    '  As três têm que ser iguais.'
  );
}

// 4) Nenhum mínimo solto pode voltar a existir fora do store.js.
for (const f of ['js/views/letzplay-onboarding.js', 'js/views/tournaments-enrollment-report.js']) {
  const src = read(f);
  const bad = src.match(/(?:MIN_EXT_VERSION|_LZ_MIN_EXT)\s*=\s*['"][\d.]+['"]/);
  if (bad) fail.push(f + ': mínimo hardcoded (' + bad[0] + ') — use window.SP_EXT_VERSION');
}

// 5) O zip da versão exigida tem que existir. ⚠️ Desde a 1.8.4 ele NÃO é mais o que o
//    usuário instala — a extensão está na Chrome Web Store e o app aponta só pra lá (o
//    Chrome atualiza sozinho). O zip é o artefato de PUBLICAÇÃO: é o arquivo que se sobe
//    no painel da Web Store. Por isso a trava fica: subir uma versão sem ter o zip dela
//    gerado é ficar sem o que publicar.
if (storeVer) {
  const zip = 'scoreplace-letzplay-ext-' + storeVer + '.zip';
  if (!fs.existsSync(path.join(root, zip))) {
    fail.push('Falta o zip ' + zip + ' — o gate vai exigir v' + storeVer +
      ' e o usuário não tem de onde instalar. Rode: npm run ext:zip');
  }
}

// 6) NENHUM host de desenvolvimento pode existir no pacote publicado — nem em comentário.
//
// POR QUE ISTO EXISTE (17/ago/2026, SEGUNDA recorrência): a 1.97 (commit 023b4875) tirou
// os hosts de desenvolvimento do `host_permissions` e dos `content_scripts` justamente
// porque é permissão pedida ao usuário final para endereço que ele nunca visita. A
// varredura daquela vez parou no manifest: `background.js` (CS_MATCHES) e `popup.js`
// (tabs.query) seguiram carregando 'http://' + 'localhost' até a 2.07. Sem
// host_permission esses padrões não injetam NADA — o dano não é acesso, é a CONTRADIÇÃO:
// a justificativa de permissão enviada à Chrome Web Store jura que a extensão só alcança
// letzplay.me e scoreplace.app, e quem revisa varre o zip com busca de texto.
// Ver [[feedback_sweep_all_render_sites]]: a regra tem que valer em TODO ponto, não no
// primeiro que se acha. Por isso a varredura virou trava, e vale para o diretório inteiro
// (build-ext-zip.sh empacota extension/ inteiro — o que está aqui é o que se publica).
const HOSTS_DEV = [
  /localhost/i,
  /\b127\.0\.0\.1\b/,
  /\b0\.0\.0\.0\b/,
  /scoreplace-staging/i,
  /\.web\.app/i,
];
(function varrerPacote(dir) {
  for (const nome of fs.readdirSync(path.join(root, dir))) {
    const rel = dir + '/' + nome;
    const st = fs.statSync(path.join(root, rel));
    if (st.isDirectory()) { varrerPacote(rel); continue; }
    // Só texto: ícones e binários não têm string que um revisor leia.
    if (!/\.(js|json|html|css|md|txt)$/i.test(nome)) continue;
    const src = read(rel);
    src.split('\n').forEach((linha, i) => {
      for (const re of HOSTS_DEV) {
        if (re.test(linha)) {
          fail.push(rel + ':' + (i + 1) + ': host de desenvolvimento no pacote publicado —\n' +
            '      ' + linha.trim().slice(0, 100) + '\n' +
            '    A justificativa enviada à Web Store diz que a extensão só alcança letzplay.me\n' +
            '    e scoreplace.app. Tire a string (inclusive de comentário). Testar na máquina =\n' +
            '    carregar cópia sem compactação com o host de volta — a cópia local, nunca esta.');
          break;
        }
      }
    });
  }
})('extension');

if (fail.length) {
  console.error('\n✗ check-ext-version FALHOU:\n');
  fail.forEach((f) => console.error('  • ' + f + '\n'));
  process.exit(1);
}
console.log('✓ extensão letzplay v' + storeVer + ' consistente (manifest = content.js = store.js, zip presente)');
