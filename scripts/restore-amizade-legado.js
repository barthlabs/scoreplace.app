#!/usr/bin/env node
/* restore-amizade-legado.js — devolve o estado social exatamente como o backup fotografou.
 *
 *   node scripts/restore-amizade-legado.js <arquivo.json>              # DRY-RUN
 *   node scripts/restore-amizade-legado.js <arquivo.json> --aplicar
 *
 * ⛔ RESTAURA O VALOR EXATO, e isso inclui APAGAR: campo que no backup está `null` (não
 * existia) é REMOVIDO do documento, não deixado como estava nem escrito como `[]`. Sem
 * isso o "restore" deixaria resíduo do backfill e o rollback seria uma meia-verdade —
 * exatamente o defeito que o backup veio consertar.
 *
 * ⛔ E ele desfaz o backfill: `friendships`/`friendAccess` que existem HOJE mas não estavam
 * no backup são APAGADOS. Rollback que deixa o cânone novo de pé não é rollback.
 *
 * Confere projeto, hash do backup e, no fim, relê o banco e compara.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const ARQ = process.argv.find((a) => a.endsWith('.json'));
const APLICAR = process.argv.includes('--aplicar');
if (!ARQ) { console.error('uso: node scripts/restore-amizade-legado.js <arquivo.json> [--aplicar]'); process.exit(2); }

const PROJETO = process.env.SP_PROJECT || 'scoreplace-app';
require('./preflight-alvo').preflight('restore-amizade-legado', PROJETO);
if (!admin.apps.length) admin.initializeApp({ projectId: PROJETO });
const db = admin.firestore();
const { FieldValue } = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin', 'lib', 'firestore'));

const CAMPOS = ['friends', 'friendRequestsSent', 'friendRequestsReceived', 'friendRequestsSentAt'];
const morra = (m) => { console.error('\n⛔ ABORTA: ' + m); process.exit(1); };
function ordenar(o) {
  if (Array.isArray(o)) return o.map(ordenar);
  if (o && typeof o === 'object') { const out = {}; Object.keys(o).sort().forEach((k) => { out[k] = ordenar(o[k]); }); return out; }
  return o;
}
const hashDe = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');

(async () => {
  const doc = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
  if (!doc._meta || doc._meta.formato !== 'amizade-legado/1') morra('arquivo não é um backup de amizade legado.');
  if (doc._meta.projeto !== PROJETO) {
    morra('backup é do projeto "' + doc._meta.projeto + '" e o alvo é "' + PROJETO + '". Restaurar entre projetos é acidente, não operação.');
  }
  const conferido = hashDe(ordenar(doc.dados));
  if (conferido !== doc._meta.hash) morra('hash do backup não confere — arquivo alterado ou corrompido.');
  console.log(APLICAR ? '⚠️  MODO APLICAR\n' : '🔍 DRY-RUN — não escreve nada\n');
  console.log('backup de ' + doc._meta.geradoEm + ' · ' + doc._meta.perfis + ' perfis · hash ok');

  const perfis = doc.dados.perfis || {};
  const relBackup = doc.dados.relacoes || {};
  // ponto 12: agora é mapa caminho → CONTEÚDO, não lista de caminhos
  const accBackup = doc.dados.acessos || {};
  const accChaves = new Set(Object.keys(accBackup));
  const marcadorBackup = doc.dados.marcador || null;

  // ── o que muda nos perfis ────────────────────────────────────────────────
  const snap = await db.collection('users').get();
  const planoPerfis = [];
  snap.forEach((d) => {
    const x = d.data() || {};
    const alvo = perfis[d.id];
    if (!alvo) return;                       // perfil criado DEPOIS do backup: não é nosso
    const upd = {}; let muda = false;
    CAMPOS.forEach((c) => {
      const tem = Object.prototype.hasOwnProperty.call(x, c);
      if (alvo[c] === null) {
        if (tem) { upd[c] = '<<DELETE>>'; muda = true; }     // não existia → some
      } else if (JSON.stringify(x[c]) !== JSON.stringify(alvo[c])) {
        upd[c] = alvo[c]; muda = true;
      }
    });
    if (muda) planoPerfis.push({ uid: d.id, upd });
  });

  // ── o que muda no cânone (desfaz o backfill) ────────────────────────────
  const relHoje = new Map();
  (await db.collection('friendships').get()).forEach((d) => relHoje.set(d.id, d.data() || {}));
  const relApagar = [...relHoje.keys()].filter((id) => !relBackup[id]);
  const relRepor = Object.keys(relBackup).filter((id) => JSON.stringify(relHoje.get(id)) !== JSON.stringify(relBackup[id]));

  const accHoje = []; const accHojeDados = [];
  (await db.collectionGroup('accepted').get()).forEach((d) => {
    const pai = d.ref.parent.parent;
    if (pai && pai.parent && pai.parent.id === 'friendAccess') {
      accHoje.push(pai.id + '/' + d.id); accHojeDados.push([pai.id + '/' + d.id, d.data() || {}]);
    }
  });
  const accApagar = accHoje.filter((k) => !accChaves.has(k));
  // repõe o que falta E o que existe com conteúdo diferente (restore EXATO)
  const accHojeMapa = new Map(accHojeDados);
  const accRepor = [...accChaves].filter((k) =>
    !accHojeMapa.has(k) || JSON.stringify(accHojeMapa.get(k)) !== JSON.stringify(accBackup[k]));

  console.log('\n── PLANO ──');
  console.log('perfis a corrigir:        ' + planoPerfis.length);
  console.log('marcador da migração:     ' + (marcadorBackup ? ((marcadorBackup.fase || '?') + (marcadorBackup._ausente ? ' (ausente na foto)' : '')) : '(não fotografado)'));
  console.log('  campos a APAGAR:        ' + planoPerfis.reduce((n, p) => n + Object.values(p.upd).filter((v) => v === '<<DELETE>>').length, 0));
  console.log('friendships a apagar:     ' + relApagar.length + ' · a repor: ' + relRepor.length);
  console.log('friendAccess a apagar:    ' + accApagar.length + ' · a repor: ' + accRepor.length);

  if (!APLICAR) { console.log('\n🔍 DRY-RUN — nada escrito.'); return; }

  let b = db.batch(), n = 0;
  const flush = async () => { if (n) { await b.commit(); b = db.batch(); n = 0; } };
  const put = async (fn) => { fn(); if (++n >= 400) await flush(); };

  for (const p of planoPerfis) {
    const upd = {};
    Object.keys(p.upd).forEach((c) => { upd[c] = (p.upd[c] === '<<DELETE>>') ? FieldValue.delete() : p.upd[c]; });
    await put(() => b.update(db.collection('users').doc(p.uid), upd));
  }
  for (const id of relApagar) await put(() => b.delete(db.collection('friendships').doc(id)));
  for (const id of relRepor) await put(() => b.set(db.collection('friendships').doc(id), relBackup[id]));
  const refAcc = (k) => { const [u, f] = k.split('/'); return db.collection('friendAccess').doc(u).collection('accepted').doc(f); };
  for (const k of accApagar) await put(() => b.delete(refAcc(k)));
  // ⛔ conteúdo EXATO da foto — não `{ since: 'restore' }`, que apagaria since/ownerUid/friendUid
  for (const k of accRepor) await put(() => b.set(refAcc(k), accBackup[k]));
  // ponto 7: o marcador da migração volta junto — dados de antes com marcador de depois
  // é estado impossível, e é o marcador que decide se o backfill pode rodar.
  if (marcadorBackup) {
    if (marcadorBackup._ausente) await put(() => b.delete(db.doc('_meta/amizadeMigration')));
    else await put(() => b.set(db.doc('_meta/amizadeMigration'), marcadorBackup));
  }
  await flush();
  console.log('escrito.');

  // ── CONFERÊNCIA: relê e compara ─────────────────────────────────────────
  console.log('\n── CONFERÊNCIA (relendo o banco) ──');
  const problemas = [];
  const snap2 = await db.collection('users').get();
  snap2.forEach((d) => {
    const alvo = perfis[d.id]; if (!alvo) return;
    const x = d.data() || {};
    CAMPOS.forEach((c) => {
      const tem = Object.prototype.hasOwnProperty.call(x, c);
      if (alvo[c] === null) { if (tem) problemas.push('campo deveria estar AUSENTE: ' + d.id + '.' + c); }
      else if (JSON.stringify(x[c]) !== JSON.stringify(alvo[c])) problemas.push('valor divergente: ' + d.id + '.' + c);
    });
  });
  const rel2 = new Map();
  (await db.collection('friendships').get()).forEach((d) => rel2.set(d.id, d.data() || {}));
  if (rel2.size !== Object.keys(relBackup).length) problemas.push('friendships ' + rel2.size + ' ≠ ' + Object.keys(relBackup).length);
  const acc2 = [];
  (await db.collectionGroup('accepted').get()).forEach((d) => {
    const pai = d.ref.parent.parent;
    if (pai && pai.parent && pai.parent.id === 'friendAccess') acc2.push(pai.id + '/' + d.id);
  });
  if (acc2.length !== accChaves.size) problemas.push('friendAccess ' + acc2.length + ' ≠ ' + accChaves.size);
  // ponto 12: confere CONTEÚDO, não só quantidade
  for (const k of accChaves) {
    const [u, f] = k.split('/');
    const d = await db.collection('friendAccess').doc(u).collection('accepted').doc(f).get();
    if (!d.exists) { problemas.push('projeção ausente: ' + k); continue; }
    if (JSON.stringify(d.data() || {}) !== JSON.stringify(accBackup[k])) {
      problemas.push('conteúdo divergente na projeção ' + k);
    }
  }
  // ponto 7: e o marcador
  if (marcadorBackup) {
    const m2 = await db.doc('_meta/amizadeMigration').get();
    const atual = m2.exists ? (m2.data() || {}) : null;
    if (marcadorBackup._ausente) { if (atual) problemas.push('marcador deveria estar AUSENTE'); }
    else if (!atual || atual.fase !== marcadorBackup.fase) {
      problemas.push('marcador: banco="' + (atual && atual.fase) + '" backup="' + marcadorBackup.fase + '"');
    }
  }

  if (problemas.length) { problemas.slice(0, 20).forEach((p) => console.error('   ✗ ' + p)); morra(problemas.length + ' divergência(s) após o restore.'); }
  console.log('✅ restore aplicado e CONFERIDO: perfis, friendships e friendAccess batem com o backup.');
})().catch((e) => { console.error('ERRO:', e); process.exit(1); });
