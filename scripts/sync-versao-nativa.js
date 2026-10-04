#!/usr/bin/env node
/* sync-versao-nativa.js — mantém MARKETING_VERSION do iOS igual à web.
 *
 * A versão web é gerada durante o prerender. Antes deste sincronizador, cada
 * release web deixava o pbxproj com a versão anterior e o GitHub Actions iOS
 * falhava em segundos, produzindo um alerta para uma incompatibilidade que já
 * podia ser corrigida localmente. Este arquivo é chamado pelo mesmo comando de
 * geração; `check-versao-nativa.js` permanece no `npm test` como prova de que
 * todos os alvos foram atualizados.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const version = fs.readFileSync(path.join(root, 'version.txt'), 'utf8').trim();
const project = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('version.txt não contém uma versão semântica válida.');
}

const before = fs.readFileSync(project, 'utf8');
if (!/MARKETING_VERSION = [^;]+;/.test(before)) {
  throw new Error('não encontrei MARKETING_VERSION no projeto iOS.');
}
const after = before.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
if (before !== after) fs.writeFileSync(project, after);
console.log(`✓ iOS MARKETING_VERSION = ${version}${before === after ? ' (já estava alinhada)' : ''}`);
