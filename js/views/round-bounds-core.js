/* ═══ LIMITES DAS RODADAS — O SLIDER DE STOPS ════════════════════════════════════════
 *
 * Pedido do dono (02/set/2026): _"essa questão das datas limite para rodadas sucessivas
 * poderia ter no editar um slider com x stops. em cada stop a data dd/mm e entre os stops
 * y dias. de forma que o organizador pode esticar umas rodadas e reduzir outras a vontade
 * dentro do limite inicial/final."_
 *
 * O QUE MUDA, E O QUE NÃO MUDA:
 *   · NÃO muda o início nem o fim da fase — eles seguem sendo do formulário. O slider só
 *     mexe nas DIVISÕES internas, e por isso não existe estado inválido: qualquer arranjo
 *     continua cabendo exatamente na mesma janela.
 *   · Uma fase de N rodadas tem N-1 divisões. Sem divisões guardadas, a régua antiga vale
 *     como sempre valeu: fatias iguais (`_phaseRoundWindow`). O slider é um REFINAMENTO
 *     opcional, nunca um pré-requisito.
 *
 * ⛔ MORA NUM ARQUIVO PRÓPRIO, sem dependência de nada: quem LÊ os limites é o cartão de
 * progresso (tournaments-utils.js) e quem os ESCREVE é o formulário (create-tournament.js).
 * Se a lógica morasse num dos dois, o outro carregaria meio app junto — foi exatamente o
 * argumento que fez `dobra-core.js` nascer, e as suítes cobram isso na hora.
 *
 * ⚠️ FUSO: as datas do app são interpretadas em BRT (UTC-3) em todo lugar — `_ligaSeasonEndMs`,
 * `_fimDaFase`, o formulário. Um limite guardado como '2026-09-14T09:14' TEM que ser lido
 * com a mesma régua, senão o stop que o organizador arrastou aparece 3h fora do lugar.
 */
(function () {
  'use strict';

  var HORA = 3600000;
  var DIA = 86400000;
  /* Piso entre dois stops. Uma rodada de 0 minutos não é uma rodada — e sem piso o
   * arraste empilharia stops no mesmo pixel, deixando divisões que ninguém consegue
   * separar de novo com o dedo. */
  var MIN_ENTRE_STOPS = HORA;

  function _ms(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    var s = String(v);
    if (s.indexOf('T') === -1) s = s + 'T00:00';
    if (!/[+-]\d\d:?\d\d$/.test(s) && s.indexOf('Z') === -1) s = s + '-03:00';
    var d = new Date(s);
    return isNaN(d.getTime()) ? NaN : d.getTime();
  }
  window._rbMs = _ms;

  /* ms → 'YYYY-MM-DDTHH:mm' em BRT, que é o formato em que o resto do app guarda data. */
  function _iso(ms) {
    var b = new Date(ms);
    var utc = b.getTime() + b.getTimezoneOffset() * 60000;
    var brt = new Date(utc - 3 * HORA);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return brt.getFullYear() + '-' + p(brt.getMonth() + 1) + '-' + p(brt.getDate()) +
           'T' + p(brt.getHours()) + ':' + p(brt.getMinutes());
  }
  window._rbIso = _iso;

  function _ddmm(ms) {
    var b = new Date(ms);
    var utc = b.getTime() + b.getTimezoneOffset() * 60000;
    var brt = new Date(utc - 3 * HORA);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(brt.getDate()) + '/' + p(brt.getMonth() + 1);
  }
  window._rbDDMM = _ddmm;

  /* Dias entre dois instantes, como o organizador conta: 1 casa decimal, sem zero à toa. */
  function _dias(ms) {
    var d = ms / DIA;
    if (d >= 10) return String(Math.round(d));
    var r = Math.round(d * 10) / 10;
    return String(r).replace('.', ',');
  }
  window._rbDias = _dias;

  /* ── A REGRA ────────────────────────────────────────────────────────────────────
   * Devolve N-1 limites em ms, ou null quando não há arranjo próprio guardado (aí o
   * chamador usa a fatia igual de sempre).
   * ⛔ Devolve null — "não sei" — e NUNCA [] ("não tem"): a diferença entre os dois é o
   * que decide se o cartão usa a régua antiga ou desenha uma fase sem divisões. É a
   * mesma lição de `_computeStandings` devolvendo null. */
  function _normaliza(bruto, startMs, endMs, n) {
    if (!Array.isArray(bruto) || !bruto.length) return null;
    if (!(startMs > 0) || !(endMs > startMs)) return null;
    var alvo = (parseInt(n, 10) || 1) - 1;
    if (alvo < 1) return null;
    var v = bruto.map(_ms).filter(function (x) { return !isNaN(x); });
    /* Número de rodadas mudou depois de o arranjo ser salvo (o organizador mexeu no
     * formato): o arranjo antigo não descreve mais esta fase. Volta pra fatia igual em
     * vez de inventar uma divisão a mais ou a menos. */
    if (v.length !== alvo) return null;
    for (var i = 0; i < v.length; i++) {
      if (v[i] <= startMs || v[i] >= endMs) return null;      // fora da janela
      if (i > 0 && v[i] <= v[i - 1]) return null;             // fora de ordem
    }
    return v;
  }
  window._rbNormaliza = _normaliza;

  /* Os limites guardados na FASE, já normalizados — ou null. Fonte única de leitura. */
  window._limitesDasRodadas = function (t, faseIdx, startMs, endMs, nRodadas) {
    try {
      if (!t) return null;
      var f = (Array.isArray(t.phases) && t.phases[faseIdx]) || null;
      var bruto = (f && f.roundBounds) || null;
      if (!bruto && faseIdx === 0 && Array.isArray(t.roundBounds)) bruto = t.roundBounds;
      return _normaliza(bruto, startMs, endMs, nRodadas);
    } catch (e) { return null; }
  };

  /* Divisão IGUAL — a régua de sempre, escrita como array pra o slider poder partir dela. */
  window._rbIguais = function (startMs, endMs, n) {
    var k = parseInt(n, 10) || 1;
    if (k < 2 || !(endMs > startMs)) return [];
    var passo = (endMs - startMs) / k;
    var out = [];
    for (var i = 1; i < k; i++) out.push(Math.round(startMs + i * passo));
    return out;
  };

  /* Arrasta UM stop respeitando os vizinhos e o piso. Devolve o array novo (não muta). */
  window._rbMove = function (limites, idx, novoMs, startMs, endMs) {
    var v = (limites || []).slice();
    if (idx < 0 || idx >= v.length) return v;
    var min = (idx === 0 ? startMs : v[idx - 1]) + MIN_ENTRE_STOPS;
    var max = (idx === v.length - 1 ? endMs : v[idx + 1]) - MIN_ENTRE_STOPS;
    if (max < min) max = min;
    v[idx] = Math.max(min, Math.min(max, Math.round(novoMs)));
    return v;
  };

  /* ── O DESENHO ──────────────────────────────────────────────────────────────────
   * Uma trilha com N segmentos. Cada segmento mostra os DIAS que dura; cada divisa
   * mostra a data dd/mm. As pontas são o início e o fim da fase — elas não se arrastam,
   * e por isso aparecem em cinza, não como stop. */
  window._rbSliderHtml = function (startMs, endMs, n, limites, presentation) {
    var k = parseInt(n, 10) || 1;
    if (!(endMs > startMs) || k < 1) {
      return '<div style="font-size:0.72rem;color:var(--text-muted);padding:6px 2px;">' +
             'Defina início e fim da fase para distribuir as rodadas.</div>';
    }
    var v = (limites && limites.length === k - 1) ? limites : window._rbIguais(startMs, endMs, k);
    var view = presentation || {};
    var roundLabel = (typeof view.roundLabel === 'function') ? view.roundLabel : function (idx) { return 'R' + (idx + 1); };
    var total = endMs - startMs;
    var pct = function (ms) { return ((ms - startMs) / total) * 100; };
    var cortes = [startMs].concat(v, [endMs]);

    var segs = '';
    for (var i = 0; i < k; i++) {
      var a = cortes[i], b = cortes[i + 1];
      var largura = ((b - a) / total) * 100;
      segs += '<div class="rb-seg" data-rb-seg="' + i + '" style="position:absolute;top:0;bottom:0;' +
        'left:' + pct(a).toFixed(4) + '%;width:' + largura.toFixed(4) + '%;' +
        'background:' + (i % 2 ? 'rgba(129,140,248,0.22)' : 'rgba(56,189,248,0.22)') + ';' +
        'border-right:' + (i < k - 1 ? '0' : '0') + ';display:flex;align-items:center;justify-content:center;' +
        'overflow:hidden;font-size:0.62rem;font-weight:800;color:var(--text-bright);white-space:nowrap;">' +
        (largura > 9 ? (roundLabel(i) + ' · ' + window._rbDias(b - a) + 'd') :
         largura > 4 ? roundLabel(i) : '') +
      '</div>';
    }

    var stops = '';
    for (var j = 0; j < v.length; j++) {
      stops += '<div class="rb-stop" data-rb-stop="' + j + '" role="slider" tabindex="0" ' +
        'aria-label="Divisão entre a rodada ' + (j + 1) + ' e a ' + (j + 2) + '" ' +
        'aria-valuetext="' + window._rbDDMM(v[j]) + '" ' +
        'style="position:absolute;top:-6px;bottom:-6px;left:' + pct(v[j]).toFixed(4) + '%;' +
        'width:22px;margin-left:-11px;cursor:ew-resize;touch-action:none;display:flex;' +
        'align-items:center;justify-content:center;z-index:2;">' +
        '<span style="width:4px;height:100%;border-radius:3px;background:#f59e0b;' +
        'box-shadow:0 0 0 1px rgba(0,0,0,0.35);"></span></div>';
    }

    var rotulos = '';
    var prazoHtml = (typeof view.deadlineHtml === 'function') ? view.deadlineHtml : null;
    for (var q = 0; q < v.length; q++) {
      var _rot = prazoHtml ? prazoHtml(v[q], q, false) : window._rbDDMM(v[q]);
      rotulos += '<span data-rb-lbl="' + q + '" style="position:absolute;top:0;left:' + pct(v[q]).toFixed(4) + '%;' +
        'transform:translateX(-50%);font-size:0.62rem;font-weight:800;color:var(--sp-c-fbbf24,#fbbf24);' +
        'white-space:nowrap;text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px;">' + _rot + '</span>';
    }
    if (prazoHtml) {
      /* ⭐ A DATA FINAL ENCOSTA NA EXTREMA DIREITA. Ordem do dono (12/set/2026): _"a data
       * final aqui deveria estar na extrema direita"_. O bloco já era ancorado em 100% com
       * `translateX(-100%)`, mas com `align-items:center` a DATA ficava centrada sobre o
       * campo de hora (mais largo que ela) — e sobrava um dedo de espaço à direita dela,
       * como se o fim da fase não fosse o fim da régua. `flex-end` alinha os dois pela
       * direita, que é a borda que significa alguma coisa aqui. */
      rotulos += '<span data-rb-lbl-final="1" style="position:absolute;top:0;left:100%;transform:translateX(-100%);font-size:0.62rem;font-weight:800;color:var(--sp-c-fbbf24,#fbbf24);white-space:nowrap;text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:2px;">' + prazoHtml(endMs, k - 1, true) + '</span>';
    }
    var _rotHeight = prazoHtml ? '44px' : '14px';
    var _summary = (typeof view.summaryHtml === 'function') ? view.summaryHtml(cortes) : '';

    return '<div data-rb-root="1" style="padding:2px 12px 0;">' +
      '<div data-rb-track="1" style="position:relative;height:26px;border-radius:8px;overflow:visible;' +
        'background:var(--sp-g-255-255-255-006,rgba(255,255,255,0.06));">' +
        '<div style="position:absolute;inset:0;border-radius:8px;overflow:hidden;">' + segs + '</div>' +
        stops +
      '</div>' +
      '<div data-rb-rotulos="1" style="position:relative;height:' + _rotHeight + ';margin-top:3px;">' + rotulos + '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:0.62rem;color:var(--text-muted);font-weight:700;">' +
        '<span>' + window._rbDDMM(startMs) + '</span><span>' + (prazoHtml ? '' : window._rbDDMM(endMs)) + '</span>' +
      '</div>' + _summary +
    '</div>';
  };

  /* Liga o arraste. `onChange(limites)` recebe o array novo a cada movimento.
   * ⛔ DELEGAÇÃO no root: o HTML é remontado a cada movimento, então ouvinte preso ao stop
   * morreria no primeiro arraste — a mesma armadilha da montagem preguiçosa. */
  /* ── ⭐ RÓTULO NENHUM ENCAVALA OUTRO — ELE DESCE UMA FAIXA ──────────────────────
   * Ordem do dono (12/set/2026, régua da Fase 2 da Confra): _"quando for encavalar 2 datas
   * e horários deveria colocar a próxima numa linha abaixo sem encavalar, o que já abriria
   * espaço para a próxima rodada; assim ficaria um na linha e a próxima na linha de baixo e
   * o seguinte volta para a linha original; eventualmente pode até usar uma terceira linha"_.
   * Duas rodadas curtas (R3 de 5 dias) põem dois rótulos a poucos pixels um do outro e eles
   * se sobrepunham — "23:0009:11" era o que aparecia, ilegível e impossível de editar.
   *
   * A REGRA, na letra dele: cada rótulo entra na PRIMEIRA faixa onde couber. Quem cabe na
   * de cima volta pra ela — as faixas de baixo só existem enquanto a de cima está ocupada.
   * ⛔ A DECISÃO É MEDIDA, NÃO ESTIMADA: as caixas chegam aqui já medidas no DOM (px), porque
   * a largura do rótulo depende da fonte, do idioma e do `--ui-scale` do aparelho — calcular
   * "quantos % um dd/mm ocupa" erraria em metade das telas. Esta função é só a aritmética,
   * pura e testável; quem mede é `_rbEscalonaRotulos`. */
  window._rbFaixas = function (caixas, folga) {
    var f = (folga == null) ? 6 : folga;
    var ocupado = [];   // borda direita já usada em cada faixa
    return (caixas || []).map(function (c) {
      for (var i = 0; i < ocupado.length; i++) {
        if (c.left >= ocupado[i] + f) { ocupado[i] = c.right; return i; }
      }
      ocupado.push(c.right);
      return ocupado.length - 1;
    });
  };

  /* Mede os rótulos desenhados e empilha os que se encavalam. Roda DEPOIS de cada pintura
   * (o HTML é remontado a cada arraste) e cresce a faixa de rótulos só o quanto precisar. */
  function _rbEscalonaRotulos(root) {
    if (!root || !root.querySelector) return;
    var faixa = root.querySelector('[data-rb-rotulos]');
    if (!faixa || !faixa.getBoundingClientRect) return;
    var els = Array.prototype.slice.call(faixa.querySelectorAll('[data-rb-lbl],[data-rb-lbl-final]'));
    if (!els.length) return;
    var base = faixa.getBoundingClientRect();
    var alt = 0;
    var caixas = els.map(function (el) {
      el.style.top = '0px';
      var r = el.getBoundingClientRect();
      if (r.height > alt) alt = r.height;
      return { left: r.left - base.left, right: r.right - base.left };
    });
    if (!alt) return;                      // fora da tela: nada a medir, nada a mexer
    var linhas = window._rbFaixas(caixas, 6);
    var passo = alt + 3;
    var maior = 0;
    els.forEach(function (el, i) {
      el.style.top = (linhas[i] * passo) + 'px';
      if (linhas[i] > maior) maior = linhas[i];
    });
    faixa.style.height = ((maior + 1) * passo) + 'px';
  }
  window._rbEscalonaRotulos = _rbEscalonaRotulos;

  window._rbMount = function (root, opts) {
    if (!root || root._rbOn) return;
    root._rbOn = true;
    var st = opts || {};
    function estado() {
      return {
        start: st.startMs(), end: st.endMs(), n: st.rodadas(),
        v: (st.valor() || []).slice()
      };
    }
    function pinta(v) {
      var e = estado();
      var atual = v || e.v;
      var presentation = (typeof st.presentation === 'function') ? st.presentation(e, atual) : null;
      root.innerHTML = window._rbSliderHtml(e.start, e.end, e.n, atual, presentation);
      _rbEscalonaRotulos(root);
    }
    root._rbPinta = pinta;

    var arrastando = null;
    function msDoPonto(clientX) {
      var trilha = root.querySelector('[data-rb-track]');
      if (!trilha) return NaN;
      var r = trilha.getBoundingClientRect();
      if (!r.width) return NaN;
      var e = estado();
      var f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      return e.start + f * (e.end - e.start);
    }
    root.addEventListener('pointerdown', function (ev) {
      var alvo = ev.target && ev.target.closest ? ev.target.closest('[data-rb-stop]') : null;
      if (!alvo) return;
      arrastando = parseInt(alvo.getAttribute('data-rb-stop'), 10);
      try { root.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
    });
    root.addEventListener('pointermove', function (ev) {
      if (arrastando == null) return;
      var e = estado();
      var base = (e.v && e.v.length === e.n - 1) ? e.v : window._rbIguais(e.start, e.end, e.n);
      var novo = window._rbMove(base, arrastando, msDoPonto(ev.clientX), e.start, e.end);
      st.onChange(novo);
      pinta(novo);
      ev.preventDefault();
    });
    function solta() { arrastando = null; }
    root.addEventListener('pointerup', solta);
    root.addEventListener('pointercancel', solta);
    pinta();
  };
})();
