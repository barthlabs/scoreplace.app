#!/usr/bin/env node
'use strict';

// Read-only transport check. An unauthenticated callable probe must be rejected
// before a handler touches Firestore; see tests/operation-probe-readonly.test.js.
const fs = require('node:fs/promises');

const DEFAULT_MANIFEST = 'https://scoreplace.app/operation-regions-v3.json';
const ORIGIN = 'https://scoreplace.app';
const TIMEOUT_MS = 12000;

async function fetchWithTimeout(url, options, fetcher, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetcher(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function loadManifest(source, fetcher, timeoutMs) {
  let config;
  if (/^https:\/\//.test(source)) {
    const reply = await fetchWithTimeout(source, { cache: 'no-store' }, fetcher, timeoutMs);
    if (!reply.ok) throw new Error(`manifesto HTTP ${reply.status}`);
    config = await reply.json();
  } else {
    config = JSON.parse(await fs.readFile(source, 'utf8'));
  }
  if (config.schema !== 3 || !Array.isArray(config.regions) || config.regions.length < 2 ||
      !config.services || Object.keys(config.services).length !== 6) {
    throw new Error('manifesto v3 incompleto');
  }
  for (const service of Object.values(config.services)) {
    for (const region of config.regions) {
      if (!/^https:\/\//.test(String(service.urls && service.urls[region] || ''))) {
        throw new Error(`URL ausente para ${region}`);
      }
    }
  }
  return config;
}

async function checkPort(url, fetcher, timeoutMs) {
  const preflight = await fetchWithTimeout(url, { method: 'OPTIONS', headers: {
    Origin: ORIGIN, 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type,x-firebase-appcheck',
  } }, fetcher, timeoutMs);
  const allowedOrigin = preflight.headers.get('access-control-allow-origin');
  const allowedMethods = preflight.headers.get('access-control-allow-methods') || '';
  const allowedHeaders = preflight.headers.get('access-control-allow-headers') || '';
  if (preflight.status !== 204 || allowedOrigin !== ORIGIN ||
      !/\bPOST\b/i.test(allowedMethods) ||
      !['authorization', 'content-type', 'x-firebase-appcheck'].every(h => allowedHeaders.toLowerCase().includes(h))) {
    throw new Error(`CORS ${preflight.status}`);
  }
  const reply = await fetchWithTimeout(url, { method: 'POST', headers: {
    Origin: ORIGIN, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ data: { probe: true } }) }, fetcher, timeoutMs);
  if (reply.status !== 401) throw new Error(`probe HTTP ${reply.status}`);
  const body = await reply.json().catch(() => ({}));
  if (!body.error || body.error.status !== 'UNAUTHENTICATED') {
    throw new Error(`probe status ${String(body.error && body.error.status || 'ausente')}`);
  }
}

async function inspect(config, options = {}) {
  const fetcher = options.fetcher || fetch;
  const timeoutMs = options.timeoutMs || TIMEOUT_MS;
  const retries = options.retries == null ? 1 : options.retries;
  const regions = config.regions;
  const services = Object.entries(config.services);
  const status = await Promise.all(regions.map(async region => {
    const ports = await Promise.all(services.map(async ([name, service]) => {
      let error;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try { await checkPort(service.urls[region], fetcher, timeoutMs); return { name, ok: true }; }
        catch (failure) { error = failure; }
      }
      return { name, ok: false, reason: error && error.message || 'falha desconhecida' };
    }));
    return { region, ports, healthy: ports.filter(port => port.ok).length };
  }));
  const completeRegions = status.filter(row => row.healthy === services.length).length;
  const downRegions = status.filter(row => row.healthy === 0).length;
  return { status, completeRegions, downRegions,
    // Keep this threshold in one place; the deploy script propagates the code.
    blocked: completeRegions < 2 || downRegions > 0 };
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const index = args.indexOf('--manifest');
  const source = index >= 0 ? args[index + 1] : DEFAULT_MANIFEST;
  if (!source) throw new Error('--manifest exige arquivo ou URL');
  const config = await loadManifest(source, dependencies.fetcher || fetch, dependencies.timeoutMs || TIMEOUT_MS);
  const report = await inspect(config, dependencies);
  for (const row of report.status) {
    const failed = row.ports.filter(port => !port.ok);
    console.log(`${row.region}: ${row.healthy}/${row.ports.length} portas prontas${failed.length ? ' — ' + failed.map(port => `${port.name}: ${port.reason}`).join('; ') : ''}`);
  }
  console.log(`Regiões completas: ${report.completeRegions}/${report.status.length}; regiões fora: ${report.downRegions}`);
  if (report.blocked) {
    console.error('✗ malha regional insuficiente para operação');
    return 1;
  }
  if (report.status.some(row => row.healthy !== row.ports.length)) console.warn('⚠ portas isoladas degradadas; investigar antes do torneio');
  return 0;
}

if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(`✗ checker indisponível: ${error.message}`);
  process.exitCode = 2;
});

module.exports = { loadManifest, checkPort, inspect, main };
