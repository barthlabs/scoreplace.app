'use strict';
/* ⛔ CONTADOR DE TROFÉU NÃO SE SOMA — SE RECONTA.
 *
 * MEDIDO em 12/set/2026, comparando `_meta/trophyStats.counts` com a contagem real de
 * `collectionGroup('trophies')` em produção: **15 dos 17 ids divergiam**. O pior,
 * `perfil_foto`, marcava **297** contra **149** troféus reais — quase o dobro. Soma geral:
 * 891 no contador contra **1.007** de verdade.
 *
 * TRÊS escritores somavam no mesmo número, sem combinação, com a gravação sempre engolida:
 *   ① `backfillAllUserTrophies` (pode rodar de novo — e cada rodada somava outra vez);
 *   ② `scheduledTrophyCheck` (o Firebase entrega agendado ao menos uma vez);
 *   ③ `js/trophies.js#_incrementTrophyStat`, no NAVEGADOR — que NUNCA funcionou: `_meta`
 *      não tinha regra e sem regra é negado (medido: 403). Falhava calada desde sempre.
 *
 * E a mesma falta de regra deixava a TELA no escuro: a raridade ("x% têm este troféu") lê
 * `_meta/trophyStats`, a leitura era negada, e todo troféu aparecia com **0%** para todo
 * mundo.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const FN = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
const TR = fs.readFileSync(path.join(raiz, 'js/trophies.js'), 'utf8');
const RULES = fs.readFileSync(path.join(raiz, 'firestore.rules'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① não sobrou incremento nenhum no servidor ──────────────────────────────
must(!/FieldValue\.increment/.test(semComentario(FN)),
  '① ⭐ nenhum `FieldValue.increment` sobrou em functions/index.js');
must(!/counts\." \+ id/.test(semComentario(FN)),
  '① ⛔ nem a montagem do `counts.<id>` que alimentava o incremento');

// ── ② existe a recontagem, e ela é derivada dos documentos ──────────────────
const iRec = FN.indexOf('async function _recontarTrofeus');
assert.ok(iRec > 0, 'âncora: a recontagem');
const rec = semComentario(FN.slice(iRec, FN.indexOf('\n}\n', iRec)));
must(/collectionGroup\("trophies"\)/.test(rec),
  '② a conta vem dos DOCUMENTOS de troféu, que são o dono da verdade');
must(/counts: contagem/.test(rec),
  '② e grava o mapa inteiro — não um delta');
must(/totalUsers: Math\.max\(totalUsers, 1\)/.test(rec),
  '② o total de perfis é gravado na MESMA escrita (era outra, no começo, e engolida)');
must(!/\.catch\(\(\) => \{\}\)/.test(rec),
  '② ⛔ a gravação NÃO engole falha: se falhar, a função falha e a gente fica sabendo');

// ── ③ os dois chamadores usam a recontagem ──────────────────────────────────
const chamadas = (FN.match(/_recontarTrofeus\(db, "/g) || []).length;
must(chamadas === 2, '③ os dois caminhos (backfill e agendado) recontam (achei ' + chamadas + ')');
must(/_recontarTrofeus\(db, "scheduledTrophyCheck"\)/.test(FN), '③ o agendado reconta');
must(/_recontarTrofeus\(db, "backfill"\)/.test(FN), '③ e o backfill também');

// ── ④ o escritor morto saiu do navegador ────────────────────────────────────
must(!/_incrementTrophyStat\(/.test(semComentario(TR)),
  '④ ⭐ o incremento do navegador saiu — era negado pelas rules e falhava calado');
must(/_loadTrophyStats/.test(TR), '④ a LEITURA continua: é dela que a raridade vive');

// ── ⑤ a regra abre a leitura do agregado, e só ela ──────────────────────────
const iR = RULES.indexOf('match /_meta/trophyStats');
assert.ok(iR > 0, 'âncora: a regra do agregado');
const bloco = RULES.slice(iR, RULES.indexOf('}', RULES.indexOf('{', iR)) + 1);
must(/allow get: if true;/.test(bloco), '⑤ ⭐ a tela finalmente CONSEGUE ler a raridade');
must(/allow list, write: if false;/.test(bloco),
  '⑤ ⛔ mas só este documento, e escrita segue do servidor (Admin SDK ignora as rules)');
must(!/allow (read|write): if request\.auth/.test(bloco),
  '⑤ ⛔ sem porta de escrita para cliente autenticado — era isso que inflava o número');

console.log('\n✅ contador de troféu se reconta — ' + ok + ' verificações');
