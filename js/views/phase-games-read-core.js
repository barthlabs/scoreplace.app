/* Leitura isolada de jogos por fase. Nunca remonta um torneio editável. */
(function (root) {
  'use strict';
  function count(value) {
    var n = Number(value);
    return (typeof value === 'number' || (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value))) &&
      Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  function pure(value, seen) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    var proto = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== null && proto !== Object.prototype &&
        Object.getPrototypeOf(proto) !== null) return false;
    if (Array.isArray(value) && Object.keys(value).length !== value.length) return false;
    seen.add(value);
    var keys = Object.keys(value);
    var valid = keys.every(function (key) {
      return key !== '__proto__' && key !== 'constructor' && pure(value[key], seen);
    });
    seen.delete(value);
    return valid;
  }
  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      var result = {};
      Object.keys(value).sort().forEach(function (key) { result[key] = stable(value[key]); });
      return result;
    }
    return value;
  }
  async function hash(entries) {
    if (!root.crypto || !root.crypto.subtle || typeof root.TextEncoder !== 'function') return null;
    var bytes = new root.TextEncoder().encode(JSON.stringify(entries));
    var digest = await root.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), function (n) { return n.toString(16).padStart(2, '0'); }).join('');
  }
  function certified(root, total) {
    if (!root || typeof root !== 'object' || !root._phaseReadCertificate ||
        (Object.prototype.hasOwnProperty.call(root, 'matches') &&
          (!Array.isArray(root.matches) || root.matches.length !== 0))) return false;
    var proof = root._phaseReadCertificate;
    var parts = root._nPartes;
    return proof.version === 2 && count(proof.count) === total &&
      typeof proof.digest === 'string' && /^[a-f0-9]{64}$/.test(proof.digest) &&
      parts && count(parts.matches) === total && proof.phases &&
      typeof proof.phases === 'object' && !Array.isArray(proof.phases) &&
      Object.keys(proof.phases).length === 30 &&
      Array.from({ length: 30 }, function (_, n) { return String(n); }).every(function (key) {
        return typeof proof.phases[key] === 'string' && /^[a-f0-9]{64}$/.test(proof.phases[key]);
      });
  }
  async function valid(input, split) {
    if (!input || !split || typeof split.faseIndexavel !== 'function' ||
        typeof split.chaveDoRegistro !== 'function') return false;
    var phase = Number.isSafeInteger(input.phaseIndex) && input.phaseIndex >= 0 ? input.phaseIndex : null;
    var total = count(input.total);
    var indexed = count(input.indexed);
    var phaseCount = count(input.phaseCount);
    if (phase === null || phase >= 30 || total === null || indexed === null || phaseCount === null ||
        !certified(input.root, total) ||
        total !== indexed || phaseCount > total || !Array.isArray(input.envelopes) ||
        input.envelopes.length !== phaseCount) return false;
    try {
      var entries = [], seen = new Set();
      for (var item of input.envelopes) {
        if (!item || item._phaseIndex !== phase || !item._loc || !item.jogo ||
            !pure(item._loc, new Set()) ||
            (Object.prototype.hasOwnProperty.call(item.jogo, 'phaseIndex') &&
              !pure(item.jogo.phaseIndex, new Set())) ||
            split.faseIndexavel(item.jogo, item._loc) !== phase) return false;
        var key = split.chaveDoRegistro(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        entries.push([key, stable(item._loc),
          Object.prototype.hasOwnProperty.call(item.jogo, 'phaseIndex')
            ? stable(item.jogo.phaseIndex) : { absent: true }, phase]);
      }
      entries.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
      return (await hash(entries)) === input.root._phaseReadCertificate.phases[String(phase)];
    } catch (e) { return false; }
  }
  var api = { count: count, certified: certified, valid: valid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root._phaseGamesRead = api;
})(typeof window !== 'undefined' ? window : globalThis);
