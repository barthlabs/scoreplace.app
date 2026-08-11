/* O diálogo não estoura a tela — node tests/dialog-fits-screen.test.js
 * "vejo lá embaixo um fantasma dos botões antigos. não estoure a tela como está
 * acontecendo. permita scrollar." O card do showConfirmDialog não tinha altura máxima:
 * crescia com o conteúdo (medidor + 3 barras + abas + lista) e o rodapé com os botões
 * saía do viewport, inalcançável.
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'notifications.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const i = src.indexOf('function showConfirmDialog');
const card = src.slice(src.indexOf('dialog.innerHTML = `', i), src.indexOf('dialog.innerHTML = `', i) + 1800);

ok(/max-height: 92%/.test(card), 'o card tem altura máxima');
ok(!/max-height: \d+vh/.test(card), 'em PORCENTAGEM, não vh (cânone de escala por área)');
ok(/display: flex;\s*\n\s*flex-direction: column;/.test(card), 'e é coluna flex, pra dividir cabeçalho/corpo/rodapé');

// o CORPO é quem rola
const corpo = card.slice(card.indexOf('${message}') - 400, card.indexOf('${message}'));
ok(/overflow-y: auto/.test(corpo), 'o corpo rola');
ok(/flex: 1 1 auto/.test(corpo), 'e é ele que ocupa a sobra');
ok(/min-height: 0/.test(corpo), 'com min-height:0 — sem isso o flex não deixa encolher e o corpo estoura');

// cabeçalho e rodapé NÃO encolhem nem somem
ok(/gap: 12px; flex: 0 0 auto;/.test(card), 'o cabeçalho não encolhe');
ok(/justify-content: flex-end; flex: 0 0 auto;/.test(card), 'e o rodapé com os botões também não');
ok(/border-top: 1px solid var\(--border-color\)/.test(card), 'o rodapé ganha borda — fica claro que é a base fixa');

// largura continua configurável (a tela do letzplay usa 760px)
ok(/max-width: \$\{maxWidth\}/.test(card), 'a largura segue vindo do caller');

// ── RODAPÉ OPCIONAL: quem tem botões próprios não mostra os nativos ─────────
// "os botões só em cima. esses de baixo têm que sair sem fantasma."
ok(/hideFooter = false/.test(src), 'showConfirmDialog aceita esconder o rodapé');
ok(/display: \$\{hideFooter \? 'none' : 'flex'\}/.test(card), 'e o rodapé some de verdade quando pedido');
ok(/id="confirm-cancel-btn"/.test(src) && /id="confirm-ok-btn"/.test(src),
  'os botões continuam no DOM (escondidos) — o fluxo de callback segue sendo um só');

{
  const rep = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/hideFooter: true/.test(rep), 'a tela do letzplay pede pra esconder o rodapé');
  const fechar = rep.slice(rep.indexOf('window._lzFecharDialogo'), rep.indexOf('window._lzFecharDialogo') + 420);
  ok(/confirm-cancel-btn'\)/.test(fechar) && /b\.click\(\)/.test(fechar),
    'o Voltar do topo dispara o botão nativo (não some com o diálogo por fora)');
  const puxar = rep.slice(rep.indexOf('window._lzPuxarDoTopo'), rep.indexOf('window._lzPuxarDoTopo') + 1800);
  ok(/confirm-ok-btn'\)/.test(puxar) && /b\.click\(\)/.test(puxar),
    'e o Puxar do topo dispara o de confirmação — senão o onConfirm nunca rodaria');
  ok(/if \(!uid\) return;/.test(puxar), 'com caminho de reserva se não houver diálogo na tela');
}

// ── AÇÕES NA LINHA DO NOME ──────────────────────────────────────────────────
// "coloca os botões alinhados com o nome, assim tiramos essa situação com vazamento e
// ocupando espaço inutilmente." A barra sticky dentro do corpo vazava por cima do
// conteúdo ao rolar e roubava uma faixa inteira de altura.
ok(/headerHtml = ''/.test(src), 'o diálogo aceita ações no cabeçalho');
const hdr = src.slice(src.indexOf('${c.icon}') - 400, src.indexOf('${c.icon}') + 1800);
ok(/\$\{headerHtml/.test(hdr), 'e as renderiza na MESMA linha do título');
ok(/flex: 1 1 auto; min-width: 0/.test(hdr), 'o título ocupa a sobra e pode encolher');
ok(/flex-wrap: wrap/.test(hdr), 'em tela estreita as ações caem pra linha de baixo em vez de vazar');
ok(/flex: 0 0 auto;">\$\{c\.icon\}/.test(hdr) || /font-size: 2rem; flex: 0 0 auto/.test(hdr),
  'o ícone não encolhe');

console.log((fail ? '✗' : '✓') + ' dialog-fits-screen: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
