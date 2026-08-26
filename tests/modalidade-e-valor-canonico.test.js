/* A MODALIDADE GRAVADA É O VALOR CANÔNICO — O EMOJI É RÓTULO (2.0.96)
 * node tests/modalidade-e-valor-canonico.test.js
 *
 * Ordem do dono (25/ago/2026): _"por isso que não deixo as pessoas escreverem livremente
 * as modalidades. usam botões que devem padronizar isso sempre"_.
 * O botão padronizava — só que a string ERRADA:
 *     <option>🎾 Beach Tennis</option>     ← sem atributo `value`
 * Sem `value`, o valor É o texto. Emoji incluído. E era isso que ia pro banco.
 *
 * MEDIDO na base real antes do conserto: "Beach Tennis" (27) e "🎾 Beach Tennis" (7)
 * convivendo como se fossem modalidades DIFERENTES — 6 grafias pra 4 modalidades.
 * Qualquer filtro por modalidade (a vitrine por preferência, por exemplo) nasce mentindo.
 * Os 9 documentos foram normalizados por scripts/normalizar-modalidade.js.
 *
 * Este teste impede a volta — e ela volta fácil: basta alguém acrescentar uma modalidade
 * copiando a linha de cima.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

global.window = global.window || {};
require(path.join(ROOT, 'js', 'views', 'sport-rules.js'));
const CANON = global.window.SPORT_LIST || [];
ok(CANON.length >= 5, 'SPORT_LIST é a fonte única e tem as modalidades (' + CANON.length + ')');
ok(CANON.every((s) => !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)),
  'nenhuma modalidade canônica tem emoji: ' + CANON.join(' · '));

const ARQS = ['js/main.js', 'js/views/create-tournament.js'];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

ARQS.forEach(function (rel) {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');

  // ① nenhum `data-sport` com emoji — é ele que o botão manda pro select
  const btns = (s.match(/data-sport="([^"]*)"/g) || []).map((x) => x.slice(12, -1));   // `data-sport="` tem 12 caracteres
  const comEmoji = btns.filter((v) => EMOJI.test(v));
  ok(comEmoji.length === 0, rel + ': botão com emoji no VALOR: ' + comEmoji.join(', '));

  // ② e o valor precisa ser canônico (não um sinônimo qualquer)
  const fixos = btns.filter((v) => v.indexOf("'") === -1 && v.indexOf('+') === -1);
  const forasteiros = fixos.filter((v) => CANON.indexOf(v) === -1);
  ok(forasteiros.length === 0, rel + ': botão com valor fora do SPORT_LIST: ' + forasteiros.join(', '));

  // ③ toda <option> de modalidade tem `value` explícito — é a ausência dele que causou tudo
  const semValue = (s.match(/<option>\s*[^<]*<\/option>/g) || [])
    .filter((o) => EMOJI.test(o) || CANON.some((c) => o.indexOf(c) !== -1));
  ok(semValue.length === 0,
    rel + ': <option> de modalidade SEM atributo value (o valor viraria o rótulo): ' + semValue.slice(0, 3).join(' '));

  // ④ o emoji continua no RÓTULO — tirar o emoji da tela não era o pedido
  if (/id="(select-sport|quick-create-sport)"/.test(s)) {
    ok(/<option value="[^"]+">[^<]*[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s),
      rel + ': o emoji tem que continuar no RÓTULO da opção (só saiu do valor)');
  }
});

// ⑤ e o script de conserto continua existindo — a base pode receber doc velho de novo
ok(fs.existsSync(path.join(ROOT, 'scripts', 'normalizar-modalidade.js')),
  'o script que normaliza a base segue no repo (roda em seco por padrão)');

console.log((fail ? '✗' : '✓') + ' modalidade-e-valor-canonico: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
