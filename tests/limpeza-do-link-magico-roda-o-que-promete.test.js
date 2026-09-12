'use strict';
/* ⛔ COMENTÁRIO QUE PROMETE UMA CADÊNCIA E CÓDIGO QUE RODA OUTRA.
 * `magicLinks/{token}` guarda o LINK ASSINADO DE ENTRADA e um e-mail, com validade de 90
 * minutos. O comentário dizia "Roda 3x ao dia (04:30, 12:30, 20:30 BRT)" desde a v1.0.34-beta;
 * o agendamento era `every day 04:30`. Um documento vencido ficava até ~24h guardado em vez de
 * ~8h — três vezes a janela que alguém tinha decidido aceitar. Achado da L4, item (c).
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const F = fs.readFileSync(path.join(__dirname, '..', 'functions/index.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const i = F.indexOf('exports.cleanupOldMagicLinks = onSchedule(');
assert.ok(i > 0, 'âncora: a limpeza dos links mágicos');
const bloco = F.slice(i, i + 400);
must(/schedule: "30 4,12,20 \* \* \*"/.test(bloco), '① roda às 04:30, 12:30 e 20:30 — o que o comentário sempre prometeu');
must(!/schedule: "every day 04:30"/.test(bloco), '① ⛔ a cadência de uma vez ao dia não voltou');
must(/timeZone: "America\/Sao_Paulo"/.test(bloco), '① nos horários de Brasília, como estava escrito');

/* ② a mesma classe de erro no resto do arquivo: comentário que promete Nx/dia com
 *    agendamento `every day` (que é 1x). A varredura roda sobre TODAS as agendadas. */
const linhas = F.split('\n');
const mentiras = [];
linhas.forEach((l, n) => {
  const m = /schedule: "([^"]+)"/.exec(l);
  if (!m || !m[1].startsWith('every day')) return;
  const ctx = linhas.slice(Math.max(0, n - 14), n).join('\n');
  const p = /(\d+)\s*x\s*(?:ao|por)\s*dia/i.exec(ctx);
  if (p && p[1] !== '1') mentiras.push(l.trim() + ' ← comentário diz ' + p[1] + 'x/dia');
});
must(mentiras.length === 0,
  '② ⛔ nenhuma outra agendada promete no comentário o que não cumpre (achei ' + mentiras.length + ')');

console.log('\n✅ limpeza do link mágico roda o que promete — ' + ok + ' verificações');

/* ─── L4.P14 — AS PROVAS DE POSSE VENCIDAS TAMBÉM SÃO VARRIDAS ────────────────
 * MEDIDO em produção (12/set/2026): emailVerifications 18/18 vencidos, mergeTokens 9/9.
 * A causa de nunca terem sido limpas é de SCHEMA: `expiresAt` é texto ISO numa, Timestamp
 * noutra e número na terceira. O Firestore compara DENTRO do tipo — a consulta padrão com um
 * Date devolveria zero em duas delas, calada. */
(function () {
  const bloco2 = F.slice(i, F.indexOf('// ─── Scheduled backup', i));
  must(/collection\("emailVerifications"\)\.where\("expiresAt", "<", nowIso\)/.test(bloco2),
    '③ emailVerifications é consultada com TEXTO ISO — é o tipo que ela usa');
  must(/collection\("mergeTokens"\)\.where\("expiresAt", "<", now\)/.test(bloco2),
    '③ mergeTokens com Timestamp');
  must(/collection\("emailVerifyCodes"\)\.where\("expiresAt", "<", nowMs\)/.test(bloco2),
    '③ emailVerifyCodes com NÚMERO (epoch ms)');
  must(/const nowIso = now\.toISOString\(\);/.test(bloco2) && /const nowMs = now\.getTime\(\);/.test(bloco2),
    '③ os três valores de comparação são derivados do MESMO instante');
  must(/provas de posse vencidas/.test(bloco2),
    '③ e o resultado de cada uma vai para o log — varredura sem número não se audita');
})();

console.log('✅ (+ L4.P14) provas de posse vencidas são varridas — total ' + ok + ' verificações');
