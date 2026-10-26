'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-release-version-'));
const run = (args) => execFileSync('git', args, { cwd: lab, stdio: 'ignore' });
try {
  run(['init']); run(['config', 'user.email', 'test@scoreplace.app']); run(['config', 'user.name', 'Scoreplace test']);
  fs.writeFileSync(path.join(lab, 'version.txt'), '2.2.34\n');
  fs.mkdirSync(path.join(lab, 'js'));
  fs.writeFileSync(path.join(lab, 'js', 'app.js'), 'base\n');
  run(['add', '.']); run(['commit', '-m', 'base']); run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  fs.writeFileSync(path.join(lab, 'js', 'app.js'), 'new code\n'); run(['add', '.']); run(['commit', '-m', 'new code without version']);
  const gate = path.join(root, 'scripts/check-release-version-fresh.js');
  const worktree = spawnSync(process.execPath, [gate], { env: { ...process.env, SP_RELEASE_ROOT: lab }, encoding: 'utf8' });
  if (worktree.status !== 0 || !/aguardam o corte no Hosting/.test(worktree.stdout)) throw new Error('gate não aceitou trabalho acumulado antes do corte');
  fs.writeFileSync(path.join(lab, 'version.txt'), '2.2.35\n'); run(['add', '.']); run(['commit', '-m', 'release']);
  const stillRed = spawnSync(process.execPath, [gate], { env: { ...process.env, SP_RELEASE_ROOT: lab, SP_RELEASE_PRODUCTION_VERSION: '2.2.35' }, encoding: 'utf8' });
  if (stillRed.status === 0) throw new Error('gate aceitou repetir a versão que já está em produção');
  fs.writeFileSync(path.join(lab, 'version.txt'), '2.2.36\n'); run(['add', '.']); run(['commit', '-m', 'next release']);
  const green = spawnSync(process.execPath, [gate], { env: { ...process.env, SP_RELEASE_ROOT: lab, SP_RELEASE_PRODUCTION_VERSION: '2.2.35' }, encoding: 'utf8' });
  if (green.status !== 0) throw new Error('gate recusou versão incrementada: ' + green.stderr);
  // O deploy empurra o commit antes de montar a cópia. Nesse ponto origin/main é o
  // próprio HEAD, mas produção ainda serve a versão anterior; a comparação deve ser
  // com a produção, não bloquear pela igualdade inevitável com o backup recém-atualizado.
  run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  const afterPush = spawnSync(process.execPath, [gate], { env: { ...process.env, SP_RELEASE_ROOT: lab, SP_RELEASE_PRODUCTION_VERSION: '2.2.35' }, encoding: 'utf8' });
  if (afterPush.status !== 0) throw new Error('gate bloqueou release nova após atualizar origin/main: ' + afterPush.stderr);
  fs.mkdirSync(path.join(lab, 'docs'));
  fs.writeFileSync(path.join(lab, 'docs', 'AUDITORIA.md'), 'registro de publicação\n');
  run(['add', '.']); run(['commit', '-m', 'docs only']);
  const docsOnly = spawnSync(process.execPath, [gate], { env: { ...process.env, SP_RELEASE_ROOT: lab }, encoding: 'utf8' });
  if (docsOnly.status !== 0 || !/shell preservada/.test(docsOnly.stdout)) throw new Error('gate exigiu versão nova para documentação: ' + docsOnly.stderr);
  // A trava anti-regressão não pode confundir uma linha de teste sem artefato
  // publicável com uma versão pronta para substituir o Hosting.
  fs.mkdirSync(path.join(lab, 'scripts'));
  const versionAhead = path.join(lab, 'scripts/check-version-ahead.js');
  fs.copyFileSync(path.join(root, 'scripts/check-version-ahead.js'), versionAhead);
  const originalBranch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: lab, encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(lab, 'index.html'), '<!doctype html><title>Scoreplace</title>\n');
  fs.writeFileSync(path.join(lab, 'firebase.json'), '{"hosting":{"public":"."}}\n');
  run(['add', '.']); run(['commit', '-m', 'deployable baseline']);
  run(['checkout', '-b', 'test-marker']);
  run(['rm', 'index.html', 'firebase.json']);
  fs.writeFileSync(path.join(lab, 'version.txt'), '9.9.9\n');
  run(['add', '.']); run(['commit', '-m', 'test marker only']);
  run(['checkout', originalBranch]);
  const marker = spawnSync(process.execPath, [versionAhead], { cwd: lab, encoding: 'utf8' });
  if (marker.status !== 0) throw new Error('marcador sem app bloqueou release: ' + marker.stderr);
  run(['checkout', '-b', 'future-release']);
  fs.writeFileSync(path.join(lab, 'version.txt'), '2.2.37\n');
  run(['add', '.']); run(['commit', '-m', 'future deployable release']);
  run(['checkout', originalBranch]);
  const future = spawnSync(process.execPath, [versionAhead], { cwd: lab, encoding: 'utf8' });
  if (future.status === 0 || !/future-release/.test(future.stderr)) throw new Error('linha publicável mais nova deixou de bloquear release');
  const deploy = fs.readFileSync(path.join(root, 'scripts/deploy-hosting.sh'), 'utf8');
  const reviewer = fs.readFileSync(path.join(root, 'scripts/revisar.sh'), 'utf8');
  if (!/check-release-version-fresh\.js/.test(deploy)) throw new Error('deploy não chama a trava de versão fresca');
  if (!/Código novo com a mesma/.test(reviewer) || /`version\.txt`/.test(reviewer)) throw new Error('Claude não recebeu literalmente a regra de revisão da versão');
  console.log('✓ release-version-fresh: bloqueia release com chave de cache repetida');
} finally { fs.rmSync(lab, { recursive: true, force: true }); }
