'use strict';
/*
 * name-unique-core.js — nome de exibição ÚNICO entre uids, checado NO SERVIDOR.
 *
 * POR QUE existe (incidente real, 02/ago/2026): a regra "dois uids nunca têm o mesmo
 * displayName" morava SÓ no cliente (js/firebase-db.js: isDisplayNameTaken /
 * resolveUniqueDisplayName). A CF registerPhonePassword gravava o nome direto em
 * users/{uid} sem checar nada — e uma usuária com conta Google "Gabriela Ferreira"
 * criou uma SEGUNDA conta homônima via celular+senha e se inscreveu 2x no mesmo
 * torneio. Cânone roda no servidor ([[project_canon_runs_on_server]]); o cliente é
 * conveniência, a CF é o gate.
 *
 * DECISÃO (do prompt do dono): homônimo em cadastro novo por celular é quase sempre
 * a MESMA pessoa que já tem conta — por isso o conflito REJEITA com already-exists
 * e sugere entrar com a conta existente (e-mail mascarado). NUNCA auto-sufixar
 * silenciosamente ("Gabriela Ferreira 2") aqui: isso criaria a duplicata de novo,
 * só que com nome maquiado.
 *
 * DUAS CONSULTAS, não uma: o índice canônico é `displayName_lower` (denormalizado
 * pelo saveUserProfile do cliente), mas perfis escritos pelo PRÓPRIO servidor antes
 * deste fix (a registerPhonePassword gravava displayName sem o _lower) e perfis
 * legados não têm o campo — a consulta exata em `displayName` cobre esses. Quem
 * grava nome no servidor a partir daqui DEVE gravar também displayName_lower
 * (ver denormalizeDisplayName), fechando o buraco pra frente.
 *
 * REGRA: nada de firebase/admin importado — o db entra por parâmetro (superfície
 * mínima: collection().where().limit().get()), pra rodar em teste com um fake.
 * Fail-open POR CONSULTA (espelha o cliente): erro técnico de query não pode
 * bloquear cadastro ([[feedback_enrollment_fail_open]] — mesma filosofia).
 */

const _dupPerson = require('./duplicate-person-core.js');

// Espelha window._isUnfriendlyName (store.js): só placeholders genéricos são
// "não-nome" e ficam fora da disputa de unicidade. Telefone/e-mail como nome é
// identificador válido de conta phone-only (v1.8.60) — mas também não disputa
// unicidade de NOME DE PESSOA, então tratamos igual ao cliente: passa direto.
function isUnfriendlyName(name) {
  if (!name) return true;
  const n = String(name).trim().toLowerCase();
  if (!n) return true;
  const BAD = ['usuário', 'usuario', 'user', 'teste', 'test', 'undefined', 'null', 'anon', 'anônimo', 'visitante'];
  return BAD.indexOf(n) !== -1;
}

// E-mail sintético de conta phone-only NUNCA aparece pra usuário (espelha
// _isSyntheticEmail de index.js/store.js).
function isSyntheticEmail(email) {
  return typeof email === 'string' && /@phone\.scoreplace\.app$/i.test(email.trim());
}

// Máscaras — mesmas de index.js (_maskEmail/_maskPhone). Duplicadas aqui de
// propósito: index.js não é require-ável em teste (inicializa admin/secrets).
function maskEmail(email) {
  if (!email || String(email).indexOf('@') < 0) return null;
  const parts = String(email).split('@');
  const local = parts[0];
  const head = local.slice(0, Math.min(2, local.length));
  return head + '***@' + parts[1];
}
function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return null;
  return '(••) •••••-••' + d.slice(-2);
}

// PURO: decide o conflito a partir dos docs retornados. Ignora o próprio uid e
// tombstones de merge (mergedInto) — espelha isDisplayNameTaken do cliente.
// Retorna { uid, email, phone } do dono do nome, ou null.
function pickConflict(docs, myUid) {
  for (const d of (Array.isArray(docs) ? docs : [])) {
    if (!d || !d.id || d.id === myUid) continue;
    const data = d.data || {};
    if (data.mergedInto) continue;
    const rawEmail = data.email || data.email_lower || '';
    return {
      uid: d.id,
      email: (rawEmail && !isSyntheticEmail(rawEmail)) ? rawEmail : '',
      phone: data.phone || '',
      // createdAt entra pro desempate de QUEM renomeia numa colisão simultânea
      // (ver shouldIRename). Aditivo: quem só lê uid/email/phone não é afetado.
      createdAt: data.createdAt || null,
    };
  }
  return null;
}

// Consulta o Firestore (Admin SDK ou fake com a mesma superfície) e devolve o
// conflito, ou null. Fail-open por consulta.
async function findDisplayNameConflict(db, name, myUid) {
  const nm = String(name == null ? '' : name).trim();
  if (!nm || !db) return null;
  if (isUnfriendlyName(nm)) return null;
  const tries = [
    ['displayName_lower', nm.toLowerCase()], // índice canônico (cliente denormaliza)
    ['displayName', nm],                     // perfis sem o _lower (server-written/legado)
  ];
  const seen = {};
  const docs = [];
  for (const t of tries) {
    try {
      const snap = await db.collection('users').where(t[0], '==', t[1]).limit(8).get();
      snap.forEach((doc) => {
        if (seen[doc.id]) return;
        seen[doc.id] = true;
        docs.push({ id: doc.id, data: doc.data() });
      });
    } catch (e) { /* fail-open — tenta a próxima consulta */ }
  }
  return pickConflict(docs, myUid);
}

// Mensagem do already-exists (pt-BR). Prefere apontar a conta existente pelo
// e-mail mascarado (é quase sempre a MESMA pessoa); sem e-mail real cai no
// celular mascarado; sem nenhum, genérica. Nunca vaza o valor cheio.
function buildConflictMessage(conflict) {
  const me = conflict && maskEmail(conflict.email);
  const mp = conflict && maskPhone(conflict.phone);
  if (me) {
    return 'Este nome já está em uso por uma conta cadastrada com o e-mail ' + me +
      '. Se essa conta é sua, entre com ela (dá pra vincular o celular depois, no perfil). ' +
      'Se não é, escolha outro nome de exibição.';
  }
  if (mp) {
    return 'Este nome já está em uso por uma conta cadastrada com o celular ' + mp +
      '. Se essa conta é sua, entre com ela. Se não é, escolha outro nome de exibição.';
  }
  return 'Este nome já está em uso por outra conta. Se essa conta é sua, entre com ela. ' +
    'Se não é, escolha outro nome de exibição.';
}

// Denormaliza o par displayName/displayName_lower num payload de perfil — o MESMO
// contrato do saveUserProfile do cliente. Todo write de nome no servidor passa
// por aqui pra que a conta seja encontrável pelas checagens futuras.
function denormalizeDisplayName(profilePayload, displayName) {
  const nm = String(displayName == null ? '' : displayName).trim();
  if (!nm) return profilePayload;
  profilePayload.displayName = nm;
  profilePayload.displayName_lower = nm.toLowerCase();
  // v1.8.3 — CHAVES DE BUSCA DE DUPLICATA. `displayName_lower` é `toLowerCase()` cru:
  // preserva acento, ponto e espaço, então "Dėbora Castello" nunca casa com "Debora
  // Castello" e "M.Delia" nunca casa com "MDelia". Era esse o furo pelo qual duas pessoas
  // ficaram com duas contas cada no MESMO torneio (Confra, 11/ago/2026) — a comparação
  // sabia resolver, mas a consulta nunca entregava o candidato. Estas chaves são geradas
  // pela MESMA função que compara, pra que buscar e comparar deixem de divergir.
  // Ver [[project_duplicate_detection_two_normalizations]].
  profilePayload.displayName_keys = _dupPerson.chavesDeBusca(nm);
  profilePayload.displayName_lastkey = _dupPerson.chaveSobrenome(nm);
  profilePayload.displayName_firstkey = _dupPerson.chavePrimeiroNome(nm);
  return profilePayload;
}

// ⚠️ AUTO-SUFIXO NÃO MORA AQUI, DE PROPÓSITO — e há teste travando o export.
// No CADASTRO por celular (o consumidor deste módulo) homônimo é quase sempre a MESMA
// pessoa: sufixar criaria a duplicata de novo, só que com nome maquiado. A variante
// automática é política do LOGIN FEDERADO e vive em name-variant-core.js, que importa a
// detecção daqui. Manter separado é o que impede a registerPhonePassword de ter a
// ferramenta errada ao alcance.

module.exports = {
  isUnfriendlyName,
  isSyntheticEmail,
  maskEmail,
  maskPhone,
  pickConflict,
  findDisplayNameConflict,
  buildConflictMessage,
  denormalizeDisplayName,
};
