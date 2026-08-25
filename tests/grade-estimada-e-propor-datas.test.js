/* "PROPOR DATAS" — A GRADE ESTIMADA, A ORIGEM DA DATA, E A DATA NAS NOVIDADES
 *
 * Leva 2.0.75, pedida pelo dono em 25/ago/2026, em quatro frases:
 *   1. _"vamos mudar o botao dos grupos e dos jogos de combinar jogos para propor datas"_
 *   2. _"esse botao mostra a data/hora definida inclusive na novidades do torneio"_
 *   3. _"o organizador pode apontar direto a data/hora"_
 *   4. _"em torneios de 1/3 dias as datas horas sao calculadas e sugeridas pelo sistema
 *      como estimadas"_
 *
 * A decisão dele foi GRAVAR a estimativa (m.scheduledAt) já no sorteio, não só mostrá-la.
 * Isso é o que faz a frase 2 acontecer de graça — as "📣 Novidades no seu torneio" reusam
 * renderMatchCard, que já mostra data. Em troca, cria a coisa que este teste existe pra
 * guardar: com três origens de data no mesmo campo, ⛔ NENHUM recálculo do sistema pode
 * pisar numa data que gente marcou. É a invariante do `m.scheduledKind`.
 *
 * O buraco real da frase 2 era o REI/RAINHA: `if (m.isMonarch) return ''` era a 1ª linha
 * do _schCardChip, e quem mostrava a data do grupo era o botão do CABEÇALHO — que a
 * dashboard não renderiza. Logo, jogo de grupo aparecia nas Novidades SEM data nenhuma.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8'),
  sandbox, { filename: 'schedule-poll.js' });
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── grade estimada e "Propor datas" ────');

// ── torneio de 1 dia, 2 quadras, eliminatória de 8 ────────────────────────────
function mkDia(nDias, quadras) {
  const fim = ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08'][nDias - 1];
  const ms = [];
  for (let r = 1; r <= 3; r++) {
    const n = 4 / Math.pow(2, r - 1);
    for (let i = 0; i < n; i++) ms.push({ id: 'r' + r + 'm' + i, round: r, p1: 'A' + i, p2: 'B' + i, winner: null });
  }
  return {
    id: 'T', name: 'Copa', format: 'Eliminatórias Simples', sport: 'Beach Tennis',
    startDate: '2026-09-05T09:00', endDate: fim + 'T18:00',
    courtCount: quadras, gameDuration: 30, callTime: 5, warmupTime: 5,
    participants: [], matches: ms
  };
}

// ── 1. a JANELA: dias e horários saem do startDate/endDate ────────────────────
const jan = W._schJanelaTorneio(mkDia(2, 2));
ok(jan && jan.dias.length === 2, 'janela: 05→06 = 2 dias (got ' + (jan && jan.dias.length) + ')');
ok(jan && jan.iniHm === '09:00' && jan.fimHm === '18:00', 'janela: horas vêm do start/endDate');
ok(W._schJanelaTorneio({ startDate: '2026-09-05' }).iniHm === '09:00', 'sem hora no startDate → 09:00 padrão');
ok(W._schJanelaTorneio({}) === null, 'sem startDate → sem janela (não inventa data)');

// ── 2. A RÉGUA DOS 3 DIAS — acima disso quem marca são os jogadores ───────────
ok(W._schGradeEstimada(mkDia(1, 2)), '1 dia: tem grade');
ok(W._schGradeEstimada(mkDia(3, 2)), '3 dias: tem grade');
ok(W._schGradeEstimada(mkDia(4, 2)) === null, '4 dias: SEM grade (o dono disse 1 a 3)');

// ── 3. A CONTA: 2 quadras, partida de 40min (30×1set + 5 chamada + 5 aquec.) ──
const g = W._schGradeEstimada(mkDia(1, 2));
ok(g.slots.length === 7, 'todos os 7 jogos ganham horário, inclusive os TBD das rodadas seguintes (got ' + g.slots.length + ')');
ok(g.slotMin === 40, 'slot = 30min×1set + 5 chamada + 5 aquecimento = 40 (got ' + g.slotMin + ')');
const t0 = new Date('2026-09-05T09:00:00-03:00').getTime();
const por = {}; g.slots.forEach(s => { (por[s.ms] = por[s.ms] || []).push(s.matchId); });
const horas = Object.keys(por).map(Number).sort((a, b) => a - b);
ok(horas[0] === t0, '1ª onda começa às 09:00 do 1º dia');
ok(por[horas[0]].length === 2, 'com 2 quadras, 2 jogos são simultâneos (got ' + por[horas[0]].length + ')');
ok(horas[1] - horas[0] === 40 * 60000, 'a onda seguinte é 40min depois');
// R1 tem 4 jogos → 2 ondas; a semifinal NÃO pode começar antes de a R1 acabar
const msDe = id => g.slots.find(s => s.matchId === id).ms;
ok(Math.min(msDe('r2m0'), msDe('r2m1')) > Math.max(msDe('r1m0'), msDe('r1m3')),
  'a rodada 2 só começa depois da rodada 1 inteira');
ok(msDe('r3m0') > Math.max(msDe('r2m0'), msDe('r2m1')), 'a final é a última');

// ── 4. QUADRA ÚNICA: nada é simultâneo ────────────────────────────────────────
const g1 = W._schGradeEstimada(mkDia(1, 1));
const distintos = new Set(g1.slots.map(s => s.ms));
ok(distintos.size === g1.slots.length, '1 quadra → 7 horários distintos (got ' + distintos.size + ')');

// ── 5. REI/RAINHA: os 3 jogos do grupo são os MESMOS 4 uids ───────────────────
// Sem a checagem de jogador em comum, os 3 cairiam na mesma onda — "o grupo inteiro
// joga às 09:00" — que é fisicamente impossível. É o caso do Confra (34 grupos × 3).
function mkMonarch(semUids) {
  const ms = [];
  const parts = [];
  for (let gi = 0; gi < 2; gi++) {
    const u = [0, 1, 2, 3].map(k => 'u' + (gi * 4 + k));
    const nm = [0, 1, 2, 3].map(k => 'P' + (gi * 4 + k));
    nm.forEach((n, k) => parts.push({ uid: u[k], displayName: n }));
    [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]].forEach((c, j) => {
      const m = {
        id: 'g' + gi + 'j' + j, round: 1, isMonarch: true, groupIdx: gi, monarchGroup: gi,
        // ⚠️ campos REAIS do motor (bracket-logic _buildMonarchGroup): team1/team2 são
        // NOMES; os uids moram em team1Uids/team2Uids. Escrever uid em team1 fazia
        // _schMatchUids devolver [] e a checagem de conflito virar no-op — foi assim que
        // a 1ª versão deste teste "passou" com os 3 jogos do grupo às 09:00.
        team1: [nm[c[0]], nm[c[1]]], team2: [nm[c[2]], nm[c[3]]],
        p1: nm[c[0]] + ' / ' + nm[c[1]], p2: nm[c[2]] + ' / ' + nm[c[3]], winner: null
      };
      // semUids = doc LEGADO, que só tem nome no jogo; _schMatchUids tem que cair no
      // fallback por nome (via participants) e ainda assim achar o conflito.
      if (!semUids) { m.team1Uids = [u[c[0]], u[c[1]]]; m.team2Uids = [u[c[2]], u[c[3]]]; }
      ms.push(m);
    });
  }
  return {
    id: 'M', format: 'Liga', sport: 'Beach Tennis', startDate: '2026-09-05T09:00',
    endDate: '2026-09-05T18:00', courtCount: 4, gameDuration: 30, callTime: 0, warmupTime: 0,
    participants: parts, matches: ms
  };
}
const gm = W._schGradeEstimada(mkMonarch());
const porGrupo = {};
gm.slots.forEach(s => { const gi = s.matchId.charAt(1); (porGrupo[gi] = porGrupo[gi] || []).push(s.ms); });
ok(new Set(porGrupo['0']).size === 3, 'Rei/Rainha: os 3 jogos do grupo 0 em 3 horários DIFERENTES (got ' + new Set(porGrupo['0']).size + ')');
ok(porGrupo['0'][0] === porGrupo['1'][0], 'mas os grupos 0 e 1 jogam em paralelo (quadras sobrando)');
// mesma coisa pelo caminho LEGADO (jogo só com nome, uid recuperado dos participants)
const gmL = W._schGradeEstimada(mkMonarch(true));
const porGrupoL = {};
gmL.slots.forEach(s => { const gi = s.matchId.charAt(1); (porGrupoL[gi] = porGrupoL[gi] || []).push(s.ms); });
ok(new Set(porGrupoL['0']).size === 3,
  'doc LEGADO (sem team1Uids): o conflito é achado pelo nome — 3 horários (got ' + new Set(porGrupoL['0']).size + ')');

// ── 6. ⛔ A INVARIANTE: o sistema nunca pisa em data que gente marcou ─────────
const t6 = mkDia(1, 2);
t6.matches[0].scheduledAt = '2026-09-05T20:00:00.000Z';
t6.matches[0].scheduledKind = 'consensus';
t6.matches[1].scheduledAt = '2026-09-05T21:00:00.000Z';
t6.matches[1].scheduledKind = 'organizer';
t6.matches[2].scheduledAt = '2026-01-01T00:00:00.000Z';
t6.matches[2].scheduledKind = 'estimate';
const n6 = W._schAplicarGrade(t6);
ok(t6.matches[0].scheduledAt === '2026-09-05T20:00:00.000Z', 'data COMBINADA pelos jogadores: intocada');
ok(t6.matches[0].scheduledKind === 'consensus', '  → e a origem continua consensus');
ok(t6.matches[1].scheduledAt === '2026-09-05T21:00:00.000Z', 'data do ORGANIZADOR: intocada');
ok(t6.matches[2].scheduledAt !== '2026-01-01T00:00:00.000Z', 'data ESTIMADA: essa sim é recalculada');
ok(t6.matches[2].scheduledKind === 'estimate', '  → e segue estimada');
ok(n6 === 5, 'carimbou os 5 jogos livres, não os 2 marcados por gente (got ' + n6 + ')');
// legado: data sem origem veio de antes desta régua → só pode ter sido combinada
const t6b = mkDia(1, 2);
t6b.matches[0].scheduledAt = '2026-09-05T20:00:00.000Z'; // sem scheduledKind
W._schAplicarGrade(t6b);
ok(t6b.matches[0].scheduledAt === '2026-09-05T20:00:00.000Z', 'doc LEGADO (data sem origem) é tratado como combinado — intocado');

// ── 7. IDEMPOTENTE: rodar de novo não muda nada ───────────────────────────────
const t7 = mkDia(1, 2);
ok(W._schAplicarGrade(t7) === 7, '1ª passada carimba os 7');
ok(W._schAplicarGrade(t7) === 0, '2ª passada não muda nada (idempotente)');

// ── 8. jogo JÁ JOGADO e BYE ficam de fora ─────────────────────────────────────
const t8 = mkDia(1, 2);
t8.matches[0].winner = 'A0';
t8.matches[1].isBye = true;
const g8 = W._schGradeEstimada(t8);
ok(!g8.slots.some(s => s.matchId === 'r1m0'), 'jogo com vencedor não entra na grade');
ok(!g8.slots.some(s => s.matchId === 'r1m1'), 'BYE não entra na grade (ninguém joga um BYE)');

// ── 9. NÃO CABE: a grade avisa em vez de mentir ───────────────────────────────
const t9 = mkDia(1, 1);
t9.endDate = '2026-09-05T10:00';   // 1 hora pra 7 jogos de 40min
const g9 = W._schGradeEstimada(t9);
ok(g9 && g9.cabe === false, 'torneio que não cabe na janela: cabe=false (o organizador precisa saber)');
ok(W._schGradeEstimada(mkDia(1, 2)).cabe === true, 'torneio que cabe: cabe=true');

// ── 10. A DATA NAS NOVIDADES — o buraco do Rei/Rainha ─────────────────────────
// O card do jogo é o MESMO renderizador nas Novidades da dashboard. A data tem que
// sair dele pra qualquer um, inclusive num jogo de grupo e sem ninguém logado.
const tm = mkMonarch();
W._schAplicarGrade(tm);
const chipM = W._schCardChip(tm, tm.matches[0]);
ok(/📅/.test(chipM), 'Rei/Rainha: o card MOSTRA a data (era o buraco — isMonarch abortava antes)');
ok(/≈/.test(chipM), '  → com o "≈" que diz, em texto, que é estimada');
const t10 = mkDia(1, 2);
W._schAplicarGrade(t10);
ok(/📅/.test(W._schCardChip(t10, t10.matches[0])), 'jogo comum: o card mostra a data estimada');
// combinado ≠ estimado, e a diferença não é só a cor
const t10b = mkDia(1, 2);
t10b.matches[0].scheduledAt = '2026-09-05T20:00:00.000Z';
t10b.matches[0].scheduledKind = 'consensus';
const chipC = W._schCardChip(t10b, t10b.matches[0]);
ok(!/≈/.test(chipC), 'data combinada NÃO leva o "≈"');
ok(/Horário definido/.test(chipC) && /estimado pelo sistema/.test(W._schCardChip(t10, t10.matches[0])),
  'o title diz a origem em texto — cor não é o único sinal');

// ── 11. o botão do GRUPO: data pra todos, proposta só pra quem joga ───────────
const tg = mkMonarch();
tg.matches.forEach(m => { m.scheduledAt = '2026-09-05T12:00:00.000Z'; m.scheduledKind = 'organizer'; });
const gms = tg.matches.filter(m => m.groupIdx === 0);
ok(/📅/.test(W._schGroupChip(tg, gms)), 'grupo com data: a pílula aparece mesmo pra quem NÃO joga o grupo');
const tg2 = mkMonarch();
ok(W._schGroupChip(tg2, tg2.matches.filter(m => m.groupIdx === 0)) === '',
  'grupo SEM data: quem não joga não ganha o botão de propor');

// ── 12. FIAÇÃO: as peças continuam ligadas onde precisam ─────────────────────
const srcBracket = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
ok(/var _schGrpBtn = \(typeof window\._schGroupChip === 'function'\)/.test(srcBracket),
  'bracket: o gate isMyGroup saiu do call site do grupo (senão a data some nos outros grupos)');
const srcDraw = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw.js'), 'utf8');
ok(/window\._schAplicarGrade\(t\)/.test(srcDraw), 'o pós-sorteio aplica a grade estimada');
const srcDb = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
ok(/_ADITIVOS = \[[^\]]*'scheduledKind'/.test(srcDb),
  'firebase-db: scheduledKind está na allowlist do save aditivo (senão a origem se perde e a invariante cai)');
const srcSch = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'schedule-poll.js'), 'utf8');
ok(/window\._schOrgDefinir = function/.test(srcSch), 'o organizador tem o caminho de apontar a data direto');
ok(/m\.scheduledKind = 'organizer'/.test(srcSch), '  → e o que ele aponta é carimbado como organizer');
ok(/m\.scheduledKind = 'consensus'/.test(srcSch), 'o consenso dos jogadores carimba consensus');
ok(!/Combinar jogo/.test(srcSch.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')),
  'nenhum "Combinar jogo" sobrou no código vivo (só em comentário histórico)');

console.log((fail ? '✗' : '✓') + ' grade-estimada-e-propor-datas: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
