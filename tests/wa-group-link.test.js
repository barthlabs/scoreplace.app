/* GRUPO DO JOGO NO WHATSAPP — parser do link de convite — node tests/wa-group-link.test.js
 *
 * Congela `window._waGrpNormalizeLink` (wa-group.js, código REAL) — a fonte única do que o app
 * aceita como link de grupo. É o ponto onde um erro é INVISÍVEL na UI:
 *   • aceitar lixo  → grava m.waGroup.link e todo mundo vê "Abrir grupo" que não abre nada;
 *   • recusar bom   → o jogador que montou o grupo trava sem entender o porquê.
 *
 * Os dois formatos que o WhatsApp REALMENTE produz e que o usuário cola:
 *   • "Convidar via link → Copiar"       → URL limpa
 *   • "Convidar via link → Compartilhar" → URL com texto em volta ("Entre no meu grupo...: <url>")
 * Recusar o 2º seria um bug real de UX — a pessoa não distingue os dois botões do WhatsApp.
 */
const H = require('./headless.js');
const W = H.window;

// wa-group.js só DEFINE funções no topo (nada de document no escopo do módulo), então
// carrega limpo no harness headless. O parser é puro — sem AppStore, sem DOM, sem Firestore.
H.load('wa-group.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const f = W._waGrpNormalizeLink;
const CODE = 'HxK9mQ2vT7pLd3ZaB';
const URL = 'https://chat.whatsapp.com/' + CODE;

ok(typeof f === 'function', '[wa-link] _waGrpNormalizeLink existe');

// ── A) o que o WhatsApp produz de verdade ────────────────────────────────────
ok(f(URL) === URL, '[wa-link] "Copiar link" (URL limpa) → aceita');
ok(f('  ' + URL + '  ') === URL, '[wa-link] espaços em volta (colagem) → aceita');
ok(f('Entre no meu grupo de WhatsApp: ' + URL) === URL,
  '[wa-link] "Compartilhar link" (texto em volta) → extrai a URL');
ok(f(URL + '\n\nvia WhatsApp') === URL, '[wa-link] texto DEPOIS da URL → extrai');
ok(f(URL + '?mode=ac_t') === URL, '[wa-link] query string do WhatsApp → normaliza pro link canônico');

// ── B) o que NÃO pode passar ─────────────────────────────────────────────────
ok(f('') === '', '[wa-link] vazio → recusa');
ok(f(null) === '', '[wa-link] null → recusa (sem throw)');
ok(f(undefined) === '', '[wa-link] undefined → recusa (sem throw)');
ok(f('https://chat.whatsapp.com/') === '', '[wa-link] sem código → recusa');
ok(f('https://chat.whatsapp.com/abc') === '', '[wa-link] código curto demais (<6) → recusa');
ok(f('https://scoreplace.app/#dashboard') === '', '[wa-link] outra URL qualquer → recusa');
ok(f('https://wa.me/5511999998888') === '', '[wa-link] wa.me (conversa 1:1, NÃO é grupo) → recusa');
ok(f('chat.whatsapp.com/' + CODE) === '', '[wa-link] sem https → recusa (exigimos o esquema)');
ok(f('http://chat.whatsapp.com/' + CODE) === '', '[wa-link] http (não-TLS) → recusa');
ok(f('https://chat.whatsapp.evil.com/' + CODE) === '', '[wa-link] domínio parecido → recusa');

// ── C) normalização: o link gravado é SEMPRE canônico ────────────────────────
// Duas colagens diferentes do MESMO grupo têm que gravar a MESMA string — senão a
// checagem "já existe um grupo?" (prev.link !== link) dispara confirmação à toa.
ok(f(URL) === f('Entre no meu grupo: ' + URL + ' agora'),
  '[wa-link] colagens diferentes do mesmo grupo → MESMA string gravada');
ok(f(URL + '?mode=ac_t') === f(URL), '[wa-link] com e sem query → MESMA string gravada');

// ── D) códigos reais variam em tamanho/alfabeto ──────────────────────────────
ok(f('https://chat.whatsapp.com/ABCDEF') === 'https://chat.whatsapp.com/ABCDEF', '[wa-link] código de 6 → aceita (limite inferior)');
ok(f('https://chat.whatsapp.com/Kz9-_aB3xY7QwErTyUiOp') === 'https://chat.whatsapp.com/Kz9-_aB3xY7QwErTyUiOp',
  '[wa-link] código longo com - e _ → aceita');

console.log((fail === 0 ? '✓' : '✗') + ' wa-group-link: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
