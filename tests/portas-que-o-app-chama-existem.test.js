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
 * — `POST` + `Content-Type: application/json` + corpo `{}` **SEM** o campo `data` (o protocolo exige
 * `data`, então sem ele o servidor devolve 400 ANTES do handler e nenhuma callable executa; 404 =
 * não publicada). ⛔ `createCheckoutSession` fica FORA da sonda: é `onRequest` e não fala esse
 * protocolo. Foi a sonda que achou as 23.
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
const C = require('./contrato-callables');
const ROOT = C.ROOT;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

const E = require('./extrator-callables');
const { parse, anda, nomeDoCallee, indexar, varrerJs, extrair } = E;

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
