/* ENTRAR NA LISTA DE ESPERA NÃO PODE DEPENDER DE GRAVAR O TORNEIO INTEIRO.
 *
 * INCIDENTE REAL (Confra BT Alta da Clínica 2026, 12/ago/2026, relatado ao vivo): a Mariana
 * abriu o torneio, clicou em inscrever-se, APARECEU EM AZUL na lista de espera ("você") e
 * em seguida sumiu com "Não foi possível entrar na lista de espera · Missing or
 * insufficient permissions". Ela estava no app da APPLE (1.7.76 — nativo não tem
 * auto-update), mas o defeito é do código, não da versão.
 *
 * CAUSA: `_enrollToStandby` era o ÚNICO caminho de inscrição que não passava pela Cloud
 * Function. Pra pôr UMA pessoa numa fila ele fazia `saveTournament(t)` — o DOCUMENTO
 * INTEIRO (125 campos) a partir da cópia em memória. A regra `isEnrollmentOnlyDiff()` só
 * autoriza diff em 6 campos, então bastava UM campo da cópia local divergir do banco pra
 * escrita inteira cair. E o push otimista antes do save é o "azul que aparece e some".
 *
 * MEDIDO antes de mexer: com o `t` espelhando o banco, o payload real PASSA nas regras
 * (tests/rules-inscricao-espera.test.js, 200 contra o doc real). Ou seja o defeito não é a
 * regra — é fazer a entrada de um nome numa lista depender de 125 campos idênticos.
 *
 * O CONSERTO: usar `FirestoreDB.enrollParticipant`, que é a porta que os outros 3 caminhos
 * de inscrição já usam — CF (Admin SDK, lê fresco) com fallback pra transação do cliente,
 * e os DOIS escrevem só `standbyParticipants` + `memberUids`.
 *
 * Este teste roda a função REAL extraída do arquivo (não uma réplica) e trava as duas
 * metades: a fiação (quem é chamado) e o comportamento (o que acontece na tela).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ARQ = path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment.js');
const fonte = fs.readFileSync(ARQ, 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── inscrição na fila passa pelo servidor ────');

// ── Extrai o corpo REAL de _enrollToStandby (da abertura até o fecho da função) ────────
function corpoDe(src) {
  const i = src.indexOf('function _enrollToStandby(');
  if (i === -1) throw new Error('não achei _enrollToStandby — ajuste o teste');
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('não fechei a função');
}
const corpo = corpoDe(fonte);

// v1.8.40: _enrollToStandby delega a leitura do resultado ao LEITOR ÚNICO
// (window._applyEnrollResult) — o harness carrega os DOIS códigos reais.
function corpoDoLeitor(src) {
  const i = src.indexOf('window._applyEnrollResult = function');
  if (i === -1) throw new Error('não achei _applyEnrollResult — ajuste o teste');
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1) + ';'; }
  }
  throw new Error('não fechei _applyEnrollResult');
}
const corpoLeitor = corpoDoLeitor(fonte);
// A varredura olha o CÓDIGO, não os comentários — o bloco que explica o incidente cita
// `saveTournament` de propósito, e sem isto o teste acusaria a própria documentação.
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── 1. VARREDURA: a regressão volta se alguém reintroduzir o save do doc inteiro ───────
ok(semComentario(corpo).indexOf('saveTournament') === -1,
   'REGRESSÃO: _enrollToStandby não pode chamar saveTournament (grava o doc inteiro)');
ok(/enrollParticipant\s*\(/.test(semComentario(corpo)),
   '_enrollToStandby tem que chamar FirestoreDB.enrollParticipant');

// O mesmo trecho no código publicado (1.8.34) reprova — senão o teste não prova nada.
try {
  const antigo = require('child_process').execFileSync(
    'git', ['show', 'bd5599f8:js/views/tournaments-enrollment.js'],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const corpoAntigo = semComentario(corpoDe(antigo));
  ok(corpoAntigo.indexOf('saveTournament') !== -1,
     'controle: na 1.8.34 a função USAVA saveTournament (se não usava, o diagnóstico está errado)');
} catch (e) {
  console.log('  (pulei o controle contra a 1.8.34: ' + e.message.split('\n')[0] + ')');
}

// ── 2. COMPORTAMENTO: roda a função REAL ───────────────────────────────────────────────
function monta(resposta, opts) {
  opts = opts || {};
  const sb = {};
  sb.window = sb; sb.globalThis = sb; sb.console = console;
  sb._warn = sb._log = sb._error = sb._debug = () => {};
  sb.toasts = [];
  sb.showNotification = (titulo, msg, tipo) => sb.toasts.push({ titulo, msg, tipo });
  sb._t = (k, v) => k + (v && v.name ? ':' + v.name : '');
  sb._pName = (p) => (p && (p.name || p.displayName)) || '';
  sb._participantUids = (p) => (p && typeof p === 'object' ? [p.uid, p.p1Uid, p.p2Uid].filter(Boolean) : []);
  sb._effectiveLateEnrollment = () => 'standby';
  sb._captureException = () => {};
  sb.chamou = [];
  sb.FirestoreDB = {
    saveTournament: function () { sb.chamou.push('saveTournament'); return Promise.resolve(); },
    enrollParticipant: function (tId, obj) {
      sb.chamou.push('enrollParticipant');
      sb.recebeu = { tId, obj };
      // fotografa a lista NO MOMENTO da chamada — é aqui que o push otimista apareceria
      sb.filaDuranteAChamada = (opts.t.standbyParticipants || []).slice();
      return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta);
    }
  };
  // self = uid do participantObj bate com o usuário logado → mensagens na 2ª pessoa.
  sb.AppStore = { currentUser: { uid: 'uid_mariana' } };
  sb._safeHtml = (s) => String(s == null ? '' : s);
  vm.createContext(sb);
  vm.runInContext(corpoLeitor + corpo + ';this.__f = _enrollToStandby;', sb, { filename: 'enroll.js' });
  return sb;
}

const NOVA = { uid: 'uid_mariana', name: 'Mariana', displayName: 'Mariana', selfEnrolled: true };

// (a) caminho feliz: servidor devolve waitlisted + a lista dele
(async () => {
  const t = { id: 'tour_x', name: 'Confra', participants: [{ uid: 'uid_org' }], standbyParticipants: [] };
  const sb = monta({ alreadyEnrolled: false, waitlisted: true,
                     standbyParticipants: [{ uid: 'uid_mariana', enrollSeq: 143 }] }, { t });
  await new Promise(r => sb.__f(t, 'tour_x', NOVA, r));

  ok(sb.chamou.indexOf('enrollParticipant') !== -1 && sb.chamou.indexOf('saveTournament') === -1,
     'usa enrollParticipant e NUNCA saveTournament — chamou: ' + JSON.stringify(sb.chamou));
  ok(sb.recebeu && sb.recebeu.tId === 'tour_x' && sb.recebeu.obj === NOVA,
     'passa o tournamentId e o participantObj pro servidor');
  ok(sb.filaDuranteAChamada.length === 0,
     'SEM PUSH OTIMISTA: a lista não pode receber ninguém antes da resposta do servidor ' +
     '(é isso que produzia o "apareceu em azul e sumiu") — tinha ' + sb.filaDuranteAChamada.length);
  ok(t.standbyParticipants.length === 1 && t.standbyParticipants[0].enrollSeq === 143,
     'a cópia em memória adota a lista que o SERVIDOR devolveu (com o enrollSeq dele)');
  // v1.8.40 (revisada, motivo): o toast agora sai do LEITOR ÚNICO (_applyEnrollResult),
  // com texto próprio pra "você" — o invariante (avisar que ENTROU NA FILA, tom de
  // sucesso, um toast só) é o mesmo; só a chave i18n deixou de ser o contrato.
  ok(sb.toasts.length === 1 && sb.toasts[0].tipo === 'success' &&
     /lista de espera/i.test(sb.toasts[0].titulo),
     'avisa que entrou na lista de espera — veio ' + JSON.stringify(sb.toasts));

  // (b) servidor decide que ainda cabe no ELENCO (fase não estava sorteada no doc fresco)
  const t2 = { id: 'tour_x', name: 'Confra', participants: [], standbyParticipants: [] };
  const sb2 = monta({ alreadyEnrolled: false, waitlisted: false,
                      participants: [{ uid: 'uid_org' }, { uid: 'uid_mariana' }] }, { t: t2 });
  await new Promise(r => sb2.__f(t2, 'tour_x', NOVA, r));
  ok(t2.participants.length === 2 && t2.standbyParticipants.length === 0,
     'quando o servidor inscreve no elenco, a tela segue o servidor e não força a fila');
  ok(sb2.toasts.length === 1 && sb2.toasts[0].titulo === 'enroll.enrolledTitle',
     'toast de INSCRITO (não de fila) nesse caso — veio ' + JSON.stringify(sb2.toasts));
  ok(sb2.toasts[0].msg.indexOf('Confra') !== -1,
     'enroll.enrolledMsg interpola o nome do TORNEIO (a chave é assim) — veio ' + sb2.toasts[0].msg);

  // (c) já estava na fila: informa e não duplica
  const t3 = { id: 'tour_x', name: 'Confra', participants: [], standbyParticipants: [] };
  const sb3 = monta({ alreadyEnrolled: false, waitlisted: true, alreadyWaitlisted: true }, { t: t3 });
  await new Promise(r => sb3.__f(t3, 'tour_x', NOVA, r));
  ok(t3.standbyParticipants.length === 0 && sb3.toasts[0].tipo === 'info',
     'já na fila: avisa sem duplicar a entrada — fila ' + t3.standbyParticipants.length);

  // (d) falha do servidor: avisa e NÃO deixa a pessoa na lista local (nada a desfazer)
  const t4 = { id: 'tour_x', name: 'Confra', participants: [], standbyParticipants: [] };
  const err = new Error('Missing or insufficient permissions');
  const sb4 = monta(err, { t: t4 });
  await new Promise(r => sb4.__f(t4, 'tour_x', NOVA, r));
  ok(t4.standbyParticipants.length === 0,
     'falhou: ninguém fica na lista local (sem push otimista não há rollback a errar)');
  ok(sb4.toasts.length === 1 && sb4.toasts[0].tipo === 'error' &&
     sb4.toasts[0].msg.indexOf('permissions') !== -1,
     'falhou: mostra o erro REAL do servidor, não texto genérico');

  // (e) v1.8.40 (REVISADA, motivo no arquivo): o pré-gate LOCAL saiu de propósito.
  // Ele decidia "já está na fila/inscrito" olhando a CÓPIA EM MEMÓRIA (stale) e
  // retornava SEM chamar o callback — botão preso e recusa por dado velho. O
  // invariante novo é o inverso: a cópia local NUNCA recusa ninguém; quem responde
  // "já está" é o SERVIDOR (alreadyWaitlisted), lendo o doc fresco — e a resposta
  // dele não duplica a entrada local.
  const t5 = { id: 'tour_x', name: 'Confra', participants: [], standbyParticipants: [{ uid: 'uid_mariana' }] };
  const sb5 = monta({ waitlisted: true, alreadyWaitlisted: true,
                      standbyParticipants: [{ uid: 'uid_mariana' }] }, { t: t5 });
  await new Promise(r => sb5.__f(t5, 'tour_x', NOVA, r));
  ok(sb5.chamou.indexOf('enrollParticipant') !== -1,
     'a cópia local NUNCA recusa: mesmo "já na fila" local, o servidor é consultado — chamou ' + JSON.stringify(sb5.chamou));
  ok(t5.standbyParticipants.length === 1,
     'resposta alreadyWaitlisted não duplica a entrada local — fila ' + t5.standbyParticipants.length);
  // varredura: o pré-gate local não pode voltar
  ok(semComentario(corpo).indexOf('já está na fila') === -1 &&
     !/standbyParticipants\.some\(/.test(semComentario(corpo)),
     'REGRESSÃO: _enrollToStandby não pode voltar a decidir "já está" pela cópia local');

  console.log(fail === 0 ? '  ✓ ' + pass + ' asserções' : '  ' + pass + ' ok / ' + fail + ' falhas');
  process.exit(fail === 0 ? 0 : 1);
})();
