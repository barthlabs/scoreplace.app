#!/usr/bin/env node
/* Contrato do candidato de release nativa: no archive, bundle e metadados usam o mesmo corte. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const unique = (values) => [...new Set(values)];
const semantic = (value) => /^\d+\.\d+\.\d+$/.test(value);
const fail = (message) => { console.error(`✗ CANDIDATO NATIVO INVÁLIDO: ${message}`); process.exit(1); };
const webVersion = read('version.txt').trim();
if (!semantic(webVersion)) fail(`version.txt inválido: '${webVersion}'.`);
const ios = read('ios/App/App.xcodeproj/project.pbxproj');
const iosVersions = unique([...ios.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim()));
const iosBuilds = unique([...ios.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1].trim()));
if (iosVersions.length !== 1 || iosVersions[0] !== webVersion) fail(`iOS MARKETING_VERSION deve ser ${webVersion}; encontrado: ${iosVersions.join(', ') || 'nenhum'}.`);
if (iosBuilds.length !== 1 || !/^\d+$/.test(iosBuilds[0])) fail(`iOS CURRENT_PROJECT_VERSION deve ser um inteiro único; encontrado: ${iosBuilds.join(', ') || 'nenhum'}.`);
const androidVersions = [], androidCodes = [];
for (const file of ['android/app/build.gradle', 'android/wear/build.gradle']) {
  const source = read(file);
  const version = (source.match(/versionName\s+["']([^"']+)["']/) || [])[1];
  const code = (source.match(/versionCode\s+(\d+)/) || [])[1];
  if (version !== webVersion) fail(`${file} deve declarar versionName ${webVersion}; encontrado: ${version || 'nenhum'}.`);
  if (!/^\d+$/.test(code || '')) fail(`${file} deve declarar versionCode inteiro; encontrado: ${code || 'nenhum'}.`);
  androidVersions.push(version); androidCodes.push(code);
}
if (unique(androidVersions).length !== 1) fail(`telefone e Wear divergem: ${androidVersions.join(', ')}.`);
if (unique(androidCodes).length !== androidCodes.length) fail('telefone e Wear não podem reutilizar o mesmo versionCode.');
const capacitor = JSON.parse(read('capacitor.config.json'));
if (capacitor.server && capacitor.server.url) fail('server.url está ativo; este contrato exige bundle local verificável.');
console.log(`✓ candidato nativo coerente: v${webVersion} · iOS build ${iosBuilds[0]} · Android ${androidCodes.join('/')}.`);
