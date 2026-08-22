/* O BOTÃO "Verificar" TEM QUE ACENDER — e o empurrão do login volta TODO DIA.
 * node tests/celular-botao-verificar-acende.test.js
 *
 * A FALHA REAL QUE ISTO REPRODUZ (medida no código em 22/ago/2026):
 * O botão "Verificar" era ESTÁTICO — `js/views/auth.js` só decidia o `display` dele
 * por "já está verificado?", e NADA reagia ao que a pessoa digitava. Ao lado ficava o
 * botão SALVAR, grande e verde. Quem digitava o número e apertava Salvar não gravava
 * nada: o cânone exige verificação (v2.5.x, `_phoneChangedUnverified` NÃO persiste o
 * campo). A pessoa saía da tela achando que tinha cadastrado o celular.
 *
 * Isso não é hipótese: em 22/ago a base tinha 116 de 249 contas (46,6%) sem celular,
 * e a Confra 39 de 146 — depois de uma campanha de e-mail diária desde 18/ago.
 *
 * O teste dirige as FUNÇÕES REAIS extraídas do auth.js (não réplicas) contra um DOM
 * de mentira, e cobra os três comportamentos que o dono pediu em 22/ago/2026:
 *   1. número incompleto → botão APAGADO e clique inerte (não dispara SMS);
 *   2. número completo   → botão ACESO e clicável;
 *   3. o empurrão do login volta 1× POR DIA (era 7 dias) e nunca trava a pessoa.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── extrai o CÓDIGO REAL das duas funções do botão ───────────────────────────
const i0 = SRC.indexOf('window._profilePhoneDigitsOk = function');
const i1 = SRC.indexOf('window._profileFocusPhone = function');
ok(i0 !== -1, 'não achei _profilePhoneDigitsOk no auth.js');
ok(i1 !== -1 && i1 > i0, 'não achei _profileFocusPhone depois dela');
// Aborta LIMPO quando as funções não existem (é o estado do código ANTES do
// conserto). Sem isso o teste estoura com TypeError e a saída não diz o que houve.
if (i0 === -1 || i1 === -1 || i1 <= i0) {
  console.error('\n✗ as funções do botão "Verificar" não existem no auth.js — ' +
    'é exatamente a falha que este teste cobre (botão estático, sem reagir ao que se digita).');
  process.exit(1);
}
const CODIGO = SRC.slice(i0, i1);

// ── DOM mínimo: só o que essas funções tocam ─────────────────────────────────
function montarDom(digits, ddi, verificado) {
  const btn = { id: 'profile-phone-verify-btn', disabled: false, style: {}, title: '',
    _attrs: {}, setAttribute(k, v) { this._attrs[k] = v; }, getAttribute(k) { return this._attrs[k]; } };
  const inp = { id: 'profile-edit-phone', value: '', _attrs: { 'data-digits': digits },
    getAttribute(k) { return this._attrs[k]; }, setAttribute(k, v) { this._attrs[k] = v; } };
  const sel = { id: 'profile-phone-country', value: ddi || '55' };
  const mapa = { 'profile-phone-verify-btn': verificado ? null : btn, 'profile-edit-phone': inp, 'profile-phone-country': sel };
  const win = {};
  vm.createContext(win);
  vm.runInContext('var window = this;\n' + CODIGO, win);
  win.document = { getElementById: (id) => mapa[id] || null };
  // as funções leem `document` global dentro do vm
  vm.runInContext('this.document = this.document;', win);
  return { win, btn, inp, sel };
}
function sync(digits, ddi) {
  const d = montarDom(digits, ddi, false);
  vm.runInContext('this._profilePhoneSyncVerifyBtn();', d.win);
  return d.btn;
}

console.log('\n== 1. a REGRA de número válido ==');
{
  const { win } = montarDom('', '55', false);
  const okf = (dig, ddi) => vm.runInContext(`this._profilePhoneDigitsOk(${JSON.stringify(dig)}, ${JSON.stringify(ddi)})`, win);
  ok(okf('11987654321', '55') === true,  'BR com 11 dígitos (celular com 9) é válido');
  ok(okf('1132654321', '55')  === true,  'BR com 10 dígitos (fixo) é válido');
  ok(okf('119876543', '55')   === false, 'BR com 9 dígitos NÃO é válido — é o número pela metade');
  ok(okf('', '55')            === false, 'campo vazio não é válido');
  ok(okf('1198765432100', '55') === false, 'BR com 13 dígitos não é válido (digitou demais)');
  ok(okf('12345678', '1')     === true,  'fora do BR o piso é 8 — não inventamos regra de país que não conhecemos');
  ok(okf('1234567', '1')      === false, 'fora do BR, 7 dígitos ainda é pouco');
}

console.log('\n== 2. A FALHA ORIGINAL: número incompleto não pode convidar ao clique ==');
{
  const btn = sync('11987', '55');
  ok(btn.disabled === true, 'incompleto → botão DESABILITADO');
  ok(btn.getAttribute('aria-disabled') === 'true', 'incompleto → aria-disabled=true (leitor de tela também precisa saber)');
  ok(btn.style.cursor === 'not-allowed', 'incompleto → cursor não convida');
  ok(!btn.style.boxShadow || btn.style.boxShadow === 'none', 'incompleto → sem brilho');
  ok(/Digite o número completo/.test(btn.title || ''), 'incompleto → o title DIZ o que falta');
}

console.log('\n== 3. número completo ACENDE ==');
{
  const btn = sync('11987654321', '55');
  ok(btn.disabled === false, 'completo → botão habilitado');
  ok(btn.getAttribute('aria-disabled') === 'false', 'completo → aria-disabled=false');
  ok(btn.style.cursor === 'pointer', 'completo → cursor convida');
  ok(!!btn.style.boxShadow && btn.style.boxShadow !== 'none', 'completo → ACENDE (brilho)');
  ok(btn.style.color === '#fff', 'completo → texto em contraste cheio');
}

console.log('\n== 4. o botão apagado não pode disparar SMS ==');
{
  ok(/if\(this\.disabled\)return;\s*window\._profileVerifyPhone/.test(SRC.replace(/\s+/g, ' ').replace(/if\(this\.disabled\) return;/, 'if(this.disabled)return;')) ||
     /this\.disabled/.test(SRC.slice(SRC.indexOf("id=\\'profile-phone-verify-btn\\'") - 400, SRC.indexOf("id=\\'profile-phone-verify-btn\\'") + 400)) ||
     SRC.indexOf('if(this.disabled)return; window._profileVerifyPhone') !== -1,
    'o onclick do botão guarda contra disabled — senão o teclado/leitor dispara SMS com número pela metade');
}

console.log('\n== 5. estado inicial: nasce certo, não só depois da 1ª tecla ==');
{
  ok(/_profilePhoneSyncVerifyBtn\(\);[\s\S]{0,40}\n/.test(SRC.slice(SRC.indexOf("if (_hint) _hint.style.display"), SRC.indexOf("if (_hint) _hint.style.display") + 400)),
    'o render chama a sincronização — quem chega com número preenchido não vê botão apagado');
}

console.log('\n== 6. o empurrão do login: 1× POR DIA, e nunca trava ==');
{
  const i = SRC.indexOf('window._askSecureContact = function');
  const j = SRC.indexOf('window._askDuplicateAccount = function');
  ok(i !== -1 && j > i, 'achei _askSecureContact');
  const bloco = SRC.slice(i, j);
  ok(!/7 \* 24 \* 3600000/.test(bloco), 'o cooldown de 7 DIAS saiu');
  ok(/getFullYear\(\)[\s\S]{0,160}getDate\(\)/.test(bloco), 'a chave carrega o DIA de calendário (não timestamp) — 23h55 e 00h05 não gastam a cota das duas');
  ok(/if \(cu\.phone\) return;/.test(bloco), 'quem JÁ tem celular nunca vê o empurrão');
  ok(/dupSuspect \|\| cu\.nameConflict/.test(bloco), 'não aparece em cima de outra pergunta');
  ok(/cancelText: 'Agora não'/.test(bloco), 'dá pra fechar — o pedido do dono foi explícito: NÃO trava a pessoa');
  ok(/WhatsApp/.test(bloco), 'o texto diz que o celular é o WhatsApp');
  ok(/jogos são[\s\S]{0,20}combinados|combinados/.test(bloco), 'o texto diz PRA QUE serve: marcar jogo');
  ok(/segurança e autenticidade/.test(bloco), 'o texto explica POR QUE verificamos');
  ok(/celular de outra pessoa/.test(bloco), 'o texto cita o número de terceiro');
  ok(/erro de digitação/.test(bloco), 'o texto cita o erro de digitação silencioso');
  ok(/_profileFocusPhone/.test(bloco), 'o "Cadastrar agora" usa a PORTA ÚNICA do scroll, não um hash solto');
}

console.log('\n== 7. a porta única existe e tolera ser chamada de fora da rota ==');
{
  const i = SRC.indexOf('window._profileFocusPhone = function');
  const j = SRC.indexOf('window._profileShowPhoneEdit = function');
  const bloco = SRC.slice(i, j);
  ok(i !== -1 && j > i, 'achei _profileFocusPhone antes de _profileShowPhoneEdit');
  ok(/window\.location\.hash !== '#profile'/.test(bloco), 'navega quando chamada de fora do perfil');
  ok(/_tentativas > 40/.test(bloco), 'o polling DESISTE — setInterval eterno é pior que não rolar');
  ok(/_profileShowPhoneEdit\(\)/.test(bloco), 'abre a edição: quem já tem número vê a linha de exibição, não o campo');
  ok(/scrollIntoView/.test(bloco), 'rola até o campo');
  ok(/sp-phone-alvo/.test(bloco), 'realça — o perfil é comprido e o campo fica no meio');
}

console.log('\n== 8. o realce existe nos DOIS temas ==');
{
  const CSS = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
  ok(/\.sp-phone-alvo\s*\{/.test(CSS), 'a classe existe');
  ok(/\[data-theme="light"\]\s*\.sp-phone-alvo/.test(CSS), 'tem variante do tema CLARO — brilho de escuro some no fundo branco');
  ok(/prefers-reduced-motion[\s\S]{0,180}sp-phone-alvo/.test(CSS), 'respeita quem pediu menos animação');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções passaram');
process.exit(fail ? 1 : 0);
