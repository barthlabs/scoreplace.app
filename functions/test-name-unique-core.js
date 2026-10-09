'use strict';

/* Regressão da reserva canônica de nomes.
 * Rodar: node functions/test-name-unique-core.js */
const fs = require('fs');
const path = require('path');
const C = require('./name-unique-core.js');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else { fail++; console.error('✗ ' + message); }
}

function fakeStore() {
  const docs = {};
  const db = { collection(collection) { return { doc(id) { return { collection, id }; } }; } };
  const tx = {
    async get(ref) {
      const data = docs[ref.collection + '/' + ref.id];
      return { exists: !!data, data: () => data || {} };
    },
    set(ref, value) { docs[ref.collection + '/' + ref.id] = Object.assign({}, docs[ref.collection + '/' + ref.id], value); },
    delete(ref) { delete docs[ref.collection + '/' + ref.id]; },
  };
  return { docs, db, tx };
}

(async () => {
  const { docs, db, tx } = fakeStore();
  const first = await C.reserveDisplayName(tx, db, 'uid-a', '  Ana   Silva ', '');
  ok(first.ok, 'primeiro UID reserva o nome normalizado');
  const second = await C.reserveDisplayName(tx, db, 'uid-b', 'ana silva', '');
  ok(second.ok === false && second.code === 'taken', 'segundo UID não toma o mesmo nome');
  const rename = await C.reserveDisplayName(tx, db, 'uid-a', 'Ana S. Silva', 'Ana Silva');
  ok(rename.ok, 'mesmo UID troca de nome em uma transação');
  ok(!docs[C.DISPLAY_NAME_CLAIMS + '/' + C.displayNameClaimId('Ana Silva')], 'troca libera o nome anterior');

  const conflictKey = C.DISPLAY_NAME_CLAIMS + '/' + C.displayNameClaimId('Nome Legado');
  docs[conflictKey] = { state: 'conflict', uids: ['uid-a', 'uid-b'] };
  const blocked = await C.reserveDisplayName(tx, db, 'uid-a', 'Nome Legado', '');
  ok(blocked.ok === false, 'colisão legada fica bloqueada até revisão');
  const leaveConflict = await C.reserveDisplayName(tx, db, 'uid-a', 'Ana Nova', 'Nome Legado');
  ok(leaveConflict.ok && docs[conflictKey].state === 'active' && docs[conflictKey].uid === 'uid-b',
    'renomear um participante de colisão deixa a reserva com o UID restante');

  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const init = src.slice(src.indexOf('exports.initializeUserProfile'), src.indexOf('exports.updateOwnProfile'));
  const update = src.slice(src.indexOf('exports.updateOwnProfile'), src.indexOf('exports.updateOwnInterfacePreferences'));
  ok(/reserveDisplayName/.test(init) && /already-exists/.test(init), 'criação reserva o nome no servidor');
  ok(/reserveDisplayName/.test(update) && /already-exists/.test(update), 'renomeação reserva o nome no servidor');
  ok(!/findDisplayNameConflict|buildConflictMessage|resolveUniqueName/.test(fs.readFileSync(path.join(__dirname, 'name-unique-core.js'), 'utf8')),
    'core não contém caminhos legados de conflito, mensagem ou auto-sufixo');
  const phoneRegistration = src.slice(src.indexOf('exports.registerPhonePassword'), src.indexOf('exports.phonePasswordLogin'));
  ok(/db\.runTransaction/.test(phoneRegistration) && /reserveDisplayName/.test(phoneRegistration) &&
    !/collection\("users"\)\.doc\(uid\)\.set\(prof/.test(phoneRegistration),
  'cadastro por celular usa a mesma reserva transacional e não escreve perfil por fora');

  console.log(fail ? '❌ name-unique-core: ' + pass + ' ok, ' + fail + ' falhas' : '✅ name-unique-core: ' + pass + ' ok, 0 falhas');
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
