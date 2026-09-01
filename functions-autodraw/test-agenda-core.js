/* test-agenda-core.js — a agenda do sorteio no FUSO DO EVENTO, a janela de 1 minuto e a
 * trava de slot.   node functions-autodraw/test-agenda-core.js
 *
 * O QUE ESTE ARQUIVO TRAVA (L6.R1):
 *  ① fuso IANA declarado no evento ganha de tudo;
 *  ② agenda em America/Sao_Paulo converte a hora LOCAL certo (e Manaus, que é outra hora);
 *  ③ dentro do minuto local a janela está aberta; no minuto seguinte, fechada;
 *  ④ janela perdida → o próximo slot é o do CALENDÁRIO, nunca `agora + intervalo`;
 *  ⑤ horário de verão não desloca o horário de parede (o teste usa um fuso que TEM DST,
 *     porque o Brasil não tem desde 2019 e um teste só com Brasil não provaria nada);
 *  ⑥ fuso não determinável devolve motivo — e quem chama não gera;
 *  ⑦ a trava de slot é por igualdade de número e não deixa dois reivindicarem o mesmo.
 */
'use strict';
const A = require('./agenda-core.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }

// ── ① prioridade do fuso declarado ────────────────────────────────────────────────────
console.log('\n▸ ① o timeZone declarado no evento ganha de tudo');
{
  const t = { timeZone: 'America/Manaus', venueAddress: 'Av. Paulista, 1000 — São Paulo, SP',
              venueLat: -23.56, venueLon: -46.65 };
  const r = A.resolverFuso(t, { city: 'Recife' });
  eq(r.tz, 'America/Manaus', 'o declarado vence coordenada, endereço e cidade do organizador');
  eq(r.fonte, 'evento.timeZone', 'e a fonte diz de onde veio');

  const inval = A.resolverFuso({ timeZone: 'Brasilia/Fuso_Que_Nao_Existe' }, null);
  eq(inval.tz, null, 'timeZone inválido NÃO cai no palpite seguinte — recusa');
  ok(/inválido/.test(inval.motivo || ''), 'e diz que o declarado é inválido');
}

console.log('▸ ①b as outras fontes, na ordem');
{
  eq(A.resolverFuso({ venueLat: -3.1, venueLon: -60.0 }, null).tz, 'America/Manaus',
    'coordenada dentro da caixa do Amazonas');
  eq(A.resolverFuso({ venueAddress: 'Quadra 3 — Cuiabá, MT' }, null).tz, 'America/Cuiaba',
    'texto do endereço com cidade conhecida');
  eq(A.resolverFuso({ venue: 'Arena — Rio Branco' }, null).tz, 'America/Rio_Branco',
    'nome do local com cidade conhecida');
  eq(A.resolverFuso({}, { city: 'Fortaleza' }).tz, 'America/Fortaleza',
    'cidade declarada do organizador (passo c)');
  const nada = A.resolverFuso({ venue: 'Quadra do condomínio' }, {});
  eq(nada.tz, null, 'sem nada reconhecível → não determina');
  ok(/sem fuso/.test(nada.motivo || ''), 'e devolve MOTIVO explícito (o chamador não gera)');
  eq(A.resolverFuso({ venueLat: 0, venueLon: 0 }, null).tz, null, '0,0 não é coordenada');
  eq(A.resolverFuso({ venueAddress: 'divisa SP / MS' }, null).tz, null,
    'texto com DOIS estados é ambíguo → recusa (não escolhe um)');
}

// ── ② conversão de hora local ─────────────────────────────────────────────────────────
console.log('▸ ② a hora agendada é a hora LOCAL do evento');
{
  // 04/set/2026 19:00 em São Paulo (UTC-3) = 22:00Z
  const sp = A.instanteDoSlot('2026-09-04', '19:00', 'America/Sao_Paulo');
  eq(new Date(sp).toISOString(), '2026-09-04T22:00:00.000Z', 'São Paulo 19:00 → 22:00Z');
  // a MESMA parede em Manaus (UTC-4) = 23:00Z — prova que o fuso muda o instante
  const mao = A.instanteDoSlot('2026-09-04', '19:00', 'America/Manaus');
  eq(new Date(mao).toISOString(), '2026-09-04T23:00:00.000Z', 'Manaus 19:00 → 23:00Z');
  ok(mao - sp === 3600000, 'e a diferença é exatamente 1 h (não é o mesmo instante)');
  const p = A.partesLocais(sp, 'America/Sao_Paulo');
  ok(p && p.hora === 19 && p.minuto === 0, 'de volta pro relógio local dá 19:00');
  eq(A.instanteDoSlot('2026-09-04', '19:00', 'Nao/Existe'), null, 'fuso inválido → null');
}

console.log('▸ ②b horário de verão NÃO desloca a hora de parede');
{
  // Santiago tem DST. 1º/set/2026 e 1º/dez/2026 caem em lados diferentes da virada.
  const cfg = { drawFirstDate: '2026-09-01', drawFirstTime: '19:00', drawIntervalDays: 7 };
  const tz = 'America/Santiago';
  const s0 = A.slotK(cfg, 0, tz), s13 = A.slotK(cfg, 13, tz);
  const p0 = A.partesLocais(s0, tz), p13 = A.partesLocais(s13, tz);
  ok(p0 && p13 && p0.hora === 19 && p13.hora === 19,
    'slot 0 e slot 13 continuam às 19:00 LOCAIS (' + (p0 && p0.hora) + 'h / ' + (p13 && p13.hora) + 'h)');
  ok(p0.offsetMin !== p13.offsetMin,
    'e o offset MUDOU entre eles (' + p0.offsetMin + ' → ' + p13.offsetMin + ') — o teste vale');
  ok((s13 - s0) !== 13 * 7 * 86400000,
    'a distância em ms NÃO é múltiplo exato de 24h — é por isso que somar ms quebraria');
}

// ── ③ janela de 1 minuto ──────────────────────────────────────────────────────────────
console.log('▸ ③ a janela é o MESMO MINUTO local — segundos depois valem');
{
  const slot = A.instanteDoSlot('2026-09-04', '19:00', 'America/Sao_Paulo');
  ok(A.mesmoMinuto(slot, slot), 'no instante exato: aberta');
  ok(A.mesmoMinuto(slot + 5000, slot), '5 s depois: aberta (o Scheduler entra atrasado)');
  ok(A.mesmoMinuto(slot + 59999, slot), '59,999 s depois: aberta');
  ok(!A.mesmoMinuto(slot + 60000, slot), '60 s depois: FECHADA');
  ok(!A.mesmoMinuto(slot - 1, slot), 'um milissegundo ANTES ainda é o minuto anterior');
}

// ── ④ janela perdida → próximo slot do CALENDÁRIO ────────────────────────────────────
console.log('▸ ④ perdeu o minuto: o próximo é o do calendário, não agora+intervalo');
{
  const cfg = { drawFirstDate: '2026-09-04', drawFirstTime: '19:00', drawIntervalDays: 7 };
  const tz = 'America/Sao_Paulo';
  const s0 = A.slotK(cfg, 0, tz);
  const atrasado = s0 + 166 * 60000;                      // 166 min depois — o caso real medido
  const prox = A.proximoSlotFuturo(cfg, atrasado, tz);
  eq(prox, A.slotK(cfg, 1, tz), 'o próximo é o slot 1 do calendário');
  const pl = A.partesLocais(prox, tz);
  ok(pl.hora === 19 && pl.minuto === 0, 'e continua às 19:00 locais (o ciclo não deslocou)');
  ok(prox !== atrasado + 7 * 86400000, '⛔ NÃO é agora+intervalo (isso deslocaria o calendário)');
  eq(A.slotDevido(cfg, atrasado, tz), s0, 'o slot DEVIDO segue sendo o que venceu');
  ok(A.proximoSlotFuturo(cfg, atrasado, tz) > atrasado, 'e o próximo é estritamente futuro');
}

console.log('▸ ④b sorteio ÚNICO (sem repetição) não inventa slot seguinte');
{
  const cfg = { drawFirstDate: '2026-09-04', drawFirstTime: '19:00', drawIntervalDays: 0 };
  const tz = 'America/Sao_Paulo';
  const s0 = A.slotK(cfg, 0, tz);
  eq(A.slotK(cfg, 1, tz), null, 'não existe slot 1 num sorteio único');
  eq(A.proximoSlotFuturo(cfg, s0 + 60000, tz), null, 'passou → não há próximo');
  eq(A.proximoSlotFuturo(cfg, s0 - 60000, tz), s0, 'antes → o próximo é ele mesmo');
}

// ── ⑦ trava de slot ───────────────────────────────────────────────────────────────────
console.log('▸ ⑦ a trava de slot: um número, comparado por igualdade');
{
  const slot = A.instanteDoSlot('2026-09-04', '19:00', 'America/Sao_Paulo');
  const t = {};
  ok(A.reivindicarSlot(t, slot), 'o primeiro reivindica');
  eq(t.drawSlotAt, slot, 'e a marca fica no documento');
  ok(!!t.lastAutoDrawAt, 'e lastAutoDrawAt anda junto (o resto do sistema lê ele)');
  ok(!A.reivindicarSlot(t, slot), '⛔ o segundo NÃO reivindica o mesmo slot');
  ok(A.slotReivindicado(t, slot), 'e a consulta confirma que está reivindicado');
  ok(A.reivindicarSlot(t, slot + 7 * 86400000), 'o slot SEGUINTE é outro — esse reivindica');
  ok(!A.slotReivindicado(t, slot), 'e o anterior deixou de ser o corrente');
  ok(!A.reivindicarSlot(t, NaN), 'slot inválido nunca reivindica');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
