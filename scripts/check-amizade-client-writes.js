#!/usr/bin/env node
/* check-amizade-client-writes.js — GATE: quem escreve os quatro caches sociais.
 *
 * Os campos `friends`, `friendRequestsSent`, `friendRequestsReceived` e
 * `friendRequestsSentAt` são PROJEÇÃO de `friendships` + `friendAccess`. Só três arquivos
 * podem escrevê-los, e os três derivam do cânone.
 *
 * ⛔ ESTE GATE JÁ FOI FALSO (6ª auditoria externa, 29/ago/2026), e é por isso que ele mudou
 * de forma. A versão anterior procurava `campo: ... arrayUnion|arrayRemove|FieldValue` na
 * MESMA LINHA. O `_amizadeAplicar` (então dentro do index.js) usava aliases locais:
 *     const AU = (v) => _FV.arrayUnion(v);
 *     tx.update(uA, { friends: AU(alvoUid), ... })
 * Nenhuma dessas linhas casava com a regex, e o gate declarava uma fronteira que não
 * existia. Gate verde contradizendo o código é pior que gate nenhum: dá licença pra
 * confiar. A correção real foi extrair `functions/amizade-service.js`; esta aqui é a
 * correção da DETECÇÃO.
 *
 * ⭐ COMO ELE DETECTA AGORA: não procura o operador, procura o CAMPO sendo escrito perto
 * de uma escrita. Qualquer `campo:` ou `"campo."` numa janela em volta de um
 * `set(`/`update(`/`create(` acusa — não importa se o valor é `arrayUnion`, um alias, uma
 * variável ou um literal. A janela olha PARA TRÁS também, porque o payload costuma ser
 * montado numa variável algumas linhas acima da chamada.
 *
 * Roda em `npm test`. Saída não-zero BARRA o gate.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const CAMPOS = ['friends', 'friendRequestsSent', 'friendRequestsReceived', 'friendRequestsSentAt'];

/* Só estes escrevem, e cada um tem um porquê:
 *   amizade-service    — a transação das cinco operações (relação + projeção + cache juntos)
 *   amizade-lifecycle  — a projeção do cânone em merge/exclusão
 *   backfill/restore   — a migração e o rollback, que são operações declaradas de uma vez só */
const AUTORIZADOS = new Set([
  'functions/amizade-service.js',
  'functions/amizade-lifecycle.js',
  'scripts/backfill-amizade.js',
  'scripts/restore-amizade-legado.js',
]);

function listar(dir, out) {
  out = out || [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') listar(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Tira comentários de linha e de bloco — comentário não é código. */
function semComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}

/* ⚠️ `Object.create(` / `Object.assign(` NÃO são escrita no Firestore — sem esta exclusão
 * o gate acusava `amizade-authority-core.js`, que é PURO e nunca toca no banco. Falso
 * positivo em gate é tão corrosivo quanto falso negativo: ensina a ignorar o gate. */
const ESCRITORES = /(?<!\bObject)\.(set|update|create)\s*\(/g;
const achados = [];
const alvos = [
  ...listar(path.join(ROOT, 'js')),
  ...listar(path.join(ROOT, 'functions')).filter((f) => !/[\\/](test-|vendor[\\/])/.test(f)),
  ...listar(path.join(ROOT, 'scripts')),
  ...listar(path.join(ROOT, 'tools')),
];

for (const f of alvos) {
  const rel = path.relative(ROOT, f);
  if (AUTORIZADOS.has(rel)) continue;
  const src = semComentarios(fs.readFileSync(f, 'utf8'));
  const linhas = src.split('\n');

  linhas.forEach((linha, i) => {
    ESCRITORES.lastIndex = 0;
    let m;
    while ((m = ESCRITORES.exec(linha)) !== null) {
      // janela nos DOIS sentidos: o payload tanto pode estar inline quanto ter sido
      // montado numa variável logo acima (foi assim que o alias AU/AR escapou antes).
      const janela = linhas.slice(Math.max(0, i - 8), i + 5).join('\n');
      for (const campo of CAMPOS) {
        const escreve = new RegExp('(^|[^A-Za-z0-9_.\'"])' + campo + '\\s*:' + '|["\'`]' + campo + '\\.', 'm');
        if (escreve.test(janela)) {
          achados.push({ arquivo: rel, linha: i + 1, campo, txt: linha.trim().slice(0, 110) });
          return;
        }
      }
    }
  });
}

if (achados.length) {
  console.error('\n✗ ESCRITA NÃO AUTORIZADA em campo de cache de amizade:\n');
  const vistos = new Set();
  achados.forEach((a) => {
    const k = a.arquivo + ':' + a.linha;
    if (vistos.has(k)) return; vistos.add(k);
    console.error('  ' + k + '  (' + a.campo + ')\n     ' + a.txt);
  });
  console.error('\n  Estes quatro campos são PROJEÇÃO de `friendships`/`friendAccess`.');
  console.error('  Autorizados: ' + [...AUTORIZADOS].join(', '));
  console.error('  Para alterar amizade, chame a Cloud Function (sendFriendRequest/accept/');
  console.error('  reject/cancel/removeFriend) — ela escreve tudo na mesma transação.\n');
  process.exit(1);
}
console.log('✓ amizade: os 4 campos de cache só são escritos por ' + [...AUTORIZADOS].join(', '));
