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
  fs.writeFileSync(path.join(lab, 'app.js'), 'base\n');
  run(['add', '.']); run(['commit', '-m', 'base']); run(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  fs.writeFileSync(path.join(lab, 'app.js'), 'new code\n'); run(['add', '.']); run(['commit', '-m', 'new code without version']);
  const gate = path.join(root, 'scripts/check-release-version-fresh.js');
  const red = spawnSync(process.execPath, [gate], { env: { ...process.env, SP_RELEASE_ROOT: lab }, encoding: 'utf8' });
  if (red.status === 0 || !/RELEASE BLOQUEADO/.test(red.stderr)) throw new Error('gate aceitou código novo com versão repetida');
  fs.writeFileSync(path.join(lab, 'version.txt'), '2.2.35\n'); run(['add', '.']); run(['commit', '-m', 'release']);
  const stillRed = spawnSync(process.execPath, [gate], { env: { ...process.env, SP_RELEASE_ROOT: lab, SP_RELEASE_PRODUCTION_VERSION: '2.2.35' }, encoding: 'utf8' });
  if (stillRed.status === 0) throw new Error('gate aceitou repetir a versão que já está em produção');
  fs.writeFileSync(path.join(lab, 'version.txt'), '2.2.36\n'); run(['add', '.']); run(['commit', '-m', 'next release']);
  const green = spawnSync(process.execPath, [gate], { env: { ...process.env, SP_RELEASE_ROOT: lab, SP_RELEASE_PRODUCTION_VERSION: '2.2.35' }, encoding: 'utf8' });
  if (green.status !== 0) throw new Error('gate recusou versão incrementada: ' + green.stderr);
  const deploy = fs.readFileSync(path.join(root, 'scripts/deploy-hosting.sh'), 'utf8');
  const reviewer = fs.readFileSync(path.join(root, 'scripts/revisar.sh'), 'utf8');
  if (!/check-release-version-fresh\.js/.test(deploy)) throw new Error('deploy não chama a trava de versão fresca');
  if (!/Código novo com a mesma/.test(reviewer) || /`version\.txt`/.test(reviewer)) throw new Error('Claude não recebeu literalmente a regra de revisão da versão');
  console.log('✓ release-version-fresh: bloqueia release com chave de cache repetida');
} finally { fs.rmSync(lab, { recursive: true, force: true }); }
