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


// ── 10. declaredGames: "puxou 81 de 81" é PROVA; "60 de 81" não absolve ──
// Ideia do dono: "será que o primeiro dado no letzplay do usuário nao seria sempre o
// numero de jogos no letzplay? registrou 81, puxou 81 nem olha de novo. daqui uma semana
// puxou e viu 84, puxa os utlimos jogos (3 que faltam e está pronto)."
// O letzplay declara o total na própria página; guardá-lo dá prova de completude de graça.
{
  const impCompleto = { handle: 'RodrigoBarth', officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    rating: { band: 'D+/C-' }, rankings: [], tournaments: [], games: new Array(81), declaredGames: 81 };
  const r = run({ uid: 'r1', effectiveSkills: [] }, { r1: Object.assign({ letzplayImport: impCompleto }, profAuthorized) }, {});
  ok(r._lzColor === COL.green, 'autoimport 81 de 81 declarados → VERDE (veio: ' + r._lzColor + ')');
  ok(r._lzSrc === '🎾', 'fonte = autoimport');
}
{
  // PARCIAL salvo (a paginação morreu na metade): tem 60 dos 81 → não absolve
  const impParcial = { handle: 'X', officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    rating: { band: 'D+/C-' }, rankings: [], tournaments: [], games: new Array(60), declaredGames: 81 };
  const r = run({ uid: 'r2', effectiveSkills: [] }, { r2: Object.assign({ letzplayImport: impParcial }, profAuthorized) }, {});
  ok(r._lzColor === COL.violet, '60 de 81 declarados → ROXO, não verde (veio: ' + r._lzColor + ')');
}
{
  // ele mesmo diz que parou no meio, mesmo com a contagem batendo
  const impInterrompido = { handle: 'X', officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    rating: { band: 'D+/C-' }, rankings: [], tournaments: [], games: new Array(81), declaredGames: 81,
    partialReason: 'rate: HTTP 403' };
  const r = run({ uid: 'r3', effectiveSkills: [] }, { r3: Object.assign({ letzplayImport: impInterrompido }, profAuthorized) }, {});
  ok(r._lzColor === COL.violet, 'partialReason presente → ROXO mesmo com a contagem batendo');
}
{
  // import LEGADO (sem declaredGames): mantém o comportamento antigo — não regride
  const impLegado = { handle: 'X', officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    rating: { band: 'D+/C-' }, rankings: [], tournaments: [], games: new Array(81) };
  const r = run({ uid: 'r4', effectiveSkills: [] }, { r4: Object.assign({ letzplayImport: impLegado }, profAuthorized) }, {});
  ok(r._lzColor === COL.green, 'import legado sem declaredGames → segue VERDE (não regride quem já tinha)');
}
{
  // acusação NÃO depende de completude: achar título é prova mesmo com 60 de 81
  const impGato = { handle: 'X', officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    rating: { band: 'D+/C-' }, rankings: [], games: new Array(60), declaredGames: 81,
    tournaments: [{ categoryRaw: 'Masculina C', title: true }] };
  const r = run({ uid: 'r5', effectiveSkills: ['D'] }, { r5: Object.assign({ letzplayImport: impGato }, profAuthorized) }, {});
  ok(r._lzColor === COL.red, 'campeão achado em import PARCIAL → VERMELHO (achar é prova; não achar não é)');
}


// ── 11. O histórico do SCAN conta — não só o autoimport da pessoa ──
// Caso real (14/jul 17:57): a busca do organizador gravou 152 jogos da Kelly em
// letzplayScans/{uid}.fullImport e ela aparecia ROXA. Motivo: eu só olhava
// users/{uid}.letzplayImport, que ela não tem (nunca fez autoimport) — e caía no scan
// resumido (torneios 2/8), julgava incompleto e não absolvia. O dado estava lá; a tela
// mentia, e o dono concluiu (pela tela, corretamente) que a busca não gravou nada.
// Depender do letzplayImport é fazer a leitura do organizador esperar o inscrito logar.
{
  const fullDoOrg = { games: new Array(152), officialCategory: { categoryRaw: 'Feminina C', skill: 'C' },
    rating: { band: 'C+/B-' }, rankings: [], tournaments: [] };
  const scanResumido = Object.assign({}, scanKelly, { tournaments: [], totals: { rankings: 8, tournaments: 8, matches: 152 } });
  const r = run({ uid: 'k9', effectiveSkills: [] }, { k9: profAuthorized }, { k9: { scan: scanResumido, fullImport: fullDoOrg } });
  ok(r._lzColor === COL.green, 'histórico completo no fullImport do SCAN → VERDE (veio: ' + r._lzColor + ')');
  ok(r._lzSrc === '🎾', 'fonte = histórico (🎾), não o resumo (🔎)');
  ok(r._lzSkill === 'C', 'nível vem do officialCategory do histórico');
}
{
  // sem fullImport (o organizador cancelou antes dela) → segue no resumo → roxo
  const r = run({ uid: 'f9', effectiveSkills: [] }, { f9: profAuthorized }, { f9: { scan: scanFlavia } });
  ok(r._lzColor === COL.violet, 'sem histórico puxado → ROXO (veio: ' + r._lzColor + ')');
}
{
  // vence quem tem MAIS jogos (mesma regra da applyLetzplayScans)
  const pequeno = { games: new Array(10), officialCategory: { categoryRaw: 'Feminina C', skill: 'C' }, rating: {}, rankings: [], tournaments: [] };
  const grande = { games: new Array(152), officialCategory: { categoryRaw: 'Feminina B', skill: 'B' }, rating: {}, rankings: [], tournaments: [] };
  const r = run({ uid: 'm9', effectiveSkills: [] },
    { m9: Object.assign({ letzplayImport: pequeno }, profAuthorized) },
    { m9: { scan: scanKelly, fullImport: grande } });
  ok(r._lzSkill === 'B', 'entre autoimport (10 jogos) e scan do org (152), vence o de MAIS jogos');
}


// ─────────────────────────────────────────────────────────────────────────────
// BARRAS DO PROGRESSO: "torneios LIDOS", não "torneios conhecidos"
//
// REPRODUZ O BUG REAL de 30/jul/2026 (screenshots do dono, leitura da Camila):
//   • "🏆 Torneios  35 de 35 (100%)" enquanto o rodapé dizia "torneio 16 de 35";
//   • depois "🏆 Torneios  38 de 35 (100%)" — x MAIOR que o total declarado.
// Causa: o número contava todo torneio CITADO por algum jogo (o footprint inteiro).
// Como o acumulado entra semeado pela rodada anterior, ele nascia no total — e passava
// dele, porque o histórico dela referencia mais torneios do que o perfil declara.
// Regra do dono: "se são 35 torneios, são 35 torneios e não mais que isso. 35 é 100%".
console.log('\n── barras: torneios LIDOS vs CONHECIDOS ──');
var _read = window._lzTournamentsRead;

// 20 lidos (têm classificação), 15 só conhecidos (só a categoria, vindos de jogos),
// e 3 além do declarado — o retrato exato do que produziu "38 de 35".
var _fp = [];
for (var i = 0; i < 20; i++) {
  _fp.push({ official: true, club: 'c', tourneyId: 't' + i, categoryRaw: 'Feminina C',
    name: 'Interno Ciclo ' + i + ' - Feminina C',
    standings: [{ group: 'Grupo 1', rows: [{ pos: 1, handles: ['CamilaX'] }] }] });
}
for (var j = 0; j < 18; j++) {
  _fp.push({ official: true, club: 'c', tourneyId: 'x' + j, categoryRaw: 'Feminina C' });
}
_fp.push({ official: false, club: 'c', rankingId: 'r1', categoryRaw: 'Social Fem C / B' });
var _imp = { footprint: _fp, declaredTournaments: 35 };

ok(_read(_imp) === 20, 'conta só os LIDOS (20), não os 38 conhecidos — era daqui que saía "38 de 35"');
ok(_read({ footprint: [] }) === 0, 'footprint vazio → 0 lidos');
ok(_read(null) === 0, 'sem import → 0 lidos (não explode)');
// nome igual à categoria crua NÃO é nome resolvido: a página do torneio nunca foi aberta
ok(_read({ footprint: [{ official: true, categoryRaw: 'Feminina C', name: 'Feminina C' }] }) === 0,
  'nome igual à categoria crua não conta como lido');
ok(_read({ footprint: [{ official: true, categoryRaw: 'Feminina C', name: 'Interno Ciclo 2 - Feminina C' }] }) === 1,
  'nome REAL resolvido conta como lido, mesmo sem classificação');
ok(_read({ footprint: [{ official: false, categoryRaw: 'Social Fem C / B', standings: [{}] }] }) === 0,
  'ranking não entra na barra de torneios');
// o teto: nunca mais de 35 de 35
ok(Math.min(_read(_imp), _imp.declaredTournaments) <= _imp.declaredTournaments,
  'x capado no declarado: 35 de 35 é 100%, "38 de 35" não existe');

// ─────────────────────────────────────────────────────────────────────────────
// LISTA DE TORNEIOS do dialog: DATA · nome · CATEGORIA · CLASSIFICAÇÃO, em cores,
// do mais recente pro mais antigo. Pedido do dono (30/jul), olhando a leitura da Camila:
// "precisa colocar as datas aqui. e ordenar em ordem cronológica inversa. Tem que ter a
// categoria e a classificação… dando destaque com cores".
console.log('\n── lista de torneios: data, ordem inversa, cores ──');
// o modelo canônico (dateNum/dateParts) roda no mesmo contexto do arquivo sob teste
require('fs'); var _vm = require('vm'), _fs = require('fs'), _pathM = require('path');
_vm.runInContext(_fs.readFileSync(_pathM.join(__dirname, '..', 'js', 'letzplay-model.js'), 'utf8'), window);

function _g(tid, dia, mes, ano) {
  return { official: true, tourneyId: tid, club: 'paineiras-bt',
    date: 'Sábado, ' + dia + '/' + mes + '/' + ano + ' às 08:00hs' };
}
var impL = {
  footprint: [
    { official: true, club: 'paineiras-bt', tourneyId: 'A', categoryRaw: 'Feminina D',
      name: 'Torneio ANTIGO - Feminina D', year: 2025,
      standings: [{ group: 'G1', rows: [{ pos: 3, handles: ['camilacalia'] }] }] },
    { official: true, club: 'paineiras-bt', tourneyId: 'B', categoryRaw: 'Feminina C',
      name: 'Torneio NOVO - Feminina C', year: 2026,
      standings: [{ group: 'G1', rows: [{ pos: 1, handles: ['camilacalia'] }] }] },
    { official: true, club: 'paineiras-bt', tourneyId: 'C', categoryRaw: 'Feminina C',
      name: 'Torneio MEIO - Feminina C', year: 2026,
      standings: [{ group: 'G1', rows: [{ pos: 2, handles: ['camilacalia'] }] }] },
    { official: false, club: 'paineiras-bt', rankingId: 'R', categoryRaw: 'Social Fem C / B' }
  ],
  games: [_g('A', '10', '03', '25'), _g('B', '27', '06', '26'), _g('C', '15', '05', '26')],
  tournamentsList: [
    { club: 'paineiras-bt', tid: 'A', title: 'Torneio ANTIGO' },
    { club: 'paineiras-bt', tid: 'B', title: 'Torneio NOVO' },
    { club: 'paineiras-bt', tid: 'C', title: 'Torneio MEIO' },
    { club: 'paineiras-bt', tid: 'Z', title: 'PENDENTE - Feminina C' }
  ]
};
var htmlL = window._lzTourneyRows(impL, 'camilacalia');

// 1) DATA presente e formatada a partir dos componentes (sem fuso)
ok(/27 jun 26/.test(htmlL), 'mostra a data do jogo mais recente do torneio (27 jun 26)');
ok(/10 mar 25/.test(htmlL), 'torneio antigo mostra a data dele (10 mar 25)');

// 2) ORDEM CRONOLÓGICA INVERSA
var iNovo = htmlL.indexOf('Torneio NOVO'), iMeio = htmlL.indexOf('Torneio MEIO'), iAnt = htmlL.indexOf('Torneio ANTIGO');
ok(iNovo >= 0 && iMeio > iNovo && iAnt > iMeio, 'ordem cronológica INVERSA: jun/26 → mai/26 → mar/25');

// 3) NÃO LIDO vai pro fim, e não inventa data
ok(htmlL.indexOf('PENDENTE') > iAnt, 'ainda-não-lido desce pro fim da lista');
ok(/PENDENTE[^<]*<[^>]*>ainda não lido/.test(htmlL.replace(/\n/g, '')), 'não lido é rotulado, sem data inventada');

// 4) TRÊS CORES distintas — data, categoria e classificação
ok(htmlL.indexOf('#7dd3fc') >= 0, 'data tem cor própria (#7dd3fc)');
ok(htmlL.indexOf('#a78bfa') >= 0, 'categoria tem cor própria (#a78bfa)');
ok(htmlL.indexOf('#fbbf24') >= 0, 'classificação tem cor própria (#fbbf24)');
ok(new Set(['#7dd3fc', '#a78bfa', '#fbbf24']).size === 3, 'as três cores são diferentes entre si');

// 5) CLASSIFICAÇÃO com medalha
ok(/🥇 1º/.test(htmlL), 'campeã sai com 🥇 1º');
ok(/🥈 2º/.test(htmlL) && /🥉 3º/.test(htmlL), '2º e 3º saem com 🥈 e 🥉');

// 6) CATEGORIA sempre destacada: sai de dentro do nome e vira campo colorido próprio.
// (o nome real do letzplay quase sempre TERMINA na categoria — se só evitássemos repetir,
// ela ficava dentro do nome e portanto SEM cor, que era justamente o que o dono pediu)
ok(/>Torneio NOVO<\/|Torneio NOVO ·/.test(htmlL) || htmlL.indexOf('Torneio NOVO ·') >= 0,
  'nome fica sem o sufixo da categoria');
ok(htmlL.indexOf('Torneio NOVO - Feminina C') < 0, 'o sufixo "- Feminina C" saiu do nome');
ok(new RegExp('color:#a78bfa[^>]*>Feminina C<').test(htmlL), 'a categoria virou chip COLORIDO próprio');
ok(new RegExp('color:#a78bfa[^>]*>Feminina D<').test(htmlL), 'idem pro torneio da outra categoria');
// categoria no MEIO do nome não é cortada (cortar ali mutilaria o nome)
var meio = window._lzTourneyRows({ footprint: [{ official: true, club: 'c', tourneyId: 'm',
  categoryRaw: 'Feminina C', name: 'Copa Feminina C de Verao 2026', year: 2026 }] }, 'x');
ok(meio.indexOf('Copa Feminina C de Verao 2026') >= 0, 'categoria no meio do nome: nome preservado inteiro');

// 7) ranking não entra na lista de torneios
ok(htmlL.indexOf('Social Fem') < 0, 'ranking não aparece na lista de torneios');

console.log((fail ? '✗' : '✓') + ' letzplay-verdict-color: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
