/* Parcial nunca vira o histórico oficial — node tests/lz-parcial-nao-e-oficial.test.js
 *
 * CAUSA-RAIZ de todos os episódios de 31/jul/2026: os parciais gravavam o `fullImport`.
 * Uma leitura interrompida no meio deixava 20 jogos como se fossem o histórico de quem tem
 * 158 — e a tela, corretamente, mostrava o que estava gravado. Não existe display que
 * conserte um banco com dado errado.
 * Regra: o histórico oficial só é substituído por uma leitura COMPLETA. Parcial grava
 * progresso (cursor + resumo). As partidas já lidas não se perdem — elas vão, uma a uma,
 * pro acervo canônico, que é append-only.
 */
const fs = require('fs'), path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── o caminho dos PARCIAIS não grava histórico ──
const parcial = app.slice(app.indexOf('PARCIAL NUNCA VIRA DOCUMENTO OFICIAL'), app.indexOf('PARCIAL NUNCA VIRA DOCUMENTO OFICIAL') + 1400);
ok(parcial.length > 300, 'a regra está escrita no caminho dos parciais');
ok(/doc\.lzCursorParcial = s\.fullImport\.lzCursor/.test(parcial), 'o parcial grava o CURSOR (pra retomar)');
{
  const fn = app.slice(app.indexOf('function _lzPersistScans'), app.indexOf('function _saveScansAndReload'));
  ok(!/doc\.fullImport = s\.fullImport/.test(fn), 'e NÃO grava o fullImport — nenhum caminho de parcial escreve histórico');
}

// ── o FECHAMENTO só substitui quando a leitura fechou ──
const fech = app.slice(app.indexOf('SÓ LEITURA COMPLETA SUBSTITUI O HISTÓRICO'), app.indexOf('SÓ LEITURA COMPLETA SUBSTITUI O HISTÓRICO') + 1200);
ok(/lzCursor\.complete === true/.test(fech), 'exige cursor completo');
ok(/!s\.fullImport\.partialReason/.test(fech), 'e ausência de motivo de parcial');
ok(/if \(gotFull && _completa\) doc\.fullImport/.test(fech), 'só então o histórico é substituído');
ok(/else if \(gotFull && s\.fullImport\.lzCursor\)/.test(fech), 'incompleta grava só o progresso');
ok(/histórico ficou como estava/.test(fech), 'e diz isso no log, em vez de fingir que gravou');

// ── a retomada continua funcionando com o cursor que ficou fora do histórico ──
const ret = app.slice(app.indexOf('var _curParcial'), app.indexOf('var _curParcial') + 500);
ok(/rctx\.scanMap\[uid\]\.lzCursorParcial/.test(ret), 'a retomada lê o cursor parcial');
ok(/!\(imp\.lzCursor && imp\.lzCursor\.complete\)/.test(ret), 'e só o usa quando o histórico gravado não está completo');

// ── o total exibido nunca vira o próprio número lido ──
ok(/var _idxT = \(imp && imp\.indexTotal > 0\) \? imp\.indexTotal/.test(app) && /if \(_idxT > 0\) gY = _idxT;/.test(app),
   'o total vem do ÍNDICE quando existe');
ok(/else if \(imp && imp\.declaredGames > 0\) gY = Math\.max\(imp\.declaredGames, gX\);/.test(app),
  'e o declarado serve de PISO — 20 jogos nunca viram "20 de 20 (100%)"');
ok(!/lzCursor\.complete === true\) gY = gX/.test(app), 'o cursor não redefine o total (ele é o que costuma estar errado)');

// ── TOTAIS SÃO ESTRUTURA; HTML SÓ PREENCHE ─────────────────────────────────
// "com a nova sistemática deve preservar os totais; depois, ao buscar os jogos, vai
// povoando os totais com dados, de forma a nunca perder os totais."
{
  const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
  const bloco = cnt.slice(cnt.indexOf('OS TOTAIS SÃO FATO'), cnt.indexOf('OS TOTAIS SÃO FATO') + 2600);
  ok(bloco.length > 300, 'a extensão separa TOTAIS de DETALHE');
  ok(/var t = \{ jogos: _indexTotal \|\| totJogos/.test(bloco), 'o total de jogos vem do índice (fato), não da contagem do que foi lido');
  ok(/Math\.max\(t\.jogos, _totaisAntes\.jogos \|\| 0\)/.test(bloco), 'e nunca diminui entre leituras');
  ok(/Math\.max\(t\.torneios/.test(bloco) && /Math\.max\(t\.rankings/.test(bloco), 'idem torneios e rankings');
  ok(/imp\.totais = t/.test(bloco), 'os totais são gravados num bloco próprio');

  // o PARCIAL pode gravar totais (é estrutura), mas nunca o histórico
  const par = app.slice(app.indexOf('OS TOTAIS PODEM (e devem) IR NO PARCIAL'), app.indexOf('OS TOTAIS PODEM (e devem) IR NO PARCIAL') + 600);
  ok(/doc\.totaisLetzplay = s\.fullImport\.totais/.test(par), 'o parcial grava os totais…');
  const fn = app.slice(app.indexOf('function _lzPersistScans'), app.indexOf('function _saveScansAndReload'));
  ok(!/doc\.fullImport = s\.fullImport/.test(fn), '…e continua sem gravar o histórico');

  // a tela lê os totais gravados, mesmo com histórico velho
  ok(/rctx\.scanMap\[uid\]\.totaisLetzplay/.test(app), 'a tela usa os totais gravados quando o histórico é antigo');
  ok(/if \(_T && _T\.jogos > 0\) gY = _T\.jogos;/.test(app), 'e o total dos jogos sai dali antes de qualquer outra fonte');
  ok(/_T && _T\.torneios > 0/.test(app) && /_T && _T\.rankings > 0/.test(app), 'idem as outras duas barras');
}

console.log((fail ? '✗' : '✓') + ' lz-parcial-nao-e-oficial: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
