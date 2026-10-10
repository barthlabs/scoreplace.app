'use strict';
/* CADASTRO EMAIL CRIA PERFIL — não existe “conta criada” antes do perfil.
 * node tests/cadastro-email-reserva-nome.test.js
 *
 * A função REAL de auth.js é executada em VM. `initializeUserProfile` pertence
 * ao servidor e fixa o perfil ao UID autenticado; nome é apresentação exclusiva
 * reservada na mesma transação. Se a criação do perfil falhar por qualquer motivo, a credencial
 * que acabou de nascer é apagada para não deixar uma conta Auth órfã.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
const INICIO = SRC.indexOf('window._entrarDoRegister = function(mode, raw, password) {');
const FIM = SRC.indexOf('\n};', INICIO) + 3;
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  ✗ ' + msg); } }
ok(INICIO !== -1 && FIM > INICIO, 'encontrou _entrarDoRegister real');
const CODIGO = SRC.slice(INICIO, FIM);

function executar(op) {
  const ordem = [], status = [];
  const user = {
    uid: 'uid-novo', email: 'novo@exemplo.com',
    updateProfile: () => { ordem.push('auth-profile'); return Promise.resolve(); },
    delete: () => { ordem.push('delete-auth'); return Promise.resolve(); }
  };
  const elementos = {
    'reg-displayname': { value: 'Nome Já Existente', focus() {} },
    'reg-password-confirm': { value: 'senha' }
  };
  const win = {
    _entrarStatus: (texto, tipo) => { status.push({ texto, tipo }); ordem.push('status:' + tipo); },
    _resetEntrarUI: () => { ordem.push('reset-ui'); },
    _warn() {}, _error() {},
    FirestoreDB: {
      initializeUserProfile: (perfil) => {
        ordem.push('reserva:' + perfil.displayName);
        return op.conflito
          ? Promise.reject({ code: 'already-exists', message: 'nome ocupado' })
          : Promise.resolve({ data: { existing: false } });
      }
    }
  };
  win.window = win;
  const sb = {
    window: win, console, Promise, Error, String, Object, Array, JSON, Date,
    document: { getElementById: (id) => elementos[id] || null },
    firebase: { auth: () => ({ createUserWithEmailAndPassword: () => {
      ordem.push('create-auth'); return Promise.resolve({ user });
    } }) },
    _sendRichVerificationEmail: () => { ordem.push('email-verificacao'); }
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(CODIGO, sb, { filename: 'auth-real.js' });
  sb.window._entrarDoRegister('email', 'NOVO@EXEMPLO.COM', 'senha');
  return new Promise((resolve) => setTimeout(() => resolve({ ordem, status }), 25));
}

(async () => {
  const saudavel = await executar({});
  const reserva = saudavel.ordem.indexOf('reserva:Nome Já Existente');
  const sucesso = saudavel.ordem.indexOf('status:success');
  ok(reserva !== -1, 'cadastro usa initializeUserProfile para criar o perfil do UID');
  ok(reserva < saudavel.ordem.indexOf('auth-profile'), 'perfil é criado antes do espelho no Firebase Auth');
  ok(reserva < saudavel.ordem.indexOf('email-verificacao'), 'perfil é criado antes do e-mail de confirmação');
  ok(reserva < sucesso, 'perfil é criado antes da tela confirmar conta criada');
  ok(!saudavel.ordem.includes('delete-auth'), 'criação saudável não apaga a credencial');

  const repetido = await executar({ conflito: true });
  ok(repetido.ordem.includes('delete-auth'), 'falha ao criar perfil apaga a credencial recém-criada');
  ok(!repetido.ordem.includes('auth-profile'), 'falha não espelha nome no Auth');
  ok(!repetido.ordem.includes('email-verificacao'), 'falha não envia verificação');
  ok(!repetido.ordem.includes('status:success'), 'falha nunca anuncia conta criada');
  ok(repetido.status.some((s) => s.tipo === 'warning' && /nome de exibição já está em uso/i.test(s.texto)),
    'reserva recusada explica que o nome de exibição é exclusivo');

  console.log((fail ? '❌' : '✅') + ' cadastro-email-reserva-nome: ' + pass + ' asserções, ' + fail + ' falha(s)');
  process.exit(fail ? 1 : 0);
})();
