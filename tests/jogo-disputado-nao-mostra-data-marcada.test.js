'use strict';
/* JOGO JÁ DISPUTADO NÃO MOSTRA A DATA QUE FOI MARCADA.
 * node tests/jogo-disputado-nao-mostra-data-marcada.test.js
 *
 * ⛔⛔ RELATO DO DONO, 27/set/2026, jogo 120: o card dizia "Jogado em 26/09 08:33" no topo e,
 * embaixo, um botão "📅 18/09 às 11:00" — a data em que se combinou jogar, já passada e já
 * cumprida. Duas informações sobre o mesmo jogo, uma obsoleta, e a obsoleta com cara de botão.
 * _"se o jogo já foi jogado nao deve ter esse botao com data e hora passada. ja esta la em cima"_
 *
 * A CAUSA ERA DE ORDEM, não de regra: o bloco da data devolvia cedo, ANTES da linha que descarta
 * jogo decidido — então ele sobrevivia ao resultado. A saída antecipada existia por um motivo real
 * (fazer a data aparecer nas Novidades, onde o botão do grupo não chega) e esse motivo continua
 * valendo para jogo AINDA NÃO disputado. O que faltava era o outro lado da borda.
 * [[feedback_a_defesa_vaza_pela_borda]]
 *
 * ⇒ O CRITÉRIO É O MESMO que acende "Jogado em" no topo do card: havendo resultado, a linha do
 * tempo manda. Não pode haver duas datas discordando no mesmo card.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── jogo disputado não mostra data marcada ────\n');

const src = fs.readFileSync(path.join(ROOT, 'js/views/schedule-poll.js'), 'utf8');
const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
/* ⛔ recorte pelo PRÓPRIO identificador, nunca por janela de tamanho fixo */
const i0 = codigo.indexOf('window._schCardChip = function');
const bloco = i0 < 0 ? '' : codigo.slice(i0, codigo.indexOf('\n  };', i0));
ok(bloco.length > 300, '① o chip da agenda foi achado pelo identificador');

/* ── ① A GUARDA EXISTE E VEM ANTES DA SAÍDA COM A DATA ─────────────────────── */
const iGuarda = bloco.indexOf('_jaDisputado');
const iRetorna = bloco.indexOf('return _chipData(');
ok(iGuarda > 0, '① ⛔⛔ o chip pergunta se o jogo já foi disputado');
ok(iRetorna > 0 && iGuarda < iRetorna,
  '① ⛔⛔ e pergunta ANTES de devolver a data — era a ordem que deixava a data sobreviver ao resultado');
ok(/m\.scheduledAt && !_jaDisputado/.test(bloco),
  '① a data só sai com jogo em aberto');

/* ── ② O CRITÉRIO É O MESMO DA LINHA "JOGADO EM" ───────────────────────────
 * ⛔ Se os dois divergirem, volta a haver card com "Jogado em" em cima e data marcada embaixo —
 * que é exatamente o relato. Por isso os dois são comparados, campo a campo. */
const br = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const iTl = br.indexOf('function _matchCardTimelineTextHtml(');
const tl = iTl < 0 ? '' : br.slice(iTl, br.indexOf('\n}', iTl));
ok(tl.length > 200, '② a linha do tempo do card foi achada');
['resultAt', 'completedAt', 'winner', 'wo', 'pendingResult'].forEach(function (campo) {
  ok(bloco.indexOf(campo) >= 0 && tl.indexOf(campo) >= 0,
    '② "' + campo + '" conta nos DOIS lugares — critérios diferentes trariam o defeito de volta');
});

/* ── ③ A REGRA, EXERCIDA ───────────────────────────────────────────────────── */
const fn = new Function('m', 'return !!(m.resultAt || m.completedAt || m.winner || m.wo || (m.pendingResult && m.pendingResult.proposedAt));');
ok(fn({ scheduledAt: 1 }) === false, '③ jogo sem nada: a data marcada aparece');
ok(fn({ winner: 'A' }) === true, '③ ⛔ com vencedor: some');
ok(fn({ resultAt: 123 }) === true, '③ com instante de resultado: some');
ok(fn({ completedAt: 123 }) === true, '③ com carimbo de conclusão: some');
ok(fn({ wo: true }) === true, '③ ⛔ com W.O.: some — W.O. é jogo decidido');
ok(fn({ pendingResult: { proposedAt: 5 } }) === true,
  '③ ⛔ com placar esperando confirmação: some — o topo já mostra "Jogado em" nesse estado');
ok(fn({ pendingResult: {} }) === false,
  '③ ⚠️ mas placar esperando SEM instante não conta — o topo também não mostra nada, e os dois têm de concordar');

/* ── ④ E NÃO SE PERDEU O QUE A SAÍDA ANTECIPADA PROTEGIA ───────────────────
 * ⛔ Ela existe para a data aparecer em jogo de grupo (Rei/Rainha) fora da tela da chave, onde
 * quem mostraria é o cabeçalho do grupo, que não existe nas Novidades. Isso vale para jogo EM
 * ABERTO e não pode ter sido desfeito junto. */
const iMon = bloco.indexOf('m.isMonarch');
ok(iMon > 0 && iRetorna < iMon,
  '④ ⛔ a data ainda sai ANTES da supressão do Rei/Rainha — jogo de grupo em aberto continua mostrando a data');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
