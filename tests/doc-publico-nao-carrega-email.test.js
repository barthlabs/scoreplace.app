/* O DOCUMENTO QUE QUALQUER UM LÊ NÃO CARREGA E-MAIL (2.0.102)
 * node tests/doc-publico-nao-carrega-email.test.js
 *
 * ⛔ CONFERIDO CONTRA PRODUÇÃO em 26/ago/2026, não deduzido da regra:
 *   GET https://firestore.googleapis.com/v1/.../tournaments/{id}  SEM autenticação
 *   → HTTP 200, 429 KB, **61 e-mails**.
 * A regra é `allow read: if resource.data.isPublic == true` — sem login, de propósito
 * (é a vitrine). O defeito não é a regra: é o e-mail estar no documento.
 *
 * ⭐ E NÃO EXISTE CONSERTO PELA REGRA. Firestore lê o documento INTEIRO ou nada — não há
 * "esconde só este campo". Quem precisa ficar escondido não mora num doc público. Ponto.
 *
 * Mapa medido (38 torneios públicos, 90 e-mails distintos):
 *   categoryNotifications[].targetEmail  84  ⟵ esta leva
 *   organizerEmail / creatorEmail / adminEmails[]  38 cada  ⟵ AUTORIZAÇÃO, leva própria
 *   participants[].*Email · matches[].team*Obj.*Email      ⟵ identidade legada, leva própria
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const cat = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-categories.js'), 'utf8');

const i = cat.indexOf('t.categoryNotifications.push({');
ok(i > 0, 'o registro de categoria continua sendo criado (o dono mandou guardar o histórico)');
const push = cat.slice(i, i + 420);
ok(!/targetEmail/.test(push),
  '⛔ mas SEM `targetEmail` — o doc é lido sem login e a regra não esconde campo');
ok(/targetUid: pUid/.test(push),
  '⭐ a identidade é o uid, que é a chave canônica ([[feedback_uid_controls_everything_name_only_ficticio]])');
ok(/targetName/.test(push),
  'o nome fica — ele já aparece na lista de inscritos do mesmo doc, não acrescenta exposição');

// a migração TROCA, não apaga: 82 dos 84 registros eram legados e não tinham uid
const mig = fs.readFileSync(path.join(ROOT, 'scripts', 'tirar-email-do-doc-publico.js'), 'utf8');
ok(/uidPorEmail/.test(mig),
  '⭐ a migração RESOLVE o e-mail pra uid antes de tirar — 59 dos 60 resolvem');
ok(/delete c\.targetEmail/.test(mig), 'e então tira o e-mail');
ok(!/categoryNotifications: \[\]/.test(mig) && !/FieldValue\.delete\(\)/.test(mig),
  '⛔ e NÃO apaga o registro: o dono desligou a tela em 31/jul mas mandou guardar');
ok(/--aplicar/.test(mig) && /em seco/.test(mig),
  'em seco por padrão — escrita em massa em doc de produção não roda por acidente');

// e o escopo do que NÃO foi tocado está declarado, pra ninguém achar que acabou
ok(/organizerEmail/.test(mig) && /adminEmails/.test(mig) && /AUTORIZA/.test(mig),
  '⭐ o que ficou de fora está NOMEADO no script — some silencioso é como buraco fica aberto');

console.log((fail ? '✗' : '✓') + ' doc-publico-nao-carrega-email: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
