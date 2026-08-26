/* O TORNEIO DIVIDIDO CHEGA INTEIRO NA TELA — PELO CAMINHO DE VERDADE (2.0.110)
 * node tests/torneio-dividido-chega-inteiro-na-tela.test.js
 *
 * ⛔ ESTE TESTE EXISTE PORQUE O ANTERIOR NÃO PEGOU. Em 26/ago dividi os jogos e o app
 * quebrou na mão do dono, com o Confra AO VIVO: "não mostra os meus jogos apenas a
 * classificação". No banco nada se perdeu; a TELA é que não montava.
 *
 * A causa: eu construí a REDE do ouvinte (enxerta o que já está em MEMÓRIA) e nunca a
 * BUSCA. No PRIMEIRO carregamento não há memória — e é o OUVINTE que carrega, não o
 * `loadTournamentById` que eu tinha ensinado a montar.
 * ⛔ E A SUÍTE FICOU VERDE O TEMPO TODO, porque eu testei a FUNÇÃO da rede isolada e nunca
 * o CAMINHO por onde o torneio entra na tela.
 *
 * ⇒ Este teste percorre o caminho: snapshot do Firestore (falso, mas com a MESMA forma) →
 * `_aplicaSnapTorneios` → store → busca → repintura. Se o torneio chegar sem jogos em
 * qualquer ponto, ele falha.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

// ── monta o pedaço REAL do ouvinte num sandbox ──────────────────────────────
const iA = src.indexOf('function _aplicaSnapTorneios(snap) {');
ok(iA > 0, 'o aplicador do snapshot existe');
// o corpo vai até o fecho da função no mesmo nível de indentação
const fimA = src.indexOf('\n    }', src.indexOf('store._parsedById = _novoParsed;', iA));
const corpoAplica = src.slice(iA, fimA + 6);
const iE = src.indexOf('function _enxertaJogos(');
const corpoEnxerta = src.slice(iE, src.indexOf('\n    }', iE) + 6);

const montados = [];
const ctx = {
  store: { tournaments: [], _parsedById: {}, _deletedTournamentIds: [],
    _montandoPesados: {},
    _saveToCache: function () {}, _agendarSaveCache: function () {},
    _sigDe: function () { return ''; }, _lastSig: null,
    // ⭐ a busca REAL é assíncrona; aqui ela é substituída por uma que registra a chamada,
    // porque o que este teste prova é que ELA É CHAMADA — foi exatamente isso que faltou.
    _montaPesadosQueFaltam: function (ids) { montados.push.apply(montados, ids); } },
  /* ⚠️ Os stubs abaixo são o AMBIENTE, não o comportamento: `_aplicaSnapTorneios` conversa
   * com meia dúzia de colaboradores (cache, presença otimista, re-render). O que este teste
   * prova é o CAMINHO do dado; cada stub que eu precisei acrescentar é uma prova a mais de
   * que ele está percorrendo a função de verdade, e não uma cópia simplificada dela. */
  window: {
    _isTestIdentity: function () { return false; },
    _reapplyPendingPresence: function () {}, _reattachPhaseResInfo: function () {},
    _softRefreshView: function () {}, _log: function () {}, _warn: function () {},
    _error: function () {}, _hydrateMonarchGroups: function () {}
  },
  setTimeout: setTimeout, JSON: JSON,
  console: console
};
vm.createContext(ctx);
/* ⚠️ `_aplicaSnapTorneios` vive dentro de um closure e lê variáveis dele. Recriá-las aqui
 * é o preço de exercitar a função REAL em vez de uma cópia — e é um preço que vale: foi
 * justamente testar a cópia (a função isolada) que deixou o defeito passar. */
vm.runInContext('var isFirstSnapshot = false; var _finalizeBootReady = function () {};\n' +
  corpoEnxerta + '\n' + corpoAplica + '\nthis.aplica = _aplicaSnapTorneios;', ctx);
const aplica = ctx.aplica;

const snapDe = (docs) => ({
  docs: docs,
  forEach: (f) => docs.forEach((d) => f(d)),
  docChanges: () => docs.map((d) => ({ doc: d })),
  metadata: {}
});
const doc = (id, data) => ({ id: id, data: () => JSON.parse(JSON.stringify(data)) });

// ── ① PRIMEIRO CARREGAMENTO: memória vazia, doc dividido ────────────────────
// É EXATAMENTE o caso que quebrou: nada em memória, e o doc sem os jogos.
const dividido = { id: 't1', name: 'T', _semPesados: ['matches'], _nJogos: 3,
  rounds: [{ round: 1, matches: [] }], matches: [], participants: [{ uid: 'a' }] };
aplica(snapDe([doc('t1', dividido)]));
const t1 = ctx.store.tournaments[0];
ok(!!t1, 'o torneio entrou no store');
ok(t1._faltamPesados === true,
  '⭐ ele foi MARCADO como incompleto — "não carregou" ≠ "não tem jogo"');
ok(montados.indexOf('t1') !== -1,
  '⛔⛔ E A BUSCA FOI DISPARADA. É ISTO que faltava — sem esta linha o torneio fica sem ' +
  'jogos pra sempre e a tela diz que o torneio não tem jogo.');

// ── ② torneio SEM jogo de verdade não dispara busca nenhuma ─────────────────
montados.length = 0; ctx.store.tournaments = []; ctx.store._parsedById = {};
const vazioDeVerdade = { id: 't2', name: 'U', _semPesados: ['matches'], _nJogos: 0,
  rounds: [], matches: [], participants: [] };
aplica(snapDe([doc('t2', vazioDeVerdade)]));
ok(!ctx.store.tournaments[0]._faltamPesados,
  '⭐ torneio que ainda não sorteou NÃO é marcado (é o `_nJogos: 0` desfazendo o empate)');
ok(montados.length === 0, '   e não paga leitura nenhuma');

// ── ③ com memória, a rede resolve sem buscar ────────────────────────────────
montados.length = 0;
ctx.store.tournaments = [{ id: 't1', rounds: [{ round: 1, matches: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] }] }];
ctx.store._parsedById = {};
aplica(snapDe([doc('t1', dividido)]));
const t1b = ctx.store.tournaments[0];
ok(t1b.rounds[0].matches.length === 3, '⭐ os jogos vieram da memória (re-render não paga leitura)');
ok(!t1b._faltamPesados && montados.length === 0, '   e nenhuma busca é disparada');

// ── ④ torneio INTEIRO (sem marcador) segue como sempre ──────────────────────
montados.length = 0; ctx.store.tournaments = []; ctx.store._parsedById = {};
aplica(snapDe([doc('t3', { id: 't3', rounds: [{ round: 1, matches: [{ id: 'x' }] }] })]));
ok(ctx.store.tournaments[0].rounds[0].matches.length === 1 && montados.length === 0,
  '⛔ torneio não dividido não é tocado por nada disto');

// ── ⑤ a busca de verdade existe, e é uma por torneio ────────────────────────
ok(/_montaPesadosQueFaltam\(ids\)/.test(src), 'a busca existe no AppStore');
const iM = src.indexOf('async _montaPesadosQueFaltam(ids)');
const busca = src.slice(iM, iM + 2600);
ok(/_montandoPesados\[id\]\) continue/.test(busca),
  '⛔ uma busca por torneio de cada vez — torneio ao vivo ecoa o tempo todo e viraria dezenas de buscas do mesmo dado');
ok(/Object\.keys\(montado\)\.forEach/.test(busca),
  '⭐ escreve NO LUGAR (mesma referência): telas guardam o objeto e trocar a referência as deixaria com o de antes');
ok(/_softRefreshView/.test(busca), 'e REPINTA quando chega — senão o dado chega e a tela não mostra');
ok(/window\._error\('\[fase2\] não consegui montar/.test(busca),
  '⛔ e falha com BARULHO: falhar calado aqui é a tela dizendo que o torneio não tem jogo');

console.log((fail ? '✗' : '✓') + ' torneio-dividido-chega-inteiro-na-tela: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
