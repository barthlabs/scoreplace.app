/* aviso-fuso-na-ficha.test.js — O AVISO DE FUSO APARECE ONDE O ORGANIZADOR VOLTA.
 * node tests/aviso-fuso-na-ficha.test.js
 *
 * A FALHA QUE ISTO FECHA (L6.R2.2): a 2.1.81 pôs o aviso de "fuso indeterminado" só no
 * formulário de criar/editar — e é lá que o organizador passa UMA VEZ. O torneio fica meses
 * na FICHA, e é nela que ele volta todo dia. Um sorteio automático que nunca acontece por
 * falta de fuso ficava invisível no fluxo operacional: sem erro, sem log na tela, sem nada.
 *
 * O que este arquivo trava:
 *  ① a ficha avisa pro ORGANIZADOR quando o automático está ligado e o fuso não resolve;
 *  ② NÃO avisa pro visitante nem pro inscrito comum — é tarefa de quem organiza;
 *  ③ o aviso traz AÇÃO direta de editar o torneio (não é só texto);
 *  ④ ele SOME sozinho quando local/cidade/fuso passam a resolver;
 *  ⑤ não aparece quando o sorteio é manual, quando não há data, ou com torneio encerrado;
 *  ⑥ FICHA e FORMULÁRIO concordam nos mesmos casos — uma decisão só, a do `venue-geo-core`;
 *  ⑦ o texto diz as três coisas exigidas: não está agendado, o manual segue, e como corrigir.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const V = require(path.join(RAIZ, 'js', 'views', 'venue-geo-core.js'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }

/* Carrega SÓ as duas funções do store.js que interessam, num contexto mínimo. Carregar o
 * store inteiro exigiria meio app; o que se testa aqui é a DECISÃO e o HTML, e os dois
 * moram nessas duas funções. Extrai por fonte pra não haver segunda cópia da lógica. */
const storeSrc = fs.readFileSync(path.join(RAIZ, 'js', 'store.js'), 'utf8');
const ini = storeSrc.indexOf('window._avisoFusoDaFicha = function');
const fim = storeSrc.indexOf('window._patchProfileMetaSlots = function');
if (ini < 0 || fim < 0 || fim <= ini) { console.error('✗ não achei as funções do aviso no store.js'); process.exit(1); }
const trecho = storeSrc.slice(ini, fim);

/* DOM mínimo: só o que `_patchAvisoFusoNaFicha` toca. */
function novoContainer() {
  const filhos = [];
  const mk = (html) => ({ _html: html, remove() { const i = filhos.indexOf(this); if (i >= 0) filhos.splice(i, 1); },
    set outerHTML(v) { this._html = v; }, get outerHTML() { return this._html; } });
  return {
    _filhos: filhos,
    querySelector(sel) { return sel === '#ficha-aviso-fuso' ? (filhos.find((f) => f._html.indexOf('id="ficha-aviso-fuso"') !== -1) || null) : null; },
    get firstElementChild() { return filhos[0] || null; },
    insertAdjacentHTML(_pos, html) { filhos.unshift(mk(html)); },
    html() { return filhos.map((f) => f._html).join(''); }
  };
}

function ambiente(t, ehOrg, perfil) {
  const win = {
    _venueGeo: V,
    _safeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    _t: (k) => ({
      'ficha.tzUnknownTitle': 'O sorteio automático NÃO está agendado',
      'ficha.tzUnknownBody': 'fuso do local não pôde ser determinado · o sorteio manual continua disponível · escolha o local ou preencha a cidade',
      'ficha.tzUnknownCta': '✏️ Editar torneio'
    })[k] || null,
    AppStore: { isOrganizer: () => ehOrg, currentUser: perfil || null }
  };
  const ctx = vm.createContext({ window: win, console });
  vm.runInContext(trecho, ctx, { filename: 'store-aviso.js' });
  return win;
}

const AUTO = {
  id: 'tour_1', status: 'active', format: 'Liga', drawManual: false,
  drawFirstDate: '2026-09-04', drawFirstTime: '19:00', drawIntervalDays: 7,
  venue: 'Quadra do condomínio'                    // não resolve fuso nenhum
};

// ── ① e ② quem vê ────────────────────────────────────────────────────────────────────
console.log('\n▸ ① a ficha avisa o ORGANIZADOR quando o fuso não resolve');
{
  const w = ambiente(AUTO, true, {});
  const d = w._avisoFusoDaFicha(AUTO);
  ok(!!d, 'organizador recebe o aviso');
  ok(d && /NÃO está agendado/.test(d.titulo), 'e o título diz que o automático NÃO está agendado');
}
console.log('▸ ①b co-organizador vê igual (isOrganizer cobre os dois — mesmo poder)');
{
  const w = ambiente(AUTO, true, {});
  ok(!!w._avisoFusoDaFicha(AUTO), 'co-organizador (mesmo predicado) recebe o aviso');
}

console.log('▸ ② visitante e inscrito comum NÃO veem');
{
  const w = ambiente(AUTO, false, {});
  eq(w._avisoFusoDaFicha(AUTO), null, 'quem não organiza não recebe nada');
  const c = novoContainer();
  eq(w._patchAvisoFusoNaFicha(c, AUTO), false, 'e nada é inserido no DOM dele');
  eq(c.html(), '', 'container fica vazio');
}

// ── ③ ação direta ────────────────────────────────────────────────────────────────────
console.log('▸ ③ o aviso traz AÇÃO de editar o torneio');
{
  const w = ambiente(AUTO, true, {});
  const c = novoContainer();
  eq(w._patchAvisoFusoNaFicha(c, AUTO), true, 'o aviso foi inserido');
  const h = c.html();
  ok(/id="ficha-aviso-fuso"/.test(h), 'com id próprio (é elemento persistente, não toast)');
  ok(/<button/.test(h), 'tem botão');
  ok(/#create-tournament\/tour_1/.test(h), '⭐ e o botão leva pra EDIÇÃO deste torneio');
  ok(/Editar torneio/.test(h), 'com rótulo de editar');
}

// ── ④ some sozinho ──────────────────────────────────────────────────────────────────
console.log('▸ ④ resolveu o local → o aviso SOME sozinho');
{
  const w = ambiente(AUTO, true, {});
  const c = novoContainer();
  w._patchAvisoFusoNaFicha(c, AUTO);
  ok(/ficha-aviso-fuso/.test(c.html()), 'estava lá');
  const resolvido = Object.assign({}, AUTO, V.normalizarLocal({ venueLat: '-3.1', venueLon: '-60.0' }));
  eq(w._patchAvisoFusoNaFicha(c, resolvido), false, 'com coordenada válida, o patch não reinsere');
  eq(c.html(), '', '⭐ e o aviso que estava lá foi REMOVIDO');
}
console.log('▸ ④b resolve por cidade do evento e por cidade do organizador');
{
  const porCidade = Object.assign({}, AUTO, { venueCity: 'Fortaleza' });
  eq(ambiente(porCidade, true, {})._avisoFusoDaFicha(porCidade), null, 'cidade do evento resolve → sem aviso');
  const w2 = ambiente(AUTO, true, { city: 'Salvador' });
  eq(w2._avisoFusoDaFicha(AUTO), null, 'cidade do ORGANIZADOR resolve → sem aviso');
}

// ── ⑤ quando NÃO deve aparecer ──────────────────────────────────────────────────────
console.log('▸ ⑤ manual, sem data ou encerrado: não é assunto');
{
  const manual = Object.assign({}, AUTO, { drawManual: true });
  eq(ambiente(manual, true, {})._avisoFusoDaFicha(manual), null, 'sorteio manual → sem aviso');
  const semData = Object.assign({}, AUTO, { drawFirstDate: '' });
  eq(ambiente(semData, true, {})._avisoFusoDaFicha(semData), null, 'sem data agendada → sem aviso');
  const fim = Object.assign({}, AUTO, { status: 'finished' });
  eq(ambiente(fim, true, {})._avisoFusoDaFicha(fim), null, 'torneio encerrado → sem aviso');
}

// ── ⑥ ficha e formulário concordam ──────────────────────────────────────────────────
console.log('▸ ⑥ FICHA e FORMULÁRIO usam a MESMA decisão — sem segunda heurística');
{
  const casos = [
    [{}, {}], [{ venue: 'Quadra do condomínio' }, {}],
    [{ venueCity: 'Recife' }, {}], [{ venueAddress: 'Av. X — Cuiabá, MT' }, {}],
    [{ venueLat: -3.1, venueLon: -60.0 }, {}], [{ timeZone: 'America/Belem' }, {}],
    [{ timeZone: 'Nao/Existe' }, { city: 'Recife' }], [{}, { city: 'Salvador' }],
    [{ venueLat: 0, venueLon: 0 }, {}], [{ venueAddress: 'divisa SP / MS' }, {}]
  ];
  let iguais = 0;
  casos.forEach(function (c, i) {
    const t = Object.assign({}, AUTO, { venue: '' }, c[0]);
    const w = ambiente(t, true, c[1]);
    const fichaAvisa = !!w._avisoFusoDaFicha(t);
    const formAvisa = !V.fusoResolvivel(t, c[1]);      // é o mesmo predicado do formulário
    if (fichaAvisa === formAvisa) iguais++;
    else console.error('    caso ' + i + ': ficha=' + fichaAvisa + ' × formulário=' + formAvisa);
  });
  eq(iguais, casos.length, '⭐ concordam em ' + casos.length + ' casos');

  // e por FONTE: nenhuma das duas telas tem heurística própria
  const cria = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'create-tournament.js'), 'utf8');
  ok(/_venueGeo\.resolverFuso\(/.test(cria), 'o formulário chama _venueGeo.resolverFuso');
  ok(/_venueGeo\.resolverFuso\(/.test(trecho), 'e a ficha também');
  const semComentario = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  ok(!/resolvedOptions\(\)\s*\.\s*timeZone/.test(semComentario(trecho)),
    '⛔ e a ficha não deduz fuso pelo aparelho');
  ok(!/['"]-03:00['"]/.test(semComentario(trecho)) && !/['"]UTC['"]/.test(semComentario(trecho)),
    '⛔ nem por offset fixo ou UTC');
}

// ── ⑦ o texto diz as três coisas ────────────────────────────────────────────────────
console.log('▸ ⑦ o texto cobre: não agendado · manual segue · como corrigir');
{
  const pt = fs.readFileSync(path.join(RAIZ, 'js', 'i18n-pt.js'), 'utf8');
  const m = /'ficha\.tzUnknownBody':\s*'([^']*(?:\\'[^']*)*)'/.exec(pt);
  ok(!!m, 'a mensagem existe no pt-BR');
  const txt = m ? m[1] : '';
  ok(/não vai acontecer|NÃO está agendado|não pôde ser determinado/i.test(txt),
    'diz que o automático não acontece / o fuso não foi determinado');
  ok(/manual continua dispon/i.test(txt), 'diz que o sorteio MANUAL continua disponível');
  ok(/local/i.test(txt) && /cidade/i.test(txt), 'e diz como corrigir (local do evento ou cidade)');
  const en = fs.readFileSync(path.join(RAIZ, 'js', 'i18n-en.js'), 'utf8');
  ok(/'ficha\.tzUnknownBody'/.test(en) && /'ficha\.tzUnknownCta'/.test(en), 'e existe em inglês também');
}

// ── fiação: a ficha realmente chama o patch ─────────────────────────────────────────
console.log('▸ ⑧ a ficha do torneio chama o patch no render');
{
  const tv = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'tournaments.js'), 'utf8');
  ok(/_patchAvisoFusoNaFicha\(container, t\)/.test(tv),
    'renderTournaments aplica o aviso pós-render (mesmo idioma do _patchProfileMetaSlots)');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
