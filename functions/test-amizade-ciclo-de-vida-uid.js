/* A AUTORIDADE DE AMIZADE NO CICLO DE VIDA DE UID — a FIAÇÃO (P0-2 e P0-3).
 * node functions/test-amizade-ciclo-de-vida-uid.js
 *
 * O `test-amizade-authority-core.js` prova as REGRAS (rekey, colisão, exclusão). Este prova
 * que elas estão LIGADAS nos lugares certos — que é onde a auditoria externa achou o furo:
 *
 * P0-2: a fusão varre TODAS as coleções por `listCollections()` (merge-collections-core).
 *   `friendships` cairia nessa varredura e teria os CAMPOS trocados sem o `pairId` (que é a
 *   CHAVE do documento) ser rekeyado — cânone mentindo sobre si mesmo. E `friendAccess` é
 *   subcoleção: o sweep genérico nem chega lá, e a projeção do uid morto continuaria
 *   CONCEDENDO leitura. Por isso as duas estão na lista de EXCLUSÃO e têm tratamento próprio.
 *
 * P0-3: o doc legado com chave de e-mail não pode ser apagado antes de a amizade ser
 *   transportada — depois do delete a fonte morreu. A trava é o backfill abortar.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

const idx = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
// v2.1.48 — a rotina saiu do index.js pra um módulo requerível (senão o efeito só podia
// ser provado por regex; ver tests/amizade/lifecycle.test.js, que roda de verdade).
const vida = fs.readFileSync(path.join(ROOT, 'functions', 'amizade-lifecycle.js'), 'utf8');
const mcc = fs.readFileSync(path.join(ROOT, 'functions', 'merge-collections-core.js'), 'utf8');
const core = require('./merge-collections-core');
const auth = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
const bkf = fs.readFileSync(path.join(ROOT, 'scripts', 'backfill-amizade.js'), 'utf8');
// ⚠️ lido AQUI, não lá embaixo: `const` usado antes da declaração é TDZ e derruba o arquivo.
const coreS = fs.readFileSync(path.join(ROOT, 'functions', 'amizade-authority-core.js'), 'utf8');

// ══ P0-2a — a varredura genérica NÃO pode tocar a autoridade ═════════════════
ok(core.shouldSweepCollection('friendships') === false,
  '⛔ `friendships` está FORA da varredura genérica (a chave é o par, não um campo)');
ok(core.shouldSweepCollection('friendAccess') === false,
  '⛔ `friendAccess` está FORA (subcoleção; o sweep nem chegaria, e a projeção sobreviveria)');
ok(core.shouldSweepCollection('users') === true,
  'controle: `users` continua sendo varrida (docs de TERCEIROS precisam do repontamento)');
ok(core.shouldSweepCollection('presences') === true,
  'controle: coleção nova/comum continua no default de varrer');
ok(/friendships:\s*'[^']*chave é o par/.test(mcc) && /friendAccess:\s*'[^']/.test(mcc),
  'e a exclusão vem com MOTIVO escrito (lista de exclusão sem porquê apodrece)');

// ══ P0-2b — tratamento dedicado existe e está LIGADO ═════════════════════════
ok(/async function mergeAmizade\(db, oldUid, keepUid\)/.test(vida), 'mergeAmizade existe no módulo');
ok(/async function excluirAmizade\(db, uid\)/.test(vida), 'excluirAmizade existe no módulo');
ok(/_core\.planejarMerge\(/.test(vida), 'a fusão usa planejarMerge (regra no core)');
ok(/_core\.planejarExclusao\(/.test(vida), 'a exclusão usa planejarExclusao');

// ligado ANTES da varredura genérica, dentro do _executeMerge
const corpoMerge = idx.slice(idx.indexOf('async function _executeMerge'), idx.indexOf('async function _sweepAllCollectionsByUid'));
ok(/_amizadeNoMerge\(db, dropUid, keepUid\)/.test(corpoMerge),
  '⛔ _executeMerge CHAMA a porta única (senão a fusão deixa o cânone pra trás)');
const iAmz = corpoMerge.indexOf('_amizadeNoMerge(db, dropUid, keepUid)');
const iSweep = corpoMerge.indexOf('_sweepAllCollectionsByUid(db, dropUid, keepUid)');
ok(iAmz > 0 && iSweep > 0 && iAmz < iSweep, 'e chama ANTES da varredura genérica');

// ligado no deleteAccount
const corpoDel = idx.slice(idx.indexOf('exports.deleteAccount'), idx.indexOf('exports.deleteAccount') + 12000);
ok(/_excluirAmizade\(db, uid\)/.test(corpoDel),
  '⛔ deleteAccount CHAMA _excluirAmizade (projeção órfã concede leitura pra sempre)');

// ══ P0-2c — a busca de relações cobre as DUAS pontas do par ═════════════════
ok(/where\("uidA", "==", uid\)/.test(vida) && /where\("uidB", "==", uid\)/.test(vida),
  '⛔ _relacoesDe busca por uidA E uidB — buscar só uma ponta perde metade das relações');

// ══ P0-4 — a guarda de alvo da callable ═════════════════════════════════════
// v2.1.48 — a implementação saiu do index.js pra `amizade-service.js` (6ª auditoria, ponto 1)
const svc = fs.readFileSync(path.join(ROOT, 'functions', 'amizade-service.js'), 'utf8');
const corpoAplicar = svc.slice(svc.indexOf('async function aplicar('), svc.indexOf('async function notificar('));
ok(/_vivo\.userVivo\(db, alvoUid\)/.test(corpoAplicar), 'o alvo passa pela porta da conta viva');
ok(/deleted === true \|\| .*deletedAt/.test(corpoAplicar), 'conta excluída é recusada');
ok(/acceptFriendRequests === false/.test(corpoAplicar), '`acceptFriendRequests = false` é respeitado');
ok(/indexOf\("@"\) !== -1/.test(corpoAplicar), 'e-mail como alvo é recusado');
ok(!/tx\.set\(uA/.test(corpoAplicar) && /tx\.update\(uA/.test(corpoAplicar),
  '⛔ o cache usa `update`, não `set(...,{merge:true})` — `set` CRIAVA perfil fantasma');

// ══ A — friendRequestsSentAt é mantido pelo servidor ════════════════════════
ok(/friendRequestsSentAt\." \+ /.test(corpoAplicar),
  'o carimbo `friendRequestsSentAt` é mantido na CF (a UI ainda o lê em explore.js)');
const explore = fs.readFileSync(path.join(ROOT, 'js', 'views', 'explore.js'), 'utf8');
ok(/friendRequestsSentAt/.test(explore), 'controle: explore.js de fato usa o campo (senão bastava apagá-lo)');

// ══ P0-3 — o doc legado por e-mail não some antes do transporte ═════════════
ok(!/collection\('users'\)\.doc\(user\.email\)\.delete\(\)/.test(auth),
  '⛔ auth.js NÃO apaga mais o doc legado por e-mail (o delete matava a fonte da amizade)');
ok(/chave-de-email/.test(bkf) && /morra\(/.test(bkf),
  'o backfill ABORTA se achar doc de usuário com chave de e-mail');
ok(/userVivo\.uidVivo\(db, v\)/.test(bkf),
  '⛔ o backfill resolve identidade pela porta da conta viva (lápide → conta viva)');
ok(!/todosUids\.has\(/.test(bkf),
  '⛔ e NÃO usa mais "existe como doc id" como sinônimo de "é uid vivo" — era o P0-3');
ok(/conta-excluida/.test(bkf), 'conta marcada como excluída não entra no cânone');
ok(/lapide-nao-resolve/.test(bkf), 'corrente de lápide quebrada é REPORTADA, não chutada');

// ══ P0-1 — a quarentena bloqueia o --aplicar ════════════════════════════════
ok(/sem adjudicação\. Nada foi escrito/.test(bkf), '--aplicar aborta com quarentena sem adjudicação');
ok(/d\.decisao !== 'aceitar'/.test(bkf) && /sem "porQue"/.test(bkf),
  'e a adjudicação exige decisão E motivo por escrito (fica gravado no doc)');

// ══ B — conferência pós-escrita ═════════════════════════════════════════════
ok(/RECONCILIAÇÃO EXATA \(relendo o banco inteiro\)/.test(bkf), 'o --aplicar relê o banco INTEIRO depois de escrever');
ok(/projeção AUSENTE/.test(bkf) && /extra \(projeção\)/.test(bkf),
  'confere IGUALDADE DE CONJUNTO das projeções (ausentes E extras)');
ok(/collectionGroup\('accepted'\)/.test(bkf), 'lê TODAS as projeções do banco, não só as esperadas');
ok(/APAGAR_STALE/.test(bkf) && /--apagar-stale/.test(bkf),
  'extra fora do plano exige decisão explícita (--apagar-stale), nunca some sozinho');
ok(/QUARENTENA vazou/.test(bkf), 'e confere que a quarentena NÃO vazou');
const iOk = bkf.indexOf("✅ backfill aplicado"), iConf = bkf.indexOf('RECONCILIAÇÃO EXATA');
ok(iConf > 0 && iOk > iConf, '⛔ o "✅" só aparece DEPOIS da conferência');
ok(!/scripts\/conferir-amizade\.js/.test(bkf), 'e não manda mais rodar um script que não existe');

// ══ ponto 3 — o GATE de escrita client-side existe e está no npm test ═══════
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok(/check-amizade-client-writes\.js/.test(pkg.scripts.test),
  '⛔ o gate de escrita client-side roda no `npm test` (senão existe e ninguém executa)');
ok(fs.existsSync(path.join(ROOT, 'scripts', 'check-amizade-client-writes.js')), 'e o script existe');
const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
ok(!/friends:\s*FV\.array(Union|Remove)/.test(dash),
  '⛔ o writer esquecido do dashboard.js sumiu (era o achado do ponto 3)');

// ══ ponto 1 — UMA rotina canônica em TODOS os merges ════════════════════════
ok((idx.match(/_amizadeNoMerge\(db,/g) || []).length >= 3,
  '⛔ os 3 caminhos de merge chamam a porta única (_executeMerge, keepOlder-raro, mergePhoneAccount)');
// fatia até o FIM da função (ela cresceu com a revalidação pós-lock) em vez de contar chars
const _iKO = idx.indexOf('async function _mergeAccountsKeepOlder');
const corpoKeepOlder = idx.slice(_iKO, idx.indexOf('\nasync function ', _iKO + 10));
ok(/_amizadeNoMerge\(db, dropU\.uid, keepU\.uid\)/.test(corpoKeepOlder),
  '⛔ a ramificação RARA (keep sem doc Firestore) também migra amizade antes da lápide');
const corpoPhone = idx.slice(idx.indexOf('exports.mergePhoneAccount'), idx.indexOf('exports.mergePhoneAccount') + 30000);
ok(/_amizadeNoMerge\(db, oldUid, callerUid\)/.test(corpoPhone), 'mergePhoneAccount usa a porta única');
ok(!/surv\.friends\s*=/.test(corpoPhone) && !/surv\.friendRequests/.test(corpoPhone),
  '⛔ e NÃO une mais os arrays de amizade no perfil do sobrevivente');

// ══ ponto 2 — o cache vem do cânone ════════════════════════════════════════
ok(/_core\.projetarCache\(/.test(vida), 'o cache é PROJETADO do cânone, não unido');
ok(/const campos = \{[\s\S]{0,120}friends: cache\.friends/.test(vida) && /\.update\(campos\)/.test(vida),
  '⛔ e escrito com valor EXATO (`update` do objeto projetado), nunca arrayUnion');
ok(/criarSeAusente/.test(vida),
  'e o sobrevivente sem perfil recebe a projeção mínima (4ª auditoria, ponto 6)');
ok(/async function cachesContendo\(db, uid\)/.test(vida) && /array-contains/.test(vida),
  '⛔ e o retry DESCOBRE caches stale (não depende de nada ter sobrevivido à execução anterior)');

// ══ ponto 6 — o caller também é identidade viva ═════════════════════════════
ok(/callerData\.mergedInto/.test(corpoAplicar) && /callerData\.deleted/.test(corpoAplicar),
  '⛔ o CALLER é recusado se for lápide ou conta excluída');

// ══ ponto 7 — o cutover está documentado e a Etapa A existe ════════════════
ok(fs.existsSync(path.join(ROOT, 'docs', 'CUTOVER-AMIZADE-2.1.48.md')), 'o procedimento de cutover está escrito');
ok(fs.existsSync(path.join(ROOT, 'firestore.rules.etapaA')), 'e as Rules intermediárias da Etapa A existem');
const etapaARules = fs.readFileSync(path.join(ROOT, 'firestore.rules.etapaA'), 'utf8');
ok(/'friends', 'friendRequestsSent'/.test(etapaARules),
  '⛔ Etapa A já CONGELA a escrita legada (é o que torna o backfill seguro)');
/* ⛔ REVOGADO em 29/ago/2026 (5ª auditoria, ponto 1). Este teste EXIGIA que a Etapa A
 * continuasse autorizando por `users.friends`, com o argumento de que o estado estaria
 * "congelado e portanto seguro". Falso: congelar impede fraude NOVA, não remove a que já
 * aconteceu — o congelamento eternizaria a autorização forjada de quem tinha se inserido
 * no `friends` da vítima durante a janela da 2.1.47.
 * Agora a Etapa A falha fechado também na LEITURA, e o teste afirma isso. */
ok(!/vis == 'friends' && request\.auth\.uid in u\.get\('friends'/.test(etapaARules),
  '⛔ ETAPA A NÃO autoriza mais terceiro por `users.friends`');
ok(/return vis == 'public';/.test(etapaARules),
  'nela `friends` fica privado para terceiros e só `public` segue público');
ok(!/exists\(\/databases\/\$\(database\)\/documents\/friendAccess/.test(etapaARules),
  'ou seja: a Etapa A NÃO exige friendAccess — não há janela em que amizade real fique invisível');

// ══ 5ª AUDITORIA ════════════════════════════════════════════════════════════
const cut = fs.readFileSync(path.join(ROOT, 'docs', 'CUTOVER-AMIZADE-2.1.48.md'), 'utf8');

// ponto 1 — Etapa A falha fechado TAMBÉM na leitura
ok(!/vis == 'friends' && request\.auth\.uid in u\.get\('friends'/.test(etapaARules),
  '⛔ ETAPA A não autoriza mais por `users.friends` — congelar não apaga a fraude já feita');
ok(/return vis == 'public';/.test(etapaARules), 'e `public` segue público nela');

// ponto 2 — backup/restore próprios do estado social
['backup-amizade-legado.js', 'restore-amizade-legado.js'].forEach((f) => {
  ok(fs.existsSync(path.join(ROOT, 'scripts', f)), 'existe scripts/' + f);
});
ok(!/node scripts\/backup-torneios\.js\s*#?\s*(ou export|antes da Etapa B)/.test(cut),
  '⛔ o cutover não manda mais usar backup-torneios.js (ele não salva `users`)');
ok(/restore-amizade-legado\.js/.test(cut), 'e aponta para o restore certo');

// ponto 3 — a reconfirmação é DESTA leva
ok(/exports\.listLegacyFriendships = onCall/.test(idx), 'a callable de reconfirmação existe');
const explore2 = fs.readFileSync(path.join(ROOT, 'js', 'views', 'explore.js'), 'utf8');
ok(/window\._renderLegacyFriendships/.test(explore2) && /explore-legacy/.test(explore2),
  'e a seção está montada na tela');
ok(/window\._reconfirmarAmizade[\s\S]{0,400}sendFriendRequest/.test(explore2),
  '⛔ reconfirmar usa o MESMO sendFriendRequest (nada de segunda autoridade)');
ok(!/leva futura/.test(cut), 'e o cutover não empurra mais a tela pra uma leva futura');

// ponto 4 — one-shot
ok(/_meta\/amizadeMigration/.test(bkf) && /not_started|frozen|backfilled|live/.test(bkf),
  'o backfill tem marcador de fase');
ok(/já está LIVE/.test(bkf), '⛔ e RECUSA rodar depois de live');
ok(/--fase=frozen --aplicar/.test(cut), 'o cutover diz quem marca cada fase');

// ponto 5 — rollback completo
['desfazerC', 'desfazerF'].forEach((n) => {
  ok(new RegExp('catch\\(function \\(e\\) \\{ ' + n + '\\(e\\); \\}\\)').test(explore2),
    'rollback ligado em ' + n);
});
ok(/falharam\.forEach/.test(explore2) && /notifFriendError/.test(explore2),
  '⛔ multi-cancel restaura SÓ o que falhou e avisa erro (nada de sucesso global)');

// ponto 6 — o nativo
ok(fs.existsSync(path.join(ROOT, 'scripts', 'check-nativo-pronto-para-corte.js')),
  'a trava do nativo existe');
ok(/JS EMBARCADO|webDir/.test(cut) && /2\.1\.28/.test(cut),
  '⛔ e o cutover registra o que acontece com o app 2.1.28 das lojas');

// ══ 6ª AUDITORIA ════════════════════════════════════════════════════════════
const pkg2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cut2 = fs.readFileSync(path.join(ROOT, 'docs', 'CUTOVER-AMIZADE-2.1.48.md'), 'utf8');
const gate = fs.readFileSync(path.join(ROOT, 'scripts', 'check-amizade-client-writes.js'), 'utf8');

// ponto 1 — a fronteira existe e o gate a nomeia
ok(fs.existsSync(path.join(ROOT, 'functions', 'amizade-service.js')), 'amizade-service.js existe');
ok(!/async function _amizadeAplicar\(/.test(idx), '⛔ a implementação NÃO está mais no index.js');
ok(/amizade-service\.js/.test(gate), 'e o gate autoriza a fronteira por nome');
ok(!/functions\/index\.js/.test(gate), '⛔ e NÃO põe o index.js inteiro na allowlist');

// ponto 2 — delete não engole erro
const corpoDel2 = idx.slice(idx.indexOf('exports.deleteAccount'), idx.indexOf('exports.deleteAccount') + 14000);
ok(!/try \{\s*const amz = await _excluirAmizade/.test(corpoDel2),
  '⛔ a limpeza de amizade no delete NÃO está mais dentro de try/catch que engole');
ok(/friendships\.uidA \(relação com uid morto\)/.test(idx) && /friendAccess reverso/.test(idx),
  'e o varredor de sobras confere a autoridade NOVA, nos dois sentidos');

// ponto 3 — locks
ok(fs.existsSync(path.join(ROOT, 'functions', 'amizade-lock.js')), 'o módulo de lock existe');
ok(/_lock\.exigirAtivos\(tx, db/.test(svc),
  '⛔ o estado das contas é lido DENTRO da transação (é o que força retry na corrida)');
ok(/guardaDeMerge\(db, HttpsError, \[dropDoc\.id, keepDoc\.id\]/.test(idx),
  '⛔ e `_executeMerge` passa pela guarda (fase + lock) que cobre a fusão INTEIRA');
const _iG = vida.indexOf('async function guardaDeMerge');
const _corpoG = vida.slice(_iG, vida.indexOf('\nmodule.exports', _iG));
ok(_iG > 0 && _corpoG.indexOf('_fase.exigirLiberado') < _corpoG.indexOf('_lock.adquirir'),
  '⛔ e a guarda confere a FASE antes de adquirir o lock (senão o freeze deixaria lock preso)');
ok(/_lock\.finalizar\(db, posse, finais\)/.test(_corpoG),
  'e finaliza com estado terminal quando a fusão termina');

// ponto 4 — friendAccess descobrível sozinho
ok(/ownerUid: String\(ownerUid\), friendUid: String\(friendUid\)/.test(coreS),
  'a projeção carrega ownerUid/friendUid (construtor único no core)');
ok(/async function acessosDe\(db, uid\)/.test(vida) && /collectionGroup\('accepted'\)/.test(vida),
  '⛔ e dá pra achar as projeções SEM depender de friendships');
ok(/conferirUidMortoSumiu/.test(vida), 'e existe pós-condição verificável');

// ponto 5/15 — cutover
const iFreeze = cut2.indexOf('firebase deploy --only firestore:rules');
const iMarca = cut2.indexOf('--fase=frozen --aplicar');
const iBkp = cut2.indexOf('backup-amizade-legado.js --saida');
ok(iFreeze > 0 && iMarca > iFreeze && iBkp > iMarca,
  '⛔ a ordem do cutover é freeze → marcador → backup (o backup antes deixava janela)');
ok(/GATE A — TÉCNICO/.test(cut2) && /GATE B — APROVAÇÃO HUMANA/.test(cut2),
  '⛔ e há DOIS gates: técnico e aprovação humana do corte nativo');
ok(/instalados atualizaram/.test(cut2) && /force-update retroativo/.test(cut2),
  'com a distinção entre build publicado e usuário atualizado');

// ponto 6/9 — máquina de estados e adjudicação
ok(/const TRANSICOES = \{/.test(bkf) && /live:\s*\[\]/.test(bkf), 'as transições são explícitas e `live` é final');
ok(/DECISOES = \['aceitar', 'descartar'\]/.test(bkf), 'a decisão é enum exato');
ok(/ID DUPLICADO/.test(bkf) && /não corresponde a nenhum caso/.test(bkf), 'e valida duplicata e caso órfão');

// ponto 7/12 — backup completo
const bkpS = fs.readFileSync(path.join(ROOT, 'scripts', 'backup-amizade-legado.js'), 'utf8');
const rstS = fs.readFileSync(path.join(ROOT, 'scripts', 'restore-amizade-legado.js'), 'utf8');
ok(/_meta\/amizadeMigration/.test(bkpS) && /marcador/.test(rstS), 'backup e restore levam o marcador');
// (a string `since: 'restore'` só aparece no COMENTÁRIO que explica a remoção — o que
//  importa é o que o código FAZ: repor `accBackup[k]`, o conteúdo fotografado.)
ok(/b\.set\(refAcc\(k\), accBackup\[k\]\)/.test(rstS),
  '⛔ o restore repõe o conteúdo EXATO da projeção, não um `{since:"restore"}` reconstruído');

// ponto 8 — não-resolvido classificado
ok(/DESCARTE_PROVADO/.test(bkf) && /QUARENTENA_BLOQUEANTE/.test(bkf),
  '⛔ toda referência não resolvida cai numa categoria explícita');

// ponto 10/11 — legado morto removido
ok(!fs.existsSync(path.join(ROOT, 'js', 'views', 'amizade-core.js')), 'js/views/amizade-core.js REMOVIDO');
ok(!fs.existsSync(path.join(ROOT, 'functions', 'vendor', 'amizade-core.js')), 'vendor/amizade-core.js REMOVIDO');
ok(!fs.existsSync(path.join(ROOT, 'scripts', 'limpar-convite-de-quem-ja-e-amigo.js')),
  '⛔ o script de limpeza que escrevia cache direto foi APOSENTADO');

// ponto 13 — gitignore
const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
ok(/backup-amizade-\*\.json/.test(gi) && /adjudicacao\*\.json/.test(gi),
  '⛔ backups e adjudicações (grafo social) estão no .gitignore');

// ponto 14 — preflight
ok(fs.existsSync(path.join(ROOT, 'scripts', 'preflight-alvo.js')), 'o preflight de alvo existe');
[bkf, bkpS, rstS].forEach((f, i) => ok(/preflight-alvo/.test(f), 'e é chamado no script ' + (i + 1)));

// ponto 16 — erro do envio aparece
ok(/window\._sendFriendRequest[\s\S]{0,3000}catch\(function \(e\)/.test(explore2),
  '⛔ sendFriendRequest tem catch — a rejection não fica perdida');

// ══ 7ª AUDITORIA ════════════════════════════════════════════════════════════
const lockS = fs.readFileSync(path.join(ROOT, 'functions', 'amizade-lock.js'), 'utf8');
const faseS = fs.readFileSync(path.join(ROOT, 'functions', 'amizade-fase.js'), 'utf8');
const cut3 = fs.readFileSync(path.join(ROOT, 'docs', 'CUTOVER-AMIZADE-2.1.48.md'), 'utf8');

// ponto 1 — lock de verdade
ok(/async function adquirir\(db, uids, estado/.test(lockS) && /runTransaction/.test(lockS),
  '⛔ a aquisição do lock é TRANSACIONAL (antes era batch.set, que escrevia por cima)');
ok(/operationId/.test(lockS) && /d\.operationId !== posse\.operationId/.test(lockS),
  '⛔ e a liberação confere OWNERSHIP — ninguém libera lock alheio');
ok(/expiresAt/.test(lockS) && /LEASE_MS/.test(lockS), 'com lease, pra operação abandonada não trancar a conta');
ok(/LEASE_MS = 30 \* 60 \* 1000/.test(lockS), 'e o lease (30 min) é maior que o maior timeout declarado (300 s)');

// ponto 2/3 — todos os merges sob o mesmo protocolo
// ⚠️ v2.1.48 (10ª auditoria): a aquisição subiu para ANTES de qualquer leitura de decisão,
// então usa `[uidA, uidB]` (os parâmetros) e não mais `[dropU.uid, keepU.uid]` — que só
// existem depois de escolher o vencedor, e escolher antes do lock era o defeito.
ok(/_amizadeLock\.adquirir\(db, \[uidA, uidB\], "merging"\)/.test(idx),
  '⛔ `_mergeAccountsKeepOlder` adquire o lock ANTES de decidir (cobre as DUAS ramificações)');
ok(/_executeMergeInterno\(db, keepDoc, dropDoc\)/.test(idx) && /await _executeMergeInterno/.test(idx),
  'e chama a versão INTERNA — sem re-adquirir os mesmos uids (deadlock consigo mesmo)');
ok(/_amizadeLock\.adquirir\(admin\.firestore\(\), \[oldUid, callerUid\], "merging"\)/.test(idx),
  '⛔ `mergePhoneAccount` também adquire — era uma fusão independente, fora do protocolo');
ok(/if \(!dryRun\) \{[\s\S]{0,200}adquirir/.test(idx), 'e o `dryRun` NÃO adquire lock de escrita');

// ponto 4 — o backend congela junto
ok(fs.existsSync(path.join(ROOT, 'functions', 'amizade-fase.js')), 'a trava de manutenção existe');
ok(/FASES_CONGELADAS = \['not_started', 'frozen', 'backfilled'\]/.test(faseS),
  'e congela em not_started/frozen/backfilled');
ok(/assumindo CONGELADO/.test(faseS), '⛔ falhando FECHADO se não der pra ler a fase');
['amizade:', 'mergePhoneAccount', 'mergeAccountsKeepOlder', 'deleteAccount'].forEach((op) => {
  ok(new RegExp('exigirLiberado\\([\\s\\S]{0,80}"?' + op).test(idx + svc), 'a trava cobre ' + op);
});
ok(/_amizadeFase\.liberado\(db\)/.test(idx), 'e a varredura automática/agendada também consulta a fase');
/* ⚠️ REVOGADO na 10ª auditoria: a ordem antiga (drain ANTES das Rules) deixava o cliente
 * exposto à escalada por ~10 min. Rules não interferem em invocações Admin em andamento,
 * então fechar o cliente vem primeiro e o drain acontece igual, depois. */
ok(cut3.indexOf('deploy-functions.sh main') < cut3.indexOf('cp firestore.rules.etapaA firestore.rules') &&
   cut3.indexOf('cp firestore.rules.etapaA firestore.rules') < cut3.indexOf('sleep 600'),
  '⛔ o cutover: Functions congeladas → Rules Etapa A → SÓ ENTÃO o drain');

// ponto 5 — formato único da projeção
ok(/function docAcesso\(ownerUid, friendUid, quando\)/.test(coreS), 'o doc de projeção tem construtor único');
ok(/core\.docAcesso\(/.test(bkf) && /_core\.docAcesso\(/.test(vida) && /_core\.docAcesso\(/.test(svc),
  '⛔ e backfill, lifecycle e service usam TODOS ele (nada de dois formatos)');

// ponto 6 — a prova não falha aberta
ok(/busca reversa FALHOU/.test(vida) && /throw err/.test(vida),
  '⛔ se a query que PROVA ausência de órfã falha, a operação falha (nada de warn e segue)');

// ponto 7 — backup não é best-effort
ok(/ABORTA: leitura de friendAccess falhou/.test(bkpS) && /ABORTA: leitura do marcador/.test(bkpS),
  '⛔ o backup ABORTA em falha de leitura obrigatória');
ok(/renameSync/.test(bkpS), 'e grava por rename atômico (parcial nunca vira .json bom)');

// ponto 8 — Auth ghost
ok(/admin\.auth\(\)\.getUser\(uid\)/.test(bkf) && /auth-ghost/.test(bkf),
  '⛔ uid sem doc é conferido no Firebase Auth antes de qualquer descarte');
ok(/auth-indisponivel/.test(bkf), 'e não conseguir perguntar vira quarentena, nunca descarte');

// ponto 9 — identidade exige resolverParaUid
ok(/TIPOS_IDENTIDADE/.test(bkf) && /'lapide-nao-resolve'/.test(bkf),
  '⛔ `lapide-nao-resolve` é IDENTIDADE e exige `resolverParaUid`');

// ponto 10 — rollback honesto
ok(/ROLLBACK SEGURO/.test(cut3) && /ROLLBACK COMPLETO PARA O LEGADO/.test(cut3),
  'o cutover distingue os dois rollbacks');
ok(/reabre conscientemente a escalada/.test(cut3), 'e diz o que o rollback completo custa');
// (a frase antiga só sobrevive dentro do parágrafo que a DESMENTE — o que importa é que
//  ela não apareça como promessa)
ok(/Isso é FALSO/.test(cut3) && /amizade friends-only \*\*continua fechada\*\*/.test(cut3),
  '⛔ e o rollback A não promete mais o que as Rules não fazem');

// ponto 14 — estabilidade do snapshot
ok(/ESTABILIDADE DO SNAPSHOT/.test(bkf) && /hashEntrada/.test(bkf),
  '⛔ o backfill confere que o estado NÃO mudou entre a leitura e a escrita');

// ══ 9ª AUDITORIA ════════════════════════════════════════════════════════════
const faseS2 = fs.readFileSync(path.join(ROOT, 'functions', 'amizade-fase.js'), 'utf8');
const lockS2 = fs.readFileSync(path.join(ROOT, 'functions', 'amizade-lock.js'), 'utf8');
const cut4 = fs.readFileSync(path.join(ROOT, 'docs', 'CUTOVER-AMIZADE-2.1.48.md'), 'utf8');

// ponto 1 — só `live` libera
ok(/return String\(est\.fase\) === 'live';/.test(faseS2),
  '⛔ só `live` libera operações (backfilled BLOQUEIA)');
ok(/FASES_CONGELADAS = \['not_started', 'frozen', 'backfilled'\]/.test(faseS2),
  'e `backfilled` está entre as congeladas');

// ponto 2 — ordem no deleteAccount
const corpoDel3 = idx.slice(idx.indexOf('exports.deleteAccount = onCall'), idx.indexOf('exports.deleteAccount = onCall') + 16000);
const _oFase = corpoDel3.indexOf('exigirLiberado'), _oLock = corpoDel3.indexOf('adquirir(db, [uid]');
const _oGuard = corpoDel3.indexOf('mensagemBloqueio'), _oEscrita = corpoDel3.indexOf('ref.delete()');
ok(_oFase > 0 && _oLock > _oFase && _oGuard > _oLock && _oEscrita > _oGuard,
  '⛔ deleteAccount: fase → lock → guard(só leitura) → PRIMEIRA escrita');
ok(/finalizarPeloFato\(db, _posseDel\)/.test(corpoDel3),
  'e o desfecho do lock vem do FATO gravado (guard só-leitura ⇒ conta viva ⇒ volta a `active`)');
ok(/finalizar\(db, _posseDel, \{ \[uid\]: "deleted" \}\)/.test(corpoDel3),
  'e termina o uid como `deleted` (terminal), não `active`');

// ponto 3 — estados terminais
ok(/TERMINAIS = \['merged', 'deleted'\]/.test(lockS2), 'os estados terminais existem');
ok(/if \(TERMINAIS\.includes\(data\.estado\)\) return data\.estado;/.test(lockS2),
  '⛔ e NÃO expiram por lease');
ok(/async function finalizar\(db, posse, estadosPorUid\)/.test(lockS2),
  'a finalização é ownership-aware e separada de `liberar`');

// ponto 4 — perfis lidos dentro da transação de amizade
ok(/tx\.get\(db\.collection\('users'\)\.doc\(callerUid\)\)/.test(svc) &&
   /tx\.get\(db\.collection\('users'\)\.doc\(alvoUid\)\)/.test(svc),
  '⛔ a transação de amizade LÊ os dois perfis dentro dela');
ok(/dA\.mergedInto/.test(svc) && /dC\.mergedInto/.test(svc), 'e recusa lápide dos dois lados');
ok(/acao === 'enviar' && dA\.acceptFriendRequests === false/.test(svc),
  'e confere `acceptFriendRequests` AQUI, não no retrato externo');

// ponto 5 — revalidação pós-lock
ok(/RELÊ E REAVALIA DEPOIS DO LOCK/.test(idx), '`_executeMerge` revalida depois do lock');
ok(/const prova = await _mayAutoMerge\(fk, fd\);/.test(idx), 'e reavalia a REGRA com dado fresco');
// ⚠️ v2.1.48 (10ª auditoria): `_mergeAccountsKeepOlder` não precisa mais RELER — ele passou
// a ler TUDO já sob a posse, então não existe snapshot pré-lock a revalidar.
// fatia LOCAL: `_koBody` só é declarado no bloco da 10ª auditoria, mais abaixo — usar aqui
// seria zona morta (o erro que já derrubou este arquivo antes).
const _iKOa = idx.indexOf('async function _mergeAccountsKeepOlder');
const _koLocal = idx.slice(_iKOa, idx.indexOf('\nasync function ', _iKOa + 10));
ok(/tombstone no Firestore/.test(_koLocal) && /already: true/.test(_koLocal),
  '`_mergeAccountsKeepOlder` confere tombstone sob o lock e não cria um SEGUNDO');
ok(/já foi fundido\/removido por outra operação/.test(idx),
  'e `_executeMerge` aborta quando o drop já foi fundido por outra operação');

// ponto 6 — fase dentro da aquisição
ok(/const mSnap = await tx\.get\(db\.doc\(_fase\.DOC\)\)/.test(lockS2),
  '⛔ a AQUISIÇÃO lê o marcador dentro da transação (ligar manutenção força retry)');
ok(/tx\.get\(db\.doc\(_fase\.DOC\)\)/.test(svc), 'e a transação de amizade também');

// ponto 7 — contrato de retorno
ok(/PULADO \(' \+ field \+ '\)/.test(idx) && !/return \{ pulado: true/.test(idx),
  '⛔ `_scanAndMergeByField` devolve ARRAY quando congelado');

// ponto 8 — runbook
ok(/backfilled` NÃO libera nada/.test(cut4), 'o runbook diz que `backfilled` não libera');
ok(cut4.lastIndexOf('--fase=live --aplicar') > cut4.lastIndexOf('deploy-hosting.sh'),
  '⛔ e `--fase=live` é o último passo do cutover');

// ══ 10ª AUDITORIA ═══════════════════════════════════════════════════════════
const lockS3 = fs.readFileSync(path.join(ROOT, 'functions', 'amizade-lock.js'), 'utf8');
const cut5 = fs.readFileSync(path.join(ROOT, 'docs', 'CUTOVER-AMIZADE-2.1.48.md'), 'utf8');
const _iDelH = idx.indexOf('exports.deleteAccount = onCall');
const _corpoDelH = idx.slice(_iDelH, idx.indexOf('\n);', _iDelH));

// ponto 1 — uma aquisição só
ok((_corpoDelH.match(/adquirir\(db, \[uid\], "deleting"\)/g) || []).length === 1,
  '⛔ deleteAccount adquire `deleting` UMA vez (a segunda travava o caminho feliz)');

// ponto 2 — vencedor recalculado sob o lock
ok(/_determineMergeWinner\(fk, fd\)/.test(idx),
  '⛔ `_executeMerge` RECALCULA o vencedor sob o lock (não só confere que existem)');
ok(/a direção MUDOU sob o lock/.test(idx), 'e registra quando a direção inverte');
const _iKO2 = idx.indexOf('async function _mergeAccountsKeepOlder');
const _koBody = idx.slice(_iKO2, idx.indexOf('\nasync function ', _iKO2 + 10));
const _pos = (re) => _koBody.search(re);
ok(_pos(/adquirir\(db, \[uidA, uidB\]/) < _pos(/getUser\(uidA\)/) &&
   _pos(/getUser\(uidA\)/) < _pos(/_tournamentCountFor\(db, uidA\)/) &&
   _pos(/_tournamentCountFor\(db, uidA\)/) < _pos(/pickSurvivorByActivity/),
  '⛔ `_mergeAccountsKeepOlder`: lock → Auth → contagem → DECISÃO (tudo sob a posse)');
ok(_pos(/pickSurvivorByActivity/) < _pos(/const dropEmail/),
  'e as credenciais do drop só são lidas DEPOIS da decisão definitiva');

// ponto 3 — desfecho pelo fato
ok(/async function estadoFinalPeloFato/.test(lockS3) && /async function finalizarPeloFato/.test(lockS3),
  'o desfecho é deduzido do FATO gravado, não de uma flag');
ok(/finalizarPeloFato/.test(idx), 'e os caminhos de merge/delete usam isso');
ok(/tombstone existe e o Auth sobreviveu — retomando/.test(idx),
  '⛔ exclusão parcial é RETOMÁVEL (profile morto + Auth vivo não vira limbo)');
ok(_corpoDelH.indexOf('retomando SÓ o passo do Auth') < _corpoDelH.indexOf('adquirir(db, [uid], "deleting")'),
  '⛔ e a retomada roda ANTES do lock (o lifecycle já terminal recusaria a aquisição)');

// ponto 4 — terminal não ressuscita
ok(/if \(!d\.operationId \|\| d\.operationId !== posse\.operationId\)/.test(lockS3),
  '⛔ ownership ESTRITO: documento sem operationId não é liberável por posse alheia');
ok(/já é TERMINAL/.test(lockS3), 'e estado terminal não é sobrescrito');

// ponto 5 — Rules antes do drain
ok(cut5.indexOf('cp firestore.rules.etapaA firestore.rules') < cut5.indexOf('sleep 600'),
  '⛔ o cutover fecha as Rules ANTES do drain (a janela antiga expunha o cliente por 10 min)');

// ponto 6 — frase obsoleta
ok(!/lifecycle canônico só passa a valer quando a fase virar `backfilled`/.test(cut5),
  '⛔ e o runbook não diz mais que `backfilled` libera o lifecycle');

console.log(pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
