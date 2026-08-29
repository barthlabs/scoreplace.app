/* TORNEIO DIVIDIDO: NINGUÉM DEVOLVE OS JOGOS PRO DOCUMENTO (2.0.105)
 * node tests/torneio-dividido-nao-volta-pro-documento.test.js
 *
 * Depois que os jogos saem do doc (`_semPesados`), o objeto em MEMÓRIA continua tendo eles
 * — a rede do ouvinte enxerta de propósito, pra tela não pintar chave vazia. Isso cria um
 * risco novo e silencioso: qualquer caminho que grave "o torneio inteiro" devolve os jogos
 * pro documento. O teto volta, e passa a existir DUAS cópias divergindo.
 *
 * São três portas, e este teste tranca as três:
 *   ① `saveTournament` (cliente) — grava só a config;
 *   ② as CFs — `_gravaTorneio` divide, e só grava os jogos que MUDARAM;
 *   ③ o gatilho de espelho — ⛔ o pior de todos: ele deriva do DOCUMENTO, veria "nenhum
 *      jogo" e APAGARIA a subcoleção, que virou a cópia viva.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');

// ── ① o cliente ─────────────────────────────────────────────────────────────
const iS = db.indexOf('async saveTournament(');
const fim = db.indexOf(".set(cleanData, { merge: true })", iS);
ok(iS > 0 && fim > iS, 'saveTournament existe');
const antesDoSet = db.slice(iS, fim);
ok(/_semPesados/.test(antesDoSet), '⭐ ele olha o marcador ANTES de gravar');
ok(/_tSplit\.dividir/.test(antesDoSet), 'e grava só a config (dividir)');
ok(/_p\.config\._semPesados = _fora/.test(antesDoSet),
  '⛔ e o marcador vai junto — sem ele o próximo leitor acha que o torneio nunca foi dividido');
ok(/throw _eD/.test(antesDoSet),
  '⛔ se dividir falhar, NÃO grava: gravar o objeto inteiro desfaria a divisão em silêncio');
ok(/'participants', 'history'/.test(antesDoSet),
  '⛔ e devolve pro doc o que NÃO está no marcador — dividir extrai os três e zeraria o elenco');

// ── ② as CFs ────────────────────────────────────────────────────────────────
ok(/function _gravaTorneio\(tx, ref, tDepois, tAntes\)/.test(cf), 'as CFs têm um gravador único');
ok(/function _leTorneio\(tx, ref, tId\)/.test(cf), 'e um leitor único que MONTA das subcoleções');
const iG = cf.indexOf('function _gravaTorneio(');
// ⛔ ANCORA NO FIM DA FUNÇÃO, não numa janela de N caracteres: já me pegou cinco vezes.
// Um comentário a mais empurra o código pra fora da janela e o teste 'falha' sem regressão.
const grava = cf.slice(iG, cf.indexOf('\nfunction ', iG + 10));
ok(/jogosQueMudaram/.test(grava),
  '⭐ só os jogos que MUDARAM são escritos — é o ponto inteiro (um ponto toca ~1 KB)');
ok(/tx\.delete\(col\.doc/.test(grava), 'e jogo que sumiu é apagado — ali sumir é informação real');
ok(/\['participants', 'history'\]/.test(grava),
  '⛔ mesma proteção do elenco no servidor');
ok((cf.match(/_gravaTorneio\(tx, ref, t, _tAntes\)/g) || []).length >= 6,
  '⭐ TODAS as portas de escrita passam por ele (' +
  ((cf.match(/_gravaTorneio\(tx, ref, t, _tAntes\)/g) || []).length) + ' pontos) — uma sozinha desfaz tudo');
ok(!/tx\.set\(ref, b\.persist\)/.test(cf.slice(cf.indexOf('exports.'))),
  '⛔ e nenhuma exportada grava o doc cru direto');

// ── ③ o gatilho, que é o mais perigoso ──────────────────────────────────────
const iM = cf.indexOf('exports.tournamentMirror');
/* ⚠️ RECORTE ATÉ O FIM DA FUNÇÃO, não por número de caracteres. Janela cravada já mordeu
 * QUATRO vezes neste repositório: basta um comentário novo pra empurrar a linha procurada
 * pra fora e o teste passar a afirmar o contrário do que existe. Aqui o fim é o próximo
 * `exports.` — determinístico e imune a comentário. */
const _fimMir = cf.indexOf('\nexports.', iM + 10);
const mir = cf.slice(iM, _fimMir > 0 ? _fimMir : cf.length);
/* ⭐ A TRAVA É DERIVADA DO MARCADOR, não de uma lista escrita à mão — e isso NÃO é
 * elegância: eu tinha travado só `matches`, e o ENSAIO (scripts/ensaio-divisao.js) pegou
 * que, ao dividir também os INSCRITOS, o gatilho via `participants: []` no documento,
 * concluía "não há mais ninguém" e APAGAVA a subcoleção. O elenco sumia. Mesmo estrago,
 * campo diferente, e eu tinha acabado de escrever o aviso pro outro campo. */
ok(/_pulados = Array\.isArray\(depois\._semPesados\)/.test(mir),
  '⭐ o gatilho lê do MARCADOR quais partes saíram — nunca de uma lista minha');
ok(/const _pula = \(nome\) =>/.test(mir), 'e decide por parte');

/* ⛔ E A DECLARAÇÃO VEM ANTES DO PRIMEIRO USO — `const` tem ZONA MORTA (28/ago).
 * `_pula` estava declarado DEPOIS do alerta de `playerUids` que o consulta. No caso EXATO
 * que o alerta existe pra denunciar (jogos jogáveis SEM uid), a condição lançava
 * ReferenceError e o gatilho MORRIA ali: matches, inscritos e history não eram espelhados,
 * e o alerta nunca chegava ao log. O aviso derrubava o espelho justamente quando tinha
 * algo a avisar — e em silêncio. `node --check` PASSA; só a ORDEM denuncia. */
const _iDecl = mir.indexOf('const _pula = (nome) =>');
const _iUso = mir.search(/_pula\('/);
ok(_iDecl > 0 && _iUso > 0 && _iDecl < _iUso,
  '⛔ `_pula` é DECLARADO antes do primeiro uso — zona morta do const derruba o gatilho inteiro');
/* ⛔ E `_pulados` É DECLARADO NESTA função. A `let` tinha ficado perdida dentro de
 * `tournamentSummary`, onde ninguém a lê; sem `use strict` a atribuição aqui virava GLOBAL
 * implícita, viva entre invocações no mesmo contêiner quente. */
ok(/const _pulados = Array\.isArray\(depois\._semPesados\)/.test(mir),
  '⛔ `_pulados` é DECLARADO no gatilho — atribuir sem declarar vira global entre invocações');
ok(_iDecl > mir.indexOf('_pulados = Array.isArray(depois._semPesados)'),
  '⭐ e `_pula` nasce colado no marcador de que ele deriva');
['matches', 'participants', 'history'].forEach((parte) => {
  ok(new RegExp("_pula\\('" + parte + "'\\)").test(mir),
    "⛔ `" + parte + "` é pulado quando saiu do doc — senão o espelho apaga a cópia VIVA");
});

// ── ④ a volta existe, e foi escrita ANTES do salto ──────────────────────────
ok(fs.existsSync(path.join(ROOT, 'scripts', 'desfazer-divisao.js')),
  '⭐ a volta existe — volta escrita no susto é volta que não funciona');
const volta = fs.readFileSync(path.join(ROOT, 'scripts', 'desfazer-divisao.js'), 'utf8');
ok(/subcoleção de jogos está VAZIA/.test(volta),
  '⛔ e ela se recusa a gravar torneio sem jogo por cima do vivo');
ok(/for \(const nome of config\._semPesados\)/.test(volta),
  '⭐ e a VOLTA restaura TODAS as partes que saíram, lendo do marcador — ela remontava só ' +
  'os jogos e devolvia o torneio sem os inscritos. A volta é o caminho de EMERGÊNCIA: ' +
  'quem a usa está com o app quebrado e não vai conferir campo a campo.');

console.log((fail ? '✗' : '✓') + ' torneio-dividido-nao-volta-pro-documento: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
