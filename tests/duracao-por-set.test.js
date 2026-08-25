/* DURAÇÃO DA PARTIDA — o tempo configurado é POR SET, não pela partida.
 *
 * 25/ago/2026, o dono corrigindo a própria especificação:
 *   _"o tempo médio das partidas deveria ser o tempo médio de SET e não da
 *    partida. uma partida melhor de 3 deve ter em média 2,5 sets multiplicando
 *    aquele valor"_ · _"melhor de 5: 4,5x"_ · **"é tempo por set e o rei/rainha é
 *    3x o tempo atual; NÃO dividido por 3 — eu disse lá atrás partida quando
 *    deveria ter dito set"** · _"erro meu lá atrás revelado agora"_.
 *
 * A FALHA QUE ISTO REPRODUZ: o app somava `gameDuration + callTime + warmupTime`
 * como se fosse a partida inteira. Set único e melhor de 3 recebiam o MESMO tempo,
 * e a fase Rei/Rainha do Confra (3 sets) era prevista com 1/3 do tempo real.
 *
 * ⛔ A tentação que este teste também barra: "criar `setDuration` derivando
 * gameDuration ÷ sets pra não mexer nos torneios existentes" — isso preservaria o
 * número ERRADO. O valor gravado já é por set; a previsão TEM que subir.
 */
const HARNESS = require('./render-harness');
const W = HARNESS.window;
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── duração da partida = tempo por SET × sets esperados da FASE ────');

// ── ① a tabela de sets esperados, com os números do dono ─────────────────────
ok(W._setsEsperadosDe(1) === 1, 'set único → 1,0 set');
ok(W._setsEsperadosDe(2) === 2.5, 'melhor de 3 (setsToWin=2) → 2,5 sets');
ok(W._setsEsperadosDe(3) === 4.5, 'melhor de 5 (setsToWin=3) → 4,5 sets');
ok(W._setsEsperadosDe(0) === null && W._setsEsperadosDe('x') === null,
   'valor inválido devolve null (quem chama decide o fallback, não chuta)');

// ── ② ⛔🔴 REI/RAINHA: o "3×" JÁ ESTÁ na contagem de jogos ───────────────────
// O dono pediu "Rei/Rainha = 3× o tempo atual" e está certo sobre o GRUPO — que
// ocupa a quadra por 3 sets. Só que o motor não guarda um jogo de 3 sets: guarda
// TRÊS JOGOS de 1 set. Multiplicar a partida por 3 triplicaria um total que já
// está triplicado. Este bloco mede isso no documento REAL, não em teoria.
{
  const t = { sport: 'Beach Tennis', gameDuration: 30 };
  ok(W._setsEsperadosDaFase(t, { reiRainha: true }) === 1,
     '⭐ jogo de Rei/Rainha = 1,0 set (o grupo joga 3, mas são 3 JOGOS separados)');
  ok(W._setsEsperadosDaFase({ ...t, ligaRoundFormat: 'rei_rainha' },
                            { formatCode: 'elim_simples', scoring: { setsToWin: 2 } }) === 2.5,
     '⛔ e o Rei/Rainha do torneio NÃO contamina a fase eliminatória (melhor de 3)');

  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
  const confra = fx.tournament || fx;
  const jogos = ((confra.rounds || [])[0] || {}).matches || [];
  const porGrupo = {};
  jogos.forEach((m) => { const g = m.monarchGroup; if (g != null) porGrupo[g] = (porGrupo[g] || 0) + 1; });
  const grupos = Object.keys(porGrupo);
  const de3 = grupos.filter((g) => porGrupo[g] === 3).length;
  ok(grupos.length > 0 && de3 > grupos.length * 0.8,
     '⛔ MEDIDO no Confra real: ' + de3 + ' dos ' + grupos.length +
     ' grupos de Rei/Rainha têm 3 JOGOS — os 3 sets já são 3 partidas no total');

  // A fixture do Confra é um retrato PÓS-SORTEIO (nenhum placar lançado), então
  // quem prova o tamanho do set é a base real, que tem jogos já disputados.
  const base = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const comSets = [];
  (Array.isArray(base) ? base : (base.tournaments || [])).forEach((x) => {
    [].concat(...(x.rounds || []).map((r) => r.matches || []), x.matches || [])
      .forEach((m) => { if (m && m.isMonarch && Array.isArray(m.sets) && m.sets.length) comSets.push(m); });
  });
  ok(comSets.length > 0 && comSets.every((m) => m.sets.length === 1),
     '⛔ e todo jogo de Rei/Rainha DISPUTADO da base real tem UM set (' + comSets.length + ' conferidos)');
}

// ── ③ a partida do CONFRA, fase por fase ─────────────────────────────────────
{
  const t = { sport: 'Beach Tennis', gameDuration: 30, ligaRoundFormat: 'rei_rainha' };
  const f1 = { formatCode: 'liga', reiRainha: true };
  const f2 = { formatCode: 'elim_simples', reiRainha: false, scoring: { setsToWin: 2 } };
  ok(W._minutosDaPartida(t, f1) === 30,
     'Confra fase 1 (Rei/Rainha) = 30 min por JOGO — e o grupo, com 3 jogos, dá os 90 min do dono');
  ok(W._minutosDaPartida(t, f1) * 3 === 90,
     '⭐ o "3× o tempo atual" do dono aparece no GRUPO (3 × 30 = 90), não na partida');
  ok(W._minutosDaPartida(t, f2) === 75,
     '⭐ Confra fase 2 (melhor de 3, 30min/set) = 75 min por partida — era 30');
  ok(W._minutosDaPartida(t, f1) !== W._minutosDaPartida(t, f2),
     '⛔ e as duas fases DEIXAM de ter o mesmo tempo (a falha original)');
}

// ── ④ chamada e aquecimento são POR PARTIDA, não por set ─────────────────────
{
  const t = { sport: 'Beach Tennis', gameDuration: 30, callTime: 10, warmupTime: 5 };
  ok(W._minutosDaPartida(t, { scoring: { setsToWin: 2 } }) === 30 * 2.5 + 10 + 5,
     'chamada+aquecimento entram UMA vez por partida (75+15=90), não a cada set');
  ok(W._minutosDaPartida(t, { scoring: { setsToWin: 1 } }) === 30 + 10 + 5,
     'e num set único a partida é 30+10+5=45');
}

// ── ⑤ fase sem `scoring` cai na MODALIDADE, nunca em zero ────────────────────
{
  ok(W._minutosDaPartida({ sport: 'Beach Tennis', gameDuration: 30 }, null) === 30,
     'Beach Tennis sem scoring → 1 set (padrão da modalidade) = 30 min');
  ok(W._minutosDaPartida({ sport: 'Tênis', gameDuration: 30 }, null) === 75,
     'Tênis sem scoring → melhor de 3 (padrão da modalidade) = 75 min');
  ok(W._minutosDaPartida({ sport: 'Tênis de Mesa', gameDuration: 10 }, null) === 45,
     'Tênis de Mesa sem scoring → melhor de 5 = 45 min');
  ok(W._minutosDaPartida({}, null) === 30,
     'sem modalidade e sem duração: 30min × 1 set — nunca 0, nunca NaN');
}

// ── ⑥ ⛔ a previsão SOBE na base real (se não subiu, nada foi corrigido) ─────
{
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const lista = (Array.isArray(arr) ? arr : (arr.tournaments || [])).filter((t) => t.gameDuration);
  ok(lista.length >= 5, 'a base real tem torneios com duração configurada (' + lista.length + ')');

  let subiu = 0, igual = 0, caiu = 0;
  lista.forEach((t) => {
    const fases = (t.phases && t.phases.length) ? t.phases : [null];
    fases.forEach((f) => {
      const antes = (parseInt(t.gameDuration, 10) || 30) + (parseInt(t.callTime, 10) || 0) + (parseInt(t.warmupTime, 10) || 0);
      const depois = W._minutosDaPartida(t, f);
      if (depois > antes) subiu++; else if (depois === antes) igual++; else caiu++;
    });
  });
  ok(caiu === 0, '⛔ NENHUMA fase da base real ficou MAIS CURTA (' + caiu + ') — o valor já era por set');
  ok(subiu > 0, 'e ' + subiu + ' fase(s) passaram a prever mais tempo (' + igual + ' de set único não mudam)');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
