/* "INSCRIÇÕES ABERTAS" É UMA REGRA SÓ — cliente e servidor têm que concordar.
 *
 * MEDIDO em 13/ago/2026: a mesma pergunta tinha SEIS respostas no app. A pior
 * divergência era o `ligaAberta` do cliente exigir `sorteioRealizado`: uma Liga
 * com inscrição aberta, ANTES do 1º sorteio, com registrationLimit vencido (ou
 * status 'closed' gravado pelo auto-close), era BLOQUEADA na tela — a CF nem era
 * chamada — enquanto o servidor a aceitaria. É a reclamação literal do dono:
 * "inscrições abertas durante a fase e as pessoas caem em bloqueios".
 *
 * Este teste roda o CÓDIGO REAL dos dois lados (window._enrollmentOpenState de
 * js/views/waitlist-core.js × enrollmentOpen de functions/enroll-core.js) sobre
 * uma MATRIZ de torneios e exige resposta idêntica — se um lado mudar sozinho,
 * fica vermelho. E trava por varredura que os gates da UI passaram a usar a
 * fonte única (a próxima régua paralela é a próxima pessoa bloqueada).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── inscrição aberta: uma regra só ────');

// ── carrega o lado do CLIENTE (waitlist-core.js REAL, com shim de window) ──────
const sb = { console };
sb.window = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'waitlist-core.js'), 'utf8'), sb, { filename: 'waitlist-core.js' });
const cliente = sb._enrollmentOpenState;
ok(typeof cliente === 'function', 'window._enrollmentOpenState existe no waitlist-core');

// ── lado do SERVIDOR (require direto — módulo puro) ────────────────────────────
const servidor = require(path.join(__dirname, '..', 'functions', 'enroll-core.js')).enrollmentOpen;

// ── MATRIZ: formato × status × sorteio × prazo × toggle da Liga ────────────────
const AGORA = new Date('2026-08-13T15:00:00-03:00').getTime();
const ONTEM = '2026-08-12T23:59:00';
const AMANHA = '2026-08-14T23:59:00';
const formatos = ['Liga', 'Ranking', 'Eliminatórias Simples', 'Fase de Grupos + Eliminatórias', undefined];
const statuses = [undefined, 'open', 'closed', 'active', 'finished'];
const sorteios = [false, true];
const prazos = [undefined, ONTEM, AMANHA];
const toggles = [undefined, false, true];

let casos = 0;
formatos.forEach(function (fmt) {
  statuses.forEach(function (st) {
    sorteios.forEach(function (sorteado) {
      prazos.forEach(function (prazo) {
        toggles.forEach(function (tg) {
          const t = { format: fmt, status: st, registrationLimit: prazo, ligaOpenEnrollment: tg };
          if (sorteado) t.rounds = [{ n: 1 }];
          // comparação por VERDADE (o servidor devolve undefined onde o cliente
          // devolve false — `format && (...)` sem coerção; semanticamente iguais)
          const c = !!cliente(t, AGORA).open;
          const s = !!servidor(t, AGORA).open;
          casos++;
          if (c !== s) {
            fail++;
            console.error('  ✗ DIVERGÊNCIA cliente=' + c + ' servidor=' + s + ' em ' + JSON.stringify(t));
          }
        });
      });
    });
  });
});
pass++; // a matriz inteira conta como uma asserção de paridade
console.log('  ✓ paridade cliente×servidor em ' + casos + ' combinações');

// ── os CASOS DO INCIDENTE, nomeados ────────────────────────────────────────────
ok(cliente({ format: 'Liga', status: 'closed', registrationLimit: ONTEM }, AGORA).open === true,
  'Liga aberta ANTES do sorteio com prazo vencido e status closed → ABERTA (era o bloqueio indevido)');
ok(cliente({ format: 'Liga', registrationLimit: ONTEM }, AGORA).open === true,
  'Liga aberta pré-sorteio com prazo vencido → ABERTA');
ok(cliente({ format: 'Liga', status: 'finished' }, AGORA).open === false,
  'Liga ENCERRADA nunca aceita inscrição (buraco do servidor, fechado nos dois lados)');
ok(cliente({ format: 'Liga', ligaOpenEnrollment: false, rounds: [{}] }, AGORA).open === false,
  'Liga com toggle fechado → fechada (o toggle é O jeito de fechar Liga)');
ok(cliente({ format: 'Liga', rounds: [{}] }, AGORA).open === true,
  'Liga aberta PÓS-sorteio → aberta (o destino fila×elenco é do _phaseDrawDone, não daqui)');
ok(cliente({ format: 'Eliminatórias Simples', registrationLimit: ONTEM }, AGORA).open === false,
  'não-Liga com prazo vencido → fechada');
ok(cliente({ format: 'Eliminatórias Simples', rounds: [{}] }, AGORA).open === false,
  'não-Liga com sorteio → fechada (tardia é outra porta)');

// ── VARREDURA: os gates passaram a usar a FONTE ÚNICA ─────────────────────────
const semComent = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const enr = semComent(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment.js'), 'utf8'));
const tour = semComent(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8'));
const dash = semComent(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8'));

ok((enr.match(/_enrollmentOpenState\(/g) || []).length >= 5,
  'tournaments-enrollment: os 5 gates (self, time, +participante, core, +time) usam a fonte única');
ok(/ligaOpenEnrollment !== false && sorteioRealizado/.test(enr) === false,
  'REGRESSÃO: nenhuma cópia local de ligaAberta-com-sorteio pode voltar no enrollment');
ok(/_enrollmentOpenState\(t\)/.test(tour), 'tournaments.js (render do detalhe) usa a fonte única');
ok((dash.match(/_enrollmentOpenState/g) || []).length >= 3, 'dashboard usa a fonte única nos gates');

// auto-close do render: numa Liga aberta o isAberto canônico é true → o bloco não dispara.
ok(/isAberto = _openSt\.open \|\| lateEnrollOpen/.test(tour),
  'o auto-close do render deriva do isAberto canônico (Liga aberta não é mais auto-fechada)');

// o fallback do cliente (firebase-db) e o servidor têm o MESMO ligaOpen com finished
const fdb = semComent(fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8'));
ok(/ligaOpenEnrollment !== false && data\.status !== 'finished'/.test(fdb),
  'fallback do cliente (_enrollParticipantTx) exclui finished do ligaOpen');

console.log(fail === 0 ? '✅ inscricao-aberta-uma-regra: ' + (pass + casos) + ' verificações, 0 falha(s)'
                       : '❌ inscricao-aberta-uma-regra: ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
