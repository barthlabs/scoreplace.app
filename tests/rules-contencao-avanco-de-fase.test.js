/* CONTENÇÃO DO AVANÇO DE FASE — as Rules REAIS, medidas no emulador.
 *
 * O QUE ESTE TESTE GUARDA: o `allow update` do admin NUNCA teve `hasOnly` — organizador
 * escreve QUALQUER campo do documento do torneio. Enquanto o avanço de fase era do cliente
 * isso era a regra funcionando. Agora que o avanço é da CF (Admin SDK, que passa por fora
 * das regras), um cliente ANTIGO — e o nativo publicado fica versões atrás, sem
 * auto-update — continuava podendo escrever `currentPhaseIndex`, `_phaseMaterialized`,
 * `phaseStartedAt`, `phaseRounds` e `_semPesados` à mão POR CIMA do servidor.
 *
 * ⭐ O MÉTODO: fixture pelo Admin SDK (que ignora regras, então o estado de partida é
 * exatamente o que eu quero medir) e a operação medida por REST com JWT de usuário — que é
 * o caminho do cliente de verdade. Cada cenário no SEU PRÓPRIO DOCUMENTO: a primeira versão
 * de um teste irmão (rules-inscricao-espera) reusou um doc só, as escritas rodaram em
 * sequência, e o estado deixado pela anterior fazia a seguinte cair por outra regra — dava
 * 200 em tudo e "provava" o contrário do que media.
 *
 * ⛔ E CADA NEGATIVO DIZ QUAL BYPASS ELE FECHA. Um 403 sem nome não prova nada: prova que
 * alguma regra recusou, não que a regra CERTA recusou. Por isso o CONTROLE roda a mesma
 * bateria contra as rules SEM a trava — se o negativo não passava antes, ele não é prova.
 *
 * Rodado por: node tests/rules-contencao-avanco-de-fase.test.js
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT_ATUAL = 8106;     // portas livres conferidas antes de escrever o teste
const PORT_CONTROLE = 8107;
const PROJECT = 'demo-scoreplace';

const ORG = 'uid_organizador';
const JOG = 'uid_jogador';
const FORA = 'uid_estranho';

function driver(port) {
  return `
'use strict';
const admin = require(process.env.SP_ADMIN);
const P = '${PROJECT}', H = 'http://127.0.0.1:${port}';
admin.initializeApp({ projectId: P });
const db = admin.firestore();
const ORG = '${ORG}', JOG = '${JOG}', FORA = '${FORA}';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = uid => b64({ alg:'none', typ:'JWT' }) + '.' + b64({
  iss:'https://securetoken.google.com/'+P, aud:P, sub:uid, user_id:uid,
  auth_time: Math.floor(Date.now()/1000), iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000)+3600, email: uid+'@x.com', email_verified:true,
  firebase:{ identities:{}, sign_in_provider:'google.com' }
}) + '.';
const base = H + '/v1/projects/' + P + '/databases/(default)/documents/';

/* JS → valor tipado do REST. Escrever \`{stringValue:...}\` à mão num payload de reset com
 * 30 campos é onde se erra em silêncio: um campo com o tipo errado vira "negado" e o teste
 * culparia a regra. */
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'object') {
    const f = {};
    Object.keys(v).forEach(k => { f[k] = enc(v[k]); });
    return { mapValue: { fields: f } };
  }
  throw new Error('enc: tipo não suportado — ' + typeof v);
}
const campos = o => { const f = {}; Object.keys(o).forEach(k => { f[k] = enc(o[k]); }); return f; };

/* PATCH COM updateMask = set({merge:true}) — só as chaves listadas mudam.
 * PATCH SEM updateMask = substituição INTEGRAL do documento (é o que
 * \`commitTournamentTx\` faz: transaction.set SEM merge). Os dois caminhos são medidos. */
async function patch(doc, uid, dados, mask) {
  let url = base + 'tournaments/' + doc;
  if (mask) url += '?' + mask.map(p => 'updateMask.fieldPaths=' + encodeURIComponent(p)).join('&');
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(uid), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: campos(dados) }),
  });
  return r.status;
}
async function apagar(doc, uid) {
  const r = await fetch(base + 'tournaments/' + doc, {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + tok(uid) } });
  return r.status;
}
async function patchSub(caminho, uid, dados) {
  const r = await fetch(base + caminho, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tok(uid), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: campos(dados) }),
  });
  return r.status;
}

/* ── FIXTURES pelo Admin SDK: ignoram as regras de propósito. É a única forma de partir de
 * um torneio JÁ na fase 2 (que o cliente não pode mais fabricar) e medir o que ele tenta. */
const JOGO = { id: 'm1', p1: 'A', p2: 'B', status: 'pending' };
function baseNaoDividido(extra) {
  return Object.assign({
    name: 'Torneio de prova', creatorUid: ORG, adminUids: [ORG], isPublic: true,
    status: 'active', format: 'Liga',
    memberUids: [ORG, JOG], participants: [{ uid: ORG }, { uid: JOG }],
    phases: [{ name: 'Fase 1', endDate: '2026-09-10' }, { name: 'Fase 2', endDate: '2026-09-20' }],
    currentPhaseIndex: 0, _phaseMaterialized: 0,
    matches: [], rounds: [], groups: [],
    checkedIn: {}, absent: {}, monarchWaitlist: {}, waitlist: [], standbyParticipants: [],
    _canonicalDraw: false,
  }, extra || {});
}
function baseDividido(extra) {
  return baseNaoDividido(Object.assign({
    _semPesados: ['matches'], _nJogos: 115, _nGrupos: 0, _nPartes: { matches: 115 },
    matches: [],                        // o jogo mora na subcoleção; no doc fica o array VAZIO
    currentPhaseIndex: 1, _phaseMaterialized: 1,
    phaseStartedAt: { '1': '2026-09-01T10:00:00.000Z' },
  }, extra || {}));
}
/* O DOCUMENTO DA FASE 2, com todo o rastro que o reset tem que limpar. */
function baseAvancado(extra) {
  return baseNaoDividido(Object.assign({
    currentPhaseIndex: 1, _phaseMaterialized: 1,
    phaseStartedAt: { '1': '2026-09-01T10:00:00.000Z' },
    phaseRounds: { '1': { rounds: [{ round: 1, matches: [] }] } },
    phaseLeagueState: { pool: ['A'] },
    currentStage: 'playoff', status: 'finished',
    matches: [JOGO], rounds: [{ round: 1, matches: [] }], groups: [{ nome: 'G1' }],
    standings: [{ nome: 'A', pts: 3 }], thirdPlaceMatch: { id: 'm3' }, rodadas: { '1': [] },
    sitOutHistory: { A: 1 }, ligaGhosts: { g1: true }, woHistory: { m1: 'A' },
    nextDrawAt: 1786000000000, lastAutoDrawAt: 1785000000000,
    tournamentStarted: '2026-09-01T09:00:00.000Z', finishedAt: '2026-09-02T09:00:00.000Z',
    finishNotifiedAt: '2026-09-02T09:05:00.000Z', durationMs: 86400000,
    lateIntegrated: { A: true }, _phaseResInfo: { via: 'swiss' }, _canonicalDraw: true,
    checkedIn: { [JOG]: true }, absent: { [ORG]: true }, monarchWaitlist: { G1: [JOG] },
    waitlist: [{ uid: FORA }], standbyParticipants: [{ uid: FORA }],
  }, extra || {}));
}
/* A FORMA FINAL do reset — exatamente o que \`_clearTournamentDraw\` deixa (incluindo o
 * \`phaseStartedAt\` que a leva de hoje passa a limpar) e nada além disso. */
function payloadReset(extra) {
  return Object.assign({
    name: 'Torneio de prova', creatorUid: ORG, adminUids: [ORG], isPublic: true,
    format: 'Liga', memberUids: [ORG, JOG],
    participants: [{ uid: ORG }, { uid: JOG }, { uid: FORA }],
    phases: [{ name: 'Fase 1', endDate: '2026-09-10' }, { name: 'Fase 2', endDate: '2026-09-20' }],
    status: 'closed',                       // 'finished' → 'closed'; os demais preservados
    currentPhaseIndex: 0, _phaseMaterialized: 0,
    currentStage: null, phaseRounds: null, phaseLeagueState: null, phaseStartedAt: null,
    standings: null, thirdPlaceMatch: null, rodadas: null, sitOutHistory: null,
    ligaGhosts: null, woHistory: null, nextDrawAt: null, lastAutoDrawAt: null,
    tournamentStarted: null, finishedAt: null, finishNotifiedAt: null, durationMs: null,
    lateIntegrated: null, _phaseResInfo: null,
    matches: [], rounds: [], groups: [], waitlist: [], standbyParticipants: [],
    checkedIn: {}, absent: {}, monarchWaitlist: {},
    _canonicalDraw: false,
  }, extra || {});
}

(async () => {
  const out = {};
  const fix = async (id, dados) => { await db.doc('tournaments/' + id).set(dados); return id; };

  // ══ POSITIVOS — o que a trava NÃO pode atrapalhar ═════════════════════════════
  await fix('p1', baseNaoDividido());
  out.P1_editar_phases = await patch('p1', ORG, {
    phases: [{ name: 'Grupos', endDate: '2026-09-12' }, { name: 'Fase 2', endDate: '2026-09-25' }],
  }, ['phases']);

  /* P2 mede o caso que quase virou regressão: o doc NUNCA teve \`currentPhaseIndex\` e a
   * aplicação de formato grava 0 (tournaments-draw.js:514, draw-decisions.js:231,
   * format2-ui.js:1186). Com \`null\` de default, "0 sobre ausente" seria MUDANÇA. */
  const semIndice = baseNaoDividido();
  delete semIndice.currentPhaseIndex; delete semIndice._phaseMaterialized;
  await fix('p2', semIndice);
  out.P2_aplicar_formato = await patch('p2', ORG, {
    phases: [{ name: 'Fase 1', format: 'Eliminatória Simples' }],
    currentPhaseIndex: 0, _phaseMaterialized: 0, matches: [],
  }, ['phases', 'currentPhaseIndex', '_phaseMaterialized', 'matches']);

  await fix('p3', baseAvancado());
  out.P3_reset_completo = await patch('p3', ORG, payloadReset(), null);

  await fix('p4', baseNaoDividido({ matches: [JOGO] }));
  out.P4_placar_participante = await patch('p4', JOG, {
    matches: [Object.assign({}, JOGO, { status: 'completed', score: '6-4' })],
    updatedAt: '2026-09-02T12:00:00.000Z',
  }, ['matches', 'updatedAt']);

  await fix('p5', baseDividido());
  out.P5_presenca_em_dividido = await patch('p5', JOG, { checkedIn: { [JOG]: true } }, ['checkedIn']);

  await fix('p6', baseNaoDividido());
  out.P6_promote_lines = await patch('p6', ORG, {
    phases: [{ name: 'Fase 1', endDate: '2026-09-10', _promoteLines: 1 },
             { name: 'Fase 2', endDate: '2026-09-20' }],
  }, ['phases']);

  await fix('p7', baseNaoDividido());
  out.P7_delete_nao_dividido = await apagar('p7', ORG);

  /* P8 não estava no roteiro e entrou porque é o modo de falhar que a trava PODIA causar:
   * torneio dividido cujo documento NÃO TEM o campo \`matches\` (o writer só zera o array
   * quando ele já existe — tournament-split-core.js:355). Exigir presença travaria TODA
   * escrita nesse torneio. Com \`[]\` de default, ausente conta como vazio. */
  const divSemMatches = baseDividido();
  delete divSemMatches.matches;
  await fix('p8', divSemMatches);
  out.P8_dividido_sem_campo_matches = await patch('p8', JOG, { checkedIn: { [JOG]: true } }, ['checkedIn']);

  // controle de criação: torneio normal continua nascendo
  out.C1_create_normal = await patch('c1', ORG, baseNaoDividido(), null);

  // ══ NEGATIVOS — cada um fecha UM bypass ═══════════════════════════════════════
  // N1: o avanço de fase escrito à mão pelo cliente antigo. É O BUG.
  await fix('n1', baseNaoDividido());
  out.N1_currentPhaseIndex = await patch('n1', ORG, { currentPhaseIndex: 1 }, ['currentPhaseIndex']);

  // N2: materializar a fase seguinte sem passar pela CF.
  await fix('n2', baseNaoDividido());
  out.N2_phaseMaterialized = await patch('n2', ORG, { _phaseMaterialized: 1 }, ['_phaseMaterialized']);

  // N3: os dois juntos — o avanço COMPLETO como o cliente o escrevia.
  await fix('n3', baseNaoDividido());
  out.N3_os_dois = await patch('n3', ORG, { currentPhaseIndex: 1, _phaseMaterialized: 1 },
    ['currentPhaseIndex', '_phaseMaterialized']);

  // N4: só o CARIMBO (phases-engine.js:2208). Sem ele na trava, o cliente marcaria a fase
  // como iniciada e a regressiva/prazo passariam a contar de uma data que ele escolheu.
  await fix('n4', baseNaoDividido());
  out.N4_phaseStartedAt = await patch('n4', ORG,
    { phaseStartedAt: { '1': '2026-09-02T10:00:00.000Z' } }, ['phaseStartedAt']);

  // N5: as rodadas namespaced por fase (phases-engine.js:2226) — materialização por outro nome.
  await fix('n5', baseNaoDividido());
  out.N5_phaseRounds = await patch('n5', ORG,
    { phaseRounds: { '1': { rounds: [{ round: 1, matches: [] }] } } }, ['phaseRounds']);

  // N6: APAGAR o marcador. Sem ele, o app volta a acreditar que o documento tem tudo —
  // e o torneio abre sem os 115 jogos que continuam na subcoleção.
  await fix('n6', baseDividido());
  out.N6_remover_semPesados = await patch('n6', ORG, {}, ['_semPesados']);

  // N7: mesma fuga com lista vazia (que é como \`dividido()\` lê "não dividido").
  await fix('n7', baseDividido());
  out.N7_semPesados_vazio = await patch('n7', ORG, { _semPesados: [] }, ['_semPesados']);

  // N8: e com o TIPO trocado — \`{}\` não é lista, e um \`dividido()\` escrito por presença
  // (em vez de \`is list && size()>0\`) responderia "não dividido" aqui.
  await fix('n8', baseDividido());
  out.N8_semPesados_mapa = await patch('n8', ORG, { _semPesados: {} }, ['_semPesados']);

  // N9: devolver os jogos PRO DOCUMENTO num torneio dividido — duas cópias divergindo e o
  // teto de 1 MB de volta.
  await fix('n9', baseDividido());
  out.N9_matches_cheio_em_dividido = await patch('n9', ORG, { matches: [JOGO] }, ['matches']);

  // N10: \`matches\` com o TIPO trocado. \`size()==0\` sozinho não vê a diferença.
  await fix('n10', baseDividido());
  out.N10_matches_mapa = await patch('n10', ORG, { matches: {} }, ['matches']);

  // N11: \`matches: null\` — "não sei" gravado por cima de "não tem". É a classe do bug que
  // apagava resultado confirmado, e é por isso que ausente≠nulo aqui.
  await fix('n11', baseDividido());
  out.N11_matches_nulo = await patch('n11', ORG, { matches: null }, ['matches']);

  // N12: baixar o CONTADOR. Um cliente com cache frio prometeria menos do que existe e a
  // tela nunca mais buscaria o resto — o "0 INSCRITOS" do PWA por outro caminho.
  await fix('n12', baseDividido());
  out.N12_nJogos_alterado = await patch('n12', ORG, { _nJogos: 3 }, ['_nJogos']);

  // N13: o avanço ESCONDIDO num save comum (merge com outros campos legítimos).
  await fix('n13', baseNaoDividido());
  out.N13_merge_com_avanco = await patch('n13', ORG,
    { name: 'Nome novo', currentPhaseIndex: 1 }, ['name', 'currentPhaseIndex']);

  // N14: substituição INTEGRAL do documento (transaction.set sem merge) carregando o avanço.
  await fix('n14', baseNaoDividido());
  out.N14_substituicao_integral = await patch('n14', ORG,
    baseNaoDividido({ currentPhaseIndex: 1, _phaseMaterialized: 1 }), null);

  // N15: em DUAS ETAPAS — \`currentStage\` é livre de propósito (passa), e é justamente por
  // isso que a segunda etapa tem que cair. Livre um, travado o outro.
  await fix('n15', baseNaoDividido());
  out.N15a_currentStage_livre = await patch('n15', ORG, { currentStage: 'playoff' }, ['currentStage']);
  out.N15b_depois_o_indice = await patch('n15', ORG, { currentPhaseIndex: 1 }, ['currentPhaseIndex']);

  // N16: NASCER na fase 3. Trava de mudança sem trava de valor inicial não trava nada:
  // o estado fabricado no create ficaria congelado e legítimo pra sempre.
  out.N16_create_com_indice = await patch('n16', ORG,
    baseNaoDividido({ currentPhaseIndex: 2, _phaseMaterialized: 2 }), null);

  // N17: nascer DECLARANDO-SE dividido, sem nada morar fora — o app abriria buscando
  // subcoleção vazia e pintaria "0 inscritos" pra sempre.
  out.N17_create_com_semPesados = await patch('n17', ORG,
    baseNaoDividido({ _semPesados: ['matches'] }), null);

  // N18: apagar torneio DIVIDIDO deixaria as subcoleções órfãs (apagar doc não apaga o que
  // está abaixo). É a origem dos 151 \`results\` órfãos, agora em escala de torneio inteiro.
  await fix('n18', baseDividido());
  out.N18_delete_dividido = await apagar('n18', ORG);

  // N19: o reset COMPLETO num torneio dividido — o documento diria "fase 0, zero jogo" com
  // 115 jogos vivos na subcoleção, que o cliente não pode apagar.
  await fix('n19', baseDividido({ _canonicalDraw: true }));
  out.N19_reset_em_dividido = await patch('n19', ORG,
    payloadReset({ _semPesados: ['matches'], _nJogos: 115, _nPartes: { matches: 115 }, _nGrupos: 0 }), null);

  // N20: reset PARCIAL — tudo limpo MENOS o carimbo. É o reset de hoje, e é o que fazia a
  // fase "voltar" sozinha. Faltou um campo ⇒ não é reset ⇒ permission-denied.
  await fix('n20', baseAvancado());
  out.N20_reset_parcial = await patch('n20', ORG,
    payloadReset({ phaseStartedAt: { '1': '2026-09-01T10:00:00.000Z' } }), null);

  // N21: a subcoleção dos jogos continua fechada ao cliente (regressão da porta única de CF).
  await db.doc('tournaments/n21').set(baseDividido());
  await db.doc('tournaments/n21/matches/m1').set({ jogo: JOGO, playerUids: [JOG] });
  out.N21_escrita_em_matches = await patchSub('tournaments/n21/matches/m1', JOG, { placar: '6-4' });

  console.log('__JSON__' + JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
`;
}

function rodar(rulesFile, port, rotulo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-fase-'));
  const cfg = path.join(tmp, 'firebase.json');
  const drv = path.join(tmp, 'driver.js');
  fs.writeFileSync(cfg, JSON.stringify({
    firestore: { rules: rulesFile },
    emulators: { firestore: { port }, ui: { enabled: false }, singleProjectMode: true },
  }));
  fs.writeFileSync(drv, driver(port));
  let out;
  try {
    out = execFileSync('firebase', [
      'emulators:exec', '--only', 'firestore', '--config', cfg, '--project', PROJECT,
      'node ' + JSON.stringify(drv),
    ], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
      env: Object.assign({}, process.env, {
        SP_ADMIN: path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'),
        NO_UPDATE_NOTIFIER: '1',
        PATH: '/opt/homebrew/opt/openjdk@21/bin:/opt/homebrew/opt/openjdk/bin:' + process.env.PATH,
      }),
    });
  } catch (e) {
    /* firebase-tools às vezes sai 2 depois de desligar o emulador, mesmo com o driver em 0.
     * O protocolo é o marcador JSON: sem ele a exceção continua fatal. */
    out = String(e.stdout || '') + String(e.stderr || '');
  }
  const m = /__JSON__(\{.*\})/.exec(out);
  if (!m) throw new Error(rotulo + ' não devolveu resultado:\n' + out.slice(-3000));
  return JSON.parse(m[1]);
}

/* CONTROLE: as MESMAS rules sem a trava. Sem o "passava antes", um 403 não prova que a
 * regra nova recusou — prova só que ALGUMA regra recusou.
 * ⚠️ A trava sai por `|| true`, não por remoção: apagar as chamadas deixaria
 * `faseIntacta`/`ehResetOk`/`dividido` sem chamador e o compilador acusaria "Unused
 * function" — ruído que não é o que se está medindo. */
function regrasSemTrava() {
  const atual = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  let old = atual;
  const troca = (de, para, nome) => {
    const antes = old;
    old = old.replace(de, para);
    if (old === antes) throw new Error('controle: não achei ' + nome + ' em firestore.rules');
  };
  troca('&& (faseIntacta() || ehResetOk());', '&& (faseIntacta() || ehResetOk() || true);', 'a trava do update');
  troca('&& !dividido();', '&& (!dividido() || true);', 'a trava do delete');
  troca(/\n        && request\.resource\.data\.get\('currentPhaseIndex', 0\) == 0[\s\S]*?&& !\('phaseRounds' in request\.resource\.data\);/,
    ';', 'as exigências do create');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sp-fase-old-')), 'sem-trava.rules');
  fs.writeFileSync(file, old);
  return file;
}

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── rules-contencao-avanco-de-fase ────');
const A = rodar(path.join(ROOT, 'firestore.rules'), PORT_ATUAL, 'regras atuais');
console.log('  medido: ' + JSON.stringify(A));

// ── POSITIVOS ────────────────────────────────────────────────────────────────
ok(A.P1_editar_phases === 200, 'P1 organizador edita phases[].name/endDate — veio ' + A.P1_editar_phases);
ok(A.P2_aplicar_formato === 200, 'P2 aplicar formato grava índice 0 sobre doc SEM o campo — veio ' + A.P2_aplicar_formato);
ok(A.P3_reset_completo === 200, 'P3 reset COMPLETO em torneio não dividido — veio ' + A.P3_reset_completo);
ok(A.P4_placar_participante === 200, 'P4 participante lança placar em não dividido — veio ' + A.P4_placar_participante);
ok(A.P5_presenca_em_dividido === 200, 'P5 presença em torneio DIVIDIDO — veio ' + A.P5_presenca_em_dividido);
ok(A.P6_promote_lines === 200, 'P6 phases[0]._promoteLines = 1 — veio ' + A.P6_promote_lines);
ok(A.P7_delete_nao_dividido === 200, 'P7 apagar torneio NÃO dividido — veio ' + A.P7_delete_nao_dividido);
ok(A.P8_dividido_sem_campo_matches === 200,
   'P8 torneio dividido SEM o campo `matches` no doc segue escrevível — veio ' + A.P8_dividido_sem_campo_matches);
ok(A.C1_create_normal === 200, 'C1 criar torneio normal — veio ' + A.C1_create_normal);

// ── NEGATIVOS ────────────────────────────────────────────────────────────────
const neg = [
  ['N1_currentPhaseIndex', 'N1 🔒 cliente NÃO avança a fase (currentPhaseIndex)'],
  ['N2_phaseMaterialized', 'N2 🔒 cliente NÃO materializa fase (_phaseMaterialized)'],
  ['N3_os_dois', 'N3 🔒 o avanço COMPLETO (índice + materialização)'],
  ['N4_phaseStartedAt', 'N4 🔒 cliente NÃO carimba o início da fase (phaseStartedAt)'],
  ['N5_phaseRounds', 'N5 🔒 cliente NÃO cria as rodadas da fase (phaseRounds)'],
  ['N6_remover_semPesados', 'N6 🔒 cliente NÃO apaga o marcador _semPesados'],
  ['N7_semPesados_vazio', 'N7 🔒 nem o esvazia ([])'],
  ['N8_semPesados_mapa', 'N8 🔒 nem troca o TIPO dele ({})'],
  ['N9_matches_cheio_em_dividido', 'N9 🔒 jogos NÃO voltam pro documento dividido'],
  ['N10_matches_mapa', 'N10 🔒 matches:{} (tipo trocado) em dividido'],
  ['N11_matches_nulo', 'N11 🔒 matches:null ("não sei" por cima de "não tem")'],
  ['N12_nJogos_alterado', 'N12 🔒 contador _nJogos não se mexe em dividido'],
  ['N13_merge_com_avanco', 'N13 🔒 avanço escondido num save comum (merge)'],
  ['N14_substituicao_integral', 'N14 🔒 avanço por substituição INTEGRAL do doc'],
  ['N15b_depois_o_indice', 'N15 🔒 duas etapas: currentStage passa, o índice cai'],
  ['N16_create_com_indice', 'N16 🔒 torneio NÃO nasce na fase 3'],
  ['N17_create_com_semPesados', 'N17 🔒 torneio NÃO nasce declarando-se dividido'],
  ['N18_delete_dividido', 'N18 🔒 torneio DIVIDIDO não se apaga pelo cliente'],
  ['N19_reset_em_dividido', 'N19 🔒 reset completo em DIVIDIDO é negado'],
  ['N20_reset_parcial', 'N20 🔒 reset PARCIAL (sem limpar phaseStartedAt) é negado'],
  ['N21_escrita_em_matches', 'N21 🔒 subcoleção matches segue fechada ao cliente'],
];
neg.forEach(([k, texto]) => ok(A[k] === 403, texto + ' — veio ' + A[k]));
ok(A.N15a_currentStage_livre === 200, 'N15a controle: currentStage é LIVRE — veio ' + A.N15a_currentStage_livre);

// ── CONTROLE: sem a trava, os bypasses passavam ──────────────────────────────
console.log('  ── controle (mesmas rules SEM a trava) ──');
const B = rodar(regrasSemTrava(), PORT_CONTROLE, 'controle');
console.log('  medido: ' + JSON.stringify(B));
[
  ['N1_currentPhaseIndex', 'o avanço de fase passava'],
  ['N4_phaseStartedAt', 'o carimbo passava'],
  ['N6_remover_semPesados', 'apagar o marcador passava'],
  ['N9_matches_cheio_em_dividido', 'devolver jogos pro doc passava'],
  ['N16_create_com_indice', 'nascer na fase 3 passava'],
  ['N17_create_com_semPesados', 'nascer "dividido" passava'],
  ['N18_delete_dividido', 'apagar torneio dividido passava'],
].forEach(([k, texto]) => ok(B[k] === 200, 'controle: ' + texto + ' — veio ' + B[k]));
// N21 é regra antiga (`allow write: if false`): tem que continuar 403 nos DOIS lados.
ok(B.N21_escrita_em_matches === 403, 'controle: matches já era fechada antes desta leva — veio ' + B.N21_escrita_em_matches);

console.log(fail === 0
  ? '✅ rules-contencao-avanco-de-fase: ' + pass + ' asserções'
  : '❌ ' + fail + ' falha(s) / ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
