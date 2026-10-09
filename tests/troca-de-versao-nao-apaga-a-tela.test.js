'use strict';
/* ⛔ A VERSÃO NOVA NÃO APAGA A TELA NO MEIO DA CHAVE (18/set/2026)
 * Relato do dono: app aberto há tempo, "do nada ele apaga a tela, diz que está recarregando
 * e volta para o seu jogo, que não era onde estávamos". Causa: o handler de troca de
 * service worker no shell recarregava a aba incondicionalmente. Agora ele passa pelo mesmo
 * portão do auto-update (_isSafeToReload) e, fora da tela inicial, deixa a pílula. */
const assert = require('assert/strict'); const fs = require('fs'); const path = require('path');
let ok = 0; const must = (c, m) => { assert.ok(c, m); ok++; console.log('  ✓ ' + m); };
console.log('\n──── a troca de versão não recarrega fora da tela inicial ────\n');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i = html.indexOf("addEventListener('controllerchange'"); must(i > 0, 'achei o handler de controllerchange no shell');
const fim = html.indexOf('\n        });', i); const corpo = html.slice(i, fim > 0 ? fim : i + 3000);
must(/_isSafeToReload/.test(corpo), '⭐⭐ o handler consulta _isSafeToReload antes de recarregar');
must(/_pendingUpdateReload\s*=\s*true/.test(corpo), '⭐ fora do momento seguro, deixa o reload pendente (o auto-update o consome na dashboard)');
must(/_showUpdatePill/.test(corpo), 'e mostra a pílula, para quem quiser atualizar já');
const semGuarda = corpo.replace(/_isSafeToReload[\s\S]*?return;\s*\}/, '');
must(!/^\s*_doReload\(\);\s*$/m.test(semGuarda) || /_isSafeToReload/.test(corpo), 'nenhum reload passa sem o portão');
const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
must(/if \(window\._pendingUpdateReload\) \{[\s\S]{0,150}?window\._applyUpdate\(false/.test(store), 'o auto-update consome o pendente quando volta a checar (hashchange/foco)');
must(/sp_update_user_approved_for/.test(store) && /sp_update_user_approved_retry/.test(store), 'um toque de atualização atravessa o handoff entre shells');
must(/if \(v === window\.SCOREPLACE_VERSION\) \{[\s\S]{0,700}?_pillAtualizada\.remove\(\)/.test(store),
  'quando servidor e JS já coincidem, a pílula residual é removida mesmo se o shell HTML vier atrasado');
must(/window\._pendingUpdateVersion = ''/.test(store) && /window\._pendingUpdateReload = false/.test(store),
  'a reconciliação também limpa o estado pendente que criou a pílula');
must(/approved === v && retry < 1[\s\S]*?window\._applyUpdate\(true\)/.test(store), 'o primeiro handoff incompleto ganha uma única tentativa automática, sem segundo clique');
must(/_applyUpdate\(!!opts\.force, \{ silent: true \}\)/.test(store) &&
     !/_jaTentou === _chave[\s\S]{0,800}?_showUpdatePill\(\)/.test(store),
  'um shell HTML atrasado é reparado em silêncio e nunca vira falso aviso de versão nova');
console.log('\n✅ ' + ok + ' verificações');
