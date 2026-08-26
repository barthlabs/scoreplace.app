/* CARGA INICIAL do banco novo — lê o banco velho e grava as subcoleções.
 *
 * ⛔ ORDEM CORRETA, e ela é o oposto da intuição:
 *   1º  LIGAR O ESPELHO (gatilho `tournamentMirror`, já no ar)
 *   2º  RODAR ESTA CARGA
 * Se a carga vier primeiro, tudo que for lançado entre a cópia e o espelho SE PERDE.
 * Com o espelho ligado antes, qualquer placar lançado durante a carga já cai nos dois
 * bancos — e a carga só preenche o que é antigo. **Nenhuma janela de manutenção.**
 *
 * ⛔ NÃO TOCA no documento do torneio. Só ESCREVE nas subcoleções novas. O banco velho
 * segue sendo a verdade até o conferidor ficar verde por dias
 * (`scripts/conferir-banco-novo.js`).
 *
 * Idempotente: rodar de novo regrava o mesmo conteúdo, sem efeito colateral.
 * Dry-run por padrão; grava só com --apply.
 *
 * Uso:  node scripts/backfill-banco-novo.js            (dry-run, todos)
 *       node scripts/backfill-banco-novo.js --apply
 *       node scripts/backfill-banco-novo.js <id> --apply
 */
const path = require('path');
const { execSync } = require('child_process');
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const APPLY = process.argv.includes('--apply');
const SO_ESTE = process.argv.slice(2).find((a) => !a.startsWith('--')) || null;
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

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
function toF(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') { const f = {}; Object.entries(v).forEach(([k, x]) => { f[k] = toF(x); }); return { mapValue: { fields: f } }; }
  return { nullValue: null };
}
const doc2obj = (d) => { const o = {}; Object.entries((d && d.fields) || {}).forEach(([k, v]) => { o[k] = fromF(v); }); return o; };

(async () => {
  const tk = token();
  console.log('▶ carga inicial do banco novo' + (APPLY ? '' : '   (DRY-RUN — nada será gravado)'));
  console.log('  ⚠️ o espelho (`tournamentMirror`) precisa estar NO AR antes disto.\n');

  let torneios = [];
  if (SO_ESTE) {
    const r = await fetch(`${BASE}/tournaments/${SO_ESTE}`, { headers: { Authorization: 'Bearer ' + tk } });
    torneios = [{ id: SO_ESTE, dados: doc2obj(await r.json()) }];
  } else {
    let pag = null;
    do {
      const r = await fetch(`${BASE}/tournaments?pageSize=200` + (pag ? `&pageToken=${pag}` : ''), { headers: { Authorization: 'Bearer ' + tk } });
      const j = await r.json();
      (j.documents || []).forEach((d) => torneios.push({ id: d.name.split('/').pop(), dados: doc2obj(d) }));
      pag = j.nextPageToken || null;
    } while (pag);
  }
  console.log('  torneios:', torneios.length);

  let totJogos = 0, totIns = 0, totHist = 0, erros = 0;
  for (const t of torneios) {
    const partes = S.dividir(t.dados);
    if (!partes) continue;

    // ⛔ prova de fidelidade ANTES de gravar: se remontar não devolve o original,
    // este torneio NÃO é migrado. Melhor deixar sem espelho do que com espelho errado.
    const volta = S.remontar(partes);
    if (JSON.stringify(volta) !== JSON.stringify(t.dados)) {
      console.error('  ✗ IDA E VOLTA FALHOU —', (t.dados.name || t.id), '— pulado, NÃO migrado');
      erros++;
      continue;
    }

    const grupos = [
      ['matches', partes.matches, (m) => m._chave],
      ['participants', partes.participants, (p) => 'p' + p._idx],
      ['history', partes.history, (h) => 'h' + h._idx]
    ];
    let n = [0, 0, 0];
    for (let gi = 0; gi < grupos.length; gi++) {
      const [nome, itens, chaveDe] = grupos[gi];
      for (const item of itens) {
        n[gi]++;
        if (!APPLY) continue;
        const fields = {};
        Object.entries(item).forEach(([k, v]) => { fields[k] = toF(v); });
        const url = `${BASE}/tournaments/${t.id}/${nome}/${encodeURIComponent(String(chaveDe(item)))}`;
        const w = await fetch(url, {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields })
        });
        if (!w.ok) { console.error('    ✗', t.id, nome, w.status, (await w.text()).slice(0, 140)); erros++; }
      }
    }
    totJogos += n[0]; totIns += n[1]; totHist += n[2];
    if (n[0] + n[1] + n[2] > 0) {
      console.log('  ' + (APPLY ? '✓' : '·'), (t.dados.name || t.id).slice(0, 30).padEnd(30),
        'jogos', String(n[0]).padStart(4), '· inscritos', String(n[1]).padStart(4), '· histórico', String(n[2]).padStart(4));
    }
  }

  console.log('');
  console.log(APPLY ? '✓ gravados:' : '✓ SERIAM gravados:', totJogos, 'jogos ·', totIns, 'inscritos ·', totHist, 'eventos');
  if (erros) console.log('⛔ erros:', erros, '— NÃO avançar enquanto não for zero');
  if (!APPLY) console.log('\n(rode com --apply para gravar)');
  console.log('\nDepois: node scripts/conferir-banco-novo.js');
  process.exit(erros ? 1 : 0);
})();
