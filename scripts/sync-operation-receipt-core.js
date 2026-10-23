'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = path.join(root, 'functions/operation-receipt-core.js');
const target = path.join(root, 'functions-autodraw/operation-receipt-core.js');
const expected = fs.readFileSync(source);
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || !expected.equals(fs.readFileSync(target))) {
    console.error('operation-receipt-core fora de sincronia; rode node scripts/sync-operation-receipt-core.js');
    process.exitCode = 1;
  } else console.log('✓ contrato de recibos sincronizado');
} else {
  fs.writeFileSync(target, expected);
  console.log('✓ contrato de recibos copiado');
}
