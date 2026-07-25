/* chaves-adapter.js — traduz o desenho puro de chaves.js para os objetos de match
 * que o app JÁ renderiza (bracket.js, dashboard, W.O., placar ao vivo, standings).
 *
 * POR QUE UM ADAPTER, e não trocar o app inteiro:
 * ~110 pontos em 30 arquivos leem t.matches[]. Derivar tudo no render seria mexer
 * nos 110 de uma vez. O que conserta o bug do torneio de casais NÃO é "não
 * persistir" — é o ID SER DERIVÁVEL. Com id estrutural (VC-R1-P3), recalcular a
 * chave inteira reproduz os mesmos ids e os resultados (que moram em
 * tournaments/{id}/results/{matchId}) se re-ancoram sozinhos. O renderer não
 * percebe diferença; só a CUNHAGEM do id muda.
 *
 * A INVERSÃO: chaves.js declara de onde cada slot VEM (`entradas`); o app declara
 * pra onde cada resultado VAI (`nextMatchId`). Uma é o grafo reverso da outra —
 * esta função faz a inversão das arestas.
 *
 *   entradas[k].tipo        →  aresta gravada na ORIGEM
 *   ─────────────────────────────────────────────────────────────
 *   'seed'                  →  slot preenchido com o participante (ou BYE)
 *   'vazio'                 →  slot BYE (isBye)
 *   'vencedor'  de X        →  X.nextMatchId = este.id,      X.nextSlot = p1|p2
 *   'perdedor'  de X        →  X.loserMatchId = este.id,     X.loserSlot = p1|p2
 *                              (queda pra chave inferior; _advanceWinner só
 *                               dispara isto quando format === 'Dupla Eliminatória')
 *   'repescado' de X        →  X.loserNextMatchId = este.id, X.loserNextSlot = p1|p2
 *                              (rota genérica, NÃO guardada por formato — serve
 *                               também na Eliminatória Simples. Em chaves.js o
 *                               jogo de origem tem perdedorDesce=false, então o
 *                               perdedor vai só pra cá: nunca há double-book.)
 *
 * O NÚMERO DO JOGO NÃO É GRAVADO AQUI. Continua sendo carimbado no render por
 * _assignGlobalGameNumbers (bracket.js) — que já é a fonte única.
 */
(function () {
  'use strict';

  // Resolve o motor tanto no browser (window) quanto em Node (require direto).
  function _resolveChaves() {
    if (typeof window !== 'undefined' && window._chaves) return window._chaves;
    if (typeof require === 'function') { try { return require('./chaves.js'); } catch (e) {} }
    return null;
  }

  // Resolvido A CADA build, nunca no load do módulo. O rótulo é IDENTIDADE DE
  // SLOT (`_autoResolveBye` compara por igualdade), então capturar no load
  // congelava o valor de antes do i18n subir — ou o do idioma anterior a uma
  // troca — e a folga deixava de casar, parando de auto-avançar em silêncio.
  function _byeLabel() {
    return (typeof _t === 'function') ? _t('bui.byeLabel') : 'BYE (Avança Direto)';
  }

  // fase do desenho -> bracket que o app entende.
  // `bracketKey` sobrescreve o destino da chave PRINCIPAL na Eliminatória Simples:
  // numa fase com 2+ linhas (ex.: Ouro/Prata) cada linha é uma chave própria com
  // key 'upper'/'lower'. Na Dupla os nomes são estruturais e não se sobrescreve.
  function _bracketOf(fase, formato, bracketKey) {
    if (formato === 'dupla') {
      if (fase === 'PD') return 'lower';
      if (fase === 'GF') return 'grand';
      return 'upper';
    }
    return bracketKey || 'main';
  }

  function _slotName(k) { return k === 0 ? 'p1' : 'p2'; }

  /**
   * Monta os matches do app a partir de (N, formato).
   *
   * @param {number} N            número de participantes/duplas
   * @param {'simples'|'dupla'} formato
   * @param {Object} opts
   *   @param {Array}  opts.participantes  ordem IMUTÁVEL do sorteio; índice = seed-1.
   *                                       Cada item: {displayName, uid?, uids?, ...}
   *   @param {number} opts.phaseIndex     carimbo de fase (default 0)
   *   @param {string} opts.category       categoria (opcional)
   *   @param {boolean} opts.tierThird     gerar disputa de 3º/4º (default false)
   * @returns {{matches: Array, meta: Object}}
   */
  function build(N, formato, opts) {
    opts = opts || {};
    formato = formato === 'dupla' ? 'dupla' : 'simples';
    var parts = opts.participantes || [];
    var C = _resolveChaves();
    if (!C) throw new Error('chaves-adapter: window._chaves não carregado');
    if (N < 2) return { matches: [], meta: { N: N, formato: formato, vazio: true } };

    var desenho = C.chave(N, formato);
    // Namespace determinístico (fase + categoria). Sem ele, a fase 0 e a fase 1 —
    // ou duas categorias — teriam, cada uma, um jogo chamado 'VC-R1-P1', e
    // _findMatch acharia o errado. NUNCA pode conter timestamp: o id precisa
    // continuar derivável de (fase, categoria, N, formato).
    var ns = opts.ns ? (String(opts.ns) + '-') : '';
    var byId = {};   // id ESTRUTURAL CRU (sem ns) -> match do app
    var matches = [];

    // 1ª passada: cria os matches vazios, na ORDEM CRONOLÓGICA do desenho
    // (a ordem importa: repescagem depois dos jogos normais da R1, porque
    //  a repescagem consome o perdedor de um jogo normal).
    desenho.ordem.forEach(function (id) {
      var j = desenho.porId[id];
      var m = {
        id: ns + j.id,                              // ← ESTRUTURAL. É esta a correção.
        round: j.rodada,
        bracket: _bracketOf(j.fase, formato, opts.bracketKey),
        p1: 'TBD', p2: 'TBD', winner: null,
        phaseIndex: opts.phaseIndex || 0
      };
      if (opts.category != null) m.category = opts.category;
      if (j.tipo === 'repescagem') m.isRepechageSlot = true;
      if (j.id === 'GF-EXTRA') { m.isExtra = true; m.condicional = true; }
      // ASSINATURA ESTRUTURAL — o que torna a reconciliação segura.
      // Inclui o TAMANHO DA CHAVE (B) de propósito: ao cruzar potência de 2 o id
      // `VC-R1-P2` SOBREVIVE mas deixa de ser #8x#9 e vira #16x#17; e jogos de
      // rodadas seguintes têm entradas textualmente idênticas em oitavas
      // diferentes (`vencedor(VC-R1-P1) x vencedor(VC-R1-P2)`). Sem o B, um
      // placar seria recolado num confronto DIFERENTE em silêncio — exatamente
      // o pior caso descrito no spec. Bug pego pelo playout 16->17.
      m._sig = desenho.plano.B + '|' + j.tipo + ':' + j.entradas.map(function (e) {
        return e.tipo === 'seed' ? '#' + e.seed
          : e.tipo === 'vazio' ? '-'
            : e.tipo + '(' + e.de + ')';
      }).join(' x ');
      byId[j.id] = m;
      matches.push(m);
    });

    // 2ª passada: INVERTE as arestas — cada `entrada` vira ponteiro gravado na ORIGEM.
    desenho.ordem.forEach(function (id) {
      var j = desenho.porId[id];
      var m = byId[id];
      j.entradas.forEach(function (e, k) {
        var slot = _slotName(k);

        // SLOT MORTO — checagem ÚNICA e universal. chaves.js já resolveu a chave
        // inteira e publicou o veredito em `rotulos`: 'BYE' significa "aqui não
        // chega ninguém". Isso cobre de uma vez os quatro casos que eu vinha
        // tratando à mão (e errando): seed acima de N, entrada vazia, jogo de
        // origem cuja derrota foi ANULADA por repescagem (perdedorDesce=false),
        // e jogo de origem que ele próprio já está morto — este último CASCATEIA
        // sozinho, porque o veredito de chaves.js é calculado em ordem
        // cronológica. Sem isso, um jogo da inferior com os dois lados mortos
        // travava a cadeia e a grande final nunca enchia (pego pelo playout em
        // dupla N=5, 9, 10, 11, 17..23 — todos os N com repescagem).
        if (j.rotulos && j.rotulos[k] === 'BYE') {
          m[slot] = _byeLabel(); m.isBye = true;
          return;
        }

        if (e.tipo === 'seed') {
          var p = parts[e.seed - 1];
          m[slot] = p ? (p.displayName || p.name || String(p)) : ('#' + e.seed);
          m[slot + 'Seed'] = e.seed;
          var _setSlot = (typeof window !== 'undefined') && window._setSlot;
          if (p && typeof _setSlot === 'function') {
            var uids = p.uids || (p.uid ? [p.uid] : []);
            _setSlot(m, slot, uids, p);
          } else if (p) {
            m[slot === 'p1' ? 'team1Obj' : 'team2Obj'] = p;
          }
          return;
        }

        var origem = byId[e.de];
        if (!origem) return;
        if (e.tipo === 'vencedor') {
          origem.nextMatchId = m.id; origem.nextSlot = slot;
        } else if (e.tipo === 'perdedor') {
          origem.loserMatchId = m.id; origem.loserSlot = slot;
        } else if (e.tipo === 'repescado') {
          // derrota anulada: o perdedor de `origem` NÃO desce, vem pra cá.
          origem.loserNextMatchId = m.id; origem.loserNextSlot = slot;
          m.isRepechageSlot = true;
          m[slot + 'FromRepechage'] = true;
        }
      });
    });

    // ---------- Disputa de 3º/4º (só Eliminatória Simples) ----------
    // chaves.js não desenha este jogo: ele não faz parte da árvore (não alimenta
    // ninguém). Aqui os dois perdedores das SEMIFINAIS são roteados pra ele.
    // Na Dupla Eliminatória NÃO existe: o 3º sai naturalmente como perdedor do
    // último jogo da chave inferior, sem partida extra.
    if (opts.tierThird && formato !== 'dupla' && desenho.rodadas >= 2) {
      var rSemi = desenho.rodadas - 1;
      var semis = desenho.ordem
        .map(function (id) { return desenho.porId[id]; })
        .filter(function (j) { return j.fase === 'VC' && j.rodada === rSemi; });
      if (semis.length === 2) {
        var terceiro = {
          id: ns + '3P',                 // id ESTRUTURAL, como todos os outros
          round: desenho.rodadas, bracket: _bracketOf('VC', formato, opts.bracketKey),
          isThirdPlace: true, p1: 'TBD', p2: 'TBD', winner: null,
          phaseIndex: opts.phaseIndex || 0,
          _sig: desenho.plano.B + '|terceiro:' + semis[0].id + ' x ' + semis[1].id
        };
        if (opts.category != null) terceiro.category = opts.category;
        // Só roteia o perdedor de semifinal REALMENTE disputada — semifinal
        // decidida por BYE não produz perdedor (o slot ficaria preso em 'TBD').
        var vivos = 0;
        [0, 1].forEach(function (k) {
          var s = byId[semis[k].id];
          if (!s || !semis[k].disputado) return;
          s.loserNextMatchId = terceiro.id;
          s.loserNextSlot = _slotName(k);
          vivos++;
        });
        if (vivos === 2) { byId['3P'] = terceiro; matches.push(terceiro); }
      }
    }

    // ---------- BYE auto-avança JÁ NO SORTEIO ----------
    // Folga é estrutural: quem não tem adversário na R1 já está na R2 no instante em
    // que a chave sai. Sem isto o bracket nascia com o slot seguinte em 'TBD' e a
    // pessoa parecia fora do torneio até alguém jogar (e a classificação saía com
    // buraco). `_autoResolveBye` é o mesmo helper que o app usa em jogo — idempotente,
    // e a resolução CASCATEIA porque `matches` já está em ordem cronológica.
    var _autoBye = (typeof window !== 'undefined') && window._autoResolveBye;
    if (typeof _autoBye === 'function') {
      var tBye = {
        id: opts.tournamentId || '_build',
        format: (formato === 'dupla') ? 'Dupla Eliminatória' : 'Eliminatórias Simples',
        matches: matches
      };
      matches.forEach(function (m) { try { _autoBye(tBye, m); } catch (e) {} });
    }

    return {
      matches: matches,
      meta: {
        N: N, formato: formato,
        plano: desenho.plano,
        rodadas: desenho.rodadas,
        totalJogos: desenho.totalJogos,
        // dupla com menos de 2 rodadas (N=2) NÃO tem chave inferior nem grande
        // final — o desenho não as cria. Apontar pra 'GF' inexistente deixava o
        // torneio "sem campeão" (pego pelo playout).
        finalId: ns + (desenho.porId['GF'] ? 'GF' : ('VC-R' + desenho.rodadas + '-P1'))
      }
    };
  }

  /**
   * RECÁLCULO com preservação de estado. É isto que substitui as ~1.250 linhas de
   * cirurgia: em vez de operar o grafo vivo, redesenha do zero e re-ancora por id.
   *
   * Como os ids são estruturais, o jogo `VC-R1-P3` de antes e o de depois SÃO o
   * mesmo jogo — então o estado mutável (resultado, quadra, horário, presença,
   * grupo de WhatsApp) volta pro lugar sem nenhuma inferência.
   *
   * @param {Array} antigos  matches atuais (com resultado/estado)
   * @param {Array} novos    matches recém-desenhados (limpos)
   * @returns {{matches: Array, preservados: number, perdidos: Array}}
   */
  var CAMPOS_PRESERVADOS = [
    // resultado
    'winner', 'winnerUid', 'winnerUids', 'draw', 'scoreP1', 'scoreP2', 'sets',
    'setsWonP1', 'setsWonP2', 'totalGamesP1', 'totalGamesP2', 'fixedSet',
    'resultAt', 'startedAt', 'liveScored', 'pendingResult',
    // W.O.
    'wo', 'woAbsent', 'woAbsentSide',
    // logística
    'court', 'schedule', 'waGroupUrl', 'waGroupId',
    'presenceP1', 'presenceP2'
  ];

  /**
   * CHAVE INFERIOR sobre uma superior QUALQUER (usado só pelo crescimento).
   *
   * `chave(N,'dupla')` sabe construir a inferior, mas só para uma superior semeada
   * em potência de 2. No crescimento a superior tem uma R1 CONGELADA com K jogos
   * reais — forma que não existe no vocabulário do motor (ele semeia em B e usa
   * folga). Daí este construtor: ele deriva a inferior da FORMA da superior, não
   * de N.
   *
   * Algoritmo clássico da dupla eliminatória — consolidação e descida alternadas:
   *   sobreviventes := perdedores da rodada 1 da superior
   *   para cada rodada r ≥ 2 da superior:
   *     enquanto sobreviventes > quedas(r):  emparelha sobreviventes entre si
   *     emparelha sobreviventes × quedas(r)   ← a "descida"
   *   no fim sobra 1: o campeão da inferior, que vai pra grande final.
   *
   * Duas propriedades que precisam sair de graça, e é por isso que o pareamento
   * inverte um dos lados (`quedas[len-1-i]`):
   *   • quem cai da superior não reencontra IMEDIATAMENTE quem o derrotou;
   *   • ímpar recebe folga (avança), nunca fica sem jogo.
   *
   * @param {Array<Array<{id, produzPerdedor}>>} rodadasSup  superior em ordem
   * @returns {{rodadas: Array<Array<{id, entradas}>>, campeaoDe: string|null}}
   */
  function _inferiorDaSuperior(rodadasSup) {
    var rodadas = [], nL = 0;
    var quedasDe = function (r) {
      return (rodadasSup[r] || []).filter(function (g) { return g.produzPerdedor; })
        .map(function (g) { return { tipo: 'perdedor', de: g.id }; });
    };
    var sobrev = quedasDe(0);
    if (!sobrev.length) return { rodadas: [], campeaoDe: null };

    var emitir = function (pares) {
      nL++;
      var jogos = pares.map(function (par, i) {
        return { id: 'PD-R' + nL + '-P' + (i + 1), rodada: nL, entradas: par };
      });
      rodadas.push(jogos);
      return jogos.map(function (j) { return { tipo: 'vencedor', de: j.id }; });
    };
    // Emparelha uma lista consigo mesma. Ímpar: o último passa direto (folga) —
    // devolvido COMO ESTÁ, sem criar jogo, senão nasceria um jogo com um lado morto.
    var consolidar = function (lista) {
      var pares = [], i = 0;
      for (; i + 1 < lista.length; i += 2) pares.push([lista[i], lista[i + 1]]);
      var sobra = (i < lista.length) ? [lista[i]] : [];
      if (!pares.length) return lista;
      return emitir(pares).concat(sobra);
    };

    for (var r = 1; r < rodadasSup.length; r++) {
      var quedas = quedasDe(r);
      if (!quedas.length) continue;                 // rodada só de folga: nada cai
      var guard = 0;
      while (sobrev.length > quedas.length && guard++ < 32) sobrev = consolidar(sobrev);
      // descida: sobrevivente × quem caiu, com as quedas INVERTIDAS (anti-revanche —
      // quem acabou de cair não reencontra de imediato quem o derrotou).
      //
      // A inversão é aplicada UMA VEZ, na lista, e não no índice. Com `quedas[len-1-i]`
      // eu consumia pelo FIM mas calculava a sobra com `slice(n)` (pelo COMEÇO): a mesma
      // queda entrava no par E na sobra, e outra ficava órfã — o jogo da inferior nascia
      // com um lado que ninguém alimentava e a chave parava antes da grande final.
      var qrev = quedas.slice().reverse();
      var n = Math.min(sobrev.length, qrev.length);
      var pares = [];
      for (var i = 0; i < n; i++) pares.push([sobrev[i], qrev[i]]);
      // quem sobrar dos dois lados (contagens desiguais por causa de folga) passa direto
      var resto = sobrev.slice(n).concat(qrev.slice(n));
      sobrev = emitir(pares).concat(resto);
    }
    var guard2 = 0;
    while (sobrev.length > 1 && guard2++ < 32) sobrev = consolidar(sobrev);
    return { rodadas: rodadas, campeaoDe: sobrev.length === 1 ? sobrev[0] : null };
  }

  function reconciliar(antigos, novos) {
    var antigoPorId = {};
    (antigos || []).forEach(function (m) { if (m && m.id) antigoPorId[String(m.id)] = m; });
    var preservados = 0;
    var vistos = {};

    (novos || []).forEach(function (novo) {
      var velho = antigoPorId[String(novo.id)];
      if (!velho) return;
      // O id sobreviver NÃO basta: só é o MESMO jogo se a assinatura estrutural
      // bater. Ao cruzar potência de 2 o id persiste com outro confronto — colar
      // o placar ali seria corrupção silenciosa.
      if (velho._sig && novo._sig && velho._sig !== novo._sig) return;
      vistos[String(novo.id)] = true;
      var tocou = false;
      CAMPOS_PRESERVADOS.forEach(function (campo) {
        if (velho[campo] !== undefined && velho[campo] !== null) {
          novo[campo] = velho[campo];
          tocou = true;
        }
      });
      if (tocou) preservados++;
    });

    // Jogos que existiam e sumiram. Devolvidos pra que o chamador avise o organizador
    // em vez de engolir em silêncio — engolir em silêncio foi exatamente o bug da 1.5.x.
    //
    // SÓ CONTA JOGO REALMENTE DISPUTADO. `winner` sozinho NÃO basta: um BYE é
    // auto-resolvido por _autoResolveBye e recebe `winner` sem nunca ter sido jogado.
    // Como bye é camada DERIVADA (recalcula a cada tardio), contá-lo como resultado
    // fazia o recálculo ser recusado sempre que uma folga virava jogo real no N
    // seguinte — bloqueando a entrada tardia justamente nos casos normais.
    // Mesmo critério de window._matchHasRealPlay (store.js).
    var perdidos = [];
    Object.keys(antigoPorId).forEach(function (id) {
      if (vistos[id]) return;
      var m = antigoPorId[id];
      if (m.isBye) return;                       // folga não é jogo
      var jogouDeVerdade = m.resultAt != null || m.startedAt != null || m.liveScored ||
        m.scoreP1 != null || m.scoreP2 != null ||
        (Array.isArray(m.sets) && m.sets.length) ||
        m.pendingResult != null || m.wo != null;
      if (jogouDeVerdade) perdidos.push({ id: id, p1: m.p1, p2: m.p2, winner: m.winner });
    });

    return { matches: novos, preservados: preservados, perdidos: perdidos };
  }

  /**
   * ENTRADA TARDIA = append + RECALCULAR. Substitui a cirurgia incremental
   * (~1.250 linhas: _placeLateEntriesSurgically, _syncLowerBracket,
   * _integrateLateDuplas com cascata Tier 1/2/3, _createExtraGamesFromWaitlist,
   * _ensureLowerLandingForLate, _repropagateDecided, _dedupMatchesByUid, a lógica
   * de "porta" superior→inferior…). Nada disso é necessário quando o id é
   * estrutural: redesenha do zero e os resultados voltam sozinhos pro lugar.
   *
   * A REGRA DE SEGURANÇA é mais fina que "congela no 1º placar": o motor garante
   * que, enquanto a chave não DOBRA de tamanho, nenhum confronto já existente se
   * move. Então recalcular com jogos já disputados é seguro — desde que nenhum
   * jogo COM ESTADO perca o lugar. Se perder (só acontece ao cruzar potência de
   * 2), não aplicamos nada e devolvemos o veredito pro organizador decidir:
   * lista de espera, ou refazer descartando. Nunca aplica pela metade.
   *
   * @param {Array} matchesAtuais  a chave como está (com resultados)
   * @param {number} N             nº de participantes DEPOIS do tardio
   * @param {'simples'|'dupla'} formato
   * @param {Object} opts          mesmo shape de build() (participantes, ns, …)
   * @returns {{ok:boolean, motivo?:string, matches?:Array, preservados?:number,
   *            perdidos?:Array, criados?:number, cruzouPotencia2?:boolean}}
   */
  /* ======================================================================
   * CRESCIMENTO A PARTIR DE PREFIXO CONGELADO
   *
   * Regra do dono (25/jul/2026), pra chave em potência de 2 EXATA — cheia, sem
   * folga sobrando: _"avisa na 9a que precisa da 10a, mas nao mexe nos outros
   * jogos. só cria jogo entre 9 e 10"_. Vale pra família toda: 9/10, 17/18, 33/34.
   *
   * POR QUE O RECÁLCULO NORMAL NÃO RESOLVE: `chave(N)` é função PURA de N e não
   * sabe o que já foi publicado. `chave(10)` devolve #8x#9 e #7x#10 e transforma
   * os 4 confrontos de `chave(8)` em folga. E não existe semeadura que preserve:
   * em B=16 o par do seed i é 2B+1−i, que simplesmente não existe. Por isso este
   * caminho é OUTRO — não é uma variação do recálculo.
   *
   * COMO: a R1 publicada é CONGELADA (os objetos de match são reaproveitados
   * inteiros, não reconstruídos — é isso que mantém id, `_sig` e resultado
   * intactos). Os tardios entram AOS PARES, cada par num jogo NOVO no fim da R1.
   * Aí o downstream inteiro é redesenhado como `chave(K)` sobre os K vencedores
   * da R1 composta, com as rodadas deslocadas +1 — o que mantém os ids no mesmo
   * formato estrutural (`VC-R2-P1`…) e deriváveis de (K, formato).
   *
   * Consequência aceita: a chave GANHA UMA RODADA. Com 8 publicados + 9ª e 10ª,
   * são 5 classificados e 5 não cabe em 4 vagas — alguém tem que jogar a mais.
   * É o preço de não mexer no que já foi publicado, e é o que o dono escolheu.
   *
   * DUAS RECUSAS, ambas explícitas (nunca silenciosas):
   *  • número ÍMPAR de tardios → sobra 1 sem par: entra `q` pares e o ímpar fica
   *    na espera com motivo 'falta-par'. É o "avisa que precisa da 10ª".
   *  • downstream JÁ JOGADO → o downstream é redesenhado, então um resultado de
   *    rodada 2+ seria órfão. Aí não cresce: 'downstream-ja-jogado'.
   *
   * @returns {{ok, matches?, criados?, entraram?, sobrando?, motivo?}}
   * ==================================================================== */
  function _ehMainOuUpper(m) { return !!m && (m.bracket === 'main' || m.bracket === 'upper'); }

  function crescerComPrefixo(matchesAtuais, novosParts, formato, opts) {
    opts = opts || {};
    formato = formato === 'dupla' ? 'dupla' : 'simples';
    var C = _resolveChaves();
    if (!C) throw new Error('chaves-adapter: window._chaves não carregado');
    var atuais = matchesAtuais || [];
    var ns = opts.ns ? (String(opts.ns) + '-') : '';

    // ── 1. prefixo congelado: a R1 publicada, na ordem posicional ──
    var r1 = atuais.filter(function (m) { return _ehMainOuUpper(m) && m.round === 1; })
      .slice().sort(function (a, b) {
        var pa = parseInt(String(a.id).replace(/.*-P/, ''), 10) || 0;
        var pb = parseInt(String(b.id).replace(/.*-P/, ''), 10) || 0;
        return pa - pb;
      });
    if (!r1.length) return { ok: false, motivo: 'sem-r1' };

    // PRÉ-CONDIÇÃO: a R1 congelada tem que estar CHEIA (todo jogo com os dois lados
    // reais). É exatamente o caso pro qual isto existe — a chave em potência de 2
    // exata, sem vaga. Com folga ou repescagem na R1 o mapeamento não fecha: nem todo
    // jogo produz vencedor E perdedor, e as contagens da inferior deixam de casar,
    // gerando slot que ninguém alimenta. Em vez de emitir chave inválida, recusa — e
    // quem chama já trata recusa avisando o organizador. Base com folga é justamente
    // onde o recálculo NORMAL funciona, então na prática quase nunca chega aqui.
    var _lbl0 = _byeLabel();
    var _slotVivo = function (v) { return !!v && v !== 'TBD' && v !== _lbl0 && !/a definir/i.test(String(v)); };
    if (!r1.every(function (m) { return !m.isBye && _slotVivo(m.p1) && _slotVivo(m.p2); })) {
      return { ok: false, motivo: 'prefixo-com-folga' };
    }

    // ── 2. o downstream vai ser redesenhado: ele não pode ter sido jogado ──
    var jogouDownstream = atuais.some(function (m) {
      if (!m || m.round === 1 || !_ehMainOuUpper(m)) return false;
      return m.resultAt != null || m.startedAt != null || m.liveScored ||
        m.scoreP1 != null || m.scoreP2 != null ||
        (Array.isArray(m.sets) && m.sets.length) || m.pendingResult != null || m.wo != null;
    });
    if (jogouDownstream) return { ok: false, motivo: 'downstream-ja-jogado' };

    // ── 3. tardios entram AOS PARES ──
    var entram = (novosParts || []).slice();
    var q = Math.floor(entram.length / 2);
    if (q < 1) {
      return { ok: false, motivo: 'falta-par', sobrando: entram.length };
    }
    var sobrando = entram.slice(q * 2);      // ímpar: o último espera parceiro
    entram = entram.slice(0, q * 2);

    // seed dos novos continua a numeração do sorteio (append puro, ninguém desloca)
    var seedBase = 0;
    atuais.forEach(function (m) {
      if (m && m.p1Seed > seedBase) seedBase = m.p1Seed;
      if (m && m.p2Seed > seedBase) seedBase = m.p2Seed;
    });

    var f = r1.length;
    var K = f + q;
    var novosR1 = [];
    for (var i = 0; i < q; i++) {
      var a = entram[2 * i], b = entram[2 * i + 1];
      var sa = seedBase + 2 * i + 1, sb = seedBase + 2 * i + 2;
      var m = {
        id: ns + 'VC-R1-P' + (f + i + 1),
        round: 1, bracket: (r1[0] && r1[0].bracket) || 'main',
        p1: (a && (a.displayName || a.name)) || ('#' + sa),
        p2: (b && (b.displayName || b.name)) || ('#' + sb),
        p1Seed: sa, p2Seed: sb, winner: null,
        phaseIndex: opts.phaseIndex || 0,
        // `C<K>` no lugar do B: este jogo nasceu no CRESCIMENTO, não no desenho
        // puro. Marcar assim evita que ele seja confundido com um confronto do
        // sorteio original na próxima reconciliação.
        _sig: 'C' + K + '|normal:#' + sa + ' x #' + sb
      };
      if (opts.category != null) m.category = opts.category;
      var _setSlot = (typeof window !== 'undefined') && window._setSlot;
      [[a, 'p1'], [b, 'p2']].forEach(function (par) {
        var p = par[0], slot = par[1];
        if (!p) return;
        var uids = p.uids || (p.uid ? [p.uid] : []);
        if (typeof _setSlot === 'function') _setSlot(m, slot, uids, p);
        else m[slot === 'p1' ? 'team1Obj' : 'team2Obj'] = p;
      });
      novosR1.push(m);
    }

    // ── 4. downstream = chave(K) com as rodadas deslocadas +1 ──
    var desenho = C.chave(K, formato);
    var compR1 = r1.concat(novosR1);          // índice = seed do desenho − 1
    var shift = function (id) { return String(id).replace(/^VC-R(\d+)-/, function (_, r) { return 'VC-R' + (parseInt(r, 10) + 1) + '-'; }); };

    // A R1 congelada ainda aponta pro downstream ANTIGO, que vai deixar de existir.
    // Limpa AGORA: ponteiro pra jogo inexistente é slot morto, e slot morto trava a
    // cadeia inteira (foi assim que a grande final nunca enchia na 1.5.x).
    compR1.forEach(function (m) {
      delete m.nextMatchId; delete m.nextSlot;
      delete m.loserMatchId; delete m.loserSlot;
      delete m.loserNextMatchId; delete m.loserNextSlot;
    });

    // Só a SUPERIOR do desenho. Na dupla, a inferior e a grande final de
    // `chave(K,'dupla')` são descartadas de propósito: elas pressupõem que a R1 é a
    // do próprio desenho, e aqui a R1 é a CONGELADA (K jogos reais, forma que o motor
    // não produz). A inferior do composto é construída por `_inferiorDaSuperior`.
    var soVC = desenho.ordem.filter(function (id) { return desenho.porId[id].fase === 'VC'; });

    var down = [], downById = {};
    soVC.forEach(function (id) {
      var j = desenho.porId[id];
      var nm = {
        id: ns + shift(j.id), round: j.rodada + 1,
        bracket: (r1[0] && r1[0].bracket) || 'main',
        p1: 'TBD', p2: 'TBD', winner: null,
        phaseIndex: opts.phaseIndex || 0,
        _sig: 'C' + K + '|' + j.tipo + ':' + j.entradas.map(function (e) {
          return e.tipo === 'seed' ? '@' + e.seed : e.tipo === 'vazio' ? '-' : e.tipo + '(' + e.de + ')';
        }).join(' x ')
      };
      if (opts.category != null) nm.category = opts.category;
      if (j.tipo === 'repescagem') nm.isRepechageSlot = true;
      downById[j.id] = nm;
      down.push(nm);
    });

    // inverte as arestas. A diferença pro build() puro: entrada 'seed' NÃO é
    // participante — é o VENCEDOR do jogo correspondente da R1 composta.
    soVC.forEach(function (id) {
      var j = desenho.porId[id];
      var nm = downById[id];
      j.entradas.forEach(function (e, k) {
        var slot = _slotName(k);
        if (j.rotulos && j.rotulos[k] === 'BYE' && e.tipo !== 'seed') {
          nm[slot] = _byeLabel(); nm.isBye = true; return;
        }
        if (e.tipo === 'seed') {
          var origem = compR1[e.seed - 1];
          if (!origem) { nm[slot] = _byeLabel(); nm.isBye = true; return; }
          origem.nextMatchId = nm.id; origem.nextSlot = slot;
          return;
        }
        var src = downById[e.de];
        if (!src) return;
        if (e.tipo === 'vencedor') { src.nextMatchId = nm.id; src.nextSlot = slot; }
        else if (e.tipo === 'perdedor') { src.loserMatchId = nm.id; src.loserSlot = slot; }
        else if (e.tipo === 'repescado') {
          src.loserNextMatchId = nm.id; src.loserNextSlot = slot;
          nm.isRepechageSlot = true; nm[slot + 'FromRepechage'] = true;
        }
      });
    });

    var matches = compR1.concat(down);

    // ── 4b. DUPLA: chave inferior + grande final sobre a superior composta ──
    if (formato === 'dupla') {
      // "produz perdedor" = o jogo é REALMENTE disputado E a derrota não foi anulada
      // por uma repescagem (`perdedorDesce === false`). Contar um bye aqui criaria um
      // jogo da inferior com um lado morto, que trava a cadeia inteira até a final.
      // Um jogo de FOLGA na R1 congelada avança alguém mas NÃO produz perdedor. Marcar
      // todos como produtores criava um slot da inferior que ninguém alimentava — a chave
      // parava antes da grande final. Só acontece com base fora da potência de 2 (onde a
      // R1 tem folga), que hoje nem chega aqui, mas a função tem que ser correta sozinha.
      var _lblBye = _byeLabel();
      var _ehReal = function (m) {
        return !m.isBye && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' &&
          m.p1 !== _lblBye && m.p2 !== _lblBye;
      };
      var rodadasSup = [compR1.map(function (m) { return { id: m.id, produzPerdedor: _ehReal(m) }; })];
      var porRodada = {};
      soVC.forEach(function (id) {
        var j = desenho.porId[id];
        (porRodada[j.rodada] = porRodada[j.rodada] || []).push({
          id: downById[j.id].id,
          produzPerdedor: j.disputado === true && j.perdedorDesce !== false
        });
      });
      Object.keys(porRodada).map(Number).sort(function (a, b) { return a - b; })
        .forEach(function (r) { rodadasSup.push(porRodada[r]); });

      var inf = _inferiorDaSuperior(rodadasSup);
      var porIdFinal = {};
      matches.forEach(function (m) { porIdFinal[String(m.id)] = m; });

      var lower = [];
      inf.rodadas.forEach(function (rod) {
        rod.forEach(function (j) {
          var nm = {
            id: ns + j.id, round: j.rodada, bracket: 'lower',
            p1: 'TBD', p2: 'TBD', winner: null,
            phaseIndex: opts.phaseIndex || 0,
            _sig: 'C' + K + '|inferior:' + j.entradas.map(function (e) { return e.tipo + '(' + e.de + ')'; }).join(' x ')
          };
          if (opts.category != null) nm.category = opts.category;
          porIdFinal[String(nm.id)] = nm;
          lower.push(nm);
        });
      });
      // arestas: gravadas na ORIGEM, como no resto do adapter
      inf.rodadas.forEach(function (rod) {
        rod.forEach(function (j) {
          var nm = porIdFinal[ns + j.id];
          j.entradas.forEach(function (e, k) {
            var slot = _slotName(k);
            // `de` vem CRU quando a origem é outro jogo da inferior (PD-R1-P1) e já
            // vem com namespace quando é um jogo da superior (a lista foi montada
            // com os ids finais). Sem o fallback, a aresta interna da inferior não
            // era escrita: o vencedor não avançava e a chave parava no meio.
            var src = porIdFinal[String(e.de)] || porIdFinal[ns + String(e.de)];
            if (!src) return;
            if (e.tipo === 'perdedor') { src.loserMatchId = nm.id; src.loserSlot = slot; }
            else { src.nextMatchId = nm.id; src.nextSlot = slot; }
          });
        });
      });

      // grande final: campeão da superior × campeão da inferior
      var finalSup = porIdFinal[ns + 'VC-R' + (desenho.rodadas + 1) + '-P1'];
      if (finalSup && inf.campeaoDe) {
        var gf = {
          id: ns + 'GF', round: (inf.rodadas.length || 0) + 1, bracket: 'grand',
          p1: 'TBD', p2: 'TBD', winner: null,
          phaseIndex: opts.phaseIndex || 0,
          _sig: 'C' + K + '|grandefinal'
        };
        if (opts.category != null) gf.category = opts.category;
        finalSup.nextMatchId = gf.id; finalSup.nextSlot = 'p1';
        var campInf = porIdFinal[String(inf.campeaoDe.de)] || porIdFinal[ns + String(inf.campeaoDe.de)];
        if (campInf) { campInf.nextMatchId = gf.id; campInf.nextSlot = 'p2'; }
        lower.push(gf);
      }
      matches = matches.concat(lower);
    }

    // ── 5. folga auto-avança e vencedores existentes re-propagam ──
    var tTmp = {
      id: opts.tournamentId || '_cresce',
      format: (formato === 'dupla') ? 'Dupla Eliminatória' : 'Eliminatórias Simples',
      matches: matches
    };
    var _autoBye = (typeof window !== 'undefined') && window._autoResolveBye;
    var _adv = (typeof window !== 'undefined') && window._advanceWinner;
    if (typeof _autoBye === 'function') matches.forEach(function (m) { try { _autoBye(tTmp, m); } catch (e) {} });
    if (typeof _adv === 'function') matches.forEach(function (m) { if (m && m.winner) { try { _adv(tTmp, m); } catch (e) {} } });

    return { ok: true, matches: matches, criados: novosR1.length, entraram: entram, sobrando: sobrando };
  }

  function recalcularComTardio(matchesAtuais, N, formato, opts) {
    opts = opts || {};
    var antes = (matchesAtuais || []).length;
    var novo = build(N, formato, opts);
    var rec = reconciliar(matchesAtuais || [], novo.matches);

    // CONFRONTO JÁ PUBLICADO É INTOCÁVEL — e isto é MAIS FORTE que "não perder placar".
    //
    // O guard original só recusava quando um jogo COM RESULTADO sumia. Isso protege o
    // PLACAR, não o CONFRONTO: com a chave publicada e ainda sem nenhum jogo disputado,
    // um redesenho passava batido e re-semeava tudo. Foi exatamente o desastre relatado
    // pelo dono — "era para eles entrarem no jogo 7 sem mudar nenhum dos demais 6 jogos;
    // mudou tudo". Quem já viu o próprio jogo não pode ver outro no lugar.
    //
    // Medido em N=2..24 (simples e dupla): o motor PRESERVA os confrontos publicados em
    // 18 das 22 transições. Só quebra ao cruzar EXATAMENTE a potência de 2 (2→3, 4→5,
    // 8→9, 16→17), onde a chave dobra e a semeadura inteira muda — e aí não há conserto
    // possível, é redesenho mesmo. Então este guard não fecha a porta do crescimento
    // normal: ele só transforma os 4 casos insalváveis de corrupção silenciosa em
    // recusa explícita, com o organizador decidindo (lista de espera ou refazer).
    var novoPorId = {};
    (novo.matches || []).forEach(function (m) { if (m && m.id) novoPorId[String(m.id)] = m; });
    // CONFRONTO PUBLICADO = jogo SORTEADO, isto é, com os DOIS lados vindos de semente
    // (`normal:#a x #b`). É o que o competidor viu e anotou: "eu jogo contra fulano".
    //
    // Deliberadamente NÃO conta jogo de rodada seguinte que ficou com os dois lados
    // preenchidos por FOLGA. Folga é camada DERIVADA — o próprio motor declara que
    // "byes e repescagens recalculam a cada N, e tudo bem". Tratá-los como publicados
    // fazia o guard recusar crescimento normal e legítimo (9→10, 10→11, 17→18…), que é
    // exatamente o que a migração veio destravar. Placar de jogo realmente disputado
    // continua protegido pelo `rec.perdidos` logo abaixo — são guardas complementares.
    var SO_SEMENTES = /^\d+\|normal:#\d+ x #\d+$/;
    var quebrados = (matchesAtuais || []).filter(function (m) {
      if (!m || !m._sig || !SO_SEMENTES.test(String(m._sig))) return false;
      var n = novoPorId[String(m.id)];
      return !n || !n._sig || n._sig !== m._sig;
    });
    if (quebrados.length) {
      return {
        ok: false,
        motivo: 'confronto-publicado-mudaria',
        cruzouPotencia2: true,
        perdidos: quebrados.map(function (m) {
          return { id: m.id, p1: m.p1, p2: m.p2, winner: m.winner };
        }),
        matches: null
      };
    }

    if (rec.perdidos.length) {
      // Cruzou potência de 2: a semeadura inteira muda e não há conserto — com 17
      // inscritos só 1 pode ser eliminado na R1, então só cabe 1 jogo. Devolve sem
      // aplicar; quem decide é o organizador (avisoPotencia2 explica o custo).
      return {
        ok: false,
        motivo: 'redesenho-total',
        cruzouPotencia2: true,
        perdidos: rec.perdidos,
        matches: null
      };
    }
    // RE-PROPAGAÇÃO. O recálculo devolve a chave com os slots das rodadas seguintes
    // em 'TBD': p1/p2 downstream não são desenho, são CONSEQUÊNCIA dos resultados.
    // Sem este passo, quem já tinha avançado sumia da chave (o placar sobrevivia,
    // mas o jogo seguinte ficava "TBD x TBD"). É o que o antigo _repropagateDecided
    // fazia à mão no meio da cirurgia; aqui é só reaplicar o avanço, em ordem
    // cronológica, de cada jogo que já tem vencedor. Idempotente.
    var _adv = (typeof window !== 'undefined') && window._advanceWinner;
    if (typeof _adv === 'function') {
      var tTmp = {
        id: opts.tournamentId || '_recalc',
        format: (formato === 'dupla') ? 'Dupla Eliminatória' : 'Eliminatórias Simples',
        matches: rec.matches
      };
      rec.matches.forEach(function (m) {
        if (m && m.winner) { try { _adv(tTmp, m); } catch (e) {} }
      });
    }

    return {
      ok: true,
      matches: rec.matches,
      preservados: rec.preservados,
      perdidos: [],
      criados: Math.max(0, rec.matches.length - antes),
      cruzouPotencia2: false
    };
  }

  /**
   * Reconstrói a ORDEM DO SORTEIO a partir da própria chave, pelos seeds gravados
   * nos slots (p1Seed/p2Seed). É o que permite recalcular sem schema novo e sem
   * migração: a ordem é IMUTÁVEL e já está registrada na chave que existe.
   * Índice do array = seed − 1.
   */
  function rosterDoBracket(matches) {
    var out = [];
    (matches || []).forEach(function (m) {
      if (!m) return;
      [['p1', 'p1Seed', 'team1Obj', 'team1Uids'], ['p2', 'p2Seed', 'team2Obj', 'team2Uids']]
        .forEach(function (f) {
          var seed = m[f[1]];
          if (seed == null) return;
          var base = m[f[2]] || { displayName: m[f[0]] };
          var obj = {};
          Object.keys(base).forEach(function (k) { obj[k] = base[k]; });
          if (!obj.displayName) obj.displayName = m[f[0]];
          if (!obj.uids && Array.isArray(m[f[3]]) && m[f[3]].length) obj.uids = m[f[3]];
          out[seed - 1] = obj;
        });
    });
    return out;
  }

  /**
   * Descobre o NAMESPACE de ids usado no sorteio, lendo um id existente.
   * 'p0-c1-VC-R1-P3' → 'p0-c1'. Precisa bater exatamente, senão o recálculo
   * geraria ids novos e órfãos os resultados — o bug que estamos matando.
   */
  function nsDoBracket(matches) {
    var achado = null;
    (matches || []).some(function (m) {
      if (!m || !m.id) return false;
      var i = String(m.id).search(/(^|-)(VC|PD|GF|3P)(-|$)/);
      if (i < 0) return false;
      achado = i === 0 ? '' : String(m.id).slice(0, i);
      return true;
    });
    return achado;
  }

  var BRACKETS_ELIM = { main: 1, upper: 1, lower: 1, grand: 1 };
  function _ehElim(m) {
    return !!(m && (BRACKETS_ELIM[m.bracket] || m.isThirdPlace));
  }
  function _uidsDe(p) {
    if (!p) return [];
    if (Array.isArray(p.uids) && p.uids.length) return p.uids.map(String);
    if (typeof window !== 'undefined' && typeof window._participantUids === 'function') {
      try { return (window._participantUids(p) || []).map(String); } catch (e) {}
    }
    return p.uid ? [String(p.uid)] : [];
  }

  /**
   * ENTRADA TARDIA NA ELIMINATÓRIA — o substituto da cirurgia.
   *
   * Fluxo inteiro: quem está esperando e presente entra no FIM da ordem do sorteio
   * (append puro, ninguém é deslocado), a chave é REDESENHADA do zero e os
   * resultados voltam sozinhos pro lugar porque o id é estrutural.
   *
   * Agrupa por NAMESPACE de id (que já separa fase e categoria), então cada
   * categoria/linha é recalculada com o seu próprio elenco, isoladamente.
   *
   * NÃO toca em Grupos, Liga/Suíço nem Rei/Rainha — esses têm caminho próprio.
   *
   * @returns {{ok, aplicados:number, recusados:Array, semMudanca:boolean}}
   */
  function integrarTardiosElim(t, pendentes) {
    var res = { ok: true, aplicados: 0, entrantes: [], recusados: [], semMudanca: true };
    if (!t || !Array.isArray(t.matches) || !t.matches.length) return res;

    var elim = t.matches.filter(_ehElim);
    if (!elim.length) return res;

    var dupla = /dupla/i.test(String(t.format || ''));
    var formato = dupla ? 'dupla' : 'simples';

    // agrupa por namespace (fase + categoria + linha)
    var grupos = {}, legado = 0;
    elim.forEach(function (m) {
      var ns = nsDoBracket([m]);
      if (ns == null) { legado++; return; }   // id sem coordenada = chave do motor antigo
      (grupos[ns] = grupos[ns] || []).push(m);
    });
    // CHAVE LEGADA: sorteada antes do motor determinístico (ids por timestamp, tipo
    // 'm1'/'lower-r2-1-1738…'). Não dá pra recalcular — sem coordenada nem semeadura,
    // redesenhar produziria outros confrontos e órfãos os resultados. NÃO mexe, mas
    // NÃO CALA: quem chamou precisa saber que o tardio não entrou. Um no-op silencioso
    // aqui seria a repetição exata do erro que gerou 4 hotfixes ao vivo.
    if (legado && !Object.keys(grupos).length) {
      res.recusados.push({
        ns: null, motivo: 'chave-legada-sem-coordenada',
        detalhe: 'chave sorteada pelo motor antigo (id sem coordenada estrutural) — recalcular mudaria os confrontos',
        entrantes: (pendentes || []).length
      });
      return res;
    }

    Object.keys(grupos).forEach(function (ns) {
      var doGrupo = grupos[ns];
      var roster = rosterDoBracket(doGrupo);
      // CHAVE LEGADA (ou incompleta): sem seeds gravados nos slots não dá pra derivar
      // a ordem do sorteio, e sem ela o recálculo produziria uma chave diferente. Não
      // mexe — mas NÃO CALA. Chave sorteada pelo motor antigo (ids por timestamp,
      // sem p1Seed) cai aqui; o organizador precisa saber que o tardio não entrou,
      // em vez de achar que entrou. Silêncio foi o que produziu 4 hotfixes ao vivo.
      if (!roster.length || roster.indexOf(undefined) !== -1) {
        res.recusados.push({
          ns: ns, motivo: 'chave-legada-sem-seeds',
          detalhe: 'a chave não tem semeadura gravada (sorteio anterior ao motor determinístico) — recalcular mudaria os confrontos',
          entrantes: (pendentes || []).length
        });
        return;
      }

      var cat = (doGrupo[0] && doGrupo[0].category) || null;
      var jaNaChave = {};
      roster.forEach(function (p) { _uidsDe(p).forEach(function (u) { jaNaChave[u] = 1; }); });

      var novos = (pendentes || []).filter(function (p) {
        if (cat != null && p.category != null && String(p.category) !== String(cat)) return false;
        var us = _uidsDe(p);
        if (!us.length) return true;                       // sem conta: entra pelo nome
        return !us.some(function (u) { return jaNaChave[u]; });
      });
      if (!novos.length) return;

      var elenco = roster.concat(novos);
      var r = recalcularComTardio(doGrupo, elenco.length, formato, {
        participantes: elenco,
        ns: ns || null,
        category: cat,
        phaseIndex: (doGrupo[0] && doGrupo[0].phaseIndex) || 0,
        tierThird: doGrupo.some(function (m) { return m.isThirdPlace; }),
        bracketKey: (!dupla && doGrupo[0] && doGrupo[0].bracket !== 'main') ? doGrupo[0].bracket : null
      });

      // CHAVE CHEIA → tenta CRESCER em vez de recusar. O recálculo puro mudaria
      // confronto já publicado (só acontece na potência de 2 exata); o crescimento
      // congela a R1 e abre um jogo novo pros tardios, aos pares. Ver crescerComPrefixo.
      if (!r.ok && r.motivo === 'confronto-publicado-mudaria') {
        var g = crescerComPrefixo(doGrupo, novos, formato, {
          ns: ns || null, category: cat,
          phaseIndex: (doGrupo[0] && doGrupo[0].phaseIndex) || 0,
          tournamentId: t.id
        });
        if (g.ok) {
          var idsAntigos = {};
          doGrupo.forEach(function (m) { idsAntigos[String(m.id)] = 1; });
          t.matches = t.matches.filter(function (m) { return !idsAntigos[String(m.id)]; }).concat(g.matches);
          res.aplicados += g.entraram.length;
          g.entraram.forEach(function (p) { res.entrantes.push(p); });
          res.semMudanca = false;
          // Sobrou um sem par: NÃO entrou, e o organizador precisa saber que basta
          // mais um inscrito pra abrir o jogo. É o "avisa na 9ª que precisa da 10ª".
          if (g.sobrando && g.sobrando.length) {
            res.recusados.push({ ns: ns, motivo: 'falta-par', faltam: 1, entrantes: g.sobrando.length });
          }
          return;
        }
        res.recusados.push({ ns: ns, motivo: g.motivo, perdidos: r.perdidos, entrantes: novos.length });
        return;
      }
      if (!r.ok) {
        // Não aplica NADA neste grupo. O organizador decide: lista de espera, ou
        // refazer descartando. Nunca meia-chave.
        res.recusados.push({ ns: ns, motivo: r.motivo, perdidos: r.perdidos, entrantes: novos.length });
        return;
      }

      // troca os matches DESTE grupo, preservando o resto do doc
      var doGrupoIds = {};
      doGrupo.forEach(function (m) { doGrupoIds[String(m.id)] = 1; });
      t.matches = t.matches.filter(function (m) { return !doGrupoIds[String(m.id)]; }).concat(r.matches);
      res.aplicados += novos.length;
      // devolve QUEM entrou: o chamador tira da espera e registra como inscrito
      novos.forEach(function (p) { res.entrantes.push(p); });
      res.semMudanca = false;
    });

    return res;
  }

  var api = {
    build: build,
    reconciliar: reconciliar,
    recalcularComTardio: recalcularComTardio,
    crescerComPrefixo: crescerComPrefixo,
    integrarTardiosElim: integrarTardiosElim,
    rosterDoBracket: rosterDoBracket,
    nsDoBracket: nsDoBracket,
    CAMPOS_PRESERVADOS: CAMPOS_PRESERVADOS
  };
  if (typeof window !== 'undefined') window._chavesAdapter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
