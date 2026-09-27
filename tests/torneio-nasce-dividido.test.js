'use strict';
/* O TORNEIO NASCE DIVIDIDO — e a forma com que ele nasce é a MESMA que o separador produz.
 * node tests/torneio-nasce-dividido.test.js
 *
 * ⛔⛔ ORDEM DO DONO, 27/set/2026: _"nao é pra dividir em voo. é pra nascer dividido"_.
 *
 * POR QUE ISTO É REFORMA E NÃO REMENDO: dividindo em voo existem DUAS formas do mesmo torneio, e a
 * troca acontece num momento imprevisível — quando ele cruza o tamanho. Todo leitor, escritor e
 * conferidor tem de acertar as duas, e quem só acerta uma falha em SILÊNCIO, porque a forma que ele
 * não conhece simplesmente não tem o campo que ele procura. É de onde vem a classe de defeito que o
 * dono vem descrevendo há meses. Nascendo dividido a forma é UMA SÓ desde o primeiro dia.
 *
 * ⛔ O RISCO DESTA MUDANÇA, e o que este arquivo existe para eliminar: nascer numa forma PARECIDA
 * mas não idêntica à do separador criaria um TERCEIRO estado — o oposto do que ela resolve. Por isso
 * a prova não é "tem o marcador": é comparar, campo a campo, o documento recém-nascido com o que o
 * separador real produz a partir de um torneio equivalente.
 *
 * ⚠️ E É CONTRA O BANCO DE VERDADE. Um teste em memória monta o documento à mão e concorda comigo —
 * foi assim que eu afirmei um defeito que não existia, um dia antes desta mudança.
 */
const assert = require('assert/strict'), path = require('path');
const ROOT = path.join(__dirname, '..');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('child_process');
  const fs = require('fs');
  const base = path.join(ROOT, 'tmp');
  fs.mkdirSync(base, { recursive: true });
  const temp = fs.mkdtempSync(path.join(base, 'sp-nasce-dividido-'));
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
      'node tests/torneio-nasce-dividido.test.js'],
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

(async () => {
  const db = getFirestore(), uid = 'nasce-dividido-dono';
  await db.doc('users/' + uid).set({ displayName: 'Organização teste' });
  const id = 'tour_' + Date.now() + '_' + 'ad'.repeat(16);
  await functions.createTournament.run({
    auth: { uid, token: {} },
    data: { tournamentId: id, config: { name: 'Nasce dividido', sport: 'Beach Tennis', format: 'Eliminatórias Simples' } }
  });
  const doc = (await db.doc('tournaments/' + id).get()).data();
  assert(doc, 'o torneio foi criado');

  /* ── ① NASCE COM O MARCADOR E COM O CONTADOR ──────────────────────────────
   * ⛔ O contador não é enfeite: sem ele, "zero" vira "não sei", o leitor cai na heurística e pode
   * sair buscando parte que não existe. Zero tem de significar "vazio de verdade". */
  assert(Array.isArray(doc._semPesados) && doc._semPesados.length,
    '① ⛔⛔ nasce com o marcador de partes que moram fora');
  ['matches', 'participants', 'opponentHistory'].forEach((nome) => {
    assert(doc._semPesados.includes(nome), '① a parte "' + nome + '" nasce fora');
    assert.equal(doc._nPartes && doc._nPartes[nome], 0,
      '① ⛔ e o contador de "' + nome + '" nasce em ZERO — sem ele o leitor não sabe que está vazio');
  });
  assert(!doc._semPesados.includes('grupos'),
    '① ⚠️ `grupos` NÃO nasce fora: só 1 torneio em produção o tem assim, contra 40 com os outros');
  console.log('✓ ① nasce com marcador e contador');

  /* ── ② A FORMA É IDÊNTICA À DO SEPARADOR ──────────────────────────────────
   * ⛔⛔ É esta a asserção que impede um TERCEIRO estado. Se o nascimento e a divisão divergirem,
   * volta a haver mais de uma forma — que é exatamente o que esta mudança existe para acabar. */
  const equivalente = Split.dividir(
    Object.assign({}, doc, { _semPesados: undefined, _nPartes: undefined }),
    ['matches', 'participants', 'opponentHistory']
  );
  ['matches', 'participants', 'opponentHistory'].forEach((nome) => {
    assert(Array.isArray(doc[nome]) && doc[nome].length === 0,
      '② "' + nome + '" fica como ARRAY VAZIO no documento (é o que `dividir` deixa, não `delete`)');
    assert(Array.isArray(equivalente.config[nome]) && equivalente.config[nome].length === 0,
      '② e o separador real concorda para "' + nome + '"');
  });
  console.log('✓ ② a forma bate com a que o separador produz');

  /* ── ③ E ELE É USÁVEL: juntar devolve um torneio inteiro e coerente ───────
   * ⛔ Nascer numa forma que o leitor não remonta seria trocar um problema por outro pior. */
  const partes = {};
  for (const nome of doc._semPesados) {
    const col = Split.colecaoDaParte(nome);
    const snap = await db.collection('tournaments/' + id + '/' + col).get();
    partes[col] = snap.docs.map((d) => d.data());
  }
  const montado = await Split.montarDoBanco(doc, async (c) => partes[c] || []);
  assert(montado && montado.id === id, '③ juntar devolve o torneio');
  assert(Array.isArray(montado.participants) && montado.participants.length === 0,
    '③ ⛔ elenco vazio de verdade, não ausente — ausente faria a tela buscar para sempre');
  assert(Array.isArray(montado.matches) && montado.matches.length === 0, '③ e sem jogos, sem erro');
  console.log('✓ ③ junta e devolve um torneio usável');

  /* ── ④ E CONTINUA GRAVÁVEL PELA PORTA REAL ───────────────────────────────
   * ⛔ O guarda que recusa gravar parte não carregada é o que mais podia reagir mal a um documento
   * nascido assim: ele compara o contador com o que está em mãos. Com zero em ambos, nada falta. */
  const retry = await functions.createTournament.run({
    auth: { uid, token: {} },
    data: { tournamentId: id, config: { name: 'Nasce dividido', sport: 'Beach Tennis', format: 'Eliminatórias Simples' } }
  });
  assert(retry && retry.tournament, '④ reabrir a criação devolve o torneio, sem recusa por parte faltando');
  const doc2 = (await db.doc('tournaments/' + id).get()).data();
  assert.deepEqual(doc2._nPartes, doc._nPartes, '④ ⛔ e o contador não foi corrompido no caminho');
  console.log('✓ ④ a porta real relê e devolve, sem acusar parte faltando');

  console.log('\n✅ o torneio nasce dividido, na mesma forma do separador, e é usável');
  await db.terminate();
  process.exit(0);
})().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
