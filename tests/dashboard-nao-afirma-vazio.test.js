/* A DASHBOARD NÃO AFIRMA VAZIO QUE ELA NÃO SABE SER VAZIO
 *   node tests/dashboard-nao-afirma-vazio.test.js
 *
 * O RELATO, repetido (31/ago/2026): "2 inscritos. caralho" · "sem novidades; ultimos
 * resultados de torneios antigos" — num torneio com 152 inscritos e 115 jogos, com o
 * dado canônico INTACTO no banco.
 *
 * ⛔ DUAS CAUSAS, e as duas ficam FORA da dashboard:
 *   ① torneio DIVIDIDO cujas partes pesadas ainda não chegaram (2 inscritos soltos no
 *      documento escondendo 152 na subcoleção);
 *   ② execução HÍBRIDA — shell de uma build, JS de outra (ver
 *      tests/navegacao-nao-mistura-versoes.test.js).
 *
 * ⛔ E POR QUE CONSERTAR A CAUSA NÃO BASTA. A dashboard AFIRMAVA. `individualCount` saía
 * de `participants.length` sem nunca perguntar se aquela lista está completa, e
 * `if (totalSection === 0) return ''` apagava "📣 Novidades" e "🏅 Seus últimos
 * resultados" inteiras. Um zero afirmado é indistinguível de um zero verdadeiro pra quem
 * olha — e por isso cada nova causa reaparecia como o MESMO relato.
 *
 * ⚠️ O QUE ESTA SUÍTE **NÃO** ACEITA: esconder seção, limpar armazenamento ou recarregar.
 * A seção tem que CONTINUAR na tela dizendo que está carregando (§2), e o vazio VERDADEIRO
 * tem que continuar sumindo (§3) — senão a tela ganha um aviso permanente que ninguém lê.
 *
 * ⭐ CONTROLE: contra o dashboard.js anterior a esta versão, §1 e §2 ficam VERMELHOS.
 *   git show HEAD:js/views/dashboard.js > /tmp/dash-antigo.js
 *   SP_DASHBOARD_SRC=/tmp/dash-antigo.js node tests/dashboard-nao-afirma-vazio.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');   // carrega o store.js REAL no sandbox
const W = H.sandbox;

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(process.env.SP_DASHBOARD_SRC || path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }

const AGORA = Date.now();
/* ⛔ envelope: contra a árvore anterior à R1.1 esta porta não existe, e um TypeError
 * esconderia o resto da suíte. Ver a mesma nota em sw-abre-sem-tela-branca. */
const _indef = () => (typeof W.AppStore.participacoesIndefinidas === 'function')
  ? W.AppStore.participacoesIndefinidas() : [];

/* ── O CONFRA COMO ELE ESTAVA NO DOCUMENTO, medido em 31/ago 01:10 ─────────────
 *   _semPesados      : ["matches","participants","opponentHistory"]
 *   rounds[0].matches: 1     ← UM jogo solto DENTRO do documento
 *   participants     : 2     ← DOIS inscritos soltos
 *   subcoleções      : 115 jogos · 152 inscritos   ← o dado real, intacto
 * Os CONTADORES (`_nPartes`) são o que prova que falta: sem eles, "existe ao menos um"
 * respondia SIM e ninguém buscava o resto. */
function confraPelaMetade() {
  return {
    id: 'tour_1780009816637', name: 'Confra BT Alta da Clínica 2026',
    format: 'Liga', ligaRoundFormat: 'rei_rainha', status: 'active', sport: 'Beach Tennis',
    resultEntry: 'players', creatorUid: 'u-rb',
    _semPesados: ['matches', 'participants', 'opponentHistory'],
    _nPartes: { participants: 152, matches: 115, opponentHistory: 152 },
    _nJogos: 115,
    memberUids: ['u-rb'],
    participants: [{ uid: 'u-rb', displayName: 'Rodrigo Barth' }, { uid: 'u-x', displayName: 'Outro' }],
    rounds: [{ matches: [{ id: 'solto', label: 'R1 Grupo A • Jogo 1', p1: 'A / B', p2: 'C / D', team1: ['A', 'B'], team2: ['C', 'D'] }] }]
  };
}
/* O MESMO torneio, HIDRATADO: cada contador bate com o que está de fato no objeto.
 * ⚠️ Fixture tem que ser internamente coerente — prometer `opponentHistory: 2` e não
 * entregar nenhum faria a suíte acusar o próprio fixture e eu leria isso como defeito
 * do código. [[feedback_dont_canonize_examples]] */
function confraInteiroSemJogosMeus() {
  const t = confraPelaMetade();
  t._nPartes = { participants: 2, matches: 1, opponentHistory: 2 };
  t._nJogos = 1;
  t.opponentHistory = { 'u-rb': ['u-x'], 'u-x': ['u-rb'] };
  return t;
}

/* ══ §0 · os leitores de coerência, isolados ═══════════════════════════════════ */
console.log('\n§0 COERÊNCIA — os leitores que a dashboard consulta');
ok(typeof W._dadosConfiaveis === 'function' && typeof W._listaConfiavel === 'function',
  'store.js expõe `_dadosConfiaveis` e `_listaConfiavel`');
ok(W._dadosConfiaveis(confraPelaMetade()) === false,
  'torneio com 2 de 152 inscritos NÃO é confiável (o contador denuncia)');
ok(W._dadosConfiaveis(confraInteiroSemJogosMeus()) === true,
  'o mesmo torneio, com os contadores batendo, É confiável');
ok(W._listaConfiavel([confraInteiroSemJogosMeus(), confraPelaMetade()]) === false,
  'basta UM torneio incompleto na lista pra o total ser mentira');
ok(W._dadosConfiaveis(null) === true && W._listaConfiavel([]) === true,
  'sem torneio nenhum não há o que desconfiar (lista vazia é confiável)');

console.log('\n§0b VERSÃO HÍBRIDA — shell de uma build, JS de outra');
{
  const qsOrig = W.document.querySelector;
  const comShell = function (v) {
    W.document.querySelector = function (sel) {
      if (String(sel).indexOf('sp-shell') !== -1) {
        return (v === null) ? null : { getAttribute: function () { return v; } };
      }
      return qsOrig ? qsOrig.call(W.document, sel) : null;
    };
  };
  comShell(W.SCOREPLACE_VERSION);
  ok(W._versaoIncoerente() === false, 'shell carimbando a MESMA versão do JS: coerente');
  ok(W._dadosConfiaveis(confraInteiroSemJogosMeus()) === true, 'e o torneio hidratado segue confiável');

  comShell('2.1.63');
  ok(W._versaoIncoerente() === true, 'shell 2.1.63 com JS ' + W.SCOREPLACE_VERSION + ': INCOERENTE (é o relato do Codex)');
  ok(W._dadosConfiaveis(confraInteiroSemJogosMeus()) === false,
    'e aí NENHUM número é fato — nem o do torneio perfeitamente hidratado');

  comShell(null);
  ok(W._versaoIncoerente() === false,
    'shell SEM carimbo (build anterior a esta) devolve "não sei", nunca "errado" — senão toda instalação antiga entra em alarme');
  W.document.querySelector = qsOrig;
}

/* ══ §1 · o número do cartão ══════════════════════════════════════════════════ */
console.log('\n§1 O NÚMERO DO CARTÃO');
{
  const dashNum = (function () {
    const i = SRC.indexOf('window._dashNum = function');
    if (i < 0) return null;
    const fim = SRC.indexOf('\n};', i);
    return new Function('window', 'with (window) { ' + SRC.slice(i, fim + 3) + ' return window._dashNum; }')(W);
  })();
  ok(typeof dashNum === 'function', 'dashboard.js define `window._dashNum`');
  if (typeof dashNum === 'function') {
    ok(dashNum(2, confraPelaMetade()) === '…',
      'com 2 de 152 no documento, o cartão NÃO imprime "2" — imprime "…"');
    ok(dashNum(152, confraInteiroSemJogosMeus()) === 152,
      'hidratado, o número volta a ser o número (nada de "…" permanente)');
    ok(dashNum(0, confraInteiroSemJogosMeus()) === 0,
      'zero VERDADEIRO continua sendo impresso como 0 — torneio sem inscrito existe');
  }
  ok(/\$\{window\._dashNum\(individualCount, t\)\}/.test(SRC),
    'o cartão grande passa `individualCount` pelo filtro (senão a rede não cobre o primeiro render)');
  ok(/window\._dashNum\(pCount, t\)/.test(SRC),
    'a linha COMPACTA também — é outra porta pro mesmo número');
}

/* ══ §2/§3 · as seções, rodando o _buildMyResultsHtml REAL ════════════════════ */
function extraiBuildMyResults(src) {
  const i = src.indexOf('function _buildMyResultsHtml() {');
  if (i < 0) throw new Error('_buildMyResultsHtml não encontrada em dashboard.js');
  const marca = 'return _upHtml + _novHtml + html;';
  const j = src.indexOf(marca, i);
  if (j < 0) throw new Error('fim de _buildMyResultsHtml não encontrado (o return mudou?)');
  return src.slice(i, src.indexOf('}', j + marca.length) + 1);
}
const _mem = {};
W.localStorage = W.localStorage || {
  getItem: function (k) { return (k in _mem) ? _mem[k] : null; },
  setItem: function (k, v) { _mem[k] = String(v); },
  removeItem: function (k) { delete _mem[k]; }
};
/* ⚠️ `noStore` existe porque o caso do ORGANIZADOR é exatamente a divergência entre os
 * dois: o store TEM o torneio, e `participacoes` volta VAZIA. Igualar os dois aqui
 * apagaria justamente o cenário que se quer provar. */
function secao(tours, noStore) {
  W.AppStore.tournaments = noStore || tours;
  W.AppStore.currentUser = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@x.com' };
  W.AppStore.isOrganizer = function (t) { return !!(t && t.creatorUid === 'u-rb'); };
  const fn = new Function('window', 'document', 'localStorage', 'participacoes',
    'with (window) { ' + extraiBuildMyResults(SRC) + ' return _buildMyResultsHtml; }'
  )(W, W.document, W.localStorage, tours);
  return fn();
}

console.log('\n§2 SEÇÃO NÃO SOME ENQUANTO O DADO NÃO ASSENTOU');
{
  const html = secao([confraPelaMetade()]);
  ok(html !== '',
    '"📣 Novidades" e "🏅 Seus últimos resultados" NÃO desaparecem com o torneio pela metade');
  ok(/[Cc]arregando/.test(html),
    'no lugar do vazio, a seção diz que está carregando (não é reload, não é esconder)');
  ok(!/display\s*:\s*none/.test(html),
    '⛔ e não "resolve" escondendo: nada de display:none nesse caminho');
}

console.log('\n§3 VAZIO VERDADEIRO CONTINUA SUMINDO');
{
  const html = secao([confraInteiroSemJogosMeus()]);
  ok(html === '',
    'torneio hidratado e sem jogo meu: a seção some, como sempre somou (senão vira aviso permanente)');
  ok(secao([]) === '', 'sem torneio nenhum: some também');
}

/* ══ §4 · R1.1 — O CASO QUE A REDE DA 2.1.70 NÃO PEGAVA ══════════════════════
 * A rede conferia os torneios DA LISTA. O defeito do organizador é a LISTA VIR VAZIA:
 * `getMyParticipations()` exige, de criador e co-host, prova de inscrição real em
 * `participants[]` (v2.2.45) — e num torneio dividido essa lista chega depois. A prova
 * falha, `participacoes` volta `[]`, e lista vazia é "confiável" por definição.
 * Resultado: as duas seções sumiam da tela do dono, e só da dele. */
console.log('\n§4 ORGANIZADOR — lista VAZIA por carregamento não apaga as seções');
{
  const _asOrig = { t: W.AppStore.tournaments, u: W.AppStore.currentUser };
  const meu = confraPelaMetade();
  meu.creatorUid = 'u-rb';
  meu.memberUids = ['u-rb'];
  /* ⚠️ Os 2 soltos NÃO podem ser eu: se eu estiver na parte que ficou no documento, me
   * acho na lista parcial e o defeito não acontece — achar é fato. O relato é justamente
   * o caso em que os soltos são OUTRAS pessoas e eu estou nos 150 que faltam. */
  meu.participants = [{ uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' }];
  W.AppStore.tournaments = [meu];
  W.AppStore.currentUser = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@x.com' };

  const vazia = W.AppStore.getMyParticipations();
  ok(vazia.length === 0, 'reproduzido: o organizador NÃO entra em "Participando" com o elenco pela metade');
  ok(W._listaConfiavel(vazia) === true,
    '  → e essa lista vazia É "confiável" — por isso a rede da 2.1.70 passava batido');
  ok(_indef().length === 1,
    '  → a incerteza só aparece perguntando por fora, que é o que a R1.1 acrescentou');

  const html = secao(vazia, [meu]);
  ok(html !== '', '⭐ e agora as seções NÃO somem, mesmo com `participacoes` vazia');
  ok(/[Cc]arregando/.test(html), '  → dizem que estão carregando');

  // Vazio VERDADEIRO do organizador: elenco carregado, ele não se inscreveu.
  const meuOk = confraInteiroSemJogosMeus();
  meuOk.creatorUid = 'u-rb'; meuOk.memberUids = ['u-rb'];
  meuOk.participants = [{ uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' }];
  meuOk._nPartes = { participants: 2, matches: 1, opponentHistory: 2 };
  W.AppStore.tournaments = [meuOk];
  ok(_indef().length === 0, 'com o elenco carregado não sobra incerteza');
  ok(secao(W.AppStore.getMyParticipations(), [meuOk]) === '',
    '  → e aí a seção some de novo, como sempre — senão vira aviso permanente');

  W.AppStore.tournaments = _asOrig.t; W.AppStore.currentUser = _asOrig.u;
}

console.log('\n' + (fail ? '✗' : '✅') + ' dashboard/vazio: ' + pass + ' ok, ' + fail + ' falharam');
if (fail) { fails.forEach(function (f) { console.log('   ✗ ' + f); }); process.exitCode = 1; }
