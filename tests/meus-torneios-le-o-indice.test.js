/* "MEUS TORNEIOS" LÊ O ÍNDICE, NÃO O TORNEIO INTEIRO (2.0.95)
 * node tests/meus-torneios-le-o-indice.test.js
 *
 * A tela desenha CARTÕES — e cartão não usa jogos, inscritos nem histórico. Lendo o
 * documento completo, ela arrastava o torneio inteiro por linha da lista.
 * MEDIDO no uid do organizador da Confra (scripts/medir-meus-torneios.js):
 *     documento COMPLETO ... 518 KB      RESUMO ... 25 KB
 *
 * ⚠️ O RISCO TEM NOME: torneio sem resumo SOME DA LISTA DA PESSOA — e sumir é pior que
 * pesar. Por isso duas coisas são obrigatórias e este teste as trava:
 *   ① REDE: resumo vazio ⇒ cai no caminho antigo (lista pesada > lista vazia);
 *   ② SENTINELA: se alguém pedir campo pesado ao documento leve, o app avisa com o
 *      rastro de quem pediu, em vez de eu auditar 41 sítios no olho.
 * A cobertura do índice é conferida por scripts/conferir-indice-completo.js (39/39).
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const i = src.indexOf('async loadMyTournaments(uid)');
ok(i > 0, 'loadMyTournaments existe');
// a função inteira: até o próximo membro do objeto no mesmo nível
const corpo = src.slice(i, src.indexOf('\n  async ', i + 10));
ok(corpo.length > 200, 'consegui isolar o corpo da função (' + corpo.length + ' chars)');

// ① lê o ÍNDICE primeiro
ok(/collection\('tournaments_summary'\)/.test(corpo),
  'lê tournaments_summary — sem isso a lista continua arrastando o torneio inteiro');
ok(corpo.indexOf("tournaments_summary") < corpo.lastIndexOf("collection('tournaments')"),
  'o RESUMO vem ANTES do completo (o completo é a rede, não o caminho)');
ok(/memberUids['"]?,\s*['"]array-contains['"]/.test(corpo),
  'consulta por memberUids — é o campo que o índice espelha (conferido por conferir-indice-completo)');

// ② a REDE continua lá
ok(/collection\('tournaments'\)/.test(corpo),
  'o caminho antigo continua existindo como rede — lista vazia por migração seria pior que lista pesada');
ok(/_viaResumo\.length/.test(corpo) || /if \(\s*_viaResumo/.test(corpo),
  'só devolve pelo resumo quando ele trouxe algo; vazio cai na rede');

// ③ a SENTINELA marca o documento leve
ok(/_marcaResumo/.test(corpo),
  'o documento leve recebe a sentinela — é ela que avisa quem pede campo pesado');

// ④ e o que ABRE o torneio continua trocando pelo completo
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
ok(/_ensureTournamentLoaded\s*=\s*function/.test(store),
  '_ensureTournamentLoaded existe — é quem troca o resumo pelo completo ao abrir');
ok(/_resumo/.test(store.slice(store.indexOf('_ensureTournamentLoaded = function'), store.indexOf('_ensureTournamentLoaded = function') + 2500)),
  'e ele trata `_resumo` como NÃO carregado (senão abrir o torneio mostraria a casca)');

console.log((fail ? '✗' : '✓') + ' meus-torneios-le-o-indice: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
