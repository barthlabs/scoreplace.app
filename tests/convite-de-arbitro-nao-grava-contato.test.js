'use strict';
/* ⛔ CONVIDAR UM ÁRBITRO NÃO GRAVA O CONTATO DELE NO TORNEIO.
 *
 * O convite montava a entrada do árbitro com `email: u.email` e a gravava dentro de
 * `tournaments/{id}.arbitros[]`. Copiar o contato de uma pessoa para o documento do torneio é
 * o que esta auditoria existe para acabar — e aqui era pior: o CABEÇALHO do próprio arquivo
 * documenta a forma da entrada (`{uid, name, photoURL, status, invitedAt, confirmedAt}`), e
 * `email` não está nela. Campo que o contrato não tem, que ninguém lê (varredura do
 * repositório: zero leitores) e que quem identifica o árbitro nem usa — quem identifica é o
 * `uid`, é assim que a chave confere quem pode apitar.
 *
 * ⭐ MEDIDO ANTES DE MEXER, em 13/set/2026: 61 torneios, **ZERO** com árbitros, **ZERO**
 * entradas gravadas. Nunca vazou — era armadilha armada, não vazamento aberto. É por isso que
 * este conserto é barato: não há dado antigo para migrar.
 *
 * ⚠️ E FICA UM ACHADO ABERTO, ANOTADO DE PROPÓSITO: a LISTA de árbitros disponíveis. Medido,
 * 0 de 279 perfis têm `refereeSports`; com esporte a consulta volta vazia, e SEM esporte ela
 * lista 80 pessoas quaisquer como "árbitros disponíveis", baixando a ficha inteira das 80 —
 * inclusive `preferredLocations`, que são coordenadas. Não foi consertado aqui porque o
 * conserto é decisão de produto (exigir a marca de árbitro), e coordenada de jogador é
 * justamente o tipo de campo que o espelho existe para NÃO carregar.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const SRC = fs.readFileSync(path.join(raiz, 'js/views/arbitros.js'), 'utf8');
const codigo = SRC.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const BRACKET = fs.readFileSync(path.join(raiz, 'js/views/bracket.js'), 'utf8');

console.log('\n──── convite de árbitro não grava contato ────\n');

/* ── ① AS DUAS ENTRADAS GRAVADAS NO TORNEIO ─────────────────────────────────
 * ⚠️ SÃO DUAS, e é por isso que o portão as varre em vez de olhar a primeira: o convite e a
 * auto-confirmação do organizador montam a MESMA estrutura em lugares diferentes. A segunda
 * é a mais usada ("eu mesmo apito") e gravava o e-mail do PRÓPRIO organizador. Consertar só
 * a primeira teria deixado o vazamento vivo no caminho principal.
 * [[feedback_unify_dual_entry_points]] */
const entradas = [];
for (let p = codigo.indexOf('var entry = {'); p >= 0; p = codigo.indexOf('var entry = {', p + 1)) {
  entradas.push(codigo.slice(p, codigo.indexOf('};', p)));
}
must(entradas.length === 2, '① são DUAS entradas (achadas: ' + entradas.length + ') — convite e auto-confirmação');
entradas.forEach((entry, k) => {
  must(!/email/i.test(entry), '① ⭐ ⛔ entrada ' + (k + 1) + ': nenhum e-mail entra no documento do torneio');
  must(!/phone|celular/i.test(entry), '① ⛔ entrada ' + (k + 1) + ': nem telefone');
  ['uid', 'name', 'photoURL', 'status'].forEach((f) => {
    must(new RegExp('\\b' + f + ':').test(entry),
      '① entrada ' + (k + 1) + ': `' + f + '` continua — é a forma que o cabeçalho documenta');
  });
});
const entry = entradas[0];

// ── ② e a leitura que monta a entrada vem do espelho ───────────────────────
must(/collection\(window\._COLECAO_PERFIL_PUBLICO \|\| 'usersPublic'\)\.doc\(uid\)\.get\(\)/.test(codigo),
  '② ⭐ o convite lê o espelho — ele usa `displayName` e `photoURL`, só');

// ── ③ quem identifica o árbitro é o uid, não o contato ─────────────────────
must(/Array\.isArray\(t\.arbitros\)/.test(BRACKET) && /a\.uid/.test(BRACKET),
  '③ ⭐ a chave confere quem pode apitar pelo `uid` — tirar o e-mail não tira poder de ninguém');

// ── ④ o que SOBRA de `users` aqui é o achado aberto, e é UM ────────────────
/* ⭐ 13/set/2026 — O ACHADO DA LISTA FOI CONSERTADO, não só anotado.
 * MEDIDO: 0 de 279 perfis têm `refereeSports`. Com esporte a consulta já voltava vazia; SEM
 * esporte ela caía no `.limit(80)` e listava 80 pessoas QUAISQUER como "árbitros
 * disponíveis" — lista falsa — baixando a ficha inteira das 80, com `preferredLocations`,
 * que são coordenadas. Exigir a marca SEMPRE tira a lista falsa e o download no mesmo gesto. */
const fichas = (codigo.match(/collection\('users'\)/g) || []).length;
must(fichas === 2,
  '④ as ' + fichas + ' leituras de `users` restantes são as duas pontas da MESMA lista de árbitros');
must(/where\('refereeSports', 'array-contains', sport\)/.test(codigo),
  '④ com esporte, filtra pela modalidade');
must(/orderBy\('refereeSports'\)/.test(codigo),
  '④ ⭐⭐ SEM esporte, ainda exige a MARCA (`orderBy` só devolve quem TEM o campo) — antes listava 80 pessoas quaisquer');
must(!/db\.collection\('users'\);\s*\n\s*if \(sport\)/.test(codigo),
  '④ ⛔ e a coleção crua sem filtro não existe mais neste caminho');

// ── ⑤ CONTROLE: o portão tem dentes ───────────────────────────────────────
const comEmail = entry.replace('uid:', "email:     u.email || '',\n          uid:");
must(/email/i.test(comEmail),
  '⑤ ⭐ um `email` de volta na entrada iria vermelho na asserção ①');

console.log('\n✅ ' + ok + ' verificações');
