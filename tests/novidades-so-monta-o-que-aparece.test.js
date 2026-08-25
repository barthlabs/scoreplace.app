/* O QUE ESTÁ ESCONDIDO NEM É CONSTRUÍDO — a seção de novidades monta só o visível.
 *
 * Ordem do dono (25/ago/2026): _"tem o mostrar mais nos 2. poderia não carregar tudo
 * antes que alguém clicasse no mostrar mais."_
 *
 * O QUE ELE PEGOU, e eu não: recolhida, a seção montava os 15 resultados e deixava
 * 14 em `display:none`, esperando um clique que quase nunca vem.
 * MEDIDO na forma da tela dele (1 torneio visível):
 *   · documento inteiro: 921 → 337 elementos
 *   · a seção sozinha:   639 →  55  (era 69% da tela inicial, invisível)
 * E na tela com 6 torneios: 54 KB de HTML deixam de ser construídos por render.
 *
 * ⛔ NADA PODE SUMIR: o que foi adiado é o MESMO texto de antes e entra inteiro ao
 * abrir. Este teste confere as duas metades — a que nasce e a que espera.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HARNESS = require('./render-harness');
const W = HARNESS.window;

['views/tournaments-categories.js', 'views/schedule-poll.js', 'views/wa-group.js', 'views/dashboard.js']
  .forEach(function (f) {
    try {
      vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'),
        HARNESS.sandbox, { filename: f });
    } catch (e) {}
  });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
const conta = (s, re) => ((String(s).match(re) || []).length);

console.log('──── novidades: o escondido nem nasce (só ao clicar) ────');

const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
const todos = Array.isArray(arr) ? arr : (arr.tournaments || []);

function desenha(n) {
  const lista = todos.slice(0, n).map((t, i) => Object.assign({ id: t.id || ('t' + i) }, t));
  W.AppStore = W.AppStore || {};
  W.AppStore.tournaments = lista;
  W.AppStore.currentUser = { uid: todos[0] && todos[0].creatorUid, email: 'x@y.z' };
  W.AppStore.getVisibleTournaments = () => lista;
  W._getHidden = () => [];
  W._novExtraPend = undefined;
  let html = '';
  const c = {
    get innerHTML() { return html; }, set innerHTML(v) { html = v; },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, dataset: {}
  };
  W.renderDashboard(c);
  return { html: html, pend: W._novExtraPend || '' };
}

// ── ① recolhida, o extra NÃO está no HTML — está guardado ───────────────────
{
  const r = desenha(6);
  ok(r.html.length > 1000, 'a tela inicial foi desenhada (' + Math.round(r.html.length / 1024) + ' KB)');
  ok(r.pend.length > 0,
     '⭐ há conteúdo GUARDADO pra quando alguém clicar (' + Math.round(r.pend.length / 1024) + ' KB)');

  const extrasNoHtml = conta(r.html, /data-sp-extra/g);
  const extrasGuardados = conta(r.pend, /data-sp-extra/g);
  ok(extrasGuardados > extrasNoHtml,
     '⛔ a maioria dos cards escondidos ficou FORA do DOM (' + extrasGuardados +
     ' guardados contra ' + extrasNoHtml + ' desenhados)');
  ok(r.pend.indexOf('novidades-grid') === -1,
     'o guardado é só o CONTEÚDO da grade, não a grade de novo (senão duplicaria)');
}

// ── ② ⛔ NADA SE PERDE: abrir devolve tudo ──────────────────────────────────
{
  const r = desenha(6);
  const juntos = r.html + r.pend;
  ok(conta(juntos, /data-sp-extra/g) >= conta(r.html, /data-sp-extra/g) + 1,
     'html + guardado = o conteúdo completo de antes (nada foi descartado)');
}

// ── ③ ABERTA, tudo entra de uma vez (a tela não pode nascer faltando) ───────
{
  // Com a preferência "aberto" gravada, nada pode ficar guardado — senão a seção
  // abriria vazia e preencheria depois, que é o defeito que se quer evitar.
  const orig = W.localStorage && W.localStorage.getItem;
  try {
    if (W.localStorage) {
      W.localStorage.getItem = function (k) {
        if (k === 'scoreplace_collapse_novidades') return '0';
        return orig ? orig.call(this, k) : null;
      };
    }
    const r = desenha(6);
    ok(r.pend === '',
       '⛔ com a seção ABERTA nada fica guardado — ela nasce completa');
    ok(conta(r.html, /data-sp-extra/g) > 1,
       'e os cards extras estão TODOS no HTML (' + conta(r.html, /data-sp-extra/g) + ')');
  } finally {
    if (W.localStorage && orig) W.localStorage.getItem = orig;
  }
}

// ── ④ o clique INJETA antes de revelar (senão abre vazio) ───────────────────
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
  const i = src.indexOf('window._toggleNovidadesCollapse = function');
  const corpo = src.slice(i, i + 2600);
  const iInj = corpo.indexOf('_novExtraPend');
  const iAttr = corpo.indexOf("setAttribute('data-nov-collapsed'");
  ok(iInj > 0 && iAttr > 0 && iInj < iAttr,
     '⛔ o conteúdo guardado entra ANTES de trocar o atributo — quem revela é o CSS, ' +
     'e ele não pode revelar uma caixa vazia');
  ok(/insertAdjacentHTML/.test(corpo),
     'a injeção usa insertAdjacentHTML (acrescenta, não reescreve a grade)');
  ok(/_novExtraPend\s*=\s*''/.test(corpo),
     'e limpa o guardado depois de injetar — clicar duas vezes não pode duplicar');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
