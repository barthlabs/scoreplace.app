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

// ── 7. CAMADA 2 (v1.9.97): QUEM TENTOU E NÃO CONSEGUIU ──────────────────────
//
// Caso Leila Arida (20/ago/2026): pediu o código às 11:09, o Identity Toolkit
// devolveu HTTP 200 (SMS entregue à operadora) e nunca houve confirmação. A
// campanha, cega pra isso, ia cobrá-la no dia seguinte com o MESMO texto de quem
// nunca tentou. Estes testes travam a diferença.
//
// A decisão do dono que dá o formato: número NÃO verificado continua fora do
// perfil (pode ser de terceiro, pode ser digitação errada) — o que muda é que a
// falha deixa rastro e ganha saída.

// nunca tentou = null (a esmagadora maioria; não pode virar objeto vazio, senão
// todo mundo cairia na variante "tentou")
ok('quem nunca tentou não tem resumo', core.summarizeAttempts([]) === null &&
  core.summarizeAttempts(null) === null && core.summarizeAttempts(undefined) === null);

const sSent = core.summarizeAttempts([
  { at: '2026-08-20T14:09:00.000Z', status: 'sent', phone: '+5511999998888' },
]);
ok('1 envio sem confirmação = 1 tentativa, status sent',
  sSent && sSent.tentativas === 1 && sSent.ultimoStatus === 'sent' && sSent.confirmou === false);

const sMix = core.summarizeAttempts([
  { at: '2026-08-20T10:00:00.000Z', status: 'sent', phone: '+5511999998888' },
  { at: '2026-08-20T10:05:00.000Z', status: 'code-failed', phone: '+5511999998888' },
  { at: '2026-08-20T09:00:00.000Z', status: 'send-failed', phone: '+5511999998888' },
]);
ok('a ÚLTIMA tentativa é a mais recente por data, não a última do array',
  sMix && sMix.tentativas === 3 && sMix.ultimoStatus === 'code-failed');

// confirmou o código E continua sem celular = bug NOSSO, não da operadora.
// Precisa aparecer, não ser descartado como "já resolveu".
const sBug = core.summarizeAttempts([
  { at: '2026-08-20T10:00:00.000Z', status: 'sent', phone: '+5511999998888' },
  { at: '2026-08-20T10:02:00.000Z', status: 'confirmed', phone: '+5511999998888' },
]);
ok('confirmou o código mas segue sem celular = sinalizado', sBug && sBug.confirmou === true);

// attachAttempts: cola em quem tentou e devolve SÓ esses
const alvos = [
  { uid: 'u1', name: 'Leila', email: 'l@x.com' },
  { uid: 'u2', name: 'Outro', email: 'o@x.com' },
];
const triedList = core.attachAttempts(alvos, {
  u1: [{ at: '2026-08-20T14:09:00.000Z', status: 'sent', phone: '+5511988887777' }],
});
ok('attachAttempts marca só quem tentou',
  triedList.length === 1 && triedList[0].uid === 'u1' && !!alvos[0].tentou && !alvos[1].tentou);

// máscara: DDD visível (denuncia DDD errado), miolo escondido (número não
// verificado não pode virar lista de contatos por tabela lateral)
const mask = core.maskPhone('+5511988887777');
ok('máscara mostra DDD e 4 últimos, esconde o miolo',
  mask.indexOf('11') !== -1 && mask.indexOf('7777') !== -1 && mask.indexOf('98888') === -1);
ok('máscara de lixo não explode', core.maskPhone('') === '' && core.maskPhone(null) === '');

// ── O E-MAIL: duas variantes, e a do dono INTACTA ───────────────────────────
const mailPrimeiro = core.buildNudgeEmail('Leila');
const mailTentou = core.buildNudgeEmail('Leila', sSent);
ok('quem nunca tentou recebe o texto ORIGINAL do dono, palavra por palavra',
  mailPrimeiro.variante === 'primeiro' &&
  mailPrimeiro.subject === 'Confra BT Alta da Clínica 2026 — coloca seu Whats no perfil?' &&
  mailPrimeiro.html.indexOf('Se puder colocar seu Whats no seu perfil') !== -1);
ok('quem tentou recebe OUTRO assunto e OUTRO texto',
  mailTentou.variante === 'tentou' && mailTentou.subject !== mailPrimeiro.subject &&
  /não chegou/.test(mailTentou.subject));
ok('o texto de quem tentou reconhece a tentativa, aponta o reenviar e oferece o organizador',
  /tentou cadastrar/i.test(mailTentou.html) && /Reenviar o código/.test(mailTentou.html) &&
  /fale com o organizador/i.test(mailTentou.html));
ok('as duas variantes têm versão texto (provedor que corta HTML ainda lê)',
  !!mailPrimeiro.text && !!mailTentou.text && mailTentou.text.length > 100);

// ── O CONSOLIDADO DO DONO ───────────────────────────────────────────────────
const repTried = core.buildReportEmail({
  tournamentId: 'tX', tournamentName: 'Confra', waveId: '2026-08-21', nowMs: Date.UTC(2026, 7, 21, 12, 30),
  dryRun: false, stats: [],
  today: {
    roster: 146, withPhone: 101, withoutPhone: 45,
    targets: [
      { uid: 'u1', name: 'Leila Arida', email: 'l@x.com',
        tentou: { tentativas: 2, ultimaAt: '2026-08-20T14:09:00.000Z', ultimoStatus: 'sent',
          ultimoPhone: '+5511988887777', confirmou: false } },
      { uid: 'u2', name: 'Nunca Tentou', email: 'n@x.com' },
    ],
    skipped: { noEmail: [], optOut: [], merged: [], missing: [] },
  },
});
ok('o consolidado abre a seção de quem tentou e não conseguiu',
  /Tentaram e não conseguiram/.test(repTried.html) &&
  /Tentaram cadastrar o celular e não conseguiram/.test(repTried.html));
ok('o consolidado nomeia quem tentou e traduz o status (sent NÃO é "enviado com sucesso")',
  /Leila Arida/.test(repTried.html) && /nunca confirmado/.test(repTried.html));
ok('o consolidado mostra o número tentado MASCARADO, nunca cheio',
  /\*\*\*\*\*-7777/.test(repTried.html) && repTried.html.indexOf('988887777') === -1);
ok('quem nunca tentou NÃO entra na seção de tentativas',
  repTried.html.indexOf('Nunca Tentou —') === -1);

const repBug = core.buildReportEmail({
  tournamentId: 'tX', tournamentName: 'Confra', waveId: '2026-08-21', nowMs: Date.UTC(2026, 7, 21, 12, 30),
  dryRun: false, stats: [],
  today: { roster: 1, withPhone: 0, withoutPhone: 1,
    targets: [{ uid: 'u1', name: 'Leila', email: 'l@x.com',
      tentou: { tentativas: 1, ultimaAt: '2026-08-20T14:09:00.000Z', ultimoStatus: 'sent',
        ultimoPhone: '+5511988887777', confirmou: true } }],
    skipped: { noEmail: [], optOut: [], merged: [], missing: [] } },
});
ok('confirmou e continua sem celular vira ALERTA de bug nosso no consolidado',
  /bug nosso/.test(repBug.html));

// consolidado SEM ninguém que tentou não inventa a seção
const repLimpo = core.buildReportEmail({
  tournamentId: 'tX', tournamentName: 'Confra', waveId: '2026-08-21', nowMs: Date.UTC(2026, 7, 21, 12, 30),
  dryRun: false, stats: [],
  today: { roster: 1, withPhone: 0, withoutPhone: 1,
    targets: [{ uid: 'u2', name: 'Nunca Tentou', email: 'n@x.com' }],
    skipped: { noEmail: [], optOut: [], merged: [], missing: [] } },
});
ok('sem tentativas, a seção nem aparece', !/Tentaram e não conseguiram/.test(repLimpo.html));

// ── FIAÇÃO: o runner precisa LER o rastro e PASSAR a variante ───────────────
ok('o runner lê users/{uid}/phoneVerifyAttempts', /phoneVerifyAttempts/.test(run));
ok('o rastro é lido SÓ pros alvos (não varre o elenco inteiro)',
  /loadAttempts\(db, cls\.targets\.map/.test(run));
ok('o runner passa a tentativa pro e-mail (senão a variante nunca sai)',
  /buildNudgeEmail\(p\.name, p\.tentou\)/.test(run));
ok('a leva grava quem tentou com o número MASCARADO',
  /ultimoPhoneMascarado/.test(run) && /core\.maskPhone/.test(run));
ok('leitura do rastro é fail-open (subcoleção ausente não derruba a rodada)',
  /rastro ilegível/.test(run));

// ── FIAÇÃO DO CLIENTE: sem isto a subcoleção nasce vazia pra sempre ─────────
const authJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');
ok('o cliente grava a tentativa em phoneVerifyAttempts',
  /collection\('phoneVerifyAttempts'\)/.test(authJs));
ok('grava nos TRÊS desfechos: enviado, falha no envio e código errado',
  /_profilePhoneLogAttempt\('sent'\)/.test(authJs) &&
  /_profilePhoneLogAttempt\('send-failed'/.test(authJs) &&
  /_profilePhoneLogAttempt\('code-failed'/.test(authJs) &&
  /_profilePhoneLogAttempt\('confirmed'\)/.test(authJs));
ok('telemetria é fail-open — nunca derruba o fluxo que observa',
  /telemetria não quebra nada/.test(authJs));

// CAMADA 1: o SMS do perfil sai por uma instância SECUNDÁRIA ('profilephone'),
// que NÃO herda o languageCode do app padrão — vinha em INGLÊS.
ok('locale pt-BR forçado na instância secundária (web e nativo)',
  /sapp\.auth\(\)\.languageCode = 'pt-BR'/.test(authJs) &&
  /_sappN\.auth\(\)\.languageCode = 'pt-BR'/.test(authJs) &&
  /setLanguageCode\(\{ languageCode: 'pt-BR' \}\)/.test(authJs));
ok('existe saída quando o SMS não chega: reenviar com contagem',
  /_profilePhoneStartResend/.test(authJs) && /Reenviar o código por SMS/.test(authJs));
ok('erro do Firebase é traduzido, não jogado cru na tela',
  /_profilePhoneErrText/.test(authJs) && /muitas tentativas para este número/i.test(authJs));

console.log(pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
