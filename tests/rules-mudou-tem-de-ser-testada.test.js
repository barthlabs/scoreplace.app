'use strict';
/* ⛔ SUÍTE QUE NÃO RODA APODRECE — e a de REGRAS não rodava.
 *
 * MEDIDO em 13/set/2026: das 9 suítes de `npm run test:rules`, **4 estavam VERMELHAS**, e
 * havia tempo. Ninguém viu porque elas sobem 10 emuladores (~7 min) e por isso ficam FORA do
 * `npm test`. As quatro quebraram quando a regra de `create` passou a exigir `_nascidoEm`
 * (leva L7) e ficaram assim, guardando NADA — que é pior do que não existir, porque a gente
 * acha que está coberto.
 *
 * ⛔ E PÔR AS 10 NO `npm test` SERIA PIOR: +7 min em CADA rodada, numa publicação que o dono
 * já chama de burocracia. A trava certa não é rodar sempre — é não deixar a REGRA mudar sem
 * que alguém tenha rodado.
 *
 * ⭐ O carimbo é o SHA do `firestore.rules`, gravado por `test:rules` quando ela passa, e
 * VERSIONADO: quem publica pode não ser quem rodou, e o que importa é que alguém rodou
 * NESTAS regras.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

console.log('\n──── regra que muda tem de ser testada ────\n');

const sha = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(raiz, 'firestore.rules'))).digest('hex').slice(0, 16);

// ── ① o carimbo bate com as regras de hoje ─────────────────────────────────
const carimbo = fs.readFileSync(path.join(raiz, '.rules-testadas'), 'utf8').trim();
must(carimbo === sha,
  '① ⭐ o carimbo (' + carimbo + ') é o SHA das regras de hoje (' + sha + ')');

// ── ② e a trava reprova quando NÃO bate ────────────────────────────────────
// ⛔ CONTROLE: sem isto o portão diria "está tudo bem" para sempre.
const orig = fs.readFileSync(path.join(raiz, '.rules-testadas'), 'utf8');
let saiu = 0;
try {
  fs.writeFileSync(path.join(raiz, '.rules-testadas'), 'deadbeefdeadbeef\n');
  execFileSync(process.execPath, [path.join(raiz, 'scripts/check-rules-testadas.js')],
    { cwd: raiz, stdio: 'pipe' });
} catch (e) { saiu = e.status || 1; }
finally { fs.writeFileSync(path.join(raiz, '.rules-testadas'), orig); }
must(saiu !== 0, '② ⭐ com o carimbo errado, a trava REPROVA (saiu ' + saiu + ')');
must(fs.readFileSync(path.join(raiz, '.rules-testadas'), 'utf8') === orig,
  '② e o controle devolveu o carimbo como estava');

// ── ③ a trava está pendurada no `npm test`, ANTES dos outros gates ─────────
const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
must(/check-rules-testadas\.js(?! --carimbar)/.test(pkg.scripts.test),
  '③ ⭐ `npm test` confere o carimbo — é o que impede a suíte de apodrecer de novo');
must(/check-rules-testadas\.js --carimbar/.test(pkg.scripts['test:rules']),
  '③ e `test:rules` carimba quando passa');
must(pkg.scripts.test.indexOf('check-rules-testadas') < pkg.scripts.test.indexOf('run-unit'),
  '③ a conferência vem ANTES das 795 suítes — falhar em milissegundos, não em 4 minutos');

// ── ④ o carimbo é VERSIONADO ───────────────────────────────────────────────
let ignorado = false;
try {
  execFileSync('git', ['check-ignore', '-q', '.rules-testadas'], { cwd: raiz, stdio: 'ignore' });
  ignorado = true;
} catch (e) { ignorado = false; }
must(!ignorado,
  '④ ⭐ `.rules-testadas` é versionado — quem publica pode não ser quem rodou a suíte');

// ── ⑤ e TODAS as suítes de regras estão no comando ─────────────────────────
/* ⚠️ TODA suíte `rules-*` tem de estar em ALGUM comando — e há dois lugares legítimos:
 * `test:rules` (as que sobem emulador) e `run-unit` (as que não sobem, como esta). O que
 * não pode é uma existir e não rodar em lugar nenhum, que é como as 4 apodreceram. */
const runUnit = fs.readFileSync(path.join(raiz, 'tests/run-unit.js'), 'utf8');
const arquivos = fs.readdirSync(path.join(raiz, 'tests'))
  .filter((f) => /^rules-.*\.test\.js$/.test(f));
const orfas = arquivos.filter((f) =>
  pkg.scripts['test:rules'].indexOf(f) === -1 && runUnit.indexOf(f) === -1);
must(orfas.length === 0,
  '⑤ ⛔ nenhuma suíte de regras fica órfã de comando (órfãs: ' + orfas.join(', ') + ')');
must(arquivos.length >= 13,
  '⑤ são ' + arquivos.length + ' suítes de regras, todas com onde rodar');

console.log('\n✅ ' + ok + ' verificações');
