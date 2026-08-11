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
 * desempate que o torneio não jogou. Então devolve-se a FAIXA CERTA (5º/7º) + a FASE em que
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
  function compute(matches, opts) {
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
      if (!t.perdeuEm) { t.ateOnde = 'fase de grupos'; t.posMin = t.posMax = null; return; }
      // faixa = logo depois dos times que ficaram à frente, com largura = nº de perdedores
      var base = _acumuladoAcima(t.perdeuEm, perdedores, temTerceiro);
      var n = (perdedores[t.perdeuEm] || []).length;
      t.ateOnde = _nomeDe(t.perdeuEm);
      t.posMin = base + 1;
      t.posMax = base + n;
    });

    // ── QUEM PAROU NOS GRUPOS TAMBÉM TEM CLASSIFICAÇÃO ──────────────────────────
    // Regra do dono: "se o ultimo colocado que passou da fase de grupos ficou em 5o/7o,
    // entao os que nao chegaram ai ficaram em ultimo a 8o (e o ultimo é o numero de
    // participantes)". Ou seja: a faixa começa logo depois da chave e termina no total.
    // O total sai de `opts.totalTimes` quando o chamador sabe (soma das linhas dos grupos);
    // senão, do que conhecemos — e aí é PISO, não verdade: só se sabe o total quando se
    // leu a fase de grupos inteira, então sem isso não se afirma o último lugar.
    var ultimaDaChave = 0;
    vistos.forEach(function (t) { if (t.posMax != null && t.posMax > ultimaDaChave) ultimaDaChave = t.posMax; });
    var totalInformado = opts && opts.totalTimes > 0 ? opts.totalTimes : 0;
    var totalConhecido = totalInformado || vistos.length;
    vistos.forEach(function (t) {
      if (t.posMin != null || t.ateOnde !== 'fase de grupos') return;
      if (!ultimaDaChave) return;                       // sem chave não há de onde começar
      t.posMin = ultimaDaChave + 1;
      t.posMax = totalConhecido > t.posMin ? totalConhecido : t.posMin;
      t.totalEstimado = !totalInformado;                // sem total declarado, é piso
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
   *  Pedido do dono: "mencionar a fase em que caiu (se nao chegou a final) … apenas o nome
   *  da fase entre parentesis". Então Campeão e Vice vão sem parêntese (os dois CHEGARAM à
   *  final — dizer a fase ali seria redundante) e todo o resto leva a fase, inclusive
   *  posição exata: "3º (semifinal)". */
  function rotuloDe(t) {
    if (!t || t.posMin == null) return null;
    if (t.posMin === 1) return 'Campeão';
    if (t.posMin === 2) return 'Vice';
    // separador "/" e não "–": é como o dono escreve ("3o/4o lugar", "5o/7o") e ele
    // confirmou que a faixa diz muito — "5º/7º (quartas)" é mais direto que um número só.
    var faixa = (t.posMin === t.posMax) ? (t.posMin + 'º') : (t.posMin + 'º/' + t.posMax + 'º');
    return faixa + (t.ateOnde ? ' (' + t.ateOnde + ')' : '');
  }

  /** A resposta pra UMA pessoa: onde ela terminou naquela categoria — e COM QUEM.
   *  O parceiro sai de graça: a unidade deste motor é o TIME, então quem terminou em
   *  5º/7º não foi a pessoa, foi a dupla. O dono pediu isso junto da faixa: _"e qual sua
   *  dupla e onde ela ficou"_ — é a mesma resposta, e separá-las sugeriria que a
   *  colocação fosse individual num torneio de duplas. */
  function doHandle(matches, handle, opts) {
    var r = computeAuto(matches, opts);
    var low = String(handle || '').toLowerCase();
    var t = r.porHandle[low];
    if (!r.temChave) return { conhecido: false, motivo: 'sem-chave' };
    if (!t) return { conhecido: true, chegouNaChave: false, ateOnde: 'fase de grupos',
                     rotulo: 'Fase de grupos', posMin: null, posMax: null, parceiro: null };
    // o parceiro é o outro membro do time. Casa por handle; sem handle (fictício) o nome
    // é a única identidade que existe, então cai no índice — que é estável porque
    // `handles` e `names` são preenchidos no mesmo push.
    var parceiro = null;
    var hs = t.handles || [], ns = t.names || [];
    for (var i = 0; i < hs.length; i++) {
      if (String(hs[i]).toLowerCase() !== low) { parceiro = ns[i] || hs[i] || null; break; }
    }
    if (!parceiro && ns.length === 2 && !hs.length) parceiro = ns[1];
    return { conhecido: true, chegouNaChave: true, ateOnde: t.ateOnde, rotulo: t.rotulo,
             posMin: t.posMin, posMax: t.posMax, parceiro: parceiro };
  }

  // ── QUANDO A FASE NÃO VEM ESCRITA: inferir pela ORDEM ────────────────────────
  // Dono: "pode ser que outros torneios nao tenham a fase escrita (estejam mais
  // desorganizados) … de qualquer forma, os torneios devem ao menos ser organizados de
  // forma que o ultimo jogo seja a final e a partir dai, voltando para tras temos as semis,
  // quartas, oitavas".
  //
  // Anda do FIM pra trás: 1 final, 2 semis, 4 quartas, 8 oitavas… ⚠️ Mas só rotula se a
  // ESTRUTURA confirmar: quem joga uma rodada tem que ter VENCIDO na rodada anterior (ou
  // entrado por bye). Sem essa checagem, um torneio de pontos corridos — que não tem final
  // nenhuma — ganharia um "campeão" inventado só porque alguém jogou por último. Na dúvida
  // devolve null e o chamador fica sem colocação, que é melhor que uma errada.
  function inferirFases(matches) {
    var ord = (matches || []).filter(function (m) { return m && m.sides && m.sides.length === 2; })
      .slice().sort(function (a, b) { return (a.n || 0) - (b.n || 0); });
    if (ord.length < 3) return null;

    var blocos = [], idx = ord.length - 1;
    for (var ri = 0; ri < RODADAS.length && idx >= 0; ri++) {
      var querem = (ri === 0) ? 1 : Math.pow(2, ri);      // 1, 2, 4, 8, 16
      var bloco = [];
      for (var k = 0; k < querem && idx >= 0; k++) bloco.unshift(ord[idx--]);
      blocos.push({ chave: RODADAS[ri].chave, jogos: bloco });
      if (bloco.length < querem) break;                   // acabou no meio → para aqui
    }
    if (!blocos.length || blocos[0].jogos.length !== 1) return null;

    // estrutura: cada time de um bloco tem que ter VENCIDO no bloco anterior (ou ter bye)
    for (var b = 0; b < blocos.length - 1; b++) {
      var atual = blocos[b], anterior = blocos[b + 1];
      var vencedoresAntes = {};
      anterior.jogos.forEach(function (m) {
        var v = vencedor(m); if (v == null) return;
        vencedoresAntes[timeKey(m.sides[v])] = 1;
      });
      var confere = 0, total = 0;
      atual.jogos.forEach(function (m) {
        m.sides.forEach(function (s) { total++; if (vencedoresAntes[timeKey(s)]) confere++; });
      });
      // pelo menos METADE tem que vir de vitória na rodada anterior; o resto pode ser bye.
      // Zero é o sinal de que aquilo não é uma chave — aí não se rotula nada.
      if (total === 0 || confere === 0 || confere * 2 < total) return null;
    }

    var porJogo = [];
    blocos.forEach(function (bl) {
      bl.jogos.forEach(function (m) {
        porJogo.push({ n: m.n, phase: bl.chave, sides: m.sides, inferida: true });
      });
    });
    return porJogo;
  }

  /** Usa a fase escrita quando existe; senão tenta inferir pela ordem. */
  function computeAuto(matches, opts) {
    var temFase = (matches || []).some(function (m) {
      var f = classificaFase(m && m.phase);
      return f && f.chave !== 'grupos';
    });
    if (temFase) return compute(matches, opts);
    var inferido = inferirFases(matches);
    if (!inferido) return compute(matches, opts);         // sem chave detectável
    var r = compute(inferido, opts);
    r.fasesInferidas = true;
    return r;
  }

  var API = { compute: compute, computeAuto: computeAuto, inferirFases: inferirFases,
              doHandle: doHandle, timeKey: timeKey,
              classificaFase: classificaFase, vencedor: vencedor, rotuloDe: rotuloDe };
  if (typeof window !== 'undefined') window._lzPlacement = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
