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
// O modelo canônico do histórico (dateNum/dateParts) vive em js/letzplay-model.js, fora de
// js/views — sem ele as datas não formatam e a ordenação por data não acontece. No browser
// ele é carregado pelo index.html; aqui é preciso injetar na mão, no MESMO contexto.
require('vm').runInContext(
  require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'letzplay-model.js'), 'utf8'),
  require('./headless.js').sandbox, { filename: 'letzplay-model.js' });
load('tournaments-enrollment-report.js');

const apply = window._erApplyLzToRows;
const COL = window._LZ_COL;
// VERDE exige leitura de MENOS DE 1 MÊS (regra do dono, 30/jul/2026): verde é absolvição,
// e absolver com dado velho é chute — um título tirado semana passada muda o veredito.
const AGORA = new Date().toISOString();
const VELHO = new Date(Date.now() - 120 * 86400000).toISOString();   // 4 meses → fora da janela
const DOIS_MESES = new Date(Date.now() - 60 * 86400000).toISOString(); // dentro dos 3 meses
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── Dados REAIS de produção (letzplayScans, varredura de 14/jul/2026 14:38) ──
const scanFlavia = {
  handle: 'FlaviaCampion', name: 'Flavia Campion',
  rankingCategory: 'Fem D+ / C-', allCategories: ['Fem D+ / C-'],
  gender: 'feminino', skill: 'C', profileSkill: 'D', champions: [],
  at: AGORA,
  rankings: [{ category: 'Fem D+ / C-', active: true, position: null, fieldSize: null }, { category: 'Fem D+ / C-', active: true }, { category: 'Fem D', active: false }],
  tournaments: [], totals: { rankings: 3, tournaments: 2, matches: 66 },   // ← 2 torneios declarados, 0 capturados: INCOMPLETO (real)
};
const scanKelly = {
  handle: 'KellyBarth1', name: 'Kelly Barth',
  rankingCategory: 'Fem C+ / B-', allCategories: ['Fem C+ / B-'],
  gender: 'feminino', skill: 'B', profileSkill: 'C', champions: [],
  at: AGORA,
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
    importedAt: AGORA, rating: { band: 'D+/C-' }, rankings: [], tournaments: [], games: new Array(81), declaredGames: 81 };
  const r = run({ uid: 'r1', effectiveSkills: [] }, { r1: Object.assign({ letzplayImport: impCompleto }, profAuthorized) }, {});
  ok(r._lzColor === COL.green, 'autoimport 81 de 81 declarados → VERDE (veio: ' + r._lzColor + ')');
  ok(r._lzSrc === '🎾', 'fonte = autoimport');
}
{
  // PARCIAL salvo (a paginação morreu na metade): tem 60 dos 81 → não absolve
  const impParcial = { handle: 'X', officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    importedAt: AGORA, rating: { band: 'D+/C-' }, rankings: [], tournaments: [], games: new Array(60), declaredGames: 81 };
  const r = run({ uid: 'r2', effectiveSkills: [] }, { r2: Object.assign({ letzplayImport: impParcial }, profAuthorized) }, {});
  ok(r._lzColor === COL.violet, '60 de 81 declarados → ROXO, não verde (veio: ' + r._lzColor + ')');
}
{
  // ele mesmo diz que parou no meio, mesmo com a contagem batendo
  const impInterrompido = { handle: 'X', officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    importedAt: AGORA, rating: { band: 'D+/C-' }, rankings: [], tournaments: [], games: new Array(81), declaredGames: 81,
    partialReason: 'rate: HTTP 403' };
  const r = run({ uid: 'r3', effectiveSkills: [] }, { r3: Object.assign({ letzplayImport: impInterrompido }, profAuthorized) }, {});
  ok(r._lzColor === COL.violet, 'partialReason presente → ROXO mesmo com a contagem batendo');
}
{
  // import LEGADO (sem declaredGames): mantém o comportamento antigo — não regride
  const impLegado = { handle: 'X', officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    importedAt: AGORA, rating: { band: 'D+/C-' }, rankings: [], tournaments: [], games: new Array(81) };
  const r = run({ uid: 'r4', effectiveSkills: [] }, { r4: Object.assign({ letzplayImport: impLegado }, profAuthorized) }, {});
  ok(r._lzColor === COL.green, 'import legado sem declaredGames → segue VERDE (não regride quem já tinha)');
}
{
  // acusação NÃO depende de completude: achar título é prova mesmo com 60 de 81
  const impGato = { handle: 'X', officialCategory: { categoryRaw: 'Masculina D', skill: 'D' },
    importedAt: AGORA, rating: { band: 'D+/C-' }, rankings: [], games: new Array(60), declaredGames: 81,
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
    importedAt: AGORA, rating: { band: 'C+/B-' }, rankings: [], tournaments: [] };
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
// o não-lido é rotulado E não ganha data inventada (a linha dele não tem a cor da data)
var _linhaPend = htmlL.split('<div ').filter(function (x) { return x.indexOf('PENDENTE') >= 0; })[0] || '';
ok(_linhaPend.indexOf('ainda não lido') >= 0, 'não lido é rotulado como tal');
ok(_linhaPend.indexOf('#7dd3fc') < 0, 'não lido NÃO ganha data inventada (sem a cor da data)');

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


// ─────────────────────────────────────────────────────────────────────────────
// "Ver trilha de X/Y" NO CAMPO DA CATEGORIA — o defeito real, medido em produção
// (letzplayScans/h2J8..., @camilacalia, 30/jul/2026): 55 de 55 entradas oficiais com
// categoryRaw = "Ver trilha de …". O card do jogo tem DOIS links pro mesmo
// /tournaments/{id} (a categoria e a trilha da dupla) e o extrator pegava o primeiro.
// Como o agrupamento usava categoryRaw, o MESMO torneio virava várias entradas —
// 35 torneios contados como 55, e a barra dizia "35 de 35 (100%)" com 14 por ler.
console.log('\n── trilha no campo da categoria (defeito medido em prod) ──');

// 3 entradas do MESMO torneio, cada uma com a trilha de uma dupla diferente
function _fpTrilha(tid, trilha, pos) {
  return { official: true, club: 'paineiras-bt', tourneyId: tid, categoryRaw: trilha,
    name: "2º Final's Ranking 7BTW - Finais ranking W7BT - Feminina C",
    year: 2026, standings: [{ group: 'G1', rows: [{ pos: pos, handles: ['camilacalia'] }] }] };
}
var impT = { footprint: [
    _fpTrilha('700', 'Ver trilha de I. Garcia/L. Costa', 4),
    _fpTrilha('700', 'Ver trilha de L. Costa/N. Pinto', 2),
    _fpTrilha('700', 'Ver trilha de I. Garcia/N. Pinto', 6)
  ], games: [], declaredTournaments: 35,
  tournamentsList: [{ club: 'paineiras-bt', tid: '700' }] };

// 1) CONTAGEM por torneio DISTINTO, não por entrada de footprint
ok(window._lzTournamentsRead(impT) === 1,
  '3 entradas do mesmo torneio contam como 1 torneio lido (era 3 → inflava a barra)');

// 2) UMA linha só na lista, com a MELHOR colocação
var htmlT = window._lzTourneyRows(impT, 'camilacalia');
var divsT = (htmlT.match(/<div /g) || []).length;
ok(divsT === 1, 'a lista mostra UMA linha para o torneio (era uma por trilha)', 'linhas=' + divsT);
ok(/🥈 2º/.test(htmlT), 'funde as entradas mantendo a melhor colocação (2º, não 4º nem 6º)');

// 3) a TRILHA sai do campo da categoria, fica BRANCA e vai pro FIM
ok(new RegExp('color:#f3f4f6[^>]*>Ver trilha de').test(htmlT), 'trilha em BRANCO (#f3f4f6), não no roxo');
ok(htmlT.indexOf('#a78bfa') < 0 || !/color:#a78bfa[^>]*>Ver trilha/.test(htmlT),
  'trilha NUNCA sai com a cor da categoria');
var iCat = htmlT.indexOf('#a78bfa'), iPos = htmlT.indexOf('#fbbf24'), iTr = htmlT.indexOf('#f3f4f6');
ok(iCat >= 0 && iPos > iCat && iTr > iPos,
  'ordem: categoria → classificação → trilha (pedido do dono)', 'cat=' + iCat + ' pos=' + iPos + ' trilha=' + iTr);

// 4) a CATEGORIA REAL é resgatada do nome, já que o campo dela estava ocupado pela trilha
ok(new RegExp('color:#a78bfa[^>]*>Feminina C<').test(htmlT),
  '"Feminina C" (que estava dentro do nome) virou a categoria colorida');
ok(htmlT.indexOf("Finais ranking W7BT - Feminina C") < 0, 'o sufixo da categoria saiu do nome');

// 5) o extrator não pega mais o link da trilha
var X = window._spExtract || require('../extension/lib/letzplay-extract.js') || null;
if (window._spExtract && window._spExtract.isTrailText) {
  ok(window._spExtract.isTrailText('Ver trilha de I. Garcia/L. Costa') === true, 'reconhece texto de trilha');
  ok(window._spExtract.isTrailText('Grupos • Finals - Feminina C') === false, 'não confunde categoria com trilha');
}

// 6) texto que NÃO é categoria nem trilha não vira chip colorido
var htmlN = window._lzTourneyRows({ footprint: [{ official: true, club: 'c', tourneyId: '9',
  categoryRaw: 'Finais ranking W7BT', name: "2º Final's Ranking 7BTW - Finais ranking W7BT",
  year: 2026, standings: [{ group: 'G1', rows: [{ pos: 1, handles: ['x'] }] }] }] }, 'x');
ok(htmlN.indexOf('#a78bfa') < 0, '"Finais ranking W7BT" não é categoria → sem chip roxo');


// ── 12. VERDE SÓ COM LEITURA DE MENOS DE 1 MÊS ────────────────────────────────
// Regra do dono (30/jul/2026): "como nenhum aqui passou pelo novo sistema deveriam estar
// todos roxos. só ficar verde aqueles que estão atualizados de verdade a menos de 1 mês".
console.log('\n── frescor: verde exige leitura recente ──');
{
  const base = { source: 'letzplay', handle: 'x', officialCategory: { skill: 'D', categoryRaw: 'Fem D' },
    rankings: [], tournaments: [], games: new Array(81), declaredGames: 81 };
  const novo = Object.assign({}, base, { importedAt: AGORA });
  const velho = Object.assign({}, base, { importedAt: VELHO });
  const semData = Object.assign({}, base);                       // é o caso de TODO perfil antigo
  const rN = run({ uid: 'f1', effectiveSkills: [] }, { f1: Object.assign({ letzplayImport: novo }, profAuthorized) }, {});
  const rV = run({ uid: 'f2', effectiveSkills: [] }, { f2: Object.assign({ letzplayImport: velho }, profAuthorized) }, {});
  const rS = run({ uid: 'f3', effectiveSkills: [] }, { f3: Object.assign({ letzplayImport: semData }, profAuthorized) }, {});
  ok(rN._lzColor === COL.green, 'leitura de hoje → VERDE (veio: ' + rN._lzColor + ')');
  ok(rV._lzColor !== COL.green, 'leitura de 4 meses NÃO absolve — cai pro violeta');
  ok(rV._lzVerified === false, 'leitura velha não conta como verificada');
  ok(rS._lzColor !== COL.green, 'sem data de leitura NÃO absolve (é o caso dos perfis antigos)');
}
{
  // evidência POSITIVA não envelhece: título achado é prova, mesmo em leitura velha
  const gato = { source: 'letzplay', handle: 'x', importedAt: VELHO,
    officialCategory: { skill: 'B', categoryRaw: 'Fem B' }, rankings: [], tournaments: [],
    games: new Array(81), declaredGames: 81 };
  const r = run({ uid: 'f4', effectiveSkills: ['D'] }, { f4: Object.assign({ letzplayImport: gato }, profAuthorized) }, {});
  ok(r._lzColor !== COL.green && r._lzColor !== undefined,
    'divergência achada continua pintando mesmo com leitura velha (veio: ' + r._lzColor + ')');
}

// ── 13. CURSOR COMPLETO fecha a leitura, mesmo com o contador deles maior ─────
// MEDIDO no letzplay em 30/jul: as 24 páginas de @camilacalia têm 478 CARDS e 469 ids de
// partida distintos — 9 partidas listadas duas vezes por eles. Enquanto a completude
// exigia `jogos >= declaredGames`, a leitura fechada ficava "INCOMPLETA" por 9 fantasmas.
console.log('\n── completude pelo cursor (478 cards × 469 partidas) ──');
{
  const camila = { source: 'letzplay', handle: 'camilacalia', importedAt: AGORA,
    officialCategory: { skill: 'C', categoryRaw: 'Fem C' }, rankings: [], tournaments: [],
    games: new Array(469), declaredGames: 478,
    lzCursor: { v: 4, complete: true, pageDone: 24, pagesTotal: 24 } };
  const r = run({ uid: 'c1', effectiveSkills: [] }, { c1: Object.assign({ letzplayImport: camila }, profAuthorized) }, {});
  ok(r._lzColor === COL.green, '469 de 478 com cursor COMPLETO → leitura fechada, VERDE (veio: ' + r._lzColor + ')');
  const meio = Object.assign({}, camila, { lzCursor: { v: 4, complete: false, pageDone: 12, pagesTotal: 24 } });
  const r2 = run({ uid: 'c2', effectiveSkills: [] }, { c2: Object.assign({ letzplayImport: meio }, profAuthorized) }, {});
  ok(r2._lzColor !== COL.green, 'cursor pela metade continua NÃO absolvendo');
}

// ── 14. TRÊS ABAS: torneios, rankings e jogos, cada uma com a sua lista ───────
// O diálogo empilhava as três listas e travava ("essa tela está imprestável").
console.log('\n── abas: torneios · rankings · jogos ──');
{
  const imp = {
    handle: 'camilacalia', declaredGames: 3,
    footprint: [
      { official: true, club: 'cl', tourneyId: '11', name: 'Open Reação - Feminina C', categoryRaw: 'Feminina C',
        year: 2026, standings: [{ group: 'G', rows: [{ pos: 2, handles: ['camilacalia'] }] }] },
      { official: false, club: 'pb', rankingId: '55291', name: 'Competitivo Fem C | 2026', categoryRaw: 'Fem C',
        year: 2026, standings: [{ group: 'G', rows: [{ pos: 4, handles: ['camilacalia'] }] }] }
    ],
    tournamentsList: [{ club: 'cl', tid: '11' }, { club: 'cl', tid: '99', title: 'Torneio ainda não lido - Fem C' }],
    rankingsList: [{ club: 'pb', rid: '55291' }, { club: 'pb', rid: '777', title: 'Ranking não lido' }],
    games: [
      { lzId: '1', date: 'Quarta, 29/07/26', club: 'cl', tourneyId: '11', official: true,
        competition: 'Feminina C', myScore: 6, oppScore: 3, won: true, oppNames: ['Ana', 'Bia'] },
      { lzId: '2', date: 'Terça, 28/07/26', club: 'pb', rankingId: '55291', official: false,
        competition: 'Fem C', myScore: 4, oppScore: 6, won: false, oppNames: ['Cris'] }
    ]
  };
  const t = window._lzTourneyRows(imp, 'camilacalia', 'tour');
  const r = window._lzTourneyRows(imp, 'camilacalia', 'rank');
  const j = window._lzGameRows(imp, 'camilacalia');
  ok(/Open Reação/.test(t) && !/Competitivo Fem C/.test(t), 'aba TORNEIOS mostra só torneio');
  ok(/Competitivo Fem C/.test(r) && !/Open Reação/.test(r), 'aba RANKINGS mostra só ranking');
  ok(/Torneio ainda não lido/.test(t) && /ainda não lido/.test(t), 'torneio pendente aparece na aba dele');
  ok(/Ranking não lido/.test(r), 'ranking pendente aparece na aba dele');
  ok(/🥈 2º/.test(t) && /🏅 4º/.test(r), 'cada aba traz a classificação da sua competição');
  ok(/6–3/.test(j) && /4–6/.test(j), 'aba JOGOS traz o placar');
  ok(/vs Ana \/ Bia/.test(j), 'aba JOGOS traz os adversários');
  ok(/29 jul 26/.test(j) && /28 jul 26/.test(j), 'aba JOGOS traz a data formatada');
  ok(j.indexOf('29 jul 26') < j.indexOf('28 jul 26'), 'jogos em ordem cronológica INVERSA');
  ok(/✅/.test(j) && /❌/.test(j), 'vitória e derrota se distinguem de relance');
  ok(window._lzGameRows({ games: [] }, 'x') === '', 'sem jogos → vazio (a aba mostra o texto de vazio)');
}

// ── 15. QUAL IMPORT VALE: quem tem o id do letzplay vence quem tem MAIS jogos ──
// Medido em 30/jul: letzplayScans tinha os 469 LIMPOS e users/{uid} os 569 SUJOS, 15min
// mais velhos. "Vence quem tem mais" trouxe o lixo de volta pra tela.
console.log('\n── escolha entre os dois imports ──');
{
  const limpo = { importedAt: AGORA, games: Array.from({ length: 469 }, (_, i) => ({ lzId: 'x' + i })) };
  const sujo = { importedAt: VELHO, games: Array.from({ length: 569 }, () => ({})) };
  ok(window._lzMelhorImport(sujo, limpo) === limpo, 'com id vence sem id, mesmo com menos jogos');
  ok(window._lzMelhorImport(limpo, sujo) === limpo, 'a ordem dos argumentos não muda o resultado');
  const velhoComId = { importedAt: VELHO, games: [{ lzId: '1' }] };
  const novoComId = { importedAt: AGORA, games: [{ lzId: '1' }, { lzId: '2' }] };
  ok(window._lzMelhorImport(velhoComId, novoComId) === novoComId, 'empatados no id, vence o mais recente');
  ok(window._lzMelhorImport(null, sujo) === sujo, 'um só existindo, é ele');
  ok(window._lzMelhorImport(null, null) === null, 'nenhum dos dois → null');
}

// ── 16. TOTAL DE RANKINGS vem da LISTA/declarado, nunca das entradas do footprint ──
// O footprint fragmenta: 30 entradas pros 29 rankings da Camila, 21 pros 8 da Kelly.
console.log('\n── total de rankings (footprint fragmentado) ──');
{
  const fp = [];
  for (let i = 0; i < 8; i++) {
    // cada ranking aparece 2 ou 3 vezes, uma por categoria — é o footprint real
    for (let k = 0; k < (i % 2 ? 3 : 2); k++) {
      fp.push({ official: false, club: 'pb', rankingId: String(100 + i), name: 'R' + i, categoryRaw: 'cat' + k,
        standings: [{ group: 'G', rows: [{ pos: 3, handles: ['kelly'] }] }] });
    }
  }
  ok(fp.length === 20, 'o fixture reproduz o footprint inflado (' + fp.length + ' entradas pra 8 rankings)');
  const imp = { handle: 'kelly', importedAt: AGORA, declaredRankings: 8, footprint: fp,
    rankingsList: Array.from({ length: 8 }, (_, i) => ({ club: 'pb', rid: String(100 + i) })),
    games: [{ lzId: '1' }], lzCursor: { v: 4, complete: true,
      ranksDone: Object.fromEntries(fp.map(f => ['r/pb/' + f.rankingId, 1])) } };
  const linhas = window._lzTourneyRows(imp, 'kelly', 'rank');
  const n = (linhas.match(/padding:2px 0/g) || []).length;
  ok(n === 8, 'a aba de rankings mostra 8 linhas, não 20 (veio ' + n + ')');
}

// ── 17. VERDE EXIGE O MOTOR NOVO (jogo com o id do letzplay) ─────────────────
// "os nomes que não puxaram com o motor certo continuam verdes. tinham que estar roxos."
// Data recente NÃO basta: um import de 16 dias é fresco e mesmo assim veio do pipeline
// velho, que duplicava partida e perdia competição.
console.log('\n── verde exige o motor novo ──');
{
  const base = { importedAt: AGORA, officialCategory: { skill: 'D', categoryRaw: 'Fem D' },
    rankings: [], tournaments: [], declaredGames: 81,
    lzCursor: { v: 4, complete: true, pageDone: 1, pagesTotal: 1 } };
  const motorNovo = Object.assign({}, base, { games: Array.from({ length: 81 }, (_, i) => ({ lzId: 'g' + i })) });
  const motorVelho = Object.assign({}, base, { games: Array.from({ length: 81 }, () => ({})) });
  const meioAMeio = Object.assign({}, base, { games: [{ lzId: '1' }, {}, { lzId: '3' }] });
  const rN = run({ uid: 'm1', effectiveSkills: [] }, { m1: Object.assign({ letzplayImport: motorNovo }, profAuthorized) }, {});
  const rV = run({ uid: 'm2', effectiveSkills: [] }, { m2: Object.assign({ letzplayImport: motorVelho }, profAuthorized) }, {});
  const rM = run({ uid: 'm3', effectiveSkills: [] }, { m3: Object.assign({ letzplayImport: meioAMeio }, profAuthorized) }, {});
  ok(rN._lzColor === COL.green, 'lido com o motor novo e recente → VERDE');
  ok(rV._lzColor !== COL.green, 'motor VELHO, mesmo recente, NÃO absolve — violeta');
  ok(rV._lzVerified === false, 'motor velho não conta como verificado');
  ok(rM._lzColor !== COL.green, 'meio lido pelo motor velho também não absolve');

  // AS DUAS CONDIÇÕES, JUNTAS (regra do dono: "é motor atual E data. as duas coisas").
  const novoMasVelho = Object.assign({}, base, { importedAt: VELHO,
    games: Array.from({ length: 81 }, (_, i) => ({ lzId: 'g' + i })) });
  const rNV = run({ uid: 'm4', effectiveSkills: [] }, { m4: Object.assign({ letzplayImport: novoMasVelho }, profAuthorized) }, {});
  ok(rNV._lzColor !== COL.green, 'motor NOVO mas leitura de 4 meses → NÃO absolve');
  ok(rN._lzColor === COL.green, 'só absolve com motor novo E leitura recente — as duas');
}

// ── 18. SEM TOTAL DECLARADO, a barra fecha no que se conhece ─────────────────
// A Kelly ficava em "Torneios 5 de …" pra sempre: sem declaredTournaments e sem
// tournamentsList, o total era nulo — e total desconhecido é indistinguível de quebrado.
console.log('\n── barra sem total declarado ──');
{
  const fp = [];
  for (let i = 0; i < 7; i++) {
    for (let k = 0; k < 2; k++) {                    // footprint fragmentado de novo
      fp.push({ official: true, club: 'cl', tourneyId: String(200 + i), name: 'T' + i,
        categoryRaw: 'cat' + k, standings: [{ group: 'G', rows: [{ pos: 1, handles: ['kelly'] }] }] });
    }
  }
  const imp = { handle: 'kelly', importedAt: AGORA, footprint: fp, games: [{ lzId: '1' }],
    lzCursor: { v: 4, complete: true, toursDone: Object.fromEntries(fp.map(f => ['t/cl/' + f.tourneyId, 1])) } };
  ok(imp.declaredTournaments === undefined, 'o fixture não declara total (como o import da Kelly)');
  ok(window._lzTournamentsRead(imp) === 7, 'lidos = 7 competições distintas, não 14 entradas');
  const linhas = window._lzTourneyRows(imp, 'kelly', 'tour');
  const n = (linhas.match(/padding:2px 0/g) || []).length;
  ok(n === 7, 'a aba mostra 7 torneios, não 14 (veio ' + n + ')');
}

// ── 19. A JANELA DO VERDE É DE 3 MESES ───────────────────────────────────────
// Regra do dono (31/jul/2026): "se estiver atualizado até 3 meses ele considera verde;
// se for a mais tempo, volta pro roxo".
console.log('\n── janela de 3 meses ──');
{
  const base = { officialCategory: { skill: 'D', categoryRaw: 'Fem D' }, rankings: [], tournaments: [],
    declaredGames: 3, games: [{ lzId: '1' }, { lzId: '2' }, { lzId: '3' }],
    lzCursor: { v: 4, complete: true } };
  function cor(quando, uid) {
    const imp = Object.assign({}, base, { importedAt: quando });
    return run({ uid: uid, effectiveSkills: [] }, { [uid]: Object.assign({ letzplayImport: imp }, profAuthorized) }, {})._lzColor;
  }
  const dias = n => new Date(Date.now() - n * 86400000).toISOString();
  ok(cor(dias(1), 'j1') === COL.green, 'ontem → verde');
  ok(cor(dias(45), 'j2') === COL.green, '45 dias ainda é verde (era roxo com a janela de 1 mês)');
  ok(cor(dias(89), 'j3') === COL.green, '89 dias — na borda de dentro — ainda verde');
  ok(cor(dias(120), 'j4') !== COL.green, '4 meses → volta pro roxo');
  ok(cor(dias(365), 'j5') !== COL.green, 'um ano → roxo');
}

// ── 20. A COR SAI DO BANCO, ANTES DE QUALQUER CLIQUE ─────────────────────────
// "o sistema deve consultar o banco de dados para ver isso mesmo antes de qualquer clique
// do organizador." A página busca perfis + letzplayScans por uid e SÓ ENTÃO renderiza.
{
  const fs = require('fs'), pth = require('path');
  const src = fs.readFileSync(pth.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
  const carga = src.slice(src.indexOf('_fetchProfiles(parts).then'), src.indexOf('_fetchProfiles(parts).then') + 1400);
  ok(/_fetchGlobalScans\(candUids\)/.test(carga), 'a página busca os letzplayScans do banco no carregamento');
  ok(carga.indexOf('_fetchGlobalScans') < carga.indexOf('_renderPage'), 'e busca ANTES de renderizar');
  const render = src.slice(src.indexOf('function _renderCategoriesSection'), src.indexOf('function _renderCategoriesSection') + 400);
  ok(/_erApplyLzToRows\(rows, profileMap, scanMap\)/.test(render), 'as cores são aplicadas com o que veio do banco');

  // e o veredito só depende do dado — nenhuma cor precisa de clique
  const imp = { importedAt: new Date().toISOString(), officialCategory: { skill: 'D', categoryRaw: 'Fem D' },
    rankings: [], tournaments: [], games: [{ lzId: '1' }], declaredGames: 1, lzCursor: { v: 4, complete: true } };
  const r = run({ uid: 'db1', effectiveSkills: [] }, { db1: profAuthorized }, { db1: { fullImport: imp } });
  ok(r._lzColor === COL.green, 'scan vindo do BANCO (letzplayScans) já pinta verde sem clique nenhum');
}

console.log((fail ? '✗' : '✓') + ' letzplay-verdict-color: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
