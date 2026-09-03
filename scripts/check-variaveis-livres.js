#!/usr/bin/env node
/* check-variaveis-livres.js — TRAVA: nenhuma referência a nome que não existe em escopo nenhum.
 *
 * ⛔ O QUE ISTO IMPEDE, medido de verdade. `exports.aplicarNoTorneio` (functions/index.js)
 * chamava `db.collection(...)` e `db.batch()` sem que `db` fosse declarado em NENHUM escopo
 * — nem local, nem de módulo, nem global. Toda chamada morria em
 * `ReferenceError: db is not defined`, desde o commit 97b10a48 (2.0.122). A porta única de
 * escrita da CF ficou MORTA por meses e ninguém viu.
 *
 * ⚠️ E HAVIA TESTE. `tests/porta-unica-de-escrita-fina.test.js` lia o index.js como TEXTO e
 * casava com /db\.batch\(\)/. Casou. Ficou VERDE o tempo todo — porque casar com o TEXTO de
 * uma variável não prova que ela EXISTE. Um grep vê a letra `db`; só o resolvedor de escopo
 * sabe se aquele `db` resolve em algum lugar. É essa a diferença que este gate carimba.
 *
 * ⭐ COMO FUNCIONA (resolução de escopo por AST, sem heurística de texto):
 *   1. `acorn` parseia o arquivo.
 *   2. Uma passada monta a árvore de ESCOPOS — função, bloco, catch, class expression.
 *      `var` sobe pro escopo de função; `let`/`const`/`class` ficam no bloco; parâmetros e o
 *      `id` de uma FunctionExpression contam como declaração no escopo da própria função.
 *   3. Na MESMA passada, cada Identifier que é REFERÊNCIA (não chave de propriedade, não
 *      nome sendo declarado, não label) é anotado junto do escopo em que apareceu.
 *   4. Só DEPOIS de a árvore inteira estar montada é que se resolve — é isso que faz o
 *      hoisting funcionar: quem é usado na linha 10 e declarado na 900 resolve.
 *   Sai 1 e lista `arquivo:linha` de cada nome que não resolveu.
 *
 * ⚠️ POR QUE O RESOLVEDOR NÃO PODE SER INGÊNUO. Um falso positivo aqui BLOQUEIA DEPLOY.
 * Os casos que derrubam um resolvedor ingênuo estão todos cobertos em
 * `tests/variaveis-livres-gate.test.js`, com o vermelho ao lado do verde:
 *   • destructuring (`const {a, [k]: b} = o`) — `a`/`b` declaram, `k` REFERENCIA;
 *   • valor padrão (`function f(x = y)`) — `y` REFERENCIA o escopo de fora;
 *   • atalho de objeto (`{ db }`) — REFERENCIA, e é uma das formas do próprio bug;
 *   • parâmetro de catch, `var` içado, class/getter/setter, chave computada, `new.target`.
 *
 * ⚠️ A REGRA DO `typeof`. `if (typeof window !== 'undefined') window.X = API` é o idioma de
 * quem escreve pro Node E pro navegador — e é LEGÍTIMO: `typeof` num nome inexistente não
 * lança. Então um nome que o arquivo checa com `typeof` em algum ponto é tratado como
 * ambiente-declarado NAQUELE arquivo: o autor já disse, por escrito, "isto pode não existir".
 * ⭐ Isso NÃO teria absolvido o bug do `db`: `typeof db` não aparece em lugar nenhum da
 * árvore (conferido). A regra perdoa quem se declarou; não perdoa quem esqueceu.
 *
 * ⚠️ LEITURA vs ESCRITA. Ler um nome livre (`db.batch()`) SEMPRE lança — é a classe do bug.
 * Escrever (`X = 1`) em modo solto cria um global e não lança, mas é vazamento: as duas
 * reprovam, e o relatório diz qual é qual, porque o conserto é diferente.
 *
 * Uso:  node scripts/check-variaveis-livres.js            (alvos padrão)
 *       node scripts/check-variaveis-livres.js <arquivo…> (avulso, pra investigar)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const RAIZ = path.join(__dirname, '..');

/* ── Alvos: o código que roda no SERVIDOR, onde um ReferenceError é 500 em produção ──
 * Os TRÊS codebases (`scripts/deploy-functions.sh main|autodraw|stripe`), porque o risco é o
 * mesmo nos três — e o do Stripe mexe com pagamento. Só o nível de cima de cada pasta:
 * `node_modules` e `vendor` são código de terceiro, que não é nosso pra consertar. */
const PASTAS_ALVO = ['functions', 'functions-autodraw', 'functions-stripe'];

/* Globais do Node/JS que existem sem ninguém declarar. */
const GLOBAIS = new Set([
  'require', 'module', 'exports', '__dirname', '__filename', 'process', 'console', 'Buffer',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'global', 'globalThis', 'JSON', 'Math', 'Date', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'EvalError',
  'ReferenceError', 'URIError', 'AggregateError', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'WeakRef', 'FinalizationRegistry', 'Symbol', 'Proxy', 'Reflect', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'escape', 'unescape', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'fetch',
  'Headers', 'Request', 'Response', 'FormData', 'Blob', 'File', 'AbortController', 'AbortSignal',
  'Event', 'EventTarget', 'MessageChannel', 'MessagePort', 'BroadcastChannel',
  'structuredClone', 'queueMicrotask', 'Intl', 'BigInt', 'undefined', 'NaN', 'Infinity',
  'arguments', 'crypto', 'performance', 'atob', 'btoa', 'Function', 'ArrayBuffer',
  'SharedArrayBuffer', 'DataView', 'Atomics', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
  'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array',
  'BigInt64Array', 'BigUint64Array', 'Generator', 'GeneratorFunction', 'ReadableStream',
  'WritableStream', 'TransformStream', 'CompressionStream', 'DecompressionStream',
]);

/* ══ O resolvedor ══════════════════════════════════════════════════════════════════════ */

function novoEscopo(pai, tipo) { return { pai, tipo, decls: new Set() }; }
function ehFuncao(n) {
  return n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' ||
         n.type === 'ArrowFunctionExpression';
}
/* `var` não conhece bloco: sobe até a função (ou o módulo) mais próxima. */
function escopoDeFuncao(e) { let c = e; while (c.tipo === 'bloco') c = c.pai; return c; }

/** Varre UM fonte e devolve as referências que não resolvem em escopo nenhum.
 *  @returns {{livres: Array<{nome,linha,coluna,tipo}>, erro: string|null}} */
function varrer(src) {
  /* Os três codebases não falam o mesmo dialeto: `functions/` e `functions-autodraw/` são
   * CJS, `functions-stripe/` é ESM (`export const`). Tenta script e cai pra module — o erro
   * que sai é o do script, que é o caso comum, a não ser que o module também recuse. */
  let ast;
  try {
    ast = acorn.parse(src, {
      ecmaVersion: 2023, sourceType: 'script', locations: true,
      allowReturnOutsideFunction: true, allowHashBang: true, allowAwaitOutsideFunction: true,
    });
  } catch (eScript) {
    try {
      ast = acorn.parse(src, {
        ecmaVersion: 2023, sourceType: 'module', locations: true, allowHashBang: true,
      });
    } catch (eModule) {
      return { livres: [], erro: 'não parseia: ' + eScript.message + ' (como módulo: ' + eModule.message + ')' };
    }
  }

  const raiz = novoEscopo(null, 'modulo');
  const refs = [];                 // {nome, linha, coluna, tipo:'leitura'|'escrita', escopo}
  const nomesTypeof = new Set();   // nomes que o arquivo checa com `typeof` (ver cabeçalho)

  const anota = (no, escopo, tipo) => refs.push({
    nome: no.name, linha: no.loc.start.line, coluna: no.loc.start.column + 1, tipo, escopo,
  });

  /* Um PADRÃO tem duas naturezas misturadas: nomes que ele LIGA e expressões que ele LÊ.
   * `const {[k]: v = padrao} = o` liga `v`, mas LÊ `k` e `padrao`. Tratar o padrão inteiro
   * como declaração (o que o protótipo fazia) perde exatamente essas leituras. */
  function padrao(p, escopo, modo /* 'declara' | 'atribui' */, ondeDeclarar) {
    if (!p) return;
    switch (p.type) {
      case 'Identifier':
        if (modo === 'declara') ondeDeclarar.decls.add(p.name);
        else anota(p, escopo, 'escrita');
        return;
      case 'ObjectPattern':
        p.properties.forEach((pr) => {
          if (pr.type === 'RestElement') { padrao(pr.argument, escopo, modo, ondeDeclarar); return; }
          if (pr.computed) expr(pr.key, escopo);          // a chave computada é LEITURA
          padrao(pr.value, escopo, modo, ondeDeclarar);
        });
        return;
      case 'ArrayPattern':
        p.elements.forEach((el) => el && padrao(el, escopo, modo, ondeDeclarar));
        return;
      case 'AssignmentPattern':
        padrao(p.left, escopo, modo, ondeDeclarar);
        expr(p.right, escopo);                            // o valor padrão é LEITURA
        return;
      case 'RestElement':
        padrao(p.argument, escopo, modo, ondeDeclarar);
        return;
      default:
        /* `[a.b] = x` / `({x: o.p} = y)`: alvo de atribuição, não declaração. */
        expr(p, escopo);
    }
  }

  /* Percorre TUDO que não é padrão de ligação. Os `case` só existem onde a travessia
   * genérica erraria — o resto cai no genérico do fim. */
  function expr(no, escopo) {
    if (!no || typeof no.type !== 'string') return;

    switch (no.type) {
      case 'Identifier':
        if (!GLOBAIS.has(no.name)) anota(no, escopo, 'leitura');
        return;

      case 'UnaryExpression':
        /* `typeof X` NUNCA lança, mesmo com X inexistente — é o idioma de existência. */
        if (no.operator === 'typeof' && no.argument.type === 'Identifier') {
          nomesTypeof.add(no.argument.name);
          return;
        }
        expr(no.argument, escopo);
        return;

      case 'MemberExpression':
        expr(no.object, escopo);
        if (no.computed) expr(no.property, escopo);       // `a[b]`: `b` é leitura
        return;                                            // `a.b`: `b` é nome de campo

      case 'MetaProperty':                                 // `new.target`, `import.meta`
        return;

      /* ESM. Os `import` já foram declarados na passada de hoisting (são içados como
       * `function`); aqui só não se pode descer neles, senão os nomes importados viram
       * "referência" a si mesmos. */
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
        return;
      case 'ExportDefaultDeclaration':
        expr(no.declaration, escopo);
        return;
      case 'ExportNamedDeclaration':
        if (no.declaration) expr(no.declaration, escopo);
        /* `export { a as b }` — `a` é LEITURA de um nome local; `b` é só um rótulo.
         * `export { a } from 'x'` (com `source`) não referencia nada local. */
        else if (!no.source) no.specifiers.forEach((sp) => expr(sp.local, escopo));
        return;

      case 'Property':
        if (no.computed) expr(no.key, escopo);             // `{[k]: v}`
        expr(no.value, escopo);                            // atalho `{db}`: key===value → LEITURA
        return;

      case 'MethodDefinition':
      case 'PropertyDefinition':
        if (no.computed) expr(no.key, escopo);
        expr(no.value, escopo);
        return;

      case 'LabeledStatement':
        expr(no.body, escopo);                             // o label não é variável
        return;
      case 'BreakStatement':
      case 'ContinueStatement':
        return;

      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        /* A DECLARAÇÃO do nome já foi registrada por quem contém (ver `bloco`/`corpo`). */
        const esc = novoEscopo(escopo, 'funcao');
        /* `const f = function eu() { eu() }` — `eu` só existe DENTRO. */
        if (no.type === 'FunctionExpression' && no.id) esc.decls.add(no.id.name);
        no.params.forEach((p) => padrao(p, esc, 'declara', esc));
        if (no.type !== 'ArrowFunctionExpression') esc.decls.add('arguments');
        if (no.body.type === 'BlockStatement') corpo(no.body.body, esc);  // corpo NÃO é bloco à parte
        else expr(no.body, esc);                                          // arrow de expressão
        return;
      }

      case 'ClassDeclaration':
      case 'ClassExpression': {
        /* `class C { … C … }` — o próprio nome visível de dentro. */
        const esc = novoEscopo(escopo, 'bloco');
        if (no.id) esc.decls.add(no.id.name);
        if (no.superClass) expr(no.superClass, esc);
        no.body.body.forEach((m) => expr(m, esc));
        return;
      }

      case 'StaticBlock': {
        const esc = novoEscopo(escopo, 'bloco');
        corpo(no.body, esc);
        return;
      }

      case 'BlockStatement': {
        const esc = novoEscopo(escopo, 'bloco');
        corpo(no.body, esc);
        return;
      }

      case 'SwitchStatement': {
        expr(no.discriminant, escopo);
        const esc = novoEscopo(escopo, 'bloco');           // `case: let x` vive no switch
        const corpos = [];
        no.cases.forEach((c) => { if (c.test) expr(c.test, esc); corpos.push(...c.consequent); });
        corpo(corpos, esc);
        return;
      }

      case 'ForStatement': {
        const esc = novoEscopo(escopo, 'bloco');           // `for (let i…)` vive no for
        if (no.init) { if (no.init.type === 'VariableDeclaration') declaraVar(no.init, esc); else expr(no.init, esc); }
        if (no.test) expr(no.test, esc);
        if (no.update) expr(no.update, esc);
        umCorpo(no.body, esc);
        return;
      }

      case 'ForInStatement':
      case 'ForOfStatement': {
        const esc = novoEscopo(escopo, 'bloco');
        if (no.left.type === 'VariableDeclaration') declaraVar(no.left, esc);
        else padrao(no.left, esc, 'atribui', esc);         // `for (x of y)`: `x` é ESCRITA
        expr(no.right, esc);
        umCorpo(no.body, esc);
        return;
      }

      case 'CatchClause': {
        const esc = novoEscopo(escopo, 'bloco');
        if (no.param) padrao(no.param, esc, 'declara', esc);
        corpo(no.body.body, esc);                          // o bloco do catch É o escopo do param
        return;
      }

      case 'VariableDeclaration':
        declaraVar(no, escopo);
        return;

      case 'AssignmentExpression':
        if (no.left.type === 'ObjectPattern' || no.left.type === 'ArrayPattern') {
          padrao(no.left, escopo, 'atribui', escopo);
        } else if (no.left.type === 'Identifier') {
          if (!GLOBAIS.has(no.left.name)) anota(no.left, escopo, 'escrita');
        } else {
          expr(no.left, escopo);
        }
        expr(no.right, escopo);
        return;

      case 'UpdateExpression':                             // `x++` lê E escreve
        if (no.argument.type === 'Identifier') {
          if (!GLOBAIS.has(no.argument.name)) anota(no.argument, escopo, 'escrita');
        } else expr(no.argument, escopo);
        return;
    }

    /* Genérico: desce em todo filho que for nó. */
    for (const k of Object.keys(no)) {
      if (k === 'type' || k === 'loc' || k === 'start' || k === 'end' || k === 'range') continue;
      const v = no[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && expr(c, escopo));
      else if (v && typeof v.type === 'string') expr(v, escopo);
    }
  }

  function declaraVar(no, escopo) {
    const alvo = no.kind === 'var' ? escopoDeFuncao(escopo) : escopo;
    no.declarations.forEach((d) => {
      padrao(d.id, escopo, 'declara', alvo);
      if (d.init) expr(d.init, escopo);
    });
  }

  /* HOISTING: um corpo declara TUDO antes de ler qualquer coisa. É isto que faz
   * `function a(){ return b(); } function b(){}` resolver — e o `db` NÃO resolver. */
  function corpo(lista, escopo) {
    lista.forEach((n) => {
      if (!n) return;
      if (n.type === 'FunctionDeclaration' && n.id) escopoDeFuncao(escopo).decls.add(n.id.name);
      if (n.type === 'ClassDeclaration' && n.id) escopo.decls.add(n.id.name);
      /* ESM: `import x, {y as z}, * as ns from 'm'` declara x, z e ns — e é içado. */
      if (n.type === 'ImportDeclaration') n.specifiers.forEach((sp) => escopo.decls.add(sp.local.name));
      /* `export function f(){}` / `export default class C{}` também declaram. */
      const d = (n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration') ? n.declaration : null;
      if (d && (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) escopo.decls.add(d.id.name);
    });
    lista.forEach((n) => expr(n, escopo));
  }
  /* `if (x) let y…` não existe; mas `for (…) corpo` pode ser statement solto. */
  function umCorpo(no, escopo) {
    if (no && no.type === 'BlockStatement') corpo(no.body, escopo);
    else expr(no, escopo);
  }

  corpo(ast.body, raiz);

  /* ── Resolve DEPOIS: a árvore inteira já está montada ── */
  const resolve = (nome, esc) => { let c = esc; while (c) { if (c.decls.has(nome)) return true; c = c.pai; } return false; };
  const livres = refs
    .filter((r) => !nomesTypeof.has(r.nome) && !resolve(r.nome, r.escopo))
    .map(({ nome, linha, coluna, tipo }) => ({ nome, linha, coluna, tipo }))
    .sort((a, b) => a.linha - b.linha || a.coluna - b.coluna);

  return { livres, erro: null };
}

/* ══ CLI ═══════════════════════════════════════════════════════════════════════════════ */

function alvosPadrao() {
  const fora = [];
  PASTAS_ALVO.forEach((pasta) => {
    const abs = path.join(RAIZ, pasta);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs)
      .filter((f) => f.endsWith('.js'))
      .map((f) => pasta + '/' + f)
      .forEach((rel) => fora.push(rel));
  });
  return fora.sort();
}

function main() {
  const args = process.argv.slice(2);
  /* Caminho avulso FORA da árvore (o uso de investigação, `git show > /tmp/x.js`) fica como
   * veio: relativizar contra a raiz viraria uma escada de `../../..` ilegível. */
  const dentroDaRaiz = (rel) => rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  const alvos = args.length
    ? args.map((a) => { const r = path.relative(RAIZ, path.resolve(a)); return dentroDaRaiz(r) ? r : path.resolve(a); })
    : alvosPadrao();

  const problemas = [];
  let lidos = 0;

  alvos.forEach((rel) => {
    const abs = path.isAbsolute(rel) ? rel : path.join(RAIZ, rel);
    let src;
    try { src = fs.readFileSync(abs, 'utf8'); }
    catch (e) { problemas.push({ rel, erro: 'não abre: ' + e.message, livres: [] }); return; }
    lidos++;
    const { livres, erro } = varrer(src);
    if (erro || livres.length) problemas.push({ rel, erro, livres });
  });

  if (!problemas.length) {
    console.log('✓ variáveis livres: ' + lidos + ' arquivo(s) do servidor, nenhuma referência solta.');
    process.exit(0);
  }

  console.error('\n✗ VARIÁVEL LIVRE — referência a nome que não existe em escopo nenhum.\n');
  problemas.forEach(({ rel, erro, livres }) => {
    if (erro) { console.error('  ' + rel + ': ' + erro); return; }
    livres.forEach((l) => {
      const efeito = l.tipo === 'leitura'
        ? 'ReferenceError em tempo de execução'
        : 'cria global implícito (vazamento)';
      console.error('  ' + rel + ':' + l.linha + ':' + l.coluna + '  ' + l.nome +
                    '  — ' + l.tipo + ', ' + efeito);
    });
  });
  console.error('\n  O QUE FAZER: declare o nome no escopo em que ele é usado, ou apague o uso.');
  console.error('  Se for global de ambiente que pode faltar (o caso do `window`), o idioma é');
  console.error('  `typeof NOME !== \'undefined\'` — o gate respeita quem se declara assim.\n');
  console.error('  POR QUÊ: `db` ficou assim desde 97b10a48 e matou `aplicarNoTorneio` por meses.');
  console.error('  O teste de texto casava com /db\\.batch\\(\\)/ e ficava verde: casar com a LETRA');
  console.error('  de uma variável não prova que ela EXISTE.\n');
  process.exit(1);
}

module.exports = { varrer, alvosPadrao, GLOBAIS };
if (require.main === module) main();
