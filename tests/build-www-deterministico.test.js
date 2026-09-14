/* O `www/` que uma loja receberá não pode variar sem a fonte variar. A prova monta duas
 * vezes o pacote web e verifica tanto a estabilidade do manifesto quanto cada hash listado.
 * Não executa `cap sync`, não toca em iOS/Android e não produz submissão nativa. */
'use strict';
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const { verify } = require('../scripts/check-web-entry-contract');
const manifest = () => fs.readFileSync(path.join(WWW, '.scoreplace-build.json'), 'utf8');
const build = (mode) => execFileSync(process.execPath, ['tools/build-www.js'].concat(mode ? [mode] : []), { cwd: ROOT, stdio: 'pipe' });

console.log('──── build web reproduzível ────');
build();
const first = manifest();
build();
const second = manifest();
assert.equal(second, first, 'a mesma fonte precisa gerar o mesmo manifesto');
const parsed = JSON.parse(second);
assert.ok(parsed.schema === 1 && parsed.files.length > 100, 'manifesto lista os assets reais do pacote');
parsed.files.forEach((entry) => {
  const body = fs.readFileSync(path.join(WWW, entry.path));
  assert.equal(crypto.createHash('sha256').update(body).digest('hex'), entry.sha256,
    'hash divergente para ' + entry.path);
});
assert.ok(parsed.files.some((entry) => entry.path === 'js/domain/round-bounds.js'),
  'o domínio tipado entra no pacote web');
assert.ok(fs.existsSync(path.join(WWW, '.vite', 'manifest.json')), 'Vite registra o manifesto da saída');
assert.ok(verify(WWW, { log() {}, error(message) { throw new Error(message); } }),
  'o shell gerado pelo Vite mantém suas referências resolvíveis e ordenadas');
assert.ok(!fs.existsSync(path.join(WWW, 'version.txt')),
  'o pacote padrão continua sem version.txt para o auto-update nativo consultar a rede');
build('--hosting');
assert.ok(fs.existsSync(path.join(WWW, 'version.txt')) && fs.existsSync(path.join(WWW, 'native-update-policy.json')),
  'o artefato específico do Hosting inclui seus endpoints públicos de atualização');
execFileSync(process.execPath, ['scripts/check-hosting-artifact.js'], { cwd: ROOT, stdio: 'pipe' });
console.log('✅ ' + parsed.files.length + ' arquivos com hashes estáveis via Vite');
