/* AMISTOSO É PARTIDA — e é ele que fechava a conta — node tests/lz-amistoso-fecha-a-conta.test.js
 *
 * REPRODUZ O RELATO REAL do dono (07/ago/2026), sobre o Fábio Simão:
 *   "ele diz que concluiu, mas não empata os dados nem deixa verde o nome dele em análise.
 *    continua roxo e incompleto."   ·   "fabio é só o exemplo. tem que funcionar com todos"
 *
 * MEDIDO EM PRODUÇÃO ANTES DE MEXER (users/{uid}.letzplayImport + o índice público):
 *   • índice do letzplay:  119 linhas · 118 partidas distintas (1 card repetido na virada
 *     de página, id 8829910) — é o `cardsRepetidos: 1` que o doc já gravava;
 *   • acervo gravado:      117 jogos, TODOS com lzId, cursor `complete: true`, 6/6 páginas;
 *   • diff índice × acervo: falta EXATAMENTE 1 id — o `3728225`.
 *
 * O QUE ELE É: `matchable_type: "User"` no índice — uma partida AVULSA, fora de ranking e
 * fora de torneio. O card existe, tem os 4 jogadores e o placar (4×6, 18/04/24), e o
 * título dele é só "Amistoso": não há link de competição nenhum.
 *
 * A CAUSA: `extractMatchesFromDoc` abria com `if (!comp) return;` — sem link de competição,
 * o card inteiro era descartado. Como a completude da leitura é "tenho todos os ids que o
 * índice enumera?", o acervo ficava devendo 1 PARA SEMPRE:
 *   → a barra parava em "117 de 119 (98%)";
 *   → `_lzImportComplete` reprovava (117 < indexTotal 118);
 *   → e o verde (que é ABSOLVIÇÃO e exige leitura completa) virava VIOLETA.
 * Não é um caso do Fábio: vale para QUALQUER atleta que tenha um amistoso na conta.
 *
 * Este teste FALHA no código antigo (o extrator devolve [] para o card real do amistoso, e
 * com 117 jogos o nome sai violeta) e PASSA no novo.
 * Ver [[project_letzplay_green_needs_new_engine_and_recent]], [[feedback_tests_must_reproduce_real_failure]].
 */
// O extrator só faz sentido contra DOM DE VERDADE (querySelectorAll, classes, aninhamento),
// então ele roda num Chromium — o mesmo caminho de tests/letzplay-big-profile.test.js. O
// resto (relatório e varredura de código) é Node puro.
const fs = require('fs'), path = require('path');
const { chromium } = require('@playwright/test');
const { window, sandbox, load } = require('./headless.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── O CARD REAL DO AMISTOSO ────────────────────────────────────────────────────────
// Copiado de letzplay.me/FabioSimaoB/matches?page=6 em 07/ago/2026. Só os `src=` das fotos
// foram encurtados (são URLs do Cloudinary e não participam da extração); classes,
// aninhamento, o `match-3728225-schedule` e os textos estão como a fonte serve.
const CARD_AMISTOSO = `
<div class="row match">
  <div class="col-xs-10 match-title small text-overflow text-muted text-semibold pad-rgt-no">
    <i class="fa fa-user-plus"></i>&nbsp; Amistoso
  </div>
  <div class="col-xs-2 match-title small text-semibold text-right"></div>
  <div class="col-xs-12" style="padding:0px;">
    <div class="row match-player add-tooltip">
      <div class="col-xs-11">
        <div class="match-player-info"><a href="/FabioSimaoB"><img class="img-xs" src="x.webp"></a></div>
        <div class="match-player-info"><a href="/MarcelloGomiero"><img class="img-xs" src="x.webp"></a></div>
        <div class="match-player-result"><i class="fa fa-times-circle text-danger"></i></div>
        <div class="match-player-info">
          <!-- ⚠️ AS QUEBRAS DE LINHA IMPORTAM. O card real serve os nomes em linhas
               separadas dentro do span; o textContent só vira "Fábio Simão Marcello
               Gomiero" por causa desse espaço em branco. Escrito grudado
               (Simão + br + Marcello, sem espaço) o mapeador de nome↔handle produz
               "SimãoMarcello Gomiero" — foi o que aconteceu na 1ª versão desta fixture,
               e como não havia asserção de NOME o teste ficou verde com nome errado. -->
          <span class="match-players-double">
            Fábio Simão
            <br>
            Marcello Gomiero
          </span>
        </div>
      </div>
      <div class="match-results-points">
        <div class="col-xs-1 text-center match-points pad-no no-highlight vertical-center">4<sub></sub></div>
      </div>
    </div>
    <div class="row match-player add-tooltip">
      <div class="col-xs-11">
        <div class="match-player-info"><a href="/JoaoScassa"><img class="img-xs" src="x.webp"></a></div>
        <div class="match-player-info"><a href="/LeandroAzevedo9"><img class="img-xs" src="x.webp"></a></div>
        <div class="match-player-result"><i class="fa fa-check-circle text-success"></i></div>
        <div class="match-player-info">
          <span class="match-players-double">
            João Scassa
            <br>
            Leandro Azevedo
          </span>
        </div>
      </div>
      <div class="match-results-points">
        <div class="col-xs-1 text-center match-points pad-no highlight vertical-center"><strong>6</strong></div>
      </div>
    </div>
  </div>
  <div class="col-xs-12 match-footer small text-muted text-semibold">
    <span class="match-3728225-schedule">Quinta, 18/04/24</span>
  </div>
</div>`;

// Card de ranking REAL da mesma página — a regressão que não pode quebrar.
const CARD_RANKING = `
<div class="row match">
  <div class="col-xs-10 match-title small text-overflow text-muted text-semibold pad-rgt-no">
    <a class="text-muted" href="/7BT-CPM/rankings/31141">
      <i class="fa fa-list-ol"></i>&nbsp; RanKING Muzik Pro 7BT 2025 <small>•</small> Rodada: 1</a>
  </div>
  <div class="col-xs-12" style="padding:0px;">
    <div class="row match-player">
      <div class="col-xs-11">
        <div class="match-player-info"><a href="/FabioSimaoB"><img src="x.webp"></a></div>
        <div class="match-player-info"><a href="/MarcioBBG"><img src="x.webp"></a></div>
        <div class="match-player-info">
          <span class="match-players-double">Fábio Simão<br>Marcio Bolognini</span>
        </div>
      </div>
      <div class="match-results-points">
        <div class="col-xs-1 match-points">3<sub></sub></div>
      </div>
    </div>
    <div class="row match-player">
      <div class="col-xs-11">
        <div class="match-player-info"><a href="/FabioRey"><img src="x.webp"></a></div>
        <div class="match-player-info"><a href="/Leandrofc30"><img src="x.webp"></a></div>
        <div class="match-player-info">
          <span class="match-players-double">Fabio Rey<br>Leandro Costa</span>
        </div>
      </div>
      <div class="match-results-points">
        <div class="col-xs-1 match-points"><strong>6</strong></div>
      </div>
    </div>
  </div>
  <div class="col-xs-12 match-footer">
    <span class="match-5561788-schedule">Quarta, 05/02/25</span>
  </div>
</div>`;

(async () => {
// ── 1) O EXTRATOR, EM DOM DE VERDADE ───────────────────────────────────────────────
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({
  content: fs.readFileSync(path.join(__dirname, '..', 'extension', 'lib', 'letzplay-extract.js'), 'utf8') });
// extrai `html` como se fosse uma página /{handle}/matches, do ponto de vista de `me`
async function extrair(html, me) {
  return await page.evaluate(function (a) {
    var d = document.implementation.createHTMLDocument('t');
    d.body.innerHTML = a.html;
    return window._spExtract.extractMatchesFromDoc(d, a.me);
  }, { html: html, me: me });
}

console.log('\n📋 O card "Amistoso" vira jogo (era descartado inteiro)');
const gAmi = await extrair(CARD_AMISTOSO, 'FabioSimaoB');
ok(gAmi.length === 1, 'o amistoso é extraído (código antigo devolvia [] — o id sumia)');
const A = gAmi[0] || {};
ok(A.lzId === '3728225', 'traz o id do letzplay (3728225) — é ele que fecha o índice');
ok(A.kind === 'amistoso', 'kind = amistoso (não vira "ranking" por omissão)');
ok(A.official === false, 'não é oficial');
ok(A.club === null && A.rankingId === null && A.tourneyId === null,
  'sem competição: club/rankingId/tourneyId ficam nulos, não inventados');
ok(A.partnerHandle === 'MarcelloGomiero', 'parceiro = Marcello Gomiero (handle)');
ok((A.oppHandles || []).join(',') === 'JoaoScassa,LeandroAzevedo9', 'adversários = João e Leandro (handles)');
// NOME TAMBÉM É DADO — e é o que aparece na tela. Sem estas asserções, a 1ª versão desta
// fixture passou verde produzindo "SimãoMarcello Gomiero" e "ScassaLeandro Azevedo".
ok(A.partnerName === 'Marcello Gomiero', 'nome do parceiro sai inteiro e sozinho');
ok((A.oppNames || []).join(' · ') === 'João Scassa · Leandro Azevedo',
  'nomes dos adversários saem separados corretamente');
ok(A.myScore === 4 && A.oppScore === 6 && A.won === false, 'placar 4×6, derrota');
ok(/18\/04\/24/.test(A.date || ''), 'data do card (18/04/24)');

console.log('\n📋 O que continua de fora');
const semIdSemComp = CARD_AMISTOSO.replace('match-3728225-schedule', 'match-footer-x');
ok((await extrair(semIdSemComp, 'FabioSimaoB')).length === 0,
  'card sem competição E sem id do letzplay continua descartado (não há identidade)');
ok((await extrair(CARD_AMISTOSO, 'OutraPessoa')).length === 0,
  'amistoso de terceiros não entra no acervo de quem não jogou');

console.log('\n📋 Regressão: o card de ranking não mudou');
const gRk = await extrair(CARD_RANKING, 'FabioSimaoB');
ok(gRk.length === 1 && gRk[0].kind === 'ranking', 'ranking segue kind=ranking');
ok(gRk[0].club === '7BT-CPM' && gRk[0].rankingId === '31141', 'e mantém clube + id do ranking');
ok(gRk[0].official === false && gRk[0].tourneyId === null, 'ranking não é oficial');

// ── 2) AMISTOSO NÃO INVENTA COMPETIÇÃO ─────────────────────────────────────────────
// Partida sem competição não tem onde pendurar: o modelo canônico já a mantém fora dos
// docs de competição (`hasRealComp`), e isso é deliberado. Ela soma em JOGOS e em mais nada.
require('vm').runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'letzplay-model.js'), 'utf8'),
  sandbox, { filename: 'letzplay-model.js' });
console.log('\n📋 O amistoso não vira competição fantasma');
const M = window._spLzModel;
const so = M.historyDocs({ games: [gRk[0]], handle: 'FabioSimaoB' }, 'FabioSimaoB');
const com = M.historyDocs({ games: [gRk[0], A], handle: 'FabioSimaoB' }, 'FabioSimaoB');
ok(com.comps.length === so.comps.length,
  'somar um amistoso NÃO cria competição nova (' + so.comps.length + ' antes e depois)');
ok(com.skipped === so.skipped + 1, 'ele é contado como pulado, explicitamente');

// ── 3) PONTA A PONTA: a conta fecha e o nome fica VERDE ────────────────────────────
// Dado REAL de produção (users/tqlM4F93McQD2vJTffvApiIIXw12.letzplayImport, 07/ago/2026
// 12:05Z). Os 117 ids são os que estavam gravados; o 118º é o que o EXTRATOR acabou de
// produzir logo acima — é essa a amarração: o conserto do extrator é o que fecha a barra.
load('tournaments-enrollment-report.js');
const IDS_REAIS = ('10081613 10081599 9690012 9690011 9690013 9642603 9642604 9642605 9491251 9491252 ' +
  '9491253 9489575 9489573 9489574 9350151 9353478 9350153 9350152 9353476 9353477 9220355 9220353 ' +
  '9220354 9221178 9221180 9221179 9088686 9088684 9088685 9089556 9089557 9089558 8958498 8958497 ' +
  '8958055 8958053 8958499 8958054 8829908 8829910 8830541 8830540 8830539 8660649 8660648 8660650 ' +
  '8672280 8672279 8672281 8551737 8551735 8551736 8427143 8427145 8427144 7814470 7814468 7814469 ' +
  '7770419 7770420 7770418 7688518 7688517 7688519 7497310 7497312 7497311 7433041 7433042 7433043 ' +
  '7372729 7372730 7372728 7232349 7232347 7232348 7174325 7174327 7174326 7063268 7063266 7063267 ' +
  '5959111 5959110 5959112 5847901 5847903 5847902 5790639 5790640 5790641 5690808 5690809 5690810 ' +
  '5686318 5686316 5686317 5561789 5561790 5561788 4869755 4869754 4869753 4769869 4769871 4769870 ' +
  '4669207 4669208 4669206 4567141 4567142 4567143 4206195 4206193 4206192 4016500 4016499').split(' ');

// footprint REAL (os campos que _lzEvidence lê), 5 rankings + 3 torneios, nenhum com título
const FOOTPRINT = [
  { official: false, title: false, categoryRaw: 'Masc D+', winPct: 31, club: 'paineiras-bt', rankingId: '48552' },
  { official: false, title: false, categoryRaw: 'Rodada: 9', winPct: 11.5, club: '7BT-CPM', rankingId: '45604' },
  { official: false, title: false, categoryRaw: 'Rodada: 19', winPct: 22.2, club: '7BT-CPM', rankingId: '31141' },
  { official: false, title: false, categoryRaw: 'Masculina D', winPct: 40, club: 'paineiras-bt', rankingId: '33695' },
  { official: false, title: false, categoryRaw: 'Rodada: 5', winPct: 25, club: 'paineiras-bt', rankingId: '28505' },
  { official: true, title: false, categoryRaw: 'Masculina D', club: 'paineiras-bt', tourneyId: '335721' },
  { official: true, title: false, categoryRaw: '2º EDIÇÃO PLAY FOR WISHES - MASCULINO D', club: 'playforwishes', tourneyId: '161214' },
  { official: true, title: false, categoryRaw: '2º BT Open Arena Beach Power - MASCULINA D', club: 'beachpower', tourneyId: '147262' }
];
function impFabio(games) {
  return {
    handle: 'FabioSimaoB', source: 'letzplay', version: 2,
    importedAt: new Date().toISOString(),          // leitura de hoje (verde exige < 3 meses)
    games: games, gamesTotal: games.length,
    indexTotal: 118, declaredGames: 119, declaredTournaments: 3, declaredRankings: 5,
    totais: { fonte: 'indice', jogos: 118, torneios: 3, rankings: 5, cardsRepetidos: 1 },
    officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    rating: { value: 1462, band: 'D+/C-', fromCategory: 'Masc D+', played: 29 },
    footprint: FOOTPRINT, partialReason: null,
    lzCursor: { complete: true, pagesTotal: 6, pageDone: 6,
      pagesRead: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 } }
  };
}
const UID = 'tqlM4F93McQD2vJTffvApiIIXw12';
const COL = window._LZ_COL;
function medir(imp) {
  const C = window._lzContagens(imp);
  const rows = [{ uid: UID, name: 'Fábio Simão', effectiveSkills: ['D'] }];
  window._erApplyLzToRows(rows,
    { [UID]: { letzplayHandle: 'FabioSimaoB', letzplayConsent: true, letzplayImport: imp } }, {});
  return { x: C.g.x, y: C.g.y, cor: rows[0]._lzColor, verif: rows[0]._lzVerified };
}
const SEM = medir(impFabio(IDS_REAIS.map(function (id) { return { lzId: id }; })));
const COM = medir(impFabio(IDS_REAIS.map(function (id) { return { lzId: id }; }).concat([A])));

console.log('\n📋 O sintoma que o dono viu (amistoso fora do acervo)');
ok(SEM.x === 117 && SEM.y === 119, 'barra "117 de 119" — exatamente o print (98%)');
ok(SEM.cor === COL.violet && SEM.verif === false, 'e o nome fica VIOLETA, sem verificação');

console.log('\n📋 Com o amistoso que o extrator agora produz');
ok(COM.x === 119 && COM.y === 119, 'a barra FECHA em "119 de 119" (100%)');
ok(COM.cor === COL.green && COM.verif === true, 'e o nome fica VERDE (coerente, verificado)');

// ── 4) A LEITURA NÃO DIZ MAIS "CONCLUÍ" DEVENDO PARTIDA ────────────────────────────
// (content.js é uma IIFE com chrome.*; aqui vale a varredura de código, como nas outras
// suítes da extensão. O comportamento ponta a ponta roda em letzplay-big-profile.test.js.)
const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
const etapa3 = src.slice(src.indexOf('ETAPA 3: JOGOS'), src.indexOf('} catch (eEtapa)'));
console.log('\n📋 "Concluí" virou verificação contra o índice');
ok(/function _idsDevendo\(\)/.test(etapa3) && /function _fecharSeIndiceFechou\(/.test(etapa3),
  'existe UM resolvedor de "o índice fechou?" (não três cópias)');
ok(!/if \(jaConhecidos > 0 && add1 === 0\) \{\s*C\.complete = true;/.test(etapa3),
  'a primeira página sem novidade não declara completo sozinha');
ok(!/if \(_secas >= 1\) \{\s*\/\/[^\n]*\n\s*C\.complete = true;/.test(etapa3),
  'página seca não declara completo sozinha');
ok(!/if \(lastPageRead >= maxPage\) C\.complete = true;/.test(etapa3),
  'chegar na última página não declara completo sozinho');
ok((etapa3.match(/_fecharSeIndiceFechou\(/g) || []).length >= 4,
  'os três pontos de fechamento passam pelo mesmo guard');

await browser.close();
console.log('\n' + '─'.repeat(40));
console.log('Results: ' + pass + ' passed, ' + fail + ' failed');
console.log('─'.repeat(40));
process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
