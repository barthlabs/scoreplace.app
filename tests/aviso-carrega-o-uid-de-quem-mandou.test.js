'use strict';
/* ⛔ O AUTOR DO AVISO É O UID — E ERA ONDE CAÍA UM E-MAIL.
 *
 * `users/{uid}/notifications` aceita `create` de QUALQUER autenticado
 * (firestore.rules:1031). É a porta mais fraca que a auditoria da L2 apontou: hoje dá para
 * escrever aviso na lista de qualquer pessoa, com o autor que se quiser. A trava natural é a
 * regra exigir `fromUid == request.auth.uid`.
 *
 * MEDIDO no código: o único escritor de cliente (`_sendUserNotification` →
 * `addNotification`) gravava `cu.uid || cu.email || ''`. Um e-mail num campo chamado
 * `fromUid` quebra a régua de identidade da casa — quem lê depois trata como uid, não acha
 * ninguém, e o aviso fica órfão de autor. E enquanto isso existir, a regra NÃO pode ser
 * apertada: ela recusaria o que o nosso próprio cliente grava.
 *
 * ⛔ CONTROLE DE ESCOPO: esta leva é a METADE DO CLIENTE. A Rule segue como está, de
 * propósito — o app das lojas roda o bundle EMBARCADO, e ele só passa a gravar o uid depois
 * de um build nativo publicado. Apertar antes cortaria o aviso de quem está na loja.
 * [[project_travar_as_rules_em_9_setembro]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const ORG = fs.readFileSync(path.join(raiz, 'js/views/tournaments-organizer.js'), 'utf8');
const RULES = fs.readFileSync(path.join(raiz, 'firestore.rules'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

const iEnvia = ORG.indexOf('window._sendUserNotification = async function');
assert.ok(iEnvia > 0, 'âncora: o envio da notificação');
const iFim = ORG.indexOf('window._dispatchChannels = function', iEnvia);
assert.ok(iFim > iEnvia, 'âncora: o fim do envio');
const envia = semComentario(ORG.slice(iEnvia, iFim));

// ── ① o autor é o uid, e só ele ─────────────────────────────────────────────
must(/_notifPayload\.fromUid = cu\.uid;/.test(envia),
  '① ⭐ o autor gravado é o UID verificado, sem queda');
must(!/fromUid = cu\.uid \|\| cu\.email/.test(envia),
  '① ⛔ sumiu a queda para E-MAIL — e-mail não é uid');
must(!/fromUid = [^;]*\|\| ''/.test(envia),
  '① ⛔ e sumiu a queda para VAZIO — aviso sem autor conferível');

// ── ② sem uid não grava, e a recusa é OBSERVÁVEL ────────────────────────────
must(/if \(!cu\.uid\) \{/.test(envia), '② sem uid verificado, não grava');
const iRecusa = envia.indexOf('if (!cu.uid) {');
const iGrava = envia.indexOf('_notifPayload.fromUid = cu.uid;');
must(iRecusa > 0 && iRecusa < iGrava, '② ORDEM: a recusa vem ANTES da montagem do autor');
must(/_warn\('\[notif\] sem uid verificado/.test(envia),
  '② ⛔ e ela APARECE no log — falha calada é a família de defeito que já nos custou caro');

// ── ③ a identidade continua vindo do caminho VERIFICADO ─────────────────────
must(/_verifiedCurrentUser\(\)/.test(envia),
  '③ o usuário vem de `_verifiedCurrentUser`, conferido contra o Firebase Auth');

/* ── ④ A RULE FECHOU (13/set/2026) ──────────────────────────────────────────
 * Esta seção dizia o CONTRÁRIO: cobrava que a regra continuasse aberta, porque a trava só
 * podia entrar depois de medir. A medida veio — 5.792 avisos de produção, e NENHUMA escrita
 * de cliente seria recusada (as 37 sem autor são do servidor, que ignora as rules). A regra
 * foi apertada e a inversão desta seção é o registro disso.
 * ⚠️ O comportamento contra o emulador é provado em tests/rules-aviso-so-em-nome-proprio.js,
 * que roda nas DUAS direções — aqui fica só a trava estática. */
const iR = RULES.indexOf('match /notifications/{notifId}');
assert.ok(iR > 0, 'âncora: a regra dos avisos');
const bloco = RULES.slice(iR, RULES.indexOf('}', RULES.indexOf('allow update, delete', iR)));
must(/fromUid == request\.auth\.uid/.test(bloco),
  '④ ⭐ a Rule exige que o autor seja quem está logado — fim da falsificação');
must(!/allow create: if request\.auth != null;\s*$/m.test(bloco),
  '④ ⛔ não sobrou o `create` que aceitava qualquer autenticado sem conferir o autor');


/* ── ⑩ O AVISO ESCRITO PELO SERVIDOR TAMBÉM ASSINA ─────────────────────────
 * ⛔ MEDIDO no dado real em 13/set/2026: os ÚNICOS avisos sem `fromUid` em toda a amostra
 * eram do tipo `contact_phone_set` — 5 de 645. E é o aviso em que saber QUEM mais importa,
 * porque ele conta à pessoa que alguém mexeu no perfil dela.
 * ⚠️ Passou batido porque quem o escreve é a Function, e Admin SDK IGNORA as Rules: a trava
 * que exige autoria (`fromUid == request.auth.uid`, 2.3.0) só vale para o cliente. Regra que
 * só o cliente obedece não é regra do sistema. */
(function () {
  const CP = require(path.join(raiz, 'functions/contact-phone-core.js'));
  const a = CP.buildContactPhoneNotice({
    organizerName: 'Rodrigo', organizerUid: 'uid_do_org',
    phone: '+5511999999999', tournamentName: 'Confra',
  });
  must(a.fromUid === 'uid_do_org', '⑩ ⭐⭐ o aviso de celular registrado assina com o uid de quem registrou');
  must(a.fromName === 'Rodrigo', '⑩ e leva o nome junto, para a pessoa ler sem resolver nada');
  const b = CP.buildContactPhoneNotice({ organizerName: 'X', phone: '+5511999999999' });
  must(b.fromUid === '', '⑩ sem uid informado, o campo fica vazio — nunca inventa autor');
  const FN = require('fs').readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
  must(/organizerUid: callerUid/.test(FN),
    '⑩ ⭐ e quem chama passa o uid de quem está logado, não um nome solto');
})();

console.log('\n✅ aviso carrega o uid de quem mandou — ' + ok + ' verificações');