/* CONFERIDOR — `matches` (fonte) → `results` (espelho) está íntegro?
 *
 * `matches` é a fonte canônica do jogo. `results/{matchId}` é uma projeção para
 * leitura/autorizaçao por partida. Em torneio dividido a fonte mora na subcoleção
 * `matches`, portanto ler somente o documento principal prova exatamente nada.
 *
 * Este script é estritamente READ-ONLY. Ele monta cada torneio pelo mesmo núcleo
 * do app/CF e separa duas falhas que exigem tratamentos diferentes:
 *   - AUSENTE: há jogo canônico, mas não há `results/{matchId}`;
 *   - DIVERGENTE: o doc existe, mas roster/resultado/exibição não batem com a fonte.
 *
 * ⚠️ LEITURA RESILIENTE (R0.4). Este conferidor morria no PRIMEIRO GET com
 * `UND_ERR_CONNECT_TIMEOUT` em 10.000 ms — o teto interno do undici, que o `fetch` do Node
 * não deixa configurar. Medido com curl no mesmo instante: connect 0,049s no IPv4 contra
 * 5,035s no IPv6. Uma requisição isolada passava (~5,4s); centenas em sequência, não.
 * O resultado era o pior possível para uma auditoria: nenhum contador impresso e nenhuma
 * conclusão possível — "sem dado" com cara de execução. Agora os GETs passam por
 * `scripts/lib/leitura-resiliente.js` (node:https, timeout de socket explícito + retentativa
 * limitada de erro transitório). O CRITÉRIO DE COMPARAÇÃO NÃO MUDOU: mesma ordem, mesmo
 * escopo, mesmas assinaturas, mesmos contadores.
 *
 * Uso: node scripts/conferir-espelho-resultados.js [<tid>] [--detalhe]
 *
 * Ajustes (todos opcionais, com padrão conservador):
 *   SP_FETCH_TIMEOUT_MS   timeout por tentativa, em ms   (padrão 30000)
 *   SP_FETCH_TENTATIVAS   nº máximo de tentativas        (padrão 4)
 *   SP_FETCH_ESPERA_MS    base da espera progressiva     (padrão 500, teto 4000)
 */
const path = require('path');
const { execSync } = require('child_process');
const Split = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
const Roster = require(path.join(__dirname, '..', 'functions', 'match-roster.js'));
const Leitura = require(path.join(__dirname, 'lib', 'leitura-resiliente.js'));

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const DETALHE = process.argv.includes('--detalhe');
const SO_ESTE = process.argv.slice(2).find((a) => !a.startsWith('--')) || null;
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

const ler = Leitura.criarLeitor({
  timeoutMs: Number(process.env.SP_FETCH_TIMEOUT_MS) || 30000,
  tentativas: Number(process.env.SP_FETCH_TENTATIVAS) || 4,
  esperaBaseMs: Number(process.env.SP_FETCH_ESPERA_MS) || 500
});

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
    const o = {};
    Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = fromF(x); });
    return o;
  }
  return null;
}
function doc2obj(d) {
  const o = {};
  Object.entries((d && d.fields) || {}).forEach(([k, v]) => { o[k] = fromF(v); });
  return o;
}
/* ⚠️ A SEMÂNTICA DESTES DOIS É INTOCADA — só o transporte mudou. 404 continua sendo
 * "coleção/doc não existe" (lista devolve o que juntou; documento devolve null), e qualquer
 * outro !ok continua LANÇANDO. Retentar 404 seria inventar espera onde a resposta já veio. */
async function lista(url, tk, rotulo) {
  let page = null, out = [];
  do {
    const q = url + (url.includes('?') ? '&' : '?') + 'pageSize=300' + (page ? '&pageToken=' + encodeURIComponent(page) : '');
    const r = await ler(q, { Authorization: 'Bearer ' + tk }, rotulo || ('lista ' + url));
    if (!r.ok) { if (r.status === 404) return out; throw new Error(r.status + ' ' + url); }
    const j = JSON.parse(r.texto || '{}');
    (j.documents || []).forEach((d) => out.push({ id: d.name.split('/').pop(), dados: doc2obj(d) }));
    page = j.nextPageToken || null;
  } while (page);
  return out;
}
async function documento(url, tk, rotulo) {
  const r = await ler(url, { Authorization: 'Bearer ' + tk }, rotulo || ('documento ' + url));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return doc2obj(JSON.parse(r.texto || '{}'));
}
async function montar(tid, config, tk) {
  const fora = Array.isArray(config._semPesados) ? config._semPesados : [];
  if (!fora.length) return config;
  const partes = await Promise.all(fora.map(async (nome) => {
    const col = Split.colecaoDaParte(nome);
    const docs = await lista(`${BASE}/tournaments/${tid}/${col}`, tk, 'parte `' + col + '` de ' + tid);
    return [col, docs.map((d) => d.dados)];
  }));
  const porColecao = Object.fromEntries(partes);
  return Split.montarDoBanco(config, async (colecao) => porColecao[colecao] || []);
}
function jogosPorId(t) {
  const byId = {};
  Roster.collectMatches(t).forEach((m) => {
    if (!m || m.id == null || m.id === '') return;
    byId[String(m.id)] = m;
  });
  return byId;
}
function camposDiferentes(atual, esperado) {
  const campos = ['playerUids'].concat(Roster.RESULT_FIELDS || [], ['p1', 'p2', 'tournamentName', 'roundLabel']);
  return campos.filter((campo) => {
    const a = campo === 'playerUids' ? Roster.rosterKey((atual || {})[campo]) : (atual || {})[campo];
    const b = campo === 'playerUids' ? Roster.rosterKey((esperado || {})[campo]) : (esperado || {})[campo];
    return JSON.stringify(a) !== JSON.stringify(b);
  });
}

(async () => {
  /* ⛔ O PRIMEIRO PASSO TAMBÉM PRECISA FALAR. `token()` é um `execSync` do gcloud, e num
   * ambiente sem credencial ele lança ANTES de qualquer linha de saída — o que produz uma
   * execução praticamente muda, indistinguível de "rodou e não achou nada". Agora o passo se
   * anuncia e a falha dele vira uma causa nomeada, igual às leituras. */
  console.log('▶ conferindo espelho matches → results (NÃO escreve nada)\n');
  let tk;
  try {
    tk = token();
  } catch (e) {
    throw Object.assign(new Error('não consegui obter o token de acesso'), {
      spLeituraFalhou: true, spTentativas: 1, spCausa: 'gcloud auth print-access-token falhou: ' + (e && e.message ? String(e.message).split('\n')[0] : e),
      spOperacao: 'obter credencial de leitura', spUrl: '(local: gcloud auth print-access-token)', cause: e
    });
  }
  const torneios = SO_ESTE
    ? [{ id: SO_ESTE, dados: await documento(`${BASE}/tournaments/${SO_ESTE}`, tk, 'documento do torneio ' + SO_ESTE) }]
    : await lista(`${BASE}/tournaments`, tk, 'listagem de todos os torneios');
  let jogos = 0, semEspelho = 0, divergentes = 0, torneiosComJogos = 0;
  const problemas = [];

  for (const item of torneios) {
    if (!item.dados) { problemas.push({ id: item.id, nome: item.id, o: 'TORNEIO AUSENTE' }); continue; }
    const t = await montar(item.id, item.dados, tk);
    const porId = jogosPorId(t);
    const ids = Object.keys(porId);
    if (!ids.length) continue;
    torneiosComJogos++;
    jogos += ids.length;
    const results = await lista(`${BASE}/tournaments/${item.id}/results`, tk, 'espelho `results` de ' + item.id);
    const espelho = Object.fromEntries(results.map((d) => [d.id, d.dados]));
    const ausentes = [], diferentes = [];
    ids.forEach((id) => {
      const atual = espelho[id];
      if (!atual) { ausentes.push(id); return; }
      const esperado = Roster.buildSeedDoc(t, porId[id]);
      if (Roster.subdocSignature(atual) !== Roster.subdocSignature(esperado)) {
        diferentes.push({ id, campos: camposDiferentes(atual, esperado) });
      }
    });
    semEspelho += ausentes.length;
    divergentes += diferentes.length;
    if (ausentes.length || diferentes.length) {
      problemas.push({ id: item.id, nome: item.dados.name || item.id, ausentes, diferentes });
    }
  }

  console.log('torneios conferidos:', torneios.length);
  console.log('  com jogos canônicos      :', torneiosComJogos);
  console.log('  jogos canônicos          :', jogos);
  console.log('  ✗ results ausentes       :', semEspelho);
  console.log('  ✗ results divergentes    :', divergentes);
  if (problemas.length) {
    console.log('\nDIVERGÊNCIAS (fonte = matches):');
    problemas.slice(0, 20).forEach((p) => {
      const a = p.ausentes && p.ausentes.length ? 'ausentes=' + p.ausentes.length : '';
      const d = p.diferentes && p.diferentes.length ? 'divergentes=' + p.diferentes.length : '';
      console.log('  ·', String(p.nome).slice(0, 34).padEnd(34), [a, d].filter(Boolean).join(' '), '[' + p.id + ']');
      if (DETALHE) {
        if (p.ausentes && p.ausentes.length) console.log('      ausentes: ' + p.ausentes.join(', '));
        if (p.diferentes && p.diferentes.length) console.log('      divergentes: ' + p.diferentes.map((x) => x.id + ' (' + x.campos.join(', ') + ')').join(', '));
      }
    });
  }
  console.log('\n' + (semEspelho || divergentes
    ? '⛔ espelho de resultado requer decisão de correção; fonte matches permanece intacta'
    : '✅ cada jogo canônico possui results com assinatura compatível'));
  /* ⛔ NADA DE `process.exit()` AQUI. Quando o stdout é um PIPE (que é como qualquer
   * ferramenta de CI captura este script), a escrita no Node é ASSÍNCRONA — e `process.exit()`
   * derruba o processo antes do buffer esvaziar. O sintoma é o pior possível para uma
   * auditoria: exit code correto e SAÍDA VAZIA, ou seja, um veredito que não chega a ninguém.
   * Foi exatamente o que o Codex viu, duas vezes. `process.exitCode` deixa o processo terminar
   * sozinho, depois do flush — mesmo código de saída, sem perder o que foi impresso.
   * exit 0 = auditoria concluída sem divergência · exit 1 = divergência OU leitura inconclusiva. */
  process.exitCode = (semEspelho || divergentes) ? 1 : 0;
})().catch((e) => {
  /* ⛔ AUDITORIA QUE NÃO TERMINOU NÃO TEM RESUMO. Antes isto imprimia o objeto de erro cru e
   * saía 1 — sem dizer QUAL leitura morreu nem quantas tentativas houve, e sem deixar claro
   * que nenhum contador foi produzido. Um relatório precisa distinguir "conferi e está ok"
   * de "não consegui conferir", e a segunda linha é a que costuma ser lida errado. */
  console.error('\n⛔ AUDITORIA NÃO CONCLUÍDA — nenhum contador foi produzido.');
  if (e && e.spLeituraFalhou) {
    console.error('   causa      : ' + e.spCausa);
    console.error('   operação   : ' + e.spOperacao);
    console.error('   url        : ' + e.spUrl);
    console.error('   tentativas : ' + e.spTentativas);
    console.error('\n   Isto NÃO diz que o espelho está certo nem errado — diz que a leitura falhou.');
    console.error('   Se for rede lenta, dá pra afrouxar: SP_FETCH_TIMEOUT_MS / SP_FETCH_TENTATIVAS.');
  } else {
    console.error(e);
  }
  process.exitCode = 1;   // ⛔ exitCode, não exit(): ver a nota acima — exit() come o diagnóstico
});
