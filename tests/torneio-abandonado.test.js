/* Torneio abandonado, lado do CLIENTE — node tests/torneio-abandonado.test.js
 *
 * A REGRA de quando encerrar mora só no servidor (functions/abandon-core.js, testado em
 * functions/test-abandon-core.js). Aqui trava o que o cliente FAZ com a marca `autoClosed`,
 * que é onde as ordens do dono viram comportamento:
 *   • _"encerrar não deve fechar a classificação"_ → sem pódio, sem troféu, sem título;
 *   • _"depois de encerrado, a única ferramenta ativa seria o reabrir torneio"_;
 *   • _"o organizador pode reabrir... colocando as datas"_ → as duas datas são obrigatórias;
 *   • o abandonado sem nenhum jogo _"fica aparecendo para todos os usuários novos"_ → sai da
 *     vitrine por LEITURA, sem escrever nada no torneio de ninguém.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { window, sandbox } = require('./headless.js');

// Funções REAIS extraídas do arquivo (store.js inteiro não roda no harness). Extrair em vez
// de reescrever: se alguém mudar a regra em store.js, é esta que o teste passa a exercitar.
const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
['_isAutoClosed', '_isTorneioParadoSemJogo', '_tournamentHasAnyScore'].forEach(function (nome) {
  const re = new RegExp('window\\.' + nome + ' = function[\\s\\S]*?\\n};');
  const m = storeSrc.match(re);
  if (!m) { console.error('✗ não achei window.' + nome + ' em js/store.js'); process.exit(1); }
  vm.runInContext(m[0], sandbox, { filename: 'store.' + nome + '.js' });
});
vm.runInContext('window._SEM_JOGO_SUMICO_DIAS = 30;', sandbox, { filename: 'store.const.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'trophy-catalog.js'), 'utf8'),
  sandbox, { filename: 'trophy-catalog.js' });
window._collectAllMatches = function (t) {
  return [].concat(t.matches || [], ...(t.rounds || []).map(function (r) { return r.matches || r || []; }));
};

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }

const DIA = 86400000;
const velho = new Date(Date.now() - 45 * DIA).toISOString();
const novo = new Date(Date.now() - 3 * DIA).toISOString();

console.log('\n▸ a marca de encerrado-por-inatividade');
{
  eq(window._isAutoClosed({ status: 'finished', autoClosed: true }), true, 'finished + autoClosed');
  eq(window._isAutoClosed({ status: 'finished' }), false, 'encerrado pelo organizador NÃO é auto');
  eq(window._isAutoClosed({ status: 'active', autoClosed: true }), false, 'marca sem finished não vale');
  eq(window._isAutoClosed(null), false, 'null não quebra');
}

console.log('▸ encerrado por inatividade NÃO premia ninguém');
{
  const participantes = [1, 2, 3, 4, 5, 6].map(function (i) { return { name: 'P' + i }; });
  const normal = { status: 'finished', participants: participantes };
  const auto = { status: 'finished', autoClosed: true, participants: participantes };
  eq(window._isTournamentQualifiedForTrophy(normal), true, 'torneio concluído de verdade premia');
  eq(window._isTournamentQualifiedForTrophy(auto), false,
     'encerrado por inatividade NÃO dá troféu (a classificação não foi fechada)');
}

console.log('▸ o que nunca teve jogo sai da vitrine — e só isso');
{
  const semJogo = { status: 'open', createdAt: velho, format: 'Eliminatórias Simples' };
  eq(window._isTorneioParadoSemJogo(semJogo), true, 'aberto há 45 dias sem nenhum placar → some');
  const recente = { status: 'open', createdAt: novo, format: 'Eliminatórias Simples' };
  eq(window._isTorneioParadoSemJogo(recente), false, 'torneio de 3 dias é só novo');
  const comJogo = { status: 'active', createdAt: velho, format: 'Eliminatórias Simples',
                    matches: [{ scoreP1: 6, scoreP2: 3 }] };
  eq(window._isTorneioParadoSemJogo(comJogo), false, 'quem já jogou não some da vitrine');
  const liga = { status: 'active', createdAt: velho, format: 'Liga' };
  window._isLigaFormat = function (t) { return String(t.format || '').toLowerCase() === 'liga'; };
  eq(window._isTorneioParadoSemJogo(liga), false, 'Liga nunca some (temporada contínua)');
  const encerrado = { status: 'finished', createdAt: velho, format: 'Eliminatórias Simples' };
  eq(window._isTorneioParadoSemJogo(encerrado), false, 'encerrado já tem seção própria');
}

console.log('▸ a fiação nas telas (o que o dono pediu, onde ele vê)');
{
  const tour = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
  ok(/_isAutoClosed[\s\S]{0,1600}Reabrir Torneio/.test(tour),
     'nas Ferramentas do Organizador, encerrado-por-inatividade mostra Reabrir');
  // e SÓ Reabrir: o bloco do auto-encerrado retorna antes de montar os outros botões.
  const bloco = tour.slice(tour.indexOf('_isAutoClosed && window._isAutoClosed(t)) {'),
                          tour.indexOf('_isAutoClosed && window._isAutoClosed(t)) {') + 1600);
  ok(!/openEditModal|deleteTournamentFunction|Comunicados|finishTournament/.test(bloco),
     'e NENHUMA outra ferramenta aparece junto (editar/apagar/comunicar/encerrar)');
  ok(/isFinished && !\(window\._isAutoClosed/.test(tour),
     'o pódio não é desenhado pra torneio encerrado por inatividade');

  const dash = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
  const clas = dash.slice(dash.indexOf('_classifyDiscoveryTournament = (t) =>'),
                          dash.indexOf('_classifyDiscoveryTournament = (t) =>') + 700);
  ok(/_isTorneioParadoSemJogo\(t\)\) return null/.test(clas),
     'a vitrine descarta o parado-sem-jogo (retorna null = fora de toda seção)');

  const ana = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-analytics.js'), 'utf8');
  ok(/_premia[\s\S]{0,200}stats\.titles\+\+/.test(ana), 'título só quando o encerramento premia');
  ok(/_premia[\s\S]{0,200}stats\.podiums\+\+/.test(ana), 'pódio idem');

  const org = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-organizer.js'), 'utf8');
  const reab = org.slice(org.indexOf('window._reopenAbandonedTournament = function'));
  ok(/Preencha as duas datas/.test(reab), 'reabrir EXIGE as duas datas');
  ok(/fim < ini/.test(reab), 'e recusa término antes do início');
  ['autoClosed', 'autoClosedAt', 'autoCloseReason', 'autoCloseWarnedAt', 'autoCloseDueAt'].forEach(function (c) {
    ok(new RegExp('delete fresh\\.' + c + '\\b').test(reab), 'reabrir limpa a marca ' + c);
  });
  ok(/_reopenSetDate/.test(reab),
     'o valor é lido enquanto se digita (o diálogo se remove ANTES do onConfirm)');
  // ARMADILHA DE NOME: `autoCloseOnFull` (encerrar INSCRIÇÕES quando lotar, v2.4.12) é
  // anterior e sem relação — 5 dos 8 torneios vivos têm o campo. Varrer por prefixo apagaria
  // a configuração do organizador junto.
  ok(!/autoCloseOnFull/.test(reab), 'reabrir NÃO toca em autoCloseOnFull (campo de outra feature)');
  ok(!/delete fresh\[[^\]]*\]/.test(reab) && !/startsWith\(['"]autoClose/.test(reab),
     'e nunca apaga por prefixo/dinamicamente — só os 5 campos, um a um');
}

console.log('▸ o servidor não escreve nada pra quem só sai da vitrine');
{
  const run = fs.readFileSync(path.join(__dirname, '..', 'functions', 'abandon-run.js'), 'utf8');
  ok(/foraDaVitrine"\) \{ foraDaVitrine\+\+; continue; \}/.test(run),
     '"foraDaVitrine" faz continue antes de qualquer update (zero escrita)');
  ok(/autoClosed: true/.test(run), 'encerrar grava a marca autoClosed');
  ok(/if \(t\.autoCloseWarnedAt\) continue;/.test(run), 'o aviso de 48h sai uma vez só');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
  ok(/exports\.sweepAbandonedTournaments = onSchedule/.test(idx), 'a varredura está agendada');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
