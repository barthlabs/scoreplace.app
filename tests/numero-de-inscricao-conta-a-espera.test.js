'use strict';
/* ⛔⛔ A FILA DE INSCRIÇÃO É UMA SÓ: ELENCO + ESPERA.
 *
 * Relato do dono (24/set/2026): "o numero de inscricao nao esta sendo preservado. as
 * pessoas estao entrando na lista de espera com 1 2 3 4... temos 154 inscritos e deveria
 * observar isso. ja existe até 154 pela ordem de inscricao. o proximo sera 155".
 *
 * Causa: quem numerava e quem exibia percorriam só `participants`. A espera nunca entrava
 * na conta, ficava sem número, e o crachá caía na POSIÇÃO dentro do painel.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── número de inscrição conta a espera ────');

const D = require(path.join(ROOT, 'js/domain/waitlist.js'));
const helpers = {
  participantUids: (e) => (e && e.uid) ? [String(e.uid)] : [],
  displayName: (e) => (typeof e === 'string') ? e.trim() : String((e && (e.displayName || e.name)) || '')
};

// ── 1. O caso do dono: 154 no elenco, a espera continua em 155 ───────────────
{
  const t = { participants: [], standbyParticipants: [{ uid: 'w1', displayName: 'Espera Um' }, { uid: 'w2', displayName: 'Espera Dois' }] };
  for (let i = 1; i <= 154; i++) t.participants.push({ uid: 'u' + i, displayName: 'P' + i, enrollSeq: i });
  const tocados = D.allocateEnrollSeqs(t, helpers);
  ok(t.standbyParticipants[0].enrollSeq === 155 && t.standbyParticipants[1].enrollSeq === 156,
    'com 154 inscritos, a espera recebe 155 e 156');
  ok(t.participants.every((p, i) => p.enrollSeq === i + 1), 'ninguém do elenco mudou de número');
  ok(tocados.indexOf('standbyParticipants') !== -1 && tocados.indexOf('participants') === -1,
    'só o storage realmente alterado é devolvido para gravação');
}

// ── 2. Entrada de espera em DUPLA: um número por pessoa ──────────────────────
{
  const t = {
    participants: [{ uid: 'a', displayName: 'A', enrollSeq: 1 }],
    standbyParticipants: [{ p1Uid: 'b', p1Name: 'B', p2Uid: 'c', p2Name: 'C' }]
  };
  D.allocateEnrollSeqs(t, helpers);
  const dupla = t.standbyParticipants[0];
  ok(dupla.p1Seq === 2 && dupla.p2Seq === 3, 'a dupla na espera recebe DOIS números, um por pessoa');
}

// ── 3. Mesma pessoa em dois storages: UM número, e as DUAS cópias gravadas ───
{
  const t = {
    participants: [{ uid: 'a', displayName: 'A', enrollSeq: 1 }],
    standbyParticipants: [{ uid: 'dup', displayName: 'Duplicada' }],
    waitlist: [{ uid: 'dup', displayName: 'Duplicada' }]
  };
  D.allocateEnrollSeqs(t, helpers);
  ok(t.standbyParticipants[0].enrollSeq === 2 && t.waitlist[0].enrollSeq === 2,
    'a pessoa em dois storages tem UM número, gravado nas DUAS cópias');
  const fila = D.enumerateEnrollQueue(t, helpers);
  ok(fila.length === 2, 'e ela ocupa UMA posição na fila, não duas');
}

// ── 4. Conflito: duas cópias com números diferentes ──────────────────────────
{
  const t = {
    participants: [{ uid: 'x', displayName: 'X', enrollSeq: 7 }],
    standbyParticipants: [{ uid: 'x', displayName: 'X', enrollSeq: 3 }]
  };
  D.allocateEnrollSeqs(t, helpers);
  const fila = D.enumerateEnrollQueue(t, helpers);
  ok(fila[0].seq === 3, 'entre duas sequências divergentes, vale a MENOR (a chegada real)');
  ok(t.participants[0].enrollSeq === 7 && t.standbyParticipants[0].enrollSeq === 3,
    'e NENHUMA das duas é sobrescrita — reescrever número gravado é perder dado');
}

// ── 5. Primeira sequência NÃO NULA, não a primeira ocorrência ────────────────
{
  const t = {
    participants: [{ uid: 'y', displayName: 'Y' }],
    standbyParticipants: [{ uid: 'y', displayName: 'Y', enrollSeq: 42 }]
  };
  D.allocateEnrollSeqs(t, helpers);
  ok(t.participants[0].enrollSeq === 42, 'a cópia vazia herda o número que a outra JÁ tinha');
}

// ── 6. Dois inscritos MANUAIS homônimos são pessoas diferentes ───────────────
{
  const t = {
    participants: [],
    standbyParticipants: [
      { manualParticipantId: 'manual-1', name: 'Maria', displayName: 'Maria' },
      { manualParticipantId: 'manual-2', name: 'Maria', displayName: 'Maria' }
    ]
  };
  D.allocateEnrollSeqs(t, helpers);
  ok(t.standbyParticipants[0].enrollSeq === 1 && t.standbyParticipants[1].enrollSeq === 2,
    'dois manuais homônimos recebem números DIFERENTES (casam pelo id, não pelo nome)');
  ok(D.key({ manualParticipantId: 'manual-1', name: 'Maria' }, helpers) === 'manual-1',
    'a chave do domínio prefere o id do manual ao nome');
  const t2 = { standbyParticipants: [{ manualParticipantId: 'manual-1', name: 'Maria', displayName: 'Maria' }] };
  const entrou = D.pushBack(t2, { manualParticipantId: 'manual-2', name: 'Maria', displayName: 'Maria' }, helpers);
  ok(entrou === true && t2.standbyParticipants.length === 2,
    'e devolver o segundo homônimo à fila NÃO o confunde com o primeiro');
}

// ── 7. Elenco incompleto: não se numera nada ─────────────────────────────────
{
  const store = read('js/store.js');
  const corpo = store.slice(store.indexOf('window._ensureEnrollSeqs = function'),
                            store.indexOf('window._buildEnrollOrderMap = function'));
  ok(/if \(t\._faltamPesados\) return;/.test(corpo),
    'torneio dividido com elenco incompleto NÃO é numerado (números colidiriam para sempre)');
  ok(/_allocateEnrollSeqs/.test(corpo), 'o carimbo passa pelo domínio, não por varredura própria');
  const mapa = store.slice(store.indexOf('window._buildEnrollOrderMap = function'),
                           store.indexOf('window._enrollNumber = function'));
  ok(/_enrollQueue/.test(mapa), 'o mapa também sai da fila única');
}

// ── 8. Texto órfão de Monarch não vira inscrito ──────────────────────────────
{
  const t = { participants: [], monarchWaitlist: { A: ['Fantasma Solto'] } };
  const tocados = D.allocateEnrollSeqs(t, helpers);
  ok(tocados.length === 0, 'resíduo textual de Rei/Rainha não recebe número nem cria entrada');
  ok(t.monarchWaitlist.A[0] === 'Fantasma Solto', 'e continua exatamente como estava');
}

// ── 9. REGRESSÃO NOMEADA: a posição no painel não pode virar crachá ──────────
{
  const participants = read('js/views/participants.js');
  const i = participants.indexOf('var _fTemNum =');
  const bloco = participants.slice(i, participants.indexOf('\n\n', i));
  ok(/_fNumIns = _fTemNum \? _fEnrollNum : ''/.test(bloco),
    'o número exibido vem só do mapa — vazio quando não se sabe');
  ok(/var _fOrder = _fTemNum \? \(_fEnrollNum - 1\) : idx;/.test(bloco),
    'e a ORDEM local continua podendo usar a posição, que é outra pergunta');
  const badge = participants.slice(participants.indexOf('var _wmNum ='));
  ok(/if \(_fNumIns === '' \|\| _fNumIns == null\) return '';/.test(badge.slice(0, 300)),
    'sem número conhecido o crachá NÃO sai — em vez de mostrar a posição no painel');
  ok(!/_fOrder \+ 1/.test(badge.slice(0, 300)),
    'REGRESSÃO: o crachá nunca mais é derivado da posição (era isso que mostrava 1, 2, 3, 4)');
}

// ── 10. Os escritores que moviam gente NÃO perdem o número ───────────────────
{
  const wo = read('js/views/wo-core.js');
  ok(/_pSeq == null[\s\S]{0,200}enrollSeq: _pSeq/.test(wo),
    'o parceiro órfão de W.O. leva o número que já tinha para a espera');
  ok(/_pSeqN == null && !_pManual\) t\.standbyParticipants\.push\(partner\)/.test(wo),
    'e a dupla MANUAL volta como objeto quando há número ou id a preservar');
  const draw = read('functions-autodraw/draw-core.js');
  ok(/const s1 = _solo\(e\.p1Uid,[\s\S]{0,80}e\.p1Seq/.test(draw),
    'desfazer dupla tardia devolve cada solo com o SEU número');
  const vendorDraw = fs.existsSync(path.join(ROOT, 'functions-autodraw/vendor/waitlist.js'));
  ok(vendorDraw, 'o domínio está vendorizado — é a cópia que o servidor executa');
  const tourn = read('js/views/tournaments.js');
  ok(/allocateEnrollSeqs\(t, \{/.test(tourn),
    'placeholder criado depois do sorteio entra na fila pelo mesmo domínio');
}

// ── 11. Servidor: a inscrição tardia nasce COM número ────────────────────────
{
  const core = read('functions/enroll-core.js');
  ok(/require\('\.\/vendor\/waitlist\.js'\)/.test(core),
    'o servidor usa o domínio vendorizado, não uma segunda cópia da regra');
  ok(/var tocados = allocateEnrollSeqs\(wlData\);/.test(core),
    'a inscrição que cai na espera materializa os legados e numera o recém-chegado');
  ok(/entry: novaEntrada/.test(core), 'e devolve a entrada JÁ NUMERADA');
  ok(/waitlist: wlData\.waitlist, monarchWaitlist: wlData\.monarchWaitlist/.test(core),
    'devolvendo também os outros storages que a materialização tocou');
  const idx = read('functions/index.js');
  ok(/entry: _enrollCore\.cleanUndefined\(out\.entry \|\| sanitizedParticipantObj\)/.test(idx),
    'o espelho do roster grava a entrada numerada, não o objeto de intenção');
}

// ── 12. Ordem: o legado é materializado ANTES do recém-chegado ───────────────
{
  const t = {
    participants: [{ uid: 'velho', displayName: 'Velho', enrollSeq: 1 }],
    standbyParticipants: [{ uid: 'espera-antiga', displayName: 'Espera Antiga' }]
  };
  t.standbyParticipants.push({ uid: 'novo', displayName: 'Recem Chegado' });
  D.allocateEnrollSeqs(t, helpers);
  ok(t.standbyParticipants[0].enrollSeq === 2 && t.standbyParticipants[1].enrollSeq === 3,
    'quem esperava há mais tempo fica com o número MENOR que o recém-chegado');
}

console.log(fail ? `❌ numero-de-inscricao-conta-a-espera: ${fail} falha(s), ${pass} ok`
                 : `✅ numero-de-inscricao-conta-a-espera: ${pass} ok`);
process.exit(fail ? 1 : 0);
