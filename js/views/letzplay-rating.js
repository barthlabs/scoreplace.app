/* scoreplace.app — letzplay-rating.js
 * Motor de NÍVEL como RATING DINÂMICO (Glicko-1) + veredito de categoria.
 *
 * FASE 1: lógica PURA, testável headless, NÃO fiada na produção — este arquivo
 * ainda NÃO está no index.html; ninguém o carrega no app. Serve pro teste
 * (tests/letzplay-rating.test.js) e será plugado atrás da flag 'letzplay-import'
 * numa fase posterior.
 *
 * Conceitos travados no design (mockup + PoC, ver memória project_letzplay_competitive_analysis):
 *  - Nível = rating CONTÍNUO; a categoria é DERIVADA, não uma etiqueta.
 *  - Incerteza (RD) protege: poucos jogos = veredito "sem dados", nunca acusa.
 *  - Escada de categoria VERSIONADA por clube/ano/gênero (bandas = faixas de rating).
 *  - Gênero = escadas SEPARADAS (Fem D != Masc D).
 *  - Veredito RULE-AWARE: torneio por CONQUISTA (sobe só ao vencer) suaviza 🔴 -> 🟡.
 *  - Dupla tem rating PRÓPRIO (não é a média dos dois).
 *  - Veredito em chave de PROMOÇÃO (sem "gato"):
 *      🔴 tem que subir | 🟡 deve subir | 🟢 coerente | 🔵 abaixo | ⚪ sem dados.
 */
(function () {
  var root = (typeof window !== 'undefined') ? window
           : (typeof global !== 'undefined') ? global : this;

  // ── Glicko-1 (escala 400) ───────────────────────────────────────────
  var Q = Math.LN10 / 400;
  function gf(rd) { return 1 / Math.sqrt(1 + 3 * Q * Q * rd * rd / (Math.PI * Math.PI)); }
  function Ef(r, ri, rdi) { return 1 / (1 + Math.pow(10, -gf(rdi) * (r - ri) / 400)); }

  var START_R = 1500, START_RD = 350, MIN_RD = 30;
  var RD_UNSURE = 150;   // RD acima disso = poucos jogos -> não acusa nível
  var K_CONF = 1.0;      // margem de incerteza (× RD) aplicada ao veredito

  /** Uma atualização Glicko-1 de 1 jogo. score: 1=vitória, 0=derrota, 0.5=empate.
   * O passo escala com a incerteza do PRÓPRIO jogador (RD): novato move rápido,
   * veterano move devagar — é o que impede rebaixar alguém por um tropeço curto. */
  function glicko(r, rd, oppR, oppRD, score) {
    var gi = gf(oppRD), e = Ef(r, oppR, oppRD);
    var dSq = 1 / (Q * Q * gi * gi * e * (1 - e));
    var denom = 1 / (rd * rd) + 1 / dSq;
    return { r: r + (Q / denom) * gi * (score - e), rd: Math.sqrt(1 / denom) };
  }

  /** Rating a partir de uma lista CRONOLÓGICA de jogos (mais antigo primeiro).
   * matches: [{ oppRating, oppRd?, score }]. opts: { startR, startRd, formWindow }.
   * Retorna { rating, rd, played, form } — form = variação nos últimos formWindow jogos. */
  function ratingFromMatches(matches, opts) {
    opts = opts || {};
    var r = (opts.startR != null) ? opts.startR : START_R;
    var rd = (opts.startRd != null) ? opts.startRd : START_RD;
    var formWindow = opts.formWindow || 5;
    var n = (matches || []).length;
    var rAtFormStart = r;
    for (var i = 0; i < n; i++) {
      if (i === Math.max(0, n - formWindow)) rAtFormStart = r;
      var m = matches[i];
      var u = glicko(r, rd, m.oppRating, (m.oppRd != null ? m.oppRd : 60), m.score);
      r = u.r; rd = Math.max(MIN_RD, u.rd);
    }
    return { rating: r, rd: rd, played: n, form: r - rAtFormStart };
  }

  /** Rating de uma DUPLA a partir dos jogos DA PARCERIA (valor próprio, não a média
   * dos dois). "Sozinha C, com fulano D" cai naturalmente daqui. */
  function pairRatingFromMatches(matches, opts) { return ratingFromMatches(matches, opts); }

  // ── Escadas de categoria (bandas = faixas de rating), versionadas ───
  // Calibráveis depois com dados reais; gênero em escadas separadas.
  var LADDERS = {
    'beach-masc-2024': [
      { name: 'FUN', lo: -1e9, hi: 1380 }, { name: 'D', lo: 1380, hi: 1520 },
      { name: 'C', lo: 1520, hi: 1660 }, { name: 'B', lo: 1660, hi: 1820 },
      { name: 'A', lo: 1820, hi: 1e9 }
    ],
    'beach-masc-2025': [
      { name: 'D+/C-', lo: -1e9, hi: 1590 }, { name: 'C+/B-', lo: 1590, hi: 1730 },
      { name: 'B+/A-', lo: 1730, hi: 1e9 }
    ],
    'beach-fem-2025': [
      { name: 'D', lo: -1e9, hi: 1520 }, { name: 'C', lo: 1520, hi: 1660 },
      { name: 'B', lo: 1660, hi: 1820 }, { name: 'A', lo: 1820, hi: 1e9 }
    ]
  };

  function ladderOf(ref) { return (typeof ref === 'string') ? (LADDERS[ref] || null) : ref; }
  function bandForRating(ladderRef, rating) {
    var L = ladderOf(ladderRef); if (!L) return null;
    for (var i = 0; i < L.length; i++) if (rating >= L[i].lo && rating < L[i].hi) return L[i].name;
    return null;
  }
  function bandRange(ladderRef, name) {
    var L = ladderOf(ladderRef); if (!L) return null;
    for (var i = 0; i < L.length; i++) if (L[i].name === name) return L[i];
    return null;
  }

  /** Veredito de coerência entre o rating medido e a categoria-alvo (a do torneio).
   * args: { rating, rd, targetBand, ladder, rule, hasWonCategory }
   *   - rule: 'open' (livre) | 'achievement' (só sobe ao VENCER a categoria)
   *   - hasWonCategory: se rule==='achievement', já venceu a targetBand?
   * Retorna { code, color, label, reasons[] }.
   * O caso Kelly (ranking C+/B-, torneio D, não venceu) sai como 🟡 deve subir —
   * legítimo pela regra — em vez de 🔴, graças ao rule-aware. */
  function verdict(args) {
    var band = bandRange(args.ladder, args.targetBand);
    if (!band) {
      return { code: 'sem_dados', color: '⚪', label: 'sem categoria',
        reasons: ['categoria/escada não reconhecida'] };
    }
    if (args.rd == null || args.rd > RD_UNSURE) {
      return { code: 'sem_dados', color: '⚪', label: 'sem dados',
        reasons: ['poucos jogos — confiança baixa, não acusa nível'] };
    }
    var lower = args.rating - K_CONF * args.rd;
    var upper = args.rating + K_CONF * args.rd;
    var ruleAware = (args.rule === 'achievement') && !args.hasWonCategory;

    if (lower > band.hi) {                       // claramente ACIMA, além da incerteza
      if (ruleAware) {
        return { code: 'deve_subir', color: '🟡', label: 'deve subir',
          reasons: ['nível acima da categoria, mas ainda não venceu — legítimo pela regra do clube'] };
      }
      return { code: 'tem_que_subir', color: '🔴', label: 'tem que subir',
        reasons: ['nível claramente acima da categoria — precisa subir'] };
    }
    if (args.rating > band.hi) {                 // acima, mas dentro da incerteza
      return { code: 'deve_subir', color: '🟡', label: 'deve subir',
        reasons: ['forte para a categoria — provável promoção'] };
    }
    if (upper < band.lo) {                        // claramente ABAIXO
      return { code: 'abaixo', color: '🔵', label: 'abaixo',
        reasons: ['nível abaixo da categoria — pode precisar de apoio/parceria'] };
    }
    return { code: 'coerente', color: '🟢', label: 'coerente',
      reasons: ['nível compatível com a categoria'] };
  }

  root._spRating = {
    glicko: glicko,
    ratingFromMatches: ratingFromMatches,
    pairRatingFromMatches: pairRatingFromMatches,
    bandForRating: bandForRating,
    bandRange: bandRange,
    verdict: verdict,
    LADDERS: LADDERS,
    START_R: START_R, START_RD: START_RD, MIN_RD: MIN_RD, RD_UNSURE: RD_UNSURE
  };
})();
