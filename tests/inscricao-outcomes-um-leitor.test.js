/* O RESULTADO DA INSCRIÇÃO TEM UM LEITOR SÓ — e nenhum desfecho fica mudo.
 *
 * MEDIDO em 13/ago/2026: a CF enrollParticipant devolve 7 desfechos e cada um dos
 * 4 call sites lia um SUBCONJUNTO — o resto caía em silêncio ou no toast de
 * SUCESSO. Os três piores (reais):
 *   (a) organizador inscrevia numa Liga com fase sorteada → `waitlisted` sem ramo
 *       → a pessoa SUMIA da tela sem mensagem;
 *   (b) `enrollmentClosed` na auto-inscrição não tratado → a pessoa acreditava
 *       estar inscrita (o toast otimista de sucesso já tinha saído);
 *   (c) recusa por DUPLICATA (`alreadyEnrolled`+`dupSuspect`) → o return precoce
 *       matava o diálogo "não sou eu": a pessoa via "já inscrito" sem saída.
 * E o rollback otimista filtrava pelo objeto ORIGINAL, mas o push é uma CÓPIA
 * (_pendingEnroll) — recusa não removia NADA da tela.
 *
 * Roda o _applyEnrollResult REAL extraído do arquivo, um desfecho por vez.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ARQ = path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment.js');
const fonte = fs.readFileSync(ARQ, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── inscrição: um leitor de resultado ────');

function corpoDe(src, marca) {
  const i = src.indexOf(marca);
  if (i === -1) throw new Error('não achei ' + marca);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1) + ';'; }
  }
  throw new Error('não fechei ' + marca);
}
const corpo = corpoDe(fonte, 'window._applyEnrollResult = function');

function monta() {
  const sb = {};
  sb.window = sb; sb.globalThis = sb; sb.console = console;
  sb.toasts = [];
  sb.perguntas = [];
  sb.notifs = [];
  sb.renders = 0;
  sb.showNotification = (t, m, k) => sb.toasts.push({ t, m, k });
  sb._t = (k, v) => k + (v && v.name != null ? ':' + v.name : '');
  sb._safeHtml = (s) => String(s == null ? '' : s);
  sb._askDuplicatePerson = (tId, dup) => sb.perguntas.push({ tId, dup });
  sb._notifyTournamentParticipants = (t, n) => sb.notifs.push(n);
  sb.document = { getElementById: () => null };
  vm.createContext(sb);
  vm.runInContext(corpo, sb, { filename: 'leitor.js' });
  return sb;
}

// (a) waitlisted do ORGANIZADOR: mensagem na 3ª pessoa, listas sincronizadas
{
  const sb = monta();
  const t = { name: 'Confra', participants: [{ uid: 'x' }], standbyParticipants: [] };
  const v = sb._applyEnrollResult(t, 'tid', {
    waitlisted: true, participants: [{ uid: 'x' }], standbyParticipants: [{ uid: 'novo' }]
  }, { name: 'Fulana', self: false, refresh: false });
  ok(v === 'waitlisted', '(a) veredito waitlisted');
  ok(t.standbyParticipants.length === 1, '(a) fila local adota a do servidor');
  ok(sb.toasts.length === 1 && /Fulana/.test(sb.toasts[0].m) && /lista de espera/i.test(sb.toasts[0].m),
    '(a) o organizador é AVISADO que a pessoa foi pra fila — era o sumiço mudo. Veio: ' + JSON.stringify(sb.toasts));
}

// (b) enrollmentClosed: corrige o toast otimista com "NÃO foi gravada" + rollback da cópia
{
  const sb = monta();
  const pushed = { uid: 'eu', _pendingEnroll: true };
  const t = { name: 'Confra', participants: [{ uid: 'x' }, pushed] };
  const v = sb._applyEnrollResult(t, 'tid', {
    enrollmentClosed: true, alreadyEnrolled: false, participants: [{ uid: 'x' }]
  }, { name: 'Eu', self: true, optimistic: pushed, refresh: false });
  ok(v === 'closed', '(b) veredito closed');
  ok(sb.toasts.length === 1 && sb.toasts[0].k === 'error' && /NÃO foi gravada/.test(sb.toasts[0].m),
    '(b) o silêncio virou correção explícita — veio ' + JSON.stringify(sb.toasts));
  ok(t.participants.indexOf(pushed) === -1, '(b) o push otimista SAI da tela (rollback por referência)');
}

// (c) recusa por duplicata: o diálogo "não sou eu" ABRE (era código morto nesse ramo)
{
  const sb = monta();
  const t = { name: 'Confra', participants: [] };
  const dup = { motivo: 'nome', texto: 'Você PARECE já estar inscrito...' };
  const v = sb._applyEnrollResult(t, 'tid', {
    alreadyEnrolled: true, dupSuspect: dup, participants: []
  }, { name: 'Eu', self: true, refresh: false });
  ok(v === 'dupSuspect', '(c) veredito dupSuspect');
  ok(sb.perguntas.length === 1 && sb.perguntas[0].dup === dup,
    '(c) _askDuplicatePerson É chamado na recusa por duplicata (o bug do Nelson Barth)');
  ok(sb.toasts.length === 0, '(c) sem toast "já inscrito" mentiroso por cima do diálogo');
}

// (d) alreadyEnrolled comum: informa; capacityFull: erro; alreadyWaitlisted: info
{
  const sb = monta();
  const t = { name: 'Confra', participants: [] };
  ok(sb._applyEnrollResult(t, 'tid', { alreadyEnrolled: true, participants: [] }, { name: 'Eu', refresh: false }) === 'already'
    && sb.toasts[0].k === 'info', '(d) already → info');
  ok(sb._applyEnrollResult(t, 'tid', { capacityFull: true, participants: [] }, { name: 'Eu', self: true, refresh: false }) === 'capacityFull'
    && sb.toasts[1].k === 'error', '(d) capacityFull → erro explícito');
  ok(sb._applyEnrollResult(t, 'tid', { waitlisted: true, alreadyWaitlisted: true, participants: [] }, { name: 'Eu', refresh: false }) === 'alreadyWaitlisted'
    && sb.toasts[2].k === 'info', '(d) alreadyWaitlisted → info');
}

// (e) enrolled: dupSuspect fail-open ainda pergunta; autoClose fecha e notifica
{
  const sb = monta();
  const t = { name: 'Confra', participants: [], maxParticipants: 8 };
  const dup = { motivo: 'celular' };
  const v = sb._applyEnrollResult(t, 'tid', {
    participants: [{ uid: 'eu' }], dupSuspect: dup, autoCloseTriggered: true
  }, { name: 'Eu', self: true, refresh: false, excludeEmail: 'eu@x.com' });
  ok(v === 'enrolled', '(e) veredito enrolled');
  ok(sb.perguntas.length === 1, '(e) dupSuspect com inscrição feita (fail-open) também pergunta');
  ok(t.status === 'closed', '(e) autoClose fecha o torneio local');
  ok(sb.notifs.some(n => n.type === 'enrollments_closed'), '(e) autoClose notifica os inscritos');
}

// ── FIAÇÃO: os 4 call sites usam o leitor; nenhum re-interpreta o shape na mão ─
const semComent = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = semComent(fonte);
ok((code.match(/_applyEnrollResult\(t, tId, res/g) || []).length +
   (code.match(/_applyEnrollResult\(t, tId, result/g) || []).length >= 4,
  'os 4 call sites (self, time, +participante, fila) passam pelo leitor único');
// o padrão antigo (ramos soltos de result.waitlisted fora do leitor) não pode voltar
const foraDoLeitor = code.replace(corpoDe(code, 'window._applyEnrollResult = function'), '');
ok(!/result\.waitlisted/.test(foraDoLeitor) && !/result\.enrollmentClosed/.test(foraDoLeitor),
  'REGRESSÃO: nenhum call site volta a ler waitlisted/enrollmentClosed na mão');

console.log(fail === 0 ? '✅ inscricao-outcomes-um-leitor: ' + pass + ' asserções, 0 falha(s)'
                       : '❌ inscricao-outcomes-um-leitor: ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
