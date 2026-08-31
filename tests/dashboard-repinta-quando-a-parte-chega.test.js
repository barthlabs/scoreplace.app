/* A DASHBOARD REPINTA QUANDO A PARTE CHEGA — e SÓ quando ela chega  (R1.3)
 *   node tests/dashboard-repinta-quando-a-parte-chega.test.js
 *
 * ⛔ MEDIDO EM PRODUÇÃO NA 2.1.73, em sessão autenticada real: o Confra estava INTEIRO no
 * runtime — 152 inscritos, 115 jogos, `_estadoDasPartes` = "carregado", `_souInscrito` =
 * true, `_meuStatusNoTorneio` = "enrolled" — e o DOM continuava no PRIMEIRO QUADRO:
 * "👤 … INSCRITOS", "⏳ Carregando…", "Participando 1", e "📣 Novidades" ausente com 99
 * itens elegíveis calculados ali na hora.
 *
 * ⛔ A CAUSA ERA UMA STRING. `_dashDataSigFor` devolvia `arr.length + '|' + ids`. Quando as
 * partes pesadas chegam, a QUANTIDADE de torneios e os IDS não mudam — a assinatura ficava
 * idêntica, `_softRefreshView` concluía "nada mudou" e o `_softRefreshView()` que a própria
 * montagem dispara não repintava NUNCA. As três levas anteriores consertaram o que a tela
 * DIZ; esta conserta a tela CHEGAR A SER REDESENHADA.
 *
 * ⛔ E A SAÍDA NÃO É VOLTAR PRO CONTEÚDO: `updatedAt` está proibido (repintar a cada placar
 * = trocar o DOM debaixo do dedo; foi a "tela preta" e o "tem que clicar 2x"), e contar
 * inscritos/jogos traria o mesmo problema por outro caminho. Entra SÓ a transição de
 * hidratação, um caractere por torneio, do MESMO `_estadoDasPartes` que o resto do app usa.
 *
 * Roda o store.js REAL (render-harness) e o `_buildMyResultsHtml` REAL do dashboard.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./render-harness');
const W = H.sandbox;
const ROOT = path.join(__dirname, '..');
const SRC_DASH = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
const SRC_DB = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }
const tick = () => new Promise(r => setImmediate(r));

const EU = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@x.com', _profileLoaded: true };
const TID = 'tour_1780009816637';

/* Documento-base do Confra, como o ouvinte entrega no primeiro quadro. */
function base() {
  return {
    id: TID, name: 'Confra BT Alta da Clínica 2026', format: 'Liga', ligaRoundFormat: 'rei_rainha',
    status: 'active', sport: 'Beach Tennis', resultEntry: 'players', isPublic: true,
    creatorUid: 'u-org', memberUids: [EU.uid, 'u-org'],
    _semPesados: ['matches', 'participants', 'opponentHistory'],
    _nPartes: { participants: 152, matches: 115, opponentHistory: 152 }, _nJogos: 115,
    participants: [{ uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' }],
    rounds: [{ matches: [] }]
  };
}
/* O que a subcoleção devolve: eu no elenco e um jogo de OUTRAS pessoas com placar
 * (é o que alimenta "📣 Novidades no seu torneio"). */
function partes() {
  return {
    participants: [{ uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' },
                   { uid: EU.uid, displayName: 'Rodrigo Barth', enrollSeq: 1 }],
    opponentHistory: { 'u-rb': ['u-zzz'] },
    _nPartes: { participants: 3, matches: 1, opponentHistory: 1 }, _nJogos: 1,
    rounds: [{ matches: [{
      id: 'm-Q1', label: 'R1 Grupo Q • Jogo 1', isMonarch: true, round: 0,
      p1: 'Eduardo Mange / Bruna Verga Sá', p2: 'Fernanda Biojone / Karla L',
      team1: ['Eduardo Mange', 'Bruna Verga Sá'], team2: ['Fernanda Biojone', 'Karla L'],
      scoreP1: 3, scoreP2: 6, winner: 'Fernanda Biojone / Karla L', resultAt: Date.now() - 3600000
    }] }]
  };
}
function chega(t) {
  const p = partes();
  Object.keys(p).forEach(k => { t[k] = p[k]; });
  delete t._faltamPesados; delete t._faltaOQue;
  return t;
}

/* ── instrumentação: quem pede repintura, e quantas vezes ────────────────── */
let pedidos = [];
W._dashPedirRepintura = function (motivo) { pedidos.push(motivo || '?'); };
W._dashRerender = function () { pedidos.push('rerender-direto'); };
W.location = W.location || {}; W.location.hash = '';
const _mem = {};
W.localStorage = W.localStorage || {
  getItem: k => (k in _mem) ? _mem[k] : null, setItem: (k, v) => { _mem[k] = String(v); }, removeItem: k => { delete _mem[k]; }
};

function comStore(ts) { W.AppStore.tournaments = ts; W.AppStore.currentUser = EU; }
function sig() { return W._dashDataSigFor(W.AppStore.tournaments || []); }
/* Simula o que a dashboard faz ao pintar: carimba a assinatura do que foi desenhado. */
function carimbaRender() { W._dashDataSig = sig(); }

function extraiBuildMyResults(src) {
  const i = src.indexOf('function _buildMyResultsHtml() {');
  const marca = 'return _upHtml + _novHtml + html;';
  const j = src.indexOf(marca, i);
  return src.slice(i, src.indexOf('}', j + marca.length) + 1);
}
function secao() {
  const parts = W.AppStore.getMyParticipations();
  const fn = new Function('window', 'document', 'localStorage', 'participacoes',
    'with (window) { ' + extraiBuildMyResults(SRC_DASH) + ' return _buildMyResultsHtml; }'
  )(W, W.document, W.localStorage, parts);
  return fn();
}
const dashNum = (function () {
  const i = SRC_DASH.indexOf('window._dashNum = function');
  if (i < 0) return () => 'AUSENTE';
  return new Function('window', 'with (window) { ' + SRC_DASH.slice(i, SRC_DASH.indexOf('\n};', i) + 3) + ' return window._dashNum; }')(W);
})();

(async function () {
  console.log('\n§1 PRIMEIRO QUADRO — documento-base parcial');
  const t = base();
  comStore([t]);
  W.AppStore._partesEmErro = {}; W.AppStore._tentativasDePartes = {};
  W._marcaPartesQueFaltam(t);
  ok(dashNum(2, t) === '…', 'o número sai como "…" (não afirma 2 de 152)');
  ok(W._souInscrito(t, EU) === null, 'a inscrição fica indefinida, não "não inscrito"');
  carimbaRender();
  const sigPrimeiroQuadro = W._dashDataSig;
  ok(/~/.test(sigPrimeiroQuadro), 'a assinatura do render CARREGA a marca de hidratação pendente ("~")');

  console.log('\n§2 AS PARTES CHEGAM — ids e quantidade IGUAIS, e mesmo assim repinta UMA vez');
  const idsAntes = (W.AppStore.tournaments || []).map(x => x.id).join(',');
  chega(t);
  const idsDepois = (W.AppStore.tournaments || []).map(x => x.id).join(',');
  ok(idsAntes === idsDepois && W.AppStore.tournaments.length === 1,
    '⚠️ nem a quantidade nem os IDS mudaram — era exatamente por isso que a assinatura antiga não via nada');
  ok(sig() !== sigPrimeiroQuadro,
    '⭐ e a assinatura MUDOU (de "' + sigPrimeiroQuadro.slice(-24) + '" para "' + sig().slice(-24) + '")');
  pedidos = [];
  W._softRefreshView();
  ok(pedidos.length === 1, '⭐ o soft refresh pediu EXATAMENTE UMA repintura (pediu ' + pedidos.length + ')');
  carimbaRender();
  pedidos = [];
  W._softRefreshView(); W._softRefreshView();
  ok(pedidos.length === 0, '⛔ e depois de repintar não pede mais nenhuma — sem laço');

  console.log('\n§2b O QUE A REPINTURA PASSA A MOSTRAR');
  ok(dashNum(152, t) === 152, '⭐ o número real aparece (152), sem "…"');
  ok(W._souInscrito(t, EU) === true, '⭐ a inscrição vira `true`');
  ok(W._meuStatusNoTorneio(t).code === 'enrolled', '⭐ o card do topo diz "enrolled"');
  const parts = W.AppStore.getMyParticipations().map(x => x.name);
  ok(parts.indexOf('Confra BT Alta da Clínica 2026') !== -1,
    '⭐ "Participando" passa a incluir o Confra (era o "Participando 1" errado)');
  const html = secao();
  ok(html !== '' && !/[Cc]arregando os dados/.test(html), '⭐ a seção sai do estado de carregamento');
  ok(/Novidades no seu torneio/.test(html),
    '⭐ e "📣 Novidades no seu torneio" é montada (jogo de outra pessoa, com placar)');

  console.log('\n§3 SNAPSHOT SEM TRANSIÇÃO DE HIDRATAÇÃO — não repinta');
  pedidos = [];
  W._softRefreshView();
  ok(pedidos.length === 0, 'eco de snapshot com tudo já carregado: ZERO repinturas');

  console.log('\n§4 PLACAR E PRESENÇA não reintroduzem reconstrução contínua');
  {
    const antes = sig();
    // placar aprovado num jogo (é o eco que a v3.1.26 fazia repintar, e que fez a tela preta)
    t.rounds[0].matches[0].scoreP1 = 6; t.rounds[0].matches[0].scoreP2 = 4;
    t.rounds[0].matches[0].winner = 'Eduardo Mange / Bruna Verga Sá';
    t.updatedAt = new Date().toISOString();
    ok(sig() === antes, '⛔ placar lançado NÃO muda a assinatura (nem via `updatedAt`)');
    // presença
    t.checkedIn = Object.assign({}, t.checkedIn || {}, { 'u-zzz': Date.now() });
    ok(sig() === antes, '⛔ presença marcada também não muda');
    pedidos = [];
    W._softRefreshView(); W._softRefreshView(); W._softRefreshView();
    ok(pedidos.length === 0,
      '⛔ três ecos seguidos = ZERO repinturas — é o que impede a piscada, o salto de scroll e o clique perdido');
    ok(!/updatedAt/.test(String(W._dashDataSigFor)), '⛔ e a assinatura não voltou a ler `updatedAt`');
  }

  console.log('\n§4b TORNEIO INTEIRO produz a assinatura ANTIGA, caractere por caractere');
  {
    const inteiro = { id: 'tour_x', name: 'Inteiro', participants: [], memberUids: [], rounds: [] };
    const antiga = 1 + '|' + inteiro.id;
    comStore([inteiro]);
    ok(sig() === antiga,
      '⭐ quem não tem torneio dividido não ganha nem uma repintura a mais (sig = "' + sig() + '")');
    comStore([t]); carimbaRender();
  }

  console.log('\n§5 ERRO, RETRY E CHEGADA POSTERIOR (R1.1.1 / R1.1.2 preservados)');
  {
    const t2 = base();
    comStore([t2]);
    W.AppStore._partesEmErro = {}; W.AppStore._tentativasDePartes = {};
    W._marcaPartesQueFaltam(t2);
    carimbaRender();
    const sigCarregando = W._dashDataSig;

    W.AppStore._partesEmErro[TID] = { desde: Date.now(), tentativas: 6, causa: 'rede caiu' };
    ok(sig() !== sigCarregando && /!/.test(sig()),
      '⭐ a DESISTÊNCIA também é transição: a assinatura muda (marca "!")');
    pedidos = []; W._softRefreshView();
    ok(pedidos.length === 1, '  → e pede UMA repintura, pra o aviso de erro chegar à tela');
    carimbaRender();

    ok(dashNum(2, t2) === '—', '⭐ no erro o número é "—", nunca 0 nem "…" (R1.1.1)');
    ok(W._souInscrito(t2, EU) === null, '⛔ e o erro NÃO vira "não inscrito" (R1.1.2)');
    const card = W._meuCardNoTopo(t2);
    ok(/Não consegui carregar/.test(card.replace(/<[^>]*>/g, ' ')) && /Tentar novamente/.test(card),
      '⭐ o card do topo traz o aviso e o botão "Tentar novamente"');
    ok(!/não está inscrito/i.test(card), '  → e não diz "não está inscrito"');

    // o retry dá certo: as partes chegam
    delete W.AppStore._partesEmErro[TID];
    chega(t2);
    ok(sig() !== W._dashDataSig, '⭐ sucesso do retry muda a assinatura de novo');
    pedidos = []; W._softRefreshView();
    ok(pedidos.length === 1, '  → UMA repintura, sem reload');
    carimbaRender();
    ok(dashNum(152, t2) === 152 && W._souInscrito(t2, EU) === true,
      '⭐ e a tela volta ao número real e a "inscrito"');
  }

  console.log('\n§6 loadAllPublicTournaments — o caminho do RESUMO não pode explodir em `snap.size`');
  {
    /* Recorta o método REAL do firebase-db.js e roda com um `db` de mentira. */
    const marca = 'async loadAllPublicTournaments(';
    const ini = SRC_DB.indexOf(marca);
    let i = SRC_DB.indexOf('{', ini + marca.length), nivel = 0, fim = -1;
    for (; i < SRC_DB.length; i++) {
      if (SRC_DB[i] === '{') nivel++;
      else if (SRC_DB[i] === '}') { nivel--; if (nivel === 0) { fim = i + 1; break; } }
    }
    const corpo = SRC_DB.slice(ini, fim);
    const logs = []; const erros = [];
    const win = { _log: (...a) => logs.push(a), _warn: () => {}, _error: (...a) => erros.push(a), _noteFsReads: () => {}, _marcaResumo: () => {} };
    const ctx = { window: win, console: console, Promise: Promise, Array: Array, Object: Object, Date: Date, String: String, Number: Number };
    ctx.globalThis = ctx; vm.createContext(ctx);
    const obj = vm.runInContext('({ ' + corpo + ' })', ctx);

    const docsFalsos = (n, pref) => {
      const arr = []; for (let k = 0; k < n; k++) arr.push({ id: pref + k, data: () => ({ id: pref + k, name: 'T' + k }) });
      return { size: n, forEach: f => arr.forEach(f) };
    };
    // ① caminho do RESUMO com documentos
    obj.db = { collection: (nome) => ({ where: () => ({ limit: () => ({
      get: async () => (nome === 'tournaments_summary') ? docsFalsos(3, 'r') : docsFalsos(9, 'c')
    }) }) }) };
    const r1 = await obj.loadAllPublicTournaments(50);
    ok(erros.length === 0, '⭐ o caminho do resumo NÃO lança (era o TypeError de `snap.size`)');
    ok(r1 && r1.tournaments.length === 3,
      '⭐ e devolve os 3 torneios do resumo — antes o `catch` devolvia [] e a vitrine voltava VAZIA');
    const ultimo = logs[logs.length - 1] || [];
    ok(ultimo[1] && ultimo[1].lidos === 3 && ultimo[1].via === 'resumo',
      '  → com contagem válida no log (lidos=' + (ultimo[1] && ultimo[1].lidos) + ', via=' + (ultimo[1] && ultimo[1].via) + ')');

    // ② FALLBACK: resumo vazio → caminho completo
    logs.length = 0; erros.length = 0;
    obj.db = { collection: (nome) => ({ where: () => ({ limit: () => ({
      get: async () => (nome === 'tournaments_summary') ? docsFalsos(0, 'r') : docsFalsos(9, 'c')
    }) }) }) };
    const r2 = await obj.loadAllPublicTournaments(50);
    ok(erros.length === 0 && r2.tournaments.length === 9, 'o fallback continua funcionando (9 torneios)');
    const u2 = logs[logs.length - 1] || [];
    ok(u2[1] && u2[1].lidos === 9 && u2[1].via === 'completo',
      '  → e com a contagem do caminho que de fato rodou (lidos=' + (u2[1] && u2[1].lidos) + ', via=' + (u2[1] && u2[1].via) + ')');

    // ③ resumo INDISPONÍVEL (erro de regra) → fallback, sem derrubar
    logs.length = 0; erros.length = 0;
    obj.db = { collection: (nome) => ({ where: () => ({ limit: () => ({
      get: async () => { if (nome === 'tournaments_summary') throw new Error('permission-denied'); return docsFalsos(4, 'c'); }
    }) }) }) };
    const r3 = await obj.loadAllPublicTournaments(50);
    ok(erros.length === 0 && r3.tournaments.length === 4,
      'resumo indisponível cai no completo sem lançar (4 torneios)');
    /* ⚠️ `snap.size` DENTRO do bloco do fallback é legítimo — quem cria `snap` é ele.
     * O defeito era usá-lo DEPOIS, no log final, onde o caminho do resumo já tinha
     * saído do bloco e `snap` seguia `undefined`. É esse trecho que se afirma. */
    const depoisDoFallback = corpo.slice(corpo.indexOf('tournaments.sort('));
    ok(!/\bsnap\b/.test(depoisDoFallback),
      '⛔ e depois do bloco do fallback ninguém mais toca em `snap` (era o log final)');
  }

  console.log('\n' + (fail ? '✗' : '✅') + ' repintura/vitrine: ' + pass + ' ok, ' + fail + ' falharam');
  if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exitCode = 1; }
})().catch(e => { console.error('EXPLODIU:', e && e.stack || e); process.exitCode = 1; });
