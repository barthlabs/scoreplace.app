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
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');

// ── 1. A BARRA ESTÁ NA PÁGINA (e é a CANÔNICA, não uma cópia local) ─────────────
sec(function () {
  ok(/_inscritosFilterBar\(\{[\s\S]{0,200}stateKey: 'analise'/.test(SRC),
     'a página usa a barra canônica window._inscritosFilterBar (nada de barra pirata)');
  ok(/stateKey: 'analise', sticky: true,/.test(SRC) && !/stateKey: 'analise', sticky: true, searchOnly: true/.test(SRC),
     'em modo sticky com ordenação, gênero e categoria');
  ok(/searchId: 'er-mx-search', sortId: 'er-mx-sort', genderId: 'er-mx-gender', skillId: 'er-mx-skill'/.test(SRC),
     'ligada ao filtro da matriz');
  // O sticky só gruda depois que a rolagem leva a posição natural até o `top`. Enterrada no
  // meio da página, a barra some antes de grudar — foi o bug medido na chave (1.7.43).
  ok(SRC.indexOf('container.innerHTML = hdr + _mxBar') !== -1,
     'a barra é a 1ª IRMÃ depois do cabeçalho — não enterrada dentro do conteúdo');
  // compara DENTRO da própria expressão do innerHTML (o nome da seção também aparece
  // antes, noutra função — comparar com o 1º indexOf global daria falso negativo)
  const _iShell = SRC.indexOf('container.innerHTML = hdr + _mxBar');
  const _trecho = _R.ateOFim(SRC, _iShell);
  ok(_trecho.indexOf('_mxBar') < _trecho.indexOf('_renderCategoriesSection'), 'e vem ANTES da matriz');
});

// ── 2. OS GANCHOS QUE O FILTRO VARRE EXISTEM NO MARKUP ─────────────────────────
sec(function () {
  ok(/data-er-person="' \+ _esc\(r\.name/.test(SRC), 'cada card de pessoa carrega data-er-person com o nome');
  // Uma dupla agora é um card único, mas vale por duas pessoas no total da caixa.
  // O contrato da busca é usar o total efetivamente exibido, não apenas os solos.
  ok(/data-er-box="1" data-er-gender="'/.test(SRC) && /data-er-total="' \+ boxTotal/.test(SRC), 'cada caixa de categoria carrega gênero e o total real, incluindo duplas');
  ok(/data-er-person="' \+ _esc\(a\.name \+ ' ' \+ b\.name\)/.test(SRC), 'card da dupla indexa os dois nomes para a busca');
  ok(/!q \|\| _norm\(r\.name\)\.indexOf\(q\) !== -1/.test(SRC), 'índice lista só a pessoa buscada, sem incluir parceiro por contexto');
  ok(/<span data-er-count/.test(SRC), 'a contagem do título é marcada (vira "x de N" enquanto filtra)');
});

// ── 3. O FILTRO: esconde quem não casa, mantém destinos vazios, não mente na conta ─
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
  const orders = { 'Erika de Paula': 1, 'Kelly Barth': 2, 'Nádia Santiago Lazarin': 3,
    danielacsimao: 4, 'Carol Capucho': 5, 'Livia Morais': 6 };
  const pessoa = (n, g, s) => el({ 'data-er-person': n, 'data-er-order': String(orders[n] || ''),
    'data-er-gender': g, 'data-er-skill': s });
  const caixa = (arr) => el({ 'data-er-box': '1', 'data-er-total': String(arr.length) },
    [el({ 'data-er-count': '' })].concat(arr.map((n) => pessoa(n, 'feminino', 'Light'))));
  const raiz = el({ id: 'er-cat-matrix' }, [
    caixa(['Erika de Paula', 'Kelly Barth', 'Nádia Santiago Lazarin']),
    caixa(['danielacsimao', 'Carol Capucho', 'Livia Morais']),
  ]);
  raiz.filhos.forEach(function (c) { c.querySelector('[data-er-count]').textContent = ''; });
  const campo = { value: '', style: {} };
  const vazio = { style: { display: 'none' } };
  const index = { items: [], appendChild: function (item) { this.items.push(item); } };
  Object.defineProperty(index, 'textContent', { set: function () { this.items = []; } });

  const win = {};
  global.window = win;
  win.document = {
    getElementById: function (id) { return id === 'er-mx-search' ? campo : id === 'er-cat-matrix' ? raiz : id === 'er-mx-search-empty' ? vazio : null; },
    querySelector: function (selector) { return selector === '#er-mx-competitor-index [data-er-index-list]' ? index : null; },
    createElement: function () { return { dataset: {}, style: {} }; },
  };
  win._filterBarState = { analise: { gender: 'all', skill: 'all', sort: 'order-asc' } };
  win._liveState = { rows: ['Erika de Paula', 'Kelly Barth', 'Nádia Santiago Lazarin', 'danielacsimao', 'Carol Capucho', 'Livia Morais']
    .map(function (name, i) { return { name: name, order: i + 1 }; }) };
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
  ok(index.items.length === 1 && index.items[0].textContent === 'danielacsimao', 'índice lateral lista apenas a pessoa que corresponde à busca');
  ok(caixasVisiveis() === 2, 'todas as categorias continuam visíveis para receber a dupla arrastada');
  const conts = raiz.querySelectorAll('[data-er-count]').map((e) => e.textContent);
  ok(conts.indexOf('(1 de 3)') !== -1, 'a contagem vira "(1 de 3)" — não mente o total enquanto filtra: ' + conts.join(' '));
  ok(vazio.style.display === 'none', 'com resultado, o aviso de "ninguém encontrado" fica escondido');

  const dupla = pessoa('Ana Busca Beatriz Parceira', 'feminino', 'Light');
  dupla.attrs['data-er-member-orders'] = '7,8';
  win._liveState.rows.push({ name: 'Ana Busca', order: 7 }, { name: 'Beatriz Parceira', order: 8 });
  raiz.filhos[0].filhos.push(dupla);
  campo.value = 'beatriz';
  win._erApplyMatrixFilter();
  ok(visiveis().length === 1 && visiveis()[0] === 'Ana Busca Beatriz Parceira', 'buscar uma integrante preserva o card da dupla inteira');
  ok(index.items.length === 1 && index.items[0].textContent === 'Beatriz Parceira', 'índice da dupla mostra só a integrante buscada');
  raiz.filhos[0].filhos.pop();
  win._liveState.rows.pop(); win._liveState.rows.pop();

  campo.value = 'zzz-nao-existe';
  win._erApplyMatrixFilter();
  ok(visiveis().length === 0 && vazio.style.display === '', 'sem resultado, aparece o aviso "Ninguém encontrado"');

  campo.value = '';
  win._erApplyMatrixFilter();
  ok(visiveis().length === 6, 'limpar a busca traz todo mundo de volta, voltaram ' + visiveis().length);
  ok(caixasVisiveis() === 2, 'e as caixas todas de volta');
  ok(raiz.querySelectorAll('[data-er-count]').every((e) => e.textContent === '(3)'), 'com a contagem original');
  win._filterBarState.analise.gender = 'Masc';
  win._erApplyMatrixFilter();
  ok(visiveis().length === 0 && vazio.style.display === '', 'filtro de gênero sem correspondência mostra vazio');
  win._filterBarState.analise.gender = 'Fem';
  win._filterBarState.analise.skill = 'Light';
  win._erApplyMatrixFilter();
  ok(visiveis().length === 6, 'gênero Fem + categoria Light recuperam os chips sem mudar sua ordem');
  const homonimo = pessoa('Ana Maria', 'masculino', 'Light');
  homonimo.attrs['data-er-order'] = '9';
  win._liveState.rows.push({ name: 'Ana Maria', order: 9 });
  raiz.filhos[0].filhos.push(homonimo);
  campo.value = 'ana';
  win._erApplyMatrixFilter();
  ok(index.items.length === 0, 'índice não inclui nome de card oculto pelo filtro de gênero');
});

console.log((fail === 0 ? '✅' : '❌') + ' analise-barra-de-busca: ' + pass + ' asserções, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
