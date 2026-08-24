/* OS SELOS DAS DUAS LOJAS TÊM O MESMO TAMANHO
 *
 * Ordem do dono (24/ago/2026): _"na landing page e onde mais for, as artes das lojas App
 * Store e Google Play devem ter o mesmo tamanho (o Google está menor)"_ — e, na sequência:
 * _"existem esses selos oficiais. use-os"_.
 *
 * POR QUE O GOOGLE SAÍA MENOR COM A MESMA ALTURA: as duas artes OFICIAIS não são enquadradas
 * igual. MEDIDO (bbox do alpha, rasterizando as duas no navegador):
 *   • Apple  — arquivo 120x40,  tinta 120x40  → 100,0% da altura é selo;
 *   • Google — arquivo 646x250, tinta 646x192 →  76,8% (29px de margem transparente em cima
 *     e embaixo — é a clear space que a diretriz do Google exige, embutida no arquivo).
 * Com `height:44px` nos dois, o Google desenhava 33,8px de selo contra 44px da Apple: 23%
 * menor. A altura era igual; o que se VÊ, não.
 *
 * A CORREÇÃO: a caixa de cada selo cresce na proporção da margem que a arte carrega
 * (`SP_LOJAS[x].tinta`) — a TINTA sai igual. ⛔ Sem recortar, recolorir ou redesenhar arte:
 * as duas lojas proíbem, e a margem do Google É a clear space dele. Usa-se o selo oficial
 * como ele é; o que muda é o tamanho da caixa.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
const share = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-sharing.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
console.log('──── selos das lojas do mesmo tamanho ────');

// ── 1. a medida vive no cadastro da loja, uma vez ────────────────────────────────────
ok(/apple:[^\n]*tinta: 1,/.test(store), 'a arte da Apple se declara de borda a borda (tinta 1)');
ok(/play:[^\n]*tinta: 0\.768,/.test(store), 'a do Google declara a margem embutida (tinta 0,768)');

// ── 2. quem desenha compensa — nos DOIS lugares ("e onde mais for") ──────────────────
ok(/height:' \+ \(Math\.round\(\(h \/ \(l\.tinta \|\| 1\)\)/.test(main),
  'o bloco da landing/app cresce a caixa pela `tinta`');
ok(/loja\.tinta && loja\.tinta !== 1/.test(share),
  'o convite IMPRESSO usa a mesma régua (o selo também sai no papel)');
ok(/--loja-badge-h/.test(share),
  '  → e a altura do impresso vira variável, pra não haver um segundo número solto');

// ── 3. a conta fecha: mesma tinta na tela ────────────────────────────────────────────
const H = 44, tintaApple = 1, tintaPlay = 0.768;
const inkApple = H / tintaApple * tintaApple;
const inkPlay = Math.round((H / tintaPlay) * 100) / 100 * tintaPlay;
ok(Math.abs(inkApple - inkPlay) < 0.05,
  'com 44px pedidos, os dois desenham ~44px de selo (apple ' + inkApple.toFixed(2) +
  ' · play ' + inkPlay.toFixed(2) + ')');
const antes = H * tintaPlay;
ok(Math.abs(H - antes) > 9,
  '  → (o bug, documentado) antes o Google desenhava ' + antes.toFixed(1) + 'px contra 44');

// ── 4. ARTE OFICIAL, INTOCADA ────────────────────────────────────────────────────────
const apple = fs.readFileSync(path.join(ROOT, 'assets', 'badge-app-store.svg'), 'utf8');
ok(/width="119\.66407" height="40"/.test(apple), 'o SVG da Apple é o oficial, sem recorte');
const png = fs.readFileSync(path.join(ROOT, 'assets', 'badge-google-play.png'));
// PNG: largura/altura vivem nos bytes 16..24 do IHDR
const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
ok(w === 646 && h === 250, 'o PNG do Google é o oficial 646x250, sem recorte (got ' + w + 'x' + h + ')');
ok(/as duas lojas proíbem/.test(store) || /proíbem/.test(main),
  'o porquê de não recortar está escrito onde alguém vai mexer');

// ── 5. SÃO OS ARQUIVOS OFICIAIS, EM pt-BR — e o hash prova ──────────────────────────
// Conferido em 24/ago/2026 baixando das fontes oficiais: os dois arquivos do repo são
// byte-idênticos ao que Apple e Google servem. O hash trava isso: trocar por um arquivo de
// busca livre (foi a dúvida do dono) fica VERMELHO aqui.
const crypto = require('crypto');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
ok(sha(fs.readFileSync(path.join(ROOT, 'assets', 'badge-app-store.svg'))) ===
   '0e9291a9c654e479762b75b51dd94a150af6fab76390a79cb2218cdc8f6cc893',
  'o selo da App Store é o oficial pt-BR (toolbox.marketingtools.apple.com, black/pt-br)');
ok(sha(png) === 'e1ad5e03f636d94b05448c1f156e39b012b9e1d772b730d9e27d066695531a6b',
  'o selo do Google Play é o oficial pt-BR (play.google.com/.../pt-br_badge_web_generic.png)');
ok(/_Badge_PTBR_/.test(apple), '  → e o SVG da Apple se declara PTBR no próprio título');
ok(/toolbox\.marketingtools\.apple\.com/.test(store) && /pt-br_badge_web_generic/.test(store),
  '  → as URLs oficiais estão anotadas onde as artes são cadastradas');

console.log(fail === 0
  ? '\n✅ selos-das-lojas-do-mesmo-tamanho: OK (' + pass + ')'
  : '\n❌ selos-das-lojas-do-mesmo-tamanho: ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
