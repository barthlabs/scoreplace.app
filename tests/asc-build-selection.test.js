'use strict';
const assert = require('assert/strict');
const { findReleaseBuild } = require('../scripts/asc');

const makeBuild = (id, version, state = 'VALID') => ({
  type: 'builds', id,
  attributes: { version: id, processingState: state, expired: false },
  relationships: { preReleaseVersion: { data: { type: 'preReleaseVersions', id: version } } },
});
const makeVersion = (version) => ({ type: 'preReleaseVersions', id: version, attributes: { version } });

(async () => {
  const pages = [
    { data: [makeBuild('288', '2.5.18')], included: [makeVersion('2.5.18')], links: { next: 'https://example.test/page2' } },
    { data: [makeBuild('289', '2.5.29')], included: [makeVersion('2.5.29')], links: {} },
  ];
  let calls = 0;
  const getPage = async () => pages[calls++];
  const selected = await findReleaseBuild(getPage, 'app-id', '2.5.29', '289');
  assert.equal(selected.build.id, '289');
  assert.equal(calls, 2);
  await assert.rejects(() => findReleaseBuild(async () => ({ ...pages[0], links: {} }), 'app-id', '2.5.29', '288'), /encontrei 0/);
  await assert.rejects(() => findReleaseBuild(async () => ({
    data: [makeBuild('289', '2.5.29', 'PROCESSING')], included: [makeVersion('2.5.29')], links: {},
  }), 'app-id', '2.5.29', '289'), /ainda não está válida/);
  console.log('✓ App Store Connect exige versão, build e processamento exatos antes da submissão');
})().catch((error) => { console.error(error); process.exitCode = 1; });
