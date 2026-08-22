/* CONGELA AGORA a classificação dos grupos que JÁ TERMINARAM — Confra BT Alta da Clínica 2026
 *
 * Ordem do dono (22/ago/2026): _"essas duplas que já foram publicadas na classificação não
 * podem mudar. as pessoas já sabem suas duplas."_ e, sobre o alcance: _"é importante congelar
 * AGORA os que foram jogados na Confra real. os que não têm resultado ainda podem ser
 * recalculados sem problemas."_
 *
 * O app (2.0.19) congela sozinho a cada placar lançado — mas só a partir do PRÓXIMO placar.
 * Este script faz o retrato dos grupos que já fecharam, sem esperar.
 *
 * Regras deste script:
 *   • quem calcula a ordem é `window._computeMonarchStandings` + `_congelaGruposEncerrados`,
 *     o MESMO código que roda no app. Zero lógica paralela;
 *   • grupo com QUALQUER jogo pendente NÃO é tocado — ele ainda pode ser recalculado;
 *   • grupo que já tem `classifCongelada` NÃO é regravado (a função é idempotente);
 *   • grava só o campo `rounds`, com precondição `currentDocument.updateTime`: se alguém
 *     lançar um placar no meio, a escrita ABORTA em vez de sobrescrever;
 *   • o fold Rei/Rainha é reaplicado antes de gravar — o grupo volta pro disco com
 *     `matchIds`, nunca com cópia dos jogos (fonte única = round.matches).
 *
 * Uso: node scripts/congelar-classificacao-confra.js            (dry-run)
 *      node scripts/congelar-classificacao-confra.js --apply    (grava)
 */
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const H = require(path.join(ROOT, 'tests', 'render-harness'));
const W = H.sandbox;

const TID = process.env.SP_TID || 'tour_1780009816637';
const PROJ = 'scoreplace-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJ}/databases/(default)/documents`;
const APPLY = process.argv.includes('--apply');
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

// ── conversão Firestore REST ↔ JS (mesma de scripts/fix-confra-ghosts.js) ────
function fromF(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromF);
  if ('mapValue' in v) {
    const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = fromF(x); });
    return o;
  }
  return null;
}
function toF(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') {
    const f = {}; Object.entries(v).forEach(([k, x]) => { f[k] = toF(x); });
    return { mapValue: { fields: f } };
  }
  return { nullValue: null };
}

(async () => {
  const t0 = token();
  const res = await fetch(`${BASE}/tournaments/${TID}`, { headers: { Authorization: `Bearer ${t0}` } });
  if (!res.ok) throw new Error('GET falhou: ' + res.status);
  const doc = await res.json();
  const t = {}; Object.entries(doc.fields || {}).forEach(([k, v]) => { t[k] = fromF(v); });
  const updateTime = doc.updateTime;

  const roundsAntes = JSON.stringify(t.rounds);
  console.log(`torneio: ${t.name}`);
  console.log(`updateTime: ${updateTime}`);

  W._hydrateMonarchGroups(t);                 // grupos guardam matchIds; hidrata as refs
  const gs = (t.rounds || []).reduce((a, r) => a.concat((r && r.monarchGroups) || []), []);
  const jaTinham = gs.filter((g) => Array.isArray(g.classifCongelada)).length;

  W._congelaGruposEncerrados(t);              // o MESMO código do app

  const novos = gs.filter((g) => Array.isArray(g.classifCongelada));
  const pendentes = gs.filter((g) => !Array.isArray(g.classifCongelada));
  console.log(`\ngrupos: ${gs.length} · já congelados antes: ${jaTinham} · congelados agora: ${novos.length - jaTinham}`);
  console.log(`ainda em jogo (não tocados): ${pendentes.length}`);
  novos.forEach((g) => {
    console.log('  ' + g.name + ': ' + g.classifCongelada.map((x) => x.name || x.uid).join(' > '));
  });

  // GUARDAS — nada disto pode ter acontecido; se aconteceu, o script está errado.
  const semUid = novos.filter((g) => g.classifCongelada.some((x) => !x.uid));
  if (semUid.length) throw new Error('ABORTA: linha sem uid em ' + semUid.map((g) => g.name).join(','));
  const tamanhoErrado = novos.filter((g) => g.classifCongelada.length !== (g.players || []).length);
  if (tamanhoErrado.length) throw new Error('ABORTA: retrato com tamanho ≠ elenco em ' + tamanhoErrado.map((g) => g.name).join(','));

  // dobra de volta: o disco guarda matchIds, nunca cópia dos jogos
  W._foldMonarchGroups(t);
  const jogosNoGrupo = (t.rounds || []).reduce((a, r) => a.concat((r && r.monarchGroups) || []), [])
    .filter((g) => Array.isArray(g.matches));
  if (jogosNoGrupo.length) throw new Error('ABORTA: o fold não desfez as cópias de jogo em ' + jogosNoGrupo.length + ' grupo(s)');

  // o retrato é ADITIVO: nada mais no rounds pode ter mudado
  const semRetrato = JSON.parse(JSON.stringify(t.rounds));
  semRetrato.forEach((r) => ((r && r.monarchGroups) || []).forEach((g) => {
    if (g) { delete g.classifCongelada; delete g.classifCongeladaAt; }
  }));
  if (JSON.stringify(semRetrato) !== roundsAntes) {
    throw new Error('ABORTA: o rounds mudou ALÉM do retrato — placar ou elenco foi tocado');
  }
  console.log('\n✓ diff é SÓ o retrato: nenhum placar, jogo ou elenco mudou');

  if (novos.length === jaTinham) { console.log('\nnada a gravar.'); return; }
  if (!APPLY) { console.log('\n(dry-run — rode com --apply pra gravar)'); return; }

  const body = {
    writes: [{
      update: {
        name: `projects/${PROJ}/databases/(default)/documents/tournaments/${TID}`,
        fields: { rounds: toF(t.rounds) },
      },
      updateMask: { fieldPaths: ['rounds'] },
      currentDocument: { updateTime },   // trava contra escrita concorrente
    }],
  };
  const w = await fetch(`${BASE}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t0}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await w.json();
  if (!w.ok) throw new Error('ESCRITA FALHOU (' + w.status + '): ' + JSON.stringify(out));
  console.log('\n✅ gravado:', JSON.stringify(out.writeResults || out));
})().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
