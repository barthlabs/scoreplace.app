/* Regressão: preservar o quadro anterior durante dashboard ↔ torneio nunca pode
 * deixá-lo inerte. A falha prendia `sp-route-transitioning`, cujo CSS removia
 * pointer-events de toda a aplicação, e todos os botões paravam de responder. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const router = read('js/router.js');
const css = read('css/components.css');
const dashboard = read('js/views/dashboard.js');
const analytics = read('js/views/tournaments-analytics.js');

assert.match(router, /viewContainer\.classList\.remove\('sp-route-transitioning'\)/,
  'toda rota remove um marcador de transição que tenha ficado preso');
assert.match(router, /try\s*\{\s*renderTournaments\(viewContainer, cleanParam\);\s*\}\s*finally\s*\{[\s\S]*?_finalizarTrocaPrincipal\(\)/,
  'o caminho sem loader também finaliza dashboard → torneio');
assert.doesNotMatch(css, /#view-container\.sp-route-transitioning\s*\{\s*pointer-events\s*:\s*none/s,
  'nenhuma transição pode desabilitar todos os cliques');
assert.match(dashboard, /parts\.forEach\(function\(p\)\s*\{[\s\S]{0,280}if \(!p\) return;/,
  'a analítica da dashboard ignora lacunas transitórias do snapshot');
assert.match(analytics, /parts\.forEach\(function\(p\)\s*\{[\s\S]{0,280}if \(!p\) return;/,
  'a analítica do perfil ignora lacunas transitórias do snapshot');
console.log('✅ transicao-nao-bloqueia-cliques: 5 asserções');
