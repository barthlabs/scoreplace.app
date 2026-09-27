/* APLICA A REPESCAGEM PELA RÉGUA CORRIGIDA — o que o app faria ao abrir a chave.
 *
 * ⛔⛔ POR QUE EXISTE: a versão nova (2.3.111) corrige as vagas e as CARIMBA na primeira vez que
 * alguém abre a chave. Enquanto ninguém abre, o banco segue com as três vagas erradas. Este script
 * faz exatamente o que aquela abertura faria — nada além.
 *
 * ⛔ ELE NÃO REPETE OS TRÊS DEFEITOS DO `remontar-repescagem.js`, que estão bloqueados por isso:
 *   ① CONVERSÃO RECURSIVA de verdade — o objeto do time tem mapa dentro de mapa e array de mapa;
 *      conversão rasa grava torto e só se descobre quando a tela quebra;
 *   ② ALVO POR ID EXATO — nada de casar pedaço do nome; o id é exigido no argumento;
 *   ③ PRECONDIÇÃO por `updateTime` de CADA documento — se alguém lançar placar entre a leitura e a
 *      gravação, a escrita é RECUSADA pelo servidor em vez de atropelar.
 *
 * ⛔ E A DECISÃO É DO MOTOR DO APP, não minha: roda `_reassignBestLosersToRepechage`, a mesma função
 * que a tela chama. Reimplementar a regra aqui seria gravar a minha opinião.
 *
 * Uso: node scripts/aplicar-repescagem-corrigida.js <tournamentId> [--gravar]
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const Split = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
const Leitura = require(path.join(__dirname, 'lib', 'leitura-resiliente.js'));

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const GRAVAR = process.argv.includes('--gravar');
const TID = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!TID) { console.error('✗ falta o ID EXATO do torneio (nunca pedaço do nome).'); process.exit(1); }
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const ler = Leitura.criarLeitor({ timeoutMs: 30000, tentativas: 4, esperaBaseMs: 500 });

function fromF(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromF);
  if ('mapValue' in v) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = fromF(x); }); return o; }
  return null;
}
const doc2obj = (d) => { const o = {}; Object.entries((d && d.fields) || {}).forEach(([k, v]) => { o[k] = fromF(v); }); return o; };

/* ⛔ RECURSIVA DE VERDADE: mapa dentro de mapa, array de mapa, array de array. Era aqui que o
 * script antigo gravava torto. */
function toF(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') {
    const fields = {};
    Object.entries(v).forEach(([k, x]) => { if (x !== undefined) fields[k] = toF(x); });
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

async function lista(url, tk) {
  let page = null, out = [];
  do {
    const q = url + (url.includes('?') ? '&' : '?') + 'pageSize=300' + (page ? '&pageToken=' + encodeURIComponent(page) : '');
    const r = await ler(q, { Authorization: 'Bearer ' + tk }, 'lista');
    if (!r.ok) { if (r.status === 404) return out; throw new Error(r.status + ' ' + url); }
    const j = JSON.parse(r.texto || '{}');
    (j.documents || []).forEach((d) => out.push({ nome: d.name, id: d.name.split('/').pop(), updateTime: d.updateTime, dados: doc2obj(d) }));
    page = j.nextPageToken || null;
  } while (page);
  return out;
}

/* grava UM documento de jogo inteiro, com PRECONDIÇÃO: se ele mudou desde a leitura, o servidor
 * recusa e nada é escrito. É o que faltava no script antigo. */
async function gravarJogo(nomeDoc, updateTime, jogo, tk) {
  const url = 'https://firestore.googleapis.com/v1/' + nomeDoc +
    '?updateMask.fieldPaths=jogo&currentDocument.updateTime=' + encodeURIComponent(updateTime);
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { jogo: toF(jogo) } })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ao gravar ' + nomeDoc + ': ' + (await r.text()).slice(0, 300));
}

const H = require(path.join(__dirname, '..', 'tests', 'headless.js'));
['bracket-model.js', 'chaves.js', 'chaves-adapter.js', 'bracket-logic.js'].forEach((f) => {
  try { H.load(f); } catch (e) { /* o que importa é a reatribuição */ }
});
const W = H.window;

(async () => {
  const tk = token();
  console.log('▸ torneio (id EXATO): ' + TID + (GRAVAR ? '   ⚠️ MODO GRAVAÇÃO' : '   (ensaio)'));
  if (typeof W._reassignBestLosersToRepechage !== 'function') {
    console.error('⛔ o motor do app não carregou — abortando sem concluir nada.'); process.exit(1);
  }

  const raiz = await ler(`${BASE}/tournaments/${TID}`, { Authorization: 'Bearer ' + tk }, 'raiz');
  if (!raiz.ok) { console.error('⛔ torneio não encontrado (HTTP ' + raiz.status + ')'); process.exit(1); }
  const config = doc2obj(JSON.parse(raiz.texto));
  console.log('  nome: ' + (config.name || '(sem nome)'));

  const fora = Array.isArray(config._semPesados) ? config._semPesados : [];
  const docsPorParte = {};
  for (const nome of fora) {
    const col = Split.colecaoDaParte(nome);
    docsPorParte[col] = await lista(`${BASE}/tournaments/${TID}/${col}`, tk);
  }
  const t = fora.length
    ? await Split.montarDoBanco(config, async (c) => (docsPorParte[c] || []).map((d) => d.dados))
    : config;

  /* retrato ANTES, por id de jogo */
  const all = (typeof W._collectAllMatches === 'function') ? (W._collectAllMatches(t) || []) : (t.matches || []);
  const antes = {};
  all.forEach((m) => { if (m && m.id != null) antes[String(m.id)] = JSON.stringify(m); });
  console.log('  jogos montados: ' + all.length);

  const trocas = W._reassignBestLosersToRepechage(t);
  if (typeof W._congelaLinhasEncerradas === 'function') { try { W._congelaLinhasEncerradas(t); } catch (e) {} }
  const depois = (typeof W._collectAllMatches === 'function') ? (W._collectAllMatches(t) || []) : (t.matches || []);
  const mudados = depois.filter((m) => m && m.id != null && antes[String(m.id)] !== JSON.stringify(m));
  console.log('  o motor mexeu em ' + mudados.length + ' jogo(s) (trocas=' + trocas + ')');
  if (!mudados.length) { console.log('\n✓ nada a fazer — a chave já está como o motor quer.'); return; }

  /* mapeia id do jogo → documento da subcoleção (com o updateTime da LEITURA) */
  const porIdJogo = {};
  (docsPorParte['matches'] || []).forEach((d) => {
    const g = d.dados && d.dados.jogo;
    if (g && g.id != null) porIdJogo[String(g.id)] = d;
  });

  let ok = 0, semDoc = 0;
  for (const m of mudados) {
    const d = porIdJogo[String(m.id)];
    if (!d) { console.log('   ⚠️ sem documento para ' + m.id + ' — pulado'); semDoc++; continue; }
    const vagas = ['p1', 'p2'].filter((sl) => m[sl + 'FromRepechage'] || m[sl + 'AguardaMelhor'])
      .map((sl) => sl + '=' + m[sl] + (m[sl + 'RepescagemFixada'] ? ' [carimbada]' : ''));
    console.log('   ' + (GRAVAR ? 'gravando ' : 'gravaria ') + m.id + (vagas.length ? '  ' + vagas.join(' · ') : ''));
    if (GRAVAR) { await gravarJogo(d.nome, d.updateTime, m, tk); }
    ok++;
  }
  console.log('\n' + (GRAVAR ? '✅ ' : 'ensaio: ') + ok + ' jogo(s) ' + (GRAVAR ? 'gravados' : 'seriam gravados') +
    (semDoc ? ' · ' + semDoc + ' sem documento' : ''));
  if (!GRAVAR) console.log('rode com --gravar para valer.');
})().catch((e) => { console.error('ERRO:', e && e.message); process.exitCode = 1; });
