/* OS BOTÕES DO CARD LIBERAM COM A DUPLA DEFINIDA, NÃO COM A RODADA (leva 2.1.98)
 *
 * Relato do dono (02/set/2026): _"participante reclamando que o botão de criar grupo dos
 * jogos (whats) não aparece."_ E a regra que ele deu em seguida:
 *   _"os botões têm que aparecer no jogo (todos os botões) assim que tem as duplas
 *    definidas. assim a r3 pode começar em alguns jogos mesmo antes de terminar a r2 —
 *    se não dependerem de repescagem"_.
 *
 * ⛔ A FALHA REAL, MEDIDA NO NAVEGADOR EM PRODUÇÃO (Confra, 02/set/2026):
 *   · `_schCurrentRoundMatches(t)` devolvia `{ round: 1, status: 'done', 105 jogos }` —
 *     a coluna da FASE 1, já encerrada;
 *   · dos 99 jogos da Fase 2, ZERO passavam em `_schIsCurrentRoundMatch`;
 *   · logo, NENHUM participante via "📅 Propor datas" nem "💬 Criar grupo dos jogos" em
 *     jogo nenhum. O organizador via, porque furava o gate por `_isOrg` — foi por isso
 *     que a queixa veio só do participante.
 * A CAUSA de fundo é do adapter: `_getUnifiedRounds` não monta coluna para a chave
 * gold/silver/bronze da Fase 2, então "a rodada atual" ficava eternamente na fase velha.
 *
 * ⚠️ ESTE TESTE USA O `_getUnifiedRounds` DE VERDADE (via render-harness), com o SHAPE
 * real dos jogos da Fase 2 da Confra. Se ele fosse escrito com um `_schCurrentRoundMatches`
 * de mentira, passaria mesmo com o bug em pé — foi exatamente assim que o defeito
 * sobreviveu ao teste anterior. A asserção ① existe pra PROVAR que o defeito do adapter
 * continua lá: o conserto desta leva é NÃO DEPENDER dele.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8'),
  sandbox, { filename: 'schedule-poll.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'wa-group.js'), 'utf8'),
  sandbox, { filename: 'wa-group.js' });
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── botões do card: liberam com a DUPLA DEFINIDA ────');

const ORG      = { uid: 'u-org', displayName: 'Organizador', notifyWhatsApp: true };
const MARIANA  = { uid: 'u-mar', displayName: 'Mariana', notifyWhatsApp: true };
const ESTRANHO = { uid: 'u-x',   displayName: 'Estranho', notifyWhatsApp: true };
const como = (u) => { W.AppStore.currentUser = u; };

/* SHAPE REAL da Fase 2 da Confra: dupla com nomes em p1/p2, uids em teamNUids,
 * bracket 'gold'/'silver'/'bronze', phaseIndex 1. É este bracket que o adapter não
 * entende — e é por isso que o fixture não pode ser "um jogo qualquer". */
function jogo(id, round, bracket, u1, u2, u3, u4, nomes) {
  return {
    id: id, round: round, bracket: bracket, phaseIndex: 1, winner: null,
    p1: nomes[0], p2: nomes[1],
    team1Uids: [u1, u2], team2Uids: [u3, u4],
    team1Obj: { p1Uid: u1, p2Uid: u2, displayName: nomes[0] },
    team2Obj: { p1Uid: u3, p2Uid: u4, displayName: nomes[1] }
  };
}
const R1 = jogo('gold-R1-P11', 1, 'gold', 'u-ros', 'u-zil', 'u-mar', 'u-arn',
                ['Rostanda / Zilda', 'Mariana / Arnaldo']);
/* R3 com os dois lados JÁ resolvidos, com a R2 ainda em aberto — o caso que o dono
 * descreveu ("a r3 pode começar em alguns jogos mesmo antes de terminar a r2"). */
const R3_PRONTO = jogo('gold-R3-P1', 3, 'gold', 'u-mar', 'u-arn', 'u-a', 'u-b',
                       ['Mariana / Arnaldo', 'A / B']);
/* R3 que ainda espera vencedor — continua fora, sozinho. */
const R3_ESPERA = Object.assign(jogo('gold-R3-P2', 3, 'gold', 'u-mar', 'u-arn', null, null,
                                     ['Mariana / Arnaldo', 'TBD']), { team2Uids: [] });
const R2 = jogo('gold-R2-P1', 2, 'gold', 'u-c', 'u-d', 'u-e', 'u-f', ['C / D', 'E / F']);

const T = {
  id: 'T-FASE2', format: 'Liga', status: 'active', currentPhaseIndex: 1, currentStage: 'phase1',
  creatorUid: ORG.uid, coHosts: [], participants: [],
  /* a fase 1 encerrada continua em t.rounds — é dela que a "rodada atual" vinha */
  rounds: [{ round: 1, status: 'complete', matches: [
    { id: 'f1-a', round: 1, isMonarch: true, phaseIndex: 0, p1: 'dupla A', p2: 'dupla B',
      team1: ['P1', 'P2'], team2: ['P3', 'P4'], team1Uids: ['u-1', 'u-2'], team2Uids: ['u-3', 'u-4'],
      winner: 'dupla A' }
  ] }],
  matches: [R1, R2, R3_PRONTO, R3_ESPERA]
};
W.AppStore.tournaments = [T];
W._collectAllMatches = (t) => t.matches;

// ── ① o defeito do adapter CONTINUA LÁ (é o que torna o conserto necessário) ────
const cr = W._schCurrentRoundMatches(T);
const idsAtuais = (cr.matches || []).map((m) => m.id);
ok(idsAtuais.indexOf(R1.id) === -1,
   '① o adapter NÃO põe o jogo da Fase 2 na "rodada atual" — o defeito que escondia tudo');
ok((cr.col && cr.col.status) === 'done' || cr.matches.length === 0,
   '① e a coluna que ele escolhe é a da fase JÁ ENCERRADA (ou nenhuma)');

// ── ② a porta nova não pergunta por rodada nenhuma ─────────────────────────────
ok(typeof W._schJogoLiberado === 'function', '② `_schJogoLiberado` é a porta única');
ok(W._schIsCurrentRoundMatch === undefined,
   '② o gate de rodada foi APAGADO — função sem chamador vira decoy e faz consertar o lugar errado');
ok(W._schJogoLiberado(T, R1) === true, '② jogo com as duas duplas → liberado');
ok(W._schJogoLiberado(T, R3_ESPERA) === false, '② jogo com TBD → NÃO liberado');
ok(W._schJogoLiberado(T, { id: 'f', isSitOut: true, p1: 'X', p2: 'Y' }) === false,
   '② folga não é jogo');
ok(W._schJogoLiberado(T, { id: 'b', isBye: true, p1: 'X', p2: 'BYE' }) === false,
   '② BYE não é jogo');

// ── ③ O SINTOMA RELATADO: a participante vê os DOIS chips no jogo dela ─────────
como(MARIANA);
const waR1 = W._waGrpCardChip(T, R1) || '';
const schR1 = W._schCardChip(T, R1) || '';
ok(waR1.indexOf('Criar grupo') !== -1,
   '③ ⭐ a participante VÊ "Criar grupo dos jogos" no jogo dela (era isto que sumia)');
ok(schR1.indexOf('Propor') !== -1,
   '③ ⭐ e vê "Propor datas" — os dois chips somem e voltam JUNTOS, mesma porta');

// ── ④ a regra do dono: R3 pronta libera antes de a R2 acabar ───────────────────
ok((W._waGrpCardChip(T, R3_PRONTO) || '').indexOf('grupo') !== -1,
   '④ ⭐ R3 com os dois lados definidos libera mesmo com a R2 em aberto');
ok((W._schCardChip(T, R3_PRONTO) || '').indexOf('Propor') !== -1,
   '④ ⭐ e o "Propor datas" acompanha');
ok((W._waGrpCardChip(T, R3_ESPERA) || '') === '',
   '④ mas o jogo que depende de vencedor (TBD) segue escondido');

// ── ⑤ nada disso abriu porta pra quem não é do jogo ───────────────────────────
como(ESTRANHO);
ok((W._waGrpCardChip(T, R1) || '') === '', '⑤ quem não joga nem organiza continua sem ver');
ok((W._schCardChip(T, R1) || '') === '', '⑤ idem no "Propor datas"');
como(ORG);
ok((W._waGrpCardChip(T, R1) || '') !== '', '⑤ o organizador segue vendo');
ok((W._waGrpCardChip(T, R3_ESPERA) || '') === '',
   '⑤ e nem pro organizador o TBD abre grupo — sem os dois lados não há com quem falar');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
