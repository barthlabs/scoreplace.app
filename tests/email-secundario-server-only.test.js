/* E-MAIL SECUNDÁRIO É SERVER-ONLY — token, hash, uso único e vínculo pelo dono do PEDIDO
 * node tests/email-secundario-server-only.test.js
 *
 * O QUE HAVIA ANTES (2.1.64 e anteriores), tudo no cliente:
 *   · js/views/auth.js gerava o token com `Math.random()` — não é CSPRNG;
 *   · o token ia CRU pro banco como ID de `emailVerifications/{token}`;
 *   · firestore.rules dava `allow read: if true` naquela coleção — o token só é segredo se
 *     ninguém mais puder lê-lo, e ali dava pra LISTAR e colher token válido dos outros;
 *   · `allow update: if true` deixava qualquer um, inclusive anônimo, marcar `verified`;
 *   · a vinculação era `users/{ownerUid}.update({ linkedEmails })` feito pelo cliente, em
 *     passos SEPARADOS da marca de uso.
 *
 * ⚠️ POR QUE ISSO É GRAVE, e não cosmético: `linkedEmails` é PROVA DE POSSE de conta.
 * `functions/index.js` aceita `via: "email-vinculado"` como prova numa fusão, e
 * `_uidByProfileEmail` resolve LOGIN por ele. Escrever ali é mexer em quem entra na conta.
 *
 * ⛔ O QUE ESTE TESTE **NÃO** COBRA, e é decisão registrada: unicidade entre contas. Essa
 * regra NÃO existe no repositório hoje — nem no cliente (só compara com o e-mail principal e
 * a lista do próprio usuário), nem em Function alguma. A leva mandou não inventá-la.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CORE = path.join(RAIZ, 'functions', 'secondary-email-core.js');
const C = require(CORE);

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

const UID = 'uidDono', OUTRO = 'uidOutro';
const AGORA = Date.parse('2026-08-31T12:00:00Z');

console.log('\n① token: CSPRNG no servidor, e o banco só vê o hash\n');
{
  const t1 = C.novoToken(), t2 = C.novoToken();
  ok(t1 !== t2, 'dois tokens seguidos são diferentes');
  ok(t1.length >= 40, 'token tem ' + t1.length + ' chars (32 bytes em base64url)');
  ok(!/^[0-9a-z]{1,12}$/.test(t1), '⛔ não tem a cara do antigo (Math.random().toString(36))');
  const h = C.hashToken(t1);
  ok(/^[0-9a-f]{64}$/.test(h), 'o id do documento é sha256 hex de 64 chars');
  ok(C.hashToken(t1) === h, 'o hash é estável para o mesmo token');
  ok(C.hashToken(t2) !== h, 'e diferente para outro token');
  const reg = C.novoRegistro({ uid: UID, email: 'A@Exemplo.COM', agora: AGORA });
  ok(JSON.stringify(reg).indexOf(t1) === -1, '⭐ o registro gravado NÃO contém o token');
  ok(reg.emailToVerify === 'a@exemplo.com', 'o e-mail é normalizado (minúsculas)');
  ok(reg.ownerUid === UID, 'o dono do pedido fica gravado no registro');
  ok(reg.used === false, 'nasce não usado');
  ok(Date.parse(reg.expiresAt) - Date.parse(reg.createdAt) === C.PRAZO_MS, 'expira em 24h');
}

console.log('\n② pedido: validações preservadas + freio de reenvio\n');
{
  const perfil = { email: 'dono@x.com', linkedEmails: ['ja@x.com'] };
  ok(C.decidePedido({ email: 'nao-e-email', perfil: perfil, agora: AGORA }).motivo === 'invalido', 'formato inválido → invalido');
  ok(C.decidePedido({ email: 'DONO@x.com', perfil: perfil, agora: AGORA }).motivo === 'principal', 'o próprio e-mail principal → principal (mesmo com caixa diferente)');
  ok(C.decidePedido({ email: 'JA@x.com', perfil: perfil, agora: AGORA }).motivo === 'ja-vinculado', 'já na lista do próprio usuário → ja-vinculado');
  ok(C.decidePedido({ email: 'novo@x.com', perfil: perfil, agora: AGORA }).ok === true, 'e-mail novo → ok');
  const c1 = C.decidePedido({ email: 'novo@x.com', perfil: perfil, agora: AGORA, ultimoEnvioMs: AGORA - 1000 });
  ok(c1.motivo === 'cooldown', '⭐ reenvio em rajada é barrado (' + Math.round(c1.faltamMs / 1000) + 's restantes)');
  ok(C.decidePedido({ email: 'novo@x.com', perfil: perfil, agora: AGORA, ultimoEnvioMs: AGORA - C.COOLDOWN_MS - 1 }).ok === true,
    'passado o freio, volta a permitir');
  /* ⛔ nenhum motivo pode falar de OUTRA conta */
  const motivos = ['invalido', 'principal', 'ja-vinculado', 'cooldown'];
  ok(motivos.every((m) => !/outra|existe|pertence|em uso/i.test(m)), 'os motivos não expõem se o e-mail é de outra conta');
}

console.log('\n③ confirmação: uso único, expiração e vínculo SEMPRE ao dono do pedido\n');
{
  const base = C.novoRegistro({ uid: UID, email: 'novo@x.com', agora: AGORA });
  ok(C.decideConfirmacao(null, AGORA).motivo === 'invalido', 'token inexistente → invalido');
  const bom = C.decideConfirmacao(base, AGORA + 1000);
  ok(bom.ok === true, 'token válido → ok');
  ok(bom.ownerUid === UID, '⭐ o destino é o ownerUid do REGISTRO...');
  ok(bom.ownerUid !== OUTRO, '   ...e nunca quem clica (invariante 4)');
  ok(bom.email === 'novo@x.com', 'e devolve o e-mail confirmado');
  ok(C.decideConfirmacao(Object.assign({}, base, { used: true }), AGORA + 1000).motivo === 'usado', 'já usado → usado');
  ok(C.decideConfirmacao(Object.assign({}, base, { verified: true }), AGORA + 1000).motivo === 'usado',
    '⚠️ registro ANTIGO (campo `verified`) também conta como usado — link já enviado não vira replay');
  ok(C.decideConfirmacao(base, AGORA + C.PRAZO_MS + 1).motivo === 'expirado', 'depois do prazo → expirado');
  ok(C.decideConfirmacao(Object.assign({}, base, { expiresAt: 'lixo' }), AGORA).motivo === 'invalido', 'expiresAt ilegível → invalido, não passa');
  ok(C.decideConfirmacao(Object.assign({}, base, { ownerUid: '' }), AGORA).motivo === 'invalido', 'registro sem dono → invalido');
}

console.log('\n④ o e-mail é montado no SERVIDOR, com template fixo\n');
{
  const m = C.montaEmail('Alvo@X.com', C.urlDeConfirmacao('tok en/+='));
  ok(Array.isArray(m.to) && m.to[0] === 'alvo@x.com', 'destinatário = o e-mail candidato, normalizado');
  ok(m.message.subject === 'Confirme seu e-mail no scoreplace.app', 'assunto fixo');
  ok(m.message.html.indexOf('scoreplace.app') !== -1, 'corpo é o template do projeto');
  ok(C.urlDeConfirmacao('a b&c').indexOf('a%20b%26c') !== -1, '⛔ o token vai percent-encoded na URL');
  const inj = C.montaEmail('x@y.com', C.urlDeConfirmacao('"><script>alert(1)</script>'));
  ok(inj.message.html.indexOf('<script>') === -1, '⛔ nada de HTML vindo de fora escapa pro corpo');
}

console.log('\n⑤ Rules: o cliente não lê nem escreve emailVerifications\n');
{
  const rules = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
  const bloco = rules.slice(rules.indexOf('match /emailVerifications/'), rules.indexOf('match /emailVerifications/') + 200);
  ok(/allow read, write: if false;/.test(bloco), '⭐ emailVerifications → allow read, write: if false');
  ok(!/allow read: if true/.test(bloco), '⛔ o `read: if true` sumiu');
  ok(!/allow update: if true/.test(bloco), '⛔ o `update: if true` sumiu');
  const bt = rules.slice(rules.indexOf('match /emailVerifyThrottle/'), rules.indexOf('match /emailVerifyThrottle/') + 160);
  ok(/allow read, write: if false;/.test(bt), 'emailVerifyThrottle também é server-only');
  /* ⭐ A dívida que esta linha registrava como "fora desta leva" foi PAGA na L1.2
   * (2.1.77): /mail virou server-only. Comportamento provado contra o emulador em
   * tests/rules-mail-server-only.test.js. */
  ok(/match \/mail\/\{mailId\} \{[\s\S]{0,80}allow read, write: if false;/.test(rules),
    '⭐ /mail é server-only — a fila de e-mail deixou de ser alcançável pelo cliente');
}

console.log('\n⑥ o cliente não escreve mais nada deste fluxo\n');
{
  const auth = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'auth.js'), 'utf8');
  const codigo = auth.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(codigo.indexOf("collection('emailVerifications')") === -1, '⭐ nenhum acesso a emailVerifications em auth.js');
  ok(codigo.indexOf("collection('mail')") === -1, '⭐ nenhum mail/.add em auth.js');
  ok(codigo.indexOf('Math.random') === -1 || !/verify_email|emailVerif/i.test(codigo.slice(Math.max(0, codigo.indexOf('Math.random') - 400), codigo.indexOf('Math.random') + 400)),
    '⛔ nenhum token de verificação nasce de Math.random no cliente');
  ok(/_callFn\('requestSecondaryEmail'/.test(codigo), 'o pedido chama requestSecondaryEmail');
  ok(/httpsCallable\('confirmSecondaryEmail'\)/.test(codigo), 'a confirmação chama confirmSecondaryEmail');
  ok(codigo.indexOf('_checkEmailLinkIntent') === -1, '⛔ o fallback morto de escrita direta foi removido');
  ok(codigo.indexOf('scoreplace_linkEmailIntent') === -1, '   e a chave de localStorage dele também');
}

console.log('\n⑦ as Functions existem, com o contrato certo\n');
{
  const idx = fs.readFileSync(path.join(RAIZ, 'functions', 'index.js'), 'utf8');
  const req = idx.slice(idx.indexOf('exports.requestSecondaryEmail'), idx.indexOf('exports.confirmSecondaryEmail'));
  const con = idx.slice(idx.indexOf('exports.confirmSecondaryEmail'), idx.indexOf('exports.requestEmailMerge'));
  ok(/const callerUid = request\.auth && request\.auth\.uid;[\s\S]{0,120}unauthenticated/.test(req),
    '⭐ requestSecondaryEmail EXIGE autenticação');
  /* ⚠️ L1.1.1 — ESTAS QUATRO MUDARAM DE CASA, não sumiram. Gerar o token, gravar pelo hash,
   * registrar o freio e montar o e-mail saíram do corpo da Function e foram para a RESERVA
   * atômica (`functions/secondary-email-reserva.js`) — que é o que fecha a corrida. Apontar
   * as asserções pro lugar novo preserva a intenção; deixá-las no corpo da CF só provaria
   * que o código não se moveu. */
  const _res = fs.readFileSync(path.join(RAIZ, 'functions', 'secondary-email-reserva.js'), 'utf8');
  ok(/core\.novoToken\(\)/.test(_res) && /core\.hashToken\(token\)/.test(_res), 'gera token e grava pelo hash (na reserva)');
  ok(/emailVerifyThrottle/.test(_res), 'e registra o freio de reenvio (na reserva)');
  ok(/core\.montaEmail\(email, core\.urlDeConfirmacao\(token\)\)/.test(_res), 'o e-mail sai do template do servidor');
  ok(/mailDocIdDaReserva\(chave, agora\)/.test(_res),
    '⭐ e o outbox usa id determinístico em vez de `.add()` — era o `.add()` que duplicava no retry');
  ok(!/request\.data && request\.data\.(html|subject|to)\b/.test(req), '⛔ não aceita html/subject/to do cliente');
  ok(/runTransaction/.test(con), '⭐ confirmSecondaryEmail marca uso e vincula na MESMA transação');
  ok(/dec\.ownerUid/.test(con) && !/request\.auth\.uid/.test(con), '⛔ vincula ao ownerUid do registro, e nem olha o uid de quem chama');
  ok(/used: true/.test(con) && /verified: true/.test(con), 'marca used e verified (compatível com o registro antigo)');
}

console.log('\n⑧ L1.1.1 — a reserva do envio é ATÔMICA\n');
{
  const idx = fs.readFileSync(path.join(RAIZ, 'functions', 'index.js'), 'utf8');
  const req = idx.slice(idx.indexOf('exports.requestSecondaryEmail'), idx.indexOf('exports.confirmSecondaryEmail'));
  ok(/_secReserva\.reservarEnvio\(/.test(req), '⭐ o pedido passa pela reserva atômica');
  ok(!/collection\("emailVerifyThrottle"\)\.doc\(chave\)\.get\(\)/.test(req),
    '⛔ e NÃO lê mais o throttle solto antes de decidir (era a corrida)');
  ok(!/_enqueueMail\(db, _secEmail\.montaEmail/.test(req),
    '⛔ nem enfileira o e-mail fora da transação (o `.add()` duplicava no retry)');

  const res = fs.readFileSync(path.join(RAIZ, 'functions', 'secondary-email-reserva.js'), 'utf8');
  ok(/db\.runTransaction\(/.test(res), '⭐ as escritas vivem numa transação');
  const tx = res.slice(res.indexOf('return db.runTransaction('));
  ok(/tx\.get\(throttleRef\)/.test(tx), '   que LÊ o throttle dentro dela — é isso que serializa as concorrentes');
  /* ⚠️ `throttleRef` é criado FORA da transação (precisa ser lido por `tx.get`), então a
   * escrita dele aparece como `tx.set(throttleRef, …)` e não com o nome da coleção. A 1ª
   * versão desta asserção procurava o nome e reprovou o código CERTO. */
  ok(/tx\.set\(db\.collection\('emailVerifications'\)/.test(tx), '   e escreve `emailVerifications` na MESMA transação');
  ok(/tx\.set\(throttleRef,/.test(tx), '   e o throttle (lido por tx.get logo acima) na MESMA transação');
  ok(/tx\.set\(db\.collection\('mail'\)/.test(tx), '   e o outbox `mail` na MESMA transação');
  ok(!/tx\.create\(/.test(res),
    '⛔ usa tx.set, não tx.create — `create` não existe no SDK compat que o teste de concorrência usa');
  ok(/const token = core\.novoToken\(\);[\s\S]{0,400}return db\.runTransaction/.test(res),
    '⭐ o token e o id do outbox nascem FORA da transação (dentro, a re-execução mudaria o id)');

  const core = fs.readFileSync(CORE, 'utf8');
  ok(/function mailDocIdDaReserva\(chaveThrottle, agoraMs\)/.test(core),
    '⭐ o documento de outbox tem id DETERMINÍSTICO derivado da reserva');
  const C2 = require(CORE);
  ok(C2.mailDocIdDaReserva('k', 1) === C2.mailDocIdDaReserva('k', 1), '   estável para a mesma reserva');
  ok(C2.mailDocIdDaReserva('k', 1) !== C2.mailDocIdDaReserva('k', 2), '   e diferente para outra');
  ok(C2.mailDocIdDaReserva('k', 1) !== C2.mailDocIdDaReserva('j', 1), '   e diferente para outro par uid+e-mail');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
process.exitCode = fail ? 1 : 0;
