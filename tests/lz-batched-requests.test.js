/* As páginas vão em LOTE, não uma por vez — node tests/lz-batched-requests.test.js
 * "mais de 3m para puxar 1 ou 2 jogos apenas?" — a fila do background já aceitava várias
 * requisições ao mesmo tempo, mas o content script fazia `await` por item: nunca havia
 * mais de UMA em voo, e o paralelismo não servia pra nada.
 */
const fs = require('fs'), path = require('path');
const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
const bg = fs.readFileSync(path.join(__dirname, '..', 'extension', 'background.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

ok(/var LOTE = 2;/.test(cnt), 'existe um tamanho de lote explícito');
ok(/_Q_SLOTS = 2/.test(bg), 'e ele casa com os slots da fila do background');

// torneios e rankings em lote
ok(/_pendT\.slice\(_bt, _bt \+ LOTE\)\.map\(async function \(P\)/.test(cnt), 'torneios vão em lote');
ok(/_pendR\.slice\(_br, _br \+ LOTE\)\.map\(async function \(R\)/.test(cnt), 'rankings vão em lote');
ok(/Promise\.all\(_pendT/.test(cnt) && /Promise\.all\(_pendR/.test(cnt), 'e são disparados juntos, não em sequência');

// os já lidos saem ANTES do lote (não entram como buraco)
ok(/var _pendT = toursList\.filter/.test(cnt), 'os já lidos são filtrados antes de montar os lotes');
ok(/var _pendR = ranksList\.filter/.test(cnt), 'idem rankings');

// páginas do histórico: lote só na varredura COMPLETA
const et3 = cnt.slice(cnt.indexOf('ETAPA 3: JOGOS'), cnt.indexOf('} catch (eEtapa)'));
ok(/if \(!_incremental\) \{/.test(et3), 'a varredura completa vai em lote');
ok(/_grupo\.map\(function \(q\) \{/.test(et3), 'disparando as páginas do grupo juntas');
ok(/for \(var p = pIni \+ 1; _incremental && p <= maxPage && !C\.complete; p\+\+\)/.test(et3),
  'e a incremental segue página a página — ela precisa PARAR na primeira sem novidade');

// ── o "restam" foi REMOVIDO (31/jul) ──
// A projeção dependia de um total que o letzplay conta em CARDS, não em partidas (158 pra
// 157 reais, 478 pra 469): prometia um fim que nunca chegava.
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
ok(/restante: ''/.test(app), 'o fluxo do atleta não manda estimativa nenhuma');
ok(/decorrido: _fmtDur\(dec\) \+ _ritmoTexto\(\)/.test(app), 'o que fica é medido: decorrido + ritmo por item');

// ── O NÚMERO DE PÁGINAS É ACUMULADO, não o tamanho do lote ──────────────────
// "se está lendo só a página 24, deve dizer 24 de 24 e não 1 de 24 — as outras 23 já foram
// lidas." O trabalho que já existe não deixa de existir porque esta rodada precisa de uma.
{
  const et3b = cnt.slice(cnt.indexOf('ETAPA 3: JOGOS'), cnt.indexOf('} catch (eEtapa)'));
  ok(/function _lidasAgora\(\)/.test(et3b), 'existe uma contagem do que JÁ foi lido');
  ok(/for \(var z = 1; z <= maxPage; z\+\+\) if \(C\.pagesRead\[z\]\)/.test(et3b),
    'e ela varre o conjunto de páginas lidas, não um contador de lote');
  ok(/var _pos = Math\.min\(_lidasAgora\(\) \+ _grupo\.length, maxPage\);/.test(et3b),
    'o rótulo conta as já lidas MAIS as que estão sendo lidas agora');
  ok(/function _placar\(lidas\)/.test(et3b), 'existe um rótulo único com os DOIS números');
  ok(/' lidas · ' \+ \(falta \? \('faltam ' \+ falta\)/.test(et3b),
    'sempre diz quantas foram lidas E quantas faltam');
  ok(/'nenhuma falta'/.test(et3b), 'e diz explicitamente quando não falta nenhuma');
  ok(/_placar\(_pos\)/.test(et3b) && /_placar\(_lidasAgora\(\)\)/.test(et3b),
    'o mesmo rótulo serve o passo e o feed — um texto só');
  ok(/pct: 46 \+ Math\.round\(\(_pos \/ Math\.max\(1, maxPage\)\) \* 51\)/.test(et3b),
    'a barra usa o mesmo número — rótulo e barra não podem divergir de novo');
  ok(!/_bp \/ Math\.max\(1, _faltam\.length\)/.test(et3b),
    'nada mais mede progresso pelo tamanho da fila do lote');
}

console.log((fail ? '✗' : '✓') + ' lz-batched-requests: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
