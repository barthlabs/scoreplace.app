#!/usr/bin/env node
/* GOLDEN MASTER DO MOTOR — retrato da saída ATUAL, para provar que um refactor não muda nada.
 *
 * POR QUÊ: a ordem do dono é "consertar o motor sem mudar o que já temos". A única forma
 * honesta de cumprir isso não é ler o diff com cuidado — é CONGELAR a saída de hoje contra
 * os documentos REAIS de produção e exigir que ela continue IDÊNTICA depois. Diferença =
 * regressão, mesmo que pareça melhoria.
 *
 * O que ele congela (as duas metades, de propósito):
 *   • GERAÇÃO (dormente hoje — nenhum sorteio agendado): a rodada que o motor produziria.
 *   • LEITURA (viva a cada tela): classificação, pontos avançados, desempate, campeão.
 * A metade viva entra porque é ela que o dono mandou NÃO mexer: se um refactor da geração
 * encostar nela sem querer, este arquivo acusa.
 *
 * ⚠️ REGRAVADO NA 1.8.62, DE PROPÓSITO. O critério `sorteio` fazia `Math.random() - 0.5`
 * DENTRO do comparador: com empate total não havia UMA ordem — ela mudava a cada render
 * (medido: 40 execuções do mesmo dado, 24× A>B e 16× B>A). Virou sorteio DETERMINÍSTICO
 * (hash da identidade + semente do torneio). PROVADO antes de regravar: nenhum número e
 * nenhum campeão mudaram em torneio nenhum — só a ordem ENTRE EMPATADOS, que antes dançava.
 * No Confra isso vale pras 131 pessoas ainda sem jogo, que embaralhavam a cada tela.
 *
 * Uso:
 *   node tests/motor-golden-master.js --gravar    → grava tests/fixtures/motor-golden.json
 *   node tests/motor-golden-master.js             → compara com o gravado (exit 1 se mudou)
 *
 * As fixtures são os docs REAIS baixados de produção (tests/fixtures/prod-tournaments.json,
 * gerado por scripts/baixar-torneios.js). Sem elas, o teste PULA — nunca finge que passou.
 */
const fs = require('fs');
const path = require('path');

const FIX_DIR = path.join(__dirname, 'fixtures');
const PROD = path.join(FIX_DIR, 'prod-tournaments.json');
const GOLDEN = path.join(FIX_DIR, 'motor-golden.json');
const GRAVAR = process.argv.indexOf('--gravar') !== -1;

if (!fs.existsSync(PROD)) {
  console.log('⏭️  motor-golden-master: PULADO — falta ' + path.relative(process.cwd(), PROD));
  console.log('    (gere com: node scripts/baixar-torneios.js)');
  process.exit(0);
}

const H = require('./render-harness');
const W = H.sandbox;
const tours = JSON.parse(fs.readFileSync(PROD, 'utf8'));

// ⚠️ SORTEIO É ALEATÓRIO — sem semear, o retrato mudaria a cada execução e o teste
// viraria ruído. Substitui Math.random por um PRNG determinístico (mulberry32) e o
// RESSEMEIA antes de cada torneio, pra a saída de um não depender de quantos números
// o anterior consumiu. Não é maquiagem: com a MESMA sequência de aleatórios, mudança
// na saída só pode vir de mudança na LÓGICA — que é exatamente o que se quer pegar.
// ⚠️ Instala DENTRO do contexto do vm: no Node, os globais padrão (Math, Date…) não são
// propriedades do objeto sandbox, então `W.Math` é undefined — quem enxerga o Math que o
// motor usa é código rodando no próprio contexto.
const vm = require('vm');
// Instante FIXO. O motor carimba `Date.now()` no ID do jogo (`match-r1-0-1786646177976`)
// e em createdAt/resultAt — sem congelar, cada execução produz ids diferentes e o retrato
// nunca fecha. Congelar só `Date.now` (não o construtor Date) basta e é o mínimo: o resto
// do app continua enxergando datas normais.
const T0 = 1786646400000; // 2026-08-13 12:00 UTC — número fixo, escolhido e não "agora"
function semear(seed) {
  vm.runInContext(
    '(function(){var a=' + (seed >>> 0) + ';' +
    'Math.random=function(){a|=0;a=(a+0x6D2B79F5)|0;' +
    'var t=Math.imul(a^(a>>>15),1|a);' +
    't=(t+Math.imul(t^(t>>>7),61|t))^t;' +
    'return ((t^(t>>>14))>>>0)/4294967296;};' +
    'Date.now=function(){return ' + T0 + ';};})()', W);
}

// Ordena chaves recursivamente: o Firestore não preserva ordem, e sem isto o diff
// acusaria mudança onde só a ordem das chaves variou (a armadilha da v1.7.72).
function estavel(v) {
  if (Array.isArray(v)) return v.map(estavel);
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).sort().forEach(function (k) { out[k] = estavel(v[k]); });
    return out;
  }
  return v;
}
const clone = (o) => JSON.parse(JSON.stringify(o));

// ⚠️ SEM PERFIL O MOTOR NÃO SORTEIA — e isso não é bug, é o desenho. O storage é SÓ-UID
// (identity-core tira o nome de toda entrada cujo uid resolve), então `_generateNextRound`
// começa chamando `_rehydrateEntryNames`, que reidrata o nome a partir do PERFIL VIVO. Num
// harness sem perfil nenhum o nome fica vazio e `_getActiveLigaPlayers` descarta todo
// mundo: MEDIDO, o Confra (137 inscritos) devolvia `{}` e gerava 0 rodadas — foi por isso
// que a geração de Liga/Rei-Rainha ficou fora do retrato na primeira versão deste arquivo.
// Aqui os perfis são semeados a partir dos uids do próprio doc, com o nome sintético que a
// fixture já carrega. Determinístico e sem inventar identidade: o uid continua sendo a
// identidade, o nome é só rótulo. [[project_uid_identity_canon_locked]]
function semearPerfis(t) {
  const cache = {}, porUid = {};
  const põe = (uid, nome) => {
    if (!uid) return;
    const n = nome || ('Pessoa ' + String(uid).slice(-4));
    cache[uid] = { uid: uid, displayName: n, gender: '', birthDate: '' };
    porUid[uid] = n;
  };
  const varre = (node) => {
    if (Array.isArray(node)) return node.forEach(varre);
    if (!node || typeof node !== 'object') return;
    if (node.uid) põe(node.uid, node.displayName || node.name);
    if (node.p1Uid) põe(node.p1Uid, node.p1Name);
    if (node.p2Uid) põe(node.p2Uid, node.p2Name);
    ['team1Uids', 'team2Uids', 'playersUids', 'memberUids'].forEach((k) => {
      const arr = node[k];
      if (!Array.isArray(arr)) return;
      const nomes = node[k === 'team1Uids' ? 'team1' : k === 'team2Uids' ? 'team2' : 'players'];
      arr.forEach((u, i) => põe(u, Array.isArray(nomes) ? nomes[i] : null));
    });
    Object.keys(node).forEach((k) => varre(node[k]));
  };
  varre(t);
  W._userProfileCache = cache;
  W._profileNameByUid = porUid;
  return Object.keys(cache).length;
}

function categorias(t) {
  try {
    if (typeof W._getTournamentCategories === 'function') {
      const c = W._getTournamentCategories(t);
      if (Array.isArray(c) && c.length) return c;
    }
  } catch (e) {}
  return [null];
}

function retratoDeUmTorneio(tRaw) {
  const r = { id: tRaw.id, nome: tRaw.name, formato: tRaw.format, modo: tRaw.drawMode || null,
              rodadaFmt: tRaw.ligaRoundFormat || null, perfisSemeados: semearPerfis(tRaw),
              leitura: {}, geracao: {} };

  // ── METADE VIVA (roda a cada tela): classificação e derivados ──
  categorias(tRaw).forEach(function (cat) {
    const chave = cat == null ? '_geral_' : String(cat);
    // semeia TAMBÉM aqui: o critério de desempate 'sorteio' (configurável pelo
    // organizador) usa Math.random, então dois jogadores empatados em TUDO trocam
    // de posição a cada leitura — por desenho, não por defeito. Sem semear, o
    // retrato mudaria sozinho e o teste viraria ruído.
    semear(20260813);
    const t = clone(tRaw);
    try {
      r.leitura[chave] = {
        standings: (typeof W._computeStandings === 'function') ? estavel(W._computeStandings(t, cat)) : 'n/d',
        campeao: (typeof W._getChampion === 'function') ? (W._getChampion(t) || null) : 'n/d'
      };
    } catch (e) { r.leitura[chave] = { erro: String(e && e.message || e) }; }
  });

  // classificação dos grupos Rei/Rainha (a outra tabela viva)
  try {
    const grupos = [];
    (tRaw.rounds || []).forEach(function (rd, ri) {
      (rd && rd.monarchGroups || []).forEach(function (g, gi) {
        semear(20260813);
        const t = clone(tRaw);
        const gg = t.rounds[ri].monarchGroups[gi];
        grupos.push({ rodada: ri, grupo: gi,
          standings: (typeof W._computeMonarchStandings === 'function')
            ? estavel(W._computeMonarchStandings(gg, t, gg && gg.category)) : 'n/d' });
      });
    });
    if (grupos.length) r.leitura._monarch = grupos;
  } catch (e) { r.leitura._monarch = { erro: String(e && e.message || e) }; }

  // ── METADE DORMENTE (só no sorteio): o que a PRÓXIMA rodada seria ──
  // Roda sobre uma CÓPIA — nunca toca o doc de produção nem o fixture.
  try {
    semear(20260813);            // MESMA semente pra todo torneio → retrato reprodutível
    const t = clone(tRaw);
    const antes = (t.rounds || []).length;
    if (typeof W._generateNextRound === 'function') {
      W._generateNextRound(t);
      const depois = (t.rounds || []).length;
      r.geracao = {
        rodadasAntes: antes, rodadasDepois: depois,
        // só a(s) rodada(s) ACRESCENTADA(s) — é o produto do motor
        novas: estavel((t.rounds || []).slice(antes))
      };
    } else r.geracao = 'n/d';
  } catch (e) { r.geracao = { erro: String(e && e.message || e) }; }

  // ── METADE DORMENTE, 2º cenário: RODADA FECHADA ────────────────────────────────
  // MEDIDO: com o doc como está, 3 dos 8 torneios não geram nada — entre eles o CONFRA,
  // o maior (Liga + Rei/Rainha, 136 inscritos), porque a rodada atual tem jogo pendente e
  // o motor corretamente se recusa a sortear a próxima. Sem isto o golden cobriria só a
  // geração de eliminatória simples e deixaria de fora exatamente o caminho onde a
  // ramificação por formato se concentra. Aqui a rodada é FECHADA numa cópia (vencedor
  // pelo placar, ou o lado 1 quando não há placar) só pra destravar o motor — o doc de
  // produção não é tocado, e o que se congela é o que o motor PRODUZ a partir daí.
  try {
    semear(20260813);
    const t = clone(tRaw);
    let fechados = 0;
    (t.rounds || []).forEach(function (rd) {
      const alvos = [].concat(rd && rd.matches || []);
      (rd && rd.monarchGroups || []).forEach(function (g) { [].push.apply(alvos, (g && g.matches) || []); });
      alvos.forEach(function (m) {
        if (!m || m.winner || m.isSitOut || m.isBye) return;
        if (!m.p1 || !m.p2 || m.p1 === 'TBD' || m.p2 === 'TBD' || m.p1 === 'BYE' || m.p2 === 'BYE') return;
        const a = Number(m.scoreP1), b = Number(m.scoreP2);
        m.winner = (!isNaN(a) && !isNaN(b) && b > a) ? m.p2 : m.p1;
        if (isNaN(a) || isNaN(b)) { m.scoreP1 = 6; m.scoreP2 = 3; }
        delete m.pendingResult;
        fechados++;
      });
    });
    const antes = (t.rounds || []).length;
    if (typeof W._generateNextRound === 'function') W._generateNextRound(t);
    r.geracaoAposFechar = {
      jogosFechadosParaDestravar: fechados,
      rodadasAntes: antes, rodadasDepois: (t.rounds || []).length,
      novas: estavel((t.rounds || []).slice(antes))
    };
  } catch (e) { r.geracaoAposFechar = { erro: String(e && e.message || e) }; }

  return r;
}

const retrato = tours.map(retratoDeUmTorneio);
const texto = JSON.stringify(estavel(retrato), null, 2);

if (GRAVAR) {
  if (!fs.existsSync(FIX_DIR)) fs.mkdirSync(FIX_DIR, { recursive: true });
  fs.writeFileSync(GOLDEN, texto);
  console.log('✅ golden gravado: ' + path.relative(process.cwd(), GOLDEN) + ' (' + texto.length + ' bytes, ' + retrato.length + ' torneios)');
  process.exit(0);
}

if (!fs.existsSync(GOLDEN)) {
  console.log('⏭️  motor-golden-master: PULADO — golden ainda não gravado (rode com --gravar)');
  process.exit(0);
}

const esperado = fs.readFileSync(GOLDEN, 'utf8');
if (esperado === texto) {
  console.log('✅ motor-golden-master: a saída do motor está IDÊNTICA ao congelado (' + retrato.length + ' torneios)');
  process.exit(0);
}

// diff legível: aponta O QUE mudou, por torneio e por seção
const A = JSON.parse(esperado), B = JSON.parse(texto);
const difs = [];
B.forEach(function (novo, i) {
  const velho = A[i];
  if (!velho) { difs.push('torneio NOVO no fixture: ' + novo.nome); return; }
  ['leitura', 'geracao'].forEach(function (sec) {
    const a = JSON.stringify(velho[sec]), b = JSON.stringify(novo[sec]);
    if (a !== b) difs.push(novo.nome + ' → ' + sec.toUpperCase() + ' MUDOU (' +
      (a || '').length + 'b → ' + (b || '').length + 'b)');
  });
});
console.error('❌ motor-golden-master: A SAÍDA DO MOTOR MUDOU');
difs.forEach(function (d) { console.error('   ✗ ' + d); });
console.error('\n   Se a mudança for INTENCIONAL, regrave com --gravar e explique no commit.');
console.error('   Se não for, é regressão: o refactor tinha que preservar a saída.');
process.exit(1);
