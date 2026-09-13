'use strict';
/* ⛔ O REGISTRO DO ORGANIZADOR CADUCA QUANDO A PESSOA PROVA O PRÓPRIO NÚMERO.
 *
 * Ordem do dono (13/set/2026): _"o telefone digitado pelo organizador só deve existir
 * enquanto a pessoa nao autenticou seu telefone. depois que ela autenticou seu telefone o
 * registro do organizador fica superado. o registro do organizador é apenas para que o
 * whatsapp da pessoa seja alcancado pelos outros jogadores para facilitar a combinacao dos
 * jogos. apenas para isso."_
 *
 * ⛔ O QUE ACONTECIA: só UM dos dois caminhos de prova limpava os carimbos. Quem entrava pelo
 * cadastro com telefone gravava o número PROVADO e deixava o selo de "posto por terceiro"
 * para trás — a conta ficava com telefone verificado E carimbo de organizador, e as travas de
 * identidade seguiam recusando o que já tinha sido provado.
 *
 * ⭐ A regra passou a morar num lugar só. Caminho novo nasce certo por usar a mesma porta, em
 * vez de alguém lembrar de apagar três campos.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const C = require(path.join(raiz, 'functions/contact-phone-core.js'));

console.log('\n──── o telefone do organizador caduca ────\n');

// ── ① a porta existe e apaga os TRÊS campos ────────────────────────────────
const FV = { delete: () => '<DEL>' };
const r = C.apagarCarimboDeTerceiro(FV);
must(typeof C.apagarCarimboDeTerceiro === 'function', '① existe uma porta só para isso');
['phoneSource', 'phoneSetBy', 'phoneSetAt'].forEach((k) => {
  must(r[k] === '<DEL>', '① ⭐ ela apaga `' + k + '` — os três juntos, nunca um esquecido');
});
must(Object.keys(r).length === 3, '① e só esses três — não mexe em mais nada do perfil');

// ── ② os DOIS caminhos de prova usam a porta ──────────────────────────────
const FN = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
const codigo = FN.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const usos = (codigo.match(/apagarCarimboDeTerceiro\(/g) || []).length;
must(usos === 2, '② ⭐⭐ os DOIS caminhos que provam um número usam a porta (achados: ' + usos + ')');

const iReg = codigo.indexOf('registerPhonePassword');
const bloco = codigo.slice(iReg, codigo.indexOf('return { ok: true };', iReg));
must(/apagarCarimboDeTerceiro/.test(bloco),
  '② ⭐ o cadastro com telefone — que era o caminho ESQUECIDO — limpa o carimbo');

// ── ③ ninguém apaga os campos na mão ──────────────────────────────────────
must(!/phoneSource: _FV\.delete\(\)/.test(codigo) && !/phoneSource: admin\.firestore\.FieldValue\.delete\(\)/.test(codigo),
  '③ ⛔ nenhum caminho apaga os três na mão — é assim que um fica para trás');

// ── ④ o registro do organizador continua existindo para o que serve ───────
must(typeof C.computeSetContactPhone === 'function' && typeof C.isIdentityPhone === 'function',
  '④ a porta de registrar contato continua lá — ela existe para o WhatsApp alcançar a pessoa');
must(/'ja-tem-verificado'/.test(fs.readFileSync(path.join(raiz, 'functions/contact-phone-core.js'), 'utf8')),
  '④ ⭐ e quem JÁ verificou por SMS não pode ter o número trocado pelo organizador');

console.log('\n✅ ' + ok + ' verificações');
