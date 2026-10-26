/* Operações da mesa: eleição regional por torneio/dia e retry pela mesma intenção.
 * A configuração é um artefato estático do deploy, produzido só após verificar
 * as mesmas imagens nas regiões anunciadas. Nenhum nome de atleta ou token vai nele. */
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
  var CENTRAL_END_COURT = 'https://endmatchoncourt-4f45krjr3a-uc.a.run.app';
  var STORAGE = 'sp-operation-pending-v2';
  var MAX_AGE = 7 * 86400000;
  var configPromise = null;
  var selection = new Map();
  var aligning = new Map();
  var inFlight = new Map();
  var progressCount = 0;

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
  function progress(open, region) {
    var id = 'sp-region-align-progress';
    var node = document.getElementById(id);
    if (open) progressCount++;
    else progressCount = Math.max(0, progressCount - 1);
    if (!open && progressCount) return;
    if (open && !node) {
      node = document.createElement('div'); node.id = id;
      node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
      node.style.cssText = 'position:fixed;z-index:2147483640;left:50%;top:50%;transform:translate(-50%,-50%);background:#10243a;color:#fff;border:1px solid #51c5ee;border-radius:12px;padding:20px 26px;box-shadow:0 8px 30px #0009;font-weight:700';
      node.textContent = 'Alinhando servidores e gravando…'; document.body.appendChild(node);
    } else if (open && node) {
      clearTimeout(node._removeTimer);
      node.textContent = 'Alinhando servidores e gravando…';
    } else if (!open && node) {
      if (region) {
        node.textContent = 'Operação confirmada em ' + region;
        node._removeTimer = setTimeout(function () { if (node.isConnected) node.remove(); }, 900);
      } else node.remove();
    }
  }
  function fetchConfig(path, schema) {
      return fetch(path + '?v=' + encodeURIComponent(String(window.SCOREPLACE_VERSION || '3')),
        { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw fail('Contingência ainda não publicada. Atualize o aplicativo.', 'unavailable');
        return r.json();
      }).then(function (cfg) {
      if (!cfg || cfg.schema !== schema || !Array.isArray(cfg.regions) ||
          cfg.regions.length !== (schema === 3 ? 5 : 3) ||
          new Set(cfg.regions).size !== cfg.regions.length || !cfg.services) {
        throw fail('Configuração regional inválida.', 'failed-precondition');
      }
      Object.keys(OPERATIONS).concat(['tournamentOperationControl']).forEach(function (name) {
        var service = (name === 'tournamentOperationControl' ? CONTROL : OPERATIONS[name])
          .replace(/-v2$/, '-v' + schema);
        if (!cfg.services[service] || !cfg.services[service].digest) throw fail('Porta regional ausente.', 'failed-precondition');
        cfg.regions.forEach(function (region) {
          if (!cfg.services[service].urls || !/^https:\/\//.test(cfg.services[service].urls[region])) {
            throw fail('Endereço regional ausente.', 'failed-precondition');
          }
        });
      });
      return cfg;
      });
  }
  function loadConfig() {
    if (!configPromise) configPromise = fetchConfig('/operation-regions-v3.json', 3)
      .catch(function () { return fetchConfig('/operation-regions.json', 2); })
      .catch(function (error) { configPromise = null; throw error; });
    return configPromise;
  }
  function url(cfg, region, name) {
    var service = (name === 'tournamentOperationControl' ? CONTROL : OPERATIONS[name])
      .replace(/-v2$/, '-v' + cfg.schema);
    var endpoint = cfg.services[service] && cfg.services[service].urls && cfg.services[service].urls[region];
    if (!endpoint) throw fail('Região sem porta operacional.', 'failed-precondition');
    return endpoint;
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
    // A sonda autenticada mede saúde e revisão, não autoriza acesso ao torneio.
    // Cada operação valida o papel do usuário antes de gravar seus dados.
    var started = performance.now();
    await Promise.all(Object.keys(OPERATIONS).concat(['tournamentOperationControl']).map(async function (name) {
      var service = (name === 'tournamentOperationControl' ? CONTROL : OPERATIONS[name])
        .replace(/-v2$/, '-v' + cfg.schema);
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
    if (!list.length && cfg.schema === 3) {
      // Todas as portas novas falharam. Volta à malha publicada anteriormente,
      // incluindo o mesmo UUID e recibo da ação que iniciou esta chamada.
      var previous;
      try { previous = await fetchConfig('/operation-regions.json', 2); }
      catch (error) { configPromise = null; throw error; }
      // Mutação intencional: configPromise resolve este mesmo objeto. A sessão
      // inteira passa à v2 até recarregar, sem misturar portas v2 e v3.
      Object.assign(cfg, previous);
      results = await Promise.allSettled(cfg.regions.map(function (region) { return probe(cfg, region, headers); }));
      list = results.filter(function (item) { return item.status === 'fulfilled'; }).map(function (item) { return item.value; });
      list.sort(function (a, b) { return a.latency - b.latency; });
    }
    if (!list.length) {
      configPromise = null;
      throw fail('Nenhuma região validada. A ação não foi enviada.', 'unavailable', true);
    }
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
        var list = await healthy(cfg, headers);
        var state = await control(cfg, list[0].region, { action: 'current', tournamentId: tId, sandbox: sandbox }, headers);
        if (!state.selected) {
          state = await control(cfg, list[0].region, { action: 'select', tournamentId: tId, sandbox: sandbox,
            region: list[0].region, sourceDigest: cfg.services[CONTROL.replace(/-v2$/, '-v' + cfg.schema)].digest }, headers);
        } else if (!list.some(function (item) { return item.region === state.region; })) {
          var next = list.find(function (item) { return item.region !== state.region; });
          if (!next) throw fail('Região fixada indisponível e sem alternativa.', 'unavailable', true);
          state = await control(cfg, next.region, { action: 'failover', tournamentId: tId, sandbox: sandbox,
            region: next.region, observedRevision: state.revision, reason: 'infrastructure',
            sourceDigest: cfg.services[CONTROL.replace(/-v2$/, '-v' + cfg.schema)].digest }, headers);
        }
        selection.set(tId, state);
        return state;
      })().finally(function () { aligning.delete(tId); });
    aligning.set(tId, task);
    return task;
  }
  async function findReceipt(cfg, regions, payload, headers) {
    var checked = false;
    var unreachable = false;
    for (var i = 0; i < regions.length; i++) {
      try {
        var answer = await control(cfg, regions[i], { action: 'receipt', tournamentId: payload.tournamentId,
          sandbox: payload.sandbox === true, operationId: payload.operationId }, headers);
        checked = true;
        if (answer.found) return (answer.receipt && answer.receipt.response) || { ok: true, replayed: true, requiresRefresh: true };
        // O recibo pode estar em outra região após failover. Só a ausência em
        // todas as regiões permite considerar a operação não gravada.
        continue;
      } catch (error) {
        if (!error.infrastructure) throw error;
        unreachable = true;
      }
    }
    if (checked && !unreachable) return null;
    throw fail('Não foi possível conferir o recibo. A ação continua pendente.', 'unavailable', true);
  }
  async function refreshAnswer(tId, answer) {
    if (!answer.requiresRefresh) return answer;
    var db = window.FirestoreDB;
    var fresh = null;
    // A operação já tem recibo. Uma leitura imediatamente após o failover pode
    // falhar transitoriamente; o clique original deve continuar até reler o dado.
    for (var attempt = 0; attempt < 5 && !fresh; attempt++) {
      try {
        if (db && typeof db.loadTournamentById === 'function') fresh = await db.loadTournamentById(tId);
      } catch (_) { /* O recibo mantém a intenção segura para nova conferência. */ }
      if (!fresh && attempt < 4) await new Promise(function (resolve) { setTimeout(resolve, 300 * (attempt + 1)); });
    }
    if (!fresh) throw fail('A ação foi salva, mas ainda não consegui reler o torneio. Confira a conexão antes de repetir.',
      'unavailable', true);
    answer.tournament = fresh;
    return answer;
  }
  async function callOnce(name, input, headers) {
    if (!OPERATIONS[name]) throw fail('Operação desconhecida.', 'invalid-argument');
    var payload = Object.assign({}, input || {});
    var tId = String(payload.tournamentId || '');
    if (!tId) throw fail('Torneio não informado.', 'invalid-argument');
    var key = intentKey(name, payload);
    var all = readPending(); var old = all[key];
    var uid = window.firebase.auth().currentUser && window.firebase.auth().currentUser.uid;
    if (old && old.actorUid !== uid) throw fail('Há uma ação pendente de outra conta neste navegador.', 'failed-precondition');
    if (old && Date.now() - old.createdAt > MAX_AGE) throw fail('Esta ação pendente passou de sete dias; confira o torneio antes de repetir.', 'failed-precondition');
    if (old && withoutId(old.payload) !== withoutId(payload)) throw fail('A ação ' +
      String(old.payload.action || old.name || 'anterior') + ' ainda não foi confirmada para este jogo. Repita essa ação para conferir antes de mudar.',
      'failed-precondition');
    payload.operationId = old ? old.payload.operationId : (payload.operationId || uuid());
    if (!old) { all[key] = { name: name, payload: payload, actorUid: uid, createdAt: Date.now() }; writePending(all); }
    if (name === 'endMatchOnCourt' && (payload.action === 'cancel-call' || payload.action === 'postpone')) {
      try {
        var centralAnswer;
        try { centralAnswer = await post(CENTRAL_END_COURT, payload, headers, 20000); }
        catch (error) {
          if (!error.infrastructure) throw error;
          // Um timeout pode ter ocorrido depois do commit. Nunca envie a ação a
          // uma porta regional antiga nem troque seu UUID antes de conferir.
          try {
            var receiptCfg = await loadConfig();
            var candidates = await healthy(receiptCfg, headers);
            var receiptAnswer = await findReceipt(receiptCfg, candidates.map(function (item) { return item.region; }), payload, headers);
            if (!receiptAnswer) throw error;
            centralAnswer = Object.assign({}, receiptAnswer, { replayed: true, requiresRefresh: true });
          } catch (_) {
            throw fail('Sem confirmação da ação. Repita a mesma ação para conferir; o identificador foi preservado.',
              'unavailable', true);
          }
        }
        centralAnswer = await refreshAnswer(tId, centralAnswer);
        delete all[key]; writePending(all);
        return centralAnswer;
      } catch (error) {
        if (!error.infrastructure) { delete all[key]; writePending(all); }
        throw error;
      }
    }
    progress(true);
    var progressRegion = '';
    var progressCompleted = false;
    try {
      var cfg = await loadConfig();
      var state = await align(cfg, tId, payload.sandbox === true, headers);
      progressRegion = state.region;
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
            reason: 'infrastructure', sourceDigest: cfg.services[CONTROL.replace(/-v2$/, '-v' + cfg.schema)].digest }, headers);
          selection.set(tId, next);
          answer = await post(url(cfg, next.region, name), payload, headers, 20000);
        }
      }
      answer = await refreshAnswer(tId, answer);
      delete all[key]; writePending(all);
      progressCompleted = answer && answer.ok !== false;
      return answer;
    } catch (error) {
      if (!error.infrastructure) { delete all[key]; writePending(all); }
      throw error;
    } finally {
      progress(false, progressCompleted ? progressRegion : '');
    }
  }
  function call(name, input, headers) {
    var payload = input || {};
    var key = intentKey(name, payload);
    // Um segundo toque durante o alinhamento não cria outra gravação nem troca
    // o operationId: ambos aguardam a mesma intenção iniciada no primeiro.
    var pending = inFlight.get(key);
    if (pending) {
      if (pending.signature !== withoutId(payload)) return Promise.reject(fail(
        'A primeira ação ainda está sendo confirmada. Aguarde antes de alterar este jogo.', 'failed-precondition'));
      return pending.task;
    }
    var task = callOnce(name, input, headers);
    inFlight.set(key, { signature: withoutId(payload), task: task });
    function clearInFlight() { if (inFlight.get(key) && inFlight.get(key).task === task) inFlight.delete(key); }
    task.then(clearInFlight, clearInFlight);
    return task;
  }
  window.ScoreplaceOperationRouter = { call: call, names: Object.keys(OPERATIONS) };
})();
