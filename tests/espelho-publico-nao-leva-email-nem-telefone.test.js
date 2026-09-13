'use strict';
/* ⛔ O ESPELHO PÚBLICO NÃO LEVA E-MAIL NEM TELEFONE.
 *
 * MEDIDO em 13/set/2026, na coleção `users` de produção: **279 perfis, 94 campos distintos,
 * 260 e-mails, 180 celulares, 101 datas de nascimento** — e a regra é
 * `allow read: if request.auth != null`. Qualquer pessoa logada lê o documento INTEIRO de
 * qualquer outra, inclusive os **131 perfis que marcaram "não mostrar meu e-mail"**.
 *
 * ⛔ E não há regra que conserte: as Rules do Firestore autorizam DOCUMENTO, não projetam
 * CAMPO. A saída é MOVER o dado — `usersPublic/{uid}` leva o que a tela de terceiro precisa
 * e deixa o resto para trás.
 *
 * ⭐ A LISTA É DE PERMISSÃO, não de veto. Campo novo no perfil nasce PRIVADO por padrão;
 * lista de negação esquece justamente o campo que ainda não existe.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const C = require(path.join(raiz, 'functions/perfil-publico-core.js'));
const FN = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(raiz, 'firestore.rules'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// Um perfil com TUDO o que a produção tem de sensível, para o espelho ter o que descartar.
const perfilCheio = {
  displayName: 'Fulana', displayName_lower: 'fulana', photoURL: 'https://x/y.jpg',
  gender: 'F', skillBySport: { beach_tennis: 'B' }, defaultCategory: 'B',
  birthDate: '1985-04-02', acceptFriendRequests: true, preferredSports: ['beach_tennis'],
  mergedInto: null, lastSeenAt: 111, updatedAt: 222,
  // ⛔ nada abaixo desta linha pode aparecer no espelho
  email: 'fulana@exemplo.invalid', email_lower: 'fulana@exemplo.invalid',
  phone: '+5511999999999', phoneCountry: 'BR', phoneSetBy: 'org', phoneSource: 'organizador',
  phoneSetAt: 333, linkedEmails: ['outra@exemplo.invalid'], linkedPhones: ['+5511888888888'],
  linkedUids: ['uidX'], fcmToken: 'token-de-push', preferredCeps: ['01310-000'],
  accountEmailSig: 'sig', emailVerified: true, omitEmail: true, omitPhone: true, plan: 'pro',
};

// ── ① o espelho descarta TODO campo sensível ────────────────────────────────
const esp = C.perfilPublico(perfilCheio);
C.NUNCA_PUBLICO.forEach((k) => {
  must(!(k in esp), '① ⛔ `' + k + '` não entra no espelho');
});
must(!JSON.stringify(esp).includes('exemplo.invalid'), '① ⭐ nenhum e-mail sobrevive, nem dentro de lista');
must(!JSON.stringify(esp).includes('+55'), '① ⭐ nenhum telefone sobrevive');
must(!JSON.stringify(esp).includes('token-de-push'), '① ⭐ nem o token de notificação');

// ── ② e leva o que a tela de terceiro precisa ───────────────────────────────
['displayName', 'photoURL', 'gender', 'skillBySport', 'defaultCategory'].forEach((k) => {
  must(esp[k] !== undefined, '② `' + k + '` continua disponível — é o que a chave e a busca mostram');
});
must(C.CAMPOS_PUBLICOS.indexOf('mergedInto') >= 0,
  '② ⭐ `mergedInto` entra: sem ele a lápide volta a parecer pessoa na tela');
must(C.CAMPOS_PUBLICOS.indexOf('birthDate') >= 0,
  '② `birthDate` entra por decisão consciente — o desempate por idade lê a de OUTROS jogadores');

// ── ③ a lista é de PERMISSÃO: campo novo nasce privado ──────────────────────
const comCampoNovo = Object.assign({}, perfilCheio, { campoQueNinguemPreviu: 'segredo' });
must(!('campoQueNinguemPreviu' in C.perfilPublico(comCampoNovo)),
  '③ ⭐ campo que ninguém previu NÃO vaza — a lista é de permissão, não de veto');
C.NUNCA_PUBLICO.forEach((k) => {
  must(C.CAMPOS_PUBLICOS.indexOf(k) === -1, '③ ⛔ `' + k + '` não está na lista de permissão');
});

// ── ④ não reescreve o espelho à toa ─────────────────────────────────────────
must(C.espelhoPrecisaMudar(null, perfilCheio) === true, '④ perfil novo ⇒ espelha');
must(C.espelhoPrecisaMudar(perfilCheio, perfilCheio) === false, '④ nada mudou ⇒ não reescreve');
must(C.espelhoPrecisaMudar(perfilCheio, Object.assign({}, perfilCheio, { lastSeenAt: 999 })) === false,
  '④ ⭐ só o carimbo de presença mudou ⇒ NÃO reescreve (senão o espelho reescreveria a cada abertura do app)');
must(C.espelhoPrecisaMudar(perfilCheio, Object.assign({}, perfilCheio, { phone: '+5511777777777' })) === false,
  '④ ⛔ mudar o TELEFONE não mexe no espelho — ele nem sabe que telefone existe');
must(C.espelhoPrecisaMudar(perfilCheio, Object.assign({}, perfilCheio, { displayName: 'Outra' })) === true,
  '④ mudar o NOME reescreve, que é o ponto');

// ── ⑤ a fiação: um escritor só, e ele apaga junto ───────────────────────────
const i = FN.indexOf('exports.espelhoDoPerfilPublico');
assert.ok(i > 0, 'âncora: o gatilho do espelho');
const fim = FN.indexOf('\nexports.', i + 10);
const gat = semComentario(FN.slice(i, fim > i ? fim : FN.length));
must(/collection\("usersPublic"\)\.doc\(uid\)/.test(gat), '⑤ o gatilho escreve no espelho por uid');
must(/_perfilPublico\.perfilPublico\(depois\)/.test(gat), '⑤ e grava só a projeção, nunca o perfil cru');
must(/espelhoRef\.delete\(\)/.test(gat),
  '⑤ ⭐ perfil apagado ⇒ espelho some junto (espelho órfão é gente que não existe mais aparecendo na busca)');
must(/espelhoPrecisaMudar\(antes, depois\)/.test(gat), '⑤ e a porta que evita reescrita à toa está ligada');
const escritores = (FN.match(/collection\("usersPublic"\)/g) || []).length;
must(escritores === 1, '⑤ ⛔ UM escritor só no servidor — duas autoridades sobre a mesma projeção já custou caro (achei ' + escritores + ')');

// ── ⑥ a Rule: lê quem está logado, escreve ninguém ──────────────────────────
const iR = RULES.indexOf('match /usersPublic/{uid}');
assert.ok(iR > 0, 'âncora: a regra do espelho');
// ⛔ ÂNCORA, não o primeiro `}`: o primeiro fecha o `{uid}` do próprio caminho, não o bloco.
const bloco = RULES.slice(iR, RULES.indexOf('match /', iR + 10));
must(/allow read: if request\.auth != null;/.test(bloco), '⑥ lê quem está logado');
must(/allow write: if false;/.test(bloco), '⑥ ⛔ escrita NEGADA a todos — quem mantém é a Function, pelo Admin SDK');

// ── ⑦ CONTROLE DE ESCOPO: `users` NÃO foi fechado nesta leva ────────────────
const iU = RULES.indexOf('match /users/{userId}');
const blocoU = RULES.slice(iU, RULES.indexOf('match /', iU + 10));
must(/allow read: if request\.auth != null;/.test(blocoU),
  '⑦ ⛔ `users` segue legível por autenticado — DE PROPÓSITO: o bundle das lojas lê `users` '
  + 'direto, e fechar antes de uma nativa publicada cortaria quem está na loja');

// ── ⑧ o CLIENTE lê o espelho para gente desconhecida ───────────────────────
const DB = fs.readFileSync(path.join(raiz, 'js/firebase-db.js'), 'utf8');
must(/window\._COLECAO_PERFIL_PUBLICO = 'usersPublic';/.test(DB),
  '⑧ o nome da coleção mora numa constante só');
const lidasDoEspelho = (DB.match(/collection\(window\._COLECAO_PERFIL_PUBLICO\)/g) || []).length;
must(lidasDoEspelho >= 6,
  '⑧ ⭐ as leituras de gente desconhecida vêm do espelho (' + lidasDoEspelho + ')');
must(!/collection\('users'\)\.limit\(2000\)/.test(DB),
  '⑧ ⛔ sumiu a varredura de 2000 perfis INTEIROS — era a maior exposição da coleção');
must(!/collection\('users'\)\.where\('displayName_lower'/.test(DB),
  '⑧ ⛔ e a busca por nome não lê mais o documento cheio');
/* ⛔ CONTROLE DE ESCOPO: `loadUserProfile` NÃO foi trocada. Ela serve também ao PRÓPRIO
 * perfil, que precisa dos campos privados, e tem 93 chamadas a separar uma a uma. */
must(/var doc = await this\.db\.collection\('users'\)\.doc\(uid\)\.get\(\);/.test(DB),
  '⑧ ⛔ `loadUserProfile` segue em `users` — é a leva seguinte, e mexer nela agora seria '
  + 'trocar 93 chamadas sem separar o próprio perfil do alheio');

// ── ⑧b a ficha de TERCEIRO na tela vem do espelho ──────────────────────────
must(/async carregarPerfilPublico\(uid\)/.test(DB),
  '⑧b existe a porta para ficha de terceiro, separada da do próprio perfil');
const iCP = DB.indexOf('async carregarPerfilPublico(uid)');
const corpoCP = DB.slice(iCP, DB.indexOf('async loadUserProfile(uid)'));
must(/collection\(window\._COLECAO_PERFIL_PUBLICO\)\.doc\(uid\)/.test(corpoCP),
  '⑧b ela lê o espelho');
must(!/collection\('users'\)/.test(corpoCP),
  '⑧b ⛔ e NÃO cai para `users` quando o espelho falta — a queda anularia a leva inteira: '
  + 'bastaria o espelho sumir para o app voltar a baixar a ficha cheia, calado');

const BU = fs.readFileSync(path.join(raiz, 'js/views/bracket-ui.js'), 'utf8');
must(!/FirestoreDB\.loadUserProfile\(/.test(BU),
  '⑧b ⭐ a chave não pede mais o documento cheio de ninguém (eram 4 chamadas)');
must((BU.match(/carregarPerfilPublico\(/g) || []).length === 4,
  '⑧b e as quatro passaram para o espelho');

/* ⛔ CONTROLE DE ESCOPO — o que NÃO foi trocado, e por quê, MEDIDO:
 *  • `explore.js` mostra o E-MAIL no lugar do nome de quem não tem nome, e ordena por ele.
 *    Trocar mudaria o que aparece na tela — decisão do dono, não minha.
 *  • `tournaments.js` casa inscrito por e-mail (`profile.email`).
 *  • `tournaments-organizer.js` resolve o e-mail do DESTINATÁRIO para mandar a notificação —
 *    sai quando a fila de e-mail migrar para o servidor (a leva L2). */
const EXP = fs.readFileSync(path.join(raiz, 'js/views/explore.js'), 'utf8');
must(/loadUserProfile\(/.test(EXP),
  '⑧b ⛔ `explore` segue no documento cheio — ele usa o e-mail como NOME de quem não tem nome');

// ── ⑨ o espelho tem o que as consultas FILTRAM e ORDENAM ───────────────────
['displayName_lower', 'createdAt', 'updatedAt', 'acceptFriendRequests'].forEach((k) => {
  must(C.CAMPOS_PUBLICOS.indexOf(k) >= 0,
    '⑨ `' + k + '` está no espelho — sem ele a consulta que o usa devolve vazio');
});

console.log('\n✅ espelho público não leva e-mail nem telefone — ' + ok + ' verificações');
