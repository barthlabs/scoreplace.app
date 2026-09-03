/* O GATE DE VARIÁVEIS LIVRES — e a prova de que ele REPROVA
 * node tests/variaveis-livres-gate.test.js
 *
 * ⛔ DE ONDE ISTO VEIO. `exports.aplicarNoTorneio` chamava `db.collection(...)` e `db.batch()`
 * com `db` declarado em LUGAR NENHUM. Toda chamada morria em `ReferenceError: db is not
 * defined`, desde 97b10a48 (2.0.122). E havia teste: `porta-unica-de-escrita-fina.test.js`
 * lia o arquivo como TEXTO e casava com /db\.batch\(\)/ — casou, ficou verde por meses.
 * Casar com a LETRA de uma variável não prova que ela EXISTE.
 *
 * ⚠️ O QUE ESTA SUÍTE GUARDA NÃO É O BUG — É O RESOLVEDOR. `scripts/check-variaveis-livres.js`
 * está pendurado no predeploy das functions, então um FALSO POSITIVO dele bloqueia deploy.
 * Cada caso abaixo é uma forma de JavaScript que derruba um resolvedor ingênuo, com o
 * vermelho (deve acusar) ao lado do verde (não pode acusar).
 *
 * ⭐ E a prova final não é sintética: roda o script REAL contra o `functions/index.js` do
 * commit 97b10a48 e exige exit 1 apontando as linhas do `db`. Um gate que nunca foi visto
 * reprovando não é gate. [[feedback_measure_dont_declare_fixed]]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'scripts/check-variaveis-livres.js');
const { varrer, alvosPadrao } = require(GATE);

let falhas = 0;
const ok = (n, c, extra) => {
  if (c) console.log('  ✓ ' + n);
  else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; }
};

/** nomes livres de um trecho, como "nome@linha" — a forma que os casos comparam. */
const livresDe = (src) => varrer(src).livres.map((l) => l.nome + '@' + l.linha);
/** o trecho está limpo? */
const limpo = (src) => { const r = varrer(src); return !r.erro && r.livres.length === 0; };

console.log('──── o gate de variáveis livres ────');

/* ══ ① O BUG, reduzido ao osso ═════════════════════════════════════════════════════════ */
console.log('\n① o bug que deu origem a isto');

ok('⛔ acusa `db` livre — leitura que SEMPRE lança',
  livresDe([
    'const admin = require("firebase-admin");',
    'exports.aplicarNoTorneio = async () => {',
    '  const ref = db.collection("tournaments");',
    '  return ref;',
    '};',
  ].join('\n')).join(',') === 'db@3');

ok('⭐ e NÃO acusa quando o `db` local existe (o conserto)',
  limpo([
    'const admin = require("firebase-admin");',
    'exports.aplicarNoTorneio = async () => {',
    '  const db = admin.firestore();',
    '  return db.collection("tournaments");',
    '};',
  ].join('\n')));

ok('⛔ acusa o `db` do atalho de objeto — `{ db }` é LEITURA, não chave',
  livresDe('const carga = { db };').join(',') === 'db@1',
  'um resolvedor que trata `key` de Property como nome de campo perde esta forma inteira');

ok('⭐ mas `{ db: 1 }` é chave de verdade — não acusa',
  limpo('const carga = { db: 1 };'));

/* ══ ② As formas que derrubam um resolvedor ingênuo ════════════════════════════════════ */
console.log('\n② as formas que geram FALSO POSITIVO (e bloqueariam deploy)');

ok('⭐ destructuring de objeto declara os nomes',
  limpo('const { a, b: c, ...resto } = require("x"); console.log(a, c, resto);'));

ok('⭐ destructuring de array, com buraco',
  limpo('const [, segundo, ...cauda] = [1, 2, 3]; console.log(segundo, cauda);'));

ok('⭐ valor padrão de parâmetro enxerga o escopo de fora',
  limpo('const padrao = 1;\nfunction f(x = padrao) { return x; }\nf();'));

ok('⛔ …e valor padrão que NÃO existe é acusado (o outro lado da mesma moeda)',
  livresDe('function f(x = naoExiste) { return x; }').join(',') === 'naoExiste@1',
  'tratar o padrão inteiro como declaração perde esta leitura — era o furo do protótipo');

ok('⭐ parâmetro de catch é declaração',
  limpo('try { null; } catch (e) { console.log(e.message); }'));

ok('⭐ catch sem parâmetro não inventa nome',
  limpo('try { null; } catch { console.log("x"); }'));

ok('⭐ `var` sobe pro escopo da FUNÇÃO, atravessa o bloco',
  limpo('function f() { if (true) { var v = 1; } return v; }'));

ok('⭐ hoisting: usar na linha 1 o que se declara na linha 3',
  limpo('function a() { return b(); }\nfunction b() { return 1; }\na();'));

ok('⭐ `let` do `for` vive no `for`',
  limpo('for (let i = 0; i < 3; i++) { console.log(i); }'));

ok('⛔ …e NÃO vaza pra fora dele',
  livresDe('for (let i = 0; i < 3; i++) { console.log(i); }\nconsole.log(i);').join(',') === 'i@2');

ok('⭐ class: nome, herança, getter, setter e campo',
  limpo([
    'class Base {}',
    'class C extends Base { get v() { return 1; } set v(x) { this._v = x; } static s = 2; m() { return C; } }',
    'new C();',
  ].join('\n')));

ok('⭐ chave computada NÃO é nome de campo — mas o nome dentro dela resolve',
  limpo('const k = "a";\nconst o = { [k]: 1 };\nconsole.log(o[k]);'));

ok('⛔ …e se o nome da chave computada não existe, acusa',
  livresDe('const o = { [chaveSumida]: 1 };').join(',') === 'chaveSumida@1');

ok('⭐ FunctionExpression nomeada se enxerga por dentro',
  limpo('const f = function eu(n) { return n > 0 ? eu(n - 1) : 0; };\nf(3);'));

ok('⭐ `new.target` não é variável',
  limpo('function F() { return new.target; }\nnew F();'));

ok('⭐ label de `break`/`continue` não é variável',
  limpo('fora: for (let i = 0; i < 2; i++) { for (let j = 0; j < 2; j++) { if (j) continue fora; break fora; } }'));

ok('⭐ `switch` com `let` no case',
  limpo('const x = 1;\nswitch (x) { case 1: { let y = 2; console.log(y); break; } default: break; }'));

ok('⭐ `for…of` com destructuring',
  limpo('for (const [k, v] of Object.entries({})) { console.log(k, v); }'));

ok('⭐ arrow de expressão (sem bloco) tem escopo de função',
  limpo('const f = (a) => a + 1;\nf(1);'));

ok('⭐ `arguments` existe em função normal',
  limpo('function f() { return arguments.length; }\nf();'));

ok('⭐ `a.db` é campo, não variável livre',
  limpo('const a = { db: 1 };\nconsole.log(a.db);'));

ok('⭐ optional chaining não vira variável',
  limpo('const a = null;\nconsole.log(a?.db?.x);'));

/* ══ ③ A regra do `typeof` — e o seu limite ════════════════════════════════════════════ */
console.log('\n③ a regra do `typeof`: perdoa quem se declarou, não quem esqueceu');

ok('⭐ `typeof window !== "undefined" && window.X` passa (o idioma Node+navegador)',
  limpo('const API = {};\nif (typeof window !== "undefined") window.AmizadeAuthority = API;'),
  'é o caso REAL de functions/amizade-authority-core.js:465');

ok('⭐ `(typeof window !== "undefined" ? window : null)` passa',
  limpo('function h(w) { return w || (typeof window !== "undefined" ? window : null) || {}; }\nh();'),
  'é o caso REAL de functions-autodraw/tournament-summary-core.js:195');

ok('⛔ …mas SEM o `typeof` em lugar nenhum, `window` é acusado',
  livresDe('const API = {};\nwindow.AmizadeAuthority = API;').join(',') === 'window@2');

/* ⚠️ A regra do `typeof` só é defensável enquanto NÃO absolver o bug que a motivou.
 * Conferido no fonte, não por memória: se um dia aparecer um `typeof db`, este teste cai
 * e a regra tem de ser reavaliada antes de seguir. */
const alvosDoTypeof = ['functions/index.js', 'functions-autodraw/index.js'];
const comTypeofDb = alvosDoTypeof.filter((rel) => /typeof\s+db\b/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
ok('⭐⛔ a REGRA NÃO ABSOLVERIA O BUG: não existe `typeof db` na árvore',
  comTypeofDb.length === 0,
  'apareceu em: ' + comTypeofDb.join(', '));

/* ══ ③b ESM — o codebase do Stripe fala outro dialeto ══════════════════════════════════ */
console.log('\n③b ESM: `functions-stripe/` é module, os outros dois são CJS');

ok('⭐ `import` declara os nomes (default, nomeado com alias, namespace)',
  limpo('import Stripe, { A as B } from "stripe";\nimport * as ns from "x";\nconsole.log(Stripe, B, ns);'));

ok('⭐ `export const` / `export function` declaram',
  limpo('export const a = 1;\nexport function f() { return a; }\nf();'));

ok('⭐ `export { local }` referencia o nome local, e o alias não é variável',
  limpo('const local = 1;\nexport { local as publico };'));

/* ⚠️ `export { sumido }` sem `sumido` declarado nem CHEGA ao resolvedor: o próprio acorn
 * recusa em tempo de parse ("Export 'sumido' is not defined"). Reprova do mesmo jeito — pelo
 * ramo do erro de parse, que também sai 1 —, e é isso que este caso carimba. */
ok('⛔ …e `export { sumido }` reprova (o parser pega antes do resolvedor)',
  /não parseia/.test(varrer('export { sumido };').erro || ''),
  'erro=' + varrer('export { sumido };').erro);

ok('⛔ ESM acusa o `db` livre igual ao CJS',
  livresDe('import admin from "firebase-admin";\nexport const f = () => db.collection("t");').join(',') === 'db@2');

ok('⭐ `import.meta` não é variável',
  limpo('export const u = import.meta.url;'));

/* ══ ④ Leitura × escrita ═══════════════════════════════════════════════════════════════ */
console.log('\n④ leitura × escrita: o conserto é diferente');

ok('⛔ leitura livre é classificada como leitura',
  varrer('console.log(sumido);').livres[0].tipo === 'leitura');

ok('⛔ escrita em nome não declarado é global implícito',
  varrer('vazando = 1;').livres[0].tipo === 'escrita');

ok('⛔ `x++` em nome não declarado também',
  varrer('contador++;').livres[0].tipo === 'escrita');

/* ══ ⑤ Arquivo que não parseia é REPROVA, não silêncio ═════════════════════════════════ */
console.log('\n⑤ o que o gate faz com o que não entende');

ok('⛔ arquivo que não parseia vira erro (não passa calado)',
  /não parseia/.test(varrer('function {{{').erro || ''),
  'silenciar um parse error transformaria o gate em decoração');

/* ══ ⑥ O SCRIPT REAL, ponta a ponta ════════════════════════════════════════════════════ */
console.log('\n⑥ o script REAL: verde hoje, vermelho no commit do bug');

const alvos = alvosPadrao();
ok('⭐ a lista de alvos cobre o index.js dos TRÊS codebases do servidor',
  alvos.includes('functions/index.js') && alvos.includes('functions-autodraw/index.js') &&
  alvos.includes('functions-stripe/index.js'),
  'alvos=' + alvos.length + ' · ' + alvos.filter((a) => a.endsWith('/index.js')).join(', '));

const verde = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: 'utf8' });
ok('⭐ hoje ele sai 0 na árvore inteira',
  verde.status === 0,
  'status=' + verde.status + '\n      ' + String(verde.stdout || '').trim() + String(verde.stderr || '').trim());

/* O commit do bug, trazido do git — controle VERMELHO. Sem git (deploy roda de uma extração
 * `git archive` sem `.git`), a prova é feita com um arquivo plantado, que não depende de nada. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'varlivres-'));
let temGit = false;
try { execFileSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, stdio: 'ignore' }); temGit = true; } catch (_) {}

if (temGit) {
  const alvo = path.join(tmp, 'index-97b10a48.js');
  try {
    fs.writeFileSync(alvo, execFileSync('git', ['show', '97b10a48:functions/index.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    const r = spawnSync(process.execPath, [GATE, alvo], { cwd: ROOT, encoding: 'utf8' });
    const saida = String(r.stdout || '') + String(r.stderr || '');
    ok('⛔ o index.js de 97b10a48 REPROVA com exit 1', r.status === 1, 'status=' + r.status);
    ok('⛔ …apontando `db` nas linhas 2964 e 2985 (o `db.collection` e o `db.batch`)',
      /:2964:\d+\s+db\b/.test(saida) && /:2985:\d+\s+db\b/.test(saida),
      saida.split('\n').filter((l) => /\bdb\b/.test(l)).join('\n      '));
    ok('⛔ …e diz que é ReferenceError, não vazamento', /db\s+— leitura/.test(saida));
  } catch (e) {
    ok('⛔ o index.js de 97b10a48 REPROVA', false, 'não consegui trazer o commit: ' + e.message);
  }
} else {
  console.log('  · sem `.git` aqui — a prova do commit 97b10a48 é pulada (o plantado abaixo cobre)');
}

/* A mesma prova, sem depender do git: um arquivo plantado com a forma exata do bug. */
const plantado = path.join(tmp, 'plantado.js');
fs.writeFileSync(plantado, [
  '"use strict";',
  'const admin = require("firebase-admin");',
  'exports.aplicarNoTorneio = async (request) => {',
  '  const docRef = db.collection("tournaments").doc(request.id);',
  '  return docRef.get();',
  '};',
].join('\n'));
const rp = spawnSync(process.execPath, [GATE, plantado], { cwd: ROOT, encoding: 'utf8' });
const saidaP = String(rp.stdout || '') + String(rp.stderr || '');
ok('⛔ arquivo plantado com a forma do bug: exit 1 na linha 4',
  rp.status === 1 && /:4:\d+\s+db\b/.test(saidaP),
  'status=' + rp.status + '\n      ' + saidaP.trim());

fs.rmSync(tmp, { recursive: true, force: true });

console.log(falhas === 0 ? '\n✅ variaveis-livres-gate: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
