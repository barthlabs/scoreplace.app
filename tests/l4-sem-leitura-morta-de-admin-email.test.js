'use strict';
/* L4.P8 — o documento público carrega e-mail, e `functions/index.js` ainda LIA `t.adminEmails`
 * para jogar fora: 7 declarações mortas, resíduo da 2.0.107 (quando os caminhos por e-mail
 * saíram das CFs e a autorização virou `_isTournamentOrgCaller`, uid puro). Mais 3 de
 * `coHostUids`, mortas pelo mesmo motivo e nas mesmas funções.
 *
 * ⭐ A LEVA SEGUINTE CHEGOU (25/set/2026, LGPD). As três asserções que este gate deixava
 * ESTACIONADAS — "a escrita derivada continua", "a fusão ainda troca o e-mail", "a migração de
 * uid ainda troca" — viraram o CONTRÁRIO: os três campos deixaram de ser gravados, porque o
 * documento é legível SEM LOGIN em 76 dos 78 torneios e nenhuma Rule decide por eles.
 * ⛔ O que FICOU: a troca de UID nas duas migrações. Ela é o conserto (sem ela a pessoa fica
 * presa à conta absorvida) e mora no mesmo bloco de onde o e-mail saiu — apagar o bloco inteiro
 * era o erro fácil, e este gate existe para que ninguém o cometa ao "limpar" de novo.
 */
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const arquivo = path.join(__dirname, '..', 'functions', 'index.js');
const src = fs.readFileSync(arquivo, 'utf8');
let ok = 0;
function must(v, m) { assert.ok(v, m); ok++; console.log('  ✓ ' + m); }

const mortas = src.match(/^\s*const adminEmails = Array\.isArray\(t\.adminEmails\)/gm) || [];
must(mortas.length === 0, 'nenhuma leitura morta de `t.adminEmails` (declarada e nunca usada) — havia 7');

const coHost = src.match(/^\s*const coHostUids = Array\.isArray\(t\.coHosts\)/gm) || [];
must(coHost.length === 0, 'nenhuma declaração morta de `coHostUids` — havia 3');

// ⛔ AGORA É O CONTRÁRIO: nenhum caminho grava o campo derivado.
must(!/upd\.adminEmails\s*=/.test(src),
  'a escrita de `adminEmails` SAIU — nem a transferência de organização a recompõe (LGPD)');

// A porta de autorização segue sendo a de uid — se ela sumisse, o gate acima viraria decoração.
must((src.match(/_isTournamentOrgCaller\(/g) || []).length >= 7,
  'a autorização continua passando por `_isTournamentOrgCaller` (uid puro)');

// Os dois campos SAÍRAM das duas migrações...
must(!/update\.creatorEmail\s*=/.test(src),
  'fusão de conta NÃO propaga mais `creatorEmail` (o torneio não guarda endereço)');
must(!/update\.organizerEmail\s*=/.test(src),
  'migração de uid NÃO propaga mais `organizerEmail`');

// ...mas a TROCA DE UID ficou nas duas. É o conserto, e é o que não se pode apagar junto.
must(/update\.creatorUid = callerUid/.test(src),
  '⛔ a reivindicação de conta AINDA troca o uid do criador — sem isso a pessoa fica presa à conta absorvida');
must(/uid: callerUid \}\);[\s\S]{0,240}?\["email", "phone", "name", "displayName"\]/.test(src),
  '⛔ e o registro de co-organização que a troca grava vai SANEADO: uid sim, endereço e nome não');

console.log('✅ L4.P8: ' + ok + ' asserções — leitura morta de e-mail fora, escrita derivada e migração de identidade intactas');
