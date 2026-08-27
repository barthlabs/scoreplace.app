/* SEÇÕES DOBRÁVEIS, COM MEMÓRIA (leva 2.1.25)
 *
 * Ordem do dono (27/ago/2026): _"vamos na dashboard e no detalhe do torneio abreviar essas
 * sessoes de forma que possam ser expandidas e colapsadas ao gosto do usuário (e isso seja
 * lembrado) para ficar com apenas o que temos nas imagens. na previsao do tempo expande
 * clicando em proximos dias (que deve indicar como um mostrar mais/menos na linha dos
 * proximos dias) e no andamento na linha do torneio completo (mostrar mais/menos)"_.
 *
 * ⛔ UM MECANISMO SÓ (window._spDobra), e por dois motivos concretos:
 *  · as MESMAS seções aparecem na dashboard E no detalhe do torneio — duas implementações
 *    divergiriam e a mesma caixa se comportaria diferente em cada tela;
 *  · a pílula "ver mais/ver menos" já é canônica (window._spVerMaisTag). Quem recriou o
 *    desenho dela antes ouviu do dono que "o ver menos ficou com uma aparência diferente".
 *
 * ⚠️ A MEMÓRIA É POR SEÇÃO, NÃO POR TELA: fechar "próximos dias" na dashboard fecha no
 * detalhe também. É a mesma seção; guardar duas preferências pra ela seria o app
 * discordando de si mesmo.
 *
 * ⚠️ E O TOGGLE É PURO DOM, não re-render: esconder um trecho não pode custar o redesenho
 * da tela — a leva 2.1.21 acabou de provar que rolagem que se mexe sozinha é o que mais
 * incomoda.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── seções dobráveis com memória ────');

const ROOT = path.join(__dirname, '..');

// ── o mecanismo, exercitado de verdade ──────────────────────────────────────
// ⚠️ o helper MUDOU DE CASA (2.1.26): saiu do store.js pra js/views/dobra-core.js, porque
// as suítes de weather e tournaments-utils não carregam o store (é grande e traz meio app).
// Três suítes caíram com "_spDobra is not a function" no dia em que ele nasceu.
const store = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dobra-core.js'), 'utf8');
const ini = 0;
const fim = store.length;
const sb = { console };
sb.window = sb;
const mem = {};
sb.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
sb.window._safeHtml = (s) => String(s == null ? '' : s);
sb.window._spVerMaisTag = (id, colapsado, extra) =>
  '<span' + ((extra && extra.attrs) || '') + '>' + (colapsado ? 'ver mais' : 'ver menos') + '</span>';
vm.createContext(sb);
vm.runInContext(store.slice(ini, fim), sb, { filename: 'dobra' });

ok(typeof sb.window._spDobra === 'function', 'o montador da seção existe');

// nasce FECHADA quando o padrão é fechado — "ficar com apenas o que temos nas imagens"
let h = sb.window._spDobra('sec-a', '<b>Rótulo</b>', '<i>corpo</i>', false);
ok(/data-dobra="sec-a"/.test(h), 'a seção carrega a própria chave');
ok(/data-dobra-corpo="1" style="display:none;"/.test(h), '⛔ nasce FECHADA quando o padrão é fechado');
ok(/ver mais/.test(h), 'e a pílula diz "ver mais"');
ok(/_spDobraToggle\('sec-a'\)/.test(h), 'a LINHA INTEIRA é o gatilho (o dono pediu clicar no rótulo)');
ok(/event\.stopPropagation\(\)/.test(h),
   '⛔ e o clique NÃO sobe: a seção mora dentro de cards clicáveis (abrir o tempo abriria o torneio)');

// respeita o que foi lembrado
mem['scoreplace_dobra_sec-a'] = '1';
h = sb.window._spDobra('sec-a', '<b>R</b>', '<i>c</i>', false);
ok(!/display:none/.test(h) && /ver menos/.test(h),
   '⛔ o que o usuário abriu volta ABERTO na próxima vez (a memória manda sobre o padrão)');
mem['scoreplace_dobra_sec-a'] = '0';
h = sb.window._spDobra('sec-a', '<b>R</b>', '<i>c</i>', true);
ok(/display:none/.test(h),
   'e o que ele fechou volta FECHADO — mesmo numa seção cujo padrão é aberta');
delete mem['scoreplace_dobra_sec-a'];

// a memória sobrevive a localStorage indisponível (aba privada / storage bloqueado)
const sb2 = Object.assign(Object.create(null), sb);
sb2.localStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
sb2.window = sb2;
vm.createContext(sb2);
sb2.window._safeHtml = sb.window._safeHtml;
sb2.window._spVerMaisTag = sb.window._spVerMaisTag;
vm.runInContext(store.slice(ini, fim), sb2, { filename: 'dobra2' });
let quebrou = false;
try { sb2.window._spDobra('x', 'a', 'b', false); } catch (e) { quebrou = true; }
ok(!quebrou, '⛔ storage bloqueado não quebra a tela — cai no padrão e segue');

// ── as duas seções que o dono apontou ───────────────────────────────────────
const weather = fs.readFileSync(path.join(ROOT, 'js', 'views', 'weather.js'), 'utf8');
ok(/_spDobra\('previsao-proximos-dias'/.test(weather),
   '(1) a previsão dobra em "próximos dias" — agora e hoje ficam sempre visíveis');
ok(/próximos dias/.test(weather.slice(weather.indexOf("_spDobra('previsao-proximos-dias'"),
   weather.indexOf("_spDobra('previsao-proximos-dias'") + 400)),
   'e é a própria linha "próximos dias" que abre (não um botão à parte)');

const utils = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-utils.js'), 'utf8');
const iProg = utils.indexOf("_spDobra('progresso-torneio-completo'");
ok(iProg > 0, '(2) o progresso dobra em "torneio completo"');
const trechoProg = utils.slice(iProg, iProg + 700);
ok(/Torneio completo/.test(trechoProg) && /jogos \(/.test(trechoProg),
   '⛔ o CABEÇALHO fica visível fechado (rótulo E o "84/105 jogos (80%)") — esconder o ' +
   'número junto obrigaria um toque só pra saber o essencial');
ok(/_progBarPct/.test(trechoProg),
   'e o que dobra é a barra do torneio inteiro, a duração e a janela programada');

// ── a mesma seção nas DUAS telas ────────────────────────────────────────────
// A previsão e o progresso são desenhados pelo dashboard.js E pelo tournaments.js —
// como ambos chamam as MESMAS funções (_weatherSlotHtml / _renderTournamentProgress),
// a dobra vale nos dois sem código novo. Isto trava essa fiação.
const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
const det = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');
['_weatherSlotHtml', '_renderTournamentProgress'].forEach((fn) => {
  ok(dash.indexOf(fn) !== -1, 'a dashboard desenha ' + fn);
  ok(det.indexOf(fn) !== -1, 'e o detalhe do torneio também — mesma função, mesma dobra');
});

// ── o toggle aplica em TODAS as cópias da mesma seção ───────────────────────
// Na dashboard há vários cards de torneio na tela: se o toggle mexesse só no primeiro,
// duas cópias da mesma seção ficariam em estados diferentes.
ok(/querySelectorAll\('\[data-dobra="'/.test(store),
   '⛔ o toggle varre TODAS as ocorrências da seção (a dashboard mostra vários cards de uma vez)');

// ── ⛔ A TERCEIRA SEÇÃO: a CONFIGURAÇÃO do torneio (2.1.26) ─────────────────
// Ordem do dono, depois de ver as duas primeiras: _"vamos adotar o mostrar mais/menos nas
// configuracoes do torneio. padronizar isso que ficou legal"_.
// ⚠️ Ela JÁ era um <details>, e o CSS (.tourn-config-box) depende disso — converter pra div
// mexeria no visual sem necessidade. O que ele pediu foi padronizar o CONTROLE, não trocar
// a mecânica: o <details> ganhou a MESMA pílula e a MESMA memória.
ok(/_spDobraAberta\('config-torneio'/.test(utils),
   'a configuração do torneio lembra se ficou aberta');
ok(utils.indexOf("_spDobraDetails(this,") !== -1 && utils.indexOf("config-torneio") !== -1,
   'e grava a escolha quando o <details> abre ou fecha');
ok(/_spVerMaisTag\(''/.test(utils),
   '⛔ e usa a pílula CANÔNICA — recriar o desenho é o que fez o dono dizer antes que "o ' +
   'ver menos ficou com uma aparência diferente"');
// sobre o CÓDIGO: o "▾" sobrevive nos comentários que contam a história da caixa (v1.7.83)
const codUtils = utils.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
ok(!/configuração ▾/.test(codUtils), 'o "▾" solto saiu do que é renderizado');
ok(/window\._spDobraDetails = function/.test(fs.readFileSync(path.join(ROOT, 'js', 'views', 'dobra-core.js'), 'utf8')),
   'o helper do <details> mora no MESMO módulo das outras seções');

// ── e o módulo é carregado ANTES de quem o usa, nas duas pontas ─────────────
// Foi assim que ele quebrou ao nascer: morava no store.js, que as suítes de weather e
// tournaments-utils não carregam. Três suítes caíram com "_spDobra is not a function".
const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const pos = (f) => idxHtml.indexOf(f);
ok(pos('dobra-core.js') > 0 && pos('dobra-core.js') < pos('js/views/weather.js'),
   'no index.html o dobra-core vem antes do weather.js');
ok(pos('dobra-core.js') < pos('js/views/tournaments-utils.js'),
   'e antes do tournaments-utils.js');
const headless = fs.readFileSync(path.join(ROOT, 'tests', 'headless.js'), 'utf8');
ok(headless.indexOf("load('dobra-core.js')") > 0 &&
   headless.indexOf("load('dobra-core.js')") < headless.indexOf("load('tournaments-utils.js')"),
   '⛔ e o harness carrega na MESMA ordem — harness que contorna a produção testa outra coisa');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
