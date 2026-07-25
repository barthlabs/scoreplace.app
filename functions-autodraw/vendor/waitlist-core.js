/* waitlist-core.js — CÂNONE DA LISTA DE ESPERA (extraído do store.js em jul/2026)
 *
 * A espera vive em TRÊS storages (t.waitlist + t.standbyParticipants + t.monarchWaitlist
 * por categoria). Quem lê tem que ler os três (_getWaitlist); quem tira alguém de lá tem
 * que tirar dos três (_removeFromWaitlist) — senão um vira resíduo e o painel mostra
 * gente fantasma.
 *
 * POR QUE VIVE NUM ARQUIVO PRÓPRIO (e não mais dentro do store.js) — mesmo motivo do
 * identity-core.js: a INTEGRAÇÃO TARDIA foi canonizada na Cloud Function
 * (integrateLateEntries), que roda o motor vendored. O motor chama
 * `window._removeFromWaitlist` ao formar um grupo Rei/Rainha a partir da espera
 * (bracket-logic.js, _tryFormMonarchWaitlistGroups) — mas o store.js NÃO carrega no
 * servidor (toca document no load). A chamada é protegida por `typeof === 'function'`,
 * então no servidor ela FALHAVA EM SILÊNCIO: os tardios entravam no grupo, jogavam e
 * classificavam, mas os nomes NUNCA saíam de standbyParticipants — ficavam na Lista de
 * Espera pra sempre, inclusive depois de avançar de fase (bug real, Confra jul/2026:
 * 8 placeholders jogaram a classificatória e continuaram na espera).
 * Espelhar no shim da CF criaria uma 2ª versão do código (o bug de versão que a
 * canonização quer matar). Extraído. Uma versão só, zero drift.
 *
 * REGRA: este arquivo é PURO — nada de document/AppStore/localStorage/firebase. Única dep
 * externa tolerada: window._pName (store.js no cliente, shim no servidor), sempre atrás de
 * `typeof`/truthy check.
 *
 * Carregado ANTES do store.js (index.html) e por tests.html / tests/headless.js /
 * functions-autodraw (vendor/, via copy-vendor no predeploy). Nada aqui roda no load.
 */

// Nome exibível de uma entrada (string OU objeto), sem depender do store.js.
function _wlName(e) {
  if (typeof window._pName === 'function') {
    var f = String(window._pName(e, '') || '').trim();
    if (f) return f;
  }
  if (typeof e === 'string') return e.trim();
  return String((e && (e.displayName || e.name || e.email)) || '').trim();
}

// LISTA DE ESPERA CANÔNICA: une os 3 storages, deduplicado por nome (lowercase).
// Entrada objeto volta como está; string vira {name, displayName}.
window._getWaitlist = function (t) {
  if (!t) return [];
  var out = [], seen = {};
  function add(e) {
    var nm = _wlName(e);
    if (!nm) return;
    var k = nm.toLowerCase();
    if (seen[k]) return; seen[k] = 1;
    out.push((e && typeof e === 'object') ? e : { name: nm, displayName: nm });
  }
  if (Array.isArray(t.waitlist)) t.waitlist.forEach(add);
  if (Array.isArray(t.standbyParticipants)) t.standbyParticipants.forEach(add);
  if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object' && !Array.isArray(t.monarchWaitlist)) {
    Object.keys(t.monarchWaitlist).forEach(function (cat) {
      var arr = t.monarchWaitlist[cat];
      if (Array.isArray(arr)) arr.forEach(add);
    });
  }
  return out;
};

// Formas do nome de um participante/entrada (cru displayName/name/email + formatado via
// _pName), em lowercase. Casa nomes que aparecem em formas diferentes (ex.: telefone cru
// "+5511981933576" vs formatado "+55 (11) 98193-3576").
window._nameForms = function (e) {
  var forms = [];
  if (typeof window._pName === 'function') { var f = String(window._pName(e, '') || ''); if (f) forms.push(f); }
  if (e && typeof e === 'object') {
    ['displayName', 'name', 'email'].forEach(function (k) { if (e[k]) forms.push(String(e[k])); });
  } else if (typeof e === 'string') { forms.push(e); }
  return forms.map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
};

// Remove um nome de TODOS os storages da espera. Casa nome cru/formatado.
// Retorna true se removeu algo.
window._removeFromWaitlist = function (t, name) {
  if (!t || !name) return false;
  var target = String(name).trim().toLowerCase();
  var removed = false;
  function matches(e) { return window._nameForms(e).indexOf(target) !== -1; }
  if (Array.isArray(t.waitlist)) {
    var b = t.waitlist.length; t.waitlist = t.waitlist.filter(function (e) { return !matches(e); });
    if (t.waitlist.length < b) removed = true;
  }
  if (Array.isArray(t.standbyParticipants)) {
    var b2 = t.standbyParticipants.length; t.standbyParticipants = t.standbyParticipants.filter(function (e) { return !matches(e); });
    if (t.standbyParticipants.length < b2) removed = true;
  }
  if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object' && !Array.isArray(t.monarchWaitlist)) {
    Object.keys(t.monarchWaitlist).forEach(function (cat) {
      var arr = t.monarchWaitlist[cat];
      if (Array.isArray(arr)) { var b3 = arr.length; t.monarchWaitlist[cat] = arr.filter(function (e) { return !matches(e); }); if (t.monarchWaitlist[cat].length < b3) removed = true; }
    });
  }
  return removed;
};

// Toda vez que se RE-DERIVA a espera (reset, re-sorteio) tem que limpar OS TRÊS storages.
// Retorna TODAS as pessoas que estavam na espera (deduplicadas) pra quem precisar
// devolvê-las ao pool.
window._clearAllWaitlists = function (t) {
  if (!t) return [];
  var collected = window._getWaitlist(t);
  t.waitlist = [];
  t.standbyParticipants = [];
  t.monarchWaitlist = {};
  return collected;
};

// Conjunto de nomes (lowercase) na espera — inclui membros de duplas "A / B".
window._waitlistNameSet = function (t) {
  var s = {};
  window._getWaitlist(t).forEach(function (e) {
    var nm = _wlName(e).toLowerCase();
    if (!nm) return;
    if (nm.indexOf('/') !== -1) nm.split('/').forEach(function (x) { var k = x.trim(); if (k) s[k] = 1; });
    else s[nm] = 1;
  });
  return s;
};

// SANEAMENTO IDEMPOTENTE: quem JÁ ESTÁ jogando não pode estar na espera.
// Varre todo mundo que aparece num grupo Rei/Rainha (t.rounds[].monarchGroups[].players)
// ou num grupo de fase (t.groups[].players) e tira da espera. Cura docs que ficaram sujos
// enquanto _removeFromWaitlist não existia no servidor, e é a rede de segurança pra
// qualquer caminho futuro que forme confronto e esqueça de limpar. Roda no cliente (render)
// e no servidor (integração tardia). Retorna nº de nomes removidos.
window._sanitizeWaitlistVsGroups = function (t) {
  if (!t) return 0;
  var playing = {};
  function collect(g) {
    if (!g) return;
    (g.players || []).forEach(function (n) {
      var nm = String(n || '').trim();
      if (!nm || nm === 'BYE' || nm === 'TBD') return;
      // dupla "A / B" no grupo → cada membro conta como jogando
      if (nm.indexOf(' / ') !== -1) nm.split(' / ').forEach(function (x) { var k = x.trim(); if (k) playing[k.toLowerCase()] = k; });
      else playing[nm.toLowerCase()] = nm;
    });
  }
  (t.rounds || []).forEach(function (r) { (r && r.monarchGroups || []).forEach(collect); });
  (t.groups || []).forEach(collect);
  var removed = 0;
  Object.keys(playing).forEach(function (k) {
    if (window._removeFromWaitlist(t, playing[k])) removed++;
  });
  return removed;
};
