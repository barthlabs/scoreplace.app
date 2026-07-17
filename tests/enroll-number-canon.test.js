/* TRAVA — o Nº DE INSCRIÇÃO é da PESSOA e a acompanha.
 *
 * REGRA (dono, jul/2026), literal:
 *   _"duplas formadas por qualquer forma (manual ou sorteio) o participante deve manter
 *    seu numero de inscrição sempre - dentro da dupla). desfazer duplas deve manter o
 *    numero de inscricao original do participante. apenas a exclusao de inscrito deve
 *    alterar o numero de inscricao de participante (ja que nesse caso o 3o inscrito, por
 *    exemplo passa a ser o segundo se o segundo deixar de ser inscrito por qualquer
 *    forma - excluido ou desinscrito)."_
 *
 * Ou seja:
 *   • formar dupla (manual OU sorteio OU pareamento tardio) → número INTACTO;
 *   • desfazer dupla                                        → número INTACTO;
 *   • sair um inscrito (excluído/desinscrito)               → os de baixo SOBEM (rank denso).
 *
 * POR QUE EXISTE: uma simulação desfeita no "Duplas Mistas Sorteadas" (staging, jul/2026)
 * embaralhou os 20 números. A cadeia: dupla formada por código velho não gravava
 * p1Seq/p2Seq → `_ensureEnrollSeqs` INVENTAVA números na hora de renderizar → o "Desfazer
 * dupla" devolvia fielmente o número inventado. Ninguém vê o defeito na hora de formar:
 * ele só aparece ao desfazer, quando já é tarde e o original se perdeu (só deu pra
 * recuperar porque prod tinha uma cópia). Por isso a trava exercita o CICLO INTEIRO
 * (formar → desfazer), não cada função isolada.
 *
 * node tests/enroll-number-canon.test.js
 * Ver [[project_uid_identity_canon_locked]] (identidade é uid — o seq segue o uid).
 */
const W = require('./render-harness').window;

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓ ' + n + (got !== undefined ? ' — ' + got : '')); } else { fail++; console.log('  ✗ ' + n + (got !== undefined ? ' — ' + got : '')); } };

const NOMES = { u1: 'Ana', u2: 'Bia', u3: 'Caio', u4: 'Duda', u5: 'Edu' };
W._nameForUid = (u) => NOMES[u] || '';
W._displayNameForUid = (u, fb) => NOMES[u] || fb || '';

const novo = () => ({
  id: 'T', enrollmentMode: 'individual', teamSize: 2, creatorUid: 'u1',
  participants: Object.keys(NOMES).map((u, i) => ({ uid: u, enrollSeq: i + 1 })),
  standbyParticipants: [], waitlist: [],
});
// nº EXIBIDO de cada pessoa (rank denso sobre o enrollSeq) — é o que o card mostra.
const numeros = (t) => {
  const m = W._buildEnrollOrderMap(t);
  const out = {};
  Object.keys(NOMES).forEach((u) => { out[NOMES[u]] = W._enrollNumber(m, { uid: u }); });
  return out;
};

console.log('\n🔢 Nº de inscrição segue a PESSOA\n');

const inicial = numeros(novo());
console.log('  inicial: ' + JSON.stringify(inicial));
ok('cada um começa com o seu número', JSON.stringify(inicial) === JSON.stringify({ Ana: 1, Bia: 2, Caio: 3, Duda: 4, Edu: 5 }));

// ── formar dupla: o seq de cada um entra na dupla (p1Seq/p2Seq) ───────────────
console.log('\nFormar dupla (Bia + Duda) — os números não podem mudar:');
{
  const t = novo();
  const b = t.participants.find((p) => p.uid === 'u2');
  const d = t.participants.find((p) => p.uid === 'u4');
  // é isto que TODO caminho de formação tem que fazer (manual, sorteio, tardio):
  const dupla = { p1Uid: 'u2', p2Uid: 'u4', p1Seq: b.enrollSeq, p2Seq: d.enrollSeq };
  t.participants = t.participants.filter((p) => p.uid !== 'u2' && p.uid !== 'u4');
  t.participants.push(dupla);
  const n = numeros(t);
  console.log('  depois:  ' + JSON.stringify(n));
  ok('Bia mantém 2 dentro da dupla', n.Bia === 2, String(n.Bia));
  ok('Duda mantém 4 dentro da dupla', n.Duda === 4, String(n.Duda));
  ok('ninguém mais se mexe', n.Ana === 1 && n.Caio === 3 && n.Edu === 5);
}

// ── O BUG REAL: várias duplas, formadas FORA da ordem, sem carregar o seq ────
// Uma dupla só não denuncia nada: `_ensureEnrollSeqs` preenche as LACUNAS (tirou o 2 e o
// 4 → aloca 2 e 4) e acerta por sorte. O estrago aparece com várias duplas em ordem
// diferente da de inscrição — foi o caso real (10 duplas sorteadas, 20 números trocados):
// a alocação segue a ORDEM DO ARRAY, não a pessoa.
console.log('\nO BUG que embaralhou (várias duplas fora de ordem, sem p1Seq/p2Seq):');
{
  const t = novo();
  t.participants = [
    { uid: 'u2', enrollSeq: 2 },        // Bia segue sozinha
    { p1Uid: 'u3', p2Uid: 'u5' },       // ☠️ Caio(3)+Edu(5) sem seq
    { p1Uid: 'u1', p2Uid: 'u4' },       // ☠️ Ana(1)+Duda(4) sem seq
  ];
  const n = numeros(t);
  console.log('  vira:    ' + JSON.stringify(n) + '   (era ' + JSON.stringify(inicial) + ')');
  ok('SEM carregar o seq, os números trocam de dono — o defeito, reproduzido',
    n.Ana !== 1 || n.Caio !== 3, 'Ana=' + n.Ana + ' (era 1) · Caio=' + n.Caio + ' (era 3)');

  // E com o seq carregado (o que o código faz hoje), o MESMO arranjo fica intacto.
  const t2 = novo();
  t2.participants = [
    { uid: 'u2', enrollSeq: 2 },
    { p1Uid: 'u3', p2Uid: 'u5', p1Seq: 3, p2Seq: 5 },
    { p1Uid: 'u1', p2Uid: 'u4', p1Seq: 1, p2Seq: 4 },
  ];
  const n2 = numeros(t2);
  console.log('  com seq: ' + JSON.stringify(n2));
  ok('carregando o seq, o mesmo arranjo preserva todo mundo',
    JSON.stringify(n2) === JSON.stringify(inicial), JSON.stringify(n2));
}

// ── desfazer dupla: volta o número original ─────────────────────────────────
console.log('\nDesfazer a dupla — cada um volta com o SEU número:');
{
  const t = novo();
  const b = t.participants.find((p) => p.uid === 'u2');
  const d = t.participants.find((p) => p.uid === 'u4');
  const dupla = { p1Uid: 'u2', p2Uid: 'u4', p1Seq: b.enrollSeq, p2Seq: d.enrollSeq };
  t.participants = t.participants.filter((p) => p.uid !== 'u2' && p.uid !== 'u4');
  t.participants.push(dupla);
  // split (é o que _splitDupla faz): p1Seq → enrollSeq
  t.participants = t.participants.filter((p) => p !== dupla);
  t.participants.push({ uid: 'u2', enrollSeq: dupla.p1Seq }, { uid: 'u4', enrollSeq: dupla.p2Seq });
  const n = numeros(t);
  console.log('  depois:  ' + JSON.stringify(n));
  ok('o ciclo formar→desfazer não muda NADA', JSON.stringify(n) === JSON.stringify(inicial), JSON.stringify(n));
}

// ── sair um inscrito: aí sim renumera (o 3º vira 2º) ────────────────────────
console.log('\nSair um inscrito (Bia) — os de baixo SOBEM:');
{
  const t = novo();
  t.participants = t.participants.filter((p) => p.uid !== 'u2');
  const m = W._buildEnrollOrderMap(t);
  const n = {}; ['u1', 'u3', 'u4', 'u5'].forEach((u) => { n[NOMES[u]] = W._enrollNumber(m, { uid: u }); });
  console.log('  depois:  ' + JSON.stringify(n));
  ok('Ana segue 1', n.Ana === 1, String(n.Ana));
  ok('Caio (era 3) vira 2', n.Caio === 2, String(n.Caio));
  ok('Duda (era 4) vira 3', n.Duda === 3, String(n.Duda));
  ok('Edu (era 5) vira 4', n.Edu === 4, String(n.Edu));
}

// ── inscrito TARDIO após uma saída: vai pro FIM, NUNCA preenche o vago ───────
// O bug de prod (v1.2.46): saiu o 2º → sobra um vago no enrollSeq; um novo inscrito
// pegava esse vago (número baixo) e o rank denso o mostrava ANTES de quem já estava —
// Nelson entrou por último e apareceu como 14 (num vago) em vez do último número.
// Com _ensureEnrollSeqs preenchendo lacuna isto FALHA; com max+1 (fim da fila) passa.
console.log('\nInscrito tardio depois de uma saída — tem que ir pro FIM da fila:');
{
  const t = novo();
  const _nm0 = W._nameForUid;
  W._nameForUid = (u) => (u === 'u6' ? 'Fábio' : _nm0(u));
  W._displayNameForUid = (u, fb) => (u === 'u6' ? 'Fábio' : (NOMES[u] || fb || ''));
  // Bia (2) sai → enrollSeq restantes 1,3,4,5 (vago no 2). Rank denso: 1,2,3,4.
  t.participants = t.participants.filter((p) => p.uid !== 'u2');
  // Novo inscrito SEM enrollSeq (é o que a inscrição cria — o seq é backfilled aqui).
  t.participants.push({ uid: 'u6' });
  W._ensureEnrollSeqs(t);
  const seqF = t.participants.find((p) => p.uid === 'u6').enrollSeq;
  ok('Fábio NÃO preenche o vago (não recebe enrollSeq 2)', seqF !== 2, 'enrollSeq=' + String(seqF));
  const m = W._buildEnrollOrderMap(t);
  ok('Fábio (último a entrar) mostra o ÚLTIMO número (5)', W._enrollNumber(m, { uid: 'u6' }) === 5, String(W._enrollNumber(m, { uid: 'u6' })));
  const n = {}; ['u1', 'u3', 'u4', 'u5'].forEach((u) => { n[NOMES[u]] = W._enrollNumber(m, { uid: u }); });
  ok('quem ficou segue denso 1..4', JSON.stringify(n) === JSON.stringify({ Ana: 1, Caio: 2, Duda: 3, Edu: 4 }), JSON.stringify(n));
  W._nameForUid = _nm0;
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' passaram · ' + fail + ' falharam\n');
process.exit(fail ? 1 : 0);
