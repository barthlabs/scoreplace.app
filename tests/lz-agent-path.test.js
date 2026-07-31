/* O caminho do dado não passa mais por injeção a cada requisição
 * node tests/lz-agent-path.test.js
 *
 * MEDIDO em 31/jul/2026 na máquina do dono, com a aba do letzplay ABERTA e navegável:
 *   16h → a mesma requisição levou 0,4s
 *   18h → estourou 40s, para a MESMA pessoa, e zero eventos de rate-limit
 * Não era o letzplay e não era a aba. Era o intermediário: todo pedido atravessava o
 * service worker do MV3, que injetava o inject.js na aba A CADA requisição e recebia a
 * resposta por postMessage no mundo da página. O Chrome recicla esse worker quando quer;
 * morrendo no meio, a resposta some e só sobra o prazo estourar.
 */
const fs = require('fs'), path = require('path');
const R = (f) => fs.readFileSync(path.join(__dirname, '..', 'extension', f), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── o agente existe e é DECLARADO no manifest (vive com a aba) ──
const man = JSON.parse(R('manifest.json'));
const cs = (man.content_scripts || []).find((c) => (c.matches || []).some((m) => m.indexOf('letzplay.me') >= 0));
ok(!!cs, 'existe um content script declarado para letzplay.me');
ok((cs.js || []).indexOf('lz-agent.js') >= 0, 'e ele carrega o agente');
ok(cs.run_at === 'document_start', 'no document_start — pronto antes de qualquer pedido');
ok((man.host_permissions || []).some((h) => h.indexOf('letzplay.me') >= 0), 'com permissão de host pro letzplay');

// ── o agente responde a fetch e preserva os cuidados que já existiam ──
const ag = R('lz-agent.js');
ok(/chrome\.runtime\.onMessage\.addListener/.test(ag), 'o agente escuta mensagens da extensão');
ok(/msg\.url\.indexOf\('https:\/\/letzplay\.me\/'\) !== 0/.test(ag), 'e recusa URL fora do letzplay');
ok(/credentials: 'include'/.test(ag), 'o fetch leva a sessão logada');
ok(/TextDecoder\('utf-8'\)/.test(ag), 'decodifica UTF-8 na marra (o letzplay declara Latin-1)');
ok(/Just a moment/.test(ag) && /cf-mitigated/.test(ag), 'detecta o desafio do Cloudflare devolvido com status 200');
ok(/return true;/.test(ag), 'e responde de forma assíncrona');

// ── o background PREFERE o agente e mantém a injeção só como reserva ──
const bg = R('background.js');
const f = bg.slice(bg.indexOf('function fetchViaLetzplayTab'), bg.indexOf('// NAVEGA a aba do letzplay'));
ok(/chrome\.tabs\.sendMessage\(tabId, \{ type: 'lz-agent-fetch'/.test(f), 'tenta o agente primeiro');
ok(/_fetchViaInject\(url, tabId, injUrl, entregar\)/.test(f), 'e cai na injeção quando não há agente');
ok(f.indexOf('sendMessage') < f.indexOf('_fetchViaInject('), 'nessa ordem — o agente é o caminho preferido');
ok(/chrome\.runtime\.lastError/.test(f), 'aba sem agente é detectada pelo lastError, não por adivinhação');
ok(/respondido/.test(f), 'e a resposta é entregue UMA vez só (agente ou reserva, nunca as duas)');

// a reserva continua íntegra
ok(/function _fetchViaInject\(url, tabId, injUrl, cb\)/.test(bg), 'a reserva existe como função própria');
ok(/inject-timeout/.test(bg), 'com o prazo dela preservado');

console.log((fail ? '✗' : '✓') + ' lz-agent-path: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
