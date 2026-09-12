'use strict';
/* ⛔ TORNEIO DIVIDIDO: O JOGO NÃO ESTÁ NO DOCUMENTO — MAS O RESULTADO ESTÁ.
 * Relato do dono (12/set/2026, TestFlight e web): _"em NOVIDADES aparecem apenas jogos da R1,
 * mas já temos várias R2 que deveriam aparecer aqui"_.
 * MEDIDO no documento REAL do Confra (leitura pública, 12/set): `_semPesados` lista `matches`
 * como parte separada e o campo `matches` do doc é um ARRAY VAZIO — `rounds`, `groups` e
 * `rodadas` idem. A tela inicial não carrega a parte pesada: ela colhia ZERO jogo da fase em
 * curso e mostrava o resto de uma visita antiga guardado em cache (a R1 congelada).
 * A janela recente de `results/` já era baixada — mas só sabia SOBREPOR num jogo existente.
 * O espelho carrega nome dos dois lados, placar, rótulo e roster: dá pra montar o jogo com ele.
 * [[project_jogo_vive_em_matches_e_results]] · [[feedback_medir_com_dado_real_antes_de_teorizar]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const S = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

// recorte por ÂNCORA: os dois leitores + a lista canônica de campos de resultado
const campos = S.slice(S.indexOf('  _matchResultFields:'), S.indexOf('\n', S.indexOf('  _matchResultFields:')));
const ini = S.indexOf('  _jogoDoEspelho: function (matchId, res, carimboDeLote) {');
const fim = S.indexOf('  _overlayResultOnMatch: function', ini);
assert.ok(ini > 0 && fim > ini, 'âncoras dos leitores de espelho');
const ctx = { AppStore: null };
vm.runInNewContext('AppStore = {' + campos + '\n' + S.slice(ini, fim) + '};', ctx);
const A = ctx.AppStore;

// o espelho REAL, com os campos que `buildSeedDoc` grava (conferido em produção)
const espelho = {
  matchId: 'match-elim-r2-3',
  playerUids: ['u-a', 'u-b', 'u-c', 'u-d'],
  p1: 'Monique traldi / Fabiana Ferre', p2: 'Katia / Juliana Penha',
  winner: 'Monique traldi / Fabiana Ferre', roundLabel: 'Rodada 2',
  sets: [{ gamesP1: 6, gamesP2: 4 }, { gamesP1: 2, gamesP2: 6 }, { gamesP1: 10, gamesP2: 7 }],
  scoreP1: 2, scoreP2: 1, updatedAt: '2026-09-12T01:00:00.000Z', tournamentName: 'Confra'
};

// ── ① o jogo se monta a partir do espelho ───────────────────────────────────
const m = A._jogoDoEspelho(espelho.matchId, espelho);
must(m && m.id === 'match-elim-r2-3', '① o jogo nasce com o id do espelho');
must(m.p1 === espelho.p1 && m.p2 === espelho.p2, '① com os DOIS lados — sem isso não há card que se desenhe');
must(m.winner === espelho.winner && Array.isArray(m.sets) && m.sets.length === 3,
  '① e com o resultado inteiro (vencedor e os 3 sets)');
must(m.label === 'Rodada 2', '① o rótulo da rodada viaja junto — é o que agrupa em Novidades');
must(m._doEspelho === true, '① fica marcado que veio do espelho, não da estrutura');
must(!A._jogoDoEspelho('x', { winner: 'alguém' }), '① ⛔ espelho sem nome dos dois lados NÃO vira jogo fantasma');
must(!A._jogoDoEspelho('', espelho) && !A._jogoDoEspelho('x', null), '① e nada de id vazio ou espelho nulo');

// ── ② só entra quem NÃO está na estrutura ───────────────────────────────────
const t = { id: 'tour_x', _results: { 'm-1': espelho, 'm-2': Object.assign({}, espelho, { matchId: 'm-2' }) } };
must(A._jogosSoDoEspelho(t, { 'm-1': 1 }).length === 1,
  '② ⛔ o que a estrutura já entregou não repete — o espelho só preenche o buraco');
must(A._jogosSoDoEspelho(t, {}).length === 2, '② e o que não veio na estrutura entra');
must(A._jogosSoDoEspelho({ id: 'y' }, {}).length === 0, '② torneio sem espelho não inventa jogo');

// ── ③ a lista de campos é UMA só ────────────────────────────────────────────
must(/_matchResultFields/.test(S.slice(ini, fim)),
  '③ ⛔ o construtor usa a MESMA lista de campos do overlay — duas listas divergem na 1ª mudança');

// ── ④ e a tela inicial pede por eles ────────────────────────────────────────
const DASH = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
must(/_jogosSoDoEspelho\(t, _jaNaEstrutura\)/.test(DASH), '④ a dashboard acrescenta os jogos só-do-espelho');
const bloco = DASH.slice(DASH.indexOf('var _jaNaEstrutura = {}'), DASH.indexOf('matchSources.forEach(function(m) {', DASH.indexOf('var _jaNaEstrutura = {}')));
must(/matchSources\.forEach\(function \(m\) \{ if \(m && m\.id != null\) _jaNaEstrutura/.test(bloco),
  '④ e monta o conjunto do que já veio ANTES de acrescentar — senão duplicaria tudo');

console.log('✅ ' + ok + ' asserções — o jogo que só existe no espelho chega às Novidades');

/* ── ⑤ A HORA É A DO RESULTADO, NÃO A DO DOCUMENTO ───────────────────────────
 * MEDIDO na base do Confra (12/set/2026): os 213 espelhos de `results` estão TODOS com
 * `updatedAt = 2026-09-12T11:51:32.898Z` — um re-sync do servidor reescreveu a coleção
 * inteira. Esse carimbo entrava no jogo pelo overlay e fazia um resultado de 01/set parecer
 * recém-lançado: "Novidades" enchia de R1 antiga e a R2 (lançada 03:18) saía da janela.
 */
{
  const ini2 = S.indexOf('  _overlayResultOnMatch: function (m, result, carimboDeLote) {');
  const fim2 = S.indexOf('\n  },', ini2);
  const overlay = S.slice(ini2, fim2);
  must(/k === 'updatedAt' && carimboDeLote != null/.test(overlay),
    '⑤ ⛔ o overlay recusa o `updatedAt` quando ele é de uma escrita em MASSA');
  must(!/if \(k === 'updatedAt'\) continue;/.test(overlay),
    '⑤ ⛔ e não o recusa sempre — um placar PARCIAL não tem `resultAt`, ali o `updatedAt` é o único carimbo');
  must(/resultAt/.test(campos), '⑤ e o `resultAt` — a hora do lançamento — continua vindo');

  const DASH2 = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
  // ⛔ só o ramo do resultado CONFIRMADO: o do pendente tem carimbo próprio (`proposedAt`)
  const _iConf = DASH2.indexOf('                : (_tsMs(');
  const confirmado = DASH2.slice(_iConf, DASH2.indexOf('\n', _iConf));
  must(confirmado.indexOf('m.resultAt') < confirmado.indexOf('m.updatedAt'),
    '⑤ ⭐ e quem ordena as Novidades é `resultAt` ANTES de `updatedAt` (' + confirmado.trim().slice(0, 60) + '…)');
}

/* ── ⑥ O DETECTOR DE ESCRITA EM MASSA ────────────────────────────────────────
 * MEDIDO: 213 de 213 espelhos do Confra com `2026-09-12T11:51:32.898Z`. Um carimbo que se
 * repete em documentos demais é re-sync, não evento — e não pode ordenar novidade nenhuma.
 * ⛔ Mas dois jogos lançados no mesmo minuto são coincidência LEGÍTIMA: o piso existe pra
 * não confundir uma com a outra. */
{
  const ini3 = S.indexOf('  _carimboDeLote: function (map) {');
  const fim3 = S.indexOf('\n  },', ini3);
  const ctx3 = { AppStore: null };
  vm.runInNewContext('AppStore = {' + S.slice(ini3, fim3) + '\n}};', ctx3);
  const C = ctx3.AppStore._carimboDeLote;
  const emMassa = {}; for (let i = 0; i < 40; i++) emMassa['m' + i] = { updatedAt: '2026-09-12T11:51:32.898Z' };
  must(C(emMassa) === '2026-09-12T11:51:32.898Z', '⑥ ⭐ 40 documentos com o mesmo carimbo: é escrita em massa');
  const misto = Object.assign({}, emMassa); misto['novo'] = { updatedAt: '2026-09-12T14:00:00.000Z' };
  must(C(misto) === '2026-09-12T11:51:32.898Z', '⑥ e o lançamento de verdade no meio do lote não confunde o detector');
  const doisIguais = { a: { updatedAt: 'X' }, b: { updatedAt: 'X' }, c: { updatedAt: 'Y' }, d: { updatedAt: 'Z' }, e: { updatedAt: 'W' }, f: { updatedAt: 'V' }, g: { updatedAt: 'U' }, h: { updatedAt: 'T' } };
  must(C(doisIguais) === null, '⑥ ⛔ dois jogos no mesmo minuto NÃO são lote — o piso protege a coincidência legítima');
  must(C({ a: { updatedAt: 'X' } }) === null && C(null) === null, '⑥ mapa pequeno ou vazio não inventa lote');
}

console.log('✅ e a ordem é a do lançamento, não a do re-sync');
