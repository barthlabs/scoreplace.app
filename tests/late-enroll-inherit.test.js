/* Inscrição tardia POR FASE: a ELIMINATÓRIA herda a política de inscrição da fase
 * INICIAL por padrão, em vez de default 'closed' (que negava inscrição indevidamente
 * — incidente do torneio real de 18/jul: topo 'expand', mas phases[1] 'closed', e o
 * guard lê a fase → "Inscrições encerradas"). "Cada fase gerencia a sua" continua: um
 * valor EXPLÍCITO no painel da elim (closed/standby/expand) ainda sobrepõe a herança.
 *
 * FALHA no código antigo: compileToPhases devolvia phases[1].lateEnrollment='closed'
 * mesmo com opts.lateEnrollment='expand'.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/format2.js'), 'utf8'), sandbox, { filename: 'format2.js' });
const F = sandbox.FORMAT2;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')');

// cfg com classificatória (grupos) + eliminatória — a forma do incidente.
function baseCfg() {
  const c = F.defaultConfig('Beach Tennis');
  c.classifAtiva = true;              // tem classificatória
  c.parceria = 'sorteio';             // classificatória simples (grupos), não Rei/Rainha
  c.eliminatoria.ativa = true;        // + eliminatória
  c.eliminatoria.openReiRainha = false;
  return c;
}

console.log('──── late-enroll-inherit ────');
ok(typeof F.compileToPhases === 'function', 'FORMAT2.compileToPhases existe');

// (a) elim SEM valor próprio (default) + fase inicial 'expand' → elim HERDA 'expand'
(function () {
  const c = baseCfg();
  const out = F.compileToPhases(c, { lateEnrollment: 'expand' });
  ok(out.phases.length >= 2, 'gera 2 fases (classif + elim)');
  const elim = out.phases[out.phases.length - 1];
  eq(elim.name, 'Eliminatória', 'última fase é a Eliminatória');
  eq(out.phases[0].lateEnrollment, 'expand', 'fase inicial recebe o painel (expand)');
  eq(elim.lateEnrollment, 'expand', 'elim HERDA a inscrição da fase inicial (o antigo dava closed)');
})();

// (b) fase inicial 'standby' → elim herda 'standby'
(function () {
  const out = F.compileToPhases(baseCfg(), { lateEnrollment: 'standby' });
  eq(out.phases[out.phases.length - 1].lateEnrollment, 'standby', 'elim herda standby');
})();

// (c) override EXPLÍCITO no painel da elim vence a herança ("cada fase gerencia a sua")
(function () {
  const c = baseCfg();
  c.eliminatoria.lateEnrollment = 'closed';           // organizador FECHA a elim de propósito
  const out = F.compileToPhases(c, { lateEnrollment: 'expand' });
  eq(out.phases[out.phases.length - 1].lateEnrollment, 'closed', 'elim explicitamente closed vence a herança expand');
})();
(function () {
  const c = baseCfg();
  c.eliminatoria.lateEnrollment = 'standby';
  const out = F.compileToPhases(c, { lateEnrollment: 'expand' });
  eq(out.phases[out.phases.length - 1].lateEnrollment, 'standby', 'elim explicitamente standby vence expand');
})();

// (d) sem opts.lateEnrollment → herança cai no default seguro 'closed'
(function () {
  const out = F.compileToPhases(baseCfg(), {});
  eq(out.phases[out.phases.length - 1].lateEnrollment, 'closed', 'sem painel inicial → elim default closed (seguro)');
})();

// (e) 'inherit' explícito também resolve pela fase inicial (sentinela reconhecida)
(function () {
  const c = baseCfg();
  c.eliminatoria.lateEnrollment = 'inherit';
  const out = F.compileToPhases(c, { lateEnrollment: 'expand' });
  eq(out.phases[out.phases.length - 1].lateEnrollment, 'expand', 'inherit sentinel → herda expand');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ late-enroll-inherit FALHOU'); process.exit(1); }
console.log('✅ late-enroll-inherit: OK');
