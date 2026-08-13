/* E-MAIL DE CONFIRMAÇÃO DE EXCLUSÃO DE CONTA — o comprovante de que a conta sumiu.
 *
 * Ordem do dono (13/ago/2026): _"sempre que qualquer conta for excluída no app
 * (por qualquer motivo — solicitação do usuário, admin, etc.)"_ → comprovante por
 * e-mail. Destinatários corrigidos pelo dono no mesmo dia: _"NÃO enviar para
 * rstbarth@gmail.com"_ — vai só pro titular e pra contato@barthlabs.com.
 *
 * O que este teste trava, na ordem do que dói errar:
 *   1. FUSÃO NÃO É EXCLUSÃO. O merge grava `mergedInto` e o cleanupAbandonedAuth
 *      APAGA esse doc 7 dias depois — um gatilho ingênuo mandaria "sua conta foi
 *      excluída" pra quem só uniu contas, com a conta sobrevivente viva. É a
 *      asserção mais importante do arquivo.
 *   2. Os DOIS caminhos de exclusão disparam: doc apagado (hard) e tombstone
 *      `deleted:true` (o que a CF deleteAccount realmente faz).
 *   3. Não repetir: tombstone que já era tombstone não re-notifica.
 *   4. CONTEÚDO: destinatários certos, LGPD citada, contato SEMPRE barthlabs,
 *      e o relatório do dono ACUSA sobras em vez de dizer "tudo certo".
 *   5. FIAÇÃO do gatilho em index.js: identidade lida do `before` (o tombstone
 *      apaga o e-mail do `after` — ler o after é não ter pra quem escrever),
 *      ids determinísticos (reentrega não duplica) e CC no lugar certo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('./account-deletion-email-core.js');

let pass = 0, fail = 0;
const ok = (m, c) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── account-deletion-email-core ────');

// ── 1. A DECISÃO ───────────────────────────────────────────────────────────────
const perfil = { displayName: 'Ana Silva', email: 'ana@x.com' };

ok('doc APAGADO → notifica (hard)',
  core.decideDeletionNotice(perfil, null).notify === true &&
  core.decideDeletionNotice(perfil, null).kind === 'hard');

ok('tombstone deleted:true → notifica (tombstone)',
  core.decideDeletionNotice(perfil, { deleted: true }).notify === true &&
  core.decideDeletionNotice(perfil, { deleted: true }).kind === 'tombstone');

// ⚠️ A REGRESSÃO QUE IMPORTA: merge-ghost limpo 7 dias depois pelo
// cleanupAbandonedAuth apaga users/{uid} de VERDADE. Quem fundiu conta não pode
// receber "sua conta foi excluída" — a conta sobrevivente dela está viva.
ok('FUSÃO: doc com mergedInto apagado NÃO notifica',
  core.decideDeletionNotice({ displayName: 'Ana', mergedInto: 'outroUid' }, null).notify === false);
ok('FUSÃO: o motivo é explícito (aparece no log)',
  /mergedInto/.test(core.decideDeletionNotice({ mergedInto: 'x' }, null).reason));

ok('tombstone que JÁ era tombstone não re-notifica',
  core.decideDeletionNotice({ deleted: true }, null).notify === false);
ok('escrita comum (perfil editado) não notifica',
  core.decideDeletionNotice(perfil, { displayName: 'Ana S.' }).notify === false);
ok('doc nascendo (sem before) não notifica',
  core.decideDeletionNotice(null, perfil).notify === false);
ok('doc criado e apagado no mesmo evento não explode',
  core.decideDeletionNotice(null, null).notify === false);

// ── 2. E-MAIL DA PESSOA ────────────────────────────────────────────────────────
const quando = new Date('2026-08-13T18:30:00.000Z');   // 15:30 BRT
const u = core.buildUserEmail({
  name: 'Cristiano Franco', email: 'c@x.com', deletedAt: quando,
  items: ['Perfil (19 campos)', '2 troféus']
});
ok('assunto diz que a conta foi excluída', /exclu/i.test(u.subject));
ok('trata a pessoa pelo primeiro nome', /Cristiano/.test(u.html));
ok('mostra a conta', u.html.indexOf('c@x.com') !== -1);
ok('lista o que foi removido', /19 campos/.test(u.html) && /troféus/.test(u.html));
ok('diz que é permanente', /permanente/i.test(u.html) && /permanente/i.test(u.text));
ok('cita a LGPD', /LGPD/.test(u.html) && /13\.709/.test(u.html));
ok('contato é barthlabs, NUNCA o gmail do app',
  u.html.indexOf('contato@barthlabs.com') !== -1 && u.html.indexOf('scoreplace.app@gmail.com') === -1);
ok('versão texto existe e não é HTML', u.text.length > 80 && u.text.indexOf('<div') === -1);

// Horário em BRT e ROTULADO — servidor loga UTC, e misturar os dois já custou
// uma conclusão errada neste projeto.
// (pt-BR intercala vírgula entre data e hora: "13/08/2026, 15:30:00")
ok('data em BRT, com o fuso escrito', /13\/08\/2026,?\s+15:30/.test(u.html) && /BRT/.test(u.html));

const semNome = core.buildUserEmail({ email: 'x@y.com', deletedAt: quando });
ok('sem nome não vira "Olá, undefined"', !/undefined/.test(semNome.html) && !/Olá, \./.test(semNome.html));

// ── 3. RELATÓRIO DO DONO ───────────────────────────────────────────────────────
const a = core.buildAdminEmail({
  uid: 'UID123', name: 'Cristiano Franco', email: 'c@x.com', phone: '11988887777',
  providers: ['google.com'], createdAt: quando, lastSignIn: quando, deletedAt: quando,
  items: ['users/UID123', '2 troféus'], leftovers: [], origin: 'pedido do titular'
});
ok('assunto identifica a conta', a.subject.indexOf('Cristiano Franco') !== -1 && /scoreplace/.test(a.subject));
ok('traz o uid', a.html.indexOf('UID123') !== -1);
ok('traz provedor e origem', /google\.com/.test(a.html) && /pedido do titular/.test(a.html));
ok('celular formatado', /\+55 \(11\) 98888-7777/.test(a.html));
ok('varredura limpa vira selo verde', /Varredura limpa/.test(a.html));
ok('relatório cita LGPD', /LGPD/.test(a.html));

// Um relatório que diz "apagado" sem conferir não prova nada. Sobra tem que gritar.
const comSobra = core.buildAdminEmail({
  uid: 'U', deletedAt: quando, items: [], leftovers: ['tournaments/t1.memberUids', 'presences/p9']
});
ok('SOBRA aparece em destaque, não escondida',
  /Sobraram 2 refer/.test(comSobra.html) && /tournaments\/t1\.memberUids/.test(comSobra.html));
ok('sobra também no texto puro', /presences\/p9/.test(comSobra.text));
ok('com sobra NÃO diz "varredura limpa"', !/Varredura limpa/.test(comSobra.html));

// XSS: nome é dado do usuário e entra em HTML.
const xss = core.buildAdminEmail({ uid: 'U', name: '<script>alert(1)</script>', deletedAt: quando });
ok('nome é escapado (sem <script> cru)', xss.html.indexOf('<script>alert') === -1 && /&lt;script&gt;/.test(xss.html));

// ── 3b. DESTINATÁRIOS ──────────────────────────────────────────────────────────
// Correção explícita do dono (13/ago): o endereço PESSOAL saiu — o comprovante vai
// só pro titular e pra caixa da empresa. Endereço pessoal em rotina automática é
// exatamente o que [[feedback_contact_email_always_barthlabs]] proíbe, e a correção
// foi expressa: não pode voltar por descuido.
const alvos = core.mailTargets('cristiano@x.com');
ok('titular recebe a confirmação', alvos.user.to.length === 1 && alvos.user.to[0] === 'cristiano@x.com');
ok('titular tem CC pra barthlabs', alvos.user.cc.indexOf('contato@barthlabs.com') !== -1);
ok('relatório vai pra contato@barthlabs.com', alvos.report.to[0] === 'contato@barthlabs.com');
ok('replyTo é sempre barthlabs nos dois',
  alvos.user.replyTo === 'contato@barthlabs.com' && alvos.report.replyTo === 'contato@barthlabs.com');

// A armadilha do dia: com o pessoal fora, destino do relatório e CC viraram o MESMO
// endereço — os dois no mesmo e-mail entregam duplicado na mesma caixa.
ok('relatório NÃO se auto-CCa (to e cc seriam o mesmo endereço)', alvos.report.cc.length === 0);

const mesmo = core.mailTargets('contato@barthlabs.com');
ok('titular que JÁ é a caixa da empresa não vira to+cc duplicado', mesmo.user.cc.length === 0);
const caixaAlta = core.mailTargets('CONTATO@BarthLabs.com');
ok('a dedupe ignora caixa alta/baixa', caixaAlta.user.cc.length === 0);

const semCaixa = core.mailTargets('');
ok('conta só-celular: não há e-mail de titular', semCaixa.user === null);
ok('conta só-celular: o relatório sai mesmo assim', semCaixa.report.to[0] === 'contato@barthlabs.com');

// A trava da correção: o endereço pessoal não pode reaparecer em lugar nenhum.
const fonteCore = fs.readFileSync(path.join(__dirname, 'account-deletion-email-core.js'), 'utf8');
const rst = /rstbarth@gmail\.com/;
ok('NUNCA rstbarth@gmail.com nos destinatários do core',
  !rst.test(JSON.stringify(core.mailTargets('a@b.com'))) &&
  !rst.test(String(core.REPORT_TO)) && !rst.test(String(core.CC_CONTATO)));
ok('o core só cita o endereço pessoal em comentário (o porquê da correção), nunca em código',
  fonteCore.split('\n').filter((l) => rst.test(l))
    .every((l) => /^\s*(\*|\/\/|\/\*)/.test(l)));

// ── 4. IDS DETERMINÍSTICOS (reentrega não duplica) ─────────────────────────────
const ids = core.mailDocIds('wOmGzHQK');
ok('id do usuário e do admin são distintos', ids.user !== ids.admin);
ok('id é estável pro mesmo uid', core.mailDocIds('wOmGzHQK').user === ids.user);
ok('id sanitiza caractere de caminho', core.mailDocIds('a/b').user.indexOf('/') === -1);

// ── 5. FIAÇÃO DO GATILHO (functions/index.js) ──────────────────────────────────
const idx = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const bloco = idx.slice(idx.indexOf('exports.accountDeletionEmail'),
                        idx.indexOf('exports.accountDeletionEmail') + 6000);
ok('o gatilho existe', idx.indexOf('exports.accountDeletionEmail') !== -1);
ok('escuta users/{uid} via onDocumentWritten',
  /onDocumentWritten/.test(bloco) && /users\/\{uid\}/.test(bloco));
ok('usa o MESMO core (nada de segundo construtor)',
  /require\(["'].\/account-deletion-email-core/.test(idx));
ok('a decisão vem do core, não reimplementada no gatilho',
  /decideDeletionNotice/.test(bloco));

// A identidade TEM que sair do before: o tombstone é `set` sem merge e apaga o
// e-mail no mesmo instante. Ler o after é ficar sem destinatário.
ok('lê a identidade do BEFORE (o after já perdeu o e-mail)',
  /before/.test(bloco) && /before\.data\(\)/.test(bloco));
ok('o roteamento vem do core (o gatilho não monta to/cc na mão)',
  /mailTargets/.test(bloco) && !/to: \[destinatario\]/.test(bloco));
ok('usa id determinístico ao enfileirar (não .add())',
  /mailDocIds/.test(bloco) && /\.doc\(/.test(bloco));
ok('é best-effort: exclusão não pode falhar por causa do e-mail',
  /catch/.test(bloco));

// A varredura de sobras é ordenada DEPOIS do tombstone, e a CF canônica só apaga o
// Auth no passo seguinte. Sem folga, o gatilho ganha a corrida e acusa "Auth ainda
// existe" em toda exclusão legítima — aviso que sempre aparece é aviso que ninguém
// lê, e aí a sobra de verdade passa batida.
const varre = idx.slice(idx.indexOf('async function _sweepDeletionLeftovers'),
                        idx.indexOf('exports.accountDeletionEmail'));
ok('a varredura espera antes de acusar o Auth (corrida com o passo 7 da CF)',
  /_espera\(/.test(varre));
ok('e dá uma SEGUNDA chance antes de reportar', (varre.match(/_espera\(/g) || []).length >= 2);
ok('subcoleção órfã é checada (o Firestore não apaga junto com o doc pai)',
  /listCollections/.test(varre) && /órfã/.test(varre));
ok('tombstone NÃO é reportado como sobra (é o estado esperado da CF)',
  /kind === "hard"/.test(varre));

console.log(fail === 0 ? '✅ account-deletion-email-core: ' + pass + ' asserções, 0 falha(s)'
                       : '❌ account-deletion-email-core: ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
