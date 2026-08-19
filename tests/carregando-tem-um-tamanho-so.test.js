/* A TELA DE CARREGANDO TEM UM TAMANHO SÓ
 * node tests/carregando-tem-um-tamanho-so.test.js
 *
 * A FALHA REAL (relato do dono, 18/ago/2026): _"tem mais de uma tela de carregamento
 * (carregando etc) que tem os mesmos elementos mas em tamanhos diferentes que ficam se
 * alternando, revelando a precariedade do programa"_.
 *
 * MEDIDO: a MESMA bola era pedida em CINCO tamanhos — 4.5rem no splash do index.html,
 * 4rem no overlay global (`_showLoading`), 3rem no default, 2.4rem (locais/organizador)
 * e 2.2rem (stats, troféus, ferramentas). Navegando entre telas ela pulava de tamanho a
 * cada passo.
 *
 * O CONTRATO: a identidade do carregamento é UMA. O que legitimamente varia é a CAIXA
 * (`minHeight` do `_renderBallLoader`), não a bola. Por isso o tamanho é imposto NA
 * FONTE e `opts.size` é ignorado — tirar o parâmetro dos ~8 chamadores deixaria a porta
 * aberta pro próximo achar que pode escolher.
 *
 * ⚠️ EXCEÇÃO LEGÍTIMA: `_renderBallLoaderInline` (1.4rem) é uma LINHA dentro de texto,
 * não uma tela de carregamento — tem tamanho próprio de propósito.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); return; }
  falhas++; console.log('  ✗ ' + msg);
}

const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

console.log('\nA TELA DE CARREGANDO TEM UM TAMANHO SÓ');

// ── 1. EXISTE UM VALOR CANÔNICO ─────────────────────────────────────────────
const canon = (store.match(/window\._SP_LOADER_BALL_SIZE\s*=\s*'([^']+)'/) || [])[1];
ok(!!canon, 'existe `_SP_LOADER_BALL_SIZE` — o tamanho mora num lugar só');

// ── 2. O CORPO DO LOADER USA O CANÔNICO, E IGNORA O QUE O CHAMADOR PEDIU ────
const corpo = (store.match(/window\._spLoaderBodyHtml\s*=\s*function[\s\S]*?\n};/) || [''])[0];
ok(/var size = window\._SP_LOADER_BALL_SIZE;/.test(corpo),
   'o corpo do loader usa o canônico');
ok(!/opts\.size\s*\|\|/.test(corpo),
   'e NÃO aceita mais `opts.size` (era por aí que os 5 tamanhos entravam)');

// ── 3. O SPLASH INICIAL USA O MESMO TAMANHO ─────────────────────────────────
// Era o 1º pulo que se via: splash 4.5rem → primeira tela 3rem.
ok(indexHtml.indexOf('width:4.5rem') === -1,
   'o splash do index.html não usa mais 4.5rem');
ok(new RegExp('width:' + canon.replace('.', '\\.') + '; height:' + canon.replace('.', '\\.') + '[^;]*; line-height:1;[^}]*scoreplace-ball-spin').test(indexHtml),
   'o splash usa exatamente o tamanho canônico (' + canon + ')');

// ── 4. A CAIXA CONTINUA LIVRE ───────────────────────────────────────────────
// O que varia por tela é o espaço vertical, e isso é legítimo — não pode ter sido
// congelado junto.
ok(/opts\.minHeight\s*\|\|/.test(store),
   'a ALTURA da caixa (minHeight) continua livre por tela');

// ── 5. A VERSÃO INLINE SEGUE COM TAMANHO PRÓPRIO ────────────────────────────
const inline = (store.match(/window\._renderBallLoaderInline\s*=\s*function[\s\S]*?\n};/) || [''])[0];
ok(/opts\.size\s*\|\|\s*'1\.4rem'/.test(inline),
   'a versão inline mantém tamanho próprio (é uma linha, não uma tela)');

console.log(falhas === 0
  ? '\n✅ uma bola, um tamanho — só a caixa varia\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
