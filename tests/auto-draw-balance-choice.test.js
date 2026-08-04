/* A tela equilibrado/livre no sorteio AUTOMÁTICO — node tests/auto-draw-balance-choice.test.js
 * Pedido do dono (31/jul/2026): "aquela tela de sorteio equilibrado ou livre deve aparecer
 * e atuar... essa tela deve aparecer ao salvar o torneio com o sorteio automático, data e
 * hora futura". No manual ela já existia (aparece na hora de sortear); no automático não
 * havia hora nenhuma — o sorteio acontece sozinho e ninguém nunca escolhia.
 *
 * E a tela é A APROVADA: "⚖️ Sorteio de duplas" (window._showDrawBalanceOverlay). O dono
 * viu uma tela nova aqui e foi direto ao ponto: "temos uma tela disso já aprovada. que
 * merda de tela nova é essa?". Este teste trava as DUAS portas na MESMA tela.
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'create-tournament.js'), 'utf8');
const draw = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-draw.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

ok(/function _autoDrawAgendadoNoForm\(\)/.test(src), 'existe a checagem "auto + data futura"');
const chk = src.slice(src.indexOf('function _autoDrawAgendadoNoForm'), src.indexOf('function _perguntarEquilibrio'));
ok(/if \(manual\) return false;/.test(chk), 'sorteio MANUAL não dispara a tela (lá ela já existe)');
ok(/if \(!data\) return false;/.test(chk), 'sem data marcada, não dispara');
ok(/quando\.getTime\(\) > Date\.now\(\)/.test(chk), 'e só quando a data/hora ainda está no futuro');
ok(/window\._tournamentHasDraw\(_tj\)\) return false;/.test(chk), 'e NUNCA quando o sorteio já aconteceu');

// ── A TELA É A APROVADA, não uma nova ────────────────────────────────────────
const dlg = src.slice(src.indexOf('function _perguntarEquilibrio'), src.indexOf('window._saveTournamentClickHandler = function'));
ok(/window\._showDrawBalanceOverlay\(\{/.test(dlg), 'o salvar abre a tela canônica (_showDrawBalanceOverlay)');
ok(!/showConfirmDialog/.test(dlg), 'e NÃO inventa diálogo próprio pra essa escolha');
ok(/_drawBalanceChoice = !!equil/.test(dlg), 'guarda a escolha do jeito que o salvar lê');
ok(/window\._applyDrawBalanceChoice\(t, mode, assigned, \{ persist: false \}\)/.test(dlg),
  'o efeito também é o canônico (e quem grava é o salvar, não a tela)');
ok(/_hydrateParticipantGenders/.test(dlg), 'e hidrata o gênero do perfil antes de perguntar quem falta');

// A tela canônica existe uma vez só, e as duas portas chamam ela
ok((draw.match(/window\._showDrawBalanceOverlay = function/g) || []).length === 1, 'a tela é definida UMA vez');
ok(/opts\.title \|\| '⚖️ Sorteio'/.test(draw), 'título neutro por padrão — só é "de duplas" quando são duplas');
ok(/title: '⚖️ Sorteio de duplas'/.test(draw), 'a porta de DUPLAS diz duplas');
ok(!/duplas/.test(dlg), 'e a porta do SALVAR não chama de dupla o que pode ser sorteio de GRUPO');
ok(/ov\.id = 'gender-draw-overlay';/.test(draw), 'e o mesmo overlay de sempre');
const manual = draw.slice(draw.indexOf('window._maybeShowGenderDrawDialog = function'));
ok(/window\._showDrawBalanceOverlay\(\{/.test(manual), 'a porta MANUAL usa a mesma tela');

// o salvar pergunta ANTES de montar/gravar, e repete o salvar depois da resposta
const save = src.slice(src.indexOf('window._saveTournamentClickHandler = function'),
                       src.indexOf('window._saveTournamentClickHandler = function') + 2600);
ok(/_perguntarEquilibrio\(function \(\) \{ window\._saveTournamentClickHandler\(\); \}\)/.test(save),
  'responder a pergunta re-executa o salvar (mesmo padrão da reconciliação de pontuação)');
ok(/!window\._drawBalanceConfirmed/.test(save), 'e não pergunta de novo depois de respondida');

// a escolha entra no payload ANTES de gravar
const iEscolha = src.indexOf('tourData.equilibrado = window._drawBalanceChoice');
const iAdd = src.indexOf('window.AppStore.addTournament(tourData)');
ok(iEscolha > 0, 'a escolha é escrita no torneio');
ok(iEscolha < iAdd, 'e é escrita ANTES de gravar (payload pronto, sem mutação pós-save)');

// UMA escolha, os DOIS campos que o motor lê (duplas e grupos)
const apply = draw.slice(draw.indexOf('window._applyDrawBalanceChoice = function'),
                         draw.indexOf('// ─── PORTA 1: sorteio MANUAL'));
ok(/t\._drawBalanceMode = mode;/.test(apply), 'grava o modo que manda na formação de duplas');
ok(/t\.equilibrado = \(mode === 'equilibrado'\);/.test(apply), 'e o que manda no espalhamento dentro dos grupos');

console.log((fail ? '✗' : '✓') + ' auto-draw-balance-choice: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
