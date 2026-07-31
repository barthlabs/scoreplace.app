/* Releitura do histórico começa pelo COMEÇO e para cedo — node tests/lz-incremental-history.test.js
 * Pergunta do dono (31/jul/2026): "nos jogos não dá pra pular direto pra página que está
 * incompleta? faltam 6 jogos e passa por 8 páginas?". Dá — e o jeito antigo estava errado
 * por construção: o histórico do letzplay é MAIS-RECENTE-PRIMEIRO, então jogo novo entra na
 * página 1 e empurra o resto. Varrer até o fim pra achar 6 jogos novos é trabalho jogado
 * fora, e o cursor por número de página nem é estável num feed que cresce por cima.
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const etapa3 = src.slice(src.indexOf('ETAPA 3: JOGOS'), src.indexOf('} catch (eEtapa)'));

// 1) com acervo, começa na página 1 (não na seguinte à do cursor)
ok(/var pIni = jaConhecidos > 0 \? 1 :/.test(etapa3), 'tendo acervo, a releitura começa na página 1');
ok(/Math\.max\(1, C\.pageDone \+ 1\)/.test(etapa3), 'sem acervo, retoma do cursor como antes');

// 2) para assim que uma página não traz nada novo
ok(/if \(add === 0\) _secas\+\+; else _secas = 0;/.test(etapa3), 'conta páginas sem novidade');
ok(/if \(_secas >= 1\)/.test(etapa3), 'e para na primeira delas');
ok(/alcancei o que já estava gravado/.test(etapa3), 'dizendo por que parou');
ok(/jaConhecidos > 0 && add1 === 0/.test(etapa3), 'e resolve em UMA requisição quando nada mudou');
ok(/nada novo — o histórico já estava em dia/.test(etapa3), 'com a mensagem certa nesse caso');

// 3) O FURO: só é seguro se a varredura anterior chegou ao fim
ok(/var _varreduraAnteriorFechou = \(C\.complete === true\);/.test(src),
  'guarda se a varredura anterior fechou');
const iLeitura = src.indexOf('var _varreduraAnteriorFechou');
const iZera = src.indexOf('C.complete = false;');
ok(iLeitura < iZera, 'e lê ANTES de zerar a flag (senão compara com o que acabou de escrever)');
ok(/var jaConhecidos = _varreduraAnteriorFechou \? all\.length : 0;/.test(etapa3),
  'leitura interrompida no meio NÃO usa o atalho — as páginas do fim ainda não foram lidas');

// 4) o laço respeita a parada
ok(/for \(var p = pIni \+ 1; p <= maxPage && !C\.complete; p\+\+\)/.test(etapa3),
  'o laço não roda depois de já ter fechado na página 1');

// ── O CURSOR VIAJA NO PROGRESSO: guarda a página a CADA página ──────────────
// "o sistema deveria guardar a página que parou de puxar... assim ficaria fácil retomar
// jogos, torneios ou rankings de onde parou." O cursor só ia dentro do PARCIAL, que sai de
// 3 em 3 páginas — uma interrupção perdia até duas páginas de trabalho.
{
  const prog = src.slice(src.indexOf("__sp_lp: 'athlete-import-progress'"), src.indexOf("__sp_lp: 'athlete-import-progress'") + 900);
  ok(/cursor: \{/.test(prog), 'todo evento de progresso carrega o cursor');
  ok(/pageDone: lastPageRead/.test(prog), 'com a página que acabou de ser lida');
  ok(/toursDone: C\.toursDone/.test(prog) && /ranksDone: C\.ranksDone/.test(prog),
    'e com os torneios e rankings já concluídos (por id, não por posição)');
  const app = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  const h = app.slice(app.indexOf("athlete-import-progress' && d.uid === uid"), app.indexOf("athlete-import-progress' && d.uid === uid") + 1400);
  ok(/if \(d\.cursor\) cursorAtual = d\.cursor;/.test(h), 'o app guarda esse cursor a cada progresso');
}

// ── Jogos do scoreplace de OUTRA pessoa não vêm de matchHistory ─────────────
// A regra do Firestore só libera users/{uid}/matchHistory pro próprio dono; a leitura do
// organizador voltava permission-denied e a aba ficava só com o letzplay, em silêncio.
{
  const app = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/function _lzJogosDosTorneios\(uid\)/.test(app), 'existe a fonte alternativa: os torneios visíveis');
  const fn = app.slice(app.indexOf('function _lzJogosDosTorneios'), app.indexOf('function _lzJuntarScoreplace'));
  ok(/_collectAllMatches/.test(fn), 'varre TODAS as estruturas de jogo do torneio, não só t.matches');
  ok(/_slotUids/.test(fn), 'e identifica a pessoa por uid no slot, não por nome');
  ok(/source: 'scoreplace'/.test(fn), 'os itens saem com a fonte marcada (a tag do card)');
  const juntar = app.slice(app.indexOf('function _lzJuntarScoreplace'), app.indexOf('function _lzJuntarScoreplace') + 900);
  ok(/proprio &&/.test(juntar), 'pro próprio usuário segue usando o matchHistory (mais completo, inclui casuais)');
  ok(/_lzJogosDosTorneios\(uid\)/.test(juntar), 'pros outros, os torneios em comum');
}

console.log((fail ? '✗' : '✓') + ' lz-incremental-history: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
