/* agenda-core.js — A AGENDA DO SORTEIO AUTOMÁTICO, NO FUSO DO LOCAL DO EVENTO.  (L6.R1, 2.1.80)
 *
 * ⛔ O QUE ISTO SUBSTITUI, e por que não dava pra deixar como estava:
 * `_owedDrawSlotMs` (vendor/tournaments-utils.js) monta o horário com a string
 * `'...T19:00:00-03:00'` — um OFFSET FIXO cravado no código. Isso é o horário de Brasília
 * de hoje, não o horário do EVENTO: erra em Manaus, erra em Rio Branco, erra em qualquer
 * torneio fora do Brasil e voltaria a errar no dia em que o horário de verão voltar.
 * Aqui a conta é feita com IDENTIFICADOR IANA (`America/Manaus`), que carrega as regras de
 * horário de verão de cada data — é a única forma de "19:00 no local" continuar sendo 19:00
 * no local depois de uma virada de DST.
 *
 * ⛔ E O CALENDÁRIO ANDA EM DIAS CIVIS, não em 86.400.000 ms. Somar milissegundos atravessa
 * uma virada de DST e desloca o horário de parede em 1 h — a rodada das 19:00 viraria 18:00
 * e nunca mais casaria com o minuto agendado. Aqui soma-se DIA no calendário e só depois se
 * converte pro instante, então 19:00 continua 19:00 em toda rodada.
 *
 * ⛔ JANELA DE UM MINUTO. Regra do dono: a rodada automática só nasce no MESMO MINUTO LOCAL
 * do horário agendado. O Cloud Scheduler pode entrar alguns segundos depois do início do
 * minuto — isso vale. Virou o minuto, a janela morreu: NÃO se gera rodada atrasada, NÃO se
 * desliga o auto-sorteio, e o `nextDrawAt` anda pro PRÓXIMO horário de CALENDÁRIO.
 * ⛔ Nunca `agora + intervalo`: isso desloca o ciclo pra sempre. O slot k é sempre
 * `primeiroSorteio + k × intervalo`, no fuso do evento.
 *
 * ⛔ FUSO NÃO ADIVINHADO. Se a origem do fuso não for segura, esta camada devolve
 * `{ tz: null, motivo }` e quem chama NÃO GERA — com diagnóstico escrito. Chutar o fuso é
 * pior que não sortear: sortear na hora errada é um estrago que ninguém desfaz.
 * [[project_regressiva_da_rodada_e_por_rodada]] [[feedback_never_invent_config_to_silence_error]]
 *
 * PURO: sem firebase, sem rede, sem relógio implícito (todo `agora` é parâmetro).
 * Testes: functions-autodraw/test-agenda-core.js
 */
'use strict';

/* ── FUSOS DO BRASIL, por UF ───────────────────────────────────────────────────────────
 * Os nomes são os canônicos da IANA. As UFs do leste têm todas o MESMO offset e as mesmas
 * regras (sem horário de verão desde 2019), então usar o zone canônico de cada uma é
 * equivalente e mais honesto que apontar tudo pra `America/Sao_Paulo`.
 * ⚠️ AM e PA têm municípios em zona diferente da capital (o oeste). O mapa por UF acerta a
 * esmagadora maioria; quem estiver no oeste declara o fuso explicitamente (fonte `a`). */
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

/* Cidades desambiguadas à mão — só as que mudam a resposta em relação ao mapa por UF ou
 * que aparecem sem UF no texto. Lista curta DE PROPÓSITO: cidade que não estiver aqui cai
 * na UF, e sem UF cai em "não determinado". */
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

/* CAIXAS DE COORDENADA — conservadoras de propósito. Cada retângulo fica INTEIRO dentro de
 * uma zona; ponto que não cair em exatamente uma caixa devolve "não determinado". É melhor
 * recusar perto da divisa do que acertar 90% e errar 10% em silêncio.
 * [lonMin, lonMax, latMin, latMax] */
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

function _txt(x) { return String(x == null ? '' : x); }
function _norm(s) { return _txt(s).toLowerCase().trim().replace(/\s+/g, ' '); }

/** O identificador é um fuso IANA que este runtime conhece? */
function fusoValido(tz) {
  if (!tz || typeof tz !== 'string' || tz.indexOf('/') === -1) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}

/** Offset (ms) do fuso NAQUELE instante — é aqui que o horário de verão entra na conta. */
function _offsetMs(tz, utcMs) {
  var dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  var p = {};
  dtf.formatToParts(new Date(utcMs)).forEach(function (x) { p[x.type] = x.value; });
  var h = Number(p.hour); if (h === 24) h = 0;                       // ICU antigo devolve 24
  var comoUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), h, Number(p.minute), Number(p.second));
  return comoUtc - utcMs;
}

/** Partes do relógio LOCAL naquele instante — usado só por teste e diagnóstico. */
function partesLocais(ms, tz) {
  if (!fusoValido(tz) || typeof ms !== 'number' || isNaN(ms)) return null;
  var off = _offsetMs(tz, ms);
  var d = new Date(ms + off);
  return {
    ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(),
    hora: d.getUTCHours(), minuto: d.getUTCMinutes(), offsetMin: off / 60000
  };
}

/** "2026-09-04" + "19:00" no fuso `tz` → instante em ms (UTC). Duas passadas por causa
 *  das bordas de DST: a primeira estima o offset, a segunda confirma no instante certo. */
function instanteDoSlot(dataStr, horaStr, tz) {
  var fd = _txt(dataStr), ft = _txt(horaStr || '19:00');
  if (fd.indexOf('T') !== -1) { var pr = fd.split('T'); fd = pr[0]; if (pr[1]) ft = pr[1].slice(0, 5); }
  var md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fd);
  var mt = /^(\d{1,2}):(\d{2})/.exec(ft);
  if (!md || !mt || !fusoValido(tz)) return null;
  var y = Number(md[1]), mo = Number(md[2]), d = Number(md[3]);
  var h = Number(mt[1]), mi = Number(mt[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  var alvoParede = Date.UTC(y, mo - 1, d, h, mi, 0);
  var ms = alvoParede - _offsetMs(tz, alvoParede);
  ms = alvoParede - _offsetMs(tz, ms);
  return ms;
}

/** O slot de índice k: `primeiroSorteio + k × intervalo`, andando em DIAS CIVIS. */
function slotK(cfg, k, tz) {
  var fd = _txt(cfg && cfg.drawFirstDate);
  if (fd.indexOf('T') !== -1) fd = fd.split('T')[0];
  var md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fd);
  if (!md) return null;
  var intervalo = parseInt(cfg && cfg.drawIntervalDays, 10);
  var semRepeticao = !intervalo || intervalo < 1;
  if (semRepeticao && k !== 0) return null;                          // sorteio ÚNICO: só o slot 0
  var dias = semRepeticao ? 0 : k * intervalo;
  // aritmética de data CIVIL em UTC (não tem DST) e só então a conversão pro fuso
  var civil = new Date(Date.UTC(Number(md[1]), Number(md[2]) - 1, Number(md[3])) + dias * 86400000);
  var iso = civil.getUTCFullYear() + '-' +
    String(civil.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(civil.getUTCDate()).padStart(2, '0');
  return instanteDoSlot(iso, (cfg && cfg.drawFirstTime) || '19:00', tz);
}

/** Estimativa de k por diferença de tempo — a busca fina anda ±4 a partir daqui. */
function _kEstimado(cfg, alvoMs, tz) {
  var s0 = slotK(cfg, 0, tz);
  if (s0 == null) return null;
  var intervalo = parseInt(cfg && cfg.drawIntervalDays, 10);
  if (!intervalo || intervalo < 1) return 0;
  return Math.max(0, Math.floor((alvoMs - s0) / (intervalo * 86400000)));
}

/** O slot AGENDADO mais recente que já chegou (<= agora). `null` se nenhum chegou. */
function slotDevido(cfg, nowMs, tz) {
  var k = _kEstimado(cfg, nowMs, tz);
  if (k == null) return null;
  var achado = null;
  for (var i = Math.max(0, k - 4); i <= k + 4; i++) {
    var s = slotK(cfg, i, tz);
    if (s == null) continue;
    if (s <= nowMs && (achado == null || s > achado)) achado = s;
  }
  return achado;
}

/** O próximo slot ESTRITAMENTE futuro. ⛔ Nunca `agora + intervalo` — sempre calendário. */
function proximoSlotFuturo(cfg, nowMs, tz) {
  var k = _kEstimado(cfg, nowMs, tz);
  if (k == null) return null;
  var achado = null;
  for (var i = Math.max(0, k - 4); i <= k + 8; i++) {
    var s = slotK(cfg, i, tz);
    if (s == null) continue;
    if (s > nowMs && (achado == null || s < achado)) achado = s;
  }
  return achado;
}

/** Mesmo minuto de parede. Offsets de fuso são sempre múltiplos de minuto, então comparar
 *  o minuto ABSOLUTO é idêntico a comparar o minuto local — e não depende do fuso. */
function mesmoMinuto(aMs, bMs) {
  if (typeof aMs !== 'number' || typeof bMs !== 'number' || isNaN(aMs) || isNaN(bMs)) return false;
  return Math.floor(aMs / 60000) === Math.floor(bMs / 60000);
}

/* ── RESOLUÇÃO DO FUSO ─────────────────────────────────────────────────────────────────
 * Ordem do dono: (a) IANA explícito do evento; (b) local/cidade/endereço/coordenada do
 * evento; (c) cidade declarada do organizador; (d) não determinado → NÃO GERA.
 * `perfilOrganizador` é opcional e entra só no passo (c) — esta camada é pura, quem lê o
 * perfil é o chamador. */
function _porTexto(s) {
  var n = _norm(s);
  if (!n) return null;
  var cidades = Object.keys(FUSO_POR_CIDADE);
  for (var i = 0; i < cidades.length; i++) {
    if (n.indexOf(cidades[i]) !== -1) return FUSO_POR_CIDADE[cidades[i]];
  }
  var m = /(?:^|[,\s\-/])([a-z]{2})(?:$|[,\s\-/.])/gi;
  var achados = {}, x;
  while ((x = m.exec(_txt(s))) !== null) {
    var uf = x[1].toUpperCase();
    if (FUSO_POR_UF[uf]) achados[FUSO_POR_UF[uf]] = 1;
  }
  var ks = Object.keys(achados);
  return ks.length === 1 ? ks[0] : null;        // dois estados no texto = ambíguo = recusa
}

function _porCoordenada(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  var hits = {};
  CAIXAS.forEach(function (c) {
    if (lon >= c.b[0] && lon <= c.b[1] && lat >= c.b[2] && lat <= c.b[3]) hits[c.tz] = 1;
  });
  var ks = Object.keys(hits);
  return ks.length === 1 ? ks[0] : null;        // fora de tudo, ou em duas caixas = recusa
}

function resolverFuso(t, perfilOrganizador) {
  t = t || {};
  // (a) declarado no evento — ganha de tudo
  var exp = t.timeZone || t.timezone || t.fusoHorario;
  if (exp) {
    if (fusoValido(exp)) return { tz: exp, fonte: 'evento.timeZone' };
    return { tz: null, motivo: 'timeZone declarado inválido: ' + _txt(exp).slice(0, 40) };
  }
  // (b) local do evento — coordenada primeiro (mais específica), depois texto
  var porCoord = _porCoordenada(
    typeof t.venueLat === 'number' ? t.venueLat : null,
    typeof t.venueLon === 'number' ? t.venueLon : null
  );
  if (porCoord) return { tz: porCoord, fonte: 'evento.coordenada' };
  var porTexto = _porTexto(_txt(t.venueAddress) + ' | ' + _txt(t.venueCity) + ' | ' + _txt(t.venue));
  if (porTexto) return { tz: porTexto, fonte: 'evento.local' };
  // (c) cidade declarada do organizador
  var p = perfilOrganizador || {};
  if (p.timeZone && fusoValido(p.timeZone)) return { tz: p.timeZone, fonte: 'organizador.timeZone' };
  var porOrg = _porTexto(_txt(p.city) + ' | ' + _txt(p.cidade) + ' | ' + _txt(p.state));
  if (porOrg) return { tz: porOrg, fonte: 'organizador.cidade' };
  // (d) não determinado — quem chama NÃO gera, e diz por quê
  return { tz: null, motivo: 'sem fuso: evento sem timeZone, sem coordenada utilizável e sem local reconhecido; organizador sem cidade' };
}

/* ── TRAVA DE SLOT: manual × automático ────────────────────────────────────────────────
 * A rodada de UM slot agendado nasce UMA vez, não importa quem chegou primeiro. A marca
 * mora no próprio documento (`drawSlotAt` = o slot reivindicado, em ms) e é gravada DENTRO
 * da mesma transação que grava a rodada — é a transação do Firestore que serializa: quem
 * perder a corrida re-executa, relê a marca e desiste.
 * ⛔ Não é estado local, não é listener, não é timeout, não é best-effort.
 * ⚠️ `lastAutoDrawAt` continua sendo escrito junto porque o restante do sistema (a agenda
 * do cliente, a régua de "já sorteou este slot") lê ele — mas quem DECIDE é `drawSlotAt`,
 * que é exato: um número, comparado por igualdade. */
function slotReivindicado(t, slotMs) {
  if (!t || typeof slotMs !== 'number') return false;
  return Number(t.drawSlotAt) === slotMs;
}

/** Reivindica o slot no objeto `t` (que será gravado pela transação). `false` = já era de
 *  outro — quem chamou NÃO pode gerar. */
function reivindicarSlot(t, slotMs) {
  if (!t || typeof slotMs !== 'number' || isNaN(slotMs)) return false;
  if (slotReivindicado(t, slotMs)) return false;
  t.drawSlotAt = slotMs;
  t.lastAutoDrawAt = new Date(slotMs).toISOString();
  return true;
}

/** A configuração de agenda de uma fonte (o torneio, ou a fase quando ela tem agenda própria). */
function cfgDeAgenda(fonte) {
  return {
    drawFirstDate: fonte && fonte.drawFirstDate,
    drawFirstTime: fonte && fonte.drawFirstTime,
    drawIntervalDays: fonte && fonte.drawIntervalDays
  };
}

/* O `nextDrawAt` CANÔNICO: o instante que o banco deve guardar depois de qualquer escrita.
 * ⛔ NUNCA devolve passado. Se o slot devido ainda está no MINUTO dele e ninguém o
 * reivindicou, ele continua sendo o alvo (é a janela viva); em qualquer outro caso, o alvo é
 * o próximo slot do CALENDÁRIO. É isto que impede a agenda de recolocar no banco um horário
 * já vencido — o defeito que deixava o documento preso na query do cron pra sempre. */
function agendamentoCanonico(cfg, t, nowMs, tz) {
  if (!fusoValido(tz)) return null;
  var devido = slotDevido(cfg, nowMs, tz);
  if (devido != null && mesmoMinuto(nowMs, devido) && !slotReivindicado(t, devido)) return devido;
  return proximoSlotFuturo(cfg, nowMs, tz);
}

module.exports = {
  FUSO_POR_UF: FUSO_POR_UF, FUSO_POR_CIDADE: FUSO_POR_CIDADE, CAIXAS: CAIXAS,
  cfgDeAgenda: cfgDeAgenda, agendamentoCanonico: agendamentoCanonico,
  fusoValido: fusoValido, partesLocais: partesLocais, instanteDoSlot: instanteDoSlot,
  slotK: slotK, slotDevido: slotDevido, proximoSlotFuturo: proximoSlotFuturo,
  mesmoMinuto: mesmoMinuto, resolverFuso: resolverFuso,
  slotReivindicado: slotReivindicado, reivindicarSlot: reivindicarSlot
};
