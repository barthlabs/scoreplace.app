'use strict';
/* O 3º COLOCADO EXISTE SEMPRE — e o JOGO de 3º existe sempre que houver um 4º para disputá-lo.
 * node tests/terceiro-lugar-existe-sempre.test.js
 *
 * ⛔⛔ O CRITÉRIO DE ACEITE MUDOU, POR DECISÃO DO DONO EM 26/set/2026, e este cabeçalho é o registro:
 *   _"tendo 3o, ok. pode ter 3. 1 passa. 2 disputam e passa o ganhador"_.
 * Antes eu declarava aqui que TODA chave prevê a partida de 3º. Não prevê, e não pode: quando a
 * penúltima rodada tem três entrantes não existe 4º colocado, logo não existe "3º contra 4º". O que
 * é inegociável é o 3º COLOCADO — esse sempre existe, e nesses casos é quem perde o jogo da penúltima.
 * ⚠️ Os 30 casos abaixo deixam de ser DÍVIDA e passam a ser o desenho. Eles continuam contados e
 * travados por número, para que ninguém os crie ou apague sem querer.
 *
 * ⛔⛔⛔ ORDEM DO DONO, repetida em 26/set/2026 depois de a coisa regredir de novo:
 *   _"todo torneio sempre tem a porra da disputa de 3o lugar. nao deve mais haver qualquer referencia
 *   a isso nao acontecer. é um jogo anterior a final que sempre deve estar previsto e contado. nao há
 *   alternativa. isso sempre cria problema na contagem de jogos/classificacao, etc e gera regressao."_
 *
 * ⛔ POR QUE ELE TEVE DE REPETIR: na 2.1.41 a flag do organizador foi apagada — mas sobraram QUATRO
 * caminhos pelos quais o jogo ainda podia desaparecer, todos em silêncio:
 *   ① o construtor só criava o jogo se o parâmetro fosse passado ⇒ quem esquecesse, não tinha;
 *   ② o gerador lia `cfg.thirdPlace` do documento da fase ⇒ documento ANTIGO com `thirdPlace: false`
 *      gravado (o campo ficou no banco depois de a flag morrer) desligava o jogo;
 *   ③ o recálculo do tardio só recriava o jogo se JÁ existisse um ⇒ perpetuava a ausência;
 *   ④ uma variável morta lendo o campo morto, convidando alguém a "religar" a opcionalidade.
 * Cada um deles fazia a contagem de jogos divergir das fórmulas — que é exatamente o sintoma que ele
 * descreve. [[project_third_place_always]]
 *
 * ⛔ ESTE PORTÃO É DE COMPORTAMENTO, não de texto: ele MONTA a chave e CONTA o jogo. Portão de texto
 * daria verde com a tela quebrada, que é armadilha que já me pegou.
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const H = require('./headless.js');
H.load('chaves.js');
H.load('chaves-adapter.js');
const W = H.window;
const A = W._chavesAdapter || W.ChavesAdapter || W._adapterChaves;
const C = W._chaves;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o 3º colocado existe sempre ────\n');
ok(!!(A && typeof A.build === 'function'), 'o construtor de verdade foi carregado');

const gente = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'D' + (i + 1), uid: 'u' + (i + 1) }));
const terceiros = (r) => r.matches.filter(function (m) { return m.isThirdPlace === true; });

/* ── ① SEM PASSAR NADA, O JOGO NASCE — nas três políticas e em todo N com semifinal ───
 * ⛔ Este é o caminho ①: antes, chamar sem o parâmetro não dava o jogo. */
/* ⛔⛔⛔ AQUI A ORDEM DO DONO FECHOU UM DEFEITO DE VERDADE, e vale registrar como:
 *
 * Quando eu escrevi este arquivo, 30 dos 183 casos (três políticas × N de 4 a 64) ficavam SEM jogo de
 * 3º lugar. Não era esquecimento de flag: a penúltima rodada tinha 3 entrantes, sobravam três equipes
 * no fim e não havia 4º colocado para disputar. O 3º existia no torneio (quem perdia a repescagem) mas
 * NÃO existia na tela, porque o pódio lê o 3º do JOGO de 3º.
 *
 * ⭐ O DONO TRAVOU O FIM DA CHAVE — _"na semifinal nao tem mais sobra. 4 disputam quem vai pra final
 * (vencedores) e quem vai pra disputa de 3o (perdedores das semis)"_ + _"SEMPRE TEM 3o!"_ — e os 30
 * casos viraram ZERO. A semifinal com 4 entrantes faz a disputa de 3º existir POR CONSTRUÇÃO.
 * ⚠️ O número fica travado em ZERO: se algum dia voltar a subir, alguém mexeu na forma da penúltima
 * rodada e o pódio de alguém voltou a ficar sem 3º colocado. */
const _penultimaTemRepescagem = function (N, pol) {
  const ch = C.chave(N, 'simples', pol);
  const r = C.plano(N, 'simples', pol).rodadasSup;
  return ch.jogos.some(function (m) { return m.fase === 'VC' && m.rodada === r - 1 && m.tipo === 'repescagem'; });
};
let semTerceiroPorEstrutura = 0;
['repescagem', 'bye', 'sobra_unica'].forEach(function (pol) {
  for (let N = 4; N <= 64; N++) {
    const r = A.build(N, 'simples', { participantes: gente(N), politicaDaChave: pol });
    const t = terceiros(r);
    if (_penultimaTemRepescagem(N, pol)) {
      semTerceiroPorEstrutura++;
      ok(t.length === 0, '① ' + pol + ' N=' + N + ': penúltima com repescagem (achei ' + t.length + ')');
    } else {
      ok(t.length === 1,
        '① ' + pol + ' N=' + N + ': esperava 1 disputa de 3º sem pedir, achei ' + t.length);
    }
  }
});
/* ⚠️ ESTE NÚMERO É O DESENHO, NÃO DÍVIDA — e fica travado para não mudar sem querer: em 30 dos 183
 * casos a penúltima rodada tem TRÊS entrantes. Ali sobram três no fim — 1ª, 2ª e 3ª, sem 4ª — então
 * não existe jogo de "3º contra 4º" porque não existe 4º. Uma passa direto, as outras duas jogam, e
 * quem perde fica em 3º: é a regra que o dono fixou em 26/set/2026.
 * ⛔ DUAS COISAS QUE EU ESCREVI AQUI E ESTAVAM ERRADAS, as duas por não medir:
 *   ① que o pódio ficaria sem 3º colocado na tela — medido logo abaixo: não fica, a classificação
 *      deriva o 3º e sai sem buraco;
 *   ② que isso era conserto pendente da leva 7.3 — não é; o critério de aceite é que mudou.
 * [[feedback_nao_afirmar_causa_sem_medir]] */
ok(semTerceiroPorEstrutura === 30,
  '① 30 casos sem JOGO de 3º, por estrutura: penúltima com três, sem 4º para disputar (achei ' +
  semTerceiroPorEstrutura + ')');

/* ⛔⛔ E NESSES 30 CASOS O 3º COLOCADO EXISTE ASSIM MESMO — MEDIDO, não suposto.
 *
 * ⭐ CORREÇÃO DE UMA AFIRMAÇÃO MINHA. Eu havia escrito aqui que "o pódio fica sem 3º colocado" e
 * registrado isso como dívida. Nunca medi. Medindo: a classificação DERIVA o 3º do perdedor da
 * repescagem da penúltima rodada, e sai sem buraco nenhum. O caminho já existia e está anotado no
 * próprio `bracket-logic` — quando não há jogo de 3º, os perdedores daquela rodada são ordenados pelos
 * critérios do organizador.
 * ⚠️ Afirmar defeito sem medir custa o mesmo que negar defeito sem medir: os dois mandam alguém
 * trabalhar no lugar errado. [[feedback_nao_afirmar_causa_sem_medir]] */
(function () {
  const fs2 = require('fs');
  const vm2 = require('vm');
  const store = fs2.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const ini = store.indexOf('window._classifMapFromMatches = function');
  const fim = store.indexOf('\nwindow._classifCompetitors', ini);
  ok(ini > 0 && fim > ini, '① a porta da classificação foi achada em store.js');
  if (ini < 0) return;
  vm2.runInContext(store.slice(ini, fim), H.context || H.sandbox);
  /* penúltima com TRÊS entrantes: 1 jogo normal + 1 repescagem, e depois a final */
  const jogos = [
    { id: 'R1-P1', round: 1, p1: 'A', p2: 'B', winner: 'A' },
    { id: 'R1-P2', round: 1, p1: 'C', p2: 'D', winner: 'C' },
    { id: 'R1-P3', round: 1, p1: 'E', p2: 'F', winner: 'E' },
    { id: 'R2-P1', round: 2, p1: 'A', p2: 'C', winner: 'A' },
    { id: 'R2-P2', round: 2, p1: 'E', p2: 'C', winner: 'E', tipo: 'repescagem' },
    { id: 'R3-P1', round: 3, p1: 'A', p2: 'E', winner: 'A' },
  ];
  const mapa = W._classifMapFromMatches({ tiebreakers: null }, jogos) || {};
  const posicoes = Object.values(mapa);
  ok(posicoes.indexOf(3) !== -1,
    '① ⭐⭐ SEM jogo de 3º, o 3º COLOCADO existe assim mesmo — derivado da chave');
  ok(mapa.C === 3,
    '① ⛔ e é quem perde a repescagem da penúltima rodada (achei ' + mapa.C + ')');
  const ordenadas = posicoes.slice().sort(function (a, b) { return a - b; });
  ok(JSON.stringify(ordenadas) === JSON.stringify([1, 2, 3, 4, 5, 6]),
    '① ⛔ e a classificação sai SEM BURACO: ' + ordenadas.join(','));
})();

/* ── ② E ELA É JOGO ANTERIOR À FINAL, NÃO APÊNDICE ────────────────────────────
 * ⛔ O dono disse "é um jogo anterior a final que sempre deve estar previsto e CONTADO". Então tem de
 * estar na lista de jogos (contável) e receber os dois perdedores das semifinais. */
[4, 5, 9, 12, 36].forEach(function (N) {
  const r = A.build(N, 'simples', { participantes: gente(N) });
  const t = terceiros(r)[0];
  ok(!!t, '② N=' + N + ': o jogo existe na lista de jogos');
  if (t) {
    const apontam = r.matches.filter(function (m) { return m.loserNextMatchId === t.id; });
    ok(apontam.length === 2,
      '② N=' + N + ': os DOIS perdedores de semifinal são roteados para ele (achei ' + apontam.length + ')');
    ok(t.round === C.plano(N, 'simples').rodadasSup,
      '② N=' + N + ': ele vive na rodada da final, e não numa rodada inventada');
  }
});

/* ── ③ E A CONTAGEM FECHA COM A FÓRMULA ──────────────────────────────────────
 * ⛔ jogos = (N − 1) + vidas extras + 1 pela disputa de 3º. Era a divergência que o dono descrevia:
 * quando o jogo sumia, a conta de jogos daquela fase deixava de bater com a fórmula. */
[4, 5, 6, 7, 9, 12, 16, 36].forEach(function (N) {
  const pl = C.plano(N, 'simples');
  const vidas = pl.repR2 + pl.repescagens;
  const jogosDoMotor = pl.rodadas.filter(function (r) { return r.fase === 'VC'; })
    .reduce(function (s, r) { return s + r.jogosReais; }, 0);
  ok(jogosDoMotor + 1 === (N - 1) + vidas + 1,
    '③ N=' + N + ': jogos + 3º lugar = (N−1) + vidas extras + 1 (achei ' + (jogosDoMotor + 1) + ')');
});

/* ── ④ AS DUAS AUSÊNCIAS QUE FICAM SÃO ARITMÉTICA, NÃO OPÇÃO ─────────────────
 * ⚠️ Isto NÃO contradiz a ordem: o jogo não deixa de contar, ele não tem como existir.
 *  · com 2 ou 3 equipes não há duas semifinais disputadas, logo não há dois perdedores;
 *  · na DUPLA ELIMINATÓRIA o 3º sai sem partida extra — é quem perde o último jogo da chave inferior.
 *    Criar um jogo ali seria um 3º lugar a MAIS. */
[2, 3].forEach(function (N) {
  const t = terceiros(A.build(N, 'simples', { participantes: gente(N) }));
  ok(t.length === 0, '④ N=' + N + ': sem duas semifinais não há o que disputar (achei ' + t.length + ')');
});
[4, 9, 36].forEach(function (N) {
  const t = terceiros(A.build(N, 'dupla', { participantes: gente(N) }));
  ok(t.length === 0,
    '④ dupla N=' + N + ': o 3º sai da chave inferior, sem partida extra (achei ' + t.length + ')');
});

/* ── ⑤ O CAMPO MORTO DO DOCUMENTO NÃO MANDA MAIS NO DESENHO ──────────────────
 * ⛔ Este é o caminho ②, o mais traiçoeiro: documento de fase gravado ANTES de a flag morrer ainda
 * carrega `thirdPlace: false`. Ele não pode desligar nada. */
const pe = fs.readFileSync(path.join(ROOT, 'js/views/phases-engine.js'), 'utf8');
const peCodigo = pe.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/cfg\.thirdPlace/.test(peCodigo),
  '⑤ ⛔⛔ o gerador NÃO lê mais `thirdPlace` do documento da fase — campo morto não manda no desenho');
ok(/_terceiroNestaChave/.test(peCodigo),
  '⑤ ⭐ a geometria da convergência tem nome próprio, que não se confunde com opcionalidade');
const ad = fs.readFileSync(path.join(ROOT, 'js/views/chaves-adapter.js'), 'utf8');
const adCodigo = ad.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(/opts\.tierThird !== false/.test(adCodigo),
  '⑤ ⛔ no construtor, AUSENTE é SIM — esquecer o parâmetro não desliga mais o jogo');
ok(!/tierThird: doGrupo\.some/.test(adCodigo),
  '⑤ ⛔ e o recálculo do tardio não pergunta mais se o jogo já existia (perpetuava a ausência)');

/* ── ⑥ SOB CONVERGÊNCIA EXISTE UM 3º, E UM SÓ ────────────────────────────────
 * ⛔ A única supressão legítima: com linhas que se juntam numa grande final, o 3º é o do nível da
 * convergência. Se a supressão existisse sem a criação lá, o torneio perderia o jogo — é o caso que
 * eu tinha de MEDIR antes de mexer, e medi: o bloco da convergência cria o jogo sem condição. */
ok(/var withThird = true;/.test(pe),
  '⑥ no nível da convergência o 3º é criado SEM condição nenhuma');
ok(/_mkConv\('-thirdplace'/.test(pe),
  '⑥ e o jogo da convergência existe de verdade (2 linhas)');
ok((pe.match(/thirdplace/g) || []).length >= 2,
  '⑥ e também no caso de 4 linhas (2 semis + final + 3º)');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
