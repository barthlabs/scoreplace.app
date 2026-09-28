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
 * A política atual é única: cadastro/edição recusam homônimo; login federado entra mas
 * recebe a pergunta para confirmar a conta ou escolher outro nome. "Nome 2" só pode ser
 * uma sugestão visível, nunca uma decisão automática. */
const V = require('./name-variant-core');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } }

// ── buildVariant: forma sugestões, não uma decisão de cadastro ───────────────
ok('k=1 devolve o nome base', V.buildVariant('Silvia Moura', 1) === 'Silvia Moura');
ok('k=2 vira "Nome 2"', V.buildVariant('Silvia Moura', 2) === 'Silvia Moura 2');
ok('trima o base', V.buildVariant('  Nelson Barth  ', 3) === 'Nelson Barth 3');
ok('o módulo NÃO exporta auto-resolvedor de nome', typeof V.resolveUniqueName === 'undefined');

(async () => {
  // ── shouldIReceiveConflict: pergunta só para quem acabou de chegar ─────────
  const velho = { createdAt: '2026-07-11T00:00:00Z' };
  const novoC = { uid: 'uOutro', createdAt: '2026-07-14T00:00:00Z' };
  ok('sou o mais ANTIGO → não me renomeio (quem chegou depois é que muda)',
    V.shouldIReceiveConflict(velho, novoC, 'uMeu') === false);
  ok('sou o mais NOVO → eu renomeio',
    V.shouldIReceiveConflict({ createdAt: '2026-07-14T00:00:00Z' }, { uid: 'u', createdAt: '2026-07-11T00:00:00Z' }, 'uMeu') === true);
  // Simultâneo/sem idade: desempate estável, e só UM dos lados renomeia
  const A = V.shouldIReceiveConflict({}, { uid: 'uB' }, 'uA');
  const B = V.shouldIReceiveConflict({}, { uid: 'uA' }, 'uB');
  ok('sem idade: exatamente UM dos dois renomeia (senão o nome fica órfão)', A !== B);
  ok('Timestamp-like (toMillis) também é lido',
    V.shouldIReceiveConflict({ createdAt: { toMillis: () => 2000 } }, { uid: 'u', createdAt: { toMillis: () => 1000 } }, 'x') === true);

  // ── O trigger existe e respeita as travas ─────────────────────────────────
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  ok('index.js exporta o trigger enforceUniqueDisplayName',
    /exports\.enforceUniqueDisplayName\s*=\s*onDocumentWritten/.test(src));
  const bloco = src.slice(src.indexOf('exports.enforceUniqueDisplayName'), src.indexOf('scheduledAutoMergeCleanup (sinais'));
  ok('ANTI-LOOP: só age quando o displayName MUDOU nesta escrita',
    /nome === String\(b\.displayName/.test(bloco));
  ok('ignora tombstone de fusão', /a\.mergedInto/.test(bloco));
  ok('ignora nome não-amigável', /isUnfriendlyName/.test(bloco));
  ok('não pergunta ao estabelecido (consulta shouldIReceiveConflict)', /shouldIReceiveConflict\(/.test(bloco));
  // ⚠️ DUAS ASSERÇÕES REVOGADAS DE PROPÓSITO em 05/ago/2026 (v1.7.37).
  // Elas exigiam que o trigger ADOTASSE a variante ("Nome 2") — gravando displayName_lower
  // pelo denormalizeDisplayName e chamando _nameVariant.resolveUniqueName.
  //
  // O dono trocou a política: _"o certo, invés de criar 'Gabriela Ferreira 2', é indicar o
  // nome que já existe, indicando com ****email/celular e perguntar se é a mesma pessoa.
  // Autentica se for e mescla. Se não for, que a pessoa indique um nome válido e livre."_
  //
  // Além de esconder a pergunta, a variante CEGAVA a detecção de inscrição duplicada, que
  // compara nome idêntico: com o "2" gravado, a segunda conta da mesma pessoa nunca mais
  // casaria com a primeira. O trigger agora SINALIZA (`nameConflict`, mascarado) e quem
  // decide é a pessoa — ver functions/test-duplicate-person-core.js, que trava o novo
  // comportamento (não renomeia, sinaliza, e limpa o sinal quando o conflito acaba).
  //
  // O que essas asserções protegiam de verdade continua travado logo abaixo: a separação
  // entre o módulo de CADASTRO e o de VARIANTE.
  ok('NÃO renomeia mais em silêncio (a variante automática saiu do trigger)',
    bloco.indexOf('_nameVariant.resolveUniqueName(') === -1);
  ok('sinaliza o conflito com contato MASCARADO em vez de renomear',
    /nameConflict/.test(bloco) && /maskedEmail/.test(bloco));

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
