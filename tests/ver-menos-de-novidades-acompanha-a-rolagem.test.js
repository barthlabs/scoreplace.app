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

// ── A PÍLULA PARA COM A MESMA FOLGA EMBAIXO ─────────────────────────────────────────
// _"o ver mais tem uma margem do seu topo ao topo do box. ao rolar até a base da seção deve
// parar com a mesma margem da sua base à base do box. agora está passando desse ponto."_
// Caixa de altura 0 chega até a base do pai e a pílula sai por fora (medido: 6,4px além da
// borda). A margem inferior do tamanho da pílula sobe o limite do sticky exatamente isso.
ok(/margin-bottom:' \+ _pilulaH/.test(bloco),
  'o trilho reserva embaixo o tamanho da pílula (a folga fica simétrica)');
ok(/var _pilulaH = 'calc\(0\.84rem \+ 8px\)'/.test(dash),
  '  → e esse tamanho é a caixa da pílula em rem (0.7rem × 1.2 + padding + borda), não px cravado');
ok(/margin-top:calc\(-1 \* ' \+ _pilulaH/.test(dash),
  '  → o <h3> devolve ao fluxo o que a margem tomou (a seção não muda de altura)');
ok(!/margin-bottom:calc\(-/.test(bloco),
  '  → ⛔ nunca margem NEGATIVA no trilho: ela ESTENDE o limite e a pílula volta a passar');
ok(/id="nov-toggle-rail"[\s\S]{0,260}pointer-events:none/.test(bloco) && /pointer-events:auto/.test(bloco),
  '  → o trilho não rouba o toque dos cards; só a pílula recebe clique');
ok(/<div id="novidades-section"[\s\S]{0,220}position:relative/.test(dash),
  'a seção é o contexto do sticky (o alcance é o box do pai)');

// a pílula continua sendo O MESMO controle (mesmo id → mesma sincronia de texto)
ok(/attrs: ' onclick="window\._toggleNovidadesCollapse\(\)"/.test(bloco),
  'a pílula é clicável e chama o MESMO toggle');
ok(/_spSyncHint\(novSec, 'data-nov-collapsed', 'nov-toggle-tag'/.test(dash),
  '  → e quem escreve "ver mais"/"ver menos" segue sendo _spSyncHint (uma decisão só)');
// ── SÓ O "VER MENOS" VIAJA; O "VER MAIS" FICA PARADO ────────────────────────────────
// Ordem do dono (24/ago/2026): _"apenas o ver menos deve scrollar. o ver mais fica fixo."_
// Fechada, a seção é curta — não há lista pra percorrer, então flutuar não serve pra nada e
// ainda tira a etiqueta do lugar onde ela sempre esteve. São DOIS elementos se revezando pelo
// MESMO atributo que já governa aberto/fechado: sem listener, sem re-render.
// MEDIDO no navegador: aberta, a pílula gruda em 72px (a âncora) e a do cabeçalho fica
// `hidden` segurando o espaço; fechada, o trilho é `none` e o "ver mais" fica a 16px do topo
// da seção — os mesmos 16 depois de rolar 60px.
ok(/data-nov-collapsed="1"\] #nov-toggle-rail\{display:none !important;\}/.test(dash),
  'fechada, o trilho some — nada flutua');
ok(/!important/.test((dash.match(/#nov-toggle-rail\{[^}]*\}/) || [''])[0]),
  '  → com !important, senão o `display:flex` INLINE do trilho vence e ele continua flutuando');
ok(/data-nov-collapsed="0"\] #nov-toggle-fixo\{visibility:hidden;\}/.test(dash),
  'aberta, a tag do cabeçalho fica invisível — vira o calço que segura o espaço do título');
ok(/_verMaisTag\('nov-toggle-fixo', true, \{/.test(dash),
  'o "ver mais" do cabeçalho sai do MESMO builder (mesma aparência)');

// ── DUAS REGRESSÕES QUE EU CAUSEI NA 2.0.44 (bronca do dono) — travadas aqui ─────────
// ① "ver mais parou de funcionar": a pílula mora DENTRO do <h3>, que já alterna. Dar clique
//    aos dois fazia o toque disparar o dela E subir pro h3 — DOIS toggles, estado igual ao de
//    antes, botão aparentemente morto. Medido: com o clique só no h3, `toggles === 1`.
// ② "acabou com a margem superior": o <h3> sobe o tanto que a margem do trilho desce, mas
//    FECHADA o trilho é `display:none` e essa margem não existe — o negativo sobrava e comia
//    21px do topo da caixa. Medido depois do conserto: 15px nos DOIS estados.
// olha o ATRIBUTO emitido (a linha `attrs:`), não a palavra "onclick" — que aparece no
// comentário que explica justamente por que ela não deve ter clique próprio.
const _fixoTag = (dash.match(/_verMaisTag\('nov-toggle-fixo'[\s\S]{0,900}?\}\)/) || [''])[0];
const _fixoAttrs = (_fixoTag.match(/attrs: '[^']*'/) || [''])[0];
ok(!!_fixoTag && !/onclick=/.test(_fixoAttrs),
  '  → e NÃO tem onclick próprio (quem alterna é o <h3> que a contém; dois cliques se anulavam)');
ok(/data-tag-spacer-for="nov-toggle-tag"/.test(_fixoAttrs),
  '  → mas segue ligada à flutuante pra sumir junto quando não há o que mostrar');
ok(/data-nov-collapsed="0"\] #nov-h3\{margin-top:calc\(-1 \* ' \+ _pilulaH \+ '\) !important;\}/.test(dash),
  'a compensação da margem só existe com a seção ABERTA (fechada, o trilho nem está em cena)');
ok(/#nov-h3\{[^}]*!important/.test(dash),
  '  → com !important: o <h3> tem `margin:0` INLINE e sem isso o computado sai 0px (medido)');
ok(/_novHtml \+= '<h3 id="nov-h3"/.test(dash),
  '  → e o <h3> tem id pra regra alcançá-lo');
ok(/sp\.textContent = tag\.textContent;/.test(dash),
  '  → e o texto das duas sai do MESMO ponto (_spSyncHint), pra o calço reservar o texto em cena');

// ── APARÊNCIA: é a MESMA pílula das outras seções ───────────────────────────────────
// Correção do dono (24/ago): _"o ver menos ficou com uma aparência diferente (compare com o
// ver menos do últimos resultados)"_ — a flutuante tinha ganhado fundo opaco e sombra
// próprios. Desenho é UM só: as duas saem de `_verMaisTag`; o trilho só acrescenta POSIÇÃO.
ok(/_verMaisTag\('nov-toggle-tag', _novCollapsed, \{/.test(bloco),
  'a pílula flutuante sai do MESMO builder das outras (_verMaisTag)');
ok(!/linear-gradient|box-shadow/.test(bloco),
  '  → sem fundo/sombra próprios: mesma aparência de "Seus últimos resultados"');
ok(/function _verMaisTag\(id, colapsado, extra\)/.test(dash),
  '  → o builder aceita só POSIÇÃO a mais (extra), não um segundo desenho');

// ── RECOLHER LEVA AO TOPO DA SEÇÃO ─────────────────────────────────────────────────
// _"quando clicamos nele deve parecer que escondeu o que ele mostrava mas não ficar na
// posição relativa em que estava (lá pra baixo). deve mostrar o topo das novidades."_
const _tgi = dash.indexOf('window._toggleNovidadesCollapse = function');
const tgl = dash.slice(_tgi, _tgi + 4200);
ok(/if \(willCollapse\) \{/.test(tgl),
  'só ao RECOLHER a rolagem é mexida (abrir não empurra a página)');
ok(/scrollIntoView\(\{ block: 'start', behavior: 'smooth' \}\)/.test(tgl),
  '  → e leva ao TOPO da seção');
ok(/_railM\.getBoundingClientRect\(\)\.top - _topoM > 24/.test(tgl),
  '  → só quando o topo já saiu de vista (medido no próprio trilho, não em px cravado)');
ok(tgl.indexOf('_grudado = _railM') < tgl.indexOf("setAttribute('data-nov-collapsed'"),
  '  → e a medida é tirada ANTES de fechar: fechando, o trilho some e passaria a medir zero');
ok(/scroll-margin-top:var\(--scroll-anchor/.test(dash),
  '  → e o pouso respeita a âncora (não pousa embaixo da barra fixa)');

// o calço que devolve ao título o limite que ele tinha
ok(/data-tag-spacer-for="nov-toggle-tag"/.test(dash),
  'a tag do cabeçalho se declara ligada à flutuante (some junto quando não sobra nada)');
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
