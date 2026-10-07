'use strict';
/* Testa functions/name-variant-core.js + o trigger enforceUniqueDisplayName.
 * Rodar:  node functions/test-name-variant-core.js
 *
 * O DEFEITO QUE ISTO FECHA (medido em produção, 04/ago/2026): "dois uids nunca têm o mesmo
 * nome" já era regra em 4 pontos, mas 3 são do CLIENTE (auto-variante no primeiro login,
 * gate do perfil, isDisplayNameTaken) e fail-open de propósito; o único no servidor era a
 * registerPhonePassword, que cobre só cadastro por celular+senha. **Login com Google/Apple
 * não passava por checagem nenhuma no servidor.** O auto-variante entrou em 24/jun e mesmo
 * assim nasceram contas homônimas em 11/jul, 14/jul, 17/jul e 30/jul (Nelson Barth, Silvia
 * Moura Ferreira, Eduardo Mange). Não era falta de displayName_lower (todas têm), nem
 * permissão (as rules liberam a consulta), nem nome vazio do provedor — era a lei morar
 * num lugar que pode simplesmente não rodar. Cânone roda no SERVIDOR.
 *
 * O contrato atual separa apresentação de identidade: homônimos são válidos. O
 * trigger do servidor só mantém índices e pode levantar `dupSuspect`; ele não
 * reserva nome, não renomeia e não funde contas. */
const V = require('./name-variant-core');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } }

// ── buildVariant: forma sugestões, não uma decisão de cadastro ───────────────
ok('k=1 devolve o nome base', V.buildVariant('Silvia Moura', 1) === 'Silvia Moura');
ok('k=2 vira "Nome 2"', V.buildVariant('Silvia Moura', 2) === 'Silvia Moura 2');
ok('trima o base', V.buildVariant('  Nelson Barth  ', 3) === 'Nelson Barth 3');
ok('o módulo NÃO exporta auto-resolvedor de nome', typeof V.resolveUniqueName === 'undefined');

(async () => {
  // ── O trigger existe e mantém apenas índice/sinal privado ──────────────────
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  ok('index.js exporta o trigger enforceUniqueDisplayName',
    /exports\.enforceUniqueDisplayName\s*=\s*onDocumentWritten/.test(src));
  const bloco = src.slice(src.indexOf('exports.enforceUniqueDisplayName'), src.indexOf('scheduledAutoMergeCleanup (sinais'));
  ok('ANTI-LOOP: só escreve chaves quando elas divergem do esperado',
    /const divergiu =/.test(bloco) && /if \(divergiu\)/.test(bloco));
  ok('ignora tombstone de fusão', /a\.mergedInto/.test(bloco));
  ok('NÃO renomeia mais em silêncio (a variante automática saiu do trigger)',
    bloco.indexOf('_nameVariant.resolveUniqueName(') === -1);
  ok('não cria reserva nem nameConflict por homônimo',
    !/collection\("displayNameClaims"\)|nameConflict:\s*\{/.test(bloco));
  ok('sinaliza só possível segunda conta, sem bloquear',
    /dupSuspect/.test(bloco) && /_mudouIdent/.test(bloco));

  // A separação das políticas é o que protege o cadastro — trava aqui também.
  const unique = require('./name-unique-core');
  ok('name-unique-core (cadastro) segue SEM resolvedor de variante',
    Object.keys(unique).every((k) => !/resolve|suffix|variant/i.test(k)));
  const clientDb = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
  ok('o cliente também NÃO oferece auto-resolvedor de nome',
    !/resolveUniqueDisplayName\s*\(/.test(clientDb));

  console.log(fail === 0
    ? '✅ name-variant-core: ' + pass + ' ok, 0 falharam'
    : '❌ name-variant-core: ' + fail + ' falharam, ' + pass + ' ok');
  process.exit(fail === 0 ? 0 : 1);
})();
