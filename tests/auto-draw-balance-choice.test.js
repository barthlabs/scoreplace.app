/* A tela equilibrado/livre no sorteio AUTOMÁTICO — node tests/auto-draw-balance-choice.test.js
 * Pedido do dono (31/jul/2026): "aquela tela de sorteio equilibrado ou livre deve aparecer
 * e atuar... essa tela deve aparecer ao salvar o torneio com o sorteio automático, data e
 * hora futura". No manual ela já existia (aparece na hora de sortear); no automático não
 * havia hora nenhuma — o sorteio acontece sozinho e ninguém nunca escolhia.
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'create-tournament.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

ok(/function _autoDrawAgendadoNoForm\(\)/.test(src), 'existe a checagem "auto + data futura"');
const chk = src.slice(src.indexOf('function _autoDrawAgendadoNoForm'), src.indexOf('function _perguntarEquilibrio'));
ok(/if \(manual\) return false;/.test(chk), 'sorteio MANUAL não dispara a tela (lá ela já existe)');
ok(/if \(!data\) return false;/.test(chk), 'sem data marcada, não dispara');
ok(/quando\.getTime\(\) > Date\.now\(\)/.test(chk), 'e só quando a data/hora ainda está no futuro');

ok(/function _perguntarEquilibrio\(depois\)/.test(src), 'existe o diálogo de escolha');
const dlg = src.slice(src.indexOf('function _perguntarEquilibrio'), src.indexOf('window._saveTournamentClickHandler = function'));
ok(/Equilibrado/.test(dlg) && /Livre/.test(dlg), 'oferece as duas opções');
ok(/_drawBalanceChoice = true/.test(dlg) && /_drawBalanceChoice = false/.test(dlg), 'guarda a escolha nos dois caminhos');
ok(/Rei\/Rainha/.test(dlg), 'e explica o efeito na rodada Rei/Rainha');

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

console.log((fail ? '✗' : '✓') + ' auto-draw-balance-choice: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
