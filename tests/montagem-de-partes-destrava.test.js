/* A TRAVA DE MONTAGEM DAS PARTES TEM QUE SOLTAR — SEMPRE
 * node tests/montagem-de-partes-destrava.test.js
 *
 * O QUE ACONTECEU (30/ago/2026, Confra AO VIVO, print do dono). A tela mostrou o torneio
 * SEM NADA: "Demais jogos da rodada (0)", classificação do grupo toda zerada, 1 W.O. onde
 * havia 15, 5 eventos de histórico onde havia 113. No banco não faltava um byte — 115 jogos
 * na subcoleção, 93 com placar. Era só a tela.
 *
 * A CAUSA. `_montaPesadosQueFaltam` ligava `_montandoPesados[id] = true` e só desligava no
 * `.catch`. No caminho de SUCESSO — e nos dois `return` mudos do `.then` (`!montado`,
 * `!vivo`) — a trava ficava ligada pelo resto da sessão. E no topo do laço mora
 * `if (this._montandoPesados[id]) continue;`. Ou seja: a trava era DE UMA VEZ SÓ.
 *
 * O ESTRAGO, que é maior que o bug. Bastava UM eco chegar sem os jogos: `_faltamPesados`
 * acusava certo, a busca era pedida, o `continue` recusava CALADO, e o objeto vivo virava o
 * documento MAGRO. A partir daí `_enxertaJogos` não tem mais de onde enxertar (o `velho`
 * também está vazio) — e nenhuma montagem podia mais acontecer. Tela vazia permanente, até
 * recarregar a página. Sem erro em lugar nenhum: `return` mudo não passa pelo
 * `_falhasDePartes` do `?diag=1`, que existe justamente pra isso.
 *
 * ⛔ POR QUE ESTE TESTE NÃO OLHA O TEXTO DO ARQUIVO. Um `grep` por "delete
 * self._montandoPesados" ficaria VERDE com a versão quebrada — ela TEM esse delete, no
 * `.catch`. O que falhava era o CICLO DE VIDA, e ciclo de vida só se prova RODANDO.
 * Ver [[feedback_green_tests_still_broken]] / [[feedback_tests_must_reproduce_real_failure]].
 *
 * AS DUAS METADES (cada uma sozinha mente):
 *   ① o código de HOJE solta a trava em TODO caminho — sucesso, vazio, sumiço e erro;
 *   ② o código de ONTEM, no mesmo banco de provas, TRAVA. Se ② parar de travar, o teste
 *      não está mais medindo a falha que motivou o conserto e ① virou decoração.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

/* ── recorta o método REAL do store.js (não uma réplica: réplica é o que deixa suíte verde
 * sobre código revertido) e o embrulha num objeto avulso. Ele só toca `this`, `window` e
 * `Date` — nada do resto do store. ─────────────────────────────────────────────────── */
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const INICIO = SRC.indexOf('async _montaPesadosQueFaltam(ids) {');
ok(INICIO !== -1, 'achei `_montaPesadosQueFaltam` no store.js');
const FIM = SRC.indexOf('\n  isOrganizer(tournament) {', INICIO);
ok(FIM > INICIO, 'e achei onde ele termina (o método seguinte é `isOrganizer`)');
const METODO = SRC.slice(INICIO, SRC.lastIndexOf('},', FIM) + 1);

/* A VERSÃO DE ONTEM, escrita aqui de propósito: é o corpo que estava NO AR em 30/ago.
 * Ela existe pra provar que o banco de provas ACUSA — sem ela eu não sei se ① passa por
 * estar certo ou por o teste não medir nada. */
const METODO_ANTIGO = [
  'async _montaPesadosQueFaltam(ids) {',
  '  if (!Array.isArray(ids) || !ids.length) return;',
  '  this._montandoPesados = this._montandoPesados || {};',
  '  var self = this;',
  '  for (var i = 0; i < ids.length; i++) {',
  '    var id = String(ids[i]);',
  '    if (this._montandoPesados[id]) continue;',
  '    this._montandoPesados[id] = true;',
  '    (function (tid) {',
  '      var alvo = (self.tournaments || []).find(function (x) { return x && String(x.id) === tid; });',
  '      if (!alvo || !Array.isArray(alvo._semPesados) || !alvo._semPesados.length) {',
  '        delete self._montandoPesados[tid]; return;',
  '      }',
  '      window.FirestoreDB._montaDeSubcolecoes(tid, alvo, alvo._semPesados)',
  '        .then(function (montado) {',
  '          if (!montado) return;',
  '          var vivo = (self.tournaments || []).find(function (x) { return x && String(x.id) === tid; });',
  '          if (!vivo) return;',
  '          Object.keys(montado).forEach(function (k) { vivo[k] = montado[k]; });',
  '          delete vivo._faltamPesados;',
  '        })',
  '        .catch(function () { delete self._montandoPesados[tid]; });',
  '    })(id);',
  '  }',
  '}'
].join('\n');

/* ── banco de provas: um torneio DIVIDIDO e um montador de mentira que CONTA chamadas ── */
const ID = 'tour_teste';
function novoTorneio() {
  return { id: ID, _semPesados: ['matches', 'participants'], _faltamPesados: true, rounds: [{ matches: [] }], participants: [] };
}
function monta(metodoTxt, montadorFake) {
  /* ⚠️ 2.1.71: a falha passou a AGENDAR a própria retentativa, então o método depende de
   * `setTimeout` e de `_marcaPartesQueFaltam`. Aqui o timer é CAPTURADO em vez de
   * disparado — o teste manda o relógio, e nada fica pendurado depois que a suíte acaba. */
  const agendados = [];
  const janela = { FirestoreDB: { _montaDeSubcolecoes: montadorFake }, _error: function () {}, _warn: function () {}, _softRefreshView: function () {},
    _marcaPartesQueFaltam: function (t) { return !!(t && t._faltamPesados); } };
  const ctx = { window: janela, Date: Date, Array: Array, Object: Object, String: String, JSON: JSON, console: console,
    setTimeout: function (fn) { agendados.push(fn); return agendados.length; } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const alvo = vm.runInContext('({ ' + metodoTxt + ' })', ctx);
  alvo.tournaments = [novoTorneio()];
  alvo._saveToCache = function () {};
  alvo._agendados = agendados;
  return alvo;
}
const esperar = () => new Promise(function (r) { setTimeout(r, 0); });

/* ⚠️ O PISO entre tentativas é real e proposital (soltar a trava sem piso reabriria a busca
 * em rajada a cada eco). Nos testes eu ando o relógio, em vez de esperar 15s de verdade —
 * esperar tornaria a suíte lenta o bastante pra alguém desligar, que é como teste morre. */
function andarORelogio(store, ms) {
  Object.keys(store._ultimaMontagem || {}).forEach(function (k) { store._ultimaMontagem[k] -= ms; });
}

(async function () {
  console.log('\n① o código de HOJE solta a trava em todo caminho\n');

  // sucesso → a trava tem que estar solta pra uma PRÓXIMA montagem acontecer
  let n = 0;
  let store = monta(METODO, function () { n++; return Promise.resolve({ rounds: [{ matches: [{ id: 'j1' }] }], participants: [{ uid: 'u1' }] }); });
  await store._montaPesadosQueFaltam([ID]); await esperar();
  ok(n === 1, 'montou uma vez');
  ok(!store.tournaments[0]._faltamPesados, 'e o torneio deixou de estar faltando');
  ok(!store._montandoPesados[ID], 'SUCESSO solta a trava (era aqui que ela ficava presa pra sempre)');
  // o eco seguinte esvazia o objeto vivo: é exatamente o que aconteceu no Confra
  store.tournaments[0].rounds = [{ matches: [] }];
  store.tournaments[0]._faltamPesados = true;
  andarORelogio(store, 20000);
  await store._montaPesadosQueFaltam([ID]); await esperar();
  ok(n === 2, '⭐ e o torneio pode ser REMONTADO depois — a tela se cura sozinha');
  ok(store.tournaments[0].rounds[0].matches.length === 1, '   os jogos voltaram pro objeto vivo');

  // montagem que volta vazia → solta (e agora fala)
  n = 0;
  store = monta(METODO, function () { n++; return Promise.resolve(null); });
  await store._montaPesadosQueFaltam([ID]); await esperar();
  ok(!store._montandoPesados[ID], 'montagem VAZIA solta a trava (era um `return` mudo e travado)');
  andarORelogio(store, 20000);
  await store._montaPesadosQueFaltam([ID]); await esperar();
  ok(n === 2, '   e deixa tentar de novo');

  // torneio sumiu do store no meio da montagem → solta
  n = 0;
  store = monta(METODO, function () { n++; return Promise.resolve({ rounds: [{ matches: [{ id: 'j1' }] }] }); });
  const guardado = store.tournaments;
  store.tournaments = [];                       // sumiu enquanto a busca estava em voo
  await store._montaPesadosQueFaltam([ID]); await esperar();
  store.tournaments = guardado;
  ok(!store._montandoPesados[ID], 'torneio que SAIU do store no meio solta a trava');

  // erro → solta (isto já funcionava; fica travado pra não regredir)
  n = 0;
  store = monta(METODO, function () { n++; return Promise.reject(new Error('rede caiu')); });
  await store._montaPesadosQueFaltam([ID]); await esperar();
  ok(!store._montandoPesados[ID], 'ERRO solta a trava (comportamento antigo, preservado)');
  ok((store._falhasDePartes || []).length === 1, '   e a falha fica guardada pro `?diag=1`');

  // o PISO: soltar não pode virar busca em rajada
  n = 0;
  store = monta(METODO, function () { n++; return Promise.resolve({ rounds: [{ matches: [{ id: 'j1' }] }] }); });
  await store._montaPesadosQueFaltam([ID]); await esperar();
  store.tournaments[0]._faltamPesados = true;
  await store._montaPesadosQueFaltam([ID]); await esperar();
  await store._montaPesadosQueFaltam([ID]); await esperar();
  ok(n === 1, '⛔ o PISO segura a rajada — eco atrás de eco não vira N buscas');

  /* ── ⭐ 2.1.71 · SOLTAR A TRAVA NÃO BASTA: ALGUÉM PRECISA BATER NA PORTA DE NOVO ──
   * A trava era solta certinho e não adiantava nada — esta função só é chamada pelo
   * OUVINTE (a cada eco) e pelo boot. Torneio parado não ecoa, então uma falha de rede
   * num único GET deixava a tela incompleta pelo RESTO DA SESSÃO, calada, com o dado
   * inteiro no banco. Agora a própria falha agenda a próxima. */
  console.log('');
  n = 0;
  store = monta(METODO, function () {
    n++;
    if (n === 1) return Promise.reject(new Error('rede caiu'));
    return Promise.resolve({ rounds: [{ matches: [{ id: 'j1' }] }], participants: [{ uid: 'u1' }] });
  });
  await store._montaPesadosQueFaltam([ID]); await esperar();
  ok(n === 1 && store._agendados.length === 1,
    '⭐ a FALHA agenda a próxima tentativa (antes: ninguém retentava um torneio parado)');
  store._agendados[0](); await esperar(); await esperar();
  ok(n === 2, '   e a retentativa vai mesmo ao banco — o timer É o piso, então o carimbo é limpo');
  ok(store.tournaments[0].rounds[0].matches.length === 1, '   os jogos chegam na segunda, sem recarregar');
  ok(!store._tentativasDePartes[ID], '   e o contador de tentativas zera no sucesso');

  // teto: um torneio que promete uma parte inexistente não pode bater pra sempre
  n = 0;
  store = monta(METODO, function () { n++; return Promise.reject(new Error('sempre falha')); });
  for (let k = 0; k < 10; k++) {
    await store._montaPesadosQueFaltam([ID]); await esperar();
    if (!store._agendados.length) break;
    store._agendados.shift()();
    await esperar();
  }
  ok(n <= 6, '⛔ e há TETO: para de retentar depois de 6 (medido: ' + n + ') — senão vira laço eterno');

  console.log('\n② o código de ONTEM, no mesmo banco de provas, TRAVA\n');

  n = 0;
  store = monta(METODO_ANTIGO, function () { n++; return Promise.resolve({ rounds: [{ matches: [{ id: 'j1' }] }] }); });
  await store._montaPesadosQueFaltam([ID]); await esperar();
  ok(n === 1, 'a versão antiga monta na primeira vez (por isso ninguém via o bug ao abrir)');
  ok(store._montandoPesados[ID] === true, '⛔ mas a trava FICA ligada depois do sucesso');
  store.tournaments[0].rounds = [{ matches: [] }];
  store.tournaments[0]._faltamPesados = true;
  await store._montaPesadosQueFaltam([ID]); await esperar();
  ok(n === 1, '⛔ e a remontagem NUNCA acontece — é a tela vazia do print do dono');
  ok(store.tournaments[0].rounds[0].matches.length === 0, '   os jogos não voltam: só recarregar a página curava');

  console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
  process.exit(fail ? 1 : 0);
})();
