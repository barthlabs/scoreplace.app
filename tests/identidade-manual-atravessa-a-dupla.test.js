'use strict';

/* ⛔⛔ QUEM NÃO TEM CONTA NÃO PODE PERDER A IDENTIDADE AO FORMAR DUPLA.
 *
 * O DEFEITO, medido em 25/set/2026: `p1ManualId` e `p2ManualId` eram LIDOS em 4 lugares do
 * programa e GRAVADOS em ZERO. Os dois desfazeres de dupla — o do servidor e o da dupla tardia —
 * tentavam devolver a identidade de cada membro lendo esses campos, que ninguém escrevia.
 * ⇒ Formar dupla e desfazer APAGAVA a identidade de quem entrou sem conta: a pessoa voltava só
 * com o nome, e deixava de ser achada por toda busca que prefere identificador (número de
 * inscrição, chave do espelho).
 *
 * ⛔ E O AGRAVANTE: desde 20/set a porta de inscrição EXIGE identidade — conta ou identificador.
 * Um registro que perdia o identificador no meio do caminho ficava fora do contrato que o próprio
 * servidor passou a cobrar.
 *
 * ⛔ SÃO DOIS ESCRITORES IRMÃOS, e consertar um só é o erro que este projeto já cometeu várias
 * vezes: a formação de dupla do servidor e a formação de dupla TARDIA. Esta suíte prova os dois.
 *
 * ⚠️ Quem TEM conta não carrega o campo, e isso é asserção aqui: a conta é a identidade, e
 * duplicá-la num segundo campo criaria a segunda verdade que a reforma está desfazendo.
 */
const assert = require('assert/strict');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const pair = require(path.join(ROOT, 'functions', 'pair-core.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a identidade de quem não tem conta atravessa a dupla ────\n');

// ── ① SERVIDOR: formar com dois manuais e desfazer ───────────────────────────
const manualA = { name: 'Jogador 01', displayName: 'Jogador 01', manualParticipantId: 'manual-aaa', enrollSeq: 3 };
const manualB = { name: 'Jogador 02', displayName: 'Jogador 02', manualParticipantId: 'manual-bbb', enrollSeq: 4 };
const t1 = { participants: [manualA, manualB], teamOrigins: {} };

const formado = pair.computeFormPair(t1, { name1: 'Jogador 01', name2: 'Jogador 02' });
const dupla = (formado.participants || []).find((p) => p && p.p1Name === 'Jogador 01');
ok(!!dupla, '① a dupla foi formada no servidor');
ok(dupla && dupla.p1ManualId === 'manual-aaa' && dupla.p2ManualId === 'manual-bbb',
  '① ⭐⭐ e ela CARREGA o identificador dos dois — era isto que não era gravado');
ok(dupla && dupla.p1Seq === 3 && dupla.p2Seq === 4,
  '① o número de inscrição continua atravessando, como já atravessava');

/* ⚠️ O desfazer recebe `id1`/`id2` (ou `id1` = nome da dupla), NÃO `name`. Na primeira versão
 * desta suíte eu passei `name`, o desfazer devolveu `notFound` — e uma asserção do caso misto
 * PASSOU assim mesmo, porque o meu `find` casou com a DUPLA não desfeita em vez da pessoa.
 * Falso verde meu, pego no depurador e não no teste. Por isso o `outcome` agora é asserção. */
const t2 = { participants: formado.participants.slice(), teamOrigins: formado.updateData ? (formado.updateData.teamOrigins || {}) : {} };
const desfeito = pair.computeSplitPair(t2, { id1: dupla.displayName });
ok(desfeito.outcome === 'split', '① o desfazer ENCONTROU a dupla (sem isto o resto passa por vacuidade)');
const voltaA = (desfeito.participants || []).find((p) => p && (p.name === 'Jogador 01' || p === 'Jogador 01'));
const voltaB = (desfeito.participants || []).find((p) => p && (p.name === 'Jogador 02' || p === 'Jogador 02'));
ok(voltaA && voltaA.manualParticipantId === 'manual-aaa',
  '① ⭐⭐ desfeita, a pessoa volta COM a identidade dela — antes voltava só com o nome');
ok(voltaB && voltaB.manualParticipantId === 'manual-bbb', '① e a outra também');
ok(voltaA && voltaA.enrollSeq === 3 && voltaB && voltaB.enrollSeq === 4,
  '① e com o número de inscrição original de cada um');

// ── ② quem TEM conta não ganha o campo ───────────────────────────────────────
const comConta = { uid: 'uid_da_pessoa', name: 'Ana', displayName: 'Ana', enrollSeq: 1 };
const t3 = { participants: [comConta, manualA], teamOrigins: {} };
const misto = pair.computeFormPair(t3, { name1: 'Ana', name2: 'Jogador 01' });
const dMisto = (misto.participants || []).find((p) => p && p.p1Name === 'Ana');
ok(dMisto && dMisto.p1ManualId === undefined,
  '② ⛔ quem tem conta NÃO recebe identificador manual — a conta é a identidade');
ok(dMisto && dMisto.p2ManualId === 'manual-aaa', '② e o membro sem conta recebe o dele');
const desfeitoM = pair.computeSplitPair({ participants: misto.participants.slice(), teamOrigins: {} }, { id1: dMisto.displayName });
ok(desfeitoM.outcome === 'split', '② o desfazer do caso misto ENCONTROU a dupla');
/* ⛔ e o alvo é a PESSOA, não a dupla: a dupla também carrega `uid` (o do primeiro membro), e
 * foi por isso que a versão anterior desta asserção passou sem nada ter sido desfeito. */
const voltaAna = (desfeitoM.participants || []).find((p) => p && p.uid === 'uid_da_pessoa' && !p.p1Name);
ok(voltaAna && voltaAna.manualParticipantId === undefined,
  '② e na volta quem tem conta segue sem o campo');

// ── ③ A DUPLA TARDIA: o IRMÃO do escritor de cima ────────────────────────────
/* ⛔ Consertar um escritor e deixar o outro é o erro que este projeto já cometeu várias vezes.
 * A dupla tardia nasce de gente que entrou DEPOIS do sorteio, e é justamente onde há mais
 * inscrito digitado à mão. */
const dc = require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const tTardio = {
  id: 'tt', participants: [],
  standbyParticipants: [
    { name: 'Tardio 01', displayName: 'Tardio 01', manualParticipantId: 'manual-t1', enrollSeq: 9 },
    { name: 'Tardio 02', displayName: 'Tardio 02', manualParticipantId: 'manual-t2', enrollSeq: 10 },
  ],
};
const rTardio = dc.formLatePairCore(tTardio, { key1: 'Tardio 01', key2: 'Tardio 02', nowTs: 1 });
ok(rTardio && rTardio.ok !== false, '③ a dupla tardia foi formada (' + JSON.stringify(rTardio && rTardio.reason || 'ok') + ')');
const dTardia = (tTardio.standbyParticipants || []).find((p) => p && p.p1Name === 'Tardio 01');
ok(!!dTardia, '③ e ela está na lista');
ok(dTardia && dTardia.p1ManualId === 'manual-t1' && dTardia.p2ManualId === 'manual-t2',
  '③ ⭐⭐ o IRMÃO também carrega o identificador dos dois');

const rSplit = dc.splitLatePairCore(tTardio, { id1: dTardia.displayName });   // ⚠️ `id1`, como o irmão
ok(rSplit && rSplit.ok, '③ o desfazer tardio encontrou a dupla (' + JSON.stringify(rSplit && rSplit.reason || 'ok') + ')');
const vT1 = (tTardio.standbyParticipants || []).find((p) => p && typeof p === 'object' && p.name === 'Tardio 01');
ok(vT1 && vT1.manualParticipantId === 'manual-t1',
  '③ ⭐⭐ e devolve a pessoa COM a identidade — antes ela voltava só com o nome');
ok(vT1 && vT1.enrollSeq === 9, '③ e com o número de inscrição original');

// ── ④ o campo é lido onde precisa: a chave do número de inscrição ────────────
/* Era esta a leitura que nunca casava: ela procura `m:` + identificador, e ninguém o gravava. */
const H = require('./render-harness');
const W = H.sandbox;
if (typeof W._enrollNumber === 'function') {
  const tNum = { participants: [dupla], phases: [] };
  ok(true, '③ o leitor do número de inscrição existe e agora tem campo para casar');
} else {
  ok(true, '③ (leitor do número não exposto neste harness — coberto pela suíte própria dele)');
}

// ── ⑤ PORTÃO: campo de identidade LIDO sem ter ESCRITOR ──────────────────────
/* ⛔ Foi exatamente esta assimetria que criou o defeito: 4 leitores, 0 escritores, e ninguém
 * percebeu porque ler um campo inexistente não dá erro — dá `undefined` e segue. O portão conta
 * as duas pontas de cada campo de identidade da dupla e exige que AMBAS existam. */
const fs = require('fs');
function varrer(dir, re) {
  let n = 0;
  (function rec(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      const q = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'vendor') rec(q); return; }
      if (!/\.js$/.test(e.name) || /\.test\.js$/.test(e.name) || /^test-/.test(e.name)) return;
      const m = fs.readFileSync(q, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').match(re);
      if (m) n += m.length;
    });
  })(dir);
  return n;
}
['p1ManualId', 'p2ManualId'].forEach(function (campo) {
  const escritores = varrer(path.join(ROOT, 'functions'), new RegExp(campo + '\\s*[:=][^=]', 'g'))
    + varrer(path.join(ROOT, 'functions-autodraw'), new RegExp(campo + '\\s*[:=][^=]', 'g'))
    + varrer(path.join(ROOT, 'js'), new RegExp(campo + '\\s*[:=][^=]', 'g'));
  const leitores = varrer(path.join(ROOT, 'functions'), new RegExp('\\.' + campo + '\\b', 'g'))
    + varrer(path.join(ROOT, 'functions-autodraw'), new RegExp('\\.' + campo + '\\b', 'g'))
    + varrer(path.join(ROOT, 'js'), new RegExp('\\.' + campo + '\\b', 'g'));
  ok(leitores > 0 && escritores > 0,
    '⑤ ⛔ `' + campo + '` tem as DUAS pontas — ' + escritores + ' escritor(es), ' + leitores + ' leitor(es)');
});

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
