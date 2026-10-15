'use strict';

/* Regressão: reservar vagas não pode trocar o hash do detalhe por #participantes.
 * O organizador precisa continuar vendo o mesmo torneio; o painel é apenas uma ação
 * contextual e os cores existentes continuam responsáveis pela escrita. */
const fs = require('fs');
let fail = 0;
function ok(value, message) {
  if (value) console.log('✓ ' + message);
  else { console.error('✗ ' + message); fail++; }
}

const detail = fs.readFileSync('js/views/tournaments.js', 'utf8');
const activeButton = detail.slice(detail.indexOf('const addParticipantBtns'), detail.indexOf('// Categorias button removed'));
ok(/window\._openParticipantTools/.test(activeButton), 'botão do organizador abre o painel contextual');
ok(!/window\.location\.hash='#participantes\//.test(activeButton), 'botão do organizador não navega para a rota de participantes');

const tools = fs.readFileSync('js/views/tournaments-org-tools.js', 'utf8');
const pageStart = tools.indexOf('window.renderAddParticipantPage = function');
const pageEnd = tools.indexOf('window._openParticipantTools = function', pageStart);
const page = tools.slice(pageStart, pageEnd);
ok(pageStart >= 0 && pageEnd > pageStart && /class="btn btn-secondary"[^>]*_openTournamentImport/.test(page), 'entrada de arquivos na página de participante usa contraste de tema sem perder a ação');
const start = tools.indexOf('window._openParticipantTools = function');
const end = tools.indexOf('window._closeParticipantTools = function', start);
const panel = tools.slice(start, end);
ok(start >= 0 && /organizer-participant-tools/.test(panel), 'painel único é montado sobre o detalhe atual');
ok(/window\._pageAddPlaceholders/.test(panel), 'painel reutiliza o núcleo único de inclusão de vagas');
ok(!/location\.hash/.test(panel), 'abrir o painel não altera hash nem rota');
ok(!/Categorias do participante|addpart-category-/.test(panel), 'painel deixa a categoria para a Análise');
ok(!/Não exige categoria|Cada "Jogador NN" conta como inscrito/.test(panel), 'painel não repete explicações longas que forçam rolagem');
ok(/_openTournamentImport/.test(panel) && /Importar fotos ou planilhas/.test(panel), 'entrada de arquivos abre revisão contextual de inscritos');
ok(/class="btn btn-secondary"[^>]*_openTournamentImport/.test(panel), 'botão de importação no painel usa contraste de tema sem perder a ação');
const participantHandler = tools.slice(tools.indexOf('window._pageAddParticipant = function'), tools.indexOf('window._pageAddPlaceholders = function'));
const placeholderHandler = tools.slice(tools.indexOf('window._pageAddPlaceholders = function'), tools.indexOf('// Compat:', tools.indexOf('window._pageAddPlaceholders = function')));
ok(/function _guard\(tId\)/.test(tools), 'painel mantém a guarda local de torneio e organização');
ok(/window\._doAddParticipant\(tId, name/.test(participantHandler), 'painel chama o núcleo canônico de participante');
ok(/_refreshCount\(tId\)/.test(participantHandler), 'painel atualiza a contagem após incluir participante');
ok(/window\._addPlaceholdersCore\(tId, n/.test(placeholderHandler), 'painel chama o núcleo canônico de vagas');
ok(/_refreshCount\(tId\)/.test(placeholderHandler), 'painel atualiza a contagem após reservar vagas');

if (fail) process.exit(1);
