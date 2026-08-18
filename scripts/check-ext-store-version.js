#!/usr/bin/env node
/* check-ext-store-version.js — a versão que o app DECLARA da loja tem que ser verdade.
 *
 * POR QUE ISTO EXISTE (17/ago/2026): `window.SP_EXT_STORE_VERSION` (store.js) é a única
 * coisa no app que sabe o que a Chrome Web Store publica — o navegador não tem como
 * perguntar (a página é montada por JS e o CORS barra), então o número é DECLARADO à mão.
 * Número declarado à mão apodrece: fui conferir a ficha pública e ela servia **1.97**
 * enquanto o app declarava **1.98**. Ninguém tinha como saber sem abrir a loja.
 *
 * O RISCO É ASSIMÉTRICO, e é por isso que o exit code só pune um lado:
 *   • declarar ATRÁS da loja  → o app manda pro zip quando já podia mandar pra loja.
 *     Chato, reversível, e é o estado NORMAL enquanto uma revisão está pendente. (aviso)
 *   • declarar À FRENTE       → o app manda pra loja prometendo uma versão que não está
 *     lá; o gate exige a nova, a loja entrega a velha, e a pessoa fica num LAÇO sem
 *     conseguir importar nada. (erro)
 *
 * Uso:  node scripts/check-ext-store-version.js
 *       node scripts/check-ext-store-version.js --json
 *
 * ⚠️ NÃO entra no predeploy: depende de rede e de HTML de terceiro. Trava de deploy que
 * quebra por causa da rede da Google vira `--force`, e `--force` é o que não pode existir
 * (ver [[feedback_abort_is_the_warning]]). Aqui é ferramenta de CONFERIR — rode depois de
 * publicar na loja, e quando a revisão sair.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const JSON_OUT = process.argv.includes('--json');
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

const mDecl = store.match(/window\.SP_EXT_STORE_VERSION\s*=\s*'([^']+)'/);
const mReq = store.match(/window\.SP_EXT_VERSION\s*=\s*'([^']+)'/);
const mUrl = store.match(/window\.SP_EXT_STORE_URL\s*=\s*'([^']+)'/);
if (!mDecl || !mReq || !mUrl) {
  console.error('✗ não achei SP_EXT_STORE_VERSION / SP_EXT_VERSION / SP_EXT_STORE_URL no store.js');
  process.exit(1);
}
const declarada = mDecl[1], exigida = mReq[1], url = mUrl[1];

// Comparação por segmento — '1.9' < '1.10' (string comparison erraria isso).
function cmp(a, b) {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] || 0, y = B[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

// ⚠️ O redirect da loja aponta pro slug do NOME, e o nome tem travessão ("scoreplace —
// importar letzplay"). Normalizar a URL percent-encoda o traço, e o servidor devolve o
// redirect de novo com o traço cru → laço. Por isso o `vistos`: endereço já visitado
// (comparado DECODIFICADO) não é seguido outra vez; segue-se o encodado, que responde 200.
function baixar(u, saltos, vistos) {
  saltos = saltos || 0;
  vistos = vistos || new Set();
  return new Promise(function (res, rej) {
    if (saltos > 6) return rej(new Error('redirecionamentos demais'));
    try { vistos.add(decodeURI(u)); } catch (e) { vistos.add(u); }
    https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36' } }, function (r) {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        // ⚠️ O `Location` vem com bytes UTF-8 e o Node entrega a string como latin1: o
        // travessão do slug ("scoreplace — importar letzplay") chega como "â". Remontar
        // a URL assim produz um endereço que a loja redireciona PRA SEMPRE. Reinterpretar
        // os bytes como UTF-8 antes de normalizar é o que fecha a conta.
        var loc = Buffer.from(r.headers.location, 'latin1').toString('utf8');
        var destino = new URL(loc, u).toString();
        var chave;
        try { chave = decodeURI(destino); } catch (e) { chave = destino; }
        if (vistos.has(chave)) return rej(new Error('a loja fica redirecionando pro mesmo endereço'));
        return res(baixar(destino, saltos + 1, vistos));
      }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); }
      let b = '';
      r.setEncoding('utf8');
      r.on('data', function (c) { b += c; });
      r.on('end', function () { res(b); });
    }).on('error', rej);
  });
}

(async function () {
  let html;
  try {
    html = await baixar(url);
  } catch (e) {
    // Rede/ficha fora do ar NÃO é reprovação — é "não deu pra conferir". Dizer isso é
    // melhor que inventar um veredito. Ver [[feedback_check_provider_status_before_retrying]].
    console.log('⚠️  não deu pra ler a ficha da loja (' + e.message + ') — nada foi verificado.');
    console.log('    declarada no app: ' + declarada + ' · exigida pelo gate: ' + exigida);
    process.exit(0);
  }

  // A ficha é montada por JS, mas o HTML servido traz o rótulo e o valor lado a lado.
  // Dois padrões porque a Google já trocou a classe uma vez; se os dois falharem, avisa —
  // nunca chuta um número.
  let naLoja = null;
  const m1 = html.match(/Version<\/div><div[^>]*>([0-9][0-9.]*)/);
  const m2 = html.match(/(?:Vers[ãa]o|Version)[^0-9]{0,60}?([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
  if (m1) naLoja = m1[1];
  else if (m2) naLoja = m2[1];

  if (!naLoja) {
    console.log('⚠️  a ficha carregou mas não achei o campo de versão (a Google mudou o HTML?).');
    console.log('    confira à mão: ' + url);
    process.exit(0);
  }

  const saida = { naLoja: naLoja, declarada: declarada, exigida: exigida, url: url };
  if (JSON_OUT) { console.log(JSON.stringify(saida, null, 1)); }

  const d = cmp(declarada, naLoja);
  if (d > 0) {
    console.error('\n✗ O APP DECLARA MAIS DO QUE A LOJA TEM:');
    console.error('    loja publica : ' + naLoja);
    console.error('    app declara  : ' + declarada + '   ← mentira que prende o usuário num laço');
    console.error('    gate exige   : ' + exigida);
    console.error('\n  Corrija SP_EXT_STORE_VERSION (js/store.js) para ' + naLoja + ', ou publique a versão declarada.');
    process.exit(1);
  }

  if (d < 0) {
    console.log('⚠️  declaração ATRÁS da loja — o app manda pro zip sem precisar.');
    console.log('    loja publica: ' + naLoja + ' · app declara: ' + declarada + ' · gate exige: ' + exigida);
    console.log('    Se a ' + naLoja + ' já está no ar, suba SP_EXT_STORE_VERSION pra ' + naLoja + '.');
    process.exit(0);
  }

  const cobre = cmp(naLoja, exigida) >= 0;
  console.log('✓ declaração bate com a loja (' + naLoja + ')' +
    (cobre ? ' — e ela já cobre o gate (' + exigida + '): o app manda pra LOJA.'
           : ' — mas o gate exige ' + exigida + ': o app manda pro ZIP até a revisão sair.'));
  process.exit(0);
})();
