#!/usr/bin/env node
/* O mesmo critério de troféu roda no navegador e no backfill. A cópia web não
 * pode envelhecer: qualquer alteração nasce em functions/casual-stats-core.js
 * e é sincronizada para js/casual-stats-core.js no mesmo commit. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/casual-stats-core.js'), 'utf8');
const browser = fs.readFileSync(path.join(root, 'js/casual-stats-core.js'), 'utf8');
if (source !== browser) {
  console.error('✗ casual-stats-core divergente: sincronize functions/casual-stats-core.js → js/casual-stats-core.js');
  process.exit(1);
}
console.log('✓ casual-stats-core sincronizado');
