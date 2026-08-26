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
  var PESADOS = ['participants', 'history'];

  function _arr(x) { return Array.isArray(x) ? x : []; }
  function _clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

  // Chave estável do jogo dentro do torneio. Usa o `id` quando existe (é o que o app
  // usa em toda parte); sem id, deriva da POSIÇÃO — determinístico e reversível.
  function chaveDoJogo(m, loc) {
    if (m && m.id != null && String(m.id) !== '') return String(m.id);
    if (loc.tipo === 'rounds') return 'r' + loc.ri + '-' + loc.mi;
    if (loc.tipo === 'phaseRounds') return 'p' + loc.fase + '-' + loc.ri + '-' + loc.mi;
    return 'm' + loc.mi;
  }

  /** Divide o documento em { config, matches, participants, history }. */
  function dividir(t) {
    if (!t || typeof t !== 'object') return null;
    var config = _clone(t);
    var matches = [];

    // ── 1. jogos de t.rounds[].matches ────────────────────────────────────────
    _arr(config.rounds).forEach(function (r, ri) {
      if (!r || typeof r !== 'object') return;
      _arr(r.matches).forEach(function (m, mi) {
        var loc = { tipo: 'rounds', ri: ri, mi: mi };
        matches.push({ _chave: chaveDoJogo(m, loc), _loc: loc, jogo: _clone(m) });
      });
      // ⛔ o array fica VAZIO, não some: a rodada tem outros campos (format, status,
      // round, monarchGroups) e a AUSÊNCIA de `matches` não é o mesmo que vazio.
      if (Array.isArray(r.matches)) r.matches = [];
    });

    // ── 2. jogos de t.matches[] ───────────────────────────────────────────────
    _arr(config.matches).forEach(function (m, mi) {
      var loc = { tipo: 'matches', mi: mi };
      matches.push({ _chave: chaveDoJogo(m, loc), _loc: loc, jogo: _clone(m) });
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
            matches.push({ _chave: chaveDoJogo(m, loc), _loc: loc, jogo: _clone(m) });
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
        saida[campo] = v.map(function (item, i) { return { _idx: i, item: _clone(item) }; });
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

  var api = { dividir: dividir, remontar: remontar, chaveDoJogo: chaveDoJogo,
              jogosQueMudaram: jogosQueMudaram,
              PESADOS: PESADOS, canonico: canonico, iguais: iguais };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (raiz) { raiz._tSplit = api; }
})(typeof window !== 'undefined' ? window : null);
