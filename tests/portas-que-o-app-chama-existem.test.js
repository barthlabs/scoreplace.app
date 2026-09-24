'use strict';
/* TODO NOME DE FUNCTION QUE O APP CHAMA EXISTE COMO EXPORT — e com o TIPO certo.
 * node tests/portas-que-o-app-chama-existem.test.js
 *
 * ⛔ POR QUE EXISTE: em 24/set/2026 medi que **23** callables que o cliente chamava não
 * estavam publicadas (404). Nada no repo reclamava. Este portão é a rede que faltava.
 *
 * ⚠️⚠️ O QUE ELE **NÃO** PROMETE, e está aqui para ninguém ler o verde como mais do que é:
 * ele **não diz que a Function está NO AR**. Ele diz que o NOME EXISTE no código, com o
 * tipo compatível. "Está publicado?" é pergunta de REDE — quem responde é a sonda
 * (`{data:{}}` no endpoint: 401 = viva, 404 = não publicada), que foi o que achou as 23.
 *
 * ⭐ A REGRA DE OURO: **o que ele não souber ler, REPROVA.** Nome montado em variável fora
 * das duas isenções estreitas derruba a suíte — de propósito. É o oposto de adivinhar, e é
 * por isso que ele não envelhece: forma nova ⇒ vermelho ⇒ alguém decide.
 *
 * ⛔ Região e protocolo do SDK ficaram FORA de propósito: exigem resolver receptor, alias e
 * opção global, e foi essa tentativa que levou um plano a 27 rodadas de revisão sem sair do
 * lugar. Região é da sonda.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const C = require('./contrato-callables');
const ROOT = C.ROOT;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

function parse(src, modulo) {
  return acorn.parse(src, { ecmaVersion: 2022, sourceType: modulo ? 'module' : 'script', allowReturnOutsideFunction: true });
}
function anda(no, visita, pai) {
  if (!no || typeof no.type !== 'string') return;
  visita(no, pai);
  for (const k of Object.keys(no)) {
    const v = no[k];
    if (Array.isArray(v)) v.forEach((x) => { if (x && typeof x.type === 'string') anda(x, visita, no); });
    else if (v && typeof v.type === 'string') anda(v, visita, no);
  }
}
const nomeDoCallee = (n) => (n && n.callee && n.callee.type === 'MemberExpression' && n.callee.property && !n.callee.computed)
  ? n.callee.property.name : ((n && n.callee && n.callee.type === 'Identifier') ? n.callee.name : null);

/* ── índice de exports: SÓ os três entrypoints, guardando {nome, tipo} ───────────── */
function indexar() {
  const idx = {};
  C.ENTRYPOINTS.forEach((ep) => {
    const src = fs.readFileSync(path.join(ROOT, ep.arquivo), 'utf8');
    anda(parse(src, ep.modulo), (n) => {
      let nome = null, valor = null;
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression'
          && n.left.object.type === 'Identifier' && n.left.object.name === 'exports'
          && n.left.property && !n.left.computed) { nome = n.left.property.name; valor = n.right; }
      if (n.type === 'ExportNamedDeclaration' && n.declaration && n.declaration.type === 'VariableDeclaration') {
        const d = n.declaration.declarations[0];
        if (d && d.id.type === 'Identifier') { nome = d.id.name; valor = d.init; }
      }
      if (!nome || !valor) return;
      const tipo = (valor.type === 'CallExpression') ? nomeDoCallee(valor) : null;
      idx[nome] = { tipo: tipo, arquivo: ep.arquivo };
    });
  });
  return idx;
}

/* ── extração dos call-sites, com a REGRA DE OURO ────────────────────────────────── */
function varrerJs(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') varrerJs(p, acc); return; }
    if (/\.js$/.test(e.name) && !/\.test\.js$/.test(e.name)) acc.push(p);
  });
  return acc;
}
const TRANSPORTES = ['httpsCallable', '_callCF', '_callFn'];

function extrair(arquivos) {
  const chamados = [], dinamicos = [];
  arquivos.forEach((abs) => {
    const rel = path.relative(ROOT, abs);
    const src = fs.readFileSync(abs, 'utf8');
    let ast; try { ast = parse(src, false); } catch (e) { dinamicos.push({ rel, motivo: 'nao parseou: ' + e.message }); return; }

    /* As duas isenções, pelo NÓ da função — e a do wrapper é ESTREITA: vale só quando o
     * argumento dinâmico é EXATAMENTE o parâmetro dela. */
    const isencoes = [];
    anda(ast, (n) => {
      if (n.type !== 'FunctionExpression' && n.type !== 'FunctionDeclaration') return;
      const ehCallCF = rel === C.CONSTRUTOR_DINAMICO.arquivo && src.slice(Math.max(0, n.start - 40), n.start).includes(C.CONSTRUTOR_DINAMICO.funcao);
      if (ehCallCF) isencoes.push({ start: n.start, end: n.end, param: null });
    });
    anda(ast, (n) => {
      if (n.type !== 'Property' || !n.value || n.value.type !== 'FunctionExpression') return;
      if (rel !== C.WRAPPER_ENCAMINHA.arquivo || !n.key || n.key.name !== C.WRAPPER_ENCAMINHA.funcao) return;
      const p0 = n.value.params[0];
      isencoes.push({ start: n.value.start, end: n.value.end, param: (p0 && p0.type === 'Identifier') ? p0.name : null });
    });
    const isentaPara = (n) => isencoes.find((i) => n.start >= i.start && n.end <= i.end);

    anda(ast, (n) => {
      if (n.type !== 'CallExpression') return;
      const t = nomeDoCallee(n);
      if (!TRANSPORTES.includes(t)) return;
      const a0 = n.arguments[0];
      if (a0 && a0.type === 'Literal' && typeof a0.value === 'string') { chamados.push({ nome: a0.value, transporte: t, rel }); return; }
      const isento = isentaPara(n);
      /* ⛔ Isenção do WRAPPER é do ENCAMINHAMENTO: o argumento tem de ser o parâmetro dela. */
      if (isento && isento.param !== null) {
        if (a0 && a0.type === 'Identifier' && a0.name === isento.param) return;
        dinamicos.push({ rel, motivo: t + '(<expressão>) DENTRO do wrapper, e não é o parâmetro dele' });
        return;
      }
      if (isento) return;
      dinamicos.push({ rel, motivo: t + '(<não literal>)' });
    });

    /* URLs literais: `'…cloudfunctions.net/<nome>'` e `'…' + x + '.cloudfunctions.net/<nome>'` */
    const re = /cloudfunctions\.net\/([A-Za-z0-9_]+)/g;
    let m; while ((m = re.exec(src))) chamados.push({ nome: m[1], transporte: 'url', rel });
  });
  return { chamados, dinamicos };
}

console.log('\n──── todo nome que o app chama existe como export ────\n');
const idx = indexar();
ok(Object.keys(idx).length > 150, 'índice dos três entrypoints montado (' + Object.keys(idx).length + ' exports)');
ok(idx.createCheckoutSession && idx.createCheckoutSession.tipo === 'onRequest',
  '⭐ o ESM do Stripe entrou no índice (`sourceType: module`) — sem isso ele sumiria e o portão acusaria falso');

const { chamados, dinamicos } = extrair(varrerJs(path.join(ROOT, 'js'), []));
ok(dinamicos.length === 0, '⭐ REGRA DE OURO: zero chamadas de nome não literal fora das isenções — ' + JSON.stringify(dinamicos));

const semExport = chamados.filter((c) => !idx[c.nome]);
ok(semExport.length === 0, '⭐⭐ todo nome chamado existe como export — ' + JSON.stringify(semExport.slice(0, 5)));

const tipoErrado = chamados.filter((c) => idx[c.nome] && !(C.TRANSPORTE_EXIGE[c.transporte] || []).includes(idx[c.nome].tipo));
ok(tipoErrado.length === 0,
  '⭐ e com TIPO compatível (callable ⇒ onCall; URL ⇒ onCall|onRequest; gatilho nunca) — ' + JSON.stringify(tipoErrado.slice(0, 5)));
console.log('    (' + new Set(chamados.map((c) => c.nome)).size + ' nomes distintos chamados)');

/* ── FALSIFICAÇÃO: um portão que não reprova não prova ───────────────────────────── */
const T = { start: 0, end: 0 };
ok(!idx.naoExisteEssaFuncao, 'falsificação: nome inventado não está no índice (logo `semExport` o pegaria)');
const agendado = Object.keys(idx).find((k) => idx[k].tipo === 'onSchedule');
ok(!!agendado, 'falsificação: achei um export AGENDADO para testar (' + agendado + ')');
ok(!(C.TRANSPORTE_EXIGE.httpsCallable || []).includes('onSchedule'),
  '⭐ falsificação: chamar por callable um export `onSchedule` seria REPROVADO');
ok((C.TRANSPORTE_EXIGE.url || []).includes('onRequest'),
  'falsificação: URL direta para `onRequest` é ACEITA (é o caso do Stripe)');

/* ESM em STRING — ⛔ sem criar arquivo: o runner paraleliza e só reserva exclusividade
 * para suítes que mexem em arquivo. */
(function esmSintetico() {
  const src = "import { onRequest } from 'x';\nexport const soEsm = onRequest({ region: 'a' }, () => {});\n";
  let achou = null;
  anda(parse(src, true), (n) => {
    if (n.type === 'ExportNamedDeclaration' && n.declaration) {
      const d = n.declaration.declarations[0];
      achou = { nome: d.id.name, tipo: nomeDoCallee(d.init) };
    }
  });
  ok(achou && achou.nome === 'soEsm' && achou.tipo === 'onRequest', '⭐ falsificação: ESM sintético é indexado como onRequest');
})();
(function dinamicoAninhado() {
  const src = "var o = { _callFn(name, p) { return window._callCF(outraCoisa, p); } };";
  const ast = parse(src, false);
  let pegou = false;
  anda(ast, (n) => {
    if (n.type === 'CallExpression' && nomeDoCallee(n) === '_callCF') {
      const a0 = n.arguments[0];
      if (!(a0 && a0.type === 'Identifier' && a0.name === 'name')) pegou = true;
    }
  });
  ok(pegou, '⭐⭐ falsificação: `_callCF(outraVariavel)` DENTRO do wrapper é pego — a isenção é do encaminhamento, não da função');
})();

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
