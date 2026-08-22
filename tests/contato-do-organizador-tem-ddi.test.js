// O CONTATO REGISTRADO PELO ORGANIZADOR ACEITA QUALQUER PAÍS.
//
// Ordem do dono (22/ago/2026), no caso da Fabiana Ferré:
//   "tem que poder escolher o DDI porra como em qualquer outra situação de telefone."
//   "e a máscara do número deve ser preenchida automaticamente e o organizador digita
//    apenas números."
//
// O que estava errado: a tela cravava "+55" e mandava `country:'55'`, e o servidor
// (`toE164`) exigia 10 ou 11 dígitos — BR-shaped dos dois lados. Portugal (9), Chile (9) e
// Espanha (9) voltavam 'numero-invalido' por mais certos que estivessem. Pior: a tela tinha
// um TERCEIRO formatador de telefone (`_fmtBR`), só-BR, além dos dois de auth.js.
//
// ⚠️ A ARMADILHA QUE ESTE TESTE GUARDA: o DDD 55 existe (Santa Maria/RS). Deduzir "já tem
// DDI" por prefixo transforma 55987654321 — celular nacional de 11 dígitos — em +55987654321.
// O sinal de que o número já é E.164 é o '+', nunca o prefixo.
const fs = require('fs');
const path = require('path');
const core = require(path.join(__dirname, '..', 'functions', 'contact-phone-core.js'));
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

console.log('\n──── o contato do organizador aceita qualquer país ────');

// ── 1. A NORMALIZAÇÃO, rodando ──────────────────────────────────────────────
[
  ['11987300222',   '55',  '+5511987300222', 'BR celular (DDD 11)'],
  ['1199970704',    '55',  '+551199970704',  'BR 10 dígitos (legado)'],
  ['55987654321',   '55',  '+5555987654321', '⚠️ DDD 55 (Santa Maria/RS) NÃO é DDI colado'],
  ['5511987300222', '55',  '+5511987300222', '13 dígitos BR = DDI colado (dado legado)'],
  ['912345678',     '351', '+351912345678',  'Portugal 9 — ANTES dava inválido'],
  ['912345678',     '56',  '+56912345678',   'Chile 9 — ANTES dava inválido'],
  ['612345678',     '34',  '+34612345678',   'Espanha 9 — ANTES dava inválido'],
  ['2125551234',    '1',   '+12125551234',   'EUA 10'],
  ['+351912345678', '55',  '+351912345678',  "veio com '+': é E.164, o DDI da tela não manda"],
  ['123',           '55',  '',               'curto demais → recusa'],
  ['',              '55',  '',               'vazio → recusa'],
  ['1234567890123456', '55', '',             'longo demais (>15) → recusa'],
].forEach(function (c) {
  ok(core.toE164(c[0], c[1]) === c[2],
     c[3] + '  (' + c[0] + ' /' + c[1] + ' → esperado "' + c[2] + '", veio "' + core.toE164(c[0], c[1]) + '")');
});

// ── 2. A TELA: um seletor de DDI, da lista canônica ─────────────────────────
const P = fs.readFileSync(path.join(__dirname, '..', 'js/views/participants.js'), 'utf8');
const A = fs.readFileSync(path.join(__dirname, '..', 'js/views/auth.js'), 'utf8');

ok(/id="org-contact-phone-ddi"/.test(P), 'o diálogo tem seletor de DDI');
ok(/_phoneCountryOptionsHtml\(_ddiAtual\)/.test(P),
   'e as opções saem da lista CANÔNICA (auth.js), não de uma segunda tabela de países');
ok(/window\._phoneCountryOptionsHtml = function/.test(A), 'a lista canônica existe e é exposta');
ok(!/'<span style="font-weight:700;color:var\(--text-bright\);">\+55<\/span>'/.test(P),
   '⛔ o "+55" cravado saiu da tela');
ok(/country: String\(_ddi\)/.test(P), 'e o DDI escolhido é o que vai pro servidor');
ok(!/country: '55'/.test(P), '⛔ não sobrou country:"55" cravado');

// ── 3. A MÁSCARA: automática, e vinda da MESMA fonte ────────────────────────
ok(/window\._phoneMaskFor = function/.test(A), 'a máscara por país é exposta em auth.js');
ok(/window\._orgContactPhoneMask = function/.test(P), 'a tela tem o handler de máscara ao vivo');
ok(/oninput="window\._orgContactPhoneMask\(\)"/.test(P), 'que roda a cada tecla');
ok(/onchange="window\._orgContactPhoneMask\(\)"/.test(P), 'e ao trocar de país');
ok(/replace\(\/\\D\/g, ''\)/.test(P.slice(P.indexOf('window._orgContactPhoneMask'))),
   'o organizador digita SÓ números — o resto é descartado');
ok(/setSelectionRange/.test(P.slice(P.indexOf('window._orgContactPhoneMask'))),
   'e o cursor fica no fim (senão pula pro começo a cada pontuação inserida)');
ok(!/_fmtBR/.test(P), '⛔ o terceiro formatador só-BR (_fmtBR) saiu de cena');

// ── 4. O mínimo não é mais 10 cravado ───────────────────────────────────────
ok(/_minimo = \(_ddi === '55'\) \? 10 : 6/.test(P),
   'a validação da tela respeita o país (senão o seletor de DDI seria enfeite)');

// ── 5. O CHIP — DUAS COISAS DIFERENTES, não dois estados do mesmo botão ─────
// Ordem do dono (22/ago/2026): "essa merda de ícone ninguém vai ver. muito melhor era o
// escrito contato. apenas para quem NÃO tem o celular. para quem tem, o balãozinho pra
// entrar em contato direto pelo whats."
// Quem falta contato é PENDÊNCIA (tem que gritar: palavra escrita). Quem já tem não é
// pendência — ali o que serve é AÇÃO.
ok(/\$\{_telBtnC\}\$\{_vipBtnC\}/.test(P), 'o chip fica à ESQUERDA do 💎 VIP');
const chip = P.slice(P.indexOf('var _telBtnC ='), P.indexOf('var _telBtnC =') + 2600);
ok(/contato<\/button>/.test(chip), 'SEM celular: o chip é ESCRITO "contato" (ninguém vê ícone mudo)');
ok(/_orgSetContactPhone/.test(chip), 'e clicar nele leva ao registro do celular');
ok(/dashed rgba\(245,158,11/.test(chip), 'com a borda pontilhada de pendência');
ok(/wa\.me\//.test(chip), 'COM celular: vira balãozinho que abre o WhatsApp');
ok(/\\uD83D\\uDCAC/.test(chip), 'e o balãozinho é 💬, não 📱');
ok(/target="_blank"/.test(chip) && /rel="noopener"/.test(chip), 'abrindo fora, com noopener');
ok(/omitPhone !== true/.test(chip),
   '⛔ quem escondeu o número no perfil NÃO vira botão de conversa — nem pro organizador');
ok(/_telOrg/.test(chip),
   'a cor separa número digitado pela organização de número confirmado por SMS');
// e o balão nunca aparece com número vazio
ok(/_telJa/.test(chip), 'o balão só existe quando há número de verdade (>= 8 dígitos)');

// ── 6. A MÁSCARA RODANDO — o organizador digita só números e a pontuação aparece ──
(function () {
  const vm = require('vm');
  function pega(src, nome) {
    const i = src.indexOf('window.' + nome + ' = function');
    return i < 0 ? '' : src.slice(i, src.indexOf('\n};', i) + 3);
  }
  // _phoneMaskFor/_phoneDigitsFor dependem de _formatPhoneDisplay + _phoneCountries (auth.js)
  const iL = A.indexOf('var _phoneCountries = [');
  const listas = A.slice(iL, A.indexOf('];', iL) + 2);
  const fmt = A.slice(A.indexOf('function _formatPhoneDisplay'),
                      A.indexOf('\n}', A.indexOf('function _formatPhoneDisplay')) + 2);
  const w = {};
  w.window = w;
  const campo = { value: '', placeholder: '', setSelectionRange: function () {} };
  const seletor = { value: '55' };
  w.document = { getElementById: function (id) {
    return id === 'org-contact-phone-input' ? campo : (id === 'org-contact-phone-ddi' ? seletor : null);
  } };
  vm.createContext(w);
  vm.runInContext([listas, fmt, pega(A, '_phoneMaskFor'), pega(A, '_phoneDigitsFor'),
                   pega(P, '_orgContactPhoneMask')].join('\n'), w);

  function digitar(ddi, teclas) {
    seletor.value = ddi; campo.value = '';
    String(teclas).split('').forEach(function (t) { campo.value += t; w._orgContactPhoneMask(); });
    return campo.value;
  }

  ok(digitar('55', '11987300222') === '(11) 98730-0222',
     'BR: digitando 11987300222 sai "(11) 98730-0222" — veio "' + digitar('55', '11987300222') + '"');
  ok(digitar('1', '2125551234') === '(212) 555-1234',
     'EUA: 2125551234 → "(212) 555-1234" — veio "' + digitar('1', '2125551234') + '"');
  ok(digitar('351', '912345678') === '912 345 678',
     'Portugal: 912345678 → "912 345 678" — veio "' + digitar('351', '912345678') + '"');
  // letra e pontuação digitadas à mão são DESCARTADAS
  ok(digitar('55', '11abc98730-0222') === '(11) 98730-0222', 'letra e traço digitados são descartados');
  // não deixa passar do tamanho do país
  ok(digitar('55', '119873002229999').replace(/\D/g, '').length === 11, 'BR trava em 11 dígitos');
  ok(digitar('351', '9123456789999').replace(/\D/g, '').length === 9, 'Portugal trava em 9 dígitos');
  // trocar o DDI reformata o que já estava digitado
  seletor.value = '55'; campo.value = ''; '2125551234'.split('').forEach(function (t) { campo.value += t; w._orgContactPhoneMask(); });
  seletor.value = '1'; w._orgContactPhoneMask();
  ok(campo.value === '(212) 555-1234', 'trocar o país REFORMATA o número já digitado — veio "' + campo.value + '"');
  ok(/\(/.test(campo.placeholder) || campo.placeholder.length > 0, 'e o placeholder acompanha o país');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fails.length) fails.forEach(f => console.error('  ✗ ' + f));
console.log(fail === 0 ? '✅ contato-do-organizador-tem-ddi: OK' : '❌ contato-do-organizador-tem-ddi FALHOU');
process.exit(fail > 0 ? 1 : 0);
