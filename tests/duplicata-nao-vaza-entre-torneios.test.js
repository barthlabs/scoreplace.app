/* duplicata-nao-vaza-entre-torneios.test.js — A ANÁLISE DE UM TORNEIO NÃO PINTA NO OUTRO.
 * node tests/duplicata-nao-vaza-entre-torneios.test.js
 *
 * ⛔ O DEFEITO, apontado pela revisão do diff em 22/set/2026 e reproduzido aqui: a seção
 * de conta duplicada guardava estado GLOBAL. Abrir a análise do torneio A, navegar para B
 * antes da resposta, e a resposta de A pintava os NOMES e as pistas mascaradas de A dentro
 * da tela de B. Não é susto visual: é dado de um torneio aparecendo em outro. De quebra, a
 * carga de B era recusada pelo "carregando" que ainda era de A.
 *
 * A tela já protegia as outras respostas assíncronas com o hash; a seção nova não
 * reaplicava o padrão.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; return; } fail++; console.error('  ✗ ' + m); };

console.log('\n── a resposta de um torneio não pode pintar na tela de outro ──');

// DOM mínimo: só o que a seção toca.
function montarJanela() {
  const elementos = {};
  const win = {
    location: { hash: '#analise/A' },
    document: {
      getElementById: (id) => elementos[id] || null,
    },
    _warn: () => {}, _log: () => {},
    setTimeout: (fn) => fn(),
  };
  win.window = win;
  const criarSecao = (tid) => {
    elementos['er-dup-secao'] = {
      _tid: tid, innerHTML: '',
      getAttribute: function (k) { return k === 'data-tid' ? this._tid : null; },
    };
    return elementos['er-dup-secao'];
  };
  return { win, criarSecao, elementos };
}

// Carrega só o trecho da seção, sem arrastar o arquivo inteiro (que precisa de app).
const fonte = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
const inicio = fonte.indexOf('var _dupPorTorneio');
const fim = fonte.indexOf('function _renderLoading(');
ok(inicio > 0 && fim > inicio, 'achei o trecho da seção de duplicatas no arquivo real');
const trecho = fonte.slice(inicio, fim);

const { win, criarSecao } = montarJanela();
criarSecao('A');

// `_esc` e a ponte são dublês; o que está sob teste é a GUARDA, não a pintura.
const sandbox = Object.assign(Object.create(null), {
  window: win, document: win.document, console: { log: () => {}, error: () => {} },
  _esc: (x) => String(x == null ? '' : x),
});
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

let resolverA = null;
win.FirestoreDB = {
  carregarDuplicatasDoElenco: function (tId) {
    if (tId === 'A') return new Promise((res) => { resolverA = res; });
    return Promise.resolve({
      pairs: [{ nomes: ['Bia Um', 'Bia Dois'], motivo: 'nome', forca: 6, dispensado: false, dismissedAt: null }],
      nextCursor: null, unmeasuredCount: 0,
    });
  },
};

vm.runInContext(trecho, sandbox);
ok(typeof win._erCarregarDuplicatas === 'function', 'a seção expôs o carregador');

(async () => {
  // 1) abre A — o pedido fica PENDENTE
  win._erCarregarDuplicatas('A');
  ok(resolverA !== null, 'o pedido do torneio A ficou pendente');

  // 2) navega para B: outra rota, outro elemento no DOM
  win.location.hash = '#analise/B';
  criarSecao('B');
  win._erCarregarDuplicatas('B');
  await new Promise((r) => setImmediate(r));

  const depoisDeB = win.document.getElementById('er-dup-secao').innerHTML;
  ok(/Bia Um/.test(depoisDeB),
    '⭐ a carga de B ACONTECE — antes ela era recusada pelo "carregando" que era de A');

  // 3) só agora A responde
  resolverA({
    pairs: [{ nomes: ['Ana Um', 'Ana Dois'], motivo: 'celular', forca: 9,
              telefoneMascarado: '•••••8888', dispensado: false, dismissedAt: null }],
    nextCursor: null, unmeasuredCount: 7,
  });
  await new Promise((r) => setImmediate(r));

  const final = win.document.getElementById('er-dup-secao').innerHTML;
  ok(!/Ana Um|Ana Dois/.test(final),
    '⭐⭐ os NOMES do torneio A NÃO aparecem na tela do torneio B');
  ok(!/8888/.test(final),
    '⭐⭐ nem a pista mascarada de A vaza para a tela de B');
  ok(!/\b7\b/.test(final.replace(/Bia/g, '')),
    'nem a contagem de não medidos de A');
  ok(/Bia Um/.test(final), 'e o conteúdo legítimo de B continua lá');

  if (fail) {
    console.error('\n❌ duplicata-nao-vaza-entre-torneios: ' + pass + ' ok, ' + fail + ' falharam');
    process.exit(1);
  }
  console.log('\n✅ duplicata-nao-vaza-entre-torneios: ' + pass + ' ok');
})();
