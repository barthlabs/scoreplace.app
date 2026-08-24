/* A TRAVA DE CACHE-BUSTER NÃO PODE FICAR VAZIA — E TEM QUE SER CHAMADA
 *
 * INCIDENTE (24/ago/2026): publiquei um conserto em `js/views/dashboard.js` e ele foi pro ar
 * servido como `?v=2.0.39` — a URL ANTIGA. O arquivo novo estava no ar, mas quem já tinha a
 * cópia velha em cache continuava com ela. Deploy fantasma.
 *
 * DUAS CAUSAS SOMADAS:
 *   1. `scripts/check-cache-busters.js` existe desde jul/2026 e NINGUÉM o chamava — não estava
 *      no `npm test`, nem no `hosting.predeploy`, nem no hook. Só em `npm run check:cache`.
 *   2. E, mesmo chamado no deploy, ele sairia VERDE sem conferir nada: `deploy-hosting.sh`
 *      empurra pro `main` ANTES de publicar, então naquele instante
 *      `merge-base HEAD origin/main === HEAD` e o diff é vazio. Trava vazia é pior que trava
 *      nenhuma: ela ASSINA que conferiu.
 *
 * Este teste cobra as duas coisas, mais as duas bordas da régua nova (as duas eu errei ao
 * escrevê-la, e as duas foram medidas no repo de verdade).
 */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'check-cache-busters.js'), 'utf8');
const hook = fs.readFileSync(path.join(ROOT, 'scripts', 'hooks', 'pre-push'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
console.log('──── a trava de cache-buster não fica vazia ────');

// ── 1. ela É CHAMADA por quem publica ────────────────────────────────────────────────
ok(/node scripts\/check-cache-busters\.js/.test(hook),
  'o pre-push chama a trava (é o único ponto onde ela pega: no predeploy o push já aconteceu)');
// compara com a CHAMADA da suíte (`! npm test >"$LOG"`), não com as menções no cabeçalho
ok(hook.indexOf('node scripts/check-cache-busters.js') < hook.indexOf('! npm test >'),
  '  → e antes da suíte de 2min30 (a trava é um git diff, custa nada)');
ok(/barra "cache-buster desatualizado/.test(hook), '  → e BARRA o push, não só avisa');

// ── 2. a régua não fica vazia quando não há nada à frente do main ────────────────────
ok(/if \(base === head\)/.test(src),
  'quando não há nada à frente do main, a base muda (senão o diff é vazio)');
ok(/git log -3 --format=%H -- version\.txt/.test(src),
  '  → a base vira o release ANTERIOR, achado pelo version.txt');
ok(/rels\.filter\(\(h\) => h !== head\)\[0\]/.test(src),
  '  → descartando o próprio HEAD (no release normal é ele que carimba o version.txt)');
ok(!/rev-parse ' \+ rel \+ '\^'/.test(src),
  '  → e NÃO o pai dele: isso varre a leva anterior junto e acusa quem já está certo');

// ── 3. o comportamento, no repo de verdade ──────────────────────────────────────────
// Roda a trava como o pre-push roda. Verde agora (o index está bumpado); e vermelha quando o
// buster de um js ALTERADO é rebaixado — que é exatamente o incidente.
const idx = path.join(ROOT, 'index.html');
const original = fs.readFileSync(idx, 'utf8');
const rodar = () => { try { execSync('node scripts/check-cache-busters.js', { cwd: ROOT, stdio: 'pipe' }); return 0; } catch (e) { return e.status || 1; } };
try {
  ok(rodar() === 0, 'no estado atual do repo a trava passa');
  const alvo = (original.match(/js\/views\/[a-z-]+\.js\?v=[0-9.]+/g) || [])[0];
  const mudados = execSync('node -e "' +
    'const {execSync}=require(\'child_process\');' +
    'const h=execSync(\'git rev-parse HEAD\').toString().trim();' +
    'const r=execSync(\'git log -3 --format=%H -- version.txt\').toString().split(\'\\n\').map(s=>s.trim()).filter(Boolean).filter(x=>x!==h)[0];' +
    'process.stdout.write(execSync(\'git diff --name-only \'+r+\' -- js/\').toString())"',
    { cwd: ROOT }).toString().split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.js'));
  ok(mudados.length > 0, '  → e ela vê ' + mudados.length + ' js alterado(s) nesta leva (não zero — trava vazia)');
  const um = mudados.map((f) => new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=[0-9.]+'))
    .map((re) => (original.match(re) || [])[0]).filter(Boolean)[0];
  if (um) {
    fs.writeFileSync(idx, original.replace(um, um.replace(/\?v=[0-9.]+/, '?v=0.0.1')));
    ok(rodar() === 1, '  → e REPROVA quando um js alterado fica com o ?v= velho (o incidente)');
  } else { ok(false, 'não achei no index.html o ?v= de um js alterado'); }
} finally {
  fs.writeFileSync(idx, original);
}
ok(fs.readFileSync(idx, 'utf8') === original, 'o teste devolveu o index.html como estava');

console.log(fail === 0
  ? '\n✅ trava-de-cache-buster-nao-fica-vazia: OK (' + pass + ')'
  : '\n❌ trava-de-cache-buster-nao-fica-vazia: ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
