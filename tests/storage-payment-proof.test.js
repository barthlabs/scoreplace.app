'use strict';

// Exercita a regra real do Storage com o Firestore do emulador: o comprovante
// precisa ser legível pela organização, mas não pode virar arquivo público.
const fs = require('fs');
const os = require('os');
const path = require('path');

async function verify() {
  const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
  const { doc, setDoc } = require('firebase/firestore');
  const [fsHost, fsPort] = String(process.env.FIRESTORE_EMULATOR_HOST).split(':');
  const [stHost, stPort] = String(process.env.FIREBASE_STORAGE_EMULATOR_HOST).split(':');
  const projectId = 'demo-scoreplace';
  const env = await initializeTestEnvironment({ projectId,
    firestore:{ rules:fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host:fsHost, port:Number(fsPort) },
    storage:{ rules:fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8'),
      host:stHost, port:Number(stPort) }
  });
  const tournamentId = 'tour_1790000000000_0123456789abcdef0123456789abcdef';
  const owner = 'owner', athlete = 'athlete', outsider = 'outsider', cohost = 'cohost';
  const proofPath = `tournamentPaymentProofs/${tournamentId}/${athlete}/0123456789abcdef`;
  const activeImagePath = `tournamentPaymentProofs/${tournamentId}/${athlete}/abcdef0123456789`;
  const bucket = 'gs://demo-scoreplace.firebasestorage.app';
  const object = uid => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext())
    .storage(bucket).ref(proofPath);
  try {
    await env.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'tournaments', tournamentId), {
        creatorUid:owner, adminUids:[owner, cohost], memberUids:[owner, cohost, athlete]
      });
    });
    await assertFails(object(outsider).put(Buffer.from('fake'), { contentType:'image/png' }));
    await assertFails(env.authenticatedContext(athlete).storage(bucket).ref(activeImagePath)
      .put(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), { contentType:'image/svg+xml' }));
    await assertSucceeds(object(athlete).put(Buffer.from('receipt'), { contentType:'image/png' }));
    await assertFails(object(athlete).put(Buffer.from('replace'), { contentType:'image/png' }));
    await assertSucceeds(object(athlete).getMetadata());
    await assertSucceeds(object(owner).getMetadata());
    await assertSucceeds(object(cohost).getMetadata());
    await assertFails(object(outsider).getMetadata());
    await assertFails(object(null).getMetadata());
    console.log('✓ Storage: envio próprio, leitura privada e imutabilidade do comprovante');
  } finally { await env.cleanup(); }
}

if (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  verify().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { rodarNoEmulador } = require('./emulador');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-payment-storage-'));
  const config = path.join(directory, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({
    firestore:{ rules:path.join(__dirname, '..', 'firestore.rules') },
    storage:{ rules:path.join(__dirname, '..', 'storage.rules') },
    emulators:{ firestore:{ port:8130 }, storage:{ port:9198 }, ui:{ enabled:false }, singleProjectMode:true }
  }));
  try {
    const output = rodarNoEmulador(['emulators:exec', '--only', 'firestore,storage',
      '--config', config, '--project', 'demo-scoreplace',
      'node ' + JSON.stringify(__filename)], {
      cwd:path.join(__dirname, '..'), encoding:'utf8', stdio:['ignore', 'pipe', 'pipe'],
      env:{ ...process.env, PATH:'/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }
    });
    if (!output.includes('✓ Storage: envio próprio')) throw new Error('Emulador não confirmou a verificação.');
    console.log('✓ Storage: envio próprio, leitura privada e imutabilidade do comprovante');
  } finally { fs.rmSync(directory, { recursive:true, force:true }); }
}
