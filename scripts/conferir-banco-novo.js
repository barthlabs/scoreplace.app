/* CONFERIDOR — a fonte viva de cada torneio pode ser provada?
 *
 * Todo torneio nasce dividido. O documento fica propositalmente magro e as partes
 * canônicas viram a fonte viva. `_semPesados` permanece somente como marcador de
 * compatibilidade do aplicativo nativo antigo: nunca escolhe o formato do torneio.
 * Comparar a remontagem completa contra esse documento magro acusa uma divergência
 * que é justamente o estado correto — e ler `participants` em vez de `inscritos`
 * sequer olha a coleção canônica.
 *
 * Este gate prova a fonte única: partes canônicas → montar → dividir de volta, com
 * cada registro aproveitado, contagem de jogos e backup pré-divisão obrigatório.
 * O marcador de compatibilidade também é conferido, mas não decide a leitura.
 *
 * ⛔ NÃO ESCREVE NADA. Só lê e compara.
 *
 * Uso:  node scripts/conferir-banco-novo.js            (todos)
 *       node scripts/conferir-banco-novo.js <id>       (um torneio)
 *       node scripts/conferir-banco-novo.js --detalhe  (mostra os motivos)
 */
const path = require('path');
const { accessTokenForServiceAccountSync } = require('./firebase-service-account-token');
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => accessTokenForServiceAccountSync();
const DETALHE = process.argv.includes('--detalhe');
const SO_ESTE = process.argv.slice(2).find((a) => !a.startsWith('--')) || null;
const CONCORRENCIA = 8;

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
  const marcador = Array.isArray(config && config._semPesados) ? config._semPesados.slice() : null;
  const fora = S.partesDe(config);
  // `grupos` é uma parte histórica adicional, não outro formato de torneio. O
  // núcleo a restaura quando a fotografia de compatibilidade a declara.
  if (marcador && marcador.indexOf('grupos') !== -1 && fora.indexOf('grupos') === -1) fora.push('grupos');
  const invalidas = (marcador || []).filter((nome) => (S.PARTES || []).indexOf(nome) === -1);
  const faltamNoMarcador = !marcador || fora.some((nome) => marcador.indexOf(nome) === -1);
  return { fora, marcador, invalidas, faltamNoMarcador };
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

function contaRegistrosMontados(nome, registros) {
  return (registros || []).filter((registro) => {
    if (!registro) return false;
    if (nome === 'matches') return registro.jogo != null;
    if (nome === 'grupos') return registro.grupo != null;
    return registro.item != null;
  }).length;
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
    // Participantes removidos podem deixar um intervalo de índice proposital para
    // não deslocar a ordem visível dos demais. Ao clonar, JSON materializa esse
    // buraco como `item: null`; contar o tamanho do array (ou o envelope) acusaria
    // um inscrito inventado. A prova conta o conteúdo real de cada registro.
    const aproveitados = contaRegistrosMontados(nome, (volta && volta[nome]) || []);
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

async function confereTorneio(t, tk) {
  const config = t.dados;
  if (!config) return { id: t.id, nome: t.id, falhas: ['TORNEIO AUSENTE'] };
  const estado = partesIndicadas(config);
  if (estado.invalidas.length) {
    return { id: t.id, nome: config.name, falhas: ['MARCADOR INVÁLIDO: ' + estado.invalidas.join(', ')] };
  }
  if (estado.faltamNoMarcador) {
    return { id: t.id, nome: config.name, falhas: ['MARCADOR DE COMPATIBILIDADE AUSENTE OU INCOMPLETO'] };
  }

  // Partes e backup são leituras independentes. Fazê-las em série deixa o gate
  // artificialmente lento e não acrescenta segurança.
  const [partes, backup] = await Promise.all([
    lePartes(t.id, estado.fora, tk),
    documento(`${BASE}/tournaments_backup/${t.id}`, tk)
  ]);
  return { id: t.id, nome: config.name, falhas: await confereDividido(config, estado.fora, partes, backup) };
}

async function emLotes(items, limite, operacao) {
  const resultados = new Array(items.length);
  let proximo = 0;
  async function trabalhador() {
    while (true) {
      const indice = proximo++;
      if (indice >= items.length) return;
      resultados[indice] = await operacao(items[indice]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabalhador));
  return resultados;
}

(async () => {
  const tk = token();
  console.log('▶ conferindo fontes do torneio (NÃO escreve nada)\n');

  const torneios = SO_ESTE
    ? [{ id: SO_ESTE, dados: await documento(`${BASE}/tournaments/${SO_ESTE}`, tk) }]
    : await lista(`${BASE}/tournaments`, tk);

  const resultados = await emLotes(torneios, CONCORRENCIA, (t) => confereTorneio(t, tk));
  const problemas = resultados.filter((resultado) => resultado.falhas.length)
    .map((resultado) => ({ id: resultado.id, nome: resultado.nome, o: resultado.falhas.join(' · ') }));
  const divididos = resultados.length - problemas.length;
  const problemasN = problemas.length;

  console.log('torneios conferidos:', torneios.length);
  console.log('  · concorrência limitada    :', Math.min(CONCORRENCIA, torneios.length));
  console.log('  ✓ divididos, fonte montável  :', divididos);
  console.log('  ✗ bloqueios                  :', problemasN);
  if (problemas.length) {
    console.log('\nO QUE PRECISA DE OLHO:');
    problemas.slice(0, 16).forEach((p) => console.log('  ·', (p.nome || p.id).slice(0, 34).padEnd(34), p.o, '[' + p.id + ']'));
    if (problemas.length > 16) console.log('  … e mais', problemas.length - 16);
  }
  console.log('\n' + (problemasN === 0
    ? '✅ cada torneio é dividido, lido da fonte canônica e tem backup da divisão'
    : '⛔ NÃO avançar a migração enquanto houver bloqueio'));
  // Não use `process.exit()` aqui: em CI e em chamadas automatizadas o stdout é
  // um pipe e o encerramento forçado pode descartar justamente o veredito que
  // decidiu a liberação. O event loop termina naturalmente depois do flush.
  process.exitCode = problemasN ? 1 : 0;
})().catch((e) => { console.error(e); process.exitCode = 1; });
