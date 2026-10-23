/* Operações da mesa: eleição regional por torneio/dia e retry pela mesma intenção.
 * A configuração é um artefato estático do deploy, produzido só após verificar
 * as mesmas imagens nas três regiões. Nenhum nome de atleta ou token vai nele. */
(function () {
  'use strict';
  var OPERATIONS = {
    assignMatchCourt: 'sp-op-court-v2',
    applyMatchResult: 'sp-op-score-v2',
    setTournamentPresence: 'sp-op-presence-v2',
    setTournamentPresenceWithWOSubstitution: 'sp-op-presence-wo-v2',
    endMatchOnCourt: 'sp-op-end-court-v2'
  };
  var CONTROL = 'sp-op-control-v2';
  var STORAGE = 'sp-operation-pending-v2';
  var MAX_AGE = 7 * 86400000;
  var configPromise = null;
  var selection = new Map();
  var aligning = new Map();

  function fail(message, code, infrastructure) {
    return Object.assign(new Error(message), { code: 'functions/' + code, infrastructure: !!infrastructure });
  }
  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') throw fail('Navegador sem gerador seguro de operações.', 'failed-precondition');
    var bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.from(bytes, function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }
  function readPending() {
    try { return JSON.parse(localStorage.getItem(STORAGE) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function writePending(all) {
    try { localStorage.setItem(STORAGE, JSON.stringify(all)); }
    catch (_) { throw fail('Armazenamento local indisponível; não é seguro repetir esta ação.', 'failed-precondition'); }
  }
  function intentKey(name, payload) {
    return [name, String(payload.tournamentId || ''), String(payload.matchId || payload.targetKey || payload.targetUid || payload.targetName || '')].join('|');
  }
  function withoutId(payload) {
    var copy = Object.assign({}, payload); delete copy.operationId; return JSON.stringify(copy);
  }
  function progress(open) {
    var id = 'sp-region-align-progress';
    var node = document.getElementById(id);
    if (open && !node) {
      node = document.createElement('div'); node.id = id;
      node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
      node.style.cssText = 'position:fixed;z-index:2147483640;left:50%;top:24px;transform:translateX(-50%);background:#10243a;color:#fff;border:1px solid #51c5ee;border-radius:12px;padding:12px 18px;box-shadow:0 8px 30px #0009;font-weight:700';
      node.textContent = 'Alinhando servidores…'; document.body.appendChild(node);
    } else if (!open && node) node.remove();
  }
  function loadConfig() {
    if (!configPromise) configPromise = fetch('/operation-regions.json?v=' +
      encodeURIComponent(String(window.SCOREPLACE_VERSION || '2')), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw fail('Contingência ainda não publicada. Atualize o aplicativo.', 'unavailable');
      return r.json();
    }).then(function (cfg) {
      if (!cfg || cfg.schema !== 2 || !Array.isArray(cfg.regions) || cfg.regions.length < 2 || !cfg.services) {
        throw fail('Configuração regional inválida.', 'failed-precondition');
      }
      Object.keys(OPERATIONS).concat(['tournamentOperationControl']).forEach(function (name) {
        var service = name === 'tournamentOperationControl' ? CONTROL : OPERATIONS[name];
        if (!cfg.services[service] || !cfg.services[service].digest) throw fail('Porta regional ausente.', 'failed-precondition');
        cfg.regions.forEach(function (region) {
          if (!cfg.services[service].urls || !/^https:\/\//.test(cfg.services[service].urls[region])) {
            throw fail('Endereço regional ausente.', 'failed-precondition');
          }
        });
      });
      return cfg;
    }).catch(function (error) { configPromise = null; throw error; });
    return configPromise;
  }
  function url(cfg, region, name) {
    var service = name === 'tournamentOperationControl' ? CONTROL : OPERATIONS[name];
    return cfg.services[service].urls[region];
  }
  async function post(endpoint, payload, headers, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, ms || 12000);
    var response;
    try {
      response = await fetch(endpoint, { method: 'POST', headers: headers,
        body: JSON.stringify({ data: payload }), signal: ctrl.signal });
      var data = await response.json().catch(function () { return {}; });
      if (data && data.error) {
        var status = String(data.error.status || 'internal').toLowerCase().replace(/_/g, '-');
        throw fail(data.error.message || 'Operação recusada.', status, response.status >= 500);
      }
      if (!response.ok) throw fail('Servidor HTTP ' + response.status, 'unavailable', response.status >= 500);
      return data.result || {};
    } catch (error) {
      if (error && error.code) throw error;
      throw fail('Sem resposta do servidor; a ação será conferida antes de repetir.', 'unavailable', true);
    } finally { clearTimeout(timer); }
  }
  async function probe(cfg, region, headers) {
    var started = performance.now();
    await Promise.all(Object.keys(OPERATIONS).concat(['tournamentOperationControl']).map(async function (name) {
      var service = name === 'tournamentOperationControl' ? CONTROL : OPERATIONS[name];
      var answer = await post(url(cfg, region, name), { probe: true }, headers, 7000);
      if (!answer.ok || answer.region !== region || answer.sourceDigest !== cfg.services[service].digest) {
        throw fail('Revisão regional divergente.', 'failed-precondition', true);
      }
    }));
    return { region: region, latency: performance.now() - started };
  }
  async function healthy(cfg, headers) {
    var results = await Promise.allSettled(cfg.regions.map(function (region) { return probe(cfg, region, headers); }));
    var list = results.filter(function (item) { return item.status === 'fulfilled'; }).map(function (item) { return item.value; });
    list.sort(function (a, b) { return a.latency - b.latency; });
    if (!list.length) throw fail('Nenhuma região validada. A ação não foi enviada.', 'unavailable', true);
    return list;
  }
  async function control(cfg, region, payload, headers) {
    return post(url(cfg, region, 'tournamentOperationControl'), payload, headers, 10000);
  }
  async function align(cfg, tId, sandbox, headers) {
    var existing = selection.get(tId);
    if (existing) {
      try {
        var state = await control(cfg, existing.region, { action: 'current', tournamentId: tId, sandbox: sandbox }, headers);
        if (state.selected && state.day === existing.day) {
          selection.set(tId, state); return state;
        }
      } catch (_) { /* Só então sondar todas as regiões. */ }
    }
    if (aligning.has(tId)) return aligning.get(tId);
    var task = (async function () {
      progress(true);
      try {
        var list = await healthy(cfg, headers);
        var state = await control(cfg, list[0].region, { action: 'current', tournamentId: tId, sandbox: sandbox }, headers);
        if (!state.selected) {
          state = await control(cfg, list[0].region, { action: 'select', tournamentId: tId, sandbox: sandbox,
            region: list[0].region, sourceDigest: cfg.services[CONTROL].digest }, headers);
        } else if (!list.some(function (item) { return item.region === state.region; })) {
          var next = list.find(function (item) { return item.region !== state.region; });
          if (!next) throw fail('Região fixada indisponível e sem alternativa.', 'unavailable', true);
          state = await control(cfg, next.region, { action: 'failover', tournamentId: tId, sandbox: sandbox,
            region: next.region, observedRevision: state.revision, reason: 'infrastructure',
            sourceDigest: cfg.services[CONTROL].digest }, headers);
        }
        selection.set(tId, state);
        return state;
      } finally { progress(false); aligning.delete(tId); }
    })();
    aligning.set(tId, task);
    return task;
  }
  async function findReceipt(cfg, regions, payload, headers) {
    for (var i = 0; i < regions.length; i++) {
      try {
        var answer = await control(cfg, regions[i], { action: 'receipt', tournamentId: payload.tournamentId,
          sandbox: payload.sandbox === true, operationId: payload.operationId }, headers);
        if (answer.found) return answer.receipt.response || { ok: true, replayed: true, requiresRefresh: true };
        return null;
      } catch (error) { if (!error.infrastructure) throw error; }
    }
    throw fail('Não foi possível conferir o recibo. A ação continua pendente.', 'unavailable', true);
  }
  async function call(name, input, headers) {
    if (!OPERATIONS[name]) throw fail('Operação desconhecida.', 'invalid-argument');
    var payload = Object.assign({}, input || {});
    var tId = String(payload.tournamentId || '');
    if (!tId) throw fail('Torneio não informado.', 'invalid-argument');
    var cfg = await loadConfig();
    var key = intentKey(name, payload);
    var all = readPending(); var old = all[key];
    var uid = window.firebase.auth().currentUser && window.firebase.auth().currentUser.uid;
    if (old && old.actorUid !== uid) throw fail('Há uma ação pendente de outra conta neste navegador.', 'failed-precondition');
    if (old && Date.now() - old.createdAt > MAX_AGE) throw fail('Esta ação pendente passou de sete dias; confira o torneio antes de repetir.', 'failed-precondition');
    if (old && withoutId(old.payload) !== withoutId(payload)) throw fail('Há uma ação anterior sem confirmação para este jogo. Confira antes de mudar.', 'failed-precondition');
    payload.operationId = old ? old.payload.operationId : (payload.operationId || uuid());
    if (!old) { all[key] = { name: name, payload: payload, actorUid: uid, createdAt: Date.now() }; writePending(all); }
    try {
      var state = await align(cfg, tId, payload.sandbox === true, headers);
      var answer;
      try { answer = await post(url(cfg, state.region, name), payload, headers, 20000); }
      catch (error) {
        if (!error.infrastructure) throw error;
        var list = await healthy(cfg, headers);
        var available = list.map(function (item) { return item.region; });
        var found = await findReceipt(cfg, available, payload, headers);
        if (found) { answer = Object.assign({}, found, { replayed: true, requiresRefresh: true }); }
        else {
          var alternative = list.find(function (item) { return item.region !== state.region; });
          if (!alternative) throw error;
          var next = await control(cfg, alternative.region, { action: 'failover', tournamentId: tId,
            sandbox: payload.sandbox === true, region: alternative.region, observedRevision: state.revision,
            reason: 'infrastructure', sourceDigest: cfg.services[CONTROL].digest }, headers);
          selection.set(tId, next);
          answer = await post(url(cfg, next.region, name), payload, headers, 20000);
        }
      }
      delete all[key]; writePending(all);
      return answer;
    } catch (error) {
      if (!error.infrastructure) { delete all[key]; writePending(all); }
      throw error;
    }
  }
  window.ScoreplaceOperationRouter = { call: call, names: Object.keys(OPERATIONS) };
})();
