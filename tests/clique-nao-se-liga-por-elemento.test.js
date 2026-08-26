/* CLIQUE SE LIGA POR DELEGAÇÃO, NÃO BOTÃO A BOTÃO (2.0.96)
 * node tests/clique-nao-se-liga-por-elemento.test.js
 *
 * A LIÇÃO QUE ISTO TRAVA — e ela custou uma quadra parada.
 * Relato do dono (25/ago/2026): _"não consigo aprovar o jogo 63 … o botão aparece, mas
 * clicando nada acontece. organizador clicando. imagina o participante."_
 *
 * `querySelectorAll(sel).forEach(el => el.addEventListener('click', …))` alcança APENAS o
 * que existe naquele instante. Duas coisas rotineiras o quebram:
 *   ① montagem PREGUIÇOSA — o elemento entra no DOM depois (foi o caso: "Meus Resultados"
 *      virou preguiçosa na 2.0.86 e o botão de aprovar nasceu morto);
 *   ② REDESENHO — `innerHTML = …` destrói os elementos e os ouvintes com eles; só não
 *      quebra enquanto alguém lembrar de religar na linha seguinte.
 *
 * ⛔ E FALHA EM SILÊNCIO: sem erro, sem aviso, sem Sentry. Botão aparece, está habilitado,
 * e o clique não faz nada. Não há como um teste de comportamento pegar isso; por isso este
 * teste olha o PADRÃO.
 *
 * ⚠️ ARRASTE (dragstart/dragend/touch) fica de fora de propósito: a semântica é outra e
 * esses pontos são religados explicitamente após cada redesenho.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function arquivos(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'vendor' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const suspeitos = [];
arquivos(path.join(ROOT, 'js')).forEach(function (f) {
  const linhas = fs.readFileSync(f, 'utf8').split('\n');
  linhas.forEach(function (l, i) {
    if (!/querySelectorAll\(/.test(l)) return;
    const janela = linhas.slice(i, i + 8).join(' ');
    if (!/addEventListener\(\s*['"]click['"]/.test(janela)) return;
    suspeitos.push(path.relative(ROOT, f) + ':' + (i + 1) + '  ' +
      ((l.match(/querySelectorAll\(([^)]{0,40})/) || [])[1] || '').trim());
  });
});

ok(suspeitos.length === 0,
  'nenhum lugar liga CLIQUE elemento a elemento (' + suspeitos.length + '):\n      ' +
  suspeitos.join('\n      '));

// e os dois que foram convertidos continuam por delegação
const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
ok(/container\.addEventListener\('click'/.test(dash) && /closest\('\[data-pending-action\]'\)/.test(dash),
  'a dashboard despacha os botões de placar pendente por delegação');
const cats = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-categories.js'), 'utf8');
ok(/document\.addEventListener\('click'/.test(cats) && /closest\('\.cat-unmerge-btn'\)/.test(cats),
  'o gerenciador de categorias despacha seus botões por delegação');
ok(/__spCatMgrDelegado/.test(cats) && /__spPendDelegado/.test(dash),
  'e nenhuma das duas se liga duas vezes se a tela re-renderizar');

// o código morto do sacador não volta
const bui = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
ok(!/function _setupServeDragDrop/.test(bui),
  '_setupServeDragDrop não voltou (era função sem chamador, procurando atributo que ninguém emite)');

console.log((fail ? '✗' : '✓') + ' clique-nao-se-liga-por-elemento: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
