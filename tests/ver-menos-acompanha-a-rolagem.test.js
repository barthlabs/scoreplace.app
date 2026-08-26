/* "VER MENOS" ACOMPANHA A ROLAGEM EM "DEMAIS JOGOS DA RODADA" (2.0.112)
 * node tests/ver-menos-acompanha-a-rolagem.test.js
 *
 * Pedido do dono (26/ago): _"aqui podíamos aplicar o mesmo ver mais/ver menos da sessão de
 * novidades da dashboard. o ver menos acompanha a rolagem para não precisar voltar lá de
 * baixo para cima se viu o que queria."_ No print dele são **102 jogos**.
 *
 * ⭐ O VALOR ESTÁ EM REUSAR, não em reimplementar: as Novidades já pagaram as armadilhas
 * (sticky de altura zero, `--scroll-anchor` em vez de px, margem POSITIVA pra pílula não
 * passar da base, pointer-events). Refazer aqui seria refazer os erros.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const br = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

// ── ① a pílula é A MESMA das Novidades ──────────────────────────────────────
ok(/window\._spVerMaisTag = _verMaisTag;/.test(dash),
  '⭐ o dashboard EXPORTA a pílula em vez de a chave recriar o desenho');
ok(/window\._spVerMaisTag/.test(br),
  '   e a chave usa ELA — desenho recriado já rendeu "o ver menos ficou com aparência diferente"');
ok(!/border-radius:999px/.test(br.slice(br.indexOf('_demaisJogosTrilho'), br.indexOf('_demaisJogosTrilho') + 1800)),
  '⛔ e a chave NÃO redesenha a pílula (nenhum estilo de pílula copiado)');

// ── ② o trilho, rodado de verdade ───────────────────────────────────────────
const i = br.indexOf('window._demaisJogosTrilho = function () {');
ok(i > 0, 'o trilho existe');
const corpoTrilho = br.slice(i, br.indexOf('\n};', i) + 3);
const ctx = { window: { _spVerMaisTag: (id, col, ex) => '<span PILULA ' + ((ex && ex.style) || '') + '>' } };
vm.createContext(ctx);
vm.runInContext(corpoTrilho + '\nthis.f = window._demaisJogosTrilho;', ctx);
const html = ctx.f();

ok(/position:sticky/.test(html), '⭐ é sticky — viaja com a rolagem DENTRO da seção');
ok(/height:0/.test(html),
  '⛔ altura ZERO: qualquer altura empurraria os cards pra baixo e a lista mudaria de lugar');
ok(/top:var\(--scroll-anchor,120px\)/.test(html),
  '⛔ o topo sai de `--scroll-anchor`, NUNCA px cravado — com número fixo metade da pílula some sob a barra sticky');
ok(/margin-bottom:calc\(0\.84rem \+ 8px\)/.test(html),
  '⭐ margem POSITIVA do tamanho da pílula: caixa de altura 0 chega à base do pai e a pílula sairia por fora');
ok(!/margin-bottom:-/.test(html) && !/margin-top:-/.test(html),
  '⛔ e NÃO é margem negativa — ela ESTENDE o retângulo e a pílula torna a passar (medido nas Novidades)');
ok(/pointer-events:none/.test(html), '⛔ o trilho não rouba o toque dos cards por baixo…');
ok(/pointer-events:auto/.test(html), '   …e só a pílula recebe clique');

// sem a pílula canônica, não inventa uma
const ctx2 = { window: {} }; vm.createContext(ctx2);
vm.runInContext(corpoTrilho + '\nthis.f = window._demaisJogosTrilho;', ctx2);
ok(ctx2.f() === '',
  '⛔ sem a pílula canônica devolve VAZIO em vez de desenhar outra — melhor sem botão que com dois desenhos');

// ── ③ fechar volta pro cabeçalho ────────────────────────────────────────────
const j = br.indexOf('window._demaisJogosFechar = function (el) {');
ok(j > 0, 'o fechar existe');
const corpoFechar = br.slice(j, br.indexOf('\n};', j) + 3);
const rolagens = [];
const sumario = { style: {}, scrollIntoView: (o) => rolagens.push(o) };
const det = { open: true, querySelector: () => sumario };
const ctx3 = { window: { _reflowChrome: () => {} } }; vm.createContext(ctx3);
vm.runInContext(corpoFechar + '\nthis.f = window._demaisJogosFechar;', ctx3);
ctx3.f({ closest: () => det });

ok(det.open === false, '⭐ clicar recolhe a seção');
ok(rolagens.length === 1 && rolagens[0].block === 'start',
  '⭐ e VOLTA pro cabeçalho — senão, com a lista recolhida, a pessoa fica num ponto muito abaixo de onde a seção existe');
ok(!rolagens[0].behavior,
  '⚠️ instantâneo, NÃO `smooth`: a lista some no mesmo quadro e animar rumo a um ponto que encolheu dá pulo tremido');
ok(sumario.style.scrollMarginTop === 'var(--scroll-anchor, 0px)',
  '   com a mesma margem da barra sticky');

// ── ④ está nos DOIS expansores ──────────────────────────────────────────────
// ⚠️ as chamadas são GUARDADAS (`typeof … === 'function'`): os harnesses carregam trechos
// do arquivo e o global pode não existir. Sem botão é degradação aceitável; explodir não.
const chamadasTrilho = (br.match(/window\._demaisJogosTrilho\(\)/g) || []).length;
ok(chamadasTrilho === 2, '⭐ os DOIS "Demais jogos" (Liga e Rei/Rainha) têm o trilho (achei ' + chamadasTrilho + ')');
ok((br.match(/typeof window\._demaisJogosTrilho === 'function'/g) || []).length === 2,
  '⛔ e as duas chamadas são GUARDADAS — render que explode é pior que botão que falta');

// ── ⑤ OS DOIS ESTADOS — eu tinha entregue SÓ UM ─────────────────────────────
/* O dono pediu "o mesmo ver mais/ver menos da sessão de novidades" e eu entreguei só o
 * "ver menos" flutuante. FECHADA, a seção continuava com o `▸ Demais jogos da rodada (N)`
 * cru, sem pílula nenhuma — e é justamente o estado FECHADO que ele estava olhando:
 * _"é no detalhe do torneio o ver mais/ver menos"_.
 * ⭐ Os dois se revezam pelo `[open]` do próprio `<details>`: sem listener, sem re-render,
 * e sem um SEGUNDO lugar guardando "está aberto?" pra discordar do primeiro. */
ok(/window\._demaisJogosPilulaFixa = function/.test(br), '⭐ existe a pílula do estado FECHADO');
const iFixa = br.indexOf('window._demaisJogosPilulaFixa = function');
const fixa = br.slice(iFixa, br.indexOf('\n};', iFixa));
ok(/_spVerMaisTag\('', true,/.test(fixa),
  "   e ela nasce COLAPSADA (diz 'ver mais') — texto fixo, sem nada pra sincronizar");
ok(!/onclick/.test(fixa),
  '⛔ e SEM onclick próprio: ela mora dentro do `<summary>`, que já alterna. Clique nos dois ' +
  'faria o toque disparar o dela E subir pro summary — DOIS toggles, e o botão parecendo morto ' +
  '(foi a bronca que as Novidades levaram na 2.0.44)');

const iCss = br.indexOf('window._demaisJogosCss = function');
ok(iCss > 0, 'e o CSS que reveza os dois');
const css = br.slice(iCss, br.indexOf('\n};', iCss));
ok(/details\[data-dj\]\[open\] > summary \[data-dj-fixa\]\{display:none/.test(css),
  '⭐ ABERTA: a pílula do cabeçalho some…');
ok(/details\[data-dj\]:not\(\[open\]\) \[data-dj-trilho\]\{display:none !important/.test(css),
  '⭐ …e FECHADA: o trilho some — cada estado tem UM controle visível');
ok(/!important/.test(css),
  '⚠️ com `!important`: o trilho carrega `display:flex` INLINE e o inline vence a folha ' +
  '(mesma armadilha medida que as Novidades documentam duas vezes)');

ok((br.match(/_demaisJogosPilulaFixa\(\)/g) || []).length === 2,
  '⭐ e a pílula fechada está nos DOIS expansores, como o trilho');
ok((br.match(/data-dj[ >'"]/g) || []).length >= 2, 'os `<details>` carregam a marca que o CSS usa');

console.log((fail ? '✗' : '✓') + ' ver-menos-acompanha-a-rolagem: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
