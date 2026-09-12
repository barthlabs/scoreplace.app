'use strict';
/* ⛔ `/favicon.ico` É UM CAMINHO, NÃO UMA TAG.
 * Pergunta do dono (12/set/2026, print do atalho no Android): _"o que aconteceu com o logo
 * na web?"_ — o quadradinho do scoreplace.app aparecia como um ícone genérico.
 * MEDIDO no ar: os ícones estão todos lá e idênticos ao repo (icon-32/192/512 e o manifest,
 * hash a hash), e o serviço de favicon do Google devolve o pódio certo. O que NÃO existia era
 * `/favicon.ico` — 404, e um 404 de SPA responde HTML, não imagem. As tags `<link rel=icon>`
 * do index.html só servem quem BAIXA a página; lançador de atalho, agregador e robô pedem a
 * raiz e vão embora. Este arquivo é o caminho que essa gente conhece.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const p = path.join(root, 'favicon.ico');
must(fs.existsSync(p), '⛔ `/favicon.ico` existe na RAIZ do site');
const b = fs.readFileSync(p);
must(b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0,
  'e é um ICO de verdade (assinatura 00 00 01 00), não um PNG renomeado');
must(b.length > 1000, 'com mais de um tamanho dentro — ' + b.length + ' bytes');
const fb = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
must(!(fb.hosting.ignore || []).some((g) => /favicon/i.test(g)),
  '⛔ e o deploy não o ignora — arquivo no repo que não sobe é o mesmo que arquivo nenhum');

console.log('✅ ' + ok + ' asserções — o logo tem o caminho que os lançadores pedem');
