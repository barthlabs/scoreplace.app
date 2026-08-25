/* O RESUMO DO TORNEIO — o documento leve que a tela inicial vai ler.
 *
 * DESENHO (ordem do dono, 25/ago/2026): _"na dashboard precisamos da versão
 * reduzida sempre e clicando no torneio traz os detalhes. esse sempre foi o
 * desenho."_ A implementação tinha derivado: a tela inicial baixa o documento
 * INTEIRO de cada torneio (chave, inscritos, placares, histórico) pra desenhar um
 * cartão — e o cartão ainda RECALCULA classificação e progresso por torneio.
 *
 * O QUE ESTE TESTE TRAVA:
 *   ① o resumo é LEVE de verdade, medido no documento REAL da base (não em mock);
 *   ② ⛔ NUNCA carrega base64 (logoData/coverPhotoData) — seriam 35 KB+ e matariam
 *      o propósito;
 *   ③ carrega os DERIVADOS que o cartão hoje calcula no aparelho (contagens,
 *      progresso) — é isso que tira o cálculo de cada celular;
 *   ④ carrega o que responde "meus torneios" (memberUids/creatorUid) e a busca
 *      no SERVIDOR (nameLower/tokens) — hoje a busca só acha o que já está na tela;
 *   ⑤ é PURO: mesma entrada, mesma saída (dá pra comparar e não regravar à toa);
 *   ⑥ `summaryMudou` ignora o que não muda o cartão — sem isso, um torneio AO VIVO
 *      geraria uma escrita de resumo a cada ponto marcado.
 */
const fs = require('fs');
const path = require('path');
const { buildSummary, summaryMudou } = require('../functions/tournament-summary-core.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── resumo do torneio (documento leve da tela inicial) ────');

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
const t = fx.tournament || fx;
const s = buildSummary(t, t.id);

// ── ① leve de verdade, no documento REAL ──────────────────────────────────────
const kbCompleto = JSON.stringify(t).length / 1024;
const kbResumo = JSON.stringify(s).length / 1024;
ok(kbResumo < kbCompleto * 0.15,
   'o resumo é pelo menos 85% menor que o documento (' + kbCompleto.toFixed(0) + ' KB → ' +
   kbResumo.toFixed(1) + ' KB = ' + (100 - kbResumo / kbCompleto * 100).toFixed(1) + '% menor)');
ok(kbResumo < 8, 'e cabe em poucos KB mesmo no MAIOR torneio da base (' + kbResumo.toFixed(1) + ' KB)');

// ── ② ⛔ base64 JAMAIS ────────────────────────────────────────────────────────
const bruto = JSON.stringify(s);
ok(bruto.indexOf('base64') === -1, '⛔ nenhum base64 no resumo');
ok(!('logoData' in s) && !('coverPhotoData' in s),
   '⛔ os campos base64 do documento (logoData/coverPhotoData) não são copiados');
ok(!('participants' in s) && !('rounds' in s) && !('matches' in s) && !('history' in s),
   '⛔ e os campos PESADOS também não (participants/rounds/matches/history)');

// ── ③ os derivados que hoje o aparelho calcula ────────────────────────────────
ok(s.participantsCount === (t.participants || []).length,
   'traz a CONTAGEM de inscritos (' + s.participantsCount + ') em vez da lista');
ok(typeof s.matchesTotal === 'number' && typeof s.matchesDone === 'number' && typeof s.progressPct === 'number',
   'traz o PROGRESSO já calculado (' + s.matchesDone + '/' + s.matchesTotal + ' = ' + s.progressPct + '%)');
ok(typeof s.waitlistCount === 'number' && typeof s.standbyCount === 'number',
   'e as contagens de espera/suplentes');

// ── ④ "meus torneios" e busca no servidor ────────────────────────────────────
ok(Array.isArray(s.memberUids) && s.memberUids.length > 0,
   'traz memberUids — é ele que responde "meus torneios" como CONSULTA (' + s.memberUids.length + ')');
ok(typeof s.nameLower === 'string' && s.nameLower === s.nameLower.toLowerCase(),
   'traz nameLower (busca por prefixo no servidor)');
ok(Array.isArray(s.tokens) && s.tokens.length > 0 && s.tokens.indexOf('confra') !== -1,
   'traz tokens de busca por palavra (' + s.tokens.slice(0, 5).join(', ') + ')');
ok(s.tokens.every(function (x) { return x === x.normalize('NFD').replace(/[̀-ͯ]/g, ''); }),
   'e os tokens são SEM ACENTO (procurar "clinica" acha "Clínica")');

// ── ⑤ puro ───────────────────────────────────────────────────────────────────
ok(JSON.stringify(buildSummary(t, t.id)) === JSON.stringify(s),
   'é PURO: mesma entrada, mesma saída');
ok(buildSummary(null, 'x') === null, 'documento vazio devolve null (não inventa resumo)');

// ── ⑥ não regrava à toa ──────────────────────────────────────────────────────
{
  const copia = JSON.parse(JSON.stringify(t));
  ok(summaryMudou(t, copia, t.id) === false, 'documento igual ⇒ resumo NÃO muda (não regrava)');

  // um placar lançado NÃO deve mexer no resumo… a menos que mude o progresso.
  const comHistorico = JSON.parse(JSON.stringify(t));
  comHistorico.history = (comHistorico.history || []).concat([{ date: 'x', message: 'y' }]);
  ok(summaryMudou(t, comHistorico, t.id) === false,
     '⭐ mudança só no HISTÓRICO não regrava o resumo (torneio ao vivo escreve muito)');

  const renomeado = JSON.parse(JSON.stringify(t));
  renomeado.name = 'Outro nome';
  ok(summaryMudou(t, renomeado, t.id) === true, 'mudar o NOME regrava (senão a tela mente)');
}

// ── ⑦ a base REAL inteira passa pelo mesmo funil ─────────────────────────────
{
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const lista = Array.isArray(arr) ? arr : (arr.tournaments || []);
  let comp = 0, res = 0, maior = 0, comBase64 = 0;
  lista.forEach(function (x) {
    const r = buildSummary(x, x.id || x._docId);
    comp += JSON.stringify(x).length;
    const n = JSON.stringify(r).length;
    res += n; if (n > maior) maior = n;
    if (JSON.stringify(r).indexOf('base64') !== -1) comBase64++;
  });
  ok(lista.length > 10, 'a base real de teste tem torneios de verdade (' + lista.length + ')');
  ok(comBase64 === 0, '⛔ NENHUM resumo da base real carrega base64');
  ok(res < comp * 0.2,
     'na base inteira o resumo é ' + (100 - res / comp * 100).toFixed(1) + '% menor (' +
     Math.round(comp / 1024) + ' KB → ' + Math.round(res / 1024) + ' KB)');
  ok(maior / 1024 < 8, 'e o MAIOR resumo da base fica em ' + (maior / 1024).toFixed(1) + ' KB');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
