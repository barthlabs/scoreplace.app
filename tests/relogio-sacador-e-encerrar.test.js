// ═══════════════════════════════════════════════════════════════════════════
// v1.7.67 — O RELÓGIO ACOMPANHA O SACADOR, E O ENCERRAR DELE ENCERRA DE VERDADE
//
// Dois relatos do dono, os dois valendo para watchOS E Wear OS (mesmo contrato,
// mesmo snapshot, mesmo botão — ele só consegue testar no iOS):
//
//  (1) "quando selecionamos o 1o sacador no telefone, isso nao propaga para o
//      relogio e isso pode causar problemas (no celular tem 1 escolhido e no
//      relogio escolhe outro)"
//      CAUSA: `_liveServeSelect` só guardava a escolha numa variável local e
//      redesenhava a tela do celular — sem avisar o relógio. E o campo que o
//      relógio lê pra acender o nome (`servePickCurrent`) saía SÓ de
//      `state.serveOrder`, que na tela do 1º sacador ainda está VAZIA: é ela que
//      vai preenchê-la. O relógio recebia string vazia.
//
//  (2) "no relogio, quando clicamos encerrar ao final da partida deveria voltar
//      para a tela de configuração no celular e o relógio voltar para a espera,
//      mas o relogio fica travado na tela de resultado da ultima partida"
//      CAUSA: o botão só setava `replayDismissed` — estado LOCAL — nos dois
//      relógios, e a ponte não tinha intenção de encerrar. A ordem não tinha por
//      onde chegar ao celular.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

const BRACKET = ler('js/views/bracket-ui.js');
const PONTE = ler('js/watch-bridge.js');
const SWIFT_VIEW = ler('ios/WatchApp/Sources/RemoteView.swift');
const SWIFT_SESSION = ler('ios/App/Watch/WatchSession.swift');
const SWIFT_APP = ler('ios/App/Watch/ScoreplaceWatchCompanionApp.swift');
const WEAR = ler('android/wear/src/main/java/app/scoreplace/wear/MainActivity.java');
const DOC = ler('docs/smartwatch-bridge.md');

let ok = 0, fail = 0;
function check(nome, cond) {
  if (cond) { ok++; } else { fail++; console.log('   ❌ ' + nome); }
}

// ── 1 · o sacador escolhido no celular viaja ───────────────────────────────
check('o snapshot lê a seleção VIVA do picker quando ele está aberto',
  /_needsServePick\(\)\s*&&\s*_pickerSel[\s\S]{0,220}_spCurRaw\s*=\s*_pkArr\[_pickerSel\.idx\]/.test(BRACKET));
check('serveOrder continua valendo quando o picker está fechado (fallback)',
  /if \(!_spCurRaw && state\.serveOrder && state\.serveOrder\[state\.totalGamesPlayed\]\)/.test(BRACKET));
check('servePickCurrent segue abreviando pelo mesmo _wn (o "aceso" tem que casar)',
  /servePickCurrent:\s*_wn\(_spCurRaw\)/.test(BRACKET));
check('cada toque no nome avisa o relógio na hora',
  /_liveServeSelect\s*=\s*function[\s\S]{0,400}_watchNotify\(\)/.test(BRACKET));

// ── 2 · encerrar pelo relógio ──────────────────────────────────────────────
check('a ponte aceita a intenção close',
  /case 'close':/.test(PONTE));
check('e ela chama o fechamento do celular',
  /case 'close':[\s\S]{0,900}window\._liveScoreCloseFromWatch\(\)/.test(PONTE));
check('_liveScoreCloseFromWatch existe',
  /window\._liveScoreCloseFromWatch\s*=\s*function/.test(BRACKET));
check('ele fecha SEM diálogo (esperar confirmação no celular é o próprio travamento)',
  /_closeLiveScoring\(\{\s*semDialogo:\s*true\s*\}\)/.test(BRACKET));
check('o fechamento aceita o modo sem diálogo',
  /window\._closeLiveScoring\s*=\s*function\(opts\)/.test(BRACKET) &&
  /if \(opts && opts\.semDialogo\) \{ _confirmarFechamento\(\); return; \}/.test(BRACKET));
check('há UMA rotina de fechamento, usada pelos dois gatilhos',
  /showConfirmDialog\(_title, _msg, _confirmarFechamento\)/.test(BRACKET) &&
  (BRACKET.match(/_confirmarFechamento\s*=\s*function/g) || []).length === 1);

// ⚠️ O consenso do casual multiplayer NÃO pode ser pulado: ali quem decide são os
// outros jogadores, não quem está com o relógio no pulso. Ele roda antes e devolve
// cedo — o modo sem diálogo entra depois dele, nunca antes.
const idxConsenso = BRACKET.indexOf('closePending: {');
const idxSemDialogo = BRACKET.indexOf('if (opts && opts.semDialogo)');
check('o consenso multiplayer continua na frente do fechamento direto',
  idxConsenso > 0 && idxSemDialogo > idxConsenso);

// ── 3 · os DOIS relógios mandam a ordem ────────────────────────────────────
check('watchOS: existe sendClose',
  /func sendClose\(\)[\s\S]{0,200}"type": "close"/.test(SWIFT_SESSION));
check('watchOS: a view expõe onClose',
  /var onClose: \(\) -> Void/.test(SWIFT_VIEW));
check('watchOS: o botão Fechar dispara onClose (não só replayDismissed)',
  /Button\(action: \{ replayDismissed = true; onClose\(\) \}\)/.test(SWIFT_VIEW));
check('watchOS: o app liga onClose no sendClose',
  /onClose:\s*\{ session\.sendClose\(\) \}/.test(SWIFT_APP));
check('Wear: o Fechar manda a intenção close',
  /btnReplayCancel\.setOnClickListener[\s\S]{0,400}sendIntent\("close", 0\)/.test(WEAR));
check('Wear: e continua escondendo o painel na hora (senão pisca de volta)',
  /btnReplayCancel\.setOnClickListener[\s\S]{0,400}replayControls\.setVisibility\(View\.GONE\)/.test(WEAR));

// ── 4 · o contrato está escrito ────────────────────────────────────────────
check('o doc da ponte descreve a intenção close',
  /"type": "close"/.test(DOC));
check('e diz que ela não pula o consenso do multiplayer',
  /consenso de encerramento do casual multiplayer/.test(DOC));

console.log((fail ? '❌' : '✅') + ' relogio-sacador-e-encerrar: ' + (ok + fail) + ' asserções, ' + fail + ' falha(s)');
if (fail) process.exit(1);
