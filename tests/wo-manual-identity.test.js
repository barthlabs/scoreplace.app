'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('js/views/identity-core.js', 'utf8');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'identity-core.js' });
const w = sandbox.window;

const homonyms = { participants: [
  { manualParticipantId: 'manual-ana-1', displayName: 'Ana' },
  { manualParticipantId: 'manual-ana-2', displayName: 'Ana' }
] };
assert.equal(w._isUniqueMemberName(homonyms, 'Ana'), false, 'dois convidados homônimos são ambíguos');
homonyms.absent = {};
w._idMapSet(homonyms, homonyms.absent, { manualParticipantId: 'manual-ana-1', displayName: 'Ana' }, true);
assert.equal(homonyms.absent['manual:manual-ana-1'], true, 'convidado manual grava por id estável com namespace');
assert.equal(w._idMapGet(homonyms, homonyms.absent, { manualParticipantId: 'manual-ana-2', displayName: 'Ana' }), undefined,
  'W.O. de um homônimo manual não afeta o outro');
assert.equal(w._idMapGet(homonyms, { Ana: true }, { manualParticipantId: 'manual-ana-1', displayName: 'Ana' }), undefined,
  'fallback legado por nome é bloqueado quando há homônimos');

const unique = { participants: [{ manualParticipantId: 'manual-bia', displayName: 'Bia' }] };
assert.equal(w._idMapGet(unique, { Bia: true }, { manualParticipantId: 'manual-bia', displayName: 'Bia' }), true,
  'histórico legado só é lido para nome inequivocamente atribuível');
assert.deepEqual(JSON.parse(JSON.stringify(w._idMapKey(unique, { manualParticipantId: 'manual-bia', displayName: 'Bia' }))),
  { uid: '', manualParticipantId: 'manual-bia', name: 'Bia', key: 'manual:manual-bia' },
  '_idMapKey sempre devolve o contrato de quatro campos');

// O registro que chega ao núcleo não pode cair no nome do convidado. Carregamos
// os helpers reais do histórico e exercitamos a mesma chave usada pelo W.O.
const store = fs.readFileSync('js/store.js', 'utf8');
const historyStart = store.indexOf('window._woHistGet = function');
const historyEnd = store.indexOf('// v2.4.72-beta:', historyStart);
assert.ok(historyStart >= 0 && historyEnd > historyStart, 'helpers reais do histórico localizados');
vm.runInContext(store.slice(historyStart, historyEnd), sandbox, { filename: 'store-wo-history.js' });

const woCore = fs.readFileSync('js/views/wo-core.js', 'utf8');
const toggleStart = woCore.indexOf('window._applyAbsenceToggle = function');
const toggleEnd = woCore.indexOf('// ─── MOTOR ÚNICO', toggleStart);
assert.ok(toggleStart >= 0 && toggleEnd > toggleStart, 'núcleo real de ausência localizado');
vm.runInContext(woCore.slice(toggleStart, toggleEnd), sandbox, { filename: 'wo-core-toggle.js' });
unique.absent = {};
w._applyAbsenceToggle(unique, { manualParticipantId: 'manual-bia', displayName: 'Bia' }, true);
w._woHistSet(unique, { manualParticipantId: 'manual-bia', displayName: 'Bia' }, { matchNum: 7 });
assert.ok(unique.absent['manual:manual-bia'], 'W.O. manual grava ausência pela chave estrutural');
assert.equal(unique.woHistory['manual:manual-bia'].matchNum, 7, 'histórico de W.O. manual usa manual:<id>, nunca o nome');
assert.equal(unique.woHistory.Bia, undefined, 'histórico de W.O. manual não cria chave por nome');
assert.equal(w._idMapKey(unique, 'manual-bia').key, 'manual:manual-bia', 'chamador legado com id manual cru preserva identidade estrutural');

const participantView = fs.readFileSync('js/views/participants.js', 'utf8');
assert.ok(participantView.includes("tok.indexOf('m:') === 0") && !participantView.includes("tok.indexOf('n:') === 0"),
  'cliente aceita token manual e não reintroduz token de nome no W.O.');
assert.ok(participantView.includes('return w.uid ? { uid: String(w.uid) } : { manualParticipantId: String(w.manualParticipantId) };'),
  'cliente envia apenas uma identidade estrutural por pessoa');

const callable = fs.readFileSync('functions-autodraw/index.js', 'utf8');
assert.ok(callable.includes('function _normalizeWOIdentity') && callable.includes("Object.prototype.hasOwnProperty.call(raw, 'name')"),
  'callable rejeita nome recebido e normaliza estruturalmente');
assert.ok(callable.includes('manualParticipantId') && callable.includes("'Participante repetido.'"),
  'callable trata convidado manual e duplicata no mesmo pedido');

// Executa o normalizador real do backend — não uma cópia dele no teste. O
// módulo inteiro depende do runtime Firebase, portanto avaliamos apenas as
// duas funções puras extraídas diretamente do arquivo de produção.
const normalizerStart = callable.indexOf('function _woIdentitySlots');
const normalizerEnd = callable.indexOf('// ─── Declarar/reverter ausência de W.O.', normalizerStart);
assert.ok(normalizerStart >= 0 && normalizerEnd > normalizerStart, 'normalizador de W.O. real localizado');
class TestHttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const functionSandbox = { HttpsError: TestHttpsError };
vm.createContext(functionSandbox);
vm.runInContext(callable.slice(normalizerStart, normalizerEnd), functionSandbox, { filename: 'functions-autodraw-wo-normalizer.js' });
const normalize = functionSandbox._normalizeWOIdentity;
const roster = [
  { uid: 'uid-ana', displayName: 'Ana' },
  { manualParticipantId: 'manual-bia', displayName: 'Bia' },
  { p1Uid: 'uid-carol', p1Name: 'Carol', p2ManualId: 'manual-dani', p2Name: 'Dani' }
];
const normalizedUid = normalize({ uid: 'uid-ana' }, {}, roster);
assert.deepEqual(JSON.parse(JSON.stringify(normalizedUid)), { uid: 'uid-ana', displayName: 'Ana' },
  'normalizador real aceita UID pertencente ao elenco fresco');
const normalizedManual = normalize({ manualParticipantId: 'manual-dani' }, {}, roster);
assert.deepEqual(JSON.parse(JSON.stringify(normalizedManual)), { manualParticipantId: 'manual-dani', displayName: 'Dani' },
  'normalizador real aceita convidado manual pertencente à dupla');
assert.throws(() => normalize({ name: 'Ana' }, {}, roster), (err) => err.code === 'invalid-argument',
  'normalizador real rejeita identidade por nome');
assert.throws(() => normalize({ uid: 'uid-ana', manualParticipantId: 'manual-bia' }, {}, roster), (err) => err.code === 'invalid-argument',
  'normalizador real exige uma única identidade estrutural');
assert.throws(() => normalize({ uid: 'uid-ausente' }, {}, roster), (err) => err.code === 'not-found',
  'normalizador real recusa UID fora do elenco fresco');
const seen = {};
normalize({ manualParticipantId: 'manual-bia' }, seen, roster);
assert.throws(() => normalize({ manualParticipantId: 'manual-bia' }, seen, roster), (err) => err.code === 'invalid-argument',
  'normalizador real recusa participante repetido no mesmo pedido');
assert.throws(() => normalize({ manualParticipantId: 'manual-repetido' }, {}, [
  { manualParticipantId: 'manual-repetido', displayName: 'Um' },
  { manualParticipantId: 'manual-repetido', displayName: 'Dois' }
]), (err) => err.code === 'failed-precondition',
  'normalizador real bloqueia identificador duplicado na inscrição');
console.log('wo-manual-identity: OK');
