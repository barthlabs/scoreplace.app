'use strict';
/* ENTRADA TARDIA PRECISA FUNCIONAR TAMBÉM NO TORNEIO DIVIDIDO.
 * node tests/tardio-entra-em-torneio-dividido.test.js
 *
 * ⛔⛔ O TORNEIO TEM DUAS FORMAS. Ele nasce inteiro num documento só; quando cresce, as partes
 * pesadas (jogos, inscritos, histórico) passam a morar em documentos próprios e o principal guarda
 * a configuração. Quem lê junta; quem grava separa. A Confra está na forma dividida.
 *
 * ⛔ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA PROVAR: na forma dividida, a remontagem devolve os jogos
 * dentro das RODADAS e não numa lista plana. O integrador de tardios começa exigindo a lista plana,
 * então ele desiste na PRIMEIRA LINHA — sem recusa registrada, sem nada na tela. Ninguém entra e
 * ninguém fica sabendo.
 * ⚠️ E É POR ISSO QUE ELE PRECISA DO BANCO DE VERDADE: um teste com objeto em memória monta a lista
 * plana à mão e passa verde com o defeito de pé. Foi assim que ele sobreviveu.
 *
 * ⭐ ORDEM DO DONO, 27/set/2026: o torneio vai passar a NASCER dividido. Hoje este defeito atinge só
 * os torneios já migrados; depois atingiria todos. Por isso ele é consertado ANTES.
 * [[project_torneio_nasce_dividido]] · [[project_entrada_tardia_nao_funciona_em_torneio_dividido]]
 */
const assert = require('assert/strict'), path = require('path');
const ROOT = path.join(__dirname, '..');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('child_process');
  const fs = require('fs');
  const base = path.join(ROOT, 'tmp');          // temporário DENTRO do projeto, apagado ao fim
  fs.mkdirSync(base, { recursive: true });
  const temp = fs.mkdtempSync(path.join(base, 'sp-tardio-dividido-'));
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
    { encoding: 'utf8' }).trim());
  const config = path.join(temp, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({
    firestore: { rules: path.join(ROOT, 'tests/concurrency/firestore.allow.rules') },
    emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false }, singleProjectMode: true }
  }));
  const result = spawnSync('firebase',
    ['emulators:exec', '--only', 'firestore', '--config', config, '--project', 'demo-scoreplace',
      'node tests/tardio-entra-em-torneio-dividido.test.js'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }, timeout: 180000 });
  fs.rmSync(temp, { recursive: true, force: true });
  const saida = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(saida);
  if (result.error) console.error(result.error);
  if (result.status !== 0 && /Script exited successfully \(code 0\)/.test(saida)) {
    console.error('\n⚠️  O TESTE PASSOU; quem falhou foi o desligamento do emulador.\n');
    process.exit(0);
  }
  process.exit(result.status === null ? 1 : result.status);
}

assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST), 'só emulador local');
process.env.GCLOUD_PROJECT = 'demo-scoreplace';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-scoreplace' });

const functions = require('../functions-autodraw/index');
const { getFirestore } = require('module').createRequire(path.join(ROOT, 'functions-autodraw/index.js'))('firebase-admin/firestore');
const Split = require(path.join(ROOT, 'js/views/tournament-split-core.js'));

const H = require('./headless.js');
['chaves.js', 'chaves-adapter.js'].forEach(function (f) { try { H.load(f); } catch (e) {} });
const A = H.window._chavesAdapter;

(async () => {
  const db = getFirestore();
  const dono = 'dividido-dono';
  const gente = (n) => Array.from({ length: n }, (_, i) => ({ name: 'D' + (i + 1), uid: 'u' + (i + 1) }));
  const tardio = { name: 'Tardio 09', uid: 'u9', presente: true };

  /* Semeia um torneio na forma DIVIDIDA, pelo mesmo separador da produção: os jogos saem do
   * documento e vão para a subcoleção, e o marcador `_semPesados` diz que eles moram fora. */
  const semear = async (sufixo, dividido) => {
    const id = 'tour_' + Date.now() + '_' + String(sufixo).padEnd(32, 'x');
    const jogos = A.build(8, 'simples', { participantes: gente(8), politicaDaChave: 'repescagem' }).matches;
    const base = {
      name: 'Dividido ' + sufixo, sport: 'Beach Tennis', format: 'Eliminatórias Simples',
      creatorUid: dono, newMatchups: true, lateEnrollment: 'expand',
      participants: gente(8), standbyParticipants: [tardio],
      checkedIn: { u9: Date.now() },              // presença é INSTANTE, não `true`
      matches: jogos,
      rounds: [{ round: 1, matches: jogos }]
    };
    if (!dividido) { await db.doc('tournaments/' + id).set(base); return id; }
    const p = Split.dividir(JSON.parse(JSON.stringify(base)), ['matches']);
    const cfg = Object.assign({}, p.config, { _semPesados: ['matches'] });
    delete cfg.matches;                           // na forma dividida ele NÃO mora no documento
    await db.doc('tournaments/' + id).set(cfg);
    const lote = db.batch();
    (p.matches || []).forEach((reg, i) => {
      lote.set(db.doc('tournaments/' + id + '/matches/m' + i), reg);
    });
    await lote.commit();
    return id;
  };

  const quantosJogos = async (id) => {
    const raiz = (await db.doc('tournaments/' + id).get()).data();
    if (!Array.isArray(raiz._semPesados) || !raiz._semPesados.length) {
      return (raiz.matches || []).length;
    }
    const sub = await db.collection('tournaments/' + id + '/matches').get();
    return sub.size;
  };

  /* ── ① A FORMA INTEIRA FUNCIONA — é a régua de comparação ─────────────────
   * Sem isto, um "não entrou" no dividido não prova nada: podia ser a fixture. */
  const idInteiro = await semear('a', false);
  const antesI = await quantosJogos(idInteiro);
  const rI = await functions.integrateLateEntries.run({ auth: { uid: dono }, data: { tournamentId: idInteiro } });
  const depoisI = await quantosJogos(idInteiro);
  console.log('  inteiro : changed=' + (rI && rI.changed) + ' · jogos ' + antesI + ' → ' + depoisI);
  assert.equal(rI && rI.changed, true, 'na forma inteira o tardio entra (régua de comparação)');
  assert(depoisI > antesI, 'e a chave cresce');

  /* ── ② A FORMA DIVIDIDA TEM DE FAZER O MESMO ──────────────────────────────
   * ⛔ Hoje ela NÃO faz: o integrador exige a lista plana de jogos, que a remontagem não produz,
   * e desiste antes de olhar para qualquer coisa. */
  const idDividido = await semear('b', true);
  const antesD = await quantosJogos(idDividido);
  const rD = await functions.integrateLateEntries.run({ auth: { uid: dono }, data: { tournamentId: idDividido } });
  const depoisD = await quantosJogos(idDividido);
  console.log('  dividido: changed=' + (rD && rD.changed) + ' · jogos ' + antesD + ' → ' + depoisD);
  assert.equal(rD && rD.changed, true,
    '⛔⛔ na forma DIVIDIDA o tardio também tem de entrar — hoje o integrador desiste em silêncio');
  assert(depoisD > antesD, '⛔ e a chave dividida também tem de crescer');

  /* ── ③ E O TARDIO ESTÁ MESMO NA CHAVE GRAVADA, não só "changed" ─────────── */
  const sub = await db.collection('tournaments/' + idDividido + '/matches').get();
  const achou = sub.docs.some((d) => {
    const j = (d.data() || {}).jogo || {};
    return j.p1 === tardio.name || j.p2 === tardio.name;
  });
  assert(achou, '③ ⛔ o tardio aparece nos jogos GRAVADOS da subcoleção');

  console.log('\n✅ entrada tardia funciona nas DUAS formas do torneio');
  await db.terminate();
  process.exit(0);
})().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
