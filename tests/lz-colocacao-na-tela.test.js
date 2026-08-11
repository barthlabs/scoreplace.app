#!/usr/bin/env node
/* A COLOCAÇÃO CHEGA NA TELA — não basta o motor existir.
 *
 * POR QUE ESTE TESTE EXISTE, e por que ele é diferente do lz-colocacao-final:
 * o motor (js/views/letzplay-placement-core.js) nasceu na 1.8.6 PROVADO — 37 asserções
 * contra a chave real do T&F 449729 — e mesmo assim o dono, dois dias depois, olhou a
 * ficha do @GersomOtsu e perguntou: _"onde está a posição na classificação (nem que seja
 * por faixa) e a etapa até aonde chegou o atleta no torneio?"_ E completou: _"perdemos
 * tempo então te mostrando como ver a final do torneio que define 1/2; semis que definem
 * 3/4; e daí vai voltando nas quartas ficam 5/8..."_
 *
 * Ele estava certo: o motor estava CORRETO e MUDO. Duas quebras em série, ambas medidas
 * em 11/ago/2026:
 *   1. `js/views/letzplay-placement-core.js` não estava no index.html. Ninguém o chamava.
 *      Arquivo órfão não dá erro — só não aparece, e o teste do motor seguia verde.
 *   2. `footprintEntry` (extension/lib/letzplay-import.js) copia campo a campo e não
 *      copiava `matches` — a chave que a ext 1.98 colhe era descartada na normalização.
 *      Medido no doc do Gersom, lido às 17:20 com extVersion 1.98: `matches` nulo nos 3
 *      torneios, com o coletor no ar desde as 05:38 do mesmo dia.
 *
 * Então o teste do MOTOR não é suficiente: ele prova o cálculo, não a entrega. Este aqui
 * anda o caminho inteiro — normalize() → footprint → render — e falha se qualquer elo
 * voltar a soltar o dado.
 *
 * Uso:  node tests/lz-colocacao-na-tela.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const raiz = path.resolve(__dirname, '..');
let ok = 0, bad = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nome); }
  catch (e) { bad++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
}

// ── A CHAVE REAL do T&F Special Edition - Masculino - Bronze (tid 449729) ─────
// Mesma fixture do lz-colocacao-final: jogos #23..#28 lidos da página de jogos.
const P = (n, h) => ({ n, h });
const gersom = P('Gersom Otsu', 'GersomOtsu'), renato = P('Renato Silva', 'RenatoSilva');
const fabioR = P('Fábio R', 'FabioR'), marcelo = P('Marcelo M', 'MarceloM');
const gabriel = P('Gabriel G', 'GabrielG'), godinho = P('Rodrigo Godinho', 'RodrigoGodinho');
const daniel = P('Daniel D', 'DanielD'), ricardo = P('Ricardo R', 'RicardoR');
const arnaldo = P('Arnaldo A', 'ArnaldoA'), ragner = P('Ragner R', 'RagnerR');
const kevin = P('Kevin Bree', 'KevinBree'), vlamir = P('Vlamir Antequera', 'VlamirAntequera');
const stefan = P('Stefan Krieger', 'StefanKrieger'), wilson = P('Wilson Jr', 'Wilson-Jr');
const dupla = (a, b) => ({ handles: [a.h, b.h], names: [a.n, b.n] });
const CHAVE_REAL = [
  { n: 23, phase: 'QF', sides: [Object.assign(dupla(gersom, renato), { score: 1 }),
                                Object.assign(dupla(arnaldo, ragner), { score: 4 })] },
  { n: 24, phase: 'QF', sides: [Object.assign(dupla(fabioR, marcelo), { score: 5 }),
                                Object.assign(dupla(kevin, vlamir), { score: 6 })] },
  { n: 25, phase: 'QF', sides: [Object.assign(dupla(gabriel, godinho), { score: 3 }),
                                Object.assign(dupla(daniel, ricardo), { score: 6 })] },
  { n: 26, phase: 'SF', sides: [Object.assign(dupla(daniel, ricardo), { score: 1 }),
                                Object.assign(dupla(stefan, wilson), { score: 6 })] },
  { n: 27, phase: 'SF', sides: [Object.assign(dupla(arnaldo, ragner), { score: 2 }),
                                Object.assign(dupla(kevin, vlamir), { score: 6 })] },
  { n: 28, phase: 'Final', sides: [Object.assign(dupla(kevin, vlamir), { score: 4 }),
                                   Object.assign(dupla(stefan, wilson), { score: 6 })] }
];

console.log('\n1. A CHAVE SOBREVIVE À NORMALIZAÇÃO (o elo que estava rompido)');
// Carrega as libs REAIS da extensão — é onde elas vivem
// ([[project_letzplay_libs_single_source]]); nunca uma cópia.
const win = { };
global.window = win;
new Function(fs.readFileSync(path.join(raiz, 'extension/lib/letzplay-rating.js'), 'utf8')).call(win);
new Function(fs.readFileSync(path.join(raiz, 'extension/lib/letzplay-import.js'), 'utf8')).call(win);
const _spImport = win._spImport || global._spImport;

const raw = {
  handle: 'GersomOtsu', name: 'Gersom Hideo Otsu', sport: 'Beach Tennis',
  ladder: 'beach-masc-2025',
  totals: { matches: 4, wins: 0, losses: 1 },
  rankings: [],
  tournaments: [{
    name: 'T&F Special Edition - torneio PAIS - Masculino - Bronze',
    club: 'paineiras-bt', sport: 'Beach Tennis', categoryRaw: 'Masculina D',
    tourneyId: 449729, year: 2026, status: 'done',
    matches: CHAVE_REAL, grupoJogadores: 28, grupoTimes: 14
  }],
  matches: []
};
const imp = _spImport.normalize(raw, { importedAt: '2026-08-11T17:20:00Z' });
const fp = (imp.footprint || []).filter((f) => f.official)[0];

t('normalize() PRESERVA os jogos da chave no footprint', () => {
  assert.ok(fp, 'sem entrada oficial no footprint');
  assert.ok(Array.isArray(fp.matches), 'footprint[].matches sumiu — footprintEntry voltou a ' +
    'copiar campo a campo sem citar `matches`. É exatamente o defeito de 11/ago/2026.');
  assert.strictEqual(fp.matches.length, 6);
});
t('normalize() PRESERVA o total de participantes (fecha o "de N")', () => {
  assert.strictEqual(fp.grupoTimes, 14);
  assert.strictEqual(fp.grupoJogadores, 28);
});

console.log('\n2. O MOTOR ESTÁ LIGADO NO APP (não basta o arquivo existir)');
t('index.html carrega letzplay-placement-core.js', () => {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  assert.ok(/letzplay-placement-core\.js/.test(html),
    'o motor da colocação NÃO está no index.html. Foi assim que ele passou dois dias ' +
    'calculando certo e nunca aparecendo na tela.');
});
t('o motor vem ANTES de quem o consome (tournaments-enrollment-report)', () => {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  // ambos são `defer`, então a ORDEM DO DOCUMENTO é a ordem de execução — e o consumidor
  // só chama _lzPlacement dentro de um handler, mas a ordem certa evita depender disso.
  assert.ok(html.indexOf('letzplay-placement-core.js') > 0);
});

console.log('\n3. A LINHA DO TORNEIO MOSTRA ATÉ ONDE ELE CHEGOU');
// Roda o _lzColocacao REAL extraído do arquivo, junto do motor real.
const src = fs.readFileSync(path.join(raiz, 'js/views/tournaments-enrollment-report.js'), 'utf8');
function extrai(nome) {
  const i = src.indexOf('function ' + nome + '(');
  assert.ok(i > 0, 'função ' + nome + ' não existe mais em tournaments-enrollment-report.js');
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}
// ⚠️ `window` tem que entrar como PARÂMETRO, não como `this`: o placement-core publica em
// `window._lzPlacement` lendo `window` do escopo, e um `.call(obj)` só muda o `this`.
const janela = {};
new Function('window', fs.readFileSync(path.join(raiz, 'js/views/letzplay-placement-core.js'), 'utf8'))(janela);
assert.ok(janela._lzPlacement, 'o motor não publicou window._lzPlacement');
const _lzColocacao = new Function('window',
  extrai('_lzTabelaZerada') + '\n' + extrai('_lzMyPosIn') + '\n' + extrai('_lzColocacao') +
  '\nreturn _lzColocacao;')(janela);

t('Gersom perdeu nas QUARTAS → faixa 5º/7º com a fase', () => {
  const r = _lzColocacao(fp, 'GersomOtsu');
  assert.ok(r, 'sem colocação');
  assert.strictEqual(r.chave, true, 'caiu na tabela de grupo em vez de usar a chave');
  assert.strictEqual(r.rotulo, '5º/7º (quartas)');
  assert.strictEqual(r.podio, false);
});
t('quem venceu a final → Campeão, e é pódio', () => {
  const r = _lzColocacao(fp, 'StefanKrieger');
  assert.strictEqual(r.rotulo, 'Campeão');
  assert.strictEqual(r.podio, true);
  assert.strictEqual(r.posMin, 1);
});
t('quem perdeu a final → Vice', () => {
  assert.strictEqual(_lzColocacao(fp, 'KevinBree').rotulo, 'Vice');
});
t('quem perdeu a semi → 3º/4º (a faixa que o dono descreveu)', () => {
  const r = _lzColocacao(fp, 'ArnaldoA');
  assert.strictEqual(r.rotulo, '3º/4º (semifinal)');
  assert.strictEqual(r.podio, true, '3º é pódio');
});
t('a colocação vem COM A DUPLA — é dela, não individual', () => {
  // Pedido do dono junto da faixa: "e qual sua dupla e onde ela ficou". Num torneio de
  // duplas quem terminou em 5º/7º foi a DUPLA; mostrar só a faixa sugeriria resultado
  // individual.
  assert.strictEqual(_lzColocacao(fp, 'GersomOtsu').parceiro, 'Renato Silva');
  assert.strictEqual(_lzColocacao(fp, 'StefanKrieger').parceiro, 'Wilson Jr');
  assert.strictEqual(_lzColocacao(fp, 'Wilson-Jr').parceiro, 'Stefan Krieger', 'espelha nos dois sentidos');
});
t('a linha renderizada diz "com <parceiro>"', () => {
  assert.ok(/com ' \+\s*_esc\(L\.pos\.parceiro\)/.test(src) || /'com ' \+/.test(src),
    'o parceiro não está sendo escrito na linha');
});
t('quem não entrou na chave → fase de grupos, nunca um número inventado', () => {
  const r = _lzColocacao(fp, 'NinguemDaChave');
  assert.strictEqual(r.chave, true);
  assert.strictEqual(r.rotulo, 'Fase de grupos');
});

console.log('\n4. SEM CHAVE, A TABELA DE GRUPO CONTINUA VALENDO (nada regride)');
t('footprint sem matches cai no _lzMyPosIn de sempre', () => {
  const soGrupo = { standings: [{ group: 'GRUPO 03', rows: [
    { pos: 1, handles: ['Outro'], points: 6 },
    { pos: 2, handles: ['GersomOtsu'], points: 3 },
    { pos: 3, handles: ['Terceiro'], points: 0 }] }] };
  const r = _lzColocacao(soGrupo, 'GersomOtsu');
  assert.ok(r && !r.chave, 'deveria vir da tabela de grupo');
  assert.strictEqual(r.pos, 2);
  assert.strictEqual(r.de, 3);
  assert.strictEqual(r.grupo, 'GRUPO 03');
});
t('a CHAVE vence a tabela de grupo quando as duas existem', () => {
  // Este é o ponto do dono: "a posicao no grupo nao revela nada". Com as duas fontes
  // presentes, a do torneio inteiro é a que vale.
  const ambos = Object.assign({}, fp, { standings: [{ group: 'GRUPO 03', rows: [
    { pos: 2, handles: ['GersomOtsu'], points: 3 }, { pos: 1, handles: ['X'], points: 6 }] }] });
  const r = _lzColocacao(ambos, 'GersomOtsu');
  assert.strictEqual(r.chave, true);
  assert.strictEqual(r.rotulo, '5º/7º (quartas)');
});

console.log('\n5. CATEGORIA DO ATLETA NUNCA É "MISTA"');
// o arquivo registra um listener global no fim → precisa de um `document` mínimo.
const winP = {};
new Function('window', 'document',
  fs.readFileSync(path.join(raiz, 'js/views/letzplay-profile.js'), 'utf8'))(
  winP, { addEventListener: function () {}, getElementById: function () { return null; },
          querySelector: function () { return null; }, querySelectorAll: function () { return []; } });
const catAtleta = winP._lzCatAtleta;
assert.ok(typeof catAtleta === 'function', '_lzCatAtleta não foi publicada');

t('o caso REAL do Gersom: "Mista D" perde pra "Masculina D"', () => {
  // footprint idêntico ao medido em produção (letzplayScans/xbi4rH4...), na MESMA ordem —
  // a Mista vinha primeiro, e era por isso que ela ganhava.
  const r = catAtleta({ footprint: [
    { official: true, categoryRaw: 'Mista D', ageBand: null },
    { official: true, categoryRaw: 'Masculina D', ageBand: null },
    { official: true, categoryRaw: 'T&F Special Edition - torneio PAIS - Masculino - Bronze', ageBand: null }
  ], officialCategory: { categoryRaw: 'Mista D', skill: 'D' } });
  assert.strictEqual(r.label, 'Masculina D');
  assert.strictEqual(r.deMista, false);
});
t('officialCategory já GRAVADA como Mista não entra pela porta dos fundos', () => {
  // dado antigo no banco: o campo gravado passa pelo mesmo filtro
  const r = catAtleta({ footprint: [], officialCategory: { categoryRaw: 'Mista C', skill: 'C' } });
  assert.strictEqual(r.label, 'C', 'devia mostrar só a SKILL, sem afirmar gênero: ' + JSON.stringify(r));
  assert.strictEqual(r.deMista, true);
});
t('só mista → mostra a SKILL sozinha (verdadeira), nunca "Mista D"', () => {
  const r = catAtleta({ footprint: [{ official: true, categoryRaw: 'Dupla Mista D+', ageBand: null }] });
  assert.strictEqual(r.label, 'D+');
  assert.strictEqual(r.deMista, true);
});
t('a mais ALTA entre as de gênero vence', () => {
  const r = catAtleta({ footprint: [
    { official: true, categoryRaw: 'Masculina D', ageBand: null },
    { official: true, categoryRaw: 'Masculina C', ageBand: null }] });
  assert.strictEqual(r.label, 'Masculina C');
});
t('feminina funciona igual', () => {
  assert.strictEqual(catAtleta({ footprint: [
    { official: true, categoryRaw: 'Feminina B', ageBand: null }] }).label, 'Feminina B');
});
t('faixa etária continua fora (era a única exclusão que já existia)', () => {
  const r = catAtleta({ footprint: [
    { official: true, categoryRaw: 'Masculina 50+ B', ageBand: 50 },
    { official: true, categoryRaw: 'Masculina D', ageBand: null }] });
  assert.strictEqual(r.label, 'Masculina D');
});
t('ranking (não-oficial) não define categoria de torneio', () => {
  const r = catAtleta({ footprint: [{ official: false, categoryRaw: 'Masculina A', ageBand: null }] });
  assert.strictEqual(r, null);
});
t('"Duplas" não vira categoria D', () => {
  assert.strictEqual(catAtleta({ footprint: [
    { official: true, categoryRaw: 'Duplas Sorteadas', ageBand: null }] }), null);
});

console.log('\n6. OS PONTOS TÊM DESTAQUE (não são mais legenda da forma)');
const profSrc = fs.readFileSync(path.join(raiz, 'js/views/letzplay-profile.js'), 'utf8');
t('os pontos saem em corpo grande, não em 11px de muted', () => {
  const bar = profSrc.slice(profSrc.indexOf('root._lzLevelBar'), profSrc.indexOf('root._renderLetzplayCard'));
  assert.ok(/font-size:26px/.test(bar), 'os pontos voltaram a ser pequenos');
  assert.ok(!/font-size:11px;color:var\(--text-muted,#8b93a3\);"> · ' \+ r\.value/.test(bar),
    'o formato antigo (· 1496 em cinza pequeno) voltou');
});
t('os pontos têm rótulo próprio', () => {
  assert.ok(/>pontos</.test(profSrc));
});

console.log('\n' + (bad ? '❌' : '✅') + ' lz-colocacao-na-tela: ' + ok + ' passaram, ' + bad + ' falharam');
process.exit(bad ? 1 : 0);
