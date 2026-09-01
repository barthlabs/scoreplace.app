/* PODAR O HISTÓRICO NÃO PODE PERDER LINHA — E QUEM PODA TEM QUE DEVOLVER (2.0.100)
 * node tests/poda-do-historico-nao-perde-linha.test.js
 *
 * O documento do torneio tem teto de 1 MB. `history` é o ÚNICO campo que cresce PRA
 * SEMPRE — `rounds` para quando o torneio acaba, o log de auditoria não. Medido em
 * 26/ago: 37 KB dos 245 KB do Confra.
 *
 * Podar é fácil; podar sem mentir é o trabalho. Três coisas têm que valer juntas:
 *   ① a poda mora no SERVIDOR, depois de o espelho já ter o que vai sair — no cliente eu
 *      estaria podando na esperança;
 *   ② ela roda em TRANSAÇÃO relendo o doc: entre o gatilho e a escrita alguém lança
 *      placar e acrescenta linha, e um update cego engoliria essa linha (seria eu
 *      recriando o bug de save atrasado que a proteção do cliente existe pra impedir);
 *   ③ a tela que mostra o log INTEIRO vai buscar o que foi podado — rastro que some em
 *      silêncio é o oposto de rastro. Reconstruir o sumiço do Gersom custou uma tarde
 *      justamente por falta dele.
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');
const draw = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-draw.js'), 'utf8');
const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

// ── ① a poda é do SERVIDOR, e vem DEPOIS do espelho ─────────────────────────
const iEsp = cf.indexOf("_espelhaColecao(db, id, 'history'");
const iPoda = cf.indexOf('TETO_HIST');
ok(iEsp > 0 && iPoda > iEsp,
  '⭐ a poda roda DEPOIS de espelhar — jogar fora o que ainda não foi copiado é perder');
ok(!/history\s*=\s*[^;]*slice\(-/.test(db.slice(0, db.indexOf('carregarHistoricoCompleto'))),
  '⛔ e o CLIENTE não poda: lá existe a proteção que RECONSTRÓI histórico encolhido');

// ── ② transação, e só a ponta velha ─────────────────────────────────────────
const bloco = _R.oBlocoQueContem(cf, iPoda);
ok(/runTransaction/.test(bloco),
  '⛔ a poda roda em TRANSAÇÃO — update cego engoliria o placar lançado no meio');
ok(/tx\.get\(/.test(bloco), 'e RELÊ o documento dentro dela (senão a transação não serve de nada)');
ok(/h\.length <= TETO_HIST\)\s*return 0/.test(bloco),
  'se outro disparo já podou, ela desiste — não poda duas vezes');
ok(/slice\(-ALVO_HIST\)/.test(bloco),
  '⭐ guarda a CAUDA: o que sai é o mais VELHO, que está espelhado há muito tempo');
const teto = /TETO_HIST = (\d+), ALVO_HIST = (\d+)/.exec(cf);
ok(teto && Number(teto[2]) < Number(teto[1]),
  'o alvo é menor que o teto — podar até o próprio teto podaria a cada linha nova');

// ── ③ o contador é CUMULATIVO ───────────────────────────────────────────────
ok(/historyPodados: \(Number\(d\.historyPodados\) \|\| 0\) \+ fora/.test(cf),
  '⭐ `historyPodados` SOMA em vez de guardar um total — total ficaria velho na linha seguinte');
ok(/historyPodados/.test(draw),
  'e a tela decide por ele se existe mais log lá fora');

// ── ④ quem poda devolve ─────────────────────────────────────────────────────
ok(/carregarHistoricoCompleto/.test(db) && /carregarHistoricoCompleto/.test(draw),
  '⭐ a tela do log INTEIRO vai buscar o que foi podado');
const iLeitor = draw.indexOf('_podados > 0');
ok(iLeitor > 0, 'e só busca quando REALMENTE podaram — torneio intacto não paga leitura');
ok(/localeCompare/.test(db.slice(db.indexOf('carregarHistoricoCompleto'), db.indexOf('carregarHistoricoCompleto') + 1400)),
  '⛔ ordena por `item.date`, NUNCA por índice — índice anda com a poda (defeito da 2.0.99b)');
ok(/_linhaDoHistorico/.test(draw) &&
   (draw.match(/_linhaDoHistorico/g) || []).length >= 3,
  'a linha é desenhada por UMA função só — duas marcações pro mesmo dado divergem');

// ── ⑤ e dá pra ler ──────────────────────────────────────────────────────────
ok(/match \/history\/\{eventoId\}/.test(rules),
  '⛔ a subcoleção é LEGÍVEL: sem regra o Firestore nega por omissão e a busca voltaria vazia');
/* ⚠️ ÂNCORA DEPOIS DE `tournaments` (2.1.87): `history` existe também no bloco `sandboxes`,
 * onde o DONO escreve de propósito (é o sandbox dele). O que se cobra aqui é a regra do
 * torneio REAL — `indexOf` solto pegava o bloco errado. */
const _iH = rules.indexOf('match /history/{eventoId}', rules.indexOf('match /tournaments/{tournamentId}'));
/* e o FIM é o fecho do bloco, não uma janela fixa: comentário novo empurraria a linha pra
 * fora do recorte e o teste reprovaria sem defeito nenhum. */
const rBloco = rules.slice(_iH, rules.indexOf('\n      }', _iH));
ok(/allow write: if false/.test(rBloco), 'e o cliente NÃO escreve nela — quem espelha é a CF');

console.log((fail ? '✗' : '✓') + ' poda-do-historico-nao-perde-linha: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
