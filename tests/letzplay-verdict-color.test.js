/* Cor do nome na Análise de Inscritos (verificação letzplay) — node tests/letzplay-verdict-color.test.js
 *
 * REPRODUZ O BUG REAL de 14/jul/2026 (dados copiados de produção, letzplayScans/{uid}):
 * A Flavia Campion autorizou, o scan leu o perfil dela com sucesso (Fem D+/C-, apurado D),
 * e mesmo assim o nome ficou ROXO ("autorizou, aguardando verificação"). A Kelly Barth,
 * com scan equivalente, ficou VERDE. A única diferença: a Kelly tinha logado no app depois
 * do scan, então o _selfPopulate gravou skillBySport={'Beach Tennis':'C'} — a Flavia tinha
 * skillBySport={} e nunca logou.
 *
 * Causa: _lzVerdict(declRank=null) devolvia 'white' ("sem info pra comparar") → não marcava
 * _lzVerified → o nome caía no roxo. Ou seja, a LEITURA DO ORGANIZADOR dependia do INSCRITO
 * logar — que é exatamente o que não pode acontecer.
 *
 * Regra do dono: "se puxou o nível dela no letzplay, deveria ficar verde (coerente); veio do
 * próprio letzplay e não tem como não ser coerente com o letzplay."
 *
 * Este teste FALHA no código antigo (Flavia = violeta) e PASSA no novo (Flavia = verde).
 * Ver feedback_tests_must_reproduce_real_failure, project_letzplay_authorization_color_and_rigor.
 */
const { window, load } = require('./headless.js');
load('tournaments-enrollment-report.js');

const apply = window._erApplyLzToRows;
const COL = window._LZ_COL;
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── Dados REAIS de produção (letzplayScans, varredura de 14/jul/2026 14:38) ──
const scanFlavia = {
  handle: 'FlaviaCampion', name: 'Flavia Campion',
  rankingCategory: 'Fem D+ / C-', allCategories: ['Fem D+ / C-'],
  gender: 'feminino', skill: 'C', profileSkill: 'D', champions: [],
  rankings: [{ category: 'Fem D+ / C-', active: true, position: null, fieldSize: null }],
  tournaments: [], totals: { rankings: 3, tournaments: 2, matches: 66 },
};
const scanKelly = {
  handle: 'KellyBarth1', name: 'Kelly Barth',
  rankingCategory: 'Fem C+ / B-', allCategories: ['Fem C+ / B-'],
  gender: 'feminino', skill: 'B', profileSkill: 'C', champions: [],
  rankings: [{ category: 'Fem C+ / B-', active: true, position: null, fieldSize: null }],
  tournaments: [], totals: { rankings: 8, tournaments: 8, matches: 152 },
};
const profAuthorized = { letzplayHandle: 'x', letzplayConsent: true };

function run(row, profileMap, scanMap) { apply([row], profileMap, scanMap); return row; }

// ── 1. O BUG: autorizou + scan lido + SEM nível declarado → tem que ser VERDE ──
{
  const r = run(
    { uid: 'flavia', effectiveSkills: [] },                      // skillBySport={} → nada declarado
    { flavia: profAuthorized },
    { flavia: { scan: scanFlavia } }
  );
  ok(r._lzColor === COL.green, 'Flavia (scan OK, sem nível declarado) deve ser VERDE, veio: ' + r._lzColor);
  ok(r._lzVerified === true, 'Flavia deve contar como VERIFICADA (o perfil dela foi lido)');
  ok(r._lzSkill === 'D', 'Flavia deve exibir o nível apurado D (borda fraca de "Fem D+ / C-"), veio: ' + r._lzSkill);
  ok(r._lzColor !== COL.violet, 'Flavia NÃO pode ficar roxa — roxo é "autorizou mas ainda não foi lido"');
}

// ── 2. A leitura NÃO pode depender do inscrito logar ──
// Mesma pessoa, mesmo scan: com nível declarado (pós-login) e sem. A cor tem que ser igual.
{
  const semLogin = run({ uid: 'k', effectiveSkills: [] }, { k: profAuthorized }, { k: { scan: scanKelly } });
  const comLogin = run({ uid: 'k', effectiveSkills: ['C'] }, { k: profAuthorized }, { k: { scan: scanKelly } });
  ok(semLogin._lzColor === comLogin._lzColor,
    'Mesmo scan deve dar a MESMA cor com e sem login do inscrito (' + semLogin._lzColor + ' vs ' + comLogin._lzColor + ')');
  ok(comLogin._lzColor === COL.green, 'Kelly com nível declarado C e banda C+/B- → coerente (verde)');
}

// ── 3. Roxo continua sendo APENAS "autorizou e ainda não foi lido" ──
{
  const r = run({ uid: 'z', effectiveSkills: [] }, { z: profAuthorized }, {});   // sem scan nenhum
  ok(r._lzColor === COL.violet, 'Autorizou mas SEM scan → roxo (aguardando), veio: ' + r._lzColor);
  ok(r._lzVerified === false, 'Sem scan não é verificado');
}

// ── 4. Quem não autorizou continua BRANCO ──
{
  const r = run({ uid: 'w', effectiveSkills: [] }, { w: {} }, {});
  ok(r._lzColor === COL.white, 'Não autorizou → branco, veio: ' + r._lzColor);
  ok(r._lzAuthorized === false, 'Sem handle/consent não é autorizado');
}

// ── 5. O anti-gato NÃO pode ser afetado: quem declarou fraco e domina forte segue sinalizado ──
{
  // Declarou D, mas é CAMPEÃO na Fem C → deve subir (vermelho). Nada a ver com o fix.
  const scanGato = Object.assign({}, scanFlavia, { champions: ['Fem C'], profileSkill: 'D' });
  const r = run({ uid: 'g', effectiveSkills: ['D'] }, { g: profAuthorized }, { g: { scan: scanGato } });
  ok(r._lzColor === COL.red, 'Campeão em categoria mais forte que a declarada → VERMELHO (deve subir), veio: ' + r._lzColor);
}

// ── 6. Sem nível declarado E sem nível apurado → branco (não há o que afirmar) ──
{
  const scanVazio = Object.assign({}, scanFlavia, { skill: null, profileSkill: null, rankingCategory: null, allCategories: [] });
  const r = run({ uid: 'n', effectiveSkills: [] }, { n: profAuthorized }, { n: { scan: scanVazio } });
  ok(r._lzColor === COL.violet, 'Scan sem nível apurado → segue roxo (autorizou, nada apurado), veio: ' + r._lzColor);
}

console.log((fail ? '✗' : '✓') + ' letzplay-verdict-color: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
