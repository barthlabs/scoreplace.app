#!/usr/bin/env node
/* GOLDEN MASTER DA ELIMINATÓRIA — a metade que o motor-golden NÃO alcança.
 *
 * POR QUÊ ESTE ARQUIVO EXISTE, separado do motor-golden:
 * O `motor-golden-master.js` congela (a) a rodada que o motor geraria na fase
 * CLASSIFICATÓRIA e (b) a leitura viva (classificação, desempate, campeão). Nenhum dos
 * dois toca o AVANÇO DE FASE — e é justamente a eliminatória do Confra que ainda não
 * aconteceu e que o dono autorizou a mexer ("tudo o que se refere à R2 ainda não foi
 * feito e teremos tempo para testar em sandbox antes de avançar a fase eliminatória").
 * Refactor no motor que mude os confrontos da eliminatória passaria batido sem isto.
 *
 * O QUE ELE CONGELA: rodando `_advanceMultiPhase` sobre o SANDBOX do Confra — cópia fiel
 * do torneio real, com os 33 grupos, 104 jogos e o elenco de 137 — depois de completar a
 * R1 de forma determinística. Guarda os confrontos gerados (com uid, que é a identidade)
 * e a classificação por grupo que os alimentou. Diferença depois do refactor = regressão.
 *
 * ⚠️ POR QUE PRECISA COMPLETAR A R1: `phaseComplete(t)` — o guard do avanço — exige TODOS
 * os jogos da fase decididos, e o Confra tem 6 de 104. Sem completar, o motor recusa
 * avançar e o retrato ficaria vazio, ou seja: um teste verde que não testa nada.
 *
 * ⚠️ O placar sintético é DESENHADO, não decorativo — ver o bloco antes do laço.
 *
 * COBERTURA MEDIDA (sabotando cada degrau do comparador e vendo se este teste fica
 * vermelho — não é alegação, é medição; refazer sempre que o placar sintético mudar):
 *     1 wins ✅ · 2 setsDiff ✅ · 3 setsWon ❌ · 4 gamesDiff ✅ · 5 gamesWon ❌
 *     6 tiebreaksDiff ✅ · 7 tiebreaksWon ❌ · 8 pointsDiff ❌ · 9 pointsFor ❌
 * O padrão dos ❌ é o mesmo e é ESTRUTURAL: cada par (diff, won) tem o `diff` na frente,
 * e ele resolve antes — pra alcançar o `won` seriam precisos dois jogadores com saldo
 * IGUAL e totais diferentes, que o sorteio não produz de propósito. `pointsDiff`/
 * `pointsFor` estão no fim da fila e nunca são atingidos. Ou seja: os 4 degraus que
 * DECIDEM classificação neste torneio estão travados; os outros são desempate do
 * desempate. Declarado aqui pra ninguém ler este arquivo como cobertura total.
 *
 * Uso:
 *   node tests/eliminatoria-golden-master.js --gravar   → grava a fixture
 *   node tests/eliminatoria-golden-master.js            → compara (exit 1 se mudou)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FIX = path.join(__dirname, 'fixtures');
const PROD = path.join(FIX, 'prod-tournaments.json');
const GOLDEN = path.join(FIX, 'eliminatoria-golden.json');
const GRAVAR = process.argv.indexOf('--gravar') !== -1;

if (!fs.existsSync(PROD)) {
  console.log('⏭️  eliminatoria-golden-master: PULADO — falta ' + path.relative(process.cwd(), PROD));
  console.log('    (gere com: node scripts/baixar-torneios.js)');
  process.exit(0);
}

const tours = JSON.parse(fs.readFileSync(PROD, 'utf8'));
// O alvo é o sandbox multifase com fase classificatória sorteada. Escolhido por FORMA,
// não por id: id de sandbox muda a cada vez que o dono cria um novo.
const alvo = tours.filter(function (t) {
  return t && Array.isArray(t.phases) && t.phases.length >= 2
    && Array.isArray(t.rounds) && t.rounds.length
    && t.rounds.some(function (r) { return r && Array.isArray(r.monarchGroups) && r.monarchGroups.length; });
}).sort(function (a, b) { // maior primeiro: o mais rico é o que mais cobre
  return (b.participants || []).length - (a.participants || []).length;
})[0];

if (!alvo) {
  console.log('⏭️  eliminatoria-golden-master: PULADO — nenhum torneio multifase com');
  console.log('    fase classificatória sorteada na fixture (crie um SB do Confra e rebaixe).');
  process.exit(0);
}

const H = require('./render-harness');
const W = H.sandbox;

const T0 = 1786700000000;
function semear(seed) {
  // ⚠️ Instala DENTRO do contexto do vm — no Node os globais do host não são os mesmos
  // que o código sob teste enxerga (mesma armadilha já documentada no motor-golden).
  // Date.now entra junto porque o id do jogo o carrega: sem congelar, o retrato mudaria
  // a cada execução e o teste viraria ruído.
  vm.runInContext(
    '(function(){var a=' + (seed >>> 0) + ';' +
    'Math.random=function(){a|=0;a=(a+0x6D2B79F5)|0;' +
    'var t=Math.imul(a^(a>>>15),1|a);' +
    't=(t+Math.imul(t^(t>>>7),61|t))^t;' +
    'return ((t^(t>>>14))>>>0)/4294967296;};' +
    'Date.now=function(){return ' + T0 + ';};})()', W);
}
function estavel(v) {
  if (Array.isArray(v)) return v.map(estavel);
  if (v && typeof v === 'object') {
    const o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = estavel(v[k]); }); return o;
  }
  return v;
}

const t = JSON.parse(JSON.stringify(alvo));

// ⚠️ O doc do Firestore vem DOBRADO: os monarchGroups guardam só `matchIds` e o jogo mora
// UMA vez em round.matches. O app hidrata isso no ingest (onSnapshot/cache). Sem este
// passo, `phaseComplete` lê g.matches vazio e a fase NUNCA completa — parece bug de
// produção e é só o passo de leitura faltando no harness.
if (typeof W._hydrateMonarchGroups !== 'function') { console.log('❌ _hydrateMonarchGroups ausente'); process.exit(1); }
W._hydrateMonarchGroups(t);

// Perfis: o elenco é só-uid (o strip da v1.3.52 remove o nome de toda entrada com uid),
// então sem cache de perfil o motor descarta os 137 e sorteia zero.
const cache = {}, porUid = {};
(function varre(n) {
  if (Array.isArray(n)) return n.forEach(varre);
  if (!n || typeof n !== 'object') return;
  // ⚠️ NOME CONHECIDO NUNCA PERDE PRO FALLBACK. O mesmo uid aparece em vários lugares do
  // doc, e em alguns deles sem rótulo (o strip da v1.3.52 tira o nome de toda entrada com
  // uid). Sobrescrevendo sempre, a ÚLTIMA ocorrência vencia e o perfil ficava com o nome
  // sintético do fallback — o retrato virava ilegível sem nenhum motivo real.
  const põe = function (u, nome) {
    if (!u) return;
    if (nome) { cache[u] = { uid: u, displayName: nome }; porUid[u] = nome; return; }
    if (cache[u]) return;                                    // já tem nome de verdade
    const x = 'P' + String(u).slice(-4);
    cache[u] = { uid: u, displayName: x }; porUid[u] = x;
  };
  if (n.uid) põe(n.uid, n.displayName || n.name);
  [['team1Uids', 'team1'], ['team2Uids', 'team2'], ['playersUids', 'players']].forEach(function (par) {
    if (!Array.isArray(n[par[0]])) return;
    const nomes = n[par[1]];
    n[par[0]].forEach(function (u, i) { põe(u, Array.isArray(nomes) ? nomes[i] : null); });
  });
  Object.keys(n).forEach(function (k) { varre(n[k]); });
})(t);
W._userProfileCache = cache;
W._profileNameByUid = porUid;

// ── completa a fase classificatória (é o estado em que o avanço acontece de verdade) ──
// ⚠️ O PLACAR SINTÉTICO É DESENHADO PRA EXERCITAR A CADEIA DE DESEMPATE, não pra ser
// bonito. Foi MEDIDO sabotando cada degrau do comparador de `_computeMonarchStandings`
// e vendo se este teste ficava vermelho:
//   • `6×N` com N variando e vencedor SEMPRE p1 cobria só  wins  e  gamesDiff.
//   • variar QUEM vence + incluir 7×6 com tie-break cobre também gamesWon e os tiebreaks
//     (o 7×6 dá gamesDiff 1 com gamesWon 7 — separa dois degraus que 6×5 funde).
// `setsDiff`/`setsWon` continuam inalcançáveis, e isso NÃO é buraco do teste: o formato
// é de UM set, então setsWon é igual a wins por construção — em produção esses degraus
// também nunca decidem nada aqui.
semear(424242);
let fechados = 0;
const rnd = function () { return vm.runInContext('Math.random()', W); };
(t.rounds || []).forEach(function (rd) {
  (rd.matches || []).forEach(function (m) {
    if (!m || m.winner || m.isSitOut || m.isBye) return;
    if (!m.p1 || !m.p2 || m.p1 === 'TBD' || m.p2 === 'TBD') return;
    const forma = rnd(), quem = rnd();
    let vg, pg, tb = null;
    if (forma < 0.6) { vg = 6; pg = Math.floor(rnd() * 5); }            // 6×0 … 6×4
    else if (forma < 0.82) { vg = 6; pg = 5; }                          // 6×5
    else { vg = 7; pg = 6; tb = [7, 3 + Math.floor(rnd() * 3)]; }       // 7×6 com tie-break
    const p1Ganha = quem < 0.5;
    m.scoreP1 = p1Ganha ? vg : pg;
    m.scoreP2 = p1Ganha ? pg : vg;
    m.winner = p1Ganha ? m.p1 : m.p2;
    const set = { gamesP1: m.scoreP1, gamesP2: m.scoreP2 };
    if (tb) set.tiebreak = { pointsP1: p1Ganha ? tb[0] : tb[1], pointsP2: p1Ganha ? tb[1] : tb[0] };
    m.sets = [set];
    m.resultAt = T0;
    delete m.pendingResult;
    fechados++;
  });
});

// O painel de inativos é DIÁLOGO (decisão do organizador) — o que se congela é o motor,
// não a escolha humana. Marcar como resolvido pula o painel sem alterar a geração.
t._inactiveResolvedPhase = (t.currentPhaseIndex || 0) + 1;

const avisos = [];
W.AppStore.tournaments = [t];
W.AppStore.currentUser = { uid: t.creatorUid, email: t.organizerEmail, displayName: 'Dev' };
W.AppStore.mutate = function (id, fn) { fn(t); return Promise.resolve(true); };
W.AppStore.commitTournamentTx = function (id, fn) { fn(t); return Promise.resolve(true); };
W.AppStore.commitDrawTx = function (id, fn) { fn(t); return Promise.resolve(true); };
W.AppStore.logAction = function () {};
W.showAlertDialog = function (a, b) { avisos.push(String(a) + ' :: ' + String(b || '').slice(0, 140)); };
W.showConfirmDialog = function (a, b, ok) { if (ok) ok(); };
W.showNotification = function () {};
W._sendUserNotification = function () {};
W._notifyTournamentParticipants = function () {};
W._rerenderBracket = function () {};
W._softRefreshView = function () {};

const faseAntes = t.currentPhaseIndex || 0;
semear(20260813);
let erro = null;
try {
  if (typeof W._advanceMultiPhase !== 'function') erro = '_advanceMultiPhase não existe';
  else W._advanceMultiPhase(t.id);
} catch (e) { erro = String((e && e.message) || e); }

// A eliminatória mora em t.matches taggeado por phaseIndex (não em t.rounds).
const elim = (t.matches || []).filter(function (m) { return (m.phaseIndex || 0) > faseAntes; });

// A classificação POR GRUPO é o que decide quem sobe — congelar só os confrontos deixaria
// passar mudança na regra de classificação que por acaso produzisse os mesmos pares.
const classifPorGrupo = [];
(t.rounds || []).forEach(function (rd) {
  (rd.monarchGroups || []).forEach(function (g, gi) {
    let linhas = [];
    try {
      const s = W._computeMonarchStandings ? W._computeMonarchStandings(g) : null;
      if (Array.isArray(s)) {
        linhas = s.map(function (x) {
          return { uid: x.uid || null, pts: x.points, v: x.wins, d: x.losses,
            pf: x.pointsFor, pc: x.pointsAgainst };
        });
      }
    } catch (e) { linhas = [{ erro: String((e && e.message) || e) }]; }
    classifPorGrupo.push({ grupo: gi, nome: g.name || null, linhas: linhas });
  });
});

const retrato = estavel({
  torneio: t.id,
  jogosFechadosParaCompletar: fechados,
  faseAntes: faseAntes,
  faseDepois: t.currentPhaseIndex,
  erro: erro,
  avisos: avisos,
  totalJogosEliminatoria: elim.length,
  eliminatoria: elim.map(function (m) {
    return { id: m.id, round: m.round, phaseIndex: m.phaseIndex, label: m.label || null,
      p1: m.p1, p2: m.p2, p1Uid: m.p1Uid || null, p2Uid: m.p2Uid || null,
      team1Uids: m.team1Uids || null, team2Uids: m.team2Uids || null,
      isBye: !!m.isBye, winner: m.winner || null, bracket: m.bracket || null };
  }),
  classificacaoPorGrupo: classifPorGrupo
});

const texto = JSON.stringify(retrato, null, 2);

if (GRAVAR) {
  fs.writeFileSync(GOLDEN, texto);
  console.log('✅ eliminatória congelada: ' + path.relative(process.cwd(), GOLDEN) +
    ' (' + elim.length + ' jogos, ' + classifPorGrupo.length + ' grupos, ' + texto.length + ' bytes)');
  process.exit(0);
}
if (!fs.existsSync(GOLDEN)) {
  console.log('⏭️  eliminatoria-golden-master: PULADO — sem retrato gravado');
  console.log('    (grave com: node tests/eliminatoria-golden-master.js --gravar)');
  process.exit(0);
}
const antes = fs.readFileSync(GOLDEN, 'utf8');
if (antes === texto) {
  console.log('✅ eliminatoria-golden-master: a eliminatória gerada está IDÊNTICA ao congelado (' +
    elim.length + ' jogos, ' + classifPorGrupo.length + ' grupos)');
  process.exit(0);
}
// diff legível: primeira divergência, não o arquivo inteiro
const a = JSON.parse(antes), b = retrato;
console.log('❌ eliminatoria-golden-master: A ELIMINATÓRIA MUDOU');
console.log('   jogos: ' + (a.totalJogosEliminatoria) + ' → ' + b.totalJogosEliminatoria +
  ' | fase: ' + a.faseDepois + ' → ' + b.faseDepois + ' | erro: ' + a.erro + ' → ' + b.erro);
const na = (a.eliminatoria || []), nb = (b.eliminatoria || []);
for (let i = 0; i < Math.max(na.length, nb.length); i++) {
  const x = JSON.stringify(na[i]), y = JSON.stringify(nb[i]);
  if (x !== y) { console.log('   1ª divergência no jogo #' + i + ':\n     antes: ' + x + '\n     agora: ' + y); break; }
}
const ca = JSON.stringify(a.classificacaoPorGrupo), cb = JSON.stringify(b.classificacaoPorGrupo);
if (ca !== cb) console.log('   ⚠️ a CLASSIFICAÇÃO por grupo também mudou');
process.exit(1);
