// BUG DO DONO (22/jul): "na fase classificatória 'Novos Confrontos' e 'Abertas' são independentes;
// na ELIMINATÓRIA o conjunto ainda parece dependente e não deveria."
// Raiz: a elim não tinha flag própria — o "Novos Confrontos" dela só existia disfarçado de
// lateEnrollment==='expand', e o gate _allowsNewMatchups lia só o TOP-LEVEL (cego pra fase).
// Aqui travo os dois lados: o COMPILADOR (cada fase carrega a sua flag) e o GATE (lê a fase).
// [[project_new_matchups_independent]] / [[project_late_enrollment_per_phase]]
const { window: W } = require('./render-harness');
// format2.js (o COMPILADOR de fases) não está no harness de render — carrega o arquivo REAL no
// MESMO contexto, como o <script> faz no browser.
require('vm').runInContext(
  require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'views', 'format2.js'), 'utf8'),
  W, { filename: 'format2.js' });

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const cfgBase = () => ({
  disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: true, classificados: 2,
  rodadas: { modo: 'todos', turnos: 'ida' },
  eliminatoria: { ativa: true, linhas: 1, formacao: 'performance', terceiro: true },
});
const compile = (cfg, opts) => W.FORMAT2.compileToPhases(cfg, Object.assign({ sport: 'Beach Tennis', resultEntry: ['organizer'] }, opts || {}));

console.log('\n── ELIMINATÓRIA: "Novos Confrontos" ⊥ "Abertas" ──');

// 1) COMPILADOR: elim com inscrição FECHADA + Novos Confrontos LIGADO (o combo do cânone)
{
  const cfg = cfgBase();
  cfg.eliminatoria.lateEnrollment = 'closed';
  cfg.eliminatoria.newMatchups = true;
  const out = compile(cfg, { lateEnrollment: 'closed', newMatchups: false });
  const elim = out.phases[out.phases.length - 1];
  ok(elim.lateEnrollment === 'closed', 'compilador :: elim fica com inscrição FECHADA — got ' + elim.lateEnrollment);
  ok(elim.newMatchups === true, 'compilador :: e AINDA ASSIM com Novos Confrontos ligado — got ' + elim.newMatchups);
}

// 2) COMPILADOR: o inverso — inscrição ABERTA e Novos Confrontos DESLIGADO (suplentes apenas)
{
  const cfg = cfgBase();
  cfg.eliminatoria.lateEnrollment = 'expand';
  cfg.eliminatoria.newMatchups = false;
  const elim = compile(cfg).phases.slice(-1)[0];
  ok(elim.newMatchups === false, 'compilador :: aberta + Novos Confrontos DESLIGADO — got ' + elim.newMatchups);
}

// 3) COMPILADOR: cada fase com a SUA regra (classificatória ≠ eliminatória)
{
  const cfg = cfgBase();
  cfg.eliminatoria.newMatchups = false;
  const out = compile(cfg, { lateEnrollment: 'expand', newMatchups: true });
  ok(out.phases[0].newMatchups === true, 'compilador :: fase inicial mantém a SUA (ligado)');
  ok(out.phases.slice(-1)[0].newMatchups === false, 'compilador :: elim mantém a SUA (desligado)');
}

// 4) COMPILADOR: 'inherit' (default) segue a fase inicial — nada de fechar por surpresa
{
  const cfg = cfgBase();
  const elim = compile(cfg, { lateEnrollment: 'expand', newMatchups: true }).phases.slice(-1)[0];
  ok(elim.newMatchups === true, 'compilador :: inherit segue a fase inicial — got ' + elim.newMatchups);
}

// 5) GATE DE RUNTIME: é ELE que decide se o tardio entra na chave. Tem que ler a FASE.
{
  const t = {
    id: 'X', lateEnrollment: 'closed', newMatchups: false, currentPhaseIndex: 1,
    phases: [{ lateEnrollment: 'expand', newMatchups: true }, { lateEnrollment: 'closed', newMatchups: true }],
  };
  ok(W._allowsNewMatchups(t) === true, 'gate :: na ELIM, inscrição fechada NÃO bloqueia Novos Confrontos');
  t.phases[1].newMatchups = false;
  ok(W._allowsNewMatchups(t) === false, 'gate :: desligado na elim → não integra, mesmo com a fase 0 ligada');
  t.currentPhaseIndex = 0;
  ok(W._allowsNewMatchups(t) === true, 'gate :: voltando pra fase 0, vale a regra DELA');
}

// 6) COMPAT: torneio ANTIGO (só lateEnrollment, sem newMatchups em lugar nenhum)
{
  const legado = { id: 'L', lateEnrollment: 'expand', currentPhaseIndex: 1, phases: [{}, { lateEnrollment: 'expand' }] };
  ok(W._allowsNewMatchups(legado) === true, 'compat :: legado com expand continua integrando');
  const legado2 = { id: 'L2', lateEnrollment: 'closed', currentPhaseIndex: 1, phases: [{}, { lateEnrollment: 'closed' }] };
  ok(W._allowsNewMatchups(legado2) === false, 'compat :: legado fechado continua sem integrar');
}

console.log(fail === 0 ? `✅ new-matchups-elim-independent: OK  (${pass} asserts ok)` : `❌ ${fail} FALHA(S)  (${pass} ok)`);
if (fail) { console.log('\nFALHAS:'); fails.forEach((f) => console.log('  ✗ ' + f)); }
process.exit(fail === 0 ? 0 : 1);
