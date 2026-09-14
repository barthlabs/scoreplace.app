'use strict';
/* ⛔ DESFAZER A FUSÃO — as regras que não podem ceder. */
const D = require('./desfazer-fusao-core.js');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n); } };
const DIA = 24 * 3600 * 1000;

console.log('\n──── desfazer fusão ────\n');

// ── ① o prazo ──────────────────────────────────────────────────────────────
const agora = Date.UTC(2026, 8, 13);
ok('feita hoje → dentro do prazo', D.dentroDoPrazo(agora, agora));
ok('29 dias → ainda dá', D.dentroDoPrazo(agora - 29 * DIA, agora));
ok('30 dias exatos → ainda dá (o dia 30 é inteiro)', D.dentroDoPrazo(agora - 30 * DIA, agora));
ok('31 dias → acabou', !D.dentroDoPrazo(agora - 31 * DIA, agora));
/* ⛔ Sem carimbo, a resposta é NÃO. Uma porta que mexe em duas contas não pode tratar
 * "não sei quando foi" como "pode". */
ok('⛔ sem carimbo → NÃO desfaz', !D.dentroDoPrazo(null, agora) && !D.dentroDoPrazo(0, agora));
ok('carimbo corrompido → NÃO desfaz', !D.dentroDoPrazo('ontem', agora));
ok('restam 30 no dia da fusão', D.diasQueRestam(agora, agora) === 30);
ok('restam 5 no 25º dia', D.diasQueRestam(agora - 25 * DIA, agora) === 5);
ok('nunca negativo', D.diasQueRestam(agora - 90 * DIA, agora) === 0);

// ── ② o que se guarda ao desligar ──────────────────────────────────────────
const conta = {
  email: 'ela@gmail.com', emailVerified: true, phoneNumber: '+5511988906144',
  providerData: [{ providerId: 'apple.com', uid: 'sub-apple-1' }, { providerId: 'phone', uid: '+5511988906144' }],
};
const plano = D.planejarDesligamento(conta);
ok('② guarda o e-mail e o celular', plano.guardado.email === 'ela@gmail.com' && plano.guardado.phoneNumber === '+5511988906144');
/* ⛔ O provedor federado não volta sozinho: repor exige o identificador dele, que só existe
 * enquanto a conta existe. Ler depois seria tarde. */
ok('② ⭐⭐ guarda o identificador do provedor federado (só existe agora)',
  plano.guardado.provedores.some((p) => p.providerId === 'apple.com' && p.uid === 'sub-apple-1'));
ok('② ⭐ e a conta é DESLIGADA, não apagada', plano.desligar.disabled === true);
ok('② ⭐ soltando a credencial, que é o que precisava ficar livre',
  plano.desligar.email === null && plano.desligar.phoneNumber === null);

// ── ③ a volta só devolve o que a união levou ───────────────────────────────
const volta = D.planejarVolta(plano.guardado,
  { email: 'ela@gmail.com', phoneNumber: '' });
ok('③ devolve o e-mail, que a sobrevivente recebeu na união', volta.paraOAbsorvido.email === 'ela@gmail.com');
ok('③ e religa a conta', volta.paraOAbsorvido.disabled === false);
/* ⛔⛔ A trava que impede roubar login: o celular NÃO foi levado pela união (a sobrevivente já
 * tinha o dela). Devolvê-lo tiraria dela um login que sempre foi seu. */
ok('③ ⛔⛔ NÃO devolve o celular, que a união não levou',
  volta.paraOAbsorvido.phoneNumber === undefined && volta.tirarDaSobrevivente.phoneNumber === undefined);
ok('③ e tira da sobrevivente só o que veio emprestado', volta.tirarDaSobrevivente.email === null);
ok('③ os provedores federados vão junto', volta.provedores.length === 2);

// ── ④ devolver campo que não existia é REMOVER, não gravar nulo ────────────
const rev = D.reverterCampos({ friends: ['a'], apelido: null }, '<DEL>');
ok('④ campo que existia volta com o valor de antes', JSON.stringify(rev.friends) === '["a"]');
ok('④ ⭐ campo que NÃO existia volta como remoção — gravar nulo deixaria lixo',
  rev.apelido === '<DEL>');

// ── ⑤ o registro cabe no documento ─────────────────────────────────────────
const muitos = Array.from({ length: 500 }, (_, i) => ({ col: 'tournaments', id: 't' + i, antes: { memberUids: ['x'.repeat(200)] } }));
const fatias = D.fatiar(muitos, 50000);
ok('⑤ o registro grande é cortado em pedaços', fatias.length > 1);
ok('⑤ ⭐ e nenhum pedaço passa do limite',
  fatias.every((f) => JSON.stringify(f).length <= 50000 || f.length === 1));
ok('⑤ sem perder nenhuma anotação', fatias.reduce((a, f) => a + f.length, 0) === 500);
ok('⑤ registro pequeno continua num pedaço só', D.fatiar([{ col: 'x', id: 'y', antes: {} }]).length === 1);
ok('⑤ registro vazio não vira pedaço nenhum', D.fatiar([]).length === 0);

console.log('\ndesfazer-fusao-core: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
