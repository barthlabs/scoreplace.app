/* O bundle EMBARCADO nunca sai de uma leva anterior.
 *
 * Falha real (19/ago/2026): scripts/ios-archive.sh e scripts/android-release.sh
 * chamavam `npx --no-install cap sync <plat>` — a metade que só COPIA o www/ que já
 * existir. Quem MONTA o www/ é o tools/build-www.js, dentro do `npm run cap:sync`.
 * E o fallback engolia a falha: `|| echo "seguindo com o www já presente"`.
 * Medido no dia: o www/ nem existia e o embarcado estava sem o toggle .pf-switch da
 * 1.9.69 — um archive ali teria mandado o "ovo" pro TestFlight pela SEGUNDA vez.
 * Nada denunciava: os embarcados são gerados/gitignored, `git status` fica limpo.
 *
 * Este teste RODA a trava de verdade contra árvores de mentira, e cobra que os dois
 * scripts de release a chamem — a duplicação foi a causa, então ela é o alvo.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'scripts', 'check-embedded-www.sh');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        passed++;
        console.log('  ✅ ' + testName);
    } else {
        failed++;
        console.log('  ❌ ' + testName);
    }
}

const PATHS = {
    ios: 'ios/App/App/public/js/store.js',
    android: 'android/app/src/main/assets/public/js/store.js'
};

/* Monta uma árvore de mentira: version.txt na raiz + (opcionalmente) o store.js
 * embarcado. `embeddedVersion === null` = www/ não montado, o caso do incidente. */
function fakeTree(plat, repoVersion, embeddedVersion) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-embarcado-'));
    fs.writeFileSync(path.join(dir, 'version.txt'), repoVersion + '\n');
    if (embeddedVersion !== null) {
        const store = path.join(dir, PATHS[plat]);
        fs.mkdirSync(path.dirname(store), { recursive: true });
        fs.writeFileSync(store, "window.SCOREPLACE_VERSION = '" + embeddedVersion + "';\n");
    }
    return dir;
}

function runGate(plat, dir) {
    return spawnSync('bash', [GATE, plat, dir], { encoding: 'utf8' });
}

// ─── o caminho feliz ───
console.log('\n📋 embarcado em dia');
['ios', 'android'].forEach(function (plat) {
    const r = runGate(plat, fakeTree(plat, '1.9.70', '1.9.70'));
    assert(r.status === 0, plat + ': embarcado igual ao version.txt passa');
    assert(/1\.9\.70/.test(r.stdout), plat + ': diz qual versão conferiu');
});

// ─── a falha que aconteceu de verdade ───
console.log('\n📋 embarcado VELHO — o "ovo" indo pro TestFlight pela 2a vez');
['ios', 'android'].forEach(function (plat) {
    const r = runGate(plat, fakeTree(plat, '1.9.70', '1.9.68'));
    assert(r.status !== 0, plat + ': bundle de leva anterior ABORTA (não avisa e segue)');
    assert(/1\.9\.68/.test(r.stderr) && /1\.9\.70/.test(r.stderr),
        plat + ': o erro mostra as DUAS versões, senão não dá pra agir');
});

console.log('\n📋 www/ não montado — o estado exato de 19/ago');
['ios', 'android'].forEach(function (plat) {
    const r = runGate(plat, fakeTree(plat, '1.9.70', null));
    assert(r.status !== 0, plat + ': embarcado AUSENTE aborta');
    assert(/cap:sync/.test(r.stderr), plat + ': o erro diz o comando que conserta');
});

console.log('\n📋 bundle ilegível / raiz sem versão');
{
    const dir = fakeTree('ios', '1.9.70', '1.9.70');
    fs.writeFileSync(path.join(dir, PATHS.ios), 'window.ALGO_OUTRO = 1;\n');
    assert(runGate('ios', dir).status !== 0, 'store.js sem SCOREPLACE_VERSION aborta');
}
assert(runGate('ios', fakeTree('ios', '', '1.9.70')).status !== 0,
    'version.txt vazio na raiz aborta (não compara contra string vazia)');
assert(spawnSync('bash', [GATE, 'nintendo'], { encoding: 'utf8' }).status !== 0,
    'plataforma desconhecida aborta');

// ─── a duplicação foi a causa: os dois scripts têm que CHAMAR a trava ───
console.log('\n📋 os dois scripts de release usam a MESMA trava');
[['scripts/ios-archive.sh', 'ios'], ['scripts/android-release.sh', 'android']].forEach(function (pair) {
    const raw = fs.readFileSync(path.join(ROOT, pair[0]), 'utf8');
    // Só linhas EXECUTÁVEIS: os comentários desses scripts citam o `npx cap sync` puro
    // de propósito, pra explicar o incidente. Cobrar o texto cru proibiria documentar.
    const src = raw.split('\n').filter(function (l) { return !/^\s*#/.test(l); }).join('\n');
    assert(new RegExp('check-embedded-www\\.sh"? ' + pair[1]).test(src),
        pair[0] + ': chama check-embedded-www.sh');
    assert(/npm run cap:sync/.test(src), pair[0] + ': monta o www/ com npm run cap:sync');
    assert(!/npx\s+(--no-install\s+)?cap\s+sync/.test(src),
        pair[0] + ': NÃO usa o `npx cap sync` puro (só copia, não monta)');
    assert(!/seguindo com o www já presente/.test(src),
        pair[0] + ': sem o fallback que engolia a falha');
});

console.log('\n' + '─'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('─'.repeat(40));
process.exit(failed > 0 ? 1 : 0);
