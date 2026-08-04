'use strict';
/* Testa functions/name-unique-core.js — nome de exibição único entre uids, no SERVIDOR.
 * Rodar:  node functions/test-name-unique-core.js
 *
 * TRAVA DE REGRESSÃO (incidente real, 02/ago/2026): "Gabriela Ferreira" tinha conta
 * Google e criou uma SEGUNDA conta homônima via celular+senha — a CF
 * registerPhonePassword gravava displayName sem NENHUMA checagem (a regra só existia
 * no cliente) e ela se inscreveu 2x no mesmo torneio. Este teste roda o cenário com
 * um Firestore fake e exige: conflito detectado, already-exists com e-mail MASCARADO
 * (nunca o cheio), e NUNCA auto-sufixo silencioso.
 *
 * Também faz VARREDURA DE CÓDIGO em index.js: a registerPhonePassword tem que passar
 * pelo core (findDisplayNameConflict + buildConflictMessage) e gravar
 * displayName_lower junto do displayName — sem o _lower a conta nova fica invisível
 * pra própria checagem. */
const fs = require('fs');
const path = require('path');
const C = require('./name-unique-core');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name); } }
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b)); }

// ── Firestore FAKE: mesma superfície que o core usa ──────────────────────────
// collection('users').where(f,'==',v).limit(n).get() → snap.forEach(doc)
function fakeDb(users, opts) {
  opts = opts || {};
  return {
    collection(coll) {
      return {
        where(field, op, value) {
          return {
            limit() {
              return {
                async get() {
                  if (opts.failField && opts.failField === field) throw new Error('índice ausente (simulado)');
                  const hits = Object.keys(users)
                    .filter((id) => (users[id] || {})[field] === value)
                    .map((id) => ({ id, data: () => users[id] }));
                  return { forEach(cb) { hits.forEach(cb); } };
                },
              };
            },
          };
        },
      };
    },
  };
}

const GOOGLE_UID = 'uid-google-gabriela-001';
const PHONE_UID = 'uid-phone-novo-cadastro';

// Perfil como o cliente grava (saveUserProfile denormaliza o _lower).
function baseUsers() {
  return {
    [GOOGLE_UID]: {
      displayName: 'Gabriela Ferreira',
      displayName_lower: 'gabriela ferreira',
      email: 'gabifer@gmail.com',
      email_lower: 'gabifer@gmail.com',
    },
  };
}

(async () => {

  // ── O INCIDENTE: cadastro por celular com o nome da conta Google ───────────
  {
    const conflict = await C.findDisplayNameConflict(fakeDb(baseUsers()), 'Gabriela Ferreira', PHONE_UID);
    ok('incidente: homônimo é DETECTADO', !!conflict);
    eq('incidente: aponta o uid da conta Google', conflict && conflict.uid, GOOGLE_UID);
    const msg = C.buildConflictMessage(conflict);
    ok('mensagem diz que o nome já está em uso', msg.indexOf('já está em uso') !== -1);
    ok('mensagem traz o e-mail MASCARADO', msg.indexOf('ga***@gmail.com') !== -1);
    ok('mensagem NUNCA vaza o e-mail cheio', msg.indexOf('gabifer@gmail.com') === -1);
    ok('mensagem sugere entrar com a conta existente', msg.indexOf('entre com ela') !== -1);
    ok('mensagem oferece escolher outro nome', msg.indexOf('outro nome') !== -1);
  }

  // ── Case-insensitive: variação de caixa não escapa ─────────────────────────
  {
    const conflict = await C.findDisplayNameConflict(fakeDb(baseUsers()), '  gabriela FERREIRA ', PHONE_UID);
    eq('caixa diferente + espaços → mesmo conflito', conflict && conflict.uid, GOOGLE_UID);
  }

  // ── Perfil SEM displayName_lower (escrito pelo servidor antes do fix) ──────
  // A registerPhonePassword antiga gravava só displayName. A 2ª consulta (exata
  // em displayName) tem que achar mesmo assim.
  {
    const users = {
      'uid-server-written': { displayName: 'Carlos Souza', phone: '+5511987654321' },
    };
    const conflict = await C.findDisplayNameConflict(fakeDb(users), 'Carlos Souza', PHONE_UID);
    eq('perfil sem _lower → achado pela consulta exata', conflict && conflict.uid, 'uid-server-written');
    const msg = C.buildConflictMessage(conflict);
    ok('sem e-mail real → cai no celular mascarado', msg.indexOf('(••) •••••-••21') !== -1);
    ok('celular cheio nunca vaza', msg.indexOf('987654321') === -1);
  }

  // ── Nome livre → sem conflito ──────────────────────────────────────────────
  {
    const conflict = await C.findDisplayNameConflict(fakeDb(baseUsers()), 'Nome Totalmente Novo', PHONE_UID);
    eq('nome livre → null', conflict, null);
  }

  // ── O PRÓPRIO uid não conflita consigo (re-cadastro / 1ª senha de OTP legado) ─
  {
    const conflict = await C.findDisplayNameConflict(fakeDb(baseUsers()), 'Gabriela Ferreira', GOOGLE_UID);
    eq('mesmo uid → null (não briga consigo mesma)', conflict, null);
  }

  // ── Tombstone de merge não segura o nome ───────────────────────────────────
  {
    const users = baseUsers();
    users[GOOGLE_UID].mergedInto = 'uid-sobrevivente';
    const conflict = await C.findDisplayNameConflict(fakeDb(users), 'Gabriela Ferreira', PHONE_UID);
    eq('conta mesclada (mergedInto) → null', conflict, null);
  }

  // ── Placeholder genérico não disputa unicidade (espelha _isUnfriendlyName) ─
  {
    const users = { 'uid-x': { displayName: 'Teste', displayName_lower: 'teste' } };
    const conflict = await C.findDisplayNameConflict(fakeDb(users), 'Teste', PHONE_UID);
    eq('"Teste" → null (não-nome, fora da disputa)', conflict, null);
    ok('isUnfriendlyName pega os placeholders', C.isUnfriendlyName('usuário') && C.isUnfriendlyName('Visitante') && !C.isUnfriendlyName('Gabriela Ferreira'));
  }

  // ── FAIL-OPEN: uma consulta quebrada não bloqueia, a outra ainda cobre ─────
  {
    const conflict = await C.findDisplayNameConflict(fakeDb(baseUsers(), { failField: 'displayName_lower' }), 'Gabriela Ferreira', PHONE_UID);
    eq('consulta _lower falha → a exata ainda acha', conflict && conflict.uid, GOOGLE_UID);
    const nada = await C.findDisplayNameConflict(
      { collection() { throw new Error('db fora do ar'); } }, 'Gabriela Ferreira', PHONE_UID);
    eq('db inteiro fora → fail-open (null, cadastro não trava por erro técnico)', nada, null);
  }

  // ── E-mail sintético NUNCA aparece na mensagem ─────────────────────────────
  {
    const users = {
      'uid-phone-only': {
        displayName: 'Ana Lima', displayName_lower: 'ana lima',
        email: 'phone_5511916936454@phone.scoreplace.app', phone: '+5511916936454',
      },
    };
    const conflict = await C.findDisplayNameConflict(fakeDb(users), 'Ana Lima', PHONE_UID);
    eq('sintético descartado do conflito', conflict && conflict.email, '');
    const msg = C.buildConflictMessage(conflict);
    ok('mensagem não menciona o sintético', msg.indexOf('phone.scoreplace.app') === -1);
    ok('mensagem cai no celular mascarado', msg.indexOf('(••) •••••-••54') !== -1);
  }

  // ── Sem e-mail e sem celular → mensagem genérica, ainda pt-BR e acionável ──
  {
    const msg = C.buildConflictMessage({ uid: 'x', email: '', phone: '' });
    ok('genérica: já está em uso + outro nome', msg.indexOf('já está em uso') !== -1 && msg.indexOf('outro nome') !== -1);
  }

  // ── NUNCA auto-sufixar: o core não expõe resolvedor de variante ("Nome 2") ─
  {
    const exported = Object.keys(C);
    ok('core NÃO exporta auto-sufixo (resolveUnique*/suffix*)',
      exported.every((k) => !/resolve|suffix|variant/i.test(k)));
    // E a mensagem de conflito nunca propõe o nome sufixado pronto:
    const msg = C.buildConflictMessage({ uid: 'x', email: 'a@b.com', phone: '' });
    ok('mensagem não entrega variante pronta ("Gabriela Ferreira 2")', !/\d"?\s*$/.test(msg.trim()) && msg.indexOf(' 2') === -1);
  }

  // ── denormalizeDisplayName: contrato do saveUserProfile do cliente ─────────
  {
    const prof = { phone: '+5511999998888' };
    C.denormalizeDisplayName(prof, '  Gabriela Ferreira ');
    eq('displayName trimado', prof.displayName, 'Gabriela Ferreira');
    eq('displayName_lower junto', prof.displayName_lower, 'gabriela ferreira');
    const intacto = { phone: '+55' };
    C.denormalizeDisplayName(intacto, '');
    ok('nome vazio não toca o payload', !('displayName' in intacto) && !('displayName_lower' in intacto));
  }

  // ── VARREDURA DE CÓDIGO: a CF passa pelo core (a fiação é o fix) ───────────
  {
    const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    const start = src.indexOf('exports.registerPhonePassword');
    ok('registerPhonePassword existe', start !== -1);
    const end = src.indexOf('exports.', start + 10);
    const block = src.slice(start, end === -1 ? src.length : end);
    ok('CF consulta o conflito via core (findDisplayNameConflict)', block.indexOf('findDisplayNameConflict') !== -1);
    ok('CF rejeita com already-exists', block.indexOf('"already-exists"') !== -1);
    ok('CF usa a mensagem do core (buildConflictMessage)', block.indexOf('buildConflictMessage') !== -1);
    ok('CF grava displayName_lower junto (denormalizeDisplayName)', block.indexOf('denormalizeDisplayName') !== -1);
    ok('index.js importa o core', src.indexOf('require("./name-unique-core")') !== -1);
  }

  console.log((fail === 0 ? '✅' : '❌') + ' name-unique-core: ' + pass + ' ok, ' + fail + ' falha(s)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
