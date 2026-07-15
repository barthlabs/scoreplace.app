/* RESET POR SMS ALCANÇÁVEL — o caminho do celular não pode ficar preso atrás de um
 * elemento morto. node tests/reset-phone-reachable.test.js
 *
 * POR QUE ESTE TESTE EXISTE (jul/2026):
 * A v1.2.9 tirou o WhatsApp do servidor. Com isso o SMS virou a ÚNICA saída pra quem tem
 * e-mail que engole transacional (Hotmail/Outlook/UOL — o próprio app classifica esses
 * domínios em _isUnreliableEmailDomain). Só que o painel de reset por SMS
 * (_resetPhoneStart → _resetPhoneSend → sendPasswordResetPhone) se ancorava em
 * `#email-login-mode`, um elemento do modal de login ANTIGO, removido na v4.3.19 e que
 * não existe em lugar nenhum do repo. Resultado, confirmado AO VIVO na prod v1.2.9 com o
 * modal aberto: _resetPhoneStart() retorna undefined, não muda o DOM, e nenhum botão da
 * tela sequer a chama. O reset por SMS estava inalcançável — dead code atrás de âncora
 * morta — justo pra quem não tinha outra saída.
 *
 * O teste roda a função REAL extraída de js/views/auth.js (não uma réplica) contra um DOM
 * falso que espelha o modal ATUAL: #entrar-status presente, #email-login-mode ausente.
 * No código pré-fix ele FALHA (painel não renderiza); com o fix, PASSA.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── DOM falso mínimo ─────────────────────────────────────────────────────────
// Só o suficiente pra exercitar a ancoragem: getElementById, createElement,
// insertBefore e innerHTML. Nós registram-se por id num índice global.
function makeDom(ids) {
  const byId = {};
  function mkEl(id) {
    const el = {
      id: id || '',
      style: { cssText: '' },
      _html: '',
      parentNode: null,
      children: [],
      get innerHTML() { return this._html; },
      set innerHTML(v) {
        this._html = String(v);
        // registra ids que aparecem no HTML injetado (basta pro assert)
        const re = /id="([^"]+)"/g;
        let m;
        while ((m = re.exec(this._html))) byId[m[1]] = { id: m[1], _fromHtml: true };
      },
      focus() {},
      remove() {},
    };
    if (id) byId[id] = el;
    return el;
  }
  ids.forEach((id) => {
    const el = mkEl(id);
    el.parentNode = {
      insertBefore(node) {
        node.parentNode = el.parentNode;
        if (node.id) byId[node.id] = node;
        return node;
      },
    };
  });
  const document = {
    getElementById: (id) => byId[id] || null,
    createElement: () => mkEl(''),
  };
  return { document, byId };
}

// ── Carrega a função REAL de auth.js, sem executar o arquivo inteiro ──────────
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');
const m = src.match(/window\._resetPhoneStart = function[\s\S]*?\n};/);
if (!m) { console.error('✗ _resetPhoneStart não encontrado em js/views/auth.js'); process.exit(1); }

function runResetPhoneStart(domIds) {
  const { document, byId } = makeDom(domIds);
  const sandbox = { window: {}, document, setTimeout: () => {}, console };
  sandbox.window.document = document;
  vm.createContext(sandbox);
  vm.runInContext(m[0], sandbox);
  sandbox.window._resetPhoneStart('fulano@hotmail.com');
  return byId;
}

console.log('──── _resetPhoneStart: alcançável no modal de login ATUAL ────');

// O CASO REAL: modal atual (v4.3.19+) — tem #entrar-status, NÃO tem #email-login-mode.
// Pré-fix: âncora não existe → return → painel nunca renderiza.
{
  const byId = runResetPhoneStart(['entrar-status', 'login-identifier']);
  ok(!!byId['reset-password-panel'], 'modal ATUAL: painel de reset é criado');
  ok(!!byId['reset-phone-input'], 'modal ATUAL: campo de celular renderiza (reset por SMS alcançável)');
  ok(!!byId['reset-phone-send-btn'], 'modal ATUAL: botão "Enviar código" renderiza');
}

// Não pode regredir: onde o painel JÁ existe, segue preenchendo ele.
{
  const byId = runResetPhoneStart(['reset-password-panel']);
  ok(!!byId['reset-phone-input'], 'painel pré-existente: preenche sem precisar de âncora');
}

// Retrocompat: se um dia o modal antigo voltar, a âncora legada ainda serve.
{
  const byId = runResetPhoneStart(['email-login-mode']);
  ok(!!byId['reset-phone-input'], 'âncora legada (#email-login-mode) continua funcionando');
}

// Sem nenhuma âncora conhecida → não explode (degrada em no-op silencioso).
{
  let threw = null;
  try { runResetPhoneStart(['nada-aqui']); } catch (e) { threw = e; }
  ok(!threw, 'sem âncora: não lança exceção (degrada limpo)');
}

// ── A oferta de SMS no caminho do E-MAIL ─────────────────────────────────────
// Sem ela, "Esqueci minha senha" com Hotmail termina em "mandamos o e-mail" e ponto —
// pro provedor que o próprio app classifica como não-confiável. Roda a função REAL.
console.log('──── _entrarOfferPhoneResetHtml: saída por SMS quando o e-mail é fraco ────');
{
  const mo = src.match(/window\._entrarOfferPhoneResetHtml = function[\s\S]*?\n};/);
  ok(!!mo, '_entrarOfferPhoneResetHtml existe em auth.js');
  const md = src.match(/window\._isUnreliableEmailDomain = function[\s\S]*?\n};/);
  ok(!!md, '_isUnreliableEmailDomain existe em auth.js');

  const sb = { window: {}, console };
  vm.createContext(sb);
  vm.runInContext(md[0] + '\n' + mo[0], sb);
  sb.window._safeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const offer = sb.window._entrarOfferPhoneResetHtml;

  // Conta SEM celular → nada a oferecer (botão que não funciona só frustra).
  ok(offer('x@hotmail.com', null) === '', 'sem celular na conta → não oferece nada');
  ok(offer('x@gmail.com', '') === '', 'celular vazio → não oferece nada');

  // Conta COM celular → botão que chama o painel de SMS.
  const h = offer('fulano@hotmail.com', '(••) •••••-••11');
  ok(h.indexOf('_resetPhoneStart') !== -1, 'com celular → botão chama _resetPhoneStart');
  ok(h.indexOf('(••) •••••-••11') !== -1, 'mostra o celular mascarado (a pessoa reconhece o número)');
  ok(h.indexOf('recomendado') !== -1, 'Hotmail → SMS marcado como recomendado');
  ok(h.indexOf('segurar') !== -1, 'Hotmail → avisa que o provedor costuma segurar o e-mail');

  // Provedor OK → oferece, mas sem alarme (o e-mail provavelmente chegou).
  const g = offer('fulano@gmail.com', '(••) •••••-••11');
  ok(g.indexOf('_resetPhoneStart') !== -1, 'Gmail com celular → ainda oferece o SMS como plano B');
  ok(g.indexOf('recomendado') === -1, 'Gmail → NÃO marca como recomendado (e-mail confiável)');

  // O e-mail entra num onclick inline → aspa tem que ser escapada, senão quebra
  // o handler (e vira vetor de injeção). Regra do CLAUDE.md: barra ANTES da aspa.
  const inj = offer("a'b@hotmail.com", '(••) •••••-••11');
  ok(inj.indexOf("_resetPhoneStart('a\\'b@hotmail.com')") !== -1, "aspa no e-mail é escapada no onclick");
  const bs = offer('a\\b@hotmail.com', '(••) •••••-••11');
  ok(bs.indexOf("_resetPhoneStart('a\\\\b@hotmail.com')") !== -1, 'barra no e-mail é escapada no onclick');
}

console.log((fail ? '❌' : '✅') + ' reset-phone-reachable: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
