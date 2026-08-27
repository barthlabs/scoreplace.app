/* GRAVAÇÃO QUE SÓ MEXE NA SUBCOLEÇÃO TEM QUE TOCAR O DOCUMENTO  (2.1.2)
 * node tests/gravacao-so-na-subcolecao-toca-o-doc.test.js
 *
 * ⛔ A FALHA QUE ESTE TESTE REPRODUZ — medida no Confra, com o torneio AO VIVO:
 *   doc.updatedAt = 2026-08-26T22:24:03Z
 *   jogo 11 gravado 22:24:23 · jogo 10 gravado 22:24:35 · jogo 12 gravado 22:24:47
 * Os TRÊS placares estavam salvos e CERTOS na subcoleção `matches`. Mesmo assim a tela
 * mostrava o 10 e o 12 como 0-0 com selo PRONTO e botão Confirmar — inventando um estado
 * que o dado não tinha. Relato do dono: _"os resultados que lancei para o jogo 10 e 12
 * sumiram porra"_.
 *
 * ⚠️ ATRIBUIÇÃO HONESTA: eu comecei culpando `gravar()` e ME ENGANEI. `gravar()` só enxerga
 * a forma PLANA (`t.participants[]`, `t.matches[]`); o Confra é baseado em `rounds`, então o
 * placar NÃO passa por ali — a porta que grava o jogo segue POR IDENTIFICAR. O sintoma do
 * Confra continua sem causa provada; não declare consertado. [[feedback_no_blind_fixes]]
 *
 * O QUE ESTÁ PROVADO E CORRIGIDO é um buraco REAL da mesma família, nas partes PLANAS:
 * quando a gravação mexe SÓ numa parte dividida, o `delete doc[nome]` tira a única chave e o
 * `doc` chega VAZIO no fim — então o `if (Object.keys(doc).length) tx.update(ref, doc)` não
 * roda e o documento do torneio NÃO É TOCADO. Sem tocar o doc, `updatedAt` não anda; sem
 * `updatedAt` andando, o `onSnapshot` do DOC não dispara e todo portão de frescor conclui
 * "nada mudou" — o cliente segue pintando o cache. [[project_cache_pinta_mas_nao_decide]]
 * Vale para inscrição/desinscrição e histórico de adversários em torneio dividido.
 * A porta `aplicarNoTorneio` (functions/index.js) já bumpava o `updatedAt` sempre; esta não:
 * duas portas para a mesma subcoleção, uma só ciente. [[feedback_unify_dual_entry_points]]
 *
 * ⚠️ O QUE ESTE TESTE **NÃO** ACEITA COMO VERDE: bump em gravação VAZIA. `updatedAt` que
 * anda sozinho é escrita inventada e quebra quem usa ele como assinatura.
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SP = require(path.join(ROOT, 'functions/split-parts.js'));
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── gravação só na subcoleção toca o documento ────');

// tx de mentira: anota o que foi escrito, sem banco.
function faketx() {
  const r = { sets: [], deletes: [], updates: [] };
  return {
    reg: r,
    set: (ref, val) => r.sets.push({ ref: String(ref), val }),
    delete: (ref) => r.deletes.push(String(ref)),
    update: (ref, val) => r.updates.push(val),
  };
}
const ref = {
  toString: () => 'tournaments/tour_X',
  collection: (nome) => ({ doc: (k) => ({ toString: () => nome + '/' + k }) }),
};


// ── ① o caso REAL: parte PLANA dividida muda sozinha ──────────────────────────
// ⚠️ `gravar()` só enxerga a forma PLANA (`t.participants[]`, `t.matches[]`) — para um
// torneio baseado em `rounds` ele nem entra no caminho da divisão. Ou seja: o placar do
// Confra NÃO passa por aqui (essa porta ainda está por identificar). O buraco corrigido
// é o das partes planas, e é este que o teste exercita.
const antesP = {
  _semPesados: ['matches', 'participants', 'opponentHistory'],
  participants: [{ uid: 'u1', name: 'A' }, { uid: 'u2', name: 'B' }],
};
const depoisP = [{ uid: 'u1', name: 'A' }, { uid: 'u2', name: 'B' }, { uid: 'u3', name: 'C' }];

const tx1 = faketx();
SP.gravar(tx1, ref, antesP, { participants: depoisP });

ok('⭐ o inscrito novo foi pra subcoleção', tx1.reg.sets.length >= 1,
  'escreveu ' + tx1.reg.sets.length + ' doc(s) — esperado ao menos 1');
ok('⭐⭐ o DOCUMENTO foi tocado mesmo mexendo SÓ na subcoleção', tx1.reg.updates.length === 1,
  'ESTA é a regressão: com doc vazio o tx.update não rodava e o updatedAt congelava');
ok('  → e o que foi tocado é o `updatedAt`',
  tx1.reg.updates.length === 1 && typeof tx1.reg.updates[0].updatedAt === 'string');
ok('  → com data válida e recente',
  tx1.reg.updates.length === 1 && Math.abs(Date.now() - new Date(tx1.reg.updates[0].updatedAt).getTime()) < 60000);
ok('⛔ e o `participants` NÃO voltou pro documento (o teto de 1 MB continua de pé)',
  tx1.reg.updates.length === 1 && !('participants' in tx1.reg.updates[0]));

// ── ② gravação VAZIA não inventa escrita ──────────────────────────────────────
const tx2 = faketx();
SP.gravar(tx2, ref, antesP, {});
ok('⛔ gravação vazia NÃO toca o documento', tx2.reg.updates.length === 0 && tx2.reg.sets.length === 0,
  'updatedAt que anda sozinho é escrita inventada');

// ── ③ nada mudou de verdade → nada é escrito ──────────────────────────────────
const tx3 = faketx();
SP.gravar(tx3, ref, antesP, { participants: JSON.parse(JSON.stringify(antesP.participants)) });
ok('⛔ elenco idêntico → nenhum doc reescrito', tx3.reg.sets.length === 0,
  'reescreveu ' + tx3.reg.sets.length + ' doc(s) sem mudança');

// ── ④ quem NÃO está dividido segue como antes ─────────────────────────────────
const tx4 = faketx();
SP.gravar(tx4, ref, { participants: antesP.participants }, { participants: depoisP });
ok('⭐ torneio NÃO dividido grava tudo no documento, como sempre',
  tx4.reg.sets.length === 0 && tx4.reg.updates.length === 1 && 'participants' in tx4.reg.updates[0]);

// ── ⑤ campo do doc + parte dividida na MESMA gravação ─────────────────────────
const tx5 = faketx();
SP.gravar(tx5, ref, antesP, { participants: depoisP, tournamentStarted: true });
ok('⭐ campo que fica no doc viaja junto com o bump',
  tx5.reg.updates.length === 1 && tx5.reg.updates[0].tournamentStarted === true
  && typeof tx5.reg.updates[0].updatedAt === 'string');

// ── ⑥ updatedAt explícito de quem chama NÃO é sobrescrito ─────────────────────
const tx6 = faketx();
SP.gravar(tx6, ref, antesP, { participants: depoisP, updatedAt: 'CARIMBO-DE-QUEM-CHAMOU' });
ok('⛔ updatedAt vindo de quem chama manda (não sobrescrever carimbo alheio)',
  tx6.reg.updates.length === 1 && tx6.reg.updates[0].updatedAt === 'CARIMBO-DE-QUEM-CHAMOU');

console.log(falhas === 0 ? '\n✅ gravacao-so-na-subcolecao-toca-o-doc: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
