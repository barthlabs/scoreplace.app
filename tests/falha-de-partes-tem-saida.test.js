/* FALHA DE PARTES TEM SAÍDA — erro visível e recuperável, nunca "Carregando" eterno
 *   node tests/falha-de-partes-tem-saida.test.js
 *
 * ⛔ O QUE A 2.1.71 DEIXOU ABERTO. Ela acertou o principal: dado desconhecido não vira
 * "você não está inscrito". E acertou o teto de 6 tentativas — sem teto, um torneio cujo
 * marcador promete uma parte que a subcoleção não tem bateria na rede pra sempre.
 * O que faltou foi o DEPOIS do teto: a busca parava e a tela continuava mostrando
 * "⏳ Carregando…", girando sem nada girando por trás. Num PWA de iOS não há console;
 * sem botão, a única saída era fechar e reabrir o app.
 *
 * ⚠️ UM "CARREGANDO" QUE NUNCA TERMINA É UMA AFIRMAÇÃO FALSA, da mesma família de
 * "você não está inscrito": as duas contam à pessoa algo que não é verdade sobre o estado
 * do sistema. Desistir é legítimo; fingir que ainda se está tentando, não.
 *
 * ⛔ E O ERRO NÃO PODE VIRAR AUSÊNCIA: falha de leitura não é prova de que a pessoa não
 * está inscrita. `_souInscrito` continua `null` no erro — travado no §2.
 *
 * Roda o AppStore REAL (render-harness carrega js/store.js de verdade) e o
 * `_buildMyResultsHtml` REAL do dashboard.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
const ROOT = path.join(__dirname, '..');
const SRC_STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const SRC_DASH = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
const SRC_DET = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }
const proximoTick = () => new Promise((r) => setImmediate(r));

/* ⛔ ENVELOPES QUE NÃO EXPLODEM. Contra a árvore ANTERIOR à R1.1.1 estas portas não
 * existem, e um `TypeError` na terceira linha esconderia as outras 44 asserções — o
 * controle tem que LISTAR o que falha, não morrer. Mesma regra do
 * sw-abre-sem-tela-branca. `'AUSENTE'` não é igual a nada que se espere. */
const _partesFalharam = (t) => (typeof W._partesFalharam === 'function') ? W._partesFalharam(t) : 'AUSENTE';
const _estadoDasPartes = (t) => (typeof W._estadoDasPartes === 'function') ? W._estadoDasPartes(t) : 'AUSENTE';
const _tentarDeNovo = (tid, btn) => (typeof W._tentarPartesDeNovo === 'function') ? W._tentarPartesDeNovo(tid, btn) : undefined;

const EU = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@x.com', _profileLoaded: true };
const TID = 'tour_1780009816637';

/* O Confra como o ouvinte entrega: documento-base, 2 inscritos soltos de 152. */
function baseSemElenco() {
  return {
    id: TID, name: 'Confra BT Alta da Clínica 2026', format: 'Liga', ligaRoundFormat: 'rei_rainha',
    status: 'active', sport: 'Beach Tennis', resultEntry: 'players', isPublic: true,
    creatorUid: EU.uid, memberUids: [EU.uid],
    _semPesados: ['matches', 'participants', 'opponentHistory'],
    _nPartes: { participants: 152, matches: 115, opponentHistory: 152 },
    _nJogos: 115,
    participants: [{ uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' }],
    rounds: [{ matches: [{ id: 'solto', label: 'R1 Grupo A • Jogo 1', p1: 'A / B', p2: 'C / D' }] }]
  };
}
/* O conteúdo que a subcoleção devolve quando dá certo — comigo dentro e com um jogo MEU
 * já confirmado, pra provar que "Novidades"/"Últimos resultados" se enchem sem reload. */
function partesQueChegam() {
  return {
    participants: [
      { uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' },
      { uid: EU.uid, displayName: EU.displayName }
    ],
    opponentHistory: { 'u-rb': ['u-zzz'] },
    _nPartes: { participants: 3, matches: 1, opponentHistory: 1 },
    _nJogos: 1,
    rounds: [{ matches: [{
      id: 'm-Q1', label: 'R1 Grupo Q • Jogo 1', isMonarch: true, round: 0,
      p1: 'Rodrigo Barth / Solto 1', p2: 'Solto 2 / Erika',
      team1: ['Rodrigo Barth', 'Solto 1'], team2: ['Solto 2', 'Erika'],
      scoreP1: 6, scoreP2: 3, winner: 'Rodrigo Barth / Solto 1', resultAt: Date.now() - 3600000
    }] }]
  };
}

/* ── banco de provas: timers CAPTURADOS (o teste manda o relógio) ─────────────── */
const agendados = [];
const _stOrig = W.setTimeout;
W.setTimeout = function (fn) { agendados.push(fn); return agendados.length; };
let repintou = 0;
W._softRefreshView = function () { repintou++; };
W.AppStore._saveToCache = function () {};
const _errOrig = W._error, _warnOrig = W._warn;
W._error = function () {}; W._warn = function () {};   // as falhas do teste são DE PROPÓSITO

let idasAoBanco = 0;
let modo = 'falha';
W.FirestoreDB = {
  _montaDeSubcolecoes: function () {
    idasAoBanco++;
    if (modo === 'falha') return Promise.reject(new Error('rede caiu'));
    return Promise.resolve(Object.assign({}, baseSemElenco(), partesQueChegam()));
  }
};

function novoEstado() {
  const t = baseSemElenco();
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = EU;
  W.AppStore._partesEmErro = {};
  W.AppStore._tentativasDePartes = {};
  W.AppStore._ultimaMontagem = {};
  W.AppStore._montandoPesados = {};
  W.AppStore._retentandoPartes = {};
  W.AppStore._falhasDePartes = [];
  agendados.length = 0; idasAoBanco = 0; repintou = 0;
  W._marcaPartesQueFaltam(t);
  return t;
}
/* Esgota o teto: dispara e vai puxando os timers agendados até não haver mais. */
async function ateDesistir() {
  await W.AppStore._montaPesadosQueFaltam([TID]);
  await proximoTick();
  let guarda = 0;
  while (agendados.length && guarda++ < 30) {
    const fn = agendados.shift();
    fn();
    await proximoTick(); await proximoTick();
  }
  return guarda;
}

/* ── a seção REAL do dashboard ───────────────────────────────────────────────── */
function extraiBuildMyResults(src) {
  const i = src.indexOf('function _buildMyResultsHtml() {');
  const marca = 'return _upHtml + _novHtml + html;';
  const j = src.indexOf(marca, i);
  return src.slice(i, src.indexOf('}', j + marca.length) + 1);
}
const _mem = {};
W.localStorage = W.localStorage || {
  getItem: (k) => (k in _mem) ? _mem[k] : null, setItem: (k, v) => { _mem[k] = String(v); }, removeItem: (k) => { delete _mem[k]; }
};
function secao() {
  const parts = W.AppStore.getMyParticipations();
  const fn = new Function('window', 'document', 'localStorage', 'participacoes',
    'with (window) { ' + extraiBuildMyResults(SRC_DASH) + ' return _buildMyResultsHtml; }'
  )(W, W.document, W.localStorage, parts);
  return fn();
}

(async function () {
  console.log('\n§1 SEIS FALHAS TERMINAM EM ERRO VISÍVEL — não em "Carregando" infinito');
  {
    const t = novoEstado();
    modo = 'falha';
    await ateDesistir();
    ok(idasAoBanco === 6, 'foi ao banco 6 vezes e parou (medido: ' + idasAoBanco + ') — teto respeitado');
    ok(agendados.length === 0, '⛔ e NÃO sobrou timer agendado: acabou a retentativa automática');
    ok(_partesFalharam(t) === true, '⭐ o estado de ERRO existe e é legível pela tela');
    ok(_estadoDasPartes(t) === 'erro',
      '⭐ e o estado NÃO é mais "carregando" — era isso que girava pra sempre (medido: ' + _estadoDasPartes(t) + ')');
    ok(repintou >= 1, 'a transição pro erro REPINTOU a tela (senão o estado novo não chegaria a ninguém)');
    ok(repintou <= 2, '⛔ e repintou uma vez só, na transição — não a cada falha (medido: ' + repintou + ')');
  }

  console.log('\n§1b ENQUANTO HÁ RETENTATIVA VIVA, ainda é "Carregando"');
  {
    const t = novoEstado();
    modo = 'falha';
    await W.AppStore._montaPesadosQueFaltam([TID]);
    await proximoTick();
    ok(idasAoBanco === 1 && agendados.length === 1, 'primeira falha, uma retentativa agendada');
    ok(_estadoDasPartes(t) === 'carregando',
      '⛔ com tentativa viva NÃO se anuncia erro — assustaria à toa (medido: ' + _estadoDasPartes(t) + ')');
    ok(_partesFalharam(t) === false, '  → e `_partesFalharam` é false');
  }

  console.log('\n§2 ERRO NÃO DECLARA "NÃO INSCRITO"');
  {
    const t = novoEstado();
    modo = 'falha';
    await ateDesistir();
    ok(W._souInscrito(t, EU) === null,
      '⭐ mesmo com o erro, a inscrição segue `null` — falha de LEITURA não é prova de ausência');
    ok(W._souInscrito(t, EU) !== false, '⛔ e não é `false`');
    ok(W.AppStore.participacoesIndefinidas().length === 1, 'e o torneio continua contando como indefinido');
  }

  console.log('\n§3 O NÚMERO deixa de prometer o que não vem');
  {
    const t = novoEstado();
    const i = SRC_DASH.indexOf('window._dashNum = function');
    const dashNum = new Function('window', 'with (window) { ' + SRC_DASH.slice(i, SRC_DASH.indexOf('\n};', i) + 3) + ' return window._dashNum; }')(W);
    modo = 'falha';
    await W.AppStore._montaPesadosQueFaltam([TID]); await proximoTick();
    ok(dashNum(2, t) === '…', 'com retentativa viva: "…" ("já volto")');
    while (agendados.length) { const fn = agendados.shift(); fn(); await proximoTick(); await proximoTick(); }
    ok(dashNum(2, t) === '—',
      '⭐ esgotado o teto: "—" ("não tenho este número") — reticências prometeriam algo que não vem');
  }

  console.log('\n§4 A SEÇÃO mostra o erro e traz o botão');
  {
    novoEstado();
    modo = 'falha';
    await ateDesistir();
    const html = secao();
    ok(html !== '', '⛔ a seção continua na tela (sumir é o defeito original da R1.1)');
    ok(/[Nn]ão consegui carregar/.test(html), '⭐ e diz honestamente que não conseguiu carregar');
    ok(!/[Cc]arregando os dados/.test(html), '⛔ e NÃO diz mais que está carregando');
    ok(/_tentarPartesDeNovo\(/.test(html) && /Tentar novamente/.test(html),
      '⭐ com botão "Tentar novamente" VISÍVEL');
    ok(/continuam salvos/.test(html),
      '  → e avisa que os dados não se perderam: foi a leitura que falhou');
  }

  console.log('\n§5 "TENTAR NOVAMENTE" consulta de novo a parte canônica');
  {
    novoEstado();
    modo = 'falha';
    await ateDesistir();
    const antes = idasAoBanco;
    ok((W.AppStore._partesEmErro || {})[TID], 'estado de erro registrado antes do clique');

    const botao = { disabled: false, textContent: '' };
    _tentarDeNovo(TID, botao);
    await proximoTick();
    ok(idasAoBanco === antes + 1,
      '⭐ o clique FOI AO BANCO de novo (medido: ' + (idasAoBanco - antes) + ') — antes o teto barrava e o botão giraria à toa');
    ok(botao.disabled === true && /Tentando/.test(botao.textContent), 'o botão dá retorno imediato de que agiu');
    ok(!(W.AppStore._partesEmErro || {})[TID] || (W.AppStore._tentativasDePartes || {})[TID] < 6,
      'o orçamento de tentativas foi renovado — a decisão foi da PESSOA');
  }

  console.log('\n§5b O BOTÃO NÃO É UM HARD RESET DISFARÇADO');
  {
    const i = SRC_STORE.indexOf('window._tentarPartesDeNovo = function');
    const corpo = SRC_STORE.slice(i, SRC_STORE.indexOf('\n};', i));
    ok(!/location\.reload|location\.href\s*=/.test(corpo), '⛔ não recarrega a página');
    ok(!/localStorage\.(clear|removeItem)/.test(corpo), '⛔ não limpa cache/armazenamento');
    ok(!/unregister|serviceWorker/.test(corpo), '⛔ não mexe no service worker');
    ok(!/caches\./.test(corpo), '⛔ não apaga cache do navegador');
    ok(/_montaPesadosQueFaltam\(\[tid\]\)/.test(corpo), '⭐ o que ele faz é reabrir a busca DAQUELE torneio');
  }

  console.log('\n§6 SUCESSO DEPOIS DO ERRO cura tudo, sem reload');
  {
    const t = novoEstado();
    modo = 'falha';
    await ateDesistir();
    ok(_estadoDasPartes(t) === 'erro' && secao().indexOf('Não consegui carregar') !== -1, 'partimos do erro');

    modo = 'sucesso';
    _tentarDeNovo(TID, null);
    await proximoTick(); await proximoTick();

    const vivo = W.AppStore.tournaments[0];
    ok(_estadoDasPartes(vivo) === 'carregado', '⭐ estado volta a "carregado"');
    ok(_partesFalharam(vivo) === false, '  → o erro sumiu');
    ok(W._souInscrito(vivo, EU) === true, '⭐ INSCRIÇÃO vira `true`');
    ok(vivo.participants.length === 3, '⭐ INSCRITOS chegaram (' + vivo.participants.length + ')');
    ok(W.AppStore.getMyParticipations().length === 1, '⭐ o torneio volta pra "Participando" (o que traz as seções)');
    const html = secao();
    ok(html.indexOf('Não consegui carregar') === -1, '⭐ a faixa de erro sumiu');
    ok(/Grupo Q|Jogo 1|Rodrigo Barth/.test(html), '⭐ e a seção agora traz o JOGO — sem nenhum reload');
    ok(repintou >= 1, 'e a montagem pediu repintura sozinha');
  }

  console.log('\n§7 CHEGADA TARDIA PELO OUVINTE também cura');
  {
    const t = novoEstado();
    modo = 'falha';
    await ateDesistir();
    ok(_partesFalharam(t) === true, 'partimos do erro');

    /* O ouvinte escreve NO LUGAR (mesma referência) e o objeto deixa de faltar parte.
     * ⭐ `_partesFalharam` RECONTA — por isso o erro morre sozinho, mesmo sem ninguém
     * limpar o registro. É o que faz a tela se curar sem clique nenhum. */
    const cheio = Object.assign({}, baseSemElenco(), partesQueChegam());
    Object.keys(cheio).forEach(function (k) { t[k] = cheio[k]; });
    delete t._faltamPesados; delete t._faltaOQue;

    ok(_partesFalharam(t) === false, '⭐ chegou pelo ouvinte: o erro morre sozinho (a leitura RECONTA)');
    ok(_estadoDasPartes(t) === 'carregado', '  → estado "carregado"');
    ok(W._souInscrito(t, EU) === true, '  → e a inscrição vira `true`');
    ok(/_partesEmErro\[String\(data\.id\)\]/.test(SRC_STORE),
      '  → e o próprio ouvinte também limpa o registro (senão sobraria lixo na sessão)');
  }

  console.log('\n§8 SEM LAÇO E SEM RAJADA');
  {
    novoEstado();
    modo = 'falha';
    await ateDesistir();
    const depoisDoTeto = idasAoBanco;
    // ecos atrás de ecos, como um torneio ao vivo faria
    for (let k = 0; k < 12; k++) { await W.AppStore._montaPesadosQueFaltam([TID]); await proximoTick(); }
    ok(idasAoBanco === depoisDoTeto,
      '⛔ 12 ecos DEPOIS do teto não geraram nem uma ida ao banco (medido: ' + (idasAoBanco - depoisDoTeto) + ')');
    ok(agendados.length === 0, '⛔ e não agendaram nada — desistir quer dizer desistir');

    // e antes do teto, o piso continua segurando a rajada
    novoEstado();
    await W.AppStore._montaPesadosQueFaltam([TID]); await proximoTick();
    const um = idasAoBanco;
    for (let k = 0; k < 8; k++) { await W.AppStore._montaPesadosQueFaltam([TID]); await proximoTick(); }
    ok(idasAoBanco === um, '⛔ e o PISO segue segurando a rajada antes do teto (medido: ' + (idasAoBanco - um) + ' extra)');
  }

  console.log('\n§9 O DETALHE do torneio usa a MESMA porta e o MESMO botão');
  {
    ok(/_partesFalharam\(t\)/.test(SRC_DET) && /_botaoTentarPartes\(t\.id\)/.test(SRC_DET),
      'tournaments.js mostra o erro e o botão — senão o relato volta por lá');
    ok(/window\._botaoTentarPartes/.test(SRC_DASH),
      'e a dashboard usa o MESMO botão (fonte única: dois desenhos divergiriam)');
  }

  W.setTimeout = _stOrig; W._error = _errOrig; W._warn = _warnOrig;
  console.log('\n' + (fail ? '✗' : '✅') + ' falha de partes: ' + pass + ' ok, ' + fail + ' falharam');
  if (fail) { fails.forEach(function (f) { console.log('   ✗ ' + f); }); process.exitCode = 1; }
})().catch(function (e) { console.error('EXPLODIU:', e && e.stack || e); process.exitCode = 1; });
