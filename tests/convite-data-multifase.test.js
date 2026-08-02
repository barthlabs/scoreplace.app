/* Card de convite num torneio MULTIFASE: fim = fim da ÚLTIMA fase, nunca o da classificatória
 * — node tests/convite-data-multifase.test.js
 *
 * Relato do dono (02/ago/2026, print do WhatsApp): "Confra BT Alta da Clínica 2026" mostrava
 * "de 02/08/2026 a 31/08/2026" — as datas da fase CLASSIFICATÓRIA — enquanto o torneio segue
 * na eliminatória, que termina depois.
 *
 * MEDIDO no Firestore de produção antes do fix (tour_1780009816637):
 *   • format='Liga', 2 fases ('Rei/Rainha' → 'Eliminatória'), t.startDate=2026-08-02T19:00,
 *     t.endDate=2026-08-31T23:00;
 *   • NENHUMA fase tinha startDate/endDate — em NENHUM dos 8 torneios da base. O box
 *     "📅 Datas da fase" do formulário é realocado pra DENTRO da fase INICIAL
 *     (format2-ui #f2-classif-extra) e grava t.startDate/t.endDate. A fase eliminatória, quando
 *     é 2ª fase, não tinha janela nenhuma — não havia de onde tirar "fim da eliminatória".
 * Por isso o fix tem DOIS lados, os dois travados aqui:
 *   (A) ORIGEM — cfg.eliminatoria.endDate/endTime no construtor (format2) → compila pra
 *       phases[última].endDate/endTime, o schema que _tournamentDateRange já lê;
 *   (B) LEITURA — _tournamentDateText passa pelo _tournamentDateRange em vez de ler
 *       t.startDate/t.endDate crus.
 *
 * FALHA no código antigo: (A) compileToPhases nunca gravava endDate em fase nenhuma;
 * (B) o card devolvia 'de 02/08/2026 a 31/08/2026' mesmo com a elim terminando em 12/09.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');

function ctx() {
  const s = {};
  s.window = s; s.globalThis = s; s.console = console; s.document = { getElementById: () => null };
  s._warn = s._log = s._error = s._debug = () => {};
  vm.createContext(s);
  return s;
}
function load(s, rel) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'), s, { filename: rel });
}

console.log('──── convite-data-multifase ────');

// ═══ (A) ORIGEM: o construtor grava o término na ÚLTIMA fase ═══════════════════
const sF = ctx();
load(sF, 'js/views/format2.js');
const F = sF.FORMAT2;

// (A1) Rei/Rainha + eliminatória — a forma EXATA do Confra (fmt2 real de produção).
(function () {
  const c = F.defaultConfig('Beach Tennis');
  c.disputa = 'dupla'; c.parceria = 'rei_rainha'; c.grupos = 1;
  c.classifAtiva = true; c.eliminatoria.ativa = true;
  c.eliminatoria.endDate = '2026-09-12'; c.eliminatoria.endTime = '22:00';
  const out = F.compileToPhases(c, {});
  eq(out.phases.length, 2, '[RR] compila 2 fases (classificatória + eliminatória)');
  const last = out.phases[out.phases.length - 1];
  eq(last.name, 'Eliminatória', '[RR] a última fase é a Eliminatória');
  eq(last.endDate, '2026-09-12', '[RR] término da eliminatória chega em phases[última].endDate');
  eq(last.endTime, '22:00', '[RR] hora do término chega em phases[última].endTime');
  ok(!out.phases[0].endDate, '[RR] a classificatória NÃO ganha término próprio (é o do form/top-level)');
})();

// (A2) Fase de grupos + eliminatória — o outro caminho do compilador.
(function () {
  const c = F.defaultConfig('Beach Tennis');
  c.disputa = 'dupla'; c.parceria = 'fixa'; c.grupos = 2;
  c.classifAtiva = true; c.eliminatoria.ativa = true;
  c.eliminatoria.endDate = '2026-09-12';
  const out = F.compileToPhases(c, {});
  const last = out.phases[out.phases.length - 1];
  eq(last.name, 'Eliminatória', '[grupos] a última fase é a Eliminatória');
  eq(last.endDate, '2026-09-12', '[grupos] término chega em phases[última].endDate');
  // Só a data (sem hora): o compilador NÃO inventa hora — quem lê assume fim do dia
  // (_tournamentDateRange usa 23:59 como defTime). O 23:59 é conveniência da UI, não regra.
  eq(last.endTime, '', '[grupos] só a data → hora fica vazia (o leitor assume fim do dia)');
})();

// (A3) Sanidade do normalize: lixo não vira término; eliminação DIRETA não tem término próprio
//      (ali a eliminatória É a fase inicial e usa as datas do formulário).
(function () {
  const c = F.defaultConfig('Beach Tennis');
  c.classifAtiva = true; c.eliminatoria.ativa = true;
  c.eliminatoria.endDate = '12/09/2026';   // formato BR — NÃO é 'AAAA-MM-DD'
  eq(F.normalize(c, 'Beach Tennis').eliminatoria.endDate, '', 'data fora de AAAA-MM-DD é descartada');

  const c2 = F.defaultConfig('Beach Tennis');
  c2.classifAtiva = true; c2.eliminatoria.ativa = true;
  c2.eliminatoria.endTime = '22:00';       // hora sem data
  eq(F.normalize(c2, 'Beach Tennis').eliminatoria.endTime, '', 'hora sem data não vale nada');

  const c3 = F.defaultConfig('Beach Tennis');
  c3.classifAtiva = false;                 // eliminação direta
  c3.eliminatoria.ativa = true; c3.eliminatoria.endDate = '2026-09-12';
  const n3 = F.normalize(c3, 'Beach Tennis');
  eq(n3.eliminatoria.endDate, '', 'eliminação direta: sem término próprio (usa as datas do form)');
  const out3 = F.compileToPhases(c3, {});
  ok(!out3.phases[out3.phases.length - 1].endDate, 'eliminação direta: nenhuma fase ganha endDate');
})();

// ═══ (B) LEITURA: o card usa o envelope de TODAS as fases ══════════════════════
const sS = ctx();
sS._isLigaFormat = function (t) { return t && (t.format === 'Liga' || t.format === 'Ranking'); };
// _tournamentDateRange vive no store.js (arquivo enorme, com dependências de DOM). Extrai só ela.
(function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/store.js'), 'utf8');
  const i = src.indexOf('window._tournamentDateRange = function');
  ok(i > 0, '_tournamentDateRange encontrada em store.js');
  const end = src.indexOf('\n};', i);
  vm.runInContext(src.slice(i, end + 3), sS, { filename: 'store.js#_tournamentDateRange' });
})();
// _tournamentDateText é privada do módulo — carrega o arquivo inteiro e usa o caller público
// (_tournamentInviteText), que é exatamente o que monta a mensagem do WhatsApp.
sS.AppStore = { tournaments: [], currentUser: null };
sS._safeHtml = (x) => String(x == null ? '' : x);
load(sS, 'js/views/tournaments-sharing.js');
const dateLine = (t) => {
  const txt = sS._tournamentInviteText(t);
  const m = String(txt).split('\n').find((l) => l.indexOf('📅') === 0);
  return m ? m.replace('📅 ', '') : null;
};

// (B1) O CASO DO PRINT — dado real de produção + término da eliminatória em 12/09.
(function () {
  const t = {
    name: 'Confra BT Alta da Clínica 2026', format: 'Liga',
    startDate: '2026-08-02T19:00', endDate: '2026-08-31T23:00',
    phases: [
      { name: 'Rei/Rainha', format: 'Liga' },
      { name: 'Eliminatória', format: 'Eliminatórias Simples', endDate: '2026-09-12', endTime: '22:00' }
    ]
  };
  eq(dateLine(t), 'de 02/08/2026 a 12/09/2026',
    '[o print] fim = término da ELIMINATÓRIA (12/09), não o da classificatória (31/08)');
})();

// (B2) Multifase SEM Liga (grupos + elim): antes mostrava só a data de início.
(function () {
  const t = {
    name: 'Copa', format: 'Fase de Grupos',
    startDate: '2026-08-02T19:00', endDate: '2026-08-31T23:00',
    phases: [{ name: 'Grupos' }, { name: 'Eliminatória', endDate: '2026-09-12' }]
  };
  eq(dateLine(t), 'de 02/08/2026 a 12/09/2026', '[grupos+elim] mostra a janela inteira, não só o início');
})();

// (B3) Término da elim ANTES do fim da classificatória → a janela NÃO encolhe (envelope de tudo).
(function () {
  const t = {
    name: 'Copa', format: 'Liga',
    startDate: '2026-08-02T19:00', endDate: '2026-08-31T23:00',
    phases: [{ name: 'Liga' }, { name: 'Eliminatória', endDate: '2026-08-20' }]
  };
  eq(dateLine(t), 'de 02/08/2026 a 31/08/2026', '[envelope] fim = a data MAIS TARDIA de todas');
})();

// (B4) Multifase SEM término na eliminatória (o estado de hoje na base): nada muda.
(function () {
  const t = {
    name: 'Confra BT Alta da Clínica 2026', format: 'Liga',
    startDate: '2026-08-02T19:00', endDate: '2026-08-31T23:00',
    phases: [{ name: 'Rei/Rainha' }, { name: 'Eliminatória' }]
  };
  eq(dateLine(t), 'de 02/08/2026 a 31/08/2026', '[sem término da elim] mantém o que já mostrava');
})();

// (B5) FASE ÚNICA: comportamento atual preservado — Liga com janela → range; resto → data + hora.
(function () {
  eq(dateLine({ name: 'L', format: 'Liga', startDate: '2026-08-02', endDate: '2026-08-31' }),
    'de 02/08/2026 a 31/08/2026', '[1 fase · Liga] range como antes');
  eq(dateLine({ name: 'E', format: 'Eliminatórias Simples', startDate: '2026-08-02T19:00', endDate: '2026-08-02T23:00' }),
    '02/08/2026 às 19:00', '[1 fase · elim] data de início + hora, como antes');
  eq(dateLine({ name: 'E', format: 'Eliminatórias Simples', startDate: '2026-08-02T19:00' }),
    '02/08/2026 às 19:00', '[1 fase · sem fim] data + hora');
  ok(dateLine({ name: 'X', format: 'Liga' }) === null, '[sem data] nenhuma linha de data');
})();

// (B6) Multifase de UM DIA só (início = fim) → data única, nunca "de X a X".
(function () {
  const t = {
    name: 'Copa', format: 'Fase de Grupos', startDate: '2026-08-02T09:00', endDate: '2026-08-02T18:00',
    phases: [{ name: 'Grupos' }, { name: 'Eliminatória', endDate: '2026-08-02' }]
  };
  eq(dateLine(t), '02/08/2026 às 09:00', '[um dia] data única + hora, sem "de X a X"');
})();

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
