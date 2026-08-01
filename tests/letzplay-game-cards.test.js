/* Os jogos do diálogo usam os MESMOS cards do #histórico — node tests/letzplay-game-cards.test.js
 * Pedido do dono (30/jul/2026), comparando as duas telas lado a lado: "essa apresentação
 * dos jogos deve ser como nas estatísticas". Eu tinha escrito uma lista de uma linha à
 * parte — é assim que duas telas que mostram a mesma coisa divergem.
 */
const { window, load } = require('./headless.js');
if (typeof global.document === 'undefined') global.document = { addEventListener: function () {} };
if (!window.document) window.document = global.document;
require('vm').runInContext(
  require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'letzplay-model.js'), 'utf8'),
  require('./headless.js').sandbox, { filename: 'letzplay-model.js' });
load('match-history.js');
load('tournaments-enrollment-report.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const imp = { handle: 'camilacalia', importedAt: '2026-07-30T20:21:51.665Z', games: [
  { lzId: '1', date: 'Quarta, 29/07/26', club: 'paineiras-bt', official: false, rankingId: '55291',
    competition: 'Fem C', myScore: 6, oppScore: 3, won: true,
    partnerName: 'Kelly Barth', partnerHandle: 'KellyBarth1', oppNames: ['Ana', 'Bia'], oppHandles: ['ana', 'bia'] },
  { lzId: '2', date: 'Terça, 28/07/26', club: 'paineiras-bt', official: true, tourneyId: '11',
    competition: 'Feminina C', myScore: 4, oppScore: 6, won: false,
    oppNames: ['Cris'], oppHandles: ['cris'] }
] };

ok(typeof window._spLzGameItems === 'function', 'match-history exporta o mapeamento de jogos');
ok(typeof window._spGameCard === 'function', 'match-history exporta o card');
ok(typeof window._lzGameCards === 'function', 'o diálogo tem o renderizador de cards');

const html = window._lzGameCards(imp, 'Camila Putignani');
ok(/Camila Putignani \/ Kelly Barth/.test(html), 'o card traz a dupla dela na linha de cima');
ok(/Ana \/ Bia/.test(html), 'e a dupla adversária na de baixo');
ok(/LetzPlay/.test(html), 'traz o selo da fonte, como no #histórico');
ok(/#22c55e/.test(html) && /#ef4444/.test(html), 'vencedor em verde e perdedor em vermelho');
ok(/Ranking · Fem C/.test(html) && /Torneio · Feminina C/.test(html), 'linha de contexto igual à do #histórico');
ok(/Paineiras/.test(html), 'mostra o local');
ok(html.indexOf('29') < html.indexOf('28'), 'mais recente primeiro');

// o card do diálogo é EXATAMENTE o do #histórico — nenhuma cópia paralela
const it = window._spLzGameItems(imp)[0];
ok(html.indexOf(window._spGameCard(it, 'Camila Putignani')) >= 0,
  'o HTML do diálogo contém o card gerado pela função do #histórico (sem markup paralelo)');

// e sem o módulo do histórico não quebra: cai na lista de uma linha
const salvo = window._spLzGameItems; window._spLzGameItems = undefined;
ok(window._lzGameCards(imp, 'x') === null, 'sem o módulo do histórico, devolve null pra cair no formato simples');
window._spLzGameItems = salvo;

// ── AS DUAS FONTES: letzplay E scoreplace ───────────────────────────────────
// "na lista de jogos tem que aparecer os jogos do letzplay e do scoreplace. torneios de
// ambos e rankings de ambos."
ok(typeof window._spScoreplaceItems === 'function', 'match-history expõe os jogos do scoreplace por uid');

// o localStorage de casuais é do DONO da máquina — não pode vazar pro histórico de outro
{
  const fonte = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'match-history.js'), 'utf8');
  const bloco = fonte.slice(fonte.indexOf('async function _fromScoreplace'),
    fonte.indexOf('async function _fromScoreplace') + 1200);
  ok(/ehOutraPessoa/.test(bloco), 'sabe distinguir "sou eu" de "é outra pessoa"');
  ok(/if \(ehOutraPessoa\)/.test(bloco), 'e pula os casuais do localStorage quando é outra pessoa');
}

// o card do scoreplace sai com o selo certo
{
  const it = { ts: Date.now(), source: 'scoreplace', sport: 'Beach Tennis', official: true,
    venue: 'Paineiras', competition: 'Torneio de Férias', competitionLabel: 'Torneio de Férias',
    opponent: 'Catia Cavedon / Max Mano', partner: 'Kelly Barth', result: 'V', scoreA: '6', scoreB: '3' };
  const card = window._spGameCard(it, 'Rodrigo Barth');
  ok(/Scoreplace/.test(card), 'jogo do app vem com o selo Scoreplace');
  ok(/Rodrigo Barth \/ Kelly Barth/.test(card), 'e com a dupla certa');
}

// e a costura existe no diálogo
{
  const rep = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/_lzJuntarScoreplace\(uid/.test(rep), 'o diálogo chama a costura das duas fontes');
  const fn = rep.slice(rep.indexOf('function _lzJuntarScoreplace'), rep.indexOf('function _lzJuntarScoreplace') + 2600);
  ok(/_lzGameItens = \(window\._lzGameItens \|\| \[\]\)\.concat\(itens\)/.test(fn),
    'os jogos do app entram na MESMA lista do letzplay (não num bloco separado)');
  ok(/A\.jogo = window\._lzRenderJogos\(meNome\)/.test(fn),
    'e a lista inteira é re-renderizada, o que reordena por data');
  const juntarFn = rep.slice(rep.indexOf('function _lzJuntarScoreplace'), rep.indexOf('function _lzJuntarScoreplace') + 3400);
  ok(/juntar\('tour'/.test(juntarFn) && /juntar\('rank'/.test(juntarFn), 'competições do app entram em Torneios e em Rankings');
  ok(/_isLigaFormat/.test(fn), 'Pontos Corridos vai pra Rankings (temporada contínua), o resto pra Torneios');
  ok(/if \(!it\.official\) return;/.test(fn), 'partida casual não vira competição');
}

// ── UMA LISTA SÓ, CRONOLÓGICA INVERSA, COM AS DUAS FONTES ───────────────────
// "os jogos que aparecem do letzplay e scoreplace devem ser em ordem cronológica inversa
// com o mais recente no topo". Antes eram dois blocos: um jogo de ontem no app aparecia
// embaixo de um de 2023 do letzplay.
{
  const d = n => Date.now() - n * 86400000;
  window._lzGameItens = [
    { ts: d(400), source: 'letzplay', official: false, competition: 'Ranking velho', competitionLabel: 'Ranking velho',
      opponent: 'X', partner: null, result: 'V', scoreA: '6', scoreB: '0' },
    { ts: d(1),   source: 'scoreplace', official: true, competition: 'Torneio de ontem', competitionLabel: 'Torneio de ontem',
      opponent: 'Y', partner: null, result: 'D', scoreA: '3', scoreB: '6' },
    { ts: d(30),  source: 'letzplay', official: true, competition: 'Torneio do mês passado', competitionLabel: 'Torneio do mês passado',
      opponent: 'Z', partner: null, result: 'V', scoreA: '6', scoreB: '4' }
  ];
  const html = window._lzRenderJogos('Fulano');
  const iOntem = html.indexOf('Torneio de ontem');
  const iMes = html.indexOf('Torneio do mês passado');
  const iVelho = html.indexOf('Ranking velho');
  ok(iOntem >= 0 && iMes >= 0 && iVelho >= 0, 'as duas fontes aparecem na mesma lista');
  ok(iOntem < iMes && iMes < iVelho, 'ordem cronológica inversa: ontem → mês passado → velho');
  ok(/🏆 Scoreplace/.test(html), 'o jogo do app tem a tag Scoreplace');
  ok(/🎾 LetzPlay/.test(html), 'e o do letzplay tem a dele');
  const iTagSp = html.indexOf('Scoreplace');
  ok(iTagSp > 0 && iTagSp < iMes, 'a tag do app aparece no card do topo (é o mais recente)');
  window._lzGameItens = [];
}

// ── A FICHA É DE QUEM TEM JOGO, NÃO DE QUEM AUTORIZOU ───────────────────────────────────
// "todos os nomes na página de análise que tenham jogos (scoreplace/letzplay) devem ser
// clicáveis e verificáveis, não só os que autorizaram letzplay."
{
  const rep = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/var canOpen = !!r\.uid;/.test(rep), 'clicável = tem uid (não = autorizou letzplay)');
  ok(/var click = canOpen \?/.test(rep), 'e é canOpen que decide o clique');
  ok(/cursor:' \+ \(canOpen \?/.test(rep), 'inclusive o cursor de mãozinha');
  ok(/canPull \? ' — clique pra puxar o histórico do letzplay'/.test(rep) && /clique pra ver os jogos/.test(rep),
     'a dica distingue "puxar do letzplay" de "ver os jogos"');

  const dlg = rep.slice(rep.indexOf('window._lzAthleteDialog = function'), rep.indexOf('window._lzAthleteDialog = function') + 1800);
  ok(!/if \(!tg\) return;/.test(dlg), 'o diálogo não desiste mais quando não há alvo letzplay');
  ok(/semLetzplay: true/.test(dlg), 'ele monta um alvo a partir do perfil do scoreplace');
  ok(/var _temLz = !tg\.semLetzplay;/.test(dlg), 'e marca que aquela ficha não tem letzplay');
  ok(/Sem histórico do letzplay/.test(rep), 'a tela diz isso em vez de fingir que não há jogo');
  ok(/if \(_temLz \|\| imp\) body \+=/.test(rep), 'as barras do perfil letzplay só aparecem quando fazem sentido');
  const semLz = rep.slice(rep.indexOf('Abaixo, os jogos desta pessoa aqui no scoreplace'), rep.indexOf('Abaixo, os jogos desta pessoa aqui no scoreplace') + 200);
  ok(/_montarAbas\(\)/.test(semLz), 'e as abas de jogos são montadas mesmo sem letzplay nenhum');
}

console.log((fail ? '✗' : '✓') + ' letzplay-game-cards: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
