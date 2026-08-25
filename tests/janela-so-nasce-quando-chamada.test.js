/* JANELA SÓ NASCE QUANDO É CHAMADA — nada invisível é construído no arranque.
 *
 * Ordem do dono (25/ago/2026): _"nada que não estiver visível deve ser carregado"_ ·
 * _"é o tipo de coisa que deveria carregar apenas quando chamado"_.
 *
 * ⭐ O NÚMERO QUE FECHOU A INVESTIGAÇÃO, medido NO APARELHO DELE (Sentry, release
 * 2.0.83, durante uma travada de 3.766ms rolando pra cima):
 *
 *   nos=3645 · onde: #modal-help=1609  #modal-create-tournament=835
 *                    #app=567          #modal-profile=327
 *
 * O aplicativo VISÍVEL tinha 567 elementos. As três janelas FECHADAS somavam 2.771 —
 * **76% do documento era janela que ninguém abriu.** E elas não eram `display:none`:
 * ficavam com `opacity:0`, ou seja, continuavam no layout e na pintura, cada uma com
 * `backdrop-filter: blur(4px)` em tela cheia.
 *
 * ⛔ POR QUE UM TESTE, E NÃO SÓ O CONSERTO: as três já tinham guarda de "só constrói
 * se não existir" — o que as trazia de volta era uma CHAMADA no arranque. Uma linha
 * dessas volta fácil, e ninguém percebe: a tela fica igual, só mais pesada.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── janela só nasce quando é chamada ────');

const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const main = R('js/main.js');
const ui = R('js/ui.js');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── ① ⛔ NENHUMA das três é construída no arranque ───────────────────────────
{
  const vivo = semComentarios(main);
  [['setupHelpModal', '#modal-help', 1609],
   ['setupProfileModal', '#modal-profile', 327],
   ['setupCreateTournamentModal', '#modal-create-tournament', 835],
   // 2.0.85: as duas restantes seguem o mesmo caminho. ⚠️ `setupQuickCreateModal`
   // era uma IIFE — construía no arranque sem sequer existir no `window`, então
   // não aparecia numa busca por "quem chama".
   ['setupLoginModal', '#modal-login', 0],
   ['setupQuickCreateModal', '#modal-quick-create', 0]].forEach(function (t) {
    const nome = t[0], id = t[1], nos = t[2];
    // chamada "solta" no arranque = a função invocada sem estar protegida por uma
    // checagem de ausência do modal na MESMA linha ou logo acima.
    const chamadas = [];
    vivo.split('\n').forEach(function (l, i) {
      // ⚠️ DEFINIÇÃO não é CHAMADA. Duas formas enganam a busca ingênua, e as duas
      // já me deram falso positivo aqui:
      //   `function setupX() {`                       (declaração)
      //   `window.setupX = function setupX() {`       (expressão nomeada)
      if (/^\s*(async\s+)?function\s/.test(l)) return;
      if (/=\s*(async\s+)?function\b/.test(l)) return;
      if (new RegExp('(^|[^.\\w])' + nome + '\\s*\\(\\s*\\)').test(l)) chamadas.push({ i: i, l: l.trim() });
    });
    const soltas = chamadas.filter(function (c) {
      const volta = vivo.split('\n').slice(Math.max(0, c.i - 3), c.i + 1).join(' ');
      return !/getElementById\(|!document\./.test(volta);
    });
    ok(soltas.length === 0,
       '⛔ ' + nome + ' NÃO é chamada no arranque (' + id +
       (nos ? ' = ' + nos + ' elementos no aparelho do dono' : '') + ')' +
       (soltas.length ? ' — achei: ' + soltas.map(function (x) { return x.l.slice(0, 50); }).join(' | ') : ''));
  });
}

// ── ② a porta única constrói sob demanda ────────────────────────────────────
{
  ok(/_MODAIS_SOB_DEMANDA/.test(ui), 'existe o registro de janelas sob demanda (js/ui.js)');
  ['modal-help', 'modal-profile', 'modal-create-tournament',
   'modal-login', 'modal-quick-create'].forEach(function (id) {
    ok(new RegExp("'" + id + "'").test(ui), '  · ' + id + ' está no registro');
  });
  const i = ui.indexOf('function openModal(');
  const corpo = ui.slice(i, i + 400);
  ok(/_garanteModal\(modalId\)/.test(corpo),
     '⭐ openModal chama _garanteModal ANTES de procurar o elemento');
  const iG = corpo.indexOf('_garanteModal(modalId)');
  const iGet = corpo.indexOf('getElementById(modalId)');
  ok(iG >= 0 && iGet > iG,
     '⛔ e nessa ordem — procurar primeiro devolveria null e a janela não abriria');
}

// ── ③ ⛔ construir sob demanda não pode DUPLICAR ────────────────────────────
// Sem guarda de idempotência, abrir 2× criaria dois #modal-help.
{
  ok(/if \(document\.getElementById\('modal-help'\)\) return;/.test(main),
     'setupHelpModal sai cedo se o modal já existe (abrir 2× não duplica)');
  const ct = R('js/views/create-tournament.js');
  ok(/if \(!document\.getElementById\('modal-create-tournament'\)\)/.test(ct),
     'setupCreateTournamentModal só constrói quando não existe');
  const iGar = ui.indexOf('function _garanteModal');
  const g = ui.slice(iGar, iGar + 400);
  ok(/document\.getElementById\(modalId\)\) return;/.test(g),
     '⛔ e a própria porta já devolve cedo se a janela existir');
}

// ── ④ a construção sob demanda não pode derrubar a abertura ────────────────
{
  const iGar = ui.indexOf('function _garanteModal');
  const g = ui.slice(iGar, iGar + 500);
  ok(/try\s*\{/.test(g) && /catch/.test(g),
     'a construção roda em try/catch — janela que falha ao montar não impede o resto');
}

// ── ⑤ os caminhos que já sabiam construir continuam de pé ──────────────────
// A rota #help e a #profile movem o modal pro view-container; elas JÁ checavam a
// ausência antes. Se alguém tirar essas checagens, a rota abre vazia.
{
  ok(/!document\.getElementById\('modal-help'\)[\s\S]{0,120}setupHelpModal/.test(main),
     'a rota #help continua construindo se a janela não existir');
  const auth = R('js/views/auth.js');
  ok(/!document\.getElementById\('modal-profile'\)[\s\S]{0,140}setupProfileModal/.test(auth),
     'a rota #profile idem');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
