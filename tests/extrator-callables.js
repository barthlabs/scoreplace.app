'use strict';
/* EXTRATOR PURO — uma fonte, três consumidores (portão, tabela do contrato, sonda).
 *
 * ⛔ POR QUE É MÓDULO: quando isto morava dentro da suíte do portão, a sonda teria de
 * reescrever a lista — e lista reescrita é a segunda verdade que passei dois dias matando.
 * A suíte virou CONSUMIDORA.
 *
 * ⚠️ Ele devolve NOMES e TIPOS. Região NÃO se deduz daqui: é fato por nome, declarado em
 * `contrato-callables.js`. Foi tentar deduzir região do call-site que levou um plano a 27
 * rodadas de revisão sem sair do lugar.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const C = require('./contrato-callables');
const ROOT = C.ROOT;

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

    /* ⛔ AS DUAS ISENÇÕES, pelo NÓ da função — e a regra é a MESMA para as duas:
     * só é isento o encaminhamento cujo primeiro argumento é EXATAMENTE o parâmetro da
     * função. Qualquer outra expressão dinâmica ali dentro reprova.
     *   • a CASA  — `FirestoreDB._callFn` (js/firebase-db.js), método de objeto;
     *   • a CASCA — `window._callCF` (js/views/tournaments-draw.js), atribuição.
     * ⚠️ A topologia INVERTEU em 24/set/2026 (a casa era a casca e vice-versa). Se inverter
     * de novo, é aqui e no `contrato-callables.js` que se mexe — juntos. */
    const isencoes = [];
    const registra = (fnNode) => {
      const p0 = fnNode.params && fnNode.params[0];
      isencoes.push({ start: fnNode.start, end: fnNode.end, param: (p0 && p0.type === 'Identifier') ? p0.name : null });
    };
    [C.CONSTRUTOR_DINAMICO, C.WRAPPER_ENCAMINHA].forEach((alvo) => {
      if (rel !== alvo.arquivo) return;
      anda(ast, (n, pai) => {
        // atribuição: `window.<funcao> = function (…) {}`
        if ((n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration')
            && pai && pai.type === 'AssignmentExpression' && pai.left.type === 'MemberExpression'
            && pai.left.property && pai.left.property.name === alvo.funcao) registra(n);
        // método de objeto: `<funcao>(…) {}`
        if (n.type === 'Property' && n.key && n.key.name === alvo.funcao
            && n.value && (n.value.type === 'FunctionExpression')) registra(n.value);
      });
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


module.exports = { parse, anda, nomeDoCallee, indexar, varrerJs, extrair, TRANSPORTES, ROOT };
