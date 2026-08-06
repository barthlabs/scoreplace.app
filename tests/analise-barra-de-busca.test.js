/* BARRA DE BUSCA NA ANÁLISE DE INSCRITOS — sticky abaixo do cabeçalho
 * node tests/analise-barra-de-busca.test.js
 *
 * Pedido do dono (06/ago/2026): _"vamos colocar a barra de busca/filtro na pagina da
 * analise"_ e _"a barra de busca/filtro, como sempre, deve travar abaixo do cabecalho e
 * nao sumir com o scroll"_.
 *
 * ⚠️ A busca da Análise EXISTIA no código e NUNCA chegou à tela: `_renderInscritosList`
 * monta a barra canônica, mas está DEFINIDA E NUNCA CHAMADA desde que a página foi
 * consolidada na matriz (v1.15.44). Por isso este arquivo trava as DUAS coisas —
 * que a barra está de fato na página e que o filtro faz o que promete.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');

// ── 1. A BARRA ESTÁ NA PÁGINA (e é a CANÔNICA, não uma cópia local) ─────────────
sec(function () {
  ok(/_inscritosFilterBar\(\{[\s\S]{0,200}stateKey: 'analise'/.test(SRC),
     'a página usa a barra canônica window._inscritosFilterBar (nada de barra pirata)');
  ok(/stateKey: 'analise', sticky: true, searchOnly: true/.test(SRC),
     'em modo sticky + searchOnly, igual à barra da chave');
  ok(/searchId: 'er-mx-search', onChange: 'window\._erApplyMatrixFilter\(\)'/.test(SRC),
     'ligada ao filtro da matriz');
  // O sticky só gruda depois que a rolagem leva a posição natural até o `top`. Enterrada no
  // meio da página, a barra some antes de grudar — foi o bug medido na chave (1.7.43).
  ok(SRC.indexOf('container.innerHTML = hdr + _mxBar') !== -1,
     'a barra é a 1ª IRMÃ depois do cabeçalho — não enterrada dentro do conteúdo');
  // compara DENTRO da própria expressão do innerHTML (o nome da seção também aparece
  // antes, noutra função — comparar com o 1º indexOf global daria falso negativo)
  const _iShell = SRC.indexOf('container.innerHTML = hdr + _mxBar');
  const _trecho = SRC.slice(_iShell, _iShell + 900);
  ok(_trecho.indexOf('_mxBar') < _trecho.indexOf('_renderCategoriesSection'), 'e vem ANTES da matriz');
});

// ── 2. OS GANCHOS QUE O FILTRO VARRE EXISTEM NO MARKUP ─────────────────────────
sec(function () {
  ok(/data-er-person="' \+ _esc\(r\.name/.test(SRC), 'cada card de pessoa carrega data-er-person com o nome');
  ok(/data-er-box="1" data-er-total="' \+ arr\.length/.test(SRC), 'cada caixa de categoria carrega data-er-box + o total real');
  ok(/<span data-er-count/.test(SRC), 'a contagem do título é marcada (vira "x de N" enquanto filtra)');
});

// ── 3. O FILTRO: esconde quem não casa, some com caixa vazia, não mente na conta ─
sec(function () {
  // DOM mínimo com o MESMO markup que chip()/catBox() emitem.
  const feito = {};
  const el = (attrs, filhos) => ({
    attrs: attrs, filhos: filhos || [], style: {},
    getAttribute: function (k) { return this.attrs[k]; },
    querySelector: function (s) { return this.querySelectorAll(s)[0] || null; },
    querySelectorAll: function (s) {
      const chave = s.replace(/[[\]]/g, '');
      const out = [];
      (function anda(n) { (n.filhos || []).forEach(function (f) { if (f.attrs && chave in f.attrs) out.push(f); anda(f); }); })(this);
      return out;
    },
  });
  const pessoa = (n) => el({ 'data-er-person': n });
  const caixa = (arr) => el({ 'data-er-box': '1', 'data-er-total': String(arr.length) },
    [el({ 'data-er-count': '' })].concat(arr.map(pessoa)));
  const raiz = el({ id: 'er-cat-matrix' }, [
    caixa(['Erika de Paula', 'Kelly Barth', 'Nádia Santiago Lazarin']),
    caixa(['danielacsimao', 'Carol Capucho', 'Livia Morais']),
  ]);
  raiz.filhos.forEach(function (c) { c.querySelector('[data-er-count]').textContent = ''; });
  const campo = { value: '', style: {} };
  const vazio = { style: { display: 'none' } };

  const win = {};
  global.window = win;
  win.document = {
    getElementById: function (id) { return id === 'er-mx-search' ? campo : id === 'er-cat-matrix' ? raiz : id === 'er-mx-search-empty' ? vazio : null; },
  };
  global.document = win.document;
  // extrai a função REAL do arquivo (contagem de chaves) + o _norm que ela usa
  function extrai(marca) {
    const ini = SRC.indexOf(marca);
    if (ini < 0) throw new Error('não achei ' + marca);
    let i = SRC.indexOf('{', ini + marca.length), n = 0, fim = -1;
    for (; i < SRC.length; i++) { if (SRC[i] === '{') n++; else if (SRC[i] === '}') { n--; if (!n) { fim = i + 1; break; } } }
    return SRC.slice(ini, fim);
  }
  new Function('window', 'document', 'with (window) { ' + extrai('function _norm(s)') + '; ' + extrai('window._erApplyMatrixFilter = function') + '; }')(win, win.document);

  const visiveis = () => raiz.querySelectorAll('[data-er-person]').filter((e) => e.style.display !== 'none').map((e) => e.attrs['data-er-person']);
  const caixasVisiveis = () => raiz.querySelectorAll('[data-er-box]').filter((e) => e.style.display !== 'none').length;

  campo.value = 'dani';
  win._erApplyMatrixFilter();
  ok(visiveis().length === 1 && visiveis()[0] === 'danielacsimao', 'buscar "dani" deixa só a danielacsimao, deixou: ' + visiveis().join(', '));
  ok(caixasVisiveis() === 1, 'a caixa sem ninguém visível SOME (não fica caixa vazia poluindo), visíveis: ' + caixasVisiveis());
  const conts = raiz.querySelectorAll('[data-er-count]').map((e) => e.textContent);
  ok(conts.indexOf('(1 de 3)') !== -1, 'a contagem vira "(1 de 3)" — não mente o total enquanto filtra: ' + conts.join(' '));
  ok(vazio.style.display === 'none', 'com resultado, o aviso de "ninguém encontrado" fica escondido');

  campo.value = 'zzz-nao-existe';
  win._erApplyMatrixFilter();
  ok(visiveis().length === 0 && vazio.style.display === '', 'sem resultado, aparece o aviso "Ninguém encontrado"');

  campo.value = '';
  win._erApplyMatrixFilter();
  ok(visiveis().length === 6, 'limpar a busca traz todo mundo de volta, voltaram ' + visiveis().length);
  ok(caixasVisiveis() === 2, 'e as caixas todas de volta');
  ok(raiz.querySelectorAll('[data-er-count]').every((e) => e.textContent === '(3)'), 'com a contagem original');
});

console.log((fail === 0 ? '✅' : '❌') + ' analise-barra-de-busca: ' + pass + ' asserções, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
