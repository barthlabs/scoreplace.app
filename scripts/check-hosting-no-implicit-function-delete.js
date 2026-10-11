#!/usr/bin/env node
/* Trava: deploy de Hosting não pode apagar Functions por efeito colateral. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const hosting = fs.readFileSync(path.join(__dirname, 'deploy-hosting.sh'), 'utf8');
const retirement = fs.readFileSync(path.join(__dirname, 'retire-obsolete-functions.sh'), 'utf8');
let failed = false;
function check(ok, text) { if (!ok) { failed = true; console.error('✗ ' + text); } else console.log('✓ ' + text); }
check(!/functions:delete/.test(hosting), 'Hosting não contém exclusão de Function');
check(/retire-obsolete-functions\.sh --confirm-retire-obsolete/.test(hosting), 'Hosting orienta ação explícita quando encontra endpoint aposentado');
check(/--confirm-retire-obsolete/.test(retirement), 'aposentadoria exige confirmação explícita');
check(/functions:delete/.test(retirement), 'script dedicado contém a única exclusão declarada');
if (failed) process.exit(1);
