/* O histórico NUNCA regride — node tests/lz-nunca-regride.test.js
 * Dois desastres no mesmo dia (31/jul/2026), ambos meus:
 *   • 158 jogos da Kelly viraram 20 e 469 da Camila viraram 20 — limpeza antes da hora;
 *   • 469 da Camila viraram 569 — reposição sem checar duplicata.
 * "se são 478 jogos isso não pode ficar mudando, acaba com a confiança do app."
 * Aqui ficam as três travas, em código, nos dois lados (extensão e app).
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── 1. EXTENSÃO: limpar OU preservar, nunca os dois ──
const _iF = cnt.indexOf('FECHAMENTO: limpar OU preservar');
const fech = cnt.slice(_iF, cnt.indexOf('var imp = I.normalize(montarRaw()', _iF));
ok(fech.length > 300, 'existe um bloco único de fechamento');
ok(/_limpos\.length >= _jogosAntes\.length/.test(fech), 'só limpa se o conjunto limpo for >= ao que já existia');
ok(/C\.complete = false;/.test(fech), 'se vier menor, a leitura passa a constar como NÃO fechada');
ok(/_porConteudo\[ck\]/.test(fech), 'a reposição decide por CONTEÚDO (id novo × conteúdo velho são a mesma partida)');
ok(!/else if \(_jogosAntes/.test(fech), 'limpeza e reposição são exclusivas — nunca as duas');

// a chave de conteúdo existe e é usada pelos dois lados
{
  const i = cnt.indexOf('function _contentKey');
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(cnt.slice(i, cnt.indexOf('function _gamesToMatches')) + '\nthis.__c = _contentKey; this.__k = _gameKey;', ctx);
  const velho = { date: 'Quarta, 29/07/26', club: 'pb', myScore: 6, oppScore: 3, oppHandles: ['b', 'a'], partnerHandle: 'k' };
  const novo = Object.assign({ lzId: '999' }, velho);
  ok(ctx.__c(velho) === ctx.__c(novo), 'a MESMA partida tem a mesma chave de conteúdo, com ou sem id');
  ok(ctx.__k(velho) !== ctx.__k(novo), 'mas chaves de identidade diferentes — era daí que vinha a duplicata');
  ok(ctx.__c({ date: 'x', club: 'y', oppHandles: ['a', 'b'] }) === ctx.__c({ date: 'x', club: 'y', oppHandles: ['b', 'a'] }),
    'ordem dos adversários não muda a identidade da partida');
}

// ── 2. APP: recusa gravar um histórico menor ──
const grava = app.slice(app.indexOf('O APP NÃO ACEITA REGRESSÃO'), app.indexOf('O APP NÃO ACEITA REGRESSÃO') + 1400);
ok(grava.length > 300, 'o app tem a guarda de regressão na gravação');
ok(/antes > agora/.test(grava), 'compara o que chegou com o que já está gravado');
ok(/delete doc\.fullImport/.test(grava), 'e NÃO substitui o histórico quando o novo é menor');
ok(/showNotification/.test(grava), 'avisando na tela — regressão barrada não pode ser silenciosa');
ok(grava.indexOf('delete doc.fullImport') < grava.indexOf('.set(doc'), 'a decisão vem ANTES da escrita');

// ── 3. APP: "completo" tem que ser verificável ──
const compl = app.slice(app.indexOf('function _lzImportComplete'), app.indexOf('function _lzImportComplete') + 1600);
ok(/_c\.pagesTotal > 0 && _c\.pagesRead/.test(compl), 'quando o cursor diz quantas páginas existem…');
ok(/_lidas < _c\.pagesTotal\) return false/.test(compl), '…exige que TODAS tenham sido lidas');

console.log((fail ? '✗' : '✓') + ' lz-nunca-regride: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
