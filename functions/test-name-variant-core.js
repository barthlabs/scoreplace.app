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
 * DUAS POLÍTICAS OPOSTAS, e é por isso que o módulo é separado do name-unique-core:
 * cadastro por celular REJEITA (homônimo ali é quase sempre a mesma pessoa); login federado
 * adota VARIANTE (nunca bloquear a entrada). */
const V = require('./name-variant-core');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } }

// Firestore falso: só a superfície que o core usa (collection/where/limit/get).
function fakeDb(docs) {
  return {
    collection() {
      return {
        where(campo, _op, valor) {
          return {
            limit() {
              return {
                get: async () => {
                  const hits = docs.filter((d) => (d.data[campo] || null) === valor);
                  return { forEach: (cb) => hits.forEach((d) => cb({ id: d.id, data: () => d.data })) };
                },
              };
            },
          };
        },
      };
    },
  };
}
const perfil = (id, nome, extra) => ({
  id, data: Object.assign({ displayName: nome, displayName_lower: nome.toLowerCase() }, extra || {}),
});

// ── buildVariant: a forma que o cliente também produz ────────────────────────
ok('k=1 devolve o nome base', V.buildVariant('Silvia Moura', 1) === 'Silvia Moura');
ok('k=2 vira "Nome 2"', V.buildVariant('Silvia Moura', 2) === 'Silvia Moura 2');
ok('trima o base', V.buildVariant('  Nelson Barth  ', 3) === 'Nelson Barth 3');

// ── resolveUniqueName ────────────────────────────────────────────────────────
(async () => {
  // Nome livre → passa intacto (não sufixa por sufixar)
  ok('nome livre não vira variante',
    (await V.resolveUniqueName(fakeDb([]), 'Fulano', 'meu')) === 'Fulano');

  // O caso real: o nome já é de outra conta → adota a próxima variante
  const db1 = fakeDb([perfil('uOutro', 'Nelson Barth')]);
  ok('nome ocupado por OUTRO uid → "Nelson Barth 2"',
    (await V.resolveUniqueName(db1, 'Nelson Barth', 'meu')) === 'Nelson Barth 2');

  // O próprio uid não conta como conflito (re-login não renomeia ninguém)
  const db2 = fakeDb([perfil('meu', 'Nelson Barth')]);
  ok('meu próprio nome não é conflito comigo mesmo',
    (await V.resolveUniqueName(db2, 'Nelson Barth', 'meu')) === 'Nelson Barth');

  // Pula as variantes já ocupadas
  const db3 = fakeDb([perfil('u1', 'Ana'), perfil('u2', 'Ana 2'), perfil('u3', 'Ana 3')]);
  ok('pula variantes ocupadas e pega a primeira livre',
    (await V.resolveUniqueName(db3, 'Ana', 'meu')) === 'Ana 4');

  // Tombstone de fusão não segura o nome
  const db4 = fakeDb([perfil('uMorto', 'Joana', { mergedInto: 'uVivo' })]);
  ok('conta mesclada (mergedInto) não disputa o nome',
    (await V.resolveUniqueName(db4, 'Joana', 'meu')) === 'Joana');

  // 9 variantes ocupadas → sufixo do uid, que sempre encerra a busca
  const cheio = [perfil('a1', 'Ze')];
  for (let k = 2; k <= 9; k++) cheio.push(perfil('a' + k, 'Ze ' + k));
  const r = await V.resolveUniqueName(fakeDb(cheio), 'Ze', 'uid-longo-XY99');
  ok('com as 9 ocupadas cai no sufixo do uid', r === 'Ze XY99', r);

  // Placeholder não disputa unicidade
  ok('nome não-amigável passa intacto',
    (await V.resolveUniqueName(fakeDb([perfil('u', 'teste')]), 'teste', 'meu')) === 'teste');

  // Perfil legado SEM displayName_lower é achado pela 2ª consulta
  const db5 = fakeDb([{ id: 'uLegado', data: { displayName: 'Maria Legado' } }]);
  ok('acha perfil legado sem displayName_lower (consulta exata)',
    (await V.resolveUniqueName(db5, 'Maria Legado', 'meu')) === 'Maria Legado 2');

  // ── shouldIRename: quem renomeia é o RECÉM-CHEGADO ────────────────────────
  const velho = { createdAt: '2026-07-11T00:00:00Z' };
  const novoC = { uid: 'uOutro', createdAt: '2026-07-14T00:00:00Z' };
  ok('sou o mais ANTIGO → não me renomeio (quem chegou depois é que muda)',
    V.shouldIRename(velho, novoC, 'uMeu') === false);
  ok('sou o mais NOVO → eu renomeio',
    V.shouldIRename({ createdAt: '2026-07-14T00:00:00Z' }, { uid: 'u', createdAt: '2026-07-11T00:00:00Z' }, 'uMeu') === true);
  // Simultâneo/sem idade: desempate estável, e só UM dos lados renomeia
  const A = V.shouldIRename({}, { uid: 'uB' }, 'uA');
  const B = V.shouldIRename({}, { uid: 'uA' }, 'uB');
  ok('sem idade: exatamente UM dos dois renomeia (senão o nome fica órfão)', A !== B);
  ok('Timestamp-like (toMillis) também é lido',
    V.shouldIRename({ createdAt: { toMillis: () => 2000 } }, { uid: 'u', createdAt: { toMillis: () => 1000 } }, 'x') === true);

  // ── O trigger existe e respeita as travas ─────────────────────────────────
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  ok('index.js exporta o trigger enforceUniqueDisplayName',
    /exports\.enforceUniqueDisplayName\s*=\s*onDocumentWritten/.test(src));
  const bloco = src.slice(src.indexOf('exports.enforceUniqueDisplayName'), src.indexOf('scheduledAutoMergeCleanup (diário'));
  ok('ANTI-LOOP: só age quando o displayName MUDOU nesta escrita',
    /nome === String\(b\.displayName/.test(bloco));
  ok('ignora tombstone de fusão', /a\.mergedInto/.test(bloco));
  ok('ignora nome não-amigável', /isUnfriendlyName/.test(bloco));
  ok('não renomeia o estabelecido (consulta shouldIRename)', /shouldIRename\(/.test(bloco));
  ok('grava displayName_lower junto (senão a conta some das checagens futuras)',
    /denormalizeDisplayName\(/.test(bloco));
  ok('usa o módulo de VARIANTE, não o de cadastro',
    bloco.indexOf('_nameVariant.resolveUniqueName(') !== -1);

  // A separação das políticas é o que protege o cadastro — trava aqui também.
  const unique = require('./name-unique-core');
  ok('name-unique-core (cadastro) segue SEM resolvedor de variante',
    Object.keys(unique).every((k) => !/resolve|suffix|variant/i.test(k)));

  console.log(fail === 0
    ? '✅ name-variant-core: ' + pass + ' ok, 0 falharam'
    : '❌ name-variant-core: ' + fail + ' falharam, ' + pass + ' ok');
  process.exit(fail === 0 ? 0 : 1);
})();
