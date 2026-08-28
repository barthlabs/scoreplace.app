/* PROPOSTA PENDENTE NÃO APAGA RESULTADO CONFIRMADO
 * node tests/proposta-nao-apaga-resultado.test.js
 *
 * RELATO DO DONO (28/ago/2026): _"lancamos os jogos I2 ontem e agora aparece apenas 1
 * preenchido"_ · _"no i2 tem placar apenas no jogo104; 103 e 105 no 0-0"_ · _"eu aprovei
 * os resultados ou lancei pessoalmente ontem como organizador. dos 2 grupos."_
 *
 * ⚠️ O DADO ESTAVA INTEIRO — este teste não existe por perda de dado, e sim porque a
 * TELA apagava o que o banco tinha. Medido na Confra no dia:
 *   `matches` (fonte de verdade), grupo V jogo 1 : winner + 5x6 + sets, confirmado 22:40
 *   `results` (o que a tela funde por cima)      : { scoreP1: null, scoreP2: null,
 *                                                    winner: null, pendingResult: {...} }
 *                                                  — SEM `sets`, SEM `resultAt`
 * `_overlayResultOnMatch` copiava "se a chave existe", então os `null` passavam por cima
 * do resultado bom: placar zerado (o 0-0 do relato) e o jogo voltando a parecer indeciso.
 * `sets`/`resultAt` sobreviviam só porque as chaves nem vinham no subdoc — o que deixava
 * o estrago com cara de dado perdido sem ser.
 *
 * ⛔ E ELE GRUDAVA: `hydrateMatchResults` chama `_saveToCache()` logo depois, então o
 * apagamento era PERSISTIDO no cache local. Por isso o grupo I2 seguiu 0-0 em 103 e 105
 * DIAS depois de aprovado, com as duas cópias íntegras no servidor.
 *
 * A REGRA QUE ESTE ARQUIVO GUARDA:
 *     `null` vindo do subdoc é "NÃO SEI", nunca "NÃO TEM".
 * Um subdoc que carrega só PROPOSTA não sabe nada sobre o resultado, então não fala sobre
 * ele. [[project_derivado_nao_se_guarda_standings]] é a mesma lição, noutro campo.
 *
 * COMO ELE MEDE: extrai `_matchResultFields` + `_overlayResultOnMatch` do store.js REAL e
 * EXECUTA a função com os payloads medidos em produção. Não é varredura de fonte — se a
 * regra voltar a apagar, a asserção cai.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (obtido: ' + JSON.stringify(a) + ')'); }

// ── extrai os DOIS membros reais do store.js e monta um objeto executável ─────────
const src = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const iF = src.indexOf('_matchResultFields:');
const iO = src.indexOf('_overlayResultOnMatch: function', iF);
ok(iF > 0 && iO > iF, 'achei _matchResultFields e _overlayResultOnMatch no store.js');
const fim = src.indexOf('\n  },', iO);
ok(fim > iO, 'achei o fim do _overlayResultOnMatch');
const corpo = src.slice(iF, fim + '\n  }'.length);
let AppStore;
try { AppStore = new Function('return {' + corpo + '};')(); }
catch (e) { falhas++; console.log('  ✗ não consegui montar o objeto: ' + e.message); process.exit(1); }
ok(typeof AppStore._overlayResultOnMatch === 'function', 'a função saiu executável do fonte real');

// ── payloads MEDIDOS na Confra em 28/ago/2026 (transcrição, não invenção) ─────────
const matchConfirmado = () => ({
  id: 'm-v1', label: 'R1 Grupo V • Jogo 1',
  p1: 'Patricia Paixao / Roberta Lukaisus', p2: 'MARCIA TERZI / Bruna',
  scoreP1: 5, scoreP2: 6,
  sets: [{ gamesP1: 5, gamesP2: 6, tiebreak: { pointsP1: 0, pointsP2: 7 } }],
  setsWonP1: 0, setsWonP2: 1,
  winner: 'Roberta Lukaisus / MARCIA TERZI',
  resultAt: 1787870450919, pendingResult: null
});
// o subdoc como ele ESTAVA no banco: só proposta, com os campos de resultado em null
const resultSoProposta = {
  matchId: 'm-v1', scoreP1: null, scoreP2: null, winner: null,
  pendingResult: {
    kind: 'inline', proposedBy: 'lwACVPtDGJQtM4cpdeBnk0XsMl92',
    proposedByName: 'Patricia Paixao', proposedAt: 1787872656735,
    winner: 'Roberta Lukaisus / MARCIA TERZI', scoreP1: 5, scoreP2: 6,
    sets: [{ gamesP1: 5, gamesP2: 6, tiebreak: { pointsP1: 0, pointsP2: 7 } }]
  },
  updatedAt: '2026-08-27T23:17:38.129Z'
};

console.log('\n1. O caso do relato: proposta chega por cima de um jogo já decidido');
var m = matchConfirmado();
AppStore._overlayResultOnMatch(m, resultSoProposta);
eq([m.scoreP1, m.scoreP2], [5, 6], 'o PLACAR sobrevive — era ele que virava 0-0 na tela');
eq(m.winner, 'Roberta Lukaisus / MARCIA TERZI', 'o VENCEDOR sobrevive');
eq(m.sets, [{ gamesP1: 5, gamesP2: 6, tiebreak: { pointsP1: 0, pointsP2: 7 } }], 'os sets sobrevivem');
eq(m.resultAt, 1787870450919, 'o resultAt sobrevive');
ok(!!m.pendingResult && m.pendingResult.proposedByName === 'Patricia Paixao',
   '⭐ mas a PROPOSTA entra — ela é a novidade e a tela precisa dela pros botões');

console.log('\n2. Subdoc COM resultado confirmado continua mandando');
// o caminho normal: o subdoc traz o resultado, e ele é a verdade mais nova.
var m2 = matchConfirmado();
AppStore._overlayResultOnMatch(m2, {
  matchId: 'm-v1', scoreP1: 6, scoreP2: 3, winner: 'Patricia Paixao / Roberta Lukaisus',
  sets: [{ gamesP1: 6, gamesP2: 3 }], resultAt: 1787999999999, pendingResult: null
});
eq([m2.scoreP1, m2.scoreP2], [6, 3], 'placar do subdoc sobrescreve');
eq(m2.winner, 'Patricia Paixao / Roberta Lukaisus', 'vencedor do subdoc sobrescreve');
eq(m2.resultAt, 1787999999999, 'e o resultAt também');

console.log('\n3. Limpar a proposta continua funcionando (o consenso fechou)');
var m3 = matchConfirmado();
m3.pendingResult = { proposedByName: 'Alguém' };
AppStore._overlayResultOnMatch(m3, { matchId: 'm-v1', winner: 'Roberta Lukaisus / MARCIA TERZI', pendingResult: null });
eq(m3.pendingResult, null, '⛔ pendingResult:null LIMPA — é o que tira Confirmar/Contestar da tela');

console.log('\n4. Jogo ainda SEM resultado aceita a proposta normalmente');
var m4 = { id: 'm-x', p1: 'A / B', p2: 'C / D' };   // nada decidido ainda
AppStore._overlayResultOnMatch(m4, { matchId: 'm-x', scoreP1: null, scoreP2: null, winner: null,
                                     pendingResult: { proposedByName: 'Fulano', scoreP1: 6, scoreP2: 4 } });
ok(!!m4.pendingResult, 'a proposta entra');
ok(m4.winner == null, 'e o jogo segue indeciso — não inventamos resultado');

console.log('\n5. Empate e W.O. contam como RESULTADO (não são "não sei")');
var m5 = matchConfirmado();
AppStore._overlayResultOnMatch(m5, { matchId: 'm-v1', winner: null, draw: true, scoreP1: 6, scoreP2: 6 });
eq(m5.draw, true, 'draw:true é resultado e passa');
eq([m5.scoreP1, m5.scoreP2], [6, 6], 'e o placar do empate vem junto');
var m6 = matchConfirmado();
AppStore._overlayResultOnMatch(m6, { matchId: 'm-v1', winner: null, wo: true, woAbsent: 'Fulano', scoreP1: null, scoreP2: null });
eq(m6.wo, true, 'wo é resultado e passa');
eq(m6.woAbsent, 'Fulano', 'com quem faltou');


/* ══ A SEGUNDA METADE: QUEM ESCREVE O SUBDOC AGORA É A CF ═════════════════════════
 * Ordem do dono (28/ago/2026): _"acabe com o espelho. já migramos definitivamente para a
 * nova versão de dados e desistimos do antigo"_ + _"quando a proposta foi confirmada pelo
 * organizador ou adversário não pode mais ficar pendente. tem que ficar confirmada. isso
 * tem que ser robusto e confiável"_.
 *
 * Proteger só a LEITURA não bastava: o subdoc do grupo V foi REGRAVADO às 23:17 com o
 * estado de proposta por cima de um resultado confirmado às 22:40 — pelo espelho do
 * CLIENTE (`_dualWriteMatchResult`), que copiava o match local por cima do subdoc.
 *
 * ⛔ ESSE ESPELHO MORREU. Quem escreve `results` agora é a CF, DENTRO da transação que
 * aplica o placar: quem grava é quem acabou de aplicar, então não existe retrato velho a
 * empurrar. Este bloco guarda as três regras dessa escrita.
 */
const bui = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
const ad  = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');

console.log('\n6. O espelho do CLIENTE não existe mais');
ok(!/_dualWriteMatchResult\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
   'store.js não tem mais NENHUMA chamada a _dualWriteMatchResult');
ok(!/function _dualWriteResult/.test(bui) && !/_dualWriteResult\(tId/.test(bui),
   'bracket-ui.js não tem mais o wrapper nem as 7 chamadas dele');

console.log('\n7. A CF escreve o subdoc — e com as travas certas');
const bloco = ad.slice(ad.indexOf("if (nome === 'matches' && _mrEspelho"),
                       ad.indexOf("if (nome === 'matches' && _mrEspelho") + 2400);
ok(/buildMirrorDoc\(/.test(bloco),
   'usa buildMirrorDoc — a MESMA fonte de functions/, não uma segunda cópia do formato');
ok(/pendingResult = FieldValue\.delete\(\)/.test(bloco),
   '⛔ jogo DECIDIDO apaga o pendingResult — confirmado não fica pedindo confirmação');
ok(/_decidido = \(jogo\.winner != null/.test(bloco) && /jogo\.draw === true \|\| jogo\.wo != null/.test(bloco),
   'e "decidido" inclui empate e W.O., não só winner');
ok(/delete _doc\.playerUids/.test(bloco),
   '⛔ roster VAZIO não sobrescreve roster bom — é ele que sustenta a regra de escrita');
ok(/\{ merge: true \}/.test(bloco),
   'grava com merge — é o que preserva o `replay`, que o servidor não sabe recalcular');

console.log('\n8. O construtor do subdoc é de verdade e monta o formato de produção');
const mr = require(path.join(ROOT, 'functions-autodraw', 'vendor', 'match-roster.js'));
const doc = mr.buildMirrorDoc({ name: 'Confra' },
  { id: 'm1', winner: 'A / B', scoreP1: 6, scoreP2: 3, sets: [{ gamesP1: 6, gamesP2: 3 }],
    p1: 'A / B', p2: 'C / D', label: 'R1 Grupo I2 • Jogo 1' },
  'tour_1', '2026-08-28T00:00:00Z', null);
eq(doc.winner, 'A / B', 'o vencedor entra');
eq([doc.scoreP1, doc.scoreP2], [6, 3], 'o placar entra');
eq(doc.roundLabel, 'R1 Grupo I2 • Jogo 1', 'e o rótulo, que é o que a tela mostra');
ok(doc.tournamentId === 'tour_1' && !!doc.updatedAt, 'com tournamentId e updatedAt');

console.log(falhas === 0
  ? '\n✅ proposta não apaga resultado — e o espelho do cliente morreu\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
