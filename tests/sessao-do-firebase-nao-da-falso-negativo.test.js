'use strict';
/* ⛔ O GATE DE SESSÃO NÃO PODE CONFIAR NO EXIT CODE DO `firebase --json`.
 *
 * MEDIDO em 12/set/2026, com a sessão VÁLIDA (o comando imprime o JSON certo):
 *     firebase projects:list --json   →   stdout '"status": "success"'   ·   exit code 2
 * O teste antigo era `if ! firebase projects:list --json >/dev/null 2>&1`, então TODO deploy
 * abortava com "FIREBASE NÃO AUTENTICADO" — horas perdidas, e um pedido de `login --reauth`
 * que não resolvia nada porque não havia nada a resolver.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const sh = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-hosting.sh'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

must(/_FB_SESSAO="\$\(firebase projects:list --json 2>\/dev\/null \|\| true\)"/.test(sh),
  '⛔ a saída é CAPTURADA antes (com `|| true`) — o exit code 2 do CLI não decide nada');
must(/printf '%s' "\$_FB_SESSAO" \| grep -q '"status": \*"success"'/.test(sh),
  'e a sessão é julgada pela RESPOSTA do comando');
must(!/firebase projects:list --json 2>\/dev\/null \| grep/.test(sh),
  '⛔ e não por um cano direto: com `set -o pipefail` o cano herda o 2 e o falso negativo volta');
must(!/if ! firebase projects:list --json >\/dev\/null 2>&1; then/.test(sh),
  'e o teste por exit code (falso negativo) não voltou');
must(/FIREBASE NÃO AUTENTICADO/.test(sh), 'a trava continua existindo — o que mudou é COMO ela decide');
must(sh.indexOf('conferindo a sessão do Firebase') < sh.indexOf('FIREBASE NÃO AUTENTICADO'),
  'e ela continua ANTES da suíte: descobrir sessão morta depois de minutos de teste é o que ela evita');

// ⛔ E o MESMO CLI sai não-zero DEPOIS de publicar: com `set -e` o script morria após o upload,
// deixando o ar novo e o `main` atrás — o oposto do que a trava de alinhamento protege.
must(/firebase deploy --only hosting --project scoreplace-app \|\| _DEPLOY_RC=\$\?/.test(sh),
  '⛔ o upload não derruba o script pelo código de saída — quem julga é a conferência no ar');
must(sh.indexOf('_DEPLOY_RC') < sh.indexOf('conferindo o ar'),
  'e a conferência no ar vem logo depois, como juíza');

console.log('✅ ' + ok + ' asserções — sessão do Firebase medida pela resposta');
