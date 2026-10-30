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
const dominio = require(path.join(__dirname, '..', 'js', 'domain', 'waitlist.js')).enrollmentOpenState;

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
const aberturas = [undefined, ONTEM, AMANHA];
const toggles = [undefined, false, true];

let casos = 0;
formatos.forEach(function (fmt) {
  statuses.forEach(function (st) {
    sorteios.forEach(function (sorteado) {
      prazos.forEach(function (prazo) {
        aberturas.forEach(function (abertura) {
        toggles.forEach(function (tg) {
          const t = { format: fmt, status: st, registrationLimit: prazo, ligaOpenEnrollment: tg };
          if (abertura) t.registrationOpenAt = abertura;
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
});
pass++; // a matriz inteira conta como uma asserção de paridade
console.log('  ✓ paridade cliente×servidor em ' + casos + ' combinações');

// Regra financeira: o pagamento direto habilitado não deve desaparecer da UI.
// O mesmo conjunto roda no fallback da tela, no domínio efetivamente publicado e
// na Function. Inscrição gratuita com taxa repassada também é paga.
const paymentCases = [
  { label:'externa', settings:{ source:'external' }, expected:false },
  { label:'gratuita', settings:{ source:'scoreplace', pricing:{ mode:'single', cents:0 } }, expected:true },
  { label:'origem ausente com valor', settings:{ pricing:{ mode:'single', cents:1000 } }, expected:false },
  { label:'origem inválida sem valor', settings:{ source:'unexpected', pricing:{ mode:'single', cents:0 } }, expected:false },
  { label:'configuração inválida', settings:[], expected:false },
  { label:'configuração numérica inválida', settings:0, expected:false },
  { label:'configuração booleana inválida', settings:false, expected:false },
  { label:'configuração textual inválida', settings:'', expected:false },
  { label:'taxa repassada sem preço', settings:{ source:'scoreplace', passServiceFeeToParticipant:true }, expected:false },
  { label:'paga sem meio', settings:{ source:'scoreplace', pricing:{ mode:'single', cents:1000 } }, expected:false },
  { label:'paga sem aceite', settings:{ source:'scoreplace', pricing:{ mode:'single', cents:1000 }, paymentMethods:{ organizerPixKey:'pix@example.com' } }, expected:false },
  { label:'paga com Pix próprio', settings:{ source:'scoreplace', pricing:{ mode:'single', cents:1000 }, paymentMethods:{ organizerPixKey:'pix@example.com' } }, accepted:true, expected:true },
  { label:'paga com link próprio', settings:{ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ A:1000 } }, paymentMethods:{ organizerPaymentUrl:'https://example.com/pagar' } }, accepted:true, expected:true },
  { label:'valor zero com taxa repassada sem meio', settings:{ source:'scoreplace', pricing:{ mode:'single', cents:0 }, passServiceFeeToParticipant:true }, expected:false },
  { label:'valor zero com taxa repassada e Pix', settings:{ source:'scoreplace', pricing:{ mode:'single', cents:0 }, passServiceFeeToParticipant:true, paymentMethods:{ organizerPixKey:'pix@example.com' } }, accepted:true, expected:true },
];
for (const testCase of paymentCases) {
  for (const drawn of [false, true]) {
    const tournament = { status:'open', registrationSettings:testCase.settings,
      ...(testCase.accepted ? { billingContract:{ schema:1 }, canonicalRegistrationMigration:{ fingerprint:'abc' }, billingTermsAcceptance:{ hash:'def' } } : {}),
      ...(drawn ? { rounds:[{}] } : {}) };
    const expected = !drawn && testCase.expected;
    const results = [cliente(tournament, AGORA).open, dominio(tournament, AGORA).open,
      servidor(tournament, AGORA).open].map(Boolean);
    ok(results.every(result => result === expected),
      testCase.label + (drawn ? ' após sorteio' : ' antes do sorteio') + ': UI, domínio e servidor concordam');
    const allowLate = testCase.settings.source === 'scoreplace'
      && !testCase.settings.passServiceFeeToParticipant
      && testCase.settings.pricing?.mode === 'single' && testCase.settings.pricing.cents === 0;
    ok(cliente(tournament, AGORA).lateOverrideAllowed === allowLate
      && dominio(tournament, AGORA).lateOverrideAllowed === allowLate,
    testCase.label + ': inscrição tardia não contorna origem ou pagamento');
  }
}

// ── os CASOS DO INCIDENTE, nomeados ────────────────────────────────────────────
ok(cliente({ format: 'Liga', status: 'closed', registrationLimit: ONTEM }, AGORA).open === false,
  'Liga fechada manualmente permanece fechada');
ok(cliente({ format: 'Liga', registrationLimit: ONTEM }, AGORA).open === false,
  'Liga respeita o prazo programado pelo organizador');
ok(cliente({ format: 'Liga', status: 'finished' }, AGORA).open === false,
  'Liga ENCERRADA nunca aceita inscrição (buraco do servidor, fechado nos dois lados)');
ok(cliente({ format: 'Liga', ligaOpenEnrollment: false, rounds: [{}] }, AGORA).open === false,
  'Liga com toggle fechado → fechada (o toggle é O jeito de fechar Liga)');
ok(cliente({ format: 'Liga', rounds: [{}] }, AGORA).open === true,
  'Liga aberta PÓS-sorteio → aberta (o destino fila×elenco é do _phaseDrawDone, não daqui)');
ok(cliente({ format: 'Eliminatórias Simples', registrationLimit: ONTEM }, AGORA).open === false,
  'não-Liga com prazo vencido → fechada');
ok(cliente({ format: 'Eliminatórias Simples', registrationOpenAt: AMANHA }, AGORA).open === false,
  'não-Liga antes da abertura programada → fechada');
ok(cliente({ format: 'Eliminatórias Simples', registrationOpenAt: ONTEM }, AGORA).open === true,
  'não-Liga após abertura programada → aberta');
ok(cliente({ format: 'Eliminatórias Simples', rounds: [{}] }, AGORA).open === false,
  'não-Liga com sorteio → fechada (tardia é outra porta)');
ok(cliente({
  format: 'Liga', rounds: [{}], currentPhaseIndex: 1,
  phases: [
    { kind: 'classification', lateEnrollment: 'expand' },
    { kind: 'elimination', lateEnrollment: 'closed' }
  ]
}, AGORA).open === false,
  'eliminatória canônica fechada não reabre pelo rótulo legado Liga');
ok(cliente({
  format: 'Eliminatórias Simples', rounds: [{}], currentPhaseIndex: 0,
  phases: [{ kind: 'classification', lateEnrollment: 'standby' }]
}, AGORA).open === true,
  'fase classificatória canônica aberta aceita inscrição tardia sem depender de rótulo Liga');

// ── VARREDURA: os gates passaram a usar a FONTE ÚNICA ─────────────────────────
const semComent = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const enr = semComent(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment.js'), 'utf8'));
const tour = semComent(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8'));
const dash = semComent(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8'));

ok((enr.match(/_enrollmentOpenState\(/g) || []).length >= 4 && /window\.enrollCurrentUser\(tId\)/.test(enr),
  'tournaments-enrollment: os gates ativos usam a fonte única; dupla delega à inscrição própria');
ok(/ligaOpenEnrollment !== false && sorteioRealizado/.test(enr) === false,
  'REGRESSÃO: nenhuma cópia local de ligaAberta-com-sorteio pode voltar no enrollment');
ok(/_enrollmentOpenState\(t\)/.test(tour), 'tournaments.js (render do detalhe) usa a fonte única');
ok((dash.match(/_enrollmentOpenState/g) || []).length >= 3, 'dashboard usa a fonte única nos gates');
ok(/_openSt\.lateOverrideAllowed && lateEnrollManaged/.test(tour)
  && (dash.match(/lateOverrideAllowed/g) || []).length >= 3
  && /_enrollmentOpenState\(t\)\.lateOverrideAllowed/.test(enr),
  'detalhe, dashboard e inscrição tardia respeitam o veto canônico para pagamentos e origem externa');

// auto-close do render: numa Liga aberta o isAberto canônico é true → o bloco não dispara.
ok(/isAberto = _openSt\.open \|\| lateEnrollOpen/.test(tour),
  'o auto-close do render deriva do isAberto canônico (Liga aberta não é mais auto-fechada)');

// inscrição não possui mais uma implementação paralela no cliente.
const fdb = semComent(fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8'));
ok(!/_enrollParticipantTx/.test(fdb),
  'inscrição não mantém fallback de transação no cliente');

console.log(fail === 0 ? '✅ inscricao-aberta-uma-regra: ' + (pass + casos) + ' verificações, 0 falha(s)'
                       : '❌ inscricao-aberta-uma-regra: ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
