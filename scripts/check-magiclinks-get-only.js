#!/usr/bin/env node
/* check-magiclinks-get-only.js — TRAVA ESTÁTICA: a leitura de `magicLinks` no CLIENTE é
 * `.doc(token).get()` e nada mais.   (L4.P4, 2.1.78)
 *
 * POR QUE ESTA TRAVA EXISTE. A regra passou a ser `allow get` + `allow list: if false`
 * (firestore.rules), fechando a enumeração pública. Isso só é seguro de manter enquanto
 * nenhum cliente precisar de `list`/query — e "precisar" é uma propriedade do CÓDIGO, não
 * uma promessa. Se alguém amanhã escrever um `.where(...)` sobre a coleção, a chamada morre
 * com permission-denied em produção, e nas lojas morre num app que já não recebe
 * atualização. Esta trava acusa isso no `npm test`, antes de qualquer publicação.
 *
 * ⚠️ POR QUE ELA ANDA O DISCO E NÃO USA `grep -r`. Medido na L4.P3: o `grep` recursivo
 * deste ambiente é `ugrep --ignore-files` — ele RESPEITA o `.gitignore`, e os bundles
 * embarcados estão ignorados (`android/.gitignore:96`, `ios/.gitignore:4`). Para
 * `casualMatches`, `grep -r` via 19 arquivos e o disco tinha 61. Uma trava de
 * compatibilidade que não enxerga os bundles das lojas não é trava de compatibilidade.
 *
 * O QUE ELA EXIGE, para CADA ocorrência de `collection('magicLinks')` fora de `functions/`:
 *   ① a chamada seguinte é `.doc(` e depois `.get(`;
 *   ② não há `.where(`, `.orderBy(`, `.limit(`, `.startAt(` nem `.onSnapshot(` na cadeia;
 *   ③ não há `.get()` direto na coleção (que é list).
 * `functions/` fica de fora de propósito: o Admin SDK ignora as rules, e a limpeza agendada
 * usa `where("expiresAt","<",now)` legitimamente.
 *
 * Uso:  node scripts/check-magiclinks-get-only.js       (roda no `npm test`)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

const PULAR = new Set(['node_modules', '.git', '.claude', 'vendor', 'dist', 'build', 'coverage']);
/* Camadas de CLIENTE. `functions/` e `functions-autodraw/` são servidor e ficam fora. */
const EH_SERVIDOR = (rel) => rel.startsWith('functions/') || rel.startsWith('functions-autodraw/');
const EH_DOC = (rel) => rel.startsWith('docs/') || rel.endsWith('.md');
const EH_TESTE = (rel) => rel.startsWith('tests/') || rel.startsWith('scripts/');

const arquivos = [];
(function anda(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    if (PULAR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) anda(p);
    else if (/\.(js|mjs|cjs|html)$/.test(e.name)) arquivos.push(p);
  }
})(RAIZ);

const CADEIA_PROIBIDA = /\.(where|orderBy|limit|startAt|startAfter|endAt|endBefore|onSnapshot)\s*\(/;
const achados = [];
const clientesComLeitura = [];

for (const abs of arquivos) {
  const rel = path.relative(RAIZ, abs);
  if (EH_SERVIDOR(rel) || EH_DOC(rel) || EH_TESTE(rel)) continue;
  let src;
  try { src = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
  if (src.indexOf('magicLinks') === -1) continue;

  const re = /collection\(\s*['"]magicLinks['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const linha = src.slice(0, m.index).split('\n').length;
    /* a cadeia é o que vem DEPOIS do `collection(...)`, até o fim da expressão */
    const cauda = src.slice(m.index + m[0].length, m.index + m[0].length + 160);
    const ehDocGet = /^\s*\.doc\s*\([^)]*\)\s*\.get\s*\(/.test(cauda);
    const temProibido = CADEIA_PROIBIDA.test(cauda.split(';')[0]);
    const getDireto = /^\s*\.get\s*\(/.test(cauda);
    if (ehDocGet && !temProibido) { clientesComLeitura.push(rel + ':' + linha); continue; }
    achados.push({
      rel: rel, linha: linha,
      motivo: getDireto ? 'get() DIRETO na coleção — isso é list'
        : temProibido ? 'cadeia de consulta (where/orderBy/limit/onSnapshot)'
        : 'não é `.doc(token).get()`',
      txt: cauda.split('\n')[0].trim().slice(0, 90),
    });
  }
}

if (achados.length) {
  console.error('\n✗ magicLinks: leitura de cliente FORA do contrato `.doc(token).get()`:\n');
  achados.forEach((a) => console.error('  ' + a.rel + ':' + a.linha + '  — ' + a.motivo + '\n     …' + a.txt));
  console.error('\n  `firestore.rules` concede `allow get` e NEGA `list`. Uma consulta aqui morre');
  console.error('  com permission-denied em produção — e nas lojas, num app sem auto-update.');
  console.error('  Ver docs/AUDITORIA-ARQUITETURAL-LEVAS.md, L4.P3/L4.P4.\n');
  process.exit(1);
}

/* A leitura do web é obrigatória: se ela sumir, ou o fluxo mudou (e esta trava precisa ser
 * revista junto) ou o walker deixou de enxergar — as duas merecem parar o gate. */
const temWeb = clientesComLeitura.some((x) => x.startsWith('js/'));
if (!temWeb) {
  console.error('\n✗ magicLinks: nenhuma leitura encontrada em `js/` — o resolver do wrapper sumiu?');
  console.error('  Esperado: js/views/auth.js com `collection(\'magicLinks\').doc(token).get()`.\n');
  process.exit(1);
}

const nativos = clientesComLeitura.filter((x) => x.startsWith('android/') || x.startsWith('ios/'));
console.log('✓ magicLinks: ' + clientesComLeitura.length + ' leitura(s) de cliente, todas `.doc(token).get()`');
clientesComLeitura.forEach((x) => console.log('    · ' + x));
if (!nativos.length) {
  /* Não é falha: no deploy o hosting roda numa cópia extraída do git, e os bundles são
   * gitignored — eles simplesmente não estão lá. No repo de trabalho eles estão, e aí a
   * trava os confere. Dizer isso em voz alta evita ler "verde" como "conferi os três". */
  console.log('  ⚠️  bundles Android/iOS ausentes nesta árvore (gitignored) — não conferidos aqui.');
}
