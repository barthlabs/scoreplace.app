'use strict';
/* ⛔ "O ORGANIZADOR SUGERIU QUE CIÇA ERA VOCÊ" PARA QUEM JÁ JOGAVA A PARTIDA (18/set/2026)
 * Caso real (sala NABY4T): a Kelly já era jogadora e recebeu a sugestão de que a convidada
 * "Ciça Mange" era ela — e o banner ficou semanas na dashboard mesmo depois de a sugestão
 * sair da partida. Duas portas: (1) não sugerir quem já está na partida; (2) o banner só vive
 * enquanto a sugestão existir em `pendingLinkRequests`. */
const assert = require('assert/strict'); const fs = require('fs'); const path = require('path');
let ok = 0; const must = (c, m) => { assert.ok(c, m); ok++; console.log('  ✓ ' + m); };
console.log('\n──── sugestão casual não aponta para quem já joga ────\n');
const corpo = (src, ini, fim) => { const i = src.indexOf(ini); const f = i < 0 ? -1 : src.indexOf(fim, i); return i < 0 ? '' : src.slice(i, f > 0 ? f : src.length); };
const bui = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
const sug = corpo(bui, 'window._suggestCasualLink = async function', 'var dup = pending.some');
must(sug.length > 100, '① achei _suggestCasualLink até a checagem de duplicata');
must(/_jaNaPartida/.test(sug) && /data\.players/.test(sug) && /slotLinkedUid/.test(sug), '① ⭐⭐ antes de sugerir, confere se a pessoa JÁ é jogadora (players e slotLinkedUid)');
must(/if \(_jaNaPartida\) \{[\s\S]*?return;/.test(sug), '① e quem já joga NÃO recebe a sugestão');
const dash = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
const ban = corpo(dash, "where('type', '==', 'casual_link_request')", 'dashboard-casual-link-widget');
must(ban.length > 100, '② achei o carregamento do banner "Você jogou esta partida?"');
must(/pendingLinkRequests/.test(ban) && /suggestedUid\) === String\(cu\.uid\)/.test(ban), '② ⭐⭐ o banner confere na PARTIDA se a sugestão ainda existe para este uid');
must(/read: true/.test(ban), '② sugestão que já saiu da partida: o aviso é marcado como lido e some');
console.log('\n✅ ' + ok + ' verificações');
