/* test-autodraw-dividido.js — o sorteio AGENDADO num torneio DIVIDIDO, e a trava
 * manual × automático.   node functions-autodraw/test-autodraw-dividido.js
 *
 * A FALHA QUE ISTO REPRODUZ (medida em produção em 31/ago/2026, L6.P1 na auditoria):
 * `exports.autoDraw` lia `doc.data()` CRU, via `participants: []` — porque o elenco mora na
 * subcoleção `inscritos` — e fazia `continue` SEM LOG. O torneio tinha 10 inscritos, o
 * agendamento estava vencido há 166 min, o Cloud Scheduler entrava a cada minuto com HTTP
 * 200 e NENHUMA rodada nascia. Zero erro, zero linha, zero pista.
 *
 * O que este arquivo prova, na ordem do pedido da leva:
 *  ⑥ Liga dividida, com o elenco só na subcoleção, MONTA e chega em "pode sortear";
 *  ⑦ o documento-pai continua sem `participants`/`matches` quando o marcador manda pra fora;
 *  ⑧ menos de DOIS inscritos REAIS (contados no montado, não no doc) não sorteia;
 *  ⑨⑩⑪⑫⑬ a trava de slot: automático→manual, manual→automático, dois manuais, retry —
 *      sempre UMA rodada, zero duplicata e UM único avanço de agenda.
 * E, por FONTE, que o caminho agendado não voltou a decidir/gravar no documento cru.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('./agenda-core.js');
const S = require('./vendor/tournament-split-core.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }

/* Um torneio Liga com 10 inscritos, DIVIDIDO como os 41 de produção: o marcador manda
 * `participants` e `matches` pra fora e o documento fica com os arrays vazios. */
function torneioDividido(nInscritos) {
  const t = {
    id: 'tour_x', name: 'Liga de teste', format: 'Liga', status: 'active',
    creatorUid: 'org1', memberUids: [], drawManual: false,
    drawFirstDate: '2026-09-04', drawFirstTime: '19:00', drawIntervalDays: 7,
    timeZone: 'America/Sao_Paulo',
    participants: [], rounds: [], matches: []
  };
  for (let i = 0; i < nInscritos; i++) {
    t.participants.push({ uid: 'u' + i, name: 'Jogador ' + i });
    t.memberUids.push('u' + i);
  }
  const p = S.dividir(JSON.parse(JSON.stringify(t)), ['participants', 'matches']);
  p.config._semPesados = ['participants', 'matches'];
  return { doc: p.config, partes: p };
}

/* A MESMA montagem que `_leTorneio` faz: `montarDoBanco` com um leitor de coleção. */
async function montar(doc, partes) {
  return await S.montarDoBanco(JSON.parse(JSON.stringify(doc)), async (colecao) => {
    if (colecao === 'inscritos') return (partes.participants || []).map((r) => r);
    if (colecao === 'matches') return (partes.matches || []).map((r) => r);
    return [];
  });
}

(async function () {
  // ── ⑥ e ⑦ ───────────────────────────────────────────────────────────────────────────
  console.log('\n▸ ⑥ Liga dividida: o elenco está na subcoleção e a montagem o encontra');
  {
    const { doc, partes } = torneioDividido(10);
    eq(Array.isArray(doc.participants) ? doc.participants.length : -1, 0,
      '⛔ no DOCUMENTO o elenco é vazio — é exatamente o que enganava o autoDraw');
    eq((partes.participants || []).length, 10, 'e os 10 estão na parte `participants` (subcoleção `inscritos`)');

    const montado = await montar(doc, partes);
    eq((montado.participants || []).length, 10, '⭐ MONTADO, o autoDraw enxerga os 10');
    ok((montado.participants || []).length >= 2,
      'e a guarda "menos de 2" passa a ser avaliada sobre o número REAL');
  }

  console.log('▸ ⑦ o documento-pai continua sem participants/matches depois de gravar');
  {
    const { doc, partes } = torneioDividido(10);
    const montado = await montar(doc, partes);
    montado.rounds = [{ round: 1, matches: [{ id: 'm1', p1: 'a', p2: 'b' }] }];
    // é o que `_gravaTorneio` faz: divide de novo pelo marcador e grava só a config
    const p2 = S.dividir(JSON.parse(JSON.stringify(montado)), montado._semPesados);
    eq((p2.config.participants || []).length, 0, 'o doc gravado continua com participants vazio');
    const jogosNoDoc = (p2.config.rounds || []).reduce((n, r) => n + ((r.matches || []).length), 0);
    eq(jogosNoDoc, 0, 'e os jogos NÃO voltaram pra dentro de rounds[] do documento');
    eq((p2.matches || []).length, 1, 'o jogo novo foi pra parte `matches`');
    eq((p2.participants || []).length, 10, 'e o elenco segue na parte `participants`');
  }

  // ── ⑧ ───────────────────────────────────────────────────────────────────────────────
  console.log('▸ ⑧ menos de dois inscritos REAIS não sorteia');
  {
    const { doc, partes } = torneioDividido(1);
    const montado = await montar(doc, partes);
    eq((montado.participants || []).length, 1, 'o torneio tem 1 inscrito de verdade');
    ok((montado.participants || []).length < 2, 'a guarda barra — e agora barra pelo dado REAL');
    const cheio = await montar(...Object.values(torneioDividido(2)).slice(0, 2));
    ok((cheio.participants || []).length >= 2, 'com 2, a guarda deixa passar');
  }

  // ── ⑨⑩⑪⑫⑬ a trava de slot ──────────────────────────────────────────────────────────
  const cfg = { drawFirstDate: '2026-09-04', drawFirstTime: '19:00', drawIntervalDays: 7 };
  const tz = 'America/Sao_Paulo';
  const slot = A.slotK(cfg, 0, tz);

  console.log('▸ ⑨ automático primeiro, manual depois');
  {
    const t = { drawFirstDate: cfg.drawFirstDate, drawFirstTime: cfg.drawFirstTime, drawIntervalDays: 7 };
    ok(A.reivindicarSlot(t, slot), 'o automático reivindica o slot e gera');
    ok(!A.reivindicarSlot(t, slot), '⛔ o manual chega depois e NÃO reivindica o mesmo slot');
    ok(A.slotReivindicado(t, slot), 'e a consulta devolve o veredito explícito: já gerada');
    eq(A.agendamentoCanonico(cfg, t, slot + 1000, tz), A.slotK(cfg, 1, tz),
      'a agenda anda UMA vez, pro slot seguinte do calendário');
  }

  console.log('▸ ⑩ manual primeiro, automático depois');
  {
    const t = { drawFirstDate: cfg.drawFirstDate, drawFirstTime: cfg.drawFirstTime, drawIntervalDays: 7 };
    ok(A.reivindicarSlot(t, slot), 'o manual consome o slot devido ao gerar a rodada');
    ok(!A.reivindicarSlot(t, slot), '⛔ o cron chega e NÃO gera de novo');
    eq(A.agendamentoCanonico(cfg, t, slot + 5000, tz), A.slotK(cfg, 1, tz),
      'ele só AGENDA o próximo slot — que é a regra escrita');
  }

  console.log('▸ ⑪ duas chamadas manuais concorrentes: só uma vence');
  {
    // duas transações leem o MESMO estado; a que commitar primeiro grava, a outra
    // re-executa sobre o estado JÁ GRAVADO (é o que o Firestore faz) e desiste.
    const banco = { drawFirstDate: cfg.drawFirstDate, drawFirstTime: cfg.drawFirstTime, drawIntervalDays: 7 };
    const tentativa = () => { const copia = JSON.parse(JSON.stringify(banco));
      if (!A.reivindicarSlot(copia, slot)) return false;
      Object.assign(banco, copia); return true; };
    const a = tentativa(), b = tentativa();
    ok(a !== b, 'exatamente UMA das duas venceu (a=' + a + ', b=' + b + ')');
    eq(Number(banco.drawSlotAt), slot, 'e o banco guarda uma única marca');
  }

  console.log('▸ ⑫ retry da MESMA ação não duplica');
  {
    const t = { drawFirstDate: cfg.drawFirstDate, drawFirstTime: cfg.drawFirstTime, drawIntervalDays: 7 };
    let geradas = 0;
    for (let i = 0; i < 5; i++) { if (A.reivindicarSlot(t, slot)) geradas++; }   // 5 re-execuções
    eq(geradas, 1, 'cinco re-execuções da transação geram UMA rodada');
  }

  console.log('▸ ⑬ em todo caso concorrente: uma rodada, zero duplicata, um avanço de agenda');
  {
    const t = { drawFirstDate: cfg.drawFirstDate, drawFirstTime: cfg.drawFirstTime, drawIntervalDays: 7 };
    let geradas = 0, agendas = [];
    ['auto', 'manual', 'auto-retry', 'manual2'].forEach(function () {
      if (A.reivindicarSlot(t, slot)) geradas++;
      agendas.push(A.agendamentoCanonico(cfg, t, slot + 10000, tz));
    });
    eq(geradas, 1, 'UMA rodada');
    eq(new Set(agendas.map(String)).size, 1, 'e TODOS concordam no mesmo próximo agendamento');
    eq(agendas[0], A.slotK(cfg, 1, tz), 'que é o slot 1 do calendário');
  }

  // ── por FONTE: o caminho agendado não voltou a decidir no documento cru ──────────────
  console.log('▸ e, por FONTE, o caminho agendado não decide mais no documento cru');
  {
    const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    const i = src.indexOf('exports.autoDraw = onSchedule');
    const f = src.indexOf('\nasync function _autoDrawIncrementalPhaseRound', i);
    const bloco = i >= 0 ? src.slice(i, f > i ? f : undefined) : '';
    ok(bloco.length > 500, 'achei o corpo do exports.autoDraw');
    ok(/_leTorneio\(tx,/.test(bloco), 'ele monta com _leTorneio DENTRO da transação');
    ok(/_gravaTorneio\(tx,/.test(bloco), 'e persiste por _gravaTorneio');
    ok(/reivindicarSlot/.test(bloco), 'e reivindica o slot antes de gerar');
    ok(/mesmoMinuto/.test(bloco), 'e confere a janela do minuto local');
    ok(!/update\(\{\s*\n?\s*rounds:/.test(bloco) && !/tx\.update\(_ref, Object\.assign/.test(bloco),
      '⛔ e NÃO grava `rounds` direto no documento (era o que desfazia a divisão)');
    // ⚠️ procura o LITERAL de string, não a menção: o comentário do próprio bloco explica
    // por que o offset fixo saiu, e casar com ele daria vermelho por causa da explicação.
    ok(!/['"]-03:00['"]/.test(bloco),
      '⛔ e não sobrou offset fixo "-03:00" como código no caminho agendado');
    ok(/_fusoDoEvento\(/.test(bloco), 'o fuso vem do LOCAL DO EVENTO, resolvido por _fusoDoEvento');

    const rec = src.slice(src.indexOf('exports.autoDrawReconcile'));
    ok(/agendamentoCanonico/.test(rec.slice(0, 3000)),
      'autoDrawReconcile usa a MESMA decisão canônica (nunca recoloca vencido)');
  }

  console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
  process.exit(fail ? 1 : 0);
})();
