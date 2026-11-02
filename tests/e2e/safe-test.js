'use strict';

const { test: base, expect } = require('@playwright/test');

function protectedWrite(request) {
  const method = request.method().toUpperCase();
  const url = new URL(request.url());
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if (host === 'firestore.googleapis.com') {
    if (/\/(?:google\.firestore\.v1\.Firestore\/)?(?:Write|Commit|BatchWrite)(?:\/|$)/i.test(path)) return 'Firestore RPC';
    if (/\/documents(?:\/|$)/.test(path) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return 'Firestore REST';
  }
  if (method === 'POST' && (host.endsWith('.cloudfunctions.net') || host.endsWith('.run.app'))) return 'Function';
  return null;
}

async function installWriteGuard(context) {
  const violations = [];
  await context.route('**/*', async (route) => {
    const kind = protectedWrite(route.request());
    if (kind) {
      violations.push(kind + ' ' + route.request().method() + ' ' + route.request().url());
      await route.abort('blockedbyclient');
    } else {
      await route.continue();
    }
  });
  return violations;
}

const test = base.extend({
  _writeGuard: [async ({ context }, use) => {
    const violations = await installWriteGuard(context);
    await use();
    expect(violations, 'E2E tentou escrever ou chamar Function fora da fixture: ' + violations.join('; ')).toEqual([]);
  }, { auto: true }]
});

module.exports = { test, expect, protectedWrite, installWriteGuard };
