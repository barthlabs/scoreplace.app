'use strict';
/* ⛔ O LIMITADOR DE LOGIN SE DERROTAVA SOZINHO.
 * `_throttleHit` guarda o contador num documento chaveado pelo IDENTIFICADOR e o atualiza em
 * TRANSAÇÃO. Um ataque de força bruta martela o MESMO documento → disputa → a transação aborta
 * → caía num `catch (e) { /* fail-open *\/ }` → a chamada era LIBERADA, em silêncio.
 * Quanto mais rápido o ataque, menos ele era limitado.
 * É a família do "não consegui olhar virou não achei" (L16), agora numa porta de LOGIN:
 * `phonePasswordLogin` (15/min) e `checkAccount` (20/min).
 * O conserto distingue: DISPUTA é evidência de volume e conta como batida; os demais erros
 * seguem liberando (um soluço do Firestore não pode trancar quem só quer entrar) — mas apare-
 * cem no log, que antes era mudo.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const F = fs.readFileSync(path.join(__dirname, '..', 'functions/index.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const i = F.indexOf('async function _throttleHit(');
assert.ok(i > 0, 'âncora: o limitador');
const bloco = F.slice(i, F.indexOf('\n}', i));

must(!/catch \(e\) \{ \/\* fail-open \*\/ \}/.test(bloco),
  '① ⛔ o catch que liberava tudo, calado, não existe mais');
must(/ABORTED[\s\S]{0,120}test\(_cod\)/.test(bloco),
  '① disputa é reconhecida pelo código do erro');
must(/if \(_disputa\) \{[\s\S]{0,200}blocked = true;/.test(bloco),
  '① ⛔ e conta como BATIDA — o ataque não desliga mais o próprio limite');
must(/console\.error\('\[throttle\] ' \+ coll \+ ': falhou e LIBEROU a chamada:'/.test(bloco),
  '① quando ainda libera, DIZ que liberou e por quê — antes era silêncio');
must(/console\.warn\('\[throttle\] ' \+ coll \+ ': disputa no contador/.test(bloco),
  '① e a disputa também aparece, com o nome da coleção');

/* ② os dois chamadores continuam sendo portas de identidade — se alguém acrescentar um
 *    terceiro, que seja com consciência de que o erro agora pode BLOQUEAR. */
const chamadas = (F.match(/_throttleHit\(db, "/g) || []).length;
must(chamadas === 2, '② são dois chamadores (login por telefone e checagem de conta) — achei ' + chamadas);
must(/_throttleHit\(db, "phoneLoginThrottle", identifier\.toLowerCase\(\), 15\)/.test(F),
  '② login por telefone: 15 por minuto');
must(/_throttleHit\(db, "checkAccountThrottle", identifier\.toLowerCase\(\), 20\)/.test(F),
  '② checagem de conta: 20 por minuto');

/* ③ a chave é o HASH do identificador, não o identificador — o contador não vira lista de
 *    telefones e e-mails tentados, legível por quem abrir a coleção. */
must(/createHash\("sha256"\)\.update\(String\(key\)\)/.test(bloco),
  '③ a chave do contador é hash — a coleção não vira lista de quem foi tentado');

console.log('\n✅ limitador não se derrota sozinho — ' + ok + ' verificações');

/* ─── L14.P2 — O SILÊNCIO TINHA FORMATO DIFERENTE DO SUCESSO ──────────────────
 * `dispatchAccountRecovery` já respondia `ok` mesmo sem achar a conta — defesa contra
 * enumeração, com comentário e tudo. Mas vazava pela FORMA: sucesso devolvia
 * `{ ok, channels: { email: "r***@..." } }` e o silêncio devolvia `{ ok }` SEM a chave.
 * Bastava olhar se `channels` veio. */
(function () {
  const j = F.indexOf('exports.dispatchAccountRecovery');
  assert.ok(j > 0, 'âncora: a recuperação de conta');
  /* ⛔ âncora, não orçamento de caracteres: com 3000 o `return` de sucesso ficava DE FORA e a
   * trava acusava ausência do que estava logo adiante. Mesmo erro que já apareceu hoje. */
  const fimRec = F.indexOf('\nexports.', j + 10);
  assert.ok(fimRec > j, 'âncora: o fim da recuperação de conta');
  const rec = F.slice(j, fimRec);
  must(/if \(!ur\) return \{ ok: true, channels: \{ email: null, phone: null \} \};/.test(rec),
    '④ conta inexistente devolve o MESMO desenho do sucesso, com os canais nulos');
  must(!/if \(!ur\) return \{ ok: true \};/.test(rec),
    '④ ⛔ o retorno curto, que denunciava pela ausência da chave, não existe mais');
  must(/return \{ ok: true, channels: out \};/.test(rec),
    '④ e o caminho de sucesso segue com a mesma chave — os dois são indistinguíveis por forma');
})();

/* ⑤ a tela aguenta canais nulos — conferido ANTES de igualar o formato no servidor */
const AUTH = fs.readFileSync(path.join(__dirname, '..', 'js/views/auth.js'), 'utf8');
must(/parts\.length \? parts\.join\(' e '\) : 'seus contatos cadastrados'/.test(AUTH),
  '⑤ sem canal, a tela diz "seus contatos cadastrados" — nada quebra do lado de quem usa');

console.log('✅ (+ L14.P2) o silêncio tem o mesmo formato do sucesso — total ' + ok + ' verificações');

/* ─── L14.P3 — "USO ÚNICO" QUE DEPENDIA DE UM APAGAMENTO ENGOLIDO ─────────────
 * `verifyPasswordResetPhoneToken` lia o token, EMITIA a credencial e só então apagava, com a
 * falha engolida. Dois furos: se o apagamento falhasse, o link de redefinição de senha seguia
 * valendo depois de já ter servido; e dois usos simultâneos passavam os dois pelo `exists`,
 * porque ler e apagar eram passos separados. */
(function () {
  const k = F.indexOf('exports.verifyPasswordResetPhoneToken');
  assert.ok(k > 0, 'âncora: a porta do token de redefinição');
  const fimK = F.indexOf('\nexports.', k + 10);
  const tok = F.slice(k, fimK > k ? fimK : k + 4000);

  must(/const _consumo = await db\.runTransaction\(/.test(tok),
    '⑥ o token é consumido em TRANSAÇÃO — ler e apagar deixam de ser passos separados');
  must(/tx\.delete\(ref\);\s*\n\s*return \{ ok: true/.test(tok),
    '⑥ quem consegue apagar é quem usa');
  const posConsumo = tok.indexOf('const _consumo');
  const posCred = tok.indexOf('_approvePasswordResetPhone(t.uid');
  must(posConsumo > 0 && posCred > posConsumo,
    '⑥ ⛔ a credencial só é emitida DEPOIS do consumo confirmado — antes vinha primeiro');
  must(!/await ref\.delete\(\)\.catch\(\(\) => \{\}\);/.test(tok),
    '⑥ ⛔ o apagamento com a falha engolida não existe mais nesta porta');
  must(/console\.error\("\[verifyPasswordResetPhoneToken\] consumo falhou — NÃO emito credencial:"/.test(tok),
    '⑥ e a falha do consumo é registrada, recusando em vez de seguir');
  must(/reason: "indisponivel"/.test(tok),
    '⑥ falha de banco vira recusa explícita: custa um link novo, não um link reutilizável');
})();

console.log('✅ (+ L14.P3) o link de redefinição é consumido de uma vez só — total ' + ok + ' verificações');
