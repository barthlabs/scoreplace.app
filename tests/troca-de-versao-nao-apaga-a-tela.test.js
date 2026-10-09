'use strict';
/* ⛔ A VERSÃO NOVA NÃO APAGA A TELA NO MEIO DA CHAVE (18/set/2026)
 * Relato do dono: app aberto há tempo, "do nada ele apaga a tela, diz que está recarregando
 * e volta para o seu jogo, que não era onde estávamos". Causa: o handler de troca de
 * service worker no shell recarregava a aba incondicionalmente. Agora a troca de controller
 * só consulta o árbitro version.txt: sem versão remota comprovada, não recarrega nem oferece
 * uma pílula falsa para quem já está atualizado. */
const assert = require('assert/strict'); const fs = require('fs'); const path = require('path');
let ok = 0; const must = (c, m) => { assert.ok(c, m); ok++; console.log('  ✓ ' + m); };
console.log('\n──── a troca de versão não recarrega fora da tela inicial ────\n');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i = html.indexOf("addEventListener('controllerchange'"); must(i > 0, 'achei o handler de controllerchange no shell');
const fim = html.indexOf('\n        });', i); const corpo = html.slice(i, fim > 0 ? fim : i + 3000);
must(/_checkForUpdate\(\{ force: true, source: 'controllerchange' \}\)/.test(corpo),
  '⭐⭐ controllerchange só solicita a sonda canônica, forçada e identificada');
must(!/_pendingUpdateReload\s*=\s*true/.test(corpo),
  '⛔ controllerchange não inventa pendência sem saber a versão remota');
must(!/_showUpdatePill\s*\(/.test(corpo),
  '⛔ controllerchange não mostra uma pílula por conta própria');
must(!/window\.location\.reload\s*\(/.test(corpo),
  '⛔ controllerchange não recarrega por conta própria');
const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
must(/window\._hasProvenUpdatePending\s*=\s*function/.test(store),
  'existe um predicado nomeado para atualização remota comprovada');
must(/if \(window\._pendingUpdateReload\) \{[\s\S]{0,400}?window\._hasProvenUpdatePending\(\)/.test(store),
  'o auto-update só consome pendência que a versão remota comprovou');
must(/sp_update_user_approved_for/.test(store) && /sp_update_user_approved_retry/.test(store), 'um toque de atualização atravessa o handoff entre shells');
must(/if \(v === window\.SCOREPLACE_VERSION\) \{[\s\S]{0,700}?_pillAtualizada\.remove\(\)/.test(store),
  'quando servidor e JS já coincidem, a pílula residual é removida mesmo se o shell HTML vier atrasado');
must(/window\._pendingUpdateVersion = ''/.test(store) && /window\._pendingUpdateReload = false/.test(store),
  'a reconciliação também limpa o estado pendente que criou a pílula');
must(/approved === v && retry < 1[\s\S]*?window\._applyUpdate\(true\)/.test(store), 'o primeiro handoff incompleto ganha uma única tentativa automática, sem segundo clique');
must(/_applyUpdate\(!!opts\.force, \{ silent: true \}\)/.test(store) &&
     !/_jaTentou === _chave[\s\S]{0,800}?_showUpdatePill\(\)/.test(store),
  'um shell HTML atrasado é reparado em silêncio e nunca vira falso aviso de versão nova');
must(/window\._updateCheckInFlight[\s\S]{0,180}window\._updateCheckQueued/.test(store),
  'sondas forçadas concorrentes são coalescidas em vez de disputar estado');
console.log('\n✅ ' + ok + ' verificações');
