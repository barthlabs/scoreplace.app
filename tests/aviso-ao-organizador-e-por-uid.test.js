'use strict';
/* O AVISO AO ORGANIZADOR DECIDE POR UID, NÃO POR E-MAIL.
 * node tests/aviso-ao-organizador-e-por-uid.test.js
 *
 * ⛔ O DEFEITO, medido no código em 24/set/2026: os três avisos (inscrição individual, de dupla e
 * cancelamento) tinham a guarda `t.organizerEmail && t.organizerEmail !== user.email`. O e-mail
 * NUNCA foi usado para enviar — o envio já é por uid (`_sendUserNotification(orgUid, …)`). Ele só
 * respondia "existe organizador?" e "sou eu?", e respondia MAL:
 *   • torneio SEM `organizerEmail` (legado, ou depois que o campo sair do documento público)
 *     NUNCA avisava o organizador, mesmo com `creatorUid` certinho;
 *   • organizador que TROCOU o e-mail da conta recebia aviso da PRÓPRIA inscrição.
 *
 * ⛔ E O CANCELAMENTO GANHOU A GUARDA QUE FALTAVA: o aviso saía mesmo quando a Function devolvia
 * `notFound`. Com a guarda por e-mail isso passava porque ela barrava casos por acidente; com uid o
 * aviso alcança mais gente, e um cancelamento que NÃO ocorreu passaria a avisar.
 *
 * ⚠️ Este teste lê o FONTE dos três blocos. É de propósito: o que se está travando é a FORMA da
 * guarda — exercitar o fluxo inteiro exigiria simular Function, elenco e notificação, e mediria
 * outra coisa.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ARQ = 'js/views/tournaments-enrollment.js';
const src = fs.readFileSync(path.join(ROOT, ARQ), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o aviso ao organizador é por uid ────\n');

/* ── ① a guarda por E-MAIL não existe mais em código vivo ────────────────────────── */
const linhas = src.split('\n');
const vivas = linhas.filter((l) => /organizerEmail\s*!==\s*user\.email/.test(l) && !/^\s*(\*|\/\*|\/\/)/.test(l));
ok(vivas.length === 0, '① nenhuma guarda viva por e-mail — achei ' + vivas.length);

/* ── ② os três blocos resolvem o uid e comparam UID ──────────────────────────────── */
const porUid = (src.match(/orgUid && orgUid !== \(user && user\.uid\)/g) || []).length;
ok(porUid === 3, '② ⭐ os TRÊS avisos comparam uid com uid — achei ' + porUid);
const resolve = (src.match(/if \(typeof window\._resolveOrganizerUid === 'function'\) \{/g) || []).length;
ok(resolve === 3, '② e os três entram pelo resolvedor de uid — achei ' + resolve);

/* ── ③ o resolvedor é uid puro (não volta a olhar e-mail pelas costas) ──────────── */
const org = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-organizer.js'), 'utf8');
const i = org.indexOf('window._resolveOrganizerUid = async function');
const corpo = org.slice(i, org.indexOf('};', i));
ok(/return t\.creatorUid;/.test(corpo), '③ `_resolveOrganizerUid` devolve `creatorUid`');
ok(!/organizerEmail|creatorEmail|email/i.test(corpo), '③ ⭐ e NÃO consulta e-mail nenhum');

/* ── ④ o defeito de hoje: SEM organizerEmail, o aviso PODE sair ─────────────────── */
/* A guarda nova não menciona `organizerEmail`, então torneio sem o campo passa. É isso que
 * o teste fixa: a ausência do campo não pode mais calar o aviso. */
/* ⚠️ Cada bloco vai do seu `if` até o PRÓXIMO (e o último até o fim do arquivo) — ⛔ nunca
 * uma janela de N caracteres: um comentário a mais empurraria o código pra fora e o teste
 * reprovaria sem defeito nenhum. É a trava de `teste-nao-recorta-por-tamanho-fixo`, e ela me
 * pegou escrevendo exatamente isso. */
const ABRE = "if (typeof window._resolveOrganizerUid === 'function') {";
/* Fecha no PAR da chave — é o fim real do construto. */
function ateFechar(txt, de) {
  let prof = 0;
  for (let k = txt.indexOf('{', de); k < txt.length; k++) {
    if (txt[k] === '{') prof++;
    else if (txt[k] === '}') { prof--; if (prof === 0) return txt.slice(de, k + 1); }
  }
  return txt.slice(de);
}
const inicios = [];
for (let de = 0; ; ) {
  const k = src.indexOf(ABRE, de);
  if (k < 0) break;
  inicios.push(k); de = k + ABRE.length;
}
const blocos = inicios.map((k) => ateFechar(src, k));
ok(blocos.length === 3, '④ achei os três blocos de aviso');
/* ⛔ Procurar no texto CRU faria a própria ANOTAÇÃO reprovar: a nota que explica o defeito
 * precisa citar o campo pelo nome, e citar não é ler. Então a busca é no código mascarado —
 * o mesmo leitor da trava de anotação, que apaga comentários e strings preservando o offset.
 * [[feedback_busca_truncada_nao_e_busca]] */
const _mascara = require('./pontos-frageis-validador.js').lerJs;
ok(blocos.every((b) => !/organizerEmail/.test(_mascara('(function(){' + b + '})').mascarado)),
  '④ ⭐⭐ nenhum dos três lê `organizerEmail` — torneio sem o campo volta a avisar o organizador');
ok(blocos.every((b) => /_sendUserNotification\(orgUid/.test(b)),
  '④ e todos enviam por uid, como já enviavam');

/* ── ⑤ não avisa a si mesmo ──────────────────────────────────────────────────────── */
ok(blocos.every((b) => /orgUid !== \(user && user\.uid\)/.test(b)),
  '⑤ ⭐ organizador que se inscreve não recebe aviso da própria inscrição (comparação por uid)');

/* ── ⑥ os SEIS vereditos não-`enrolled` não avisam ──────────────────────────────── */
/* A guarda é `if (_verdict !== 'enrolled') return;` ANTES do bloco de aviso, nos dois fluxos
 * de inscrição. O teste FIXA isso: uma reordenação futura mandaria "novo inscrito" de quem não
 * entrou. ⚠️ `waitlisted` é o que mais engana: `_applyEnrollResult` o considera "ok", mas quem
 * entrou na FILA não entrou no elenco. */
const VEREDITOS = [
  ['{capacityFull:true}', 'capacityFull'],
  ['{enrollmentClosed:true}', 'closed'],
  ['{alreadyEnrolled:true, dupSuspect:true}', 'dupSuspect'],
  ['{alreadyEnrolled:true}', 'already'],
  ['{alreadyWaitlisted:true}', 'alreadyWaitlisted'],
  ['{waitlisted:true}', 'waitlisted'],
];
const derivador = src.slice(src.indexOf('window._applyEnrollResult = function'), src.indexOf('window._applyEnrollResult = function') + 1400);
VEREDITOS.forEach(([payload, v]) => ok(new RegExp("verdict = '" + v + "'").test(derivador),
  '⑥ o veredito `' + v + '` é derivado de ' + payload));
const guardas = (src.match(/if \(_verdict(Team)? !== 'enrolled'\) return;/g) || []).length;
ok(guardas === 2, '⑥ ⭐ os dois fluxos de inscrição param ANTES do aviso quando não é `enrolled` — achei ' + guardas);

/* ── ⑦ cancelamento que NÃO aconteceu não avisa ─────────────────────────────────── */
ok(/if \(!result \|\| result\.notFound\) return;/.test(src),
  '⑦ ⭐⭐ `notFound` da Function interrompe antes do aviso — a guarda que faltava');
const iCanc = src.indexOf('if (!result || result.notFound) return;');
const iAviso = src.indexOf("if (typeof window._resolveOrganizerUid === 'function') {", iCanc);
ok(iCanc > 0 && iAviso > iCanc, '⑦ e ela vem ANTES do bloco de aviso do cancelamento');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
