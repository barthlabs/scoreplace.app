/* test-pair-core.js — LÓGICA PURA de formar/desfazer dupla (CF). Sem Firebase/emulador.
 * Espelha _formDuplaByUids / _splitDupla do cliente. node functions/test-pair-core.js */
const { computeFormPair, computeSplitPair, findDuplicatePeople } = require('./pair-core');

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

// ── REGRESSÃO v1.5.8 — "Torneio de Casais: a presença embaralhou as duplas" ────────────
// Visto AO VIVO: Lucia aparecia em "Fernando/Lucia" E em "Lucia/Patrícia"; Patrícia em
// "Nei/Patrícia" E na mesma. Causa: computeFormPair casava a entrada por `p.uid` SEM checar
// se ela era DUPLA — e numa dupla o uid de topo é o do p1. Formar dupla com quem já era p1
// engolia a entrada inteira (o parceiro SUMIA do roster); quem era p2 não era achado e
// acabava pareado de novo → a MESMA pessoa em duas duplas.
console.log('\n── formar: quem já está em dupla NÃO pode ser pareado de novo (v1.5.8) ──');
{
  const t = mkT();
  const f = computeFormPair(t, { uid1: 'uidA', name1: 'Ana', uid2: 'uidB', name2: 'Bia' });
  const t2 = Object.assign({}, t, f.updateData);

  // p1 da dupla (uid de topo da entrada) — era ESTE que consumia a dupla inteira
  const r1 = computeFormPair(t2, { uid1: 'uidA', name1: 'Ana', uid2: 'uidC', name2: 'Cid' });
  ok('p1 já em dupla → alreadyPaired', r1.outcome === 'alreadyPaired', r1.outcome);
  ok('não grava nada', r1.updateData === null);
  ok('roster intacto (dupla + Cid)', r1.participants.length === 2, 'len=' + r1.participants.length);
  ok('Bia NÃO sumiu do roster',
     r1.participants.some((p) => p.p1Uid === 'uidA' && p.p2Uid === 'uidB'));

  // p2 da dupla — o lado que "não era achado" e virava dupla nova (a Lucia/Patrícia do print)
  const r2 = computeFormPair(t2, { uid1: 'uidB', name1: 'Bia', uid2: 'uidC', name2: 'Cid' });
  ok('p2 já em dupla → alreadyPaired', r2.outcome === 'alreadyPaired', r2.outcome);
  ok('não cria 2ª dupla com a mesma pessoa', r2.updateData === null);

  // fictício (sem uid) também é protegido — a identidade dele é o nome
  const t3 = { participants: [
    { p1Uid: '', p1Name: 'Paulo', p2Uid: '', p2Name: 'Elide' }, 'Zeca'
  ], teamOrigins: {} };
  const r3 = computeFormPair(t3, { uid1: '', name1: 'Paulo', uid2: '', name2: 'Zeca' });
  ok('fictício já em dupla → alreadyPaired', r3.outcome === 'alreadyPaired', r3.outcome);
}

console.log('\n── auditoria: findDuplicatePeople ──');
{
  // o estado REAL do doc quando o dono reportou (uma pessoa em 2 entradas)
  const t = { participants: [
    { uid: 'uL', p1Uid: 'uL', p2Uid: 'uP' },
    { uid: 'uF', p1Uid: 'uF', p2Uid: 'uL' },
    { uid: 'uN', p1Uid: 'uN', p2Uid: 'uP' },
  ] };
  const dup = findDuplicatePeople(t).map((d) => d.id).sort();
  ok('acusa uL e uP duplicados', dup.join(',') === 'uL,uP', dup.join(','));
  ok('roster são → nenhum duplicado',
     findDuplicatePeople({ participants: [{ uid: 'a' }, { uid: 'b' }] }).length === 0);
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

// BUG DO DONO (22/jul, "Torneio de Férias só Casais"): clicava no ✕ da dupla, o toast dizia
// "Dupla desfeita" e NADA acontecia — quantas vezes clicasse. Raiz: o storage é SÓ-UID
// ("nome com uid nunca é gravado" — identity-core._stripStoredNamesForUidEntries), então a
// dupla gravada NÃO tem p1Name/p2Name/displayName; computeSplitPair exigia os DOIS NOMES e
// devolvia notFound → não gravava nada. A entrada abaixo é cópia FIEL do doc de produção.
console.log('\n── desfazer dupla SÓ-UID (sem nome gravado) — bug de produção ──');
{
  const t = {
    id: 'T', enrollmentMode: 'teams', teamSize: 2, creatorUid: 'uidOrg',
    participants: [
      { uid: 'uidA', p1Uid: 'uidA', p2Uid: 'uidB', p1Seq: 2, p2Seq: 1, ligaActive: true,
        category: 'Misto Obrig.', categories: ['Misto Obrig.'], categorySource: 'perfil' },
      { uid: 'uidC', enrollSeq: 21 },
    ],
  };
  const r = computeSplitPair(t, { id1: 'uidA', id2: 'uidB' });
  ok('só-uid → split (era notFound)', r.outcome === 'split', r.outcome);
  const parts = (r.updateData || {}).participants || [];
  ok('gravou update (participants)', !!r.updateData && parts.length === 3, 'len=' + parts.length);
  const a = parts.find((p) => p && p.uid === 'uidA'), b = parts.find((p) => p && p.uid === 'uidB');
  ok('2 solos por uid', !!a && !!b && !a.p2Uid && !b.p2Uid);
  ok('herda nº de inscrição (2 e 1)', a && b && a.enrollSeq === 2 && b.enrollSeq === 1,
     a && b && (a.enrollSeq + '/' + b.enrollSeq));
  ok('herda categoria', a && a.category === 'Misto Obrig.' && b && b.category === 'Misto Obrig.');
  ok('NÃO grava nome junto do uid (cânone só-uid)',
     a && !a.displayName && !a.name && b && !b.displayName && !b.name);
  ok('memberUids mantém os 2', ['uidA', 'uidB'].every((u) => r.updateData.memberUids.indexOf(u) !== -1));
  ok('nenhuma dupla sobrou', !parts.some((p) => p && p.p1Uid && p.p2Uid));
}

console.log('\n── desfazer dupla com FICTÍCIO (sem conta) — nome continua sendo a identidade ──');
{
  const t = {
    id: 'T', enrollmentMode: 'teams', teamSize: 2, creatorUid: 'uidOrg',
    participants: [{ uid: 'uidA', p1Uid: 'uidA', p2Name: 'Convidado', p1Seq: 1 }],
  };
  const r = computeSplitPair(t, { id1: 'uidA', id2: 'Convidado' });
  ok('uid + fictício → split', r.outcome === 'split', r.outcome);
  const parts = (r.updateData || {}).participants || [];
  ok('fictício volta como string do nome', parts.indexOf('Convidado') !== -1, JSON.stringify(parts));
  ok('titular volta por uid', parts.some((p) => p && p.uid === 'uidA' && !p.p2Uid && !p.p2Name));
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
