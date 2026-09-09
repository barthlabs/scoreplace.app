/* Repara, sob comando explícito, a projeção results a partir de matches.
 *
 * Uso:
 *   node scripts/reconciliar-espelho-resultados.js --tid <id>            # simula
 *   node scripts/reconciliar-espelho-resultados.js --tid <id> --apply    # cria só os ausentes
 *
 * Não altera matches, não toca docs existentes e não aceita execução global.
 */
'use strict';

const path = require('path');
// As dependências de Admin pertencem ao codebase `functions`, não à raiz do Hosting.
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const Split = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
const Roster = require(path.join(__dirname, '..', 'functions', 'match-roster.js'));

const args = process.argv.slice(2);
const at = args.indexOf('--tid');
const tid = at >= 0 ? String(args[at + 1] || '').trim() : '';
const apply = args.includes('--apply');
const detalhe = args.includes('--detalhe');
if (!tid || tid.startsWith('-') || !args.includes('--tid')) {
  throw new Error('uso: node scripts/reconciliar-espelho-resultados.js --tid <id> [--apply]');
}

if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();

async function montar(ref, config) {
  const fora = Array.isArray(config._semPesados) ? config._semPesados : [];
  if (!fora.length) return config;
  const partes = await Promise.all(fora.map(async (nome) => {
    const snap = await ref.collection(Split.colecaoDaParte(nome)).get();
    return [Split.colecaoDaParte(nome), snap.docs.map((d) => d.data())];
  }));
  return Split.montarDoBanco(config, async (colecao) => Object.fromEntries(partes)[colecao] || []);
}

(async () => {
  const ref = db.collection('tournaments').doc(tid);
  const root = await ref.get();
  if (!root.exists) throw new Error('torneio não existe: ' + tid);
  const t = await montar(ref, root.data() || {});
  const vistos = new Set();
  const jogos = Roster.collectMatches(t).filter((m) => {
    if (!m || m.id == null || m.id === '') return false;
    const id = String(m.id);
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });
  const col = ref.collection('results');
  const existentes = await col.get();
  const ids = new Set(existentes.docs.map((d) => d.id));
  const jogoIds = new Set(jogos.map((m) => String(m.id)));
  const faltam = jogos.filter((m) => !ids.has(String(m.id)));
  const orfaos = existentes.docs.map((d) => d.id).filter((id) => !jogoIds.has(id));
  console.log(JSON.stringify({ tid, jogosCanonicos: jogos.length, resultsExistentes: existentes.size, resultsAusentes: faltam.length, resultsOrfaos: orfaos.length, apply }, null, 2));
  if (detalhe && orfaos.length) console.log('órfãos:', orfaos.join(', '));
  if (!apply) return;
  const agora = new Date().toISOString();
  for (let inicio = 0; inicio < faltam.length; inicio += 500) {
    const lote = db.batch();
    faltam.slice(inicio, inicio + 500).forEach((m) => {
      const doc = Roster.buildMirrorDoc(t, m, tid, agora, null);
      lote.create(col.doc(String(m.id)), doc);
    });
    await lote.commit();
  }
  const depois = await col.get();
  const restantes = jogos.filter((m) => !depois.docs.some((d) => d.id === String(m.id)));
  if (restantes.length) throw new Error('pós-condição falhou: ' + restantes.length + ' results ainda ausentes');
  console.log(JSON.stringify({ ok: true, created: faltam.length, resultsDepois: depois.size, resultsOrfaos: orfaos.length }, null, 2));
})().catch((e) => { console.error('⛔ reconciliação não concluída:', e.message); process.exitCode = 1; });
