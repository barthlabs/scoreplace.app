'use strict';
/* A submissão à Apple não pode voltar a depender de uma escolha manual na UI.
 * A 2.3.27 foi aprovada com releaseType MANUAL e teria ficado parada; a regra
 * permanente é: toda versão ainda pendente precisa estar AFTER_APPROVAL e a
 * submissão recusa seguir se a API não confirmar esse estado. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const asc = fs.readFileSync(path.join(raiz, 'scripts/asc.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
let ok = 0;
const must = (value, message) => { assert.ok(value, message); ok++; console.log('  ✓ ' + message); };

const iCheck = asc.indexOf("if (cmd === 'checar-auto')");
const iAuto = asc.indexOf("if (cmd === 'auto')");
const iSubmit = asc.indexOf("if (cmd === 'submeter')");
must(iCheck > 0 && iAuto > iCheck && iSubmit > iAuto,
  'há uma auditoria explícita antes dos comandos que corrigem ou submetem');
const helper = asc.slice(asc.indexOf('const pendentesManuais'), iCheck);
const check = asc.slice(iCheck, iAuto);
must(/appStoreState !== 'READY_FOR_SALE'/.test(helper) && /releaseType !== 'AFTER_APPROVAL'/.test(helper) && /pendentesManuais\(vs\.data\)/.test(check),
  'a auditoria só aceita versões pendentes configuradas para publicar após aprovação');
must(/process\.exit\(1\)/.test(check),
  'versão pendente MANUAL interrompe o fluxo em vez de só emitir aviso');
must(/node scripts\/asc\.js auto --apply/.test(check),
  'a falha informa a correção automatizada rastreável');

const submit = asc.slice(iSubmit);
must(/releaseType: 'AFTER_APPROVAL'/.test(submit),
  'a criação e a normalização de versão pedem lançamento automático');
must(/a Apple não confirmou AFTER_APPROVAL/.test(submit),
  'a resposta ao PATCH é conferida, não assumida');
must(/recuso submeter \$\{versao\} sem lançamento automático AFTER_APPROVAL/.test(submit),
  'a submissão falha fechada se a versão não estiver automática');
must(pkg.scripts['apple:check-auto'] === 'node scripts/asc.js checar-auto',
  'o comando operacional permanente está exposto no package.json');

console.log('✅ lançamento automático após aprovação — ' + ok + ' verificações');
