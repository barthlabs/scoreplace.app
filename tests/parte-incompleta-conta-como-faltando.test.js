/* PARTE INCOMPLETA CONTA COMO FALTANDO — presença não é quantidade
 * node tests/parte-incompleta-conta-como-faltando.test.js
 *
 * TERCEIRA VEZ que a tela do dono aparece vazia, e desta vez a causa é outra das duas
 * anteriores. Medido no documento do Confra em 31/ago/2026, 01:10:
 *     _semPesados      : ["matches","participants","opponentHistory"]
 *     round[0].matches : 1        ← UM jogo solto DENTRO do documento
 *     participants     : 2        ← DOIS inscritos soltos
 *     subcoleção matches: 115  ·  subcoleção inscritos: 152   ← o dado real, intacto
 *
 * `_enxertaJogos` perguntava "tenho esta parte?" com `_cheio(...)` — ou seja, EXISTE AO
 * MENOS UM? Com um jogo solto a resposta era SIM, `_faltamPesados` nunca era marcado, a
 * busca dos 115 nunca disparava, e a tela desenhava o torneio com 1 jogo: classificação
 * zerada, "Demais jogos da rodada (0)", W.O. e inativos sumidos. No elenco, 2 soltos
 * escondiam 152 — daí "inativos sumiram".
 *
 * ⚠️ DE ONDE VEM O PEDAÇO SOLTO: `mutateTournament` (a porta do W.O.) grava o documento SEM
 * `dividir`; o mutator empurra o marcador de W.O. em `rounds[i].matches` e aquilo fica no
 * doc. Fechar essa porta é outra leva — esta trava faz a CONTA ser à prova disso.
 *
 * ⛔ POR QUE AS DUAS CORREÇÕES ANTERIORES NÃO PEGAVAM ESTA: a 2.1.61 consertou a TRAVA que
 * impedia remontar (`_montandoPesados` presa) e a 2.1.63 consertou quem ESCREVE. Nenhuma
 * tocou a PERGUNTA — e a pergunta errada não dispara nem a busca nem a trava.
 * É a mesma família de [[feedback_cache_quente_satisfaz_metade_da_pergunta]]: uma resposta
 * parcial satisfazendo um teste booleano.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(RAIZ, 'js', 'store.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

/* recorta a função REAL — réplica aqui certificaria a minha imaginação, não o código */
const INI = SRC.indexOf('function _enxertaJogos(novo, velho) {');
const FIM = SRC.indexOf('\n    function _aplicaSnapTorneios(snap)');
ok(INI !== -1 && FIM > INI, 'achei `_enxertaJogos` em js/store.js');
const ctx = { window: {}, console: console, Array: Array, Object: Object, JSON: JSON, String: String };
ctx.globalThis = ctx; vm.createContext(ctx);
const enxerta = vm.runInContext('(' + SRC.slice(INI, FIM).trim() + ')', ctx);

/* O DOCUMENTO REAL do Confra naquele instante — números medidos, não inventados. */
function confra() {
  return {
    id: 'tour_1780009816637',
    _semPesados: ['matches', 'participants', 'opponentHistory'],
    _nPartes: { matches: 115, participants: 152, opponentHistory: 1 },
    _nJogos: 115,
    memberUids: new Array(152).fill('u'),
    rounds: [{ matches: [{ id: 'wo-marker' }], monarchGroups: new Array(35).fill({}) }],
    participants: [{ uid: 'a' }, { uid: 'b' }],
    opponentHistory: []
  };
}

console.log('\n① o caso medido: 1 jogo de 115, 2 inscritos de 152\n');
{
  const r = enxerta(confra(), null);
  ok(r._faltamPesados === true, '⭐ ACUSA que falta parte (antes dizia que estava tudo lá)');
  ok((r._faltaOQue || []).indexOf('matches') !== -1, '   matches: tenho 1 de 115 ⇒ falta');
  ok((r._faltaOQue || []).indexOf('participants') !== -1, '   participants: tenho 2 de 152 ⇒ falta');
  ok((r._faltaOQue || []).indexOf('opponentHistory') !== -1, '   opponentHistory: tenho 0 de 1 ⇒ falta');
}

console.log('\n② a regra ANTIGA, no mesmo documento, dizia que estava tudo lá\n');
{
  /* presença, como era: `_cheio(r.matches)` bastava */
  const t = confra();
  const presenca = (t.rounds || []).some((r) => r && Array.isArray(r.matches) && r.matches.length > 0);
  ok(presenca === true, '⛔ o teste de PRESENÇA responde "tenho" com 1 jogo de 115 — era a falha');
  const presencaElenco = Array.isArray(t.participants) && t.participants.length > 0;
  ok(presencaElenco === true, '⛔ e "tenho elenco" com 2 de 152');
}

console.log('\n③ não vira laço: com tudo em memória, não acusa\n');
{
  const t = confra();
  t.rounds[0].matches = new Array(115).fill({ id: 'x' });
  t.participants = new Array(152).fill({ uid: 'u' });
  t.opponentHistory = [{}];
  const r = enxerta(t, null);
  ok(!r._faltamPesados, '⭐ com 115/152/1 em memória, NÃO acusa (senão buscaria a cada eco)');
  const mais = confra();
  mais.rounds[0].matches = new Array(200).fill({ id: 'x' });
  mais.participants = new Array(160).fill({ uid: 'u' });
  mais.opponentHistory = [{}];
  ok(!enxerta(mais, null)._faltamPesados, '   e com MAIS do que o contador promete também não');
}

console.log('\n④ o que já funcionava continua\n');
{
  const zero = confra();
  zero._nPartes = { matches: 0, participants: 0, opponentHistory: 0 };
  zero._nJogos = 0; zero.rounds = [{ matches: [], monarchGroups: [] }]; zero.participants = []; zero.opponentHistory = [];
  ok(!enxerta(zero, null)._faltamPesados, 'contador ZERO = vazio de verdade, não busca');

  /* documento ANTIGO, sem contador: volta a valer presença — não dá pra endurecer sem número */
  const semContador = confra();
  delete semContador._nPartes; delete semContador._nJogos;
  const r = enxerta(semContador, null);
  ok(r._faltamPesados !== true, 'sem contador e COM peça em memória, não acusa (comportamento antigo preservado)');
  const semNada = confra();
  delete semNada._nPartes; delete semNada._nJogos;
  semNada.rounds = [{ matches: [], monarchGroups: [] }]; semNada.participants = []; semNada.opponentHistory = [];
  const r2 = enxerta(semNada, null);
  ok(r2._faltamPesados === true, 'sem contador e SEM nada, acusa — estrutural + testemunha memberUids');

  /* o enxerto a partir da memória segue funcionando */
  const novo = confra();
  novo.rounds[0].matches = [];
  const velho = { rounds: [{ matches: new Array(115).fill({ id: 'y' }) }], participants: new Array(152).fill({ uid: 'u' }), opponentHistory: [{}] };
  const r3 = enxerta(novo, velho);
  ok(r3.rounds[0].matches.length === 115, 'enxerta os jogos do objeto vivo...');
  /* ⚠️ ...e `matches` sai da lista do que falta. `participants` NÃO sai, e isso é correto:
   * o enxerto de campo de topo só copia quando o novo está VAZIO, e aqui ele tem os 2
   * inscritos soltos do documento — 2 de 152 segue sendo falta. A primeira versão desta
   * asserção esperava `_faltamPesados` falso e reprovou o comportamento CERTO. */
  ok((r3._faltaOQue || []).indexOf('matches') === -1, '   ...e `matches` sai da lista do que falta');
  ok((r3._faltaOQue || []).indexOf('participants') !== -1, '   mas os 2 inscritos soltos seguem acusando falta (2 de 152)');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
process.exitCode = fail ? 1 : 0;
