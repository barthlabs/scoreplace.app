// Resolução do lado da dupla por UID POSICIONAL (cânone: nome com uid NUNCA é gravado — só uid;
// resolve-se pelo perfil). Dois bugs do dono (jul/2026), mesma raiz (dupla formada carrega uid
// top-level = uid de um membro, e o hint perdia a posição do slot fictício):
//  1) 3ª LINHA FANTASMA em todos os times ao recarregar (cache frio): _liveByUid casava a DUPLA
//     inteira em `p.uid===u` e devolvia "A / B" (2 partes) num slot → 3 linhas. Fix: slot do
//     membro tem prioridade sobre o uid top-level.
//  2) "Camila sumiu" (parceira de ficto): com parceiro fictício a contagem uid≠partes → a conta
//     nunca resolvia. Fix: hint POSICIONAL (_slotUidsPositional) com vazio pro ficto → a conta
//     resolve pelo SEU uid. SEM heal/pattern-match, SEM gravar nome. [[project_uid_identity_canon_locked]]
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// ── _slotUidsPositional: 1 slot por membro, vazio pro fictício ──
const mFictoAcc = { team1Obj: { uid: 'uidCam', p1Uid: '', p1Name: 'Tonho', p2Uid: 'uidCam', p2Name: '' } };
const posFA = W._slotUidsPositional(mFictoAcc, 'p1');
ok(posFA.length === 2 && posFA[0] === '' && posFA[1] === 'uidCam',
  'posicional ficto+conta = ["", "uidCam"] — deu [' + posFA.map(x => '"' + x + '"').join(',') + ']');
const mTwoAcc = { team1Obj: { uid: 'uidA', p1Uid: 'uidA', p1Name: '', p2Uid: 'uidB', p2Name: '' } };
const posTA = W._slotUidsPositional(mTwoAcc, 'p1');
ok(posTA.length === 2 && posTA[0] === 'uidA' && posTA[1] === 'uidB', 'posicional 2 contas = ["uidA","uidB"]');

// ── Bug 1: 2 contas, CACHE FRIO → 2 linhas, nunca 3 ──
W._userProfileCache = {};
W._profileNameByUid = {};
const tTwo = { id: 't2', participants: [{ uid: 'uidA', p1Uid: 'uidA', p1Name: '', p2Uid: 'uidB', p2Name: '', displayName: 'Ana / Bruno' }] };
const sideCold = W._resolveSideLive(tTwo, 'Ana / Bruno', ['uidA', 'uidB']);
const partsCold = sideCold.split(' / ').map(s => s.trim()).filter(Boolean);
ok(partsCold.length === 2, 'cache frio 2 contas: 2 membros, NÃO 3 (sem linha fantasma) — deu ' + partsCold.length + ' ["' + partsCold.join('","') + '"]');

// ── Bug 2: ficto+conta, m.p1 POISONED com rótulo órfão; cache QUENTE → resolve "Camila" ──
W._userProfileCache = { uidCam: { displayName: 'Camila' } };
W._profileNameByUid = {};
const tHeal = { id: 'th', participants: [{ uid: 'uidCam', p1Uid: '', p1Name: 'Tonho', p2Uid: 'uidCam', p2Name: '', displayName: 'Tonho / Camila' }] };
const poisoned = 'Tonho / ' + W._ORPHAN_UID_LABEL + ' (uidC)';
const healedPos = W._resolveSideLive(tHeal, poisoned, ['', 'uidCam']);   // hint POSICIONAL
ok(healedPos === 'Tonho / Camila', 'posicional cura "Camila" pelo uid mesmo com m.p1 poisoned — deu "' + healedPos + '"');

// cache frio (não resolve) → mantém as partes (transitório, sem crash, sem inventar)
W._userProfileCache = {};
const coldFA = W._resolveSideLive(tHeal, poisoned, ['', 'uidCam']);
ok(coldFA.split(' / ').filter(x => x.trim()).length === 2, 'ficto+conta cache frio: 2 membros preservados (transitório)');

// ── uid órfão de verdade (conta some) → mantém rótulo, não inventa ──
W._userProfileCache = {};
const tOrf = { id: 'to', participants: [{ p1Uid: '', p1Name: 'Tonho', p2Uid: 'uidGONE', p2Name: '' }] };
const orf = W._resolveSideLive(tOrf, 'Tonho / ' + W._ORPHAN_UID_LABEL + ' (uidG)', ['', 'uidGONE']);
ok(orf.indexOf(W._ORPHAN_UID_LABEL) !== -1, 'uid órfão de verdade: mantém "Jogador sem perfil" (não inventa)');

// ── Individual (cache frio) ainda resolve pelo pool ──
W._userProfileCache = {};
const tSolo = { id: 'ts', participants: [{ uid: 'uidX', name: 'Xavier', displayName: 'Xavier' }] };
ok(W._resolveSideLive(tSolo, 'Xavier', ['uidX']) === 'Xavier', 'individual: resolve pelo pool via uid');

console.log('\n' + (fail === 0 ? '✅ pair-side-no-third-line: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
