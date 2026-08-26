/* TRADUÇÃO DO TORNEIO: documento único ⇄ documento + subcoleções.
 *
 * POR QUE ISTO EXISTE (medido em 25/ago/2026, base REAL):
 *   · documento do Confra: 236 KB — `rounds` 101 KB, `participants` 36 KB,
 *     `history` 33 KB, `standings` 12,5 KB, `opponentHistory` 13 KB.
 *   · o Firestore RECUSA documento acima de 1 MB.
 *   · custo unitário: 255 B por inscrito, 925 B por jogo ⇒ o app tem TETO em ~4× o
 *     Confra. Torneio de 700 pessoas NÃO PODE SER GRAVADO. Não é lentidão.
 *   · e cada placar lançado reescreve os 236 KB inteiros.
 * Ver docs/ARQUITETURA-DE-DADOS.md.
 *
 * ⛔ A REGRA DESTE MÓDULO, E ELE INTEIRO EXISTE PRA ISSO:
 *   **`remontar(dividir(t))` tem que devolver `t` IDÊNTICO.**
 * Não "equivalente", não "quase": idêntico, campo por campo, na mesma ORDEM. É essa
 * propriedade que permite ligar a escrita nos dois bancos sem medo — se a volta é
 * exata, o banco novo é uma REPRESENTAÇÃO do velho, não uma reinterpretação dele.
 * Provado em tests/traducao-do-torneio-nao-perde-nada.test.js contra os 39 torneios
 * reais, o Confra incluído.
 *
 * ⚠️ OS JOGOS MORAM EM TRÊS LUGARES (medido na base real):
 *     t.rounds[ri].matches[mi]              ← 112 jogos (Confra)
 *     t.matches[mi]                         ←  54 jogos (demais)
 *     t.phaseRounds[fase].rounds[ri].matches[mi]  ← 0 hoje, mas o motor escreve
 *   Cada jogo extraído leva `_loc`, que diz de ONDE veio. Sem isso a volta não é
 *   fiel: o mesmo jogo em `rounds` ou em `matches` muda o comportamento da tela
 *   (ver [[project_phase_inactive_resolution]] e o leitor único `phaseGames`).
 */
(function (raiz) {
  'use strict';

  // Campos que saem do documento e viram subcoleção. ⛔ `standings` NÃO entra aqui:
  // ele é DERIVADO e vai ser recalculado no servidor (fase 3) — sair antes disso
  // quebraria a classificação congelada, que é dado com valor jurídico no torneio.
  /* ⭐ `opponentHistory` ENTROU (26/ago): 94 B por inscrito, o maior do que sobrava no
   * documento. ⚠️ E ele NÃO pode ser apagado e recalculado — MEDIDO no Confra: dos 215
   * pares guardados, 74 NÃO aparecem nos jogos de hoje (substituição, W.O., gente que
   * saiu) e o recálculo inventaria 66 que não existem. Ou seja ele carrega história que os
   * jogos já não contam; apagar quebraria o anti-repetição do sorteio.
   * ⇒ Sai do documento, mas continua existindo. Quem escreve nele é só o motor de sorteio
   * (`_recordOpponentHistory`), que roda na CF.
   * ⛔ `standings` continua FORA desta lista: ele é derivado, mas carrega a classificação
   * CONGELADA — dado com valor jurídico no torneio. Sai por último e com prova própria. */
  var PESADOS = ['participants', 'history', 'opponentHistory'];

  function _arr(x) { return Array.isArray(x) ? x : []; }
  function _clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  /* ── CHAVE DURÁVEL DO EVENTO DE HISTÓRICO ──────────────────────────────────────
   * O histórico é um LOG: só cresce, e cada linha é imutável depois de escrita.
   * Mesmo assim ele era espelhado por POSIÇÃO (`'h' + _idx`), e posição é justamente
   * a coisa que muda quando o log é podado.
   *
   * ⛔ O ESTRAGO QUE ISSO CAUSARIA (medido antes de mexer, não descoberto depois):
   * o Confra tem 218 eventos no documento e 218 no espelho. Podar o documento para as
   * últimas 30 faria `_espelhaColecao` ver `h0..h29` com CONTEÚDO NOVO (as 30 últimas) e
   * `h30..h217` AUSENTES — ou seja, reescreveria as 30 primeiras linhas erradas e
   * APAGARIA as outras 188. O histórico inteiro, destruído pela poda que existia pra
   * economizar 37 KB.
   *
   * ⇒ A chave passa a sair do CONTEÚDO (data + mensagem), que é o que não muda de lugar.
   * ⚠️ Limite conhecido e aceito: dois eventos com a MESMA mensagem no MESMO milissegundo
   * colidem e viram uma linha só. `date` é ISO com milissegundo e as mensagens carregam
   * nome próprio — na prática não acontece; e perder uma linha repetida é infinitamente
   * menos grave que perder 188.
   * ⛔ `_idx` CONTINUA indo junto: é ele que `remontar` usa pra devolver a ORDEM. A chave
   * diz QUEM é a linha; o índice diz ONDE ela fica. São coisas diferentes e o bug nasceu
   * de usar uma como a outra.
   */
  function chaveDoEvento(ev) {
    var d = (ev && ev.date != null) ? String(ev.date) : '';
    var m = (ev && ev.message != null) ? String(ev.message) : '';
    var txt = d + '|' + m;
    // hash de 32 bits (FNV-1a) — determinístico, sem depender de lib. O par
    // (tamanho + hash) reduz colisão sem precisar de criptografia: isto é chave de
    // documento, não assinatura.
    var h = 0x811c9dc5;
    for (var i = 0; i < txt.length; i++) {
      h ^= txt.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'h' + txt.length.toString(36) + '-' + h.toString(36);
  }

  // Chave estável do jogo dentro do torneio. Usa o `id` quando existe (é o que o app
  // usa em toda parte); sem id, deriva da POSIÇÃO — determinístico e reversível.
  function chaveDoJogo(m, loc) {
    if (m && m.id != null && String(m.id) !== '') return String(m.id);
    if (loc.tipo === 'rounds') return 'r' + loc.ri + '-' + loc.mi;
    if (loc.tipo === 'phaseRounds') return 'p' + loc.fase + '-' + loc.ri + '-' + loc.mi;
    return 'm' + loc.mi;
  }

  /* ── EM QUE SUBCOLEÇÃO CADA PARTE MORA ────────────────────────────────────────
   * ⛔ POR QUE ISTO NÃO É "o nome da parte": `tournaments/{id}/participants` JÁ TEM DONO —
   * o espelho de roster (id do doc = uid puro, dado CRU), escrito pela CF desde antes desta
   * arquitetura existir. Dividir os inscritos pra lá botou DOIS ESQUEMAS no mesmo lugar:
   * medido num torneio real, 13 documentos onde deviam existir 8, e `remontar` devolveu o
   * certo POR SORTE (os intrusos não têm `_idx` e caíram fora do mapa). "Funcionou por
   * sorte" não é critério pra mexer no elenco de um torneio.
   * ⇒ Os inscritos vão pra `inscritos`, que não tem dono nenhum. O roster continua onde
   * está, intacto — não estou migrando ele, estou saindo do caminho dele.
   * ⭐ E o mapeamento vive AQUI, num lugar só: hoje sete caminhos precisam saber disso
   * (leitor do app, leitor da CF, gravador da CF, gatilho, salto, volta, ensaio) e lista
   * escrita à mão já esqueceu `participants` TRÊS vezes hoje.
   */
  var COLECAO_DA_PARTE = { participants: 'inscritos' };
  function colecaoDaParte(nome) { return COLECAO_DA_PARTE[nome] || nome; }

  /* ── CHAVE DURÁVEL DA INSCRIÇÃO ────────────────────────────────────────────────
   * Mesma história do histórico, e o mesmo estrago se eu deixar como estava: o espelho
   * chaveia inscrito por POSIÇÃO (`'p' + _idx`), e posição muda quando alguém sai do meio
   * da lista — aí o diff reescreve todo mundo depois dele com o conteúdo errado.
   *
   * ⭐ A ORDEM DE PREFERÊNCIA É O CÂNONE DO DONO (26/ago): _"sempre por uid a menos que
   * seja digitado por organizador e nao tenha uid"_.
   *   ① `uid` — a identidade de verdade.
   *   ② dupla: os dois uids, na ordem em que estão (p1 e p2 são posições do time, não
   *      ordem alfabética — trocar mudaria QUEM joga de cada lado).
   *   ③ só então o NOME, e só pra quem não tem uid nenhum: são as 75 de 240 entradas
   *      digitadas pelo organizador, que existem só pelo nome. É a exceção dele, e ela é
   *      legítima — sem ela essas pessoas não teriam chave nenhuma.
   * ⚠️ Consequência aceita do ③: renomear um inscrito fictício muda a chave dele, e o
   * espelho trata como "saiu um, entrou outro". Pro dado é a mesma coisa (o registro é o
   * nome); e é infinitamente melhor que a posição, que muda sem ninguém ter feito nada.
   */
  function chaveDoInscrito(p) {
    if (!p || typeof p !== 'object') return 'x';
    if (p.uid) return 'u' + String(p.uid);
    if (p.p1Uid || p.p2Uid) return 'd' + String(p.p1Uid || '-') + '_' + String(p.p2Uid || '-');
    var nomes = [p.name, p.displayName, p.p1Name, p.p2Name]
      .concat((Array.isArray(p.participants) ? p.participants : [])
        .map(function (x) { return x && (x.displayName || x.name); }))
      .filter(Boolean).join('|');
    var h = 0x811c9dc5;
    for (var i = 0; i < nomes.length; i++) {
      h ^= nomes.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'n' + nomes.length.toString(36) + '-' + h.toString(36);
  }

  /** Divide o documento em { config, matches, participants, history }. */
  /* QUEM JOGA ESTE JOGO, no próprio documento do jogo.
   *
   * É este campo que sustenta a regra por jogo em firestore.rules — "só quem joga ESTE
   * jogo escreve, e não pode se auto-incluir" —, o mesmo desenho que `results` já usa.
   * Sem ele, liberar escrita na subcoleção seria liberar qualquer inscrito a mexer em
   * qualquer jogo.
   *
   * ⛔ A DERIVAÇÃO NÃO É REIMPLEMENTADA AQUI: chama `window._matchPlayerUids`
   * (js/views/bracket-logic.js), a mesma que o cliente usa pra autorizar lançamento.
   * Duas versões divergem — hoje mesmo três bugs saíram disso.
   * ⚠️ Se ela não estiver carregada (harness mínimo), o campo simplesmente não vai:
   * documento sem `playerUids` continua legível e só não é escrevível por jogador, que é
   * o comportamento seguro.
   */
  function _uidsDoJogo(t, m) {
    var fn = (raiz && raiz._matchPlayerUids) ||
             (typeof window !== 'undefined' && window._matchPlayerUids) || null;
    if (typeof fn !== 'function') return null;
    try {
      var u = fn(t, m);
      return (Array.isArray(u) && u.length) ? u.map(String) : null;
    } catch (e) { return null; }
  }

  function dividir(t) {
    if (!t || typeof t !== 'object') return null;
    var config = _clone(t);
    var matches = [];

    // ── 1. jogos de t.rounds[].matches ────────────────────────────────────────
    _arr(config.rounds).forEach(function (r, ri) {
      if (!r || typeof r !== 'object') return;
      _arr(r.matches).forEach(function (m, mi) {
        var loc = { tipo: 'rounds', ri: ri, mi: mi };
        var _pu = _uidsDoJogo(t, m);
        var _reg = { _chave: chaveDoJogo(m, loc), _loc: loc, jogo: _clone(m) };
        if (_pu) _reg.playerUids = _pu;
        matches.push(_reg);
      });
      // ⛔ o array fica VAZIO, não some: a rodada tem outros campos (format, status,
      // round, monarchGroups) e a AUSÊNCIA de `matches` não é o mesmo que vazio.
      if (Array.isArray(r.matches)) r.matches = [];
    });

    // ── 2. jogos de t.matches[] ───────────────────────────────────────────────
    _arr(config.matches).forEach(function (m, mi) {
      var loc = { tipo: 'matches', mi: mi };
      var _pu2 = _uidsDoJogo(t, m);
      var _reg2 = { _chave: chaveDoJogo(m, loc), _loc: loc, jogo: _clone(m) };
      if (_pu2) _reg2.playerUids = _pu2;
      matches.push(_reg2);
    });
    if (Array.isArray(config.matches)) config.matches = [];

    // ── 3. jogos de t.phaseRounds{fase}.rounds[].matches ──────────────────────
    if (config.phaseRounds && typeof config.phaseRounds === 'object') {
      Object.keys(config.phaseRounds).forEach(function (fase) {
        var ph = config.phaseRounds[fase];
        if (!ph || !Array.isArray(ph.rounds)) return;
        ph.rounds.forEach(function (r, ri) {
          if (!r || typeof r !== 'object') return;
          _arr(r.matches).forEach(function (m, mi) {
            var loc = { tipo: 'phaseRounds', fase: String(fase), ri: ri, mi: mi };
            var _pu = _uidsDoJogo(t, m);
        var _reg = { _chave: chaveDoJogo(m, loc), _loc: loc, jogo: _clone(m) };
        if (_pu) _reg.playerUids = _pu;
        matches.push(_reg);
          });
          if (Array.isArray(r.matches)) r.matches = [];
        });
      });
    }

    // ── 4. inscritos e histórico ──────────────────────────────────────────────
    var saida = { config: config, matches: matches };
    PESADOS.forEach(function (campo) {
      var v = config[campo];
      if (Array.isArray(v)) {
        saida[campo] = v.map(function (item, i) {
          var _reg = { _idx: i, item: _clone(item) };
          // só o histórico ganha chave por conteúdo — `participants` é chaveado por uid
          // do lado de fora e não é podado. Ver chaveDoEvento().
          if (campo === 'history') _reg._k = chaveDoEvento(item);
          else if (campo === 'participants') _reg._k = chaveDoInscrito(item);
          return _reg;
        });
        config[campo] = [];
      } else if (v && typeof v === 'object') {
        // forma de MAPA (alguns docs legados guardam participants como objeto)
        saida[campo] = Object.keys(v).map(function (k) { return { _idx: k, item: _clone(v[k]) }; });
        config[campo] = {};
      } else {
        saida[campo] = [];   // ausente ou vazio: nada a extrair
      }
    });
    return saida;
  }

  /** Remonta o documento original a partir das partes. Tem que sair IDÊNTICO. */
  function remontar(partes) {
    if (!partes || !partes.config) return null;
    var t = _clone(partes.config);

    // ⛔ ORDEM IMPORTA: o índice `mi` é a posição no array original. Ordenar por ele
    // devolve a ordem exata; sem isso, dois jogos trocados já quebram a igualdade —
    // e, pior, mudariam a ordem visível na tela.
    var porTipo = { rounds: [], matches: [], phaseRounds: [] };
    _arr(partes.matches).forEach(function (m) {
      var tipo = (m && m._loc && m._loc.tipo) || 'matches';
      (porTipo[tipo] || porTipo.matches).push(m);
    });

    porTipo.rounds
      .slice().sort(function (a, b) { return (a._loc.ri - b._loc.ri) || (a._loc.mi - b._loc.mi); })
      .forEach(function (m) {
        var r = _arr(t.rounds)[m._loc.ri];
        if (!r) return;
        if (!Array.isArray(r.matches)) r.matches = [];
        r.matches[m._loc.mi] = _clone(m.jogo);
      });

    porTipo.matches
      .slice().sort(function (a, b) { return a._loc.mi - b._loc.mi; })
      .forEach(function (m) {
        if (!Array.isArray(t.matches)) t.matches = [];
        t.matches[m._loc.mi] = _clone(m.jogo);
      });

    porTipo.phaseRounds
      .slice().sort(function (a, b) {
        return String(a._loc.fase).localeCompare(String(b._loc.fase))
          || (a._loc.ri - b._loc.ri) || (a._loc.mi - b._loc.mi);
      })
      .forEach(function (m) {
        var ph = t.phaseRounds && t.phaseRounds[m._loc.fase];
        var r = ph && _arr(ph.rounds)[m._loc.ri];
        if (!r) return;
        if (!Array.isArray(r.matches)) r.matches = [];
        r.matches[m._loc.mi] = _clone(m.jogo);
      });

    PESADOS.forEach(function (campo) {
      var lista = _arr(partes[campo]);
      if (!lista.length) return;
      var mapa = (typeof lista[0]._idx === 'string' && isNaN(Number(lista[0]._idx)));
      if (mapa) {
        var o = {};
        lista.forEach(function (x) { o[x._idx] = _clone(x.item); });
        t[campo] = o;
      } else {
        var a = [];
        lista.forEach(function (x) { a[Number(x._idx)] = _clone(x.item); });
        t[campo] = a;
      }
    });

    return t;
  }

  // ⭐ COMPARAÇÃO CANÔNICA — e ela é o que separa "diferente" de "reordenado".
  // MEDIDO ao conferir a 1ª carga: 30 dos 39 torneios "divergiam", e a diferença era
  // só a ORDEM DAS CHAVES dentro dos objetos:
  //     velho: {"message":"Torneio Criado","date":"…"}
  //     novo : {"date":"…","message":"Torneio Criado"}
  // O Firestore NUNCA prometeu ordem de chave — ele devolve ordenado. Exigir isso era
  // um teste medindo o que o banco não garante, e teria feito a migração parecer
  // quebrada quando estava correta.
  // ⛔ MAS ORDEM DE ARRAY É SAGRADA: os jogos e os inscritos têm ordem VISÍVEL na
  // tela. Aqui só as chaves de OBJETO são ordenadas; arrays ficam como estão.
  function canonico(x) {
    if (Array.isArray(x)) return x.map(canonico);
    if (x && typeof x === 'object') {
      var o = {};
      Object.keys(x).sort().forEach(function (k) { o[k] = canonico(x[k]); });
      return o;
    }
    return x;
  }
  function iguais(a, b) { return JSON.stringify(canonico(a)) === JSON.stringify(canonico(b)); }

  /* ── FASE 2b · O QUE MUDOU, E SÓ ISSO ──────────────────────────────────────────
   *
   * É esta função que faz um placar custar ~925 B em vez de 238 KB: comparada a foto
   * dos jogos como estavam ao ABRIR, ela devolve só os que mudaram (e os que sumiram).
   *
   * ⭐ E CONSERTA UMA CLASSE INTEIRA DE BUG. As 8 proteções de `saveTournament` existem
   * porque o cliente manda o TORNEIO INTEIRO — um save atrasado sobrescreve o que ele
   * não sabia que mudou (medido: destruía rodada nova, jogo de entrada tardia, link do
   * grupo, horário combinado e substituição por W.O.). Escrevendo só o que mudou, o save
   * atrasado deixa de poder apagar o que não tocou. Por construção, não por mais um guard.
   *
   * ⛔ Compara pelo CANÔNICO: o Firestore não preserva ordem de chave, então `{a,b}` e
   * `{b,a}` são o MESMO jogo. Comparar o JSON cru marcaria os 112 jogos como mudados a
   * cada save — exatamente o que estamos evitando. (Foi o que fez 30 dos 39 torneios
   * "divergirem" na primeira conferência do espelho.)
   */
  function jogosQueMudaram(antes, depois) {
    var idx = {};
    _arr(antes).forEach(function (m) { if (m && m._chave) idx[m._chave] = m; });
    var mudaram = [], sumiram = [];
    var vistos = {};
    _arr(depois).forEach(function (m) {
      if (!m || !m._chave) return;
      vistos[m._chave] = 1;
      var b = idx[m._chave];
      if (!b || !iguais(b, m)) mudaram.push(m);
    });
    Object.keys(idx).forEach(function (k) { if (!vistos[k]) sumiram.push(idx[k]); });
    return { mudaram: mudaram, sumiram: sumiram };
  }

  /* ── ⭐ MONTAR O TORNEIO DO BANCO — O CAMINHO ÚNICO ────────────────────────────
   * Pergunta do dono (26/ago): _"por que 7 caminhos? não deveria ser 1 caminho único
   * canônico?"_ — e ele está certo. Eu tinha SEIS cópias da mesma operação: leitor do app,
   * leitor da CF, montagem do resumo, salto, volta e ensaio. Todas faziam a mesma coisa:
   * ler as partes que `_semPesados` nomeia e chamar `remontar`.
   *
   * ⛔ E CÓPIA NÃO É CAMINHO — é lugar pra esquecer. Hoje mesmo a mesma lista escrita à
   * mão esqueceu `participants` TRÊS vezes: o gatilho apagou o elenco, a volta devolveu o
   * torneio sem ele, e o meu conferidor não viu nem um nem outro.
   *
   * ⭐ O que de fato DIFERE entre os seis é só COMO SE LÊ UMA COLEÇÃO: o SDK do cliente, o
   * admin, e o admin dentro de uma transação. Isso é uma linha, não um caminho. Então ela
   * entra por parâmetro e todo o resto — quais partes, em que coleção cada uma mora, o que
   * fazer quando falta — vive AQUI, num lugar só.
   *
   * `lerColecao(nomeDaColecao)` devolve (ou promete) a lista de documentos daquela coleção.
   * Devolve o torneio montado, ou lança — ⛔ NUNCA devolve o config cru: config cru é um
   * torneio sem jogos, e devolver isso em silêncio foi exatamente o que pintou chave vazia
   * pra todo mundo em 26/ago.
   */
  function montarDoBanco(config, lerColecao) {
    if (!config) throw new Error('[split] montarDoBanco: sem config');
    var fora = Array.isArray(config._semPesados) ? config._semPesados : null;
    if (!fora || !fora.length) return Promise.resolve(config);   // inteiro: nada a montar
    var partes = { config: config };
    var i = 0;
    function proxima() {
      if (i >= fora.length) {
        var t = remontar(partes);
        if (!t) throw new Error('[split] remontar devolveu vazio — recuso entregar torneio incompleto');
        return t;
      }
      var nome = fora[i++];
      return Promise.resolve(lerColecao(colecaoDaParte(nome), nome)).then(function (docs) {
        partes[nome] = docs || [];
        return proxima();
      });
    }
    return Promise.resolve().then(proxima);
  }

  var api = { dividir: dividir, remontar: remontar, chaveDoJogo: chaveDoJogo,
              chaveDoEvento: chaveDoEvento, chaveDoInscrito: chaveDoInscrito,
              colecaoDaParte: colecaoDaParte, montarDoBanco: montarDoBanco,
              jogosQueMudaram: jogosQueMudaram,
              PESADOS: PESADOS, canonico: canonico, iguais: iguais };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (raiz) { raiz._tSplit = api; }
})(typeof window !== 'undefined' ? window : null);
