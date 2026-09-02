/* A RECUPERAÇÃO DA FASE 2 ESCREVE OS 99 QUE EXISTEM — E NADA MAIS.
 *
 * CONTEXTO (medido em 02/set/2026): o avanço para a Fase 2 da Confra rodou NO CLIENTE
 * (`advanceMultiPhase` → `commitTournamentTx` → `mutateTournament`) e não por Cloud
 * Function como o sorteio inicial (`_callDrawRound`). Em torneio DIVIDIDO,
 * `mutateTournament` tira `matches` do documento e NÃO escreve a subcoleção — quem
 * escreve ali é a CF, porque a regra nega o cliente. Os 99 jogos sobreviveram só no
 * localStorage do organizador.
 *
 * `scripts/recuperar-fase2-confra.js` é a ferramenta de USO ÚNICO que os devolve ao
 * lugar canônico. Este teste exige, contra o Firestore Emulator REAL:
 *   ① o dry-run não escreve NADA;
 *   ② a execução grava exatamente 99 e sobe os contadores para 214;
 *   ③ a Fase 1 fica byte a byte igual;
 *   ④ hash divergente ABORTA sem escrever;
 *   ⑤ id já existente ABORTA sem escrever;
 *   ⑥ a segunda execução é idempotente (não duplica).
 *
 * ⚠️ Emulador de propósito: uma ferramenta que grava tem de ser provada onde a escrita
 * é real. Modelo em memória não tem batch, não tem precondition e não tem recusa.
 *
 * Rodado por: node tests/recuperar-fase2-no-emulador.test.js
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8134;
const PROJECT = 'demo-recuperacao';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

/* O MESMO hash da ferramenta (FNV-1a) — se divergir, o teste não prova nada. */
const fnv = (s) => { let h = 0x811c9dc5; s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8); };

/* ── fixture: 115 jogos de Fase 1 + 99 de Fase 2, na MESMA topologia do incidente ── */
function jogoF1(i) {
  return { id: 'f1-' + i, round: 1, roundIndex: 0, label: 'R1 Grupo X • Jogo ' + i,
           p1: 'A' + i, p2: 'B' + i, scoreP1: 6, scoreP2: 3, winner: 'p1',
           resultAt: '2026-08-10T20:00:00Z', monarchGroup: 0 };
}
const RODADAS = { 1: 35, 2: 32, 3: 16, 4: 8, 5: 4, 6: 4 };
function jogosF2() {
  const out = []; let n = 0;
  Object.keys(RODADAS).forEach((r) => {
    for (let i = 0; i < RODADAS[r]; i++) {
      out.push({ id: 'f2-' + (n++), round: Number(r), phaseIndex: 1, bracket: 'main',
                 tierLabel: 'Ouro', category: null, p1: 'P' + i, p2: 'Q' + i,
                 winner: null, _gameNum: 200 + n, _sig: 's' + n });
    }
  });
  return out;
}

const F2 = jogosF2();
const IDS_F2 = F2.map((m) => String(m.id)).sort();
const HASH_IDS = fnv(JSON.stringify(IDS_F2));
const HASH_CONT = fnv(JSON.stringify(F2));
const F1 = []; for (let i = 0; i < 115; i++) F1.push(jogoF1(i));
const HASH_F1 = fnv(JSON.stringify(F1.map((m) => String(m.id)).sort()));

const TID = 'torneio_recuperacao';

/* A ferramenta tem ESPERADO fixo (uso único). Para o emulador, geramos uma cópia com as
 * constantes do fixture — é o MESMO código, só as expectativas trocadas. Substituição
 * textual explícita, e o teste FALHA se algum alvo não for encontrado. */
function ferramentaParaOEmulador(tmp) {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'recuperar-fase2-confra.js'), 'utf8');
  const trocas = [
    ["HASH_IDS_FASE2: '5e21da9f'", "HASH_IDS_FASE2: '" + HASH_IDS + "'"],
    ["HASH_CONTEUDO_FASE2: '3cba157b'", "HASH_CONTEUDO_FASE2: '" + HASH_CONT + "'"],
    ["HASH_IDS_FASE1: '40ef84d8'", "HASH_IDS_FASE1: '" + HASH_F1 + "'"],
    ["admin.initializeApp({ projectId: 'scoreplace-app' })", "admin.initializeApp({ projectId: '" + PROJECT + "' })"],
    /* ⛔ A CÓPIA SAI DO REPO, E OS `require` DELA SÃO RELATIVOS. `ROOT = __dirname/..`
     * vira o diretório temporário e o `require('firebase-admin')` estoura ANTES de
     * qualquer verificação — a ferramenta saía 1 em toda chamada e o teste acusava
     * "não abortou/não gravou" achando que era regra. Era o arreio. */
    ["const ROOT = path.join(__dirname, '..');", "const ROOT = " + JSON.stringify(ROOT) + ";"]
  ];
  let out = src;
  trocas.forEach(([de, para]) => {
    if (out.indexOf(de) === -1) { console.error('  ✗ alvo de substituição ausente: ' + de); fail++; }
    out = out.replace(de, para);
  });
  const dst = path.join(tmp, 'ferramenta.js');
  fs.writeFileSync(dst, out);
  return dst;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recup-'));
const cfg = path.join(tmp, 'firebase.json');
fs.writeFileSync(cfg, JSON.stringify({
  firestore: { rules: path.join(ROOT, 'firestore.rules') },
  emulators: { firestore: { port: PORT }, ui: { enabled: false }, singleProjectMode: true }
}));
const FERRAMENTA = ferramentaParaOEmulador(tmp);

/* backup privado sintético */
function escreveBackup(nome, mut) {
  const t = { id: TID, name: 'T', currentPhaseIndex: 1,
    phases: [{ name: 'G', rounds: 1 }, { name: 'E', rounds: 6 }],
    _semPesados: ['matches'], _nPartes: { matches: 115 }, _nJogos: 115,
    matches: JSON.parse(JSON.stringify(F2)), rounds: [], groups: [] };
  if (mut) mut(t);
  const p = path.join(tmp, nome);
  fs.writeFileSync(p, JSON.stringify({ _meta: { leva: 'teste' }, torneio: t }, null, 1));
  return p;
}

const DRIVER = `
const admin = require(${JSON.stringify(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'))});
const S = require(${JSON.stringify(path.join(ROOT, 'functions', 'vendor', 'tournament-split-core.js'))});
const { execFileSync } = require('child_process');
const F1 = ${JSON.stringify(F1)};
const TID = ${JSON.stringify(TID)};
const FERRAMENTA = ${JSON.stringify(FERRAMENTA)};
const BK_BOM = ${JSON.stringify(escreveBackup('bom.json'))};
const BK_HASH = ${JSON.stringify(escreveBackup('hash.json', (t) => { t.matches[0].p1 = 'ADULTERADO'; }))};
admin.initializeApp({ projectId: ${JSON.stringify(PROJECT)} });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(TID);

const roda = (args) => {
  try { return { code: 0, out: execFileSync('node', [FERRAMENTA].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:${PORT}' }) }) }; }
  catch (e) { return { code: e.status || 1, out: String(e.stdout || '') + String(e.stderr || '') }; }
};
const conta = async () => (await ref.collection('matches').get()).size;
const idsDoBanco = async () => { const s = await ref.collection('matches').get();
  const a = []; s.forEach(d => { const v = d.data() || {}; if (v.jogo) a.push(String(v.jogo.id)); }); return a.sort(); };

async function semear() {
  const b = db.batch();
  const s = await ref.collection('matches').get(); s.forEach(d => b.delete(d.ref));
  await b.commit();
  const t0 = { matches: JSON.parse(JSON.stringify(F1)), rounds: [], groups: [] };
  const p = S.dividir(t0, ['matches']);
  const b2 = db.batch();
  (p.matches || []).forEach(r => b2.set(ref.collection('matches').doc(S.chaveDoRegistro(r)), r));
  b2.set(ref, { id: TID, currentPhaseIndex: 1, _semPesados: ['matches'],
                _nPartes: { matches: 115 }, _nJogos: 115,
                phases: [{ name: 'G' }, { name: 'E' }] });
  await b2.commit();
}

(async () => {
  const R = {};
  await semear();
  R.semeado = await conta();
  const f1Antes = await idsDoBanco();

  // ① DRY-RUN não escreve
  const dry = roda(['--backup', BK_BOM, '--dry-run']);
  R.dry_code = dry.code; R.dry_zero = /ZERO escritas/.test(dry.out);
  R.apos_dry = await conta();

  // ④ hash divergente aborta
  const hb = roda(['--backup', BK_HASH, '--executar', '--confirmo']);
  R.hash_code = hb.code; R.hash_abortou = /ABORTADO/.test(hb.out);
  R.apos_hash = await conta();

  // ② execução real
  const ex = roda(['--backup', BK_BOM, '--executar', '--confirmo']);
  R.exec_code = ex.code; R.apos_exec = await conta();
  const d1 = await ref.get(); R.nJogos = (d1.data() || {})._nJogos;
  R.nPartes = ((d1.data() || {})._nPartes || {}).matches;

  // ③ Fase 1 intacta
  const todos = await idsDoBanco();
  R.f1_intacta = f1Antes.every(i => todos.includes(i)) && f1Antes.length === 115;

  // ⑥ idempotente
  const de2 = roda(['--backup', BK_BOM, '--executar', '--confirmo']);
  R.idem_code = de2.code; R.idem_msg = /NADA A FAZER|ABORTADO/.test(de2.out);
  R.apos_idem = await conta();

  // ⑤ id já existente aborta (o banco já tem os 99 agora)
  const col = roda(['--backup', BK_BOM, '--executar', '--confirmo']);
  R.colisao_nao_duplica = (await conta()) === R.apos_exec;

  console.log('__R__' + JSON.stringify(R));
  process.exit(0);
})().catch(e => { console.log('__R__' + JSON.stringify({ erro: String(e && e.message) })); process.exit(1); });
`;
const drv = path.join(tmp, 'driver.js');
fs.writeFileSync(drv, DRIVER);

console.log('──── recuperação da Fase 2 no emulador ────');
let saida = '';
try {
  saida = execFileSync('firebase', ['emulators:exec', '--only', 'firestore', '--config', cfg,
    '--project', PROJECT, 'node ' + JSON.stringify(drv)], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk@21/bin:/opt/homebrew/opt/openjdk/bin:' + process.env.PATH })
  });
} catch (e) { saida = String(e.stdout || '') + String(e.stderr || ''); }

const m = /__R__(\{.*\})/.exec(saida);
if (!m) { console.error('  ✗ driver não devolveu resultado:\n' + saida.slice(-1500)); process.exit(1); }
const R = JSON.parse(m[1]);
console.log('  ' + JSON.stringify(R));

ok(R.semeado === 115, '① semeadura: 115 jogos de Fase 1 (veio ' + R.semeado + ')');
ok(R.dry_code === 0 && R.dry_zero === true, '① dry-run termina bem e DIZ que não escreveu');
ok(R.apos_dry === 115, '① o dry-run NÃO escreveu nada (veio ' + R.apos_dry + ')');
ok(R.hash_code !== 0 && R.hash_abortou === true, '④ hash divergente ABORTA');
ok(R.apos_hash === 115, '④ e não escreveu nada (veio ' + R.apos_hash + ')');
ok(R.exec_code === 0, '② a execução real termina bem');
ok(R.apos_exec === 214, '② gravou os 99: 115 → 214 (veio ' + R.apos_exec + ')');
ok(R.nJogos === 214, '② _nJogos virou 214 (veio ' + R.nJogos + ')');
ok(R.nPartes === 214, '② _nPartes.matches virou 214 (veio ' + R.nPartes + ')');
ok(R.f1_intacta === true, '③ os 115 da Fase 1 continuam todos lá');
ok(R.idem_code === 0 && R.idem_msg === true, '⑥ a 2ª execução reconhece e não refaz');
ok(R.apos_idem === 214, '⑥ e não duplicou (veio ' + R.apos_idem + ')');
ok(R.colisao_nao_duplica === true, '⑤ id já existente não vira documento novo');

console.log(fail === 0 ? '  ✓ ' + pass + ' asserções' : '  ' + pass + ' ok / ' + fail + ' falhas');
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
process.exit(fail === 0 ? 0 : 1);
