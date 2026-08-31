/* CONVITE AVULSO DE TORNEIO É SERVER-ONLY — autorização, validação e template fixo
 * node tests/convite-de-torneio-server-only.test.js
 *
 * O QUE HAVIA (inventário L1.2, a superfície cliente de maior risco):
 *   · js/views/tournaments-sharing.js chamava `queueEmail(email, subject, html)` com o
 *     endereço vindo de um INPUT LIVRE, validado por `email.indexOf('@') === -1`;
 *   · assunto e corpo montados no CLIENTE;
 *   · a UI do campo vivia em tournaments.js dentro de `if (tournamentId)` e ANTES de
 *     `if (isOrg)` — sem gate de organizador;
 *   · firestore.rules permite `write` em /mail a qualquer autenticado.
 * Somados: qualquer pessoa logada mandava e-mail arbitrário, do remetente do produto, para
 * qualquer endereço. Não era convite — era um relay aberto.
 *
 * ⚠️ ESTA capability aceita um endereço do cliente, e é decisão: o convidado NÃO TEM CONTA,
 * então não há uid a resolver. O que a segura é o conjunto — autorização de organizador,
 * cota diária, cooldown por destinatário e corpo fixo no servidor. Este arquivo trava as
 * partes decidíveis offline; a corrida e a cota sob concorrência estão em
 * tests/concurrency/run.js, contra o emulador.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const CORE = path.join(RAIZ, 'functions', 'tournament-invite-core.js');
const RESERVA = path.join(RAIZ, 'functions', 'tournament-invite-reserva.js');
const C = require(CORE);
const PERM = require(path.join(RAIZ, 'functions', 'partes-permissao.js'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

console.log('\n① validação do e-mail: o que o cliente aceitava e o servidor recusa\n');
{
  /* ⛔ Cada um destes PASSAVA no `indexOf('@') === -1` do cliente. */
  const passavamAntes = [
    ['a@b', 'domínio sem ponto'],
    ['x@y z.com', 'espaço no meio'],
    ['a@b.com,c@d.com', 'vírgula = múltiplos destinatários em alguns relays'],
    ['a@b.com;c@d.com', 'ponto-e-vírgula'],
    ['a@b.com\nBcc: x@y.com', '⛔ QUEBRA DE LINHA = injeção de cabeçalho SMTP'],
    ['a@b.com\r\nSubject: outro', '⛔ CRLF'],
    ['"nome" <a@b.com>', 'formato com display name'],
    ['@b.com', 'sem parte local'],
    ['a@', 'sem domínio'],
    ['a@@b.com', 'duas arrobas'],
    ['a..b@c.com', 'ponto duplo na parte local'],
    ['.a@b.com', 'começa com ponto'],
    ['a@-b.com', 'domínio começa com hífen'],
    ['a@b..com', 'ponto duplo no domínio'],
    ['a@b.c', 'TLD de 1 letra'],
    ['a@b.123', 'TLD numérico'],
    ['a'.repeat(65) + '@b.com', 'parte local > 64'],
    ['a@' + 'b'.repeat(250) + '.com', 'endereço > 254']
  ];
  passavamAntes.forEach(([e, porque]) => {
    const aceitoAntes = String(e).indexOf('@') !== -1;   // a régua do cliente
    ok(aceitoAntes && !C.emailValido(e), '⛔ recusa "' + String(e).slice(0, 28).replace(/[\r\n]/g, '\\n') + '" — ' + porque);
  });
  ['a@b.com', 'Nome.Sobrenome+tag@sub.dominio.com.br', 'x_y-z@a-b.co'].forEach((e) => {
    ok(C.emailValido(e), 'aceita endereço legítimo: ' + e);
  });
  ok(C.normalizaEmail('  A@B.COM  ') === 'a@b.com', 'normaliza caixa e espaços das pontas');
}

console.log('\n② autorização: a régua é a CANÔNICA, não uma cópia\n');
{
  const idx = fs.readFileSync(path.join(RAIZ, 'functions', 'index.js'), 'utf8');
  const fn = idx.slice(idx.indexOf('exports.sendTournamentInvite'), idx.indexOf('exports.requestSecondaryEmail'));
  ok(/_partesPerm\.ehOrganizador\(t, callerUid\)/.test(fn),
    '⭐ usa `_partesPerm.ehOrganizador` — a mesma de `aplicarNoTorneio`');
  ok(/throw new HttpsError\("permission-denied"/.test(fn), '   e recusa com permission-denied');
  ok(/const callerUid = request\.auth && request\.auth\.uid;[\s\S]{0,120}unauthenticated/.test(fn),
    'exige login antes de qualquer coisa');
  ok(!/creatorUid ===|coHosts\.some/.test(fn),
    '⛔ e NÃO reimplementa o critério aqui (autorização em dois lugares diverge em silêncio)');

  /* a régua canônica, exercitada: co-organizador tem o MESMO poder */
  const t = { creatorUid: 'dono', adminUids: ['admin1'], coHosts: [{ uid: 'co1', status: 'active' }, { uid: 'co2', status: 'accepted' }, { uid: 'co3', status: 'pending' }] };
  ok(PERM.ehOrganizador(t, 'dono') === true, 'criador pode');
  ok(PERM.ehOrganizador(t, 'admin1') === true, 'adminUids pode');
  ok(PERM.ehOrganizador(t, 'co1') === true, 'co-host ativo pode');
  ok(PERM.ehOrganizador(t, 'co2') === true, 'co-host aceito pode');
  ok(PERM.ehOrganizador(t, 'co3') === false, '⛔ co-host PENDENTE não pode');
  ok(PERM.ehOrganizador(t, 'estranho') === false, '⛔ estranho não pode');
}

console.log('\n③ o cliente não monta assunto nem HTML\n');
{
  const idx = fs.readFileSync(path.join(RAIZ, 'functions', 'index.js'), 'utf8');
  const fn = idx.slice(idx.indexOf('exports.sendTournamentInvite'), idx.indexOf('exports.requestSecondaryEmail'));
  /* ⚠️ `\b` no fim não é enfeite: sem ele, `to` casa dentro de `request.data.tournamentId`
   * e a asserção reprova o código CERTO. Foi o que aconteceu na primeira versão. */
  ok(!/request\.data\.(subject|html|to|message)\b/.test(fn), '⛔ a Function não lê subject/html/to/message do cliente');
  ok(/request\.data && request\.data\.tournamentId/.test(fn) && /request\.data && request\.data\.email/.test(fn),
    '   os únicos campos aceitos são tournamentId e email');

  const share = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'tournaments-sharing.js'), 'utf8');
  const codigo = share.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(!/queueEmail\(/.test(codigo), '⭐ o cliente não chama mais queueEmail neste fluxo');
  ok(!/mailto:/.test(codigo), '⛔ e o fallback `mailto:` saiu — era caminho que ignorava autorização e cota');
  ok(/_callFn\('sendTournamentInvite'/.test(codigo), '   passou a chamar a capability');
  ok(!/_emailTemplate\(/.test(codigo), '   e não monta mais o corpo');

  /* o corpo vem do TORNEIO canônico, escapado */
  const m = C.montaEmail({ email: 'X@Y.com', tournamentId: 't1', tournamentName: '<b>Torneio</b>', inviterName: '<script>x</script>', venue: 'Clube', dateText: '02/09/2026', agora: 1 });
  ok(m.to[0] === 'x@y.com', 'destinatário normalizado');
  ok(m.message.subject === 'Convite para o torneio: <b>Torneio</b>', 'assunto fixo, montado do nome do torneio');
  ok(m.message.html.indexOf('<script>') === -1, '⛔ nada de HTML de terceiro escapa pro corpo');
  ok(m.message.html.indexOf('&lt;script&gt;') !== -1, '   (o nome do convidante entra escapado)');
  ok(m.message.html.indexOf('scoreplace.app/#tournaments/t1') !== -1, '⭐ a URL é montada no servidor a partir do id');
  ok(m.replyTo === 'contato@barthlabs.com', 'replyTo do projeto');
}

console.log('\n④ chaves: cota por dia, cooldown por destinatário, outbox determinístico\n');
{
  const T0 = Date.parse('2026-08-31T23:00:00Z');
  ok(C.LIMITE_DIARIO === 20, 'limite diário = 20');
  ok(C.COOLDOWN_MS === 2 * 60 * 1000, 'cooldown = 2 min');
  ok(C.diaDe(T0) === '2026-08-31', 'o dia é UTC (o servidor não tem o fuso da pessoa)');
  ok(C.chaveDeCota('u', 't', T0) !== C.chaveDeCota('u', 't', T0 + 2 * 3600 * 1000),
    '⭐ a cota vira no dia seguinte (chave muda)');
  ok(C.chaveDeCota('u', 't1', T0) !== C.chaveDeCota('u', 't2', T0), 'cota é por TORNEIO');
  ok(C.chaveDeCota('u1', 't', T0) !== C.chaveDeCota('u2', 't', T0), 'e por ORGANIZADOR');
  ok(C.chaveDeCooldown('u', 't', 'a@b.com') === C.chaveDeCooldown('u', 't', 'A@B.COM'),
    'cooldown ignora a caixa do e-mail (senão bastaria trocar maiúscula pra furar)');
  ok(C.chaveDeCooldown('u', 't', 'a@b.com') !== C.chaveDeCooldown('u', 't', 'c@d.com'),
    'e é por destinatário');
  const k = C.chaveDeCooldown('u', 't', 'a@b.com');
  ok(C.mailDocIdDoConvite(k, 1) === C.mailDocIdDoConvite(k, 1), 'id do outbox é estável para a mesma reserva');
  ok(C.mailDocIdDoConvite(k, 1) !== C.mailDocIdDoConvite(k, 2), '   e diferente para outra');
  ok(/^tinv_[0-9a-f]{40}$/.test(C.mailDocIdDoConvite(k, 1)), '   e tem prefixo próprio (tinv_)');
}

console.log('\n⑤ a reserva é atômica e não usa tx.create\n');
{
  const res = fs.readFileSync(RESERVA, 'utf8');
  ok(/db\.runTransaction\(/.test(res), 'as escritas vivem numa transação');
  const tx = res.slice(res.indexOf('return db.runTransaction('));
  ok(/tx\.get\(cdRef\)/.test(tx) && /tx\.get\(cotaRef\)/.test(tx),
    '⭐ LÊ cooldown e cota dentro dela — é isso que serializa as concorrentes');
  ok(tx.indexOf('tx.get(') < tx.indexOf('tx.set('), '   e todas as leituras vêm antes das escritas');
  ok(/tx\.set\(db\.collection\('mail'\)\.doc\(mailId\)/.test(tx), '   o outbox é escrito na MESMA transação');
  ok(!/tx\.create\(/.test(res), '⛔ tx.set e não tx.create (create não existe no SDK compat do teste de concorrência)');
  ok(/const mailId = core\.mailDocIdDoConvite\(chaveCd, agora\);[\s\S]{0,200}return db\.runTransaction/.test(res),
    '⭐ o id do outbox nasce FORA da transação (dentro, a re-execução mudaria o id)');
  ok(/enviados: usados \+ 1/.test(tx), 'a cota é gravada a partir do valor LIDO na transação');
}

console.log('\n⑥ a UI esconde o campo de quem não é organizador\n');
{
  const tj = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'tournaments.js'), 'utf8');
  ok(/window\._isUserOrgOrCoHost\(t, window\.AppStore\.currentUser\)\) \? `[\s\S]{0,600}invite-email-/.test(tj),
    '⭐ o bloco de convite por e-mail só é renderizado para organizador/co-organizador');
  ok(/A autoridade\s*\n\s*final e a Function sendTournamentInvite/.test(tj),
    '   e o comentário registra que esconder NÃO é a defesa — a Function é');
}

console.log('\n⑦ /mail FECHADO (L1.2) — a dívida de F1/F2 foi paga na L1.1\n');
{
  const rules = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');
  /* ⚠️ TERCEIRA VIRADA DESTA ASSERÇÃO, e cada uma foi honesta no seu momento: 2.1.69
   * registrava que /mail seguia aberto (dívida daquele escopo), 2.1.75 registrava a
   * mesma coisa com F1/F2 já migrados, e a L1.2 (2.1.77) FECHOU. Uma asserção que
   * afirma a dívida vira mentira no dia em que a dívida é paga.
   * ⛔ A prova de COMPORTAMENTO das rules não é esta linha — é
   * tests/rules-mail-server-only.test.js, que dirige o emulador. Aqui só se trava o texto
   * pra ninguém reabrir a porta sem passar por lá. */
  ok(/match \/mail\/\{mailId\} \{[\s\S]{0,80}allow read, write: if false;/.test(rules),
    '⭐ /mail é server-only: `allow read, write: if false` (comportamento provado em rules-mail-server-only)');
  /* ⚠️ ESTA ASSERÇÃO MUDOU DE LADO, DE PROPÓSITO. Na 2.1.69 ela AFIRMAVA que os writers
   * de F1/F2 seguiam intactos — era o registro honesto da dívida que aquele escopo
   * mandava preservar. A L1.1 (2.1.75) pagou a dívida: os dois viraram capability de
   * servidor. Deixar a asserção antiga seria travar o repositório no defeito. */
  const org = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'tournaments-organizer.js'), 'utf8');
  ok(!/queueEmail\(channelResult\.emails/.test(org),
    '⭐ os writers de F1/F2 SAÍRAM na L1.1 — ver tests/convites-dupla-e-coorg-server-only.test.js');
  const db = fs.readFileSync(path.join(RAIZ, 'js', 'firebase-db.js'), 'utf8');
  ok(!/async queueEmail\s*\(/.test(db),
    '⭐ e a porta `queueEmail` deixou de existir no cliente');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
process.exitCode = fail ? 1 : 0;
