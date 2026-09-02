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
  window._rbSliderHtml = function (startMs, endMs, n, limites) {
    var k = parseInt(n, 10) || 1;
    if (!(endMs > startMs) || k < 1) {
      return '<div style="font-size:0.72rem;color:var(--text-muted);padding:6px 2px;">' +
             'Defina início e fim da fase para distribuir as rodadas.</div>';
    }
    var v = (limites && limites.length === k - 1) ? limites : window._rbIguais(startMs, endMs, k);
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
        (largura > 11 ? ('R' + (i + 1) + ' · ' + window._rbDias(b - a) + 'd') :
         largura > 6 ? ('R' + (i + 1)) : '') +
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
    for (var q = 0; q < v.length; q++) {
      rotulos += '<span data-rb-lbl="' + q + '" style="position:absolute;left:' + pct(v[q]).toFixed(4) + '%;' +
        'transform:translateX(-50%);font-size:0.62rem;font-weight:800;color:var(--sp-c-fbbf24,#fbbf24);' +
        'white-space:nowrap;">' + window._rbDDMM(v[q]) + '</span>';
    }

    return '<div data-rb-root="1" style="padding:2px 12px 0;">' +
      '<div data-rb-track="1" style="position:relative;height:26px;border-radius:8px;overflow:visible;' +
        'background:var(--sp-g-255-255-255-006,rgba(255,255,255,0.06));">' +
        '<div style="position:absolute;inset:0;border-radius:8px;overflow:hidden;">' + segs + '</div>' +
        stops +
      '</div>' +
      '<div style="position:relative;height:14px;margin-top:3px;">' + rotulos + '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:0.62rem;color:var(--text-muted);font-weight:700;">' +
        '<span>' + window._rbDDMM(startMs) + '</span><span>' + window._rbDDMM(endMs) + '</span>' +
      '</div>' +
    '</div>';
  };

  /* Liga o arraste. `onChange(limites)` recebe o array novo a cada movimento.
   * ⛔ DELEGAÇÃO no root: o HTML é remontado a cada movimento, então ouvinte preso ao stop
   * morreria no primeiro arraste — a mesma armadilha da montagem preguiçosa. */
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
      root.innerHTML = window._rbSliderHtml(e.start, e.end, e.n, v || e.v);
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
