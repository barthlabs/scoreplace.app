/* tabela de cor ausente (teste headless) => devolve a cor crua, como antes da 2.0.94 */
if (typeof window !== 'undefined' && !window._spCor) window._spCor = function (c) { return c; };
// weather.js — previsão do tempo do LOCAL do torneio (v1.8.78)
//
// Pedido do dono (15/ago/2026, com print do detalhe do torneio):
//   "abaixo de rodada em andamento, poderia aparecer a previsão do tempo que já temos no
//    app e está no editar/criar torneio. seria legal ter uma apresentação
//    agora/hoje/próximos dias."
//
// A previsão JÁ EXISTIA, mas presa ao FORMULÁRIO: `_checkWeather` em create-tournament.js
// lia ids fixos (`tourn-venue-lat`, `weather-content`), mostrava UM ponto só (a entrada
// mais próxima da data de início) e carregava a chave da API dentro dele. Pra reusar no
// detalhe do torneio sem copiar nada, a BUSCA saiu de lá e virou este módulo; o formulário
// passou a consumi-lo. Uma chave, um caminho de rede, um cache.
//
// ⚠️ CUSTO É O PONTO, NÃO DETALHE. O projeto acabou de levar um incidente de conta com o
// Places (ver memória `project_places_api_cost`): a mesma imagem era RECOMPRADA a cada
// render porque a URL paga estava pintada no CSS. A lição vale aqui: o detalhe do torneio
// re-renderiza a cada snapshot do Firestore, e o Modo TV se redesenha sozinho. Por isso:
//   • UMA requisição por local (arredondado a ~1km) — nunca uma por render;
//   • cache em memória + sessionStorage com validade de 30 min;
//   • requisições concorrentes pro mesmo local compartilham a MESMA promessa;
//   • a hidratação é disparada UMA vez por slot (marca `data-w-done`).
// A previsão muda de hora em hora, não de segundo em segundo — 30 min é folgado.

(function () {
  'use strict';

  // Mesma chave que o formulário usava (montada em pedaços, como já estava no repo).
  var KEY = ['8fc3ddd6', '9fcd76f8', '0ba767c3', '0ebd8b9d'].join('');
  var TTL_MS = 30 * 60 * 1000;
  var _mem = {};        // chave → { at, dados }
  var _voando = {};     // chave → Promise (dedup de concorrentes)

  // ~1km de resolução: dois torneios no mesmo clube compartilham a mesma leitura.
  function _chave(lat, lon) {
    return 'w:' + Number(lat).toFixed(2) + ',' + Number(lon).toFixed(2);
  }

  function _doCache(k) {
    var m = _mem[k];
    if (m && (Date.now() - m.at) < TTL_MS) return m.dados;
    try {
      var s = sessionStorage.getItem(k);
      if (s) {
        var o = JSON.parse(s);
        if (o && (Date.now() - o.at) < TTL_MS) { _mem[k] = o; return o.dados; }
      }
    } catch (e) {}
    return null;
  }

  function _guarda(k, dados) {
    var o = { at: Date.now(), dados: dados };
    _mem[k] = o;
    try { sessionStorage.setItem(k, JSON.stringify(o)); } catch (e) {}
  }

  /** Previsão de 5 dias / 3 em 3 horas. Devolve null (nunca lança) quando não dá. */
  window._weatherFetch = function (lat, lon) {
    if (!lat || !lon || !KEY) return Promise.resolve(null);
    var k = _chave(lat, lon);
    var cached = _doCache(k);
    if (cached) return Promise.resolve(cached);
    if (_voando[k]) return _voando[k];
    _voando[k] = fetch('https://api.openweathermap.org/data/2.5/forecast?lat=' + encodeURIComponent(lat) +
      '&lon=' + encodeURIComponent(lon) + '&appid=' + KEY + '&units=metric&lang=pt_br')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !Array.isArray(d.list) || !d.list.length) return null;
        _guarda(k, d);
        return d;
      })
      .catch(function () { return null; })
      .then(function (v) { delete _voando[k]; return v; });
    return _voando[k];
  };

  // ── leitura dos dados ──────────────────────────────────────────────────────
  function _diaKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function _nomeDia(ts, hoje) {
    var d = new Date(ts);
    if (_diaKey(ts) === _diaKey(hoje)) return 'hoje';
    var amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
    if (_diaKey(ts) === _diaKey(amanha.getTime())) return 'amanhã';
    return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()];
  }
  function _icone(e) {
    return (e && e.weather && e.weather[0] && e.weather[0].icon) || '01d';
  }
  function _desc(e) {
    return (e && e.weather && e.weather[0] && e.weather[0].description) || '';
  }
  // `pop` é a probabilidade de precipitação (0..1) que o próprio OpenWeather manda.
  function _chuva(entradas) {
    var p = 0;
    entradas.forEach(function (e) { if (typeof e.pop === 'number' && e.pop > p) p = e.pop; });
    return Math.round(p * 100);
  }

  /**
   * Reduz a lista de 3 em 3 horas a { agora, hoje, dias[] }.
   * PURO — é o que o teste exercita.
   */
  window._weatherResumo = function (data, agoraMs) {
    if (!data || !Array.isArray(data.list) || !data.list.length) return null;
    var agora = agoraMs || Date.now();
    var lista = data.list.map(function (e) { return { ts: e.dt * 1000, e: e }; })
                         .sort(function (a, b) { return a.ts - b.ts; });

    // AGORA = a entrada mais próxima do instante atual (a grade é de 3h; o app não
    // chama o endpoint de "tempo atual" pra não dobrar o número de requisições).
    var perto = lista[0], melhor = Infinity;
    lista.forEach(function (x) {
      var d = Math.abs(x.ts - agora);
      if (d < melhor) { melhor = d; perto = x; }
    });

    var porDia = {}, ordem = [];
    lista.forEach(function (x) {
      var k = _diaKey(x.ts);
      if (!porDia[k]) { porDia[k] = []; ordem.push(k); }
      porDia[k].push(x.e);
    });

    var dias = ordem.map(function (k) {
      var es = porDia[k];
      var min = Infinity, max = -Infinity;
      es.forEach(function (e) {
        var mn = e.main && e.main.temp_min, mx = e.main && e.main.temp_max;
        if (typeof mn === 'number' && mn < min) min = mn;
        if (typeof mx === 'number' && mx > max) max = mx;
      });
      // ícone do dia: o do meio-dia (ou o do meio da lista) — o das 3h da manhã
      // sempre sai "noite" e daria a impressão errada do dia inteiro.
      var meio = es[Math.floor(es.length / 2)];
      var doMeioDia = null;
      es.forEach(function (e) { if (new Date(e.dt * 1000).getHours() === 12) doMeioDia = e; });
      var ref = doMeioDia || meio;
      return {
        dia: k, ts: es[0].dt * 1000, nome: _nomeDia(es[0].dt * 1000, agora),
        min: isFinite(min) ? Math.round(min) : null,
        max: isFinite(max) ? Math.round(max) : null,
        icon: _icone(ref), desc: _desc(ref), chuva: _chuva(es)
      };
    });

    var hojeK = _diaKey(agora);
    return {
      agora: {
        temp: Math.round((perto.e.main && perto.e.main.temp) || 0),
        icon: _icone(perto.e), desc: _desc(perto.e),
        umidade: (perto.e.main && perto.e.main.humidity) || 0,
        vento: Math.round(((perto.e.wind && perto.e.wind.speed) || 0) * 3.6), // m/s → km/h
        chuva: Math.round(((typeof perto.e.pop === 'number') ? perto.e.pop : 0) * 100)
      },
      hoje: dias.filter(function (d) { return d.dia === hojeK; })[0] || null,
      dias: dias.filter(function (d) { return d.dia !== hojeK; }).slice(0, 4)
    };
  };

  // ── desenho ────────────────────────────────────────────────────────────────
  function _img(icon, px) {
    return '<img src="https://openweathermap.org/img/wn/' + icon + '@2x.png" alt="" ' +
      'style="width:' + px + 'px;height:' + px + 'px;flex-shrink:0;" loading="lazy">';
  }
  function _pillChuva(p) {
    if (!p) return '';
    var cor = p >= 60 ? '#60a5fa' : '#94a3b8';
    return '<span style="font-size:0.62rem;font-weight:700;color:' + window._spCor(cor, 'color') + ';white-space:nowrap;">💧' + p + '%</span>';
  }

  window._weatherWidgetHtml = function (r, size, local) {
    if (!r) return '';
    var lg = (size !== 'sm');
    var _sf = window._safeHtml || function (s) { return String(s == null ? '' : s); };
    // ⚠️ `weather-box`: o card do torneio pode ter FOTO do local, e a foto só é pintada
    // DEPOIS do render (desde a 1.7.53). Este fundo azul de 8% de opacidade some por
    // completo em cima dela — foi exatamente o relato do dono, que procurou a previsão e
    // não achou: ela ESTAVA na tela, invisível. Quem escurece é o CSS sob
    // `[data-vphoto-on]` (components.css), ligado pelo hidratador da foto.
    var h = '<div class="weather-box" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.22);' +
      'border-radius:12px;padding:' + (lg ? '12px 14px' : '10px 12px') + ';margin-top:10px;">';
    // v1.8.87: o título quebra a linha e o LOCAL do torneio vem logo abaixo — a previsão
    // é daquele endereço, e sem dizer de onde ela é o número fica solto (pedido do dono).
    // `overflow-wrap:anywhere` porque nome de local também traz token que não quebra.
    h += '<div style="margin-bottom:8px;">' +
      '<div style="font-size:0.65rem;font-weight:800;color:var(--sp-c-60a5fa,#60a5fa);text-transform:uppercase;' +
        'letter-spacing:0.06em;">🌤️ Previsão do tempo</div>' +
      (local
        ? '<div style="font-size:0.7rem;font-weight:600;color:var(--sp-c-cbd5e1,#cbd5e1);margin-top:2px;' +
          'overflow-wrap:anywhere;line-height:1.25;">📍 ' + _sf(local) + '</div>'
        : '') +
      '</div>';

    // AGORA
    h += '<div style="display:flex;align-items:center;gap:10px;">' +
      _img(r.agora.icon, lg ? 52 : 44) +
      '<div style="min-width:0;flex:1;">' +
        '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;">' +
          '<span style="font-size:' + (lg ? '1.6rem' : '1.35rem') + ';font-weight:800;color:var(--text-bright);line-height:1;">' + r.agora.temp + '°</span>' +
          '<span style="font-size:0.66rem;font-weight:700;color:var(--sp-c-60a5fa,#60a5fa);text-transform:uppercase;letter-spacing:0.06em;">agora</span>' +
        '</div>' +
        '<div style="font-size:0.76rem;color:var(--sp-c-cbd5e1,#cbd5e1);text-transform:capitalize;margin-top:2px;">' + _sf(r.agora.desc) + '</div>' +
        '<div style="font-size:0.68rem;color:var(--sp-c-94a3b8,#94a3b8);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap;">' +
          '<span>💧 ' + r.agora.umidade + '%</span><span>💨 ' + r.agora.vento + ' km/h</span>' +
          (r.agora.chuva ? '<span>🌧️ ' + r.agora.chuva + '%</span>' : '') +
        '</div>' +
      '</div></div>';

    // HOJE
    if (r.hoje) {
      h += '<div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:8px;' +
        'border-top:1px solid var(--sp-b-255-255-255-008,rgba(255,255,255,0.08));">' +
        '<span style="font-size:0.7rem;font-weight:800;color:var(--sp-c-a5b4fc,#a5b4fc);text-transform:uppercase;letter-spacing:0.06em;min-width:42px;">hoje</span>' +
        _img(r.hoje.icon, 30) +
        '<span style="font-size:0.8rem;font-weight:700;color:var(--text-bright);">' +
          (r.hoje.min != null ? r.hoje.min + '°' : '—') + ' / ' + (r.hoje.max != null ? r.hoje.max + '°' : '—') + '</span>' +
        '<span style="flex:1;min-width:0;font-size:0.72rem;color:var(--sp-c-cbd5e1,#cbd5e1);text-transform:capitalize;overflow:hidden;' +
          'text-overflow:ellipsis;white-space:nowrap;">' + _sf(r.hoje.desc) + '</span>' +
        _pillChuva(r.hoje.chuva) +
      '</div>';
    }

    // ── PRÓXIMOS DIAS — DOBRÁVEL (2.1.25) ────────────────────────────────────
    // Ordem do dono: _"na previsao do tempo expande clicando em proximos dias (que deve
    // indicar como um mostrar mais/menos na linha dos proximos dias)"_.
    // A previsão inteira ocupava meia tela em cada card de torneio; o que ele quer ver
    // sempre é o AGORA e o HOJE. Os próximos dias ficam a um toque, e a escolha é lembrada.
    // ⛔ Nasce FECHADA — o pedido é justamente "ficar com apenas o que temos nas imagens".
    if (r.dias && r.dias.length) {
      var _corpoDias = '';
      r.dias.forEach(function (d) {
        _corpoDias += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">' +
          '<span style="font-size:0.72rem;font-weight:700;color:var(--sp-c-cbd5e1,#cbd5e1);text-transform:capitalize;min-width:42px;">' + _sf(d.nome) + '</span>' +
          _img(d.icon, 26) +
          '<span style="font-size:0.75rem;font-weight:600;color:var(--text-bright);">' +
            (d.min != null ? d.min + '°' : '—') + ' / ' + (d.max != null ? d.max + '°' : '—') + '</span>' +
          '<span style="flex:1;min-width:0;font-size:0.7rem;color:var(--sp-c-94a3b8,#94a3b8);text-transform:capitalize;overflow:hidden;' +
            'text-overflow:ellipsis;white-space:nowrap;">' + _sf(d.desc) + '</span>' +
          _pillChuva(d.chuva) +
        '</div>';
      });
      h += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--sp-b-255-255-255-008,rgba(255,255,255,0.08));">' +
        window._spDobra('previsao-proximos-dias',
          '<span style="font-size:0.62rem;font-weight:700;color:var(--sp-c-94a3b8,#94a3b8);text-transform:uppercase;' +
            'letter-spacing:0.06em;">próximos dias</span>',
          '<div style="margin-top:5px;">' + _corpoDias + '</div>',
          false) +
      '</div>';
    }

    h += '</div>';
    return h;
  };

  /**
   * Hidrata todo slot `[data-weather-slot]` do DOM. O slot carrega lat/lon como atributo,
   * então o render é síncrono e barato — a rede só entra depois, e uma vez por slot.
   */
  window._hydrateWeatherSlots = function () {
    var slots = document.querySelectorAll('[data-weather-slot]:not([data-w-done])');
    Array.prototype.forEach.call(slots, function (el) {
      var lat = el.getAttribute('data-lat'), lon = el.getAttribute('data-lon');
      if (!lat || !lon) return;
      el.setAttribute('data-w-done', '1');   // antes do await: re-render não re-dispara
      window._weatherFetch(lat, lon).then(function (d) {
        if (!document.body.contains(el)) return;   // saiu da tela no meio do caminho
        var r = window._weatherResumo(d, Date.now());
        el.innerHTML = r ? window._weatherWidgetHtml(r, el.getAttribute('data-size') || 'lg', el.getAttribute('data-venue') || '') : '';
      });
    });
  };

  // ⚠️ v1.8.82: OBSERVADOR — o slot se hidrata sozinho, venha de onde vier.
  // Antes cada tela precisava lembrar de chamar `_hydrateWeatherSlots` depois do render, e
  // foi assim que a previsão ficou três mensagens sem aparecer: ela existia na tela de
  // DETALHE e o dono estava na TELA INICIAL, onde ninguém a emitia nem hidratava. Com o
  // observador, quem emitir o slot (dashboard, detalhe, chave ou o que vier) ganha a
  // previsão de graça — não há mais lista de call sites pra esquecer.
  // Mesmo padrão do hidratador de foto de local (store.js). Debounce de 250ms porque o
  // app re-renderiza em rajada a cada snapshot do Firestore; e como o próprio slot se
  // marca com `data-w-done`, rodar demais não custa requisição.
  var _obsDeb = null;
  function _kickWeather() {
    if (_obsDeb) return;
    _obsDeb = setTimeout(function () {
      _obsDeb = null;
      try { window._hydrateWeatherSlots(); } catch (e) {}
    }, 250);
  }
  if (typeof MutationObserver === 'function' && document.body) {
    new MutationObserver(_kickWeather).observe(document.body, { childList: true, subtree: true });
  } else if (typeof MutationObserver === 'function') {
    document.addEventListener('DOMContentLoaded', function () {
      new MutationObserver(_kickWeather).observe(document.body, { childList: true, subtree: true });
      _kickWeather();
    });
  }

  /** O slot que o render do torneio insere. Vazio até a rede responder — nunca "carregando". */
  window._weatherSlotHtml = function (t, size) {
    if (!t || !t.venueLat || !t.venueLon) return '';
    return '<div data-weather-slot="1" data-venue="' + window._safeHtml(String(t.venue || '')) + '" data-lat="' + window._safeHtml(String(t.venueLat)) +
      '" data-lon="' + window._safeHtml(String(t.venueLon)) +
      '" data-size="' + (size === 'sm' ? 'sm' : 'lg') + '"></div>';
  };
})();
