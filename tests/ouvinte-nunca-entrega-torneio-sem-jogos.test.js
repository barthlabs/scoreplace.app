/* O OUVINTE AO VIVO NUNCA ENTREGA TORNEIO SEM OS JOGOS (2.0.104)
 * node tests/ouvinte-nunca-entrega-torneio-sem-jogos.test.js
 *
 * Este é o ÚNICO obstáculo real entre o app de hoje e tirar os jogos do documento (97 KB,
 * 45% do Confra — o passo que remove o teto de 1 MB).
 *
 * ⛔ O DESASTRE QUE ELE EVITA: `_aplicaSnapTorneios` é síncrono, roda a CADA eco de
 * QUALQUER torneio, e empurra `doc.data()` direto pro store — a tela pinta em seguida.
 * Com os jogos fora do documento, ele passaria a receber `rounds` com `matches` vazio e
 * pintaria **chave vazia pra todo mundo com o app aberto**. Não é lentidão: é a tela
 * mentindo que o torneio não tem jogo.
 * ⛔ E buscar a subcoleção ali não é opção: ~115 leituras POR TORNEIO POR ECO — trocaria
 * peso por custo, que é o erro que a 1ª versão do gatilho de espelho cometeu.
 *
 * ⭐ A rede: o que já está montado em MEMÓRIA é enxertado na config nova. O documento
 * manda no que é config; a memória segura os jogos.
 * ⛔ E o gatilho é o MARCADOR (`_semPesados`), NUNCA a ausência — torneio recém-criado
 * também não tem jogo, e confundir "não tem" com "mudou de lugar" é como se apaga a tela.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const _contaFix = require(path.join(__dirname, '_conta-de-partes-fixture.js'));
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

// roda a função REAL, extraída do fonte — não uma cópia que pode divergir
const i0 = src.indexOf('function _enxertaJogos(');
ok(i0 > 0, 'a rede existe no ouvinte');
const corpo = src.slice(i0, src.indexOf('\n    }', i0) + 6);
const ctx = { store: { tournaments: [] } };
vm.createContext(ctx);
/* ⚠️ 2.1.66: a conta do que falta saiu de `_enxertaJogos` e virou
 * `window._marcaPartesQueFaltam` (os dois caminhos, ouvinte e cache, usam a MESMA).
 * Quem recorta uma tem que ter a outra no contexto — o fixture faz isso num lugar só. */
_contaFix.injetar(ctx, src);
vm.runInContext(corpo + '\nthis.f = _enxertaJogos;', ctx);
const enxerta = ctx.f;

const jogo = (id) => ({ id: id, p1: 'A', p2: 'B' });
const velho = {
  id: 't1',
  rounds: [{ round: 1, matches: [jogo('m1'), jogo('m2')] }, { round: 2, matches: [jogo('m3')] }],
  matches: [jogo('avulso')],
  groups: [{ name: 'G', matches: [jogo('g1')] }]
};

// ── ① com o marcador: os jogos voltam da memória ────────────────────────────
const novo = {
  id: 't1', name: 'nome NOVO', _semPesados: ['matches'],
  rounds: [{ round: 1, matches: [] }, { round: 2, matches: [] }],
  matches: [], groups: [{ name: 'G', matches: [] }]
};
const r = enxerta(JSON.parse(JSON.stringify(novo)), velho);
ok(r.rounds[0].matches.length === 2 && r.rounds[1].matches.length === 1,
  '⭐ os jogos das rodadas voltam da memória');
ok(r.matches.length === 1, 'os jogos avulsos também');
ok(r.groups[0].matches.length === 1, 'e os de grupo também');
ok(r.name === 'nome NOVO',
  '⭐ mas a CONFIG é a do documento — a memória só segura os jogos, não congela o torneio');
ok(!r._faltamPesados, 'e não fica marcado como faltando');

// ── ② SEM marcador, nada acontece (é o estado de hoje) ──────────────────────
const semMarcador = { id: 't1', rounds: [{ round: 1, matches: [] }], matches: [] };
const r2 = enxerta(JSON.parse(JSON.stringify(semMarcador)), velho);
ok(r2.rounds[0].matches.length === 0,
  '⛔ SEM `_semPesados` a rede não toca em nada — torneio recém-criado não tem jogo mesmo');
ok(!r2._faltamPesados, 'e não é marcado como faltando (ausência ≠ mudou de lugar)');

// ── ③ com marcador e SEM memória: marca, não passa por vazio ───────────────
const r3 = enxerta(JSON.parse(JSON.stringify(novo)), null);
ok(r3._faltamPesados === true,
  '⭐ sem nada em memória, marca `_faltamPesados` — "ainda não carregou" ≠ "não tem jogo"');
ok((r3.rounds[0].matches || []).length === 0, '(e segue sem jogo, honestamente)');

// ── ④ o documento manda quando ELE tem jogo ─────────────────────────────────
const docTemJogo = { id: 't1', _semPesados: ['matches'],
  rounds: [{ round: 1, matches: [jogo('doNovo')] }], matches: [], groups: [] };
const r4 = enxerta(JSON.parse(JSON.stringify(docTemJogo)), velho);
ok(r4.rounds[0].matches.length === 1 && r4.rounds[0].matches[0].id === 'doNovo',
  '⛔ se o documento TEM jogo naquela rodada, ele ganha — a memória não sobrescreve o fresco');

// ── ⑤ e a fiação está no lugar certo ────────────────────────────────────────
const iA = src.indexOf('function _aplicaSnapTorneios(');
// ⚠️ janela LARGA: o ouvinte ganhou o comentário longo que explica por que a BUSCA existe
// (ela faltava e quebrou produção em 26/ago). Com 4000 o `tournaments.push` caía fora do
// recorte e o teste dizia que a ordem estava errada. Mesmo tropeço de recorte curto que já
// aconteceu duas vezes neste projeto.
const bloco = _R.ateOFim(src, iA);
ok(/_enxertaJogos\(data, _emMemoria\)/.test(bloco), 'o ouvinte chama a rede');
ok(/store\.tournaments \|\| \[\]\)\.find/.test(bloco),
  '⭐ e enxerta do objeto MONTADO no store, não de `_prevParsed` — o parse anterior tem o mesmo buraco');
ok(bloco.indexOf('_enxertaJogos(data') < bloco.indexOf('tournaments.push(data)'),
  '⛔ e ANTES de entrar na lista que a tela pinta');

console.log((fail ? '✗' : '✓') + ' ouvinte-nunca-entrega-torneio-sem-jogos: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
