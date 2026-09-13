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
/* ⛔ A RÉGUA É A PROPRIEDADE, NÃO A CONTAGEM. A versão anterior exigia exatamente 2 usos e
 * ficou vermelha assim que um terceiro caminho legítimo nasceu — um portão que reprova o
 * conserto certo não protege nada. O que importa: TODO lugar que grava um número PROVADO
 * apaga o carimbo do organizador no mesmo movimento. */
const gravamProvado = [];
/* A forma de uma gravação de PERFIL é `phone` + `phoneCountry` juntos — é isso que a
 * distingue dos registros de recuperação, que também carregam um `phone`. */
const re = /phone:\s*[^,{}]+,\s*phoneCountry:/g;
let m;
while ((m = re.exec(codigo)) !== null) {
  /* A GRAVAÇÃO INTEIRA, não só o objeto: a porta entra por `Object.assign`, ou seja FORA
   * das chaves. Recortar no fecha-chaves deixava o conserto certo de fora e reprovava. */
  const ini = codigo.lastIndexOf('{', m.index);
  const fim = codigo.indexOf(';', m.index);
  gravamProvado.push(codigo.slice(ini, fim < 0 ? codigo.length : fim));
}
must(gravamProvado.length >= 2,
  '② achei os lugares que gravam um número já provado (' + gravamProvado.length + ')');
gravamProvado.forEach((b, i) => {
  must(/apagarCarimboDeTerceiro/.test(b),
    '② ⭐⭐ gravação nº' + (i + 1) + ' de número provado apaga o carimbo do organizador junto');
});

// ── ③ ninguém apaga os campos na mão ──────────────────────────────────────
must(!/phoneSource: _FV\.delete\(\)/.test(codigo) && !/phoneSource: admin\.firestore\.FieldValue\.delete\(\)/.test(codigo),
  '③ ⛔ nenhum caminho apaga os três na mão — é assim que um fica para trás');

// ── ④ o registro do organizador continua existindo para o que serve ───────
must(typeof C.computeSetContactPhone === 'function' && typeof C.isIdentityPhone === 'function',
  '④ a porta de registrar contato continua lá — ela existe para o WhatsApp alcançar a pessoa');
must(/'ja-tem-verificado'/.test(fs.readFileSync(path.join(raiz, 'functions/contact-phone-core.js'), 'utf8')),
  '④ ⭐ e quem JÁ verificou por SMS não pode ter o número trocado pelo organizador');

console.log('\n✅ ' + ok + ' verificações');
