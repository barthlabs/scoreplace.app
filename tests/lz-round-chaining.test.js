/* Rodada que não anda não se repete — node tests/lz-round-chaining.test.js
 * "+ de 2min para pegar apenas 2 jogos que faltam." MEDIDO em 31/jul: UMA requisição pelo
 * caminho completo (app → content script → fila → letzplay → volta) leva 400ms. Minutos só
 * se explicam por centenas de requisições — e elas vinham do encadeamento: quando uma
 * rodada termina sem avançar, encadear outra repete o mesmo trabalho (perfil + listas +
 * página 1) e chega no mesmo lugar. Até 40 vezes.
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

ok(/var rodada = 0, MAX_RODADAS = 40, _progAnterior = null;/.test(src), 'guarda o progresso da rodada anterior');

const bloco = src.slice(src.indexOf('RODADA QUE NÃO ANDA'), src.indexOf('RODADA QUE NÃO ANDA') + 2200);
ok(/_lzTot\(imp\)/.test(bloco), 'o progresso conta os JOGOS');
ok(/toursDone/.test(bloco) && /ranksDone/.test(bloco), 'e também torneios e rankings concluídos');
ok(/var _andou = \(_prog !== _progAnterior\);/.test(bloco), 'compara com a rodada anterior');
ok(/rodada < MAX_RODADAS && _andou/.test(bloco), 'e só encadeia se ALGUMA das três avançou');
// 01/ago/2026: e NÃO encadeia quando o banco recusou a escrita — a leitura pode até estar
// andando, mas se nada é gravado a barra subindo é mentira. Ver rules-letzplayscans-whitelist.
ok(/if \(window\._lzGravouOk === false\) \{/.test(bloco), 'escrita recusada interrompe o encadeamento');
ok(/Nada foi gravado/.test(bloco), 'e a tela diz que nada foi gravado');

// a comparação tem que considerar as TRÊS coisas — avançar só em torneios ainda é avanço
{
  const f = new Function('imp', '_lzTot', `
    var c = imp.lzCursor || {};
    return _lzTot(imp) + '/' + Object.keys(c.toursDone || {}).length + '/' + Object.keys(c.ranksDone || {}).length;`);
  const tot = (x) => (x.games || []).length;
  const a = { games: [1, 2], lzCursor: { toursDone: { a: 1 }, ranksDone: {} } };
  const b = { games: [1, 2], lzCursor: { toursDone: { a: 1, b: 1 }, ranksDone: {} } };
  const c = { games: [1, 2], lzCursor: { toursDone: { a: 1 }, ranksDone: {} } };
  ok(f(a, tot) !== f(b, tot), 'ler mais um torneio conta como avanço (mesmo sem jogo novo)');
  ok(f(a, tot) === f(c, tot), 'e rodada idêntica é reconhecida como parada');
}

// o freio não pode impedir a PRIMEIRA rodada
ok(/_progAnterior = null;/.test(src), 'a primeira rodada nunca é barrada (não há anterior)');

console.log((fail ? '✗' : '✓') + ' lz-round-chaining: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
