'use strict';

// Intenção mínima do rastro de verificação de SMS. Telemetria não é prova de
// posse e não precisa replicar o telefone nem mensagens cruas do provedor.
var STATUSES = ['sent', 'send-failed', 'code-failed', 'confirmed'];
var FLOWS = ['principal', 'vinculado', 'homonimo'];
var CLIENTS = ['web', 'nativo'];
var ERROR_CODES = ['invalid-phone-number', 'too-many-requests', 'quota-exceeded', 'network-request-failed', 'captcha', 'internal-error'];

function oneOf(value, allowed, label) {
  value = String(value || '').trim();
  if (allowed.indexOf(value) === -1) throw new Error(label + ' inválido');
  return value;
}

function normalize(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('tentativa inválida');
  var keys = Object.keys(data);
  if (keys.some(function (key) { return ['status', 'flow', 'client', 'errorCode'].indexOf(key) === -1; })) throw new Error('campo de tentativa não permitido');
  var out = {
    status: oneOf(data.status, STATUSES, 'status'),
    flow: oneOf(data.flow, FLOWS, 'fluxo'),
    client: oneOf(data.client, CLIENTS, 'cliente')
  };
  if (data.errorCode != null && String(data.errorCode).trim()) {
    var errorCode = String(data.errorCode).trim();
    out.errorCode = ERROR_CODES.filter(function (code) { return errorCode.indexOf(code) !== -1; })[0] || 'unknown';
  }
  return out;
}

module.exports = { normalize: normalize };
