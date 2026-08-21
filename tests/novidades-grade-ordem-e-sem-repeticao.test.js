/* 📣 NOVIDADES NO SEU TORNEIO — grade, ordem e sem repetição
 *   node tests/novidades-grade-ordem-e-sem-repeticao.test.js
 *
 * RELATO DO DONO (14/ago/2026, com dois prints da tela inicial):
 *   1. "as novidades no seu torneio devem seguir o mesmo dos seus ultimos resultados.
 *       se cabe 1 jogo na largura da tela é 1 jogo, se cabem 3 sao 3."
 *   2. "o que deve aparecer é sempre o ultimo lancamento acima de todos SEM REPETIÇÕES."
 *   3. "já tem novos lancamentos de hoje que deveriam aparecer acima dos de ontem e não
 *       estão aparecendo."
 *   4. (vendo a chave, logo depois) "cadê o placar do tie-break no 5-6?"
 *
 * O QUE A MEDIÇÃO EM PRODUÇÃO MOSTROU (Firestore REST, 14/ago 18:05Z) — as três queixas
 * tinham causas DIFERENTES, e nenhuma era a que o sintoma sugeria:
 *
 * (1) GRADE: os cards da seção eram empilhados um por linha (`margin-bottom`), enquanto a
 *     seção vizinha "Seus últimos resultados" usava `repeat(auto-fill,minmax(280px,1fr))`.
 *     Mesmo conteúdo, duas larguras. O colapso agravava: os "anteriores" viviam num
 *     `<div id="novidades-body">`, e um wrapper no meio QUEBRA qualquer grade.
 *
 * (2) REPETIÇÃO: não era o mesmo jogo duas vezes — era o torneio duas vezes. O SANDBOX
 *     `(SB) Confra` é um CLONE do Confra: os MESMOS 6 resultados e os MESMOS ids de match.
 *     Cada jogo entrava duas vezes; em "Seus últimos resultados" (corta em 3) a cópia ainda
 *     ROUBAVA uma das três vagas — o print mostra 2 jogos reais + 1 clone. E como o card da
 *     chave usa `id="card-<m.id>"`, o clone punha o MESMO id duas vezes no DOM.
 *
 * (3) ORDEM: a ordenação sempre esteve certa. O que faltava eram os jogos. Os ÚNICOS
 *     lançamentos daquele dia na base INTEIRA eram 3 jogos do R1 Grupo T do Confra, lançados
 *     pela Elide às 12:43, 14:58 e 15:00 (BRT) — todos em `pendingResult`, sem `winner`. A
 *     seção exigia `m.winner`, então ignorava justamente o que acabara de acontecer e o topo
 *     mostrava um jogo de "há 18h". Placar lançado só ganha `winner` quando o outro lado
 *     confirma — o que pode levar horas.
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. a grade é a MESMA de "Seus últimos resultados" (régua lida do próprio fonte — se uma
 *      mudar sem a outra, fica vermelho) e TODOS os cards são irmãos diretos dela;
 *   B. sandbox não entra nos feeds; nenhum id de card se repete no HTML;
 *   C. lançamento pendente entra, com o carimbo do `proposedAt`, ACIMA do confirmado de
 *      ontem — e marcado como pendente, nunca como placar final;
 *   D. o feed é SOMENTE LEITURA: zero <button> (o `canEnterResult=false` NÃO bastava — os
 *      botões de pendência/disputa/W.O. têm gate próprio por PAPEL, então o organizador via
 *      "✏️ Editar" num card fora da chave);
 *   E. o placar PENDENTE mostra o subplacar do tie-break, pelo MESMO formatador do decidido.
 *
 * (4) TIE-BREAK: o card pendente montava o placar à mão (`_pr.sets.map(s => s.gamesP1)`) e
 *     descartava `s.tiebreak`, então 5×6 no tie-break saía "5" e "6" secos. MEDIDO no doc:
 *     o pendente do R1 Grupo T • Jogo 2 traz `tiebreak:{pointsP1:4,pointsP2:7}` — o dado
 *     sempre esteve lá. O card DECIDIDO nunca teve o problema porque passa por
 *     `formatSetScores` → `window._formatSetForPlayer`. Agora o pendente passa também.
 *
 * CONTROLE: contra a 1.8.66 (o código anterior a este fix) esta suíte acusa 20 falhas —
 * as quatro do relato entre elas (A2/A3 grade, B3/B5 repetição, C1/C2 lançamento de hoje,
 * C10-C12 tie-break). Conferido rodando o arquivo com os dois arquivos em `git stash`.
 */
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');   // store.js + bracket.js REAIS (renderMatchCard, _isSandboxRef)
const W = H.sandbox;

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// Relativos ao AGORA: o rótulo "há X" é calculado contra `Date.now()`, então datas fixas
// envelheceriam o fixture e o teste passaria a medir outra coisa a cada dia.
const AGORA = Date.now();
const HOJE = AGORA;                        // instante do print (14/ago 15:00 BRT)
const ONTEM_TARDE = AGORA - 18 * 3600000;  // o "há 18h" do print
const ONTEM_CEDO = AGORA - 25 * 3600000;   // o "ontem" do print

// ═══════════════════════════════════════════════════════════════════════════
// Fixture: a FORMA medida no doc real do Confra (Pontos Corridos · Rei/Rainha,
// jogos em rounds[0].matches, `resultAt` em ms, pendência em `pendingResult`).
// ═══════════════════════════════════════════════════════════════════════════
function jogo(id, label, a1, a2, b1, b2, extra) {
  return Object.assign({
    id: id, label: label, isMonarch: true, round: 0,
    p1: a1 + ' / ' + a2, p2: b1 + ' / ' + b2,
    team1: [a1, a2], team2: [b1, b2]
  }, extra || {});
}
function confirmado(sc1, sc2, at) {
  return { scoreP1: sc1, scoreP2: sc2, resultAt: at, winner: null }; // winner preenchido abaixo
}

function confra() {
  const ms = [
    // — jogos de OUTRAS pessoas, CONFIRMADOS ontem (as "novidades" que já apareciam)
    jogo('m-S1', 'R1 Grupo S • Jogo 1', 'Vanessa Bianchini', 'Bruna Arilla', 'Luciana Marinho', 'Adriana Zalaf',
      { scoreP1: 6, scoreP2: 3, resultAt: ONTEM_TARDE, winner: 'Vanessa Bianchini / Bruna Arilla' }),
    jogo('m-S2', 'R1 Grupo S • Jogo 2', 'Vanessa Bianchini', 'Luciana Marinho', 'Bruna Arilla', 'Adriana Zalaf',
      { scoreP1: 5, scoreP2: 6, resultAt: ONTEM_CEDO, winner: 'Bruna Arilla / Adriana Zalaf' }),
    // — jogo de OUTRAS pessoas LANÇADO HOJE, aguardando confirmação (o que sumia).
    // O payload é o do R1 Grupo T • Jogo 2 REAL (medido no doc em 14/ago 17:58Z): 5×6
    // decidido no TIE-BREAK 4×7, com `useSets` e o TB dentro de `sets[0].tiebreak`.
    jogo('m-T1', 'R1 Grupo T • Jogo 1', 'Luiza Ruic', 'Lucely Lustre', 'Elide Luccas', 'Moreno', {
      pendingResult: {
        scoreP1: 5, scoreP2: 6, tbP1: 4, tbP2: 7, winner: 'Elide Luccas / Moreno',
        draw: false, kind: 'inline', useSets: true, isFixedSet: false, isTiebreakEntry: true,
        sets: [{ gamesP1: 5, gamesP2: 6, tiebreak: { pointsP1: 4, pointsP2: 7 } }],
        setsWonP1: 0, setsWonP2: 1, proposedByName: 'Elide Luccas',
        proposedBy: 'u-elide', proposedByEmail: 'elide@x.com', proposedAt: HOJE - 5 * 60000
      }
    }),
    // — jogos MEUS, confirmados ontem (vão pra "Seus últimos resultados", não pras Novidades)
    jogo('m-Q1', 'R1 Grupo Q • Jogo 1', 'Erika de Paula', 'Rodrigo Barth', 'Livia Morais', 'Loraine Soares',
      { scoreP1: 6, scoreP2: 5, resultAt: ONTEM_TARDE - 3600000, winner: 'Erika de Paula / Rodrigo Barth' }),
    jogo('m-Q2', 'R1 Grupo Q • Jogo 2', 'Erika de Paula', 'Loraine Soares', 'Livia Morais', 'Rodrigo Barth',
      { scoreP1: 6, scoreP2: 3, resultAt: ONTEM_TARDE - 7200000, winner: 'Erika de Paula / Loraine Soares' }),
    jogo('m-Q3', 'R1 Grupo Q • Jogo 3', 'Erika de Paula', 'Livia Morais', 'Loraine Soares', 'Rodrigo Barth',
      { scoreP1: 1, scoreP2: 0, resultAt: ONTEM_TARDE - 10800000, winner: 'Erika de Paula / Livia Morais' })
  ];
  return {
    id: 'tour_confra', name: 'Confra BT Alta da Clínica 2026', format: 'Liga',
    ligaRoundFormat: 'rei_rainha', status: 'active', sport: 'Beach Tennis',
    resultEntry: 'players', creatorUid: 'u-rb',   // o dono É o organizador (o papel que soltava os botões)
    participants: [{ uid: 'u-rb', displayName: 'Rodrigo Barth' }],
    rounds: [{ matches: ms }]
  };
}

// O SB é clonado por cópia profunda do original — MESMOS ids de match (é o que gera a repetição).
function sandboxDe(t) {
  const c = JSON.parse(JSON.stringify(t));
  c.id = t.id + '_sb';
  c.name = '(SB) ' + t.name;
  c.isSandbox = true;
  c.sandboxOf = t.id;
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════
// Roda o _buildMyResultsHtml REAL, extraído do dashboard.js (não uma réplica).
// Ele é interno ao renderDashboard, então `participacoes` entra por parâmetro.
// ═══════════════════════════════════════════════════════════════════════════
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

function extraiBuildMyResults(src) {
  const i = src.indexOf('function _buildMyResultsHtml() {');
  if (i < 0) throw new Error('_buildMyResultsHtml não encontrada em dashboard.js');
  const marca = 'return _upHtml + _novHtml + html;';
  const j = src.indexOf(marca, i);
  if (j < 0) throw new Error('fim de _buildMyResultsHtml não encontrado (o return mudou?)');
  return src.slice(i, src.indexOf('}', j + marca.length) + 1);
}

const _store = {};
W.localStorage = W.localStorage || {
  getItem: function (k) { return (k in _store) ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; }
};

function render(tours, opts) {
  opts = opts || {};
  W.AppStore.tournaments = tours;
  W.AppStore.currentUser = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@x.com' };
  W.AppStore.isOrganizer = function (t) { return !!(t && t.creatorUid === 'u-rb'); };
  if (opts.colapsada === false) W.localStorage.setItem('scoreplace_collapse_novidades', '0');
  else W.localStorage.setItem('scoreplace_collapse_novidades', '1');
  const body = extraiBuildMyResults(opts.src || SRC);
  const fn = new Function('window', 'document', 'localStorage', 'participacoes',
    'with (window) { ' + body + ' return _buildMyResultsHtml; }'
  )(W, W.document, W.localStorage, tours);
  return fn();
}

function bloco(html, id) {
  const i = html.indexOf('id="' + id + '"');
  if (i < 0) return '';
  return html.slice(i);
}
// ⚠️ A ordem do retorno é `_upHtml + _novHtml + html`, ou seja "Seus últimos resultados"
// vem DEPOIS das Novidades. Recortar até o fim do HTML levaria a seção seguinte junto — e
// asserções sobre "o que NÃO pode estar nas Novidades" passariam a medir a vizinha.
function secaoNovidades(html) {
  const i = html.indexOf('id="novidades-section"');
  if (i < 0) return '';
  const fim = html.indexOf('id="meus-resultados-section"', i);
  return fim > i ? html.slice(i, fim) : html.slice(i);
}
function secaoMeusResultados(html) {
  const i = html.indexOf('id="meus-resultados-section"');
  return i < 0 ? '' : html.slice(i);
}
function contar(s, needle) {
  let n = 0, i = 0;
  while ((i = s.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

const T = confra();
const SB = sandboxDe(T);
const HTML = render([T, SB]);
const NOV = secaoNovidades(HTML);

ok(NOV.length > 0, 'a seção 📣 Novidades é renderizada');

// ═══════════════════════════════════════════════════════════════════════════
// A. GRADE — "se cabe 1 jogo na largura da tela é 1 jogo, se cabem 3 são 3"
// ═══════════════════════════════════════════════════════════════════════════
// A régua é lida do PRÓPRIO fonte da outra seção: se alguém mudar uma e não a outra,
// as duas voltam a divergir e este teste acusa. Foi a divergência do relato.
const REGUA = 'grid-template-columns:repeat(auto-fill,minmax(280px,1fr))';
ok(contar(SRC, REGUA) >= 2,
  'A1. Novidades e "Seus últimos resultados" usam a MESMA régua de grade (' + REGUA + ') — vi ' + contar(SRC, REGUA) + ' ocorrência(s)');
ok(NOV.indexOf('id="novidades-grid"') !== -1, 'A2. a seção tem a grade #novidades-grid');
const GRID = bloco(NOV, 'novidades-grid');
ok(GRID.indexOf(REGUA) !== -1, 'A3. a grade das Novidades usa auto-fill/minmax(280px,1fr) — nunca um card por linha');
ok(NOV.indexOf('id="novidades-body"') === -1,
  'A4. NÃO existe mais o wrapper #novidades-body — um <div> no meio quebra a grade (os anteriores ficariam noutra grade e o 1º card sozinho numa linha)');
ok(NOV.indexOf('data-nov-collapsed=') !== -1,
  'A5. o colapso é por atributo na seção (esconde do 2º card em diante por CSS), com os cards todos irmãos da MESMA grade');

// Nenhum card carrega empilhamento próprio — o respiro é o gap da grade.
ok(NOV.indexOf('data-nov-card="1" style="margin-bottom') === -1,
  'A6. o card não empilha com margin-bottom próprio (o espaçamento é o gap da grade)');

// ═══════════════════════════════════════════════════════════════════════════
// B. SEM REPETIÇÃO — o sandbox é um clone e duplicava tudo
// ═══════════════════════════════════════════════════════════════════════════
ok(NOV.indexOf('(SB)') === -1, 'B1. torneio sandbox NÃO aparece nas Novidades');
ok(HTML.indexOf('(SB)') === -1, 'B2. torneio sandbox não aparece em NENHUMA das seções (inclusive "Seus últimos resultados")');

// ⚠️ SONDAS REVISADAS DE PROPÓSITO em v1.8.78 — o INVARIANTE não mudou, o MARKUP mudou.
// Pedido do dono (15/ago): "colocar o nome de grupo numa linha e o nome do torneio na de
// baixo; sempre que for mesmo grupo e torneio, omitir dos demais jogos do mesmo grupo".
// O rótulo "R1 Grupo S • Jogo 1" DEIXOU DE EXISTIR como string única: o grupo virou
// cabeçalho compartilhado (`data-nov-head`) e o "Jogo N" ficou no card. Procurar a string
// antiga passaria a medir a ausência do rótulo, não a duplicação — que é o que estas
// asserções nasceram pra pegar (o clone do sandbox). Elas continuam pegando exatamente
// isso, agora contando CARDS e CABEÇALHOS.
function cabecalhosNov(html) {
  var out = [], re = /data-nov-head="1"[\s\S]*?letter-spacing:2px;[^"]*">([^<]+)</g, m;
  while ((m = re.exec(html))) out.push(m[1].trim());
  return out;
}
const HEADS = cabecalhosNov(NOV);
ok(contar(NOV, 'data-nov-card="1"') === 3,
  'B3. os 3 jogos de outros entram uma vez cada (o clone do sandbox não duplica) — vi ' + contar(NOV, 'data-nov-card="1"'));
ok(HEADS.filter(function (h) { return h === 'R1 Grupo S'; }).length === 1,
  'B4. o cabeçalho "R1 Grupo S" aparece UMA vez para os seus 2 jogos (a omissão pedida pelo dono) — vi ' +
  HEADS.filter(function (h) { return h === 'R1 Grupo S'; }).length);
ok(HEADS.length === 2 && HEADS.indexOf('R1 Grupo T') !== -1 && HEADS.indexOf('R1 Grupo S') !== -1,
  'B4b. há exatamente 2 cabeçalhos (Grupo T e Grupo S) para os 3 jogos — vi [' + HEADS.join(' | ') + ']');
// o torneio vai na LINHA DE BAIXO do mesmo cabeçalho (nunca colado ao grupo)
ok(/data-nov-head="1"[\s\S]*?letter-spacing:2px;[^"]*">R1 Grupo T<\/div><div style="color:var\(--text-muted\)/.test(NOV),
  'B4c. o nome do torneio vem numa segunda linha, logo abaixo do grupo');

// id de DOM repetido é o que faria _editPendingResult/_approveResult agirem no card errado
const idsCard = (HTML.match(/id="card-[^"]+"/g) || []);
const dupIds = idsCard.filter((v, i) => idsCard.indexOf(v) !== i);
ok(dupIds.length === 0, 'B5. nenhum id="card-..." repetido no HTML — vi: ' + dupIds.join(', '));

// "Seus últimos resultados" corta em 3: o clone não pode roubar vaga de jogo real
const MR = secaoMeusResultados(HTML);
['Jogo 1', 'Jogo 2', 'Jogo 3'].forEach(function (j) {
  ok(contar(MR, 'R1 Grupo Q • ' + j) <= 1, 'B6. "Seus últimos resultados": Grupo Q ' + j + ' não se repete');
});

// A dedup também protege jogo que apareça em duas estruturas do MESMO torneio
// (`_collectAllMatches` concatena t.matches + rounds[] e NÃO deduplica).
const T2 = confra();
T2.matches = [T2.rounds[0].matches[0]];      // o MESMO objeto, também solto em t.matches
const NOV2 = secaoNovidades(render([T2]));
ok(contar(NOV2, 'data-nov-card="1"') === 3,
  'B7. jogo presente em t.matches E dentro da rodada entra 1 vez só (3 cards, não 4) — vi ' + contar(NOV2, 'data-nov-card="1"'));

// ═══════════════════════════════════════════════════════════════════════════
// C. ORDEM — o lançamento de hoje acima do de ontem
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ SONDAS REVISADAS em v1.8.78 pelo mesmo motivo do bloco B: o grupo agora é cabeçalho
// e o jogo é o rótulo do card. A ORDEM continua sendo a mesma coisa medida — e o
// agrupamento não a afrouxa: os grupos entram na ordem da PRIMEIRA aparição, então o
// grupo do lançamento mais recente continua obrigado a vir primeiro.
ok(NOV.indexOf('R1 Grupo T') !== -1,
  'C1. O BUG DO RELATO: o lançamento de HOJE (pendente de confirmação) aparece nas Novidades');

const posHoje = NOV.indexOf('R1 Grupo T');
const posOntem = NOV.indexOf('R1 Grupo S');
ok(posHoje !== -1 && posOntem !== -1 && posHoje < posOntem,
  'C2. o lançamento de hoje vem ACIMA do confirmado de ontem (hoje@' + posHoje + ' < ontem@' + posOntem + ')');

ok(HEADS[0] === 'R1 Grupo T' && HEADS[1] === 'R1 Grupo S',
  'C2b. a ordem dos cabeçalhos segue a do lançamento mais recente — vi [' + HEADS.join(' | ') + ']');

// A sonda é o id do card (`id="card-<m.id>"`), que é estável e não depende de rótulo.
const posS1 = NOV.indexOf('id="card-m-S1"');
const posS2 = NOV.indexOf('id="card-m-S2"');
ok(posS1 !== -1 && posS2 !== -1 && posS1 < posS2,
  'C3. dentro do grupo, o mais recente continua no topo (S1@' + posS1 + ' < S2@' + posS2 + ')');
// ⚠️ o número do jogo é do CARD e não pode ser repetido na linha acima dele — foi o que a
// verificação no navegador pegou: "JOGO 1" saía DUAS vezes, uma coladinha na outra. Quem
// mostra o número é `renderMatchCard` (o `_gameNum` da fonte única), então a contagem tem
// que ser 1 por jogo; a linha de cima carrega só o "quando", que o card não tem.
ok(contar(NOV, 'Jogo 1') === 1,
  'C3b. o "Jogo N" aparece uma vez só — quem o mostra é o card, não a linha acima — vi ' + contar(NOV, 'Jogo 1'));
ok(contar(NOV, 'data-nov-quando="1"') === 3,
  'C3c. cada card mantém o carimbo de tempo, que é o que varia entre jogos do mesmo grupo');

// o carimbo do pendente é o proposedAt — sem isso ele cairia pro fim com at=0
ok(NOV.indexOf('há 5min') !== -1 || NOV.indexOf('agora há pouco') !== -1,
  'C4. o "quando" do pendente sai do proposedAt (lançado há 5 min), não de um carimbo vazio');

// ...e ele NÃO é apresentado como placar final
const cardT1 = NOV.slice(posHoje, posOntem > posHoje ? posOntem : undefined);
ok(cardT1.indexOf('PENDENTE') !== -1, 'C5. o card de hoje mostra a tag PENDENTE — não se passa por resultado final');
ok(cardT1.indexOf('Aguardando aprovação') !== -1, 'C6. o card de hoje diz "⏳ Aguardando aprovação"');
ok(cardT1.indexOf('Elide Luccas') !== -1, 'C7. o card de hoje diz quem propôs');

// ── O SUBPLACAR DO TIE-BREAK NO PLACAR PENDENTE ────────────────────────────
// Pergunta do dono vendo a chave (14/ago): "cadê o placar do tie-break no 5-6?".
// O card pendente montava o placar à mão (`sets.map(s => s.gamesP1)`) e descartava
// `s.tiebreak` — 5×6 no tie-break saía como "5" e "6" secos. O decidido sempre mostrou,
// porque passa por formatSetScores → _formatSetForPlayer. Agora os dois usam o MESMO.
const _sup = function (n) { return '<sup style="font-size:0.75em;font-weight:700;">(' + n + ')</sup>'; };
ok(cardT1.indexOf('5' + _sup(4)) !== -1, 'C10. o pendente mostra 5⁽⁴⁾ — o subplacar do tie-break do lado perdedor');
ok(cardT1.indexOf('6' + _sup(7)) !== -1, 'C11. o pendente mostra 6⁽⁷⁾ — o subplacar do tie-break do lado vencedor');

// ...e o mesmo card na CHAVE (com botões) também mostra — é o mesmo renderizador.
const _mT1 = confra().rounds[0].matches.find(m => m.id === 'm-T1');
W.AppStore.tournaments = [T];
const cardT1Chave = W.renderMatchCard(_mT1, true, T.id, 59);
ok(cardT1Chave.indexOf('6' + _sup(7)) !== -1, 'C12. na chave o placar pendente também traz o tie-break (foi ali que o dono viu)');

// Pendente SEM tie-break continua saindo limpo — nada de "(null)" ou "(undefined)".
const _semTb = confra().rounds[0].matches.find(m => m.id === 'm-T1');
_semTb.pendingResult = { scoreP1: 3, scoreP2: 6, winner: 'Elide Luccas / Moreno', useSets: true,
  sets: [{ gamesP1: 3, gamesP2: 6 }], proposedByName: 'Elide Luccas', proposedBy: 'u-elide', proposedAt: HOJE - 60000 };
const cardSemTb = W.renderMatchCard(_semTb, false, T.id, 58, false, null, { readOnly: true });
ok(cardSemTb.indexOf('<sup') === -1, 'C13. pendente sem tie-break não inventa subplacar');
ok(cardSemTb.indexOf('null') === -1 && cardSemTb.indexOf('undefined') === -1, 'C14. pendente sem tie-break não vaza null/undefined no placar');

// jogo pendente MEU continua fora das Novidades (tem seção própria de pendência)
const T3 = confra();
T3.rounds[0].matches.push(jogo('m-Z1', 'R1 Grupo Z • Jogo 1', 'Rodrigo Barth', 'Kelly Barth', 'A A', 'B B', {
  pendingResult: { scoreP1: 6, scoreP2: 1, winner: 'Rodrigo Barth / Kelly Barth', proposedByName: 'A A', proposedBy: 'u-aa', proposedAt: HOJE - 60000 }
}));
const NOV3 = secaoNovidades(render([T3]));
ok(NOV3.indexOf('R1 Grupo Z') === -1,
  'C8. pendência de jogo MEU não vira "novidade" (ela tem a seção própria de aprovação)');

// torneio ENCERRADO segue sem popular a seção (regra do dono, 13/ago)
const T4 = confra();
T4.status = 'finished';
ok(secaoNovidades(render([T4])).length === 0, 'C9. torneio encerrado continua não populando as Novidades');

// ═══════════════════════════════════════════════════════════════════════════
// D. O FEED É SOMENTE LEITURA — MENOS O CONSENSO (mudança de regra, 1.9.109)
// ═══════════════════════════════════════════════════════════════════════════
// O dono é o ORGANIZADOR do fixture — é justamente esse papel que soltava "✏️ Editar"
// no card pendente, e o clique caía em ids que só existem na chave (v1.8.67).
//
// ⚠️ A REGRA MUDOU POR ORDEM DO DONO (21/ago/2026, com o print do feed): _"aqui nas
// novidades não temos os botões para os participantes aprovarem/contestarem os placares
// lançados. Elas têm que ir para o torneio para fazer isso. Alguns não entendem isso."_
// O feed segue somente-leitura para TUDO — W.O., ao vivo, painel de disputa, edição
// in-place — menos a linha de consenso, que agora aparece pra quem pode agir.
// O que este bloco trava agora é o COMO: nada de `onclick` chamando as funções da chave
// (era o clique quebrado); o despacho é por `data-pending-action`, o mesmo atributo que
// a seção "Aguardando sua aprovação" já usa e que o listener da dashboard resolve —
// inclusive o Editar, que carimba `sp_pendingEdit` e navega em vez de mexer no DOM.
ok(NOV.indexOf('onclick="window._editPendingResult') === -1, 'D2. o feed NUNCA edita por onclick (o clique que procurava ids da chave)');
ok(NOV.indexOf('onclick="window._approveResult') === -1, 'D3. nem aprova por onclick');
ok(NOV.indexOf('onclick="window._contestResult') === -1, 'D4. nem contesta por onclick');
ok(contar(NOV, 'data-pending-action="approve"') >= 1, 'D1. o jogo PENDENTE traz o Confirmar (despachado por atributo) — vi ' + contar(NOV, 'data-pending-action="approve"'));
ok(NOV.indexOf('data-tid="') > -1 && NOV.indexOf('data-mid="') > -1, 'D1b. e o botão carrega torneio + jogo (o despachante age por id, não por posição)');
// nada de W.O./ao vivo/replay voltar junto: o consenso é a ÚNICA exceção
ok(NOV.indexOf('_woClaim') === -1 && NOV.indexOf('_liveScore') === -1, 'D1c. W.O. e placar ao vivo seguem fora do feed');

// e o modo somente-leitura NÃO pode vazar pra chave: lá os botões continuam existindo.
const _rmc = W.renderMatchCard;
W.AppStore.tournaments = [T];
const cardNaChave = _rmc(T.rounds[0].matches.find(m => m.id === 'm-T1'), true, T.id, 7);
ok(cardNaChave.indexOf('<button') !== -1,
  'D5. na CHAVE (sem readOnly) o card pendente continua com botões — o modo leitura não vazou');

console.log('\n📣 NOVIDADES — grade, ordem e sem repetição');
console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
console.log('   ✅ tudo verde');
