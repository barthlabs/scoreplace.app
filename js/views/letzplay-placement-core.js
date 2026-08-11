/* COLOCAÇÃO FINAL NO LETZPLAY — calculada, porque o letzplay não entrega.
 * PURO (sem DOM, sem rede) → vendorável e testável. window._lzPlacement.
 *
 * POR QUE EXISTE (dono, 10/ago/2026): a tela mostrava a posição DENTRO DO GRUPO como se
 * fosse colocação — "GRUPO 03 · 2º de 3". Ele cortou: _"a posicao no grupo nao revela nada.
 * tem que considerar dentre todos os participantes que o vencedor da final foi campeao; que
 * o perdedor da final foi segundo lugar; que os derrotados nas semifinais pegaram 3o/4o
 * lugar; que a partir dai tem o 5o, 6o, 7o... precisa calcular isso já que o letzplay nao
 * entrega."_
 *
 * DE ONDE VEM O DADO: a página de jogos do torneio
 * (/{club}/tournaments/{tid}/matches?page=N) rotula cada card como `#N • FASE`, e a FASE é
 * "Grupos" na primeira página e "QF"/"SF"/"Final" depois. Andando da Final PRA TRÁS dá pra
 * posicionar todo mundo.
 *
 * CATEGORIA: sai de graça. No letzplay cada categoria é um TORNEIO PRÓPRIO (o T&F Special
 * Edition tem Bronze/Prata/Ouro, e o `tourneyId` 449729 é só o Bronze — daí o botão "Ver
 * outra Categoria" na página). Então usar o tourneyId do atleta já restringe à categoria
 * dele; não há mistura a desfazer.
 *
 * ⚠️ O QUE ESTE MÓDULO NÃO INVENTA: dentro de uma mesma rodada eliminatória não existe
 * ordem — quem perdeu nas quartas empata em 5º. Cravar "6º" exigiria um critério de
 * desempate que o torneio não jogou. Então devolve-se a FAIXA CERTA (5º–7º) + a FASE em que
 * parou, que é informação verdadeira. Inventar o número exato seria repetir, com outra
 * roupa, o erro do pódio falso que originou este arquivo.
 */
(function () {
  'use strict';

  // Fases eliminatórias, da FINAL pra trás. `entra` = quantos times a rodada recebe.
  // Os rótulos do letzplay são curtos (QF/SF/Final); os por extenso entram por segurança.
  var RODADAS = [
    { chave: 'final',   entra: 2,  nome: 'final',        re: /^\s*final\s*$/i },
    { chave: 'sf',      entra: 4,  nome: 'semifinal',    re: /^\s*(sf|semi(\s*final)?(s)?|semis)\s*$/i },
    { chave: 'qf',      entra: 8,  nome: 'quartas',      re: /^\s*(qf|quartas(\s*de\s*final)?)\s*$/i },
    { chave: 'r16',     entra: 16, nome: 'oitavas',      re: /^\s*(r16|oitavas(\s*de\s*final)?)\s*$/i },
    { chave: 'r32',     entra: 32, nome: 'dezesseisavos', re: /^\s*(r32|16\s*avos)\s*$/i }
  ];
  // Disputa de 3º lugar: quando existe, ela DECIDE 3º e 4º (e não "empatados em 3º").
  var RE_TERCEIRO = /(3\s*º|3o\b|terceiro|bronze\s*match|disputa\s*de\s*3)/i;
  var RE_GRUPOS = /^\s*(grupos?|fase\s*de\s*grupos?)\s*$/i;

  function _norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  /** Identidade do TIME. uid do letzplay é o handle; sem handle cai no nome (fictício). */
  function timeKey(lado) {
    var hs = (lado && lado.handles || []).map(function (h) { return String(h || '').toLowerCase(); })
      .filter(Boolean).sort();
    if (hs.length) return 'h:' + hs.join('|');
    var ns = (lado && lado.names || []).map(function (n) { return _norm(n).toLowerCase(); })
      .filter(Boolean).sort();
    return ns.length ? 'n:' + ns.join('|') : '';
  }

  function classificaFase(fase) {
    var f = _norm(fase);
    if (!f) return null;
    if (RE_GRUPOS.test(f)) return { chave: 'grupos', nome: 'fase de grupos', entra: 0 };
    if (RE_TERCEIRO.test(f)) return { chave: 'terceiro', nome: 'disputa de 3º', entra: 2 };
    for (var i = 0; i < RODADAS.length; i++) if (RODADAS[i].re.test(f)) return RODADAS[i];
    return null;   // fase desconhecida → não chuta
  }

  /** Quem venceu o jogo. Sem placar e sem marcação → null (não adivinha). */
  function vencedor(m) {
    var A = m && m.sides && m.sides[0], B = m && m.sides && m.sides[1];
    if (!A || !B) return null;
    if (A.won === true && B.won !== true) return 0;
    if (B.won === true && A.won !== true) return 1;
    var a = A.score, b = B.score;
    if (typeof a === 'number' && typeof b === 'number' && a !== b) return a > b ? 0 : 1;
    return null;
  }

  /**
   * compute(matches) → { times:[…], porHandle:{}, faseMaisFunda, ok, motivo }
   * matches: [{ n, phase, sides:[{handles[],names[],score,won}, …] }]
   *
   * Cada time recebe { key, handles, names, ateOnde, posMin, posMax, rotulo }.
   */
  function compute(matches) {
    var lista = (matches || []).filter(function (m) { return m && m.sides && m.sides.length === 2; });
    var porTime = {};                    // key → { …, perdeuEm, venceuFinal }
    var vistos = [];                     // ordem estável de descoberta

    function reg(lado) {
      var k = timeKey(lado);
      if (!k) return null;
      if (!porTime[k]) {
        porTime[k] = { key: k, handles: (lado.handles || []).slice(), names: (lado.names || []).slice(),
                       perdeuEm: null, venceuFinal: false, perdeuTerceiro: false, venceuTerceiro: false };
        vistos.push(porTime[k]);
      } else if (!porTime[k].names.length && (lado.names || []).length) {
        porTime[k].names = lado.names.slice();
      }
      return porTime[k];
    }

    var rodadasVistas = {};
    lista.forEach(function (m) {
      var fase = classificaFase(m.phase);
      if (!fase) return;
      var A = reg(m.sides[0]), B = reg(m.sides[1]);
      if (!A || !B) return;
      if (fase.chave === 'grupos') return;            // grupo não posiciona ninguém
      rodadasVistas[fase.chave] = true;
      var v = vencedor(m);
      if (v == null) return;                           // jogo sem resultado não elimina
      var ganhou = v === 0 ? A : B, perdeu = v === 0 ? B : A;
      if (fase.chave === 'terceiro') { ganhou.venceuTerceiro = true; perdeu.perdeuTerceiro = true; return; }
      if (fase.chave === 'final') ganhou.venceuFinal = true;
      // um time só é eliminado UMA vez, na rodada mais funda em que perdeu
      var ordemAtual = perdeu.perdeuEm ? _profundidade(perdeu.perdeuEm) : 99;
      if (_profundidade(fase.chave) < ordemAtual) perdeu.perdeuEm = fase.chave;
    });

    // quantos times PERDERAM em cada rodada (define a faixa real; com bye a faixa encolhe)
    var perdedores = {};
    vistos.forEach(function (t) { if (t.perdeuEm) (perdedores[t.perdeuEm] = perdedores[t.perdeuEm] || []).push(t); });

    var temTerceiro = vistos.some(function (t) { return t.venceuTerceiro || t.perdeuTerceiro; });

    vistos.forEach(function (t) {
      if (t.venceuFinal) { t.ateOnde = 'campeão'; t.posMin = t.posMax = 1; return; }
      if (t.perdeuEm === 'final') { t.ateOnde = 'vice'; t.posMin = t.posMax = 2; return; }
      if (temTerceiro && t.venceuTerceiro) { t.ateOnde = 'semifinal'; t.posMin = t.posMax = 3; return; }
      if (temTerceiro && t.perdeuTerceiro) { t.ateOnde = 'semifinal'; t.posMin = t.posMax = 4; return; }
      if (!t.perdeuEm) { t.ateOnde = null; t.posMin = t.posMax = null; return; }
      // faixa = logo depois dos times que ficaram à frente, com largura = nº de perdedores
      var base = _acumuladoAcima(t.perdeuEm, perdedores, temTerceiro);
      var n = (perdedores[t.perdeuEm] || []).length;
      t.ateOnde = _nomeDe(t.perdeuEm);
      t.posMin = base + 1;
      t.posMax = base + n;
    });

    vistos.forEach(function (t) { t.rotulo = rotuloDe(t); });

    var porHandle = {};
    vistos.forEach(function (t) {
      (t.handles || []).forEach(function (h) { porHandle[String(h).toLowerCase()] = t; });
    });

    var faseMaisFunda = null;
    for (var i = RODADAS.length - 1; i >= 0; i--) if (rodadasVistas[RODADAS[i].chave]) faseMaisFunda = RODADAS[i].chave;

    return {
      times: vistos,
      porHandle: porHandle,
      temChave: !!Object.keys(rodadasVistas).length,
      temFinal: !!rodadasVistas['final']
    };
  }

  function _profundidade(chave) {
    for (var i = 0; i < RODADAS.length; i++) if (RODADAS[i].chave === chave) return i;
    return 99;
  }
  function _nomeDe(chave) {
    for (var i = 0; i < RODADAS.length; i++) if (RODADAS[i].chave === chave) return RODADAS[i].nome;
    return chave;
  }
  /** Quantos times ficam ACIMA de quem perdeu nesta rodada. */
  function _acumuladoAcima(chave, perdedores, temTerceiro) {
    var d = _profundidade(chave), n = 0;
    for (var i = 0; i < RODADAS.length; i++) {
      if (i >= d) continue;                                  // rodadas mais fundas ficam acima
      if (RODADAS[i].chave === 'final') { n += 2; continue; } // campeão + vice
      n += (perdedores[RODADAS[i].chave] || []).length;
    }
    return n;
  }

  /** Texto curto e honesto: nunca crava número dentro de uma faixa.
   *  Posição EXATA vai sozinha ("3º") — a fase ali não acrescenta nada e confunde
   *  (quem venceu a disputa de 3º perdeu na semi, e "3º (semifinal)" se lia como erro).
   *  Já a FAIXA precisa da fase, porque é ela que explica por que não há número único. */
  function rotuloDe(t) {
    if (!t || t.posMin == null) return null;
    if (t.posMin === 1) return 'Campeão';
    if (t.posMin === 2) return 'Vice';
    if (t.posMin === t.posMax) return t.posMin + 'º';
    return t.posMin + 'º–' + t.posMax + 'º' + (t.ateOnde ? ' (' + t.ateOnde + ')' : '');
  }

  /** A resposta pra UMA pessoa: onde ela terminou naquela categoria. */
  function doHandle(matches, handle) {
    var r = compute(matches);
    var t = r.porHandle[String(handle || '').toLowerCase()];
    if (!r.temChave) return { conhecido: false, motivo: 'sem-chave' };
    if (!t) return { conhecido: true, chegouNaChave: false, ateOnde: 'fase de grupos',
                     rotulo: 'Fase de grupos', posMin: null, posMax: null };
    return { conhecido: true, chegouNaChave: true, ateOnde: t.ateOnde, rotulo: t.rotulo,
             posMin: t.posMin, posMax: t.posMax };
  }

  var API = { compute: compute, doHandle: doHandle, timeKey: timeKey,
              classificaFase: classificaFase, vencedor: vencedor, rotuloDe: rotuloDe };
  if (typeof window !== 'undefined') window._lzPlacement = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
