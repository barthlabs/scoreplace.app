/* APAGAR O TORNEIO APAGA AS CÓPIAS NAS PESSOAS — trava do tournament-purge-core.js
 * node functions/test-tournament-purge-core.js
 *
 * Ordem do dono (12/ago/2026): _"um dia posso resolver apagá-lo e daí ele deve sumir de
 * todos os dados dos que participaram."_
 *
 * O BUG QUE ESTE TESTE REPRODUZ, e não é hipotético — foi MEDIDO no código:
 * `deleteTournament` limpa `results`/`letzplayScans`/`discoveryFeed` e o doc, e **não
 * toca `users/{uid}/matchHistory`**. Resultado assimétrico: some da ficha dos OUTROS
 * (que leem `collectionGroup('results')`) e FICA na ficha da PRÓPRIA pessoa (que lê o
 * próprio matchHistory). O oposto do que foi pedido.
 *
 * O que este arquivo protege, além do óbvio:
 *  · o id do registro é DETERMINÍSTICO (`t_<tid>_<matchId>`) e mora em bracket-ui.js —
 *    há VARREDURA no fonte real: mudar o formato lá e não aqui deixaria cópia pra trás,
 *    em silêncio, pra sempre (ninguém olha matchHistory de terceiro);
 *  · as DUAS rotas existem por um motivo medido — quem levou W.O. e foi substituído sai
 *    do elenco e dos slots, mas o registro do jogo que ele JOGOU continua com ele. A rota
 *    por referência não enxerga esse uid; a varredura enxerga. Há teste dos dois lados;
 *  · a lista de subcoleções é DECLARAÇÃO, e declaração apodrece — é confrontada com o
 *    firestore.rules (a lição do uid-sweep/merge-collections);
 *  · `participants` é CF-ONLY: pôr na lista do cliente não resolveria, porque não existe
 *    regra pra essa subcoleção e o Firestore nega por omissão (achado da 1.7.97).
 */
const fs = require('fs');
const path = require('path');
const {
  USER_SUBCOLLECTIONS_BY_TOURNAMENT,
  CF_ONLY_TOURNAMENT_SUBCOLLECTIONS,
  recordIdDe, uidsDoTorneio, recordIdsDoTorneio,
  planPurgePorReferencia, unirPlanos, emLotes
} = require('./tournament-purge-core');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

console.log('──── apagar torneio apaga as cópias nas pessoas ────');

/* Torneio com a forma REAL: elenco, fila, um desativado, uma dupla com dois uids, e
 * jogos em `rounds[].matches` (que é onde a Liga/Rei-Rainha os guarda). */
const TID = 'tour_1780009816637';
const torneio = {
  id: TID,
  memberUids: ['u-ana', 'u-bruno', 'u-caio', 'u-dani', 'u-espera', 'u-inativo'],
  participants: [
    { uid: 'u-ana' },
    { uid: 'u-bruno' },
    { p1Uid: 'u-caio', p2Uid: 'u-dani' },          // dupla: os DOIS lados contam
    { uid: 'u-inativo', ligaActive: false }        // desativado ainda é inscrito
  ],
  standbyParticipants: [{ uid: 'u-espera' }],
  rounds: [
    { matches: [{ id: 'm1', team1Uids: ['u-ana'], team2Uids: ['u-bruno'] },
                { id: 'm2', team1Uids: ['u-caio', 'u-dani'], team2Uids: ['u-ana'] }] },
    { matches: [{ id: 'm3', p1Uid: 'u-bruno', p2Uid: 'u-caio' }] }
  ]
};

// ── (1) O ID BATE COM O QUE bracket-ui.js REALMENTE GRAVA ────────────────────
// Sem isto, o purge monta caminhos que não existem e "passa" apagando nada.
{
  ok(recordIdDe(TID, 'm1') === 't_' + TID + '_m1', 'recordId é t_<tid>_<matchId>');

  const src = ler('js/views/bracket-ui.js');
  const achados = src.match(/var recordId = [^;]+;/g) || [];
  ok(achados.length >= 2, 'bracket-ui.js ainda monta recordId de torneio (achou ' + achados.length + ')');
  ok(achados.every((l) => /'t_'\s*\+\s*String\(t\.id\)\s*\+\s*'_'\s*\+\s*String\(m\.id\)/.test(l)),
     'TODO recordId de torneio segue o formato que o purge assume — se mudar lá, isto fica vermelho');
}

// ── (2) UIDS: elenco + fila + desativado + OS DOIS LADOS DA DUPLA ────────────
{
  const u = uidsDoTorneio(torneio);
  ['u-ana', 'u-bruno', 'u-caio', 'u-dani', 'u-espera', 'u-inativo'].forEach((x) => {
    ok(u.has(x), 'uid coletado: ' + x);
  });
  ok(u.size === 6, 'nenhum uid inventado (tem ' + u.size + ')');
}

// ── (3) OS JOGOS viram ids de registro, inclusive em rounds aninhados ────────
{
  const ids = recordIdsDoTorneio(TID, torneio);
  ok(ids.size === 3, 'os 3 jogos de rounds[] entram (tem ' + ids.size + ')');
  ok(ids.has('t_' + TID + '_m3'), 'jogo da 2ª rodada entra');
}

// ── (4) O CASO QUE OBRIGA AS DUAS ROTAS: W.O. + substituição ────────────────
// Medido neste app: quem leva W.O. sai do elenco e o slot é reescrito com o substituto.
// O registro do jogo que ele jogou ANTES continua no matchHistory dele.
{
  const depoisDoWO = JSON.parse(JSON.stringify(torneio));
  // 'u-bruno' levou W.O.: saiu do elenco, do memberUids e foi trocado nos slots.
  depoisDoWO.participants = depoisDoWO.participants.filter((p) => p.uid !== 'u-bruno');
  depoisDoWO.memberUids = depoisDoWO.memberUids.filter((u) => u !== 'u-bruno');
  depoisDoWO.rounds[0].matches[0].team2Uids = ['u-espera'];
  depoisDoWO.rounds[1].matches[0].p1Uid = 'u-espera';

  const plano = planPurgePorReferencia(TID, depoisDoWO);
  ok(!plano.uids.includes('u-bruno'),
     'a rota por REFERÊNCIA não alcança quem foi substituído — é por isso que a varredura existe');

  // A varredura acha, porque o registro dele guarda o tournamentId.
  const daVarredura = [{ uid: 'u-bruno', recordId: 't_' + TID + '_m1' }];
  const unido = unirPlanos(plano, daVarredura);
  ok(unido.refs.some((r) => r.uid === 'u-bruno'),
     'a varredura resgata o substituído, e o plano unido o inclui');
}

// ── (5) UNIR NÃO REPETE DELETE ───────────────────────────────────────────────
{
  const plano = planPurgePorReferencia(TID, torneio);
  const repetido = plano.refs.slice(0, 5).map((r) => ({ uid: r.uid, recordId: r.recordId }));
  const unido = unirPlanos(plano, repetido);
  ok(unido.total === plano.refs.length, 'o que a varredura repete não vira delete duplicado');
}

// ── (6) O PLANO COBRE TODA COMBINAÇÃO PESSOA × JOGO ─────────────────────────
{
  const plano = planPurgePorReferencia(TID, torneio);
  ok(plano.refs.length === 6 * 3, '6 pessoas × 3 jogos = 18 caminhos (tem ' + plano.refs.length + ')');
  ok(plano.refs.every((r) => r.recordId.startsWith('t_' + TID + '_')),
     'TODO caminho carrega o tid — nunca dá pra apagar registro de outro torneio');
}

// ── (7) TORNEIO SEM SORTEIO: nada a apagar, e não estoura ───────────────────
{
  const plano = planPurgePorReferencia(TID, { id: TID, participants: [{ uid: 'u-ana' }] });
  ok(plano.refs.length === 0, 'sem jogo lançado não há cópia — 0 deletes');
  const vazio = planPurgePorReferencia(TID, null);
  ok(vazio.refs.length === 0, 'doc nulo não estoura');
}

// ── (8) LOTES de 400 (o teto do batch do Firestore é 500) ───────────────────
{
  const mil = [];
  for (let i = 0; i < 1000; i++) mil.push({ uid: 'u' + i, recordId: 'r' + i });
  const lotes = emLotes(mil, 400);
  ok(lotes.length === 3 && lotes[0].length === 400 && lotes[2].length === 200,
     '1000 caminhos viram 3 lotes (400/400/200)');
  ok(emLotes([], 400).length === 0, 'lista vazia não gera lote');
}

// ── (9) A DECLARAÇÃO CONTRA AS RULES ────────────────────────────────────────
// Declaração apodrece. Se nascer subcoleção nova sob users/{uid} que guarde cópia de
// torneio e ninguém atualizar a lista, o purge deixa dado pra trás em silêncio.
{
  const rules = ler('firestore.rules');
  // Recorta EXATAMENTE o bloco de users/{userId} contando chaves. Fatiar até o fim do
  // arquivo pegaria `venues`, `presences`, `mail`… e o teste acusaria o mundo inteiro.
  const ini = rules.indexOf('match /users/{userId}');
  ok(ini > 0, 'achou o bloco match /users/{userId} nas rules');
  // Começa DEPOIS da linha do cabeçalho: senão o `{` de `{userId}` (um curinga de caminho,
  // não uma chave de bloco) fecharia o bloco na hora, e o cabeçalho ainda casaria consigo
  // mesmo na varredura de subcoleções.
  const corpo = rules.indexOf('\n', ini) + 1;
  let prof = 1, fim = rules.length;
  for (let i = corpo; i < rules.length; i++) {
    if (rules[i] === '{') prof++;
    else if (rules[i] === '}') { prof--; if (prof === 0) { fim = i; break; } }
  }
  const bloco = rules.slice(corpo, fim);
  const subs = Array.from(bloco.matchAll(/match \/([A-Za-z0-9_]+)\/\{/g)).map((m) => m[1]);

  // As que existem hoje e NÃO guardam torneio — se uma sair desta lista, é porque mudou
  // de natureza e alguém precisa decidir conscientemente.
  const semTorneio = ['notifications', 'templates', 'trophies', 'milestones'];
  const conhecidas = USER_SUBCOLLECTIONS_BY_TOURNAMENT.concat(semTorneio);
  const novas = subs.filter((s) => !conhecidas.includes(s));

  ok(novas.length === 0,
     'subcoleção nova em users/{uid} sem decisão sobre o purge: ' + novas.join(', '));
  ok(USER_SUBCOLLECTIONS_BY_TOURNAMENT.includes('matchHistory'),
     'matchHistory está declarada como cópia por torneio');
  ok(subs.includes('matchHistory'), 'matchHistory realmente existe nas rules');
}

// ── (10) `participants` É CF-ONLY, E A PROVA ESTÁ NAS RULES ────────────────
// Pôr na lista do cliente NÃO resolveria: sem regra, o Firestore nega por omissão.
{
  const rules = ler('firestore.rules');
  ok(!/match \/participants\/\{/.test(rules),
     'segue sem regra pra participants — logo o cliente não pode limpá-la (por isso é CF-only)');
  ok(CF_ONLY_TOURNAMENT_SUBCOLLECTIONS.includes('participants'),
     'participants está na lista que só a CF alcança');

  const db = ler('js/firebase-db.js');
  const m = db.match(/_tournamentSubcollections:\s*\[([^\]]*)\]/);
  ok(!!m, 'o cliente ainda declara _tournamentSubcollections');
  CF_ONLY_TOURNAMENT_SUBCOLLECTIONS.forEach((sub) => {
    ok(m && !m[1].includes("'" + sub + "'"),
       "'" + sub + "' NÃO pode entrar na lista do cliente (tomaria permission-denied)");
  });
}

// ── (11) A FIAÇÃO — sem ela, tudo acima fica verde com o purge DESLIGADO ────
// `functions/index.js` não é `require`-ável em teste (registra onCall/onSchedule e lê
// secrets no import), então a checagem é por varredura do fonte. É o que impede o
// "verde ≠ funciona": apagar o gatilho deixaria as 29 asserções anteriores intactas.
{
  const idx = ler('functions/index.js');
  ok(/exports\.purgeTournamentCopies\s*=\s*onDocumentDeleted\(/.test(idx),
     'o gatilho purgeTournamentCopies existe e é onDocumentDeleted');
  ok(/onDocumentDeleted/.test(idx.slice(0, idx.indexOf('\n', idx.indexOf('firebase-functions/v2/firestore')))),
     'onDocumentDeleted está importado (senão o deploy quebra no import)');
  const bloco = idx.slice(idx.indexOf('exports.purgeTournamentCopies'));
  ok(/document:\s*"tournaments\/\{tid\}"/.test(bloco), 'escuta o delete de tournaments/{tid}');
  ok(/tournament-purge-core/.test(idx),
     'o gatilho usa o módulo puro — não uma segunda cópia da regra');
  ok(/USER_SUBCOLLECTIONS_BY_TOURNAMENT/.test(bloco) && /CF_ONLY_TOURNAMENT_SUBCOLLECTIONS/.test(bloco),
     'as DUAS listas são consumidas (histórico das pessoas + subcoleção CF-only)');
  ok(/admin\.firestore\(\)/.test(bloco),
     'usa handle PRÓPRIO do Firestore — o `const db` do módulo está em zona morta temporal aqui (1.7.99)');
  ok(/collectionGroup\(/.test(bloco) && /planPurgePorReferencia/.test(bloco),
     'as duas rotas estão ligadas: referência direta E varredura');
}

// ── (12) O ÍNDICE que a varredura exige está declarado ─────────────────────
// Sem ele a consulta de collection group falha com FAILED_PRECONDITION e só a rota por
// referência sobra — quem foi substituído por W.O. ficaria com a cópia pra sempre.
{
  const idx = JSON.parse(ler('firestore.indexes.json'));
  const ov = (idx.fieldOverrides || []).find(
    (o) => o.collectionGroup === 'matchHistory' && o.fieldPath === 'tournamentId');
  ok(!!ov, 'firestore.indexes.json declara override de matchHistory/tournamentId');
  ok(!!ov && (ov.indexes || []).some((i) => i.queryScope === 'COLLECTION_GROUP'),
     'com escopo COLLECTION_GROUP — é o que a varredura precisa');
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
