/* REPESCAGEM da Fase 0 — MECANISMO ESTRUTURAL. node tests/repechage.test.js
 *
 * SUPERSEDE a versão anterior deste arquivo (decisão do dono, 25/jul, depois do
 * torneio de casais). O que mudou e por quê:
 *
 *  ANTES — repescagem por MELHOR DERROTADO: a vaga nascia como `repFill` e só era
 *  preenchida depois da R1 fechar, por `_resolveRepFills`, escolhendo o derrotado
 *  com melhor saldo. Quem seria repescado só se sabia no fim da rodada.
 *
 *  AGORA — repescagem ESTRUTURAL: o desenho é função pura de (N, formato)
 *  (js/views/chaves.js). No sorteio já se sabe que o seed #4 enfrenta o perdedor
 *  de um jogo NOMEADO da R1, escolhido na METADE OPOSTA da chave. Não há vaga
 *  pendente, não há ranqueamento posterior, não há `repFill` na eliminatória.
 *
 *  E QUANDO há repescagem: quem manda é a LÓGICA, não o organizador — aplica-se o
 *  que exige MENOS intervenção (o menor entre vagas B−N e perdedores N−B/2;
 *  empate vai pra bye). Por isso N=12 e N=13 NÃO têm repescagem nenhuma.
 *
 * O que este arquivo trava: (1) a escolha bye × repescagem segue a regra do menor;
 * (2) o perdedor do jogo-fonte chega mesmo na vaga, jogando com o motor REAL; e
 * (3) ele NÃO é duplicado — não ocupa dois slots ao mesmo tempo (esse double-book
 * foi a raiz do auto-confronto Time X vs X que quebrou ao vivo na 1.5.5).
 */
const { window: W } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const C = W._chaves, A = W._chavesAdapter;
const parts = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'P' + (i + 1), uid: 'u' + (i + 1) }));
const isBye = (x) => !x || x === 'TBD' || /BYE/.test(String(x));

console.log('\n== 1) a REGRA: intervenção onde E é ímpar, folga longe do fim, repescagem perto ==');
// A chave não é mais inflada até potência de 2. Cada rodada com E entrantes gera
// teto(E/2) jogos; E ímpar deixa uma sobra, que recebe FOLGA (se faltam >=3 rodadas
// até a final DAQUELA chave, e dentro do teto de 3 folgas a cada 12 inscritos) ou
// REPESCAGEM (caso contrário). Isso é o que impede alguém de chegar à final sem jogar.
['simples', 'dupla'].forEach(function (fmt) {
  for (var n = 2; n <= 200; n++) {
    var p = C.plano(n, fmt);
    p.rodadas.forEach(function (r) {
      if (r.impar) ok(r.acao === 'bye' || r.acao === 'repescagem',
        `${fmt} N=${n} ${r.fase}R${r.rodada}: E=${r.E} ímpar sem intervenção`);
      else ok(!r.acao, `${fmt} N=${n} ${r.fase}R${r.rodada}: E=${r.E} par recebeu "${r.acao}"`);
      if (r.acao === 'bye') ok(r.ateFinalChave >= 3,
        `${fmt} N=${n}: FOLGA em ${r.fase}R${r.rodada}, a ${r.ateFinalChave} rodada(s) do fim da chave`);
      // topologia não depende da política: folga e repescagem dão os mesmos números
      ok(r.sobe === Math.ceil(r.E / 2), `${fmt} N=${n} ${r.fase}R${r.rodada}: sobem ${r.sobe} != teto(E/2)`);
      // A 1ª rodada desce MENOS quando a R2 é normalizada até a potência de 2: os
      // repescados escolhidos ali seguem VIVOS na superior, então a descida deles para a
      // inferior é adiada para o jogo da R2 (senão estariam nas duas chaves ao mesmo tempo).
      var _repAqui = (r.fase === 'VC' && r.rodada === 1) ? (p.repR2 || 0) : 0;
      if (r.fase === 'VC') ok(r.desce === Math.floor(r.E / 2) - _repAqui,
        `${fmt} N=${n} ${r.fase}R${r.rodada}: descem ${r.desce} != piso(E/2)-${_repAqui}`);
    });
    ok(p.byes <= p.tetoFolgas, `${fmt} N=${n}: ${p.byes} folgas > teto ${p.tetoFolgas} (3 a cada 12)`);
  }
});
// chave exata não precisa de intervenção nenhuma
[2, 4, 8, 16, 32, 64].forEach(function (n) {
  var p = C.plano(n, 'simples');
  ok(p.byes === 0 && p.repescagens === 0,
    `N=${n} simples (potência de 2): esperado 0 folgas / 0 repescagens, got ${p.byes}/${p.repescagens}`);
});
// 12 duplas: com a R2 normalizada (6 sobem + 2 repescados = 8), a chave SUPERIOR sai
// 6/4/2/1 e sem folga nenhuma. A folga que sobra mora na inferior, que segue a
// recorrência normal — a regra da R2 é da chave principal.
(function () {
  var p12 = C.plano(12, 'dupla');
  ok(p12.repR2 === 2, 'N=12 dupla: 2 repescados completam a R2 até 8 (got ' + p12.repR2 + ')');
  ok(p12.rodadas.filter(function (r) { return r.fase === 'VC' && r.acao === 'bye'; }).length === 0,
    'N=12 dupla: ZERO folga na chave SUPERIOR');
  ok(p12.rodadas.filter(function (r) { return r.fase === 'VC'; }).map(function (r) { return r.jogos; }).join('/') === '6/4/2/1',
    'N=12 dupla: superior 6/4/2/1');
})();

console.log('== 1b) a repescagem sai da PRÓPRIA rodada, sem revanche e sem descida dupla ==');
['simples', 'dupla'].forEach(function (fmt) {
  for (var n = 3; n <= 120; n++) {
    var d = C.chave(n, fmt);
    d.jogos.filter(function (j) { return j.tipo === 'repescagem'; }).forEach(function (j) {
      var src = d.porId[j.origemRepescado];
      ok(!!src, `${fmt} N=${n}: ${j.id} sem jogo de origem`);
      if (!src) return;
      ok(src.rodada === j.rodada && src.fase === j.fase,
        `${fmt} N=${n}: ${j.id} repesca de ${src.id}, de outra rodada/chave`);
      // descida ADIADA: quem cai à inferior é o perdedor DESTE jogo, não o do cedente
      ok(src.perdedorDesce === false,
        `${fmt} N=${n}: ${src.id} cedeu o perdedor e ainda o manda descer (double-book)`);
      // a sobra não disputou nada nesta rodada → revanche é impossível por construção
      ok(!(j.entradas[0].de && j.entradas[0].de === src.id),
        `${fmt} N=${n}: ${j.id} seria revanche — a sobra veio do próprio ${src.id}`);
    });
  }
});

console.log('== 2) o perdedor do jogo-fonte CHEGA na vaga de repescagem (motor real) ==');
[5, 9, 10, 11].forEach(function (n) {
  var built = A.build(n, 'simples', { participantes: parts(n) });
  var t = { id: 'r', format: 'Eliminatórias Simples', matches: built.matches };

  // Repescados existem em DOIS papéis: a sobra de uma rodada ímpar (`repescagens`) e os
  // que completam a R2 até a potência de 2 (`repR2`). Cada um é cedido por um jogo-fonte
  // NOMEADO já no sorteio — é essa aresta que a contagem trava. O nº de JOGOS marcados
  // como vaga pode ser menor, porque dois repescados podem cair no mesmo jogo (rep × rep).
  var _pl = C.plano(n);
  var fontes = t.matches.filter(function (m) { return m.loserNextMatchId; });
  ok(fontes.length === _pl.repescagens + _pl.repR2,
    `N=${n}: ${fontes.length} jogo(s)-fonte, esperado ${_pl.repescagens + _pl.repR2} (rep ${_pl.repescagens} + repR2 ${_pl.repR2})`);
  var vagas = t.matches.filter(function (m) { return m.isRepechageSlot; });
  ok(vagas.length >= 1 && vagas.length <= fontes.length,
    `N=${n}: ${vagas.length} vaga(s) pra ${fontes.length} fonte(s)`);

  // ── QUEM ATERRISSA NA VAGA, E QUANDO (regra do dono, v1.5.36 — UNIVERSAL) ────────
  // "É para esperar todos os da rodada serem definidos, para só daí termos o ranking dos
  //  derrotados considerando os critérios de desempate, para só daí preencher conforme o
  //  ranking as vagas. Nada, absolutamente nada, antes disso. Serve para eliminatórias
  //  simples (1, 2 ou 4 linhas), duplas ou o que for. SEMPRE."
  // Vale pra vaga da SOBRA (mesma rodada) E pra vaga da NORMALIZAÇÃO (rodada seguinte):
  // enquanto QUALQUER jogo-fonte da rodada estiver aberto, TODA vaga fica vazia.
  var _vazio = function (v) { return !v || v === 'TBD' || /a definir/i.test(String(v)); };
  var hospedeiro = {};   // jogos que HOSPEDAM vaga não são fonte (a sobra mora na própria rodada)
  t.matches.forEach(function (m) {
    if (m.isRepechageSlot || m.p1FromRepechage || m.p2FromRepechage) hospedeiro[String(m.id)] = 1;
  });
  var vagasDe = function () {
    var o = [];
    t.matches.forEach(function (m) {
      if (m.winner) return;
      ['p1', 'p2'].forEach(function (sl) { if (m[sl + 'FromRepechage']) o.push({ m: m, sl: sl }); });
    });
    return o;
  };
  var fonteAberta = function (r) {
    return t.matches.some(function (m) {
      return m.round === r && !m.winner && !m.isBye && !m.isSitOut && !hospedeiro[String(m.id)] &&
        !_vazio(m.p1) && !_vazio(m.p2);
    });
  };
  fontes.forEach(function (src) {
    var alvo = t.matches.filter(function (m) { return m.id === src.loserNextMatchId; })[0];
    ok(!!alvo, `N=${n}: jogo-fonte ${src.id} aponta pra vaga inexistente ${src.loserNextMatchId}`);
  });

  // joga um jogo-fonte por vez; ENQUANTO a rodada dele estiver aberta, nenhuma vaga
  // alimentada por aquela rodada pode ter ocupante
  fontes.forEach(function (src, i) {
    if (src.winner || hospedeiro[String(src.id)]) return;
    src.winner = src.p1; src.scoreP1 = 6; src.scoreP2 = i % 5;
    W._advanceWinner(t, src);
    if (!fonteAberta(src.round)) return;   // fechou nesta jogada — a vaga PODE encher agora
    vagasDe().forEach(function (v) {
      var e = t.matches.filter(function (m) { return m.loserNextMatchId === v.m.id; })[0];
      if (!e || e.round !== src.round) return;
      ok(_vazio(v.m[v.sl]),
        `N=${n}: rodada ${src.round} ABERTA e a vaga ${v.m.id}.${v.sl} já tem ocupante (${v.m[v.sl]})`);
    });
  });

  // fecha TODAS as rodadas-fonte → toda vaga alimentada por rodada fechada tem repescado
  var guard = 0;
  while (guard++ < 200) {
    var pend = t.matches.filter(function (m) {
      return !m.winner && !m.isBye && !m.isSitOut && !hospedeiro[String(m.id)] && !_vazio(m.p1) && !_vazio(m.p2);
    })[0];
    if (!pend) break;
    pend.winner = pend.p1; pend.scoreP1 = 6; pend.scoreP2 = guard % 5;
    W._advanceWinner(t, pend);
  }
  vagasDe().forEach(function (v) {
    var e = t.matches.filter(function (m) { return m.loserNextMatchId === v.m.id; })[0];
    if (!e) return;
    if (fonteAberta(e.round)) return;
    ok(!_vazio(v.m[v.sl]) || v.m[v.sl + 'AguardaMelhor'] !== true,
      `N=${n}: rodada ${e.round} FECHADA e a vaga ${v.m.id}.${v.sl} segue vazia/aguardando`);
  });
});

console.log('== 3) o repescado NÃO é duplicado (raiz do auto-confronto) ==');
// Dois padrões de playout, e a razão é específica desta seção: num jogo de repescagem
// o p1 é a SOBRA e o p2 é o REPESCADO. Jogando sempre "p1 vence", o repescado perde
// SEMPRE — e o caminho em que ele avança (o único que poderia lhe dar uma 3ª vida)
// nunca chega a ser exercitado. O padrão "p2 vence" cobre justamente esse.
[['p1', function (m) { return m.p1; }], ['p2', function (m) { return m.p2; }]].forEach(function (padrao) {
  var tagP = padrao[0], escolhe = padrao[1];
[5, 9, 10, 11].forEach(function (n) {
  var built = A.build(n, 'simples', { participantes: parts(n) });
  var t = { id: 'r', format: 'Eliminatórias Simples', matches: built.matches };
  // quantas vezes cada competidor entrou numa vaga COMO REPESCADO (a vida extra)
  var vidasExtras = {};
  var guard = 0;
  for (;;) {
    if (++guard > 3000) break;
    var m = t.matches.find(function (x) { return !x.winner && !isBye(x.p1) && !isBye(x.p2); });
    if (!m) break;
    ok(m.p1 !== m.p2, `N=${n} [${tagP}]: ${m.id} — ${m.p1} enfrentaria a si mesmo`);
    ['p1', 'p2'].forEach(function (s) {
      if (m[s + 'FromRepechage'] && !isBye(m[s])) vidasExtras[m[s]] = (vidasExtras[m[s]] || 0) + 1;
    });
    m.winner = escolhe(m);
    W._advanceWinner(t, m);
  }
  // Ninguém ocupa dois slots SIMULTÂNEOS na mesma rodada.
  //
  // A vaga de repescagem é EXCLUÍDA desta conta de propósito: quem é repescado
  // aparece mesmo duas vezes na rodada 1 — no jogo normal que perdeu e, depois,
  // na repescagem. Não é double-book, é sequência: a repescagem consome o
  // perdedor de um jogo normal, então só pode ser jogada DEPOIS dele (é por isso
  // que chaves.js ordena os normais antes das repescagens). O double-book de
  // verdade — a mesma pessoa em dois jogos que rolam ao mesmo tempo — é o que
  // gerava o auto-confronto, e é o que esta conta pega.
  var porRodada = {};
  t.matches.forEach(function (m) {
    if (m.isRepechageSlot) return;
    if (isBye(m.p1) && isBye(m.p2)) return;
    (porRodada[m.round] = porRodada[m.round] || []).push(m.p1, m.p2);
  });
  Object.keys(porRodada).forEach(function (r) {
    var reais = porRodada[r].filter(function (x) { return !isBye(x); });
    ok(new Set(reais).size === reais.length,
      `N=${n} rodada ${r} [${tagP}]: alguém ocupa DOIS slots simultâneos (double-book) → [${reais.join(', ')}]`);
  });

  // NINGUÉM É REPESCADO DUAS VEZES — o teto de vidas que o dono aceitou.
  //
  // A conta é sobre o lado REPESCADO da vaga (`pXFromRepechage`), não sobre a vaga
  // inteira. Antes esta asserção olhava os DOIS lados e passava por acidente: a R1
  // ganhava folga, então só sobrava uma vaga de repescagem na chave e não havia o que
  // colidir. Com a folga proibida na R1 (regra do dono, jul/2026) aparecem duas vagas,
  // e o outro lado — a SOBRA — legitimamente ocupa as duas: quem é a última posição da
  // R1 e vence continua sendo a última posição da R2. Isso não é vida extra, é a mesma
  // pessoa jogando rodadas consecutivas. Contar aquilo como duplicação transformaria
  // um comportamento correto em falha.
  //
  // A vida extra é ser REPESCADO: perder e voltar. Ela vale UMA vez — é o que sustenta
  // a regra publicada "sai com 2 derrotas na simples (1 se nunca repescado)". Se alguém
  // for repescado duas vezes, sairia com 3 e o teto teria furado.
  var multi = Object.keys(vidasExtras).filter(function (k) { return vidasExtras[k] > 1; });
  ok(multi.length === 0,
    `N=${n} [${tagP}]: ${multi.join(', ')} foi repescado mais de uma vez → ${JSON.stringify(vidasExtras)}`);

  // e a chave fecha mesmo quando o repescado é quem avança
  var pendentes = t.matches.filter(function (m) { return !m.winner && !isBye(m.p1) && !isBye(m.p2); });
  ok(pendentes.length === 0,
    `N=${n} [${tagP}]: ${pendentes.length} jogo(s) pendente(s) → ${pendentes.map(function (m) { return m.id; }).join(',')}`);
});
});

console.log('\n' + (fail === 0 ? '✅ repechage: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
