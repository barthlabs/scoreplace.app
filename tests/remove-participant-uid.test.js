// BUG DO DONO (22/jul): "consegui desfazer a dupla deles, mas o botão excluir (individual) não
// faz nada." Dirige a AÇÃO REAL do card de inscrito — window.removeParticipantFunction — sobre um
// roster SÓ-UID (como o Firestore guarda de verdade: sem displayName/p1Name; o nome vem do perfil
// vivo). Prova os 3 casos: solo, membro de DUPLA (o parceiro tem que sobrar sozinho) e fictício.
// [[project_uid_identity_canon_locked]]
const { window: W } = require('./render-harness');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// perfis vivos (o que o app tem em cache; o doc NÃO guarda nome de quem tem conta)
W._profileNameByUid = { uMarcello: 'Marcello Martins de Souza', uKarla: 'Karla Fernandes', uSolo: 'Nei Almeida' };
W._nameForUid = function (u) { return W._profileNameByUid[u] || ''; };

// confirma automaticamente (o clique real abre showConfirmDialog)
W.showConfirmDialog = function (title, msg, onYes) { if (typeof onYes === 'function') onYes(); };
W.showNotification = function () {};
let saved = 0;
W.FirestoreDB = {
  saveTournament: function () {
    saved++;
    return { then: function (f) { if (f) f(); return { catch: function () { return null; } }; } };
  },
};

function mkT() {
  return {
    id: 'RMV', name: 'Casais', enrollmentMode: 'teams', teamSize: 2, creatorUid: 'uOrg',
    participants: [
      { uid: 'uMarcello', p1Uid: 'uMarcello', p2Uid: 'uKarla', p1Seq: 1, p2Seq: 2, ligaActive: true },
      { uid: 'uSolo', enrollSeq: 3 },
      'Convidado sem conta',
    ],
    checkedIn: {}, absent: {}, vips: {}, waitlist: [], standbyParticipants: [], matches: [],
  };
}
const uidsOf = (t) => t.participants.map((p) => (typeof p === 'string' ? p : (p.p1Uid ? p.p1Uid + '+' + p.p2Uid : p.uid)));

console.log('\n── excluir inscrito num roster SÓ-UID (o clique real do ✕) ──');

// 1) SOLO com conta — o card da tela de DUPLAS manda `p.displayName || p.name`, que num roster
// só-uid é STRING VAZIA (foi exatamente isto que o dono viu: ✕ sem reação nenhuma).
{
  const t = mkT(); W.AppStore = { tournaments: [t], currentUser: { uid: 'uOrg' }, isCreator: () => true, sync: () => {} };
  W.removeParticipantFunction(t.id, '', 'uSolo');
  ok(uidsOf(t).indexOf('uSolo') === -1, 'solo :: saiu do roster');
  ok(t.participants.length === 2, 'solo :: sobraram 2 entradas — got ' + t.participants.length);
  ok(saved > 0, 'solo :: persistiu');
}

// 2) MEMBRO DE DUPLA — excluir 1 pessoa não pode levar o parceiro junto nem virar no-op.
{
  const t = mkT(); W.AppStore = { tournaments: [t], currentUser: { uid: 'uOrg' }, isCreator: () => true, sync: () => {} };
  W.removeParticipantFunction(t.id, 'Karla Fernandes', 'uKarla');
  const flat = uidsOf(t);
  ok(flat.indexOf('uMarcello+uKarla') === -1, 'dupla :: a dupla deixou de existir');
  ok(t.participants.some((p) => p && p.uid === 'uMarcello' && !p.p2Uid), 'dupla :: parceiro sobrou SOZINHO no roster');
  ok(!t.participants.some((p) => p && typeof p === 'object' && (p.uid === 'uKarla' || p.p1Uid === 'uKarla' || p.p2Uid === 'uKarla')), 'dupla :: o excluído sumiu de vez');
  ok(t.participants.length === 3, 'dupla :: 3 entradas (parceiro + solo + fictício) — got ' + t.participants.length);
}

// 3) FICTÍCIO (sem conta) — identidade continua sendo o nome.
{
  const t = mkT(); W.AppStore = { tournaments: [t], currentUser: { uid: 'uOrg' }, isCreator: () => true, sync: () => {} };
  W.removeParticipantFunction(t.id, 'Convidado sem conta');
  ok(t.participants.indexOf('Convidado sem conta') === -1, 'fictício :: saiu do roster');
}

// 4) presença/W.O./VIP do excluído não podem ficar penduradas
{
  const t = mkT(); t.checkedIn = { uKarla: true, uSolo: true }; t.absent = { uKarla: true }; t.vips = { uKarla: true };
  W.AppStore = { tournaments: [t], currentUser: { uid: 'uOrg' }, isCreator: () => true, sync: () => {} };
  W.removeParticipantFunction(t.id, 'Karla Fernandes', 'uKarla');
  ok(!t.checkedIn.uKarla && !t.absent.uKarla && !t.vips.uKarla, 'limpa presença/ausência/VIP do excluído');
  ok(t.checkedIn.uSolo === true, 'não mexe na presença de quem ficou');
}

console.log(fail === 0 ? `✅ remove-participant-uid: OK  (${pass} asserts ok)` : `❌ ${fail} FALHA(S)  (${pass} ok)`);
if (fail) { console.log('\nFALHAS:'); fails.forEach((f) => console.log('  ✗ ' + f)); }
process.exit(fail === 0 ? 0 : 1);
