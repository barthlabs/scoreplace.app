#!/usr/bin/env node
'use strict';
/* Recalcula SOMENTE `jogo._gameNum` a partir da regra canônica do cliente.
 *
 * Ordem: categoria (baixa → alta) → fase → rodada → linha (Ouro, Prata, …)
 * → posição numérica P1, P2, … . O sufixo P<n> não pode ser ordenado como texto.
 *
 * Uso:
 *   node scripts/renumerar-jogos-canonicos.js --tournament <id>          # ensaio
 *   node scripts/renumerar-jogos-canonicos.js --tournament <id> --apply  # grava
 *
 * Segurança: atualiza apenas `jogo._gameNum`, em um lote atômico de no máximo
 * 500 documentos, e relê tudo ao final. Placares, participantes, W.O. e datas
 * não fazem parte da escrita.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
const Split = require(path.join(ROOT, 'functions', 'vendor', 'tournament-split-core.js'));
const argv = process.argv.slice(2);
const at = argv.indexOf('--tournament');
const TID = at >= 0 ? argv[at + 1] : null;
const APPLY = argv.includes('--apply');
const die = (message) => { throw new Error('ABORTADO: ' + message); };
if (!TID) die('uso: --tournament <id> [--apply]');
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();

function loadCanonicalNumberer() {
  const window = {
    _isByeMatch: (m) => !!(m && (m.isBye || m.isSitOut || m.bye))
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-model.js'), 'utf8'), { window, console });
  if (typeof window._assignGlobalGameNumbers !== 'function') die('numerador canônico indisponível');
  return window._assignGlobalGameNumbers;
}
function jogosDoTorneio(t) {
  const out = [], seen = new Set();
  const add = (m) => {
    if (!m || !m.id || seen.has(String(m.id))) return;
    seen.add(String(m.id)); out.push(m);
  };
  (t.rounds || []).forEach((r) => {
    (r && r.matches || []).forEach(add);
    (r && r.monarchGroups || []).forEach((g) => (g && g.matches || []).forEach(add));
  });
  (t.groups || []).forEach((g) => (g && g.matches || []).forEach(add));
  (t.matches || []).forEach(add);
  Object.values(t.phaseRounds || {}).forEach((phase) => (phase && phase.rounds || []).forEach((r) => (r && r.matches || []).forEach(add)));
  add(t.thirdPlaceMatch);
  return out;
}
function resumo(plan) {
  return plan.slice(0, 30).map((x) => ({ de: x.before, para: x.after, id: x.id }));
}
(async () => {
  const ref = db.collection('tournaments').doc(String(TID));
  const [doc, matchesSnap] = await Promise.all([ref.get(), ref.collection('matches').get()]);
  if (!doc.exists) die('torneio inexistente: ' + TID);
  const rawByMatchId = new Map();
  matchesSnap.docs.forEach((snap) => {
    const envelope = snap.data() || {}, jogo = envelope.jogo || {};
    if (!jogo.id) die('documento de jogo sem jogo.id: ' + snap.id);
    if (rawByMatchId.has(String(jogo.id))) die('duplicidade de jogo.id: ' + jogo.id);
    rawByMatchId.set(String(jogo.id), { ref: snap.ref, envelope, jogo });
  });
  const tournament = await Split.montarDoBanco(doc.data(), async (collection) =>
    (await ref.collection(collection).get()).docs.map((snap) => snap.data())
  );
  const assign = loadCanonicalNumberer();
  assign(tournament);
  const hydrated = jogosDoTorneio(tournament);
  if (hydrated.length !== rawByMatchId.size) {
    die('hidratação incompleta: ' + hydrated.length + ' jogos contra ' + rawByMatchId.size + ' documentos');
  }
  const planned = hydrated.map((jogo) => {
    const raw = rawByMatchId.get(String(jogo.id));
    if (!raw) die('jogo hidratado não encontrado na subcoleção: ' + jogo.id);
    if (jogo._gameNum != null && (!Number.isInteger(jogo._gameNum) || jogo._gameNum < 1)) die('número inválido para ' + jogo.id);
    return { id: String(jogo.id), before: raw.jogo._gameNum == null ? null : raw.jogo._gameNum, after: jogo._gameNum == null ? null : jogo._gameNum, ref: raw.ref };
  });
  const numbered = planned.filter((item) => item.after != null);
  if (new Set(numbered.map((item) => item.after)).size !== numbered.length) die('a regra produziu números repetidos');
  const changed = planned.filter((item) => item.before !== item.after);
  console.log(JSON.stringify({
    tournament: TID,
    totalDocuments: rawByMatchId.size,
    numbered: numbered.length,
    changes: changed.length,
    firstChanges: resumo(changed)
  }, null, 2));
  if (!APPLY) {
    console.log('DRY-RUN: nenhuma escrita. Use --apply somente após conferir o plano.');
    return;
  }
  if (changed.length > 500) die('mais de 500 alterações; este script exige lote único atômico');
  const batch = db.batch();
  changed.forEach((item) => batch.update(item.ref, { 'jogo._gameNum': item.after }));
  await batch.commit();
  const reread = await ref.collection('matches').get();
  const afterById = new Map(reread.docs.map((snap) => {
    const jogo = (snap.data() || {}).jogo || {};
    return [String(jogo.id), jogo._gameNum == null ? null : jogo._gameNum];
  }));
  const wrong = planned.filter((item) => afterById.get(item.id) !== item.after);
  if (wrong.length) die('releitura divergente: ' + JSON.stringify(resumo(wrong)));
  console.log('✅ ' + changed.length + ' números corrigidos e todos os ' + planned.length + ' jogos foram relidos.');
})().catch((error) => { console.error('✗ ' + (error && error.message || error)); process.exit(1); });
