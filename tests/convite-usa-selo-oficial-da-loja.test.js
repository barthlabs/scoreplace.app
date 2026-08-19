/* O CONVITE IMPRESSO USA O SELO OFICIAL DA LOJA, NÃO TEXTO IMITANDO A MARCA
 * node tests/convite-usa-selo-oficial-da-loja.test.js
 *
 * A FALHA REAL (dono, 19/ago/2026, olhando o convite impresso): _"foi colocado algo
 * ridículo que não era isso que eu tinha pedido"_. Ele pedira os SELOS OFICIAIS das
 * lojas; o flyer desenhava TEXTO com glifo — "▶ Google Play", " App Store". Em papel,
 * marca imitada parece amadora, e papel não se corrige depois.
 *
 * ⚠️ A PLAY CONTINUA DESLIGADA, E ISSO É MEDIÇÃO: reconferido em 19/ago/2026, a ficha
 * `play.google.com/store/apps/details?id=app.scoreplace` responde **404** (teste
 * fechado), enquanto a da Apple responde 200. Anunciar a Play num impresso mandaria
 * quem lê pra uma página onde não dá pra instalar. Ligar só quando a ficha abrir.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const sharing = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-sharing.js'), 'utf8');

console.log('\nCONVITE IMPRESSO: SELO OFICIAL DA LOJA');

// ── 1. FONTE ÚNICA carrega o caminho do selo ────────────────────────────────
const bloco = (store.match(/window\.SP_LOJAS\s*=\s*\{[\s\S]*?\n\};/) || [''])[0];
ok(/apple:[^\n]*badge:/.test(bloco), 'SP_LOJAS.apple tem `badge` (caminho do selo)');
ok(/play:[^\n]*badge:/.test(bloco), 'SP_LOJAS.play tem `badge`');
ok(/play:\s*\{\s*on:\s*false/.test(bloco),
   'a Play segue DESLIGADA — a ficha dela responde 404 (medido 19/ago/2026)');

// ── 2. O FLYER DESENHA IMAGEM, NÃO TEXTO ────────────────────────────────────
const selo = (sharing.match(/function _flyerSeloHtml[\s\S]*?\n  \}/) || [''])[0];
ok(selo.length > 0, 'existe `_flyerSeloHtml`');
ok(/<img class="loja-badge"/.test(selo), 'ele emite <img> do selo (não texto com glifo)');
ok(/SCOREPLACE_URL/.test(selo),
   'com URL ABSOLUTA — o flyer é montado em srcdoc/janela de impressão, onde relativo não resolve');
ok(/onerror=/.test(selo),
   'e com fallback: sem o arquivo, volta pro texto — nunca deixa buraco na folha');

// ── 3. VALE PROS DOIS CONVITES (app E torneio) ──────────────────────────────
// O dono pediu explicitamente: "a mesma coisa poderia estar nos convites para torneios".
// O bloco vive no ramo COMPARTILHADO do flyer completo — se alguém duplicar, quebra.
// exclui a DEFINIÇÃO (`function _flyerLojasHtml()`), que casa com o mesmo texto
const chamadas = (sharing.match(/(?<!function )_flyerLojasHtml\(\)/g) || []).length;
ok(chamadas === 1, 'o bloco de lojas é montado num ponto só, compartilhado por app e torneio');

// ── 4. O SELO NÃO PODE DISTORCER ────────────────────────────────────────────
ok(/\.loja-badge \{[^}]*width:auto/.test(sharing),
   'largura automática — trava a altura e deixa a proporção livre (distorcer marca é pior que não usar)');

console.log(falhas === 0 ? '\n✅ selo oficial, com rede de segurança\n' : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
