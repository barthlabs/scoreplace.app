#!/usr/bin/env node
/* check-cache-busters.js — trava de deploy: todo JS ALTERADO tem que ter o cache-buster
 * na versão atual, senão o service worker serve a cópia velha e o deploy é fantasma.
 *
 * POR QUE ISTO EXISTE (14/jul/2026): editei js/views/match-history.js e esqueci de bumpar
 * `?v=` no index.html — ele seguia em `?v=1.1.1`. O arquivo no disco tinha o código novo,
 * os testes passavam, mas o NAVEGADOR carregava a versão antiga do SW. Só apareceu porque
 * fui verificar a tela no browser; nenhum teste unitário pega isso. É a mesma família do
 * incidente do <script> não-fechado (v0.16.11): erro que vive no index.html, não no JS.
 *
 * Compara contra origin/main: qualquer .js sob js/ que mudou precisa de ?v=<versão atual>.
 * Uso:  node scripts/check-cache-busters.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
const versao = (store.match(/window\.SCOREPLACE_VERSION\s*=\s*'([^']+)'/) || [])[1];
if (!versao) { console.error('✗ não achei SCOREPLACE_VERSION em js/store.js'); process.exit(1); }

// ── 2.0.42 · O `merge-base` SOZINHO DEIXAVA A TRAVA VAZIA ────────────────────────────
// INCIDENTE (24/ago/2026): publiquei um conserto em `js/views/dashboard.js` e ele foi pro ar
// servido como `?v=2.0.39` — a URL ANTIGA. Quem já tinha o arquivo em cache continuou com o
// código velho. Duas causas somadas:
//   1. este script não era chamado por NINGUÉM do pipeline (só `npm run check:cache`);
//   2. e, mesmo chamado no deploy, ele seria VAZIO: `deploy-hosting.sh` empurra pro `main`
//      ANTES de publicar, então nessa hora `merge-base HEAD origin/main === HEAD` e o diff
//      não tem arquivo nenhum. A trava passava sem conferir nada — o pior tipo de verde.
// Agora, quando não há nada à frente do `main`, a comparação cai pro RELEASE ANTERIOR (o
// commit anterior ao último que mexeu em `version.txt`). Assim a pergunta continua sendo a
// mesma — "o que mudou nesta leva tem o `?v=` da versão desta leva?" — em vez de virar
// "mudou algo desde agora?", que é sempre não.
// ⚠️ Foi também assim que a mistura de DUAS sessões na mesma árvore passou batida: a outra
// sessão publicou 2.0.40/2.0.41 no meio, meu bump se perdeu no rebase e ninguém acusou.
// [[feedback_uma_sessao_por_arvore_chip_vai_isolado]] · [[project_cache_buster_gate_so_confere_js]]
let mudados = [];
let _de = '';
try {
  let base = execSync('git merge-base HEAD origin/main', { cwd: root }).toString().trim();
  const head = execSync('git rev-parse HEAD', { cwd: root }).toString().trim();
  if (base === head) {
    // Nada à frente do main → a base vira o RELEASE ANTERIOR (exclusive): o último commit que
    // mexeu em `version.txt` e que não seja o próprio HEAD. Assim o diff é exatamente ESTA
    // leva.
    // ⚠️ Duas bordas que eu já errei ao escrever isto, as duas medidas:
    //   • usar o PAI do release anterior varre a leva anterior junto e acusa arquivo que já
    //     está com o `?v=` certo (aconteceu: router.js e bracket.js da leva de outra sessão);
    //   • no release normal o próprio HEAD é quem carimba o `version.txt` — pegar "o último"
    //     sem descartar o HEAD devolve HEAD..HEAD, e a trava fica vazia de novo.
    const rels = execSync('git log -3 --format=%H -- version.txt', { cwd: root })
      .toString().split('\n').map((x) => x.trim()).filter(Boolean);
    const anterior = rels.filter((h) => h !== head)[0];
    if (anterior) { base = anterior; _de = ' (desde o release anterior ' + anterior.slice(0, 8) + ' — nada à frente do main)'; }
  }
  mudados = execSync('git diff --name-only ' + base + ' -- js/', { cwd: root })
    .toString().split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.js'));
} catch (e) {
  console.log('⚠ sem origin/main pra comparar — pulando (' + (e.message || '').split('\n')[0] + ')');
  process.exit(0);
}
if (_de) console.log('▸ check-cache-busters' + _de);

/* ── `--fix`: CONSERTA O QUE ELE MESMO ACUSA ──────────────────────────────────────────
 * Esta trava já sabe QUAL arquivo está com o `?v=` velho e QUAL versão ele devia ter — só
 * não escrevia. Resultado: cada release parava um ciclo inteiro (rodar o gate ~5min, ver a
 * mesma falha mecânica, bumpar à mão, rodar de novo). Aconteceu CINCO vezes na leva de
 * 03/set/2026. Uma trava que sabe o conserto e não o oferece cobra pedágio sem dar nada.
 * ⛔ O modo padrão continua SÓ CONFERINDO — o `--fix` é explícito, para o predeploy e o
 * pre-push seguirem reprovando em vez de consertar sozinhos e esconder a mudança de quem
 * está publicando. O sufixo `-x<versão da extensão>` é PRESERVADO (é o pipeline da extensão
 * que o grava). [[project_sync_ext_version_cache_buster_base_stale]] */
const CONSERTAR = process.argv.includes('--fix');

const falhas = [];
const consertos = [];
mudados.forEach((f) => {
  // regex do caminho exato + ?v=
  const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([0-9a-zA-Z.\\-]+)', 'g');
  const achados = [...html.matchAll(re)].map((m) => m[1]);
  if (!achados.length) return;   // não referenciado no index (lazy-load, extensão, functions)
  achados.forEach((v) => {
    // O cache-buster do store.js carrega o sufixo '-x<versão da extensão>', gravado pelo
    // próprio pipeline (scripts/sync-ext-version.js) pra invalidar o gate da extensão junto.
    // Comparar com igualdade estrita acusava esse formato composto como "desatualizado" toda
    // vez que o store.js mudava — falso positivo. O que importa é a BASE bater com a versão.
    if (v.replace(/-x[\d.]+$/, '') !== versao) {
      falhas.push(f + ' mudou mas está com ?v=' + v + ' (atual: ' + versao + ')');
      if (CONSERTAR) {
        const sufixo = (v.match(/-x[\d.]+$/) || [''])[0];
        consertos.push({ arquivo: f, de: v, para: versao + sufixo });
      }
    }
  });
});

if (falhas.length && CONSERTAR && consertos.length) {
  let novoHtml = html;
  consertos.forEach((c) => {
    const de = c.arquivo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=' + c.de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    novoHtml = novoHtml.replace(new RegExp(de, 'g'), c.arquivo + '?v=' + c.para);
  });
  fs.writeFileSync(path.join(root, 'index.html'), novoHtml);
  console.log('\n✓ cache-busters CONSERTADOS no index.html:\n');
  consertos.forEach((c) => console.log('  • ' + c.arquivo + '  ' + c.de + ' → ' + c.para));
  console.log('\n  (rode de novo sem --fix para conferir)\n');
  process.exit(0);
}
if (falhas.length) {
  console.error('\n✗ cache-buster desatualizado — o navegador serviria a versão VELHA:\n');
  falhas.forEach((f) => console.error('  • ' + f));
  console.error('\n  Bumpe o ?v= no index.html pra ' + versao + ' — ou rode:');
  console.error('      node scripts/check-cache-busters.js --fix\n');
  process.exit(1);
}
console.log('✓ cache-busters ok (' + mudados.length + ' js alterado(s), versão ' + versao + ')');
