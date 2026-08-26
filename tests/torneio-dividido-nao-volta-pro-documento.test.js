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
const grava = cf.slice(iG, iG + 2200);
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
const mir = cf.slice(iM, iM + 6000);
ok(/_pulaJogos = true/.test(mir),
  '⭐ o gatilho reconhece torneio dividido');
ok(/_pulaJogos\s*\?\s*\{ gravados: 0/.test(mir),
  '⛔ e NÃO espelha jogos nesse caso — ele veria "nenhum jogo" e APAGARIA a cópia viva');
ok(/_semPesados/.test(mir), 'pelo MARCADOR, nunca pela ausência');

// ── ④ a volta existe, e foi escrita ANTES do salto ──────────────────────────
ok(fs.existsSync(path.join(ROOT, 'scripts', 'desfazer-divisao.js')),
  '⭐ a volta existe — volta escrita no susto é volta que não funciona');
const volta = fs.readFileSync(path.join(ROOT, 'scripts', 'desfazer-divisao.js'), 'utf8');
ok(/subcoleção está VAZIA/.test(volta),
  '⛔ e ela se recusa a gravar torneio sem jogo por cima do vivo');

console.log((fail ? '✗' : '✓') + ' torneio-dividido-nao-volta-pro-documento: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
