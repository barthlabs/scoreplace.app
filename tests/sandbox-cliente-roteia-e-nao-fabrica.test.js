/* O CLIENTE NÃO FABRICA SANDBOX — ELE PEDE, E ROTEIA.  (FIX.SANDBOX.P2, 2.1.87)
 * node tests/sandbox-cliente-roteia-e-nao-fabrica.test.js
 *
 * ⚠️ ESTE ARQUIVO SUBSTITUI `tests/sandbox-e-replica-fiel.test.js`, que media a criação
 * feita NO CLIENTE. Ela não existe mais — e não podia existir: o cliente NÃO PODE escrever
 * as subcoleções (`firestore.rules`: `allow write: if false`), então um sandbox dividido
 * fabricado aqui prometia `_nPartes` que ninguém preenchia (o "14 inscritos e 0 jogos").
 * A FIDELIDADE passou a ser provada onde ela acontece: `tests/sandbox-cf-emulador.test.js`,
 * contra a Function, o Firestore e as Rules de verdade.
 *
 * O que sobra pro cliente — e é o que este arquivo trava:
 *   ① pedir ao servidor passando UM id e mais nada;
 *   ② nunca gravar o torneio ele mesmo;
 *   ③ rotear parent e subcoleções pra coleção certa, sem heurística de nome;
 *   ④ usar `resultsSandbox` no sandbox e `results` no torneio real.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.sandbox;
try { require('./headless').load('tournaments-organizer.js'); } catch (e) { /* medido em ① */ }

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };

(async () => {
  console.log('──── o cliente não fabrica sandbox: pede e roteia ────');

  console.log('\n── ① a criação é um PEDIDO ao servidor, com UM id ──');
  ok('a porta existe', typeof W._criaSandboxFiel === 'function' && typeof W._openOrCreateSandbox === 'function');
  let chamada = null, gravou = 0, navegou = null;
  W.firebase = {
    app: () => ({ functions: () => ({ httpsCallable: (nome) => (payload) => {
      chamada = { nome, payload };
      return Promise.resolve({ data: { ok: true, id: 'sb_orig_1', docsCopiados: 269 } });
    } }) }),
    functions: true
  };
  W.FirestoreDB = { db: true, saveTournament: () => { gravou++; return Promise.resolve(true); } };
  W.showNotification = () => {};
  Object.defineProperty(W, 'location', { configurable: true, value: { set hash(v) { navegou = v; }, get hash() { return navegou || ''; } } });
  const r = await W._criaSandboxFiel('orig_1', { uid: 'uDev', email: 'dev@x.com' });
  ok('⭐⭐ chamou a Cloud Function `createSandbox`', chamada && chamada.nome === 'createSandbox', JSON.stringify(chamada));
  ok('⭐⭐ mandou SÓ o originalTournamentId — nenhum payload de torneio',
    chamada && JSON.stringify(Object.keys(chamada.payload).sort()) === JSON.stringify(['originalTournamentId']) &&
    chamada.payload.originalTournamentId === 'orig_1', JSON.stringify(chamada && chamada.payload));
  ok('⭐⭐ o cliente NÃO gravou torneio nenhum', gravou === 0, 'gravou ' + gravou + '×');
  ok('devolveu ok com o id do servidor', r && r.ok === true && r.id === 'sb_orig_1', JSON.stringify(r));
  ok('e já sabe rotear esse id', W._sbIdsConhecidos && W._sbIdsConhecidos['sb_orig_1'] === true);

  console.log('\n── ② falha do servidor: nada gravado, nada aberto ──');
  chamada = null; gravou = 0; navegou = null; W._sbIdsConhecidos = {};
  W.firebase.app = () => ({ functions: () => ({ httpsCallable: () => () =>
    Promise.reject(Object.assign(new Error('original incompleto'), { code: 'failed-precondition' })) }) });
  const r2 = await W._criaSandboxFiel('orig_1', { uid: 'uDev', email: 'dev@x.com' });
  ok('⭐⭐ devolveu falha', r2 && r2.ok === false, JSON.stringify(r2));
  ok('⭐⭐ não gravou nada', gravou === 0);
  ok('⭐⭐ e NÃO navegou pro sandbox', navegou === null, String(navegou));

  console.log('\n── ③ roteamento de coleção, por FATO (nunca por nome de id) ──');
  const DB = require('./headless');
  const F = {
    db: { collection: (c) => ({ doc: (id) => ({ _path: c + '/' + id, collection: (s) => ({ _path: c + '/' + id + '/' + s }) }) }) },
    _ehSandbox: W.FirestoreDB && W.FirestoreDB._ehSandbox,
  };
  // carrega o firebase-db REAL pra pegar os helpers
  try { require('./headless').load('../firebase-db.js'); } catch (e) {}
  const real = W.FirestoreDB;
  const temHelpers = real && typeof real._tRef === 'function' && typeof real._subNome === 'function' && typeof real._tSub === 'function';
  ok('os helpers de rota existem no FirestoreDB', temHelpers,
    'tipos: ' + [typeof (real||{})._tRef, typeof (real||{})._subNome, typeof (real||{})._tSub].join(','));
  if (temHelpers) {
    real.db = { collection: (c) => ({ doc: (id) => ({ path: c + '/' + id, collection: (s) => ({ path: c + '/' + id + '/' + s }) }) }) };
    W.AppStore.tournaments = [{ id: 'real_1' }, { id: 'sb_2', isSandbox: true }];
    W._sbIdsConhecidos = { sb_3: true };
    ok('⭐⭐ torneio real → tournaments', real._tRef('real_1').path === 'tournaments/real_1', real._tRef('real_1').path);
    ok('⭐⭐ sandbox por OBJETO em memória → sandboxes', real._tRef('sb_2').path === 'sandboxes/sb_2', real._tRef('sb_2').path);
    ok('⭐⭐ sandbox pelo REGISTRO do ouvinte → sandboxes', real._tRef('sb_3').path === 'sandboxes/sb_3', real._tRef('sb_3').path);
    ok('⛔ id desconhecido cai em tournaments (sem fato, não inventa)',
      real._tRef('nunca_visto').path === 'tournaments/nunca_visto', real._tRef('nunca_visto').path);
    ok('⛔ e NÃO decide por nome: "sb_" num id desconhecido não vira sandbox',
      real._tRef('sb_desconhecido').path === 'tournaments/sb_desconhecido', real._tRef('sb_desconhecido').path);
    console.log('\n── ④ results → resultsSandbox só no sandbox ──');
    ok('⭐⭐ sandbox: results vira resultsSandbox', real._subNome('sb_2', 'results') === 'resultsSandbox');
    ok('⭐⭐ torneio real: results continua results', real._subNome('real_1', 'results') === 'results');
    ok('  → e as outras subcoleções não mudam de nome nem no sandbox',
      ['matches','inscritos','opponentHistory','grupos','history','checkedIn','woLog','woClaims','resultQueue']
        .every((c) => real._subNome('sb_2', c) === c));
    ok('⭐ _tSub monta o caminho completo do sandbox',
      real._tSub('sb_2', 'results').path === 'sandboxes/sb_2/resultsSandbox', real._tSub('sb_2', 'results').path);
    ok('⭐ e o do torneio real', real._tSub('real_1', 'results').path === 'tournaments/real_1/results');
  }

  /* ── ⑥ NO SANDBOX, QUEM ESCREVE AS PARTES É O CLIENTE — e escreve o DELTA ────────────
   * ⛔ Num torneio real esta escrita não existe: a regra nega o cliente na subcoleção e quem
   * escreve é a CF. Só que os gatilhos dela observam `tournaments/{tid}` e NÃO enxergam
   * `sandboxes/` — sem este caminho, avançar fase num sandbox dividido gravaria as rodadas
   * SEM os jogos, com `_nJogos` prometendo o que ninguém escreveu.
   * ⭐ E o teste EXECUTA `_sbGravaPartes` com um lote de mentira, em vez de ler o fonte: é
   * aqui que uma régua de chave errada gravaria o registro de A por cima do de B. */
  console.log('\n── ⑥ sandbox dividido: o cliente grava as PARTES, e só o que mudou ──');
  if (temHelpers) {
    const S = require(path.join(ROOT, 'js/views/tournament-split-core.js'));
    W._tSplit = S;
    const escritas = [], apagadas = [];
    let commits = 0;
    real.db.batch = () => ({
      set: (r, v) => escritas.push({ path: r.path, v: v }),
      delete: (r) => apagadas.push(r.path),
      commit: () => { commits++; return Promise.resolve(); },
    });
    real.db.collection = (c) => ({ doc: (id) => ({
      path: c + '/' + id,
      collection: (s) => ({ path: c + '/' + id + '/' + s, doc: (d) => ({ path: c + '/' + id + '/' + s + '/' + d }) }),
    }) });
    const jogo = (id, ri, mi, w) => ({ _chave: 'k' + id, _loc: { tipo: 'rounds', ri: ri, mi: mi }, jogo: { id: id, winner: w } });
    const antes = { matches: [jogo('m1', 0, 0, null), jogo('m2', 0, 1, null)] };
    const depois = { matches: [jogo('m1', 0, 0, 'a'), jogo('m3', 1, 0, null)] };  // m1 mudou, m3 nasceu, m2 sumiu
    const n = await real._sbGravaPartes('sb_2', antes, depois, ['matches']);
    ok('⭐⭐ escreveu no caminho do SANDBOX, nunca em tournaments',
      escritas.length > 0 && escritas.every((e) => e.path.indexOf('sandboxes/sb_2/matches/') === 0),
      JSON.stringify(escritas.map((e) => e.path)));
    ok('⭐⭐ escreveu SÓ o que mudou (m1 e m3), não a coleção inteira',
      escritas.length === 2 && escritas.some((e) => e.v.jogo.id === 'm1') && escritas.some((e) => e.v.jogo.id === 'm3'),
      JSON.stringify(escritas.map((e) => e.v.jogo.id)));
    ok('⭐⭐ e APAGOU quem sumiu (m2) — parte que fica pra trás é jogo fantasma na tela',
      apagadas.length === 1 && apagadas[0].indexOf('sandboxes/sb_2/matches/') === 0, JSON.stringify(apagadas));
    ok('   um lote só, e o número devolvido bate (' + n + ')', commits === 1 && n === 3);
    ok('⛔ CONTROLE: sem partes a escrever, não abre lote nenhum',
      (await real._sbGravaPartes('sb_2', antes, antes, ['matches'])) === 0 && commits === 1, 'commits=' + commits);
    /* ⛔ O TETO DO BATCH É 500 e um avanço do tamanho do Confra passa disso — e lote
     * estourado não grava NADA, o que aqui seria a chave da próxima fase sumindo inteira. */
    escritas.length = 0; commits = 0;
    const muitos = { matches: [] };
    for (let k = 0; k < 950; k++) muitos.matches.push(jogo('j' + k, 0, k, null));
    const n2 = await real._sbGravaPartes('sb_2', { matches: [] }, muitos, ['matches']);
    ok('⭐⭐ 950 registros vão em LOTES de 400 (3 commits), nenhum acima do teto de 500',
      n2 === 950 && commits === 3 && escritas.length === 950, 'n=' + n2 + ' commits=' + commits);
  }

  /* ── ⑦ O PODER DE ORGANIZADOR VEM DA CONDIÇÃO, NÃO DO DADO TROCADO (2.1.88) ──────────
   * ⛔ Até a 2.1.87 a Function gravava `creatorUid` = uid do dev pra que os botões de
   * organizador aparecessem. Isso é comprar interface com ESTADO — e estado é o que o
   * sandbox existe pra reproduzir. Ordem do dono: _"não altere creatorUid, adminUids,
   * coHosts ou membership para conceder controles"_. */
  console.log('\n── ⑦ organizador do sandbox: condição de interface, sem tocar no dado ──');
  {
    const A = W.AppStore;
    const antes = A.currentUser;
    A.currentUser = { uid: 'uDev', email: 'dev@x.com' };
    // o sandbox preserva o criador do ORIGINAL — quem manda nele é o dono do sandbox
    const sb = { id: 'sb_x', isSandbox: true, sandboxOwnerUid: 'uDev', creatorUid: 'uOrig',
                 adminUids: ['uOrig'], coHosts: [{ uid: 'uCo', status: 'active' }], memberUids: ['uOrig', 'uReal'] };
    const real = { id: 'real_x', creatorUid: 'uOrig', adminUids: ['uOrig'], coHosts: [] };
    ok('⭐⭐ o DONO do sandbox é organizador dele', A.isOrganizer(sb) === true);
    ok('⭐⭐ e criador, para efeito de controles', A.isCreator(sb) === true);
    ok('⭐⭐ ⛔ e NADA no documento foi trocado pra isso',
      sb.creatorUid === 'uOrig' && JSON.stringify(sb.adminUids) === '["uOrig"]' &&
      sb.coHosts.length === 1 && sb.memberUids.length === 2, JSON.stringify(sb));
    ok('⛔ CONTROLE: torneio REAL de outra pessoa continua NÃO sendo meu',
      A.isOrganizer(real) === false && A.isCreator(real) === false);
    A.currentUser = { uid: 'uOutro', email: 'outro@x.com' };
    ok('⛔ CONTROLE: sandbox de OUTRA pessoa não me dá poder nenhum',
      A.isOrganizer(sb) === false && A.isCreator(sb) === false);
    A.currentUser = antes;
  }
  ok('⭐ e o sandbox se anuncia por TARJA, não pelo nome (a Function não prefixa mais)',
    fs.readFileSync(path.join(ROOT, 'js/views/tournaments.js'), 'utf8')
      .indexOf('t.isSandbox ? `<div style="background:#b91c1c') !== -1);
  {
    const fn = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
    ok('⛔ a Function NÃO prefixa mais o nome com "(SB) "', fn.indexOf('"(SB) " + String(cfg.name') === -1);
    const iEnv = fn.indexOf('const SB_ENVELOPE = [');
    const env = fn.slice(iEnv, fn.indexOf('];', iEnv));
    ['name', 'creatorUid', 'organizerEmail', 'organizerName', 'isPublic', 'createdAt',
     'updatedAt', 'remindersSent', 'finishNotifiedAt', 'nextDrawAt', 'lastAutoDrawAt',
     'sandboxId'].forEach((k) => {
      ok('  ⛔ `' + k + '` fora do SB_ENVELOPE', env.indexOf('"' + k + '"') === -1, env);
    });
  }

  /* ── ⑧ APAGAR O SANDBOX APAGA TUDO QUE É DELE ───────────────────────────────────────
   * A lista de subcoleções do sandbox tem que COBRIR o que a Function copia. Se uma parte
   * nova entrar na cópia e não entrar aqui, ela sobrevive órfã numa coleção onde ninguém
   * mais passa — a mesma origem dos 151 `results` órfãos de 01/ago/2026. */
  console.log('\n── ⑧ a lista de exclusão do sandbox cobre o que a cópia cria ──');
  if (temHelpers) {
    const regras = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
    const iSb = regras.indexOf('match /sandboxes/{sandboxId} {');
    // ⚠️ começa DEPOIS do `match` do próprio parent, senão "sandboxes" entra como se fosse
    // subcoleção dele mesmo e o teste cobra do apagar uma coleção que não existe.
    const bloco = regras.slice(regras.indexOf('\n', iSb), regras.indexOf('match /tournaments/{tournamentId} {'));
    const nasRegras = (bloco.match(/match \/([A-Za-z]+)\/\{/g) || [])
      .map((s) => s.replace('match /', '').replace(/\/\{$/, ''));
    const naLista = (real._sandboxSubcollections || []).map((c) => real._subNome('sb_2', c));
    ok('as regras declaram ' + nasRegras.length + ' subcoleções de sandbox', nasRegras.length >= 12, JSON.stringify(nasRegras));
    const faltando = nasRegras.filter((c) => naLista.indexOf(c) === -1);
    ok('⭐⭐ nenhuma delas fica de fora do apagar (faltando: ' + faltando.join(', ') + ')',
      faltando.length === 0, JSON.stringify({ nasRegras: nasRegras, naLista: naLista }));
    ok('⭐⭐ e `results` do sandbox é apagado como `resultsSandbox`',
      naLista.indexOf('resultsSandbox') !== -1, JSON.stringify(naLista));
    ok('⛔ CONTROLE: em torneio REAL a lista continua a curta (results + letzplayScans)',
      JSON.stringify(real._tournamentSubcollections) === JSON.stringify(['results', 'letzplayScans']));
  }

  console.log('\n── ⑤ ESTRUTURAL: nada de segunda fonte no cliente ──');
  const org = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-organizer.js'), 'utf8');
  ok('⛔ o cliente não monta mais o envelope (removida `_sbAplicaEnvelope`)',
    org.indexOf('window._sbAplicaEnvelope =') === -1);
  ok('⛔ e não clona o objeto da tela', org.indexOf('JSON.stringify(orig)') === -1);
  ok('⭐ a criação passa por httpsCallable("createSandbox")', /httpsCallable\('createSandbox'\)/.test(org));
  const st = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  ok('⭐⭐ existe ouvinte PRÓPRIO de sandboxes, por sandboxOwnerUid',
    /collection\('sandboxes'\)[\s\S]{0,120}where\('sandboxOwnerUid', '==', _uid\)/.test(st));
  ok('⭐⭐ e ele só aceita `ready` (criação interrompida não aparece)', /sbState === 'ready'/.test(st));
  ok('⛔ o resync do cliente está desligado (quem copia é a CF)',
    /resync do cliente está desligado/.test(st));
  const fdb = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
  const sobraram = (fdb.match(/collection\('tournaments'\)\.doc\(/g) || []).length;
  ok('⛔ nenhuma porta POR DOCUMENTO escapou pra tournaments em firebase-db (' + sobraram + ')', sobraram === 0);

  console.log(falhas === 0
    ? '\n✅ sandbox-cliente-roteia-e-nao-fabrica: OK'
    : '\n❌ sandbox-cliente-roteia-e-nao-fabrica: ' + falhas + ' falha(s)');
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', e && e.stack || e); process.exit(1); });
