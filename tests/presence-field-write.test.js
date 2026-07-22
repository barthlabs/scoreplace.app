// REPRODUZ o bug do dono (jul/2026): "continua pulnado de 25 baixa a 18".
//
// MEDIDO no Firestore REAL (doc temporário, apagado depois), 25 marcações em rajada:
//   • transação com doc INTEIRO, serializada .............. 25/25 OK
//   • transação com doc INTEIRO, concorrente .............. 23/25  ← PERDE marcações
//   • transação com doc INTEIRO + CF gravando junto ....... 23/25  ← PERDE marcações
//   • update POR CAMPO, concorrente ....................... 25/25 OK
//   • update POR CAMPO + CF gravando junto ................ 25/25 OK
//
// CAUSA-RAIZ: marcar UMA presença reescrevia o TORNEIO INTEIRO dentro de uma transação. Sob
// contenção algumas esgotam os retries e falham; a marcação otimista fica na tela até um snapshot
// reverter — é o "pula e desmarca". Escrita por CAMPO não colide: o Firestore funde no nível do
// campo, então N marcações simultâneas de pessoas DIFERENTES nunca disputam entre si.
//
// REGRA TRAVADA: presença grava POR CAMPO (`checkedIn.<chave>`), nunca reescrevendo o documento.
// Só cai na transação de doc inteiro quando há AUSENTES — aí a substituição de W.O. precisa mexer
// na chave e o doc completo é necessário. [[project_concurrency_safe_saves]]
const H = require('./render-harness');
const W = H.sandbox;
require('./headless').load('participants.js');   // _applyCheckInToggle

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const UID = 'u1', NOME = 'Fulano';
function mkT(present, comAusente) {
  const t = {
    id: 'FLD', format: 'Eliminatórias Simples', teamSize: 2,
    participants: [{ uid: UID, displayName: NOME, name: NOME }, { uid: 'u9', displayName: 'Outro', name: 'Outro' }],
    checkedIn: {}, absent: {}, checkedInConfirmed: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: []
  };
  if (present) t.checkedIn[UID] = 1;
  if (comAusente) t.absent['u9'] = 1;
  return t;
}
const isPresent = (t) => W._idMapHas(t, t.checkedIn || {}, { uid: UID, displayName: NOME });

// executa o toggle com FirestoreDB.setPresenceFields disponível; devolve o que cada via recebeu
function run(t) {
  const campo = [];       // chamadas por campo
  let docInteiro = 0;     // transações que reescrevem o doc
  W.AppStore.tournaments = [t];
  W.AppStore.mutate = function (tid, fn) { docInteiro++; try { fn(t); } catch (e) {} return Promise.resolve(); };
  W.FirestoreDB = W.FirestoreDB || {};
  W.FirestoreDB.setPresenceFields = function (tid, sets, dels) { campo.push({ tid, sets, dels }); return Promise.resolve(true); };
  W._presenceBusyUntil = function () {};
  W._updateCardPresenceInPlace = function () { return true; };
  W._stampPresenceIntent = function () {};
  W._participantsViewSig = null; W._tournamentDetailSig = null;
  W._applyCheckInToggle('FLD', NOME, UID);
  return { campo, docInteiro };
}

console.log('── presença grava POR CAMPO (não reescreve o torneio inteiro) ──');

// (1) marcar presente: um update por campo, ZERO reescrita de doc
(function () {
  const t = mkT(false, false);
  const r = run(t);
  ok(r.campo.length === 1, 'marcar presente ⇒ 1 escrita POR CAMPO');
  ok(r.docInteiro === 0, 'marcar presente ⇒ NENHUMA reescrita do doc inteiro (era o que perdia marcação)');
  ok(isPresent(t) === true, 'estado local fica PRESENTE na hora (otimista)');
  const c = r.campo[0] || { sets: [], dels: [] };
  ok(c.sets.some(s => s.map === 'checkedIn' && s.key === UID), 'grava checkedIn.<uid>');
  ok(c.dels.some(d => d.map === 'absent' && d.key === UID), 'apaga absent.<uid> no mesmo update');
  ok(c.dels.some(d => d.map === 'checkedInConfirmed' && d.key === UID), 'apaga checkedInConfirmed.<uid> no mesmo update');
  // nada fora dos 3 mapas de presença pode ser tocado
  const mapas = c.sets.concat(c.dels).map(x => x.map);
  ok(mapas.every(m => m === 'checkedIn' || m === 'absent' || m === 'checkedInConfirmed'),
    'toca SÓ os mapas de presença — nenhum outro campo do torneio entra na escrita');
})();

// (2) desmarcar: apaga por campo, sem reescrever o doc
(function () {
  const t = mkT(true, false);
  const r = run(t);
  ok(r.campo.length === 1 && r.docInteiro === 0, 'desmarcar ⇒ 1 escrita POR CAMPO, 0 doc inteiro');
  ok((r.campo[0]||{dels:[],sets:[]}).dels.some(d => d.map === 'checkedIn' && d.key === UID), 'desmarcar apaga checkedIn.<uid>');
  ok((r.campo[0]||{sets:[1]}).sets.length === 0, 'desmarcar não grava nada, só apaga');
  ok(isPresent(t) === false, 'estado local fica DESMARCADO na hora');
})();

// (3) com AUSENTES volta pra transação de doc inteiro (W.O. precisa da chave)
(function () {
  const t = mkT(false, true);
  const r = run(t);
  ok(r.campo.length === 0, 'com ausentes NÃO usa a via por campo');
  ok(r.docInteiro === 1, 'com ausentes usa a transação de doc inteiro (substituição de W.O. precisa)');
})();

// (4) marcações de pessoas DIFERENTES não disputam o mesmo campo — é isso que mata a perda
(function () {
  const t = mkT(false, false);
  const r1 = run(t);
  const chaveA = r1.campo[0] && r1.campo[0].sets[0] && r1.campo[0].sets[0].key;
  const t2 = mkT(false, false);
  W.AppStore.tournaments = [t2];
  W.FirestoreDB.setPresenceFields = function (tid, sets) { t2._ultima = sets[0].key; return Promise.resolve(true); };
  W._applyCheckInToggle('FLD', 'Outro', 'u9');
  ok(chaveA !== t2._ultima, 'pessoas diferentes escrevem em CAMPOS diferentes (sem colisão em rajada)');
})();

// (5) sem a primitiva disponível, cai na transação — nenhuma regressão em ambiente antigo
(function () {
  const t = mkT(false, false);
  let docInteiro = 0;
  W.AppStore.tournaments = [t];
  W.AppStore.mutate = function (tid, fn) { docInteiro++; try { fn(t); } catch (e) {} return Promise.resolve(); };
  W.FirestoreDB.setPresenceFields = undefined;
  W._applyCheckInToggle('FLD', NOME, UID);
  ok(docInteiro === 1, 'sem setPresenceFields cai na transação de doc inteiro (fallback preservado)');
  ok(isPresent(t) === true, 'fallback continua marcando presente');
})();

console.log('\n' + (fail === 0 ? '✅ presence-field-write: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
