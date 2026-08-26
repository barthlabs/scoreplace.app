/* O GRUPO DE WHATS DO JOGO É 1 LINK PEQUENO (2.0.101)
 * node tests/grupo-de-whats-e-um-link-pequeno.test.js
 *
 * Ordem do dono (26/ago), depois de eu mostrar o que estava gravado:
 *   _"mas o que tá no wa? é só um link porra. link do grupo"_
 *   _"cada grupo de jogo tem 1 link pequeno para o grupo do whats"_
 *
 * E ele estava certo. Medido nos 48 jogos com grupo (13,0 KB):
 *   notifyLog 34% · link 21% · byUid 14% · byName 9% · notifiedAt 9% · at 7% · notifyCount 5%
 * O LINK era 21%. Os outros 79% eram registro SOBRE o link — e triplicado, porque o objeto
 * inteiro era copiado nos 3 jogos de cada grupo (16 links distintos para 48 jogos).
 * Depois de enxugar: 13,0 → 4,7 KB.
 *
 * ⚠️ E ISTO QUASE SAIU ERRADO: minha primeira busca por quem lê `notifyLog` foi TRUNCADA
 * e eu conclui "ninguém lê". Lê sim — `tournaments-org-tools` lê `t.waGroup.notifyLog`, o
 * grupo do TORNEIO, que alimenta o relatório de Comunicados. Só o do JOGO é morto.
 * Apagar os dois teria matado um relatório que funciona pra economizar bytes de outro lugar.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const wa = fs.readFileSync(path.join(ROOT, 'js', 'views', 'wa-group.js'), 'utf8');
const org = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-org-tools.js'), 'utf8');

// ── ① o espelho pros jogos irmãos leva SÓ o link ────────────────────────────
const iM = wa.indexOf('function _mirror(');
ok(iM > 0, 'o espelho pros jogos do grupo existe');
const mirror = wa.slice(iM, iM + 1400);
ok(/sm\.waGroup = \{ link: m0\.waGroup\.link \}/.test(mirror),
  '⭐ copia SÓ o link — o registro sobre o link fica no portador, uma vez');
ok(!/sm\.waGroup = m0\.waGroup;/.test(mirror),
  '⛔ e NÃO copia o objeto inteiro (era 79% de peso triplicado)');
ok(/else delete sm\.waGroup/.test(mirror),
  'apagar segue apagando nos irmãos — senão sobra link morto no chip');

// ── ② notifyLog: só no grupo do TORNEIO ─────────────────────────────────────
const iS = wa.indexOf('function _stampGroupNotify(');
ok(iS > 0, 'o carimbo de "avisei" existe');
const stamp = wa.slice(iS, iS + 1800);
ok(/ctx\.scope === 'tournament'/.test(stamp),
  '⭐ o log de avisos é escrito SÓ no escopo do torneio');
ok(/else \{[\s\S]{0,80}delete wg\.notifyLog;/.test(stamp),
  '⛔ e no JOGO ele é APAGADO — nenhuma tela abre esse');
ok(/wg\.notifiedAt = now/.test(stamp) && /wg\.notifyCount =/.test(stamp),
  'mas `notifiedAt`/`notifyCount` ficam nos DOIS — é o que a tela do jogo mostra');

// ── ③ o leitor que eu quase matei ───────────────────────────────────────────
ok(/var _wg = t\.waGroup \|\| \{\}/.test(org),
  '⭐ o relatório de Comunicados lê `t.waGroup` — o grupo do TORNEIO');
ok(/_wg\.notifyLog/.test(org),
  'e é ELE que usa o notifyLog: por isso o escopo do carimbo importa');
ok(!/\bm\.waGroup\.notifyLog\b/.test(org) && !/match[\s\S]{0,40}notifyLog/.test(org),
  '⛔ e nunca o do jogo — se lesse, enxugar o jogo quebraria o relatório');

// ── ④ o chip continua lendo o link do JOGO ──────────────────────────────────
ok(/m\.waGroup && m\.waGroup\.link/.test(wa),
  '⭐ o botão "Abrir grupo" lê o link do próprio jogo — é por isso que o link fica em todos');

console.log((fail ? '✗' : '✓') + ' grupo-de-whats-e-um-link-pequeno: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
