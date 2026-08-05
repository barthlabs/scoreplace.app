'use strict';
/* Testa functions/merge-collections-core.js — presenças e notificações na união de contas.
 * Rodar:  node functions/test-merge-collections-core.js
 *
 * O DEFEITO QUE ISTO TRAVA (medido na base em 05/ago/2026, antes de fundir Eduardo Mange e
 * Silvia Moura Ferreira): a fusão cobria `tournaments`, `casualMatches`, `letzplayScans` e o
 * perfil — e mais NADA. Medido nas 3 contas que iam ser absorvidas: 3 docs em `presences` e
 * ~30 notificações ficariam apontando pra uid morto. A pessoa perderia o histórico de avisos
 * da conta absorvida e o check-in dela num local viraria órfão.
 *
 * A parte difícil é o "SEM DUPLICAÇÃO" pedido pelo dono: a mesma pessoa com duas contas pode
 * ter recebido o MESMO aviso duas vezes (um doc por uid). Mover às cegas deixa a caixa dela
 * com o aviso repetido. E o id do doc NÃO serve de chave — ele embute um sufixo aleatório
 * por envio, então o mesmo aviso nas duas contas tem ids diferentes. */
const C = require('./merge-collections-core');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } }

const DROP = 'yVt3y6LK0pVIIjak9L4LO8LZqkl1';   // conta Apple do Eduardo (a absorvida)
const KEEP = 'I061h3pJ7ifGgrjjo7dMVQOswOM2';   // eduardo@mange.adv.br (a sobrevivente)

// ── 1 · assinatura de conteúdo ───────────────────────────────────────────────
(() => {
  // Doc REAL da base (id e campos preservados, texto encurtado).
  const real = {
    type: 'enrollment_cancelled', tournamentId: 'tour_1781996342871',
    createdAt: '2026-06-29T15:00:46.261Z', message: 'O organizador cancelou o convite de dupla',
    read: false, fromUid: 'B17n7JCXYOfqahlcLZ0fKxGGyUu1',
  };
  const mesmoAvisoOutraConta = Object.assign({}, real, { read: true }); // lida numa, não na outra
  ok('mesmo aviso nas 2 contas → MESMA assinatura (mesmo com `read` diferente)',
    C.notifSignature(real) === C.notifSignature(mesmoAvisoOutraConta));

  const outroAviso = Object.assign({}, real, { createdAt: '2026-07-24T14:21:12.491Z' });
  ok('avisos em instantes diferentes → assinaturas diferentes',
    C.notifSignature(real) !== C.notifSignature(outroAviso));

  ok('assinatura NÃO usa o id do doc (que embute uid + sufixo aleatório por envio)',
    C.notifSignature(real).indexOf(DROP) === -1);
})();

// ── 2 · id no destino ────────────────────────────────────────────────────────
(() => {
  const id = 'enrollment_new_tour_1781996342871__2026-06-25_1db32xz_' + DROP;
  const novo = C.movedNotifId(id, DROP, KEEP);
  ok('id migrado troca o sufixo do uid', novo === 'enrollment_new_tour_1781996342871__2026-06-25_1db32xz_' + KEEP);
  ok('id migrado não guarda rastro do uid morto', novo.indexOf(DROP) === -1);
  const legado = 'abc123SemUidNoFim';
  ok('id legado (sem uid no fim) recebe sufixo em vez de ser truncado',
    C.movedNotifId(legado, DROP, KEEP) === legado + '_' + KEEP);
})();

// ── 3 · O CASO REAL: mover sem duplicar ──────────────────────────────────────
(() => {
  const aviso = (t, ts, msg) => ({ type: t, tournamentId: 'tour_1', createdAt: ts, message: msg });
  const drop = [
    { id: 'a_' + DROP, data: aviso('draw', '2026-08-02T22:00:04Z', 'Sorteio realizado') },      // repetido
    { id: 'b_' + DROP, data: aviso('new_round', '2026-08-03T10:00:00Z', 'Nova rodada') },       // só na absorvida
    { id: 'c_' + DROP, data: aviso('draw', '2026-08-02T22:00:04Z', 'Sorteio realizado') },      // repetido DENTRO do lote
  ];
  const keep = [{ id: 'z_' + KEEP, data: aviso('draw', '2026-08-02T22:00:04Z', 'Sorteio realizado') }];

  const p = C.planNotifMigration(drop, keep, DROP, KEEP);
  ok('o aviso que o sobrevivente JÁ tinha não é movido (nada duplica na caixa)',
    p.moves.length === 1 && p.moves[0].fromId === 'b_' + DROP, 'moves=' + JSON.stringify(p.moves.map(m => m.fromId)));
  ok('duplicata contra o destino E dentro do próprio lote → 2 marcadas', p.duplicates.length === 2);
  ok('nenhuma notificação some do total (movidas + duplicadas = total)',
    p.moves.length + p.duplicates.length === p.total);
  ok('o move carrega o conteúdo, não só o id', p.moves[0].data && p.moves[0].data.type === 'new_round');
  ok('destino do move já vem com o id do sobrevivente', p.moves[0].toId.endsWith(KEEP));
})();

// ── 4 · casos de borda ───────────────────────────────────────────────────────
(() => {
  ok('caixa vazia não quebra', C.planNotifMigration([], [], DROP, KEEP).moves.length === 0);
  ok('destino vazio move tudo', C.planNotifMigration(
    [{ id: 'x_' + DROP, data: { type: 't', createdAt: '1', message: 'm' } }], [], DROP, KEEP).moves.length === 1);
  ok('doc sem id é ignorado em vez de virar escrita em caminho inválido',
    C.planNotifMigration([{ data: { type: 't' } }], [], DROP, KEEP).moves.length === 0);
})();

// ── 5 · "se mescla tudo é tudo sempre": EXCLUSÃO, não inclusão ───────────────
// Lista de INCLUSÃO apodrece — é a lição já paga 4 vezes aqui (dupla, mapa por uid,
// organizerId, e o `creatorUid` de casualMatches que nem existia). O default tem que ser
// VARRER; quem sai da varredura precisa estar declarado com motivo.
(() => {
  ok('coleção NOVA que ninguém cadastrou já nasce coberta',
    C.shouldSweepCollection('umaColecaoQueAindaNaoExiste'));
  ok('presences é varrida', C.shouldSweepCollection('presences'));
  ok('casualMatches é varrida (o no-op do creatorUid morre aqui)', C.shouldSweepCollection('casualMatches'));
  ok('venues é varrida (courts[].contributorUid é aninhado)', C.shouldSweepCollection('venues'));
  ok('discoveryFeed é varrida sem ninguém ter lembrado dela', C.shouldSweepCollection('discoveryFeed'));

  // ⚠️ REVISADA de propósito em 05/ago/2026. A asserção anterior exigia que `users` ficasse
  // FORA da varredura, pelo perfil e pelo tombstone terem regra própria. Só que excluir a
  // coleção inteira jogava fora a parte que importa: medido depois de fundir, o uid morto
  // continuava em `friends[]` do dono e em `friendRequestsSent[]` da Raquel — a amizade some
  // em silêncio. `users` É varrida; quem protege a regra própria é o caller, que PULA os dois
  // docs envolvidos (há asserção da fiação na seção 6).
  ok('users É varrida (docs de TERCEIROS guardam o uid em friends[]/friendRequests[])',
    C.shouldSweepCollection('users'));
  ok('tournaments NÃO é varrida aqui (tem a trava anti-encolhimento própria)',
    !C.shouldSweepCollection('tournaments'));
  ok('letzplayScans NÃO é varrida (regra ATÔMICA; fundir campo a campo corrompe totais)',
    !C.shouldSweepCollection('letzplayScans'));
  ok('loginRedirects NÃO é varrida (chave é a credencial, e a fusão a escreve)',
    !C.shouldSweepCollection('loginRedirects'));
  ok('nome vazio não vira varredura', !C.shouldSweepCollection(''));
  // Log é registro do que aconteceu NAQUELE instante; trocar o uid nele faz o log mentir
  // sobre quem estava lá. Mesma razão do `mail`. Medido: 76 docs seriam reescritos à toa.
  ok('debugDrawLogs NÃO é varrida (log histórico — reescrever falsifica o registro)',
    !C.shouldSweepCollection('debugDrawLogs'));
  ok('mail NÃO é varrida (histórico do que foi enviado)', !C.shouldSweepCollection('mail'));

  ok('toda exclusão declara o MOTIVO (senão vira lista sem dono)',
    Object.values(C.SWEEP_EXCLUDED_COLLECTIONS).every((v) => typeof v === 'string' && v.length > 10));

  // As coleções que as rules declaram têm que estar cobertas OU excluídas com motivo — nunca
  // esquecidas. Como o default é varrer, "esquecida" só existe se alguém excluir sem motivo.
  const rulesPath = path.join(__dirname, '..', 'firestore.rules');
  if (fs.existsSync(rulesPath)) {
    const rules = fs.readFileSync(rulesPath, 'utf8');
    const declaradas = [...rules.matchAll(/match \/([A-Za-z0-9_]+)\/\{/g)].map((m) => m[1]);
    const semMotivo = declaradas.filter((c) =>
      !C.shouldSweepCollection(c) && !C.SWEEP_EXCLUDED_COLLECTIONS[c]);
    ok('nenhuma coleção das rules fica fora da varredura sem motivo declarado',
      semMotivo.length === 0, semMotivo.join(', '));
  }
})();

// ── 6 · a fiação no index.js ─────────────────────────────────────────────────
// O core pode estar perfeito e não ser chamado — foi assim que o canal de e-mail do sorteio
// automático ficou sem existir. Varre o índice atrás das chamadas.
(() => {
  const idx = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const bloco = idx.slice(idx.indexOf('async function _executeMerge'));
  const fim2 = bloco.indexOf('\n}\n');
  const corpo = bloco.slice(0, fim2 > 0 ? fim2 : 4000);
  ok('_executeMerge chama a varredura de TODAS as coleções', /_sweepAllCollectionsByUid\(/.test(corpo));
  ok('_executeMerge chama a migração das notificações', /_migrateNotifications\(/.test(corpo));
  ok('a varredura DESCOBRE as coleções (listCollections), não recebe lista',
    /_sweepAllCollectionsByUid[\s\S]{0,600}listCollections\(\)/.test(idx));
  ok('a varredura decide pelo core (shouldSweepCollection), não por lista local',
    /shouldSweepCollection\(/.test(idx));
  ok('a varredura usa o uid-sweep (mesmo motor dos torneios)',
    /_sweepAllCollectionsByUid[\s\S]{0,1200}_uidSweep\.remapUid\(/.test(idx));
  ok('a varredura tem trava anti-encolhimento (uid-sweep nunca remove ninguém)',
    /_sweepAllCollectionsByUid[\s\S]{0,2600}DESCARTADO/.test(idx));
  // A trava não pode ser por TAMANHO puro: quem é amigo das DUAS contas tem o array
  // legitimamente encolhido pelo dedup, e a versão por tamanho descartava o `friends[]`
  // do dono (medido em 05/ago/2026). Tem que comparar com o ESPERADO pós-troca.
  ok('a trava distingue dedup legítimo de perda de pessoa (compara com o esperado)',
    /const esperado[\s\S]{0,200}dropUid \? keepUid/.test(idx));
  // A consulta que nunca casou com nada não pode voltar por descuido (mira o CÓDIGO,
  // não o comentário que documenta o defeito).
  ok('ninguém mais CONSULTA casualMatches por `creatorUid` (campo inexistente = no-op)',
    !/collection\(["\']casualMatches["\']\)[\s\S]{0,60}\.where\(["\']creatorUid["\']/.test(idx));
  ok('a cópia vem ANTES do delete (falha no meio nunca some com o aviso)',
    /keepCol\.doc\(m\.toId\)\.set\(m\.data\);[\s\S]{0,120}dropCol\.doc\(m\.fromId\)\.delete\(\)/.test(idx));
  // SUBCOLEÇÕES do torneio: o espelho do roster é `participants/{uid}` (dual-write da
  // 1.7.29). MEDIDO em 05/ago: depois de fundir, o espelho do Eduardo continuou sob o uid
  // MORTO — 200 no apagado, 404 no sobrevivente. Um espelho apontando pra uid morto não
  // protege ninguém, e ele existe justamente pra ser a rede contra perda de inscrito.
  ok('_repairTournaments varre as SUBCOLEÇÕES do torneio',
    /_sweepTournamentSubcollections\(db, tourDoc\.ref/.test(idx));
  ok('  → troca o uid quando ele é o ID DO DOC (espelho participants/{uid})',
    /_sweepTournamentSubcollections[\s\S]{0,900}col\.doc\(dropUid\)\.get\(\)/.test(idx));
  ok('  → copia ANTES de apagar (falha no meio nunca some com o doc)',
    /novoRef\.set\(velho\.data\(\)\);[\s\S]{0,120}velho\.ref\.delete\(\)/.test(idx));
  ok('  → e também troca o uid DENTRO do conteúdo (results.playerUids)',
    /_sweepTournamentSubcollections[\s\S]{0,1600}_uidSweep\.remapUid\(atual, dropUid, keepUid\)/.test(idx));

  ok('a varredura PULA os 2 docs de perfil envolvidos (regra própria) e varre os de terceiros',
    /nome === "users" && \(doc\.id === dropUid \|\| doc\.id === keepUid\)/.test(idx));
  ok('_migrateNotifications reaponta fromUid de terceiros',
    /collectionGroup\("notifications"\)[\s\S]{0,120}fromUid/.test(idx));
})();

console.log(`\nmerge-collections-core: ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
