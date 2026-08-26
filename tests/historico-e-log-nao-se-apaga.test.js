/* O HISTÓRICO É UM LOG: CHAVE POR CONTEÚDO, E O ESPELHO SÓ CRESCE (2.0.99)
 * node tests/historico-e-log-nao-se-apaga.test.js
 *
 * O documento do torneio tem teto de 1 MB. No Confra (medido 25/ago) `history` são
 * 37 KB de 245 KB — e é o único campo que cresce PRA SEMPRE: `rounds` para quando o
 * torneio acaba, o log não. Podar o documento é o caminho; o espelho é onde o que foi
 * podado continua existindo.
 *
 * ⛔ E ERA JUSTAMENTE A PODA QUE DESTRUIRIA O LOG. O espelho chaveava cada evento por
 * POSIÇÃO (`'h' + _idx`). Podar o Confra pras últimas 30 faria o diff ver `h0..h29` com
 * conteúdo NOVO (as 30 últimas) e `h30..h217` AUSENTES ⇒ reescrevia 30 linhas erradas e
 * APAGAVA 188. O log inteiro, destruído pela economia de 37 KB.
 *
 * Este teste tranca as duas metades do conserto:
 *   ① a chave sai do CONTEÚDO — não anda quando o array anda;
 *   ② o espelho de histórico NUNCA apaga — e o de jogos/inscritos CONTINUA apagando,
 *      porque lá o desaparecimento é informação real (jogo removido, inscrito que saiu).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const H = require(path.join(ROOT, 'tests', 'render-harness'));
const W = H.window;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournament-split-core.js'), 'utf8'),
                H.sandbox, { filename: 'tournament-split-core.js' });
const S = W._tSplit;
ok(typeof S.chaveDoEvento === 'function', 'o tradutor expõe a chave do evento');

// ── ① a chave é do CONTEÚDO ──────────────────────────────────────────────────
const ev = (n) => ({ date: '2026-08-25T10:00:0' + n + '.000Z', message: 'evento ' + n });
const hist = [ev(0), ev(1), ev(2), ev(3), ev(4)];
const t = { id: 't1', name: 'T', history: hist.map((x) => Object.assign({}, x)), participants: [], rounds: [], matches: [] };

const p = S.dividir(JSON.parse(JSON.stringify(t)));
ok(p.history.length === 5, 'os 5 eventos saíram do documento');
ok(p.history.every((h) => typeof h._k === 'string' && h._k.length > 1), 'cada evento leva chave própria');
ok(new Set(p.history.map((h) => h._k)).size === 5, 'as 5 chaves são distintas');
ok(p.history.every((h, i) => h._idx === i),
  '`_idx` CONTINUA indo junto — chave é QUEM, índice é ONDE (o bug foi usar um como o outro)');

// a mesma linha, em outro torneio e outra posição, tem a MESMA chave
const t2 = { id: 't2', name: 'U', history: [ev(9), ev(2)], participants: [], rounds: [], matches: [] };
const p2 = S.dividir(t2);
ok(p2.history[1]._k === p.history[2]._k,
  'mesma data+mensagem ⇒ mesma chave, mesmo em posição diferente');

// ── ② PODAR não move a chave de quem ficou ──────────────────────────────────
const podado = { id: 't1', name: 'T', history: hist.slice(3).map((x) => Object.assign({}, x)),
                 participants: [], rounds: [], matches: [] };
const pp = S.dividir(podado);
ok(pp.history[0]._k === p.history[3]._k && pp.history[1]._k === p.history[4]._k,
  '⭐ depois de podar os 3 primeiros, os que sobraram mantêm a chave');
ok(pp.history[0]._idx === 0 && p.history[3]._idx === 3,
  '   (e o índice ANDOU — que é exatamente o que quebrava a chave posicional)');

// ── ③ a identidade que autoriza a divisão continua valendo ──────────────────
const volta = S.remontar(S.dividir(JSON.parse(JSON.stringify(t))));
ok(S.iguais(volta, t), 'remontar(dividir(t)) === t — a divisão segue reversível');

// ── ④ o GATILHO: histórico só cresce; jogos e inscritos ainda apagam ────────
const src = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');
const iH = src.indexOf("_espelhaColecao(db, id, 'history'");
ok(iH > 0, 'o gatilho espelha o histórico');
const chamadaH = src.slice(iH, iH + 260);
ok(/_k\b/.test(chamadaH), 'e chaveia pelo CONTEÚDO (`_k`), não por `h + _idx`');
ok(/,\s*true\s*\)/.test(chamadaH), '⭐ com soDeixaCrescer = true: log de auditoria NÃO se apaga');

const chamadaM = src.slice(src.indexOf("_espelhaColecao(db, id, 'matches'"), src.indexOf("_espelhaColecao(db, id, 'participants'"));
ok(!/,\s*true\s*\)/.test(chamadaM),
  '⛔ mas JOGOS continuam podendo ser apagados — sumir do doc ali é informação real');

ok(/soDeixaCrescer \? \[\] : /.test(src),
  'a trava fica na função: quem só cresce simplesmente não monta lista de apagar');

// ── ⑤ A PODA TEM QUE SER INERTE — exercitando o diff REAL do gatilho ────────
// Não basta "não apaga": se a poda GRAVAR as linhas que não mudaram, o `_idx` delas anda
// e a ordem no espelho fica ambígua (as podadas viram 0..29 e colidem com as antigas,
// que guardam 0..187). Medido contra o documento real do Confra antes de consertar:
// 30 gravações à toa. Por isso `_idx` NÃO vai pro registro espelhado.
// O diff sai do FONTE do gatilho — se ele mudar, este teste acompanha ou quebra.
const vmc = require('vm');
const i0 = src.indexOf('function _diffEspelho');
ok(i0 > 0, 'o gatilho tem o comparador do espelho');
const ctx = {}; vmc.createContext(ctx);
vmc.runInContext(src.slice(i0, src.indexOf('\n}', i0) + 2) + '\nthis.f=_diffEspelho;', ctx);
const _diff = ctx.f;

const log = []; for (let i = 0; i < 50; i++) log.push(ev(i));
const tLongo = { id: 't3', name: 'L', history: log, participants: [], rounds: [], matches: [] };
// o registro que o gatilho espelha: chave + conteúdo, SEM índice
const reg = (l) => (l || []).map((h) => ({ _k: h._k, item: h.item }));
const antes = S.dividir(JSON.parse(JSON.stringify(tLongo)));
const podadoT = JSON.parse(JSON.stringify(tLongo)); podadoT.history = podadoT.history.slice(-10);
const depois = S.dividir(podadoT);

const rPoda = _diff(reg(antes.history), reg(depois.history), (h) => h._k);
ok(rPoda.gravar.length === 0,
  '⭐ podar 50→10 não grava NADA: as 10 que ficaram são idênticas às que já estão lá');
ok(rPoda.apagar.length === 40, '   (o diff ainda LISTA 40 como ausentes…)');

const rApp = _diff(reg(antes.history), reg(S.dividir(Object.assign({}, tLongo,
  { history: log.concat([ev(99)]) })).history), (h) => h._k);
ok(rApp.gravar.length === 1 && rApp.apagar.length === 0,
  'e um evento novo grava exatamente 1 linha');

// …e é o soDeixaCrescer que transforma esses 40 em zero. A prova de que ele está ligado
// pro histórico está no teste ④; aqui fica registrado QUANTO ele evita.
ok(/soDeixaCrescer \? \[\] : /.test(src) && /,\s*true\s*\)/.test(chamadaH),
  '⛔ …e é soDeixaCrescer que zera os 40 — sem ele, podar 50 eventos apagaria 40 do log');

const regSrc = src.slice(src.indexOf('const _hist ='), src.indexOf('const r3 ='));
ok(!/_idx/.test(regSrc),
  '⛔ o registro espelhado do histórico NÃO leva `_idx` — o índice anda com a poda');

console.log((fail ? '✗' : '✓') + ' historico-e-log-nao-se-apaga: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
