'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const start = source.indexOf('async function _repairTournaments');
const end = source.indexOf('async function _executeMergeInterno', start);
const repair = source.slice(start, end);
const phoneStart = source.indexOf('exports.mergePhoneAccount');
const phoneEnd = source.indexOf('// ─── fixMergedParticipants', phoneStart);
const phoneMerge = source.slice(phoneStart, phoneEnd);
let failures = 0;
function ok(condition, label) { console.log((condition ? '✓ ' : '✗ ') + label); if (!condition) failures++; }

ok(/_uidSweep\.remapUid\(t, dropUid, keepUid\)/.test(repair),
  'fusão canônica remapeia referências estruturais pelo UID');
ok(!/p1Email|p2Email|String\(p\.email/.test(repair),
  'fusão canônica não escolhe participante nem regrava contato por e-mail');
ok(/if \(c && c\.uid === oldUid\)/.test(phoneMerge),
  'fusão por telefone reconhece coorganizador exclusivamente pelo UID');
ok(!/const pEmail/.test(phoneMerge) && !/oldEmail && pEmail/.test(phoneMerge),
  'fusão por telefone não troca inscrição por e-mail ou nome de apresentação');
ok(/upd\.p1Uid === oldUid \|\| upd\.p2Uid === oldUid/.test(phoneMerge),
  'fusão por telefone preserva a atualização dos dois slots UID da dupla');
ok(/if \(oldUid && callerUid\)/.test(phoneMerge) &&
   /const projectedName = newName \|\| oldName/.test(phoneMerge),
  'jogos são reendereçados pelo UID mesmo quando o nome de apresentação não muda');
ok(/const hasUid = s\.uid === oldUid \|\| s\.playerUid === oldUid \|\| s\.participantUid === oldUid/.test(phoneMerge) &&
   /if \(typeof w === "string"\) return w;/.test(phoneMerge),
  'classificação e espera legadas sem UID não são apropriadas por coincidência de nome');

process.exit(failures ? 1 : 0);
