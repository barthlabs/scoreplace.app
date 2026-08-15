/* AS TRÊS CHAVES DO RELÓGIO — 🎲 re-sortear · 👑 Rei/Rainha · ⚥ mistas.
 *
 * Ordem do dono (15/ago/2026): "no relógio o re-sorteio pode ser um dado com um
 * toggle, o rei/rainha pode ser a coroa com um toggle, e o mista pode ser o
 * símbolo masc e fem misturados com o toggle" · "esses toggles devem aparecer
 * apenas entre as partidas na tela de encerrar/continuar".
 *
 * O que esta suíte trava — e por quê:
 *   (1) O ESTADO vai no snapshot (shuffleOn/mixedOn/canMix). Sem isso o relógio
 *       teria de adivinhar, e adivinhar significa divergir do celular na mesma
 *       sessão.
 *   (2) As INTENÇÕES chegam na ponte REAL e dirigem as MESMAS funções dos
 *       checkboxes do celular — nunca uma regra paralela.
 *   (3) Só o 🎲 é local; 👑 e ⚥ são configuração da sessão e voltam do celular.
 *   (4) As chaves vivem SÓ na tela entre partidas, nos dois sistemas.
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── relogio-tres-chaves ────');

const ROOT = path.join(__dirname, '..');
const BRIDGE = fs.readFileSync(path.join(ROOT, 'js', 'watch-bridge.js'), 'utf8');
const BUI = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
const SWIFT = fs.readFileSync(path.join(ROOT, 'ios', 'WatchApp', 'Sources', 'RemoteView.swift'), 'utf8');
const SWSTATE = fs.readFileSync(path.join(ROOT, 'ios', 'WatchApp', 'Sources', 'ScoreState.swift'), 'utf8');
const SWSESS = fs.readFileSync(path.join(ROOT, 'ios', 'App', 'Watch', 'WatchSession.swift'), 'utf8');
const JAVA = fs.readFileSync(path.join(ROOT, 'android', 'wear', 'src', 'main', 'java', 'app', 'scoreplace', 'wear', 'MainActivity.java'), 'utf8');
const XML = fs.readFileSync(path.join(ROOT, 'android', 'wear', 'src', 'main', 'res', 'layout', 'activity_main.xml'), 'utf8');

// ── (1) o ESTADO viaja no snapshot ───────────────────────────────────────
ok(/shuffleOn:\s*!!autoShuffle/.test(BUI), 'snapshot leva shuffleOn (estado do 🎲)');
ok(/mixedOn:\s*!!_mixedDoublesEnabled/.test(BUI), 'snapshot leva mixedOn (estado do ⚥)');
ok(/canMix:/.test(BUI), 'snapshot diz se ⚥ sequer se aplica (canMix)');
ok(/reiRainha:\s*!!_reiRainhaMode/.test(BUI), 'e reiRainha já ia (estado do 👑)');

// ── (2) as INTENÇÕES chegam na ponte REAL ────────────────────────────────
global.window = global.window || {};
const chamadas = [];
window._statsToggleShuffle = (c) => chamadas.push(['shuffle', !!c.checked]);
window._statsToggleMixed = (c) => chamadas.push(['mixed', !!c.checked]);
window._statsToggleReiRainha = (c) => chamadas.push(['rr', !!c.checked]);
window._reiRainhaNextRound = () => chamadas.push(['rrNext', true]);

// extrai o corpo do switch de intenções da ponte e roda de verdade
const iSw = BRIDGE.indexOf("case 'setShuffle':");
ok(iSw > 0, "a ponte conhece 'setShuffle'");
ok(BRIDGE.indexOf("case 'setMixed':") > 0, "a ponte conhece 'setMixed'");
ok(BRIDGE.indexOf("case 'setRR':") > 0, "a ponte conhece 'setRR'");

function aplica(intent) {
  // reexecuta os ramos reais copiados do arquivo, um por tipo
  const bloco = (tipo) => {
    const ini = BRIDGE.indexOf("case '" + tipo + "':");
    const fim = BRIDGE.indexOf('break;', ini);
    return BRIDGE.slice(BRIDGE.indexOf('\n', ini), fim);
  };
  eval('(function(intent){' + bloco(intent.type) + '})')(intent);
}
aplica({ type: 'setShuffle', on: true });
aplica({ type: 'setShuffle', on: false });
aplica({ type: 'setMixed', on: true });
aplica({ type: 'setRR', on: true });
ok(JSON.stringify(chamadas) === JSON.stringify([['shuffle', true], ['shuffle', false], ['mixed', true], ['rr', true]]),
   '🔒 as 3 intenções dirigem as MESMAS funções do celular, com o valor certo · ' + JSON.stringify(chamadas));

// o rrActivate continua sendo OUTRA coisa (aceita a sugestão E avança o jogo)
chamadas.length = 0;
aplica({ type: 'rrActivate' });
ok(JSON.stringify(chamadas) === JSON.stringify([['rr', true], ['rrNext', true]]),
   'rrActivate segue distinto de setRR: ativa E avança pro 3º jogo');

// ── (3) nenhuma regra de placar/sorteio migrou pro relógio ───────────────
['setShuffle', 'setMixed', 'setRR'].forEach(function (t) {
  const ini = BRIDGE.indexOf("case '" + t + "':");
  const corpo = BRIDGE.slice(ini, BRIDGE.indexOf('break;', ini));
  ok(!/_shuffleArrLS|_reiRainhaWins|_computeRestartTeams|Math\.random/.test(corpo),
     'a ponte não decide nada em ' + t + ' — só repassa');
});

// ── (4) Apple: símbolos, e SÓ entre partidas ─────────────────────────────
ok(/chaveDeSimbolo\("🎲"/.test(SWIFT), 'Apple desenha o 🎲');
ok(/chaveDeSimbolo\("👑"/.test(SWIFT), 'Apple desenha o 👑');
ok(/chaveDeSimbolo\("⚥"/.test(SWIFT), 'Apple desenha o ⚥');
// ⚠️ Só o texto que a TELA desenha — os comentários ainda citam "Re-sortear"
// de propósito (é o que explica por que o rótulo virou símbolo). Uma varredura
// crua casaria com eles e ficaria vermelha sem defeito nenhum.
const swiftSemComentario = SWIFT.replace(/\/\/[^\n]*/g, '');
ok(!/Text\("Re-sortear/.test(swiftSemComentario),
   'o rótulo "Re-sortear duplas" saiu da TELA do relógio (comentários podem citá-lo)');
const iRamo = SWIFT.indexOf('state.canReplay && !replayDismissed');
const iElse = SWIFT.indexOf('Aguardando o celular', iRamo);
const ramoFim = SWIFT.slice(iRamo, iElse);
ok(iRamo > 0 && ramoFim.indexOf('chaveDeSimbolo("🎲"') > 0,
   '🔒 as chaves ficam DENTRO da tela entre partidas (Fechar/Iniciar)');
const antesDoRamo = SWIFT.slice(0, iRamo);
ok(antesDoRamo.indexOf('chaveDeSimbolo("🎲"') === -1,
   '🔒 e não aparecem antes dela (durante o jogo / no meio da série)');
ok(/opacity\(ligado \? 1\.0 : 0\.38\)/.test(SWIFT),
   'símbolo desligado fica apagado — a cor sozinha não comunica estado');
ok(/var shuffleOn: Bool|var mixedOn: Bool|var canMix: Bool/.test(SWSTATE), 'ScoreState leu os campos novos');
ok(/case shuffleOn, mixedOn, canMix/.test(SWSTATE), 'e eles estão nas CodingKeys (senão chegam sempre false)');
ok(/"type": "setRR"/.test(SWSESS) && /"type": "setMixed"/.test(SWSESS), 'Apple envia setRR e setMixed');

// ── (5) Wear: espelho 1:1 ────────────────────────────────────────────────
ok(/android:text="🎲"/.test(XML) && /android:text="👑"/.test(XML) && /android:text="⚥"/.test(XML),
   'Wear tem os 3 símbolos no layout');
ok(/@\+id\/rr_switch/.test(XML) && /@\+id\/mixed_switch/.test(XML) && /@\+id\/reshuffle_switch/.test(XML),
   'e as 3 chaves');
ok(/sendToggle\("setRR"/.test(JAVA) && /sendToggle\("setMixed"/.test(JAVA), 'Wear envia setRR e setMixed');
ok(/aplicandoDoCelular/.test(JAVA),
   '🔒 guarda contra reentrância: setChecked dispara o listener e reenviaria a intenção que acabou de chegar');
ok(/mixedCol\.setVisibility\(podeMix/.test(JAVA), 'Wear esconde o ⚥ quando ele não se aplica');
ok(JAVA.indexOf('reshuffleLabel.setText("Re-sortear') === -1, 'o texto antigo saiu do Wear');

// o bloco das chaves no Wear está no ramo do canReplay
const iJ = JAVA.indexOf('if (canReplay && !replayDismissed)');
const iJEnd = JAVA.indexOf('winnerWaiting.setVisibility(View.VISIBLE)', iJ);
ok(iJ > 0 && JAVA.slice(iJ, iJEnd).indexOf('mixedCol.setVisibility') > 0,
   '🔒 no Wear as chaves também só existem na tela entre partidas');

console.log('relogio-tres-chaves:', pass, 'ok,', fail, 'falhas');
if (fail > 0) process.exit(1);
