'use strict';
/* A reconciliação de login não pode consultar fichas privadas por e-mail no navegador.
 * O único leitor é a callable, que deriva o e-mail do token e retorna uma projeção curta. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const ler = (file) => fs.readFileSync(path.join(root, file), 'utf8')
  .split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n');
const AUTH = ler('js/views/auth.js');
const DB = ler('js/firebase-db.js');
const FN = ler('functions/index.js');
let ok = 0;
const must = (value, message) => { assert.ok(value, message); ok++; console.log('  ✓ ' + message); };

console.log('\n──── fusão de login usa porta restrita ────\n');

must(!/collection\('users'\)\s*\.where\('email_lower'/.test(AUTH),
  '① ⛔ o login no navegador não pesquisa users por e-mail');
must(!/collection\('users'\)\s*\.where\('phone'/.test(AUTH),
  '① ⛔ telefone digitado ou autenticado não abre ficha privada no navegador');
must(!/carregarCandidatasDeFusaoDaConta\(\)/.test(AUTH),
  '① suspeita no login não consulta candidatas para iniciar fusão');
const crossRefStart = AUTH.indexOf('if (window._pendingCrossRefOldUid)');
const crossRefEnd = AUTH.indexOf('if (uid && window.FirestoreDB', crossRefStart);
must(crossRefStart >= 0 && crossRefEnd > crossRefStart && !/_executePhoneAccountMerge\(/.test(AUTH.slice(crossRefStart, crossRefEnd)),
  '① referência cruzada no login não chama fusão automaticamente');
must(/_callFn\('getOwnEmailMergeCandidates', \{\}\)/.test(DB),
  '② o client chama a callable sem receber e-mail como argumento');
const i = FN.indexOf('exports.getOwnEmailMergeCandidates = onCall(');
must(i >= 0, '③ a callable de reconciliação existe');
const bloco = FN.slice(i, FN.indexOf('// ─── setParticipantContactPhone', i));
must(/request\.auth\.token\.email/.test(bloco) && /email_verified !== true/.test(bloco),
  '③ o servidor exige e-mail verificado no token');
must(/where\("email_lower", "==", email\)/.test(bloco),
  '③ a consulta privada ficou confinada ao servidor');
must(/excludeUid: callerUid/.test(bloco),
  '③ a própria conta não retorna como candidata de fusão');
must(/displayName:/.test(bloco) && /acceptedTermsVersion:/.test(bloco),
  '④ a resposta usa uma projeção explícita para o bootstrap');
must(!/profile:\s*profile\b/.test(bloco),
  '④ ⛔ a callable não devolve a ficha crua');

const reintroduzido = AUTH + "\nwindow.FirestoreDB.db.collection('users').where('email_lower', '==', email);";
must(/collection\('users'\)\s*\.where\('email_lower'/.test(reintroduzido),
  '⑤ o controle prova que a trava detectaria a consulta reintroduzida');
const telefoneReintroduzido = AUTH + "\nwindow.FirestoreDB.db.collection('users').where('phone', '==', phone);";
must(/collection\('users'\)\s*\.where\('phone'/.test(telefoneReintroduzido),
  '⑤ o controle também detectaria a consulta por telefone');

console.log('\n✅ ' + ok + ' verificações');
