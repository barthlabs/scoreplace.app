'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'sentry-init.js'), 'utf8');
let config;
const sentry = {
  init: function (next) { config = next; },
  captureException: function () {},
  captureMessage: function () {}
};
const window = { SENTRY_DSN: 'https://public@example.ingest.sentry.io/1', SCOREPLACE_VERSION: '2.3.15', Sentry: sentry };
const context = {
  window: window,
  location: { hostname: 'scoreplace.app', hash: '#tournaments/secret-tournament' },
  localStorage: { getItem: function () { return null; } },
  sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
  document: {
    createElement: function () { return {}; },
    head: { appendChild: function (node) { node.onload(); } }
  },
  console: { warn: function () {} },
  setTimeout: function () { return 1; },
  clearTimeout: function () {},
  Promise: Promise,
  Array: Array,
  String: String
};
vm.runInNewContext(source, context, { filename: 'sentry-init.js' });

let ok = 0;
function must(value, message) { assert.ok(value, message); ok++; console.log('  ✓ ' + message); }

must(config && typeof config.beforeSend === 'function', 'beforeSend do Sentry foi instalado');
must(typeof config.beforeSendTransaction === 'function', 'transações passam pela mesma barreira de privacidade');

const event = {
  user: { id: 'uid-da-ana', email: 'ana@example.com', username: 'Ana Silva' },
  extra: { profile: { name: 'Ana Silva', phone: '+5511999999999' } },
  contexts: { device: { name: 'iPhone da Ana' } },
  request: { url: 'https://scoreplace.app/?email=ana@example.com' },
  message: 'Falhou para ana@example.com',
  fingerprint: ['ana@example.com'],
  breadcrumbs: [{ category: 'app', level: 'error', message: 'Ana ana@example.com', data: { phone: '+5511999999999' }, timestamp: 123 }],
  exception: { values: [{ type: 'TypeError', value: 'Ana ana@example.com', stacktrace: { frames: [{ filename: 'https://scoreplace.app/js/auth.js?email=ana@example.com', function: 'saveProfile', lineno: 42, colno: 7, vars: { name: 'Ana' }, pre_context: ['ana@example.com'] }] } }] }
};

const sanitized = config.beforeSend(event);
const serialized = JSON.stringify(sanitized);
must(!/ana@example\.com|Ana Silva|uid-da-ana|999999999/.test(serialized), 'não resta identificador, e-mail, nome ou telefone no evento');
must(!('user' in sanitized) && !('extra' in sanitized) && !('contexts' in sanitized) && !('request' in sanitized), 'remove contextos e payloads livres');
must(sanitized.tags.route === 'tournaments' && sanitized.release === 'scoreplace@2.3.15', 'preserva somente rota e versão para investigação');
must(sanitized.breadcrumbs.length === 1 && sanitized.breadcrumbs[0].category === 'breadcrumb' && !('message' in sanitized.breadcrumbs[0]), 'breadcrumbs mantêm sequência sem conteúdo');
must(sanitized.exception.values[0].type === 'TypeError' && sanitized.exception.values[0].value === '[detalhe suprimido por privacidade]', 'preserva tipo e remove detalhe da exceção');
must(sanitized.exception.values[0].stacktrace.frames[0].filename === 'https://scoreplace.app/js/auth.js', 'remove query e variáveis da pilha');

const transaction = config.beforeSendTransaction({ transaction: 'Ana/ana@example.com', breadcrumbs: [{ message: 'Ana' }] });
must(transaction.transaction === 'route:tournaments' && transaction.release === 'scoreplace@2.3.15' && transaction.message === '[mensagem suprimida por privacidade]', 'transação recebe rota e versão seguras sem preservar nome nem mensagem livre');

context.location.hash = '#ana@example.com/segredo';
const hostile = config.beforeSend({ message: 'falha', tags: { route: 'ana@example.com' } });
must(hostile.tags.route === 'unknown' && hostile.transaction === 'route:unknown', 'hash e tag fora do router viram rota desconhecida');
must(!/ana@example\.com|segredo/.test(JSON.stringify(hostile)), 'a rota arbitrária não vaza texto livre para a telemetria');

const router = fs.readFileSync(path.join(__dirname, '..', 'js', 'router.js'), 'utf8');
const routes = [...router.matchAll(/case '([^']*)':/g)].map((m) => m[1]).filter(Boolean);
for (const route of routes) {
  context.location.hash = '#' + route + '/identificador-que-nao-importa';
  const routed = config.beforeSend({ message: 'falha' });
  must(routed.tags.route === route, 'rota do router preservada na telemetria: ' + route);
}

console.log('✅ sentry-privacy-filter: ' + ok + ' asserções, 0 falha(s)');
