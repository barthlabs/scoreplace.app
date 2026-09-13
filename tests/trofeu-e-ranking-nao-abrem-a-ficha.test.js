'use strict';
/* ⛔ TROFÉU, RANKING E FICHA PÚBLICA DEIXAM DE ABRIR A FICHA DE TERCEIRO.
 *
 * Quatro telas que mostram gente liam `users/{uid}` inteiro para usar de dois a cinco campos:
 *   • comparar troféus com um amigo — até **20 fichas INTEIRAS por abertura**, para ler
 *     `displayName` e `_trophyIds`;
 *   • ranking entre amigos — lote de fichas para somar `_rankStats`, contador de jogo;
 *   • ficha pública do jogador — `displayName`, `photoURL`, `city`, `preferredSports`,
 *     `skillBySport`;
 *   • ponte do letzplay — resolve o @ para conta usando `letzplayHandle`, nome e foto.
 *
 * Os campos que faltavam entraram no espelho, e o critério foi sempre o mesmo: nenhum é dado
 * de CONTATO, todos já eram legíveis por qualquer autenticado, e cada um sustenta uma tela
 * que quebraria sem ele. Medido: city 98/279 · _trophyIds 237/279 · _rankStats 275/279 ·
 * letzplayHandle 26/279 · xpSnapshot 0/279 (entrou mesmo assim, para não virar armadilha).
 *
 * ⛔ E O E-MAIL COMO NOME MORREU JUNTO: a comparação de troféus caía em `data.email` quando o
 * amigo não tinha nome — transformava o e-mail de uma pessoa em rótulo na tela. Com o espelho
 * a queda nunca acertaria, só mascararia a ausência. Sem nome, o uid é o rótulo honesto.
 *
 * ⚠️ FICA UM ACHADO ABERTO E GORDO, anotado no código: `letzplayImport` — a partida a partida
 * importada — mora DENTRO do documento de perfil. MEDIDO: 18 dos 279 perfis, 2.292 jogos, e o
 * maior ocupa **499 KB**. Abrir a ficha de um desses jogadores baixa meio megabyte de
 * histórico junto, e qualquer leitura de ficha inteira desses 18 paga isso. Pôr no espelho
 * seria PIOR (ele é lido em lote pela chave e pela busca); a forma certa é o import virar
 * documento próprio — migração, não troca de coleção.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const ler = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');
const codigo = (f) => ler(f).split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

const C = require(path.join(raiz, 'functions/perfil-publico-core.js'));
const ESPELHO = 'window._COLECAO_PERFIL_PUBLICO';

console.log('\n──── troféu e ranking não abrem a ficha ────\n');

// ── ① o espelho carrega o que estas telas leem ─────────────────────────────
[['city', 'a ficha pública mostra a cidade onde a pessoa joga'],
 ['_trophyIds', 'a comparação de troféus existe para mostrar isto'],
 ['_rankStats', 'o ranking entre amigos soma estes contadores'],
 ['xpSnapshot', 'ninguém tem hoje — entra para não virar armadilha silenciosa'],
 ['letzplayHandle', 'é um @ público de outra plataforma'],
 ['preferredSports', 'a ficha pública mostra os esportes']].forEach(([k, porque]) => {
  must(C.CAMPOS_PUBLICOS.indexOf(k) >= 0, '① `' + k + '` está no espelho — ' + porque);
});

// ── ② comparar troféus: era o maior, até 20 fichas por abertura ────────────
const TV = codigo('js/views/trophies-view.js');
must(new RegExp('db\\.collection\\(' + ESPELHO.replace(/\./g, '\\.') + " \\|\\| 'usersPublic'\\)\\.doc\\(uid\\)").test(TV),
  '② ⭐ o lote de amigos lê o espelho — eram até 20 fichas INTEIRAS por abertura');
must(!/data\.displayName \|\| data\.email/.test(TV),
  '② ⭐ ⛔ o e-mail do amigo não vira mais NOME na tela');
must(/data\.displayName \|\| snap\.id/.test(TV),
  '② sem nome, o rótulo honesto é o uid — não um endereço de e-mail');

// ── ③ ranking entre amigos ─────────────────────────────────────────────────
const TR = codigo('js/trophies.js');
must(new RegExp('collection\\(' + ESPELHO.replace(/\./g, '\\.') + " \\|\\| 'usersPublic'\\)\\s*\\n?\\s*\\.where\\(firebase").test(TR),
  '③ ⭐ o ranking soma contador de jogo lendo o espelho');

// ── ④ ficha pública do jogador ─────────────────────────────────────────────
const AN = codigo('js/views/tournaments-analytics.js');
must(/var _colPub = window\._COLECAO_PERFIL_PUBLICO \|\| 'usersPublic';/.test(AN),
  '④ a ficha pública resolve pelo espelho');
must(/collection\(_colPub\)\.doc\(uid\)/.test(AN) && /collection\(_colPub\)\.where\('displayName'/.test(AN),
  '④ ⭐ os dois caminhos (por uid e por nome) leem o espelho');
must((AN.match(/\{ publico: true \}/g) || []).length === 2,
  '④ ⭐ e os dois atravessam a lápide sem baixar ficha');

// ── ⑤ ponte do letzplay ────────────────────────────────────────────────────
const ST = codigo('js/store.js');
must(new RegExp("collection\\(window\\._COLECAO_PERFIL_PUBLICO \\|\\| 'usersPublic'\\)\\s*\\n?\\s*\\.where\\('letzplayHandle'").test(ST),
  '⑤ ⭐ a resolução do @ lê o espelho');

// ── ⑥ O ACHADO GORDO está escrito, com a medida ───────────────────────────
const ANbruto = ler('js/views/tournaments-analytics.js');
must(/ACHADO ABERTO, ANOTADO, NÃO CONSERTADO AQUI/.test(ANbruto) && /499 KB/.test(ANbruto),
  '⑥ ⭐ `letzplayImport` (499 KB no maior, 18 de 279) está anotado como achado, com a medida');
must(/collection\('users'\)\.doc\(resolvedUid\)/.test(AN),
  '⑥ e ela CONTINUA em `users` de propósito — o import não cabe no espelho, que é lido em lote');
must(C.CAMPOS_PUBLICOS.indexOf('letzplayImport') < 0,
  '⑥ ⛔ e `letzplayImport` NÃO entrou no espelho — pôr meio megabyte nele seria pior, não melhor');

// ── ⑦ CONTROLE: os portões têm dentes ─────────────────────────────────────
must(!new RegExp('collection\\(' + ESPELHO.replace(/\./g, '\\.') + " \\|\\| 'usersPublic'\\)\\.doc\\(uid\\)")
  .test(TV.replace(/collection\(window\._COLECAO_PERFIL_PUBLICO \|\| 'usersPublic'\)/g, "collection('users')")),
  '⑦ ⭐ apontada de volta para `users`, a asserção ② iria vermelha');

console.log('\n✅ ' + ok + ' verificações');
