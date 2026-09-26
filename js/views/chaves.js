/* chaves.js — DESENHO DETERMINÍSTICO DE CHAVES (Eliminatória Simples e Dupla).
 *
 * PRINCÍPIO: a chave é função pura de (número de participantes, formato).
 * Cada N tem UM desenho, absoluto e imutável. Dois torneios com 11 duplas têm
 * exatamente a mesma estrutura de confrontos, byes e repescagens.
 *
 * POR QUE ESTE ARQUIVO EXISTE (v1.5.5, torneio de casais, falha ao vivo):
 * o id do jogo era cunhado com Date.now() (`p0-1738412955-3`). Id por timestamp
 * NÃO é derivável da estrutura, então recalcular a chave gerava ids novos e
 * órfãos TODOS os resultados já lançados (que moram em tournaments/{id}/results/
 * {matchId}). Sem poder recalcular, a entrada de um tardio só podia ser feita
 * operando o grafo vivo à mão — ~1.250 linhas de cirurgia incremental que
 * quebraram em quadra (tardio sem jogo, "vs a definir" preso, perdedor sem
 * pouso na inferior, auto-confronto Time X vs Time X na re-propagação).
 *
 * A CORREÇÃO É O ID: aqui o id é ESTRUTURAL — `VC-R1-P3`, derivável de
 * (N, formato). Recalcular a chave inteira reproduz os mesmos ids, e os
 * resultados se re-ancoram sozinhos. Cirurgia deixa de ser necessária.
 *
 * REGRAS (não "consertar" sem ler antes):
 *  • NUNCA persista a chave. Persista participantes[] e resultados{}.
 *  • NUNCA grave o número do jogo ("JOGO 7") — é rótulo de tela, some no render.
 *  • NUNCA resorteie ao admitir tardio: ele entra na PRÓXIMA POSIÇÃO LIVRE.
 *  • Byes e repescagens são camada DERIVADA — recalculam a cada N, e tudo bem.
 *  • Confronto normal já existente NUNCA muda (garantido por teste, ver abaixo).
 *
 * Invariantes travados em tests/chaves-aceite.test.js e tests/chaves-stress.test.js
 * (344 + 26.805 asserções, N=2..64, nos dois formatos). Se alguém reintroduzir
 * patch incremental na chave, aquelas suítes ficam vermelhas.
 */
(function () {
  'use strict';

  /* ===================================================================
   * A CHAVE NÃO É INFLADA ATÉ POTÊNCIA DE 2 (regra do dono, jul/2026).
   *
   * Antes, N virava B = próxima potência de 2 e as B−N posições vazias eram
   * preenchidas com folga ou repescagem. Isso produzia absurdos: 36 duplas
   * viravam uma chave de 64 com 24 equipes avançando sem jogar na 1ª rodada,
   * e a 1ª rodada da chave inferior ficava sem NENHUM jogo de verdade.
   *
   * Agora a chave é a árvore mínima e a regra é uma recorrência:
   *
   *   rodada com E entrantes  ->  teto(E/2) jogos
   *     E par    : E/2 jogos, todos normais.
   *     E ímpar  : (E−1)/2 jogos normais + 1 jogo para a sobra, que recebe
   *                FOLGA      se faltam >=3 rodadas até a final DAQUELA chave,
   *                           o torneio está dentro do teto de 3 folgas a cada
   *                           12 inscritos, e NÃO é a 1ª rodada da principal;
   *                REPESCAGEM caso contrário — enfrenta o perdedor do primeiro
   *                           jogo normal da PRÓPRIA rodada.
   *   Em ambos os casos: avançam = teto(E/2) e descem = piso(E/2).
   *
   * NA 1ª RODADA DA PRINCIPAL A SOBRA NUNCA GANHA FOLGA (regra do dono, jul/2026).
   * Como o emparelhamento é adjacente e o tardio entra na próxima posição livre
   * (o fim da ordem), a sobra daquela rodada É o último inscrito — e folga ali
   * significa "quem chegou por último avança sem jogar". Ele joga a repescagem.
   *
   * Como folga e repescagem entregam os mesmos números, a TOPOLOGIA não depende
   * da política — a chave continua sendo função pura de (N, formato).
   *
   * Consequência aceita e desejada: quem é repescado ganha vida extra. Sai com
   * 2 derrotas na simples (1 se nunca foi repescado) e com até 4 na dupla
   * (2 se nunca foi repescado).
   *
   * A folga nunca cai em semifinal nem em final, de nenhuma das chaves — é o
   * que o critério das 3 rodadas garante, sem depender de configuração.
   *
   * EMPARELHAMENTO É ADJACENTE, NUNCA ESPELHADO. É o que preserva a admissão
   * de tardios: com pares (1,2)(3,4)(5,6)…, aumentar N acrescenta um par no fim
   * e não toca em nenhum confronto já sorteado. Espelho remapearia todos.
   * =================================================================== */

  // teto de folgas: 3 a cada 12 inscritos
  function tetoFolgas(N) { return Math.max(1, Math.floor(N / 4)); }

  // Topologia pura: quantas rodadas, quantos entram/avançam/descem em cada uma.
  // Não depende de folga vs repescagem (as duas dão os mesmos números).
  function _pow2Acima(n) { var p = 1; while (p < n) p *= 2; return p; }

  /* ⛔⛔ AS TRÊS POLÍTICAS DE CHAVE — bloco 7 da reforma (25/set/2026).
   *
   * Até aqui existia UMA: repescagem até fechar a potência de 2. O dono pediu que voltasse a ser
   * ESCOLHA DELE, antes do sorteio, entre os três desenhos da planilha. Cada um tem a sua própria
   * cadeia de rodadas — não é o mesmo desenho com outro rótulo na sobra:
   *
   *  · `repescagem`  (o de hoje) todas jogam a 1ª; a 2ª fecha em potência de 2 chamando perdedoras;
   *  · `bye`         uma rodada de play-in reduz o campo à potência de 2 DE BAIXO e a partir dali a
   *                  chave é cheia: nenhuma rodada ímpar, nenhuma intervenção, e `N − excesso*2`
   *                  equipes esperam sem jogar a estreia;
   *  · `sobra_unica` nenhum alvo de potência em lugar nenhum: cada rodada corta pela metade, e a
   *                  rodada ímpar tem exatamente UMA sobra. SEM normalização da 2ª rodada — é o que
   *                  faz as rodadas do meio não serem redondas, preço que a planilha já nomeia.
   *
   * ⛔ AUSENTE É `repescagem`, E ISSO NÃO É CONVENIÊNCIA: os 78 torneios que existem não têm o campo,
   * e nenhum deles pode mudar de desenho por causa desta leva. `plano(N, formato)` sem o terceiro
   * argumento responde exatamente o que respondia antes — travado por teste próprio, e provado
   * também pelas duas suítes grandes da chave passarem sem UMA linha alterada.
   *
   * ⚠️ PREÇO DO `bye`, declarado: hoje admitir um tardio nunca muda confronto já sorteado (o
   * emparelhamento é adjacente e o tardio entra na última posição). No bye clássico isso não se
   * sustenta — o excedente é `N − potência de 2 abaixo`, então 36→37 move uma equipe da chave cheia
   * para o play-in. É consequência do desenho, não defeito, e é por isso que a escolha é do
   * organizador e acontece ANTES do sorteio. */
  var POLITICAS = ['repescagem', 'bye', 'sobra_unica'];
  function _politica(p) { return POLITICAS.indexOf(p) === -1 ? 'repescagem' : p; }
  function _pow2Abaixo(n) { var p = 1; while (p * 2 <= n) p *= 2; return p; }

  /* ⛔ A CHAVE INFERIOR É A MESMA NOS TRÊS DESENHOS: ela só recebe quem cai da superior e segue a
   * recorrência normal. Foi EXTRAÍDA daqui para que as duas topologias usem a MESMA, e não duas
   * cópias — duas cópias divergiriam e a divergência seria "a inferior do bye não é a inferior da
   * repescagem", que ninguém pediu. */
  function _inferior(sup, totSup, formato) {
    var inf = [];
    if (formato !== 'dupla') return inf;
    var vivos = 0, lr = 0;
    for (var k = 1; k <= totSup + 10; k++) {
      var caem = (k <= totSup) ? sup[k - 1].desce : 0;
      var Ein = vivos + caem;
      if (Ein < 2) { vivos = Ein; if (k > totSup && vivos <= 1) break; continue; }
      lr++;
      inf.push({ fase: 'PD', rodada: lr, E: Ein, jogos: Math.ceil(Ein / 2), sobe: Math.ceil(Ein / 2), impar: Ein % 2 === 1, aposSup: k });
      vivos = Math.ceil(Ein / 2);
      if (vivos === 1 && k >= totSup) break;
    }
    return inf;
  }

  function _topologia(N, formato, politica) {
    politica = _politica(politica);
    if (politica === 'bye') return _topologiaBye(N, formato);
    var sup = [], E = N, r = 0, repR2 = 0;
    while (E > 1) {
      r++;
      var _jogos = Math.ceil(E / 2);
      sup.push({ fase: 'VC', rodada: r, E: E, jogos: _jogos, sobe: _jogos, desce: Math.floor(E / 2), impar: E % 2 === 1 });
      /* ⛔ A normalização da 2ª rodada é DA POLÍTICA `repescagem`. Na sobra única ela não existe por
       * definição: se existisse, não haveria sobra nenhuma da 2ª rodada em diante e o desenho 3 seria
       * o desenho 2 com outro nome. */
      if (r === 1 && politica === 'repescagem') {
        // ── NORMALIZAÇÃO DA 2ª RODADA (regra do dono, jul/2026) ──────────────────
        // A 2ª rodada fecha em POTÊNCIA DE 2, completando com REPESCADOS da 1ª. Daí em
        // diante a chave é limpa: 8 → 4 → 2 → 1, sem uma folga sequer.
        //
        // POR QUÊ: só a recorrência teto(E/2) não zera as folgas do meio da chave. Na
        // Confra a linha Ouro (28) dava 14/7/4/2/1 e a Prata (26) dava 13/7/4/2/1 — a
        // rodada de 7 entrantes é ímpar, então sobrava folga na R3 (e na R2 da Prata).
        // O organizador via "3 jogos" numa rodada de 4 porque a folga não vira card.
        // Normalizando a R2: Ouro 14 sobem +2 repescados = 16 → 8/4/2/1; Prata 13 +3 = 16
        // → 8/4/2/1. Zero folga em ambas.
        //
        // Os repescados são perdedores da 1ª rodada, e a descida deles para a chave
        // inferior é ADIADA (mesma mecânica da repescagem da sobra): quem cai passa a ser
        // o perdedor do jogo da R2. Por isso `desce` da R1 é reduzido aqui — sem isso a
        // mesma equipe estaria viva na superior E na inferior (double-book).
        //
        // Vale para Eliminatória Simples E para a chave superior da Dupla (decisão do
        // dono ao confirmar o padrão). A chave INFERIOR segue a recorrência normal.
        var _alvo = _pow2Acima(_jogos);
        var _eliminados = N - _jogos;             // quem perdeu a 1ª rodada
        repR2 = Math.max(0, Math.min(_alvo - _jogos, _eliminados));
        sup[0].desce = Math.max(0, sup[0].desce - repR2);
        sup[0].repParaProxima = repR2;
        E = _jogos + repR2;
      } else {
        E = _jogos;
      }
    }
    var totSup = r, inf = _inferior(sup, totSup, formato);
    sup.forEach(function (x) { x.ateFinalChave = totSup - x.rodada + 1; });
    inf.forEach(function (x) { x.ateFinalChave = inf.length - x.rodada + 1; });
    return { sup: sup, inf: inf, totSup: totSup, totInf: inf.length, repR2: repR2 };
  }

  /* ⛔ O BYE TEM TOPOLOGIA PRÓPRIA, e por isso não é `if` dentro da recorrência: depois do play-in
   * TODA rodada é potência de 2, então não existe rodada ímpar, não existe sobra e não existe
   * repescagem — o desenho inteiro é play-in + halving puro. Misturar isso na recorrência do outro
   * desenho seria pedir para um dos dois vazar no outro. */
  function _topologiaBye(N, formato) {
    var alvo = _pow2Abaixo(N), excesso = N - alvo, sup = [], r = 0;
    if (excesso > 0) {
      r++;
      /* A rodada de play-in tem `excesso` jogos entre `excesso*2` equipes; as outras esperam.
       * ⛔ Ela NÃO solta perdedor para a chave inferior de forma diferente: quem perde o play-in
       * perdeu a estreia, igual a quem perde a 1ª rodada de qualquer desenho. */
      sup.push({ fase: 'VC', rodada: r, E: excesso * 2, jogos: excesso, sobe: excesso,
        desce: excesso, impar: false, playin: true, esperam: N - excesso * 2 });
    }
    for (var E = alvo; E > 1; E = E / 2) {
      r++;
      sup.push({ fase: 'VC', rodada: r, E: E, jogos: E / 2, sobe: E / 2, desce: E / 2, impar: false });
    }
    var inf = _inferior(sup, r, formato);
    sup.forEach(function (x) { x.ateFinalChave = r - x.rodada + 1; });
    inf.forEach(function (x) { x.ateFinalChave = inf.length - x.rodada + 1; });
    return { sup: sup, inf: inf, totSup: r, totInf: inf.length, repR2: 0 };
  }

  /**
   * Plano da chave: rodadas, folgas e repescagens que a regra produz para este N.
   * `B` é mantido por compatibilidade com a assinatura estrutural do adapter —
   * agora vale o próprio N, porque a chave não é mais inflada.
   */
  function plano(N, formato, politica) {
    if (N < 2) throw new Error('N minimo = 2');
    formato = formato === 'dupla' ? 'dupla' : 'simples';
    politica = _politica(politica);
    var t = _topologia(N, formato, politica);
    var teto = tetoFolgas(N), folgas = 0, reps = 0;
    var ordem = _ordemRodadas(t);
    ordem.forEach(function (x) {
      if (!x.impar) { x.acao = null; return; }
      /* ⛔⛔ NA SOBRA ÚNICA A SOBRA RECEBE FOLGA, e o teto de folgas NÃO se aplica: o desenho é esse —
       * uma intervenção por rodada ímpar, e no torneio inteiro são três (medido com 36 equipes).
       * ⛔ A EXCEÇÃO É A SEMIFINAL COM TRÊS: ali a folga é proibida (a regra vale nos três desenhos) e
       * a sobra joga a repescagem. Sem esta linha, com 36 equipes a semifinal teria uma equipe na
       * final sem jogar a semifinal — que é exatamente o que o dono vetou. */
      if (politica === 'sobra_unica') {
        var semiComTres = (x.ateFinalChave <= 2);
        if (semiComTres) { x.acao = 'repescagem'; reps++; }
        else { x.acao = 'bye'; folgas++; }
        return;
      }
      // O ÚLTIMO INSCRITO NUNCA GANHA FOLGA (regra do dono, jul/2026).
      //
      // O emparelhamento é adjacente e o tardio entra na PRÓXIMA POSIÇÃO LIVRE,
      // que é o fim da ordem — então, na 1ª rodada da chave principal, a SOBRA
      // de um N ímpar É o último inscrito. Dar folga ali é exatamente o que o
      // dono vetou: quem chegou por último avançava sem jogar enquanto quem se
      // inscreveu antes jogava. Agora ele joga a repescagem: entra em quadra
      // contra o perdedor do primeiro jogo da rodada.
      //
      // Motivo do dono: "aumenta as chances de todos sem prejudicar ninguém" —
      // ninguém perde jogo, e o repescado ganha uma vida a mais em vez de pular
      // a rodada.
      //
      // Só a 1ª rodada da PRINCIPAL é afetada. Da 2ª em diante (e em toda a
      // chave inferior) a sobra é alguém que JÁ jogou e venceu, não um recém-
      // chegado — ali a folga continua valendo, dentro do teto e nunca em
      // semifinal/final.
      var sobraEhOUltimoInscrito = (x.fase === 'VC' && x.rodada === 1);
      if (!sobraEhOUltimoInscrito && folgas < teto && x.ateFinalChave >= 3) { x.acao = 'bye'; folgas++; }
      else { x.acao = 'repescagem'; reps++; }
    });
    /* ⛔⛔ FOLGA NÃO É JOGO, e `jogos` nunca foi contagem de jogos — é contagem de POSIÇÕES da rodada.
     * Na repescagem as duas coisas coincidem (a sobra JOGA a repescagem), e por isso a diferença
     * passou anos sem aparecer. Na sobra única não coincidem: a rodada de 9 tem 4 jogos e uma folga,
     * e a planilha do dono conta 4. Eu contei 5 e a matriz acusou na primeira comparação.
     * ⇒ `jogosReais` é o número que vai para a tela e para a matriz; `jogos` continua sendo posição,
     * que é o que a montagem da chave usa (a folga OCUPA posição, senão o tardio entraria no lugar
     * dela). Os dois nomes existem porque as duas contas existem. */
    ordem.forEach(function (x) { x.jogosReais = x.jogos - (x.acao === 'bye' ? 1 : 0); });
    return {
      N: N, B: N, formato: formato, politica: politica,
      rodadasSup: t.totSup, rodadasInf: t.totInf,
      byes: folgas, repescagens: reps, tetoFolgas: teto,
      /* ⛔ No bye clássico quem espera NÃO é folga de rodada ímpar: é quem não foi ao play-in. São
       * duas contagens diferentes e misturá-las foi o erro que a matriz da planilha acusou. */
      esperamNoPlayin: (t.sup[0] && t.sup[0].playin) ? t.sup[0].esperam : 0,
      repR2: t.repR2,
      modo: (folgas && reps) ? 'misto' : (folgas ? 'bye' : (reps ? 'repescagem' : 'exata')),
      vagas: 0, pool: 0, menor: 0,
      rodadas: ordem
    };
  }

  // Ordem cronológica das rodadas: superior R1, inferior R1, superior R2, ...
  function _ordemRodadas(t) {
    var ordem = [];
    var maxK = Math.max(t.totSup, t.inf.length ? t.inf[t.inf.length - 1].aposSup : 0);
    for (var k = 1; k <= maxK; k++) {
      var s = t.sup.filter(function (x) { return x.rodada === k; })[0];
      if (s) ordem.push(s);
      var i = t.inf.filter(function (x) { return x.aposSup === k; })[0];
      if (i) ordem.push(i);
    }
    t.inf.forEach(function (x) { if (ordem.indexOf(x) < 0) ordem.push(x); });
    return ordem;
  }

  var S = function (seed) { return { tipo: 'seed', seed: seed }; };
  var V = function (id) { return { tipo: 'vencedor', de: id }; };
  var P = function (id) { return { tipo: 'perdedor', de: id }; };
  var R = function (id) { return { tipo: 'repescado', de: id }; };
  var VAZIO = { tipo: 'vazio' };

  /**
   * @param {number} N   participantes
   * @param {'simples'|'dupla'} formato
   * @returns {{plano, rodadas, jogos: Array, porId: Object, totalJogos: number, ordem: string[]}}
   */
  function chave(N, formato, politica) {
    formato = formato === 'dupla' ? 'dupla' : 'simples';
    var pl = plano(N, formato, politica);
    var rodadas = pl.rodadasSup;
    var jogos = [];
    var novo = function (o) { jogos.push(o); return o; };
    var seq = [];                       // ordem cronológica
    var VC = {}, PD = {}, gf = null;

    // Monta UMA rodada. `entrantes` são descritores de entrada (S/V) já na ordem
    // de posição. Emparelhamento ADJACENTE; a SOBRA (E ímpar) é o ÚLTIMO — é a
    // posição que o próximo inscrito ocuparia, então admitir um tardio apenas
    // completa esse jogo em vez de mexer nos confrontos já sorteados.
    // Devolve os jogos na ordem cronológica: normais primeiro, depois o da sobra
    // (que consome o perdedor do primeiro normal quando é repescagem).
    function montarRodada(fase, r, entrantes, acao) {
      var E = entrantes.length;
      var idDe = function (i) { return fase + '-R' + r + '-P' + (i + 1); };
      var lista = [], nNormais = Math.floor(E / 2);
      for (var i = 0; i < nNormais; i++) {
        lista.push(novo({
          id: idDe(i), fase: fase, rodada: r, pos: i + 1, tipo: 'normal',
          entradas: [entrantes[2 * i], entrantes[2 * i + 1]],
          perdedorDesce: (fase === 'VC')
        }));
      }
      if (E % 2 === 1) {
        var pos = nNormais, sobra = entrantes[E - 1];
        if (acao === 'bye' || nNormais === 0) {
          lista.push(novo({
            id: idDe(pos), fase: fase, rodada: r, pos: pos + 1, tipo: 'bye',
            entradas: [sobra, VAZIO], perdedorDesce: false
          }));
        } else {
          // repescagem: enfrenta o perdedor do PRIMEIRO jogo normal desta rodada
          // (extremo oposto da sobra, que está no fim — nunca é revanche).
          // A descida daquele perdedor é ADIADA: quem cai para a chave inferior
          // passa a ser o perdedor DESTE jogo.
          var src = lista[0];
          src.perdedorDesce = false;
          lista.push(novo({
            id: idDe(pos), fase: fase, rodada: r, pos: pos + 1, tipo: 'repescagem',
            entradas: [sobra, R(src.id)], perdedorDesce: (fase === 'VC'),
            origemRepescado: src.id
          }));
        }
      }
      seq.push.apply(seq, lista);
      return lista;
    }

    // Quem CAI de uma rodada da superior, na ordem: perdedores dos jogos que
    // realmente soltam perdedor (o jogo cuja derrota virou repescagem não solta;
    // quem solta no lugar dele é o próprio jogo de repescagem).
    function quedasDe(lista) {
      return lista.filter(function (m) { return m.perdedorDesce; })
        .map(function (m) { return P(m.id); });
    }

    var porRodada = {};
    pl.rodadas.forEach(function (x) { porRodada[x.fase + x.rodada] = x; });

    // ---------- percorre as rodadas na ordem cronológica ----------
    var vivosInf = [];          // descritores de entrada dos vivos na inferior
    // Quedas da superior que AINDA não entraram na inferior. Fila, não instantâneo:
    // uma rodada da superior pode soltar UM perdedor só (acontece desde a normalização
    // da R2, que adia a descida dos repescados) — e com 1 não se abre rodada na inferior
    // (`Ein < 2` na topologia). Esse perdedor tem de ESPERAR a próxima queda, não sumir.
    // Antes as quedas eram lidas só da rodada superior imediata (`quedasDe(VC[aposSup])`),
    // então quem caía numa rodada sem PD correspondente ficava ÓRFÃO — sem jogo na inferior
    // (pego pelo stress em N=5, 9, 17, 33 e pelo sweep de integração tardia).
    var quedasPendentes = [], repsParaR2 = [];
    pl.rodadas.forEach(function (x) {
      if (x.fase === 'VC') {
        var entrantes;
        if (x.rodada === 1) {
          entrantes = [];
          /* ⛔⛔ NO BYE CLÁSSICO A 1ª RODADA NÃO É DE TODOS — é o PLAY-IN, e só as últimas
           * `excesso*2` entram nela. As outras esperam e estreiam na rodada seguinte.
           * ⭐ ACHADO POR UM TESTE MEU, e é o tipo de defeito que o número de jogos esconde: a
           * topologia dizia 4 jogos na rodada de play-in e a montagem fazia 18, porque montava a 1ª
           * rodada com os N inscritos e recalculava o resto a partir dos vencedores. O `plano` estava
           * certo e a CHAVE era outra — duas verdades, que é o defeito que esta reforma persegue.
           * ⚠️ São as ÚLTIMAS posições, não as primeiras: é onde o tardio entra, e é a convenção do
           * resto do arquivo (quem chega por último joga a rodada extra). */
          var deTras = (x.playin === true) ? x.E : N;
          for (var s = N - deTras + 1; s <= N; s++) entrantes.push(S(s));
        } else {
          entrantes = VC[x.rodada - 1].map(function (m) { return V(m.id); });
          /* ⛔ E QUEM ESPEROU ESTREIA AQUI: as sementes que não foram ao play-in entram ANTES dos
           * vencedores dele. Pôr os vencedores no FIM é a mesma regra da normalização da 2ª rodada —
           * evita revanche imediata e preserva a posição de quem já estava. */
          if (x.rodada === 2 && porRodada['VC1'] && porRodada['VC1'].playin === true) {
            var esperaram = [];
            for (var e2 = 1; e2 <= N - porRodada['VC1'].E; e2++) esperaram.push(S(e2));
            entrantes = esperaram.concat(entrantes);
          }
          // Os repescados escolhidos na R1 entram no FIM da ordem da R2 — assim o
          // emparelhamento adjacente nunca dá revanche imediata (o vencedor do
          // jogo-fonte está no começo da lista).
          if (x.rodada === 2 && repsParaR2.length) entrantes = entrantes.concat(repsParaR2);
        }
        VC[x.rodada] = montarRodada('VC', x.rodada, entrantes, x.acao);
        // NORMALIZAÇÃO DA R2 — escolhida AQUI, logo após montar a R1 e ANTES de
        // empilhar as quedas. Fontes = os primeiros jogos normais que ainda soltam
        // perdedor; a descida deles é ADIADA (perdedorDesce=false), porque quem cai
        // para a inferior passa a ser o perdedor do jogo da R2. Marcar depois de
        // empilhar as quedas fazia a inferior receber gente que continua viva na
        // superior — a PD-R1 nascia com jogos a mais, de lados mortos (BYE x BYE).
        if (x.rodada === 1 && pl.repR2 > 0) {
          VC[1].filter(function (m) {
            return m.tipo === 'normal' && m.perdedorDesce !== false;
          }).slice(0, pl.repR2).forEach(function (f) {
            f.perdedorDesce = false;
            repsParaR2.push(R(f.id));
          });
        }
        // quedas em ordem invertida — anti-revanche (quem acabou de cair não
        // reencontra de imediato quem o derrotou)
        quedasPendentes = quedasPendentes.concat(quedasDe(VC[x.rodada]).reverse());
      } else {
        // inferior: intercala os vivos da chave inferior com quem acabou de cair
        // da superior (quedas em ordem invertida — anti-revanche), para que o
        // emparelhamento adjacente case sobrevivente × recém-caído.
        var caem = quedasPendentes; quedasPendentes = [];
        var ent = [], a = vivosInf, b = caem, n = Math.max(a.length, b.length);
        for (var i = 0; i < n; i++) { if (a[i]) ent.push(a[i]); if (b[i]) ent.push(b[i]); }
        PD[x.rodada] = montarRodada('PD', x.rodada, ent, x.acao);
        vivosInf = PD[x.rodada].map(function (m) { return V(m.id); });
      }
    });

    // ---------- grande final ----------
    if (formato === 'dupla' && pl.rodadasInf >= 1 && rodadas >= 1) {
      var champSup = VC[rodadas][VC[rodadas].length - 1];
      var champInf = PD[pl.rodadasInf][PD[pl.rodadasInf].length - 1];
      if (champSup && champInf) {
        gf = novo({
          id: 'GF', fase: 'GF', rodada: 1, pos: 1, tipo: 'normal',
          entradas: [V(champSup.id), V(champInf.id)], perdedorDesce: false
        });
        seq.push(gf);
        novo({
          id: 'GF-EXTRA', fase: 'GF', rodada: 2, pos: 1, tipo: 'extra',
          condicional: true, entradas: [V('GF'), P('GF')], perdedorDesce: false
        });
      }
    }

    // ---------- Resolução de byes + numeração (DERIVADA, nunca persistida) ----------
    var porId = {};
    jogos.forEach(function (j) { porId[j.id] = j; });
    var real = {}; // id -> {vencedor:{vivo,rotulo}, perdedor, perdedorBruto}

    var resolver = function (e) {
      if (e.tipo === 'vazio') return { vivo: false, rotulo: 'BYE' };
      if (e.tipo === 'seed') return e.seed <= N
        ? { vivo: true, rotulo: '#' + e.seed } : { vivo: false, rotulo: 'BYE' };
      var f = real[e.de];
      if (e.tipo === 'vencedor') return f.vencedor;
      if (e.tipo === 'repescado') return { vivo: f.perdedorBruto.vivo, rotulo: f.perdedorBruto.rotulo + ' rep' };
      return porId[e.de].perdedorDesce === false
        ? { vivo: false, rotulo: 'BYE' } : f.perdedor;
    };

    var n = 0;
    seq.forEach(function (j) {
      var res = j.entradas.map(resolver);
      var a = res[0], b = res[1];
      j.rotulos = [a.rotulo, b.rotulo];
      if (!a.vivo && !b.vivo) {
        j.disputado = false;
        real[j.id] = { vencedor: { vivo: false, rotulo: 'BYE' }, perdedor: { vivo: false, rotulo: 'BYE' }, perdedorBruto: { vivo: false, rotulo: 'BYE' } };
      } else if (!a.vivo || !b.vivo) {
        j.disputado = false; j.avancaDireto = a.vivo ? a : b;
        real[j.id] = { vencedor: a.vivo ? a : b, perdedor: { vivo: false, rotulo: 'BYE' }, perdedorBruto: { vivo: false, rotulo: 'BYE' } };
      } else {
        j.disputado = true; j.numero = ++n;
        real[j.id] = {
          vencedor: { vivo: true, rotulo: 'V' + n },
          perdedor: { vivo: true, rotulo: 'P' + n },
          perdedorBruto: { vivo: true, rotulo: 'P' + n }
        };
      }
    });
    if (porId['GF-EXTRA']) { porId['GF-EXTRA'].numero = n + 1; porId['GF-EXTRA'].disputado = null; }

    return {
      plano: pl, rodadas: rodadas, jogos: jogos, porId: porId, totalJogos: n,
      ordem: seq.map(function (j) { return j.id; })
    };
  }

  /**
   * Uma inscrição tardia só pode redesenhar enquanto NADA foi jogado.
   * Depois do 1º resultado a chave está congelada: byes já foram consumidos
   * e posições já viraram fato. Só restam 2 saídas — lista de espera, ou
   * refazer descartando os resultados. NÃO existe terceira.
   */
  function podeRedesenhar(resultados) {
    var lancados = Object.keys(resultados || {}).length;
    return lancados === 0
      ? { ok: true }
      : { ok: false, motivo: lancados + ' resultado(s) lancado(s)', opcoes: ['lista_de_espera', 'refazer_descartando_resultados'] };
  }

  /* ======================================================================
   * ADMISSÃO INCREMENTAL DE TARDIOS
   * O sorteio (equipe -> posição) é IMUTÁVEL. Tardio entra na PRÓXIMA posição
   * livre; ninguém é deslocado, nada é resorteado.
   *
   * Propriedade verificada em toda a faixa: enquanto B não muda, os jogos
   * normais da R1 são ANINHADOS — um par (a,b) é real quando a<=N e b<=N, e
   * aumentar N nunca torna um par falso. Cada tardio cria exatamente 1 jogo
   * normal novo (contra a posição B-N) e não toca em confronto existente.
   *
   * Duas exceções, ambas inevitáveis:
   *  1. Repescagens são camada derivada — podem ser criadas/destruídas a cada
   *     tardio. INOFENSIVO: repescagem só é jogável depois dos jogos normais
   *     da R1, então enquanto há admissão nenhuma foi disputada. NÃO avise o
   *     organizador, NÃO peça confirmação.
   *  2. Cruzar potência de 2 redesenha TUDO. De 16 p/ 17 os 8 confrontos são
   *     perdidos e não há conserto — com 17 inscritos só 1 pode ser eliminado
   *     na R1, logo só cabe 1 jogo. EXIJA confirmação explícita (avisoPotencia2).
   * ==================================================================== */

  /** Sorteio inicial. Chamar UMA vez. Semente guardada para auditoria. */
  function sortear(equipes, opts) {
    opts = opts || {};
    var aleatorio = opts.aleatorio !== false;
    var semente = opts.semente != null ? opts.semente : Date.now();
    var participantes = equipes.slice();
    if (aleatorio) {
      var s = semente >>> 0;
      var rnd = function () {
        s = (s + 0x6d2b79f5) | 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      for (var i = participantes.length - 1; i > 0; i--) {
        var j = Math.floor(rnd() * (i + 1));
        var tmp = participantes[i]; participantes[i] = participantes[j]; participantes[j] = tmp;
      }
    }
    return { participantes: participantes, semente: semente, sorteadoEm: new Date().toISOString() };
  }

  /** Admite tardios no FIM da ordem. Nunca desloca quem já estava. */
  function admitir(sorteio) {
    var tardios = Array.prototype.slice.call(arguments, 1);
    return Object.assign({}, sorteio, { participantes: sorteio.participantes.concat(tardios) });
  }

  var assinatura = function (j) {
    return j.tipo + ':' + j.entradas.map(function (e) {
      return e.tipo === 'seed' ? '#' + e.seed : e.tipo === 'vazio' ? '-' : e.tipo + '(' + e.de + ')';
    }).join(' x ');
  };

  /** O que muda na R1 ao passar de nAntes para nDepois participantes. */
  function delta(nAntes, nDepois, formato) {
    formato = formato || 'simples';
    var r1 = function (N) {
      var o = {};
      chave(N, formato).jogos
        .filter(function (j) { return j.fase === 'VC' && j.rodada === 1; })
        .forEach(function (j) { o[j.id] = assinatura(j); });
      return o;
    };
    var a = nAntes >= 2 ? r1(nAntes) : {};
    var b = r1(nDepois);
    // A chave não é mais inflada até potência de 2, então NÃO existe mais o
    // "cruzar B" que redesenhava tudo. Com emparelhamento adjacente, crescer N
    // acrescenta um jogo no fim e preserva todos os confrontos anteriores.
    var out = { redesenhoTotal: false, criados: [], destruidos: [], preservados: [] };
    var ids = {};
    Object.keys(a).forEach(function (k) { ids[k] = 1; });
    Object.keys(b).forEach(function (k) { ids[k] = 1; });
    Object.keys(ids).forEach(function (id) {
      if (a[id] === b[id]) { if (a[id]) out.preservados.push(id); return; }
      if (a[id] && a[id].indexOf('bye') !== 0) out.destruidos.push({ id: id, era: a[id] });
      if (b[id] && b[id].indexOf('bye') !== 0) out.criados.push({ id: id, agora: b[id] });
    });
    return out;
  }

  /**
   * Antes existia um ponto de ruptura: com a chave cheia (N = potência de 2), o
   * próximo inscrito dobrava B e redesenhava todos os confrontos — e o organizador
   * tinha de confirmar. Isso ACABOU: a chave não é mais inflada, e o emparelhamento
   * adjacente faz o inscrito seguinte apenas completar o último jogo ou criar um
   * novo no fim. Nenhum confronto já sorteado se perde, em nenhum N.
   *
   * A função permanece na API porque a UI a consulta antes de admitir tardios;
   * agora ela nunca alerta. `vagasAteDobrar` fica 0: não há mais o que "dobrar".
   */
  function avisoPotencia2(N) {
    var p = plano(N);
    return {
      alerta: false, vagasAteDobrar: 0,
      mensagem: 'A próxima inscrição entra sem redesenhar a chave: ' +
        (N % 2 === 1 ? 'completa o jogo que hoje está com folga ou repescagem.'
                     : 'cria um jogo novo no fim da primeira rodada.'),
      folgas: p.byes, repescagens: p.repescagens
    };
  }

  var api = {
    plano: plano,
    chave: chave,
    podeRedesenhar: podeRedesenhar,
    sortear: sortear,
    admitir: admitir,
    delta: delta,
    avisoPotencia2: avisoPotencia2
  };
  // Dual-mode: browser (<script> → window) e Node (require direto, como
  // phases-engine.js já faz). Sem isto, um teste que dá require() no
  // phases-engine sem o sandbox não encontra o motor.
  if (typeof window !== 'undefined') window._chaves = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
