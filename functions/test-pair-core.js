/* test-pair-core.js — LÓGICA PURA de formar/desfazer dupla (CF). Sem Firebase/emulador.
 * Espelha _formDuplaByUids / _splitDupla do cliente. node functions/test-pair-core.js */
const { computeFormPair, computeSplitPair } = require('./pair-core');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
}
function mkT() {
  return {
    id: 'T', name: 'Copa', format: 'Eliminatórias Simples', enrollmentMode: 'time', teamSize: 2,
    participants: [
      { uid: 'uidA', displayName: 'Ana', name: 'Ana', enrollSeq: 1 },
      { uid: 'uidB', displayName: 'Bia', name: 'Bia', enrollSeq: 2 },
      { uid: 'uidC', displayName: 'Cid', name: 'Cid', enrollSeq: 3 },
    ],
    teamOrigins: {}, pairRequests: [{ inviterUid: 'uidA', inviteeUid: 'uidB', id: 'uidA__uidB' }],
    creatorUid: 'uidOrg',
  };
}

console.log('\n── formar dupla (computeFormPair) ──');
{
  const t = mkT();
  const r = computeFormPair(t, { uid1: 'uidA', name1: 'Ana', uid2: 'uidB', name2: 'Bia' });
  ok('outcome=formed', r.outcome === 'formed', r.outcome);
  const parts = r.updateData.participants;
  ok('3 entradas → 2 (dupla + Cid)', parts.length === 2, 'len=' + parts.length);
  const team = parts.find((p) => p.p1Uid && p.p2Uid);
  ok('dupla estrutural com p1Uid/p2Uid', !!team && team.p1Uid === 'uidA' && team.p2Uid === 'uidB',
     team && (team.p1Uid + '/' + team.p2Uid));
  ok('displayName "Ana / Bia"', team && team.displayName === 'Ana / Bia', team && team.displayName);
  ok('preserva seqs (p1Seq=1, p2Seq=2)', team && team.p1Seq === 1 && team.p2Seq === 2,
     team && (team.p1Seq + '/' + team.p2Seq));
  ok('teamOrigins["Ana / Bia"]=formada', r.updateData.teamOrigins['Ana / Bia'] === 'formada');
  ok('markDuplasManual (manualPairing=open, sem fmt2)', r.updateData.manualPairing === 'open',
     r.updateData.manualPairing);
  ok('pairRequests limpo (dropou uA/uB)', (r.updateData.pairRequests || []).length === 0,
     (r.updateData.pairRequests || []).length);
  ok('memberUids inclui uA,uB,uC,uOrg',
     ['uidA', 'uidB', 'uidC', 'uidOrg'].every((u) => r.updateData.memberUids.indexOf(u) !== -1),
     JSON.stringify(r.updateData.memberUids));
  ok('Cid preservado solo', parts.some((p) => p.uid === 'uidC' && !p.p2Uid));
}

console.log('\n── formar com fmt2 (formacaoDupla=manual) ──');
{
  const t = mkT(); t.fmt2 = { formatCode: 'elim', formacaoDupla: 'sorteio' };
  const r = computeFormPair(t, { uid1: 'uidA', name1: 'Ana', uid2: 'uidB', name2: 'Bia' });
  ok('fmt2.formacaoDupla vira manual', r.updateData.fmt2 && r.updateData.fmt2.formacaoDupla === 'manual',
     r.updateData.fmt2 && r.updateData.fmt2.formacaoDupla);
  ok('fmt2.formatCode preservado', r.updateData.fmt2 && r.updateData.fmt2.formatCode === 'elim');
  ok('NÃO usa manualPairing legado quando há fmt2', r.updateData.manualPairing === undefined);
}

console.log('\n── formar: alvo inexistente / mesmo ──');
{
  const t = mkT();
  ok('uid inexistente → notFound', computeFormPair(t, { uid1: 'uidA', name1: 'Ana', uid2: 'uidZ', name2: 'Zé' }).outcome === 'notFound');
  ok('mesmo uid → notFound', computeFormPair(t, { uid1: 'uidA', name1: 'Ana', uid2: 'uidA', name2: 'Ana' }).outcome === 'notFound');
}

console.log('\n── desfazer dupla (computeSplitPair) ──');
{
  const t = mkT();
  const formed = computeFormPair(t, { uid1: 'uidA', name1: 'Ana', uid2: 'uidB', name2: 'Bia' });
  const t2 = Object.assign({}, t, formed.updateData);
  const r = computeSplitPair(t2, { id1: 'uidA', id2: 'uidB' });
  ok('outcome=split', r.outcome === 'split', r.outcome);
  const parts = r.updateData.participants;
  ok('2 entradas → 3 (dupla vira 2 solos + Cid)', parts.length === 3, 'len=' + parts.length);
  const ana = parts.find((p) => p.uid === 'uidA'), bia = parts.find((p) => p.uid === 'uidB');
  ok('Ana solo restaurada com seq 1', ana && !ana.p2Uid && ana.enrollSeq === 1, ana && ana.enrollSeq);
  ok('Bia solo restaurada com seq 2', bia && !bia.p2Uid && bia.enrollSeq === 2, bia && bia.enrollSeq);
  ok('nenhuma entrada é mais dupla de uA/uB', !parts.some((p) => p.p1Uid && p.p2Uid));
}

console.log('\n── desfazer: por nome do time (id2 vazio) ──');
{
  const t = mkT();
  const formed = computeFormPair(t, { uid1: 'uidA', name1: 'Ana', uid2: 'uidB', name2: 'Bia' });
  const t2 = Object.assign({}, t, formed.updateData);
  const r = computeSplitPair(t2, { id1: 'Ana / Bia' });
  ok('casa por nome do time → split', r.outcome === 'split', r.outcome);
  ok('inexistente → notFound', computeSplitPair(t2, { id1: 'Fulano / Beltrano' }).outcome === 'notFound');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ` pair-core: ${pass} passaram, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
