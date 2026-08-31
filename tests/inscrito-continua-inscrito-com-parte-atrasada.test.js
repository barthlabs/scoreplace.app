/* INSCRITO CONTINUA INSCRITO ENQUANTO O ELENCO NÃO CHEGA (incidente R1.1)
 *   node tests/inscrito-continua-inscrito-com-parte-atrasada.test.js
 *
 * O RELATO, em produção e SOBREVIVENDO A HARD RESET: quem está inscrito aparece como
 * "não inscrito"; contagens somem ou reduzem; "📣 Novidades no seu torneio" e
 * "🏅 Seus últimos resultados" desaparecem.
 *
 * ⛔ A ORIGEM (rastreada no fluxo real, não deduzida): num torneio DIVIDIDO o elenco não
 * mora no documento. O ouvinte entrega primeiro o documento-BASE e a subcoleção
 * `inscritos` chega DEPOIS. Nessa janela `t.participants` é uma lista INCOMPLETA, e todas
 * as portas que decidem "estou inscrito?" liam essa lista e respondiam `false`.
 * `false` é uma AFIRMAÇÃO — e por isso a tela dizia "você não está inscrito" a quem está.
 * ⚠️ Sobrevive a hard refresh porque não é cache do navegador: a cada boot o
 * documento-base chega antes das partes e a janela renasce.
 *
 * ⛔ DOIS BURACOS DIFERENTES, e só o segundo é do organizador — foi o que fez a rede da
 * 2.1.70 não pegar o relato:
 *   ① TODO MUNDO: `_cardSouInscrito` → `_isUserEnrolledInTournament` lê `t.participants`.
 *   ② SÓ ORGANIZADOR/CO-HOST: `getMyParticipations()` responde pelo `memberUids` (que
 *      viaja SEMPRE no documento-base e nunca encolhe) para membro comum, mas EXIGE prova
 *      de inscrição real em `participants[]` de criador e co-host (v2.2.45). A prova falha,
 *      a lista volta `[]` — e lista VAZIA é "confiável" por definição, então a rede da
 *      2.1.70, que conferia os torneios DA LISTA, passava batido e as duas seções sumiam.
 *
 * ⭐ A ASSIMETRIA QUE RESOLVE: **achar é fato, não achar não é.** Encontrar-se numa lista
 * parcial PROVA inscrição. Não se encontrar só quer dizer algo se a lista estiver
 * COMPLETA. Por isso o positivo sai na hora e só o negativo exige prova de completude.
 *
 * Roda o AppStore REAL (render-harness carrega js/store.js de verdade).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }

/* ⛔ ENVELOPES QUE NÃO EXPLODEM. Contra a árvore ANTERIOR à R1.1 estas portas não
 * existem — e um `TypeError` na primeira linha esconde as outras 40 asserções. O teste
 * tem que RODAR ATÉ O FIM e LISTAR o que falha, como faz o sw-abre-sem-tela-branca.
 * `'AUSENTE'` não é igual a `null`, `true` nem `false`: toda comparação falha, e falha
 * dizendo o quê. */
const _souInscrito = (t, cu) => (typeof W._souInscrito === 'function') ? W._souInscrito(t, cu) : 'AUSENTE';
const _parteFalta = (t, n) => (typeof W._parteFalta === 'function') ? W._parteFalta(t, n) : 'AUSENTE';
const _elencoCarregado = (t) => (typeof W._elencoCarregado === 'function') ? W._elencoCarregado(t) : 'AUSENTE';
const _indefinidas = () => (typeof W.AppStore.participacoesIndefinidas === 'function')
  ? W.AppStore.participacoesIndefinidas() : [];

const EU = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@x.com', _profileLoaded: true };
const OUTRO = { uid: 'u-fabio', displayName: 'Fábio Ruggiero', email: 'f@x.com', _profileLoaded: true };

/* ── O CONFRA COMO O OUVINTE ENTREGA NO PRIMEIRO QUADRO ────────────────────────
 * Documento-base: `_semPesados` diz o que saiu, `_nPartes`/`_nJogos` dizem QUANTO
 * deveria haver, `memberUids` prova que há gente. `participants` traz só o que ficou
 * solto no documento — 2 de 152, medido em 31/ago. */
function baseSemElenco() {
  return {
    id: 'tour_1780009816637', name: 'Confra BT Alta da Clínica 2026',
    format: 'Liga', ligaRoundFormat: 'rei_rainha', status: 'active', sport: 'Beach Tennis',
    resultEntry: 'players', isPublic: true,
    creatorUid: EU.uid,                                  // ⭐ eu sou o ORGANIZADOR (o relato)
    memberUids: [EU.uid, OUTRO.uid],
    _semPesados: ['matches', 'participants', 'opponentHistory'],
    _nPartes: { participants: 152, matches: 115, opponentHistory: 152 },
    _nJogos: 115,
    participants: [{ uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' }],
    rounds: [{ matches: [{ id: 'solto', label: 'R1 Grupo A • Jogo 1', p1: 'A / B', p2: 'C / D' }] }]
  };
}
/* O MESMO torneio depois de as partes chegarem. Os contadores passam a bater com o
 * conteúdo — fixture incoerente acusaria a si mesma. */
function hidratado(comigo) {
  const t = baseSemElenco();
  t.participants = [
    { uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' },
    { uid: OUTRO.uid, displayName: OUTRO.displayName }
  ];
  if (comigo) t.participants.push({ uid: EU.uid, displayName: EU.displayName });
  t._nPartes = { participants: t.participants.length, matches: 1, opponentHistory: t.participants.length };
  t._nJogos = 1;
  t.opponentHistory = { 'u-rb': [] };
  return t;
}
/* Torneio inteiro (nunca foi dividido) e canonicamente VAZIO. */
function inteiroVazio() {
  return {
    id: 'tour_vazio', name: 'Torneio novo', status: 'open', sport: 'Beach Tennis',
    isPublic: true, creatorUid: EU.uid, memberUids: [EU.uid], participants: []
  };
}

function comStore(tours, user) {
  W.AppStore.tournaments = tours;
  W.AppStore.currentUser = user || EU;
}

/* ══ §1 · A PORTA — três estados ══════════════════════════════════════════════ */
console.log('\n§1 A PORTA `_souInscrito` — true | false | null');
{
  const t = baseSemElenco();
  ok(_souInscrito(t, EU) === null,
    'elenco NÃO carregado e não me achei na parte solta: `null` ("não sei"), NUNCA `false`');
  ok(_souInscrito(t, EU) !== false,
    '⛔ e o valor não é `false` — era ele que virava "você não está inscrito"');

  const tComigoSolto = baseSemElenco();
  tComigoSolto.participants.push({ uid: EU.uid, displayName: EU.displayName });
  ok(_souInscrito(tComigoSolto, EU) === true,
    '⭐ me achei numa lista PARCIAL: `true` na hora — achar é fato, e a janela de incerteza encolhe');

  ok(_souInscrito(hidratado(true), EU) === true, 'elenco completo e estou nele: true');
  ok(_souInscrito(hidratado(false), EU) === false,
    'elenco completo e NÃO estou nele: `false` de verdade — vazio canônico continua vazio');
  ok(_souInscrito(inteiroVazio(), EU) === false,
    'torneio inteiro (nunca dividido) com 0 inscritos: `false`, não `null` — não inventa carregamento');
}

console.log('\n§1b RESUMO (tournaments_summary) é completo por construção');
{
  const t = baseSemElenco();
  t.participantUids = [OUTRO.uid];
  ok(_souInscrito(t, EU) === false, 'com `participantUids` a resposta é fato mesmo sem o elenco no doc');
  t.participantUids = [OUTRO.uid, EU.uid];
  ok(_souInscrito(t, EU) === true, 'e o positivo também');
}

console.log('\n§1c A ESPERA NÃO GANHA TERCEIRO ESTADO (conferido no split-core)');
{
  const S = require(path.join(ROOT, 'js', 'views', 'tournament-split-core.js'));
  ok(S.PARTES.indexOf('standbyParticipants') === -1 && S.PARTES.indexOf('waitlist') === -1,
    'nem `standbyParticipants` nem `waitlist` podem sair do documento — logo a resposta já é completa');
  ok(typeof W._souEspera === 'undefined',
    '⛔ e por isso NÃO existe `_souEspera`: inventar "não sei" onde há certeza deixaria "⏳" pra sempre');
}

/* ══ §2 · O ORGANIZADOR — a lista que voltava vazia ═══════════════════════════ */
console.log('\n§2 ORGANIZADOR — `getMyParticipations()` vazia não é "não participo de nada"');
{
  comStore([baseSemElenco()], EU);
  const parts = W.AppStore.getMyParticipations();
  ok(parts.length === 0,
    'a lista continua HONESTA: sem prova de inscrição, o organizador não entra em "Participando"');
  const indef = _indefinidas();
  ok(indef.length === 1 && String(indef[0].id) === 'tour_1780009816637',
    '⭐ mas a INCERTEZA fica registrada — é o que faltava, e é por isso que as seções sumiam');

  comStore([hidratado(true)], EU);
  ok(W.AppStore.getMyParticipations().length === 1, 'com o elenco carregado e eu inscrito: entro na lista');
  ok(_indefinidas().length === 0, 'e não sobra incerteza nenhuma');

  comStore([hidratado(false)], EU);
  ok(W.AppStore.getMyParticipations().length === 0 && _indefinidas().length === 0,
    'elenco carregado e eu NÃO inscrito: fora da lista, e sem incerteza — vazio verdadeiro');
}

console.log('\n§2b MEMBRO COMUM não dependia disso (por isso o relato era do dono)');
{
  comStore([baseSemElenco()], OUTRO);
  ok(W.AppStore.getMyParticipations().length === 1,
    'membro comum entra em "Participando" pelo `memberUids`, que viaja no documento-base');
  ok(_indefinidas().length === 1,
    'mas a inscrição DELE também é indefinida — o cartão dele não pode afirmar nada');
  ok(_souInscrito(baseSemElenco(), OUTRO) === null,
    'e a porta confirma: `null` pra ele também. O buraco ① atinge todo mundo');
}

/* ══ §3 · O FLUXO REAL — cabeçalho primeiro, partes depois ════════════════════ */
console.log('\n§3 PARTES CHEGAM DEPOIS DO CABEÇALHO');
{
  const t = baseSemElenco();
  comStore([t], EU);
  ok(W._marcaPartesQueFaltam(t) === true, 'o documento-base sozinho ACUSA que falta parte');
  ok((t._faltaOQue || []).indexOf('participants') !== -1, '  → e diz que o que falta inclui `participants`');
  ok(_parteFalta(t, 'participants') === true && _elencoCarregado(t) === false,
    '  → `_parteFalta`/`_elencoCarregado` respondem por parte, não no atacado');
  ok(_souInscrito(t, EU) === null, '  → e a inscrição fica indefinida');

  // as partes chegam (é o que `_montaPesadosQueFaltam` faz: escreve NO LUGAR)
  const cheio = hidratado(true);
  Object.keys(cheio).forEach(function (k) { t[k] = cheio[k]; });
  delete t._faltamPesados; delete t._faltaOQue;
  ok(_elencoCarregado(t) === true, 'chegaram: o elenco passa a estar carregado');
  ok(_souInscrito(t, EU) === true, '  → e a inscrição vira `true` sem recarregar nada');
  ok(_indefinidas().length === 0, '  → e a incerteza some');
}

console.log('\n§3b BOOT FRIO / HARD REFRESH — o estado renasce e NÃO vira `false`');
{
  /* Hard refresh não limpa `localStorage`: o cache pinta primeiro, e o cache também pode
   * estar magro. O que não pode acontecer, em nenhum dos dois quadros, é a tela AFIRMAR. */
  const doCache = baseSemElenco(); doCache._doCache = true;
  comStore([doCache], EU);
  ok(_souInscrito(doCache, EU) === null, 'primeiro quadro (cache magro): indefinido, não "não inscrito"');
  const doOuvinte = baseSemElenco();
  comStore([doOuvinte], EU);
  ok(_souInscrito(doOuvinte, EU) === null, 'segundo quadro (documento-base do ouvinte): idem');
  ok(_indefinidas().length === 1, 'e a dashboard tem como saber disso nos dois');
}

/* ══ §4 · UMA PARTE FALHA E DEPOIS CHEGA ═════════════════════════════════════ */
console.log('\n§4 UMA PARTE FALHA — e a própria falha agenda a próxima tentativa');
(async function () {
  const t = baseSemElenco();
  comStore([t], EU);
  W._marcaPartesQueFaltam(t);

  let tentativas = 0;
  const agendados = [];
  const _stOrig = W.setTimeout;
  W.setTimeout = function (fn) { agendados.push(fn); return agendados.length; };
  W.FirestoreDB = {
    _montaDeSubcolecoes: function () {
      tentativas++;
      if (tentativas === 1) return Promise.reject(new Error('rede caiu'));
      return Promise.resolve(hidratado(true));
    }
  };
  W._softRefreshView = function () {};
  const _errOrig = W._error;
  W._error = function () {};   // a falha do §4 é DE PROPÓSITO; o stack dela só suja a saída
  W.AppStore._saveToCache = function () {};

  await W.AppStore._montaPesadosQueFaltam(['tour_1780009816637']);
  await new Promise(function (r) { setImmediate(r); });
  ok(tentativas === 1, 'primeira tentativa foi feita');
  ok(agendados.length === 1,
    '⭐ a falha AGENDOU a próxima — antes disto ninguém retentava: só o ouvinte chamava, e torneio parado não ecoa');
  ok(_souInscrito(t, EU) === null, 'enquanto isso a tela continua em "não sei", nunca em "não inscrito"');

  // ⛔ guardado: contra a árvore anterior NADA é agendado, e um TypeError aqui esconderia
  // os §5 e §6 inteiros. O teste tem que RODAR ATÉ O FIM.
  if (typeof agendados[0] === 'function') agendados[0]();   // o timer dispara
  await new Promise(function (r) { setImmediate(r); });
  await new Promise(function (r) { setImmediate(r); });
  ok(tentativas === 2, 'a retentativa REALMENTE foi ao banco (o timer é o piso, e o carimbo é limpo)');
  ok(_elencoCarregado(t) === true && _souInscrito(t, EU) === true,
    '⭐ chegou na segunda: inscrição vira `true` sozinha, sem recarregar');
  ok(!(W.AppStore._tentativasDePartes || {})['tour_1780009816637'],
    'e o contador de tentativas zera no sucesso');
  W.setTimeout = _stOrig;
  W._error = _errOrig;

  /* ══ §5 · O NÚMERO E AS SEÇÕES ═════════════════════════════════════════════ */
  console.log('\n§5 O NÚMERO DO CARTÃO não declara zero parcial');
  {
    const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
    const i = SRC.indexOf('window._dashNum = function');
    const fim = SRC.indexOf('\n};', i);
    const dashNum = new Function('window', 'with (window) { ' + SRC.slice(i, fim + 3) + ' return window._dashNum; }')(W);
    ok(dashNum(2, baseSemElenco()) === '…', '2 de 152 não é impresso como "2"');
    ok(dashNum(0, inteiroVazio()) === 0, 'zero de um torneio inteiro E vazio continua sendo 0');

    ok(/window\._souInscrito\(t, window\.AppStore\.currentUser\)/.test(SRC),
      'a dashboard decide inscrição pela porta de três estados');
    ok(/_inscricaoIndefinida && canEnroll/.test(SRC) && /Carregando…/.test(SRC),
      '  → e com `null` mostra "⏳ Carregando…", nunca o botão "Inscrever-se"');
    const DET = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');
    ok(/window\._souInscrito\(t, window\.AppStore\.currentUser\)/.test(DET) &&
       /!_profileReady \|\| _inscricaoIndefinida/.test(DET),
      'o DETALHE do torneio usa a mesma porta e o mesmo gate — senão o relato volta por lá');
    const ENR = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
    ok(/_souInsc === null/.test(ENR),
      'e a AÇÃO de inscrever recusa agir com elenco desconhecido (2ª tranca, pro caminho por link)');
  }

  console.log('\n§6 VERSÃO NÃO MUDA O RESULTADO LÓGICO DA INSCRIÇÃO');
  {
    const qs = W.document.querySelector;
    W.document.querySelector = function (sel) {
      if (String(sel).indexOf('sp-shell') !== -1) return { getAttribute: function () { return '2.1.63'; } };
      return qs ? qs.call(W.document, sel) : null;
    };
    ok(W._versaoIncoerente() === true, 'shell 2.1.63 com JS ' + W.SCOREPLACE_VERSION + ': versão incoerente');
    ok(_souInscrito(hidratado(true), EU) === true,
      '⛔ e MESMO ASSIM a inscrição continua `true` — estar inscrito é fato do DADO, não da build');
    ok(_souInscrito(hidratado(false), EU) === false, '  → e o `false` verdadeiro também não muda');
    W.document.querySelector = qs;
  }

  console.log('\n' + (fail ? '✗' : '✅') + ' inscrição/parte atrasada: ' + pass + ' ok, ' + fail + ' falharam');
  if (fail) { fails.forEach(function (f) { console.log('   ✗ ' + f); }); process.exitCode = 1; }
})().catch(function (e) { console.error('EXPLODIU:', e && e.stack || e); process.exitCode = 1; });
