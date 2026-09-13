'use strict';
/* ⛔ UM CAMPO, DOIS LEITORES, DUAS SUPOSIÇÕES OPOSTAS — E AS DUAS ERRADAS EM METADE DA BASE.
 *
 * MEDIDO em produção em 13/set/2026: `preferredCeps` tem DUAS FORMAS VIVAS — **42 perfis com
 * STRING** ("04533-010, 01310-000", que é o que o editor de perfil grava) e **3 com ARRAY**,
 * os três VAZIOS.
 *
 * ⭐ E DÁ PARA DIZER DE ONDE VIERAM OS TRÊS, sem chutar. A fusão de contas fazia
 * `unionArr(novo, velho)`, e `unionArr` começa com `Array.isArray(a) ? a.slice() : []`.
 * Contra uma STRING isso devolve `[]` — conferido rodando a função original:
 *     unionArr("04533-010,01310-000", undefined) === []
 * A fusão APAGAVA os CEPs da pessoa e ainda trocava o tipo do campo.
 *
 * ⛔ E O TIPO TROCADO MATAVA O AVISO, EM SILÊNCIO. `_checkNearbyTournaments` fazia
 * `(cu.preferredCeps || '').split(',')`, e `[].split` não existe:
 *     ([]).split(",")  →  TypeError: [].split is not a function
 * A função morria na primeira linha útil. Das 3 contas com array, 2 estão VIVAS (a terceira é
 * lápide) — e essas 2 pararam de receber "tem torneio perto de você" sem erro visível para
 * ninguém. O outro leitor errava para o lado oposto: o gate de "já usou o app" testava
 * `Array.isArray`, então a evidência dos 42 perfis com string nunca contava.
 *
 * ⚠️ ESCOLHER UM TIPO E MIGRAR NÃO FECHARIA O DEFEITO: quem grava é o editor, e ele grava
 * string. Enquanto o LEITOR não aceitar as duas formas, a próxima gravação recria tudo.
 * Por isso o conserto é a regra única — e normalizar o banco vira opcional, não pré-requisito.
 *
 * ⚠️ SÃO DUAS CÓPIAS DA REGRA (cliente e servidor) porque o cliente não faz `require`. Este
 * portão roda as DUAS contra a MESMA tabela e exige resultado idêntico — duas cópias sem
 * árbitro divergem na primeira mudança. [[feedback_unify_dual_entry_points]]
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const CORE = require(path.join(raiz, 'functions/ceps-core.js'));

// a cópia do cliente, executada de verdade a partir do store.js
const STORE = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
const i = STORE.indexOf('window._cepsDoPerfil = function');
const W = {};
vm.runInNewContext(STORE.slice(i, STORE.indexOf('\n};', i) + 3), { window: W, String, Array });
const doCliente = W._cepsDoPerfil;

console.log('\n──── CEP preferido tem uma forma só ────\n');

// ── ① as duas formas vivas são lidas, e dão o MESMO ────────────────────────
const TABELA = [
  ['04533-010, 01310-000', ['04533010', '01310000'], 'a forma que o editor grava (string)'],
  [['04533-010', '01310000'], ['04533010', '01310000'], 'a forma que a fusão criava (array)'],
  [[], [], 'array VAZIO — o estado exato das 3 contas medidas'],
  ['', [], 'string vazia'],
  [undefined, [], 'campo ausente'],
  [null, [], 'campo nulo'],
  ['1234', [], 'menos de 5 dígitos não localiza nada'],
  ['04533-010, 04533010', ['04533010'], 'o mesmo CEP em duas grafias conta uma vez'],
  [['04533-010', null, '', '01310-000'], ['04533010', '01310000'], 'buracos no array não derrubam'],
];
TABELA.forEach(([entrada, esperado, porque]) => {
  const s = CORE.cepsComoLista(entrada);
  const c = doCliente(entrada);
  must(JSON.stringify(s) === JSON.stringify(esperado), '① ' + porque + ' → ' + JSON.stringify(esperado));
  must(JSON.stringify(c) === JSON.stringify(s),
    '① ⭐ cliente e servidor concordam em ' + JSON.stringify(entrada) + ' — duas cópias sem árbitro divergem');
});

// ── ② o TypeError que matava o aviso não acontece mais ─────────────────────
let morreu = null;
try { ([]).split(','); } catch (e) { morreu = e.constructor.name; }
must(morreu === 'TypeError', '② o defeito original é real: `[].split(",")` lança ' + morreu);
must(Array.isArray(doCliente([])) && doCliente([]).length === 0,
  '② ⭐ a regra única devolve lista vazia no mesmo caso — sem lançar, sem matar a função');

// ── ③ a fusão para de APAGAR ───────────────────────────────────────────────
const unionArrOriginal = (a, b) => {
  const out = Array.isArray(a) ? a.slice() : [];
  (Array.isArray(b) ? b : []).forEach((x) => { if (out.indexOf(x) === -1) out.push(x); });
  return out;
};
must(JSON.stringify(unionArrOriginal('04533-010,01310-000', undefined)) === '[]',
  '③ ⛔ CONTROLE: a união ANTIGA devolvia [] para uma string — era ela que apagava');
must(JSON.stringify(CORE.unirCeps('04533-010,01310-000', undefined)) === '["04533010","01310000"]',
  '③ ⭐ a união nova PRESERVA o que a pessoa tinha');
must(JSON.stringify(CORE.unirCeps(['04533010'], '01310-000')) === '["04533010","01310000"]',
  '③ ⭐ e junta as duas formas sem perder nenhuma');
must(JSON.stringify(CORE.unirCeps(undefined, undefined)) === '[]', '③ e vazio com vazio é vazio');

// ── ④ os leitores REAIS passam pela regra ──────────────────────────────────
const codigo = (f) => fs.readFileSync(path.join(raiz, f), 'utf8')
  .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const ORG = codigo('js/views/tournaments-organizer.js');
const AUTH = codigo('js/views/auth.js');
const FN = codigo('functions/index.js');

must(/window\._cepsDoPerfil\(cu\.preferredCeps\)/.test(ORG),
  '④ ⭐ o aviso de torneio perto lê pela regra única');
must(!/\.split\(','\)/.test(ORG.slice(ORG.indexOf('_checkNearbyTournaments'), ORG.indexOf('_checkNearbyTournaments') + 900)),
  '④ ⛔ e NENHUM `.split` sobrou ali — nem como reserva: reserva é a segunda cópia da regra');
must(!/typeof window\._cepsDoPerfil === 'function'/.test(ORG) && !/typeof window\._cepsDoPerfil === 'function'/.test(AUTH),
  '④ ⛔ e ninguém guarda uma implementação de reserva — store.js carrega antes dos dois');
/* ⚠️ AQUI A REGRA É LIDA INLINE, E É CERTO QUE SEJA. O gate de termos é caminho de LOGIN, e
 * o portão `gate-de-termos-nao-carimba-conta-nova` extrai essa expressão e a roda como
 * função PURA de `_profile`. Chamar `window._cepsDoPerfil` ali reprovava com
 * `window is not defined` — que é também o aviso de que uma dependência global naquele
 * ponto quebraria o gate de termos se ela não tivesse carregado.
 * ⛔ E NÃO é terceira cópia da regra: a regra única responde "QUAIS CEPs a pessoa tem"
 * (normaliza dígito, exige 5+); esta responde "a pessoa PREENCHEU o campo". Perguntas
 * diferentes — o que este portão trava é que ela leia as DUAS FORMAS, que era o defeito. */
const iEv = AUTH.indexOf('_hasUsageEvidence');
const expr = AUTH.slice(iEv, AUTH.indexOf('_profile.plan', iEv));
must(/typeof _profile\.preferredCeps === 'string'/.test(expr) && /Array\.isArray\(_profile\.preferredCeps\)/.test(expr),
  '④ ⭐ o gate de "já usou o app" lê as DUAS formas — a evidência dos 42 volta a contar');
must(!/window\./.test(expr),
  '④ ⛔ e a expressão continua PURA (sem `window.`) — ela roda no caminho de login');
must(/_cepsCore\.unirCeps\(newData\.preferredCeps, oldData\.preferredCeps\)/.test(FN),
  '④ ⭐ e a fusão de contas usa a união que não destrói');
must(!/unionArr\(newData\.preferredCeps/.test(FN),
  '④ ⛔ a união antiga não é mais chamada sobre este campo');

// ── ⑤ e o campo continua FORA do espelho público ──────────────────────────
const P = require(path.join(raiz, 'functions/perfil-publico-core.js'));
must(P.CAMPOS_PUBLICOS.indexOf('preferredCeps') < 0 && P.NUNCA_PUBLICO.indexOf('preferredCeps') >= 0,
  '⑤ ⛔ CEP de alguém não é dado público — consertar a forma não o promove a visível');

console.log('\n✅ ' + ok + ' verificações');
