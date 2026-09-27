'use strict';
/* INSCRITO NOVO REDESENHA A CHAVE COMO SE N FOSSE AQUELE DESDE O INÍCIO — nos TRÊS desenhos.
 * node tests/redesenhar-vale-nos-tres-desenhos.test.js
 *
 * ⛔⛔ É EXIGÊNCIA TEXTUAL DO DONO, no documento da reforma:
 *   _"O caso de novos sempre deve reconsiderar o numero de inscritos e redesenhar a chave de acordo
 *   como se fosse o numero de inscritos desde o inicio. Isso já esta bem delimitado para a REP e deve
 *   seguir o mesmo para as outras 2 soluções."_
 *
 * ⇒ O que se prova aqui é que a chave é FUNÇÃO PURA de (N, formato, política) nas três políticas: não
 * há estado escondido, não há ordem de chamada que mude o resultado, e admitir um tardio é recalcular
 * com N+1 — não operar o grafo vivo à mão, que é a cirurgia de 1.250 linhas que `chaves.js` existe
 * para nunca mais precisar.
 *
 * ⛔ E TAMBÉM SE MEDE O PREÇO, em vez de prometer o que o desenho não dá:
 *   · na REPESCAGEM e na SOBRA ÚNICA o emparelhamento é adjacente e o tardio entra na última posição,
 *     então os confrontos já sorteados da 1ª rodada NÃO mudam;
 *   · no BYE CLÁSSICO isso NÃO se sustenta, e é consequência do desenho: o excedente é
 *     `N − potência de 2 abaixo`, então 36→37 move uma equipe da chave cheia para o play-in. Este
 *     arquivo MEDE quantos N têm essa troca, para que ninguém prometa na tela o contrário.
 * ⚠️ É por isso que a escolha da política é do organizador e acontece ANTES do sorteio.
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(__dirname, '..', 'js', 'views', 'chaves.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── redesenhar vale nos três desenhos ────\n');

const POLITICAS = ['repescagem', 'bye', 'sobra_unica'];
const FORMATOS = ['simples', 'dupla'];

/* ── ① FUNÇÃO PURA: chamar de novo devolve a mesma coisa ─────────────────────── */
POLITICAS.forEach(function (pol) {
  FORMATOS.forEach(function (f) {
    for (let N = 2; N <= 64; N++) {
      const a = C.chave(N, f, pol);
      const b = C.chave(N, f, pol);
      ok(JSON.stringify(a.ordem) === JSON.stringify(b.ordem),
        pol + ' ' + f + ' N=' + N + ': duas chamadas dão chaves diferentes (há estado escondido)');
    }
  });
});

/* ── ② A POLÍTICA ATRAVESSA O CAMINHO REAL, E ESTE É O PONTO DA LEVA ───────────
 * ⛔⛔ CORREÇÃO DE UM TESTE VAZIO MEU, apontado na revisão do plano. A primeira versão desta seção
 * comparava `C.chave(N+1, f, pol)` com `C.chave(N+1, f, pol)` — a MESMA chamada, duas vezes. Passava
 * sempre e não media nada. Pior: enquanto ela passava, a política não chegava à produção, porque o
 * ADAPTER chamava `C.chave(N, formato)` sem política nenhuma.
 * ⇒ Agora o que se mede é o caminho que a produção usa: `A.build(...)` → `C.chave(...)`. Se alguém
 * tirar a política de qualquer elo, o número de jogos volta a ser o da repescagem e isto fica vermelho.
 * ⚠️ `A.build` é o ÚNICO construtor, e a Cloud Function do sorteio roda a mesma cópia por vendor. */
const H = require('./headless.js');
H.load('chaves.js');
H.load('chaves-adapter.js');
const W = H.window;
const A = W._chavesAdapter || W.ChavesAdapter || W._adapterChaves;
ok(!!(A && typeof A.build === 'function'), '② o adapter de verdade foi carregado');

const gente = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'D' + (i + 1), uid: 'u' + (i + 1) }));

if (A && typeof A.build === 'function') {
  POLITICAS.forEach(function (pol) {
    FORMATOS.forEach(function (f) {
      [5, 9, 12, 36].forEach(function (N) {
        const viaAdapter = A.build(N, f, { participantes: gente(N), politicaDaChave: pol });
        const doMotor = C.chave(N, f, pol);
        /* ⛔ O adapter materializa TODA posição, inclusive a folga — MEDIDO, não suposto. Por isso o
         * que se compara é POSIÇÃO com POSIÇÃO, e não "jogos de verdade": eu havia escrito que "o
         * adapter não cria card para a folga" e a medição disse o contrário.
         * ⚠️ ISSO É TRABALHO ABERTO da leva 7.2: folga virando card é rodada de 9 mostrando 5 jogos,
         * que é precisamente o incômodo que o dono relatou na Confra. A asserção de hoje registra o
         * estado medido; quando 7.2 tirar o card da folga, ela muda junto e de propósito. */
        /* ⛔ A RELAÇÃO ENTRE ADAPTER E MOTOR, medida e explicada — não é "igual", e fingir que era daria
         * falso verde:
         *  · SIMPLES: o adapter tem UMA posição A MAIS — a disputa de 3º lugar, que o motor não desenha
         *    (ela não alimenta ninguém na árvore) e que passou a existir em TODO torneio por ordem do
         *    dono. Onde a penúltima rodada é uma repescagem não há 4º colocado para disputar, e aí a
         *    diferença é zero;
         *  · DUPLA: o adapter tem UMA posição A MENOS, e isso é ANTERIOR ao bloco 7 — é como a grande
         *    final é materializada. Na dupla o 3º sai da chave inferior, sem partida extra. */
        const terceiros = viaAdapter.matches.filter(function (m) { return m.isThirdPlace === true; }).length;
        const esperado = (f === 'dupla') ? doMotor.jogos.length - 1 : doMotor.jogos.length + terceiros;
        ok(viaAdapter.matches.length === esperado,
          '② ' + pol + ' ' + f + ' N=' + N + ': adapter ' + viaAdapter.matches.length +
          ' posições, esperado ' + esperado + ' (motor ' + doMotor.jogos.length + ' + 3º:' + terceiros + ')');
        /* ⛔⛔ E A PROVA DE QUE A POLÍTICA ATRAVESSOU não é o total — é a COMPOSIÇÃO. Em N=5 os dois
         * desenhos têm 6 posições, e só o TIPO delas denuncia qual desenho rodou: a repescagem põe a
         * sobra a jogar, a sobra única dá folga. Comparar total daria verde com a política perdida. */
        if (pol === 'sobra_unica') {
          const tiposSobra = doMotor.jogos.map(function (m) { return m.tipo; });
          const tiposRep = C.chave(N, f, 'repescagem').jogos.map(function (m) { return m.tipo; });
          ok(JSON.stringify(tiposSobra) !== JSON.stringify(tiposRep),
            '② ⛔⛔ ' + pol + ' ' + f + ' N=' + N + ': composição igual à repescagem ⇒ a política NÃO atravessou');
          /* ⛔ FOLGA SÓ EXISTE QUANDO SOBRA ALGUÉM LONGE DA FINAL. Com 12 equipes a cadeia é
           * 12→6→3→2: a única rodada ímpar é a semifinal de três, onde a folga é PROIBIDA e a
           * repescagem é obrigatória. Eu havia exigido folga sempre e o teste acusou — a exigência
           * era minha, não do desenho. */
          const temImparLonge = C.plano(N, f, 'sobra_unica').rodadas
            .some(function (r) { return r.impar && r.ateFinalChave >= 3; });
          ok((tiposSobra.indexOf('bye') !== -1) === temImparLonge,
            '② ' + pol + ' ' + f + ' N=' + N + ': folga existe exatamente quando há rodada ímpar a 3+ rodadas da final');
        }
        if (pol === 'bye') {
          const r1 = doMotor.jogos.filter(function (m) { return m.fase === 'VC' && m.rodada === 1; });
          const alvo = C.plano(N, f, 'bye');
          ok(r1.length === (alvo.esperamNoPlayin > 0 ? (N - alvo.esperamNoPlayin) / 2 : N / 2),
            '② ⛔⛔ ' + pol + ' ' + f + ' N=' + N + ': a 1ª rodada não é o play-in ⇒ a política NÃO atravessou');
        }
      });
    });
  });
  /* ⛔⛔ AQUI FICAVA OUTRA ASSERÇÃO VAZIA MINHA, e a revisão a pegou: `A.build(N+1)` comparado com
   * `A.build(N+1)` — a mesma chamada duas vezes, verde garantido. Determinismo do construtor já é
   * medido em ① com o motor; repetir aqui não acrescenta nada e disfarça o que FALTA.
   * ⚠️ O que falta de verdade está nomeado no plano e é da leva 7.2: `integrarTardiosElim` e
   * `recalcularComTardio` exercitados de ponta a ponta, fase dividida, a Cloud Function pelo vendor, a
   * confirmação do BYE e a concorrência da decisão de sobra. Não escrevo asserção que finja cobrir isso. */
}

/* ── ③ O PREÇO DE CADA DESENHO, MEDIDO ──────────────────────────────────────────
 * Quantos N, entre 4 e 64, têm ALGUM confronto da 1ª rodada trocado ao entrar um inscrito?
 * ⛔ Compara-se o PAR DE POSIÇÕES de cada jogo já existente da 1ª rodada. Trocar a posição de alguém
 * é trocar o confronto dele, e é isso que o organizador vê como "mudou o meu jogo". */
function paresDaPrimeira(N, pol) {
  const ch = C.chave(N, 'simples', pol);
  return ch.jogos
    .filter(function (m) { return m.fase === 'VC' && m.rodada === 1 && m.tipo === 'normal'; })
    .map(function (m) {
      return m.entradas.map(function (e) { return e && e.tipo === 'seed' ? 's' + e.seed : (e && e.tipo) || '?'; }).join('x');
    });
}
const trocam = {};
POLITICAS.forEach(function (pol) {
  let n = 0;
  for (let N = 4; N < 64; N++) {
    const antes = paresDaPrimeira(N, pol);
    const depois = paresDaPrimeira(N + 1, pol);
    /* Só se olha os confrontos que JÁ existiam: um jogo novo no fim não é mudança de confronto. */
    const mudou = antes.some(function (par, i) { return depois[i] !== par; });
    if (mudou) n++;
  }
  trocam[pol] = n;
});
console.log('  • 1ª rodada trocada ao entrar um inscrito: ' + JSON.stringify(trocam));
ok(trocam.repescagem === 0,
  '③ ⛔⛔ REPESCAGEM: nenhum confronto já sorteado da 1ª rodada muda ao entrar um tardio (achei ' + trocam.repescagem + ')');
/* ⛔ E AQUI A DIFERENÇA ENTRE OS TRÊS DESENHOS, MEDIDA e não prometida. Este trecho já foi reescrito
 * duas vezes no mesmo dia, acompanhando o desenho da sobra única — e a versão que vale é esta:
 *  · REPESCAGEM e SOBRA ÚNICA: todas jogam a estreia, o emparelhamento é adjacente e o tardio entra na
 *    última posição ⇒ confronto já sorteado NÃO muda;
 *  · BYE: a estreia é um play-in dimensionado pela potência de 2 de baixo ⇒ entrar um inscrito muda
 *    quem joga a estreia, em 60 dos 60 incrementos entre 4 e 64.
 * ⇒ Só o BYE precisa de confirmação do organizador para admitir tardio depois de haver confronto
 * publicado. Está dito aqui em vez de prometido na tela. */
ok(trocam.repescagem === 0,
  '③ ⛔⛔ REPESCAGEM: nenhum confronto já sorteado muda ao entrar um tardio (achei ' + trocam.repescagem + ')');
ok(trocam.sobra_unica === 0,
  '③ ⛔⛔ SOBRA ÚNICA: idem — todas jogam a estreia e o tardio entra na última posição (achei ' + trocam.sobra_unica + ')');
ok(trocam.bye > 0,
  '③ ⚠️ BYE: muda, e é do desenho — o play-in é dimensionado por N (achei ' + trocam.bye + ')');

/* ── ④ E O QUE VALE NOS TRÊS: FOLGA NUNCA EM SEMIFINAL NEM EM FINAL ──────────── */
POLITICAS.forEach(function (pol) {
  FORMATOS.forEach(function (f) {
    for (let N = 2; N <= 64; N++) {
      C.plano(N, f, pol).rodadas.forEach(function (r) {
        if (r.acao === 'bye') {
          ok(r.ateFinalChave >= 3,
            pol + ' ' + f + ' N=' + N + ': folga a ' + r.ateFinalChave + ' rodada(s) da final de ' + r.fase);
        }
      });
    }
  });
});

/* ── ⑤ NO DESENHO DE FOLGA, O TARDIO NÃO ENTRA SOZINHO ───────────────────────
 * ⛔⛔ Eu tinha ANOTADO que "o bye com inscrição aberta precisa de confirmação" e não implementei a
 * recusa. A revisão reproduziu: com 36→37, `D29×D30 … D35×D36` vira `D28×D29 … D36×D37`, o integrador
 * aplicava e a Function gravava — confronto que as pessoas já viram trocado sem ninguém pedir.
 * Anotar o risco e deixar o código fazer assim mesmo é pior que não ter anotado.
 * ⇒ Agora a chave não é mexida: o tardio fica pendente e refazer a chave é um gesto do organizador. */
const adCod = fs.readFileSync(path.join(ROOT, 'js/views/chaves-adapter.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(/_politicaAqui === 'bye'/.test(adCod),
  '⑤ ⛔⛔ o integrador de tardios reconhece a chave de FOLGA');
const iBye = adCod.indexOf("_politicaAqui === 'bye'");
const iCresce = adCod.indexOf('crescerComPrefixo(doGrupo', iBye);
const iRet = adCod.indexOf('return;', iBye);
ok(iRet > iBye && (iCresce < 0 || iRet < iCresce),
  '⑤ ⛔ e SAI antes de recalcular ou crescer — a chave não é tocada');
ok(/pendentesPorGrupo/.test(adCod),
  '⑤ o tardio fica REGISTRADO como pendente, não desaparece em silêncio');
ok(/_tardiosAguardandoNovaChave/.test(adCod),
  '⑤ ⭐ e a tela tem por onde perguntar, para oferecer a decisão ao organizador');

/* ── ⑥ A PENDÊNCIA SOBREVIVE À ABA ──────────────────────────────────────────
 * ⛔⛔ Achado do revisor: eu deixava a pendência SÓ numa função de `window`. Fechada a página, o
 * organizador nunca mais saberia que alguém está esperando, e o inscrito sumiria sem decisão nenhuma.
 * Estado que importa guardado onde não dura é o mesmo defeito de sempre.
 * ⇒ a proposta vai gravada no torneio, por LINHA, e é EXERCIDA aqui — não conferida por texto. */
const _pend = (function () {
  const N = 36;
  const t = {
    id: 'tp', politicaDaChave: 'bye',
    matches: A.build(N, 'simples', { participantes: gente(N), politicaDaChave: 'bye' }).matches
  };
  const tardio = { name: 'Tardio 37', uid: 'uid-tardio-37', presente: true };
  try { A.integrarTardiosElim(t, [tardio]); } catch (e) { return { erro: e && e.message }; }
  return { t: t };
})();
ok(!_pend.erro, '⑥ o integrador rodou no desenho de folga (' + (_pend.erro || 'ok') + ')');
if (!_pend.erro) {
  const mapa = _pend.t.tardiosPendentesPorLinha;
  ok(mapa && typeof mapa === 'object', '⑥ ⛔⛔ a proposta foi GRAVADA no torneio');
  const prop = mapa && mapa[Object.keys(mapa)[0]];
  ok(!!prop, '⑥ e há uma proposta para a linha');
  if (prop) {
    ok(prop.politica === 'bye', '⑥ ela diz de que desenho é');
    ok(Array.isArray(prop.inscritos) && prop.inscritos.length === 1,
      '⑥ com quem está esperando (achei ' + ((prop.inscritos || []).length) + ')');
    ok(((prop.inscritos[0] || {}).uids || []).indexOf('uid-tardio-37') >= 0,
      '⑥ ⛔ identificado por UID, não pelo nome — nome é rótulo e envelhece');
    ok(typeof prop.revisaoDaChave === 'string' && prop.revisaoDaChave.length > 0,
      '⑥ ⛔⛔ com a REVISÃO da chave — sem ela, confirmar depois redesenharia por cima de outra coisa');
    ok(Array.isArray(prop.confrontosAfetados) && prop.confrontosAfetados.length > 0,
      '⑥ ⛔ e com os confrontos que mudariam (achei ' + ((prop.confrontosAfetados || []).length) + ')');
    /* ⛔ serializável de verdade: é isso que separa "proposta gravada" de objeto vivo em memória */
    let serializa = true;
    try { JSON.parse(JSON.stringify(prop)); } catch (e) { serializa = false; }
    ok(serializa, '⑥ ⛔ e a proposta é serializável — senão não chega ao banco');
    /* ⛔ a revisão tem de MUDAR quando a chave muda, senão ela não protege nada */
    const outro = { id: 'tp2', politicaDaChave: 'bye',
      matches: A.build(32, 'simples', { participantes: gente(32), politicaDaChave: 'bye' }).matches };
    try { A.integrarTardiosElim(outro, [{ name: 'T33', uid: 'uid-t33', presente: true }]); } catch (e) {}
    const p2 = outro.tardiosPendentesPorLinha && outro.tardiosPendentesPorLinha[Object.keys(outro.tardiosPendentesPorLinha)[0]];
    ok(!!p2 && p2.revisaoDaChave !== prop.revisaoDaChave,
      '⑥ ⛔⛔ chave diferente ⇒ revisão diferente (senão a proposta velha passaria por vigente)');
  }
  /* ── ⑦ A PROPOSTA CHEGA AO GRAVADOR ──────────────────────────────────────
   * ⛔⛔ Achado do revisor e defeito meu: escrever no objeto NÃO é persistir. Na folga o tardio não
   * entra, `aplicados` fica 0, nenhum outro contador se move — e quem grava decide pelo agregado
   * "mudou alguma coisa?". Sem um contador próprio, a proposta era escrita e jogada fora, e eu tinha
   * declarado que estava gravada. */
  const _r2 = (function () {
    const t2 = { id: 'tq', politicaDaChave: 'bye',
      matches: A.build(36, 'simples', { participantes: gente(36), politicaDaChave: 'bye' }).matches };
    const out = A.integrarTardiosElim(t2, [{ name: 'T37', uid: 'uid-t37', presente: true }]);
    return { out: out, t: t2 };
  })();
  ok(_r2.out && _r2.out.propostas === 1,
    '⑦ ⛔⛔ o integrador CONTA a proposta criada (achei ' + ((_r2.out || {}).propostas) + ') — é isso que faz o gravador gravar');
  ok(_r2.out && _r2.out.aplicados === 0,
    '⑦ e segue sem aplicar nada na chave (aplicados=' + ((_r2.out || {}).aplicados) + ')');
  ok(_r2.out && _r2.out.semMudanca === false,
    '⑦ ⛔ e não se declara "sem mudança" — havia o que gravar');
  /* ⛔ IDEMPOTENTE: repetir com o mesmo tardio e a mesma chave não pode gerar escrita nova, senão
   * cada visita à tela custa uma gravação no torneio. */
  const _r3 = A.integrarTardiosElim(_r2.t, [{ name: 'T37', uid: 'uid-t37', presente: true }]);
  ok(_r3 && _r3.propostas === 0,
    '⑦ ⛔⛔ repetir a MESMA proposta não conta de novo (achei ' + ((_r3 || {}).propostas) + ')');
  /* ⛔ mas um tardio DIFERENTE é proposta diferente e tem de contar */
  const _r4 = A.integrarTardiosElim(_r2.t, [{ name: 'T38', uid: 'uid-t38', presente: true }]);
  ok(_r4 && _r4.propostas === 1,
    '⑦ e um inscrito diferente gera proposta nova (achei ' + ((_r4 || {}).propostas) + ')');
  /* ⛔ INSTANTE ESTÁVEL: quem chama de dentro de uma transação passa o seu, para a repetição da
   * transação não produzir documento diferente. */
  const _t5 = { id: 'tr', politicaDaChave: 'bye',
    matches: A.build(36, 'simples', { participantes: gente(36), politicaDaChave: 'bye' }).matches };
  A.integrarTardiosElim(_t5, [{ name: 'T39', uid: 'uid-t39', presente: true }], { agora: '2026-01-01T00:00:00.000Z' });
  const _p5 = _t5.tardiosPendentesPorLinha && _t5.tardiosPendentesPorLinha[Object.keys(_t5.tardiosPendentesPorLinha)[0]];
  ok(_p5 && _p5.criadaEm === '2026-01-01T00:00:00.000Z',
    '⑦ ⛔ o instante vem de quem chama, não é criado dentro da operação');

  /* ⛔ E NADA foi redesenhado: a proposta é registro, não ação. */
  const antes = A.build(36, 'simples', { participantes: gente(36), politicaDaChave: 'bye' }).matches;
  const chave = (ms) => ms.filter(function (m) { return m && (m.p1 || m.p2); })
    .map(function (m) { return m.id + ':' + m.p1 + 'x' + m.p2; }).sort().join('|');
  ok(chave(_pend.t.matches) === chave(antes),
    '⑥ ⛔⛔ e NENHUM confronto foi mexido ao registrar a pendência');
}
/* ⚠️ E nos outros dois desenhos o tardio continua entrando sozinho — ali nada muda para ninguém. */
ok(trocam.repescagem === 0 && trocam.sobra_unica === 0,
  '⑤ na repescagem e na sobra única o tardio segue entrando sem mexer em confronto já sorteado');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
