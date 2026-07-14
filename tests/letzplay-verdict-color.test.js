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
  rankings: [{ category: 'Fem D+ / C-', active: true, position: null, fieldSize: null }, { category: 'Fem D+ / C-', active: true }, { category: 'Fem D', active: false }],
  tournaments: [], totals: { rankings: 3, tournaments: 2, matches: 66 },   // ← 2 torneios declarados, 0 capturados: INCOMPLETO (real)
};
const scanKelly = {
  handle: 'KellyBarth1', name: 'Kelly Barth',
  rankingCategory: 'Fem C+ / B-', allCategories: ['Fem C+ / B-'],
  gender: 'feminino', skill: 'B', profileSkill: 'C', champions: [],
  rankings: [{ category: 'Fem C+ / B-', active: true, position: null, fieldSize: null }],
  tournaments: [], totals: { rankings: 1, tournaments: 0, matches: 152 },   // scan COMPLETO (pra testar o caminho feliz)
};
const profAuthorized = { letzplayHandle: 'x', letzplayConsent: true };

function run(row, profileMap, scanMap) { apply([row], profileMap, scanMap); return row; }

// ── 1. Nível apurado SEM nível declarado → VERDE, desde que a captura esteja completa ──
// Veio do próprio letzplay: não há como divergir dele. Antes isto caía em 'white' → roxo,
// e a pessoa só saía do roxo se ELA MESMA logasse no app (a Kelly logou e ficou verde; a
// Flavia não e ficou roxa). A leitura do organizador não pode depender do login do inscrito.
// O scan usado aqui é COMPLETO — a exigência de completude é o bloco 9.
{
  const scanCompleto = Object.assign({}, scanFlavia, {
    tournaments: [{ category: 'Fem D', champion: false }, { category: 'Fem D', champion: false }],
    totals: { rankings: 3, tournaments: 2, matches: 66 }
  });
  const r = run(
    { uid: 'flavia', effectiveSkills: [] },                      // skillBySport={} → nada declarado
    { flavia: profAuthorized },
    { flavia: { scan: scanCompleto } }
  );
  ok(r._lzColor === COL.green, 'nível apurado + captura completa, sem nível declarado → VERDE, veio: ' + r._lzColor);
  ok(r._lzVerified === true, 'conta como VERIFICADA (o perfil foi lido POR INTEIRO)');
  ok(r._lzSkill === 'D', 'exibe o nível apurado D (borda fraca de "Fem D+ / C-"), veio: ' + r._lzSkill);
}

// ── 2. A leitura NÃO pode depender do inscrito logar ──
// Mesma pessoa, mesmo scan: com nível declarado (pós-login) e sem. A cor tem que ser igual.
{
  const semLogin = run({ uid: 'k', effectiveSkills: [] }, { k: profAuthorized }, { k: { scan: scanKelly } });
  const comLogin = run({ uid: 'k2', effectiveSkills: ['C'] }, { k2: profAuthorized }, { k2: { scan: scanKelly } });
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


// ── 9. VERDE EXIGE CAPTURA COMPLETA — "puxei e não veio nada" não é coerência ──
// Regra do dono: "as cores dos nomes devem refletir o banco de dados e nao o fato de ter
// puxado e nao ter vindo porra nenhuma (…) só fica verde quando a informacao estiver
// consistente." Medido em prod: a Flavia declara 2 torneios e o scan capturou 0. O TÍTULO
// é o que manda subir de categoria e mora em torneio — absolver sem olhar os 2 é chute.
{
  // scan INCOMPLETO (o real da Flavia: 0 de 2 torneios) → roxo, nunca verde
  const r = run({ uid: 'f', effectiveSkills: [] }, { f: profAuthorized }, { f: { scan: scanFlavia } });
  ok(r._lzColor === COL.violet, 'scan incompleto (0 de 2 torneios) → ROXO, não verde (veio: ' + r._lzColor + ')');
  ok(r._lzVerified === false, 'incompleto não conta como verificado');
}
{
  // e nem quando ELA declarou o nível: continua faltando o torneio pra afirmar coerência
  const r = run({ uid: 'f2', effectiveSkills: ['D'] }, { f2: profAuthorized }, { f2: { scan: scanFlavia } });
  ok(r._lzColor === COL.violet, 'com nível declarado E scan incompleto → segue roxo (veio: ' + r._lzColor + ')');
}
{
  // completou a captura → aí sim verde
  const completo = Object.assign({}, scanFlavia, {
    tournaments: [{ category: 'Fem D', champion: false }, { category: 'Fem D', champion: false }],
    totals: { rankings: 3, tournaments: 2, matches: 66 }
  });
  const r = run({ uid: 'f3', effectiveSkills: [] }, { f3: profAuthorized }, { f3: { scan: completo } });
  ok(r._lzColor === COL.green, 'capturou os 2 torneios declarados → VERDE (veio: ' + r._lzColor + ')');
}
{
  // EVIDÊNCIA POSITIVA vale mesmo incompleta: achar título é prova; não achar não é.
  const gato = Object.assign({}, scanFlavia, { champions: ['Fem C'] });   // segue 0/2 torneios
  const r = run({ uid: 'g2', effectiveSkills: ['D'] }, { g2: profAuthorized }, { g2: { scan: gato } });
  ok(r._lzColor === COL.red, 'campeão achado → VERMELHO mesmo com captura incompleta (veio: ' + r._lzColor + ')');
}
{
  // sem totais declarados (dado antigo) → não dá pra afirmar completude → roxo
  const semTotais = Object.assign({}, scanFlavia, { totals: {} });
  const r = run({ uid: 'n2', effectiveSkills: [] }, { n2: profAuthorized }, { n2: { scan: semTotais } });
  ok(r._lzColor === COL.violet, 'sem totais declarados não dá pra afirmar completude → roxo');
}

console.log((fail ? '✗' : '✓') + ' letzplay-verdict-color: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
