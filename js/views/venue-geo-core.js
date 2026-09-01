/* venue-geo-core.js — O LOCAL DO EVENTO COM TIPO CANÔNICO.  (L6.R2.1, 2.1.81)
 *
 * ⛔ A CAUSA-RAIZ QUE ISTO FECHA, medida na L6.R2.P0:
 * o seletor do Google Places entrega `place.location.lat()` — um NÚMERO — e o código fazia
 * `latEl.value = place.location.lat()`. Atribuir a `.value` de um input CONVERTE PRA TEXTO,
 * e o payload levava esse texto cru pro banco: `venueLat: "-23.5613"`, string.
 * Do outro lado, `functions-autodraw/agenda-core.js` só aceita coordenada quando ela é
 * `typeof === 'number'` — então a alínea de coordenada da resolução de fuso estava MORTA POR
 * TIPO, não por falta de dado. Sete leitores do app já contornavam com `Number`/`parseFloat`
 * na leitura; o resolvedor era o único que exigia o número cru, e por isso nunca resolvia.
 *
 * ⛔ E A CIDADE ESTRUTURADA ERA JOGADA FORA: a tela já extraía `locality` de
 * `place.addressComponents` e usava só pra montar o rótulo `"Nome, Cidade"`. O dado
 * estruturado existia na mão do organizador, no instante da criação, e não era persistido.
 *
 * ⛔ O QUE ESTE MÓDULO **NÃO** FAZ, e é decisão: não deduz fuso. Nada de
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` (é o fuso de QUEM CRIA, não o do
 * evento — um organizador viajando cadastraria o torneio no fuso errado e ninguém veria),
 * nada de UTC, offset fixo ou fuso do servidor. Ele só faz o dado do LOCAL chegar ao banco
 * com o tipo certo, pra o resolvedor que já existe conseguir usá-lo.
 * [[feedback_never_invent_config_to_silence_error]]
 *
 * FRONTEIRA ÚNICA: criação, edição e template chamam `normalizarLocal` no MESMO ponto — o
 * payload. Duas normalizações divergem, e divergir num tipo é voltar ao bug de origem.
 * [[feedback_unify_dual_entry_points]]
 *
 * PURO: sem DOM, sem rede, sem relógio. Testes: tests/venue-geo-core.test.js
 */
(function () {
  'use strict';

  var LIMITES = { latMin: -90, latMax: 90, lonMin: -180, lonMax: 180 };

  /* Número finito, ou `null`. Aceita string porque é dela que o input vem — o contrato do
   * BANCO é number|null, mas o contrato da ENTRADA é "o que o formulário der". */
  function _numero(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (!s) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;      // "abc" → NaN → null; "" já saiu acima
  }

  function latitude(v) {
    var n = _numero(v);
    if (n === null || n < LIMITES.latMin || n > LIMITES.latMax) return null;
    return n;
  }
  function longitude(v) {
    var n = _numero(v);
    if (n === null || n < LIMITES.lonMin || n > LIMITES.lonMax) return null;
    return n;
  }

  function _texto(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    return s || null;
  }

  /* Normaliza EM CIMA do objeto recebido (o payload) e devolve o mesmo objeto.
   * ⛔ COORDENADA É PAR: se um dos lados não sobrevive, os DOIS viram `null`. Meia
   * coordenada não localiza nada e ainda passaria por "tem dado" em qualquer leitor
   * que só testa um dos campos. */
  function normalizarLocal(payload) {
    var o = payload || {};
    var la = latitude(o.venueLat);
    var lo = longitude(o.venueLon);
    if (la === null || lo === null) { la = null; lo = null; }
    o.venueLat = la;
    o.venueLon = lo;
    if ('venueCity' in o) o.venueCity = _texto(o.venueCity);
    if ('venueState' in o) o.venueState = _texto(o.venueState);
    if ('venueCountry' in o) o.venueCountry = _texto(o.venueCountry);
    return o;
  }

  /* Os campos estruturados que o Google Places devolve. Formato NOVO da API
   * (`addressComponents` com `longText`/`shortText`/`types`).
   *   • cidade  → `locality`, e `administrative_area_level_2` como segunda opção (é o que a
   *               tela já usava pro rótulo, e no Brasil é o município);
   *   • estado  → `administrative_area_level_1`, pelo `shortText` ("SP") — é a forma que o
   *               reconhecedor de texto do resolvedor sabe casar;
   *   • país    → `country`, pelo `shortText` ("BR").
   * Componente ausente vira `null`; nada é inventado. */
  function doPlaces(addressComponents) {
    var out = { venueCity: null, venueState: null, venueCountry: null };
    var lista = Array.isArray(addressComponents) ? addressComponents : [];
    var nivel2 = null;
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i] || {};
      var tipos = Array.isArray(c.types) ? c.types : [];
      if (tipos.indexOf('locality') !== -1 && !out.venueCity) out.venueCity = _texto(c.longText || c.long_name);
      if (tipos.indexOf('administrative_area_level_2') !== -1 && !nivel2) nivel2 = _texto(c.longText || c.long_name);
      if (tipos.indexOf('administrative_area_level_1') !== -1 && !out.venueState) {
        out.venueState = _texto(c.shortText || c.short_name || c.longText || c.long_name);
      }
      if (tipos.indexOf('country') !== -1 && !out.venueCountry) {
        out.venueCountry = _texto(c.shortText || c.short_name || c.longText || c.long_name);
      }
    }
    if (!out.venueCity) out.venueCity = nivel2;      // município, quando não veio `locality`
    return out;
  }


  /* ── ESPELHO DA RESOLUÇÃO DE FUSO, SÓ PARA O AVISO DA TELA  (L6.R2.1) ────────────────
   * ⛔ ISTO É UMA SEGUNDA CÓPIA DE UMA REGRA, e cópia de regra é como este projeto já
   * perdeu dado mais de uma vez. Ela existe por uma razão concreta e um bloqueio real:
   * quem resolve o fuso de verdade é `functions-autodraw/agenda-core.js`, que roda no
   * SERVIDOR e termina em `module.exports` — não carrega no navegador —, e a leva que
   * pediu este aviso proibiu alterar o autodraw. Sem espelho, o aviso teria que adivinhar
   * ("tem texto no campo?") e diria "está tudo certo" para um local que o servidor recusa:
   * um verde falso é pior que aviso nenhum.
   * ⭐ O QUE TORNA A CÓPIA ACEITÁVEL É O GATE: `tests/venue-geo-core.test.js` compara as
   * TRÊS tabelas com as de `agenda-core` e roda uma bateria de casos pelos DOIS lados,
   * exigindo resposta idêntica. Divergiu, fica vermelho. É o mesmo desenho do
   * `check-vendor-fresh` pro vendor do autoDraw. [[feedback_unify_dual_entry_points]]
   * ⛔ E o espelho NÃO decide nada: ele só acende ou apaga um aviso. Quem não gera sorteio
   * sem fuso continua sendo o servidor. */
  var FUSO_POR_UF = {
  AC: 'America/Rio_Branco',   AM: 'America/Manaus',      RR: 'America/Boa_Vista',
  RO: 'America/Porto_Velho',  MT: 'America/Cuiaba',      MS: 'America/Campo_Grande',
  PA: 'America/Belem',        AP: 'America/Belem',       TO: 'America/Araguaina',
  MA: 'America/Fortaleza',    PI: 'America/Fortaleza',   CE: 'America/Fortaleza',
  RN: 'America/Fortaleza',    PB: 'America/Recife',      PE: 'America/Recife',
  AL: 'America/Maceio',       SE: 'America/Maceio',      BA: 'America/Bahia',
  MG: 'America/Sao_Paulo',    ES: 'America/Sao_Paulo',   RJ: 'America/Sao_Paulo',
  SP: 'America/Sao_Paulo',    PR: 'America/Sao_Paulo',   SC: 'America/Sao_Paulo',
  RS: 'America/Sao_Paulo',    GO: 'America/Sao_Paulo',   DF: 'America/Sao_Paulo'
};

  var FUSO_POR_CIDADE = {
  'rio branco': 'America/Rio_Branco', 'manaus': 'America/Manaus', 'boa vista': 'America/Boa_Vista',
  'porto velho': 'America/Porto_Velho', 'cuiaba': 'America/Cuiaba', 'cuiabá': 'America/Cuiaba',
  'campo grande': 'America/Campo_Grande', 'belem': 'America/Belem', 'belém': 'America/Belem',
  'macapa': 'America/Belem', 'macapá': 'America/Belem', 'palmas': 'America/Araguaina',
  'fernando de noronha': 'America/Noronha',
  'sao paulo': 'America/Sao_Paulo', 'são paulo': 'America/Sao_Paulo',
  'rio de janeiro': 'America/Sao_Paulo', 'belo horizonte': 'America/Sao_Paulo',
  'curitiba': 'America/Sao_Paulo', 'porto alegre': 'America/Sao_Paulo',
  'florianopolis': 'America/Sao_Paulo', 'florianópolis': 'America/Sao_Paulo',
  'brasilia': 'America/Sao_Paulo', 'brasília': 'America/Sao_Paulo',
  'goiania': 'America/Sao_Paulo', 'goiânia': 'America/Sao_Paulo',
  'vitoria': 'America/Sao_Paulo', 'vitória': 'America/Sao_Paulo',
  'salvador': 'America/Bahia', 'recife': 'America/Recife', 'joao pessoa': 'America/Recife',
  'joão pessoa': 'America/Recife', 'maceio': 'America/Maceio', 'maceió': 'America/Maceio',
  'aracaju': 'America/Maceio', 'fortaleza': 'America/Fortaleza', 'natal': 'America/Fortaleza',
  'teresina': 'America/Fortaleza', 'sao luis': 'America/Fortaleza', 'são luís': 'America/Fortaleza'
};

  var CAIXAS = [
  { tz: 'America/Rio_Branco',   b: [-73.9, -68.0, -11.0,  -7.2] },   // Acre
  { tz: 'America/Manaus',       b: [-66.5, -58.5,  -8.5,   1.0] },   // Amazonas central/leste
  { tz: 'America/Boa_Vista',    b: [-63.5, -60.0,   1.5,   4.5] },   // Roraima
  { tz: 'America/Porto_Velho',  b: [-65.0, -61.0, -12.5,  -9.5] },   // Rondônia
  { tz: 'America/Cuiaba',       b: [-58.0, -51.5, -17.0, -10.0] },   // Mato Grosso
  { tz: 'America/Campo_Grande', b: [-57.0, -52.0, -23.5, -18.5] },   // Mato Grosso do Sul
  { tz: 'America/Noronha',      b: [-32.6, -32.3,  -4.0,  -3.7] },   // Fernando de Noronha
  { tz: 'America/Sao_Paulo',    b: [-51.0, -39.0, -33.5, -14.5] }    // Sudeste/Sul (leste, UTC-3)
];

  function _normTxt(s) { return (s === null || s === undefined ? '' : String(s)).toLowerCase().trim().replace(/\s+/g, ' '); }

  function _fusoValido(tz) {
    if (!tz || typeof tz !== 'string' || tz.indexOf('/') === -1) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
  }

  function _porTexto(s) {
    var n = _normTxt(s);
    if (!n) return null;
    var cidades = Object.keys(FUSO_POR_CIDADE);
    for (var i = 0; i < cidades.length; i++) {
      if (n.indexOf(cidades[i]) !== -1) return FUSO_POR_CIDADE[cidades[i]];
    }
    var m = /(?:^|[,\s\-/])([a-z]{2})(?:$|[,\s\-/.])/gi;
    var achados = {}, x;
    var bruto = (s === null || s === undefined) ? '' : String(s);
    while ((x = m.exec(bruto)) !== null) {
      var uf = x[1].toUpperCase();
      if (FUSO_POR_UF[uf]) achados[FUSO_POR_UF[uf]] = 1;
    }
    var ks = Object.keys(achados);
    return ks.length === 1 ? ks[0] : null;
  }

  function _porCoordenada(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) return null;
    if (lat === 0 && lon === 0) return null;
    var hits = {};
    CAIXAS.forEach(function (c) {
      if (lon >= c.b[0] && lon <= c.b[1] && lat >= c.b[2] && lat <= c.b[3]) hits[c.tz] = 1;
    });
    var ks = Object.keys(hits);
    return ks.length === 1 ? ks[0] : null;
  }

  /* Mesma ordem e mesmas respostas de `agenda-core.resolverFuso` — o gate exige isso. */
  function resolverFuso(t, perfilOrganizador) {
    t = t || {};
    var exp = t.timeZone || t.timezone || t.fusoHorario;
    if (exp) {
      if (_fusoValido(exp)) return { tz: exp, fonte: 'evento.timeZone' };
      return { tz: null, motivo: 'timeZone declarado inválido: ' + String(exp).slice(0, 40) };
    }
    var porCoord = _porCoordenada(
      typeof t.venueLat === 'number' ? t.venueLat : null,
      typeof t.venueLon === 'number' ? t.venueLon : null
    );
    if (porCoord) return { tz: porCoord, fonte: 'evento.coordenada' };
    var porTexto = _porTexto(
      (t.venueAddress == null ? '' : String(t.venueAddress)) + ' | ' +
      (t.venueCity == null ? '' : String(t.venueCity)) + ' | ' +
      (t.venue == null ? '' : String(t.venue))
    );
    if (porTexto) return { tz: porTexto, fonte: 'evento.local' };
    var p = perfilOrganizador || {};
    if (p.timeZone && _fusoValido(p.timeZone)) return { tz: p.timeZone, fonte: 'organizador.timeZone' };
    var porOrg = _porTexto(
      (p.city == null ? '' : String(p.city)) + ' | ' +
      (p.cidade == null ? '' : String(p.cidade)) + ' | ' +
      (p.state == null ? '' : String(p.state))
    );
    if (porOrg) return { tz: porOrg, fonte: 'organizador.cidade' };
    return { tz: null, motivo: 'sem fuso: evento sem timeZone, sem coordenada utilizável e sem local reconhecido; organizador sem cidade' };
  }

  /** `true` quando alguma das fontes PERMITIDAS resolve. Nada de aparelho, servidor ou UTC. */
  function fusoResolvivel(t, perfilOrganizador) {
    return !!resolverFuso(t, perfilOrganizador).tz;
  }

  var API = {
    LIMITES: LIMITES,
    latitude: latitude,
    longitude: longitude,
    normalizarLocal: normalizarLocal,
    doPlaces: doPlaces,
    FUSO_POR_UF: FUSO_POR_UF, FUSO_POR_CIDADE: FUSO_POR_CIDADE, CAIXAS: CAIXAS,
    resolverFuso: resolverFuso, fusoResolvivel: fusoResolvivel
  };

  if (typeof window !== 'undefined') window._venueGeo = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
