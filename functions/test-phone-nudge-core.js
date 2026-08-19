/* COBRANÇA DIÁRIA DE CELULAR NO PERFIL — quem recebe, quem NUNCA recebe, e como
 * a conversão por leva é contada.
 *
 * Pedido do dono (19/ago/2026): _"vamos fazer essa verificação diariamente e
 * mandar esse e-mail novamente a quem ainda não atendeu ao chamado. aos que
 * colocaram, não mande novamente. o e-mail consolidando as informações pode
 * atualizar dos que receberam, quais atenderam em cada leva."_
 *
 * O que este teste trava, na ordem do que dói errar:
 *   1. quem TEM celular NUNCA entra na lista — nem no primeiro envio;
 *   2. a LEVA registra quem recebeu (sem isso "quantos atenderam" volta a ser
 *      incalculável, que foi o buraco do envio manual do dia 18);
 *   3. lápide (mergedInto) resolve pra conta VIVA e o celular avaliado é o dela;
 *   4. conta só-celular (e-mail @phone.scoreplace.app) e opt-out saem da lista
 *      mas são CONTADOS no relatório — nada de "ninguém ficou de fora" sem medir;
 *   5. leva de ENSAIO aparece marcada e o consolidado avisa que nada foi enviado;
 *   6. FIAÇÃO: a CF agendada existe em index.js, roda de manhã em BRT, e o
 *      runner nasce em dry-run (enabled !== true), com e-mail idempotente
 *      (create + ALREADY_EXISTS tolerado).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('./phone-nudge-core.js');

let pass = 0, fail = 0;
const ok = (m, c) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── phone-nudge-core ────');

// ── 1. ELENCO: solo, dupla, time, standby — e uid repetido é UMA pessoa ─────
const t = {
  participants: [
    { uid: 'uA', name: 'Ana' },
    { p1Uid: 'uB', p2Uid: 'uC', name: 'Dupla' },
    { participants: [{ uid: 'uD' }, { uid: 'uA' }] }, // uA repetido num time
  ],
  standbyParticipants: [{ uid: 'uE' }],
};
const uids = core.rosterUids(t);
ok('elenco cobre solo + dupla + time + standby', uids.length === 5 &&
  ['uA', 'uB', 'uC', 'uD', 'uE'].every((u) => uids.indexOf(u) !== -1));

// ── 2. A CLASSIFICAÇÃO ──────────────────────────────────────────────────────
const profiles = {
  uA: { displayName: 'Ana Silva', email: 'ana@x.com', phone: '+55 11 91234-5678' }, // tem celular
  uB: { displayName: 'Beto Costa', email: 'beto@x.com' },                            // alvo
  uC: { displayName: 'Caio', email: 'uC@phone.scoreplace.app' },                     // só-celular: inalcançável
  uD: { displayName: 'Duda', email: 'duda@x.com', notifyEmail: false },              // opt-out
  uE: { displayName: 'Eva', mergedInto: 'uF' },                                      // lápide →
  uF: { displayName: 'Eva Viva', email: 'eva@x.com', phone: '11987654321' },         // conta viva COM celular
};
const cls = core.classifyRoster(uids, profiles);

ok('quem TEM celular NUNCA entra na lista (Ana)',
  cls.targets.every((p) => p.uid !== 'uA'));
ok('a LÁPIDE resolve pra conta viva — e o celular avaliado é o DELA (Eva não é cobrada)',
  cls.targets.every((p) => p.uid !== 'uE' && p.uid !== 'uF') &&
  cls.skipped.merged.some((m) => m.uid === 'uE' && m.into === 'uF'));
ok('só Beto é alvo', cls.targets.length === 1 && cls.targets[0].uid === 'uB' &&
  cls.targets[0].email === 'beto@x.com');
ok('conta só-celular é EXCLUÍDA e CONTADA (não some do relatório)',
  cls.skipped.noEmail.length === 1 && cls.skipped.noEmail[0].uid === 'uC');
ok('opt-out (notifyEmail:false) é EXCLUÍDO e CONTADO',
  cls.skipped.optOut.length === 1 && cls.skipped.optOut[0].uid === 'uD');
ok('a foto do elenco soma: 5 vivos, 2 com celular, 3 sem',
  cls.roster === 5 && cls.withPhone === 2 && cls.withoutPhone === 3);

// celular curto demais não conta como "tem"
ok('telefone com menos de 8 dígitos NÃO é celular cadastrado',
  core.hasPhone({ phone: '1234567' }) === false && core.hasPhone({ phone: '11 91234-5678' }) === true);

// corrente de fusão com ciclo não trava
const ciclo = { u1: { mergedInto: 'u2' }, u2: { mergedInto: 'u1' } };
ok('ciclo de mergedInto não vira laço infinito', !!core.resolveLive('u1', ciclo));

// ── 3. CONVERSÃO POR LEVA — o pedido literal do dono ────────────────────────
const waves = [
  { waveId: '2026-08-18', recipientUids: ['uB', 'uG', 'uH'], roster: 5, withPhone: 2, withoutPhone: 3 },
  { waveId: '2026-08-19', recipientUids: ['uB', 'uH'], roster: 5, withPhone: 3, withoutPhone: 2, dryRun: true },
];
const now = { uB: false, uG: true, uH: false }; // uG cadastrou depois da leva 1
const stats = core.waveStats(waves, now);
ok('leva 1: 3 receberam, 1 atendeu, 2 faltam',
  stats[0].sent === 3 && stats[0].answered === 1 && stats[0].pending === 2 &&
  stats[0].answeredUids[0] === 'uG');
ok('leva de ENSAIO vem marcada (dryRun) — não se soma como cobrança real',
  stats[1].dryRun === true);
ok('levas saem em ordem cronológica mesmo se chegarem fora de ordem',
  core.waveStats(waves.slice().reverse(), now)[0].waveId === '2026-08-18');

// ── 4. O E-MAIL DA PESSOA — o texto do dono, não outro ──────────────────────
const mail = core.buildNudgeEmail('Beto Costa');
ok('assunto é o MESMO do envio manual do dia 18',
  mail.subject === 'Confra BT Alta da Clínica 2026 — coloca seu Whats no perfil?');
ok('texto do dono preservado (Whats no perfil + fale com o organizador)',
  /colocar seu Whats no seu perfil/.test(mail.html) && /fale com o organizador/.test(mail.html));
ok('CTA aponta pro perfil', mail.html.indexOf('https://scoreplace.app/#profile') !== -1);
ok('reenvio reconhece quem já atendeu ("pode ignorar")', /pode ignorar/.test(mail.html));
ok('tem versão texto (spam score)', typeof mail.text === 'string' && mail.text.length > 50);
ok('nome é escapado (XSS no e-mail)',
  core.buildNudgeEmail('<img src=x>').html.indexOf('<img') === -1);

// ── 5. O CONSOLIDADO DO DONO ────────────────────────────────────────────────
const rep = core.buildReportEmail({
  tournamentId: 'tour_1', tournamentName: 'Confra BT', waveId: '2026-08-19',
  nowMs: Date.UTC(2026, 7, 19, 12, 30), dryRun: false, stats,
  today: { roster: 5, withPhone: 3, withoutPhone: 2, targets: cls.targets, skipped: cls.skipped },
});
ok('assunto resume a leva (cobrados + com celular/elenco)',
  /leva 19\/08/.test(rep.subject) && /3\/5/.test(rep.subject));
ok('tabela por leva tem as duas levas', /18\/08/.test(rep.html) && /19\/08/.test(rep.html));
ok('excluídos aparecem com o MOTIVO (só-celular e opt-out)',
  /conta só-celular/.test(rep.html) && /desligou e-mail/.test(rep.html));
ok('horário é rotulado BRT', /BRT/.test(rep.html));

const repDry = core.buildReportEmail({
  tournamentName: 'Confra BT', waveId: '2026-08-19', nowMs: Date.now(), dryRun: true,
  stats: [], today: { roster: 5, withPhone: 3, withoutPhone: 2, targets: [], skipped: {} },
});
ok('ENSAIO grita no assunto e no corpo — ninguém confunde com envio real',
  /^\[ENSAIO\]/.test(repDry.subject) && /nenhum e-mail foi enviado/.test(repDry.html));

// ── 6. FIAÇÃO ───────────────────────────────────────────────────────────────
const idx = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
ok('CF agendada nudgeMissingPhones existe em index.js',
  /exports\.nudgeMissingPhones\s*=\s*onSchedule/.test(idx));
ok('roda todo dia em horário BRT',
  /nudgeMissingPhones[\s\S]{0,400}?schedule:\s*"every day[^"]*"[\s\S]{0,200}?America\/Sao_Paulo/.test(idx));

const run = fs.readFileSync(path.join(__dirname, 'phone-nudge-run.js'), 'utf8');
ok('runner NASCE EM ENSAIO (dryRun quando enabled !== true)',
  /dryRun\s*=\s*cfg\.enabled\s*!==\s*true/.test(run));
ok('e-mail é idempotente: create() com ALREADY_EXISTS tolerado',
  /\.create\(doc\)/.test(run) && /ALREADY_EXISTS/.test(run));
ok('a leva é gravada em phoneNudgeWaves com id determinístico dia__torneio',
  /phoneNudgeWaves/.test(run) && /waveDocId/.test(run));
ok('consolidado vai pra contato@barthlabs (nunca rstbarth@gmail)',
  core.REPORT_TO === 'contato@barthlabs.com' && run.indexOf('rstbarth@gmail') === -1);
ok('canal é a coleção mail (extensão firestore-send-email) — nada de caminho novo',
  /collection\('mail'\)/.test(run) && !/whatsapp|evolution/i.test(run));

// A leva 1 (envio manual de 18/ago, 49 destinatários) é retro-alimentada pela
// própria CF — sem ela, "quantos atenderam desde a leva 1" seria incalculável.
const runner = require('./phone-nudge-run.js');
ok('backfill da leva 1 existe com os 49 uids REAIS do envio manual',
  runner.LEVA1 && runner.LEVA1.waveId === '2026-08-18' &&
  runner.LEVA1.recipientUids.length === 49 &&
  new Set(runner.LEVA1.recipientUids).size === 49 &&
  runner.LEVA1.withoutPhone === 49 && runner.LEVA1.withPhone === 94);
ok('backfill roda a cada execução e é create() (idempotente)',
  /ensureLeva1\(db\)/.test(run) && /manual-backfill/.test(run));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
