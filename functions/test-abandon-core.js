/* Torneio ABANDONADO — o que nunca foi concluído nem encerrado pelo organizador.
 *
 * REPRODUZ O CASO REAL medido em produção em 02/ago/2026 (8 torneios vivos, 4 abandonados).
 * Os dados abaixo são os do banco, incluindo o formato cru dos timestamps (`resultAt` às
 * vezes vem em SEGUNDOS, medido: 1782654280).
 *
 * O teste existe principalmente por causa de UMA armadilha: o torneio mais obviamente
 * abandonado — "Torneio Misto FUTVOLEI", 12 de 19 jogos, parado desde 28/jun — **TEM data
 * de término preenchida**, vencida há 35 dias. Uma regra do tipo "só age quando a data de
 * término está em branco" deixaria justamente ele passar. Aqui isso é asserção.
 *
 * Trava também as três decisões de desenho:
 *   • quem NUNCA teve placar não é encerrado (sai da vitrine) — encerrar criaria pódio vazio;
 *   • Liga/Pontos Corridos nunca entra (temporada contínua);
 *   • o prazo sai do RITMO do torneio: max(14 dias, 3 × janela).
 */
const ac = require("./abandon-core");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  ✗", m); } };
const eq = (a, b, m) => ok(a === b, m + " — esperado " + JSON.stringify(b) + ", veio " + JSON.stringify(a));
console.log("──── abandon-core ────");

const DIA = ac.DIA;
const NOW = Date.parse("2026-08-02T12:00:00Z");
const ms = (s) => Date.parse(s);

// ── 1. O CASO REAL: FUTVOLEI, com data de término VENCIDA ─────────────────────
{
  const t = { id: 'tour_1782605223900', name: 'Torneio Misto FUTVOLEI', status: 'in_progress',
              format: 'Fase de Grupos + Eliminatórias', startDate: '2026-06-28', endDate: '2026-06-28',
              createdAt: '2026-06-28T10:00:00Z', matches: [{}] };
  // timestamps REAIS do banco — em segundos, como estão gravados
  const pl = { comPlacar: 12, primeiro: 1782654280 * 1000, ultimo: 1782658908 * 1000 };
  const r = ac.computeAbandon(t, pl, NOW);
  eq(r.acao, 'encerrar', 'FUTVOLEI (12/19 jogos, fim 28/jun vencido há 35d) É encerrado');
  ok(/término/.test(r.motivo), 'e o motivo é a data de término vencida — não a ausência dela');
  // a regra ingênua ("só quando endDate está em branco") deixaria passar:
  ok(!!t.endDate, 'ATENÇÃO: este torneio TEM endDate — a regra não pode ignorar quem tem data');
}

// ── 2. Data de término vencida, mas ainda dentro da folga de 7 dias ───────────
{
  const t = { status: 'active', format: 'Eliminatórias Simples', endDate: '2026-07-30',
              createdAt: '2026-07-01T00:00:00Z', matches: [{}] };
  const pl = { comPlacar: 4, primeiro: ms('2026-07-30T14:00:00Z'), ultimo: ms('2026-07-30T18:00:00Z') };
  // o prazo é fim (30/07, fim do dia BRT) + 7 dias = 07/08; o aviso sai 48h antes = 05/08.
  const r0 = ac.computeAbandon(t, pl, ms('2026-08-02T12:00:00Z'));
  eq(r0.acao, 'nada', '3 dias depois do fim ainda é folga: não encerra e nem avisa');
  const r = ac.computeAbandon(t, pl, ms('2026-08-06T12:00:00Z'));
  eq(r.acao, 'avisar', 'a 1 dia do prazo, avisa (janela de 48h)');
  const r2 = ac.computeAbandon(t, pl, ms('2026-08-08T12:00:00Z'));
  eq(r2.acao, 'encerrar', 'passada a folga de 7 dias, encerra');
}

// ── 3. Placar lançado DEPOIS da data de término: o relógio recomeça ───────────
{
  const t = { status: 'active', format: 'Eliminatórias Simples', endDate: '2026-06-28',
              createdAt: '2026-06-01T00:00:00Z', matches: [{}] };
  const pl = { comPlacar: 6, primeiro: ms('2026-06-28T10:00:00Z'), ultimo: ms('2026-08-01T10:00:00Z') };
  const r = ac.computeAbandon(t, pl, NOW);
  eq(r.acao, 'nada', 'o torneio esticou e teve jogo ontem — a data vencida não o mata');
}

// ── 4. Sem data de término: o prazo sai do RITMO do próprio torneio ───────────
{
  const base = { status: 'active', format: 'Eliminatórias Simples', createdAt: '2026-06-01T00:00:00Z', matches: [{}] };
  // torneio de UM DIA parado há 15 dias → morto
  const umDia = { comPlacar: 8, primeiro: ms('2026-07-18T10:00:00Z'), ultimo: ms('2026-07-18T18:00:00Z') };
  eq(ac.computeAbandon(base, umDia, NOW).acao, 'encerrar', 'torneio de 1 dia parado há 15 dias → encerra');
  // ...mas com 10 dias parado, ainda não (piso de 14)
  eq(ac.computeAbandon(base, umDia, ms('2026-07-28T12:00:00Z')).acao, 'nada',
     'com 10 dias parado ainda não — o piso é 14 dias');
  // torneio que legitimamente durou 3 SEMANAS: 3× a janela = 63 dias de tolerância
  const tresSem = { comPlacar: 30, primeiro: ms('2026-07-01T10:00:00Z'), ultimo: ms('2026-07-22T10:00:00Z') };
  eq(ac.computeAbandon(base, tresSem, NOW).acao, 'nada',
     'torneio longo parado há 11 dias NÃO é encerrado (o prazo dele é 3× a janela)');
  eq(ac.computeAbandon(base, tresSem, ms('2026-09-30T12:00:00Z')).acao, 'encerrar',
     'mas parado há 70 dias, encerra');
}

// ── 5. NUNCA JOGOU: sai da vitrine, NUNCA é encerrado ─────────────────────────
{
  // os 2 do djmfoto e o do douglasgilmar, medidos: criados em 18-21/jun, zero placar
  const nunca = { status: 'open', format: 'Eliminatórias Simples', createdAt: '2026-06-21T00:00:00Z' };
  const r = ac.computeAbandon(nunca, { comPlacar: 0, primeiro: null, ultimo: null }, NOW);
  eq(r.acao, 'foraDaVitrine', 'torneio que nunca teve placar sai da vitrine');
  ok(r.acao !== 'encerrar', 'e NUNCA vira "encerrado" — seria pódio vazio e linha falsa na ficha');
  const sorteado = { status: 'active', format: 'Eliminatórias Simples', createdAt: '2026-06-18T00:00:00Z', matches: [{}] };
  const r2 = ac.computeAbandon(sorteado, { comPlacar: 0, primeiro: null, ultimo: null }, NOW);
  eq(r2.acao, 'foraDaVitrine', 'sorteado mas sem nenhum placar: idem (nada foi jogado)');
  ok(/sorteado/.test(r2.motivo), 'o motivo distingue sorteado de nunca-saiu-do-papel');
  const novo = { status: 'open', format: 'Eliminatórias Simples', createdAt: '2026-07-25T00:00:00Z' };
  eq(ac.computeAbandon(novo, { comPlacar: 0 }, NOW).acao, 'nada', 'torneio novo sem placar é só novo');
}

// ── 6. Exceções que não podem ser tocadas ─────────────────────────────────────
{
  const parado = { comPlacar: 10, primeiro: ms('2026-06-01T10:00:00Z'), ultimo: ms('2026-06-01T20:00:00Z') };
  eq(ac.computeAbandon({ status: 'active', format: 'Liga', createdAt: '2026-05-01' }, parado, NOW).acao,
     'nada', 'LIGA nunca é encerrada por ociosidade (temporada contínua)');
  eq(ac.computeAbandon({ status: 'active', format: 'Ranking', createdAt: '2026-05-01' }, parado, NOW).acao,
     'nada', 'Ranking (nome legado da Liga) idem');
  eq(ac.computeAbandon({ status: 'finished', format: 'Eliminatórias Simples' }, parado, NOW).acao,
     'nada', 'quem já está encerrado não é reencerrado');
  eq(ac.computeAbandon({ status: 'active', format: 'Eliminatórias Simples', isSandbox: true, createdAt: '2026-05-01' }, parado, NOW).acao,
     'nada', 'sandbox fica de fora (é do dev e não gera nada)');
}

// ── 7. Leitura de data: o banco guarda ISO, dia puro e epoch em SEGUNDOS ──────
{
  eq(ac.msDe(1782654280), 1782654280 * 1000, 'epoch em segundos vira ms');
  eq(ac.msDe(1782654280000), 1782654280000, 'epoch em ms fica como está');
  eq(ac.msDe('2026-06-28T10:00:00Z'), ms('2026-06-28T10:00:00Z'), 'ISO');
  eq(ac.msDe('28/06/2026'), null, 'data com barra NÃO é chutada (10/03 já virou 3 de outubro antes)');
  ok(ac.msDe('2026-06-28') > ms('2026-06-28T20:00:00Z'), 'dia puro conta até o FIM do dia (BRT)');
  eq(ac.msDe(''), null, 'vazio é vazio');
}

// ── 8. As mensagens dizem O QUE RESOLVE ───────────────────────────────────────
{
  const av = ac.mensagemAviso('Copa X', ms('2026-08-05T12:00:00Z'));
  ok(/datas/.test(av), 'o aviso de 48h diz que preencher as DATAS mantém o torneio ativo');
  ok(/05\/08/.test(av), 'e diz a data em que vai encerrar');
  const en = ac.mensagemEncerrado('Copa X');
  ok(/reabra|reabrir/i.test(en), 'o aviso de encerrado diz que dá pra REABRIR');
  ok(/classificação NÃO foi fechada/i.test(en), 'e deixa claro que a classificação não foi fechada');
}

console.log("  " + pass + " asserts OK, " + fail + " falhas");
if (fail > 0) { console.error("❌ abandon-core FALHOU"); process.exit(1); }
console.log("✅ abandon-core: OK");
