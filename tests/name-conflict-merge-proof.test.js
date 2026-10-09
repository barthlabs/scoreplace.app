'use strict';

/*
 * Regressão da reserva global de displayName.
 *
 * O nome é exclusivo como apresentação, mas identidade, inscrição e mesclagem
 * continuam dependentes de UID e de credenciais comprovadas — nunca do nome.
 *
 * node tests/name-conflict-merge-proof.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else { fail++; console.error('  ✗', message); }
}
function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error('marcador inicial não encontrado: ' + startMarker);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error('marcador final não encontrado: ' + endMarker);
  return source.slice(start, end);
}

const root = path.join(__dirname, '..');
const cf = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const cli = fs.readFileSync(path.join(root, 'js', 'views', 'auth.js'), 'utf8');

const init = block(cf, 'exports.initializeUserProfile', 'exports.updateOwnProfile');
const update = block(cf, 'exports.updateOwnProfile', 'exports.updateOwnInterfacePreferences');
const availability = block(cf, 'exports.checkDisplayNameAvailability', 'exports.initializeUserProfile');
const duplicateDetector = block(cf, 'async function _detectarDuplicataNaBase', '// ─── scheduledAutoMergeCleanup');
const duplicateOnProfileWrite = block(cf, 'exports.enforceUniqueDisplayName', '// ─── scheduledAutoMergeCleanup');

ok(/reserveDisplayName/.test(init) && /already-exists/.test(init),
  'criação reserva o nome em transação e recusa homônimo');
ok(/reserveDisplayName/.test(update) && /already-exists/.test(update),
  'edição reserva o novo nome em transação e recusa homônimo');
ok(/displayNameClaimRef/.test(availability) && /claimData\.state !== "conflict"/.test(availability),
  'porta de compatibilidade consulta a reserva canônica de nome');

const modal = block(cli, 'function setupProfileModal()', 'window._profileVerifyPhone = function');
ok(!/profile-name-conflict/.test(modal),
  'perfil não tem slot visual de “nome em uso”');
const profileSave = block(cli, 'window.saveUserProfile = async function()', '// ── 2a. PRIVACIDADE × NOME');
ok(!/where\('displayName_lower'|_triggerAccountMerge/.test(profileSave) &&
  /Esse nome de exibição já está em uso/.test(cli),
  'salvar perfil deixa a reserva bloquear no servidor, sem consulta ou mesclagem por nome');
ok(!/setTimeout\(function \(\) \{ if \(typeof window\._askNameConflict/.test(cli),
  'login não abre pergunta por homônimo');
ok(!/window\._profileHydrateNameConflict\(\);/.test(cli),
  'perfil não consulta conflito de nome ao abrir');
ok(/_askDuplicateAccount/.test(cli) && /dupSuspect/.test(cli),
  'sinal de possível segunda conta continua separado do nome de exibição');
ok(/_detectarDuplicataNaBase/.test(duplicateOnProfileWrite) && /dupSuspect/.test(duplicateDetector) &&
  /normalizarTelefone/.test(duplicateDetector),
  'escrita de perfil encaminha possível segunda conta por sinal de contato, não por nome');
ok(/nunca bloqueia, renomeia ou funde automaticamente/.test(duplicateOnProfileWrite),
  'sinal de duplicata não altera contas sem revisão e prova de posse');
ok(/proofIdToken/.test(cli) && /verifyIdToken\(String\(proof\)\)/.test(cf),
  'mesclagem legítima continua exigindo prova de posse');

console.log(fail === 0
  ? '✅ name-conflict-merge-proof: ' + pass + ' ok, 0 falharam'
  : '❌ name-conflict-merge-proof: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
