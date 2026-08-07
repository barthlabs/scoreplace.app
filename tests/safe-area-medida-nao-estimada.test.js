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

// ── 2 · a reserva do Desfazer soma o inset MEDIDO, nas duas orientações ────
const undoRetrato = /_pUndo\s*=\s*Math\.round\(56 \* _lsK\)\s*\+\s*_spInsetPx\('bottom'\)/.test(SRC);
const undoDeitado = /_lUndo\s*=\s*Math\.round\(56 \* _lsK\)\s*\+\s*_spInsetPx\('bottom'\)/.test(SRC);
check('retrato: a reserva do Desfazer soma o inset de baixo', undoRetrato);
check('deitado: a reserva do Desfazer soma o inset de baixo', undoDeitado);
check('nenhuma reserva de Desfazer ficou só com o número fixo',
  !/_[pl]Undo\s*=\s*Math\.round\(56 \* _lsK\)\s*;/.test(SRC));

// ── 3 · a caixa do deitado NÃO tem altura fixa ─────────────────────────────
// Com altura fixa, todo erro da estimativa vira placa por cima do Desfazer:
// 8px medidos no iPhone deitado e 6px no Android, mesmo já somando o inset.
check('deitado: a caixa preenche o espaço real (height:100%), não _lBoxH fixo',
  /_lBoxStyle\s*=\s*'width:'\s*\+\s*_lBoxW\s*\+\s*'px;height:100%/.test(SRC));
check('deitado: _lBoxH não volta a virar altura de caixa',
  !/height:'\s*\+\s*_lBoxH\s*\+\s*'px/.test(SRC));

// ── 4 · o cabeçalho não reserva inset que não precisa ──────────────────────
check('o desconto mágico de 12px saiu do padding do cabeçalho',
  !/env\(safe-area-inset-top,\s*0px\)\s*-\s*12px/.test(SRC));
check('existe a decisão medida _spTopInsetNecessario',
  /window\._spTopInsetNecessario\s*=\s*function/.test(SRC));
check('ela devolve 0 quando o sistema já recuou a webview',
  /fora\s*>=\s*inset\s*-\s*4/.test(SRC));
check('fallback conservador: sem como medir a tela, mantém o inset',
  /if\s*\(!tela\)\s*return inset/.test(SRC));
check('o cabeçalho consome a decisão em vez do env() cru',
  /_topInset\s*=\s*\(typeof window\._spTopInsetNecessario/.test(SRC));

// ── 5 · picker do sacador: UMA barra, duas colunas ─────────────────────────
// Antes havia uma segunda barra interna (Fechar · título · Iniciar) embaixo do
// cabeçalho do overlay: dois cabeçalhos e DOIS "Fechar" na mesma tela, 61px de
// altura, e o 4º jogador fora da tela no deitado (46px escondidos, medido).
check('o título do picker vai pro slot central do cabeçalho (#live-hdr-sets)',
  /_hdrMid\.innerHTML\s*=\s*'<div style="min-width:0;text-align:center/.test(SRC));
check('o Iniciar/Confirmar entra no grupo de botões do cabeçalho',
  /_btn\.id\s*=\s*'live-serve-confirm'[\s\S]{0,600}_hdrActs\.appendChild\(_btn\)/.test(SRC));
check('não sobrou o segundo botão Fechar dentro do picker',
  !/_liveSkipServe\(\)"[^>]*>Fechar<\/button>/.test(SRC));
check('a lista do picker é grid de 2 colunas, não coluna única',
  /id="serve-order-list"[\s\S]{0,260}grid-template-columns:1fr 1fr/.test(SRC));
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
