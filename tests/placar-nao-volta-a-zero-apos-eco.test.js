'use strict';
/* O PLACAR NÃO VOLTA A 0-0 QUANDO O ECO DOS JOGOS CHEGA.
 * node tests/placar-nao-volta-a-zero-apos-eco.test.js
 *
 * ⛔⛔ RELATO DO DONO, repetido por semanas e ainda vivo depois de eu ter "consertado" uma vez:
 * _"lanço o resultado, confirmo, volta 0-0; só dando refresh aparece o placar"_.
 *
 * ⛔ EU PROCUREI NO LUGAR ERRADO DA PRIMEIRA VEZ. Em 2.3.110 tratei isto como problema de
 * REPINTURA (a tela não repintava na segunda rota) — e aquilo era um defeito de verdade, mas não
 * este. A causa real está no ouvinte das partes.
 *
 * O JOGO TEM DUAS CÓPIAS: o placar é gravado primeiro na coleção de RESULTADOS, e o documento do
 * JOGO recebe a atualização depois. O ouvinte remonta os jogos a partir da coleção de jogos e
 * escreve por cima do objeto vivo — jogando fora a camada de resultado que a tela acabou de
 * aplicar. Sobra o jogo sem placar: 0-0. O refresh curava porque a carga completa reaplica os
 * resultados no fim, e foi isso que me fez procurar na repintura.
 * [[project_jogo_vive_em_matches_e_results]]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── o placar não volta a zero após o eco ────\n');

const st = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const i0 = st.indexOf('ouvirPartesDoTorneio(tournamentId) {');
const bloco = i0 < 0 ? '' : st.slice(i0, st.indexOf('\n  pararDeOuvirJogos()', i0));
ok(bloco.length > 500, '① o ouvinte das partes foi achado pelo identificador');

/* ── ① REAPLICA, E DEPOIS DE REPOR ─────────────────────────────────────────── */
const iRepoe = bloco.indexOf('Object.keys(montado).forEach');
const iReaplica = bloco.indexOf('_overlayResultOnMatch');
ok(iReaplica > 0, '① ⛔⛔ o ouvinte REAPLICA os resultados depois de repor os jogos');
ok(iRepoe > 0 && iReaplica > iRepoe,
  '① ⛔⛔ e reaplica DEPOIS de escrever por cima — antes seria apagado no mesmo gesto');
/* ⚠️ a condição foi hasteada para uma variável em 27/set/2026 — a trava da anotação exige que a
 * linha ÂNCORA não tenha texto entre aspas, e a explicação fique COLADA nela. A regra conferida é
 * a mesma; mudou onde ela está escrita. */
ok(/\(nome === 'matches'\) && !!vivo\._results/.test(bloco),
  '① só quando foram os JOGOS que chegaram, e só havendo resultado guardado');
ok(/if \(_podeReaplicarPlacar\) \{/.test(bloco),
  '① e a decisão passa por uma condição nomeada, que é onde a anotação fica travada');

/* ── ② PELA MESMA FUNÇÃO DO OUTRO OUVINTE ──────────────────────────────────
 * ⛔ Duas implementações de "aplicar resultado no jogo" divergiriam, e o defeito voltaria pela
 * metade — que é como ele voltou desta vez. */
const iDash = st.indexOf('_dashboardResultsSub');
ok(iDash > 0 && /self\._overlayResultOnMatch\(m, result, lote\)/.test(st),
  '② o ouvinte de resultados usa a mesma função');
ok(/self\._overlayResultOnMatch\(mm, res, _lote\)/.test(bloco),
  '② ⛔ e o das partes também — não há segunda implementação');
ok(/_carimboDeLote/.test(bloco),
  '② inclusive o carimbo de lote, que é o que decide qual resultado é o mais novo');

/* ── ③ FALHA NÃO DERRUBA O ECO ─────────────────────────────────────────────
 * ⛔ Este trecho roda dentro do ouvinte: estourar aqui mataria a assinatura e a tela pararia de
 * receber qualquer atualização — troca um defeito visível por um mudo, que é pior. */
ok(/catch \(_eOv\)/.test(bloco), '③ ⛔ a reaplicação é protegida');
ok(/window\._error\('\[fase2\] não consegui reaplicar/.test(bloco),
  '③ ⛔⛔ e a falha FALA — engolir aqui devolveria o 0-0 sem ninguém saber por quê');

/* ── ④ A REPINTURA DA PRIMEIRA TENTATIVA CONTINUA LÁ ──────────────────────
 * ⚠️ O conserto de 2.3.110 era real e não pode ser desfeito junto: a chave é desenhada em DUAS
 * rotas e a repintura precisa valer nas duas. */
const br = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
ok(/_rotaMostraAChaveDeste\(window\.location\.hash, t\.id\)/.test(br),
  '④ a repintura pela porta única das duas rotas segue de pé');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
