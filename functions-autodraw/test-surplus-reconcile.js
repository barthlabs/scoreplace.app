'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const draw = require('./draw-core.js');
const { reconcileSurplusDecisions, assertSurplusMatchMayStart,
  assertNoPrematureLaterPlay } = require('./surplus-reconcile-core.js');
const win = draw._window;
const callable = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const scoreTx = callable.slice(callable.indexOf('async function _aplicaPlacarNaTransacao('),
  callable.indexOf('// ─── W.O.', callable.indexOf('async function _aplicaPlacarNaTransacao(')));
assert(scoreTx.indexOf('assertSurplusMatchMayStartFn(t, matchId)') >= 0 &&
  scoreTx.indexOf('assertSurplusMatchMayStartFn(t, matchId)') < scoreTx.indexOf('const res = applyResultFn(t, {'),
  'a transação confere a folga antes de aplicar o placar');
assert.strictEqual((callable.match(/_reconcileSurplusBeforeWrite\(t, tId, before\)/g) || []).length, 6,
  'as seis portas de W.O./presença passam o retrato anterior à guarda transacional');

function make() {
  const t = { id: 'l7-r36', name: 'Teste', status: 'open', format: 'Eliminatórias Simples',
    politicaDaChave: 'sobra_unica', participants: Array.from({ length: 36 }, (_, i) =>
      ({ uid: 'u' + (i + 1), name: 'P' + (i + 1), displayName: 'P' + (i + 1) })) };
  assert.strictEqual(draw.drawInitial(t, { idStamp: 1710000000000 }).ok, true);
  return t;
}
function round(t, n) {
  return t.matches.filter(m => m.bracket === 'main' && m.round === n &&
    /VC-R\d+-P\d+$/.test(m.id)).sort((a, b) => Number(a.id.split('-P').pop()) - Number(b.id.split('-P').pop()));
}
function winP1(t, m) {
  assert(m.p1 && m.p1 !== 'TBD' && m.p2 && m.p2 !== 'TBD');
  m.winner = m.p1;
  win._advanceWinner(t, m);
}

const t = make();
assert.strictEqual(Object.keys(t.sobraUnicaDecisoesV1 || {}).length, 0,
  'N=36 não decide a sobra da R3 durante o sorteio');
round(t, 1).forEach(m => winP1(t, m));
const r2 = round(t, 2);
assert.strictEqual(r2.length, 9);
winP1(t, r2[8]);
const bye = round(t, 3).find(m => m.isBye);
assert.strictEqual(bye.sobraAguardaDecisao, true);
assert.strictEqual(bye.winner, null,
  'o primeiro resultado que chega não ganha a folga antes dos outros oito');
assert.strictEqual(reconcileSurplusDecisions(t).changed, false);
r2.slice(0, 8).forEach(m => winP1(t, m));
assert.strictEqual(reconcileSurplusDecisions(t).changed, true);
assert(bye.winner && bye.sobraAguardaDecisao === false);
const receipt = Object.values(t.sobraUnicaDecisoesV1)[0];
assert.strictEqual(receipt.sourceIds.length, 9);
const chosenAfter = r2.find(m => receipt.recipientSourceId.endsWith(m.id.replace(/^.*?(VC-R)/, '$1')));
assert(chosenAfter && chosenAfter.nextMatchId === bye.id,
  'a posição persistida, e não a última semente, alimenta a folga');
assert.strictEqual(bye.winner, chosenAfter.winner);
const snapshot = JSON.stringify(t);
assert.strictEqual(reconcileSurplusDecisions(t).changed, false);
assert.strictEqual(JSON.stringify(t), snapshot, 'retry idempotente');

const outOfOrder = make();
round(outOfOrder, 1).forEach(m => winP1(outOfOrder, m));
const nineSources = round(outOfOrder, 2);
nineSources.slice(0, 8).forEach(m => winP1(outOfOrder, m));
const readyR3 = round(outOfOrder, 3).find(m => !m.isBye && m.p1 !== 'TBD' && m.p2 !== 'TBD');
assert(readyR3, 'há jogo normal da R3 visualmente pronto antes da nona fonte');
const beforePremature = JSON.parse(JSON.stringify(outOfOrder));
assert.throws(() => assertSurplusMatchMayStart(outOfOrder, readyR3.id), /Aguarde a decisão da folga/,
  'servidor recusa iniciar R3 antes de mutar o resultado');
readyR3.resultAt = '2026-10-15T12:00:00Z';
assert.throws(() => assertNoPrematureLaterPlay(beforePremature, outOfOrder), /Aguarde a decisão da folga/,
  'W.O. que lança R3 na mesma transação também é recusado antes de gravar');
delete readyR3.resultAt;
assert.strictEqual(JSON.stringify(outOfOrder), JSON.stringify(beforePremature),
  'as recusas deixam o torneio sem placar ou W.O. novo');
winP1(outOfOrder, nineSources[8]);
outOfOrder.matches.push({ id: readyR3.id.replace(/-P\d+$/, '-P99'), round: 3,
  bracket: readyR3.bracket, phaseIndex: readyR3.phaseIndex,
  category: 'categoria-independente', resultAt: '2026-10-15T12:00:00Z' });
assert.strictEqual(reconcileSurplusDecisions(outOfOrder).changed, true,
  'o nono resultado fecha a folga sem confundir jogo já iniciado em outra categoria');
assert.doesNotThrow(() => assertSurplusMatchMayStart(outOfOrder, readyR3.id),
  'depois da decisão, o jogo normal da R3 é permitido');

const chosen = r2.find(m => receipt.recipientSourceId.endsWith(m.id.replace(/^.*?(VC-R)/, '$1')));
assert(chosen);
chosen.winner = null; delete chosen.winnerUid; delete chosen.winnerUids;
assert.strictEqual(reconcileSurplusDecisions(t).changed, true,
  'reabertura invalida a escolha antes de outro resultado');
assert.strictEqual(Object.keys(t.sobraUnicaDecisoesV1).length, 0);
assert.strictEqual(bye.sobraAguardaDecisao, true);
assert.strictEqual(bye.winner, undefined);
assert.strictEqual(r2[8].nextMatchId, bye.id, 'reabertura restaura a rota estrutural anterior');

const homonyms = make();
round(homonyms, 1).forEach(m => winP1(homonyms, m));
const homonymSources = round(homonyms, 2);
homonymSources.slice(0, -1).forEach(m => winP1(homonyms, m));
const homonymMatch = homonymSources[homonymSources.length - 1];
const actualP2Uid = homonymMatch.team2Uids[0];
homonymMatch.p2 = homonymMatch.p1;
homonymMatch.winner = homonymMatch.p2;
homonymMatch.winnerUid = actualP2Uid;
assert.strictEqual(reconcileSurplusDecisions(homonyms).changed, true);
const homonymReceipt = Object.values(homonyms.sobraUnicaDecisoesV1)[0];
assert(homonymReceipt.revision.includes('uid:' + actualP2Uid),
  'resultado entre homônimos identifica o lado vencedor pelo UID, não pelo texto');

const woTournament = make();
round(woTournament, 1).forEach(m => winP1(woTournament, m));
const woSources = round(woTournament, 2);
woSources.slice(0, -1).forEach(m => winP1(woTournament, m));
const woBye = round(woTournament, 3).find(m => m.isBye);
assert.strictEqual(reconcileSurplusDecisions(woTournament).changed, false);
woSources[woSources.length - 1].wo = true;
winP1(woTournament, woSources[woSources.length - 1]);
assert.strictEqual(reconcileSurplusDecisions(woTournament).changed, true,
  'W.O. da última fonte fecha a decisão na mesma operação');
assert(woBye.winner);
woSources[0].winner = null;
const downstream = round(woTournament, 3).find(m => !m.isBye && m.p1 !== 'TBD' && m.p2 !== 'TBD');
if (downstream) downstream.resultAt = '2026-01-01T12:00:00.000Z';
const beforeFailedReconcile = JSON.stringify(woTournament);
assert.throws(() => reconcileSurplusDecisions(woTournament), /rodada seguinte|posterior/,
  'não desfaz decisão quando a rodada seguinte já começou');
assert.strictEqual(JSON.stringify(woTournament), beforeFailedReconcile,
  'recusa por descendente disputado não faz mutação parcial');

const adapter = win._chavesAdapter;
const growing = { id: 'l7-grow', format: 'Eliminatórias Simples', politicaDaChave: 'sobra_unica',
  currentPhaseIndex: 0, participants: Array.from({ length: 8 }, (_, i) =>
    ({ uid: 'grow' + i, displayName: 'Grow ' + i })) };
growing.matches = adapter.build(8, 'simples', { participantes: growing.participants,
  ns: 'p0', phaseIndex: 0, politicaDaChave: 'sobra_unica' }).matches;
const late = adapter.integrarTardiosElim(growing, [
  { uid: 'grow8', displayName: 'Grow 8' }, { uid: 'grow9', displayName: 'Grow 9' }
], { phaseIndex: 0, agora: '2026-01-01T00:00:00.000Z' });
assert.strictEqual(late.aplicados, 2);
round(growing, 1).forEach(m => winP1(growing, m));
assert.strictEqual(reconcileSurplusDecisions(growing).changed, true,
  'o crescimento de chave também decide a folga posterior só após a rodada-fonte');

console.log('✓ sobra posterior espera todos os vencedores, reconcilia e invalida sem jogo disputado');
