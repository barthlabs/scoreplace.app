/* JS QUE CHEGOU PELA METADE SE CONSERTA SOZINHO.
 *
 * MEDIDO no Sentry (12/ago/2026, release 1.8.36): `SyntaxError: Unexpected EOF` em
 * `js/views/terms-acceptance.js:150`, iPhone / Mobile Safari 26.6, rota dashboard.
 * O arquivo tem **242 linhas** no repo E 242 servidas pelo site, com `node --check` OK dos
 * dois lados — o aparelho viu o arquivo acabar na linha 150. O script chegou TRUNCADO.
 * Na mesma janela: mais dois EOF e um `_isTeamEnrollMode is not a function` — e essa função
 * EXISTE (tournaments-utils.js:24). 4 das 5 issues novas do dia, o mesmo fato.
 * E é reincidente: já houve uma issue "script truncado no deploy" dada como resolvida.
 *
 * POR QUE NÃO SE BARRA NA HORA DE CACHEAR: o Firebase serve chunked+gzip, SEM
 * `content-length` (conferido nos headers) — o SW não tem como medir se o corpo veio
 * inteiro. E o `status === 200` que ele já checa NÃO garante isso: conexão que cai no meio
 * devolve 200 com metade do arquivo. Uma vez cacheado, o app fica quebrado até limpar.
 *
 * A DEFESA É CURAR: SyntaxError num script NOSSO só acontece com arquivo corrompido.
 * Limpa caches + tira o SW + recarrega UMA vez por sessão.
 *
 * O que este teste trava (e por que cada uma importa):
 *  • só SyntaxError — recarregar em TypeError/ReferenceError viraria recarga infinita em
 *    cima de bug comum;
 *  • só arquivo da nossa origem — erro de terceiro não se resolve recarregando;
 *  • uma vez por sessão — senão um arquivo cronicamente truncado vira laço;
 *  • o handler é INLINE no index.html — o arquivo truncado pode ser o próprio store.js,
 *    onde mora o `_applyUpdate`; quem repara não pode depender do que está quebrado.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const espera = () => new Promise((r) => setTimeout(r, 30));

console.log('──── js truncado se conserta ────');

const m = /<script>\s*\(function \(\) \{\s*var CHAVE = 'sp_js_repair_v1';[\s\S]*?\}\)\(\);\s*<\/script>/.exec(html);
ok(!!m, 'o auto-reparo tem que existir como <script> INLINE no index.html');

const posRep = html.indexOf('sp_js_repair_v1');
const posDefer = html.search(/<script src="[^"]+" defer><\/script>/);
ok(posRep !== -1 && posDefer !== -1 && posRep < posDefer,
   'o reparo é definido ANTES do primeiro script com defer — é justamente um deles que chega truncado');

function monta() {
  const sb = { console };
  sb.window = sb; sb.globalThis = sb;
  sb.acoes = [];
  sb.store = {};
  sb.sessionStorage = {
    getItem: (k) => (k in sb.store ? sb.store[k] : null),
    setItem: (k, v) => { sb.store[k] = String(v); },
  };
  sb.location = { origin: 'https://scoreplace.app', pathname: '/', reload: () => sb.acoes.push('reload') };
  sb.caches = { keys: () => Promise.resolve(['c1', 'c2']),
                delete: (k) => { sb.acoes.push('cache:' + k); return Promise.resolve(true); } };
  sb.navigator = { serviceWorker: { getRegistrations: () => Promise.resolve([
    { unregister: () => { sb.acoes.push('unregister'); return Promise.resolve(true); } }]) } };
  sb.fetch = (u, o) => { sb.acoes.push('fetch:' + (o && o.cache)); return Promise.resolve({}); };
  sb.handlers = [];
  sb.addEventListener = (tipo, fn) => { if (tipo === 'error') sb.handlers.push(fn); };
  vm.createContext(sb);
  vm.runInContext(m[0].replace(/^<script>/, '').replace(/<\/script>$/, ''), sb, { filename: 'repair.js' });
  sb.dispara = (ev) => sb.handlers.forEach((h) => h(ev));
  return sb;
}

(async () => {
  if (m) {
    const NOSSO = 'https://scoreplace.app/js/views/terms-acceptance.js?v=2.4.0-beta';

    // (a) o caso REAL do Sentry
    const sb = monta();
    sb.dispara({ message: 'SyntaxError: Unexpected EOF', filename: NOSSO });
    await espera();
    ok(sb.acoes.indexOf('cache:c1') !== -1 && sb.acoes.indexOf('cache:c2') !== -1,
       'limpa TODOS os caches — veio ' + JSON.stringify(sb.acoes));
    ok(sb.acoes.indexOf('unregister') !== -1, 'desregistra o Service Worker');
    ok(sb.acoes.indexOf('fetch:reload') !== -1,
       'revalida o documento antes de recarregar (senão o reload é soft e traz os mesmos assets)');
    ok(sb.acoes.indexOf('reload') !== -1, 'recarrega');

    // (b) anti-laço
    const antes = sb.acoes.length;
    sb.dispara({ message: 'SyntaxError: Unexpected EOF', filename: NOSSO });
    await espera();
    ok(sb.acoes.length === antes, 'uma vez por sessão: o segundo erro NÃO recarrega de novo');
    ok(sb.store['sp_js_repair_v1'] === '1', 'a marca fica na SESSÃO (some ao fechar), não no localStorage');

    // (c) a mesma falha, escrita como o Chrome escreve
    const sb2 = monta();
    sb2.dispara({ message: 'SyntaxError: Unexpected end of input', filename: NOSSO });
    await espera();
    ok(sb2.acoes.indexOf('reload') !== -1, '"Unexpected end of input" (Chrome) também repara');

    // (d) NÃO repara: erro comum de execução
    const sb3 = monta();
    sb3.dispara({ message: 'TypeError: x is not a function', filename: NOSSO });
    sb3.dispara({ message: 'ReferenceError: y is not defined', filename: NOSSO });
    await espera();
    ok(sb3.acoes.length === 0,
       'TypeError/ReferenceError NÃO recarregam — seria recarga infinita em cima de bug comum');

    // (e) NÃO repara: script de terceiro
    const sb4 = monta();
    sb4.dispara({ message: 'SyntaxError: Unexpected EOF', filename: 'https://cdn.terceiro.com/x.js' });
    await espera();
    ok(sb4.acoes.length === 0, 'erro em script de OUTRA origem não dispara reparo');

    // (f) NÃO repara: erro sem arquivo identificado
    const sb5 = monta();
    sb5.dispara({ message: 'SyntaxError: Unexpected EOF', filename: '' });
    await espera();
    ok(sb5.acoes.length === 0, 'erro sem arquivo identificado não dispara reparo');
  }

  console.log(fail === 0 ? '  ✓ ' + pass + ' asserções' : '  ' + pass + ' ok / ' + fail + ' falhas');
  process.exit(fail === 0 ? 0 : 1);
})();
