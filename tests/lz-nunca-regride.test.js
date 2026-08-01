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
const _iF = cnt.indexOf('── FECHAMENTO ──');
const fech = cnt.slice(_iF, cnt.indexOf('var imp = I.normalize(montarRaw()', _iF));
ok(fech.length > 300, 'existe um bloco único de fechamento');
ok(/_limpos\.length >= _jogosAntes\.length/.test(fech), 'só limpa se o conjunto limpo for >= ao que já existia');
ok(/C\.complete = false;/.test(fech), 'se vier menor, a leitura passa a constar como NÃO fechada');
// NÃO DUPLICAR > desduplicar. O acumulado já entra semeado com o que estava gravado; a
// "reposição" que existia aqui era acréscimo do que já estava presente, e foi ela que
// inflou 478 → 1038. Duplicar e depois limpar são dois erros pra fazer um acerto.
ok(!/_reposto/.test(fech), 'não existe reposição no fechamento — nada foi removido, nada precisa voltar');
ok(!/_jogosAntes\.forEach/.test(fech), 'e nada é re-adicionado ao acumulado');
ok(/all\.length = 0; Array\.prototype\.push\.apply\(all, _limpos\)/.test(fech),
  'a única operação é a limpeza da migração');

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

// ── 2. APP: recusa gravar um histórico menor, em TODOS os caminhos ──
const grava = app.slice(app.indexOf('TRAVA ÚNICA CONTRA REGRESSÃO'), app.indexOf('function _lzPersistScans'));
ok(grava.length > 400, 'existe UMA trava de regressão, compartilhada');
// A LEI MUDOU EM 01/ago/2026: era "a maior leitura vence"; virou "as leituras se somam".
// Motivo medido: uma leitura pior em jogos podia ser melhor em torneios, e descartá-la
// inteira fazia 2 torneios sumirem a cada releitura.
ok(/_lzUnirImports\(guardado, doc\.fullImport\)/.test(grava), 'a trava UNE as duas leituras');
ok(/collection\('letzplayScans'\)\.doc\(uid\)\.get\(\)/.test(grava), 'conferindo o banco: cobre sessão nova / outra aba');
ok(/delete doc\.fullImport/.test(grava), 'quando barra, o histórico não é substituído');
ok(/showNotification/.test(grava), 'e o organizador é avisado — barrar não pode ser silencioso');
// os DOIS caminhos de escrita usam a trava
const usos = (app.match(/_lzBarrarRegressao\(s\.uid, doc, db\)/g) || []).length;
ok(usos === 2, 'os dois caminhos de gravação passam pela trava (achei ' + usos + ')');
ok(!/\.set\(doc, \{ merge: true \}\)/.test(app.replace(/_lzBarrarRegressao[\s\S]{0,200}?set\(d2/g, '')),
  'nenhuma escrita de fullImport escapa da trava');

// ── 3. APP: "completo" tem que ser verificável ──
const compl = app.slice(app.indexOf('function _lzImportComplete'), app.indexOf('function _lzImportComplete') + 1600);
ok(/_c\.pagesTotal > 0 && _c\.pagesRead/.test(compl), 'quando o cursor diz quantas páginas existem…');
ok(/_lidas < _c\.pagesTotal\) return false/.test(compl), '…exige que TODAS tenham sido lidas');

// ── O GUARD NÃO PODE PROTEGER LIXO ──────────────────────────────────────────
// 478 viraram 1038 por um bug meu; o guard então passou a proteger o 1038 e BARRAVA a
// correção. O letzplay declara quantos jogos existem — mais que isso é provadamente errado.
ok(/var teto = \(doc\.fullImport && doc\.fullImport\.declaredGames\)/.test(grava),
  'o guard conhece o teto declarado pelo letzplay');
ok(/function corrompido\(n\) \{ return teto > 0 && n > teto; \}/.test(grava),
  'e sabe reconhecer um documento acima do teto como corrompido');
ok(/if \(_guardado && !corrompido\(antes\)\)/.test(grava), 'a união não acontece com documento corrompido…');
ok(/corrompido\(antes\)/.test(grava) && /será substituído por/.test(grava),
  '…esse é jogado fora e substituído, que é a única forma de a correção entrar');
ok(/será substituído por/.test(grava), 'e avisa quando substitui um documento corrompido');

// ── TODA LEITURA SANITIZA O QUE JÁ ESTAVA GRAVADO ───────────────────────────
// "toda leitura precisa sanitizar os dados para manter atual e preciso." Evitar criar
// duplicata nova não conserta o que já está no banco — isso se arrastaria pra sempre.
{
  const san = cnt.slice(cnt.indexOf('TODA LEITURA SANITIZA'), cnt.indexOf('TODA LEITURA SANITIZA') + 1400);
  ok(san.length > 300, 'a sanitização existe e roda na entrada de toda leitura');
  ok(/_contentKey\(g\)/.test(san), 'ela agrupa por CONTEÚDO — a mesma partida com e sem id é uma só');
  ok(/if \(!_limpo\[ja\]\.lzId && g\.lzId\) _limpo\[ja\] = g;/.test(san),
    'e quem vence é a entrada COM o id do letzplay (identidade dada pela fonte)');
  ok(/_acc = null;/.test(san), 'o acumulado é semeado do conjunto já limpo, não do sujo');
  // teto continua tendo precedência: lixo acima do declarado é descartado, não sanitizado
  ok(cnt.indexOf('priorCorrompido') < cnt.indexOf('TODA LEITURA SANITIZA'),
    'acima do declarado o histórico é DESCARTADO — sanitizar não salva o que é provadamente lixo');
}

// ── O RESUMO SEGUE A MESMA LEI DO HISTÓRICO ────────────────────────────────────────────
// Medido no doc do Fabio (01/ago/2026): fullImport com 391 (leitura completa) e
// scan._fullGames com 390 (releitura parcial, barrada como histórico mas gravada como
// resumo). A BARRA lê o histórico, a COR lê o resumo — o nome voltava a violeta depois de
// ter ficado verde, e o diálogo mostrava "390 de 391". Verdade em dois lugares é meia
// verdade em cada um.
{
  const app = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  ok(/function _lzResumoRegrediu\(novo, antigo\)/.test(app), 'existe a regra do resumo');
  const fn = app.slice(app.indexOf('function _lzResumoRegrediu'), app.indexOf('function _lzBarrarRegressao'));
  ok(/return a > b;/.test(fn), 'resumo que descreve leitura MENOR não substitui');
  const guard = app.slice(app.indexOf('function _lzBarrarRegressao'), app.indexOf('function _lzPersistScans'));
  ok((guard.match(/_lzResumoRegrediu\(doc\.scan/g) || []).length === 2,
     'e a regra vale nos DOIS caminhos: com histórico novo e sem');
  ok(/if \(!doc\.scan\) return Promise\.resolve\(doc\);/.test(guard),
     'sem histórico novo o guard ainda protege o resumo (antes ele desistia aqui)');

  // a lei em si
  const regrediu = (a, b) => (a && b) ? ((typeof b._fullGames === 'number' ? b._fullGames : -1) >
                                          (typeof a._fullGames === 'number' ? a._fullGames : -1)) : false;
  ok(regrediu({ _fullGames: 390 }, { _fullGames: 391 }) === true, '390 não substitui 391');
  ok(regrediu({ _fullGames: 392 }, { _fullGames: 391 }) === false, 'mas 392 substitui 391');
  ok(regrediu({ _fullGames: 391 }, { _fullGames: 391 }) === false, 'e igual passa (dado novo do mesmo tamanho)');
}

// ── DUAS LEITURAS DA MESMA PESSOA NÃO COMPETEM: ELAS SE SOMAM ──────────────────────────
// Medido no Fabio (01/ago/2026): leitura das 03:54 = 391 jogos e 33 torneios abertos;
// leitura das 10:30 = 390 jogos e 35 torneios. O guard media SÓ os jogos e descartava o
// documento inteiro — então a cada releitura os 2 torneios sumiam e a barra oscilava entre
// "35 de 35" e "33 de 35". Cada leitura era melhor numa dimensão e pior noutra.
{
  const app = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  const ctx = { window: {}, console, Object, Array, Math, JSON };
  ctx.window._lzGamesTotal = null;
  require('vm').createContext(ctx);
  const ini = app.indexOf('function _lzUnirImports'), fim = app.indexOf('function _lzResumoRegrediu');
  require('vm').runInContext(app.slice(ini, fim) + '\nwindow._unir = _lzUnirImports;', ctx);
  const unir = ctx.window._unir;

  const velho = {
    games: Array.from({ length: 391 }, (_, i) => ({ lzId: 1000 + i })),
    lzCursor: { toursDone: { a: 1, b: 1 }, ranksDone: { r: 1 }, complete: true, pageDone: 20, pagesTotal: 20 },
    indexTotal: 391, declaredGames: 391, totais: { fonte: 'indice', jogos: 391, torneios: 33, rankings: 27 }
  };
  const novo = {
    games: Array.from({ length: 390 }, (_, i) => ({ lzId: 1000 + i })),
    lzCursor: { toursDone: { a: 1, b: 1, c: 1, d: 1 }, ranksDone: { r: 1 }, complete: true, pageDone: 20, pagesTotal: 20 },
    indexTotal: 391, declaredGames: 391, totais: { fonte: 'indice', jogos: 391, torneios: 35, rankings: 27 }
  };
  const u = unir(velho, novo);
  ok(u.games.length === 391, 'a união fica com os 391 jogos (nenhum se perde) — veio ' + u.games.length);
  ok(Object.keys(u.lzCursor.toursDone).length === 4, 'e com TODOS os torneios já abertos pelas duas leituras');
  ok(u.lzCursor.complete === true, 'completo continua completo');
  ok(u.totais.torneios === 35, 'o total de torneios fica no maior conhecido');

  // sem duplicar: o mesmo jogo nas duas leituras entra uma vez
  const d = unir({ games: [{ lzId: 7 }] }, { games: [{ lzId: 7 }, { lzId: 8 }] });
  ok(d.games.length === 2, 'jogo repetido entre as duas leituras não duplica');
  // jogo SEM id é reconhecido pelo conteúdo, e o com id vence
  const e = unir({ games: [{ club: 'c', kind: 'ranking', date: 'x', oppNames: ['A'], myScore: 6, oppScore: 4 }] },
                 { games: [{ lzId: 9, club: 'c', kind: 'ranking', date: 'x', oppNames: ['A'], myScore: 6, oppScore: 4 }] });
  ok(e.games.length === 2 || (e.games.length === 1 && e.games[0].lzId === 9),
     'jogo sem id não vira duplicata do mesmo jogo com id');

  const guard = app.slice(app.indexOf('function _lzBarrarRegressao'), app.indexOf('function _lzPersistScans'));
  ok(/doc\.fullImport = _lzUnirImports\(guardado, doc\.fullImport\)/.test(guard), 'o guard une em vez de descartar');
  ok(!/return Promise\.resolve\(barrar\(pico, 'memória'\)\)/.test(guard),
     'e não corta caminho pela memória, onde não há o que unir');
  ok(/if \(_guardado && !corrompido\(antes\)\) return barrar\(antes, 'banco', _guardado\)/.test(guard),
     'une SEMPRE que já existe histórico — inclusive quando a leitura nova é maior');
}

console.log((fail ? '✗' : '✓') + ' lz-nunca-regride: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
