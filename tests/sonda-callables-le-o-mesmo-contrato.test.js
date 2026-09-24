'use strict';
/* A SONDA E O PORTÃO LEEM O MESMO CONTRATO — e a sonda não toca a rede quando importada.
 * node tests/sonda-callables-le-o-mesmo-contrato.test.js
 *
 * ⛔ POR QUE: a sonda é a ferramenta que achou as 23 Functions não publicadas. Se a lista dela
 * divergir da que o portão extrai, ela mede um conjunto e o portão protege outro — a segunda
 * verdade que esta leva e as duas anteriores vieram matar.
 * ⚠️ A sonda de VERDADE não roda aqui: rede em portão vira portão ignorado. Aqui se testa a
 * política, a classificação, o contrato da requisição e o baseline — tudo puro.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require('./contrato-callables');
const E = require('./extrator-callables');
const S = require(path.join(ROOT, 'scripts', 'sondar-callables'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a sonda lê o mesmo contrato do portão ────\n');

/* ── ① tabela × extrator, nos DOIS sentidos ─────────────────────────────────────── */
const idx = E.indexar();
const { chamados } = E.extrair(E.varrerJs(path.join(ROOT, 'js'), []));
const extraidos = [...new Set(chamados.map((c) => c.nome))].sort();
const naTabela = C.TABELA.map((l) => l.nome).sort();
ok(JSON.stringify(extraidos) === JSON.stringify(naTabela),
  '① ⭐⭐ tabela e extrator iguais nos dois sentidos (' + naTabela.length + ' nomes)');
ok(new Set(naTabela).size === naTabela.length, '① sem nome repetido na tabela');

/* ── ② política: `modo` casa com o TIPO do export ───────────────────────────────── */
const modoErrado = C.TABELA.filter((l) => {
  const t = (idx[l.nome] || {}).tipo;
  return (t === 'onRequest' && l.modo !== 'naoSondada') || (t === 'onCall' && l.modo !== 'sondavel');
});
ok(modoErrado.length === 0, '② `sondavel` só para onCall, `naoSondada` obrigatório para onRequest — ' + JSON.stringify(modoErrado));
const nSond = C.TABELA.filter((l) => l.modo === 'naoSondada');
ok(nSond.length === 1 && nSond[0].nome === 'createCheckoutSession',
  '② ⭐ `naoSondada` existe só em `createCheckoutSession` (é `onRequest`, não fala o protocolo)');

/* ── ③ origem da região, conferida contra o CÓDIGO ──────────────────────────────── */
const origens = {};
C.TABELA.forEach((l) => { origens[l.origemRegiao.tipo] = (origens[l.origemRegiao.tipo] || 0) + 1; });
ok(Object.keys(origens).every((t) => ['literal', 'constante', 'default'].includes(t)),
  '③ toda linha declara origem entre literal|constante|default — ' + JSON.stringify(origens));
const erradas = C.TABELA.filter((l) => !C.REGIOES.includes(l.regiao));
ok(erradas.length === 0, '③ toda região está no conjunto permitido');
/* ⛔ `default` só é verdade enquanto NÃO existir `setGlobalOptions`: uma linha dessas mudaria a
 * região de todas as Functions e o default viraria mentira. */
const comGlobal = C.ENTRYPOINTS.filter((ep) => /setGlobalOptions/.test(fs.readFileSync(path.join(ROOT, ep.arquivo), 'utf8')));
ok(comGlobal.length === 0, '③ ⭐ nenhum entrypoint usa `setGlobalOptions` — é o que sustenta as linhas `default`');

/* ── ④ a URL, e o PROJETO conferido contra o .firebaserc ────────────────────────── */
const rc = JSON.parse(fs.readFileSync(path.join(ROOT, '.firebaserc'), 'utf8'));
ok(rc.projects.default === C.PROJECT_ID, '④ PROJECT_ID do contrato = `.firebaserc` (' + C.PROJECT_ID + ')');
ok(C.montarUrl({ nome: 'x', regiao: 'us-central1' }) === 'https://us-central1-scoreplace-app.cloudfunctions.net/x',
  '④ `montarUrl` monta o endereço exato');

/* ── ⑤ classificação: a tabela inteira ──────────────────────────────────────────── */
ok(S.classificarStatus(404) === 'ausente', '⑤ 404 ⇒ ausente');
[200, 400, 401, 403, 429, 500].forEach((st) => ok(S.classificarStatus(st) === 'presente',
  '⑤ ' + st + ' ⇒ presente (limitado ou falhando É existir)'));
ok(S.classificarStatus('ERRO') === 'desconhecido', '⑤ exceção/abort/timeout ⇒ desconhecido');

/* ── ⑥ a requisição é INERTE — asserção de SEGURANÇA, não de formato ────────────── */
(async () => {
  let visto = null;
  const fakeFetch = (url, init) => { visto = { url, init }; return Promise.resolve({ status: 401 }); };
  await S.sondarUm({ nome: 'qualquer', regiao: 'us-central1' }, { fetch: fakeFetch });
  ok(visto.init.method === 'POST', '⑥ método POST');
  ok(visto.init.headers['Content-Type'] === 'application/json', '⑥ header JSON');
  ok(visto.init.body === '{}', '⑥ ⭐⭐ corpo exatamente `{}` — SEM `data`: é isso que faz o servidor recusar ANTES do handler');
  ok(!/"data"/.test(visto.init.body), '⑥ e nenhum campo `data` no corpo');

  /* ⑦ timer limpo nos TRÊS desfechos */
  const conta = { set: 0, clear: 0 };
  const deps = (f) => ({ fetch: f, setTimeout: () => { conta.set++; return 1; }, clearTimeout: () => { conta.clear++; } });
  await S.sondarUm({ nome: 'a', regiao: 'us-central1' }, deps(() => Promise.resolve({ status: 200 })));
  await S.sondarUm({ nome: 'b', regiao: 'us-central1' }, deps(() => Promise.reject(new Error('rede'))));
  await S.sondarUm({ nome: 'c', regiao: 'us-central1' }, deps(() => { throw new Error('abort'); }));
  ok(conta.set === 3 && conta.clear === 3, '⑦ ⭐ timer limpo nos três desfechos (resposta, rejeição, abort) — ' + JSON.stringify(conta));

  /* ⑧ `naoSondada` não constrói nem dispara requisição */
  let tocou = 0;
  const r = await S.sondarTudo({ fetch: () => { tocou++; return Promise.resolve({ status: 401 }); } });
  const stripe = r.find((x) => x.nome === 'createCheckoutSession');
  ok(stripe && stripe.classificacao === 'naoSondada', '⑧ ⭐ `createCheckoutSession` sai `naoSondada`');
  ok(tocou === C.TABELA.length - 1, '⑧ ⭐⭐ e NENHUMA requisição foi montada para ela (' + tocou + ' de ' + (C.TABELA.length - 1) + ')');

  /* ⑨ baseline estrito */
  const bom = r.map((x) => ({ nome: x.nome, regiao: x.regiao, classificacao: x.classificacao }));
  ok(S.validarBaseline(bom).length === 0, '⑨ baseline bem formado passa');
  ok(S.validarBaseline({}).length > 0, '⑨ não-array reprova');
  ok(S.validarBaseline([{ nome: 'a', regiao: 'us-central1' }]).length > 0, '⑨ campo faltando reprova');
  ok(S.validarBaseline([{ nome: 'a', regiao: 'us-central1', classificacao: 'presente', extra: 1 }]).length > 0, '⑨ campo extra reprova');
  ok(S.validarBaseline([{ nome: 'a', regiao: 'us-central1', classificacao: 'inventada' }]).length > 0, '⑨ classificação inválida reprova');
  ok(S.validarBaseline([{ nome: 'a', regiao: 'marte', classificacao: 'presente' }]).length > 0, '⑨ região inválida reprova');
  const dup = [{ nome: 'a', regiao: 'us-central1', classificacao: 'presente' }, { nome: 'a', regiao: 'us-central1', classificacao: 'presente' }];
  ok(S.validarBaseline(dup).length > 0, '⑨ duplicado reprova');
  ok(S.compararComBaseline(bom, bom).length === 0, '⑨ igual ao baseline ⇒ zero diferenças');
  ok(S.compararComBaseline(bom, bom.slice(1)).length > 0, '⑨ ⭐ item EXTRA reprova');
  ok(S.compararComBaseline(bom.slice(1), bom).length > 0, '⑨ ⭐ item FALTANTE reprova');

  console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
  process.exit(fail ? 1 : 0);
})();
