#!/usr/bin/env node
/* check-shell-version.js — TRAVA DE PUBLICAÇÃO: nenhuma build pode voltar a permitir
 * execução híbrida (shell de uma versão + JS de outra).   (R1.0, 2.1.70)
 *
 * ⛔ O CENÁRIO QUE ISTO IMPEDE DE VOLTAR, medido em produção em 31/ago/2026:
 * `version.txt` respondia 2.1.69 enquanto uma sessão rodava o documento da 2.1.63 com
 * os scripts da 2.1.67–2.1.69. Com o dado canônico intacto no banco, a tela mostrava
 * "2 inscritos" de 152, "📣 Novidades" e "🏅 Seus últimos resultados" vazias.
 *
 * ⛔ POR QUE UM TESTE UNITÁRIO NÃO BASTAVA. Três das quatro condições que produziram
 * aquele estado não estão em código de aplicação nenhum — estão em CONFIGURAÇÃO:
 * o header de `/`, o header de `/index.html` e o carimbo no shell. Teste de unidade não
 * lê `firebase.json`. Esta trava lê, e roda no `npm test`, que é predeploy do hosting.
 *
 * Confere, sem rede:
 *   ① `<meta name="sp-shell">` existe e bate com SCOREPLACE_VERSION de js/store.js;
 *   ② version.txt e o CACHE_NAME do sw.js batem com a MESMA versão;
 *   ③ firebase.json declara Cache-Control revalidável pra `/` E pra `/index.html`
 *      — e IGUAIS entre si (a rota e o arquivo são a mesma página);
 *   ④ o sw.js atende navegação pela REDE primeiro.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

const erros = [];
const falha = (m) => erros.push(m);

/* ① e ② — UMA versão, quatro lugares */
let versao = '';
try {
  const m = ler('js/store.js').match(/SCOREPLACE_VERSION\s*=\s*'([^']+)'/);
  if (!m) falha('js/store.js não declara SCOREPLACE_VERSION');
  else versao = m[1];
} catch (e) { falha('não consegui ler js/store.js: ' + e.message); }

if (versao) {
  const idx = (() => { try { return ler('index.html'); } catch (e) { falha('index.html ilegível'); return ''; } })();
  const mm = idx.match(/<meta\s+name="sp-shell"\s+content="([^"]*)"\s*>/);
  if (!mm) {
    falha('index.html NÃO carimba a própria versão (<meta name="sp-shell">).\n' +
          '    Sem esse carimbo o app não tem como saber que o documento é de outra build:\n' +
          '    `_checkForUpdate` compara version.txt com o JS RODANDO, e no híbrido os dois batem.');
  } else if (mm[1] !== versao) {
    falha('sp-shell="' + mm[1] + '" != SCOREPLACE_VERSION=' + versao +
          '\n    RODE: npm run prerender  (é ele que carimba, a partir do store.js)');
  }

  try {
    const vt = ler('version.txt').trim();
    if (vt !== versao) falha('version.txt=' + vt + ' != SCOREPLACE_VERSION=' + versao + ' — RODE: npm run prerender');
  } catch (e) { falha('version.txt não existe — RODE: npm run prerender'); }

  try {
    const cm = ler('sw.js').match(/var CACHE_NAME = 'scoreplace-v([^']*)';/);
    if (!cm) falha('sw.js não declara CACHE_NAME no formato esperado');
    else if (cm[1] !== versao) falha('CACHE_NAME=scoreplace-v' + cm[1] + ' != ' + versao + ' — RODE: npm run prerender');
  } catch (e) { falha('sw.js ilegível: ' + e.message); }
}

/* ③ — a ROTA e o ARQUIVO são a mesma página; políticas diferentes = híbrido servido
 * pelo próprio Hosting. ⚠️ O glob `**​/*.@(js|css|html)` casa `index.html` e NÃO casa
 * `/` — foi exatamente essa fresta que deixou `/` em `max-age=3600` enquanto
 * `/index.html` respondia `no-cache`. */
const REVALIDA = /(no-cache|no-store|max-age=0)/;
try {
  const fb = JSON.parse(ler('firebase.json'));
  const hs = (fb.hosting && fb.hosting.headers) || [];
  const valorDe = (fonte) => {
    let v = null;
    hs.forEach((h) => {
      if (String(h.source) !== fonte) return;
      (h.headers || []).forEach((k) => {
        if (String(k.key).toLowerCase() === 'cache-control') v = String(k.value);
      });
    });
    return v;
  };
  const raiz = valorDe('/');
  const idxh = valorDe('/index.html');
  if (!raiz) falha('firebase.json não declara Cache-Control para a rota "/" — ela cai no default do Hosting (max-age=3600) e serve shell velho SEM revalidar');
  else if (!REVALIDA.test(raiz)) falha('Cache-Control de "/" = "' + raiz + '" não revalida');
  if (!idxh) falha('firebase.json não declara Cache-Control explícito para "/index.html"');
  else if (!REVALIDA.test(idxh)) falha('Cache-Control de "/index.html" = "' + idxh + '" não revalida');
  if (raiz && idxh && raiz !== idxh) {
    falha('"/" ("' + raiz + '") e "/index.html" ("' + idxh + '") têm políticas DIFERENTES — é a mesma página');
  }
  const vt = valorDe('/version.txt');
  if (!vt || !REVALIDA.test(vt)) {
    falha('version.txt sem Cache-Control revalidável — é o ÁRBITRO da atualização; cacheado, ele responde "você está em dia" com a cópia velha');
  }
} catch (e) { falha('firebase.json ilegível ou inválido: ' + e.message); }

/* ④ — navegação pela rede primeiro */
try {
  const sw = ler('sw.js');
  if (sw.indexOf('_navegacaoRedePrimeiro') === -1) {
    falha('sw.js não tem `_navegacaoRedePrimeiro` — navegação voltou a sair do cache');
  } else {
    const corpo = sw.slice(sw.indexOf('function _navegacaoRedePrimeiro'));
    const fim = corpo.indexOf('\n}\n');
    const f = corpo.slice(0, fim === -1 ? 1200 : fim);
    const posFetch = f.indexOf('fetch(');
    const posCache = f.indexOf('_shellCoerenteDoCache');
    if (posFetch === -1) falha('`_navegacaoRedePrimeiro` não vai à rede');
    else if (posCache !== -1 && posCache < posFetch) falha('`_navegacaoRedePrimeiro` consulta o cache ANTES da rede');
    const branch = sw.indexOf("if (event.request.mode === 'navigate') {\n      event.respondWith(_navegacaoRedePrimeiro(event));");
    if (branch === -1) falha('o fetch handler não desvia navegação pra `_navegacaoRedePrimeiro` antes do caminho cache-first');
  }
} catch (e) { falha('sw.js ilegível: ' + e.message); }

if (erros.length) {
  console.error('✗ check-shell-version FALHOU:\n');
  erros.forEach((e) => console.error('  • ' + e + '\n'));
  process.exitCode = 1;   // ⛔ nunca process.exit(): trunca o stdout já enfileirado
} else {
  console.log('✓ coerência de publicação em dia (shell/JS/version.txt/CACHE_NAME = ' + versao + ', headers de / e /index.html iguais, navegação rede-primeiro)');
}
