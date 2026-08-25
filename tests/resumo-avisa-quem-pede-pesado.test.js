/* O RESUMO AVISA QUANDO ALGUÉM PEDE CAMPO PESADO — em vez de eu auditar 41 sítios.
 *
 * Desde a 2.0.90 a vitrine entrega o documento LEVE (`_resumo: true`): tem o que o
 * CARTÃO mostra, não tem jogos, inscritos nem histórico. Quem ABRE o torneio troca
 * pelo completo (`_ensureTournamentLoaded`).
 *
 * ⚠️ MEDIDO: 41 lugares no app leem `matches`/`rounds`/`participants` a partir de
 * `AppStore.tournaments`/`publicDiscovery`. A maioria é `find(id)` de um torneio já
 * aberto (portanto completo) — mas auditar 41 sítios POR LEITURA é como se erra:
 * basta um caminho raro escapar, e o defeito aparece em produção, num torneio ao vivo.
 *
 * ⛔ Então o app AVISA em vez de eu adivinhar. E a sentinela é MEDIÇÃO, não muleta:
 *   · devolve `undefined` — exatamente o que devolveria sem ela;
 *   · não preenche nada, não busca nada, não bloqueia nada;
 *   · avisa UMA vez por campo (senão vira enxurrada num laço).
 */
const fs = require('fs');
const path = require('path');
const HARNESS = require('./render-harness');
const W = HARNESS.window;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── o resumo avisa quem pede campo pesado ────');

// ── ① só marca RESUMO ───────────────────────────────────────────────────────
{
  const completo = { id: 'a', matches: [{ id: 'm1' }] };
  const r = W._marcaResumo(completo);
  ok(r === completo, 'devolve o mesmo objeto (não clona)');
  ok(Array.isArray(completo.matches) && completo.matches.length === 1,
     '⛔ documento COMPLETO passa intacto — a sentinela é só pro leve');
}

// ── ② no resumo, pedir campo pesado devolve undefined e AVISA ──────────────
{
  const avisos = [];
  const antes = W._captureMessage;
  W._captureMessage = (msg) => avisos.push(msg);
  try {
    const resumo = W._marcaResumo({ id: 'b', _resumo: true, name: 'X' });
    ok(resumo.matches === undefined,
       '⛔ pedir `matches` devolve undefined — EXATAMENTE o que devolveria sem a sentinela');
    ok(avisos.length === 1 && /resumo-pediu-pesado: matches/.test(avisos[0]),
       '⭐ e avisa, com o nome do campo (' + (avisos[0] || '').slice(0, 42) + '…)');
    ok(/at /.test(avisos[0]) || avisos[0].indexOf('·') > 0,
       'o aviso leva o rastro de QUEM pediu (sem isso não dá pra consertar)');
  } finally { W._captureMessage = antes; }
}

// ── ③ ⛔ avisa UMA vez por campo (num laço viraria enxurrada) ──────────────
{
  const avisos = [];
  const antes = W._captureMessage;
  W._captureMessage = (msg) => avisos.push(msg);
  try {
    const r = W._marcaResumo({ id: 'c', _resumo: true });
    for (let i = 0; i < 50; i++) { void r.rounds; }
    ok(avisos.length <= 1, '⛔ 50 leituras geram no máximo 1 aviso (' + avisos.length + ')');
  } finally { W._captureMessage = antes; }
}

// ── ④ campo que o RESUMO TROUXE não vira sentinela ─────────────────────────
// O resumo carrega `polls` inteiras e `participantUids`. Sentinelar o que existe
// esconderia o dado de verdade.
{
  const r = W._marcaResumo({ id: 'd', _resumo: true, participants: [{ uid: 'u1' }] });
  ok(Array.isArray(r.participants) && r.participants.length === 1,
     '⛔ campo que o resumo TROUXE continua legível (sentinelar esconderia o dado)');
}

// ── ⑤ a sentinela é invisível pra quem copia o objeto ──────────────────────
// `JSON.stringify`, `Object.assign` e `{...t}` não podem passar a disparar avisos —
// senão salvar/serializar viraria uma cascata de falsos alarmes.
{
  const avisos = [];
  const antes = W._captureMessage;
  W._captureMessage = (msg) => avisos.push(msg);
  try {
    const r = W._marcaResumo({ id: 'e', _resumo: true, name: 'Y' });
    const txt = JSON.stringify(r);
    const copia = Object.assign({}, r);
    ok(avisos.length === 0,
       '⛔ serializar/copiar NÃO dispara aviso (seria cascata de falso alarme)');
    ok(txt.indexOf('matches') === -1, 'e o campo sentinelado não entra no JSON');
    ok(copia.id === 'e', 'a cópia rasa continua funcionando');
  } finally { W._captureMessage = antes; }
}

// ── ⑥ marcar duas vezes não quebra ─────────────────────────────────────────
{
  const r = W._marcaResumo({ id: 'f', _resumo: true });
  ok(W._marcaResumo(r) === r, 'marcar de novo é inofensivo (idempotente)');
}

// ── ⑦ a vitrine marca os resumos que entrega ───────────────────────────────
{
  const db = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
  ok(/_marcaResumo\(d\)/.test(db),
     '⛔ a vitrine marca cada resumo que entrega (sem isso o detector não vê nada)');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
