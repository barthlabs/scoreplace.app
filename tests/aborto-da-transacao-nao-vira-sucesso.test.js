/* ABORTO DE TRANSAÇÃO NÃO VIRA SUCESSO
 *
 * Uma proposta de placar é notificada somente depois de `commitTournamentTx`.
 * Se o mutator recusa o estado fresco, o Firestore responde `{aborted:true}`;
 * devolver sucesso nesse caso produzia e-mail/notificação de um placar ausente.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

function method(name, next) {
  const start = src.indexOf('  async ' + name + '(');
  const end = src.indexOf('\n  async ' + next + '(', start);
  if (start < 0 || end < 0) throw new Error('não consegui extrair ' + name);
  return src.slice(start, end).replace(/^  /, '');
}

const sandbox = {
  window: { _error() {}, _captureException() {}, FirestoreDB: null },
  showNotification() {}, setTimeout
};
let store;
try {
  const commit = method('commitTournamentTx', 'mutate');
  store = new Function('window', 'showNotification', 'setTimeout', 'return ({' + commit + '\n});')(
    sandbox.window, sandbox.showNotification, sandbox.setTimeout
  );
} catch (e) {
  console.error('  ✗ extrair commitTournamentTx: ' + e.message);
  process.exit(1);
}

console.log('──── aborto da transação não vira sucesso ────');
let cacheWrites = 0;
store.tournaments = [{ id: 't1' }];
store._saveToCache = () => { cacheWrites++; };

sandbox.window.FirestoreDB = {
  mutateTournament: async (_id, fn) => {
    const fresh = { id: 't1' };
    ok(fn(fresh) === false, 'o mutator ainda pode abortar o estado fresco');
    return { aborted: true, data: fresh };
  }
};

(async () => {
  const aborted = await store.commitTournamentTx('t1', () => false);
  ok(aborted === false, 'aborto do Firestore retorna false ao chamador');
  ok(cacheWrites === 0, 'aborto não carimba cache como sucesso');
  ok(store.tournaments[0].updatedAt == null, 'aborto não altera updatedAt local');

  sandbox.window.FirestoreDB.mutateTournament = async (_id, fn) => {
    const fresh = { id: 't1' }; fn(fresh); return { aborted: false, data: fresh };
  };
  const committed = await store.commitTournamentTx('t1', (fresh) => { fresh.pendingResult = { scoreP1: 1 }; });
  ok(committed === true, 'transação gravada continua retornando true');
  ok(cacheWrites === 1, 'transação gravada atualiza o cache uma vez');

  console.log(fail ? ('❌ ' + fail + ' falha(s)') : ('✅ OK (' + pass + ')'));
  process.exit(fail ? 1 : 0);
})();
