/* CONVITE DE DUPLA E DE CO-ORGANIZAÇÃO SAEM DO CLIENTE  (L1.1, 2.1.75)
 *   node tests/convites-dupla-e-coorg-server-only.test.js
 *
 * ⛔ O QUE ESTAVA ABERTO, e foi inventariado na L1.P0 sobre o HEAD 7182b202:
 *   · `firestore.rules:/mail` aceita `write: if request.auth != null`;
 *   · a ÚNICA porta cliente era `FirestoreDB.queueEmail(to, subject, html)` →
 *     `.add()` em `/mail`, com destinatário, ASSUNTO e HTML vindos de quem chamou;
 *   · F1 (`pair_invite`) e F2 (`cohost_invite`) montavam tudo no navegador em
 *     `js/views/tournaments-organizer.js:_dispatchChannels`;
 *   · F3 era o fallback legado do digest, chamando a mesma porta.
 * Somados: qualquer pessoa logada mandava e-mail arbitrário, do remetente do produto,
 * pra qualquer endereço. Não é convite — é relay.
 *
 * ⭐ A AUTORIZAÇÃO AGORA É O CONVITE PERSISTIDO, não um campo do payload:
 *   · dupla → existe `pairRequests[]` com `inviterUid === quem chama`;
 *   · co-org → quem chama é organizador/co-host ativo E o alvo está em `coHosts[]`
 *     com `status === 'pending'`.
 * Mentir no payload não abre caminho: sem registro, recusa.
 *
 * ⭐ E A IDEMPOTÊNCIA SAI DA IDENTIDADE DO CONVITE, não do instante da chamada — é isso
 * que faz o retry não duplicar E o convite novo depois de uma recusa poder sair.
 *
 * ⚠️ ESTA LEVA NÃO FECHA A RULE de `/mail` — de propósito, e o §7 registra isso.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
/* ⛔ ENVELOPE QUE NÃO EXPLODE. Contra a árvore ANTERIOR à L1.1 este módulo não existe, e
 * um `MODULE_NOT_FOUND` na linha 29 esconde as outras 67 asserções — o controle tem que
 * LISTAR o que falha, não morrer. Mesma regra do sw-abre-sem-tela-branca. */
let C;
try { C = require(path.join(RAIZ, 'functions', 'invite-email-core.js')); }
catch (e) {
  const ausente = () => 'AUSENTE';
  C = new Proxy({}, { get: () => ausente });
}

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }

/* Idem: contra a árvore anterior o núcleo devolve o sentinela, e ler `.message` dele
 * derrubaria a suíte no meio. Aqui o formato mínimo mantém o teste vivo — e VERMELHO. */
const doc = (x) => (x && x.message) ? x : { to: [], message: { subject: 'AUSENTE', html: '', text: '' } };

const SRC_IDX = fs.readFileSync(path.join(RAIZ, 'functions', 'index.js'), 'utf8');
const SRC_DB = fs.readFileSync(path.join(RAIZ, 'js', 'firebase-db.js'), 'utf8');
const SRC_ORG = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'tournaments-organizer.js'), 'utf8');
const SRC_DRAW = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'tournaments-draw.js'), 'utf8');
const SRC_HT = fs.readFileSync(path.join(RAIZ, 'js', 'views', 'host-transfer.js'), 'utf8');
const RULES = fs.readFileSync(path.join(RAIZ, 'firestore.rules'), 'utf8');

/* ── §1 · NENHUM WRITER CLIENTE ─────────────────────────────────────────────── */
console.log('\n§1 O CLIENTE NÃO ESCREVE MAIS EM /mail');
{
  /* Varre js/ inteiro. ⚠️ Comentário não conta: a busca crua acusaria a própria nota
   * histórica que explica o defeito, e um teste que se acusa sozinho é um teste que
   * alguém desliga. Tira comentário antes de procurar. */
  const semComentarios = (txt) => txt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const arquivos = [];
  (function anda(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) { if (d.name !== 'node_modules') anda(p); }
      else if (d.name.endsWith('.js')) arquivos.push(p);
    });
  })(path.join(RAIZ, 'js'));
  ok(arquivos.length > 40, 'a varredura leu js/ inteiro (' + arquivos.length + ' arquivos)');

  const comMail = arquivos.filter((p) => /collection\(\s*['"]mail['"]\s*\)/.test(semComentarios(fs.readFileSync(p, 'utf8'))));
  ok(comMail.length === 0,
    '⭐ ZERO arquivos em js/ escrevem `collection(\'mail\')`' + (comMail.length ? ' — achei: ' + comMail.join(', ') : ''));

  const comQueue = arquivos.filter((p) => /\bqueueEmail\s*\(/.test(semComentarios(fs.readFileSync(p, 'utf8'))));
  ok(comQueue.length === 0,
    '⭐ e ninguém chama `queueEmail(` ' + (comQueue.length ? '— achei: ' + comQueue.join(', ') : ''));
  ok(!/async queueEmail\s*\(/.test(SRC_DB), '⭐ `queueEmail` deixou de EXISTIR em js/firebase-db.js');
  ok(/async sendPairInviteEmail\s*\(/.test(SRC_DB) && /async sendCoHostInviteEmail\s*\(/.test(SRC_DB),
    '  → e no lugar dela há os dois envelopes que só mandam identificadores');
  ok(/_callFn\('sendPairInviteEmail', \{\s*\n?\s*tournamentId: String\(tournamentId\), inviteeUid: String\(inviteeUid\)/.test(SRC_DB)
     || /_callFn\('sendPairInviteEmail'/.test(SRC_DB),
    '  → o envelope de dupla manda SÓ tournamentId + inviteeUid');
}

console.log('\n§1b OS RAMOS F1/F2/F3 NÃO MONTAM MAIS E-MAIL');
{
  const i1 = SRC_ORG.indexOf("templateType === 'pair_invite'");
  const ramo1 = SRC_ORG.slice(i1, i1 + 900);
  ok(i1 > 0 && !/queueEmail|<a href=|subject/i.test(ramo1),
    '⭐ o ramo `pair_invite` não monta HTML nem envia (só evita o digest)');
  const i2 = SRC_ORG.indexOf("templateType === 'cohost_invite'");
  const ramo2 = SRC_ORG.slice(i2, i2 + 900);
  ok(i2 > 0 && !/queueEmail|<a href=|subject/i.test(ramo2),
    '⭐ o ramo `cohost_invite` idem');
  ok(/return; \/\/ não cai no digest/.test(ramo1) && /return; \/\/ não cai no digest/.test(ramo2),
    '⚠️ e os dois SEGUEM fora do digest — senão a pessoa recebe a mesma coisa duas vezes');
  /* ⚠️ A asserção é a CHAMADA EXATA que existia — `queueEmail(channelResult.emails, …)`.
   * A primeira versão media a distância entre o `if` e a chamada (400 chars) e passava
   * contra a árvore ANTIGA, onde o defeito estava: janela curta demais. Teste que passa
   * no código defeituoso não trava nada. */
  ok(!/queueEmail\(channelResult\.emails/.test(SRC_ORG),
    '⭐ F3: o fallback legado não chama mais `queueEmail(channelResult.emails, …)`');
  ok(/queueNotifEmail indisponível/.test(SRC_ORG),
    '  → e a falta de `queueNotifEmail` vira AVISO observável, não um writer aberto');
}

console.log('\n§1c O DISPARO SAI DA ORIGEM, depois de o convite estar gravado');
{
  ok(/saveTournament\(t\)\)\.then[\s\S]{0,2600}sendPairInviteEmail\(String\(t\.id\), uid2\)/.test(SRC_DRAW),
    '⭐ dupla: só depois do `saveTournament` confirmar (é o registro que autoriza)');
  /* ⚠️ MEDIR PROXIMIDADE NO TEXTO ERA UMA MEDIDA RUIM — e a L1.1.1 provou: a distância
   * mudou e a asserção quebrou sem que nada de errado tivesse acontecido. Pior, ela
   * passava na 2.1.75, onde a ORDEM estava ERRADA (`mutate` sem `await`). O que importa é
   * a ESTRUTURA: a chamada mora dentro do `.then` da promessa da gravação. E a prova de
   * ORDEM DE EXECUÇÃO, que texto nenhum dá, está em
   * tests/convite-so-anuncia-depois-de-gravar.test.js. */
  const _iMutate = SRC_HT.indexOf('Promise.resolve(window.AppStore.mutate(tId');
  const _iThen = SRC_HT.indexOf('.then(function () {', _iMutate);
  const _iChamada = SRC_HT.indexOf('sendCoHostInviteEmail(String(t.id), String(target.uid))');
  ok(_iMutate > 0 && _iThen > _iMutate && _iChamada > _iThen,
    '⭐ co-org: a chamada vive DEPOIS do `.then` da gravação (ordem de execução provada em convite-so-anuncia-depois-de-gravar)');
}

/* ── §2 · AS FUNCTIONS: RECUSAS ─────────────────────────────────────────────── */
console.log('\n§2 AS FUNCTIONS RECUSAM O QUE TÊM QUE RECUSAR');
{
  const fatia = (nome) => {
    const i = SRC_IDX.indexOf('exports.' + nome + ' = onCall(');
    return SRC_IDX.slice(i, SRC_IDX.indexOf('\n);', i));
  };
  const par = fatia('sendPairInviteEmail'), ch = fatia('sendCoHostInviteEmail');
  ok(par.length > 200 && ch.length > 200, 'as duas Functions existem em functions/index.js');

  [['sendPairInviteEmail', par], ['sendCoHostInviteEmail', ch]].forEach(([nome, f]) => {
    ok(/if \(!callerUid\) throw new HttpsError\("unauthenticated"/.test(f), nome + ': recusa NÃO AUTENTICADO');
    ok(/if \(!snap\.exists\) throw new HttpsError\("not-found"/.test(f), nome + ': recusa TORNEIO INEXISTENTE');
    ok(/invalid-argument/.test(f), nome + ': recusa payload sem identificadores');
    ok(/motivo: "convite-inexistente"/.test(f), nome + ': recusa CONVITE INEXISTENTE/INATIVO');
    /* ⛔ o payload não pode conter nada além de identificadores */
    /* ⚠️ O `\b` NO FIM É O TESTE. Sem ele, `request.data.to` casa dentro de
     * `request.data.tournamentId` e a asserção acusa a si mesma — foi exatamente o que
     * aconteceu na L1.3a com o mesmo padrão. */
    ok(!/request\.data(\.|\[")(subject|html|to|message|acceptUrl|rejectUrl|email)\b/.test(f),
      nome + ': ⛔ NÃO lê subject/html/to/message/URL/e-mail do cliente');
    ok(/destinatariosDoPerfil\(perfil\)/.test(f), nome + ': destinatário sai do PERFIL, no servidor');
    ok(/\.doc\(mailId\)\.create\(doc\)/.test(f), nome + ': grava com id determinístico + create()');
    ok(/ALREADY_EXISTS/.test(f), nome + ': e trata o conflito como idempotência, não como erro');
  });
  ok(/_partesPerm\.ehOrganizador\(t, callerUid\)/.test(ch),
    'co-org: a régua de quem convida é a CANÔNICA (`ehOrganizador`), não uma cópia');
  ok(/achaConvitePar\(t, callerUid, inviteeUid\)/.test(par),
    'dupla: o convite é casado por (quem chama → convidado) — alvo adulterado não acha nada');
  ok(!/ehOrganizador/.test(par),
    '⚠️ dupla NÃO exige organizador de propósito: quem convida é o próprio inscrito');
}

/* ── §3 · O NÚCLEO PURO ─────────────────────────────────────────────────────── */
console.log('\n§3 AUTORIZAÇÃO PELO REGISTRO (núcleo puro)');
{
  const t = {
    id: 'tour_x', name: 'Confra BT',
    pairRequests: [{ id: 'u1__u2', inviterUid: 'u1', inviteeUid: 'u2', createdAt: 1000 }],
    coHosts: [{ uid: 'c1', status: 'pending', invitedAt: '2026-08-31T10:00:00.000Z' },
              { uid: 'c2', status: 'active', invitedAt: '2026-08-01T10:00:00.000Z' }]
  };
  ok(!!C.achaConvitePar(t, 'u1', 'u2'), 'convite gravado é encontrado');
  ok(C.achaConvitePar(t, 'u2', 'u1') === null, '⛔ o INVERSO não vale — quem convida é quem convidou');
  ok(C.achaConvitePar(t, 'u1', 'u9') === null, '⛔ alvo ADULTERADO não acha registro');
  ok(C.achaConvitePar(t, 'u9', 'u2') === null, '⛔ terceiro se passando por quem convidou: nada');
  ok(C.achaConvitePar({ pairRequests: [] }, 'u1', 'u2') === null, '⛔ torneio sem convites: nada');

  ok(!!C.achaCoHostPendente(t, 'c1'), 'co-host PENDENTE é encontrado');
  ok(C.achaCoHostPendente(t, 'c2') === null, '⛔ co-host já ATIVO não gera convite (não está pendente)');
  ok(C.achaCoHostPendente(t, 'c9') === null, '⛔ uid que não está em coHosts: nada');
}

console.log('\n§3b DESTINATÁRIO — perfil, dedup e opt-out');
{
  ok(JSON.stringify(C.destinatariosDoPerfil({ email: 'A@X.com', linkedEmails: ['b@x.com', 'a@x.com'] }))
     === JSON.stringify(['a@x.com', 'b@x.com']),
    'principal + vinculados, minúsculo e sem repetir');
  ok(C.destinatariosDoPerfil({ email: 'a@x.com', notifyEmail: false }).length === 0,
    '⛔ `notifyEmail: false` cala tudo — a MESMA régua de opt-out que o cliente usava');
  ok(C.destinatariosDoPerfil({}).length === 0 && C.destinatariosDoPerfil(null).length === 0,
    'perfil vazio/ausente não inventa destinatário');
  ok(C.destinatariosDoPerfil({ email: 'lixo' }).length === 0, 'endereço sem @ não entra');
}

console.log('\n§4 UM E-MAIL POR CONVITE — retry não duplica, convite novo sai');
{
  const req = { id: 'u1__u2', inviterUid: 'u1', inviteeUid: 'u2', createdAt: 1000 };
  const a = C.mailDocIdDoPar(C.chaveDoConvitePar('tour_x', req));
  const b = C.mailDocIdDoPar(C.chaveDoConvitePar('tour_x', req));
  ok(a === b, '⭐ MESMO convite → MESMO id → `create()` recusa o 2º: retry/reentrega não duplica');
  const reqNovo = { id: 'u1__u2', inviterUid: 'u1', inviteeUid: 'u2', createdAt: 2000 };
  ok(C.mailDocIdDoPar(C.chaveDoConvitePar('tour_x', reqNovo)) !== a,
    '⭐ recusou e convidou DE NOVO (carimbo novo) → id novo → e-mail novo, legítimo');
  ok(C.mailDocIdDoPar(C.chaveDoConvitePar('tour_y', req)) !== a, 'outro torneio → outro id');
  ok(/^pairinv_[0-9a-f]{40}$/.test(a), 'o id é determinístico e reconhecível (' + a.slice(0, 16) + '…)');

  const e1 = { uid: 'c1', status: 'pending', invitedAt: '2026-08-31T10:00:00.000Z' };
  const e2 = { uid: 'c1', status: 'pending', invitedAt: '2026-09-02T11:00:00.000Z' };
  const c1 = C.mailDocIdDoCoHost(C.chaveDoConviteCoHost('tour_x', e1));
  ok(c1 === C.mailDocIdDoCoHost(C.chaveDoConviteCoHost('tour_x', e1)), 'co-org: mesma entrada → mesmo id');
  ok(c1 !== C.mailDocIdDoCoHost(C.chaveDoConviteCoHost('tour_x', e2)),
    '⭐ co-org: recusa + convite novo (outro `invitedAt`) → id novo');
  ok(/^chinv_[0-9a-f]{40}$/.test(c1), 'idem no formato (' + c1.slice(0, 14) + '…)');
}

console.log('\n§5 ASSUNTO, HTML E LINKS SÃO DO SERVIDOR');
{
  const m = doc(C.montaEmailPar({
    tournamentId: 'tour_x', tournamentName: 'Confra <b>BT</b>', requestId: 'u1__u2',
    inviterName: 'Erika "A" & Cia', destinatarios: ['A@X.com'], agora: 1
  }));
  ok(m.message.subject === '🤝 Convite de dupla — Confra <b>BT</b>', 'assunto FIXO no servidor');
  ok(m.to[0] === 'a@x.com', 'destinatário normalizado');
  ok(m.message.html.indexOf('Erika &quot;A&quot; &amp; Cia') !== -1,
    '⭐ o nome vindo do perfil é ESCAPADO no HTML');
  ok(m.message.html.indexOf('Confra &lt;b&gt;BT&lt;/b&gt;') !== -1, '  → e o nome do torneio também');
  ok(m.message.html.indexOf('https://scoreplace.app/#pair/accept/tour_x/u1__u2') !== -1
     && m.message.html.indexOf('https://scoreplace.app/#pair/reject/tour_x/u1__u2') !== -1,
    '⭐ os deep-links Aceitar/Recusar seguem funcionais, montados do id canônico');
  ok(m.message.text.indexOf('#pair/accept/') !== -1, 'a versão texto também traz os links');

  const c = doc(C.montaEmailCoHost({ tournamentId: 'tour_x', tournamentName: 'Confra', inviterName: 'Rodrigo', destinatarios: ['b@x.com'], agora: 1 }));
  ok(c.message.subject === '👑 Convite de co-organização — Confra', 'co-org: assunto fixo');
  ok(c.message.html.indexOf('https://scoreplace.app/#cohost/accept/tour_x/cohost') !== -1
     && c.message.html.indexOf('https://scoreplace.app/#cohost/reject/tour_x/cohost') !== -1,
    '⭐ co-org: deep-links preservados');
  ok(/❌ Recusar[\s\S]*✅ Aceitar/.test(c.message.html),
    '⚠️ e a ORDEM dos botões continua Recusar-esquerda / Aceitar-direita (ordem do dono)');
}

console.log('\n§6 NADA DO CLIENTE ENTRA NO E-MAIL');
{
  /* Se um payload hostil chegasse com assunto/HTML, o núcleo os ignora: ele só aceita os
   * campos que a Function preenche a partir do documento canônico. */
  const m = doc(C.montaEmailPar({
    tournamentId: 'tour_x', tournamentName: 'T', requestId: 'r', destinatarios: ['a@x.com'],
    subject: 'ASSUNTO INJETADO', html: '<script>roubo()</script>', to: ['vitima@x.com'],
    message: { subject: 'x' }, acceptUrl: 'https://phishing.example/'
  }));
  ok(m.message.subject.indexOf('INJETADO') === -1, '⛔ `subject` do payload é IGNORADO');
  ok(m.message.html.indexOf('roubo()') === -1, '⛔ `html` do payload é IGNORADO');
  ok(m.to.length === 1 && m.to[0] === 'a@x.com', '⛔ `to` do payload é IGNORADO');
  ok(m.message.html.indexOf('phishing.example') === -1, '⛔ URL do payload é IGNORADA');
}

console.log('\n§7 A RULE DE /mail SEGUE ABERTA — de propósito nesta leva');
{
  ok(/match \/mail\/\{mailId\} \{[\s\S]{0,120}allow write: if request\.auth != null;/.test(RULES),
    '⚠️ /mail NÃO foi fechado aqui: o escopo é a primeira metade de L1');
  ok(/match \/notif_email_queue\/\{id\} \{[\s\S]{0,160}allow create: if request\.auth != null;/.test(RULES),
    '⚠️ e `notif_email_queue` também segue como está — fechá-la é L2');
  /* ⛔ Os writers de SERVIDOR que sobram são legítimos e não impedem o fechamento:
   * são Admin SDK. O que impedia eram F1/F2/F3, e eles morreram. */
  const restaCliente = /collection\(\s*['"]mail['"]\s*\)/.test(
    fs.readFileSync(path.join(RAIZ, 'js', 'firebase-db.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
  ok(!restaCliente, '⭐ e depois desta leva não sobra writer CLIENTE nenhum pra bloquear o fechamento');
}

console.log('\n' + (fail ? '✗' : '✅') + ' convites server-only: ' + pass + ' ok, ' + fail + ' falharam');
if (fail) { fails.forEach((f) => console.log('   ✗ ' + f)); process.exitCode = 1; }
