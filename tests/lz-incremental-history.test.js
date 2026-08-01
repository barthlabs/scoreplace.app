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
// REGRA ATUALIZADA (31/jul, ext 1.73): a página 1 é SEMPRE a primeira — é por lá que entra
// jogo novo — e as demais saem do CONJUNTO de páginas que faltam, não de um ponto de
// retomada em ordem. Ver o bloco do conjunto mais abaixo.
// A página 1 é onde entra jogo novo — mas relê-la numa varredura ainda incompleta é
// desperdício (o harness pegou isso). Regra: lê a 1 quando ainda não foi lida OU quando a
// varredura anterior fechou; senão começa na primeira que falta.
ok(/var _leAUm = !C\.pagesRead\[1\] \|\| _varreduraAnteriorFechou;/.test(etapa3),
  'a página 1 vem primeiro quando faz sentido (nova, ou varredura anterior fechada)');
ok(/for \(var q = 1; q <= \(C\.pagesTotal \|\| 1\); q\+\+\) if \(!C\.pagesRead\[q\]\) return q;/.test(etapa3),
  'senão, começa na primeira página que ainda falta');
ok(/if \(!C\.pagesRead\[_q\]\) _faltam\.push\(_q\)/.test(etapa3), 'e o resto vem do que FALTA no conjunto');

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
ok(/var jaConhecidos = \(!migrando && _varreduraAnteriorFechou\) \? all\.length : 0;/.test(etapa3),
  'leitura interrompida no meio NÃO usa o atalho — e migração também não (precisa varrer tudo)');

// 4) o laço respeita a parada
ok(/for \(var p = pIni \+ 1; _incremental && p <= maxPage && !C\.complete; p\+\+\)/.test(etapa3),
  'o laço página-a-página roda SÓ no incremental (rodar junto com os lotes marcava página vazia como lida)');

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
  const h = app.slice(app.indexOf("athlete-import-progress' && d.uid === uid"), app.indexOf("athlete-import-progress' && d.uid === uid") + 2600);
  ok(/if \(d\.cursor\) cursorAtual = d\.cursor;/.test(h), 'o app guarda esse cursor a cada progresso');
}

// ── Jogos do scoreplace de OUTRA pessoa não vêm de matchHistory ─────────────
// A regra do Firestore só libera users/{uid}/matchHistory pro próprio dono; a leitura do
// organizador voltava permission-denied e a aba ficava só com o letzplay, em silêncio.
{
  const app = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  // `meNome` entrou na assinatura em 01/ago/2026: é por ele que se sabe de que LADO a
  // pessoa jogou (o doc de placar nunca teve p1Uids/p2Uids).
  ok(/function _lzJogosDoScoreplace\(uid, meNome\)/.test(app), 'existe a fonte alternativa: os documentos de placar');
  const fn = app.slice(app.indexOf('function _lzJogosDoScoreplace'), app.indexOf('function _lzJuntarScoreplace'));
  ok(/collectionGroup\('results'\)/.test(app), 'lê os documentos de placar, onde o placar realmente mora');
  ok(/where\('playerUids', 'array-contains', uid\)/.test(app), 'e identifica a pessoa por uid, não por nome');
  ok(/source: 'scoreplace'/.test(fn), 'os itens saem com a fonte marcada (a tag do card)');
  const juntar = app.slice(app.indexOf('function _lzJuntarScoreplace'), app.indexOf('function _lzJuntarScoreplace') + 900);
  ok(/proprio &&/.test(juntar), 'pro próprio usuário segue usando o matchHistory (mais completo, inclui casuais)');
  ok(/_lzJogosDoScoreplace\(uid, meNome\)/.test(juntar) && /_lzCasuaisDoScoreplace\(uid\)/.test(juntar),
     'pros outros, os placares de torneio E as partidas casuais — sem depender de autorização');
  ok(/competition: 'Partida casual'/.test(app), 'e o casual vem rotulado como casual (diferenciado do torneio)');
}

// ── QUAIS PÁGINAS JÁ FORAM LIDAS (conjunto), não "até onde fui" ─────────────
// "Kelly falta 1 jogo... faltando 1 jogo vai estar nas pontas certamente. deveria pular
// direto para a ponta que falta." Guardar um número só obriga a recomeçar em ordem.
{
  ok(/C\.pagesRead = \{\}/.test(src), 'o cursor guarda o CONJUNTO de páginas lidas');
  ok(/for \(var _lp = 1; _lp <= C\.pageDone; _lp\+\+\)/.test(src),
    'cursor antigo (só pageDone) é convertido pro conjunto — nada é relido à toa');
  ok(/pagesRead: C\.pagesRead/.test(src), 'e ele viaja no cursor gravado');

  const et3 = src.slice(src.indexOf('ETAPA 3: JOGOS'), src.indexOf('} catch (eEtapa)'));
  ok(/if \(!C\.pagesRead\[_q\]\) _faltam\.push\(_q\)/.test(et3), 'a varredura lê só o que FALTA');
  ok(/Math\.min\(a - 1, maxPage - a\)/.test(et3), 'ordenado pela distância até a PONTA mais próxima');
  ok(/var _leAUm = !C\.pagesRead\[1\]/.test(et3), 'a página 1 entra primeiro quando faz sentido');
  ok(/for \(var _c = 1; _c <= maxPage; _c\+\+\) if \(!C\.pagesRead\[_c\]\)/.test(et3),
    '"completo" passa a ser TODAS as páginas no conjunto, não "cheguei na última"');
  ok(/C\.pagesRead\[_grupo\[_i\]\] = 1;/.test(et3), 'cada página lida entra no conjunto na hora');
}

// ── o "restam" saiu ────────────────────────────────────────────────────────
{
  const app = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/restante: ''/.test(app), 'o fluxo do atleta não manda mais estimativa');
  const ob = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'letzplay-onboarding.js'), 'utf8');
  ok(/opts\.tempos\.restante\s*\n?\s*\?/.test(ob) || /opts\.tempos\.restante$/m.test(ob),
    'e o rótulo só é desenhado quando há valor');
}

// ── OS PLACARES TÊM DOIS CAMINHOS ──────────────────────────────────────────────────────
// 01/ago/2026: a ficha mostrava "Torneios 0 · Rankings 0 · Jogos 0" pra gente que jogou
// torneio de teste com o dono. Duas causas empilhadas, as duas medidas no banco real:
//   1) regra ANINHADA não vale pra collection group → permission-denied sempre;
//   2) collection group com array-contains exige índice COLLECTION_GROUP_CONTAINS.
// Um caminho só, que depende de duas coisas que faltavam, é caminho nenhum.
{
  const app = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  const fn = app.slice(app.indexOf('function _lzItemDeResult'), app.indexOf('// ── PARTIDAS CASUAIS'));
  ok(/collection\('tournaments'\)\.doc\(t\.id\)\.collection\('results'\)/.test(fn),
     'caminho A: por torneio já carregado — sem índice, cobre quem jogou comigo');
  ok(/collectionGroup\('results'\)/.test(fn), 'caminho B: collection group pro resto');
  ok((fn.match(/\.catch\(/g) || []).length >= 2, 'um caminho que falha não derruba o outro');
  ok(/if \(vistos\[k\]\) return;/.test(fn), 'e o que vier dos dois é unido sem duplicar');
  // ⚠️ REGRA REVOGADA PELO DONO em 01/ago/2026. Aqui se exigia `if (meu < 0) meu = 0;` —
  // "melhor um card sem V/D do que sumir com o jogo". Na prática esse chute fazia a Lucia
  // Helena aparecer como ADVERSÁRIA DELA MESMA e pintava um 6×1 dela de derrota (medido
  // nos 10 docs reais dela; ver tests/jogo-so-com-placar.test.js). Card que mente é pior
  // que card que não existe: _"isso não pode ocorrer"_. Agora o lado sai do uid do slot,
  // depois do nome, e sem isso o jogo não é mostrado.
  ok(/if \(meu < 0\) return null;/.test(fn),
     'sem saber de que lado a pessoa jogou, o jogo NÃO é mostrado (o chute mentia)');

  const rules = require('fs').readFileSync(require('path').join(__dirname, '..', 'firestore.rules'), 'utf8');
  ok(/match \/\{path=\*\*\}\/results\/\{matchId\}/.test(rules),
     'as regras têm o match de collection group (o aninhado não serve)');
  const idx = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'firestore.indexes.json'), 'utf8'));
  const fo = (idx.fieldOverrides || []).find(f => f.collectionGroup === 'results' && f.fieldPath === 'playerUids');
  ok(!!fo, 'e existe o override de índice pro campo playerUids');
  ok(!!fo && fo.indexes.some(i => i.queryScope === 'COLLECTION_GROUP' && i.arrayConfig === 'CONTAINS'),
     'com escopo COLLECTION_GROUP e arrayConfig CONTAINS');
}

console.log((fail ? '✗' : '✓') + ' lz-incremental-history: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
