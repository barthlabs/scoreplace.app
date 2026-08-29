'use strict';
/* Testa functions/profile-merge-core.js — "nada se perde" na união de contas.
 * Rodar:  node functions/test-profile-merge-core.js
 *
 * O DEFEITO QUE ISTO TRAVA (medido em produção, 04/ago/2026): o merge movia torneios,
 * matchHistory e partidas casuais e NÃO copiava NENHUM campo de perfil. Caso real na base:
 * Silvia Moura Ferreira tem duas contas vivas — `password`/silvmou@gmail.com com 44 campos
 * e `apple.com` com e-mail oculto (relay) com 17. Pela regra de sobrevivência a federada
 * vence, então o merge manteria a de 17 campos e os 44 evaporariam.
 *
 * A regra é VARREDURA GENÉRICA com lista de EXCLUSÃO — não lista campo a campo, que
 * apodrece (campo novo no perfil nasceria fora da lista e voltaria a se perder calado).
 * Mesma lição do _repairTournaments. */
const P = require('./profile-merge-core');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } }
const merge = P.computeProfileMerge;

// ── O CASO REAL: sobrevivente POBRE absorve o perfil RICO ─────────────────────
(() => {
  const rica = { // silvmou@gmail.com — a que MORRE pela regra de sobrevivência
    displayName: 'Silvia Moura Ferreira', email: 'silvmou@gmail.com',
    gender: 'feminino', birthDate: '1975-04-12', city: 'São Paulo', state: 'SP',
    skillBySport: { 'Beach Tennis': 'B', 'Tênis': 'C' },
    preferredSports: ['Beach Tennis', 'Tênis'], preferredCeps: ['04533-010'],
    photoURL: 'https://firebasestorage.../silvia.jpg', letzplayHandle: '@silvia',
    notifyLevel: 'importantes', createdAt: '2026-05-03T10:00:00Z',
  };
  const pobre = { // Apple relay — a que SOBREVIVE
    displayName: 'Silvia Moura Ferreira', email: 'cv85pnkf5y@privaterelay.appleid.com',
    createdAt: '2026-07-17T10:00:00Z', authProvider: 'apple.com',
  };
  const upd = merge(pobre, rica, 'uid_apple');
  ok('gênero é absorvido', upd.gender === 'feminino');
  ok('data de nascimento é absorvida', upd.birthDate === '1975-04-12');
  ok('cidade é absorvida', upd.city === 'São Paulo');
  ok('foto é absorvida', /silvia\.jpg$/.test(upd.photoURL || ''));
  ok('habilidade por modalidade é absorvida',
    upd.skillBySport && upd.skillBySport['Beach Tennis'] === 'B' && upd.skillBySport['Tênis'] === 'C');
  ok('modalidades preferidas são absorvidas', (upd.preferredSports || []).length === 2);
  ok('handle do letzplay é absorvido', upd.letzplayHandle === '@silvia');

  // O que NÃO pode viajar junto
  ok('NOME não é copiado (o sobrevivente mantém a identidade dele)', !('displayName' in upd));
  ok('E-MAIL não é copiado (quem move credencial é o Auth)', !('email' in upd));
  ok('createdAt não é copiado (é critério de merge — mexer envenena decisões futuras)',
    !('createdAt' in upd));
})();

// ── O sobrevivente NUNCA perde valor vivo ────────────────────────────────────
(() => {
  const keep = { city: 'Sorocaba', gender: 'masculino', skillBySport: { 'Tênis': 'A' } };
  const drop = { city: 'São Paulo', gender: 'feminino', skillBySport: { 'Tênis': 'D', 'Padel': 'C' } };
  const upd = merge(keep, drop, 'u1');
  ok('cidade viva do sobrevivente prevalece', !('city' in upd));
  ok('gênero vivo do sobrevivente prevalece', !('gender' in upd));
  ok('objeto: chave existente do keep vence', upd.skillBySport['Tênis'] === 'A');
  ok('objeto: chave NOVA do drop entra', upd.skillBySport['Padel'] === 'C');
})();

// ── Arrays: união sem duplicar, preservando a ordem do sobrevivente ──────────
(() => {
  const keep = { preferredSports: ['Tênis'], linkedEmails: ['a@x.com'], friends: ['uA'] };
  const drop = { preferredSports: ['Padel', 'Tênis'], linkedEmails: ['b@x.com', 'a@x.com'], friends: ['uB', 'uA'] };
  const upd = merge(keep, drop, 'uKeep');
  ok('união de modalidades sem duplicar', JSON.stringify(upd.preferredSports) === JSON.stringify(['Tênis', 'Padel']));
  ok('união de e-mails vinculados', JSON.stringify(upd.linkedEmails) === JSON.stringify(['a@x.com', 'b@x.com']));
  /* ⛔ REVOGADO em 29/ago/2026 (v2.1.48, 4ª auditoria, ponto 4A). Este teste exigia que a
   * fusão de perfil UNISSE `friends`. Os quatro campos de amizade deixaram de ser dado de
   * perfil: são PROJEÇÃO de `friendships`, reconstruída por `amizade-lifecycle`. União
   * preservava o uid MORTO, criava amizade consigo mesmo depois da fusão e deixava o mesmo
   * uid como amigo E como convite. Agora eles estão em NUNCA_COPIAR.
   * A prova funcional está em functions/test-amizade-writers-unicos.js. */
  ok('⛔ `friends` NÃO é mais unido pela fusão de perfil (é projeção do cânone)', upd.friends === undefined);
  ok('array sem novidade não vira write', merge({ preferredSports: ['Tênis', 'Padel'] }, { preferredSports: ['Padel'] }, 'u').preferredSports === undefined);
})();

// ── Auto-amizade: o sobrevivente não pode virar amigo de si mesmo ────────────
/* ⛔ v2.1.48 (4ª auditoria, ponto 4A): esta guarda continua no módulo, mas ficou SEM EFEITO
 * prático aqui — `friends` não é mais copiado pela fusão de perfil, então não há lista pra
 * filtrar. Quem impede a auto-amizade agora é `projetarCache` (`if (!outro || outro === uid)
 * return`), provado em tests/amizade/lifecycle.test.js, bloco [old↔keep].
 * O teste passa a afirmar o que de fato vale: a fusão não devolve `friends` nenhum. */
(() => {
  const upd = merge({ friends: ['uX'] }, { friends: ['uKeep', 'uY'] }, 'uKeep');
  ok('⛔ a fusão de perfil não devolve `friends` — nem pra filtrar', upd.friends === undefined);
})();

// ── Campos que NUNCA viajam ──────────────────────────────────────────────────
(() => {
  const drop = {
    mergedInto: 'uOutro', mergedAt: 'x',        // prova de merge → sequestro de conta
    plan: 'pro', planExpiresAt: '2027-01-01',   // assinatura: só o webhook do Stripe concede
    displayName: 'Fulano', displayName_lower: 'fulano',
    email: 'e@x.com', phone: '+5511999999999', phoneCountry: '55',
    fcmToken: 'tok', uid: 'uDrop', matchHistory: [{ matchId: 'm1' }],
    city: 'Campinas',
  };
  const upd = merge({}, drop, 'uKeep');
  ['mergedInto', 'mergedAt', 'plan', 'planExpiresAt', 'displayName', 'displayName_lower',
   'email', 'phone', 'phoneCountry', 'fcmToken', 'uid', 'matchHistory'].forEach(function (k) {
    ok('NUNCA copia ' + k, !(k in upd));
  });
  ok('mas copia o resto (city)', upd.city === 'Campinas');
})();

// ── Vazio não apaga, e false/0 são VALORES ──────────────────────────────────
(() => {
  ok('string vazia do drop não vira write', !('city' in merge({}, { city: '   ' }, 'u')));
  ok('null do drop não vira write', !('gender' in merge({}, { gender: null }, 'u')));
  ok('false do drop É valor e é copiado', merge({}, { notifyEmail: false }, 'u').notifyEmail === false);
  ok('0 do drop É valor e é copiado', merge({}, { sitOutPoints: 0 }, 'u').sitOutPoints === 0);
  ok('false vivo no keep NÃO é sobrescrito', !('notifyEmail' in merge({ notifyEmail: false }, { notifyEmail: true }, 'u')));
  ok('nada a fazer devolve objeto vazio', Object.keys(merge({ city: 'SP' }, { city: 'RJ' }, 'u')).length === 0);
})();

// ── Campo NOVO no perfil é preservado por padrão (a razão da lista de exclusão) ──
(() => {
  const upd = merge({}, { campoQueAindaNaoExiste: 'valor', outroNovo: ['a'] }, 'u');
  ok('campo desconhecido é absorvido sem ninguém atualizar lista', upd.campoQueAindaNaoExiste === 'valor');
  ok('array desconhecido também', JSON.stringify(upd.outroNovo) === JSON.stringify(['a']));
})();


// ── LETZPLAY é ATÔMICO: escolhe um doc inteiro ──────────────────────────────
// Achado num ensaio com 2 docs REAIS de letzplayScans: aplicar a regra de PERFIL aqui
// alterava `scan`/`fullImport`/`totaisLetzplay` do sobrevivente, porque ela funde objeto por
// chave. Pra skillBySport isso é certo; pra uma LEITURA do letzplay é errado — o doc é um
// retrato coerente (cursor, totais e jogos combinam), e misturar dois gera totais que não
// batem com os jogos. O app trata esses números como verdade.
(() => {
  const p = P.pickLetzplayScan;
  ok('sem doc no drop → fica o do keep', p({ handle: '@a' }, null) === 'keep');
  ok('sem doc no keep → entra o do drop', p(null, { handle: '@b' }) === 'drop');
  ok('a leitura MAIS RECENTE vence',
    p({ scannedAt: '2026-07-01T00:00:00Z' }, { scannedAt: '2026-08-01T00:00:00Z' }) === 'drop');
  ok('a mais antiga não derruba a nova',
    p({ scannedAt: '2026-08-01T00:00:00Z' }, { scannedAt: '2026-07-01T00:00:00Z' }) === 'keep');
  ok('Timestamp-like (toMillis) é lido',
    p({ scannedAt: { toMillis: () => 1000 } }, { scannedAt: { toMillis: () => 2000 } }) === 'drop');
  ok('sem data → decide por nº de JOGOS',
    p({ totaisLetzplay: { jogos: 10 } }, { totaisLetzplay: { jogos: 400 } }) === 'drop');
  ok('empate de jogos → preserva o do sobrevivente',
    p({ totaisLetzplay: { jogos: 5 } }, { totaisLetzplay: { jogos: 5 } }) === 'keep');
  // A garantia central: NUNCA devolve um híbrido — só 'keep' ou 'drop'
  const r = p({ scan: { a: 1 }, handle: '@x' }, { scan: { b: 2 }, handle: '@y' });
  ok('devolve sempre um doc INTEIRO (nunca híbrido)', r === 'keep' || r === 'drop');
})();

// ── O IDENTIFICADOR DA CONTA ABSORVIDA VIRA VÍNCULO ──────────────────────────
// DEFEITO MEDIDO (Fabiana Bastos Vieira, 07/ago/2026): a fusão rodou, o torneio ficou
// intacto — e o `linkedEmails` do sobrevivente continuou `undefined`. O e-mail da conta
// absorvida (fabiana@sialdrill.com.br) foi parar SÓ em `loginRedirects`, que só é lido no
// login. Resultado: ela entra pelos dois caminhos e não RECEBE mais nada no endereço pelo
// qual se cadastrou. A varredura de perfil não pegava porque `email` está em NUNCA_COPIAR:
// o dado a preservar é um campo ESCALAR do drop, não um array pra unir.
(() => {
  const L = P.computeLinkedIdentifiers;

  // O caso real, reproduzido: keep sem linkedEmails nenhum.
  const fab = L({ email: 'fabi2bvieira@gmail.com' }, 'fabiana@sialdrill.com.br', null);
  ok('o e-mail da conta absorvida entra em linkedEmails',
    JSON.stringify(fab.linkedEmails) === JSON.stringify(['fabiana@sialdrill.com.br']),
    JSON.stringify(fab));

  ok('preserva os vínculos que já existiam',
    JSON.stringify(L({ email: 'a@x.com', linkedEmails: ['v@x.com'] }, 'b@x.com', null).linkedEmails)
      === JSON.stringify(['v@x.com', 'b@x.com']));

  // Idempotência: rodar de novo depois de gravado não pode duplicar nem gerar update.
  ok('idempotente — segunda passada não devolve update',
    Object.keys(L({ email: 'a@x.com', linkedEmails: ['b@x.com'] }, 'b@x.com', null)).length === 0);
  ok('dedup é insensível a maiúscula',
    Object.keys(L({ email: 'a@x.com', linkedEmails: ['B@X.com'] }, 'b@x.com', null)).length === 0);

  // O próprio e-mail do sobrevivente nunca vira "vínculo" dele mesmo.
  ok('não vincula o e-mail do próprio sobrevivente',
    Object.keys(L({ email: 'a@x.com' }, 'A@x.com', null)).length === 0);

  // E-mail sintético de conta de celular NÃO é identidade — não pode virar vínculo.
  ok('e-mail sintético de celular é descartado',
    Object.keys(L({ email: 'a@x.com' }, 'phone_5511999998888@phone.scoreplace.app', null)).length === 0);

  // Telefone segue a mesma regra, em linkedPhones (é o que _uidByProfilePhone consulta).
  ok('telefone da conta absorvida entra em linkedPhones',
    JSON.stringify(L({ phone: '+5511911111111' }, null, '+5511922222222').linkedPhones)
      === JSON.stringify(['+5511922222222']));
  ok('não vincula o telefone do próprio sobrevivente',
    Object.keys(L({ phone: '+5511911111111' }, null, '+5511911111111')).length === 0);

  ok('sem identificador nenhum → nada a gravar', Object.keys(L({}, null, null)).length === 0);
})();

// ── Fiação: o index.js usa o módulo de verdade ───────────────────────────────
(() => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  ok('index.js importa profile-merge-core', /require\(["']\.\/profile-merge-core["']\)/.test(src));
  ok('_executeMerge chama computeProfileMerge', src.includes('_profileMerge.computeProfileMerge('));
  const bloco = src.slice(src.indexOf('async function _executeMerge'), src.indexOf('async function _mergeAccountsKeepOlder'));
  ok('a união do perfil acontece DENTRO do _executeMerge (o caminho comum de toda fusão)',
    bloco.includes('computeProfileMerge('));
  ok('grava num update só (perfil + matchHistory juntos)', /profileUpd\.matchHistory\s*=/.test(bloco));

  // O vínculo do identificador tem que rodar no CAMINHO COMUM, não só no merge por celular —
  // foi exatamente essa assimetria que deixou a Fabiana sem linkedEmails.
  ok('_executeMerge vincula o identificador da conta absorvida',
    bloco.includes('computeLinkedIdentifiers('));
  // E não pode haver DUAS versões da mesma decisão: o mergePhoneAccount tinha a regra
  // inline (`surv.linkedEmails.push(oe)`) e o caminho comum não tinha nada.
  ok('mergePhoneAccount usa a MESMA função (regra não duplicada)',
    (src.match(/computeLinkedIdentifiers\(/g) || []).length >= 2);
  ok('a versão inline de mergePhoneAccount saiu do arquivo',
    !/surv\.linkedEmails\.push\(/.test(src));
})();

// ── O índice que a migração de notificações exige existe no repo ─────────────
// Na fusão da Fabiana o passo _migrateNotifications morreu com FAILED_PRECONDITION: falta
// o índice COLLECTION_GROUP de `notifications.fromUid`. É best-effort (não aborta a fusão),
// e por isso passou despercebido — mas significa que ele NUNCA rodou em fusão nenhuma:
// notificação enviada pela conta absorvida seguia apontando pro uid morto, e o nome/foto do
// remetente deixava de resolver na caixa de terceiros.
(() => {
  const fs = require('fs'), path = require('path');
  const idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firestore.indexes.json'), 'utf8'));
  const ov = (idx.fieldOverrides || []).find(f => f.collectionGroup === 'notifications' && f.fieldPath === 'fromUid');
  ok('firestore.indexes.json declara notifications.fromUid', !!ov);
  ok('com escopo COLLECTION_GROUP (é uma query de collectionGroup)',
    !!ov && (ov.indexes || []).some(i => i.queryScope === 'COLLECTION_GROUP' && i.order === 'ASCENDING'));
  // fieldOverride SUBSTITUI a indexação automática do campo: sem redeclarar o escopo
  // COLLECTION, qualquer query normal por fromUid dentro de um usuário pararia de funcionar.
  ok('mantém também o escopo COLLECTION (o override substitui o índice automático)',
    !!ov && (ov.indexes || []).some(i => i.queryScope === 'COLLECTION'));
})();

console.log(fail === 0
  ? '✅ profile-merge-core: ' + pass + ' ok, 0 falharam'
  : '❌ profile-merge-core: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
