/* O "VER MENOS" DE NOVIDADES ACOMPANHA A ROLAGEM — DENTRO DA SEÇÃO
 *
 * Pedido do dono (24/ago/2026, com o print da tela inicial): _"esse ver menos da sessão de
 * novidades deve scrollar junto com o scroll da página dentro da sessão. apenas o ver menos e
 * apenas dentro da sessão de novidades."_
 *
 * Aberta, a seção fica longa (dezenas de cards): pra fechar era preciso rolar TUDO de volta
 * até o cabeçalho. Agora a pílula viaja com a rolagem — e para onde a seção acaba.
 *
 * COMO: um TRILHO de altura ZERO, `position:sticky`, filho DIRETO de #novidades-section. O
 * alcance de um sticky é o box do PAI, então ele nasce no topo da seção e morre no fim dela —
 * é isso que faz o "apenas dentro da sessão" ser estrutural, e não um listener de scroll.
 *
 * DUAS ARMADILHAS que o teste trava:
 *  • `position:fixed` resolveria a viagem e QUEBRARIA o "apenas dentro da sessão" (a pílula
 *    ficaria na tela na página inteira, inclusive sobre "Seus últimos resultados").
 *  • tirar a pílula do fluxo do <h3> deixa o título correr POR BAIXO dela (medido: "NOVIDADES
 *    NO SEU TOR|ver menos" na tela estreita). Por isso o CALÇO invisível de mesma caixa.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };
console.log('──── "ver menos" de Novidades acompanha a rolagem ────');

// recorte do bloco da seção Novidades (do <div id="novidades-section"> até o <h3> do título)
const ini = dash.indexOf('<div id="novidades-section"');
const fim = dash.indexOf('📣 Novidades no seu torneio', ini);
ok(ini > 0 && fim > ini, 'achei o bloco da seção Novidades');
const bloco = dash.slice(ini, fim + 400);

ok(/id="nov-toggle-rail"[^']*position:sticky/.test(bloco), 'o trilho é STICKY');
ok(!/id="nov-toggle-rail"[^']*position:fixed/.test(bloco),
  '  → e NUNCA fixed (fixed sairia da seção — o pedido é "apenas dentro da sessão")');
ok(/id="nov-toggle-rail"[^']*top:var\(--scroll-anchor/.test(bloco),
  '  → gruda em --scroll-anchor, não em px cravado (senão some sob a barra)');
ok(/id="nov-toggle-rail"[^']*height:0/.test(bloco),
  '  → altura ZERO: o trilho não empurra o conteúdo da seção');
ok(/id="nov-toggle-rail"[^']*pointer-events:none/.test(bloco) && /pointer-events:auto/.test(bloco),
  '  → o trilho não rouba o toque dos cards; só a pílula recebe clique');
ok(/<div id="novidades-section"[\s\S]{0,220}position:relative/.test(dash),
  'a seção é o contexto do sticky (o alcance é o box do pai)');

// a pílula continua sendo O MESMO controle (mesmo id → mesma sincronia de texto)
ok(/id="nov-toggle-tag" onclick="window\._toggleNovidadesCollapse\(\)"/.test(bloco),
  'a pílula é clicável e chama o MESMO toggle');
ok(/_spSyncHint\(novSec, 'data-nov-collapsed', 'nov-toggle-tag'/.test(dash),
  '  → e quem escreve "ver mais"/"ver menos" segue sendo _spSyncHint (uma decisão só)');
ok(/background:linear-gradient\(rgba\(125,211,252,0\.14\),rgba\(125,211,252,0\.14\)\),var\(--bg-card/.test(bloco),
  'a pílula tem fundo OPACO — rolando, ela passa por cima dos cards');

// o calço que devolve ao título o limite que ele tinha
ok(/data-tag-spacer-for="nov-toggle-tag"[^']*visibility:hidden/.test(dash),
  'o calço invisível reserva a caixa da pílula no cabeçalho');
ok(/data-tag-spacer-for="nov-toggle-tag"[\s\S]{0,400}>ver menos</.test(dash),
  '  → com o texto MAIS LARGO dos dois estados: é tamanho fixo, não espelho de estado');
ok(/querySelectorAll\('\[data-tag-spacer-for="' \+ tagId \+ '"\]'\)/.test(dash),
  '  → e ele some junto com a pílula quando não sobra nada a mostrar');

// ⛔ APENAS NOVIDADES: "Seus últimos resultados" não ganhou trilho nenhum
const mrIni = dash.indexOf('<div id="meus-resultados-section"');
const mrBloco = dash.slice(mrIni, mrIni + 4000);
ok(mrIni > 0 && !/position:sticky/.test(mrBloco),
  '"Seus últimos resultados" NÃO tem pílula flutuante (o pedido é só em Novidades)');
ok(/_verMaisTag\('mr-toggle-tag'/.test(dash),
  '  → e continua com a tag no cabeçalho, como sempre foi');

console.log(fail === 0
  ? '\n✅ ver-menos-de-novidades-acompanha-a-rolagem: OK (' + pass + ')'
  : '\n❌ ver-menos-de-novidades-acompanha-a-rolagem: ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
