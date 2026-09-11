(function (root) {
  'use strict';
  function version(value) {
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return null;
    var parts = value.split('.').map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
  }
  function compare(a, b) {
    a = version(a); b = version(b);
    if (!a || !b) return null;
    for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  }
  function validate(policy) {
    if (!policy || policy.schemaVersion !== 1 || policy.noticeDays !== 7 || !policy.platforms) return false;
    return ['ios', 'android'].every(function (platform) {
      var p = policy.platforms[platform];
      if (!p || typeof p !== 'object') return false;
      if (p.minimumVersion === null) return p.availableAt === null && p.deviceValidatedAt === null && p.enforceAt === null;
      if (!version(p.minimumVersion)) return false;
      var dates = [p.availableAt, p.deviceValidatedAt, p.enforceAt].map(function (v) {
        return typeof v === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(v) ? Date.parse(v) : NaN;
      });
      return dates.every(Number.isFinite) && dates[2] >= Math.max(dates[0], dates[1]) + 7 * 86400000;
    });
  }
  function evaluate(policy, platform, running, now) {
    if (!validate(policy)) return { mode: 'invalid' };
    if (platform !== 'ios' && platform !== 'android') return { mode: 'none' };
    var p = policy.platforms[platform];
    if (p.minimumVersion === null) return { mode: 'none' };
    var delta = compare(running, p.minimumVersion);
    if (delta === null) return { mode: 'invalid' };
    if (delta >= 0 || now < Math.max(Date.parse(p.availableAt), Date.parse(p.deviceValidatedAt))) return { mode: 'none' };
    return { mode: now >= Date.parse(p.enforceAt) ? 'required' : 'notice', minimumVersion: p.minimumVersion, enforceAt: p.enforceAt };
  }
  var api = { compare: compare, validate: validate, evaluate: evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NativeUpdatePolicy = api;
})(typeof window !== 'undefined' ? window : globalThis);
