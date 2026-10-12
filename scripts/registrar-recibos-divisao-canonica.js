#!/usr/bin/env node
'use strict';
/*
 * Registra recibos para torneios históricos que já estão canônicos, mas não
 * possuem backup pré-divisão. Um recibo NÃO é backup e NÃO reconstitui o
 * passado: ele só declara, com data e evidência, que as partes atuais foram
 * remontadas e invertidas sem perda.
 *
 * Uso:
 *   node scripts/registrar-recibos-divisao-canonica.js
 *   node scripts/registrar-recibos-divisao-canonica.js --apply
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const Split = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
const APPLY = process.argv.includes('--apply');
const CONCURRENCY = 8;

if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function partesDe(config) {
  const nomes = Split.partesDe(config).slice();
  const legado = Array.isArray(config && config._semPesados) ? config._semPesados : [];
  if (legado.includes('grupos') && !nomes.includes('grupos')) nomes.push('grupos');
  return nomes;
}
function conta(nome, registros) {
  return (registros || []).filter((registro) => {
    if (!registro) return false;
    if (nome === 'matches') return registro.jogo != null;
    if (nome === 'grupos') return registro.grupo != null;
    return registro.item != null;
  }).length;
}

async function verificar(ref, config) {
  const nomes = partesDe(config);
  const partes = Object.fromEntries(await Promise.all(nomes.map(async (nome) => {
    const snap = await ref.collection(Split.colecaoDaParte(nome)).get();
    return [nome, snap.docs.map((doc) => doc.data())];
  })));
  const montado = await Split.montarDoBanco(clone(config), async (colecao) => {
    const nome = nomes.find((item) => Split.colecaoDaParte(item) === colecao);
    return nome ? partes[nome] : [];
  });
  const volta = Split.dividir(clone(montado), nomes);
  if (!Split.iguais(volta.config, config)) throw new Error('a inversão montagem→divisão alterou o documento-base');
  nomes.forEach((nome) => {
    const lidos = (partes[nome] || []).length;
    const aproveitados = conta(nome, volta[nome] || []);
    if (lidos !== aproveitados) throw new Error(nome + ': li ' + lidos + ', aproveitei ' + aproveitados);
  });
  if (Number.isFinite(config._nJogos) && config._nJogos !== (partes.matches || []).length) {
    throw new Error('matches: _nJogos=' + config._nJogos + ', subcoleção=' + (partes.matches || []).length);
  }
  return {
    schema: 1,
    kind: 'verified-canonical-v1',
    tournamentId: ref.id,
    partNames: nomes,
    counts: Object.fromEntries(nomes.map((nome) => [nome, (partes[nome] || []).length])),
  };
}

async function emLotes(items, limit, operation) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await operation(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

(async () => {
  const tournaments = await db.collection('tournaments').get();
  const inspected = await emLotes(tournaments.docs, CONCURRENCY, async (doc) => {
    const config = doc.data() || {};
    const [backup, receipt] = await Promise.all([
      db.collection('tournaments_backup').doc(doc.id).get(),
      db.collection('tournamentSplitReceipts').doc(doc.id).get(),
    ]);
    if (backup.exists || (config.splitProvenance && config.splitProvenance.kind === 'born-canonical') || receipt.exists) return null;
    try {
      return { id: doc.id, name: config.name || doc.id, proof: await verificar(doc.ref, config) };
    } catch (error) {
      return { id: doc.id, name: config.name || doc.id, error: error && error.message ? error.message : String(error) };
    }
  });
  const candidates = inspected.filter((item) => item && item.proof);
  const rejected = inspected.filter((item) => item && item.error);
  console.log('▶ recibos de divisão: ' + candidates.length + ' verificáveis · ' + rejected.length +
    ' bloqueados · concorrência ' + Math.min(CONCURRENCY, tournaments.docs.length));
  candidates.forEach((item) => console.log('  ✓ ' + item.name + ' [' + item.id + ']'));
  rejected.forEach((item) => console.log('  ⛔ ' + item.name + ': ' + item.error + ' [' + item.id + ']'));
  if (!APPLY) {
    console.log('DRY-RUN: nenhuma escrita. Use --apply somente para os verificáveis acima.');
    process.exitCode = rejected.length ? 1 : 0;
    return;
  }
  if (rejected.length) throw new Error('há torneios sem prova; nenhum recibo foi gravado');
  for (let start = 0; start < candidates.length; start += 400) {
    const batch = db.batch();
    candidates.slice(start, start + 400).forEach((item) => {
      batch.create(db.collection('tournamentSplitReceipts').doc(item.id), Object.assign({}, item.proof, {
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'registrar-recibos-divisao-canonica',
      }));
    });
    await batch.commit();
  }
  console.log('✓ ' + candidates.length + ' recibo(s) canônico(s) gravado(s); nenhum backup foi fabricado.');
})().catch((error) => { console.error('✗ recibos abortados:', error && error.message ? error.message : error); process.exitCode = 1; });
