/* UMA CASA PARA O TRANSPORTE CALLABLE À MÃO.
 * node tests/uma-porta-para-chamar-a-cf.test.js
 *
 * ⛔ O QUE HAVIA: CINCO cópias do mesmo bloco falando o protocolo callable na mão
 * (`POST {data}` → `{result}|{error}`) — `_callDrawRound`, `_callCloseRound`, o genérico
 * `_callCF`, a integração tardia e `FirestoreDB._callFn`, esta última em OUTRO arquivo. O
 * comentário do próprio código pedia a faxina: os dois primeiros "NÃO foram migrados de
 * propósito nesta leva", "migração é faxina posterior".
 *
 * ⭐ E A FAXINA NÃO MUDA COMPORTAMENTO: os textos DIVERGEM entre as cópias, e texto que o
 * dono vê não muda por refactor. Por isso cada casca passa os seus, e este teste fixa os
 * seis lado a lado — inclusive `App não inicializado` SEM ponto no `_callFn`, que é o caso
 * que pega normalização acidental.
 *
 * ⛔ E O PRAZO FICOU FORA, de propósito: só a integração tardia tem teto (25 s), e trazê-lo
 * para a casa comum o espalharia por 52 usos do genérico e 101 do `_callFn` sem classificar
 * idempotência — há Function de comunicado de 120 s que cria filas de e-mail e manifesto com
 * ids aleatórios (não idempotente) e convites de 60 s. Sem `AbortController`, timeout é
 * RESULTADO DESCONHECIDO, não cancelamento. A última asserção guarda essa fronteira.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

/* ── um mundo mínimo: só o que o transporte toca ──────────────────────────────── */
function mundo(opts) {
  opts = opts || {};
  const chamadas = [];
  const w = {};
  w.window = w;
  w._callCF = null;
  w.firebase = {
    auth: () => ({ currentUser: opts.semLogin ? null : { getIdToken: () => (opts.tokenPendurado ? new Promise(() => {}) : Promise.resolve('TOK')) } }),
    app: () => ({ options: { projectId: opts.semPid ? '' : 'proj' } }),
  };
  w.fetch = function (url, init) {
    chamadas.push({ url, init });
    if (opts.fetchPendurado) return new Promise(() => {});
    if (opts.rede) return Promise.reject(new Error('rede'));
    const corpo = opts.corpo === undefined ? { result: { ok: true } } : opts.corpo;
    return Promise.resolve({
      ok: opts.httpOk === undefined ? true : opts.httpOk,
      status: opts.status || 200,
      json: () => (opts.corpoInvalido ? Promise.reject(new Error('não é json')) : Promise.resolve(corpo)),
    });
  };
  const vm = require('vm');
  vm.createContext(w);
  /* ⛔ A CASA mora em `js/firebase-db.js` desde 24/set/2026 — carregar só a view NÃO basta,
   * e foi justamente supor isso que derrubou a tela de inscritos. */
  const fdb = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
  const a = fdb.indexOf('  _callFnMarca:');
  const b = fdb.indexOf('\n  },\n', fdb.indexOf('async _callFn(')) + 5;
  vm.runInContext('window.FirestoreDB = {' + fdb.slice(a, b) + '};', w, { filename: 'fdb.js' });
  const src = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-draw.js'), 'utf8');
  const i = src.indexOf('window._callDrawRound = function');
  const f = src.indexOf('window._callApplyMatchResult');
  vm.runInContext(src.slice(i, f), w, { filename: 'transporte.js' });
  return { w, chamadas };
}
const pegaErro = (p) => p.then(() => null, (e) => e);

/* ── ① ESTRUTURAL: quantas casas sobraram ────────────────────────────────────── */
console.log('\n──── uma casa para o transporte callable ────\n');
const draw = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-draw.js'), 'utf8');
const fdb = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
const urlsDraw = (draw.match(/cloudfunctions\.net\//g) || []).length;
const urlsFdb = (fdb.match(/cloudfunctions\.net\//g) || []).length;
/* ⛔ TOPOLOGIA INVERTIDA em 24/set/2026 (ver o cabeçalho dos dois arquivos): a CASA é
 * `firebase-db.js`; `tournaments-draw.js` tem a CASCA (com fallback de cache híbrido) e a
 * integração tardia. */
ok(urlsFdb === 1, '① a CASA do transporte está em `firebase-db.js` — achei ' + urlsFdb + ' URL');
ok(urlsDraw === 2, '① e no sorteio sobraram duas: o fallback híbrido da casca e a integração tardia — achei ' + urlsDraw);
/* ⚠️ Exceções NOMINAIS, com o contrato de cada uma. Portão que as contasse mentiria sobre o
 * que foi unificado; portão que as ignorasse deixaria nascer a sexta cópia calada.
 *   js/views/auth.js  `checkAccount`      → vai SEM Authorization, antes de existir sessão;
 *   js/views/auth.js  `mergePhoneAccount` (2×) → token principal no cabeçalho E prova da
 *                                          segunda conta no corpo — dois tokens numa chamada;
 *   js/store.js       Stripe              → outra REGIÃO.
 * `httpsCallable` do SDK não é contado: é outro transporte (~39 usos no app). */
const EXCECOES = { 'js/views/auth.js': 3, 'js/store.js': 1 };
function varrer(dir) {
  const out = {};
  (function rec(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') rec(p); return; }
      if (!/\.js$/.test(e.name)) return;
      const n = (fs.readFileSync(p, 'utf8').match(/cloudfunctions\.net\//g) || []).length;
      if (n) out[path.relative(ROOT, p)] = n;
    });
  })(dir);
  return out;
}
const mapa = varrer(path.join(ROOT, 'js'));
const inesperados = Object.keys(mapa).filter((f) => {
  if (f === 'js/views/tournaments-draw.js') return mapa[f] !== 2;
  if (f === 'js/firebase-db.js') return mapa[f] !== 1;
  if (EXCECOES[f] !== undefined) return mapa[f] !== EXCECOES[f];
  return true;
});
ok(inesperados.length === 0, '① nenhuma casa NOVA de transporte em js/ — ' + JSON.stringify(inesperados));

/* ── ② os quatro nomes continuam, na Function e na URL certas ─────────────────── */
(async () => {
  {
    const { w, chamadas } = mundo({});
    await w._callDrawRound({ a: 1 });
    ok(/\/drawRound$/.test(chamadas[0].url), '② sorteio chama `drawRound` — ' + chamadas[0].url);
    ok(chamadas[0].init.body === JSON.stringify({ data: { a: 1 } }), '② com o payload embrulhado em {data}');
    ok(chamadas[0].init.headers.Authorization === 'Bearer TOK', '② e com o token da sessão');
  }
  {
    const { w, chamadas } = mundo({});
    await w._callCloseRound({ b: 2 });
    ok(/\/closeRound$/.test(chamadas[0].url), '② fecho de rodada chama `closeRound`');
  }
  {
    const { w, chamadas } = mundo({});
    await w._callCF('qualquerCoisa', { c: 3 });
    ok(/\/qualquerCoisa$/.test(chamadas[0].url), '② o genérico chama a Function pelo nome');
  }

  /* ── ③ COMPAT da assinatura, nas DUAS formas em uso ────────────────────────── */
  {
    const { w } = mundo({ semLogin: true });
    const e = await pegaErro(w._callCF('fn', {}, 'Entre na sua conta pra X.'));
    ok(e.message === 'Entre na sua conta pra X.', '③ 3º argumento STRING (os 52 chamadores) ainda vira a mensagem de sem-login');
    ok(e.code === 'functions/unauthenticated', '③ com o código certo');
    const e2 = await pegaErro(w._callCF('fn', {}));
    ok(e2.message === 'Entre na sua conta.', '③ dois argumentos ⇒ default do genérico');
  }

  /* ── ④ OS TEXTOS, lado a lado ──────────────────────────────────────────────── */
  {
    const { w } = mundo({ semLogin: true });
    ok((await pegaErro(w._callDrawRound({}))).message === 'Entre na sua conta pra sortear.', '④ sorteio: texto próprio de sem-login');
    ok((await pegaErro(w._callCloseRound({}))).message === 'Entre na sua conta.', '④ fecho: texto próprio de sem-login');
  }
  {
    const { w } = mundo({ semPid: true });
    ok((await pegaErro(w._callCF('fn', {}))).message === 'App não inicializado.', '④ genérico: `App não inicializado.` COM ponto');
    const e = await pegaErro(w._callCF('fn', {}, { naoInicializado: 'App não inicializado' }));
    ok(e.message === 'App não inicializado', '④ ⭐ e SEM ponto quando quem chama pede — é o texto do `_callFn`');
  }
  {
    const { w } = mundo({ corpo: { error: { status: 'INTERNAL' } } });
    ok((await pegaErro(w._callDrawRound({}))).message === 'Falha no sorteio', '④ erro sem mensagem ⇒ `Falha no sorteio`');
    ok((await pegaErro(w._callCloseRound({}))).message === 'Falha no fecho de rodada', '④ ⇒ `Falha no fecho de rodada`');
    ok((await pegaErro(w._callCF('minhaFn', {}))).message === 'Falha em minhaFn', '④ ⇒ `Falha em <fn>` no genérico');
    ok((await pegaErro(w._callCF('fn', {}, { falha: 'Falha' }))).message === 'Falha', '④ ⇒ `Falha` quando quem chama pede (texto do `_callFn`)');
  }

  /* ── ⑤ CÓDIGOS e corpo estranho ────────────────────────────────────────────── */
  {
    const { w } = mundo({ corpo: { error: { status: 'PERMISSION_DENIED', message: 'nao pode' } } });
    const e = await pegaErro(w._callCF('fn', {}));
    ok(e.code === 'functions/permission-denied', '⑤ `PERMISSION_DENIED` ⇒ `functions/permission-denied`');
    ok(e.message === 'nao pode', '⑤ e a mensagem do servidor vence o default');
  }
  {
    const { w } = mundo({ httpOk: false, status: 503, corpo: {} });
    const e = await pegaErro(w._callCF('fn', {}));
    ok(e.message === 'HTTP 503' && e.code === 'functions/internal', '⑤ `!r.ok` ⇒ `HTTP 503` + internal');
  }
  {
    const { w } = mundo({ corpoInvalido: true });
    const r = await w._callCF('fn', {});
    ok(r && r.data && Object.keys(r.data).length === 0, '⑤ corpo não-JSON não estoura: devolve {data:{}}');
  }

  /* ── ⑥ O EMBRULHO: `{data}` aqui, cru no `_callFn` ─────────────────────────── */
  {
    const { w } = mundo({ corpo: { result: { ok: true, tournament: { id: 't1' } } } });
    const r = await w._callCF('fn', {});
    ok(r.data && r.data.tournament && r.data.tournament.id === 't1', '⑥ o genérico devolve `{data: result}`');
  }
  {
    const fonte = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
    const i = fonte.indexOf('async _callFn(name, payload, msgs)');
    const corpo = fonte.slice(i, fonte.indexOf('\n  },', i));
    ok(/return \(j && j\.result\) \|\| \{\};/.test(corpo),
      '⑥ ⭐ o `_callFn` devolve o resultado CRU — quem lê `result.ok`/`result.tournament` depende disso');
    ok(/'login necessário'/.test(corpo) && /'App não inicializado'/.test(corpo) && /'Falha'/.test(corpo),
      '⑥ e mantém os três textos próprios dele (sem ponto no "App não inicializado")');
  }

  /* ── ⑦ NENHUM PRAZO nos quatro — a fronteira desta leva ────────────────────── */
  {
    const { w } = mundo({ fetchPendurado: true });
    let resolveu = false;
    w._callDrawRound({}).then(() => { resolveu = true; }, () => { resolveu = true; });
    await new Promise((r) => setImmediate(r));
    ok(resolveu === false,
      '⑦ ⛔ `fetch` pendurado NÃO é cortado: a casa única não tem prazo, e é isso que impede espalhar teto sem classificar idempotência');
  }

  /* ── ⑧ A REGRESSÃO DE 24/set: a chamada NÃO PODE depender de uma view ──────────
   * Em 2.3.95 a casa foi para `tournaments-draw.js` e o `_callFn` passou a delegar para lá.
   * Toda chamada de servidor do FirestoreDB passou a depender de uma VIEW carregar — e a
   * tela de INSCRITOS quebrou. Aqui o mundo NÃO tem a view. */
  {
    const w = {}; w.window = w; vm.createContext(w);
    w.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ result: { ok: true } }) });
    w.firebase = { auth: () => ({ currentUser: { getIdToken: () => Promise.resolve('T') } }), app: () => ({ options: { projectId: 'p' } }) };
    const fdb = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
    const a = fdb.indexOf('  _callFnMarca:');
    const b = fdb.indexOf('\n  },\n', fdb.indexOf('async _callFn(')) + 5;
    vm.runInContext('window.FirestoreDB = {' + fdb.slice(a, b) + '};', w, { filename: 'fdb.js' });
    const r = await w.FirestoreDB._callFn('fn', {});
    ok(r && r.ok === true, '⑧ ⭐⭐ `_callFn` responde SEM `tournaments-draw.js` — é a regressão que derrubou os inscritos');
  }

  /* ── ⑨ CACHE HÍBRIDO: casca nova + firebase-db VELHO ⇒ sem recursão ────────────
   * O Service Worker pode servir os dois de versões diferentes. Sem a checagem da MARCA,
   * o `_callFn` velho chamaria a casca, que delegaria de volta: laço infinito. */
  {
    const { w, chamadas } = mundo({});
    w.FirestoreDB._callFnMarca = 'marca-velha';          // finge o firebase-db de 2.3.95
    const r = await Promise.race([w._callCF('fn', {}), new Promise((res) => setTimeout(() => res('TRAVOU'), 1500))]);
    ok(r !== 'TRAVOU', '⑨ ⭐⭐ cache híbrido NÃO entra em recursão');
    ok(r && r.data && r.data.ok === true, '⑨ e a casca fala o protocolo sozinha pelo fallback');
    ok(chamadas.length === 1, '⑨ uma requisição só');
  }

  console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
  process.exit(fail ? 1 : 0);
})();
