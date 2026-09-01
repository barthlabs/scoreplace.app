/* O OUVINTE DE `sandboxes` HIDRATA COMO O DE `tournaments`.  (FIX.SANDBOX.P3, 2.1.89)
 * node tests/ouvinte-de-sandbox-hidrata-como-o-real.test.js
 *
 * ⛔ O DEFEITO, relatado com o sandbox do Confra na mão: o sandbox no Firestore era réplica
 * fiel (medido em CONFRA.QA.S1 — 0 divergências, 152 inscritos, 115 jogos, 25 congeladas),
 * e mesmo assim a TELA mostrava a tarja de sandbox em cima de um torneio vazio: sem
 * inscritos, sem chave, participação incerta e sem o botão de avançar.
 *
 * A CAUSA era só o caminho de LEITURA. O ouvinte de `sandboxes` (2.1.87) chamava
 * `_sbIngest` com `doc.data()` CRU — o documento MAGRO de um torneio dividido — enquanto o
 * de `tournaments` passa o doc por `_enxertaJogos` (preserva o que já foi montado),
 * `_marcaPartesQueFaltam` (marca `_faltamPesados`) e agenda `_montaPesadosQueFaltam`.
 * Duas portas para a mesma pergunta: uma sabia, a outra não.
 *
 * ⭐ ESTE TESTE EXECUTA O CÓDIGO REAL — carrega `js/store.js` num contexto de mentira e
 * chama `window._sbIngest` de verdade, com um Firestore de mentira. Não é réplica da
 * lógica: é a lógica.
 *
 * ⛔ E CADA AFIRMAÇÃO TEM CONTROLE VERMELHO: o `_sbIngest` da 2.1.88 — CONGELADO neste
 * arquivo, ver `SB_INGEST_2188` — roda contra as MESMAS entradas e tem que REPROVAR onde o
 * novo passa. Sem isso, "passou" não distingue conserto de coincidência.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let falhas = 0;
const ok = (n, c, x) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (x ? '\n      ' + x : '')); falhas++; } };

/* ── o torneio dividido como o banco o entrega: MAGRO ─────────────────────────── */
const docMagro = () => ({
  id: 'sb_x', isSandbox: true, sandboxOf: 'orig_x', sandboxOwnerUid: 'uid_dev_teste',
  sbState: 'ready', notificationsMuted: true,
  name: 'Confra', creatorUid: 'uid_organizador_real',
  memberUids: ['uid_organizador_real', 'uid_a', 'uid_b'],
  coHosts: [{ uid: 'uid_cohost', status: 'active' }], adminUids: ['uid_organizador_real'],
  participants: [], phases: [{ name: 'RR' }, { name: 'Ouro/Prata' }],
  rounds: [{ round: 1, status: 'complete', matches: [], monarchGroups: [] }],
  _semPesados: ['matches', 'participants', 'grupos'],
  _nPartes: { matches: 115, participants: 152, grupos: 25 }, _nJogos: 115, _nGrupos: 25,
});
/* ── e o mesmo torneio DEPOIS que as subcoleções chegaram ─────────────────────── */
const partesMontadas = () => ({
  participants: Array.from({ length: 152 }, (_, i) => ({ uid: 'uid_p' + i, name: 'P' + i })),
  rounds: [{ round: 1, status: 'complete',
    matches: Array.from({ length: 115 }, (_, i) => ({ id: 'm' + i, winner: i < 105 ? 'a' : null })),
    monarchGroups: Array.from({ length: 25 }, (_, g) => ({
      name: 'G' + g, players: ['a', 'b', 'c', 'd'],
      classifCongelada: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }],
    })) }],
});


/* ⛔ O `_sbIngest` DA 2.1.88, CONGELADO AQUI DE PROPÓSITO.
 * Isto NÃO é réplica da lógica sob teste — é o DEFEITO, guardado pra poder ser
 * reproduzido. Ele era recortado do git (`git show HEAD:js/store.js`), e isso quebrava por
 * DOIS motivos, os dois medidos: (1) assim que a correção vira HEAD, o recorte devolve o
 * código NOVO e o controle passa a comparar consigo mesmo; (2) o deploy roda a suíte numa
 * cópia extraída por `git archive`, que não tem `.git` nenhum — e o preflight reprovou
 * exatamente aí. Controle que depende da árvore continuar parada não é controle.
 * Este texto não muda mais: ele é história, não código vivo. */
const SB_INGEST_2188 = "window._sbIngest = function (docs) {\n  var AS = window.AppStore;\n  if (!AS) return;\n  var lista = AS.tournaments || (AS.tournaments = []);\n  (docs || []).forEach(function (d) {\n    if (!d || !d.id || d.sbState !== 'ready') return;\n    var i = -1;\n    for (var k = 0; k < lista.length; k++) { if (String(lista[k].id) === String(d.id)) { i = k; break; } }\n    if (i === -1) lista.push(d); else Object.assign(lista[i], d);\n  });\n  try { if (typeof window._repintarSeNecessario === 'function') window._repintarSeNecessario(); } catch (e) {}\n};";
/* ⭐ O HARNESS É O DO PROJETO (`tests/render-harness.js`) — o mesmo que carrega o store.js
 * nos outros testes. Montar um `window` próprio aqui viraria um SEGUNDO ambiente de teste,
 * divergindo do primeiro: o meu morreu em `document.body.addEventListener`, e cada remendo
 * seria mais uma diferença entre o que o teste roda e o que o app roda. */
function novoMundo() {
  delete require.cache[require.resolve('./render-harness')];
  return require('./render-harness').sandbox;
}

(async () => {
  console.log('──── o ouvinte de sandbox hidrata como o real ────');

  /* ═════ ① A PORTA É UMA SÓ ═════════════════════════════════════════════════ */
  console.log('\n── ① a porta de hidratação é ÚNICA (os dois ouvintes chamam a mesma) ──');
  const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  ok('⭐⭐ a porta existe no topo, fora de qualquer closure',
    /^window\._preservaPartesMontadas = function \(novo, velho\) \{/m.test(src));
  ok('⭐⭐ o ouvinte de TORNEIO REAL passa por ela',
    /var _enxertaJogos = function \(novo, velho\) \{ return window\._preservaPartesMontadas\(novo, velho\); \};/.test(src));
  const iIng = src.indexOf('window._sbIngest = function (docs) {');
  const corpoIngest = src.slice(iIng, src.indexOf('\n};', iIng));
  ok('⭐⭐ o ouvinte de SANDBOX passa pela MESMA porta',
    corpoIngest.indexOf('window._preservaPartesMontadas(') !== -1);
  ok('⛔ e NÃO reimplementa a heurística (nada de `_semPesados` decidido à mão aqui)',
    corpoIngest.indexOf('_semPesados') === -1, corpoIngest.slice(0, 200));
  ok('⭐ ele agenda a montagem pela porta canônica',
    /_montaPesadosQueFaltam\(paraMontar\)/.test(corpoIngest));
  ok('⛔ e o listener não decide mais id conhecido por conta própria (fonte única)',
    src.indexOf("if (ch.type === 'removed' || !pronto) { delete window._sbIdsConhecidos[ch.doc.id]; }") === -1);

  const W = novoMundo();
  ok('o harness carregou o store.js REAL', typeof W._sbIngest === 'function' && typeof W._preservaPartesMontadas === 'function');
  const AS = W.AppStore;
  AS.currentUser = { uid: 'uid_dev_teste', email: 'dev@x.com' };
  AS.tournaments = [];
  let montagensPedidas = [];
  AS._montaPesadosQueFaltam = function (ids) { montagensPedidas.push(ids.slice()); };
  let repintou = 0;
  W._repintarSeNecessario = function () { repintou++; };

  /* ═════ ② ENTREGA CRUA: incompleto e UMA montagem ══════════════════════════ */
  console.log('\n── ② sandbox dividido entregue CRU pelo listener ──');
  W._sbIngest([docMagro()]);
  const sb = AS.tournaments.find((t) => t.id === 'sb_x');
  ok('⭐⭐ entrou na lista', !!sb);
  ok('⭐⭐ ficou marcado como INCOMPLETO (`_faltamPesados`)', sb && sb._faltamPesados === true,
    JSON.stringify(sb && sb._faltaOQue));
  ok('   e diz QUAIS partes faltam', sb && JSON.stringify((sb._faltaOQue || []).slice().sort()) ===
    JSON.stringify(['grupos', 'matches', 'participants']), JSON.stringify(sb && sb._faltaOQue));
  ok('⭐⭐ agendou UMA montagem, com o id do sandbox',
    montagensPedidas.length === 1 && JSON.stringify(montagensPedidas[0]) === JSON.stringify(['sb_x']),
    JSON.stringify(montagensPedidas));
  ok('⭐⭐ o id foi registrado como sandbox (a montagem lê de `sandboxes/`)',
    W._sbIdsConhecidos && W._sbIdsConhecidos['sb_x'] === true);
  ok('⛔ e NÃO afirma zero inscritos enquanto a parte não chegou: a marca de incompleto existe',
    sb && sb._faltamPesados === true && (sb.participants || []).length === 0,
    'a lista está vazia, mas acompanhada da marca — é "ainda não sei", não "não tem"');
  ok('   repintou', repintou >= 1);

  /* ═════ ③ DEPOIS DA MONTAGEM: tudo completo ════════════════════════════════ */
  console.log('\n── ③ depois que as partes chegam ──');
  Object.assign(sb, partesMontadas());
  delete sb._faltamPesados; delete sb._faltaOQue;       // é o que `_montaPesadosQueFaltam` faz
  const jogos = (sb.rounds[0].matches || []);
  ok('⭐⭐ inscritos completos (152)', (sb.participants || []).length === 152);
  ok('⭐⭐ membership preservada (memberUids/coHosts/adminUids do ORIGINAL)',
    sb.memberUids.length === 3 && sb.coHosts.length === 1 && sb.adminUids[0] === 'uid_organizador_real');
  ok('⭐⭐ jogos completos (115) e barra em 91% (105 feitos)',
    jogos.length === 115 && Math.round(jogos.filter((m) => m.winner).length / jogos.length * 100) === 91);
  ok('⭐⭐ classificação congelada presente (25 grupos)',
    (sb.rounds[0].monarchGroups || []).filter((g) => Array.isArray(g.classifCongelada)).length === 25);
  ok('⭐ e o torneio deixou de estar incompleto', !W._marcaPartesQueFaltam(sb));

  /* ═════ ④ O DONO É ORGANIZADOR — POR CONDIÇÃO, SEM TROCAR DADO ═════════════ */
  console.log('\n── ④ com a fase 1 completa, o dono vê o avançar ──');
  const todosFeitos = sb.rounds[0].matches.map((m) => ({ id: m.id, winner: 'a' }));
  const sbCompleto = Object.assign({}, sb, { rounds: [Object.assign({}, sb.rounds[0], { matches: todosFeitos })] });
  ok('⭐⭐ `isOrganizer` responde SIM pro dono do sandbox', AS.isOrganizer(sbCompleto) === true);
  ok('⭐⭐ `isCreator` idem (é o que libera os controles)', AS.isCreator(sbCompleto) === true);
  ok('⛔ e `creatorUid` continua o do ORIGINAL — nada foi trocado pra liberar botão',
    sbCompleto.creatorUid === 'uid_organizador_real' &&
    JSON.stringify(sbCompleto.adminUids) === '["uid_organizador_real"]' &&
    sbCompleto.coHosts.length === 1 && sbCompleto.memberUids.length === 3);
  ok('⛔ CONTROLE: pra OUTRA pessoa o mesmo sandbox não dá poder nenhum', (function () {
    const antes = AS.currentUser; AS.currentUser = { uid: 'uid_outro' };
    const r = AS.isOrganizer(sbCompleto) === false && AS.isCreator(sbCompleto) === false;
    AS.currentUser = antes; return r;
  })());
  ok('   a fase 1 está completa (115 de 115 com resultado)',
    todosFeitos.length === 115 && todosFeitos.every((m) => m.winner));

  /* ═════ ⑤ ECO MAGRO POSTERIOR NÃO APAGA ═══════════════════════════════════ */
  console.log('\n── ⑤ eco magro POSTERIOR não apaga o que já foi montado ──');
  montagensPedidas = [];
  W._sbIngest([docMagro()]);                             // o MESMO doc magro, de novo
  const sb2 = AS.tournaments.find((t) => t.id === 'sb_x');
  ok('⭐⭐ inscritos continuam 152 (o eco não zerou)', (sb2.participants || []).length === 152,
    'ficou com ' + (sb2.participants || []).length);
  ok('⭐⭐ jogos continuam 115', (sb2.rounds[0].matches || []).length === 115);
  ok('⭐⭐ grupos/congeladas continuam 25', (sb2.rounds[0].monarchGroups || []).length === 25);
  ok('⛔ e NÃO pediu montagem de novo (nada falta)', montagensPedidas.length === 0,
    JSON.stringify(montagensPedidas));

  /* ═════ ⑥ REMOÇÃO ═════════════════════════════════════════════════════════ */
  console.log('\n── ⑥ sumiu do snapshot → sai da memória ──');
  AS.tournaments.push({ id: 'real_1', creatorUid: 'uid_dev_teste' });                 // torneio real
  AS.tournaments.push({ id: 'sb_de_outro', isSandbox: true, sandboxOwnerUid: 'uid_outro' });
  AS._partesEmErro = { sb_x: { desde: 1 } };
  W._sbIngest([]);                                        // snapshot vazio: o sandbox sumiu
  ok('⭐⭐ o sandbox saiu da lista', !AS.tournaments.find((t) => t.id === 'sb_x'));
  ok('⭐⭐ e saiu do registro de ids conhecidos (não abre por estado velho)',
    !(W._sbIdsConhecidos && W._sbIdsConhecidos['sb_x']));
  ok('⭐ o estado de montagem/erro dele foi limpo junto', !AS._partesEmErro['sb_x']);
  ok('⛔ CONTROLE: o TORNEIO REAL não foi removido', !!AS.tournaments.find((t) => t.id === 'real_1'));
  ok('⛔ CONTROLE: sandbox de OUTRO dono não foi removido',
    !!AS.tournaments.find((t) => t.id === 'sb_de_outro'));

  /* ═════ ⑦ TORNEIO REAL: comportamento intacto ═════════════════════════════ */
  console.log('\n── ⑦ o caminho do torneio REAL não mudou ──');
  const real = { id: 'real_2', participants: [], _semPesados: ['participants'],
    _nPartes: { participants: 40 }, memberUids: ['u1', 'u2'] };
  const realMontado = { id: 'real_2', participants: [{ uid: 'u1' }, { uid: 'u2' }],
    _semPesados: ['participants'], _nPartes: { participants: 40 }, memberUids: ['u1', 'u2'] };
  const saida = W._preservaPartesMontadas(JSON.parse(JSON.stringify(real)), realMontado);
  ok('⭐ a porta preserva o elenco já montado num torneio REAL', (saida.participants || []).length === 2);
  ok('⭐ e marca que ainda falta (2 de 40)', saida._faltamPesados === true);
  const inteiro = W._preservaPartesMontadas({ id: 'x', participants: [{ uid: 'u1' }] }, null);
  ok('⛔ torneio INTEIRO (sem `_semPesados`) passa reto, sem marca',
    !inteiro._faltamPesados && (inteiro.participants || []).length === 1);

  /* ═════ ⑦b O QUE A TELA DIZ ENQUANTO OS DADOS CHEGAM ═════════════════════
   * ⛔ A frase mais cara da tela é "Você não está inscrito neste torneio" — ela manda a
   * pessoa procurar o organizador. Enquanto a parte não chegou, a resposta honesta é
   * "ainda não sei", e é ela que o card do topo tem que dar. As portas aqui são as REAIS
   * (`_souInscrito`, `_meuStatusNoTorneio`, `_meuCardNoTopo`), as mesmas do torneio comum —
   * o que esta leva conserta é o sandbox CHEGAR nelas com a marca certa. */
  console.log('\n── ⑦b enquanto os dados chegam, a tela não afirma nada ──');
  {
    const EU = 'uid_dev_teste';
    const AS2 = W.AppStore;
    AS2.currentUser = { uid: EU, displayName: 'Dev', email: 'dev@x.com', _profileLoaded: true };
    const sbCru = docMagro();
    sbCru.memberUids = [EU, 'uid_organizador_real'];        // eu SOU membro; o elenco é que não chegou
    AS2.tournaments = [];
    montagensPedidas = [];
    W._sbIngest([sbCru]);
    const vivo = AS2.tournaments.find((t) => t.id === 'sb_x');
    const texto = (h) => String(h == null ? '' : h).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    ok('⭐⭐ `_souInscrito` responde "não sei" (null), não `false`',
      typeof W._souInscrito === 'function' && W._souInscrito(vivo, AS2.currentUser) === null,
      'obtido: ' + JSON.stringify(typeof W._souInscrito === 'function' ? W._souInscrito(vivo, AS2.currentUser) : 'porta ausente'));
    if (typeof W._meuStatusNoTorneio === 'function') {
      const st = W._meuStatusNoTorneio(vivo);
      ok('⭐⭐ o estado do card NÃO é "none" (que vira "você não está inscrito")',
        st && st.code !== 'none', JSON.stringify(st && st.code));
    }
    if (typeof W._meuCardNoTopo === 'function') {
      const t1 = texto(W._meuCardNoTopo(vivo));
      ok('⭐⭐ o card do topo NÃO diz "não está inscrito"', !/não est[áa] inscrit/i.test(t1), t1.slice(0, 140));
      ok('⭐⭐ e NÃO diz "sem inscritos"/"0 inscritos"',
        !/sem inscritos/i.test(t1) && !/\b0 inscritos?\b/i.test(t1), t1.slice(0, 140));
    }
    if (typeof W._getTournamentProgress === 'function') {
      const p = W._getTournamentProgress(vivo);
      ok('⛔ a barra não inventa 0 de 0 como se fosse torneio sem jogo (marca de incompleto presente)',
        vivo._faltamPesados === true, JSON.stringify(p));
    }
    /* CONTROLE: com as partes MONTADAS, a mesma porta passa a afirmar — senão o teste
     * estaria só medindo uma função que nunca responde nada. */
    Object.assign(vivo, partesMontadas());
    vivo.participants[0] = { uid: EU, name: 'Dev' };
    delete vivo._faltamPesados; delete vivo._faltaOQue;
    ok('⛔ CONTROLE: com o elenco completo, `_souInscrito` passa a responder SIM',
      W._souInscrito(vivo, AS2.currentUser) === true, JSON.stringify(W._souInscrito(vivo, AS2.currentUser)));
  }

  /* ═════ ⑨ O ESTRAGO DE VERDADE: eco magro → GRAVAÇÃO → subcoleção apagada ═══
   * ⛔ ISTO É O DEFEITO MEDIDO EM PRODUÇÃO, não uma encenação. Confra original: 115 jogos,
   * 152 inscritos, intacta. Sandbox: 114 jogos, **0 inscritos**, `_nPartes.participants: 0`.
   * A cadeia: o ouvinte magro põe o objeto vazio na lista → uma gravação qualquer sai desse
   * objeto → `saveTournament` recalcula `_nPartes` do que tem em memória (participants: []
   * → 0) → `_sbGravaPartes` grava o DIFF → `jogosQueMudaram(152, 0)` devolve 152 em
   * `sumiram` → a subcoleção `inscritos` é APAGADA.
   * ⭐ Aqui roda o `saveTournament` REAL sobre um Firestore de mentira que CONTA os
   * documentos. Só o render não pegaria isto: a tela mostraria vazio dos dois jeitos — o
   * que separa "tela feia" de "dado perdido" é olhar a subcoleção depois da gravação. */
  console.log('\n── ⑨ eco magro + GRAVAÇÃO REAL: a subcoleção sobrevive? ──');
  const bancoDeMentira = () => {
    const dados = { inscritos: {}, matches: {} };
    for (let i = 0; i < 152; i++) dados.inscritos['u' + i] = { _k: 'u' + i, _idx: i, item: { uid: 'uid_p' + i, name: 'P' + i } };
    for (let i = 0; i < 115; i++) dados.matches['m' + i] = { _chave: 'm' + i, _loc: { tipo: 'rounds', ri: 0, mi: i }, jogo: { id: 'm' + i, winner: i < 105 ? 'a' : null } };
    const docsSet = [];
    const col = (nome) => ({
      get: () => Promise.resolve({
        docs: Object.keys(dados[nome] || {}).map((k) => ({ id: k, data: () => dados[nome][k] })),
        forEach(f) { this.docs.forEach(f); }, size: Object.keys(dados[nome] || {}).length }),
      doc: (k) => ({ _col: nome, _k: k, get: () => Promise.resolve({ exists: !!(dados[nome] || {})[k], data: () => (dados[nome] || {})[k] }) }),
    });
    const db = {
      collection: () => ({ doc: () => ({ collection: col, set: (d) => { docsSet.push(d); return Promise.resolve(); } }) }),
      batch: () => ({
        set: (ref, v) => { (dados[ref._col] = dados[ref._col] || {})[ref._k] = v; },
        delete: (ref) => { if (dados[ref._col]) delete dados[ref._col][ref._k]; },
        commit: () => Promise.resolve(),
      }),
    };
    return { db, dados, docsSet, conta: () => ({ inscritos: Object.keys(dados.inscritos).length, matches: Object.keys(dados.matches).length }) };
  };
  const cenarioDestrutivo = async (ingest, Wctx) => {
    const banco = bancoDeMentira();
    const FDB = Wctx.FirestoreDB;
    FDB.db = banco.db;
    Wctx._sbIdsConhecidos = { sb_x: true };            // é sandbox: a escrita roteia pra lá
    const AS3 = Wctx.AppStore;
    AS3.currentUser = { uid: 'uid_dev_teste' };
    AS3.tournaments = [];
    AS3._montaPesadosQueFaltam = function () {};       // a montagem é simulada logo abaixo
    ingest([docMagro()]);                               // ① chega magro
    const vv = AS3.tournaments.find((t) => t.id === 'sb_x');
    Object.assign(vv, partesMontadas());                // ② a montagem chega (152 + 115)
    delete vv._faltamPesados; delete vv._faltaOQue;
    ingest([docMagro()]);                               // ③ ECO MAGRO depois de montado
    const vv2 = AS3.tournaments.find((t) => t.id === 'sb_x');
    await FDB.saveTournament(vv2 || vv);                // ④ GRAVAÇÃO REAL
    return { antes: { inscritos: 152, matches: 115 }, depois: banco.conta(),
      emMemoria: { inscritos: ((vv2 || vv).participants || []).length,
                   matches: (((vv2 || vv).rounds || [])[0] || {}).matches ? ((vv2 || vv).rounds[0].matches || []).length : 0 } };
  };
  {
    const Wd = novoMundo();
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8'), Wd);
    Wd._repintarSeNecessario = function () {};
    const r = await cenarioDestrutivo(Wd._sbIngest, Wd);
    ok('⭐⭐ depois do eco magro + gravação, `inscritos` continua 152',
      r.depois.inscritos === 152, JSON.stringify(r.depois));
    ok('⭐⭐ e `matches` continua 115', r.depois.matches === 115, JSON.stringify(r.depois));
    ok('⭐ o objeto em memória também segue completo (152/115)',
      r.emMemoria.inscritos === 152 && r.emMemoria.matches === 115, JSON.stringify(r.emMemoria));
  }
  {
    /* CONTROLE DESTRUTIVO contra o HEAD anterior: o MESMO cenário tem que acusar a queda
     * pra 0 — que é o número medido no sandbox de produção. */
    const Wv = novoMundo();
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8'), Wv);
    Wv._repintarSeNecessario = function () {};
    let ingestVelho = null;
    try { vm.runInContext(SB_INGEST_2188, Wv); ingestVelho = Wv._sbIngest; } catch (e) { ingestVelho = null; }
    if (ingestVelho) {
      const rv = await cenarioDestrutivo(ingestVelho, Wv);
      ok('⛔⛔ CONTROLE: com o HEAD anterior, a gravação APAGA `inscritos` (ficou ' + rv.depois.inscritos + ')',
        rv.depois.inscritos === 0, JSON.stringify(rv.depois));
      ok('⛔⛔ CONTROLE: e derruba `matches` também (ficou ' + rv.depois.matches + ')',
        rv.depois.matches < 115, JSON.stringify(rv.depois));
      ok('   ⇒ é a mesma assinatura do sandbox em produção: 0 inscritos e menos jogos',
        rv.depois.inscritos === 0);
    } else {
      ok('⛔ não consegui recortar o `_sbIngest` do HEAD anterior — controle não rodou', false);
    }
  }

  /* ═════ ⑧ CONTROLE VERMELHO contra a árvore anterior ══════════════════════ */
  console.log('\n── ⑧ CONTROLE: o `_sbIngest` da 2.1.88 REPROVA nas mesmas entradas ──');
  const velho = SB_INGEST_2188;
  ok('tenho o `_sbIngest` da 2.1.88 congelado (sem depender do git)',
    velho.length > 50 && velho.indexOf('Object.assign(lista[i], d)') !== -1, velho.slice(0, 120));
  if (velho) {
    const V = { window: null, AppStore: null };
    V.window = V;
    vm.createContext(V);
    vm.runInContext(velho, V);
    V.AppStore = { currentUser: { uid: 'uid_dev_teste' }, tournaments: [], _montaPesadosQueFaltam: () => { V._pediu = true; } };
    V._marcaPartesQueFaltam = W._marcaPartesQueFaltam;
    V._preservaPartesMontadas = W._preservaPartesMontadas;
    V._repintarSeNecessario = function () {};
    V._pediu = false;
    // ② com o velho: entra cru, sem marca e sem montagem
    V._sbIngest([docMagro()]);
    const vsb = V.AppStore.tournaments.find((t) => t.id === 'sb_x');
    ok('⛔⛔ VELHO: entrou SEM a marca de incompleto (o defeito)', !!vsb && !vsb._faltamPesados);
    ok('⛔⛔ VELHO: NÃO agendou montagem nenhuma (por isso a tela ficava vazia)', V._pediu === false);
    // ⑤ com o velho: o eco magro APAGA o que já estava montado
    Object.assign(vsb, partesMontadas());
    V._sbIngest([docMagro()]);
    const vsb2 = V.AppStore.tournaments.find((t) => t.id === 'sb_x');
    ok('⛔⛔ VELHO: o eco magro APAGOU os 152 inscritos (ficou ' + (vsb2.participants || []).length + ')',
      (vsb2.participants || []).length === 0);
    ok('⛔⛔ VELHO: e apagou os 115 jogos (ficou ' + ((vsb2.rounds[0] || {}).matches || []).length + ')',
      ((vsb2.rounds[0] || {}).matches || []).length === 0);
    // ⑥ com o velho: remoção não acontece
    V._sbIngest([]);
    ok('⛔⛔ VELHO: sandbox removido do snapshot CONTINUAVA na memória',
      !!V.AppStore.tournaments.find((t) => t.id === 'sb_x'));
  }

  console.log(falhas === 0
    ? '\n✅ ouvinte-de-sandbox-hidrata-como-o-real: OK'
    : '\n❌ ouvinte-de-sandbox-hidrata-como-o-real: ' + falhas + ' falha(s)');
  process.exit(falhas === 0 ? 0 : 1);
})().catch((e) => { console.error('ERRO:', (e && e.stack) || e); process.exit(1); });
