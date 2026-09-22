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

if (fail) {
  console.error('\n❌ duplicata-no-elenco-do-organizador: ' + pass + ' ok, ' + fail + ' falharam');
  process.exit(1);
}
console.log('\n✅ duplicata-no-elenco-do-organizador: ' + pass + ' ok');
