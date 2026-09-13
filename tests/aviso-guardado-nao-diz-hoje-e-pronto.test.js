'use strict';
/* ⛔ TEXTO QUE VAI SER GUARDADO NÃO PODE DIZER "HOJE" E PRONTO.
 *
 * MEDIDO em 13/set/2026, varrendo 5.792 avisos in-app de 194 perfis: **657 pares** com o
 * MESMO texto para a MESMA pessoa em dias diferentes — quase todos `presence_plan` e
 * `presence_checkin`. Não é reentrega: é a FRASE. O aviso é gravado e lido depois, e a
 * palavra "hoje" envelhece junto com ele.
 *
 * E as duas portas que montam a frase MENTIAM, cada uma do seu jeito:
 *   • `js/views/presence.js` cravava "hoje" SEMPRE — um plano para a semana que vem chegava
 *     como "às 17:30 hoje";
 *   • `js/views/venues.js` fazia `sameDay ? 'hoje' : 'amanhã'` — qualquer dia que não fosse
 *     hoje virava "amanhã", inclusive daqui a cinco dias.
 * A regra escrita em dois lugares, errada nos dois. [[feedback_unify_dual_entry_points]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const raiz = path.join(__dirname, '..');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// a régua é pura: extraída do store e executada num contexto mínimo
const STORE = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
const ini = STORE.indexOf('window._rotuloDoDia = function');
assert.ok(ini > 0, 'âncora: o rotulador de dia');
const fim = STORE.indexOf('\n};\n', ini) + 4;
const sandbox = { window: {} }; sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(STORE.slice(ini, fim), sandbox, { filename: 'rotulo' });
const rotulo = sandbox.window._rotuloDoDia;
must(typeof rotulo === 'function', 'o rotulador existe e é puro (roda sem o app)');

// 13/set/2026 é um DOMINGO, 14:00
const AGORA = new Date(2026, 8, 13, 14, 0, 0).getTime();
const em = (dias, h) => new Date(2026, 8, 13 + dias, h == null ? 17 : h, 30, 0).getTime();

// ── ① a data vai JUNTO em todo caso — é o que mantém a frase verdadeira ─────
[0, 1, 2, 5, 9, 40].forEach((d) => {
  must(/\d{1,2}\/[a-zç]{3}/.test(rotulo(em(d), AGORA)),
    '① d+' + d + ' carrega a data: "' + rotulo(em(d), AGORA) + '"');
});

// ── ② hoje é hoje, amanhã é amanhã ─────────────────────────────────────────
must(/^hoje /.test(rotulo(em(0), AGORA)), '② hoje → "' + rotulo(em(0), AGORA) + '"');
must(/^amanhã /.test(rotulo(em(1), AGORA)), '② amanhã → "' + rotulo(em(1), AGORA) + '"');
must(/^ontem /.test(rotulo(em(-1), AGORA)), '② ontem → "' + rotulo(em(-1), AGORA) + '"');

// ── ③ ⭐ e o que ANTES era mentira ──────────────────────────────────────────
must(!/hoje/.test(rotulo(em(5), AGORA)),
  '③ ⭐ daqui a 5 dias NÃO é "hoje" (presence.js cravava hoje) — veio "' + rotulo(em(5), AGORA) + '"');
must(!/amanhã/.test(rotulo(em(5), AGORA)),
  '③ ⭐ nem "amanhã" (venues.js chamava tudo de amanhã)');
must(/sexta/.test(rotulo(em(5), AGORA)),
  '③ dentro da semana, diz o DIA DA SEMANA — "' + rotulo(em(5), AGORA) + '"');
must(/^em /.test(rotulo(em(40), AGORA)),
  '③ além da semana, só a data — "' + rotulo(em(40), AGORA) + '"');

// ── ④ dia de CALENDÁRIO, não diferença em horas ────────────────────────────
const quase = new Date(2026, 8, 13, 23, 50, 0).getTime();      // hoje, 23h50
const logoDepois = new Date(2026, 8, 14, 0, 10, 0).getTime();  // amanhã, 00h10
must(/^hoje /.test(rotulo(quase, quase)), '④ 23h50 do mesmo dia é hoje');
must(/^amanhã /.test(rotulo(logoDepois, quase)),
  '④ ⭐ 20 minutos depois, mas outro dia, é AMANHÃ — a conta é por calendário, não por horas');

// ── ⑤ entrada ruim não vira texto quebrado ─────────────────────────────────
must(rotulo(null, AGORA) === '', '⑤ sem data → string vazia, não "NaN/undefined"');
must(rotulo('nao-e-data', AGORA) === '', '⑤ data ilegível → string vazia');

// ── ⑥ as DUAS portas usam a régua, e nenhuma monta o rótulo na mão ─────────
[['js/views/presence.js', '_presencePlanNotify'], ['js/views/venues.js', 'presence_plan']].forEach(function (par) {
  const F = fs.readFileSync(path.join(raiz, par[0]), 'utf8');
  const corpo = semComentario(F);
  must(/window\._rotuloDoDia\(payload\.startsAt\)/.test(corpo),
    '⑥ ' + par[0] + ' monta a frase com a régua canônica');
  must(!/' hoje\. Quer ir junto\?'/.test(corpo),
    '⑥ ⛔ ' + par[0] + ': não sobrou "hoje" cravado na frase');
  must(!/sameDay \? 'hoje' : 'amanhã'/.test(corpo),
    '⑥ ⛔ ' + par[0] + ': não sobrou o "tudo que não é hoje é amanhã"');
});

console.log('\n✅ aviso guardado não diz "hoje" e pronto — ' + ok + ' verificações');
