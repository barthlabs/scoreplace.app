/* "AO VIVO" × "CONFIRMAR": UM PAR EXCLUDENTE, IGUAL NAS DUAS TELAS (leva 2.1.98)
 *
 * Relato do dono (02/set/2026): _"esse botão confirmar só deve aparecer no lugar do ao vivo
 * ao digitar um placar aí. exatamente como aparece na chave do torneio no detalhe."_
 *
 * ⛔ A FALHA: no card "⚔️ Seu próximo jogo" da dashboard (`_miniBracketCard`), o "✓ Confirmar"
 * aparecia SEMPRE, ao lado do "📡 Ao Vivo", com o placar ainda em 0-0. Na chave, não: lá o
 * botão nasce escondido e só aparece quando os DOIS campos têm placar escrito — e o "Ao Vivo"
 * some no mesmo instante (digitar à mão É a declaração de que ninguém acompanhou ao vivo).
 *
 * ⚠️ A REGRA NUNCA FOI O PROBLEMA. `window._syncConfirmBtn` já era canônica e já rodava neste
 * card — os campos de placar dele já chamavam `_highlightWinner` no `oninput`. O que faltava
 * eram as duas AMARRAS que ela procura no DOM:
 *   · o "Confirmar" nascer com `display:none`;
 *   · o "Ao Vivo" ter `id="live-<matchId>"`.
 * Sem elas a função rodava e não achava o que esconder — falhando em silêncio, que é o modo
 * de falha mais caro deste código.
 *
 * Por isso o teste tem DUAS metades: o COMPORTAMENTO da regra (com DOM de mentira) e a
 * FIAÇÃO do card (as duas amarras). Só a primeira passaria com o bug de pé; só a segunda
 * seria teste de texto.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── "Ao Vivo" × "Confirmar": par excludente nas duas telas ────');

// ── ① COMPORTAMENTO: a regra canônica, com DOM de mentira ─────────────────────
const els = {
  'confirm-M1': { style: { display: 'none' } },
  'live-M1':    { style: { display: '' } },
  's1-M1':      { value: '' },
  's2-M1':      { value: '' }
};
const docReal = W.document;
W.document = { getElementById: (id) => els[id] || null };

const visivel = (e) => e.style.display !== 'none';

W._syncConfirmBtn('M1');
ok(!visivel(els['confirm-M1']), '① 0-0: sem "Confirmar"');
ok(visivel(els['live-M1']), '① 0-0: com "Ao Vivo"');

els['s1-M1'].value = '6';
W._syncConfirmBtn('M1');
ok(!visivel(els['confirm-M1']), '① um lado só ainda NÃO confirma (gravaria placar pela metade)');
ok(visivel(els['live-M1']), '① e o "Ao Vivo" continua');

els['s2-M1'].value = '0';
W._syncConfirmBtn('M1');
ok(visivel(els['confirm-M1']), '① ⭐ 6-0 escrito: aparece o "Confirmar"');
ok(!visivel(els['live-M1']), '① ⭐ e o "Ao Vivo" some — são excludentes');
ok(els['s2-M1'].value === '0', '① zero é placar VÁLIDO, não vazio (6-0 existe)');

els['s1-M1'].value = '';
W._syncConfirmBtn('M1');
ok(!visivel(els['confirm-M1']) && visivel(els['live-M1']),
   '① apagar o que foi digitado devolve o "Ao Vivo" — nada é irreversível');

W.document = docReal;

// ── ② FIAÇÃO: o card da dashboard entrega as duas amarras ────────────────────
const dash = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
const trecho = dash.slice(dash.indexOf('var liveBtnHtml'), dash.indexOf('var finalHeaderBtns'));
ok(/id="live-' \+ mId \+ '"/.test(trecho),
   '② ⭐ o "Ao Vivo" do card tem id="live-<mId>" — sem isso não há o que esconder');
ok(/id="confirm-' \+ mId \+ '"/.test(trecho) && /display:none;">✓ Confirmar/.test(trecho),
   '② ⭐ o "Confirmar" do card NASCE escondido, como na chave');
ok(/_highlightWinner/.test(dash),
   '② os campos de placar continuam chamando _highlightWinner (é quem dispara a regra)');
ok(!/style\.display\s*=\s*.*Confirmar/.test(dash) && dash.indexOf('_syncConfirmBtn = function') === -1,
   '② a dashboard NÃO reimplementa a regra — fonte única em bracket-ui.js');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
