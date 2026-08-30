/* CONFERIDOR — a fonte viva de cada torneio pode ser provada?
 *
 * Antes da divisão, o documento é a fonte e as subcoleções são o espelho: remontar
 * o espelho tem de devolver o documento inteiro. Depois da divisão, o documento fica
 * propositalmente magro e as partes indicadas por `_semPesados` viram a fonte viva.
 * Comparar a remontagem completa contra esse documento magro acusa uma divergência
 * que é justamente o estado correto — e ler `participants` em vez de `inscritos`
 * sequer olha a coleção canônica.
 *
 * Este gate mantém as duas provas separadas:
 *   ① inteiro: espelho → documento, byte a byte;
 *   ② dividido: marcador → coleção canônica → montar → dividir de volta, com cada
 *      registro aproveitado, contagem de jogos e backup pré-divisão obrigatório.
 *
 * ⛔ NÃO ESCREVE NADA. Só lê e compara.
 *
 * Uso:  node scripts/conferir-banco-novo.js            (todos)
 *       node scripts/conferir-banco-novo.js <id>       (um torneio)
 *       node scripts/conferir-banco-novo.js --detalhe  (mostra os motivos)
 */
const path = require('path');
const { execSync } = require('child_process');
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const PARTES_DO_ESPELHO_LEGADO = ['matches', 'participants', 'history'];
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const DETALHE = process.argv.includes('--detalhe');
const SO_ESTE = process.argv.slice(2).find((a) => !a.startsWith('--')) || null;

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

async function lista(url, tk) {
  let pag = null, out = [];
  do {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'pageSize=300' + (pag ? '&pageToken=' + pag : ''),
      { headers: { Authorization: 'Bearer ' + tk } });
    if (!r.ok) { if (r.status === 404) return out; throw new Error(r.status + ' ' + url); }
    const j = await r.json();
    (j.documents || []).forEach((d) => out.push({ id: d.name.split('/').pop(), dados: doc2obj(d) }));
    pag = j.nextPageToken || null;
  } while (pag);
  return out;
}

async function documento(url, tk) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tk } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return doc2obj(await r.json());
}

function partesIndicadas(config) {
  const fora = Array.isArray(config && config._semPesados) ? config._semPesados.slice() : [];
  const invalidas = fora.filter((nome) => (S.PARTES || []).indexOf(nome) === -1);
  return { fora, invalidas, dividida: fora.length > 0 };
}

async function lePartes(id, nomes, tk) {
  const pares = await Promise.all(nomes.map(async (nome) => {
    const colecao = S.colecaoDaParte(nome);
    const docs = await lista(`${BASE}/tournaments/${id}/${colecao}`, tk);
    return [nome, docs.map((d) => d.dados)];
  }));
  return Object.fromEntries(pares);
}

function diferencas(a, b) {
  return [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])]
    .filter((k) => !S.iguais((a || {})[k], (b || {})[k]));
}

async function confereDividido(config, nomes, partes, backup) {
  const problemas = [];
  let montado = null;
  try {
    // Mesmo caminho do app/CF: o marcador escolhe TODAS as partes e a coleção de cada uma.
    montado = await S.montarDoBanco(JSON.parse(JSON.stringify(config)), async (colecao) => {
      const nome = nomes.find((x) => S.colecaoDaParte(x) === colecao);
      return nome ? partes[nome] : [];
    });
  } catch (e) {
    return ['NÃO MONTA: ' + ((e && e.message) || e)];
  }

  // Inversão real: o que foi montado precisa voltar exatamente ao config magro guardado.
  const volta = S.dividir(JSON.parse(JSON.stringify(montado)), nomes);
  if (!volta || !S.iguais(volta.config, config)) {
    problemas.push('config não é a inversa da montagem' +
      (DETALHE ? ' (' + diferencas(config, volta && volta.config).join(', ') + ')' : ''));
  }
  nomes.forEach((nome) => {
    // Sem esta contagem, um doc com `_loc` inválido pode ser lido e silenciosamente
    // ignorado pela remontagem. A tela perderia um jogo e o gate ainda ficaria verde.
    const lidos = (partes[nome] || []).length;
    const aproveitados = ((volta && volta[nome]) || []).length;
    if (lidos !== aproveitados) problemas.push(nome + ': li ' + lidos + ', a montagem aproveitou ' + aproveitados);
  });
  if (nomes.indexOf('matches') !== -1 && Number.isFinite(config._nJogos) &&
      config._nJogos !== ((partes.matches || []).length)) {
    problemas.push('matches: _nJogos=' + config._nJogos + ', subcoleção=' + (partes.matches || []).length);
  }

  // O backup é a prova imutável da transferência. Não comparamos seu conteúdo ao vivo:
  // placares e inscrições podem mudar legitimamente depois do salto. Mas sua ausência
  // torna impossível auditar uma reclamação ou voltar com segurança, então bloqueia.
  if (!backup || !backup.doc) problemas.push('BACKUP PRÉ-DIVISÃO AUSENTE');
  else if (Array.isArray(backup.doc._semPesados) && backup.doc._semPesados.length) {
    problemas.push('backup não guarda o documento inteiro');
  }
  return problemas;
}

(async () => {
  const tk = token();
  console.log('▶ conferindo fontes do torneio (NÃO escreve nada)\n');

  const torneios = SO_ESTE
    ? [{ id: SO_ESTE, dados: await documento(`${BASE}/tournaments/${SO_ESTE}`, tk) }]
    : await lista(`${BASE}/tournaments`, tk);

  let inteiros = 0, divididos = 0, problemasN = 0;
  const problemas = [];

  for (const t of torneios) {
    const config = t.dados;
    if (!config) { problemasN++; problemas.push({ id: t.id, nome: t.id, o: 'TORNEIO AUSENTE' }); continue; }
    const estado = partesIndicadas(config);
    if (estado.invalidas.length) {
      problemasN++; problemas.push({ id: t.id, nome: config.name, o: 'MARCADOR INVÁLIDO: ' + estado.invalidas.join(', ') }); continue;
    }

    if (!estado.dividida) {
      const partes = await lePartes(t.id, PARTES_DO_ESPELHO_LEGADO, tk);
      const esperado = S.dividir(config, PARTES_DO_ESPELHO_LEGADO);
      const haEspelho = PARTES_DO_ESPELHO_LEGADO.some((nome) => (partes[nome] || []).length);
      const haFonte = PARTES_DO_ESPELHO_LEGADO.some((nome) => (esperado[nome] || []).length);
      if (!haEspelho && haFonte) {
        problemasN++; problemas.push({ id: t.id, nome: config.name, o: 'ESPELHO AUSENTE' }); continue;
      }
      const montado = S.remontar(Object.assign({ config }, partes));
      if (!S.iguais(config, montado)) {
        problemasN++; problemas.push({ id: t.id, nome: config.name, o: 'ESPELHO DIVERGE: ' + diferencas(config, montado).join(', ') }); continue;
      }
      inteiros++;
      continue;
    }

    // Partes e backup são leituras independentes. Fazê-las em série deixa o gate
    // artificialmente lento e não acrescenta nenhuma segurança.
    const [partes, backup] = await Promise.all([
      lePartes(t.id, estado.fora, tk),
      documento(`${BASE}/tournaments_backup/${t.id}`, tk)
    ]);
    const falhas = await confereDividido(config, estado.fora, partes, backup);
    if (falhas.length) {
      problemasN++; problemas.push({ id: t.id, nome: config.name, o: falhas.join(' · ') }); continue;
    }
    divididos++;
  }

  console.log('torneios conferidos:', torneios.length);
  console.log('  ✓ inteiros, espelho idêntico :', inteiros);
  console.log('  ✓ divididos, fonte montável  :', divididos);
  console.log('  ✗ bloqueios                  :', problemasN);
  if (problemas.length) {
    console.log('\nO QUE PRECISA DE OLHO:');
    problemas.slice(0, 16).forEach((p) => console.log('  ·', (p.nome || p.id).slice(0, 34).padEnd(34), p.o, '[' + p.id + ']'));
    if (problemas.length > 16) console.log('  … e mais', problemas.length - 16);
  }
  console.log('\n' + (problemasN === 0
    ? '✅ cada torneio é lido da sua fonte canônica e o backup da divisão existe'
    : '⛔ NÃO avançar a migração enquanto houver bloqueio'));
  process.exit(problemasN ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
