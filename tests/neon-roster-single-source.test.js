// Regressão de produção: 96 Jogador NN em `inscritos` não podem substituir
// as 128 pessoas / 64 duplas confirmadas de `registrations`.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
const db = fs.readFileSync(path.join(root, 'js/firebase-db.js'), 'utf8');
const participants = fs.readFileSync(path.join(root, 'js/views/participants.js'), 'utf8');
const tournaments = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
const ctx = { console, setTimeout, clearTimeout };
ctx.window = ctx;
ctx._tSplit = { partesDe: (t) => t._semPesados || ['participants'] };
ctx._countCompetitors = (t) => ({ people: (t.participants || []).length * 2 });
vm.createContext(ctx);
for (const name of ['_elencoCanonicoAtual', '_marcaPartesQueFaltam']) {
  const start = store.indexOf('window.' + name + ' = function');
  const end = store.indexOf('\n};', start);
  assert(start >= 0 && end > start, name + ' existe');
  vm.runInContext(store.slice(start, end + 3), ctx);
}
const migration = { fingerprint: 'foto-128', registrationCount: 214 };
const fake = { canonicalRegistrationMigration: migration,
  _semPesados: ['participants'], _nPartes: { participants: 96 },
  participants: Array.from({ length: 48 }, (_, i) => ({ p1Name: 'Jogador ' + (2*i+1), p2Name: 'Jogador ' + (2*i+2) })) };
assert.strictEqual(ctx._marcaPartesQueFaltam(fake, true), true,
  'documento migrado sem receipt rejeita espelho, mesmo quando contador coincide');
assert(Array.from(fake._faltaOQue).includes('participants'));
assert.strictEqual(ctx._marcaPartesQueFaltam(fake), true,
  'a tentativa manual também detecta recibo ausente e busca o elenco em vez de parar');
const summary = { _resumo: true, canonicalRegistrationMigration: migration, _semPesados: [], participants: [] };
assert.strictEqual(ctx._marcaPartesQueFaltam(summary, false), false,
  'resumo não fica em carregamento eterno');
const canonical = { canonicalRegistrationMigration: migration,
  _semPesados: ['participants'], _nPartes: { participants: 192 },
  participants: Array.from({ length: 64 }, (_, i) => ({ p1Name: 'Pessoa ' + (2*i+1), p2Name: 'Pessoa ' + (2*i+2) })) };
Object.defineProperty(canonical, '_canonicalRosterReceipt', { value: 'foto-128:214' });
assert.strictEqual(ctx._marcaPartesQueFaltam(canonical, true), false,
  'receipt aceita 64 pares canônicos apesar de contador legado 192');

// Executa o montador REAL com banco simulado: a consulta a inscritos é
// interceptada antes do Firestore; uma falha da callable não vira fallback.
const start = db.indexOf('  async _montaDeSubcolecoes(id, config, quais) {');
const end = db.indexOf('\n  /* ── ENFILEIRA A INTENÇÃO', start);
assert(start >= 0 && end > start);
const method = db.slice(start, end).replace(/,\s*$/, '');
const reader = vm.runInContext('({' + method + '})', ctx);
const calls = [];
ctx._tSplit.montarDoBanco = async (config, read) => {
  const old = await read('inscritos');
  assert.deepStrictEqual(Array.from(old), []);
  return { ...config, participants: old };
};
reader._tSub = (_, col) => { calls.push(col); return { get: async () => ({ size: 0, forEach() {} }) }; };
reader.loadCanonicalTournamentRoster = async () => ({ registrationCount: 214,
  participants: [{ p1Name: 'Andrea', p2Name: 'Juliana', categoryId: 'fem-light' }],
  categoryDefinitions: [{ id: 'fem-light', label: 'Fem Light' }] });
ctx._error = () => {};
(async () => {
  const result = await reader._montaDeSubcolecoes('neon', { ...fake, placeholderReservations: [] }, ['participants']);
  assert.strictEqual(calls.includes('inscritos'), false, 'abertura fria não consulta espelho');
  assert.strictEqual(result.participants[0].p1Name, 'Andrea');
  assert.strictEqual(ctx._elencoCanonicoAtual(result), true);
  reader.loadCanonicalTournamentRoster = async () => { throw Error('offline'); };
  await assert.rejects(reader._montaDeSubcolecoes('neon', { ...fake }, ['participants']), /offline/);
  assert(store.includes("alvos = alvos.filter(function (nome) { return nome !== 'participants'; })"),
    'listener migrado não assina inscritos');
  assert(store.includes("if (_fpAtual !== _subAtual.rosterFingerprint) store.ouvirPartesDoTorneio"),
    'fingerprint novo cancela listener antigo');
  assert(participants.includes('!window._elencoCanonicoAtual(t)'), 'inscritos bloqueia render sem receipt');
  assert(tournaments.includes('!window._elencoCanonicoAtual(_tRoster)'), 'detalhe bloqueia render sem receipt');
  assert(!tournaments.includes('O elenco canônico ainda não foi confirmado.'),
    'a espera não expõe diagnóstico técnico no detalhe');
  assert(!participants.includes('A lista canônica ainda não foi confirmada.'),
    'a espera não expõe diagnóstico técnico em Inscritos');
  console.log('✅ neon-roster-single-source: abertura, espelho, receipt, falha e telas');
})().catch((e) => { console.error(e); process.exitCode = 1; });
