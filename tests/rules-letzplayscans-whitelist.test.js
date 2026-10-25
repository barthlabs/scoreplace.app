/* O acervo global do Letzplay é só leitura para clientes. A antiga whitelist
 * perdeu o sentido: um organizador podia criar um torneio próprio e escrever
 * um scan forjado de outro UID, reutilizado em todas as Análises. */
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
function ok(value, message) {
  if (value) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
}

const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const marker = 'match /letzplayScans/{scanUid} {';
const start = rules.lastIndexOf(marker); // último match = coleção global, não sandbox/torneio
const end = start < 0 ? -1 : rules.indexOf('\n    }', start);
const block = start >= 0 && end > start ? rules.slice(start, end) : '';

ok(!!block, 'match global isolado antes de examinar permissões');
ok(/allow read:\s*if request\.auth != null\s*;/.test(block), 'leitura autenticada preservada');
ok(/allow create, update:\s*if false\s*;/.test(block), 'create/update cliente fechados');
ok(/allow delete:\s*if false\s*;/.test(block), 'delete cliente fechado');
const writeRules = [...block.matchAll(/allow\s+([^:;]+):\s*if\s+([^;]+);/g)]
  .filter((match) => /\b(write|create|update|delete)\b/.test(match[1]));
ok(writeRules.length === 2 && writeRules.every((match) => match[2].trim() === 'false'),
  'não sobra outra regra de escrita no match global');

console.log((fail ? '✗' : '✓') + ' rules-letzplayscans-whitelist: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
