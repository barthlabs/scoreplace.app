// ═══════════════════════════════════════════════════════════════════════════
// v1.7.67 — A SAFE AREA É MEDIDA, NUNCA ESTIMADA (+ o picker cabe numa barra só)
//
// Nasceu de dois relatos do dono com print do iPhone na mão:
//   "espaço morto no tom do cabeçalho perdendo 1 linha"
//   "o desfazer encavalado na placa de baixo"
// e da constatação que doeu mais que os dois:
//   "vc me mostra uma coisa perfeita, mas na hora do valendo tem margem em cima
//    que nao esta no desenho aprovado e isso caga tudo"
//
// Os dois defeitos são invisíveis no navegador (onde env() é 0) e só aparecem no
// aparelho. Foram reproduzidos forçando os insets reais e MEDIDOS:
//   faixa morta   iPhone retrato 37px · Android 6px
//   invasão       iPhone retrato 34 · iPhone deitado 21 · Android gestos 24 ·
//                 Android 3 BOTÕES 49 (o pior caso) · Android deitado 24
// Depois do conserto: 0 em todos os cinco.
//
// Android entra na conta porque o projeto está em targetSdk 36 — o edge-to-edge
// é obrigatório desde o SDK 35 e no 36 o opt-out sumiu, então lá o WebView também
// desenha sob as barras do sistema. Não há opt-out no projeto (conferido).
//
// Este teste é de VARREDURA no fonte: o defeito não é de lógica pura, é de
// dimensionamento que só o aparelho revela — travar o texto é o que impede o
// número mágico de voltar.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
// ⚠️ O CSS entra na varredura porque desde a v1.7.71 quem reserva a status bar é ELE
// (piso por orientação no #live-scoring-overlay), não mais uma decisão em JS. Sem ler
// o CSS, o teste travaria só metade da conta — e foi a metade em JS que produziu os
// 62px mortos em retrato.
const CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'components.css'), 'utf8');

let ok = 0, fail = 0;
function check(nome, cond) {
  if (cond) { ok++; }
  else { fail++; console.log('   ❌ ' + nome); }
}

// ── 1 · a medição existe e é UMA só ────────────────────────────────────────
check('window._spInsetPx existe (mede env() de verdade, com um probe no DOM)',
  /window\._spInsetPx\s*=\s*window\._spInsetPx\s*\|\|\s*function/.test(SRC));
check('o probe lê safe-area-inset pelo lado pedido',
  /height:env\(safe-area-inset-'\s*\+\s*lado/.test(SRC));
check('não há uma SEGUNDA definição de _spInsetPx (duas divergem)',
  (SRC.match(/function _spInsetPx\s*\(/g) || []).length === 0);

// ── 2 · a reserva do Desfazer É A ALTURA REAL DO BOTÃO ────────────────────
// ⚠️ REVISADO DE PROPÓSITO (v1.7.72). Antes exigia `Math.round(56 * _lsK) + inset`:
// os 56px eram CRAVADOS À MÃO enquanto o botão media 26pt — 51pt reservados pra nada,
// que viravam vão morto entre a caixa de baixo e o rodapé (medido no iPhone 17).
// O invariante segue o mesmo e mais forte: a reserva conta o inset de baixo E não
// inventa número — ela É a altura do botão, calculada nas MESMAS variáveis que o
// desenham, mais um respiro pra a placa não encostar.
check('a altura do Desfazer sai de UMA conta (ícone + respiro + faixa do indicador)',
  /var _UNDO_H\s*=\s*_UNDO_PAD \+ _UNDO_ICO \+ _UNDO_BOT;/.test(SRC));
check('e essa conta inclui o inset de baixo, medido',
  /_UNDO_BOT\s*=\s*Math\.max\(2,\s*Math\.round\(window\._spInsetPx\('bottom'\)/.test(SRC));
check('retrato e deitado RESERVAM essa altura (nenhum número fixo sobrou)',
  /_pUndo\s*=\s*_UNDO_H \+ _UNDO_GAP/.test(SRC) && /_lUndo\s*=\s*_UNDO_H \+ _UNDO_GAP/.test(SRC));
check('o 56px cravado não voltou',
  !/Math\.round\(56 \* _lsK\)/.test(SRC));

// ── 3 · a caixa do deitado NÃO tem altura fixa ─────────────────────────────
// Com altura fixa, todo erro da estimativa vira placa por cima do Desfazer:
// 8px medidos no iPhone deitado e 6px no Android, mesmo já somando o inset.
// ⚠️ REVISADO DE PROPÓSITO (v1.7.72): a caixa deitada perdeu a LARGURA cravada em px.
// O padding do container passou a sair de `env(safe-area-inset-left/right)` — a ilha da
// câmera fica na lateral e cobria o avatar do 2º jogador —, e uma largura fixa ignora
// esse recuo e volta pra baixo da ilha. Quem desenha agora é o flex; `_lBoxW` só serve
// pra dimensionar FONTE. O invariante (a caixa preenche a altura real) continua aqui.
check('deitado: a caixa preenche a altura real e divide a largura por flex',
  /_lBoxStyle\s*=\s*'flex:1 1 0;min-width:0;height:100%;'/.test(SRC));
check('e o recuo lateral da ilha entra no padding do container',
  /padding:0 calc\('\s*\+\s*_lPad\s*\+\s*'px \+ env\(safe-area-inset-right/.test(SRC));
check('deitado: _lBoxH não volta a virar altura de caixa',
  !/height:'\s*\+\s*_lBoxH\s*\+\s*'px/.test(SRC));

// ── 4 · o cabeçalho não reserva inset que não precisa ──────────────────────
check('o desconto mágico de 12px saiu do padding do cabeçalho',
  !/env\(safe-area-inset-top,\s*0px\)\s*-\s*12px/.test(SRC));
// ⚠️ QUATRO ASSERÇÕES REVISADAS DE PROPÓSITO (v1.7.71/72). Elas exigiam a função
// `_spTopInsetNecessario`, que DECIDIA em JS quanto do inset de cima reservar. Ela
// FOI REMOVIDA: medindo no aparelho ficou claro que quem reserva a status bar é o
// CSS do #live-scoring-overlay, e o cabeçalho somava a MESMA reserva de novo — 62px
// mortos em retrato. Decidir isso em DOIS lugares era o defeito; a função era o
// segundo lugar. O invariante que elas defendiam — "a faixa de cima é reservada UMA
// vez só" — é o que fica travado agora, pelos dois lados da conta.
check('o cabeçalho NÃO soma o inset de cima de novo (quem reserva é o overlay)',
  /var headerPadTop = headerPadY;/.test(SRC));
check('e a função que decidia isso em JS não voltou',
  !/window\._spTopInsetNecessario\s*=/.test(SRC));   // a DEFINIÇÃO; o nome ainda é citado nos comentários que explicam a remoção
check('a reserva do topo é do CSS do overlay, com piso por ORIENTAÇÃO',
  /@media \(orientation: portrait\)[\s\S]{0,220}#live-scoring-overlay[\s\S]{0,160}max\(env\(safe-area-inset-top/.test(CSS));
check('deitado NÃO usa o piso de 50px (a barra some, não há o que proteger)',
  /@media \(orientation: landscape\)[\s\S]{0,220}#live-scoring-overlay[\s\S]{0,160}padding-top:\s*env\(safe-area-inset-top/.test(CSS));

// ── 5 · picker do sacador: UMA barra, duas colunas ─────────────────────────
// Antes havia uma segunda barra interna (Fechar · título · Iniciar) embaixo do
// cabeçalho do overlay: dois cabeçalhos e DOIS "Fechar" na mesma tela, 61px de
// altura, e o 4º jogador fora da tela no deitado (46px escondidos, medido).
// ⚠️ DUAS ASSERÇÕES REVISADAS DE PROPÓSITO (v1.7.72). Elas exigiam que o título e o
// "Iniciar" fossem INJETADOS no cabeçalho do overlay. Isso quebrou em produção: o id
// `live-score-header-actions` existe DUAS vezes no app (aqui e no overlay da partida
// casual) e, com os dois montados, `getElementById` entregava o do OUTRO overlay — o
// botão existia no DOM e NÃO aparecia na tela (visto no iPhone). Agora os dois moram
// numa linha PRÓPRIA dentro do container desta tela: sem id compartilhado, sem ordem
// de render pra dar errado. O invariante original — UMA barra só, nunca duas
// empilhadas com dois "Fechar" — continua travado logo abaixo.
check('título e Iniciar moram numa linha própria do picker, não no cabeçalho',
  /var _barraTopo =[\s\S]{0,900}id="live-serve-confirm"/.test(SRC));
check('e nada é mais injetado no grupo de botões compartilhado do cabeçalho',
  !/_hdrActs\.appendChild/.test(SRC));
check('não sobrou o segundo botão Fechar dentro do picker',
  !/_liveSkipServe\(\)"[^>]*>Fechar<\/button>/.test(SRC));
// ⚠️ REVISADA DE PROPÓSITO (v1.7.72): eram 2 colunas SEMPRE. Ordem do dono — "em pé é
// um em cima do outro; 2x2 apenas no deitado". Em pé a tela é estreita e 2 colunas
// espremiam o nome a ponto de cortar ("Nelson Ba…"). O motivo das 2 colunas continua
// valendo DEITADO (uma coluna deixava 484px mortos ao lado), e é isso que fica travado.
check('deitado tem 2 colunas; em pé, uma só',
  /_pkDeitado \? '1fr 1fr' : '1fr'/.test(SRC));
check('o card do picker não tem mais max-width de lista de uma coluna',
  !/width:100%;max-width:360px/.test(SRC));

// ⚠️ ESTE PEGOU UM BUG REAL DURANTE A PRÓPRIA IMPLEMENTAÇÃO: ao trocar a lista
// por colunas, o `.join('')` ficou no fim do map. `cards` virou STRING e `cards[i]`
// passou a devolver UM CARACTERE — a tela montou com markup picotado
// (`<b< div="">`) e ZERO jogadores clicáveis. Só apareceu porque a verificação
// contava os cards renderizados.
check('cards do picker é ARRAY (o .join do map não pode voltar)',
  /\}\);\s*\/\/ ⚠️ ARRAY, não string/.test(SRC));

// ── 6 · o cabeçalho devolve o que emprestou ────────────────────────────────
check('_serveHeaderClear existe',
  /function _serveHeaderClear\(\)/.test(SRC));
check('e é chamado no _render, não nas saídas do picker (são três)',
  /if \(_needsServePick\(\)\) \{[\s\S]{0,120}\}\s*[\s\S]{0,400}?_serveHeaderClear\(\);/.test(SRC));

// ── 7 · tela de configuração: toggles lado a lado, sem subtítulo ───────────
check('os toggles usam grid auto-fit (são 2 ou 3, o de Duplas Mistas é condicional)',
  /grid-template-columns:repeat\(auto-fit,minmax\(160px,1fr\)\)/.test(SRC));
check('há um construtor único de toggle (não três blocos copiados)',
  /function _setupToggle\(emoji, titulo, dica/.test(SRC));
check('o subtítulo sobrevive no title do card',
  /title="'\s*\+\s*window\._safeHtml\(dica\)/.test(SRC));
check('o título do toggle trunca em vez de empurrar o interruptor pra fora',
  /_setupToggle[\s\S]{0,700}text-overflow:ellipsis;">'\s*\+\s*titulo/.test(SRC));
check('modalidade e detalhe na mesma linha (align-items:baseline)',
  /_casualOpenConfig\(\)[\s\S]{0,700}display:flex;align-items:baseline/.test(SRC));

console.log((fail ? '❌' : '✅') + ' safe-area-medida-nao-estimada: ' + (ok + fail) + ' asserções, ' + fail + ' falha(s)');
if (fail) process.exit(1);
