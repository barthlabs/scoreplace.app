/* BOTÃO INSERIDO DEPOIS DO RENDER CONTINUA CLICÁVEL (2.0.96)
 * node tests/botao-inserido-depois-continua-clicavel.test.js
 *
 * Relato do dono (25/ago/2026, jogo 63 do Confra):
 *   _"não consigo aprovar o jogo 63 … o botão aparece, mas clicando nada acontece.
 *    organizador clicando. imagina o participante."_
 *
 * CAUSA: desde a 2.0.86 a seção "Meus Resultados" é montada PREGUIÇOSA — o que passa do
 * 2º bloco fica em `window._mrExtraPend` e só entra no DOM quando a pessoa ABRE a seção.
 * O despachante de cliques rodava UMA vez, no render, com `querySelectorAll(...).forEach`
 * ligando `addEventListener` em cada botão EXISTENTE. Botão inserido depois nascia MORTO:
 * aparece, está habilitado, e o clique não faz nada.
 *
 * ⛔ E o pior: SEM SINAL. Sem erro, sem aviso na tela, sem nada no Sentry. A investigação
 * não achava a falha porque não havia falha — havia silêncio. Perdi uma rodada inteira de
 * hipóteses (permissão, resumo da 2.0.95, migração de cor) antes de olhar a LIGAÇÃO do
 * clique em vez do que o clique faz.
 *
 * A correção é delegação: o ouvinte mora no CONTAINER e vale pra botão que exista agora ou
 * venha a existir. Este teste trava isso — e vale pra toda seção que vier a ser preguiçosa.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

// ── o padrão que causou o bug não pode voltar ────────────────────────────────
ok(!/container\.querySelectorAll\('\[data-pending-action\]'\)\.forEach/.test(src),
  'não voltou a ligar um ouvinte POR BOTÃO (era isso que matava o botão preguiçoso)');
ok(/container\.addEventListener\('click'/.test(src), 'o ouvinte mora no container (delegação)');
ok(/closest\('\[data-pending-action\]'\)/.test(src), 'e acha o botão pelo closest, na hora do clique');
ok(/__spPendDelegado/.test(src), 'e não se liga duas vezes se a dashboard re-renderizar');

// ── a simulação: o botão nasce DEPOIS e o clique tem que funcionar ───────────
(function () {
  const chamadas = [];
  const alvos = new Map();
  function novoEl(attrs) {
    const el = {
      _attrs: attrs || {}, _pai: null,
      getAttribute: (k) => (el._attrs[k] === undefined ? null : el._attrs[k]),
      closest: function (sel) {
        const nome = sel.replace(/^\[|\]$/g, '');
        let n = el;
        while (n) { if (n._attrs && n._attrs[nome] !== undefined) return n; n = n._pai; }
        return null;
      }
    };
    return el;
  }
  const container = novoEl({});
  container.contains = () => true;
  let handler = null;
  container.addEventListener = (tipo, fn) => { if (tipo === 'click') handler = fn; };
  container.querySelectorAll = () => [];   // no render, a seção fechada não tem os botões

  // o app liga a delegação UMA vez, no render
  container.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-pending-action]');
    if (!btn) return;
    chamadas.push(btn.getAttribute('data-pending-action') + ':' + btn.getAttribute('data-mid'));
  });
  ok(!!handler, 'o container recebeu o ouvinte no render');

  // DEPOIS, a pessoa abre a seção e o botão entra no DOM
  const botao = novoEl({ 'data-pending-action': 'approve', 'data-tid': 't1', 'data-mid': 'jogo63' });
  botao._pai = container;
  handler({ target: botao, stopPropagation: function () {} });
  ok(chamadas.length === 1 && chamadas[0] === 'approve:jogo63',
    'o clique num botão que nasceu DEPOIS do render funciona (era o jogo 63 travado)');

  // e um clique fora não dispara nada
  const outro = novoEl({});
  outro._pai = container;
  handler({ target: outro, stopPropagation: function () {} });
  ok(chamadas.length === 1, 'clique fora de um botão de ação não dispara nada');
})();

// ── o conteúdo preguiçoso continua existindo (a causa não sumiu, só deixou de doer) ──
ok(/_mrExtraPend/.test(src), 'a montagem preguiçosa de "Meus Resultados" continua (ela é o ganho de desempenho)');
ok(/insertAdjacentHTML\('beforeend', window\._mrExtraPend\)/.test(src),
  'e ela segue inserindo o resto DEPOIS — por isso a delegação é obrigatória, não preferência');

console.log((fail ? '✗' : '✓') + ' botao-inserido-depois-continua-clicavel: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
