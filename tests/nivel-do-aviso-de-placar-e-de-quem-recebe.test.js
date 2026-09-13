'use strict';
/* ⛔ O NÍVEL DO AVISO DE PLACAR É DE QUEM RECEBE, NÃO DO TIPO.
 *
 * Relato do dono (12/set/2026, e-mail do Confra com print): _"aqui quem lançou foi o
 * organizador e só é fundamental para os participantes desse jogo. para os demais é geral.
 * para o organizador importante"_. O e-mail chegou marcado 🔴 Fundamental para ele, que
 * organiza o torneio e não joga aquele jogo.
 *
 * DOIS defeitos no mesmo caminho:
 *   ① `result`/`match-pending-approval`/`match-rejected` eram 'fundamental' na tabela do
 *      catálogo — igual para jogador, organizador e qualquer outro;
 *   ② mesmo que não fossem, o nível NÃO CHEGAVA ao e-mail: `_sendUserNotification` fazia
 *      `delete _tplData.level` ("local-only filter") e `_dispatchChannels` lia
 *      `NOTIF_CATALOG[type].level`. A janela do digest (5/15/30 min) saía pelo nível errado
 *      junto.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

// o catálogo é puro: roda num contexto mínimo, sem montar meia aplicação
const sandbox = {}; sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(raiz, 'js/notification-catalog.js'), 'utf8'), sandbox, { filename: 'notification-catalog.js' });
const W = sandbox;

must(typeof W._nivelDoAviso === 'function', 'a régua existe e é do catálogo (pura)');

// ── ① os três papéis, no aviso de placar ────────────────────────────────────
['result', 'match-pending-approval', 'match-rejected'].forEach((tipo) => {
  must(W._nivelDoAviso(tipo, 'jogador') === 'fundamental',
    '① ' + tipo + ': quem JOGA aquele jogo → fundamental');
  must(W._nivelDoAviso(tipo, 'organizador') === 'important',
    '① ⭐ ' + tipo + ': o ORGANIZADOR → importante (era fundamental — o caso do print)');
  must(W._nivelDoAviso(tipo, '') === 'all',
    '① ' + tipo + ': qualquer outro → geral');
});

// ── ② o resto do catálogo não muda ──────────────────────────────────────────
must(W._nivelDoAviso('draw', 'organizador') === (W.NOTIF_CATALOG.draw.level),
  '② sorteio continua com o nível da tabela, seja quem for');
must(W._nivelDoAviso('live_score_started', 'jogador') === 'all',
  '② ⛔ placar AO VIVO não é aviso de placar lançado — segue geral mesmo para quem joga');
must(W._nivelDoAviso('tournament_finished', 'jogador') === 'important',
  '② torneio encerrado segue importante');
must(W._nivelDoAviso('tipo-que-nao-existe', 'jogador') === 'all',
  '② tipo desconhecido cai em geral, sem quebrar');
must(W._nivelDoAviso('tipo-que-nao-existe', 'jogador', 'important') === 'important',
  '② e um nível explícito no aviso continua valendo');

// ── ③ a fiação: o nível resolvido chega ao e-mail ───────────────────────────
const ORG = fs.readFileSync(path.join(raiz, 'js/views/tournaments-organizer.js'), 'utf8');
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

const iEnvia = ORG.indexOf('window._sendUserNotification = async function');
assert.ok(iEnvia > 0, 'âncora: o envio da notificação');
const fimEnvia = ORG.indexOf('window._dispatchChannels = function', iEnvia);
assert.ok(fimEnvia > iEnvia, 'âncora: o fim do envio');
const envia = semComentario(ORG.slice(iEnvia, fimEnvia));

must(/_nivelDoAviso\(notifData\.type, _papelNoAviso/.test(envia),
  '③ o corte por nível usa a régua, com o PAPEL de quem recebe');
must(/_userTeamInMatch\(_tAviso, _mAviso, _quemRecebe\)/.test(envia),
  '③ o papel "jogador" sai da régua canônica de uid — nunca de nome');
must(/_isUserOrgOrCoHost\(_tAviso, _quemRecebe\)/.test(envia),
  '③ e "organizador" idem, incluindo co-organizador');
must(/_tplData\._nivel = notifLevel;/.test(envia),
  '③ ⭐ o nível resolvido VIAJA para o e-mail (antes era apagado e se perdia)');

const iDisp = ORG.indexOf('window._dispatchChannels = function');
const disp = semComentario(ORG.slice(iDisp, iDisp + 4000));
must(/var _emLvl = templateData\._nivel \|\| _emCat\.level/.test(disp),
  '③ ⭐ e o e-mail PREFERE o nível resolvido ao nível da tabela');
must(!/var _emLvl = _emCat\.level \|\| 'all';/.test(disp),
  '③ ⛔ não sobrou o caminho que lia só a tabela');

console.log('\n✅ nível do aviso de placar é de quem recebe — ' + ok + ' verificações');
