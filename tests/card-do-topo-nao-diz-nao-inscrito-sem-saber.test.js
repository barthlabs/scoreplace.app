/* O CARD DO TOPO NÃO DIZ "VOCÊ NÃO ESTÁ INSCRITO" SEM SABER  (R1.1.2)
 *   node tests/card-do-topo-nao-diz-nao-inscrito-sem-saber.test.js
 *
 * ⛔ O CAMINHO QUE SOBREVIVEU A TRÊS LEVAS. A 2.1.71 tirou o "não inscrito" das portas do
 * CARTÃO e do BOTÃO; a 2.1.72 deu saída à falha. Mas o card do TOPO — o que existe
 * justamente pra responder "eu estou nesse torneio?", em `#participants` e no detalhe —
 * tinha a sua PRÓPRIA leitura:
 *     `_meuStatusNoTorneio` → `_getCompetitors(t)` (= `t.participants`)
 *     → `if (!eu && wlIdx === -1) return { code: 'none' }`
 *     → `_meuCardNoTopo` → "Você **não está inscrito** neste torneio."
 * Nenhuma linha dessa cadeia perguntava se o elenco está COMPLETO. Num torneio DIVIDIDO
 * ele chega depois do documento-base — e nessa janela o card respondia NÃO a quem está.
 *
 * ⚠️ POR QUE ESSA FRASE É A MAIS CARA DA TELA: ela manda a pessoa procurar o organizador.
 * Foi exatamente o defeito que a v1.7.55 já tinha consertado uma vez, por outra causa (a
 * danielacsimao, na lista de espera, lendo "não está inscrito"). A espera ficou coberta
 * porque `_getWaitlist` viaja no documento-base; o ELENCO não.
 *
 * ⭐ E A CORREÇÃO NÃO INVENTA UMA QUARTA RÉGUA: o ramo consulta a MESMA porta canônica do
 * cartão da tela inicial e do detalhe (`_souInscrito`, que devolve `null` = "não sei") e o
 * MESMO estado de desistência (`_partesFalharam`). Quatro réguas divergiriam em silêncio —
 * é como este defeito sobreviveu.
 *
 * Roda o store.js REAL (render-harness) — réplica certificaria a minha imaginação.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.sandbox;
const ROOT = path.join(__dirname, '..');
const SRC_STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const SRC_PART = fs.readFileSync(path.join(ROOT, 'js', 'views', 'participants.js'), 'utf8');
const SRC_DET = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }
const proximoTick = () => new Promise((r) => setImmediate(r));
const texto = (h) => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const EU = 'u-rb';
const TID = 'tour_1780009816637';
W.AppStore.currentUser = { uid: EU, displayName: 'Rodrigo Barth', email: 'rb@x.com', _profileLoaded: true };

/* Documento-base do Confra: 152 inscritos prometidos, 2 soltos — e eu NÃO estou entre os
 * soltos (estou nos 150 que ainda não chegaram). É o caso do relato. */
function baseSemElenco() {
  return {
    id: TID, name: 'Confra BT Alta da Clínica 2026', format: 'Liga', ligaRoundFormat: 'rei_rainha',
    status: 'active', sport: 'Beach Tennis', isPublic: true, creatorUid: 'u-org',
    memberUids: [EU, 'u-org'],
    _semPesados: ['matches', 'participants', 'opponentHistory'],
    _nPartes: { participants: 152, matches: 115, opponentHistory: 152 },
    _nJogos: 115,
    participants: [{ uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' }],
    rounds: [{ matches: [] }]
  };
}
/* Torneio INTEIRO (nunca dividido), elenco completo. */
function inteiro(participants, extra) {
  return Object.assign({
    id: 'tour_inteiro', name: 'Torneio inteiro', status: 'active', sport: 'Beach Tennis',
    isPublic: true, creatorUid: 'u-org', memberUids: [EU, 'u-org'],
    participants: participants || [], rounds: [{ matches: [] }]
  }, extra || {});
}

function noStore(t) { W.AppStore.tournaments = [t]; return t; }
function estado(t) { return W._meuStatusNoTorneio(t); }
function card(t) { return W._meuCardNoTopo(t); }

/* ── esgotar o teto de tentativas, com timers capturados ─────────────────────── */
const agendados = [];
const _stOrig = W.setTimeout;
W.setTimeout = function (fn) { agendados.push(fn); return agendados.length; };
const _errOrig = W._error, _warnOrig = W._warn;
W._error = function () {}; W._warn = function () {};
W._softRefreshView = function () {};
W.AppStore._saveToCache = function () {};
W.FirestoreDB = { _montaDeSubcolecoes: function () { return Promise.reject(new Error('rede caiu')); } };
async function ateDesistir(t) {
  W.AppStore._partesEmErro = {}; W.AppStore._tentativasDePartes = {};
  W.AppStore._ultimaMontagem = {}; W.AppStore._montandoPesados = {}; W.AppStore._retentandoPartes = {};
  agendados.length = 0;
  W._marcaPartesQueFaltam(t);
  await W.AppStore._montaPesadosQueFaltam([String(t.id)]);
  await proximoTick();
  let g = 0;
  while (agendados.length && g++ < 30) { agendados.shift()(); await proximoTick(); await proximoTick(); }
}

(async function () {
  console.log('\n§1 ELENCO INCOMPLETO — o status NÃO devolve `none`');
  {
    const t = noStore(baseSemElenco());
    const st = estado(t);
    ok(st && st.code !== 'none',
      '⭐ com o elenco pela metade o código NÃO é "none" (deu "' + (st && st.code) + '")');
    ok(st && st.code === 'carregando', '  → é "carregando": há retentativa automática a caminho');
    ok(st && st.entry === null, '  → e sem `entry`, porque de fato não se achou nada ainda');
  }

  console.log('\n§2 O CARD não contém "não está inscrito"');
  {
    const t = noStore(baseSemElenco());
    const html = card(t);
    ok(html !== '', 'o card CONTINUA na tela (sumir não é resposta)');
    ok(!/não está inscrito/i.test(html),
      '⭐ e NÃO diz "não está inscrito" — a frase que manda a pessoa procurar o organizador');
    ok(/[Cc]arregando/.test(texto(html)), '  → diz que está carregando a lista de inscritos');
    ok(/data-meu-status="carregando"/.test(html), '  → e carimba o estado no atributo, como os outros');
  }

  console.log('\n§3 DEPOIS DO TETO — erro recuperável, e ainda assim nunca "não inscrito"');
  {
    const t = noStore(baseSemElenco());
    await ateDesistir(t);
    const st = estado(t);
    ok(st && st.code === 'erro', 'esgotado o teto o código vira "erro" (deu "' + (st && st.code) + '")');
    const html = card(t);
    ok(!/não está inscrito/i.test(html), '⭐ e o card SEGUE sem dizer "não está inscrito"');
    ok(/Não consegui carregar/i.test(texto(html)), '  → diz honestamente que não conseguiu carregar');
    ok(/não se perdeu/i.test(texto(html)), '  → e que a inscrição não se perdeu: falhou a LEITURA');
    ok(/_tentarPartesDeNovo\(/.test(html) && /Tentar novamente/.test(html),
      '⭐ com o MESMO botão "Tentar novamente" da R1.1.1 (fonte única)');
    ok(!/[Cc]arregando a lista/.test(texto(html)), '⛔ e não diz mais que está carregando');
  }

  console.log('\n§4 O DETALHE e a tela INSCRITOS mostram esse card, sem gate');
  {
    ok(/\$\{\(typeof window\._meuCardNoTopo === 'function'\) \? window\._meuCardNoTopo\(t\) : ''\}/.test(SRC_PART),
      'participants.js interpola o card sem condicionar a estar inscrito');
    ok(/window\._meuCardNoTopo\(visible\[0\]\)/.test(SRC_DET),
      'tournaments.js (detalhe) idem — as duas telas recebem o MESMO HTML corrigido');
    ok(SRC_STORE.split('não está inscrito</b> neste torneio').length === 2,
      '⛔ e existe UM ÚNICO emissor da frase no app inteiro — senão consertar aqui não conserta lá');
  }

  console.log('\n§5 CHEGADA POSTERIOR DO MEU UID mostra INSCRITO');
  {
    const t = noStore(baseSemElenco());
    await ateDesistir(t);
    ok(estado(t).code === 'erro', 'partimos do erro');
    // as partes chegam (o montador escreve NO LUGAR)
    t.participants = [{ uid: 'u-zzz', displayName: 'Solto 1' }, { uid: 'u-yyy', displayName: 'Solto 2' },
                      { uid: EU, displayName: 'Rodrigo Barth', enrollSeq: 7 }];
    t.opponentHistory = { 'u-rb': [] };
    t._nPartes = { participants: 3, matches: 0, opponentHistory: 1 };
    t._nJogos = 0;
    delete t._faltamPesados; delete t._faltaOQue;
    const st = estado(t);
    ok(st.code === 'enrolled', '⭐ chegou: vira "enrolled" (deu "' + st.code + '")');
    const html = card(t);
    ok(/você está inscrito/i.test(texto(html)), '  → e o card diz que você está inscrito');
    ok(!/não está inscrito/i.test(html), '  → sem contradição');
    ok(/nº 7/.test(texto(html)), '  → com o número de inscrição, que só existe depois de a lista chegar');
  }

  console.log('\n§6 ELENCO COMPLETO SEM MEU UID — "não inscrito" CONTINUA sendo dito');
  {
    const t = noStore(inteiro([{ uid: 'u-zzz', displayName: 'Outra pessoa' }]));
    const st = estado(t);
    ok(st.code === 'none',
      '⭐ torneio inteiro, elenco completo e eu fora dele: "none" (deu "' + st.code + '")');
    const html = card(t);
    ok(/não está inscrito/i.test(html),
      '⭐ e a frase é DITA — ela é uma resposta legítima, e apagá-la seria trocar um defeito por outro');
    ok(/data-meu-status="none"/.test(html), '  → com o carimbo "none" de sempre');
  }
  {
    /* E o mesmo vale pro torneio DIVIDIDO depois que o elenco chegou inteiro: aqui o
     * "não" volta a ser afirmável. */
    const t = noStore(baseSemElenco());
    t.participants = [{ uid: 'u-zzz' }, { uid: 'u-yyy' }, { uid: 'u-www' }];
    t.opponentHistory = { a: 1 };
    t._nPartes = { participants: 3, matches: 0, opponentHistory: 1 };
    t._nJogos = 0;
    ok(estado(t).code === 'none', 'torneio dividido JÁ HIDRATADO e eu fora: "none" de verdade');
  }

  console.log('\n§7 ESPERA, INATIVO e W.O. continuam distintos');
  {
    // ESPERA — `_getWaitlist` viaja no documento-base, então vale MESMO com o elenco magro
    const t = noStore(baseSemElenco());
    t.standbyParticipants = [{ uid: 'u-aaa' }, { uid: EU, displayName: 'Rodrigo Barth' }];
    const st = estado(t);
    ok(st.code === 'waitlist',
      '⭐ na fila com o elenco AINDA magro: "waitlist", não "carregando" (deu "' + st.code + '")');
    ok(st.pos === 2 && st.total === 2, '  → com posição real na fila (' + st.pos + ' de ' + st.total + ')');
    ok(/lista de espera/i.test(texto(card(t))), '  → e o card diz isso');
    ok(!/não está inscrito/i.test(card(t)), '  → sem a frase (é o bug de 06/ago, que segue fechado)');
  }
  {
    // INATIVO
    const t = noStore(inteiro([{ uid: EU, displayName: 'Rodrigo Barth', ligaActive: false }]));
    ok(estado(t).code === 'inactive', 'inscrito com ligaActive:false → "inactive"');
    ok(/desativado/i.test(texto(card(t))), '  → e o card explica como voltar');
  }
  {
    // W.O. decretado, como SELO em cima do estado
    const t = noStore(inteiro([{ uid: EU, displayName: 'Rodrigo Barth', ligaActive: false, woDeactivatedAt: Date.now() }], {
      rounds: [{ matches: [{ isSitOut: true, sitOutReason: 'wo', team1Uids: [EU], p1: 'Rodrigo Barth' }] }]
    }));
    const st = estado(t);
    ok(st.wo === true, 'W.O. decretado é detectado');
    ok(st.code === 'inactive' && st.woDest === 'inactive', '  → como SELO em cima do estado-base (deu "' + st.code + '")');
    ok(/W\.O\. decretado/i.test(texto(card(t))), '  → e o selo aparece no card');
    ok(!/não está inscrito/i.test(card(t)), '  → sem a frase');
  }

  console.log('\n§8 A DECISÃO É A MESMA DO RESTO DO APP (nenhuma quarta régua)');
  {
    const i = SRC_STORE.indexOf('window._meuStatusNoTorneio = function');
    const corpo = SRC_STORE.slice(i, SRC_STORE.indexOf('window._meuCardNoTopo = function'));
    ok(/window\._souInscrito\(/.test(corpo),
      '⭐ `_meuStatusNoTorneio` consulta a MESMA porta canônica que o cartão e o detalhe');
    ok(/window\._partesFalharam\(/.test(corpo),
      '  → e o mesmo estado de desistência da R1.1.1');
    ok(!/_elencoCarregado|_nPartes/.test(corpo),
      '⛔ e NÃO recalcula a hidratação por conta própria — quatro réguas divergiriam em silêncio');
  }

  W.setTimeout = _stOrig; W._error = _errOrig; W._warn = _warnOrig;
  console.log('\n' + (fail ? '✗' : '✅') + ' card do topo: ' + pass + ' ok, ' + fail + ' falharam');
  if (fail) { fails.forEach(function (f) { console.log('   ✗ ' + f); }); process.exitCode = 1; }
})().catch(function (e) { console.error('EXPLODIU:', e && e.stack || e); process.exitCode = 1; });
