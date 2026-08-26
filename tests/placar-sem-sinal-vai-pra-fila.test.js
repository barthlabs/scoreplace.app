/* SEM SINAL O PLACAR VAI PRA FILA — NUNCA PRO MOTOR DO CLIENTE (2.0.103)
 * node tests/placar-sem-sinal-vai-pra-fila.test.js
 *
 * Ordem do dono: _"imagina diferentes clientes com diferentes versões encerrando as
 * rodadas e gerando a seguinte cada um com um código. de forma alguma. tudo na cf"_.
 * A queda de `commitResultTx` era exatamente isso: qualquer falha da CF caía no motor
 * local, que aplica o placar E DERIVA O AVANÇO DA CHAVE no aparelho.
 *
 * ⚠️ MAS TIRAR A QUEDA SEM MAIS NADA TERIA UM CUSTO que o argumento do dono não cobria:
 * o caminho local escreve no Firestore, que tem FILA OFFLINE (`enablePersistence` —
 * "saves sobrevivem a fechar o app"); uma CF chamável NÃO tem, falha na hora. Na quadra
 * com sinal ruim, isso é a diferença entre o placar entrar e não entrar.
 * ⇒ A queda virou a FILA: escrita comum (que espera o sinal) + gatilho que aplica no
 * servidor com a MESMA função da porta chamável.
 *
 * Este teste tranca as quatro coisas que fazem isso ser verdade e não teatro.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

// ── ① o motor local SAIU do caminho de placar ───────────────────────────────
const i = store.indexOf('async commitResultTx(');
ok(i > 0, 'commitResultTx existe');
const bloco = store.slice(i, i + 5200);
ok(!/commitTournamentTx\([^)]*function \(freshT\)[\s\S]{0,200}_applyResultToTournament/.test(bloco),
  '⭐ o motor do CLIENTE não aplica mais placar — era ele que derivava avanço de chave');
ok(/enfileirarPlacar\(/.test(bloco),
  'a queda agora ENFILEIRA a intenção');

// ── ② e a pessoa é avisada das DUAS coisas ──────────────────────────────────
ok(/Placar guardado/.test(bloco),
  '⛔ falhar em silêncio foi o que custou o jogo 63 — a pessoa sabe que guardou');
ok(/chave só avança/.test(bloco) || /a chave só avança/.test(bloco),
  '⭐ …e sabe que a CHAVE só anda quando a conexão voltar — prometer agora seria mentira');
ok(/Não consegui lançar o placar/.test(bloco),
  'e se nem enfileirar deu, ela sabe disso também');

// ── ③ a fila é escrita COMUM (é o que espera o sinal) e idempotente ─────────
const iE = db.indexOf('async enfileirarPlacar(');
ok(iE > 0, 'o enfileirador existe');
const enf = db.slice(iE, iE + 3000);
ok(/collection\('resultQueue'\)/.test(enf),
  '⭐ escrita comum de Firestore — o SDK entrega sozinho quando a rede volta');
ok(!/await this\.db[\s\S]{0,120}resultQueue[\s\S]{0,120}\.set\(/.test(enf),
  '⛔ e NÃO espera a promessa: offline ela só resolve quando a rede voltar, travaria a tela');
ok(/_hash\(corpo\)/.test(enf),
  '⭐ o id sai da INTENÇÃO: reenviar a mesma coisa cai no mesmo doc, o gatilho roda uma vez');
ok(/actorUid: String\(actor\.uid\)/.test(enf), 'e diz QUEM mandou — é o insumo de autorização');

// ── ④ o servidor aplica com a MESMA função da porta chamável ────────────────
ok(/function _aplicaPlacarNaTransacao/.test(cf),
  '⭐ existe UM miolo de aplicação de placar');
const iQ = cf.indexOf('exports.applyQueuedResult');
const iC = cf.indexOf('exports.applyMatchResult');
ok(iQ > 0 && iC > 0, 'as duas portas existem');
ok(/_aplicaPlacarNaTransacao\(/.test(cf.slice(iQ, iQ + 4000)) &&
   /_aplicaPlacarNaTransacao\(/.test(cf.slice(iC, iC + 3000)),
  '⛔ e as DUAS chamam ele — duas aplicações divergem, que é o bug que a fila existe pra evitar');
ok(/runTransaction/.test(cf.slice(cf.indexOf('function _aplicaPlacarNaTransacao'), cf.indexOf('function _aplicaPlacarNaTransacao') + 2000)),
  'aplica em transação sobre o doc fresco');
const q = cf.slice(iQ, iQ + 4200);
ok(/_isTournamentParticipant|_isTournamentAdmin/.test(cf.slice(cf.indexOf('function _aplicaPlacarNaTransacao'), cf.indexOf('function _aplicaPlacarNaTransacao') + 2000)),
  '⛔ e REFAZ a autorização no servidor — o campo do documento não é confiado, é conferido');
ok(/merge: true/.test(q) && !/\.delete\(\)/.test(q),
  '⛔ o item da fila NÃO é apagado: é o recibo do que a pessoa mandou');

// ── ⑤ a regra: só criar, só em nome próprio ─────────────────────────────────
const iR = rules.indexOf('match /resultQueue/{itemId}');
ok(iR > 0, 'a fila tem regra');
const r = rules.slice(iR, iR + 1200);
ok(/request\.resource\.data\.actorUid == request\.auth\.uid/.test(r),
  '⭐ ninguém enfileira em nome de outro — a CF confia neste campo pra autorizar');
ok(/allow update, delete: if false/.test(r),
  '⛔ e o item é imutável: editável depois de criado, o gatilho leria uma coisa e teria disparado por outra');

console.log((fail ? '✗' : '✓') + ' placar-sem-sinal-vai-pra-fila: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
