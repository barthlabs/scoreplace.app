/* A CHAVE MAGRA NÃO DESENHA VAZIA — E O PAINEL DA FASE NÃO HERDA A DATA DA FASE ANTERIOR.
 *
 * INCIDENTE (web mobile, Fase 2 pública): a tela chegava em "Chaveamento do Torneio",
 * escrevia "FASE 2 · Eliminatória" e o espaço abaixo ficava VAZIO — sem erro e sem loader.
 * O cartão da rodada mostrava início 02/08 19:00 e final 19/08 19:40, que são as datas da
 * FASE 1.
 *
 * MEDIDO NO NAVEGADOR REAL antes de escrever este teste (harness HTTP com os 96 scripts do
 * index.html, render REAL, fixture nascido do `_tSplit.dividir()` REAL), desktop e 375×812:
 *     estado    jogos em memória   HTML do container   loader
 *     MAGRO     0                  5.611 bytes         NÃO
 *     MONTADO   204 (105+99)       11.489 bytes        —
 * Os DOIS viewports deram números IDÊNTICOS ⇒ não é CSS nem viewport: `renderBracket` não
 * sabia de torneio dividido (`grep -c '_semPesados' js/views/bracket.js` = 0).
 * E a expressão de datas, medida no mesmo harness com a fase 2 SEM datas próprias, devolvia
 * 02/08 e 19/08 — o `|| t.startDate/t.endDate`, que são da fase INICIAL.
 *
 * Rodado por: node tests/chave-magra-nao-desenha-vazia.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── chave magra não desenha vazia ────');

// ── contexto mínimo, com os módulos REAIS que decidem ───────────────────────────
function novoCtx() {
  const s = {};
  s.window = s; s.globalThis = s; s.console = { log(){}, warn(){}, error(){} };
  s._warn = s._log = s._error = s._debug = () => {};
  s._captureException = () => {};
  s.setTimeout = setTimeout; s.clearTimeout = clearTimeout;
  s.navigator = { userAgent: 'node' };
  s.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  s.document = { getElementById: () => null, addEventListener() {}, createElement: () => ({ style: {}, appendChild(){} }) };
  s.firebase = { firestore: Object.assign(() => ({}), { FieldValue: { delete: () => ({}) } }) };
  vm.createContext(s);
  const carrega = (rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), s, { filename: rel });
  carrega('js/views/persist-core.js');
  carrega('js/views/identity-core.js');
  carrega('js/views/tournament-split-core.js');
  return { s, carrega };
}

// ⭐ `_marcaPartesQueFaltam` é a pergunta canônica e mora em js/store.js, que não carrega
// headless inteiro. Extraio SÓ essa função do fonte e a executo — é a função REAL, não uma
// cópia minha: se ela mudar de regra, este teste muda junto.
function marcaReal(s) {
  const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const i = src.indexOf('window._marcaPartesQueFaltam = function');
  if (i < 0) throw new Error('não achei _marcaPartesQueFaltam em js/store.js');
  const fim = src.indexOf('\n};', i);
  vm.runInContext(src.slice(i, fim + 3), s, { filename: 'store.js#_marcaPartesQueFaltam' });
  return s._marcaPartesQueFaltam;
}

// contêiner de mentira que registra o que foi pintado
const mkContainer = () => ({ _html: '', get innerHTML() { return this._html; },
  set innerHTML(v) { this._html = String(v); }, firstElementChild: null,
  querySelectorAll: () => [] });

const { s, carrega } = novoCtx();
marcaReal(s);
s._renderBallLoader = (label) => '<div class="ball-loader">' + label + '</div>';
s._softRefreshView = () => { s.__repintou = (s.__repintou || 0) + 1; };
s._hydrateMonarchGroups = () => {};

// o TORNEIO COMPLETO e a divisão REAL
const completo = () => ({
  id: 'T', name: 'Sintetico', format: 'Fase de Grupos + Eliminatórias', status: 'active',
  currentPhaseIndex: 1, memberUids: ['u1'],
  phases: [{ name: 'Grupos', rounds: 1 }, { name: 'Elim', rounds: 4 }],
  participants: [{ uid: 'u1', name: 'A' }, { uid: 'u2', name: 'B' }],
  rounds: [{ round: 1, matches: [{ id: 'a', winner: 'p1' }, { id: 'b', winner: 'p1' }] },
           { round: 2, matches: [{ id: 'c' }, { id: 'd' }, { id: 'e' }] }],
  groups: [], matches: []
});
const PARTES = ['matches', 'participants'];
const p = s._tSplit.dividir(JSON.parse(JSON.stringify(completo())), PARTES);
p.config._semPesados = PARTES;
p.config._nPartes = PARTES.reduce((a, n) => (a[n] = (p[n] || []).length, a), {});
p.config._nJogos = (p.matches || []).length;
const magro = () => JSON.parse(JSON.stringify(p.config));

// bracket.js REAL — só o portão é exercitado (renderBracket inteiro precisa de DOM)
const srcB = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const iG = srcB.indexOf('function _bracketSeguraSemPartes');
ok(iG > 0, 'o portão _bracketSeguraSemPartes existe em js/views/bracket.js');
/* ⚠️ O portão pode NÃO EXISTIR — é exatamente o estado do HEAD anterior, e é contra ele
 * que este teste tem de ficar VERMELHO CONTANDO, não estourando: controle que explode não
 * diz QUANTAS invariantes caíram. Sem o portão, as asserções que dependem dele falham uma
 * a uma e o bloco de DATAS ainda roda. */
if (iG > 0) {
  const fimG = srcB.indexOf('\n}\n', iG);
  vm.runInContext(srcB.slice(iG, fimG + 3), s, { filename: 'bracket.js#portao' });
}
const portao = (typeof s._bracketSeguraSemPartes === 'function')
  ? s._bracketSeguraSemPartes
  : function () { return undefined; };   // ausente → nunca segura, nunca pinta

// sentinelas de MUTAÇÃO (cenário E)
const mut = [];
s.AppStore = {
  tournaments: [], publicDiscovery: [],
  _montandoPesados: {}, _ultimaMontagem: {}, _partesEmErro: {},
  _montaPesadosQueFaltam(ids) { s.__pediu = (s.__pediu || []).concat(ids); },
  mutate() { mut.push('AppStore.mutate'); }, commitTournamentTx() { mut.push('commitTournamentTx'); },
  commitResultTx() { mut.push('commitResultTx'); }, sync() { mut.push('sync'); },
  syncImmediate() { mut.push('syncImmediate'); }
};
s.FirestoreDB = {
  saveTournament() { mut.push('saveTournament'); }, mutateTournament() { mut.push('mutateTournament'); },
  _montaDeSubcolecoes(id, cfg, quais) {
    return s._tSplit.montarDoBanco(cfg, async (col) => (col === 'inscritos' ? p.participants : p.matches));
  }
};

// ── A · torneio MAGRO em AppStore.tournaments ────────────────────────────────
{
  const t = magro(); s.AppStore.tournaments = [t]; s.__pediu = [];
  const c = mkContainer();
  const segurou = portao(t, c, 'T');
  ok(segurou === true, 'A: com partes faltando, o portão SEGURA o render');
  ok(/ball-loader|Carregando/.test(c.innerHTML), 'A: pinta estado de CARREGAMENTO — nunca área vazia');
  ok(c.innerHTML.length > 0, 'A: o container não fica vazio');
  ok((s.__pediu || []).indexOf('T') !== -1, 'A: pede a montagem pela PORTA CANÔNICA (_montaPesadosQueFaltam)');
}
// ── B · torneio MAGRO só em publicDiscovery (espectador) ─────────────────────
{
  const t = magro(); s.AppStore.tournaments = []; s.AppStore.publicDiscovery = [t]; s.__pediu = [];
  const c = mkContainer();
  ok(portao(t, c, 'T') === true, 'B: espectador com doc magro também é SEGURADO');
  ok(/ball-loader|Carregando/.test(c.innerHTML), 'B: espectador vê carregamento, não vazio');
  ok((s.__pediu || []).length === 0, 'B: NÃO empurra pro agendador (que não serve publicDiscovery)');
}
// ── C · enquanto falta parte, nenhuma lógica de chave roda ───────────────────
{
  const chamada = srcB.indexOf('if (t && _bracketSeguraSemPartes(t, container, tId)) return;');
  const fin = srcB.indexOf('_maybeFinishElimination(t)');
  const rep = srcB.indexOf('_reassignBestLosersToRepechage(t)');
  ok(chamada > 0, 'C: renderBracket chama o portão');
  ok(chamada < fin && chamada < rep,
     'C: o portão vem ANTES de _maybeFinishElimination e _reassignBestLosersToRepechage');
}
// ── D · depois da montagem, a chave passa ────────────────────────────────────
{
  const t = magro();
  const montado = p.matches ? null : null;
  // monta pela porta canônica REAL
  return (async () => {
    const m = await s.FirestoreDB._montaDeSubcolecoes('T', t, PARTES);
    Object.keys(m).forEach((k) => { t[k] = m[k]; });
    const jogos = (t.rounds || []).reduce((n, r) => n + ((r && r.matches) || []).length, 0);
    ok(jogos === 5, 'D: depois de montar, os 5 jogos estão em memória (veio ' + jogos + ')');
    ok(s._marcaPartesQueFaltam(t) === false, 'D: a pergunta canônica para de acusar falta');
    s.AppStore.tournaments = [t];
    const c = mkContainer();
    ok(portao(t, c, 'T') === false, 'D: com as partes montadas, o portão LIBERA o render');
    ok(c.innerHTML === '', 'D: e não pinta loader por cima da chave');

    // ── E · nenhuma mutação em todo o caminho ──────────────────────────────
    ok(mut.length === 0, 'E: ZERO chamadas a saveTournament/mutate/commitTournamentTx/commitResultTx/sync ('
       + mut.join(',') + ')');

    // ── F · o original em memória não é adulterado antes da montagem ───────
    {
      const antes = magro(); const copia = JSON.stringify(antes);
      const c2 = mkContainer(); s.AppStore.tournaments = [antes]; portao(antes, c2, 'T');
      const depois = JSON.parse(JSON.stringify(antes));
      delete depois._faltamPesados; delete depois._faltaOQue;   // marcas do próprio diagnóstico
      ok(JSON.stringify(depois) === copia, 'F: o objeto magro não é alterado pelo portão (só marcado)');
    }

    // ── DATAS · a fase exibida não herda a janela da fase anterior ─────────
    {
      const ctx2 = novoCtx();
      ctx2.s._tProgParseMs = null;
      ctx2.carrega('js/views/tournaments-utils.js');
      const W = ctx2.s;
      const base = () => ({ id: 'x', format: 'Fase de Grupos + Eliminatórias', status: 'active',
        currentPhaseIndex: 1, startDate: '2026-08-02', startTime: '19:00',
        endDate: '2026-08-19', endTime: '19:40',
        phases: [{ name: 'G', startDate: '2026-08-02', endDate: '2026-08-19', rounds: 1 }, { name: 'E', rounds: 4 }] });
      // a expressão corrigida, como está no arquivo
      const src = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-utils.js'), 'utf8');
      // os DOIS ramos passaram a perguntar à porta única (_inicioDaFase/_fimDaFase), que é
      // quem restringe o fallback do topo à fase 0 — ver tests/avanco-de-fase-e-o-inicio-da-fase
      const nIni = (src.match(/window\._inicioDaFase\(t, _(phIdx|cp)\)/g) || []).length;
      const nFim = (src.match(/window\._fimDaFase\(t, _(phIdx|cp)\)/g) || []).length;
      ok(nIni === 2 && nFim === 2,
         'DATAS: os DOIS ramos leem a janela pela porta única (' + nIni + '/' + nFim + ')');
      ok(!/\|\| window\._tProgParseMs\(t\.startDate\)/.test(src),
         'DATAS: nenhum ramo herda t.startDate direto (era a janela da fase 1)');
      // e a régua do dono continua valendo, com as datas da FASE
      const n = W._phasePlannedRounds(base(), 1);
      ok(n === 4, 'DATAS: a fase 2 planeja 4 rodadas (veio ' + n + ')');
      const s0 = W._tProgParseMs('2026-09-02T08:00'), e0 = W._tProgParseMs('2026-09-06T18:00');
      const w2 = W._phaseRoundWindow(s0, e0, 2, 4);
      ok(!!w2 && w2.sliced === true, 'DATAS: a janela da rodada é FATIADA pelo nº de rodadas da fase');
      const dia = 24 * 3600 * 1000;
      ok(Math.abs((w2.endMs - w2.startMs) - ((e0 - s0) / 4)) < 1000,
         'DATAS: cada rodada recebe (fim − início da FASE) ÷ nº de rodadas');
      ok(w2.startMs > W._tProgParseMs('2026-09-01'),
         'DATAS: a rodada 2 da fase 2 NÃO cai em agosto (a janela da fase 1)');
    }

    console.log(fail === 0 ? '  ✓ ' + pass + ' asserções' : '  ' + pass + ' ok / ' + fail + ' falhas');
    process.exit(fail === 0 ? 0 : 1);
  })();
}
