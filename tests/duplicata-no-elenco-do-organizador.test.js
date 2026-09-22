/* duplicata-no-elenco-do-organizador.test.js — O ORGANIZADOR PASSA A VER O PAR.
 * node tests/duplicata-no-elenco-do-organizador.test.js
 *
 * ⛔ O DEFEITO: a detecção de conta duplicada existe e pergunta à própria pessoa, mas
 * `dupSuspect` só é lido em tela de ATLETA. Quem tem as duas inscrições lado a lado — o
 * organizador — nunca era avisado. É por isso que a mesclagem falhou em todos os incidentes.
 */
const core = require('../functions/duplicate-roster-core.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; return; } fail++; console.error('  ✗ ' + m); };
const eq = (a, b, m) => ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a));

console.log('\n── elenco: quem entra, quem é contado como NÃO MEDIDO ──');
{
  const r = core.montarElenco([
    { uid: 'a', displayName: 'Rodrigo Barth' },
    { displayName: 'Convidado Sem Conta' },                  // manual: pessoa, não vaga
    { p1Uid: 'b', p2Name: 'Parceira Manual' },               // dupla MISTA
    'Ana Textual',                                            // entrada legada de fila
    { uid: 'a' },                                             // repetida
    {},                                                       // vaga
    null,
  ]);
  eq(r.uids.length, 2, 'entram os UIDs distintos (a e b — a repetida não duplica)');
  eq(r.unmeasuredCount, 3, 'manual, metade da dupla mista e a textual contam como não medidos');
  ok(r.uids.indexOf('a') !== -1 && r.uids.indexOf('b') !== -1, 'os dois UIDs certos');
}
{
  const r = core.montarElenco([{ uid: 'a' }, {}, '', null, { foo: 1 }]);
  eq(r.unmeasuredCount, 0, '⭐ VAGA não é pessoa: slot sem UID e sem nome não conta como não medido');
}

console.log('\n── a dispensa sobre dado REAL ──');
{
  const bi = core.dispensaDoPar(
    { dupDismissedInfo: [{ uid: 'b', at: '2026-09-01T10:00:00.000Z' }] },
    { dupDismissedInfo: [{ uid: 'a', at: '2026-09-10T10:00:00.000Z' }] }, 'a', 'b');
  ok(bi.dispensado, 'dispensa bilateral é reconhecida');
  eq(bi.dismissedAt, '2026-09-10T10:00:00.000Z', '⭐ vale a MAIOR data dos dois lados');
}
{
  const uni = core.dispensaDoPar(
    { dupDismissedInfo: [{ uid: 'b', at: '2026-09-01T10:00:00.000Z' }] }, {}, 'a', 'b');
  ok(uni.dispensado, '⭐ dispensa UNILATERAL conta — o `Promise.all` pode ter falhado no meio');
  eq(uni.dismissedAt, '2026-09-01T10:00:00.000Z', 'e a data é a que existe');
}
{
  const legado = core.dispensaDoPar({ dupDismissed: ['b'] }, {}, 'a', 'b');
  ok(legado.dispensado, '⭐ formato LEGADO (array de uid) conta como dispensa');
  eq(legado.dismissedAt, null, 'e a data é null, porque o legado não tem data');
}
{
  const nada = core.dispensaDoPar({}, {}, 'a', 'b');
  ok(!nada.dispensado && nada.dismissedAt === null, 'sem dispensa, nada é inventado');
}

console.log('\n── mascaramento: o organizador reconhece sem receber o dado ──');
{
  const e = core.mascararEmail('rodrigo@exemplo.com');
  ok(e && e.indexOf('rodrigo') === -1, '⭐ o e-mail NÃO volta inteiro');
  ok(e && e.indexOf('@exemplo.com') !== -1, 'mas o domínio ajuda a reconhecer');
  const t = core.mascararTelefone('11999998888');
  ok(t && t.indexOf('11999') === -1, '⭐ o telefone NÃO volta inteiro');
  eq(t.slice(-4), '8888', 'e os 4 últimos ajudam a reconhecer');
  ok(core.mascararEmail('') === null && core.mascararTelefone('123') === null, 'lixo vira null');
}

console.log('\n── enumeração de pares ──');
const P = (uid, nome, extra) => Object.assign({ uid: uid, nome: nome, perfil: {} }, extra || {});
{
  const pares = core.enumerarPares({
    pessoas: [P('a', 'Rodrigo Barth'), P('b', 'Rodrigo Barth'), P('c', 'Fernanda Lima')],
    freqTokens: {},
  });
  eq(pares.length, 1, 'só o par que se parece é enumerado');
  eq(pares[0].motivo, 'nome', 'e o motivo é o nome');
  ok(!pares[0].dispensado, 'sem dispensa registrada');
  ok(pares[0].nomes.indexOf('Fernanda Lima') === -1, 'quem não se parece fica fora');
}
{
  // ⭐ O PONTO DESTA LEVA: dispensado NÃO some da tela do organizador.
  const pares = core.enumerarPares({
    pessoas: [
      P('a', 'Rodrigo Barth', { perfil: { dupDismissedInfo: [{ uid: 'b', at: '2026-09-01T00:00:00.000Z' }] } }),
      P('b', 'Rodrigo Barth'),
    ],
    freqTokens: {},
  });
  eq(pares.length, 1, '⭐ par JÁ DISPENSADO continua aparecendo para o organizador');
  ok(pares[0].dispensado, 'marcado como dispensado');
  eq(pares[0].dismissedAt, '2026-09-01T00:00:00.000Z', 'com a data');
}
{
  // Credencial: mesmo celular CONFIRMADO dos dois lados é motivo `celular` (o motor trata).
  const comp = core.enumerarPares({
    pessoas: [
      P('a', 'Rodrigo Barth', { telefone: '11999998888', telefoneProvado: true }),
      P('b', 'Rodrigo Barth', { telefone: '11999998888', telefoneProvado: true }),
    ],
    freqTokens: {},
  });
  eq(comp.length, 1, 'mesmo celular confirmado + nomes compatíveis ⇒ par');
  eq(comp[0].motivo, 'celular', '⭐ e o motivo é CREDENCIAL, não nome');

  const semRelacao = core.enumerarPares({
    pessoas: [
      P('a', 'Rodrigo Barth', { telefone: '11999998888', telefoneProvado: true }),
      P('b', 'Fernanda Lima', { telefone: '11999998888', telefoneProvado: true }),
    ],
    freqTokens: {},
  });
  eq(semRelacao.length, 0,
    '⭐ mesmo celular + nomes SEM RELAÇÃO ⇒ NÃO forma par (casal e mãe/filho dividem número)');
}
{
  // A resposta não pode vazar identidade.
  const pares = core.enumerarPares({
    pessoas: [
      P('a', 'Rodrigo Barth', { email: 'rodrigo@x.com', telefone: '11999998888' }),
      P('b', 'Rodrigo Barth', { email: 'rodrigo@x.com', telefone: '11999998888' }),
    ],
    freqTokens: {},
  });
  const bruto = JSON.stringify(pares);
  ok(bruto.indexOf('rodrigo@x.com') === -1, '⭐ nenhum e-mail INTEIRO na resposta');
  ok(bruto.indexOf('11999998888') === -1, '⭐ nenhum telefone INTEIRO na resposta');
  ok(bruto.indexOf('"uid"') === -1, '⭐ nenhum UID na resposta');
}
{
  let lancou = false;
  try { core.enumerarPares({ pessoas: [] }); } catch (e) { lancou = true; }
  ok(lancou, '⛔ esquecer `freqTokens` é ERRO — sem ele a enumeração acha menos que o detector');
}
{
  const ordenado = core.enumerarPares({
    pessoas: [
      P('a', 'Rodrigo Barth'), P('b', 'Rodrigo Barth'),
      P('c', 'Fernanda Lima', { telefone: '1188887777', telefoneProvado: true }),
      P('d', 'Fernanda Lima', { telefone: '1188887777', telefoneProvado: true }),
    ],
    freqTokens: {},
  });
  eq(ordenado.length, 2, 'dois pares');
  ok(ordenado[0].forca >= ordenado[1].forca, '⭐ o mais forte vem primeiro — é a ordem de olhar');
}

console.log('\n── "Divulgar" do perfil vale AQUI também, inclusive para o organizador ──');
{
  const base = (uid, extra) => Object.assign({
    uid: uid, nome: 'Rodrigo Barth', perfil: {},
    email: 'rodrigo@x.com', telefone: '11999998888', telefoneProvado: true,
    telefoneCredencial: '11999998888',
    podeDivulgarEmail: true, podeDivulgarTelefone: true,
  }, extra || {});

  const liberado = core.enumerarPares({ pessoas: [base('a'), base('b')], freqTokens: {} });
  ok(liberado[0].telefoneMascarado && liberado[0].emailMascarado,
    'com os dois liberando, as duas pistas aparecem');

  const semTel = core.enumerarPares({
    pessoas: [base('a', { podeDivulgarTelefone: false }), base('b')], freqTokens: {} });
  eq(semTel[0].telefoneMascarado, null,
    '⭐ UM dos dois pedindo sigilo de telefone já apaga a pista — e o par CONTINUA aparecendo');
  ok(semTel.length === 1, 'o par não some por causa do sigilo');

  const semMail = core.enumerarPares({
    pessoas: [base('a'), base('b', { podeDivulgarEmail: false })], freqTokens: {} });
  eq(semMail[0].emailMascarado, null, '⭐ idem para o e-mail');

  const nenhum = core.enumerarPares({
    pessoas: [base('a', { podeDivulgarEmail: false, podeDivulgarTelefone: false }),
              base('b', { podeDivulgarEmail: false, podeDivulgarTelefone: false })],
    freqTokens: {} });
  ok(nenhum[0].telefoneMascarado === null && nenhum[0].emailMascarado === null,
    'com os dois pedindo sigilo, nenhuma pista sai');

  // ⛔ O NÚMERO DIGITADO PELO ORGANIZADOR NÃO É PISTA. Ele entra no comparador como
  // reforço de nome, mas expor os 4 últimos dígitos dele é expor contato de quem nunca
  // confirmou aquele número.
  const doOrganizador = core.enumerarPares({
    pessoas: [base('a', { telefoneProvado: false, telefoneCredencial: '' }),
              base('b', { telefoneProvado: false, telefoneCredencial: '' })],
    freqTokens: {} });
  eq(doOrganizador[0].telefoneMascarado, null,
    '⭐⭐ telefone NÃO confirmado (digitado pelo organizador) não vira pista, nem mascarado');
  ok(JSON.stringify(doOrganizador).indexOf('8888') === -1,
    '⭐⭐ nem os quatro últimos dígitos dele');
}

console.log('\n── slots de pessoa: a tabela do contrato, forma por forma ──');
{
  const S = require('../js/domain/participant-identity.js');
  const n = (v) => S.participantSlots(v).length;
  const manual = (v) => S.participantSlots(v).filter((x) => !x.uid).length;
  eq(n({ uid: 'a' }), 1, 'solo com uid ⇒ um slot');
  eq(n({ displayName: 'Ana' }), 1, 'solo com nome ⇒ um slot');
  eq(manual({ displayName: 'Ana' }), 1, 'e ele é manual');
  eq(n({ p1Uid: 'a', p2Uid: 'b' }), 2, 'dupla com dois uids ⇒ dois slots');
  eq(n({ p1Uid: 'a', p2Name: 'Bia' }), 2, 'dupla MISTA ⇒ dois slots');
  eq(manual({ p1Uid: 'a', p2Name: 'Bia' }), 1, '⭐ e exatamente UM deles é manual');
  eq(n({ participants: [{ uid: 'a' }, { displayName: 'Bia' }] }), 2, 'equipe composta ⇒ dois slots');
  eq(manual({ participants: [{ uid: 'a' }, { displayName: 'Bia' }] }), 1,
    '⭐ o membro TEXTUAL da equipe não desaparece (era o que `participantUids` perdia)');
  eq(n('Ana'), 1, 'entrada TEXTUAL legada ⇒ um slot');
  eq(manual('Ana'), 1, 'e ele é manual');
  eq(n({ p1Uid: 'a' }), 1, '`p1Uid` sozinho ⇒ um slot');
  eq(n({ p2Name: 'Bia' }), 1, '`p2Name` sozinho ⇒ um slot');
  eq(n(''), 0, '⭐ string vazia ⇒ NENHUM slot');
  eq(n(null), 0, '⭐ null ⇒ NENHUM slot');
  eq(n({ foo: 1 }), 0, '⭐ objeto sem uid e sem nome ⇒ NENHUM slot: é VAGA, não pessoa');
}

console.log('\n── fila COM procedência: origem preservada, e ninguém sumindo ──');
{
  const A = require('../functions/liga-availability-window.js');
  const t = {
    waitlist: ['Ana Manual'],
    standbyParticipants: [{ uid: 'u2', displayName: 'Bia' }],
    monarchWaitlist: { 'Cat A': ['Carla Manual'] },
  };
  const com = A._getWaitlistWithSource(t);
  eq(com.length, 3, 'os três storages entram');
  eq(com[2].source, 'monarchWaitlist', '⭐ a origem chega a quem lê (a porta antiga a perdia)');
  ok(com.some((x) => x.source === 'waitlist') && com.some((x) => x.source === 'standbyParticipants'),
    'e as outras duas também');
  const carla = com.filter((x) => x.source === 'monarchWaitlist')[0];
  ok(carla && JSON.stringify(carla.entry).indexOf('Carla Manual') !== -1,
    '⭐ nome MANUAL em monarchWaitlist é PESSOA — procedência não apaga ninguém da conta');
  eq(JSON.stringify(A._getWaitlist(t)), JSON.stringify(com.map((x) => x.entry)),
    '⛔ a porta antiga continua devolvendo EXATAMENTE o mesmo (não podem divergir)');
}

console.log('\n── conta viva em modo ESTRITO: erro de leitura ABORTA ──');
{
  const UV = require('../functions/user-vivo-core.js');
  const dbErro = { collection: () => ({ doc: () => ({ get: () => Promise.reject(new Error('banco piscou')) }) }) };
  const dbVazio = { collection: () => ({ doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }) };
  const provas = [];
  provas.push(UV.uidVivo(dbErro, 'a').then((r) => ok(r === '',
    '⛔ modo NORMAL com erro continua devolvendo vazio — nenhum outro chamador muda')));
  provas.push(UV.uidVivo(dbErro, 'a', { strict: true })
    .then(() => ok(false, 'modo ESTRITO tinha de LANÇAR no erro de leitura'))
    .catch((e) => ok(/banco piscou/.test(e.message),
      '⭐ modo ESTRITO LANÇA no erro de leitura REAL de users/{uid}.get()')));
  provas.push(UV.uidVivo(dbVazio, 'a', { strict: true }).then((r) => ok(r === '',
    '⭐ documento AUSENTE continua sendo resposta (vazio), não erro — ausência ≠ falha')));
  module.exports = Promise.all(provas).then(() => {
    if (fail) {
      console.error('\n❌ duplicata-no-elenco-do-organizador: ' + pass + ' ok, ' + fail + ' falharam');
      process.exit(1);
    }
    console.log('\n✅ duplicata-no-elenco-do-organizador: ' + pass + ' ok');
  });
  return;
}

if (fail) {
  console.error('\n❌ duplicata-no-elenco-do-organizador: ' + pass + ' ok, ' + fail + ' falharam');
  process.exit(1);
}
console.log('\n✅ duplicata-no-elenco-do-organizador: ' + pass + ' ok');
