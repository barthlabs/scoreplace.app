'use strict';
/* CADASTRO EMAIL RESERVA NOME — não existe “conta criada” antes do perfil.
 * node tests/cadastro-email-reserva-nome.test.js
 *
 * A função REAL de auth.js é executada em VM. A reserva do nome pertence à
 * initializeUserProfile (Function transacional); se ela disser already-exists,
 * a credencial que acabou de nascer é apagada e o usuário escolhe outro nome.
 * Isto impede tanto homônimos como contas Auth órfãs que o app não reconhece.
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
  const ordem = [], status = [], foco = { nome: 0 };
  const user = {
    uid: 'uid-novo', email: 'novo@exemplo.com',
    updateProfile: () => { ordem.push('auth-profile'); return Promise.resolve(); },
    delete: () => { ordem.push('delete-auth'); return Promise.resolve(); }
  };
  const elementos = {
    'reg-displayname': { value: 'Nome Já Existente', focus: () => { foco.nome++; } },
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
  return new Promise((resolve) => setTimeout(() => resolve({ ordem, status, foco }), 25));
}

(async () => {
  const saudavel = await executar({});
  const reserva = saudavel.ordem.indexOf('reserva:Nome Já Existente');
  const sucesso = saudavel.ordem.indexOf('status:success');
  ok(reserva !== -1, 'cadastro usa initializeUserProfile para reservar o nome');
  ok(reserva < saudavel.ordem.indexOf('auth-profile'), 'reserva acontece antes do espelho no Firebase Auth');
  ok(reserva < saudavel.ordem.indexOf('email-verificacao'), 'reserva acontece antes do e-mail de confirmação');
  ok(reserva < sucesso, 'reserva acontece antes da tela confirmar conta criada');
  ok(!saudavel.ordem.includes('delete-auth'), 'reserva saudável não apaga a credencial');

  const repetido = await executar({ conflito: true });
  ok(repetido.ordem.includes('delete-auth'), 'nome ocupado apaga a credencial recém-criada');
  ok(!repetido.ordem.includes('auth-profile'), 'nome ocupado não espelha nome no Auth');
  ok(!repetido.ordem.includes('email-verificacao'), 'nome ocupado não envia verificação');
  ok(!repetido.ordem.includes('status:success'), 'nome ocupado nunca anuncia conta criada');
  ok(repetido.status.some((s) => s.tipo === 'warning' && /nome já está em uso/i.test(s.texto)),
    'nome ocupado explica que a pessoa deve escolher outro nome');
  ok(repetido.foco.nome === 1, 'nome ocupado devolve o foco ao campo de nome');

  console.log((fail ? '❌' : '✅') + ' cadastro-email-reserva-nome: ' + pass + ' asserções, ' + fail + ' falha(s)');
  process.exit(fail ? 1 : 0);
})();
