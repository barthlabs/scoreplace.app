// 3ª LINHA FANTASMA no card do jogo (bug do dono, jul/2026): "de vez em quando ao recarregar
// aparece uma terceira linha 'Jogador sem perfil' em todos os times". Só no CACHE FRIO.
// Raiz: uma dupla FORMADA carrega uid top-level = uid de UM membro (pair-core `uid:_u1||_u2`).
// No _resolveSideLive (branch posicional), _liveByUid(uidA) caía no lookup do pool e `p.uid===u`
// casava a DUPLA inteira → _pName(dupla) = "A / B" (string de 2 partes) injetada num slot →
// "A / B / B" → split(' / ') = 3 linhas. Fix: slot do membro (p1Uid/p2Uid) tem prioridade sobre
// o uid top-level, que só resolve entrada individual. [[project_uid_identity_canon_locked]]
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// Dupla FORMADA de 2 contas: uid top-level = uid do 1º membro (pair-core.js:75).
function makeT() {
  return {
    id: 't_pair',
    participants: [
      { uid: 'uidA', p1Uid: 'uidA', p1Name: 'Ana', p2Uid: 'uidB', p2Name: 'Bruno',
        displayName: 'Ana / Bruno', name: 'Ana / Bruno' }
    ]
  };
}

// ── CACHE FRIO: nada resolvido por perfil → força o lookup no pool ──
W._userProfileCache = {};
W._profileNameByUid = {};
const tCold = makeT();
const side = W._resolveSideLive(tCold, 'Ana / Bruno', ['uidA', 'uidB']);
const parts = side.split(' / ').map(s => s.trim()).filter(Boolean);
ok(parts.length === 2, 'cache frio: lado da dupla tem 2 membros, NÃO 3 (sem linha fantasma) — deu ' + parts.length + ' ["' + parts.join('","') + '"]');

// _liveByUid não é exposto (closure), mas o efeito é observável via _resolveSideLive acima e
// via _pName da entrada (que NÃO deve vazar pra dentro de um único slot).

// ── CACHE QUENTE: os dois nomes resolvem pelo perfil ──
W._userProfileCache = { uidA: { displayName: 'Ana' }, uidB: { displayName: 'Bruno' } };
const tWarm = makeT();
const sideWarm = W._resolveSideLive(tWarm, 'Ana / Bruno', ['uidA', 'uidB']);
const partsWarm = sideWarm.split(' / ').map(s => s.trim()).filter(Boolean);
ok(partsWarm.length === 2, 'cache quente: 2 membros — deu ' + partsWarm.length);
ok(partsWarm[0] === 'Ana' && partsWarm[1] === 'Bruno', 'cache quente: resolve "Ana / Bruno" pelos perfis');

// ── Entrada INDIVIDUAL com uid ainda resolve normal (não quebrou o caso comum) ──
W._userProfileCache = {};
W._profileNameByUid = {};
const tSolo = { id: 't_solo', participants: [{ uid: 'uidX', name: 'Xavier', displayName: 'Xavier' }] };
const sideSolo = W._resolveSideLive(tSolo, 'Xavier', ['uidX']);
ok(sideSolo === 'Xavier', 'individual (cache frio): resolve pelo pool via uid top-level — deu "' + sideSolo + '"');

// ── Bug 2: rótulo órfão PERSISTIDO no side é CURADO quando o uid resolve ──
// Dupla ficto (Tonho, sem uid) + conta (Camila, uidCam). m.p1 gravou "Tonho / Jogador sem
// perfil (uidC)" no sorteio (cache frio). uidHint = [uidCam] (só a conta). Counts não batem
// (1 uid vs 2 partes) → branch guest. Com a Camila resolvendo agora, o rótulo vira "Camila".
W._userProfileCache = { uidCam1234: { displayName: 'Camila' } };
W._profileNameByUid = {};
const tHeal = { id: 't_heal', participants: [
  { p1Uid: '', p1Name: 'Tonho', p2Uid: 'uidCam1234', p2Name: '', displayName: 'Tonho / Camila', uid: 'uidCam1234' }
] };
const healed = W._resolveSideLive(tHeal, 'Tonho / ' + W._ORPHAN_UID_LABEL + ' (uidC)', ['uidCam1234']);
ok(healed === 'Tonho / Camila', 'heal: rótulo órfão persistido vira "Camila" quando o uid resolve — deu "' + healed + '"');

// uid órfão de verdade (não resolve) → mantém o rótulo (não inventa nome).
W._userProfileCache = {};
const notHealed = W._resolveSideLive(tHeal, 'Tonho / ' + W._ORPHAN_UID_LABEL + ' (uidC)', ['uidCam1234']);
ok(notHealed.indexOf(W._ORPHAN_UID_LABEL) !== -1, 'sem resolução: mantém o rótulo órfão (não inventa) — deu "' + notHealed + '"');

console.log('\n' + (fail === 0 ? '✅ pair-side-no-third-line: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
