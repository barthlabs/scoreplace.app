#!/usr/bin/env node
/* check-version-ahead.js — TRAVA ANTI-REGRESSÃO DE DEPLOY.
 *
 * POR QUE ISTO EXISTE (incidente de 11/ago/2026): trabalhei a sessão inteira a partir do
 * `main` (1.8.1) sem ver que o branch `native/v1-submit` tinha avançado 102 commits até
 * 1.8.9 — e que a 1.8.9 JÁ ESTAVA NO AR. Bumpei pra 1.8.3 e deployei por cima: saíram do
 * ar ~1.159 linhas, incluindo um arquivo inteiro (letzplay-placement-core.js) e a
 * integração da extensão com a Chrome Web Store. Ainda reusei o número 1.8.3, que já
 * existia com outro conteúdo.
 *
 * O QUE FALHOU: `version.txt`, `git status` e `git ls-remote origin main` batiam — todas
 * essas checagens enxergam só a PRÓPRIA linha. Nenhuma delas vê outro branch.
 *
 * A REGRA AQUI É SIMPLES E DURA: nenhum branch, worktree ou remoto pode ter uma versão
 * MAIOR que a que está prestes a subir. Se tiver, o deploy ABORTA — porque publicar por
 * cima de algo mais novo é regressão, não deploy.
 *
 * Vale também pro NATIVO (Android/iOS): pela regra do projeto loja e web andam com o MESMO
 * número ([[project_version_scheme_store_aligned]]), então versão nativa acima da web é o
 * sinal mais barato de que existe trabalho de web fora deste branch.
 *
 * Uso:  node scripts/check-version-ahead.js
 * Roda no `hosting.predeploy` (firebase.json) — ABORTA o deploy, não só avisa.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const git = (args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) { return ''; }
};

/** Compara versões "1.8.10" vs "1.8.9" numericamente, campo a campo. */
function cmp(a, b) {
  const pa = String(a || '0').split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

const minha = (fs.readFileSync(path.join(root, 'version.txt'), 'utf8') || '').trim();
if (!/^\d+\.\d+/.test(minha)) {
  console.error('✗ version.txt ilegível: ' + JSON.stringify(minha));
  process.exit(1);
}

// TODAS as refs: branches locais, remotos e o que cada worktree tem em HEAD.
const refs = [];
git(['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'])
  .split('\n').filter(Boolean).forEach((r) => refs.push(r));

const achados = [];
const vistos = {};
for (const ref of refs) {
  if (/\bHEAD$/.test(ref)) continue;                       // symbolic-ref, não é linha própria
  const v = git(['show', ref + ':version.txt']).trim();
  if (!v || !/^\d+\.\d+/.test(v)) continue;
  if (cmp(v, minha) > 0) {
    const sha = git(['rev-parse', '--short', ref]);
    // Só conta se a linha tem commit que o HEAD NÃO tem — branch idêntico não é "à frente".
    const aFrente = git(['rev-list', '--count', 'HEAD..' + ref]);
    if (parseInt(aFrente, 10) > 0) {
      const chave = sha + '|' + v;
      if (vistos[chave]) continue;
      vistos[chave] = true;
      achados.push({ ref, v, sha, commits: aFrente, assunto: git(['log', '-1', '--format=%s', ref]) });
    }
  }
}

// NATIVO: versão de loja acima da web é sinal de trabalho de web fora deste branch.
const nativos = [];
for (const rel of ['android/app/build.gradle', 'android/wear/build.gradle']) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) continue;
  const m = fs.readFileSync(p, 'utf8').match(/versionName\s+"([^"]+)"/);
  if (m && cmp(m[1], minha) > 0) nativos.push({ arquivo: rel, v: m[1] });
}
const pbx = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
if (fs.existsSync(pbx)) {
  const m = fs.readFileSync(pbx, 'utf8').match(/MARKETING_VERSION = ([0-9.]+)/);
  if (m && cmp(m[1], minha) > 0) nativos.push({ arquivo: 'ios (MARKETING_VERSION)', v: m[1] });
}

if (!achados.length && !nativos.length) {
  console.log('✓ nenhuma linha à frente — ' + minha + ' é a maior versão do repo');
  process.exit(0);
}

console.error('');
console.error('✗ DEPLOY ABORTADO — existe versão MAIS NOVA que a sua (' + minha + ').');
console.error('  Publicar por cima disso é REGRESSÃO: foi assim que 102 commits saíram do');
console.error('  ar em 11/ago/2026, incluindo um arquivo inteiro.');
console.error('');
achados.forEach((a) => {
  console.error('  • ' + a.ref + ' está em ' + a.v + '  (' + a.sha + ', ' + a.commits + ' commit(s) à frente)');
  console.error('      último: ' + a.assunto);
});
nativos.forEach((n) => {
  console.error('  • ' + n.arquivo + ' declara ' + n.v + ' — loja e web andam com o MESMO número,');
  console.error('      então a web "real" provavelmente está em ' + n.v + ' em outro branch.');
});
console.error('');
console.error('  O QUE FAZER: traga a linha à frente pra cá (merge/rebase), rode a suíte, e');
console.error('  escolha um número MAIOR que ' + (achados[0] ? achados[0].v : minha) + '.');
console.error('  Reusar um número que já existe cria duas coisas diferentes com o mesmo nome.');
console.error('');
process.exit(1);
